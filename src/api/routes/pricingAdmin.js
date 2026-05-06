const express = require('express');
const router = express.Router();
const db = require('../services/db');
const quoteService = require('../services/quoteService');
const crypto = require('crypto');

const { resolveActorContext, requireApprovedPrinthouse } = require('../middleware/auth');
const mysql = require('../services/mysqlClient');

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
        base_cost_per_sheet, setup_cost, color_multiplier,
        tac_penalty_multiplier, bleed_handling_cost,
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
                base_cost_per_sheet, setup_cost, color_multiplier,
                tac_penalty_multiplier, bleed_handling_cost,
                rush_multiplier, lead_time_discount_multiplier,
                minimum_job_fee
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, printer_id, machine_id, pricing_scope, currency || 'EUR',
            base_cost_per_sheet, setup_cost, color_multiplier,
            tac_penalty_multiplier, bleed_handling_cost,
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

module.exports = router;
