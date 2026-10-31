/**
 * src/api/services/FactoryConnectorAuthService.js
 * 
 * Phase 34 - Live Federation Activation.
 * Validates external factory connector requests using node-specific API keys.
 */
const db = require('./mysqlClient');
const auditLogger = require('./auditLoggerService');
const crypto = require('crypto');

class FactoryConnectorAuthService {
    /**
     * Validates that a node has permission to push telemetry or updates.
     * 
     * @param {string} nodeId - The unique identifier of the print node (e.g., adv-2025)
     * @param {string} apiKey - The raw API key provided by the connector
     * @returns {Promise<{ok: boolean, nodeId?: string, error?: string}>}
     */
    async validateNodeAccess(nodeId, apiKey) {
        if (!nodeId || !apiKey) {
            await this._auditFailure(nodeId, 'MISSING_CREDENTIALS');
            return { ok: false, error: 'Missing nodeId or apiKey' };
        }

        // 1. Fetch node and security hash
        const rows = await db.query(
            'SELECT id, printer_api_key_hash, status FROM printer_nodes WHERE id = ?',
            [nodeId]
        );

        // 2. Handle missing nodes
        if (rows.length === 0) {
            // Development Fallback: Allow if specifically enabled in development environment
            if (process.env.NODE_ENV === 'development' || process.env.PPOS_DEV_CONNECTOR === 'true') {
                return { ok: true, nodeId, devMode: true };
            }
            
            await this._auditFailure(nodeId, 'NODE_NOT_FOUND');
            return { ok: false, error: 'Industrial authentication failed: Node identity unrecognized.' };
        }

        const node = rows[0];

        // 3. Compute incoming hash
        const incomingHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        
        // 4. Validate hash
        if (node.printer_api_key_hash) {
            if (node.printer_api_key_hash !== incomingHash) {
                await this._auditFailure(nodeId, 'INVALID_API_KEY');
                return { ok: false, error: 'Industrial authentication failed: Invalid signature.' };
            }
        } else {
            // Fail Closed: If no hash is set in DB, reject in production
            if (process.env.NODE_ENV !== 'development' && process.env.PPOS_DEV_CONNECTOR !== 'true') {
                await this._auditFailure(nodeId, 'NO_KEY_CONFIGURED');
                return { ok: false, error: 'Security constraint: No industrial access key configured for this node.' };
            }
        }

        return { ok: true, nodeId: node.id };
    }

    async _auditFailure(nodeId, reason) {
        await auditLogger.log({
            type: 'CONNECTOR_AUTH_FAILED',
            status: 'FAILURE',
            metadata: { nodeId, reason, timestamp: new Date().toISOString() }
        });
    }
}

module.exports = new FactoryConnectorAuthService();
