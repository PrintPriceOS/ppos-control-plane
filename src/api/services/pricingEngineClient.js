// src/api/services/pricingEngineClient.js
/**
 * Phase 3 Client Service: Deterministic Marketplace Offer Generator Client
 * Integrates Control Plane with the PPOS Pricing Engine / BPE flawlessly.
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class PricingEngineClient {
    async generateMarketplaceOffers(order, options = {}) {
        const PRICING_ENGINE_URL = process.env.PPOS_PRICING_ENGINE_URL || 'http://127.0.0.1:8004';
        const MARKETPLACE_PATH = process.env.PPOS_PRICING_ENGINE_MARKETPLACE_PATH || '/api/marketplace/offers';
        const ESTIMATES_PATH = process.env.PPOS_PRICING_ENGINE_ESTIMATES_PATH || '/api/estimates';
        const TIMEOUT_MS = Number(process.env.PPOS_PRICING_ENGINE_TIMEOUT_MS) || 15000;
        const ENABLED = process.env.PPOS_PRICING_ENGINE_ENABLED !== 'false';

        const orderId = order.id || order.order_id || options.orderId || null;
        const jobId = order.job_id || options.jobId || orderId || 'job_unknown';
        const tenantId = order.tenant_id || options.tenantId || 'default';
        const source = order.source || options.source || 'BPE';
        const sourceRef = order.source_ref || options.sourceRef || order.order_ref || null;
        const traceId = (order.metadata_json && order.metadata_json.trace_id) || options.traceId || `trace_${uuidv4()}`;
        const sessionId = options.sessionId || null;
        const currency = order.currency || (order.pricing && order.pricing.currency) || 'EUR';

        const baseLogCtx = { orderId, jobId, tenantId, source, sourceRef, traceId, sessionId };

        if (!ENABLED) {
            console.log(`[MARKETPLACE][NO-OFFERS] Pricing engine integration disabled via config.`, baseLogCtx);
            return {
                ok: true,
                engine: "v3.0",
                endpoint_used: "DISABLED",
                source,
                source_ref: sourceRef,
                tenant_id: tenantId,
                trace_id: traceId,
                order_id: orderId,
                currency,
                selected_offer: null,
                offers: [],
                count: 0,
                params: {},
                warnings: ["Pricing Engine integration is disabled via PPOS_PRICING_ENGINE_ENABLED=false"],
                errors: {}
            };
        }

        // Safely parse JSON fields if stringified
        const safeJson = (val) => {
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch(e) { return {}; }
            }
            return val || {};
        };

        const customer = safeJson(order.customer);
        const specs = safeJson(order.specs);
        const pricing = safeJson(order.pricing);
        const delivery = safeJson(order.delivery);
        const metadata = safeJson(order.metadata_json);

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
            specs,
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
            const res = await axios.post(`${PRICING_ENGINE_URL}${MARKETPLACE_PATH}`, payload, {
                timeout: TIMEOUT_MS,
                headers: { 'Content-Type': 'application/json', 'X-Trace-Id': traceId }
            });
            responseData = res.data;
            console.log(`[MARKETPLACE][PRICING-RESPONSE] Received real offers from marketplace endpoint`, {
                ...baseLogCtx,
                endpointUsed: `${PRICING_ENGINE_URL}${MARKETPLACE_PATH}`
            });
        } catch (err) {
            const status = err.response && err.response.status;
            // Trigger explicit fallback to /api/estimates when marketplace path gets 404 or connection failure
            if (status === 404 || err.code === 'ECONNREFUSED' || err.message.includes('not found') || err.message.includes('404')) {
                usedEndpoint = ESTIMATES_PATH;
                console.log(`[MARKETPLACE][PRICING-FALLBACK-ESTIMATES] Primary endpoint unavailable (${status || err.code}), falling back to ${ESTIMATES_PATH}`, {
                    ...baseLogCtx,
                    endpointUsed: `${PRICING_ENGINE_URL}${ESTIMATES_PATH}`
                });

                try {
                    const fallbackRes = await axios.post(`${PRICING_ENGINE_URL}${ESTIMATES_PATH}`, payload, {
                        timeout: TIMEOUT_MS,
                        headers: { 'Content-Type': 'application/json', 'X-Trace-Id': traceId }
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
            engine: responseData.engine || "v3.0",
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

    mapEstimatesToOffers(data, payload) {
        const rawHouses = Array.isArray(data.print_houses) ? data.print_houses : [];
        const selectedHouse = data.selected_print_house || null;

        // Sort print houses by total_cost ascending if not already sorted
        const sortedHouses = [...rawHouses].sort((a, b) => {
            const costA = a.total_cost !== undefined && a.total_cost !== null ? Number(a.total_cost) : Infinity;
            const costB = b.total_cost !== undefined && b.total_cost !== null ? Number(b.total_cost) : Infinity;
            return costA - costB;
        });

        const offers = sortedHouses.map((house, idx) => {
            const printerId = house.house_id || house.id || house.printer_id || null;
            const printerName = house.print_house || house.printer_name || house.name || printerId || null;
            const prodCost = house.total_cost !== undefined && house.total_cost !== null ? Number(house.total_cost) : null;
            
            // Suggested price / margin calculations based on target margin or fallback logic
            let suggestedPrice = house.suggested_price !== undefined ? house.suggested_price : null;
            let estimatedMargin = house.estimated_margin !== undefined ? house.estimated_margin : null;
            let marginPct = house.margin_pct !== undefined ? house.margin_pct : null;

            if (prodCost !== null && suggestedPrice === null) {
                const targetMargin = payload.target_margin_pct || 30.0;
                suggestedPrice = Number((prodCost / (1 - targetMargin / 100)).toFixed(4));
                estimatedMargin = Number((suggestedPrice - prodCost).toFixed(4));
                marginPct = targetMargin;
            }

            let leadTimeDays = house.lead_time_days !== undefined ? house.lead_time_days : null;
            if (leadTimeDays === null && (house.production_lead_days || house.shipping_days)) {
                leadTimeDays = (Number(house.production_lead_days) || 0) + (Number(house.shipping_days) || 0);
            }
            if (leadTimeDays === null && house.estimated_delivery_time) {
                const parsed = parseInt(house.estimated_delivery_time);
                if (!isNaN(parsed)) leadTimeDays = parsed;
            }

            const isSelected = selectedHouse && (
                selectedHouse.house_id === printerId || 
                selectedHouse.id === printerId || 
                selectedHouse.print_house === printerName
            );

            return {
                id: `offer_${printerId || idx}_${Date.now()}`,
                printer_id: printerId,
                printer_name: printerName,
                house_id: printerId,
                machine_id: house.machine_id || null,
                production_cost: prodCost,
                suggested_price: suggestedPrice,
                estimated_margin: estimatedMargin,
                margin_pct: marginPct,
                lead_time_days: leadTimeDays,
                production_lead_days: house.production_lead_days || null,
                shipping_days: house.shipping_days || null,
                delivery_time: house.estimated_delivery_time || house.delivery_time || null,
                offer_rank: idx + 1,
                offer_priority_score: Number((100 - idx * 5).toFixed(4)), // Score highest for cheapest/first
                offer_selected: isSelected ? 1 : 0,
                raw_estimate_json: house
            };
        });

        let selectedOffer = offers.find(o => o.offer_selected === 1) || null;
        if (!selectedOffer && offers.length > 0) {
            // If no explicit match, fallback selected_offer to the top-ranked offer
            offers[0].offer_selected = 1;
            selectedOffer = offers[0];
        }

        return {
            engine: data.engine || "v3.0-mapped",
            source: payload.source,
            source_ref: payload.source_ref,
            tenant_id: payload.tenant_id,
            trace_id: payload.trace_id,
            order_id: payload.order_id,
            currency: payload.currency,
            selected_offer: selectedOffer,
            offers,
            params: payload,
            warnings: ["Mapped legacy /api/estimates payload to deterministic marketplace offers contract"],
            errors: {}
        };
    }

    buildFailureResponse(err, endpoint, payload, ctx) {
        return {
            ok: false,
            engine: "v3.0",
            endpoint_used: endpoint,
            source: payload.source,
            source_ref: payload.source_ref,
            tenant_id: payload.tenant_id,
            trace_id: payload.trace_id,
            order_id: payload.order_id,
            currency: payload.currency,
            selected_offer: null,
            offers: [],
            count: 0,
            params: payload,
            warnings: [],
            errors: {
                message: err.message,
                code: err.code || 'UNKNOWN_ERROR',
                status: err.response ? err.response.status : null,
                data: err.response ? err.response.data : null
            }
        };
    }
}

module.exports = new PricingEngineClient();
