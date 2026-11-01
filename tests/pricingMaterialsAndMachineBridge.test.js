'use strict';

/**
 * tests/pricingMaterialsAndMachineBridge.test.js
 *
 * PrintPrice OS — Phase 14C Verification Suite:
 * 1. Real Substrate Catalog (`materials_catalog`) hydration in MySQL with classification
 *    (`COATED` / Estucado, `UNCOATED` / Offset / Ahuesado, `BOARD` / Cartoncillo / Cubierta),
 *    `gsm`, `bulk_microns`, `cost_per_kg_eur`, and `cost_per_sheet_eur`.
 * 2. Quick-adding a new substrate (`addMaterialToCatalogAsync`) directly into `materials_catalog`
 *    and immediate availability in the pricing engine.
 * 3. Real-time calibration (`calibrateQuote`) computing paper cost from the catalog substrate's
 *    exact `gsm` and `cost_per_kg_eur`.
 * 4. Unified Product Family (`HARDCOVER`, `SOFTCOVER`, `WIRE_O`, `SADDLE_STITCH`) + Machine
 *    compatibility and Onboarding-to-Machine synchronization (`syncFromOnboardingRates`).
 */

import { describe, it, expect } from 'vitest';

const {
    hydrateTenantFromMySQL,
    getTenantMaterialsCatalogAsync,
    addMaterialToCatalogAsync,
    calibrateQuote,
    syncFromOnboardingRates,
    inferSupportedFamiliesForTechnology,
    PRODUCT_FAMILY_SPECS
} = require('../src/api/services/pricing/pricingIntelligenceService');

