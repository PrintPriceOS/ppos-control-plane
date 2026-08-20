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
const readinessService = require('../services/printhouseReadinessService');
const onboardingService = require('../services/printhouseOnboardingService');
const { requireAdmin } = require('../middleware/auth');
const db = require('../services/mysqlClient');

// Middleware to extract tenant context and check role/status with strict fail-closed auth
const requireAuth = async (req, res, next) => {
    // First, let standard auth middleware populate req.user if a valid Bearer JWT is present
    if (!req.user) {
        return requireAdmin(req, res, async () => {
            await finalizeTenantVerification(req, res, next);
        });
    }
    await finalizeTenantVerification(req, res, next);
};

const finalizeTenantVerification = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

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
    next();
};

// ── GET /api/printhouse/onboarding/pricing/industrial ──
router.get('/pricing/industrial', requireAuth, async (req, res) => {
    const tenantId = req.user.tenantId;
    try {
        const rows = await db.query('SELECT * FROM printer_nodes WHERE tenant_id = ? LIMIT 1', [tenantId]);
        if (rows.length === 0) {
            return res.json({
                ok: true,
                data: {
                    nodeId: null,
                    configured: false,
                    signatures: [16],
                    deliveryTime: '14 days',
                    productionLeadDays: 11,
                    limits: { min_copies: 50, max_pages: 1500 },
                    rates: null
                }
            });
        }
        const node = rows[0];
        let parsedRates = null;
        if (node.rates_json) {
            try {
                parsedRates = typeof node.rates_json === 'string' ? JSON.parse(node.rates_json) : node.rates_json;
            } catch (e) {
                parsedRates = null;
            }
        }
        const isConfigured = parsedRates !== null && Object.keys(parsedRates).length > 0;

        res.json({
            ok: true,
            data: {
                nodeId: node.id,
                configured: isConfigured,
                signatures: typeof node.signatures === 'string' ? JSON.parse(node.signatures) : (node.signatures || [16]),
                deliveryTime: node.delivery_time || '14 days',
                productionLeadDays: node.production_lead_days || 11,
                limits: typeof node.limits === 'string' ? JSON.parse(node.limits) : (node.limits || { min_copies: 50, max_pages: 1500 }),
                rates: parsedRates
            }
        });
    } catch (err) {
        console.error('[ONBOARDING] Error fetching industrial pricing:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Helper: Safe deterministic deep merge that protects against prototype pollution
function isPlainObject(obj) {
    return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

function safeDeepMergeRates(target, source) {
    if (!isPlainObject(target)) target = {};
    if (!isPlainObject(source)) return target;

    const result = { ...target };

    for (const key of Object.keys(source)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue;
        }

        const sourceVal = source[key];
        const targetVal = target[key];

        if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
            result[key] = safeDeepMergeRates(targetVal, sourceVal);
        } else {
            result[key] = sourceVal;
        }
    }

    return result;
}

// ── PUT /api/printhouse/onboarding/pricing/industrial ──
router.put('/pricing/industrial', requireAuth, async (req, res) => {
    const tenantId = req.user.tenantId;
    const { signatures, delivery_time, production_lead_days, limits, rates } = req.body;

    try {
        const rows = await db.query('SELECT id, rates_json FROM printer_nodes WHERE tenant_id = ? LIMIT 1', [tenantId]);
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'No printer node found for tenant. Configure production sites first.' });
        }
        const node = rows[0];
        const nodeId = node.id;

        const fields = [];
        const params = [];

        if (signatures !== undefined) { fields.push('signatures = ?'); params.push(JSON.stringify(signatures)); }
        if (delivery_time !== undefined) { fields.push('delivery_time = ?'); params.push(String(delivery_time)); }
        if (production_lead_days !== undefined) { fields.push('production_lead_days = ?'); params.push(parseInt(production_lead_days, 10) || 0); }
        if (limits !== undefined) { fields.push('limits = ?'); params.push(JSON.stringify(limits)); }
        
        if (rates !== undefined) {
            let existingRates = {};
            if (node.rates_json) {
                try {
                    existingRates = typeof node.rates_json === 'string' ? JSON.parse(node.rates_json) : node.rates_json;
                    if (!isPlainObject(existingRates)) existingRates = {};
                } catch (e) {
                    existingRates = {};
                }
            }
            const mergedRates = safeDeepMergeRates(existingRates, rates);
            fields.push('rates_json = ?');
            params.push(JSON.stringify(mergedRates));
        }

        if (fields.length > 0) {
            params.push(nodeId);
            params.push(tenantId);
            await db.query(`UPDATE printer_nodes SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
        }

        res.json({ ok: true, message: 'Industrial pricing rates updated successfully' });
    } catch (err) {
        console.error('[ONBOARDING] Error updating industrial pricing:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

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

// ──── 0. Root Readiness & Onboarding State Aggregation Endpoint ───────────────
router.get('/', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        if (!tenantId) {
            return res.status(400).json({ ok: false, error: 'Tenant context required' });
        }

        const [readiness, company, sites] = await Promise.all([
            readinessService.computeReadiness(tenantId),
            onboardingService.getCompanyProfile(tenantId).catch(() => ({})),
            onboardingService.getProductionSites(tenantId).catch(() => ([]))
        ]);

        res.json({
            ok: true,
            data: {
                company,
                sites,
                readiness
            }
        });
    } catch (err) {
        console.error('[ONBOARDING][ROOT-READINESS-ERROR]', err);
        res.status(500).json({ ok: false, error: err.message || 'Failed to compute printhouse readiness' });
    }
});


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
        if (err.message && typeof err.message === 'string' && err.message.startsWith('INVALID_')) {
            return res.status(400).json({ error: err.message });
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


// ──── 4. Calibration Session REST Endpoints (Phase 193B) ──────────────────
const calibrationService = require('../services/calibrationSessionService');

// POST /api/printhouse/onboarding/pricing/calibrations — Create DRAFT session
router.post('/pricing/calibrations', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const user = { id: req.user.id, email: req.user.email, role: req.user.role };
    const session = await calibrationService.createSession(tenantId, user, req.body);
    res.status(201).json({ ok: true, data: session });
}));

// GET /api/printhouse/onboarding/pricing/calibrations — List sessions for tenant
router.get('/pricing/calibrations', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const sessions = await calibrationService.listSessions(tenantId);
    res.json({ ok: true, data: sessions });
}));

// GET /api/printhouse/onboarding/pricing/calibrations/:id — Get single session
router.get('/pricing/calibrations/:id', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const session = await calibrationService.getSession(tenantId, req.params.id);
    res.json({ ok: true, data: session });
}));

// PUT /api/printhouse/onboarding/pricing/calibrations/:id — Update DRAFT session
router.put('/pricing/calibrations/:id', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const session = await calibrationService.updateSession(tenantId, req.params.id, req.body);
    res.json({ ok: true, data: session });
}));

// POST /api/printhouse/onboarding/pricing/calibrations/:id/ready — Promote to READY
router.post('/pricing/calibrations/:id/ready', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const session = await calibrationService.promoteToReady(tenantId, req.params.id);
    res.json({ ok: true, data: session });
}));

// POST /api/printhouse/onboarding/pricing/calibrations/:id/reject — Reject session
router.post('/pricing/calibrations/:id/reject', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const reason = req.body.reason || null;
    const session = await calibrationService.rejectSession(tenantId, req.params.id, reason);
    res.json({ ok: true, data: session });
}));


// ──── 5. Calibration Runs & Deterministic Solver REST Endpoints (Phase 193C) ─
const calibrationRunService = require('../services/calibrationRunService');

// POST /api/printhouse/onboarding/pricing/calibrations/:id/calculate — Execute solver run
router.post('/pricing/calibrations/:id/calculate', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const user = { id: req.user.id, email: req.user.email, role: req.user.role };
    const run = await calibrationRunService.executeRun(tenantId, req.params.id, user, req.body);
    res.status(201).json({ ok: true, data: run });
}));

// GET /api/printhouse/onboarding/pricing/calibrations/:id/runs — List runs for session
router.get('/pricing/calibrations/:id/runs', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const runs = await calibrationRunService.listRuns(tenantId, req.params.id);
    res.json({ ok: true, data: runs });
}));

// GET /api/printhouse/onboarding/pricing/calibrations/:id/runs/:runId — Get specific run
router.get('/pricing/calibrations/:id/runs/:runId', wrapHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const run = await calibrationRunService.getRun(tenantId, req.params.id, req.params.runId);
    res.json({ ok: true, data: run });
}));

module.exports = router;


