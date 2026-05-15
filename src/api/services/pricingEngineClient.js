// src/api/services/pricingEngineClient.js
/**
 * Phase 10 Intelligence Layer: Hardened Pricing Engine Client
 * Standardized marketplace gateway for industrial orchestration.
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class PricingEngineClient {
    /**
     * Main orchestration point for marketplace offers.
     * Supports both native /api/marketplace/offers and legacy /api/estimates fallback.
     */
    async generateMarketplaceOffers(order, options = {}) {
        const PRICING_ENGINE_URL = process.env.PPOS_PRICING_ENGINE_URL || 'http://127.0.0.1:8004';
        const MARKETPLACE_PATH = process.env.PPOS_PRICING_ENGINE_MARKETPLACE_PATH || '/api/marketplace/offers';
        const ESTIMATES_PATH = process.env.PPOS_PRICING_ENGINE_ESTIMATES_PATH || '/api/estimates';
        const TIMEOUT_MS = Number(process.env.PPOS_PRICING_ENGINE_TIMEOUT_MS) || 12000;
        const ENABLED = process.env.PPOS_PRICING_ENGINE_ENABLED !== 'false';

        const orderId = order.id || order.order_id || options.orderId || null;
        const jobId = order.job_id || options.jobId || orderId || 'job_unknown';
        const tenantId = order.tenant_id || options.tenantId || 'default';
        const source = order.source || options.source || 'BPE_MARKETPLACE_NATIVE';
        const sourceRef = order.source_ref || options.sourceRef || order.order_ref || null;
        const traceId = (order.metadata_json && order.metadata_json.trace_id) || options.traceId || `trace_${uuidv4()}`;
        const sessionId = options.sessionId || null;
        const currency = order.currency || (order.pricing && order.pricing.currency) || 'EUR';

        const baseLogCtx = { orderId, jobId, tenantId, source, sourceRef, traceId, sessionId };

        if (!ENABLED) {
            console.log(`[MARKETPLACE][NO-OFFERS] Pricing engine integration disabled via config.`, baseLogCtx);
            return {
                ok: true,
                engine: "v3.0-disabled",
                endpoint_used: "DISABLED",
                source,
                trace_id: traceId,
                offers: [],
                count: 0,
                warnings: ["Pricing Engine integration is disabled via PPOS_PRICING_ENGINE_ENABLED=false"],
                errors: {}
            };
        }

        // 1. Normalize Payload for BPE Legacy/Industrial compatibility
        const normalizedSpecs = this.normalizeSpecs(order.specs || order);
        const customer = this.safeJson(order.customer);
        const pricing = this.safeJson(order.pricing);
        const delivery = this.safeJson(order.delivery) || {};
        if (order.delivery_country) delivery.country = order.delivery_country;
        
        const metadata = this.safeJson(order.metadata_json);

        const payload = {
            source,
            source_ref: sourceRef,
            tenant_id: tenantId,
            trace_id: traceId,
            order_id: orderId,
            quote_id: order.quote_id || metadata.quote_id || null,
            currency,
            target_margin_pct: order.target_margin_pct || pricing.target_margin_pct || 30.0,
            customer,
            specs: normalizedSpecs,
            pricing,
            delivery,
            metadata_json: metadata
        };

        console.log(`[MARKETPLACE][PRICING-REQUEST] Requesting deterministic offers from Pricing Engine`, {
            ...baseLogCtx,
            endpointUsed: `${PRICING_ENGINE_URL}${MARKETPLACE_PATH}`
        });

        let usedEndpoint = MARKETPLACE_PATH;
        let responseData = null;

        try {
            // Attempt Primary Marketplace Endpoint
            const res = await axios.post(`${PRICING_ENGINE_URL}${MARKETPLACE_PATH}`, payload, {
                timeout: TIMEOUT_MS,
                headers: { 
                    'Content-Type': 'application/json', 
                    'X-Trace-Id': traceId
                }
            });
            responseData = res.data;
            console.log(`[MARKETPLACE][PRICING-RESPONSE] Received real offers from marketplace endpoint`, {
                ...baseLogCtx,
                endpointUsed: `${PRICING_ENGINE_URL}${MARKETPLACE_PATH}`
            });
        } catch (err) {
            const status = err.response && err.response.status;
            const isUnavailable = status === 404 || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || (err.message && err.message.includes('404'));

            if (isUnavailable) {
                usedEndpoint = ESTIMATES_PATH;
                console.log(`[MARKETPLACE][PRICING-FALLBACK-ESTIMATES] Primary endpoint unavailable (${status || err.code}), falling back to ${ESTIMATES_PATH}`, {
                    ...baseLogCtx,
                    endpointUsed: `${PRICING_ENGINE_URL}${ESTIMATES_PATH}`
                });

                try {
                    const fallbackRes = await axios.post(`${PRICING_ENGINE_URL}${ESTIMATES_PATH}`, payload, {
                        timeout: Math.floor(TIMEOUT_MS * 0.8), // Slightly tighter timeout for fallback
                        headers: { 
                            'Content-Type': 'application/json', 
                            'X-Trace-Id': traceId
                        }
                    });
                    responseData = this.mapEstimatesToOffers(fallbackRes.data, payload);
                    console.log(`[MARKETPLACE][PRICING-RESPONSE] Successfully mapped estimates to deterministic offers`, {
                        ...baseLogCtx,
                        endpointUsed: `${PRICING_ENGINE_URL}${ESTIMATES_PATH}`
                    });
                } catch (fallbackErr) {
                    console.error(`[MARKETPLACE][PRICING-FAILED] Fallback estimates request failed: ${fallbackErr.message}`, {
                        ...baseLogCtx,
                        endpointUsed: `${PRICING_ENGINE_URL}${ESTIMATES_PATH}`
                    });
                    return this.buildFailureResponse(fallbackErr, usedEndpoint, payload, baseLogCtx);
                }
            } else {
                console.error(`[MARKETPLACE][PRICING-FAILED] Pricing Engine request failed: ${err.message}`, {
                    ...baseLogCtx,
                    endpointUsed: `${PRICING_ENGINE_URL}${MARKETPLACE_PATH}`
                });
                return this.buildFailureResponse(err, usedEndpoint, payload, baseLogCtx);
            }
        }

        // Ensure output shape exactly matches the Phase 3 schema requirement
        return {
            ok: true,
            engine: responseData.engine || "v3.0-industrial",
            endpoint_used: usedEndpoint,
            source: responseData.source || source,
            source_ref: responseData.source_ref || sourceRef,
            tenant_id: responseData.tenant_id || tenantId,
            trace_id: responseData.trace_id || traceId,
            order_id: responseData.order_id || orderId,
            currency: responseData.currency || currency,
            selected_offer: responseData.selected_offer || null,
            offers: Array.isArray(responseData.offers) ? responseData.offers : [],
            count: Array.isArray(responseData.offers) ? responseData.offers.length : 0,
            params: responseData.params || payload,
            warnings: responseData.warnings || [],
            errors: responseData.errors || {}
        };
    }

    /**
     * Normalizes Budget/Frontend specs to BPE Legacy/Standard specs.
     */
    normalizeSpecs(specs) {
        if (!specs) return {};
        const s = { ...specs };

        // 1. Binding Method Normalization
        if (s.binding_method === 'perfect_bound') s.binding_method = 'perfect bound';
        if (s.binding_method === 'hard_cover') s.binding_method = 'hardcover';

        // 2. Finishing Options Mapping
        if (s.finishing_options === 'matt_lam_scratch') s.finishing_options = 'matt lamination';
        if (s.finishing_options === 'gloss_lam') s.finishing_options = 'gloss lamination';
        if (s.finishing_options === 'soft_touch_lam') s.finishing_options = 'soft touch lamination';

        // 3. Endpapers Logic
        if (s.endpapers === 'none') {
            s.endpapers_print = 'none';
        } else if (!s.endpapers_print || s.endpapers_print === '') {
            s.endpapers_print = 'none';
        }

        // 4. Page Counts
        if (!s.total_page_count && s.interior_pages) {
            s.total_page_count = (Number(s.interior_pages) || 0) + (Number(s.cover_pages) || 4);
        }

        // 5. ISO Country
        if (s.delivery_country) {
            s.delivery_country = String(s.delivery_country).toUpperCase().substring(0, 2);
        }

        return s;
    }

    mapEstimatesToOffers(data, payload) {
        const rawHouses = Array.isArray(data.print_houses) ? data.print_houses : [];
        const selectedHouse = data.selected_print_house || null;

        const offers = rawHouses.map((house, idx) => {
            const printerId = house.house_id || house.id || house.printer_id || `house_${idx}`;
            const printerName = house.print_house || house.printer_name || house.name || printerId;
            const prodCost = house.total_cost != null ? Number(house.total_cost) : 0;
            
            // Margin calculations
            const targetMargin = payload.target_margin_pct || 30.0;
            const suggestedPrice = house.suggested_price != null ? Number(house.suggested_price) : Number((prodCost / (1 - targetMargin / 100)).toFixed(2));
            const estimatedMargin = Number((suggestedPrice - prodCost).toFixed(2));

            let leadTimeDays = house.lead_time_days != null ? house.lead_time_days : null;
            if (leadTimeDays === null) {
                leadTimeDays = (Number(house.production_lead_days) || 5) + (Number(house.shipping_days) || 2);
            }

            const isSelected = selectedHouse && (
                selectedHouse.house_id === printerId || 
                selectedHouse.id === printerId || 
                selectedHouse.print_house === printerName
            );

            return {
                id: `offer_${printerId}_${Date.now()}`,
                offer_id: `bpe_${printerId}`,
                printer_id: printerId,
                printer_name: printerName,
                house_id: printerId,
                print_house_id: printerId,
                print_house: printerName,
                total_cost: prodCost,
                total_price: suggestedPrice,
                currency: payload.currency || 'EUR',
                margin: estimatedMargin,
                margin_percent: targetMargin,
                estimated_delivery_time: house.estimated_delivery_time || house.delivery_time || `${leadTimeDays} days`,
                lead_time_days: leadTimeDays,
                breakdown: house.lines || house.breakdown || [
                    { label: "Production", amount: prodCost }
                ],
                recommended: !!isSelected,
                checkout_allowed: true,
                source: "BPE_MARKETPLACE_NATIVE",
                offer_selected: isSelected ? 1 : 0,
                offer_rank: idx + 1,
                raw_offer: house
            };
        });

        // Ensure at least one is recommended if any offers exist
        if (offers.length > 0 && !offers.some(o => o.recommended)) {
            offers[0].recommended = true;
            offers[0].offer_selected = 1;
        }

        const recommended = offers.find(o => o.recommended) || offers[0];

        return {
            engine: data.engine || "v3.0-mapped",
            source: payload.source,
            trace_id: payload.trace_id,
            offers,
            recommended_offer_id: recommended ? recommended.id : null,
            raw_recommended_offer_id: recommended ? recommended.house_id : null,
            ok: true
        };
    }

    buildFailureResponse(err, endpoint, payload, ctx) {
        return {
            ok: false,
            engine: "v3.0-industrial",
            endpoint_used: endpoint,
            trace_id: payload.trace_id,
            offers: [],
            count: 0,
            errors: {
                message: err.message,
                code: err.code || 'BPE_UNAVAILABLE',
                status: err.response ? err.response.status : null
            }
        };
    }

    safeJson(val) {
        if (typeof val === 'string') {
            try { return JSON.parse(val); } catch(e) { return {}; }
        }
        return val || {};
    }
}

module.exports = new PricingEngineClient();
