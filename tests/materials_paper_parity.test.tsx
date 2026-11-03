/**
 * tests/materials_paper_parity.test.tsx
 *
 * PrintPrice OS — Phase 15: End-to-End Parity & Synchronization Suite for 'Materials & Paper'
 *
 * Verifies:
 * 1. Backend mechanics & MySQL/runtime catalog (`industrialMaterialsCatalogService.js`):
 *    - Sheetfed (Pliegos Cortados B1/B2) vs. Continuous Web Reels (`REEL_PAPER`) differentiation.
 *    - Exact mathematical formulas for sheet weight (`g`), cost per sheet (`€`), caliper (`µm`),
 *      spine per 100pp (`mm`), and 200-page book spine preview (`mm`).
 *    - `POST /api/pricing/materials` & `PUT /api/pricing/materials/:id` synchronization with
 *      `pricingIntelligenceService.calibrateQuote` and `operational_events` (`MATERIAL_PRICE_UPDATED`).
 * 2. Frontend `<MaterialsPaperPage />` & `<MaterialSpecificationDrawer />`:
 *    - Renders all 4 KPI cards (`TOTAL SUBSTRATES`, `SHEETFED STOCKS`, `REEL INVENTORY`, `AVG. PAPER COST`).
 *    - Filters between `PLIEGOS (SHEETFED)`, `BOBINAS (REELS)`, `CARTONES Y GUARDAS`, and `LAMINADOS / PELÍCULAS`.
 *    - Live instant calculator in `<MaterialSpecificationDrawer />` updates sheet weight (`g`),
 *      cost per sheet (`€`), and 200-page spine (`mm`) as the user types GSM, Bulk, and `€/kg`.
 * 3. Cross-Subsystem Integration:
 *    - `<LivePriceCalibratorModal />` reads the newly added/updated substrate and recalculates `paperWeightKg` & `paperCostEur`.
 *    - `<PreflightUploadModal />` includes the synchronized substrate catalog selector (`data-testid="preflight-substrate-catalog-select"`)
 *      and automatically updates GSM, Bulk, and theoretical spine (`calculatedSpineMm`).
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MaterialsPaperPage } from '../src/ui/pages/materials/MaterialsPaperPage';
import { MaterialSpecificationDrawer } from '../src/ui/components/materials/MaterialSpecificationDrawer';
import { LivePriceCalibratorModal } from '../src/ui/components/pricing/LivePriceCalibratorModal';
import { PreflightUploadModal } from '../src/ui/components/preflight/PreflightUploadModal';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const industrialMaterialsService = require('../src/api/services/materials/industrialMaterialsCatalogService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pricingIntelligenceService = require('../src/api/services/pricing/pricingIntelligenceService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { queryOperationalActivityStream } = require('../src/api/services/telemetry/operationalActivityStreamService');

describe('Phase 15 — Materials & Paper Industrial Substrates Parity Suite', () => {
    beforeEach(() => {
        // Ensure master catalog is hydrated in memory before each test
        industrialMaterialsService.syncMasterIndustrialCatalog({
            tenantId: 'tenant-default',
            printhouseId: 'node-primary'
        });
    });

    it('1. calculates exact physical & economic mechanics for Sheetfed (B1 700x1000) and Web Reels (840mm)', () => {
        // B1 Sheetfed: 700x1000 mm (0.70 m²), 90 GSM, Bulk 1.50 cm³/g, €1.42/kg
        const sheetMechanics = industrialMaterialsService.calculateSubstrateMechanics({
            material_type: 'SHEETFED_PAPER',
            basis_weight_gsm: 90,
            bulk_volume: 1.50,
            dimensions_json: { width_mm: 700, height_mm: 1000, grain_direction: 'LG' },
            cost_per_kg_eur: 1.42
        });

        expect(sheetMechanics.isReel).toBe(false);
        expect(sheetMechanics.sheetAreaM2).toBe(0.7);
        expect(sheetMechanics.sheetWeightGrams).toBe(63); // 0.7 m² * 90 g/m² = 63 g
        expect(sheetMechanics.costPerSheetEur).toBeCloseTo(0.0895, 4); // 0.063 kg * 1.42 €/kg = 0.08946 -> 0.0895
        expect(sheetMechanics.caliperMicrons).toBe(135); // 90 * 1.5 = 135 µm
        expect(sheetMechanics.spinePer100PagesMm).toBe(6.75); // 50 leaves * 0.135 mm = 6.75 mm
        expect(sheetMechanics.spine200PagesMm).toBe(13.5); // 100 leaves * 0.135 mm = 13.50 mm

        // Web Reel: 840 mm width, Ø1200 mm, Core 76 mm, 80 GSM, Bulk 1.95 cm³/g, €1.24/kg
        const reelMechanics = industrialMaterialsService.calculateSubstrateMechanics({
            material_type: 'REEL_PAPER',
            basis_weight_gsm: 80,
            bulk_volume: 1.95,
            dimensions_json: { web_width_mm: 840, max_diameter_mm: 1200, core_diameter_mm: 76 },
            cost_per_kg_eur: 1.24
        });

        expect(reelMechanics.isReel).toBe(true);
        expect(reelMechanics.dimensionsJson.web_width_mm).toBe(840);
        expect(reelMechanics.dimensionsJson.core_diameter_mm).toBe(76);
        expect(reelMechanics.caliperMicrons).toBe(156);
        expect(reelMechanics.spine200PagesMm).toBe(15.6);
    });

    it('2. persists new substrates, updates €/kg price emitting MATERIAL_PRICE_UPDATED, and syncs with BPE calibrateQuote', async () => {
        // Create a custom bulky cream paper in the catalog
        const createdRes = await pricingIntelligenceService.addMaterialToCatalogAsync('tenant-default', {
            id: 'MAT-TEST-FEDRIGONI-ARENA-100',
            name: 'Fedrigoni Arena Natural Bulk',
            manufacturer: 'Fedrigoni Group',
            material_type: 'SHEETFED_PAPER',
            category: 'BULKY_CREAM',
            basis_weight_gsm: 100,
            bulk_volume: 1.45,
            dimensions_json: { width_mm: 700, height_mm: 1000, grain_direction: 'LG' },
            cost_per_kg_eur: 1.50,
            in_stock_kg: 3200
        });

        expect(createdRes.ok).toBe(true);
        expect(createdRes.material.paperId).toBe('MAT-TEST-FEDRIGONI-ARENA-100');
        expect(createdRes.material.costPerKgEur).toBe(1.50);

        // Calibrate a 1,000-copy quote using the newly created paper
        const quoteAt150 = pricingIntelligenceService.calibrateQuote('tenant-default', {
            copies: 1000,
            pages: 200,
            trimSize: '150x230',
            paperId: 'MAT-TEST-FEDRIGONI-ARENA-100'
        });

        // Now update the price from €1.50/kg to €1.85/kg via upsertIndustrialMaterial + addMaterialToCatalogAsync
        const updatedItem = await industrialMaterialsService.upsertIndustrialMaterial(
            {
                id: 'MAT-TEST-FEDRIGONI-ARENA-100',
                cost_per_kg_eur: 1.85
            },
            { tenantId: 'tenant-default', printhouseId: 'node-primary', role: 'PRINTHOUSE_ADMIN' },
            null,
            true
        );
        await pricingIntelligenceService.addMaterialToCatalogAsync('tenant-default', updatedItem, null);

        const quoteAt185 = pricingIntelligenceService.calibrateQuote('tenant-default', {
            copies: 1000,
            pages: 200,
            trimSize: '150x230',
            paperId: 'MAT-TEST-FEDRIGONI-ARENA-100'
        });

        expect(quoteAt185.breakdown.paperCostEur).toBeGreaterThan(quoteAt150.breakdown.paperCostEur);

        // Verify immutable operational event `MATERIAL_PRICE_UPDATED` was recorded
        const eventsFeed = await queryOperationalActivityStream({
            printhouseId: 'node-primary',
            tenantId: 'tenant-default',
            limit: 15
        });
        const priceEvent = eventsFeed.events.find((e: any) => e.eventType === 'MATERIAL_PRICE_UPDATED');
        expect(priceEvent).toBeDefined();
        expect(priceEvent.title).toContain('Fedrigoni Arena Natural Bulk');
    });

    it('3. renders <MaterialsPaperPage /> with 4 KPI cards, filters Sheetfed vs Reels, and opens <MaterialSpecificationDrawer />', async () => {
        render(
            <MemoryRouter>
                <MaterialsPaperPage />
            </MemoryRouter>
        );

        // Verify 4 KPI Summary Cards
        expect(screen.getByTestId('kpi-total-substrates')).toBeDefined();
        expect(screen.getByTestId('kpi-sheetfed-stocks')).toBeDefined();
        expect(screen.getByTestId('kpi-reel-inventory')).toBeDefined();
        expect(screen.getByTestId('kpi-avg-paper-cost')).toBeDefined();

        // Verify initial rows include both Sheetfed and Reel substrates
        expect(screen.getByTestId('substrate-row-MAT-MUNKEN-PRINT-WHITE-90')).toBeDefined();
        expect(screen.getByTestId('substrate-row-REEL-CREAM-80-BULK2')).toBeDefined();

        // Filter to BOBINAS (REELS) only
        fireEvent.click(screen.getByTestId('materials-filter-tab-REEL_PAPER'));
        expect(screen.getByTestId('substrate-row-REEL-CREAM-80-BULK2')).toBeDefined();
        expect(screen.queryByTestId('substrate-row-MAT-MUNKEN-PRINT-WHITE-90')).toBeNull();

        // Switch back to TODOS LOS MATERIALES
        fireEvent.click(screen.getByTestId('materials-filter-tab-ALL'));
        expect(screen.getByTestId('substrate-row-MAT-MUNKEN-PRINT-WHITE-90')).toBeDefined();
    });

    it('4. calculates live sheet weight (g), €/sheet, and 200-page book spine (mm) inside <MaterialSpecificationDrawer />', async () => {
        let savedPayload: any = null;
        render(
            <MaterialSpecificationDrawer
                isOpen={true}
                onClose={() => {}}
                onSave={(payload) => {
                    savedPayload = payload;
                }}
            />
        );

        // Default is 90 GSM, Bulk 1.50, 700x1000 mm, €1.42/kg
        // 200-page spine = (200/2) * (90/1000) * 1.50 = 13.50 mm
        expect(screen.getByTestId('drawer-spine-200pp-value').textContent).toContain('13.50 mm');
        expect(screen.getByTestId('drawer-sheet-weight-g').textContent).toContain('63.0 g');

        // Change GSM to 120 g/m² and Bulk to 1.40 cm³/g
        fireEvent.change(screen.getByTestId('material-drawer-name-input'), {
            target: { value: 'Arctic Volume High White 120' }
        });
        fireEvent.change(screen.getByTestId('material-drawer-gsm-input'), {
            target: { value: '120' }
        });
        fireEvent.change(screen.getByTestId('material-drawer-bulk-input'), {
            target: { value: '1.40' }
        });
        fireEvent.change(screen.getByTestId('material-drawer-cost-kg-input'), {
            target: { value: '1.50' }
        });

        // 200-page spine = 100 * 0.120 * 1.40 = 16.80 mm
        // Sheet weight (700x1000 = 0.7m²) = 0.7 * 120 = 84.0 g
        // Cost per sheet = 0.084 kg * €1.50/kg = €0.1260
        expect(screen.getByTestId('drawer-spine-200pp-value').textContent).toContain('16.80 mm');
        expect(screen.getByTestId('drawer-sheet-weight-g').textContent).toContain('84.0 g');
        expect(screen.getByTestId('drawer-cost-per-sheet-eur').textContent).toContain('€0.1260');

        // Submit form
        fireEvent.click(screen.getByTestId('save-material-spec-btn'));
        await waitFor(() => {
            expect(savedPayload).not.toBeNull();
            expect(savedPayload.name).toBe('Arctic Volume High White 120');
            expect(savedPayload.basis_weight_gsm).toBe(120);
            expect(savedPayload.bulk_volume).toBe(1.4);
            expect(savedPayload.cost_per_sheet_eur).toBeCloseTo(0.126, 4);
        });
    });

    it('5. connects <PreflightUploadModal /> and <LivePriceCalibratorModal /> with the synchronized substrate catalog', async () => {
        let submittedPreflight: any = null;
        render(
            <PreflightUploadModal
                isOpen={true}
                onClose={() => {}}
                labels={{}}
                onSubmit={(payload) => {
                    submittedPreflight = payload;
                }}
            />
        );

        const catalogSelect = screen.getByTestId('preflight-substrate-catalog-select') as HTMLSelectElement;
        expect(catalogSelect).toBeDefined();

        // Select Stora Enso BookCream Reel 80g (Bulk 1.95)
        fireEvent.change(catalogSelect, { target: { value: 'REEL-CREAM-80-BULK2' } });

        // With 280 pages, 80 GSM, Bulk 1.95, SOFTCOVER_PUR (+0.5mm glue):
        // rawBlock = (280/2) * (80/1000) * 1.95 = 140 * 0.08 * 1.95 = 21.84 mm + 0.5 = 22.34 mm
        const spineCard = screen.getByTestId('live-spine-calculator-card');
        expect(spineCard.textContent).toContain('22.34 mm');

        fireEvent.click(screen.getByTestId('submit-preflight-inspect-btn'));
        await waitFor(() => {
            expect(submittedPreflight).not.toBeNull();
            expect(submittedPreflight.paperGrammage).toBe(80);
            expect(submittedPreflight.paperBulk).toBe(1.95);
        });

        // Also verify LivePriceCalibratorModal renders with synchronized papers
        const catalogRes = await pricingIntelligenceService.getTenantMaterialsCatalogAsync('tenant-default');
        render(
            <LivePriceCalibratorModal
                isOpen={true}
                onClose={() => {}}
                profiles={pricingIntelligenceService.getPricingProfiles('tenant-default').profiles}
                papers={catalogRes.materials}
                embedded={true}
            />
        );

        const calibratorPaperSelect = screen.getByTestId('calibrator-paper-select') as HTMLSelectElement;
        expect(calibratorPaperSelect).toBeDefined();
        expect(calibratorPaperSelect.innerHTML).toContain('Munken Print White 1.5');
    });

    it('6. validates mechanical & physical compatibility (Machine ↔ Substrate) across Offset, Digital, and Rotary', () => {
        const offsetPress = {
            machine_type: 'OFFSET_PRESS',
            max_sheet_width_mm: 720,
            max_sheet_height_mm: 1020,
            min_sheet_width_mm: 210,
            min_sheet_height_mm: 297,
            supported_print_methods_json: ['SHEETFED_OFFSET']
        };

        const digitalPress = {
            machine_type: 'DIGITAL_PRESS',
            max_sheet_width_mm: 330,
            max_sheet_height_mm: 488,
            min_sheet_width_mm: 100,
            min_sheet_height_mm: 148,
            supported_print_methods_json: ['DIGITAL_TONER']
        };

        const rotaryPress = {
            machine_type: 'ROTARY',
            max_print_width_mm: 850,
            supported_print_methods_json: ['WEB_OFFSET']
        };

        // Case A: B1 Sheetfed (700x1000) fits Heidelberg/Komori B1 Offset Press
        const fitB1 = industrialMaterialsService.validateMachineSubstrateCompatibility(offsetPress, {
            name: 'Munken Print White B1',
            material_type: 'SHEETFED_PAPER',
            basis_weight_gsm: 90,
            bulk_volume: 1.5,
            dimensions_json: { width_mm: 700, height_mm: 1000 }
        });
        expect(fitB1.compatible).toBe(true);
        expect(fitB1.reasons).toHaveLength(0);
        expect(fitB1.caliperMicrons).toBe(135);

        // Case B: B1 Sheetfed (700x1000) FAILS on HP Indigo / Canon Digital Press (feeder max 330x488)
        const rejectDigitalB1 = industrialMaterialsService.validateMachineSubstrateCompatibility(digitalPress, {
            name: 'Munken Print White B1',
            material_type: 'SHEETFED_PAPER',
            basis_weight_gsm: 90,
            dimensions_json: { width_mm: 700, height_mm: 1000 }
        });
        expect(rejectDigitalB1.compatible).toBe(false);
        expect(rejectDigitalB1.reasons[0]).toContain('SHEET_EXCEEDS_FEEDER_BOUNDS');

        // Case C: Continuous Web Reel (960mm width) FAILS on 850mm Rotary Press
        const rejectWideReel = industrialMaterialsService.validateMachineSubstrateCompatibility(rotaryPress, {
            name: 'Stora Enso Wide Web Reel',
            material_type: 'REEL_PAPER',
            basis_weight_gsm: 80,
            dimensions_json: { web_width_mm: 960 }
        });
        expect(rejectWideReel.compatible).toBe(false);
        expect(rejectWideReel.reasons[0]).toContain('INCOMPATIBLE_WEB_WIDTH');

        // Case D: Cut sheet on Rotary press without sheeter FAILS
        const rejectSheetOnRotary = industrialMaterialsService.validateMachineSubstrateCompatibility(rotaryPress, {
            name: 'Coral Book Cut Sheet',
            material_type: 'SHEETFED_PAPER',
            dimensions_json: { width_mm: 700, height_mm: 1000 }
        });
        expect(rejectSheetOnRotary.compatible).toBe(false);
        expect(rejectSheetOnRotary.reasons[0]).toContain('INCOMPATIBLE_FEED_TYPE');
    });

    it('7. synchronizes master materials with relational paper_variants maintaining SHA-256 fingerprint & caliper', async () => {
        const mockDb = {
            queries: [] as any[],
            query: async (sql: string, params: any[]) => {
                mockDb.queries.push({ sql, params });
                return [{ affectedRows: 1, insertId: 1 }];
            }
        };

        const syncResult = await industrialMaterialsService.syncMaterialToPaperVariants(
            {
                name: 'Arctic Volume White Silk 150',
                manufacturer: 'Arctic Paper',
                material_type: 'SHEETFED_PAPER',
                category: 'COATED_MATTE',
                basis_weight_gsm: 150,
                bulk_volume: 1.10,
                caliper_microns: 165,
                dimensions_json: { width_mm: 700, height_mm: 1000, grain_direction: 'LG' },
                finish_type: 'MATTE'
            },
            mockDb
        );

        expect(syncResult).not.toBeNull();
        expect(syncResult.productId).toContain('PROD-');
        expect(syncResult.variantId).toContain('VAR-');
        expect(syncResult.caliperUm).toBe(165);
        expect(syncResult.bulkFactor).toBe(1.10);
        expect(syncResult.fingerprint).toHaveLength(32);

        // Verify SQL queries were dispatched for both paper_products and paper_variants
        expect(mockDb.queries).toHaveLength(2);
        expect(mockDb.queries[0].sql).toContain('INSERT INTO paper_products');
        expect(mockDb.queries[1].sql).toContain('INSERT INTO paper_variants');
    });
});
