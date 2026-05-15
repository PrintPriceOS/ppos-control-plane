/**
 * src/api/routes/marketplacePublic.js
 * 
 * Public/Semi-public operational endpoints for the Marketplace.
 * Used by Budget App and authorized third-party integrations.
 */
const express = require('express');
const router = express.Router();
const marketplaceService = require('../services/marketplaceService');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/marketplace/offers
 * Standard contract for requesting marketplace offers.
 */
router.post('/offers', async (req, res) => {
    const traceId = req.headers['x-trace-id'] || `trace_${uuidv4()}`;
    const startTime = Date.now();

    console.log(`[MARKETPLACE_PUBLIC][REQUEST] Received offer request`, { traceId, body: req.body });

    try {
        const payload = req.body;
        
        // 1. Basic validation
        if (!payload.copies || !payload.interior_pages) {
            console.warn(`[MARKETPLACE_PUBLIC][FAILED] Missing required parameters`, { traceId });
            return res.status(400).json({
                success: false,
                message: "Missing required parameters: copies and interior_pages are mandatory.",
                error_code: "INVALID_PAYLOAD"
            });
        }

        // 2. Delegate orchestration to MarketplaceService
        // This will handle BPE call, persistence, and event logging
        const sessionResult = await marketplaceService.createMarketplaceSessionFromOrder({
            ...payload,
            specs: payload // Budget sends flat payload, service expects specs object or flat
        }, {
            traceId,
            source: 'BUDGET_APP_MARKETPLACE'
        });

        // 3. Retrieve the full session detail to return the mapped offers
        const detailResult = await marketplaceService.getSessionDetail(sessionResult.id);

        if (!detailResult || !detailResult.ok) {
            const duration = Date.now() - startTime;
            console.error(`[MARKETPLACE_PUBLIC][FAILED] Session detail retrieval failed`, { traceId, duration });
            return res.status(500).json({
                success: false,
                message: "Failed to retrieve generated offers.",
                error_code: "SESSION_RETRIVAL_ERROR"
            });
        }

        const session = detailResult.session;

        // 4. Handle BPE failure states (no offers or BPE down)
        if (session.sessionStatus === 'FAILED') {
            const duration = Date.now() - startTime;
            console.error(`[MARKETPLACE_PUBLIC][BPE_PRIMARY_FAILED] Pricing engine could not generate offers`, { traceId, duration });
            return res.status(200).json({ // Still 200 but success false as per requirements
                success: false,
                offers: [],
                message: session.error?.message || "Pricing Engine unavailable.",
                error_code: session.error?.code || "BPE_UNAVAILABLE"
            });
        }

        // 5. Map internal session offers to the stable public contract
        const offers = (session.offers || []).map(off => ({
            id: off.id,
            offer_id: off.offerId || off.id,
            house_id: off.houseId || off.printerId,
            printer_id: off.printerId,
            print_house_id: off.houseId || off.printerId,
            print_house: off.printerName,
            total_cost: off.productionCost,
            total_price: off.suggestedPrice,
            currency: off.currency || 'EUR',
            margin: off.estimatedMargin,
            margin_percent: off.marginPct,
            estimated_delivery_time: off.deliveryTime,
            lead_time_days: off.leadTimeDays,
            breakdown: (off.rawEstimate?.lines || []).map(l => ({ label: l.label, amount: l.amount })),
            recommended: off.offerSelected,
            checkout_allowed: true,
            source: "BPE_MARKETPLACE_NATIVE",
            raw_offer: off.rawEstimate
        }));

        const duration = Date.now() - startTime;
        console.log(`[MARKETPLACE_PUBLIC][RESPONSE] Successfully generated ${offers.length} offers`, { traceId, duration });

        return res.json({
            success: true,
            offers,
            recommended_offer_id: session.selectedOfferId,
            raw_recommended_offer_id: offers.find(o => o.id === session.selectedOfferId)?.house_id || null,
            trace_id: traceId
        });

    } catch (err) {
        const duration = Date.now() - startTime;
        console.error(`[MARKETPLACE_PUBLIC][FAILED] Fatal error: ${err.message}`, { traceId, duration, stack: err.stack });
        return res.status(500).json({
            success: false,
            message: "Internal server error during offer generation.",
            error_code: "INTERNAL_ERROR",
            trace_id: traceId
        });
    }
});

module.exports = router;
