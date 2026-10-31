import { describe, test, expect, vi, beforeEach } from 'vitest';
const axios = require('axios');
const pricingEngineClient = require('../src/api/services/pricingEngineClient');

describe('PricingEngineClient Unit & Edge Cases Test Suite', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    test('1. Preserves target_margin_pct when explicitly passed as 0', async () => {
        const spy = vi.spyOn(axios, 'post').mockImplementation(async () => {
            return {
                data: {
                    ok: true,
                    offers: [
                        { id: 'off-1', house_id: 'house-1', production_cost: 100, suggested_price: 100, margin_pct: 0 }
                    ]
                }
            };
        });

        const res = await pricingEngineClient.generateMarketplaceOffers({
            tenantId: 'tenant-1',
            orderId: 'ord-1',
            target_margin_pct: 0,
            currency: 'EUR',
            specs: { copies: 100 }
        });

        expect(spy).toHaveBeenCalled();
        const sentPayload = spy.mock.calls[0][1];
        expect(sentPayload.target_margin_pct).toBe(0);
        expect(res.ok).toBe(true);
        expect(res.offers[0].margin_percent).toBe(0);
        expect(res.offers[0].margin_pct).toBe(0);
    });

    test('2. Processes real production BPE response shape (production_cost, suggested_price, estimated_margin, margin_pct)', async () => {
        vi.spyOn(axios, 'post').mockImplementation(async () => {
            return {
                data: {
                    ok: true,
                    engine: 'v3.0-industrial',
                    offers: [
                        {
                            id: 'off-prod-1',
                            house_id: 'house-alpha',
                            name: 'Printhouse Alpha',
                            production_cost: 450.00,
                            suggested_price: 642.86,
                            estimated_margin: 192.86,
                            margin_pct: 30.0,
                            delivery_days: 3
                        },
                        {
                            id: 'off-prod-2',
                            house_id: 'house-beta',
                            name: 'Printhouse Beta',
                            production_cost: 480.00,
                            suggested_price: 685.71,
                            estimated_margin: 205.71,
                            margin_pct: 30.0,
                            delivery_days: 2
                        },
                        {
                            id: 'off-prod-3',
                            house_id: 'house-gamma',
                            name: 'Printhouse Gamma',
                            production_cost: 510.00,
                            suggested_price: 728.57,
                            estimated_margin: 218.57,
                            margin_pct: 30.0,
                            delivery_days: 4
                        }
                    ],
                    selected_offer: { id: 'off-prod-2' }
                }
            };
        });

        const res = await pricingEngineClient.generateMarketplaceOffers({
            tenantId: 'tenant-prod',
            orderId: 'ord-real-prod',
            specs: { copies: 500, interior_pages: 128 }
        });

        expect(res.ok).toBe(true);
        expect(res.count).toBe(3);
        expect(res.offers).toHaveLength(3);

        // Verify normalized properties
        expect(res.offers[0].total_cost).toBe(450.00);
        expect(res.offers[0].suggested_price).toBe(642.86);
        expect(res.offers[0].estimated_margin).toBe(192.86);
        expect(res.offers[0].margin_pct).toBe(30.0);

        // Verify selected_offer membership validation
        expect(res.selected_offer).toBeDefined();
        expect(res.selected_offer.id).toBe('off-prod-2');
    });

    test('3. Rejects response when ALL offers are invalid (missing price, empty string cost, non-finite values)', async () => {
        vi.spyOn(axios, 'post').mockImplementation(async () => {
            return {
                data: {
                    ok: true,
                    offers: [
                        { id: 'off-noprice', production_cost: 100 }, // missing price -> rawPrice is undefined
                        { id: 'off-emptycost', production_cost: '', suggested_price: 150 }, // empty string cost
                        { id: 'off-nancost', production_cost: NaN, suggested_price: 150 }, // NaN cost
                        { id: 'off-nullprice', production_cost: 100, suggested_price: null } // null price
                    ]
                }
            };
        });

        const res = await pricingEngineClient.generateMarketplaceOffers({
            tenantId: 'tenant-1',
            orderId: 'ord-all-invalid',
            specs: { copies: 100 }
        });

        expect(res.ok).toBe(false);
        expect(res.offers).toHaveLength(0);
        expect(res.count).toBe(0);
        expect(res.selected_offer).toBeNull();
        expect(res.errors.message).toBe('BPE_NO_VALID_OFFERS');
    });

    test('4. Returns ok: false when BPE response explicitly indicates failure or error', async () => {
        vi.spyOn(axios, 'post').mockImplementation(async () => {
            return {
                data: {
                    ok: false,
                    error: 'BPE_ENGINE_CALCULATION_FAILED',
                    offers: []
                }
            };
        });

        const res = await pricingEngineClient.generateMarketplaceOffers({
            tenantId: 'tenant-1',
            orderId: 'ord-2',
            specs: { copies: 500 }
        });

        expect(res.ok).toBe(false);
        expect(res.errors).toBeDefined();
        expect(res.errors.message).toBe('BPE_ENGINE_CALCULATION_FAILED');
    });

    test('5. Rejects empty object {} response body without declaring success', async () => {
        vi.spyOn(axios, 'post').mockImplementation(async () => {
            return { data: {} };
        });

        const res = await pricingEngineClient.generateMarketplaceOffers({
            tenantId: 'tenant-1',
            orderId: 'ord-empty',
            specs: { copies: 100 }
        });

        expect(res.ok).toBe(false);
        expect(res.offers).toHaveLength(0);
    });

    test('6. Normalizes binding and finishing aliases in normalizeSpecs', () => {
        const specs = {
            binding_method: 'perfect_bound',
            finishing_options: 'matt_lam_scratch',
            interior_pages: 96,
            cover_pages: 4
        };

        const normalized = pricingEngineClient.normalizeSpecs(specs);
        expect(normalized.binding_method).toBe('perfect bound');
        expect(normalized.finishing_options).toBe('matt lamination');
        expect(normalized.total_page_count).toBe(100);
    });

    test('7. Maps estimates to offers accurately and preserves margin calculation for 0%', () => {
        const data = {
            print_houses: [
                { id: 'house-a', name: 'Printhouse A', total_cost: 500, suggested_price: 500 }
            ],
            selected_print_house: { id: 'house-a' }
        };

        const payload = { target_margin_pct: 0, currency: 'EUR' };
        const mapped = pricingEngineClient.mapEstimatesToOffers(data, payload);

        expect(mapped.offers).toHaveLength(1);
        expect(mapped.offers[0].margin_percent).toBe(0);
        expect(mapped.offers[0].total_cost).toBe(500);
        expect(mapped.offers[0].total_price).toBe(500);
        expect(mapped.offers[0].recommended).toBe(true);
    });
});
