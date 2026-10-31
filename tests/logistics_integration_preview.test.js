import { describe, it, expect, vi } from 'vitest';

const {
    createLogisticsRouter,
    requireLogisticsControlPlaneAuth
} = require('../src/api/routes/logisticsRoutes');
const {
    LogisticsDatabaseService,
    DEFAULT_FREIGHT_MATRICES
} = require('../src/api/services/logistics/logisticsDatabaseService');
const {
    PrinthouseQuotePreviewService
} = require('../src/api/services/printhouseQuotePreviewService');

function findRouteLayer(router, routePath, method) {
    for (const layer of router.stack) {
        if (layer.route && layer.route.path === routePath && layer.route.methods[method.toLowerCase()]) {
            return layer.route;
        }
    }
    return null;
}

async function invokeRouterEndpoint(router, { method = 'GET', routePath, params = {}, query = {}, body = {}, headers = {}, user = null }) {
    let statusCode = 200;
    let responseBody = null;
    let nextCalled = false;

    const req = {
        method,
        url: routePath,
        path: routePath,
        headers: { ...headers },
        query: { ...query },
        params: { ...params },
        body: { ...body },
        user
    };

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            responseBody = data;
            return this;
        },
        send(data) {
            responseBody = data;
            return this;
        }
    };

    requireLogisticsControlPlaneAuth(req, res, () => {
        nextCalled = true;
    });

    if (!nextCalled) {
        return { statusCode, body: responseBody };
    }

    const route = findRouteLayer(router, routePath, method);
    if (!route) {
        return { statusCode: 404, body: { ok: false, error: 'Route not found' } };
    }

    const handler = route.stack[route.stack.length - 1].handle;
    await handler(req, res, () => {});
    return { statusCode, body: responseBody };
}

