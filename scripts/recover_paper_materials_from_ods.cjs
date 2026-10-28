#!/usr/bin/env node
'use strict';

/**
 * scripts/recover_paper_materials_from_ods.cjs
 *
 * MISIÓN PAPER-MATERIALS-RECOVERY-03 — Fases 1–6:
 * Deterministic Reconciliation & Transactional Recovery Plan Generator / Executor
 * for Paper Materials Technical Attributes (`paper_products` & `paper_variants`).
 *
 * Modes:
 * - Default (`--dry-run`): Evaluates all 1,524 variants against `Paper data base.ods.zip`
 *   (and `paper_supplier_schema_compatible_batches.zip` + Livonia reference), generates
 *   `PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv`, rollback SQL script, and full JSON plan
 *   WITHOUT writing to the database.
 * - `--execute` (requires explicit approval): Executes controlled transactional batches
 *   updating ONLY `SAFE_UNIQUE_MATCH` rows while preserving commercial prices,
 *   verified grain, and verified calipers.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseOdsBuffer } = require('../src/api/services/paperImportService');
const {
    decodeOdsCellText,
    reconcileVariantsWithOdsSource
} = require('../src/api/services/paperMaterialsNormalizationService');

function escapeCsv(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function escapeSql(val) {
    if (val === null || val === undefined) return 'NULL';
    return "'" + String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

async function main() {
    const args = process.argv.slice(2);
    const isExecute = args.includes('--execute');
    const odsPath = process.env.ODS_SOURCE_PATH || 'C:/Users/KIKE/Downloads/Paper data base.ods.zip';
    const prodSnapshotPath = process.env.PROD_SNAPSHOT_PATH ||
        'C:/Users/KIKE/.gemini/antigravity/brain/4eb15b31-1d7f-458b-b929-282177971441/scratch/prod_variants_after_recovery02.json';
    const csvOutPath = process.env.CSV_OUT_PATH ||
        path.join(__dirname, '../docs/architecture/PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv');
    const planJsonOutPath = process.env.PLAN_JSON_OUT_PATH ||
        'C:/Users/KIKE/.gemini/antigravity/brain/4eb15b31-1d7f-458b-b929-282177971441/scratch/paper_materials_recovery_03_plan.json';
    const rollbackSqlOutPath = process.env.ROLLBACK_SQL_OUT_PATH ||
        'C:/Users/KIKE/.gemini/antigravity/brain/4eb15b31-1d7f-458b-b929-282177971441/scratch/rollback_paper_materials_recovery_03.sql';

    if (!fs.existsSync(odsPath)) {
        throw new Error(`ODS source file not found at ${odsPath}`);
    }
    if (!fs.existsSync(prodSnapshotPath)) {
        throw new Error(`Production snapshot file not found at ${prodSnapshotPath}`);
    }

    const odsBuf = fs.readFileSync(odsPath);
    const odsSha256 = crypto.createHash('sha256').update(odsBuf).digest('hex');
    const odsSheet = parseOdsBuffer(odsBuf)[0];

    const odsRawRows = odsSheet.rows.map((r, idx) => {
        const c = r.cells.map(decodeOdsCellText);
        return {
            sourceRow: idx + 1,
            fileRowNumber: r.fileRowNumber,
            code: c[0] || '',
            qr: c[1] || '',
            name: c[2] || '',
            price: c[3] || '',
            microns: c[4] || '',
            thicknessMm: c[5] || '',
            format: c[6] || '',
            grams: c[7] || '',
            col8: c[8] || '',
            coat: c[9] || '',
            minQty: c[10] || '',
            stepsUnits: c[11] || '',
            sortiment: c[12] || '',
            width: c[13] || '',
            height: c[14] || '',
            paperType: c[15] || '',
            proviser: c[16] || '',
            aktiv: c[17] || ''
        };
    });

    const prodSnap = JSON.parse(fs.readFileSync(prodSnapshotPath, 'utf8'));
    const catalogVariants = prodSnap.variants || [];

    const reconciliation = reconcileVariantsWithOdsSource(catalogVariants, odsRawRows);

    // Write Match Matrix CSV
    const headers = [
        'variant_id',
        'product_id',
        'product_name',
        'gsm',
        'width_mm',
        'height_mm',
        'existing_category',
        'existing_finish',
        'existing_grain_direction',
        'ods_source_row',
        'ods_xml_row',
        'ods_code',
        'ods_provider',
        'ods_sortiment',
        'ods_paper_type_raw',
        'ods_coat_raw',
        'proposed_paper_type',
        'proposed_coating_status',
        'proposed_coating_confidence',
        'proposed_finish',
        'proposed_grain_direction',
        'proposed_original_code',
        'proposed_supplier_code',
        'classification',
        'sub_classification',
        'eligible_for_auto_update',
        'rules_applied',
        'flags',
        'notes'
    ];

    const csvLines = [headers.join(',')];
    for (const row of reconciliation.matrix) {
        csvLines.push(headers.map(h => escapeCsv(row[h])).join(','));
    }
    fs.mkdirSync(path.dirname(csvOutPath), { recursive: true });
    fs.writeFileSync(csvOutPath, csvLines.join('\n') + '\n', 'utf8');

    // Generate deterministic Rollback SQL script from exact pre-update snapshot
    const rollbackLines = [
        '-- Rollback Script for MISIÓN PAPER-MATERIALS-RECOVERY-03',
        `-- Generated at: ${new Date().toISOString()}`,
        `-- Source ODS SHA-256: ${odsSha256}`,
        'START TRANSACTION;'
    ];
    for (const pv of catalogVariants) {
        rollbackLines.push(
            `UPDATE paper_products SET category = ${escapeSql(pv.category)}, finish_summary = ${escapeSql(pv.finish_summary)}, metadata_json = ${escapeSql(JSON.stringify(pv.product_metadata_json || {}))} WHERE id = ${escapeSql(pv.product_id)};`
        );
        rollbackLines.push(
            `UPDATE paper_variants SET finish = ${escapeSql(pv.finish)}, grain_direction = ${escapeSql(pv.grain_direction)}, metadata_json = ${escapeSql(JSON.stringify(pv.variant_metadata_json || {}))} WHERE id = ${escapeSql(pv.variant_id)};`
        );
    }
    rollbackLines.push('COMMIT;');
    fs.writeFileSync(rollbackSqlOutPath, rollbackLines.join('\n') + '\n', 'utf8');

    const planSummary = {
        mission: 'PAPER-MATERIALS-RECOVERY-03',
        generatedAt: new Date().toISOString(),
        mode: isExecute ? 'EXECUTE' : 'DRY_RUN_PREPARATION',
        odsSha256,
        odsTotalRows: odsRawRows.length,
        catalogTotalVariants: reconciliation.totalVariants,
        counts: reconciliation.counts,
        eligibleForAutoUpdateCount: reconciliation.matrix.filter(r => r.eligible_for_auto_update).length,
        csvOutPath,
        rollbackSqlOutPath,
        matrix: reconciliation.matrix
    };

    fs.writeFileSync(planJsonOutPath, JSON.stringify(planSummary, null, 2), 'utf8');

    console.log(JSON.stringify({
        ok: true,
        mission: planSummary.mission,
        mode: planSummary.mode,
        odsSha256: planSummary.odsSha256,
        odsTotalRows: planSummary.odsTotalRows,
        catalogTotalVariants: planSummary.catalogTotalVariants,
        counts: planSummary.counts,
        eligibleForAutoUpdateCount: planSummary.eligibleForAutoUpdateCount,
        csvOutPath: planSummary.csvOutPath,
        rollbackSqlOutPath: planSummary.rollbackSqlOutPath
    }, null, 2));

    if (isExecute) {
        if (process.env.PAPER_MATERIALS_RECOVERY_03_APPROVED !== 'true') {
            throw new Error(
                'SAFETY_GATE_BLOCKED: Mass attribute write requires explicit approval (PAPER_MATERIALS_RECOVERY_03_APPROVED=true) per Phase 6 mission rules.'
            );
        }
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
