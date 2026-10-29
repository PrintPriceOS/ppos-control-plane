#!/usr/bin/env node
'use strict';

/**
 * scripts/recover_paper_materials_07.cjs
 *
 * MISIÓN PAPER-MATERIALS-RECOVERY-07V — Validación final de evidencias y preparación dry-run:
 *
 * Strict Governance Rules (PAPER-MATERIALS-RECOVERY-07V):
 * 1. Scope: Evaluates the 288 variants with `caliper_um IS NULL` remaining after RECOVERY-06.
 * 2. Only prepares writes for the 38 variants individually certified as
 *    `RECOVERY_07V_READY_FOR_WRITE_APPROVAL` in `docs/architecture/RECOVERY_07V_VERIFIED_FOR_WRITE.csv`:
 *    - 32 `MANUFACTURER_DATASHEET_VERIFIED` -> `caliper_source = 'DATASHEET_VERIFIED'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`
 *    - 3 `SUPPLIER_REFERENCE_IMPORTED` -> `caliper_source IN ('LIVONIA_REFERENCE_IMPORT', 'SUPPLIER_IMPORT')`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`
 *    - 3 `SIBLING_FORMAT_DOCUMENTED` -> `caliper_source = 'SUPPLIER_IMPORT'`, `caliper_confidence_status = 'REFERENCE_IMPORTED'`
 * 3. Strictly EXCLUDES from write (250 missing-caliper variants in `RECOVERY_07V_DOCUMENTATION_REQUIRED.csv` + 9 historical conflicts):
 *    - 34 proposals from `RECOVERY-07` reclassified during `07V` (33 to `DOCUMENTATION_REQUIRED`, 1 Efalin to `PHYSICAL_MEASUREMENT_REQUIRED`)
 *    - 216 variants already held from `RECOVERY-07` (144 `PHYSICAL_MEASUREMENT_REQUIRED`, 67 `DOCUMENTATION_REQUIRED`, 5 `CONFLICT_HOLD`)
 *    - Total held by category after `07V`: 145 `PHYSICAL_MEASUREMENT_REQUIRED` (Geltex, Efalin, Wibalin, Surbalin, Sticotac, Reacto), 100 `DOCUMENTATION_REQUIRED`, 5 `CONFLICT_HOLD`
 *    - All 9 historical caliper conflicts (`HISTORICAL_PRESENT_CALIPER_CONFLICT`, `LIVONIA_REFERENCE_IMPORT`)
 * 4. Compare-and-Swap (CAS) & Invariance Guards:
 *    - Updates ONLY apply where `caliper_um IS NULL OR caliper_um <= 0` AND `id NOT IN (9 historical conflicts)`.
 *    - Never promotes any value to `VERIFIED` without physical micrometer certification or batch-signed certificate.
 *    - Industrial release remains locked (`canReleaseToManufacturing: false`).
 *    - Never modifies `paper_products` classifications, `grain_direction`, `supplier_paper_offers`, prices, gsm, or dimensions.
 * 5. Default mode is `DRY_RUN_SIMULATION` (zero production writes). Production write is locked
 *    behind both `--execute` CLI flag AND `PAPER_MATERIALS_RECOVERY_07V_APPROVED=true`.
 */

const fs = require('fs');
const path = require('path');

