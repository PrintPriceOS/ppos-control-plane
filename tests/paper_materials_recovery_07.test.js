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

describe('PAPER-MATERIALS-RECOVERY-07 — Missing Caliper Investigation & Dry-Run Preparation', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const plan = buildRecovery07Plan({ repoRoot });

    it('verifies all 5 mandatory RECOVERY_07 deliverables exist in docs/architecture/', () => {
        const files = [
            'docs/architecture/RECOVERY_07_MISSING_CALIPER_INVENTORY.csv',
            'docs/architecture/RECOVERY_07_MANUFACTURER_EVIDENCE.csv',
            'docs/architecture/RECOVERY_07_CONFLICT_MATRIX.csv',
            'docs/architecture/RECOVERY_07_RECOVERY_PLAN.md',
            'docs/architecture/RECOVERY_07_FINAL_ASSESSMENT.md'
        ];
        for (const rel of files) {
            const fullPath = path.join(repoRoot, rel);
            expect(fs.existsSync(fullPath), `Missing deliverable: ${rel}`).toBe(true);
            expect(fs.statSync(fullPath).size).toBeGreaterThan(200);
        }
    });

    it('accounts for all 288 missing-caliper variants across the 6 audit categories without overlap or omission', () => {
        expect(plan.mission).toBe('PAPER-MATERIALS-RECOVERY-07');
        expect(plan.status).toBe('RECOVERY_07_READY_FOR_WRITE_APPROVAL');
        expect(plan.counts.total_missing_caliper_variants).toBe(288);

        const sumCategories =
            plan.counts.manufacturer_datasheet_verified +
            plan.counts.supplier_reference_imported +
            plan.counts.sibling_format_documented +
            plan.counts.physical_measurement_required +
            plan.counts.conflict_hold_missing +
            plan.counts.documentation_required;

        expect(sumCategories).toBe(288);
        expect(plan.counts.manufacturer_datasheet_verified).toBe(53);
        expect(plan.counts.supplier_reference_imported).toBe(4);
        expect(plan.counts.sibling_format_documented).toBe(15);
        expect(plan.counts.recoverable_total).toBe(72);

        expect(plan.counts.physical_measurement_required).toBe(144);
        expect(plan.counts.conflict_hold_missing).toBe(5);
        expect(plan.counts.documentation_required).toBe(67);
        expect(plan.counts.held_total).toBe(216);

        expect(plan.counts.projected_catalog_with_caliper_after_rec07).toBe(1308);
        expect(plan.counts.projected_catalog_missing_caliper_after_rec07).toBe(216);
    });

    it('verifies priority tier breakdown (P1 + P2 + P3 = 288 total, 72 recoverable)', () => {
        const p1 = plan.byPriorityTier.P1_INTERIOR_BOOK_PAPER;
        const p2 = plan.byPriorityTier.P2_COVER_BOARD_AND_CARD;
        const p3 = plan.byPriorityTier.P3_SPECIALTY_AND_COVERING;

        expect(p1.total + p2.total + p3.total).toBe(288);
        expect(p1.recoverable + p2.recoverable + p3.recoverable).toBe(72);
        expect(p1.recoverable).toBe(15);
        expect(p2.recoverable).toBe(27);
        expect(p3.recoverable).toBe(30);
    });

    it('enforces explicit DB enum mapping and blocks promotion to VERIFIED', () => {
        for (const op of plan.lists.writeOperations) {
            expect(VALID_DB_CALIPER_SOURCES).toContain(op.caliper_source);
            expect(VALID_DB_CONFIDENCE_STATUSES).toContain(op.caliper_confidence_status);
            expect(op.caliper_confidence_status).toBe('REFERENCE_IMPORTED');
            expect(op.caliper_confidence_status).not.toBe('VERIFIED');
            expect(op.proposed_caliper_um).toBeGreaterThan(0);
            expect(op.document_title.length).toBeGreaterThan(10);
            expect(op.document_url_or_archive_ref.length).toBeGreaterThan(10);

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

    it('verifies key high-priority P1/P2 technical accreditations and strict non-estimation on VSA-only families', () => {
        const byVid = new Map(plan.lists.writeOperations.map(op => [op.variant_id, op]));

        // Munken Print White 18 115g -> 207 um from Livonia Spine calculation.xlsx C127
        const mpw18 = byVid.get('var_e9b970adf34027f1');
        expect(mpw18).toBeDefined();
        expect(mpw18.proposed_caliper_um).toBe(207);
        expect(mpw18.caliper_source).toBe('LIVONIA_REFERENCE_IMPORT');

        // Munken Kristall 170g (192 um) & 240g (271 um)
        expect(byVid.get('var_337668698c5acef2')?.proposed_caliper_um).toBe(192);
        expect(byVid.get('var_586f4ee2a7c797c7')?.proposed_caliper_um).toBe(271);

        // Invercote G 380g (505 um), Incada Silk 280g (445 um), CrownBoard Craft 345g (535 um), Ensocoat 275g (330 um)
        expect(byVid.get('var_d9defc9b19b9adbf')?.proposed_caliper_um).toBe(505);
        expect(byVid.get('var_3810dbfc361594d9')?.proposed_caliper_um).toBe(445);
        expect(byVid.get('var_b56fd736fb2364c1')?.proposed_caliper_um).toBe(535);
        expect(byVid.get('var_78eeb512252f2d98')?.proposed_caliper_um).toBe(330);

        // VSA-only Fedrigoni families (Sirio Color 290, Sirio Pearl 300, Materica 250) must be held in DOCUMENTATION_REQUIRED
        const invByVid = new Map(plan.lists.inventoryRows.map(r => [r.variant_id, r]));
        expect(invByVid.get('var_9c0a311400d1b1f5')?.audit_category).toBe('DOCUMENTATION_REQUIRED');
        expect(invByVid.get('var_bbb217ae3a24f4df')?.audit_category).toBe('DOCUMENTATION_REQUIRED');
        expect(invByVid.get('var_66685fa48a648bd3')?.audit_category).toBe('DOCUMENTATION_REQUIRED');
    });

    it('executes dry-run simulation idempotently and generates atomic rollback SQL', () => {
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
        expect(sim.pass1.updatedCalipers).toBe(72);
        expect(sim.pass2.updatedCalipers).toBe(0);
        expect(sim.pass2.skippedAlreadyApplied).toBe(72);
        expect(sim.idempotent).toBe(true);
        expect(sim.finalCatalogCounts.with_caliper).toBe(72);
        expect(sim.finalCatalogCounts.missing_caliper).toBe(216);

        const rollbackSql = generateRollbackSql07(plan, mockCatalog);
        expect(rollbackSql).toContain('START TRANSACTION;');
        expect(rollbackSql).toContain('COMMIT;');
        expect(rollbackSql.match(/UPDATE paper_variants SET/g)?.length).toBe(72);
    });
});

