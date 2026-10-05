/**
 * src/api/services/bpePublicationService.js
 * 
 * Phase 195G — Governed Pricing Rate Publication Control Plane -> BPE Engine.
 */
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('bpe-publication');

/**
 * Recursive sorted-key JSON serialization for deterministic checksums.
 */
function canonicalStringify(obj) {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
        return '[' + obj.map(v => canonicalStringify(v)).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
    return '{' + pairs.join(',') + '}';
}

/**
 * Computes deterministic SHA-256 checksum of rates JSON.
 */
function computeRatesChecksum(ratesJson) {
    if (!ratesJson) return null;
    const parsed = typeof ratesJson === 'string' ? JSON.parse(ratesJson) : ratesJson;
    const canonical = canonicalStringify(parsed);
    return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

class BpePublicationService {

    /**
     * Strictly validates the BPE publication response contract.
     * Rejects missing checksums, missing readback, mismatched identities, or discrepancy.
     */
    validateBpeResponse(bpeData, { checksumToPublish, sentRatesChecksum, bpePrinthouseId, revisionId }) {
        if (!bpeData || typeof bpeData !== 'object') {
            throw new Error('BPE returned empty or invalid response');
        }

        if (bpeData.ok !== true) {
            throw new Error(`BPE rejected publication: ${bpeData.error || 'Unknown error'}`);
        }

        if (bpeData.status !== 'PUBLISHED') {
            throw new Error(`BPE response status is not PUBLISHED (got: "${bpeData.status}")`);
        }

        if (!bpeData.readback || bpeData.readback.verified !== true) {
            throw new Error('BPE readback verification missing or unverified (readback.verified must be true)');
        }

        if (String(bpeData.bpe_printhouse_id) !== String(bpePrinthouseId)) {
            throw new Error(`BPE printhouse identity mismatch. Expected: ${bpePrinthouseId}, Got: ${bpeData.bpe_printhouse_id}`);
        }

        if (String(bpeData.revision_id) !== String(revisionId)) {
            throw new Error(`BPE revision identity mismatch. Expected: ${revisionId}, Got: ${bpeData.revision_id}`);
        }

        const returnedPatchChecksum = bpeData.accepted_patch_checksum || bpeData.checksum;
        if (!returnedPatchChecksum || typeof returnedPatchChecksum !== 'string') {
            throw new Error('BPE response missing explicit patch checksum');
        }

        if (returnedPatchChecksum !== checksumToPublish) {
            throw new Error(`BPE returned mismatched patch checksum. Expected: ${checksumToPublish}, Got: ${returnedPatchChecksum}`);
        }

        if (bpeData.readback.accepted_patch_checksum !== checksumToPublish) {
            throw new Error(`BPE readback patch checksum mismatch. Expected: ${checksumToPublish}, Got: ${bpeData.readback.accepted_patch_checksum}`);
        }

        const returnedRatesChecksum = bpeData.rates_checksum;
        const readbackRatesChecksum = bpeData.readback.rates_checksum;

        if (!returnedRatesChecksum || !readbackRatesChecksum) {
            throw new Error('BPE response missing explicit rates checksum in response or readback');
        }

        if (returnedRatesChecksum !== sentRatesChecksum) {
            throw new Error(`BPE response rates checksum mismatch. Expected: ${sentRatesChecksum}, Got: ${returnedRatesChecksum}`);
        }

        if (readbackRatesChecksum !== sentRatesChecksum) {
            throw new Error(`BPE readback rates checksum mismatch. Expected: ${sentRatesChecksum}, Got: ${readbackRatesChecksum}`);
        }

        return returnedPatchChecksum;
    }

    /**
     * Resolves the real mapping between a Control Plane printer_node and BPE printhouse ID.
     */
    async resolveBpePrinthouseId(printerNodeId) {
        const [node] = await db.query(
            `SELECT id, name, metadata_json FROM printer_nodes WHERE id = ?`,
            [printerNodeId]
        ).catch(() => []);

        if (!node) {
            return `bpe_${printerNodeId}`;
        }

        let meta = {};
        if (node.metadata_json) {
            try {
                meta = typeof node.metadata_json === 'string' ? JSON.parse(node.metadata_json) : node.metadata_json;
            } catch (e) {}
        }

        return meta.bpe_printhouse_id || meta.bpe_house_id || node.id;
    }

    /**
     * Publishes a governed accepted pricing revision from Control Plane to BPE.
     *
     * @param {string} tenantId - From JWT
     * @param {string} printerNodeId - Control Plane printer node ID
     * @param {string} revisionId - Revision ID in printhouse_pricing_revisions
     * @param {Object} [options] - Mock/test injection options
     */
    async publishAcceptedRevision(tenantId, printerNodeId, revisionId, options = {}) {

        // 1. Fetch Revision & Node rates (SELECT ... FOR UPDATE / Read)
        const [revision] = await db.query(
            `SELECT id, tenant_id, printer_node_id, accepted_patch_checksum, proposed_patch_checksum, rates_json, version, created_at
             FROM printhouse_pricing_revisions
             WHERE id = ? AND tenant_id = ? AND printer_node_id = ?`,
            [revisionId, tenantId, printerNodeId]
        );

        if (!revision) {
            throw new Error(`Revision ${revisionId} not found for printer node ${printerNodeId}`);
        }

        const bpePrinthouseId = await this.resolveBpePrinthouseId(printerNodeId);
        const checksumToPublish = revision.accepted_patch_checksum || revision.proposed_patch_checksum;
        const ratesPayload = typeof revision.rates_json === 'string' ? JSON.parse(revision.rates_json) : revision.rates_json;
        const sentRatesChecksum = computeRatesChecksum(ratesPayload);

        // 2. Check Idempotency / Superseded Status with comprehensive identity & checksum checks
        const [existingPublished] = await db.query(
            `SELECT id, tenant_id, printer_node_id, bpe_printhouse_id, revision_id, accepted_patch_checksum, bpe_response_checksum, version, status
             FROM bpe_pricing_publications
             WHERE printer_node_id = ? AND revision_id = ? AND tenant_id = ? AND bpe_printhouse_id = ? AND status = 'PUBLISHED'
             ORDER BY version DESC, created_at DESC LIMIT 1`,
            [printerNodeId, revisionId, tenantId, bpePrinthouseId]
        );

        if (existingPublished) {
            const isPatchChecksumMatch = existingPublished.accepted_patch_checksum === checksumToPublish &&
                                         existingPublished.bpe_response_checksum === checksumToPublish;
            const ratesMatch = computeRatesChecksum(revision.rates_json) === sentRatesChecksum;

            if (isPatchChecksumMatch && ratesMatch &&
                String(existingPublished.revision_id) === String(revisionId) &&
                String(existingPublished.tenant_id) === String(tenantId) &&
                String(existingPublished.printer_node_id) === String(printerNodeId) &&
                String(existingPublished.bpe_printhouse_id) === String(bpePrinthouseId)) {

                logger.info(`Revision ${revisionId} (patch: ${checksumToPublish}, rates: ${sentRatesChecksum}) is already published and verified to BPE`, { printerNodeId, tenantId, bpePrinthouseId });
                return {
                    ok: true,
                    alreadyPublished: true,
                    status: 'PUBLISHED',
                    publicationId: existingPublished.id,
                    checksum: checksumToPublish,
                    ratesChecksum: sentRatesChecksum
                };
            }
        }

        const publicationId = uuidv4();
        const currentVersion = Number(revision.version) || 1;

        await db.query(
            `INSERT INTO bpe_pricing_publications (id, tenant_id, printer_node_id, bpe_printhouse_id, revision_id, accepted_patch_checksum, version, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
            [publicationId, tenantId, printerNodeId, bpePrinthouseId, revisionId, checksumToPublish, currentVersion]
        );

        // 3. Prepare payload for BPE publication contract
        const bpeUrl = process.env.PPOS_PRICING_ENGINE_URL || 'http://127.0.0.1:8004';
        const publishPath = process.env.PPOS_BPE_PUBLISH_PATH || '/api/marketplace/revisions/publish';

        const publicationPayload = {
            origin: 'PPOS_CONTROL_PLANE',
            tenant_id: tenantId,
            printer_node_id: printerNodeId,
            bpe_printhouse_id: bpePrinthouseId,
            revision_id: revisionId,
            accepted_patch_checksum: checksumToPublish,
            version: currentVersion,
            rates: ratesPayload,
            published_at: new Date().toISOString()
        };

        // 4. Dispatch to Mock Handler or BPE Endpoint
        if (options.mockHandler) {
            try {
                const res = await options.mockHandler(publicationPayload);
                const validatedChecksum = this.validateBpeResponse(res, {
                    checksumToPublish,
                    sentRatesChecksum,
                    bpePrinthouseId,
                    revisionId
                });

                await db.query(
                    `UPDATE bpe_pricing_publications SET status = 'PUBLISHED', bpe_response_checksum = ?, bpe_published_at = NOW() WHERE id = ?`,
                    [validatedChecksum, publicationId]
                );

                return {
                    ok: true,
                    status: 'PUBLISHED',
                    publicationId,
                    printerNodeId,
                    bpePrinthouseId,
                    checksumReadback: validatedChecksum,
                    checksumMatched: true,
                    ratesChecksum: sentRatesChecksum
                };
            } catch (err) {
                await db.query(`UPDATE bpe_pricing_publications SET status = 'FAILED', error_message = ? WHERE id = ?`, [err.message, publicationId]);
                throw err;
            }
        }

        const bpeServiceToken = (process.env.PPOS_BPE_SERVICE_TOKEN || '').trim();
        if (!bpeServiceToken) {
            const errorMsg = 'BPE publication service token (PPOS_BPE_SERVICE_TOKEN) is not configured. Rate publication is disabled.';
            await db.query(`UPDATE bpe_pricing_publications SET status = 'FAILED', error_message = ? WHERE id = ?`, [errorMsg, publicationId]);
            const err = new Error(errorMsg);
            err.code = 'BPE_TOKEN_NOT_CONFIGURED';
            err.statusCode = 503;
            throw err;
        }

        try {
            const res = await axios.post(`${bpeUrl}${publishPath}`, publicationPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-BPE-Service-Token': bpeServiceToken
                },
                timeout: 8000
            });

            const bpeData = res.data;
            const validatedChecksum = this.validateBpeResponse(bpeData, {
                checksumToPublish,
                sentRatesChecksum,
                bpePrinthouseId,
                revisionId
            });

            await db.query(
                `UPDATE bpe_pricing_publications SET status = 'PUBLISHED', bpe_response_checksum = ?, bpe_published_at = NOW() WHERE id = ?`,
                [validatedChecksum, publicationId]
            );

            return {
                ok: true,
                status: 'PUBLISHED',
                publicationId,
                printerNodeId,
                bpePrinthouseId,
                checksumReadback: validatedChecksum,
                checksumMatched: true,
                ratesChecksum: sentRatesChecksum
            };

        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.details || err.message || 'BPE publication request failed';
            await db.query(`UPDATE bpe_pricing_publications SET status = 'FAILED', error_message = ? WHERE id = ?`, [String(errorMsg), publicationId]);

            const failureErr = new Error(String(errorMsg));
            failureErr.statusCode = err.response?.status || err.statusCode || 500;
            failureErr.publicationId = publicationId;
            throw failureErr;
        }
    }

    /**
     * Retrieves the latest published BPE revision for a node.
     */
    async getLatestPublication(printerNodeId) {

        const [pub] = await db.query(
            `SELECT id, tenant_id, printer_node_id, bpe_printhouse_id, revision_id, accepted_patch_checksum, version, status, bpe_response_checksum, bpe_published_at, created_at
             FROM bpe_pricing_publications
             WHERE printer_node_id = ? AND status = 'PUBLISHED'
             ORDER BY version DESC, created_at DESC LIMIT 1`,
            [printerNodeId]
        );

        return pub || null;
    }
}

const instance = new BpePublicationService();
instance.BpePublicationService = BpePublicationService;
instance.computeRatesChecksum = computeRatesChecksum;
module.exports = instance;
