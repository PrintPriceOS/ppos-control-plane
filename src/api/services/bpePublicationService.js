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
 * Normalizes SHA-256 checksum admitting strictly 64-character hexadecimal,
 * with or without 'sha256:' prefix. Returns 64 lowercase hex characters, or null if invalid.
 */
function normalizeSha256Hex(checksum) {
    if (!checksum || typeof checksum !== 'string') return null;
    const trimmed = checksum.trim();
    const hex = trimmed.replace(/^sha256:/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
    return hex.toLowerCase();
}

/**
 * Returns canonical representation 'sha256:<64 lowercase hex characters>', or null if invalid.
 */
function toCanonicalSha256(checksum) {
    const hex = normalizeSha256Hex(checksum);
    return hex ? `sha256:${hex}` : null;
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

        const canonicalSentRates = toCanonicalSha256(sentRatesChecksum);
        if (!canonicalSentRates) {
            throw new Error(`Expected sentRatesChecksum must be a valid canonical SHA-256 checksum (got: "${sentRatesChecksum}")`);
        }

        const normalizedReturnedRates = normalizeSha256Hex(returnedRatesChecksum);
        const normalizedReadbackRates = normalizeSha256Hex(readbackRatesChecksum);
        const normalizedSentHex = normalizeSha256Hex(canonicalSentRates);

        if (typeof returnedRatesChecksum !== 'string' || !returnedRatesChecksum.startsWith('sha256:') || !normalizedReturnedRates) {
            throw new Error(`BPE response rates checksum mismatch: format must be canonical "sha256:<64-hex>". Expected: ${canonicalSentRates}, Got: ${returnedRatesChecksum}`);
        }

        if (typeof readbackRatesChecksum !== 'string' || !readbackRatesChecksum.startsWith('sha256:') || !normalizedReadbackRates) {
            throw new Error(`BPE readback rates checksum mismatch: format must be canonical "sha256:<64-hex>". Expected: ${canonicalSentRates}, Got: ${readbackRatesChecksum}`);
        }

        if (normalizedReturnedRates !== normalizedSentHex) {
            throw new Error(`BPE response rates checksum mismatch. Expected: ${canonicalSentRates}, Got: ${returnedRatesChecksum}`);
        }

        if (normalizedReadbackRates !== normalizedSentHex) {
            throw new Error(`BPE readback rates checksum mismatch. Expected: ${canonicalSentRates}, Got: ${readbackRatesChecksum}`);
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
    /**
     * Derives a deterministic MySQL advisory lock name for a BPE destination (max 64 chars).
     */
    getDestinationLockName(bpePrinthouseId) {
        const raw = `bpe_pub_dst_${bpePrinthouseId}`;
        if (raw.length <= 64) return raw;
        const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 48);
        return `bpe_pub_${hash}`;
    }

    /**
     * Acquires connection-scoped advisory lock on MySQL.
     */
    async acquireDestinationLock(conn, lockName, timeoutSeconds = 15) {
        const res = await conn.query('SELECT GET_LOCK(?, ?) AS lock_status', [lockName, timeoutSeconds]);
        const rows = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : res;
        const status = Array.isArray(rows) ? rows[0]?.lock_status : rows?.lock_status;
        if (Number(status) !== 1) {
            throw new Error(`Failed to acquire publication lock for BPE destination (lock: ${lockName}, status: ${status})`);
        }
    }

    /**
     * Releases connection-scoped advisory lock on MySQL.
     */
    async releaseDestinationLock(conn, lockName) {
        try {
            await conn.query('SELECT RELEASE_LOCK(?) AS release_status', [lockName]);
        } catch (err) {
            logger.warn(`Failed to release publication lock ${lockName}: ${err.message}`);
        }
    }

    /**
     * Publishes an accepted pricing revision to BPE with strict readback verification.
     * Serialized per BPE destination using MySQL advisory locks throughout the entire cycle.
     * 
     * @param {string} tenantId - Control Plane tenant ID
     * @param {string} printerNodeId - Control Plane printer node ID
     * @param {string} revisionId - Revision ID in printhouse_pricing_revisions
     * @param {Object} [options] - Mock/test injection options
     */
    async publishAcceptedRevision(tenantId, printerNodeId, revisionId, options = {}) {
        const bpePrinthouseId = await this.resolveBpePrinthouseId(printerNodeId);
        const lockName = this.getDestinationLockName(bpePrinthouseId);
        const lockTimeout = Number(process.env.PPOS_BPE_LOCK_TIMEOUT_SECONDS) || 15;

        let lockConn = null;
        let lockAcquired = false;

        try {
            if (typeof db.getConnection === 'function') {
                lockConn = await db.getConnection();
                await this.acquireDestinationLock(lockConn, lockName, lockTimeout);
                lockAcquired = true;
            }

            // 1. Fetch Revision & Node rates (SELECT ... FOR UPDATE / Read)
            const revisionRows = await db.query(
                `SELECT id, tenant_id, printer_node_id, proposed_patch_checksum, rates_checksum, rates_json, parent_revision_id, created_at
                 FROM printhouse_pricing_revisions
                 WHERE id = ? AND tenant_id = ? AND printer_node_id = ?`,
                [revisionId, tenantId, printerNodeId]
            );
            const revision = Array.isArray(revisionRows) ? revisionRows[0] : revisionRows;

            if (!revision) {
                throw new Error(`Revision ${revisionId} not found for printer node ${printerNodeId}`);
            }

            // 1.1 Integrity verification: read rates_checksum and compare with canonical hash of rates_json
            const ratesPayload = typeof revision.rates_json === 'string' ? JSON.parse(revision.rates_json) : revision.rates_json;
            const canonicalRatesChecksum = computeRatesChecksum(ratesPayload);
            const canonicalRatesHex = normalizeSha256Hex(canonicalRatesChecksum);

            if (!canonicalRatesHex) {
                throw new Error(`Failed to compute valid canonical SHA-256 checksum for rates_json in revision ${revisionId}`);
            }

            if (revision.rates_checksum) {
                const storedRatesHex = normalizeSha256Hex(revision.rates_checksum);
                if (!storedRatesHex) {
                    throw new Error(`Revision integrity check failed: stored rates_checksum has invalid SHA-256 format (got: "${revision.rates_checksum}")`);
                }
                if (storedRatesHex !== canonicalRatesHex) {
                    throw new Error(`Revision integrity check failed: stored rates_checksum (${revision.rates_checksum}) does not match canonical hash of rates_json (${canonicalRatesChecksum})`);
                }
            }
            const sentRatesChecksum = toCanonicalSha256(canonicalRatesChecksum);

            // 1.2 Define explicitly the contract revision/patch checksum without confusing patch and rates checksums
            let checksumToPublish;
            if (revision.proposed_patch_checksum) {
                checksumToPublish = revision.proposed_patch_checksum;
            } else {
                // MANUAL_EDIT or revision without proposed_patch_checksum: define explicit deterministic revision checksum
                checksumToPublish = 'sha256:rev_' + crypto.createHash('sha256').update(`revision:${revision.id}:${sentRatesChecksum}`).digest('hex');
            }

            // 2. Check Idempotency / Superseded Status with comprehensive identity & checksum checks
            const existingPubRows = await db.query(
                `SELECT id, tenant_id, printer_node_id, bpe_printhouse_id, revision_id, accepted_patch_checksum, bpe_response_checksum, version, status
                 FROM bpe_pricing_publications
                 WHERE printer_node_id = ? AND revision_id = ? AND tenant_id = ? AND bpe_printhouse_id = ? AND status = 'PUBLISHED'
                 ORDER BY version DESC, created_at DESC LIMIT 1`,
                [printerNodeId, revisionId, tenantId, bpePrinthouseId]
            );
            const existingPublished = Array.isArray(existingPubRows) ? existingPubRows[0] : existingPubRows;

            if (existingPublished) {
                const isPatchChecksumMatch = existingPublished.accepted_patch_checksum === checksumToPublish &&
                                             existingPublished.bpe_response_checksum === checksumToPublish;
                const currentRatesHex = normalizeSha256Hex(computeRatesChecksum(revision.rates_json));
                const ratesMatch = currentRatesHex !== null && currentRatesHex === canonicalRatesHex;

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

            // 2.1 Query A: Latest PUBLISHED publication to prevent historical revisions from overwriting newer published rates
            const latestPublishedRows = await db.query(
                `SELECT id, version, revision_id, status, created_at
                 FROM bpe_pricing_publications
                 WHERE printer_node_id = ? AND bpe_printhouse_id = ? AND status = 'PUBLISHED'
                 ORDER BY version DESC, created_at DESC LIMIT 1`,
                [printerNodeId, bpePrinthouseId]
            );
            const latestPublished = Array.isArray(latestPublishedRows) ? latestPublishedRows[0] : latestPublishedRows;

            if (latestPublished && String(latestPublished.revision_id) !== String(revisionId)) {
                const latestRevRows = await db.query(
                    `SELECT created_at FROM printhouse_pricing_revisions WHERE id = ?`,
                    [latestPublished.revision_id]
                );
                const latestPubRev = Array.isArray(latestRevRows) ? latestRevRows[0] : latestRevRows;
                if (latestPubRev && new Date(revision.created_at) < new Date(latestPubRev.created_at)) {
                    throw new Error(`Cannot publish historical revision ${revisionId} (created ${revision.created_at}) over more recent published revision ${latestPublished.revision_id} (created ${latestPubRev.created_at})`);
                }
            }

            // 2.2 Query B: Monotonic publication sequence counter across ALL publication records (PENDING, PUBLISHED, FAILED, SUPERSEDED)
            const maxVersionRows = await db.query(
                `SELECT version
                 FROM bpe_pricing_publications
                 WHERE printer_node_id = ? AND bpe_printhouse_id = ?
                 ORDER BY version DESC LIMIT 1`,
                [printerNodeId, bpePrinthouseId]
            );
            const maxVersionRow = Array.isArray(maxVersionRows) ? maxVersionRows[0] : maxVersionRows;
            const currentMaxVersion = maxVersionRow && Number.isInteger(Number(maxVersionRow.version))
                ? Number(maxVersionRow.version)
                : 0;

            const nextPublicationVersion = currentMaxVersion + 1;
            const publicationId = uuidv4();

            await db.query(
                `INSERT INTO bpe_pricing_publications (id, tenant_id, printer_node_id, bpe_printhouse_id, revision_id, accepted_patch_checksum, version, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
                [publicationId, tenantId, printerNodeId, bpePrinthouseId, revisionId, checksumToPublish, nextPublicationVersion]
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
                rates_checksum: sentRatesChecksum,
                version: nextPublicationVersion,
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
                    version: nextPublicationVersion,
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
        } finally {
            if (lockConn) {
                try {
                    if (lockAcquired) {
                        await this.releaseDestinationLock(lockConn, lockName);
                    }
                } finally {
                    try {
                        lockConn.release();
                    } catch (releaseErr) {
                        logger.warn(`Failed to release MySQL lock connection: ${releaseErr.message}`);
                    }
                }
            }
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
instance.normalizeSha256Hex = normalizeSha256Hex;
instance.toCanonicalSha256 = toCanonicalSha256;
module.exports = instance;
