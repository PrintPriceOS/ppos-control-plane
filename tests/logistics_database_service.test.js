import { describe, it, expect, vi } from 'vitest';

const {
    LogisticsDatabaseService,
    DEFAULT_FREIGHT_MATRICES
} = require('../src/api/services/logistics/logisticsDatabaseService');
const {
    verifyMigrationBaseline
} = require('../src/services/migrationIntegrity');

describe('Phase 198A (LOGISTICS-02): LogisticsDatabaseService & Migration 176 Integrity', () => {
    /**
     * TEST 1: Verificación de baseline de integridad de la migración 176.
     */
    it('Test 1: verifies migration 176 is registered in migration-integrity-baseline.json and verifyMigrationBaseline() returns { ok: true }', () => {
        const baselineCheck = verifyMigrationBaseline();
        expect(baselineCheck).toEqual({ ok: true });
    });

    /**
     * TEST 2: Consulta de perfiles de almacén (getWarehouseProfileByCode y listActiveWarehouseProfiles)
     * con conexión de base de datos mockeada.
     */
    it('Test 2: queries warehouse_delivery_profiles via mocked DB connection and maps ZEITFRACHT_ERFURT & ARVATO_VVA_GUETERSLOH accurately', async () => {
        const mockDbRows = [
            {
                id: 'wdp-zeitfracht-erfurt-001',
                code: 'ZEITFRACHT_ERFURT',
                name: 'Zeitfracht Medien GmbH (Erfurt Book Logistics Hub)',
                country_code: 'DE',
                postal_code: '99098',
                city: 'Erfurt',
                address_line: 'Ferdinand-Jühlke-Straße 7',
                max_pallet_height_mm: 1200,
                max_pallet_weight_kg: '1000.00',
                perimeter_margin_mm: 30,
                max_carton_weight_kg: '15.00',
                requires_slot_booking: 1,
                slot_booking_lead_time_hours: 48,
                requires_flat_top_layer: 0,
                requires_loading_dock: 1,
                penalty_oversized_pallet_eur: '40.00',
                penalty_unbooked_slot_eur: '128.00',
                is_active: 1
            },
            {
                id: 'wdp-arvato-vva-guetersloh-002',
                code: 'ARVATO_VVA_GUETERSLOH',
                name: 'VVA — Vereinigte Verlagsauslieferung (Arvato / Bertelsmann Gütersloh)',
                country_code: 'DE',
                postal_code: '33334',
                city: 'Gütersloh',
                address_line: 'An der Autobahn 100',
                max_pallet_height_mm: 1300,
                max_pallet_weight_kg: '700.00',
                perimeter_margin_mm: 20,
                max_carton_weight_kg: '16.00',
                requires_slot_booking: 1,
                slot_booking_lead_time_hours: 48,
                requires_flat_top_layer: 1,
                requires_loading_dock: 1,
                penalty_oversized_pallet_eur: '40.00',
                penalty_unbooked_slot_eur: '128.00',
                is_active: 1
            }
        ];

        const mockDb = {
            query: vi.fn().mockImplementation(async (sql, params) => {
                if (sql.includes('WHERE code = ?')) {
                    return [mockDbRows.filter(r => r.code === params[0])];
                }
                return [mockDbRows];
            })
        };

        const service = new LogisticsDatabaseService({ db: mockDb });

        const erfurt = await service.getWarehouseProfileByCode('ZEITFRACHT_ERFURT');
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        expect(erfurt.code).toBe('ZEITFRACHT_ERFURT');
        expect(erfurt.postalCode).toBe('99098');
        expect(erfurt.maxPalletHeightMm).toBe(1200);
        expect(erfurt.maxPalletWeightKg).toBe(1000);
        expect(erfurt.perimeterMarginMm).toBe(30);
        expect(erfurt.requiresSlotBooking).toBe(true);
        expect(erfurt.penaltyOversizedPalletEur).toBe(40);
        expect(erfurt.penaltyUnbookedSlotEur).toBe(128);

        const activeList = await service.listActiveWarehouseProfiles();
        expect(activeList).toHaveLength(2);
        expect(activeList[1].code).toBe('ARVATO_VVA_GUETERSLOH');
        expect(activeList[1].requiresFlatTopLayer).toBe(true);
    });

    /**
     * TEST 3: Resolución de escalones tarifarios LTL por palet (resolveFreightRate)
     * verificando especificidad por zona postal, recargo de combustible y plataforma elevadora.
     */
    it('Test 3: resolves stepped LTL pallet freight tiers, fuel surcharge and tail-lift fees accurately from freight_rate_matrices', async () => {
        const mockDb = {
            query: vi.fn().mockResolvedValue([DEFAULT_FREIGHT_MATRICES])
        };

        const service = new LogisticsDatabaseService({ db: mockDb });

        // 3 pallets to Erfurt (99098 -> zone '99' matches DACHSER tier 3-5 pallets @ €64.00/pallet + 6.5% fuel)
        const quote3Pallets = await service.resolveFreightRate({
            printhouseId: null,
            originCountry: 'DE',
            originPostal: '10115',
            destCountry: 'DE',
            destPostal: '99098',
            palletCount: 3,
            grossWeightKg: 2100,
            requiresTailLift: false
        });

        expect(quote3Pallets.carrierName).toBe('DACHSER');
        expect(quote3Pallets.destinationPostalZone).toBe('99');
        expect(quote3Pallets.palletCountBilled).toBe(3);
        expect(quote3Pallets.appliedTier.ratePerPalletEur).toBe(64.00);
        // Base = 3 * 64 = 192.00 EUR; Fuel = 192 * 6.5% = 12.48 EUR; Total = 204.48 EUR
        expect(quote3Pallets.baseFreightEur).toBe(192.00);
        expect(quote3Pallets.fuelSurchargeEur).toBe(12.48);
        expect(quote3Pallets.tailLiftSurchargeEur).toBe(0);
        expect(quote3Pallets.totalFreightEur).toBe(204.48);

        // 1 pallet with tail-lift required: Base = 85.00 EUR, Fuel = 5.53 EUR, Tail-lift = 35.00 EUR -> Total = 125.53 EUR
        const quote1PalletTailLift = await service.resolveFreightRate({
            printhouseId: null,
            originCountry: 'DE',
            originPostal: '10115',
            destCountry: 'DE',
            destPostal: '99098',
            palletCount: 1,
            grossWeightKg: 620,
            requiresTailLift: true
        });
        expect(quote1PalletTailLift.baseFreightEur).toBe(85.00);
        expect(quote1PalletTailLift.fuelSurchargeEur).toBe(5.53);
        expect(quote1PalletTailLift.tailLiftSurchargeEur).toBe(35.00);
        expect(quote1PalletTailLift.totalFreightEur).toBe(125.53);
    });

    /**
     * TEST 4: Cálculo integral de cotización logística (calculateFullLandedLogisticsQuote)
     * integrando packagingAndCubingEngine + consumibles persistidos + flete escalonado LTL.
     */
    it('Test 4: computes full landed logistics quote (cubing + persisted packaging consumables + stepped LTL carrier freight)', async () => {
        const mockDb = {
            query: vi.fn().mockImplementation(async (sql) => {
                if (sql.includes('FROM warehouse_delivery_profiles')) {
                    return [[{
                        id: 'wdp-zeitfracht-erfurt-001',
                        code: 'ZEITFRACHT_ERFURT',
                        name: 'Zeitfracht Medien GmbH (Erfurt Book Logistics Hub)',
                        country_code: 'DE',
                        postal_code: '99098',
                        city: 'Erfurt',
                        max_pallet_height_mm: 1200,
                        max_pallet_weight_kg: 1000.00,
                        perimeter_margin_mm: 30,
                        max_carton_weight_kg: 15.00,
                        requires_slot_booking: 1,
                        requires_flat_top_layer: 0,
                        requires_loading_dock: 1,
                        penalty_oversized_pallet_eur: 40.00,
                        penalty_unbooked_slot_eur: 128.00,
                        is_active: 1
                    }]];
                }
                if (sql.includes('FROM packaging_consumable_rates')) {
                    return [[{
                        id: 'pcr-global-default-001',
                        printhouse_id: null,
                        euro_pallet_epal_eur: '14.50',
                        carton_box_standard_eur: '0.85',
                        stretch_wrap_per_pallet_eur: '2.20',
                        is_active: 1
                    }]];
                }
                if (sql.includes('FROM freight_rate_matrices')) {
                    return [DEFAULT_FREIGHT_MATRICES.filter(m => m.destination_postal_zone === '99')];
                }
                return [[]];
            })
        };

        const service = new LogisticsDatabaseService({ db: mockDb });

        const landedQuote = await service.calculateFullLandedLogisticsQuote({
            printhouseId: 'printhouse-demo-01',
            trimWidthMm: 148,
            trimHeightMm: 210,
            bindingCategory: 'SOFTCOVER_STANDARD',
            processingType: 'GLUED',
            segments: [{ pages: 256, gsm: 80, bulk: 1.2 }],
            cover: { gsm: 240, caliperUm: 240 },
            quantity: 3000,
            warehouseProfileCode: 'ZEITFRACHT_ERFURT',
            originCountry: 'DE',
            originPostal: '80331'
        });

        // Verify consumable rates loaded from DB
        expect(landedQuote.consumableRates.euroPalletEpalEur).toBe(14.50);
        expect(landedQuote.consumableRates.cartonBoxStandardEur).toBe(0.85);
        expect(landedQuote.consumableRates.stretchWrapPerPalletEur).toBe(2.20);

        // Verify cubing & pallet count
        const totalCartons = landedQuote.cubing.palletStacking.orderBreakdown.totalCartonsRequired;
        const totalPallets = landedQuote.cubing.palletStacking.orderBreakdown.totalPalletsRequired;
        expect(totalCartons).toBeGreaterThan(60);
        expect(totalPallets).toBeGreaterThanOrEqual(2);

        // Verify strict cost segregation: packaging consumables vs carrier freight
        const expectedPackagingEur = Number(
            (totalCartons * 0.85 + totalPallets * (14.50 + 2.20)).toFixed(2)
        );
        expect(landedQuote.landedLogisticsCostSummaryEur.packagingMaterialsCostEur).toBe(expectedPackagingEur);
        expect(landedQuote.landedLogisticsCostSummaryEur.carrierFreightCostEur).toBe(landedQuote.freightQuote.totalFreightEur);
        expect(landedQuote.landedLogisticsCostSummaryEur.totalLandedLogisticsCostEur).toBeCloseTo(
            expectedPackagingEur + landedQuote.freightQuote.totalFreightEur,
            2
        );
        expect(landedQuote.landedLogisticsCostSummaryEur.logisticsCostPerCopyEur).toBeGreaterThan(0);
        expect(landedQuote.quoteCanonicalHash).toMatch(/^[a-f0-9]{64}$/);
    });
});

