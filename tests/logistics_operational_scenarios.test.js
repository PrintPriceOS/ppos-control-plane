import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const {
    BUILTIN_WAREHOUSE_PROFILES,
    TRACKING_INTEGRATION_MODES,
    SLOT_BOOKING_MANAGEMENT_MODES,
    STACKABILITY_HANDLING_MODES,
    calculateOperationalShippingScenarios,
    executeLogisticsCubingCalculation
} = require('../src/api/services/logistics/packagingAndCubingEngine');

const {
    LogisticsDatabaseService,
    evaluateFreightMatrixRow
} = require('../src/api/services/logistics/logisticsDatabaseService');

const {
    PrinthouseQuotePreviewService
} = require('../src/api/services/printhouseQuotePreviewService');

const {
    verifyMigrationBaseline
} = require('../src/services/migrationIntegrity');

describe('Phase 198B (LOGISTICS-04) — Operational Logistics Scenarios (LDM, Stackability, 48h Slot Booking & Dual Tracking)', () => {
    it('Test 1: Non-stackable pallet billed at 0.4 LDM with 1850 kg/LDM ratio taxes a 400 kg pallet at 740 kg', () => {
        const scenario = calculateOperationalShippingScenarios({
            warehouseProfile: BUILTIN_WAREHOUSE_PROFILES.ZEITFRACHT_ERFURT,
            operationalOptions: {
                palletCount: 1,
                grossWeightKg: 400,
                palletHeightMm: 1150,
                stackabilityHandling: STACKABILITY_HANDLING_MODES.STRICT_LDM_NON_STACKABLE,
                ldmTaxableWeightRatioKg: 1850.00
            }
        });

        expect(scenario.stackabilityAndLdm.stackabilityModeApplied).toBe('STRICT_LDM_NON_STACKABLE');
        expect(scenario.stackabilityAndLdm.floorPositionsUsed).toBe(1);
        expect(scenario.stackabilityAndLdm.ldmTotal).toBe(0.4);
        expect(scenario.stackabilityAndLdm.actualGrossWeightKg).toBe(400);
        // 0.4 LDM * 1850 kg/LDM = 740 kg taxable weight
        expect(scenario.stackabilityAndLdm.ldmEquivalentWeightKg).toBe(740);
        expect(scenario.stackabilityAndLdm.taxableWeightKg).toBe(740);

        // Verify impact on carrierFreightCostEur when evaluated against a volumetric/LDM freight matrix vs Double-Deck
        const volumetricMatrixRow = {
            id: 'frm-test-volumetric-ldm',
            carrier_name: 'SCHENKER',
            origin_country: 'DE',
            origin_postal_zone: '*',
            destination_country: 'DE',
            destination_postal_zone: '99',
            pricing_mode: 'PER_KG_VOLUMETRIC',
            rate_tiers_json: {
                ratePer100KgEur: 15.00,
                minChargeEur: 50.00
            },
            fuel_surcharge_percent: 0,
            tail_lift_surcharge_eur: 0,
            stackability_handling: 'STRICT_LDM_NON_STACKABLE',
            ldm_taxable_weight_ratio_kg: 1850.00
        };

        const nonStackableEval = evaluateFreightMatrixRow(volumetricMatrixRow, {
            palletCount: 1,
            grossWeightKg: 400
        });
        expect(nonStackableEval.taxableWeightKg).toBe(740);
        // 740 kg * (€15 / 100 kg) = €111.00 (vs €60.00 if billed on 400 kg actual weight)
        expect(nonStackableEval.totalFreightEur).toBe(111.00);

        const doubleDeckEval = evaluateFreightMatrixRow(
            { ...volumetricMatrixRow, stackability_handling: 'DOUBLE_DECK_SUPPORTED' },
            { palletCount: 1, grossWeightKg: 400 }
        );
        expect(doubleDeckEval.taxableWeightKg).toBe(400);
        expect(doubleDeckEval.totalFreightEur).toBe(60.00);
    });

    it('Test 2: Consolidates 2 half-pallets of 550 mm height stacked at printshop into 1 floor position (0.4 LDM)', () => {
        const scenario = calculateOperationalShippingScenarios({
            warehouseProfile: BUILTIN_WAREHOUSE_PROFILES.ZEITFRACHT_ERFURT, // H_max = 1200 mm
            operationalOptions: {
                palletCount: 2,
                grossWeightKg: 720, // 360 kg per half-pallet -> 720 kg combined <= 1000 kg
                palletHeightMm: 550,
                lastPalletHeightMm: 550,
                hasRigidFlatTop: true,
                stackabilityHandling: STACKABILITY_HANDLING_MODES.AUTO_STACK_AT_PRINTSHOP,
                ldmTaxableWeightRatioKg: 1850.00
            }
        });

        expect(scenario.stackabilityAndLdm.isEligibleForPrintshopAutoStack).toBe(true);
        expect(scenario.stackabilityAndLdm.physicalPalletCount).toBe(2);
        expect(scenario.stackabilityAndLdm.consolidatedPalletPairs).toBe(1);
        expect(scenario.stackabilityAndLdm.floorPositionsUsed).toBe(1);
        expect(scenario.stackabilityAndLdm.ldmTotal).toBe(0.4);
        expect(scenario.stackabilityAndLdm.stackabilityModeApplied).toBe('AUTO_STACK_AT_PRINTSHOP');

        // Verify freight billing uses 1 floor position instead of 2 pallets
        const steppedMatrixRow = {
            id: 'frm-test-stepped-autostack',
            carrier_name: 'DACHSER',
            origin_country: 'DE',
            origin_postal_zone: '*',
            destination_country: 'DE',
            destination_postal_zone: '99',
            pricing_mode: 'PER_PALLET_STEPPED',
            rate_tiers_json: {
                tiers: [
                    { minPallets: 1, maxPallets: 1, ratePerPalletEur: 85.00 },
                    { minPallets: 2, maxPallets: 2, ratePerPalletEur: 72.00 }
                ]
            },
            fuel_surcharge_percent: 0,
            tail_lift_surcharge_eur: 0,
            stackability_handling: 'AUTO_STACK_AT_PRINTSHOP'
        };

        const evalConsolidated = evaluateFreightMatrixRow(steppedMatrixRow, {
            palletCount: 2,
            floorPositionsUsed: scenario.stackabilityAndLdm.floorPositionsUsed,
            grossWeightKg: 720,
            taxableWeightKg: scenario.stackabilityAndLdm.taxableWeightKg
        });
        expect(evalConsolidated.floorPositionsUsed).toBe(1);
        expect(evalConsolidated.palletCountBilled).toBe(1);
        // 1 floor position * €85 = €85.00 (instead of 2 pallets * €72 = €144.00)
        expect(evalConsolidated.totalFreightEur).toBe(85.00);
    });

    it('Test 3: Slot booking managed by carrier (+2 days buffer) vs managed by printhouse (48h notice & email payload) + Dual Tracking', async () => {
        // 3A: Carrier-managed slot booking (+2 days transit buffer) + CARRIER_API tracking
        const carrierManaged = calculateOperationalShippingScenarios({
            warehouseProfile: BUILTIN_WAREHOUSE_PROFILES.ZEITFRACHT_ERFURT,
            operationalOptions: {
                palletCount: 2,
                grossWeightKg: 1200,
                transitDaysMin: 1,
                transitDaysMax: 2,
                slotBookingManagement: SLOT_BOOKING_MANAGEMENT_MODES.CARRIER_MANAGED,
                carrierSlotBufferDays: 2,
                trackingIntegrationMode: TRACKING_INTEGRATION_MODES.CARRIER_API
            }
        });

        expect(carrierManaged.slotBookingActionPlan.managementMode).toBe('CARRIER_MANAGED');
        expect(carrierManaged.slotBookingActionPlan.carrierSlotBufferDays).toBe(2);
        expect(carrierManaged.slotBookingActionPlan.estimatedTransitDaysEffectiveMin).toBe(3); // 1 + 2
        expect(carrierManaged.slotBookingActionPlan.estimatedTransitDaysEffectiveMax).toBe(4); // 2 + 2
        expect(carrierManaged.slotBookingActionPlan.estimatedTransitDaysEffective).toBe(4);
        expect(carrierManaged.trackingProtocol.mode).toBe('CARRIER_API');
        expect(carrierManaged.trackingProtocol.supportsAutomatedWebhooks).toBe(true);
        expect(carrierManaged.trackingProtocol.milestoneStates).toHaveLength(4);

        // 3B: Shipper-managed slot booking (48h advance notice + Zeitfracht email payload) + MANUAL_PORTAL_OR_CMR tracking
        const shipperManaged = calculateOperationalShippingScenarios({
            warehouseProfile: BUILTIN_WAREHOUSE_PROFILES.ZEITFRACHT_ERFURT,
            operationalOptions: {
                palletCount: 2,
                grossWeightKg: 1200,
                totalCartons: 64,
                requestedQuantity: 1600,
                transitDaysMin: 1,
                transitDaysMax: 2,
                slotBookingManagement: SLOT_BOOKING_MANAGEMENT_MODES.SHIPPER_MANAGED,
                trackingIntegrationMode: TRACKING_INTEGRATION_MODES.MANUAL_PORTAL_OR_CMR,
                externalTrackingPortalUrl: 'https://tracking.regional-spedition.de/lookup',
                manualTrackingId: 'CMR-2026-99098'
            }
        });

        expect(shipperManaged.slotBookingActionPlan.managementMode).toBe('SHIPPER_MANAGED');
        expect(shipperManaged.slotBookingActionPlan.advanceNoticeHours).toBe(48);
        expect(shipperManaged.slotBookingActionPlan.carrierSlotBufferDays).toBe(0);
        expect(shipperManaged.slotBookingActionPlan.estimatedTransitDaysEffective).toBe(2);
        expect(shipperManaged.slotBookingActionPlan.requiresSlotNumberOnDeliveryNote).toBe(true);
        expect(shipperManaged.slotBookingActionPlan.notificationPayload).toBeDefined();
        expect(shipperManaged.slotBookingActionPlan.notificationPayload.recipientEmail).toBe('avis-wareneingang-va@zeitfracht.de');
        expect(shipperManaged.slotBookingActionPlan.notificationPayload.shipmentSummary.totalCartonsCount).toBe(64);

        // Verify Manual Tracking & GS1-128 SSCC / NVE barcode generation
        expect(shipperManaged.trackingProtocol.mode).toBe('MANUAL_PORTAL_OR_CMR');
        expect(shipperManaged.trackingProtocol.labelStandard).toBe('GS1_128_SSCC_NVE');
        expect(shipperManaged.trackingProtocol.manualCaptureFields.externalTrackingPortalUrl).toBe('https://tracking.regional-spedition.de/lookup');
        expect(shipperManaged.trackingProtocol.manualCaptureFields.manualTrackingId).toBe('CMR-2026-99098');
        expect(shipperManaged.trackingProtocol.ssccPalletLabels).toHaveLength(2);
        expect(shipperManaged.trackingProtocol.ssccPalletLabels[0].gs1128BarcodeString).toMatch(/^\(00\)\d{18}$/);

        // 3C: Verify PrinthouseQuotePreviewService exposes all new LOGISTICS-04 fields in `logisticsCubing`
        const mockDb = {
            async query(sql) {
                if (sql.includes('FROM printer_nodes')) {
                    return [
                        {
                            id: 'node-op-test-01',
                            tenant_id: 'tenant-op-test-01',
                            name: 'Industrial Book Hub DE',
                            production_lead_days: 5,
                            limits: JSON.stringify({ min_copies: 50, max_copies: 50000, min_pages: 16, max_pages: 1200 }),
                            signatures: JSON.stringify([16, 24, 32, 8, 4]),
                            rates_json: JSON.stringify({
                                paper_price_interior_by_kilo: { offset: 1.35 },
                                paper_price_cover_by_kilo: { mc: 1.45 },
                                interior_one_colour_fixed: { '32p': 110, '16p': 70, '8p': 45, '4p': 30 },
                                interior_one_colour_var: { '32p': 0.015, '16p': 0.011, '8p': 0.008, '4p': 0.005 },
                                cover_full_colour_fixed: 95,
                                cover_full_colour_var: 0.025,
                                binding_perfect_bound_fixed: 120,
                                binding_perfect_bound_var: 0.08
                            })
                        }
                    ];
                }
                return [];
            }
        };

        const previewService = new PrinthouseQuotePreviewService({
            db: mockDb,
            logisticsService: new LogisticsDatabaseService({ db: null })
        });

        const preview = await previewService.generateQuotePreview('tenant-op-test-01', {
            copies: 1200,
            interior_pages: 256,
            book_width_mm: 148,
            book_height_mm: 210,
            paper_type_interior: 'offset',
            paper_weight_interior: 80,
            paper_bulk_interior: 1.25,
            interior_print: '1/1',
            paper_type_cover: 'mc',
            paper_weight_cover: 250,
            cover_print: '4/0',
            binding_method: 'softcover',
            delivery_country: 'DE',
            delivery_postal_code: '99098',
            warehouse_profile_code: 'ZEITFRACHT_ERFURT',
            stackability_handling: 'STRICT_LDM_NON_STACKABLE',
            slot_booking_management: 'SHIPPER_MANAGED',
            tracking_integration_mode: 'MANUAL_PORTAL_OR_CMR'
        });

        expect(preview.ok).toBe(true);
        expect(preview.logisticsCubing).toBeDefined();
        expect(preview.logisticsCubing.taxableWeightKg).toBeGreaterThanOrEqual(740);
        expect(preview.logisticsCubing.ldmTotal).toBeGreaterThan(0);
        expect(preview.logisticsCubing.floorPositionsUsed).toBeGreaterThanOrEqual(1);
        expect(preview.logisticsCubing.stackabilityModeApplied).toBe('STRICT_LDM_NON_STACKABLE');
        expect(preview.logisticsCubing.estimatedTransitDaysEffective).toBe(2);
        expect(preview.logisticsCubing.slotBookingActionPlan.managementMode).toBe('SHIPPER_MANAGED');
        expect(preview.logisticsCubing.trackingMode).toBe('MANUAL_PORTAL_OR_CMR');
    });

    it('Test 4: Verifies migration baseline integrity after incorporating Migration 177', () => {
        const baselineResult = verifyMigrationBaseline();
        expect(baselineResult).toEqual({ ok: true });
    });
});