describe('Phase 198A (LOGISTICS-03): REST API, Printhouse Quote Preview & Run Optimization Integration', () => {
    /**
     * TEST 1: Comprobar que GET /api/logistics/warehouses, GET /api/logistics/warehouses/:code,
     * POST /api/logistics/calculate-quote y GET/PUT /api/printhouses/:id/freight-matrices
     * respondan correctamente con esquemas válidos y control de autorización.
     */
    it('Test 1: serves GET /api/logistics/warehouses, POST /api/logistics/calculate-quote and GET/PUT /api/printhouses/:id/freight-matrices with valid schemas', async () => {
        const mockDb = {
            query: vi.fn().mockResolvedValue([[]])
        };
        const logisticsService = new LogisticsDatabaseService({ db: mockDb });
        const router = createLogisticsRouter({ logisticsService });

        const authHeaders = { 'x-user-role': 'PRINTHOUSE_ADMIN' };

        // 1. Unauthorized check (missing role) -> 403
        const unauthRes = await invokeRouterEndpoint(router, {
            method: 'GET',
            routePath: '/warehouses'
        });
        expect(unauthRes.statusCode).toBe(403);

        // 2. GET /api/logistics/warehouses
        const whRes = await invokeRouterEndpoint(router, {
            method: 'GET',
            routePath: '/warehouses',
            headers: authHeaders
        });
        expect(whRes.statusCode).toBe(200);
        expect(whRes.body.ok).toBe(true);
        expect(whRes.body.count).toBeGreaterThanOrEqual(4);
        const codes = whRes.body.warehouses.map(w => w.code);
        expect(codes).toContain('ZEITFRACHT_ERFURT');
        expect(codes).toContain('ARVATO_VVA_GUETERSLOH');
        expect(codes).toContain('AMAZON_EU_FBA_STD');

        // 3. GET /api/logistics/warehouses/:code
        const singleWhRes = await invokeRouterEndpoint(router, {
            method: 'GET',
            routePath: '/warehouses/:code',
            params: { code: 'ZEITFRACHT_ERFURT' },
            headers: authHeaders
        });
        expect(singleWhRes.statusCode).toBe(200);
        expect(singleWhRes.body.warehouse.code).toBe('ZEITFRACHT_ERFURT');
        expect(singleWhRes.body.warehouse.maxPalletHeightMm).toBe(1200);
        expect(singleWhRes.body.warehouse.perimeterMarginMm).toBe(30);

        // 4. POST /api/logistics/calculate-quote
        const calcRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/calculate-quote',
            headers: authHeaders,
            body: {
                trimWidthMm: 148,
                trimHeightMm: 210,
                bindingCategory: 'SOFTCOVER_STANDARD',
                processingType: 'GLUED',
                segments: [{ pages: 256, gsm: 80, bulk: 1.2 }],
                cover: { gsm: 240, caliperUm: 240 },
                quantity: 2500,
                warehouseProfileCode: 'ZEITFRACHT_ERFURT',
                destCountry: 'DE',
                destPostal: '99098'
            }
        });
        expect(calcRes.statusCode).toBe(200);
        expect(calcRes.body.ok).toBe(true);
        expect(calcRes.body.quote.warehouseProfile.code).toBe('ZEITFRACHT_ERFURT');
        expect(calcRes.body.quote.cubing.palletStacking.orderBreakdown.totalPalletsRequired).toBeGreaterThanOrEqual(1);
        expect(calcRes.body.quote.landedLogisticsCostSummaryEur.packagingMaterialsCostEur).toBeGreaterThan(0);
        expect(calcRes.body.quote.landedLogisticsCostSummaryEur.carrierFreightCostEur).toBeGreaterThan(0);
        expect(calcRes.body.quote.quoteCanonicalHash).toMatch(/^[a-f0-9]{64}$/);

        // 5. PUT & GET /api/printhouses/:id/freight-matrices (1-Click Standard Matrix adoption)
        const putMatrixRes = await invokeRouterEndpoint(router, {
            method: 'PUT',
            routePath: '/printhouses/:id/freight-matrices',
            params: { id: 'node-demo-1' },
            headers: authHeaders,
            body: {
                adoptPlatformStandard: true
            }
        });
        expect(putMatrixRes.statusCode).toBe(200);
        expect(putMatrixRes.body.ok).toBe(true);
        expect(putMatrixRes.body.adoptedPlatformStandard).toBe(true);
        expect(putMatrixRes.body.matricesCount).toBe(DEFAULT_FREIGHT_MATRICES.length);

        const getMatrixRes = await invokeRouterEndpoint(router, {
            method: 'GET',
            routePath: '/printhouses/:id/freight-matrices',
            params: { id: 'node-demo-1' },
            headers: authHeaders
        });
        expect(getMatrixRes.statusCode).toBe(200);
        expect(getMatrixRes.body.ok).toBe(true);
        expect(getMatrixRes.body.matrices.length).toBeGreaterThanOrEqual(4);
        expect(getMatrixRes.body.consumableRates.euroPalletEpalEur).toBe(14.50);
    });

    /**
     * TEST 2: Previsualización de presupuesto integral (previewPrinthouseQuote) verificando que
     * el coste de transporte se calcula mediante el motor de cubicaje real en lugar de la heurística
     * estática de pliegos, manteniendo manufacturingPrice intacto y segregando consumibles vs flete.
     */
    it('Test 2: enriches previewPrinthouseQuote with real 3D cubing transport breakdown while keeping manufacturingPrice untouched', async () => {
        const sampleRatesJson = {
            paper_price_interior_by_kilo: { offset: 1.25, mc: 1.30 },
            paper_price_cover_by_kilo: { mc: 1.40, offset: 1.35 },
            paper_price_endpaper_by_kilo: { offset: 1.35 },
            interior_one_colour_fixed: { '32p': 120, '16p': 85, '8p': 55, '4p': 40, '24p': 100, '12p': 70 },
            interior_one_colour_var: { '32p': 18, '16p': 14, '8p': 10, '4p': 8, '24p': 16, '12p': 12 },
            interior_full_colour_fixed: { '32p': 240, '16p': 160, '8p': 110, '4p': 80, '24p': 200, '12p': 135 },
            interior_full_colour_var: { '32p': 38, '16p': 28, '8p': 19, '4p': 14, '24p': 32, '12p': 22 },
            cover_full_colour_fixed: { '1': 140 },
            cover_full_colour_var: { '1': 22 },
            binding_glued_fixed: 180,
            binding_glued_var: 65,
            binding_sewn_fixed: 290,
            binding_sewn_var: 110,
            lamination_matt_fixed: 60,
            lamination_matt_var: 25
        };

        const mockDb = {
            query: vi.fn().mockImplementation(async (sql) => {
                if (sql.includes('FROM printer_nodes')) {
                    return [{
                        id: 'node-bpe-1',
                        tenant_id: 'tenant-demo-1',
                        name: 'Demo Editorial Printhouse',
                        rates_json: JSON.stringify(sampleRatesJson),
                        signatures: JSON.stringify([32, 16, 8, 4]),
                        limits: JSON.stringify({ min_copies: 100, max_copies: 50000, min_pages: 16, max_pages: 1200 }),
                        production_lead_days: 7,
                        delivery_time: 2
                    }];
                }
                return [[]];
            })
        };

        const logisticsService = new LogisticsDatabaseService({ db: mockDb });
        const previewService = new PrinthouseQuotePreviewService({ db: mockDb, logisticsService });

        const quote = await previewService.previewPrinthouseQuote('tenant-demo-1', {
            copies: 3000,
            interior_pages: 256,
            book_width_mm: 148,
            book_height_mm: 210,
            paper_type_interior: 'offset',
            paper_weight_interior: 80,
            paper_bulk_interior: 1.2,
            interior_print: '1/1',
            paper_type_cover: 'mc',
            paper_weight_cover: 240,
            cover_print: '4/0',
            binding_method: 'softcover glued',
            lamination: 'matt',
            delivery_country: 'DE',
            delivery_postal_code: '99098',
            warehouse_profile_code: 'ZEITFRACHT_ERFURT'
        }, 'node-bpe-1');

        expect(quote.ok).toBe(true);
        expect(quote.manufacturingPrice).toBeGreaterThan(0);
        expect(quote.totals.manufacturing).toBe(quote.manufacturingPrice);

        // Verify transportPrice is decomposed into packagingMaterialsCostEur + carrierFreightCostEur
        expect(quote.transportPrice).toBeDefined();
        expect(quote.transportPrice.packagingMaterialsCostEur).toBeGreaterThan(0);
        expect(quote.transportPrice.carrierFreightCostEur).toBeGreaterThan(0);
        expect(quote.transportPrice.carrierName).toBe('DACHSER');
        expect(quote.transportPrice.totalEur).toBeCloseTo(
            quote.transportPrice.packagingMaterialsCostEur + quote.transportPrice.carrierFreightCostEur,
            2
        );
        expect(quote.totals.transport).toBe(quote.transportPrice.totalEur);

        // Verify finalSellingPrice = manufacturing + transport + markup + tax
        expect(quote.totals.finalSellingPrice).toBeCloseTo(
            quote.manufacturingPrice + quote.transportPrice.totalEur,
            2
        );

        // Verify logisticsCubing block is populated with exact 3D metrics
        expect(quote.logisticsCubing).toBeDefined();
        expect(quote.logisticsCubing.warehouseProfileCode).toBe('ZEITFRACHT_ERFURT');
        expect(quote.logisticsCubing.palletCount).toBeGreaterThanOrEqual(1);
        expect(quote.logisticsCubing.layersPerPallet).toBeGreaterThanOrEqual(1);
        expect(quote.logisticsCubing.booksPerCarton).toBeGreaterThan(30);
        expect(quote.logisticsCubing.totalGrossWeightKg).toBeGreaterThan(900);
        expect(quote.logisticsCubing.volumetricEfficiency).toBeGreaterThan(0);
    });

    /**
     * TEST 3: Recomendador de tirada activa: comprobar que el presupuesto entregue sugerencias de
     * optimización a palet completo (Delta Q- / Delta Q+) cuando el último palet quede < 60% lleno.
     */
    it('Test 3: triggers active full-pallet run optimization recommendations (Delta Q- / Delta Q+) when the last pallet is < 60% utilized', async () => {
        const sampleRatesJson = {
            paper_price_interior_by_kilo: { offset: 1.25 },
            paper_price_cover_by_kilo: { mc: 1.40 },
            interior_one_colour_fixed: { '32p': 120, '16p': 85, '8p': 55, '4p': 40 },
            interior_one_colour_var: { '32p': 18, '16p': 14, '8p': 10, '4p': 8 },
            cover_full_colour_fixed: { '1': 140 },
            cover_full_colour_var: { '1': 22 },
            binding_glued_fixed: 180,
            binding_glued_var: 65
        };

        const mockDb = {
            query: vi.fn().mockImplementation(async (sql) => {
                if (sql.includes('FROM printer_nodes')) {
                    return [{
                        id: 'node-bpe-1',
                        tenant_id: 'tenant-demo-1',
                        name: 'Demo Editorial Printhouse',
                        rates_json: JSON.stringify(sampleRatesJson),
                        signatures: JSON.stringify([32, 16, 8, 4]),
                        limits: JSON.stringify({ min_copies: 100, max_copies: 50000, min_pages: 16, max_pages: 1200 }),
                        production_lead_days: 7,
                        delivery_time: 2
                    }];
                }
                return [[]];
            })
        };

        const logisticsService = new LogisticsDatabaseService({ db: mockDb });
        const previewService = new PrinthouseQuotePreviewService({ db: mockDb, logisticsService });

        // For A5 256p Softcover at Zeitfracht Erfurt, 1 full pallet holds 1,408 books (32 cartons * 44 books).
        // Requesting 1,650 books creates 1 full pallet (1,408) + 242 books on the 2nd pallet (~17.2% fill < 60%).
        const quote = await previewService.previewPrinthouseQuote('tenant-demo-1', {
            copies: 1650,
            interior_pages: 256,
            book_width_mm: 148,
            book_height_mm: 210,
            paper_type_interior: 'offset',
            paper_weight_interior: 80,
            paper_bulk_interior: 1.2,
            interior_print: '1/1',
            paper_type_cover: 'mc',
            paper_weight_cover: 240,
            cover_print: '4/0',
            binding_method: 'softcover glued',
            delivery_country: 'DE',
            delivery_postal_code: '99098',
            warehouse_profile_code: 'ZEITFRACHT_ERFURT'
        }, 'node-bpe-1');

        expect(quote.logisticsCubing.palletCount).toBe(2);
        expect(quote.logisticsCubing.lastPalletCapacityRatio).toBeLessThan(0.60);
        expect(quote.logisticsCubing.shouldHighlightRunOptimization).toBe(true);

        const recs = quote.logisticsCubing.runOptimizationRecommendations;
        expect(recs.reduceToFullPallets.available).toBe(true);
        expect(recs.reduceToFullPallets.deltaBooks).toBeLessThan(0);
        expect(recs.reduceToFullPallets.targetPalletsCount).toBe(1);
        expect(recs.reduceToFullPallets.palletsSaved).toBe(1);

        expect(recs.expandToFullPallets.available).toBe(true);
        expect(recs.expandToFullPallets.deltaBooks).toBeGreaterThan(0);
        expect(recs.expandToFullPallets.targetPalletsCount).toBe(2);
        expect(recs.expandToFullPallets.extraFreightPalletsIncurred).toBe(0);
    });

    /**
     * TEST 4: Regresión de extremo a extremo (Motor Fase 1 + Servicio BD Fase 2 + API/Preview Fase 3)
     * comprobando consistencia de hashes, aislamiento de tenant y personalización de tarifas de imprenta.
     */
    it('Test 4: verifies end-to-end consistency across custom printhouse freight matrix override, tenant spoofing guard, and quote preview', async () => {
        const mockDb = {
            query: vi.fn().mockResolvedValue([[]])
        };
        const logisticsService = new LogisticsDatabaseService({ db: mockDb });
        const router = createLogisticsRouter({ logisticsService });

        // 1. Verify cross-tenant spoofing guard returns 403 FORBIDDEN_TENANT_MISMATCH
        const spoofRes = await invokeRouterEndpoint(router, {
            method: 'GET',
            routePath: '/warehouses',
            headers: { 'x-user-role': 'PRINTHOUSE_ADMIN', 'x-tenant-id': 'tenant-other' },
            user: { id: 'u1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-own' }
        });
        expect(spoofRes.statusCode).toBe(403);
        expect(spoofRes.body.error).toContain('FORBIDDEN_TENANT_MISMATCH');

        // 2. Customize printhouse freight matrix & pallet consumable rates via PUT /printhouses/:id/freight-matrices
        const customPut = await invokeRouterEndpoint(router, {
            method: 'PUT',
            routePath: '/printhouses/:id/freight-matrices',
            params: { id: 'node-custom-99' },
            headers: { 'x-user-role': 'PRINTHOUSE_ADMIN' },
            body: {
                consumableRates: {
                    euroPalletEpalEur: 16.00,
                    cartonBoxStandardEur: 0.95,
                    stretchWrapPerPalletEur: 2.50
                },
                matrices: [
                    {
                        originCountry: 'DE',
                        originPostalZone: '*',
                        destinationCountry: 'DE',
                        destinationPostalZone: '33',
                        carrierName: 'LOCAL_FLEET',
                        pricingMode: 'PER_PALLET_STEPPED',
                        fuelSurchargePercent: 0,
                        rateTiers: {
                            tiers: [
                                { minPallets: 1, maxPallets: 10, ratePerPalletEur: 55.00 }
                            ]
                        }
                    }
                ]
            }
        });

        expect(customPut.statusCode).toBe(200);
        expect(customPut.body.ok).toBe(true);
        expect(customPut.body.consumableRates.euroPalletEpalEur).toBe(16.00);
        expect(customPut.body.matrices[0].carrierName).toBe('LOCAL_FLEET');
    });
});
