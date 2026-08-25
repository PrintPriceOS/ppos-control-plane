/**
 * src/api/services/printhousePricingGovernanceService.js
 *
 * Read-only aggregation service for Printhouse Pricing Governance Metadata.
 * Resolves active revision by matching canonical rates checksum of live rates_json
 * against immutable printhouse_pricing_revisions records, and extracts governed
 * calibration acceptances from printhouse_pricing_calibration_acceptances.
 *
 * INVARIANTS:
 * 1. Strictly read-only (zero mutations).
 * 2. Strict tenant isolation (enforces tenant_id = ?).
 * 3. Active revision is ONLY identified if revision.rates_checksum == active rates_json checksum.
 * 4. Manufacturing price verified during acceptance is exposed as lastVerifiedManufacturingPrice.
 * 5. Batched execution to prevent N+1 query overhead.
 */

const crypto = require('crypto');
const db = require('./mysqlClient');
const logger = require('./logger').child('pricing-governance-service');

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
 * Computes a deterministic SHA-256 checksum of rates JSON.
 */
function computeRatesChecksum(ratesJson) {
    if (!ratesJson) return null;
    const parsed = typeof ratesJson === 'string' ? JSON.parse(ratesJson) : ratesJson;
    const canonical = canonicalStringify(parsed);
    return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Batched retrieval of pricing governance metadata for printer nodes.
 *
 * @param {string|null} tenantId - Tenant ID for scoping, or null for superadmin.
 * @param {Array<{ id: string, tenant_id?: string, rates_json?: any }>} nodes - List of node rows.
 * @returns {Promise<Record<string, {
 *   activeRevisionId: string | null,
 *   activeRevisionChecksum: string | null,
 *   latestRevisionId: string | null,
 *   lastCalibrationAt: string | null,
 *   lastAcceptedRunId: string | null,
 *   lastAcceptanceId: string | null,
 *   lastVerifiedManufacturingPrice: number | null,
 *   lastVerifiedManufacturingPriceAt: string | null
 * }>>} Map of node ID to governance metadata DTO.
 */
async function getGovernanceMetadataByNodes(tenantId, nodes) {
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
        return {};
    }

    const nodeIds = nodes.map(n => n.id);
    const nodeChecksumMap = {};

    // Initialize result dictionary with default null state
    const result = {};
    for (const node of nodes) {
        const activeChecksum = node.rates_json ? computeRatesChecksum(node.rates_json) : null;
        nodeChecksumMap[node.id] = activeChecksum;

        result[node.id] = {
            activeRevisionId: null,
            activeRevisionChecksum: null,
            latestRevisionId: null,
            lastCalibrationAt: null,
            lastAcceptedRunId: null,
            lastAcceptanceId: null,
            lastVerifiedManufacturingPrice: null,
            lastVerifiedManufacturingPriceAt: null
        };
    }

    try {
        // 1. Fetch revisions for all requested nodes with tenant scoping
        const revParams = [];
        let revSql = `
            SELECT id, tenant_id, printer_node_id, rates_checksum, created_at
            FROM printhouse_pricing_revisions
            WHERE printer_node_id IN (?)
        `;
        revParams.push(nodeIds);

        if (tenantId) {
            revSql += ' AND tenant_id = ?';
            revParams.push(tenantId);
        }

        revSql += ' ORDER BY created_at DESC, id DESC';

        const revRows = await db.query(revSql, revParams).catch(err => {
            logger.warn({ event: 'revisions_query_warning', message: err.message });
            return [];
        });

        if (Array.isArray(revRows)) {
            for (const r of revRows) {
                const nodeId = r.printer_node_id;
                if (result[nodeId]) {
                    // Track latest created revision
                    if (!result[nodeId].latestRevisionId) {
                        result[nodeId].latestRevisionId = r.id;
                    }

                    // Strict matching: active revision MUST match the live rates_checksum
                    if (!result[nodeId].activeRevisionId && nodeChecksumMap[nodeId] && r.rates_checksum === nodeChecksumMap[nodeId]) {
                        result[nodeId].activeRevisionId = r.id;
                        result[nodeId].activeRevisionChecksum = r.rates_checksum;
                    }
                }
            }
        }

        // 2. Fetch latest governed calibration acceptance per node with tenant scoping
        const accParams = [];
        let accSql = `
            SELECT a.id, a.tenant_id, a.printer_node_id, a.calibration_session_id, a.calibration_run_id,
                   a.pricing_revision_id, a.resulting_rates_checksum, a.verified_manufacturing_price, a.accepted_at
            FROM printhouse_pricing_calibration_acceptances a
            INNER JOIN (
                SELECT printer_node_id, MAX(accepted_at) AS max_accepted
                FROM printhouse_pricing_calibration_acceptances
                WHERE printer_node_id IN (?)
        `;
        accParams.push(nodeIds);

        if (tenantId) {
            accSql += ' AND tenant_id = ?';
            accParams.push(tenantId);
        }

        accSql += ` GROUP BY printer_node_id
            ) latest ON a.printer_node_id = latest.printer_node_id AND a.accepted_at = latest.max_accepted
            WHERE 1=1
        `;

        if (tenantId) {
            accSql += ' AND a.tenant_id = ?';
            accParams.push(tenantId);
        }

        accSql += ' ORDER BY a.accepted_at DESC, a.id DESC';

        const accRows = await db.query(accSql, accParams).catch(err => {
            logger.warn({ event: 'acceptances_query_warning', message: err.message });
            return [];
        });

        if (Array.isArray(accRows)) {
            for (const a of accRows) {
                const nodeId = a.printer_node_id;
                if (result[nodeId] && !result[nodeId].lastAcceptanceId) {
                    result[nodeId].lastAcceptanceId = a.id;
                    result[nodeId].lastAcceptedRunId = a.calibration_run_id || null;
                    result[nodeId].lastCalibrationAt = a.accepted_at ? new Date(a.accepted_at).toISOString() : null;
                    result[nodeId].lastVerifiedManufacturingPrice = a.verified_manufacturing_price !== null && a.verified_manufacturing_price !== undefined
                        ? Number(a.verified_manufacturing_price)
                        : null;
                    result[nodeId].lastVerifiedManufacturingPriceAt = a.accepted_at ? new Date(a.accepted_at).toISOString() : null;

                    // If active revision was not resolved via checksum match, check if acceptance resulting checksum matches live node
                    if (!result[nodeId].activeRevisionId && nodeChecksumMap[nodeId] && a.resulting_rates_checksum === nodeChecksumMap[nodeId] && a.pricing_revision_id) {
                        result[nodeId].activeRevisionId = a.pricing_revision_id;
                        result[nodeId].activeRevisionChecksum = a.resulting_rates_checksum;
                    }
                }
            }
        }

        return result;
    } catch (err) {
        logger.error({ event: 'governance_metadata_fetch_failed', message: err.message, tenantId });
        return result;
    }
}

module.exports = {
    getGovernanceMetadataByNodes,
    computeRatesChecksum,
    canonicalStringify
};
