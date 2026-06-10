/**
 * src/api/routes/printhouseCapabilities.js
 * 
 * Phase 76A — Express routes for Printhouse capabilities and onboarding.
 */
const express = require('express');
const router = express.Router();
const printhouseCapabilityService = require('../services/printhouseCapabilityService');
const { resolveActorContext } = require('../middleware/auth');

// Middleware to resolve actor and enforce base tenant context
function getActorAndTenant(req, res) {
    const actor = resolveActorContext(req);
    const tenantId = actor?.tenantId || 'system';
    return { actor, tenantId };
}

// ----------------------------------------------------------------------
// PRINTHOUSES CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities - Create Printhouse
router.post('/', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        // Only SUPER_ADMIN can create printhouses
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Only Super Admins can create printhouses' });
        }
        const created = await printhouseCapabilityService.createPrinthouse(req.body, actor);
        return res.status(201).json({ ok: true, printhouse: created });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating printhouse:', err);
        return res.status(400).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities - List Printhouses
router.get('/', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const filters = {};
        // Scoping by tenant unless super admin
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN') {
            filters.tenantId = tenantId;
        } else if (req.query.tenantId) {
            filters.tenantId = req.query.tenantId;
        }
        if (req.query.status) {
            filters.status = req.query.status;
        }
        const list = await printhouseCapabilityService.listPrinthouses(filters);
        return res.json({ ok: true, printhouses: list });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing printhouses:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId - Get Printhouse
router.get('/:printhouseId', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        // Tenant isolation
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }
        return res.json({ ok: true, printhouse });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error getting printhouse:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId - Update Printhouse
