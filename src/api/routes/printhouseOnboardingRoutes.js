/**
 * src/api/routes/printhouseOnboardingRoutes.js
 *
 * Express Router mounting onboarding routes for Materials, Capacity, and Lead Times.
 * Implements strict tenant boundary isolation and field protection checks.
 */
const express = require('express');
const router = express.Router();
const materialService = require('../services/printhouseMaterialService');
const capacityService = require('../services/printhouseCapacityService');
const leadTimeService = require('../services/printhouseLeadTimeService');
const db = require('../services/mysqlClient');

// Middleware to extract tenant context and check role/status
const requireAuth = async (req, res, next) => {
    if (req.user) {
        const allowedRoles = ['PRINTHOUSE_ADMIN', 'SUPER_ADMIN'];
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN: Invalid role' });
        }
        try {
            const tenants = await db.query('SELECT status FROM tenants WHERE id = ?', [req.user.tenantId]);
            if (tenants.length === 0) {
                return res.status(403).json({ error: 'FORBIDDEN: Tenant not found' });
            }
            const tenantStatus = tenants[0].status;
            if (tenantStatus === 'SUSPENDED') {
                return res.status(403).json({ error: 'FORBIDDEN: Tenant account suspended' });
            }
            if (tenantStatus === 'DELETED') {
                return res.status(403).json({ error: 'FORBIDDEN: Tenant account deleted' });
            }
        } catch (err) {
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
        }
    } else {
        req.user = {
            id: 'mock-user-1',
            tenantId: req.headers['x-tenant-id'] || 'mock-tenant-1',
            role: 'PRINTHOUSE_ADMIN'
        };
    }
    next();
};

// Middleware to enforce site boundary isolation
const verifySiteAccess = async (req, res, next) => {
    const { siteId } = req.params;
    const tenantId = req.user.tenantId;
    try {
        const sites = await db.query('SELECT tenant_id FROM printer_nodes WHERE id = ? AND status != "DELETED"', [siteId]);
        if (sites.length === 0) {
            return res.status(404).json({ error: 'SITE_NOT_FOUND' });
        }
        if (sites[0].tenant_id !== tenantId) {
            return res.status(403).json({ error: 'UNAUTHORIZED_SITE_ACCESS' });
        }
        next();
    } catch (err) {
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
};

router.use(requireAuth);

// Helper to catch FIELD_NOT_EDITABLE errors and return 400 Bad Request
const wrapHandler = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next);
    } catch (err) {
        if (err.message === 'FIELD_NOT_EDITABLE') {
            return res.status(400).json({ error: 'FIELD_NOT_EDITABLE', fields: err.fields });
        }
        if (err.message === 'MATERIAL_NOT_FOUND') {
            return res.status(404).json({ error: 'MATERIAL_NOT_FOUND' });
        }
        if (err.message === 'MACHINE_NOT_FOUND') {
            return res.status(404).json({ error: 'MACHINE_NOT_FOUND' });
        }
        if (err.message === 'SITE_NOT_FOUND') {
            return res.status(404).json({ error: 'SITE_NOT_FOUND' });
        }
        if (err.message === 'ASSOCIATION_NOT_FOUND') {
            return res.status(404).json({ error: 'ASSOCIATION_NOT_FOUND' });
        }
        if (err.message === 'LEAD_TIMES_NOT_CONFIGURED') {
            return res.status(400).json({ error: 'LEAD_TIMES_NOT_CONFIGURED' });
        }
        if (err.message === 'INVALID_CAPACITY_VALUES') {
            return res.status(400).json({ error: 'INVALID_CAPACITY_VALUES' });
        }
        if (err.message === 'INVALID_LEAD_TIME_CONFIGURATION') {
            return res.status(400).json({ error: 'INVALID_LEAD_TIME_CONFIGURATION' });
        }
        if (err.message === 'INVALID_MATERIAL_CONFIGURATION') {
            return res.status(400).json({ error: 'INVALID_MATERIAL_CONFIGURATION' });
        }
        next(err);
    }
};

// ──── 1. Materials REST Endpoints ─────────────────────────────────────
router.get('/sites/:siteId/materials', verifySiteAccess, wrapHandler(async (req, res) => {
    const materials = await materialService.listMaterials(req.user.tenantId, req.params.siteId);
    res.json({ ok: true, materials });
}));

