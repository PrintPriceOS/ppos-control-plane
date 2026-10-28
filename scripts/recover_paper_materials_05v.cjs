#!/usr/bin/env node
'use strict';

/**
 * scripts/recover_paper_materials_05v.cjs
 *
 * MISIÓN PAPER-MATERIALS-RECOVERY-05V — Sección 5:
 * Validated Documentary Evidence & Extended Recovery Executor (Dry-Run by Default).
 *
 * Strict Governance Rules (PAPER-MATERIALS-RECOVERY-05V):
 * 1. ONLY executes writes for records individually certified as ACCREDITED in the
 *    05V audit matrices:
 *    - `docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv` (`validation_verdict = 'ACCREDITED_FOR_WRITE'`) -> 185 variants
 *    - `docs/architecture/RECOVERY_05V_MANUFACTURER_EVIDENCE.csv` (`validation_verdict = 'ACCREDITED_FOR_WRITE'`) -> 5 variants
 *    - `docs/architecture/RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv` (`validation_verdict = 'ACCREDITED_SIBLING_PROPAGATION'`) -> 60 variants
 * 2. Strictly EXCLUDES from write:
 *    - All 176 classifications reclassified as `DOCUMENTATION_REQUIRED` and 2 held in `CONFLICT_HOLD_EXCLUDED_FROM_BATCH`
 *    - All 107 D2 calipers reclassified as `DOCUMENTATION_REQUIRED`
 *    - All 7 D1 sibling calipers rejected as `REJECTED_AMBIGUOUS_PROPAGATION`
 *    - All 9 historical caliper conflicts (`CALIPER_PRESENT_SOURCE_CONFLICT` / `LIVONIA_REFERENCE_IMPORT`)
 *    - All 62 Group B attribute conflicts and 61 Group E manual exceptions.
 * 3. Compare-and-Swap (CAS) & Invariance Guards:
 *    - Caliper updates ONLY apply where `caliper_um IS NULL OR caliper_um = 0` AND `variant_id` is NOT in the 9 historical conflicts.
 *    - Classification updates NEVER touch `grain_direction` (`grain_direction = 'UNKNOWN'` guard) and NEVER touch existing `caliper_um`.
 *    - Multi-variant product guard: `paper_products` is ONLY updated when ALL sibling variants of `product_id` are accredited.
 *    - Commercial invariance: NEVER touches `supplier_paper_offers`, prices, gsm, or dimensions.
 * 4. Default mode is `DRY_RUN_SIMULATION` (zero production writes). Production write requires
 *    both `--execute` CLI flag AND `PAPER_MATERIALS_RECOVERY_05V_APPROVED=true`.
 */

const fs = require('fs');
const path = require('path');

function parseCsvContent(text) {
    const lines = String(text || '').trim().split('\n');
    if (lines.length === 0) return [];
    const parseLine = (line) => {
        const res = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQ) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') { inQ = false; }
                else { cur += ch; }
            } else {
                if (ch === '"') { inQ = true; }
                else if (ch === ',') { res.push(cur); cur = ''; }
                else { cur += ch; }
            }
        }
        res.push(cur);
        return res;
    };
    const headers = parseLine(lines[0]);
    return lines.slice(1).map(l => {
        const vals = parseLine(l);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
    });
}

