/**
 * src/api/routes/adminTenantPilot.js
 * 
 * Express router for Tenant Pilot and Commercial Readiness administrative control.
 */
'use strict';

const express = require('express');
const router = express.Router();
const readinessService = require('../services/tenantPilotReadinessService');
const accessService = require('../services/tenantPilotAccessService');
const isolationService = require('../services/tenantWorkspaceIsolationService');
const { resolveActorContext } = require('../middleware/auth');
const db = require('../services/mysqlClient');

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(err => {
            console.error('[TENANT-PILOT-ROUTE-ERROR]', err);
            const { status, body } = isolationService.sanitizeCrossTenantError(err);
            res.status(status).json(body);
        });
    };
}

// GET /api/admin/tenant-pilots
router.get('/', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    // Control Plane admins can view all pilots
    let query = 'SELECT * FROM tenant_pilot_readiness';
    const params = [];
    
    // Scoping to tenant if not admin
    if (actor.role !== 'SYSTEM_ADMIN' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'CONTROL_PLANE_ADMIN') {
        query += ' WHERE tenant_id = ?';
        params.push(actor.tenantId);
    }
    
    const list = await db.query(query, params);
    
    const enriched = [];
    for (const r of list) {
        const evaluation = await readinessService.evaluateTenantPilotReadiness({
            tenantId: r.tenant_id,
            printhouseId: r.printhouse_id
        });
        enriched.push({
            ...r,
            ...evaluation
        });
    }

    res.json({ ok: true, pilots: enriched });
}));

// GET /api/admin/tenant-pilots/:tenantId/:printhouseId
router.get('/:tenantId/:printhouseId', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.params;

    // Isolation check
    isolationService.assertPrinthouseBelongsToTenant(printhouseId, tenantId);
    accessService.assertTenantScope(actor, tenantId);

    const evaluation = await readinessService.evaluateTenantPilotReadiness({ tenantId, printhouseId });
    res.json({ ok: true, readiness: evaluation });
}));

// POST /api/admin/tenant-pilots/:tenantId/:printhouseId/enable-pilot
router.post('/:tenantId/:printhouseId/enable-pilot', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.params;

    isolationService.assertPrinthouseBelongsToTenant(printhouseId, tenantId);
    if (!accessService.canManagePilotReadiness(actor, tenantId)) {
        await accessService.logDeniedAction(actor, 'ENABLE_PILOT_ACCESS', 'Insufficient role permissions');
        return res.status(403).json({ ok: false, error: 'ACCESS_DENIED', message: 'Only Control Plane Admins can enable pilot access.' });
    }

    const record = await readinessService.enablePilotAccess({ tenantId, printhouseId, actor });
    res.json({ ok: true, pilot: record });
}));

// POST /api/admin/tenant-pilots/:tenantId/:printhouseId/disable-pilot
router.post('/:tenantId/:printhouseId/disable-pilot', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.params;
    const { reason } = req.body;

    isolationService.assertPrinthouseBelongsToTenant(printhouseId, tenantId);
    if (!accessService.canManagePilotReadiness(actor, tenantId)) {
        await accessService.logDeniedAction(actor, 'DISABLE_PILOT_ACCESS', 'Insufficient role permissions');
        return res.status(403).json({ ok: false, error: 'ACCESS_DENIED', message: 'Only Control Plane Admins can disable pilot access.' });
    }

    const record = await readinessService.disablePilotAccess({ tenantId, printhouseId, actor, reason });
    res.json({ ok: true, pilot: record });
}));

// POST /api/admin/tenant-pilots/:tenantId/:printhouseId/enable-partner
router.post('/:tenantId/:printhouseId/enable-partner', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.params;

    isolationService.assertPrinthouseBelongsToTenant(printhouseId, tenantId);
    if (!accessService.canManagePilotReadiness(actor, tenantId)) {
        await accessService.logDeniedAction(actor, 'ENABLE_PARTNER_ACCESS', 'Insufficient role permissions');
        return res.status(403).json({ ok: false, error: 'ACCESS_DENIED', message: 'Only Control Plane Admins can enable partner access.' });
    }

    const record = await readinessService.enablePartnerAccess({ tenantId, printhouseId, actor });
    res.json({ ok: true, pilot: record });
}));

// POST /api/admin/tenant-pilots/:tenantId/:printhouseId/disable-partner
router.post('/:tenantId/:printhouseId/disable-partner', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.params;
    const { reason } = req.body;

    isolationService.assertPrinthouseBelongsToTenant(printhouseId, tenantId);
    if (!accessService.canManagePilotReadiness(actor, tenantId)) {
        await accessService.logDeniedAction(actor, 'DISABLE_PARTNER_ACCESS', 'Insufficient role permissions');
        return res.status(403).json({ ok: false, error: 'ACCESS_DENIED', message: 'Only Control Plane Admins can disable partner access.' });
    }

    const record = await readinessService.disablePartnerAccess({ tenantId, printhouseId, actor, reason });
    res.json({ ok: true, pilot: record });
}));

// POST /api/admin/tenant-pilots/:tenantId/:printhouseId/request-live
router.post('/:tenantId/:printhouseId/request-live', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.params;

    isolationService.assertPrinthouseBelongsToTenant(printhouseId, tenantId);
    // Enforce live enablement rules
    if (!accessService.canEnableLiveProduction(actor, tenantId)) {
        await accessService.logDeniedAction(actor, 'ENABLE_LIVE_PRODUCTION', 'Insufficient role permissions');
        return res.status(403).json({ ok: false, error: 'ACCESS_DENIED', message: 'Only System Admins can enable live production.' });
    }

    const record = await readinessService.requestLiveProductionEnablement({ tenantId, printhouseId, actor });
    res.json({ ok: true, pilot: record });
}));

// POST /api/admin/tenant-pilots/:tenantId/:printhouseId/block-live
router.post('/:tenantId/:printhouseId/block-live', asyncHandler(async (req, res) => {
    const actor = resolveActorContext(req);
    const { tenantId, printhouseId } = req.params;
    const { reason } = req.body;

    isolationService.assertPrinthouseBelongsToTenant(printhouseId, tenantId);
    if (!accessService.canManagePilotReadiness(actor, tenantId)) {
        await accessService.logDeniedAction(actor, 'BLOCK_LIVE_PRODUCTION', 'Insufficient role permissions');
        return res.status(403).json({ ok: false, error: 'ACCESS_DENIED', message: 'Only Control Plane Admins can block live production.' });
    }

    const record = await readinessService.blockLiveProductionEnablement({ tenantId, printhouseId, reason, actor });
    res.json({ ok: true, pilot: record });
}));

module.exports = router;
