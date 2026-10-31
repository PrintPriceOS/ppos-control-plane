const express = require('express');
const router = express.Router();
const db = require('../services/db');
const quoteService = require('../services/quoteService');
const crypto = require('crypto');
const logger = require('../services/logger').child('pricing-admin');

const { resolveActorContext, requireApprovedPrinthouse } = require('../middleware/auth');
const mysql = require('../services/mysqlClient');

/**
 * GET /api/admin/pricing/readiness-audit
 * Global Economic Production Readiness Auditor (Super Admin only).
 */
router.get('/readiness-audit', async (req, res) => {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ ok: false, error: 'Forbidden: Super Admin only' });
    }
    try {
        const pricingReadinessService = require('../services/pricingReadinessService');
        const results = await pricingReadinessService.evaluateGlobalReadiness();
        res.json({ ok: true, data: results });
    } catch (err) {
        logger.error({ event: 'global_pricing_readiness_audit_failed', error: err.message });
        res.status(500).json({ ok: false, error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * GET /api/admin/pricing/my-readiness
 * Scoped Economic Production Readiness Auditor (Printhouse only).
 */
router.get('/my-readiness', requireApprovedPrinthouse, async (req, res) => {
    try {
        const actor = req.user;
        const pricingReadinessService = require('../services/pricingReadinessService');

        if (!actor || !actor.printhouseId) {
            return res.status(403).json({ ok: false, error: 'MUST_BE_PRINTHOUSE' });
        }

        const results = await pricingReadinessService.evaluateOwnReadiness(actor);
        res.json({ ok: true, data: results });
    } catch (err) {
        logger.error({ event: 'scoped_pricing_readiness_audit_failed', error: err.message });
        res.status(500).json({ ok: false, error: 'INTERNAL_SERVER_ERROR' });
    }
});

/**
 * GET /api/admin/pricing/profiles
 * List all pricing profiles (scoped).
 */
router.get('/profiles', requireApprovedPrinthouse, async (req, res) => {
    const context = resolveActorContext(req);
    try {
        let sql = `
            SELECT ppp.*, p.name as printer_name, pm.nickname as machine_nickname
            FROM printer_pricing_profiles ppp
            JOIN printer_nodes p ON ppp.printer_id = p.id
            LEFT JOIN printer_machines pm ON ppp.machine_id = pm.id
            WHERE 1=1
        `;
        const params = [];

        if (!context.isSuperAdmin) {
            sql += ' AND p.tenant_id = ?';
            params.push(context.tenantId);
        }

        sql += ' ORDER BY ppp.created_at DESC';

        const rows = await mysql.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/pricing/profiles
 * Create a new pricing profile.
 */
router.post('/profiles', requireApprovedPrinthouse, async (req, res) => {
    const context = resolveActorContext(req);
    const id = crypto.randomUUID();
    const {
        printer_id, machine_id, pricing_scope, currency,
        target_margin_pct, platform_markup_pct, dynamic_routing_premium,
        rush_multiplier, lead_time_discount_multiplier,
        minimum_job_fee
    } = req.body;

    // Security: Ensure printer_id belongs to the actor's tenant (if not super admin)
    if (!context.isSuperAdmin) {
        if (printer_id !== context.printhouseId) {
            return res.status(403).json({ ok: false, error: 'Cannot create profile for another Printhouse' });
        }
    }

    try {
        await mysql.query(`
            INSERT INTO printer_pricing_profiles (
                id, printer_id, machine_id, pricing_scope, currency,
                target_margin_pct, platform_markup_pct, dynamic_routing_premium,
                rush_multiplier, lead_time_discount_multiplier,
                minimum_job_fee
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, printer_id, machine_id, pricing_scope, currency || 'EUR',
            target_margin_pct, platform_markup_pct, dynamic_routing_premium,
            rush_multiplier, lead_time_discount_multiplier,
            minimum_job_fee
        ]);
        res.status(201).json({ id, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/pricing/jobs/:jobId/quotes
 * Get quotes for a specific job.
 */
router.get('/jobs/:jobId/quotes', async (req, res) => {
    try {
        const quotes = await quoteService.getQuotesForJob(req.params.jobId);
        res.json(quotes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/admin/pricing/profiles/:id
 * Update a pricing profile.
 */
router.put('/profiles/:id', requireApprovedPrinthouse, async (req, res) => {
    const context = resolveActorContext(req);
    const { id } = req.params;
    const updates = req.body;

    try {
        const [existing] = await mysql.query('SELECT printer_id FROM printer_pricing_profiles WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Profile not found' });

        if (!context.isSuperAdmin && existing.printer_id !== context.printhouseId) {
            return res.status(403).json({ error: 'Unauthorized to update this profile' });
        }

        const fields = [];
        const params = [];
        const allowed = [
            'pricing_scope', 'currency', 'target_margin_pct', 'platform_markup_pct',
            'dynamic_routing_premium', 'rush_multiplier', 'lead_time_discount_multiplier',
            'minimum_job_fee', 'active'
        ];

        for (const key of allowed) {
            if (updates[key] !== undefined) {
                fields.push(`${key} = ?`);
                params.push(updates[key]);
            }
        }

        if (fields.length === 0) return res.json({ ok: true, message: 'No changes' });

        params.push(id);
        await mysql.query(`UPDATE printer_pricing_profiles SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ ok: true, message: 'Profile updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/admin/pricing/profiles/:id
 * Delete a pricing profile.
 */
router.delete('/profiles/:id', requireApprovedPrinthouse, async (req, res) => {
    const context = resolveActorContext(req);
    const { id } = req.params;

    try {
        const [existing] = await mysql.query('SELECT printer_id FROM printer_pricing_profiles WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Profile not found' });

        if (!context.isSuperAdmin && existing.printer_id !== context.printhouseId) {
            return res.status(403).json({ error: 'Unauthorized to delete this profile' });
        }

        await mysql.query('DELETE FROM printer_pricing_profiles WHERE id = ?', [id]);
        res.json({ ok: true, message: 'Profile deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;