describe('Phase 14C: Materials Catalog (MySQL) & Product-Machine Hierarchy Bridge', () => {
    it('1. Hydrates real substrates from MySQL materials_catalog with category, gsm, bulk_microns, cost_per_kg_eur, and cost_per_sheet_eur', async () => {
        const tenantId = `tenant-mat-bridge-${Date.now()}`;
        const mockMysqlRows = {
            printer_nodes: [
                {
                    id: 'node-bcn-01',
                    tenant_id: tenantId,
                    name: 'Planta Editorial Barcelona',
                    signatures: JSON.stringify([16]),
                    rates_json: JSON.stringify({ hourly_rate_eur: 270, setup_fee_eur: 230 }),
                    status: 'ACTIVE'
                }
            ],
            printhouse_machines: [
                {
                    id: 'mach-xl106-real',
                    tenant_id: tenantId,
                    printhouse_id: 'node-bcn-01',
                    machine_name: 'Heidelberg Speedmaster XL 106-8P',
                    machine_type: 'SHEETFED_OFFSET',
                    max_sheet_width_mm: 1060,
                    max_sheet_height_mm: 750,
                    status: 'ACTIVE',
                    metadata_json: JSON.stringify({ hourlyRateEur: 275, setupFeeEur: 245 })
                },
                {
                    id: 'mach-indigo-100k',
                    tenant_id: tenantId,
                    printhouse_id: 'node-bcn-01',
                    machine_name: 'HP Indigo 100K Digital Press',
                    machine_type: 'DIGITAL_PRESS',
                    max_sheet_width_mm: 750,
                    max_sheet_height_mm: 530,
                    status: 'ACTIVE',
                    metadata_json: JSON.stringify({ hourlyRateEur: 98, setupFeeEur: 28 })
                }
            ],
            materials_catalog: [
                {
                    id: 'mat-amber-100',
                    tenant_id: tenantId,
                    printhouse_id: 'node-bcn-01',
                    material_name: 'Amber Graphic Offset',
                    material_type: 'PAPER',
                    substrate_class: 'UNCOATED',
                    gsm: 100,
                    sheet_format: '70x100',
                    finish_type: 'UNCOATED',
                    cost_per_unit: 0.0896,
                    metadata_json: JSON.stringify({
                        bulk_factor: 1.28,
                        bulk_microns: 128,
                        cost_per_kg_eur: 1.28
                    })
                },
                {
                    id: 'mat-silk-150',
                    tenant_id: tenantId,
                    printhouse_id: 'node-bcn-01',
                    material_name: 'Creator Silk Estucado Mate',
                    material_type: 'PAPER',
                    substrate_class: 'COATED',
                    gsm: 150,
                    sheet_format: '70x100',
                    finish_type: 'SILK',
                    cost_per_unit: 0.147,
                    metadata_json: JSON.stringify({
                        bulk_factor: 0.92,
                        bulk_microns: 138,
                        cost_per_kg_eur: 1.4
                    })
                },
                {
                    id: 'mat-invercote-300',
                    tenant_id: tenantId,
                    printhouse_id: 'node-bcn-01',
                    material_name: 'Invercote G Cartulina Cubierta',
                    material_type: 'BOARD',
                    substrate_class: 'BOARD',
                    gsm: 300,
                    sheet_format: '70x100',
                    finish_type: 'COATED_ONE_SIDE',
                    cost_per_unit: 0.3465,
                    metadata_json: JSON.stringify({
                        bulk_factor: 1.22,
                        bulk_microns: 366,
                        cost_per_kg_eur: 1.65
                    })
                }
            ]
        };

        const mockDb = {
            async query(sql) {
                if (sql.includes('FROM printer_nodes')) return mockMysqlRows.printer_nodes;
                if (sql.includes('FROM printhouse_machines')) return mockMysqlRows.printhouse_machines;
                if (sql.includes('FROM materials_catalog')) return mockMysqlRows.materials_catalog;
                return [];
            }
        };

        const catalogResult = await getTenantMaterialsCatalogAsync(tenantId, mockDb);
        expect(catalogResult.ok).toBe(true);
        expect(catalogResult.materials).toHaveLength(3);

        // Check grouped classification
        expect(catalogResult.groupedByCategory.UNCOATED).toHaveLength(1);
        expect(catalogResult.groupedByCategory.COATED).toHaveLength(1);
        expect(catalogResult.groupedByCategory.BOARD).toHaveLength(1);

        const amber = catalogResult.groupedByCategory.UNCOATED[0];
        expect(amber.id).toBe('mat-amber-100');
        expect(amber.gsm).toBe(100);
        expect(amber.bulk_microns).toBe(128);
        expect(amber.cost_per_kg_eur).toBe(1.28);
        expect(amber.cost_per_sheet_eur).toBeCloseTo(0.0896, 3);
    });

    it('2. Calculates paper cost in calibrateQuote using the selected catalog substrate gsm and cost_per_kg_eur', async () => {
        const tenantId = `tenant-calc-paper-${Date.now()}`;
        const insertedQueries = [];
        const mockDb = {
            async query(sql, params) {
                if (sql.includes('INSERT INTO materials_catalog')) {
                    insertedQueries.push({ sql, params });
                }
                return [];
            }
        };

        // Add a custom substrate via `addMaterialToCatalogAsync`
        const added = await addMaterialToCatalogAsync(
            tenantId,
            {
                id: 'mat-munken-polar-120',
                material_name: 'Munken Polar Rough',
                gsm: 120,
                bulkFactor: 1.4,
                cost_per_kg_eur: 1.60,
                substrate_class: 'UNCOATED'
            },
            mockDb
        );

        expect(added.ok).toBe(true);
        expect(added.material.paperId).toBe('mat-munken-polar-120');
        expect(added.material.gsm).toBe(120);
        expect(added.material.cost_per_kg_eur).toBe(1.6);
        expect(insertedQueries.length).toBe(1);

        // Run calibrateQuote with the newly registered substrate
        const quote = calibrateQuote(tenantId, {
            productFamily: 'HARDCOVER',
            bindingType: 'HARDCOVER',
            trimSize: '150x230',
            pages: 256,
            copies: 1000,
            paperId: 'mat-munken-polar-120'
        });

        expect(quote.ok).toBe(true);
        expect(quote.spec.productFamily).toBe('HARDCOVER');
        expect(quote.spec.paperId).toBe('mat-munken-polar-120');
        expect(quote.spec.grammageGsm).toBe(120);
        expect(quote.spec.costPerKgEur).toBe(1.6);

        // Paper cost must strictly equal paperWeightKg * 1.60 €/kg (rounded to 2 decimals)
        const expectedPaperCost = Math.round((quote.breakdown.paperWeightKg * 1.6 + Number.EPSILON) * 100) / 100;
        expect(quote.breakdown.paperCostEur).toBeCloseTo(expectedPaperCost, 2);
    });

    it('3. Validates compatibility between the 4 product families (HARDCOVER, SOFTCOVER, WIRE_O, SADDLE_STITCH) and machines, and syncs Onboarding rates to a target machine', async () => {
        expect(Object.keys(PRODUCT_FAMILY_SPECS)).toEqual([
            'SOFTCOVER',
            'HARDCOVER',
            'WIRE_O',
            'SADDLE_STITCH'
        ]);

        // Offset B1, Offset B2, Digital Toner support all 4 families; Web Rotary supports Softcover & Saddle Stitch
        expect(inferSupportedFamiliesForTechnology('OFFSET_B1')).toContain('HARDCOVER');
        expect(inferSupportedFamiliesForTechnology('DIGITAL_TONER')).toContain('WIRE_O');
        expect(inferSupportedFamiliesForTechnology('WEB_ROTARY')).toEqual(['SOFTCOVER', 'SADDLE_STITCH']);

        const tenantId = `tenant-family-sync-${Date.now()}`;
        const syncRes = await syncFromOnboardingRates(
            tenantId,
            {
                hourly_rate_eur: 290,
                setup_fee_eur: 260,
                target_margin_pct: 32
            },
            {
                nodeId: 'node-mad-01',
                machineId: 'mach-komori-g29',
                machineName: 'Komori Lithrone G29 (B2)',
                technology: 'OFFSET_B2',
                productFamily: 'HARDCOVER'
            },
            null
        );

        expect(syncRes.ok).toBe(true);
        expect(syncRes.syncedProfile.printerId).toBe('mach-komori-g29');
        expect(syncRes.syncedProfile.hourlyRateEur).toBe(290);
        expect(syncRes.syncedProfile.setupFeeEur).toBe(260);
        expect(syncRes.syncedProfile.targetMarginPct).toBe(32);
        expect(syncRes.syncTelemetry.productFamily).toBe('HARDCOVER');
    });
});

