'use strict';

/**
 * src/api/routes/printhouseMachinesRoutes.js
 *
 * Phase 191D.1 — Canonical Machine & Capability Onboarding Routes
 *
 * Mounted at: /api/printhouse/onboarding
 * 
 * Machine CRUD:     /sites/:siteId/machines
 * Capabilities:     /sites/:siteId/capabilities
 * Templates:        /machines/templates
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const printhouseMachineService = require('../services/printhouseMachineService');
const capabilityService = require('../services/printhouseCapabilityOnboardingService');

const db = require('../services/mysqlClient');

// Middleware to extract tenant context from auth token
const requireAuth = async (req, res, next) => {
    // If request.user was populated by Fastify JWT middleware
    if (req.user) {
        // Enforce role restriction
        const allowedRoles = ['PRINTHOUSE_ADMIN', 'SUPER_ADMIN'];
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN: Invalid role' });
        }

        // Check tenant status in DB
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
        // Fallback for mock environment if no JWT is passed
        req.user = {
            id: 'mock-user-1',
            tenantId: req.headers['x-tenant-id'] || 'mock-tenant-1',
            role: 'PRINTHOUSE_ADMIN'
        };
    }
    next();
};

// ──── Machine Templates ────────────────────────────────────────────────────────

/**
 * GET /api/printhouse/onboarding/machines/templates
 * Return available machine templates for quick setup
 */
router.get('/machines/templates', requireAuth, (req, res) => {
    try {
        const templates = printhouseMachineService.getTemplates();
        res.json({ ok: true, templates });
    } catch (err) {
        console.error('[Machines Templates GET]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * GET /api/printhouse/onboarding/capabilities/types
 * Return all known capability type definitions
 */
router.get('/capabilities/types', requireAuth, (req, res) => {
    try {
        const types = capabilityService.getCapabilityTypes();
        res.json({ ok: true, types });
    } catch (err) {
        console.error('[Capability Types GET]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

// ──── Machine CRUD ─────────────────────────────────────────────────────────────

/**
 * GET /api/printhouse/onboarding/sites/:siteId/machines
 * List all machines for a specific production site
 */
router.get('/sites/:siteId/machines', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const tenantId = req.user.tenantId;

        const machines = await printhouseMachineService.listMachines(tenantId, siteId);
        res.json({ ok: true, machines });
    } catch (err) {
        if (err.message === 'SITE_NOT_FOUND' || err.message === 'UNAUTHORIZED_TENANT_ACCESS') {
            return res.status(403).json({ error: err.message });
        }
        console.error('[Machines GET List]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * POST /api/printhouse/onboarding/sites/:siteId/machines
 * Create a new machine at a site (optional: use template_id)
 */
router.post('/sites/:siteId/machines', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const tenantId = req.user.tenantId;
        const payload = req.body;

        const machine = await printhouseMachineService.createMachine(tenantId, siteId, payload, {
            userId: req.user.id,
            tenantId,
            role: req.user.role
        });

        res.status(201).json({ ok: true, machine });
    } catch (err) {
        if (err.message === 'FIELD_NOT_EDITABLE') {
            return res.status(400).json({ error: 'FIELD_NOT_EDITABLE', fields: err.fields });
        }
        if (err.message.startsWith('INVALID_')) {
            return res.status(400).json({ error: err.message });
        }
        if (err.message === 'SITE_NOT_FOUND' || err.message === 'UNAUTHORIZED_TENANT_ACCESS') {
            return res.status(403).json({ error: err.message });
        }
        console.error('[Machines POST Create]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * GET /api/printhouse/onboarding/sites/:siteId/machines/:machineId
 * Get a specific machine by ID
 */
router.get('/sites/:siteId/machines/:machineId', requireAuth, async (req, res) => {
    try {
        const { siteId, machineId } = req.params;
        const tenantId = req.user.tenantId;

        const machine = await printhouseMachineService.getMachine(tenantId, siteId, machineId);
        if (!machine) {
            return res.status(404).json({ error: 'MACHINE_NOT_FOUND' });
        }

        res.json({ ok: true, machine });
    } catch (err) {
        console.error('[Machines GET]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * PUT /api/printhouse/onboarding/sites/:siteId/machines/:machineId
 * Update a specific machine. Protected fields are stripped.
 */
router.put('/sites/:siteId/machines/:machineId', requireAuth, async (req, res) => {
    try {
        const { siteId, machineId } = req.params;
        const tenantId = req.user.tenantId;
        const payload = req.body;

        const machine = await printhouseMachineService.updateMachine(tenantId, siteId, machineId, payload, {
            userId: req.user.id,
            tenantId,
            role: req.user.role
        });

        res.json({ ok: true, machine });
    } catch (err) {
        if (err.message === 'FIELD_NOT_EDITABLE') {
            return res.status(400).json({ error: 'FIELD_NOT_EDITABLE', fields: err.fields });
        }
        if (err.message === 'MACHINE_NOT_FOUND') {
            return res.status(404).json({ error: err.message });
        }
        if (err.message.startsWith('INVALID_')) {
            return res.status(400).json({ error: err.message });
        }
        console.error('[Machines PUT Update]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * DELETE /api/printhouse/onboarding/sites/:siteId/machines/:machineId
 * Archive a machine (soft delete)
 */
router.delete('/sites/:siteId/machines/:machineId', requireAuth, async (req, res) => {
    try {
        const { siteId, machineId } = req.params;
        const tenantId = req.user.tenantId;

        await printhouseMachineService.archiveMachine(tenantId, siteId, machineId, {
            userId: req.user.id,
            tenantId,
            role: req.user.role
        });

        res.json({ ok: true, status: 'ARCHIVED' });
    } catch (err) {
        if (err.message === 'MACHINE_NOT_FOUND') {
            return res.status(404).json({ error: err.message });
        }
        console.error('[Machines DELETE Archive]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

// ──── Site Capabilities ────────────────────────────────────────────────────────

/**
 * GET /api/printhouse/onboarding/sites/:siteId/capabilities
 * Compute and return the derived capability profile for a site
 */
router.get('/sites/:siteId/capabilities', requireAuth, async (req, res) => {
    try {
        const { siteId } = req.params;
        const tenantId = req.user.tenantId;

        const profile = await capabilityService.computeSiteCapabilities(tenantId, siteId);
        res.json({ ok: true, ...profile });
    } catch (err) {
        console.error('[Capabilities GET Site]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * GET /api/printhouse/onboarding/capabilities/summary
 * Compute and return the aggregated capability profile across all tenant sites
 */
router.get('/capabilities/summary', requireAuth, async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const profile = await capabilityService.computeTenantCapabilities(tenantId);
        res.json({ ok: true, ...profile });
    } catch (err) {
        console.error('[Capabilities GET Tenant Summary]', err);
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

module.exports = router;