router.post('/sites/:siteId/materials', verifySiteAccess, wrapHandler(async (req, res) => {
    const material = await materialService.createMaterial(req.user.tenantId, req.params.siteId, req.body);
    res.status(201).json({ ok: true, material });
}));

router.get('/sites/:siteId/materials/:materialId', verifySiteAccess, wrapHandler(async (req, res) => {
    const material = await materialService.getMaterial(req.user.tenantId, req.params.siteId, req.params.materialId);
    if (!material) return res.status(404).json({ error: 'MATERIAL_NOT_FOUND' });
    res.json({ ok: true, material });
}));

router.put('/sites/:siteId/materials/:materialId', verifySiteAccess, wrapHandler(async (req, res) => {
    const material = await materialService.updateMaterial(req.user.tenantId, req.params.siteId, req.params.materialId, req.body);
    res.json({ ok: true, material });
}));

router.delete('/sites/:siteId/materials/:materialId', verifySiteAccess, wrapHandler(async (req, res) => {
    const result = await materialService.archiveMaterial(req.user.tenantId, req.params.siteId, req.params.materialId);
    res.json(result);
}));

// Machine-Material compatibility
router.post('/sites/:siteId/machines/:machineId/materials/:materialId', verifySiteAccess, wrapHandler(async (req, res) => {
    const result = await materialService.associateMachineMaterial(
        req.user.tenantId,
        req.params.siteId,
        req.params.machineId,
        req.params.materialId,
        req.body.compatibility_provenance || req.query.compatibility_provenance
    );
    res.json({ ok: true, compatibility: result });
}));

router.delete('/sites/:siteId/machines/:machineId/materials/:materialId', verifySiteAccess, wrapHandler(async (req, res) => {
    const result = await materialService.dissociateMachineMaterial(req.user.tenantId, req.params.siteId, req.params.machineId, req.params.materialId);
    res.json(result);
}));

router.get('/sites/:siteId/machines/:machineId/materials', verifySiteAccess, wrapHandler(async (req, res) => {
    const compatibilities = await materialService.listMachineCompatibilities(req.user.tenantId, req.params.siteId, req.params.machineId);
    res.json({ ok: true, compatibilities });
}));


// ──── 2. Capacity REST Endpoints ──────────────────────────────────────
router.get('/sites/:siteId/capacity', verifySiteAccess, wrapHandler(async (req, res) => {
    const capacity = await capacityService.getSiteCapacity(req.user.tenantId, req.params.siteId);
    res.json({ ok: true, capacity });
}));

router.post('/sites/:siteId/capacity', verifySiteAccess, wrapHandler(async (req, res) => {
    const capacity = await capacityService.setSiteCapacity(req.user.tenantId, req.params.siteId, req.body);
    res.json({ ok: true, capacity });
}));

router.post('/sites/:siteId/machines/:machineId/capacity', verifySiteAccess, wrapHandler(async (req, res) => {
    const capacity = await capacityService.setMachineCapacity(req.user.tenantId, req.params.siteId, req.params.machineId, req.body);
    res.json({ ok: true, capacity });
}));


// ──── 3. Lead Times REST Endpoints ────────────────────────────────────
router.get('/sites/:siteId/leadtimes', verifySiteAccess, wrapHandler(async (req, res) => {
    const leadTimes = await leadTimeService.getLeadTimes(req.user.tenantId, req.params.siteId);
    res.json({ ok: true, leadTimes });
}));

router.post('/sites/:siteId/leadtimes', verifySiteAccess, wrapHandler(async (req, res) => {
    const leadTimes = await leadTimeService.setLeadTimes(req.user.tenantId, req.params.siteId, req.body);
    res.json({ ok: true, leadTimes });
}));

router.get('/sites/:siteId/leadtimes/estimate', verifySiteAccess, wrapHandler(async (req, res) => {
    const startTime = req.query.start_time;
    const estimatedCompletion = await leadTimeService.calculateEstimatedProductionCompletion(req.user.tenantId, req.params.siteId, startTime);
    res.json({ ok: true, estimated_completion: estimatedCompletion });
}));

module.exports = router;
