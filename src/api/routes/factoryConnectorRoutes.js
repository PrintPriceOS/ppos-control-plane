/**
 * src/api/routes/factoryConnectorRoutes.js
 * 
 * Phase 34 - Live Federation Activation.
 * Public-facing (but authenticated) routes for external print house connectors.
 */
const express = require('express');
const router = express.Router();
const connectorAuth = require('../services/FactoryConnectorAuthService');
const heartbeatService = require('../services/industrialHeartbeatService');
const orchestrationService = require('../services/ManufacturingOrchestrationService');
const auditLogger = require('../services/auditLoggerService');
const db = require('../services/mysqlClient');

// Middleware for Connector Authentication
const requireConnectorAuth = async (req, res, next) => {
    const nodeId = req.headers['x-node-id'];
    const apiKey = req.headers['x-api-key'];

    try {
        const auth = await connectorAuth.validateNodeAccess(nodeId, apiKey);
        if (!auth.ok) {
            return res.status(401).json(auth);
        }
        req.nodeId = auth.nodeId;
        next();
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Authentication internal error' });
    }
};

/**
 * POST /api/connectors/factory/heartbeat
 * Live capacity and health ingestion from external nodes.
 */
router.post('/heartbeat', requireConnectorAuth, async (req, res) => {
    try {
        const payload = {
            ...req.body,
            node_id: req.nodeId // Force verified ID from auth
        };
        
        const result = await heartbeatService.processNodeHeartbeat(payload);
        
        await auditLogger.log({
            type: 'HEARTBEAT_RECEIVED',
            status: 'SUCCESS',
            metadata: { nodeId: req.nodeId, state: result.state }
        });

        res.json(result);
    } catch (err) {
        await auditLogger.log({
            type: 'CONNECTOR_SCHEMA_REJECTED',
            status: 'FAILURE',
            metadata: { nodeId: req.nodeId, error: err.message }
        });
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * POST /api/connectors/factory/job-update
 * Updates job production state (e.g. PRINTING, FINISHING, SHIPPED).
 */
router.post('/job-update', requireConnectorAuth, async (req, res) => {
    try {
        const { dispatchId, status, message } = req.body;
        if (!dispatchId || !status) {
            return res.status(400).json({ ok: false, error: 'MISSING_DATA' });
        }

        // Security: Verify dispatch belongs to the authenticated node
        const rows = await db.query(
            'SELECT node_id FROM manufacturing_dispatches WHERE id = ?',
            [dispatchId]
        );
        
        if (rows.length === 0 || rows[0].node_id !== req.nodeId) {
            await auditLogger.log({
                type: 'CONNECTOR_AUTH_FAILED',
                status: 'FAILURE',
                metadata: { nodeId: req.nodeId, dispatchId, reason: 'DISPATCH_OWNERSHIP_VIOLATION' }
            });
            return res.status(403).json({ ok: false, error: 'Industrial access denied: Dispatch ownership mismatch.' });
        }

        const result = await orchestrationService.updateStatus(dispatchId, status, message);
        
        await auditLogger.log({
            type: 'JOB_STATE_UPDATED',
            status: 'SUCCESS',
            metadata: { nodeId: req.nodeId, dispatchId, status }
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * GET /api/connectors/factory/config
 * Retrieves configuration for the connector (e.g. polling intervals, endpoints).
 */
router.get('/config', requireConnectorAuth, async (req, res) => {
    try {
        res.json({
            ok: true,
            config: {
                heartbeat_interval_ms: 60000,
                telemetry_batch_size: 10,
                endpoints: {
                    heartbeat: '/api/connectors/factory/heartbeat',
                    job_update: '/api/connectors/factory/job-update'
                },
                federation_version: '1.0.0-activated'
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