function parseCsvContent(text) {
    const lines = String(text || '').trim().split(/\r?\n/);
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
    return lines.slice(1).filter(Boolean).map(l => {
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
    'var_ae7dbf443ceab19a',
    'var_9dabfd7ac5eff6ca',
    'var_06e1d1681e4f0989',
    'var_e2f2e68304e9d4a1'
]);

const VALID_DB_CALIPER_SOURCES = Object.freeze([
    'MEASURED_MICROMETER',
    'MANUFACTURER_DATASHEET',
    'LIVONIA_REFERENCE_IMPORT',
    'SUPPLIER_IMPORT',
    'BULK_DERIVED',
    'DATASHEET_VERIFIED',
    'MANUAL_ADMIN',
    'NONE'
]);

const VALID_DB_CONFIDENCE_STATUSES = Object.freeze([
    'VERIFIED',
    'REFERENCE_IMPORTED',
    'PROVISIONAL_ESTIMATED',
    'ESTIMATED',
    'CONFLICT',
    'MISSING'
]);

const AUDIT_CATEGORY_TO_DB_ENUM_MAP = Object.freeze({
    MANUFACTURER_DATASHEET_VERIFIED: {
        allowed_caliper_sources: ['MANUFACTURER_DATASHEET', 'DATASHEET_VERIFIED'],
        allowed_confidence_statuses: ['REFERENCE_IMPORTED'],
        writable: true
    },
    SUPPLIER_REFERENCE_IMPORTED: {
        allowed_caliper_sources: ['LIVONIA_REFERENCE_IMPORT', 'SUPPLIER_IMPORT'],
        allowed_confidence_statuses: ['REFERENCE_IMPORTED'],
        writable: true
    },
    SIBLING_FORMAT_DOCUMENTED: {
        allowed_caliper_sources: ['SUPPLIER_IMPORT'],
        allowed_confidence_statuses: ['REFERENCE_IMPORTED'],
        writable: true
    },
    PHYSICAL_MEASUREMENT_REQUIRED: {
        allowed_caliper_sources: ['NONE'],
        allowed_confidence_statuses: ['MISSING'],
        writable: false
    },
    CONFLICT_HOLD: {
        allowed_caliper_sources: ['NONE', 'LIVONIA_REFERENCE_IMPORT'],
        allowed_confidence_statuses: ['MISSING', 'REFERENCE_IMPORTED', 'CONFLICT'],
        writable: false
    },
    DOCUMENTATION_REQUIRED: {
        allowed_caliper_sources: ['NONE'],
        allowed_confidence_statuses: ['MISSING'],
        writable: false
    }
});

/**
 * Loads the RECOVERY_07V verified and documentation-required CSV deliverables
 * and builds the deterministic classification, evidence, and dry-run write plan.
 */
function buildRecovery07Plan(options = {}) {
    const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
    const invPath = options.invPath || path.join(repoRoot, 'docs/architecture/RECOVERY_07_MISSING_CALIPER_INVENTORY.csv');
    const verifiedPath = options.verifiedPath || path.join(repoRoot, 'docs/architecture/RECOVERY_07V_VERIFIED_FOR_WRITE.csv');
    const docReqPath = options.docReqPath || path.join(repoRoot, 'docs/architecture/RECOVERY_07V_DOCUMENTATION_REQUIRED.csv');
    const confPath = options.confPath || path.join(repoRoot, 'docs/architecture/RECOVERY_07_CONFLICT_MATRIX.csv');

    const inventoryRows = parseCsvContent(fs.readFileSync(invPath, 'utf8'));
    const verifiedRows = parseCsvContent(fs.readFileSync(verifiedPath, 'utf8'));
    const docReqRows = parseCsvContent(fs.readFileSync(docReqPath, 'utf8'));
    const conflictRows = parseCsvContent(fs.readFileSync(confPath, 'utf8'));

    const conflict9Set = new Set(HISTORICAL_9_CONFLICT_VARIANT_IDS);
    const missingConflictSet = new Set(
        conflictRows
            .filter(r => r.conflict_scope === 'MISSING_CALIPER_CANDIDATE_CONFLICT')
            .map(r => r.variant_id)
    );

    const writeOperations = [];
    for (const r of verifiedRows) {
        if (r.validation_verdict !== 'RECOVERY_07V_READY_FOR_WRITE_APPROVAL') {
            continue;
        }
        if (conflict9Set.has(r.variant_id)) {
            throw new Error(`CRITICAL_GOVERNANCE_ERROR: Historical conflict ${r.variant_id} cannot be in 07V verified write list`);
        }
        if (missingConflictSet.has(r.variant_id)) {
            throw new Error(`CRITICAL_GOVERNANCE_ERROR: Missing-caliper conflict ${r.variant_id} cannot be in 07V verified write list`);
        }

        const catRule = AUDIT_CATEGORY_TO_DB_ENUM_MAP[r.evidence_category];
        if (!catRule || !catRule.writable) {
            throw new Error(`CRITICAL_GOVERNANCE_ERROR: Evidence category ${r.evidence_category} for ${r.variant_id} is not writable`);
        }
        if (!VALID_DB_CALIPER_SOURCES.includes(r.db_caliper_source) || !catRule.allowed_caliper_sources.includes(r.db_caliper_source)) {
            throw new Error(`CRITICAL_ENUM_ERROR: Invalid db_caliper_source ${r.db_caliper_source} for category ${r.evidence_category}`);
        }
        if (!VALID_DB_CONFIDENCE_STATUSES.includes(r.db_caliper_confidence_status) || !catRule.allowed_confidence_statuses.includes(r.db_caliper_confidence_status)) {
            throw new Error(`CRITICAL_ENUM_ERROR: Invalid db_caliper_confidence_status ${r.db_caliper_confidence_status} for category ${r.evidence_category}`);
        }

        const calUm = Number(r.accredited_caliper_um);
        const gsm = Number(r.gsm);
        if (!Number.isFinite(calUm) || calUm <= 0) {
            throw new Error(`CRITICAL_VALUE_ERROR: Invalid caliper_um ${r.accredited_caliper_um} for ${r.variant_id}`);
        }

        writeOperations.push({
            variant_id: r.variant_id,
            product_id: r.product_id,
            product_name: r.product_name,
            priority_tier: r.priority_tier,
            manufacturer: r.manufacturer,
            family: r.family,
            sub_series: r.sub_series,
            surface_finish: r.surface_finish,
            color_shade: r.color_shade,
            gsm,
            audit_category: r.evidence_category,
            proposed_caliper_um: calUm,
            proposed_caliper_mm: Number((calUm / 1000).toFixed(4)),
            proposed_bulk_factor: Number((calUm / gsm).toFixed(4)),
            caliper_source: r.db_caliper_source,
            caliper_confidence_status: r.db_caliper_confidence_status,
            canReleaseToManufacturing: false,
            document_title: r.primary_document_title,
            document_url_or_archive_ref: r.direct_url_or_archive_path,
            document_revision_or_date: r.document_revision_or_date,
            page_table_or_cell_ref: r.page_table_or_cell_ref,
            source_sibling_variant_id: r.source_sibling_variant_id,
            ods_source_rows: r.ods_source_rows,
            ods_code: r.ods_code,
            validation_verdict: r.validation_verdict,
            technical_justification: r.audit_justification
        });
    }

    const byAuditCategory = {
        MANUFACTURER_DATASHEET_VERIFIED: writeOperations.filter(r => r.audit_category === 'MANUFACTURER_DATASHEET_VERIFIED'),
        SUPPLIER_REFERENCE_IMPORTED: writeOperations.filter(r => r.audit_category === 'SUPPLIER_REFERENCE_IMPORTED'),
        SIBLING_FORMAT_DOCUMENTED: writeOperations.filter(r => r.audit_category === 'SIBLING_FORMAT_DOCUMENTED'),
        PHYSICAL_MEASUREMENT_REQUIRED: docReqRows.filter(r => r.current_07v_category === 'PHYSICAL_MEASUREMENT_REQUIRED'),
        CONFLICT_HOLD: docReqRows.filter(r => r.current_07v_category === 'CONFLICT_HOLD'),
        DOCUMENTATION_REQUIRED: docReqRows.filter(r => r.current_07v_category === 'DOCUMENTATION_REQUIRED')
    };

    const byPriorityTier = {
        P1_INTERIOR_BOOK_PAPER: {
            total: inventoryRows.filter(r => r.priority_tier === 'P1_INTERIOR_BOOK_PAPER').length,
            recoverable: writeOperations.filter(r => r.priority_tier === 'P1_INTERIOR_BOOK_PAPER').length
        },
        P2_COVER_BOARD_AND_CARD: {
            total: inventoryRows.filter(r => r.priority_tier === 'P2_COVER_BOARD_AND_CARD').length,
            recoverable: writeOperations.filter(r => r.priority_tier === 'P2_COVER_BOARD_AND_CARD').length
        },
        P3_SPECIALTY_AND_COVERING: {
            total: inventoryRows.filter(r => r.priority_tier === 'P3_SPECIALTY_AND_COVERING').length,
            recoverable: writeOperations.filter(r => r.priority_tier === 'P3_SPECIALTY_AND_COVERING').length
        }
    };

    return {
        mission: 'PAPER-MATERIALS-RECOVERY-07V',
        status: 'RECOVERY_07V_READY_FOR_WRITE_APPROVAL',
        pendingStatus: 'RECOVERY_07V_DOCUMENTATION_PENDING',
        counts: {
            total_missing_caliper_variants: inventoryRows.length,
            recoverable_total: writeOperations.length,
            held_total: docReqRows.length,
            demoted_from_rec07_72: docReqRows.filter(r => r.origin_in_rec07 === 'DEMOTED_FROM_REC07_72').length,
            held_from_rec07_216: docReqRows.filter(r => r.origin_in_rec07 === 'HELD_IN_REC07_216').length,
            manufacturer_datasheet_verified: byAuditCategory.MANUFACTURER_DATASHEET_VERIFIED.length,
            supplier_reference_imported: byAuditCategory.SUPPLIER_REFERENCE_IMPORTED.length,
            sibling_format_documented: byAuditCategory.SIBLING_FORMAT_DOCUMENTED.length,
            physical_measurement_required: byAuditCategory.PHYSICAL_MEASUREMENT_REQUIRED.length,
            conflict_hold_missing: byAuditCategory.CONFLICT_HOLD.length,
            documentation_required: byAuditCategory.DOCUMENTATION_REQUIRED.length,
            historical_conflicts_preserved: HISTORICAL_9_CONFLICT_VARIANT_IDS.length,
            total_conflict_matrix_rows: conflictRows.length,
            projected_catalog_with_caliper_after_rec07v: 1236 + writeOperations.length,
            projected_catalog_missing_caliper_after_rec07v: 288 - writeOperations.length
        },
        byPriorityTier,
        lists: {
            inventoryRows,
            verifiedRows,
            docReqRows,
            conflictRows,
            writeOperations,
            byAuditCategory,
            historical9CaliperConflicts: HISTORICAL_9_CONFLICT_VARIANT_IDS
        }
    };
}

/**
 * Generates deterministic Rollback SQL for the 38 accredited variants in `writeOperations`.
 */
function generateRollbackSql07(plan, catalogVariants = []) {
    const prodById = new Map(catalogVariants.map(v => [v.variant_id || v.id, v]));
    const lines = [
        '-- Rollback SQL for PAPER-MATERIALS-RECOVERY-07V (38 Accredited Caliper Variants)',
        `-- Generated at: ${new Date().toISOString()}`,
        'START TRANSACTION;'
    ];

    for (const op of plan.lists.writeOperations) {
        const pv = prodById.get(op.variant_id) || {};
        const calUm = pv.caliper_um !== undefined && pv.caliper_um !== null ? Number(pv.caliper_um) : null;
        const calMm = pv.caliper_mm !== undefined && pv.caliper_mm !== null ? Number(pv.caliper_mm) : null;
        const bulk = pv.bulk_factor !== undefined && pv.bulk_factor !== null ? Number(pv.bulk_factor) : null;
        const src = pv.caliper_source || 'NONE';
        const conf = pv.caliper_confidence_status || 'MISSING';
        const meta = typeof pv.variant_metadata_json === 'string'
            ? pv.variant_metadata_json
            : JSON.stringify(pv.variant_metadata_json || {});

        lines.push(
            `UPDATE paper_variants SET caliper_um = ${escapeSql(calUm)}, caliper_mm = ${escapeSql(calMm)}, bulk_factor = ${escapeSql(bulk)}, caliper_source = ${escapeSql(src)}, caliper_confidence_status = ${escapeSql(conf)}, metadata_json = ${escapeSql(meta)} WHERE id = ${escapeSql(op.variant_id)};`
        );
    }

    lines.push('COMMIT;');
    return lines.join('\n') + '\n';
}

/**
 * Simulates the RECOVERY-07V caliper update against an in-memory catalog snapshot (dry-run)
 * and verifies idempotency, CAS guards, and strict preservation of historical conflicts.
 */
function simulateRecovery07DryRun(plan, catalogVariants) {
    const cloned = catalogVariants.map(v => ({
        ...v,
        variant_id: v.variant_id || v.id
    }));
    const byId = new Map(cloned.map(v => [v.variant_id, v]));
    const conflict9Set = new Set(HISTORICAL_9_CONFLICT_VARIANT_IDS);

    const runPass = () => {
        let updatedCalipers = 0;
        let skippedAlreadyApplied = 0;
        let blockedByCasGuard = 0;

        for (const op of plan.lists.writeOperations) {
            if (conflict9Set.has(op.variant_id)) {
                blockedByCasGuard++;
                continue;
            }
            const row = byId.get(op.variant_id);
            if (!row) {
                blockedByCasGuard++;
                continue;
            }

            const currentCal = row.caliper_um !== null && row.caliper_um !== undefined ? Number(row.caliper_um) : 0;
            if (currentCal === op.proposed_caliper_um && row.caliper_source === op.caliper_source) {
                skippedAlreadyApplied++;
                continue;
            }
            if (currentCal > 0) {
                blockedByCasGuard++;
                continue;
            }

            row.caliper_um = op.proposed_caliper_um;
            row.caliper_mm = op.proposed_caliper_mm;
            row.bulk_factor = op.proposed_bulk_factor;
            row.caliper_source = op.caliper_source;
            row.caliper_confidence_status = op.caliper_confidence_status;
            row.canReleaseToManufacturing = false;
            updatedCalipers++;
        }

        return { updatedCalipers, skippedAlreadyApplied, blockedByCasGuard };
    };

    const pass1 = runPass();
    const pass2 = runPass();

    const finalWithCaliper = cloned.filter(v => v.caliper_um !== null && Number(v.caliper_um) > 0).length;
    const finalMissingCaliper = cloned.length - finalWithCaliper;

    return {
        mode: 'DRY_RUN_SIMULATION',
        production_writes_executed: 0,
        pass1,
        pass2,
        idempotent: pass2.updatedCalipers === 0,
        finalCatalogCounts: {
            total_variants: cloned.length,
            with_caliper: finalWithCaliper,
            missing_caliper: finalMissingCaliper
        }
    };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--execute')) {
        if (process.env.PAPER_MATERIALS_RECOVERY_07V_APPROVED !== 'true') {
            console.error('BLOCKED: Production write is strictly prohibited during PAPER-MATERIALS-RECOVERY-07V without explicit approval.');
            process.exit(1);
        }
    }
    const plan = buildRecovery07Plan();
    console.log(JSON.stringify({
        mission: plan.mission,
        status: plan.status,
        pendingStatus: plan.pendingStatus,
        mode: 'DRY_RUN_ONLY',
        counts: plan.counts,
        byPriorityTier: plan.byPriorityTier
    }, null, 2));
}

module.exports = {
    HISTORICAL_9_CONFLICT_VARIANT_IDS,
    VALID_DB_CALIPER_SOURCES,
    VALID_DB_CONFIDENCE_STATUSES,
    AUDIT_CATEGORY_TO_DB_ENUM_MAP,
    buildRecovery07Plan,
    generateRollbackSql07,
    simulateRecovery07DryRun
};