function escapeSql(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    return "'" + String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

const HISTORICAL_9_CONFLICT_VARIANT_IDS = Object.freeze([
    'var_2b0314c68f5a97c7',
    'var_7b7e3a2a2a4a0313',
    'var_4178aecbfa53dcf8',
    'var_c699e6a51cd6b41f',
    'var_5f5cae75e6f45671',
    'var_c28fd29bf014d9f1',
    'var_9dabfd7ac5eff6ca',
    'var_06e1d1681e4f0989',
    'var_e2f2e68304e9d4a1'
]);

/**
 * Loads the three 05V certified CSV matrices and builds the deterministic 5-way
 * segregation plan (Accredited Classifications, Accredited Calipers, Conflicts,
 * Exceptions, and Documentation Required).
 */
function buildRecovery05VPlan(options = {}) {
    const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
    const d2CsvPath = options.d2CsvPath || path.join(repoRoot, 'docs/architecture/RECOVERY_05V_MANUFACTURER_EVIDENCE.csv');
    const d1CsvPath = options.d1CsvPath || path.join(repoRoot, 'docs/architecture/RECOVERY_05V_SIBLING_CALIPER_VALIDATION.csv');
    const classCsvPath = options.classCsvPath || path.join(repoRoot, 'docs/architecture/RECOVERY_05V_CLASSIFICATION_EVIDENCE.csv');
    const reviewMatrix05Path = options.reviewMatrix05Path || path.join(repoRoot, 'docs/architecture/PAPER_MATERIALS_RECOVERY_05_REVIEW_MATRIX.csv');

    const d2Rows = parseCsvContent(fs.readFileSync(d2CsvPath, 'utf8'));
    const d1Rows = parseCsvContent(fs.readFileSync(d1CsvPath, 'utf8'));
    const classRows = parseCsvContent(fs.readFileSync(classCsvPath, 'utf8'));
    const matrix05Rows = parseCsvContent(fs.readFileSync(reviewMatrix05Path, 'utf8'));

    // 1. Accredited Classifications (185)
    const accreditedClassifications = classRows.filter(
        r => r.validation_verdict === 'ACCREDITED_FOR_WRITE'
    );

    // 2. Accredited Calipers (65 = 5 D2 + 60 D1)
    const accreditedD2Calipers = d2Rows
        .filter(r => r.validation_verdict === 'ACCREDITED_FOR_WRITE')
        .map(r => ({
            variant_id: r.variant_id,
            product_id: r.product_id,
            product_name: r.product_name,
            gsm: Number(r.gsm),
            proposed_caliper_um: Number(r.proposed_caliper_um),
            proposed_caliper_mm: Number((Number(r.proposed_caliper_um) / 1000).toFixed(4)),
            proposed_bulk_factor: Number((Number(r.proposed_caliper_um) / Number(r.gsm)).toFixed(4)),
            caliper_source: 'SUPPLIER_IMPORT',
            caliper_confidence_status: 'REFERENCE_IMPORTED',
            recovery_sub_group: 'D2_ARCHIVED_REFERENCE_OR_ODS_DUPLICATE',
            evidence_reference: r.document_url_or_archive_ref,
            justification: r.justification
        }));

    const accreditedD1Calipers = d1Rows
        .filter(r => r.validation_verdict === 'ACCREDITED_SIBLING_PROPAGATION')
        .map(r => ({
            variant_id: r.variant_id,
            product_id: r.product_id,
            product_name: r.target_product_name,
            gsm: Number(r.target_gsm),
            proposed_caliper_um: Number(r.proposed_caliper_um),
            proposed_caliper_mm: Number((Number(r.proposed_caliper_um) / 1000).toFixed(4)),
            proposed_bulk_factor: Number((Number(r.proposed_caliper_um) / Number(r.target_gsm)).toFixed(4)),
            caliper_source: 'SUPPLIER_IMPORT',
            caliper_confidence_status: 'REFERENCE_IMPORTED',
            recovery_sub_group: 'D1_UNANIMOUS_SIBLING_FORMAT_PROPAGATION',
            source_sibling_variant_id: r.source_sibling_variant_id,
            source_sibling_ods_row: r.source_sibling_ods_row,
            evidence_reference: `Sibling ${r.source_sibling_variant_id} (ODS Row #${r.source_sibling_ods_row}, ${r.sibling_caliper_unanimity})`,
            justification: r.justification
        }));

    const accreditedCalipers = [...accreditedD2Calipers, ...accreditedD1Calipers];

    // Safety assertion: none of the 9 historical conflicts may appear in accreditedCalipers
    const conflict9Set = new Set(HISTORICAL_9_CONFLICT_VARIANT_IDS);
    for (const cal of accreditedCalipers) {
        if (conflict9Set.has(cal.variant_id)) {
            throw new Error(`CRITICAL_CONFLICT_VIOLATION: Historical conflict ${cal.variant_id} cannot be in accreditedCalipers`);
        }
    }

    // 3. Reclassified as DOCUMENTATION_REQUIRED
    const docRequiredClassifications = classRows.filter(
        r => r.validation_verdict === 'DOCUMENTATION_REQUIRED'
    );
    const docRequiredD2Calipers = d2Rows.filter(
        r => r.validation_verdict === 'DOCUMENTATION_REQUIRED'
    );
    const rejectedD1Calipers = d1Rows.filter(
        r => r.validation_verdict !== 'ACCREDITED_SIBLING_PROPAGATION'
    );

    // 4. Conflicts (9 historical caliper conflicts + 62 Group B attribute conflicts + 2 Group C holds + 1 Group C type drift)
    const groupBAttributeConflicts = matrix05Rows.filter(
        r => r.reconciliation_classification === 'ATTRIBUTE_CONFLICT'
    );
    const groupCHoldConflicts = classRows.filter(
        r => r.validation_verdict === 'CONFLICT_HOLD_EXCLUDED_FROM_BATCH'
    );

    // 5. Manual Exceptions (Group E: 61 rows in matrix05 with HOLD_PENDING_EXPLICIT_COAT_EVIDENCE or ALREADY_VERIFIED_PRESERVED)
    const manualExceptions = matrix05Rows.filter(
        r => r.attr_resolution_status === 'HOLD_PENDING_EXPLICIT_COAT_EVIDENCE' ||
             r.attr_resolution_status === 'ALREADY_VERIFIED_PRESERVED' ||
             r.attr_resolution_status === 'HOLD_AMBIGUOUS_CONFLICTING_ODS_ROWS'
    );

    // Combined unique variant set for write
    const classByVid = new Map(accreditedClassifications.map(r => [r.variant_id, r]));
    const calByVid = new Map(accreditedCalipers.map(r => [r.variant_id, r]));
    const allAccreditedVids = new Set([...classByVid.keys(), ...calByVid.keys()]);

    const combinedWriteOperations = [];
    for (const vid of allAccreditedVids) {
        const cl = classByVid.get(vid) || null;
        const ca = calByVid.get(vid) || null;
        combinedWriteOperations.push({
            variant_id: vid,
            product_id: cl ? cl.product_id : ca.product_id,
            product_name: cl ? cl.product_name : ca.product_name,
            gsm: cl ? Number(cl.gsm) : ca.gsm,
            update_classification: Boolean(cl),
            classification_payload: cl ? {
                proposed_paper_type: cl.proposed_paper_type,
                proposed_coating_status: cl.proposed_coating_status,
                proposed_finish: cl.proposed_finish,
                evidence_tier: cl.evidence_tier,
                ods_source_row: Number(cl.ods_source_row),
                ods_code: cl.ods_code,
                ods_provider: cl.ods_provider,
                ods_paper_type_raw: cl.ods_paper_type_raw,
                ods_coat_raw: cl.ods_coat_raw,
                official_datasheet_or_archived_reference: cl.official_datasheet_or_archived_reference
            } : null,
            update_caliper: Boolean(ca),
            caliper_payload: ca ? {
                proposed_caliper_um: ca.proposed_caliper_um,
                proposed_caliper_mm: ca.proposed_caliper_mm,
                proposed_bulk_factor: ca.proposed_bulk_factor,
                caliper_source: ca.caliper_source,
                caliper_confidence_status: ca.caliper_confidence_status,
                recovery_sub_group: ca.recovery_sub_group,
                source_sibling_variant_id: ca.source_sibling_variant_id || null,
                source_sibling_ods_row: ca.source_sibling_ods_row || null,
                evidence_reference: ca.evidence_reference
            } : null
        });
    }

    return {
        mission: 'PAPER-MATERIALS-RECOVERY-05V',
        status: 'PAPER_MATERIALS_RECOVERY_05V_READY_FOR_WRITE_APPROVAL',
        counts: {
            initial_proposals_classification: classRows.length,
            accredited_classifications: accreditedClassifications.length,
            reclassified_doc_required_classifications: docRequiredClassifications.length,
            conflict_hold_classifications: groupCHoldConflicts.length,
            initial_proposals_caliper_total: d2Rows.length + d1Rows.length,
            initial_proposals_d2_datasheet: d2Rows.length,
            accredited_d2_datasheet_calipers: accreditedD2Calipers.length,
            reclassified_doc_required_d2_calipers: docRequiredD2Calipers.length,
            initial_proposals_d1_sibling: d1Rows.length,
            accredited_d1_sibling_calipers: accreditedD1Calipers.length,
            rejected_d1_sibling_calipers: rejectedD1Calipers.length,
            total_accredited_calipers: accreditedCalipers.length,
            total_reclassified_or_rejected_calipers: docRequiredD2Calipers.length + rejectedD1Calipers.length,
            historical_caliper_conflicts_preserved: HISTORICAL_9_CONFLICT_VARIANT_IDS.length,
            group_b_attribute_conflicts_held: groupBAttributeConflicts.length,
            manual_exceptions_held: manualExceptions.length,
            combined_unique_variants_for_write: combinedWriteOperations.length,
            overlap_both_classification_and_caliper: [...classByVid.keys()].filter(id => calByVid.has(id)).length
        },
        lists: {
            accreditedClassifications,
            accreditedCalipers,
            accreditedD2Calipers,
            accreditedD1Calipers,
            docRequiredClassifications,
            docRequiredD2Calipers,
            rejectedD1Calipers,
            historical9CaliperConflicts: HISTORICAL_9_CONFLICT_VARIANT_IDS,
            groupBAttributeConflicts,
            groupCHoldConflicts,
            manualExceptions,
            combinedWriteOperations
        }
    };
}

/**
 * Generates deterministic Rollback SQL from a production snapshot for the 234 unique variants
 * in `combinedWriteOperations`.
 */
function generateRollbackSql05V(plan, catalogVariants) {
    const prodById = new Map(catalogVariants.map(v => [v.variant_id || v.id, v]));
    const lines = [
        '-- Rollback SQL for PAPER-MATERIALS-RECOVERY-05V (234 Accredited Variants: 185 Classifications + 65 Calipers)',
        `-- Generated at: ${new Date().toISOString()}`,
        'START TRANSACTION;'
    ];
    const seenProducts = new Set();

    for (const op of plan.lists.combinedWriteOperations) {
        const pv = prodById.get(op.variant_id);
        if (!pv) continue;

        if (op.update_classification && !seenProducts.has(op.product_id)) {
            seenProducts.add(op.product_id);
            lines.push(
                `UPDATE paper_products SET category = ${escapeSql(pv.category)}, finish_summary = ${escapeSql(pv.finish_summary)}, metadata_json = ${escapeSql(typeof pv.product_metadata_json === 'string' ? pv.product_metadata_json : JSON.stringify(pv.product_metadata_json || {}))} WHERE id = ${escapeSql(op.product_id)};`
            );
        }

        const calUm = pv.caliper_um !== null && pv.caliper_um !== undefined ? Number(pv.caliper_um) : null;
        const calMm = pv.caliper_mm !== null && pv.caliper_mm !== undefined ? Number(pv.caliper_mm) : null;
        const bulk = pv.bulk_factor !== null && pv.bulk_factor !== undefined ? Number(pv.bulk_factor) : null;

        lines.push(
            `UPDATE paper_variants SET finish = ${escapeSql(pv.finish)}, grain_direction = ${escapeSql(pv.grain_direction)}, caliper_um = ${escapeSql(calUm)}, caliper_mm = ${escapeSql(calMm)}, bulk_factor = ${escapeSql(bulk)}, caliper_source = ${escapeSql(pv.caliper_source)}, caliper_confidence_status = ${escapeSql(pv.caliper_confidence_status)}, metadata_json = ${escapeSql(typeof pv.variant_metadata_json === 'string' ? pv.variant_metadata_json : JSON.stringify(pv.variant_metadata_json || {}))} WHERE id = ${escapeSql(op.variant_id)};`
        );
    }

    lines.push('COMMIT;');
    return lines.join('\n') + '\n';
}

/**
 * Simulates the 05V write batch against an in-memory snapshot (dry-run verification)
 * and verifies all Compare-and-Swap (CAS) and invariance guards.
 */
function simulateDryRun05V(plan, catalogVariants, eligible943VariantIds = new Set()) {
    const prodById = new Map();
    const variantsByProductId = new Map();

    for (const v of catalogVariants) {
        const copy = JSON.parse(JSON.stringify(v));
        const vid = copy.variant_id || copy.id;
        prodById.set(vid, copy);
        if (!variantsByProductId.has(copy.product_id)) {
            variantsByProductId.set(copy.product_id, []);
        }
        variantsByProductId.get(copy.product_id).push(copy);
    }

    const accreditedClassIds = new Set(plan.lists.accreditedClassifications.map(r => r.variant_id));
    const conflict9Set = new Set(HISTORICAL_9_CONFLICT_VARIANT_IDS);

    let classificationsApplied = 0;
    let productsUpdated = 0;
    let sharedProductsSkipped = 0;
    let calipersApplied = 0;

    for (const op of plan.lists.combinedWriteOperations) {
        const target = prodById.get(op.variant_id);
        if (!target) {
            throw new Error(`DRY_RUN_TARGET_NOT_FOUND: ${op.variant_id}`);
        }

        // Guard 1: Classification updates only apply to variants with grain_direction = 'UNKNOWN'
        // (Already-verified variants var_12e73b58b1b95990 and var_bc3a9bd54f4c8b38 are only in D1 caliper recovery, never in classification recovery)
        if (op.update_classification && target.grain_direction && target.grain_direction !== 'UNKNOWN') {
            throw new Error(`DRY_RUN_GRAIN_GUARD: ${op.variant_id} has grain_direction=${target.grain_direction}`);
        }

        // Guard 2: Never touch any of the 9 historical caliper conflicts
        if (op.update_caliper && conflict9Set.has(op.variant_id)) {
            throw new Error(`DRY_RUN_HISTORICAL_CONFLICT_GUARD: ${op.variant_id}`);
        }

        if (op.update_caliper) {
            // Compare-and-Swap: target must currently have NULL or 0 caliper_um
            if (target.caliper_um !== null && target.caliper_um !== undefined && Number(target.caliper_um) > 0) {
                throw new Error(`DRY_RUN_CAS_CALIPER_NOT_NULL: ${op.variant_id} already has caliper_um=${target.caliper_um}`);
            }
            target.caliper_um = op.caliper_payload.proposed_caliper_um;
            target.caliper_mm = op.caliper_payload.proposed_caliper_mm;
            target.bulk_factor = op.caliper_payload.proposed_bulk_factor;
            target.caliper_source = op.caliper_payload.caliper_source;
            target.caliper_confidence_status = op.caliper_payload.caliper_confidence_status;
            calipersApplied++;
        }

        if (op.update_classification) {
            // Compare-and-Swap: classification update must NOT alter caliper_um
            const beforeCaliper = target.caliper_um;
            target.finish = op.classification_payload.proposed_finish;
            classificationsApplied++;

            const prodSibs = variantsByProductId.get(op.product_id) || [];
            const allSibsAccredited = prodSibs.every(s => {
                const svid = s.variant_id || s.id;
                return accreditedClassIds.has(svid) || eligible943VariantIds.has(svid);
            });

            if (allSibsAccredited) {
                target.category = op.classification_payload.proposed_paper_type;
                target.finish_summary = op.classification_payload.proposed_finish;
                productsUpdated++;
            } else {
                sharedProductsSkipped++;
            }

            if (target.caliper_um !== beforeCaliper) {
                throw new Error(`DRY_RUN_CALIPER_INVARIANCE_VIOLATION on ${op.variant_id}`);
            }
        }
    }

    // Post-simulation invariants across all 1,524 variants
    let postWithCaliper = 0;
    let postMissingCaliper = 0;
    for (const v of prodById.values()) {
        if (v.caliper_um && Number(v.caliper_um) > 0) postWithCaliper++;
        else postMissingCaliper++;
    }

    return {
        ok: true,
        classificationsApplied,
        productsUpdated,
        sharedProductsSkipped,
        calipersApplied,
        postWithCaliper,
        postMissingCaliper,
        totalCatalogVariants: prodById.size
    };
}

async function main() {
    const args = process.argv.slice(2);
    const isExecute = args.includes('--execute');
    const repoRoot = path.resolve(__dirname, '..');

    const plan = buildRecovery05VPlan({ repoRoot });

    const prodSnapshotPath = process.env.PROD_SNAPSHOT_PATH ||
        'C:/Users/KIKE/.gemini/antigravity/brain/4eb15b31-1d7f-458b-b929-282177971441/scratch/prod_variants_after_recovery02.json';

    let dryRunResult = null;
    if (fs.existsSync(prodSnapshotPath)) {
        const prodSnap = JSON.parse(fs.readFileSync(prodSnapshotPath, 'utf8'));
        const eligible943CsvPath = path.join(repoRoot, 'docs/architecture/PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv');
        const eligible943Ids = new Set(
            fs.existsSync(eligible943CsvPath)
                ? parseCsvContent(fs.readFileSync(eligible943CsvPath, 'utf8')).map(r => r.variant_id)
                : []
        );
        dryRunResult = simulateDryRun05V(plan, prodSnap.variants || [], eligible943Ids);

        const rollbackSqlPath = process.env.ROLLBACK_05V_SQL_OUT_PATH ||
            'C:/Users/KIKE/.gemini/antigravity/brain/4eb15b31-1d7f-458b-b929-282177971441/scratch/rollback_paper_materials_recovery_05v.sql';
        if (fs.existsSync(path.dirname(rollbackSqlPath))) {
            fs.writeFileSync(rollbackSqlPath, generateRollbackSql05V(plan, prodSnap.variants || []), 'utf8');
        }
    }

    if (!isExecute) {
        console.log(JSON.stringify({
            ok: true,
            mission: plan.mission,
            mode: 'DRY_RUN_SIMULATION',
            status: plan.status,
            counts: plan.counts,
            dryRunResult
        }, null, 2));
        return;
    }

    if (process.env.PAPER_MATERIALS_RECOVERY_05V_APPROVED !== 'true') {
        throw new Error(
            'SAFETY_GATE_BLOCKED: Production write for PAPER-MATERIALS-RECOVERY-05V is blocked until explicit sign-off (PAPER_MATERIALS_RECOVERY_05V_APPROVED=true).'
        );
    }

    throw new Error(
        'PRODUCTION_WRITE_LOCKED_IN_05V: Per Section 5 ("No modificar producción en esta misión"), live DB execution is disabled during mission 05V.'
    );
}

if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = {
    HISTORICAL_9_CONFLICT_VARIANT_IDS,
    buildRecovery05VPlan,
    generateRollbackSql05V,
    simulateDryRun05V
};
