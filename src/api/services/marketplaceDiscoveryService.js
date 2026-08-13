/**
 * src/api/services/marketplaceDiscoveryService.js
 * 
 * Phase 192C Canonical Marketplace Discovery Service.
 * Lists and projects discoverable Printhouses and sites that hold active MARKETPLACE_VISIBLE grants.
 * Fails closed for unactivated, suspended, or deleted nodes.
 * Exposes strict safe public projection.
 */
const db = require('./mysqlClient');
const activationAdapter = require('./printhouseActivationAdapter');

class MarketplaceDiscoveryService {

    /**
     * Projects a raw database node row into a safe public discovery payload.
     * Prevents leakage of internal cost structures, secrets, or administrative comments.
     */
    toPublicProjection(node, capabilities = {}) {
        return {
            printhouseId: node.tenant_id || node.id,
            siteId: node.id,
            displayName: node.name || 'Printhouse Production Partner',
            country: node.country || 'ES',
            city: node.city || 'Unknown',
            marketplaceStatus: 'DISCOVERABLE',
            qualitySummary: {
                score: node.quality_score != null ? Number(node.quality_score) : 95.0,
                slaTier: node.sla_tier || 'GOLD'
            },
            capabilities: {
                marketplaceVisible: true,
                liveQuotingAllowed: Boolean(capabilities.LIVE_QUOTING_ALLOWED),
                supportedProcessTypes: node.supported_processes ? node.supported_processes.split(',') : ['OFFSET', 'DIGITAL']
            }
        };
    }

    /**
     * Lists all discoverable nodes holding an active MARKETPLACE_VISIBLE grant.
     */
    async listDiscoverableNodes() {
        try {
            const filterSql = activationAdapter.getCanonicalBulkFilterSql('g', 'MARKETPLACE_VISIBLE');
            const rows = await db.query(`
                SELECT p.id, p.tenant_id, p.name, p.country, p.city, p.quality_score, p.sla_tier, p.status, g.live_quoting_allowed
                FROM printer_nodes p
                INNER JOIN printhouse_activation_grants g ON p.tenant_id = g.tenant_id
                WHERE ${filterSql} AND p.status != 'DELETED'
                ORDER BY p.name ASC
            `);

            if (!rows || rows.length === 0) {
                return [];
            }

            return rows.map(row => this.toPublicProjection(row, {
                LIVE_QUOTING_ALLOWED: row.live_quoting_allowed
            }));
        } catch (err) {
            // Fail Closed on DB Error
            return [];
        }
    }

    /**
     * Retrieves public discoverable detail for a specific Printhouse node.
     */
    async getDiscoverableNodeDetail(tenantId) {
        if (!tenantId) {
            const err = new Error('DISCOVERY_NODE_NOT_FOUND: tenantId is required');
            err.code = 'DISCOVERY_NODE_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        const capData = await activationAdapter.getCapabilities({ tenantId });
        if (capData.status === 'SUSPENDED') {
            const err = new Error(`PRINTHOUSE_SUSPENDED: Printhouse tenant '${tenantId}' is suspended.`);
            err.code = 'PRINTHOUSE_SUSPENDED';
            err.statusCode = 403;
            throw err;
        }

        if (!capData.capabilities.MARKETPLACE_VISIBLE) {
            const err = new Error(`DISCOVERY_NOT_VISIBLE: Printhouse tenant '${tenantId}' is not discoverable.`);
            err.code = 'DISCOVERY_NOT_VISIBLE';
            err.statusCode = 404;
            throw err;
        }

        const rows = await db.query(`
            SELECT id, tenant_id, name, country, city, quality_score, sla_tier, status 
            FROM printer_nodes 
            WHERE (tenant_id = ? OR id = ?) AND status != 'DELETED'
            LIMIT 1
        `, [tenantId, tenantId]);

        if (!rows || rows.length === 0) {
            const err = new Error(`DISCOVERY_NODE_NOT_FOUND: Node '${tenantId}' not found.`);
            err.code = 'DISCOVERY_NODE_NOT_FOUND';
            err.statusCode = 404;
            throw err;
        }

        return this.toPublicProjection(rows[0], capData.capabilities);
    }
}

module.exports = new MarketplaceDiscoveryService();
