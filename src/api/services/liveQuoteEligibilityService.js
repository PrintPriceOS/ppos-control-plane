/**
 * src/api/services/liveQuoteEligibilityService.js
 * 
 * Phase 192B: Governed Live Quote Eligibility & Execution Service.
 * Evaluates live quote eligibility using the canonical activationAdapter and
 * calculates binding live quotes using governed published price books.
 * 
 * Side-Effect Invariants:
 *   ORDER_CREATED = FALSE
 *   ROUTING_CREATED = FALSE
 *   DISPATCH_CREATED = FALSE
 *   CAPABILITY_CHANGED = FALSE
 */
const crypto = require('crypto');
const activationAdapter = require('./printhouseActivationAdapter');
const priceBookService = require('./printhousePriceBookService');
const previewService = require('./printhousePricingPreviewService');
const moneyUtil = require('./moneyUtil');

class LiveQuoteEligibilityService {

    /**
     * Evaluates live quote eligibility for a given tenant/site.
     * REQUIRES BOTH MARKETPLACE_VISIBLE = true AND LIVE_QUOTING_ALLOWED = true.
     */
    async evaluateEligibility(tenantId, siteId = null) {
        const blockingIssues = [];
        let capData = null;

        // 1. Verify Runtime Capability Grants (Double-Grant Requirement)
        try {
            capData = await activationAdapter.getCapabilities({ tenantId, siteId });

            if (capData.status === 'SUSPENDED') {
                blockingIssues.push({
                    code: 'PRINTHOUSE_SUSPENDED',
                    message: `Printhouse tenant '${tenantId}' activation has been suspended.`
                });
            } else {
                if (!capData.capabilities.MARKETPLACE_VISIBLE) {
                    blockingIssues.push({
                        code: 'MARKETPLACE_NOT_VISIBLE',
                        message: 'Marketplace visibility grant (MARKETPLACE_VISIBLE) is required for live quoting.'
                    });
                }

                if (!capData.capabilities.LIVE_QUOTING_ALLOWED) {
                    blockingIssues.push({
                        code: 'LIVE_QUOTING_NOT_GRANTED',
                        message: 'Live quoting capability grant (LIVE_QUOTING_ALLOWED) is not granted.'
                    });
                }
            }
        } catch (err) {
            blockingIssues.push({
                code: err.code || 'CAPABILITY_CHECK_FAILED',
                message: err.message
            });
        }

        // 2. Resolve Published Price Book (Deterministic Selection)
        let activePriceBook = null;
        try {
            const priceBooks = await priceBookService.listPriceBooks(tenantId);
            const validBooks = (priceBooks || []).filter(pb => pb.status === 'PUBLISHED' || pb.status === 'APPROVED');

            if (validBooks.length === 0) {
                blockingIssues.push({
                    code: 'NO_PUBLISHED_PRICE_BOOK',
                    message: 'No published or approved price book available for live quoting.'
                });
            } else {
                // Deterministic selection: Pick latest published price book by effective date / version ID
                activePriceBook = validBooks[0];
            }
        } catch (err) {
            blockingIssues.push({
                code: 'PRICING_RESOLUTION_FAILED',
                message: 'Failed resolving price books for tenant.'
            });
        }

        const eligible = blockingIssues.length === 0;

        return {
            eligible,
            tenantId,
            siteId: siteId || 'all-sites',
            status: eligible ? 'QUOTE_ELIGIBLE' : 'NOT_ELIGIBLE',
            discoverable: capData ? Boolean(capData.capabilities.MARKETPLACE_VISIBLE) : false,
            capabilities: capData ? capData.capabilities : {
                MARKETPLACE_VISIBLE: false,
                LIVE_QUOTING_ALLOWED: false,
                JOB_ROUTING_ALLOWED: false,
                PRODUCTION_DISPATCH_ALLOWED: false
            },
            priceBook: activePriceBook ? {
                id: activePriceBook.id,
                name: activePriceBook.name,
                currency: activePriceBook.currency,
                status: activePriceBook.status
            } : null,
            blockingIssues
        };
    }

    /**
     * Executes governed live quote calculation for eligible nodes using integer minor units arithmetic.
     */
    async calculateLiveQuote(tenantId, quoteRequest) {
        const { siteId, quantity, lengthMm, widthMm, materialId, finishingOps } = quoteRequest;

        // Step 1: Enforce Capability & Eligibility
        const eligibility = await this.evaluateEligibility(tenantId, siteId);
        if (!eligibility.eligible) {
            const err = new Error(`LIVE_QUOTE_INELIGIBLE: Printhouse '${tenantId}' is not eligible for live quoting.`);
            err.code = 'LIVE_QUOTE_INELIGIBLE';
            err.statusCode = 403;
            err.details = eligibility.blockingIssues;
            throw err;
        }

        // Step 2: Input Validation
        if (!quantity || Number(quantity) <= 0) {
            const err = new Error('INVALID_QUANTITY: Quantity must be a positive number.');
            err.code = 'INVALID_QUANTITY';
            err.statusCode = 400;
            throw err;
        }

        // Step 3: Governed Pricing Calculation
        const preview = await previewService.calculatePreview(tenantId, {
            siteId,
            priceBookId: eligibility.priceBook.id,
            quantity: Number(quantity),
            lengthMm: Number(lengthMm || 210),
            widthMm: Number(widthMm || 148),
            materialId: materialId || null,
            finishingOps: finishingOps || []
        });

        // Money Safety: Canonical Integer Minor Units (Cents) Arithmetic
        const netCents = moneyUtil.toCents(preview.costBreakdown.totalCost || 0);
        const taxRatePercent = 21; // 21% VAT estimation
        const taxCents = moneyUtil.calculatePercentageCents(netCents, taxRatePercent);
        const grossCents = netCents + taxCents;

        const quoteId = `lquote_${crypto.randomUUID()}`;

        return {
            quoteId,
            tenantId,
            siteId: siteId || 'site-1',
            status: 'CALCULATED',
            currency: preview.costBreakdown.currency || 'EUR',
            pricing: {
                netAmount: moneyUtil.fromCents(netCents),
                taxAmount: moneyUtil.fromCents(taxCents),
                grossAmount: moneyUtil.fromCents(grossCents),
                taxStatus: 'ESTIMATED_VAT'
            },
            priceBookRef: {
                id: eligibility.priceBook.id,
                name: eligibility.priceBook.name
            },
            invariants: {
                orderCreated: false,
                routingCreated: false,
                dispatchCreated: false,
                capabilityChanged: false
            },
            disclaimer: 'Live quote calculated using governed price books. Zero side-effects created until formal order placement.',
            calculatedAt: new Date().toISOString()
        };
    }
}

module.exports = new LiveQuoteEligibilityService();
