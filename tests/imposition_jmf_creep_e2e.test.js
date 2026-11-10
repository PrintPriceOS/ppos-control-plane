/**
 * tests/imposition_jmf_creep_e2e.test.js
 *
 * Verification suite for JMF Imposition (16pp vs 32pp) and Caliper-Based Creep Compensation:
 * 1. Contrast between 80 µm standard offset and 140 µm bulky cream paper produces proportional,
 *    differentiated progressive creep values without static 100 µm fallback.
 * 2. 16pp vs 32pp signature partitioning evaluates usable sheet area, gripper margins, grain
 *    direction (LG vs SG), folder fold capacity, and substrate caliper threshold (> 125 µm steps down to 16pp).
 * 3. CIP4 JDF 1.7 / JMF XML output contains Device ID, SheetLayout, MarksList, and FoldingIntent.
 * 4. Preventive folding tolerance warning triggers when accumulated block thickness or creep exceeds threshold.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const impositionEngine = require('../src/api/services/manufacturing/impositionEngineService');
const jdfConnector = require('../src/api/services/manufacturing/jdfConnectorService');

describe('JMF Imposition (16pp vs 32pp) & Caliper-Driven Creep Compensation E2E', () => {
    it('1. Computes differentiated, proportional creep offsets for 80 µm Offset vs 140 µm Bulky Cream substrates (zero 100 µm static fallback)', () => {
        // 64 pages = 16 folded sheets (sheetIndex 1..16, max displacement at sheet #16 -> 15 increments)
        // Standard 80 µm Offset: d_leaf = 0.080 mm, sheetThickness = 4 * 0.080 = 0.320 mm -> maxCreep = 15 * 0.320 = 4.80 mm
        const creep80 = impositionEngine.calculateCreepOffset({
            pageCount: 64,
            caliperUm: 80,
            paperGrammage: 80,
            bindingType: 'SADDLE_STITCH',
            foldCompressionFactor: 1.0
        });

        // Bulky 140 µm Cream Volume Paper: d_leaf = 0.140 mm, sheetThickness = 4 * 0.140 = 0.560 mm -> maxCreep = 15 * 0.560 = 8.40 mm
        const creep140 = impositionEngine.calculateCreepOffset({
            pageCount: 64,
            caliperUm: 140,
            paperGrammage: 90,
            bindingType: 'SADDLE_STITCH',
            foldCompressionFactor: 1.0
        });

        expect(creep80.caliperUm).toBe(80);
        expect(creep80.caliperSource).toBe('CATALOG_CALIPER_UM');
        expect(creep80.leafDisplacementMm).toBe(0.08);
        expect(creep80.sheetThicknessMm).toBe(0.32);
        expect(creep80.accumulatedBlockThicknessMm).toBe(2.56); // 32 leaves * 0.08 mm
        expect(creep80.maxCreepOffsetMm).toBe(4.8);

        expect(creep140.caliperUm).toBe(140);
        expect(creep140.caliperSource).toBe('CATALOG_CALIPER_UM');
        expect(creep140.leafDisplacementMm).toBe(0.14);
        expect(creep140.sheetThicknessMm).toBe(0.56);
        expect(creep140.accumulatedBlockThicknessMm).toBe(4.48); // 32 leaves * 0.14 mm
        expect(creep140.maxCreepOffsetMm).toBe(8.4);

        // Verify exact proportionality: 140 / 80 = 1.75
        expect(creep140.maxCreepOffsetMm / creep80.maxCreepOffsetMm).toBeCloseTo(140 / 80, 5);

        // Verify gradual inward shift from outermost signature sheet (#1 = 0 mm) to center (#16 = maxCreep)
        expect(creep140.sheetOffsets[0].progressiveOffsetMm).toBe(0);
        expect(creep140.sheetOffsets[0].innerMarginAdjustmentMm).toBe(0);
        expect(creep140.sheetOffsets[7].progressiveOffsetMm).toBeCloseTo(7 * 0.56, 3);
        expect(creep140.sheetOffsets[15].progressiveOffsetMm).toBe(8.4);
        expect(creep140.sheetOffsets[15].innerMarginAdjustmentMm).toBe(-4.2);
    });

    it('2. Evaluates 16pp vs 32pp partitioning based on sheet format, gripper margin, grain direction (LG/SG), and caliper threshold', () => {
        // Case A: B1 sheet with standard 80 µm caliper -> allows 32pp signatures (7×32pp + 1×16pp for 240pp)
        const layoutB1Thin = impositionEngine.calculateSignaturesLayout({
            pageCount: 240,
            trimWidthMm: 150,
            trimHeightMm: 230,
            sheetFormat: 'B1',
            caliperUm: 80,
            grainDirection: 'LONG_GRAIN'
        });

        expect(layoutB1Thin.geometricMaxSignaturePages).toBe(32);
        expect(layoutB1Thin.maxSignaturePagesSupported).toBe(32);
        expect(layoutB1Thin.breakdownSummary).toBe('7×32pp + 1×16pp');
        // 7x32pp Sheetwise (8 plates each = 56) + 1x16pp Work-and-Turn on B1 (4 plates) = 60 plates
        expect(layoutB1Thin.signatures[0].workMode).toBe('SHEETWISE_FRONT_BACK');
        expect(layoutB1Thin.signatures[7].workMode).toBe('WORK_AND_TURN');

        // Case B: B1 sheet with heavy 140 µm caliper (> 125 µm threshold) -> steps down from 32pp to 16pp to prevent 4-fold cross wrinkling
        const layoutB1Bulky = impositionEngine.calculateSignaturesLayout({
            pageCount: 240,
            trimWidthMm: 150,
            trimHeightMm: 230,
            sheetFormat: 'B1',
            caliperUm: 140,
            grainDirection: 'LONG_GRAIN'
        });

        expect(layoutB1Bulky.geometricMaxSignaturePages).toBe(32);
        expect(layoutB1Bulky.maxSignaturePagesSupported).toBe(16);
        expect(layoutB1Bulky.breakdownSummary).toBe('15×16pp');
        expect(layoutB1Bulky.partitionConstraints).toContain(
            'CALIPER_140UM_EXCEEDS_32PP_LIMIT_125UM_DOWNGRADED_TO_16PP'
        );

        // Case C: Folder limited to 3 folds -> steps down to 16pp even on thin paper
        const layout3Folds = impositionEngine.calculateSignaturesLayout({
            pageCount: 128,
            trimWidthMm: 150,
            trimHeightMm: 230,
            sheetFormat: 'B1',
            caliperUm: 85,
            maxFolderFolds: 3
        });

        expect(layout3Folds.maxSignaturePagesSupported).toBe(16);
        expect(layout3Folds.breakdownSummary).toBe('8×16pp');
        expect(layout3Folds.partitionConstraints).toContain('FOLDER_MAX_3_FOLDS_CAP_16PP');
    });

    it('3. Generates CIP4-compliant JDF 1.7 / JMF descriptor containing Device ID, SheetLayout, MarksList, and FoldingIntent', () => {
        const ticket = jdfConnector.generateJdfJobTicketXml({
            jobId: 'JMF-CIP4-2026-01',
            isbn: '978-84-123456-7-8',
            title: 'Manual Técnico de Imposición Offset',
            totalPages: 64,
            printRunCopies: 2000,
            trimWidthMm: 170,
            trimHeightMm: 240,
            caliperUm: 140,
            paperGrammage: 100,
            grainDirection: 'SHORT_GRAIN',
            bindingType: 'SADDLE_STITCH',
            machineFormatCode: 'B1',
            variantId: 'VAR-MUNKEN-CREAM-140UM'
        });

        expect(ticket.ok).toBe(true);
        expect(ticket.deviceId).toBe('HEIDELBERG-XL106-PRINECT-01');
        expect(ticket.caliperUm).toBe(140);
        expect(ticket.maxCreepOffsetMm).toBe(8.4);
        expect(ticket.exceedsFoldingTolerance).toBe(true);

        // Verify mandatory CIP4 nodes in XML
        expect(ticket.xml).toContain('<Device ID="DEV_01"');
        expect(ticket.xml).toContain('DeviceID="HEIDELBERG-XL106-PRINECT-01"');
        expect(ticket.xml).toContain('FolderDeviceID="STAHL-KH82-FOLDER-01"');
        expect(ticket.xml).toContain('<SheetLayout SheetFormat="B1"');
        expect(ticket.xml).toContain('GripperMarginMm="12"');
        expect(ticket.xml).toContain('GrainDirection="SG"');
        expect(ticket.xml).toContain('<MarksList RegistrationMarks="true" CutMarks="true" FoldMarks="true" CollationMarks="true" ColorControlStrip="true"');
        expect(ticket.xml).toContain('<FoldingIntent ID="FI_01"');
        expect(ticket.xml).toContain('CaliperUm="140"');
        expect(ticket.xml).toContain('VariantID="VAR-MUNKEN-CREAM-140UM"');
    });

    it('4. Triggers preventive folding tolerance warning when accumulated block thickness or creep exceeds threshold', () => {
        const dispatch = impositionEngine.dispatchImpositionJob(
            {
                jobId: 'IMP-CREEP-WARN-01',
                title: 'Catálogo Grueso Caballete 64pp',
                isbn: '978-3-0000-1111-2',
                pageCount: 64,
                copies: 1000,
                sheetFormat: 'B1',
                bindingType: 'SADDLE_STITCH',
                caliperUm: 140,
                paperGrammage: 100
            },
            { tenantId: 'tenant-e2e-imposition' }
        );

        expect(dispatch.ok).toBe(true);
        expect(dispatch.caliperUm).toBe(140);
        expect(dispatch.accumulatedBlockThicknessMm).toBe(4.48);
        expect(dispatch.maxCreepOffsetMm).toBe(8.4);
        expect(dispatch.exceedsFoldingTolerance).toBe(true);
        expect(dispatch.foldingToleranceWarning).toContain('PREVENTIVE_FOLDING_WARNING');
    });
});
