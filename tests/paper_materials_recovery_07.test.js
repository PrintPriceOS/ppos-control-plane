import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
    HISTORICAL_9_CONFLICT_VARIANT_IDS,
    VALID_DB_CALIPER_SOURCES,
    VALID_DB_CONFIDENCE_STATUSES,
    AUDIT_CATEGORY_TO_DB_ENUM_MAP,
    buildRecovery07Plan,
    generateRollbackSql07,
    simulateRecovery07DryRun
} = require('../scripts/recover_paper_materials_07.cjs');

describe('PAPER-MATERIALS-RECOVERY-07V — Final Evidence Verification & Dry-Run Preparation', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const plan = buildRecovery07Plan({ repoRoot });

    it('verifies all mandatory RECOVERY_07, RECOVERY_07V, and RECOVERY_07W deliverables exist in docs/architecture/', () => {
        const files = [
            'docs/architecture/RECOVERY_07_MISSING_CALIPER_INVENTORY.csv',
            'docs/architecture/RECOVERY_07_MANUFACTURER_EVIDENCE.csv',
            'docs/architecture/RECOVERY_07_CONFLICT_MATRIX.csv',
            'docs/architecture/RECOVERY_07_RECOVERY_PLAN.md',
            'docs/architecture/RECOVERY_07_FINAL_ASSESSMENT.md',
            'docs/architecture/RECOVERY_07V_VERIFIED_FOR_WRITE.csv',
            'docs/architecture/RECOVERY_07V_DOCUMENTATION_REQUIRED.csv',
            'docs/architecture/RECOVERY_07V_EVIDENCE_AUDIT.md',
            'docs/architecture/RECOVERY_07V_FINAL_ASSESSMENT.md',
            'docs/architecture/RECOVERY_07W_PREFLIGHT.md',
            'docs/architecture/RECOVERY_07W_SOURCE_VALIDATION.csv',
            'docs/architecture/RECOVERY_07W_BACKUP_MANIFEST.md',
            'docs/architecture/RECOVERY_07W_EXECUTION_LOG.md',
            'docs/architecture/RECOVERY_07W_BEFORE_AFTER.csv',
            'docs/architecture/RECOVERY_07W_SPINE_BPE_E2E.md',
            'docs/architecture/RECOVERY_07W_FINAL_REPORT.md'
        ];
        for (const rel of files) {
            const fullPath = path.join(repoRoot, rel);
            expect(fs.existsSync(fullPath), `Missing deliverable: ${rel}`).toBe(true);
            expect(fs.statSync(fullPath).size).toBeGreaterThan(200);
        }
    });

    it('accounts for all 288 missing-caliper variants across the 38 verified and 250 pending without overlap or omission', () => {
        expect(plan.mission).toBe('PAPER-MATERIALS-RECOVERY-07V');
        expect(plan.status).toBe('RECOVERY_07V_READY_FOR_WRITE_APPROVAL');
        expect(plan.pendingStatus).toBe('RECOVERY_07V_DOCUMENTATION_PENDING');
        expect(plan.counts.total_missing_caliper_variants).toBe(288);

        expect(plan.counts.recoverable_total).toBe(38);
        expect(plan.counts.held_total).toBe(250);
        expect(plan.counts.recoverable_total + plan.counts.held_total).toBe(288);

        expect(plan.counts.demoted_from_rec07_72).toBe(34);
        expect(plan.counts.held_from_rec07_216).toBe(216);
        expect(plan.counts.demoted_from_rec07_72 + plan.counts.held_from_rec07_216).toBe(250);

        const sumCategories =
            plan.counts.manufacturer_datasheet_verified +
            plan.counts.supplier_reference_imported +
            plan.counts.sibling_format_documented +
            plan.counts.physical_measurement_required +
            plan.counts.conflict_hold_missing +
            plan.counts.documentation_required;

        expect(sumCategories).toBe(288);
        expect(plan.counts.manufacturer_datasheet_verified).toBe(32);
        expect(plan.counts.supplier_reference_imported).toBe(3);
        expect(plan.counts.sibling_format_documented).toBe(3);

        expect(plan.counts.physical_measurement_required).toBe(145);
        expect(plan.counts.conflict_hold_missing).toBe(5);
        expect(plan.counts.documentation_required).toBe(100);

        expect(plan.counts.projected_catalog_with_caliper_after_rec07v).toBe(1274);
        expect(plan.counts.projected_catalog_missing_caliper_after_rec07v).toBe(250);
    });

    it('verifies priority tier breakdown (P1 + P2 + P3 = 288 total, 38 recoverable)', () => {
        const p1 = plan.byPriorityTier.P1_INTERIOR_BOOK_PAPER;
        const p2 = plan.byPriorityTier.P2_COVER_BOARD_AND_CARD;
        const p3 = plan.byPriorityTier.P3_SPECIALTY_AND_COVERING;

        expect(p1.total + p2.total + p3.total).toBe(288);
        expect(p1.recoverable + p2.recoverable + p3.recoverable).toBe(38);
        expect(p1.recoverable).toBe(5);
        expect(p2.recoverable).toBe(16);
        expect(p3.recoverable).toBe(17);
    });

    it('enforces direct PDF / cell coordinates, explicit DB enum mapping, and blocks promotion to VERIFIED', () => {
        for (const op of plan.lists.writeOperations) {
            expect(op.validation_verdict).toBe('RECOVERY_07V_READY_FOR_WRITE_APPROVAL');
            expect(VALID_DB_CALIPER_SOURCES).toContain(op.caliper_source);
            expect(VALID_DB_CONFIDENCE_STATUSES).toContain(op.caliper_confidence_status);
            expect(op.caliper_confidence_status).toBe('REFERENCE_IMPORTED');
            expect(op.caliper_confidence_status).not.toBe('VERIFIED');
            expect(op.canReleaseToManufacturing).toBe(false);
            expect(op.proposed_caliper_um).toBeGreaterThan(0);
            expect(op.document_title.length).toBeGreaterThan(15);
            expect(op.document_url_or_archive_ref.length).toBeGreaterThan(25);
            expect(op.page_table_or_cell_ref.length).toBeGreaterThan(15);

            // Must NOT be a bare manufacturer homepage
            expect(op.document_url_or_archive_ref).not.toMatch(/^https?:\/\/[^/]+\/?$/);

            const rule = AUDIT_CATEGORY_TO_DB_ENUM_MAP[op.audit_category];
            expect(rule.writable).toBe(true);
            expect(rule.allowed_caliper_sources).toContain(op.caliper_source);
        }
    });

    it('protects all 9 historical conflicts and all 5 missing-caliper conflict holds from writes', () => {
        expect(HISTORICAL_9_CONFLICT_VARIANT_IDS).toHaveLength(9);
        expect(plan.counts.total_conflict_matrix_rows).toBe(14);

        const writeIds = new Set(plan.lists.writeOperations.map(op => op.variant_id));
        for (const histId of HISTORICAL_9_CONFLICT_VARIANT_IDS) {
            expect(writeIds.has(histId)).toBe(false);
        }

        const missingConflicts = plan.lists.conflictRows.filter(
            r => r.conflict_scope === 'MISSING_CALIPER_CANDIDATE_CONFLICT'
        );
        expect(missingConflicts).toHaveLength(5);
        for (const mc of missingConflicts) {
            expect(writeIds.has(mc.variant_id)).toBe(false);
        }
    });

    it('verifies 07V primary audit corrections and demotions (Munken 18 = 209 um, Nautilus/Sirio/Olin/Ensocoat/Efalin demoted)', () => {
        const byVid = new Map(plan.lists.writeOperations.map(op => [op.variant_id, op]));
        const docReqByVid = new Map(plan.lists.docReqRows.map(r => [r.variant_id, r]));

        // Munken Print White 18 115g -> 209 um from Livonia Spine calculation.xlsx Cell P39/R39
        const mpw18 = byVid.get('var_e9b970adf34027f1');
        expect(mpw18).toBeDefined();
        expect(mpw18.proposed_caliper_um).toBe(209);
        expect(mpw18.caliper_source).toBe('LIVONIA_REFERENCE_IMPORT');
        expect(mpw18.page_table_or_cell_ref).toContain('P39');
        expect(mpw18.page_table_or_cell_ref).toContain('R39');

        // Munken Kristall 170g (192 um) & 240g (271 um)
        expect(byVid.get('var_337668698c5acef2')?.proposed_caliper_um).toBe(192);
        expect(byVid.get('var_586f4ee2a7c797c7')?.proposed_caliper_um).toBe(271);

        // Invercote G 380g (505 um), Incada Silk 280g (445 um), CrownBoard Craft 345g (535 um), Pergraphica 240g (328 um)
        expect(byVid.get('var_d9defc9b19b9adbf')?.proposed_caliper_um).toBe(505);
        expect(byVid.get('var_3810dbfc361594d9')?.proposed_caliper_um).toBe(445);
        expect(byVid.get('var_b56fd736fb2364c1')?.proposed_caliper_um).toBe(535);
        expect(byVid.get('var_ebd54628ffb83779')?.proposed_caliper_um).toBe(328);

        // Demoted in 07V due to primary source discrepancy, sub-series ambiguity, generic homepage, or cross-color sibling
        expect(byVid.has('var_fb2a8f3e2fe2f0d0')).toBe(false); // Nautilus SuperWhite 160g (160 vs 196 um)
        expect(docReqByVid.get('var_fb2a8f3e2fe2f0d0')?.validation_verdict).toBe('RECOVERY_07V_DOCUMENTATION_PENDING');

        expect(byVid.has('var_74c119b5749f8722')).toBe(false); // Sirio Ultra Black 280g (330 vs 370 um)
        expect(docReqByVid.get('var_74c119b5749f8722')?.validation_verdict).toBe('RECOVERY_07V_DOCUMENTATION_PENDING');

        expect(byVid.has('var_dce57fdd8e56067c')).toBe(false); // Olin Design Smooth 200g (204 vs 194 um)
        expect(docReqByVid.get('var_dce57fdd8e56067c')?.validation_verdict).toBe('RECOVERY_07V_DOCUMENTATION_PENDING');

        expect(byVid.has('var_78eeb512252f2d98')).toBe(false); // Ensocoat 275g (1S vs 2S sub-series ambiguity)
        expect(docReqByVid.get('var_78eeb512252f2d98')?.validation_verdict).toBe('RECOVERY_07V_DOCUMENTATION_PENDING');

        expect(byVid.has('var_59ea39c77a5c9fbd')).toBe(false); // Balance Silk 130 (generic homepage URL)
        expect(docReqByVid.get('var_59ea39c77a5c9fbd')?.validation_verdict).toBe('RECOVERY_07V_DOCUMENTATION_PENDING');

        expect(byVid.has('var_a7fc7fb8e188329b')).toBe(false); // Efalin Fine Linen 116 Red (duplicate ODS row + physical measurement line)
        expect(docReqByVid.get('var_a7fc7fb8e188329b')?.current_07v_category).toBe('PHYSICAL_MEASUREMENT_REQUIRED');
    });

    it('executes dry-run simulation idempotently for the 38 verified variants and generates atomic rollback SQL', () => {
        const mockCatalog = plan.lists.inventoryRows.map(r => ({
            variant_id: r.variant_id,
            caliper_um: null,
            caliper_mm: null,
            bulk_factor: null,
            caliper_source: 'NONE',
            caliper_confidence_status: 'MISSING'
        }));

        const sim = simulateRecovery07DryRun(plan, mockCatalog);
        expect(sim.mode).toBe('DRY_RUN_SIMULATION');
        expect(sim.production_writes_executed).toBe(0);
        expect(sim.pass1.updatedCalipers).toBe(38);
        expect(sim.pass2.updatedCalipers).toBe(0);
        expect(sim.pass2.skippedAlreadyApplied).toBe(38);
        expect(sim.idempotent).toBe(true);
        expect(sim.finalCatalogCounts.with_caliper).toBe(38);
        expect(sim.finalCatalogCounts.missing_caliper).toBe(250);

        const rollbackSql = generateRollbackSql07(plan, mockCatalog);
        expect(rollbackSql).toContain('START TRANSACTION;');
        expect(rollbackSql).toContain('COMMIT;');
        expect(rollbackSql.match(/UPDATE paper_variants SET/g)?.length).toBe(38);
    });

    it('verifies RECOVERY-07W Phase 1 source validation (36 EXECUTE_WRITE, 2 HOLD_DO_NOT_WRITE) and 36-row before/after audit log', () => {
        const srcValCsv = fs.readFileSync(path.join(repoRoot, 'docs/architecture/RECOVERY_07W_SOURCE_VALIDATION.csv'), 'utf8').trim().split(/\r?\n/);
        expect(srcValCsv.length).toBe(39); // 1 header + 38 rows
        const execLines = srcValCsv.slice(1).filter(l => l.includes(',EXECUTE_WRITE,'));
        const holdLines = srcValCsv.slice(1).filter(l => l.includes(',HOLD_DO_NOT_WRITE,'));
        expect(execLines.length).toBe(36);
        expect(holdLines.length).toBe(2);
        expect(holdLines.some(l => l.startsWith('var_dbd5357075534e3b,'))).toBe(true);
        expect(holdLines.some(l => l.startsWith('var_737c9a59216f4bf2,'))).toBe(true);

        const baCsv = fs.readFileSync(path.join(repoRoot, 'docs/architecture/RECOVERY_07W_BEFORE_AFTER.csv'), 'utf8').trim().split(/\r?\n/);
        expect(baCsv.length).toBe(37); // 1 header + 36 updated rows
    });
});
