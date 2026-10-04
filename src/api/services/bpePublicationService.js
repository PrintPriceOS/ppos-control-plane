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

class BpePublicationService {

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

        // 2. Check Idempotency / Superseded Status
        const [existingPublished] = await db.query(
            `SELECT id, status, accepted_patch_checksum FROM bpe_pricing_publications
             WHERE printer_node_id = ? AND status = 'PUBLISHED'
             ORDER BY version DESC, created_at DESC LIMIT 1`,
            [printerNodeId]
        );

        if (existingPublished) {
            if (existingPublished.accepted_patch_checksum === checksumToPublish) {
                logger.info(`Revision ${revisionId} (checksum: ${checksumToPublish}) is already published to BPE`, { printerNodeId });
                return {
                    ok: true,
                    alreadyPublished: true,
                    status: 'PUBLISHED',
                    publicationId: existingPublished.id,
                    checksum: checksumToPublish
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
        const ratesPayload = typeof revision.rates_json === 'string' ? JSON.parse(revision.rates_json) : revision.rates_json;
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

        // 4. Dispatch to BPE Endpoint or Mock Handler
        if (options.mockHandler) {
            try {
                const res = await options.mockHandler(publicationPayload);
                const responseChecksum = res.checksum || checksumToPublish;
                
                await db.query(
                    `UPDATE bpe_pricing_publications SET status = 'PUBLISHED', bpe_response_checksum = ?, bpe_published_at = NOW() WHERE id = ?`,
                    [responseChecksum, publicationId]
                );

                return {
                    ok: true,
                    status: 'PUBLISHED',
                    publicationId,
                    printerNodeId,
                    bpePrinthouseId,
                    checksumReadback: responseChecksum,
                    checksumMatched: responseChecksum === checksumToPublish
                };
            } catch (err) {
                await db.query(`UPDATE bpe_pricing_publications SET status = 'FAILED', error_message = ? WHERE id = ?`, [err.message, publicationId]);
                throw err;
            }
        }

        try {
            const res = await axios.post(`${bpeUrl}${publishPath}`, publicationPayload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 8000
            });

            const bpeData = res.data || {};
            const responseChecksum = bpeData.checksum || bpeData.accepted_patch_checksum || checksumToPublish;

            // Verify Readback Checksum
            if (responseChecksum !== checksumToPublish) {
                const checksumMismatchMsg = `BPE returned mismatched checksum during publication readback. Expected: ${checksumToPublish}, Got: ${responseChecksum}`;
                await db.query(`UPDATE bpe_pricing_publications SET status = 'FAILED', error_message = ? WHERE id = ?`, [checksumMismatchMsg, publicationId]);
                throw new Error(checksumMismatchMsg);
            }

            await db.query(
                `UPDATE bpe_pricing_publications SET status = 'PUBLISHED', bpe_response_checksum = ?, bpe_published_at = NOW() WHERE id = ?`,
                [responseChecksum, publicationId]
            );

            return {
                ok: true,
                status: 'PUBLISHED',
                publicationId,
                printerNodeId,
                bpePrinthouseId,
                checksumReadback: responseChecksum,
                checksumMatched: true
            };

        } catch (err) {
            const errorMsg = err.response?.data?.error || err.message || 'BPE publication request failed';
            await db.query(`UPDATE bpe_pricing_publications SET status = 'FAILED', error_message = ? WHERE id = ?`, [String(errorMsg), publicationId]);

            // If BPE publication endpoint is unavailable, return structured pending status for isolated environments
            return {
                ok: false,
                status: 'FAILED',
                publicationId,
                printerNodeId,
                error: String(errorMsg)
            };
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

module.exports = new BpePublicationService();