router.put('/:printhouseId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const updated = await printhouseCapabilityService.updatePrinthouse(printhouseId, req.body, actor);
        return res.json({ ok: true, printhouse: updated });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating printhouse:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// MACHINES CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities/:printhouseId/machines - Create Machine
router.post('/:printhouseId/machines', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const machine = await printhouseCapabilityService.createMachine(printhouseId, req.body, actor);
        return res.status(201).json({ ok: true, machine });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating machine:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/machines - List Machines
router.get('/:printhouseId/machines', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const machines = await printhouseCapabilityService.listMachines(printhouseId);
        return res.json({ ok: true, machines });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing machines:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId/machines/:machineId - Update Machine (with strict isolation)
router.put('/:printhouseId/machines/:machineId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId, machineId } = req.params;

        const machineBefore = await printhouseCapabilityService.getMachine(machineId);
        if (!machineBefore) {
            return res.status(404).json({ ok: false, error: 'MACHINE_NOT_FOUND' });
        }
        // Strict isolation: verify machine matches printhouseId in path
        if (machineBefore.printhouse_id !== printhouseId) {
            return res.status(400).json({ ok: false, error: 'INVALID_PRINTHOUSE_MACHINE_ASSOCIATION', message: 'Machine does not belong to specified Printhouse' });
        }

        const machine = await printhouseCapabilityService.updateMachine(machineId, req.body, actor);
        return res.json({ ok: true, machine });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating machine:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// MEDIA CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities/:printhouseId/media - Create Media
router.post('/:printhouseId/media', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const media = await printhouseCapabilityService.createMedia(printhouseId, req.body, actor);
        return res.status(201).json({ ok: true, media });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating media:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/media - List Media
router.get('/:printhouseId/media', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const media = await printhouseCapabilityService.listMedia(printhouseId);
        return res.json({ ok: true, media });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing media:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId/media/:mediaId - Update Media
router.put('/:printhouseId/media/:mediaId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId, mediaId } = req.params;

        const mediaBefore = await printhouseCapabilityService.getMedia(mediaId);
        if (!mediaBefore) {
            return res.status(404).json({ ok: false, error: 'MEDIA_NOT_FOUND' });
        }
        if (mediaBefore.printhouse_id !== printhouseId) {
            return res.status(400).json({ ok: false, error: 'INVALID_PRINTHOUSE_MEDIA_ASSOCIATION' });
        }

        const media = await printhouseCapabilityService.updateMedia(mediaId, req.body, actor);
        return res.json({ ok: true, media });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating media:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// POLICY PROFILES CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities/:printhouseId/policy-profiles - Create Policy Profile
router.post('/:printhouseId/policy-profiles', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const profile = await printhouseCapabilityService.createPolicyProfile(printhouseId, req.body, actor);
        return res.status(201).json({ ok: true, profile });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating policy profile:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/policy-profiles - List Policy Profiles
router.get('/:printhouseId/policy-profiles', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const profiles = await printhouseCapabilityService.listPolicyProfiles(printhouseId);
        return res.json({ ok: true, profiles });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing policy profiles:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId/policy-profiles/:profileId - Update Policy Profile
router.put('/:printhouseId/policy-profiles/:profileId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId, profileId } = req.params;

        const profileBefore = await printhouseCapabilityService.getPolicyProfile(profileId);
        if (!profileBefore) {
            return res.status(404).json({ ok: false, error: 'POLICY_PROFILE_NOT_FOUND' });
        }
        if (profileBefore.printhouse_id !== printhouseId) {
            return res.status(400).json({ ok: false, error: 'INVALID_PRINTHOUSE_POLICY_PROFILE_ASSOCIATION' });
        }

        const profile = await printhouseCapabilityService.updatePolicyProfile(profileId, req.body, actor);
        return res.json({ ok: true, profile });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating policy profile:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// SLA PROFILES CRUD
// ----------------------------------------------------------------------

// POST /api/admin/printhouse-capabilities/:printhouseId/sla-profiles - Create SLA Profile
router.post('/:printhouseId/sla-profiles', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId } = req.params;
        const profile = await printhouseCapabilityService.createSlaProfile(printhouseId, req.body, actor);
        return res.status(201).json({ ok: true, profile });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error creating SLA profile:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/sla-profiles - List SLA Profiles
router.get('/:printhouseId/sla-profiles', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const profiles = await printhouseCapabilityService.listSlaProfiles(printhouseId);
        return res.json({ ok: true, profiles });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing SLA profiles:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// PUT /api/admin/printhouse-capabilities/:printhouseId/sla-profiles/:profileId - Update SLA Profile
router.put('/:printhouseId/sla-profiles/:profileId', async (req, res) => {
    try {
        const { actor } = getActorAndTenant(req);
        const { printhouseId, profileId } = req.params;

        const profileBefore = await printhouseCapabilityService.getSlaProfile(profileId);
        if (!profileBefore) {
            return res.status(404).json({ ok: false, error: 'SLA_PROFILE_NOT_FOUND' });
        }
        if (profileBefore.printhouse_id !== printhouseId) {
            return res.status(400).json({ ok: false, error: 'INVALID_PRINTHOUSE_SLA_PROFILE_ASSOCIATION' });
        }

        const profile = await printhouseCapabilityService.updateSlaProfile(profileId, req.body, actor);
        return res.json({ ok: true, profile });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error updating SLA profile:', err);
        const status = err.message === 'UNAUTHORIZED_TENANT_ACCESS' ? 403 : 400;
        return res.status(status).json({ ok: false, error: err.message });
    }
});

// ----------------------------------------------------------------------
// READINESS & AUDIT
// ----------------------------------------------------------------------

// GET /api/admin/printhouse-capabilities/:printhouseId/readiness - Evaluate readiness status
router.get('/:printhouseId/readiness', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const readiness = await printhouseCapabilityService.evaluatePrinthouseOnboardingReadiness(printhouseId);
        return res.json({ ok: true, readiness });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error evaluating readiness:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// GET /api/admin/printhouse-capabilities/:printhouseId/audit - Retrieve audit logs
router.get('/:printhouseId/audit', async (req, res) => {
    try {
        const { actor, tenantId } = getActorAndTenant(req);
        const { printhouseId } = req.params;

        const printhouse = await printhouseCapabilityService.getPrinthouse(printhouseId);
        if (!printhouse) {
            return res.status(404).json({ ok: false, error: 'PRINTHOUSE_NOT_FOUND' });
        }
        if (!actor.isSuperAdmin && actor.role !== 'SUPER_ADMIN' && printhouse.tenant_id !== tenantId) {
            return res.status(403).json({ ok: false, error: 'UNAUTHORIZED_TENANT_ACCESS' });
        }

        const rows = await require('../services/mysqlClient').query(`
            SELECT * FROM printhouse_capability_audit 
            WHERE printhouse_id = ? AND tenant_id = ?
            ORDER BY created_at DESC 
            LIMIT 100
        `, [printhouseId, printhouse.tenant_id]);

        return res.json({ ok: true, audit: rows });
    } catch (err) {
        console.error('[PRINTHOUSE_CAPABILITIES] Error listing audit logs:', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
