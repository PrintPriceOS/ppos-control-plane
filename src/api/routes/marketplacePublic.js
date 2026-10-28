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

/**
 * GET /api/marketplace/orders/:orderId/customer-action/:token
 * Public endpoint — validates the token hash + expiry, returns the customer action payload.
 * Phase 36.7 — Customer Notification + Reupload UI Handoff.
 *
 * No admin auth required: the token IS the auth.
 * If valid, also marks the action as VIEWED (first access).
 */
router.get('/orders/:orderId/customer-action/:token', async (req, res) => {
    const traceId = req.headers['x-trace-id'] || `trace_${uuidv4()}`;

    try {
        const { orderId, token } = req.params;
        console.log(`[MARKETPLACE_PUBLIC][CUSTOMER_ACTION_VALIDATE]`, { orderId, traceId });

        const customerActionService = require('../services/marketplaceCustomerActionService');

        // 1. Validate the token
        const validation = await customerActionService.validateCustomerToken(orderId, token);

        if (!validation.ok) {
            const statusCode = validation.error === 'ORDER_NOT_FOUND' ? 404
                : validation.error === 'TOKEN_EXPIRED' ? 410
                : 403;
            return res.status(statusCode).json({
                success: false,
                error: validation.error,
                message: validation.error === 'INVALID_TOKEN' ? 'Access denied: invalid or expired token.'
                    : validation.error === 'TOKEN_EXPIRED' ? 'This correction link has expired. Please request a new one.'
                    : 'Unable to process request.',
                expiredAt: validation.expiredAt || null
            });
        }

        // 2. Mark as viewed (idempotent — only updates if not already viewed)
        try {
            await customerActionService.markCustomerActionViewed(orderId, token);
        } catch (viewErr) {
            // Non-fatal: the customer still gets their action payload
            console.warn('[MARKETPLACE_PUBLIC][CUSTOMER_ACTION_VIEW_MARK_FAILED]', viewErr.message);
        }

        // 3. Return the action payload
        return res.json({
            success: true,
            orderId,
            action: validation.action,
            currentFiles: validation.currentFiles,
            trace_id: traceId
        });
    } catch (err) {
        console.error(`[MARKETPLACE_PUBLIC][CUSTOMER_ACTION_FAILED] ${err.message}`, { traceId, stack: err.stack });
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error_code: 'INTERNAL_ERROR',
            trace_id: traceId
        });
    }
});

const paperProcurementService = require('../services/paperProcurementService');
const { resolveVariantCaliperProvenance } = require('../services/spine/paperCaliperReconciliationService');

const CANONICAL_PAPER_CATEGORIES = [
    'OFFSET',
    'COATED',
    'CARTON',
    'DESIGN',
    'DIGITAL',
    'OTHER'
];

/**
 * GET /api/marketplace/paper-catalog
 * Public commercial paper catalog for Budget and Marketplace clients.
 * Sanitized: wholesale prices, internal supplier margins, and credentials are strictly excluded.
 */
router.get('/paper-catalog', async (req, res) => {
    const traceId = req.headers['x-trace-id'] || `trace_${uuidv4()}`;
    const startTime = Date.now();

    try {
        // Server-defined authoritative tenant scope for public catalog.
        // Client-supplied tenant_id query param and x-tenant-id header are strictly ignored to prevent tenant spoofing.
        const PUBLIC_CATALOG_TENANT_ID = process.env.PUBLIC_MARKETPLACE_TENANT_ID || 'ppos-production';

        // Sanitize query to prevent tenant injection or private parameter pollution
        const queryParams = { ...req.query };
        delete queryParams.tenant_id;
        delete queryParams.tenantId;

        const result = await paperProcurementService.searchMasterPaperDatabase(PUBLIC_CATALOG_TENANT_ID, queryParams);

        // Strip out supplier pricing, cost basis and internal wholesale attributes
        const sanitizedItems = (result.items || []).map(item => {
            const caliperProv = resolveVariantCaliperProvenance(item);
            return {
                variantId: item.variantId,
                productId: item.productId,
                productName: item.productName,
                brand: item.brand || null,
                manufacturer: item.manufacturer || null,
                category: item.category || 'OTHER',
                paperType: item.paperType || item.category || 'OTHER',
                coatingStatus: item.coatingStatus || 'UNKNOWN',
                coatingConfidence: item.coatingConfidence || null,
                finishSummary: item.finishSummary || item.finish || null,
                gsm: item.gsm,
                widthMm: item.widthMm,
                heightMm: item.heightMm,
                sheetFormat: item.sheetFormat || `${item.widthMm}x${item.heightMm} mm`,
                caliperUm: caliperProv.caliperUm,
                caliperMm: caliperProv.caliperMm,
                bulkFactor: caliperProv.bulkFactor,
                caliperSource: caliperProv.caliperSource,
                caliperConfidenceStatus: caliperProv.caliperConfidenceStatus,
                caliperRevision: caliperProv.caliperRevision,
                finish: item.finish || null,
                grainDirection: item.grainDirection || 'UNKNOWN',
                originalCode: item.originalCode || null,
                isReel: item.isReel === true,
                // Do NOT assume available if offerStatus is missing. Stock availability is strictly subject to printhouse confirmation.
                isAvailable: item.offerStatus === 'ACTIVE',
                stockConfirmationRequired: true,
                availabilityStatus: item.offerStatus === 'ACTIVE' ? 'ACTIVE' : 'PENDING_PRINTHOUSE_CONFIRMATION'
            };
        });

        const duration = Date.now() - startTime;
        console.log(`[MARKETPLACE_PUBLIC][PAPER_CATALOG] Returned ${sanitizedItems.length} items (${duration}ms)`, { traceId });

        return res.json({
            ok: true,
            success: true,
            data: {
                categories: CANONICAL_PAPER_CATEGORIES,
                total: result.total,
                limit: result.limit,
                offset: result.offset,
                items: sanitizedItems
            },
            trace_id: traceId
        });
    } catch (err) {
        const duration = Date.now() - startTime;
        console.error(`[MARKETPLACE_PUBLIC][PAPER_CATALOG_ERROR] ${err.message}`, { traceId, duration });
        return res.status(500).json({
            ok: false,
            success: false,
            error: {
                code: 'CATALOG_UNAVAILABLE',
                message: 'Paper catalog service is temporarily unavailable.'
            },
            trace_id: traceId
        });
    }
});

module.exports = router;
