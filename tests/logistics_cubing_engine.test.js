import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const {
    LOGISTICS_ENGINE_VERSION,
    BUILTIN_WAREHOUSE_PROFILES,
    calculateUnitFinishedBookWeightAndDimensions,
    calculateOptimalCartonPacking,
    calculateEuroPalletTilingAndStacking,
    validateWarehouseDeliveryConstraints,
    calculateFullPalletRunOptimization,
    executeLogisticsCubingCalculation
} = require('../src/api/services/logistics/packagingAndCubingEngine');

describe('Phase 198A (LOGISTICS-01): Pure 3D Cubing, Carton Packing & Euro-Pallet Engine', () => {
    /**
     * TEST 1: Libro Softcover estándar A5 (148x210 mm, 256 págs, 80 gsm offset bulk 1.2, 240 µm cubierta).
     */
    it('Test 1: computes exact net trimmed weight, spine thickness, carton packing and Euro-pallet stacking for standard A5 Softcover (148x210 mm, 256p, 80 gsm bulk 1.2)', () => {
        const result = executeLogisticsCubingCalculation({
            trimWidthMm: 148,
            trimHeightMm: 210,
            bindingCategory: 'SOFTCOVER_STANDARD',
            processingType: 'GLUED',
            segments: [
                {
                    segmentIndex: 1,
                    pages: 256,
                    gsm: 80,
                    bulk: 1.2 // 80 * 1.2 = 96 µm caliper
                }
            ],
            cover: {
                gsm: 240,
                caliperUm: 240 // 240 µm cover caliper
            },
            quantity: 3000,
            warehouseProfileCode: 'ZEITFRACHT_ERFURT'
        });

        // 1. Verify interior caliper resolution & block thickness:
        // 128 sheets * 96 µm = 12.288 mm net block -> glued spine ceilToStep(12.288 + 0.7, 0.5) = 13.0 mm
        expect(result.unitBook.segmentWeightBreakdown[0].caliperUm).toBe(96);
        expect(result.unitBook.spineGeometrySummary.netPaperBlockMm).toBeCloseTo(12.288, 3);
        expect(result.unitBook.spineGeometrySummary.spineWidthMm).toBe(13.0);

        // 2. Verify exact trimmed interior weight:
        // (148 * 210 * 128 * 80) / 10^9 = 0.3182592 kg -> 0.318259 kg
        expect(result.unitBook.weightBreakdownKg.interiorWeightKg).toBeCloseTo(0.318259, 5);

        // 3. Verify net cover weight:
        // Net cover width = 2 * 148 + 13 = 309 mm, height = 210 mm, gsm = 240
        // (309 * 210 * 240) / 10^9 = 0.0155736 kg -> 0.015574 kg
        expect(result.unitBook.weightBreakdownKg.coverWeightKg).toBeCloseTo(0.015574, 5);
        expect(result.unitBook.weightBreakdownKg.greyboardWeightKg).toBe(0);
        expect(result.unitBook.weightBreakdownKg.unitNetWeightKg).toBeCloseTo(0.333833, 5);

        // 4. Verify carton packing respects 15.0 kg ergonomic ceiling and tare in [0.35, 0.50] kg
        expect(result.cartonPacking.cartonTareWeightKg).toBeGreaterThanOrEqual(0.35);
        expect(result.cartonPacking.cartonTareWeightKg).toBeLessThanOrEqual(0.50);
        expect(result.cartonPacking.grossCartonWeightKg).toBeLessThanOrEqual(15.0);
        expect(result.cartonPacking.booksPerCarton).toBeGreaterThan(30);
        expect(result.cartonPacking.booksPerCarton).toBeLessThanOrEqual(44);

        // 5. Verify Euro-pallet 1200x800 with Zeitfracht 30 mm perimeter setback (usable 1140x740 mm)
        expect(result.palletStacking.palletFootprintMm.usableLengthMm).toBe(1140);
        expect(result.palletStacking.palletFootprintMm.usableWidthMm).toBe(740);
        expect(result.palletStacking.palletTareWeightKg).toBe(25.0);
        expect(result.palletStacking.fullPalletSpecs.totalHeightMm).toBeLessThanOrEqual(1200);
        expect(result.palletStacking.fullPalletSpecs.grossWeightKg).toBeLessThanOrEqual(1000);
        expect(result.warehouseValidation.isCompliant).toBe(true);
    });

    /**
     * TEST 2: Libro Hardcover voluminoso (170x240 mm, 512 págs, 100 gsm bulk 1.3, cartón 2.5 mm)
     * verificando el techo de altura de 1200 mm en Zeitfracht Erfurt vs 1300 mm / 700 kg en Arvato VVA.
     */
    it('Test 2: computes heavy Hardcover (170x240 mm, 512p, 100 gsm bulk 1.3, 2.5 mm greyboard) and enforces Zeitfracht Erfurt 1200 mm height ceiling & 30 mm setback', () => {
        const resultZeitfracht = executeLogisticsCubingCalculation({
            trimWidthMm: 170,
            trimHeightMm: 240,
            bindingCategory: 'HARDCOVER',
            processingType: 'SEWN',
            segments: [
                {
                    segmentIndex: 1,
                    pages: 512,
                    gsm: 100,
                    bulk: 1.3 // 130 µm caliper -> 256 sheets * 0.13 mm = 33.28 mm net paper block
                }
            ],
            cover: {
                gsm: 135,
                caliperUm: 135
            },
            hardcover: {
                spineShape: 'ROUND',
                boardThicknessMm: 2.5,
                boardDensityGcm3: 1.2,
                overhangMm: 2.5,
                endpapersMode: 'SEPARATE',
                endpapersGsm: 140,
                blockPaperCoating: 'UNCOATED',
                foldingSignaturePages: 16
            },
            quantity: 2500,
            warehouseProfileCode: 'ZEITFRACHT_ERFURT'
        });

        // 1. Verify greyboard & endpapers weight inclusion:
        // Interior: (170 * 240 * 256 * 100) / 10^9 = 1.04448 kg
        expect(resultZeitfracht.unitBook.weightBreakdownKg.interiorWeightKg).toBeCloseTo(1.04448, 5);
        // Greyboard (2 boards, each 164x245 mm, thickness 2.5 mm, density 1.2 g/cm3):
        // (2 * 164 * 245 * 2.5 * 1.2) / 10^6 = 0.24108 kg
        expect(resultZeitfracht.unitBook.weightBreakdownKg.greyboardWeightKg).toBeCloseTo(0.24108, 5);
        // Endpapers (4 leaves of 170x240 mm at 140 gsm):
        // (4 * 170 * 240 * 140) / 10^9 = 0.022848 kg
        expect(resultZeitfracht.unitBook.weightBreakdownKg.endpapersWeightKg).toBeCloseTo(0.022848, 5);
        // Total unit weight > 1.32 kg
        expect(resultZeitfracht.unitBook.weightBreakdownKg.unitNetWeightKg).toBeGreaterThan(1.32);

        // 2. Verify Zeitfracht Erfurt 1200 mm height ceiling & 1000 kg weight ceiling
        const fullPallet = resultZeitfracht.palletStacking.fullPalletSpecs;
        const constraints = resultZeitfracht.palletStacking.constraintsCeiling;
        expect(constraints.maxTotalPalletHeightAllowedMm).toBe(1200);
        expect(constraints.maxGrossPalletWeightAllowedKg).toBe(1000);
        expect(fullPallet.totalHeightMm).toBeLessThanOrEqual(1200);
        expect(fullPallet.grossWeightKg).toBeLessThanOrEqual(1000);

        // Verify that adding 1 extra layer would exceed either 1200 mm height or 1000 kg weight
        const cartonHeightMm = resultZeitfracht.cartonPacking.externalDimensionsMm.heightMm;
        const layerWeightKg = resultZeitfracht.palletStacking.layerGrossWeightKg;
        const nextLayerHeightMm = fullPallet.totalHeightMm + cartonHeightMm;
        const nextLayerWeightKg = fullPallet.grossWeightKg + layerWeightKg;
        expect(nextLayerHeightMm > 1200 || nextLayerWeightKg > 1000).toBe(true);

        // 3. Verify penalty detection if a warehouse override or unbooked slot occurs
        const validationWithViolations = validateWarehouseDeliveryConstraints(
            BUILTIN_WAREHOUSE_PROFILES.ZEITFRACHT_ERFURT,
            resultZeitfracht.cartonPacking,
            resultZeitfracht.palletStacking,
            {
                forcedPalletHeightMm: 1280, // Exceeds 1200 mm
                timeSlotBooked: false       // Triggers €128 unbooked slot penalty
            }
        );
        expect(validationWithViolations.isCompliant).toBe(false);
        expect(validationWithViolations.violations.some(v => v.code === 'PALLET_HEIGHT_EXCEEDS_WAREHOUSE_MAX')).toBe(true);
        expect(validationWithViolations.potentialPenalties.some(p => p.code === 'OVERSIZED_PALLET_REPALLETIZING_FEE' && p.unitFeeEur === 40)).toBe(true);
        expect(validationWithViolations.potentialPenalties.some(p => p.code === 'UNBOOKED_RAMP_SLOT_PENALTY' && p.unitFeeEur === 128)).toBe(true);
    });

    /**
     * TEST 3: Validación de sobrepeso de caja (>15 kg) y auto-ajuste de unidades por caja.
     */
    it('Test 3: detects carton overweight (>15 kg) when caller requests excessive copies per carton and auto-adjusts booksPerCarton below 15.0 kg', () => {
        const result = executeLogisticsCubingCalculation({
            trimWidthMm: 170,
            trimHeightMm: 240,
            bindingCategory: 'HARDCOVER',
            processingType: 'SEWN',
            segments: [{ pages: 512, gsm: 100, bulk: 1.3 }],
            hardcover: {
                boardThicknessMm: 2.5,
                boardDensityGcm3: 1.2,
                overhangMm: 2.5,
                endpapersMode: 'SEPARATE',
                endpapersGsm: 140
            },
            packagingOptions: {
                maxCartonWeightKg: 15.0,
                requestedBooksPerCarton: 16 // 16 * ~1.33 kg = ~21.7 kg > 15.0 kg!
            },
            quantity: 1000,
            warehouseProfileCode: 'AMAZON_EU_FBA_STD'
        });

        // Verify that the engine detected the overweight request and auto-adjusted down
        expect(result.cartonPacking.requestedBooksPerCarton).toBe(16);
        expect(result.cartonPacking.requestedCartonGrossWeightKg).toBeGreaterThan(20.0);
        expect(result.cartonPacking.autoAdjustedForOverweight).toBe(true);
        expect(result.cartonPacking.booksPerCarton).toBeLessThanOrEqual(11);
        expect(result.cartonPacking.grossCartonWeightKg).toBeLessThanOrEqual(15.0);

        // Verify warning is emitted in warehouseValidation
        expect(
            result.warehouseValidation.warnings.some(
                w => w.code === 'CARTON_BOOKS_AUTO_REDUCED_FOR_WEIGHT_LIMIT'
            )
        ).toBe(true);
    });

    /**
     * TEST 4: Algoritmo de sugerencia de palet completo (Delta Q- y Delta Q+) y eficiencia volumétrica/peso.
     */
    it('Test 4: computes exact full-pallet optimization recommendations (Delta Q- and Delta Q+) with volumetric and weight efficiency ratios', () => {
        // First get the exact booksPerFullPallet for A5 Softcover at Zeitfracht Erfurt
        const baseline = executeLogisticsCubingCalculation({
            trimWidthMm: 148,
            trimHeightMm: 210,
            bindingCategory: 'SOFTCOVER_STANDARD',
            processingType: 'GLUED',
            segments: [{ pages: 256, gsm: 80, bulk: 1.2 }],
            cover: { gsm: 240, caliperUm: 240 },
            quantity: 1000,
            warehouseProfileCode: 'ZEITFRACHT_ERFURT'
        });

        const booksPerFullPallet = baseline.palletStacking.fullPalletSpecs.booksPerFullPallet;
        expect(booksPerFullPallet).toBeGreaterThan(500);

        // Now request 2 full pallets + 250 extra books (creating a partially empty 3rd pallet)
        const unoptimizedQty = (2 * booksPerFullPallet) + 250;
        const runResult = executeLogisticsCubingCalculation({
            trimWidthMm: 148,
            trimHeightMm: 210,
            bindingCategory: 'SOFTCOVER_STANDARD',
            processingType: 'GLUED',
            segments: [{ pages: 256, gsm: 80, bulk: 1.2 }],
            cover: { gsm: 240, caliperUm: 240 },
            quantity: unoptimizedQty,
            warehouseProfileCode: 'ZEITFRACHT_ERFURT'
        });

        const opt = runResult.runOptimization;
        expect(opt.isAlreadyExactFullPallet).toBe(false);
        expect(opt.fleetEfficiency.totalPalletsBilled).toBe(3);
        expect(opt.lastPalletBooksCount).toBe(250);

        // Verify Delta Q- (reduce to 2 full pallets, saving 1 billed pallet)
        expect(opt.recommendations.reduceToFullPallets.available).toBe(true);
        expect(opt.recommendations.reduceToFullPallets.deltaBooks).toBe(-250);
        expect(opt.recommendations.reduceToFullPallets.targetQuantity).toBe(2 * booksPerFullPallet);
        expect(opt.recommendations.reduceToFullPallets.targetPalletsCount).toBe(2);
        expect(opt.recommendations.reduceToFullPallets.palletsSaved).toBe(1);

        // Verify Delta Q+ (expand to 3 full pallets without paying extra pallet freight slot)
        const expectedDeltaPlus = booksPerFullPallet - 250;
        expect(opt.recommendations.expandToFullPallets.available).toBe(true);
        expect(opt.recommendations.expandToFullPallets.deltaBooks).toBe(expectedDeltaPlus);
        expect(opt.recommendations.expandToFullPallets.targetQuantity).toBe(3 * booksPerFullPallet);
        expect(opt.recommendations.expandToFullPallets.targetPalletsCount).toBe(3);
        expect(opt.recommendations.expandToFullPallets.extraFreightPalletsIncurred).toBe(0);
        expect(opt.recommendations.expandToFullPallets.targetFleetCapacityUtilizationRatio).toBe(1.0);

        // Verify volumetric and weight efficiency ratios are in (0, 1]
        expect(opt.fleetEfficiency.fleetCapacityUtilizationRatio).toBeGreaterThan(0.6);
        expect(opt.fleetEfficiency.fleetCapacityUtilizationRatio).toBeLessThan(1.0);
        expect(opt.fleetEfficiency.fleetVolumetricEfficiencyRatio).toBeGreaterThan(0.5);
        expect(opt.fleetEfficiency.fleetWeightEfficiencyRatio).toBeGreaterThan(0.3);

        // Verify Arvato VVA flat-top-layer detection when last layer is incomplete
        const arvatoResult = executeLogisticsCubingCalculation({
            trimWidthMm: 148,
            trimHeightMm: 210,
            bindingCategory: 'SOFTCOVER_STANDARD',
            processingType: 'GLUED',
            segments: [{ pages: 256, gsm: 80, bulk: 1.2 }],
            cover: { gsm: 240, caliperUm: 240 },
            quantity: unoptimizedQty,
            warehouseProfileCode: 'ARVATO_VVA_GUETERSLOH'
        });
        expect(arvatoResult.warehouseValidation.warnings.some(w => w.code === 'NON_FLAT_TOP_LAYER_ON_LAST_PALLET')).toBe(true);
        expect(arvatoResult.runOptimization.recommendations.alignToFlatTopLayer.available).toBe(true);
    });

    /**
     * TEST 5: Aislamiento matemático (cero dependencias de base de datos, red o variables de entorno)
     * y determinismo criptográfico SHA-256.
     */
    it('Test 5: guarantees strict mathematical isolation (zero DB, network, or env dependencies) and deterministic SHA-256 hashes', () => {
        const engineFilePath = path.resolve(
            __dirname,
            '../src/api/services/logistics/packagingAndCubingEngine.js'
        );
        const sourceCode = fs.readFileSync(engineFilePath, 'utf8');

        // Must not import database pools, pg, axios, node-fetch, http, https, or read process.env
        expect(sourceCode).not.toMatch(/require\(['"](pg|axios|node-fetch|http|https|net|fs)['"]\)/);
        expect(sourceCode).not.toMatch(/db\.query|pool\.query|process\.env/);

        // Deterministic hash reproducibility across identical invocations
        const payload = {
            trimWidthMm: 148,
            trimHeightMm: 210,
            bindingCategory: 'SOFTCOVER_STANDARD',
            processingType: 'GLUED',
            segments: [{ pages: 256, gsm: 80, bulk: 1.2 }],
            cover: { gsm: 240, caliperUm: 240 },
            quantity: 1500,
            warehouseProfileCode: 'ZEITFRACHT_ERFURT'
        };

        const runA = executeLogisticsCubingCalculation(payload);
        const runB = executeLogisticsCubingCalculation(payload);

        expect(runA.engineVersion).toBe(LOGISTICS_ENGINE_VERSION);
        expect(runA.inputCanonicalHash).toMatch(/^[a-f0-9]{64}$/);
        expect(runA.outputCanonicalHash).toMatch(/^[a-f0-9]{64}$/);
        expect(runA.inputCanonicalHash).toBe(runB.inputCanonicalHash);
        expect(runA.outputCanonicalHash).toBe(runB.outputCanonicalHash);
    });
});

