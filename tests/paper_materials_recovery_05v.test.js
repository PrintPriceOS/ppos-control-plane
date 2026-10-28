/**
 * tests/paper_materials_recovery_05v.test.js
 *
 * PrintPrice OS — MISIÓN PAPER-MATERIALS-RECOVERY-05V:
 * Unit & Verification Test Suite for Documentary Evidence Certification,
 * Sibling Format Validation, Conflict Reconciliation, Classification Audit,
 * and Production Write Plan Preparation.
 */

const fs = require('fs');
const path = require('path');

const {
    HISTORICAL_9_CONFLICT_VARIANT_IDS,
    buildRecovery05VPlan,
    generateRollbackSql05V,
    simulateDryRun05V
} = require('../scripts/recover_paper_materials_05v.cjs');

const repoRoot = path.resolve(__dirname, '..');

describe('MISIÓN PAPER-MATERIALS-RECOVERY-05V — Documentary Evidence & Write Plan Certification', () => {
    let plan;

    beforeAll(() => {
        plan = buildRecovery05VPlan({ repoRoot });
    });

    describe('1. Section 1 — Official Datasheet Candidates (112 D2 Rows)', () => {
        it('audits all 112 D2 proposals and accredits only the 5 with archived documentary evidence', () => {
            expect(plan.counts.initial_proposals_d2_datasheet).toBe(112);
            expect(plan.counts.accredited_d2_datasheet_calipers).toBe(5);
            expect(plan.counts.reclassified_doc_required_d2_calipers).toBe(107);
            expect(plan.counts.accredited_d2_datasheet_calipers + plan.counts.reclassified_doc_required_d2_calipers).toBe(112);
        });

        it('reclassifies all 98 bookbinding covering rows (Efalin, Geltex, Wibalin, Surbalin) and conflicting/unarchived rows as DOCUMENTATION_REQUIRED', () => {
            const docReqIds = new Set(plan.lists.docRequiredD2Calipers.map(r => r.variant_id));
            // Conflicting IQ Print 120, Maestro Print 300, Munken Polar 170 must be reclassified as DOCUMENTATION_REQUIRED
            expect(docReqIds.has('var_2f2e2255bb097267')).toBe(true); // IQ print 120 72x102 FSC (151 vs 141/144um)
            expect(docReqIds.has('var_9f43752a7fdf0360')).toBe(true); // Maestro Print 300 90x64 FSC (360 vs 324/346um)
            expect(docReqIds.has('var_fb2766157c634cc2')).toBe(true); // Munken Polar 170 102x72 FSC (sibling conflict 192 vs 238um)
            // Unarchived Munken Kristall, Balance Silk, Serixo 90 must be DOCUMENTATION_REQUIRED
            expect(docReqIds.has('var_337668698c5acef2')).toBe(true); // Munken Kristall 170
            expect(docReqIds.has('var_586f4ee2a7c797c7')).toBe(true); // Munken Kristall 240
            expect(docReqIds.has('var_321ee9ca05450fca')).toBe(true); // Serixo 90

            // Every accredited D2 row must use REFERENCE_IMPORTED (never VERIFIED)
            for (const row of plan.lists.accreditedD2Calipers) {
                expect(row.caliper_confidence_status).toBe('REFERENCE_IMPORTED');
                expect(row.evidence_reference).toMatch(/Spine calculation\.xlsx|Paper data base\.ods\.zip/);
            }
        });
    });

    describe('2. Section 2 — Sibling Format Candidates (67 D1 Rows)', () => {
        it('validates all 67 D1 proposals, approving 60 unanimous siblings and rejecting 7 ambiguous/conflicting propagations', () => {
            expect(plan.counts.initial_proposals_d1_sibling).toBe(67);
            expect(plan.counts.accredited_d1_sibling_calipers).toBe(60);
            expect(plan.counts.rejected_d1_sibling_calipers).toBe(7);
            expect(plan.counts.accredited_d1_sibling_calipers + plan.counts.rejected_d1_sibling_calipers).toBe(67);
        });

        it('rejects false-sibling Munken Print White 18 (bulk 1.8 vs 1.5), Maestro Print 170 conflict, Munken Pure Rough 100 conflict, and dyed Rainbow SKUs', () => {
            const rejectedById = new Map(plan.lists.rejectedD1Calipers.map(r => [r.variant_id, r]));
            expect(rejectedById.has('var_e9b970adf34027f1')).toBe(true);
            expect(rejectedById.get('var_e9b970adf34027f1').validation_code).toBe('REJECTED_BULK_SERIES_MISMATCH');

            expect(rejectedById.has('var_f30fa00e5c230b37')).toBe(true);
            expect(rejectedById.get('var_f30fa00e5c230b37').validation_code).toBe('REJECTED_TARGET_HAS_CONFLICTING_ODS_MICRONS');

            expect(rejectedById.has('var_24529f375c1b6341')).toBe(true);
            expect(rejectedById.get('var_24529f375c1b6341').validation_code).toBe('REJECTED_TARGET_IDENTITY_CONFLICT');

            expect(rejectedById.has('var_303c4d29091a0b5f')).toBe(true);
            expect(rejectedById.has('var_dadd87b51f6a6a43')).toBe(true);
            expect(rejectedById.has('var_289d4883082e6e4b')).toBe(true);
            expect(rejectedById.has('var_0dfa098d4381319e')).toBe(true);

            // Every approved sibling row must record its source sibling variant_id and ODS row
            for (const row of plan.lists.accreditedD1Calipers) {
                expect(row.source_sibling_variant_id).toMatch(/^var_[a-f0-9]+$/);
                expect(Number(row.source_sibling_ods_row)).toBeGreaterThan(0);
                expect(row.caliper_confidence_status).toBe('REFERENCE_IMPORTED');
            }
        });
    });

    describe('3. Section 3 — Conflict Reconciliation & Historical Conflict Protection', () => {
        it('preserves all 9 historical LIVONIA_REFERENCE_IMPORT caliper conflicts and never includes them in accredited writes', () => {
            expect(HISTORICAL_9_CONFLICT_VARIANT_IDS).toHaveLength(9);
            const accreditedCaliperIds = new Set(plan.lists.accreditedCalipers.map(r => r.variant_id));
            for (const conflictId of HISTORICAL_9_CONFLICT_VARIANT_IDS) {
                expect(accreditedCaliperIds.has(conflictId)).toBe(false);
            }
        });
    });

    describe('4. Section 4 — Paper Classifications Audit (363 Rows: 348 Group A + 15 Group C)', () => {
        it('individually audits all 363 classification candidates and separates accredited (185), DOCUMENTATION_REQUIRED (176), and CONFLICT_HOLD (2)', () => {
            expect(plan.counts.initial_proposals_classification).toBe(363);
            expect(plan.counts.accredited_classifications).toBe(185);
            expect(plan.counts.reclassified_doc_required_classifications).toBe(176);
            expect(plan.counts.conflict_hold_classifications).toBe(2);
            expect(
                plan.counts.accredited_classifications +
                plan.counts.reclassified_doc_required_classifications +
                plan.counts.conflict_hold_classifications
            ).toBe(363);
        });

        it('never accredits a finish solely by nominal inference when ODS COAT is empty and family is absent from archived Livonia reference', () => {
            for (const row of plan.lists.accreditedClassifications) {
                const hasExplicitLivonia = row.official_datasheet_or_archived_reference.includes('Livonia Spine calculation.xlsx');
                const hasExplicitOdsCoat = ['gloss', 'nekrītots', 'krītots'].includes(row.ods_coat_raw.toLowerCase().trim());
                expect(hasExplicitLivonia || hasExplicitOdsCoat).toBe(true);
            }
        });
    });

    describe('5. Section 5 — Production Write Plan, CAS Guards & Rollback Reversibility', () => {
        it('enforces Compare-and-Swap (CAS) and grain guards during dry-run simulation and generates valid rollback SQL', () => {
            const syntheticSnapshot = [
                {
                    variant_id: 'var_3d45d076a5d30a41',
                    product_id: 'prod_599baf87b55581a5',
                    product_name: 'Munken Print Cream 15 100 72x102 FSC',
                    gsm: 100,
                    category: 'OTHER',
                    finish_summary: 'UNCOATED',
                    finish: 'UNCOATED',
                    grain_direction: 'UNKNOWN',
                    caliper_um: null,
                    caliper_mm: null,
                    bulk_factor: null,
                    caliper_source: 'NONE',
                    caliper_confidence_status: 'MISSING'
                }
            ];

            // Build mini-plan for this single variant
            const singleOpPlan = {
                lists: {
                    accreditedClassifications: plan.lists.accreditedClassifications.filter(r => r.variant_id === 'var_3d45d076a5d30a41'),
                    combinedWriteOperations: plan.lists.combinedWriteOperations.filter(r => r.variant_id === 'var_3d45d076a5d30a41')
                }
            };

            const sim = simulateDryRun05V(singleOpPlan, syntheticSnapshot);
            expect(sim.ok).toBe(true);
            expect(sim.classificationsApplied).toBe(1);
            expect(sim.calipersApplied).toBe(1);

            const sql = generateRollbackSql05V(singleOpPlan, syntheticSnapshot);
            expect(sql).toContain('START TRANSACTION;');
            expect(sql).toContain("WHERE id = 'var_3d45d076a5d30a41';");
            expect(sql).toContain('COMMIT;');
        });

        it('verifies all 6 mandatory deliverable files exist in docs/architecture/', () => {
            const deliverables = [
                'docs/architecture/RECOVERY_05V_MANUFACTURER_EVIDENCE.csv',
                'docs/architecture/RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv',
                'docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv',
                'docs/architecture/RECOVERY_05V_CONFLICT_RECONCILIATION.md',
                'docs/architecture/RECOVERY_05V_PRODUCTION_WRITE_PLAN.md',
                'docs/architecture/RECOVERY_05V_FINAL_ASSESSMENT.md'
            ];
            for (const relPath of deliverables) {
                expect(fs.existsSync(path.join(repoRoot, relPath))).toBe(true);
            }
        });
    });
});

