/**
 * src/api/routes/printhouseQuoteEligibilityRoutes.js
 * 
 * Phase 192B: Live Quote Eligibility & Calculation API Endpoints.
 * Mounted at /api/marketplace/quotes
 * 
 * Includes:
 *   POST /eligibility - Evaluate live quote eligibility for a Printhouse tenant
 *   POST /calculate   - Calculate governed live quote for eligible nodes
 */
const express = require('express');
const router = express.Router();
const liveQuoteService = require('../services/liveQuoteEligibilityService');

function getTenantId(req) {
    return req.body?.tenantId || req.query?.tenantId || req.user?.tenantId || req.headers['x-tenant-id'] || 'ph-tenant-default';
}

// POST /api/marketplace/quotes/eligibility
router.post('/eligibility', async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const siteId = req.body?.siteId || null;

        const result = await liveQuoteService.evaluateEligibility(tenantId, siteId);
        res.json({
            success: true,
            eligibility: result
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message
        });
    }
});

// POST /api/marketplace/quotes/calculate
router.post('/calculate', async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const quoteResult = await liveQuoteService.calculateLiveQuote(tenantId, req.body || {});
        res.json({
            success: true,
            quote: quoteResult
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.message,
            code: err.code || 'QUOTE_CALCULATION_FAILED',
            details: err.details || null
        });
    }
});

module.exports = router;
