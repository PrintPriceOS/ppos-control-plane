'use strict';
/**
 * POST /api/billing/printhouse/create-checkout-session
 * Tenant is derived from the authenticated actor only (never from the body).
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const { resolveActorContext } = require('../middleware/auth');
const licenseService = require('../services/printhouseLicenseService');

router.post('/create-checkout-session', async (req, res) => {
    try {
        const actor = resolveActorContext(req);
        const tenantId = actor?.tenantId;
        const allowed = ['SUPER_ADMIN', 'TENANT_ADMIN', 'PRINTHOUSE_ADMIN'].includes(actor?.role);
        if (!tenantId || !allowed) {
            return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
        }
        const returnUrl = req.body?.returnUrl;
        const session = await licenseService.createCheckoutSession({ tenantId, returnUrl });
        return res.status(200).json({ ok: true, ...session });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
});

/** GET /locked-orders — blocked portfolio (sum of amount_eur) for the actor's tenant only. */
router.get('/locked-orders', async (req, res) => {
    try {
        const actor = resolveActorContext(req);
        if (!actor?.tenantId) return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
        const summary = await licenseService.getLockedSummary(actor.tenantId);
        return res.status(200).json({ ok: true, ...summary });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
