/**
 * src/api/routes/adminMarketplacePrinthouseHandoff.js
 * 
 * Phase 38.1 — Global routes for Printhouse Handoff Consumption API.
 */
const express = require('express');
const router = express.Router();

/**
 * GET /api/admin/marketplace/printhouse-handoff/packages
 * Returns an aggregated list of handoff packages for printhouse consumption.
 */
router.get('/packages', async (req, res) => {
    try {
        console.log('[PRINTHOUSE_HANDOFF_PACKAGES_LIST_REQUEST]', req.query);
        const { resolveActorContext } = require('../middleware/auth');
        const context = resolveActorContext(req);
        
        let targetPrinthouseId = req.query.printhouseId;
        if (context.isPrinthouseUser) {
            targetPrinthouseId = context.printhouseId;
        }

        const handoffService = require('../services/marketplacePrinthouseHandoffService');
        const filters = {
            status: req.query.status,
            printhouseId: targetPrinthouseId
        };
        const result = await handoffService.listPrinthouseHandoffPackages(filters);
        return res.json(result);
    } catch (err) {
        console.error('[ADMIN-MARKETPLACE-PRINTHOUSE-HANDOFF] Failed to list packages:', err);
        return res.status(500).json({ ok: false, error: 'PRINTHOUSE_HANDOFF_LIST_ERROR', message: err.message });
    }
});

module.exports = router;
