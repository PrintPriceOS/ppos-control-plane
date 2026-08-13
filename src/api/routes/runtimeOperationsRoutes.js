/**
 * src/api/routes/runtimeOperationsRoutes.js
 * 
 * Phase 192F Admin Runtime Operations & Kill Switch API Endpoints.
 * Mounted at /api/admin/runtime
 * 
 * Endpoints:
 *   GET  /health                  - Detailed domain health & operational metrics
 *   GET  /kill-switches           - List active emergency kill switches
 *   POST /kill-switches           - Activate emergency kill switch override
 *   POST /kill-switches/:id/clear - Clear emergency kill switch override
 */
const express = require('express');
const router = express.Router();
const killSwitchService = require('../services/runtimeKillSwitchService');
const healthService = require('../services/runtimeHealthService');

// Middleware: Require Privileged Admin Role
function requireAdminRole(req, res, next) {
    const userRole = (req.headers['x-user-role'] || req.user?.role || '').toUpperCase();
    const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'GLOBAL_ADMIN' || userRole === 'PLATFORM_OPERATOR';

    if (!isSuperAdmin && process.env.NODE_ENV !== 'test') {
        return res.status(403).json({
            success: false,
            code: 'FORBIDDEN_OPERATIONAL_ROLE',
            error: 'Access restricted to authorized platform runtime operators'
        });
    }
    next();
}

router.use(requireAdminRole);

// GET /api/admin/runtime/health
router.get('/health', async (req, res) => {
    try {
        const health = await healthService.getRuntimeHealth();
        res.json({
            success: true,
            health
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// GET /api/admin/runtime/kill-switches
router.get('/kill-switches', async (req, res) => {
    try {
        const killSwitches = await killSwitchService.getActiveKillSwitches();
        res.json({
            success: true,
            killSwitches
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// POST /api/admin/runtime/kill-switches
router.post('/kill-switches', async (req, res) => {
    try {
        const { scope, targetId, capability, reasonCode, description } = req.body || {};
        const actorId = req.headers['x-user-id'] || 'system';

        const result = await killSwitchService.createKillSwitch({
            scope,
            targetId,
            capability,
            reasonCode,
            description,
            actorId
        });

        res.json({
            success: true,
            idempotent: result.idempotent,
            killSwitch: result.killSwitch
        });
    } catch (err) {
        res.status(err.statusCode || 400).json({
            success: false,
            code: err.code || 'KILL_SWITCH_CREATION_FAILED',
            error: err.message
        });
    }
});

// POST /api/admin/runtime/kill-switches/:id/clear
router.post('/kill-switches/:id/clear', async (req, res) => {
    try {
        const { id } = req.params;
        const actorId = req.headers['x-user-id'] || 'system';

        const result = await killSwitchService.clearKillSwitch(id, actorId);

        if (!result.cleared) {
            return res.status(404).json({
                success: false,
                code: result.reason,
                error: `Kill switch '${id}' was not found or is already cleared`
            });
        }

        res.json({
            success: true,
            cleared: true,
            killSwitch: result.killSwitch
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

module.exports = router;
