#!/usr/bin/env node
'use strict';

/**
 * scripts/recover_paper_materials_from_ods.cjs
 *
 * MISIÓN PAPER-MATERIALS-RECOVERY-03 / 03R — Fases 1–6 & Fase 3 (03R):
 * Deterministic Reconciliation, Before/After Diff & Transactional Recovery Executor
 * for Paper Materials Technical Attributes (`paper_products` & `paper_variants`).
 *
 * Strict Governance Rules (PAPER-MATERIALS-RECOVERY-03R):
 * 1. Selects ONLY the 943 `SAFE_UNIQUE_MATCH` variants (`eligible_for_auto_update === true`).
 * 2. Strictly EXCLUDES from automatic write:
 *    - 501 `STRONG_MATCH_REVIEW`
 *    - 62 `ATTRIBUTE_CONFLICT`
 *    - 16 `AMBIGUOUS_MATCH`
 *    - 2 `ALREADY_VERIFIED`
 * 3. NEVER infers `grain_direction` (`LONG_GRAIN`/`SHORT_GRAIN`) from sheet dimensions.
 * 4. NEVER mutates `caliper_um`, `caliper_mm`, `bulk_factor`, `caliper_source`,
 *    `caliper_confidence_status`, `caliper_revision`, or `ods_caliper_recovery` metadata
 *    recovered in `PAPER-CALIPER-RECOVERY-02`.
 * 5. NEVER mutates commercial offers (`supplier_paper_offers`), prices, gsm, or dimensions.
 * 6. Generates:
 *    - `docs/architecture/PAPER_MATERIALS_RECOVERY_MATCH_MATRIX.csv` (all 1,524 variants)
 *    - `docs/architecture/PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv` (943 before/after diff with caliper invariance)
 *    - Specific rollback SQL script restoring the 943 variants & products (`rollback_paper_materials_recovery_03r_943.sql`).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseOdsBuffer } = require('../src/api/services/paperImportService');
const {
    CANONICAL_PAPER_TYPES,
    CANONICAL_COATING_STATUSES,
    CANONICAL_FINISHES,
    CANONICAL_GRAIN_DIRECTIONS,
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
    const diff943CsvOutPath = process.env.DIFF_943_CSV_OUT_PATH ||
        path.join(__dirname, '../docs/architecture/PAPER_MATERIALS_RECOVERY_03R_ELIGIBLE_943_DIFF.csv');
    const planJsonOutPath = process.env.PLAN_JSON_OUT_PATH ||
        'C:/Users/KIKE/.gemini/antigravity/brain/4eb15b31-1d7f-458b-b929-282177971441/scratch/paper_materials_recovery_03r_plan.json';
    const rollbackSqlOutPath = process.env.ROLLBACK_SQL_OUT_PATH ||
        'C:/Users/KIKE/.gemini/antigravity/brain/4eb15b31-1d7f-458b-b929-282177971441/scratch/rollback_paper_materials_recovery_03r_943.sql';

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
    const prodVariantById = new Map(catalogVariants.map(v => [v.variant_id || v.id, v]));

    const reconciliation = reconcileVariantsWithOdsSource(catalogVariants, odsRawRows);

    // 1. Write full 1,524 Match Matrix CSV
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

    // 2. Select strictly the 943 SAFE_UNIQUE_MATCH rows and validate schema/enum compatibility
    const eligibleRows = reconciliation.matrix.filter(
        r => r.classification === 'SAFE_UNIQUE_MATCH' && r.eligible_for_auto_update === true
    );
    if (eligibleRows.length !== 943) {
        throw new Error(`INVARIANT_VIOLATION: Expected exactly 943 SAFE_UNIQUE_MATCH rows, got ${eligibleRows.length}`);
    }

    const diffHeaders = [
        'variant_id',
        'product_id',
        'product_name',
        'gsm',
        'width_mm',
        'height_mm',
        'caliper_um_preserved',
        'caliper_source_preserved',
        'caliper_confidence_preserved',
        'before_product_category',
        'after_product_category',
        'before_product_finish_summary',
        'after_product_finish_summary',
        'before_variant_finish',
        'after_variant_finish',
        'before_grain_direction',
        'after_grain_direction',
        'after_coating_status',
        'after_coating_confidence',
        'ods_source_row',
        'ods_paper_type_raw',
        'ods_coat_raw',
        'ods_code',
        'ods_provider',
        'ods_sortiment',
        'rules_applied'
    ];

    const diffCsvLines = [diffHeaders.join(',')];
    const rollbackLines = [
        '-- Specific Rollback Script for MISIÓN PAPER-MATERIALS-RECOVERY-03R (943 SAFE_UNIQUE_MATCH rows)',
        `-- Generated at: ${new Date().toISOString()}`,
        `-- Source ODS SHA-256: ${odsSha256}`,
        '-- Note: Can also execute instant table-level restore from paper_products_backup_rec03_20261028 and paper_variants_backup_rec03_20261028.',
        'START TRANSACTION;'
    ];

    const seenRollbackProductIds = new Set();
    const diffRecords = [];

    for (const row of eligibleRows) {
        const pv = prodVariantById.get(row.variant_id);
        if (!pv) {
            throw new Error(`Missing production snapshot record for variant_id=${row.variant_id}`);
        }

        // Validate schema & enum compatibility before preparing write
        if (!CANONICAL_PAPER_TYPES.includes(row.proposed_paper_type)) {
            throw new Error(`Invalid proposed_paper_type=${row.proposed_paper_type} on ${row.variant_id}`);
        }
        if (!CANONICAL_COATING_STATUSES.includes(row.proposed_coating_status)) {
            throw new Error(`Invalid proposed_coating_status=${row.proposed_coating_status} on ${row.variant_id}`);
        }
        if (!CANONICAL_FINISHES.includes(row.proposed_finish)) {
            throw new Error(`Invalid proposed_finish=${row.proposed_finish} on ${row.variant_id}`);
        }
        if (!CANONICAL_GRAIN_DIRECTIONS.includes(row.proposed_grain_direction)) {
            throw new Error(`Invalid proposed_grain_direction=${row.proposed_grain_direction} on ${row.variant_id}`);
        }
        if (row.proposed_grain_direction !== pv.grain_direction) {
            throw new Error(`GRAIN_INVARIANT_VIOLATION on ${row.variant_id}: ${row.proposed_grain_direction} != ${pv.grain_direction}`);
        }

        const diffEntry = {
            variant_id: row.variant_id,
            product_id: row.product_id,
            product_name: row.product_name,
            gsm: row.gsm,
            width_mm: row.width_mm,
            height_mm: row.height_mm,
            caliper_um_preserved: pv.caliper_um !== null ? Number(pv.caliper_um) : '',
            caliper_source_preserved: pv.caliper_source || 'NONE',
            caliper_confidence_preserved: pv.caliper_confidence_status || 'MISSING',
            before_product_category: pv.category || 'OTHER',
            after_product_category: row.proposed_paper_type,
            before_product_finish_summary: pv.finish_summary || '',
            after_product_finish_summary: row.proposed_finish,
            before_variant_finish: pv.finish || '',
            after_variant_finish: row.proposed_finish,
            before_grain_direction: pv.grain_direction || 'UNKNOWN',
            after_grain_direction: row.proposed_grain_direction,
            after_coating_status: row.proposed_coating_status,
            after_coating_confidence: row.proposed_coating_confidence,
            ods_source_row: row.ods_source_row,
            ods_paper_type_raw: row.ods_paper_type_raw,
            ods_coat_raw: row.ods_coat_raw,
            ods_code: row.ods_code,
            ods_provider: row.ods_provider,
            ods_sortiment: row.ods_sortiment,
            rules_applied: row.rules_applied
        };

        diffRecords.push(diffEntry);
        diffCsvLines.push(diffHeaders.map(h => escapeCsv(diffEntry[h])).join(','));

        if (!seenRollbackProductIds.has(row.product_id)) {
            seenRollbackProductIds.add(row.product_id);
            rollbackLines.push(
                `UPDATE paper_products SET category = ${escapeSql(pv.category)}, finish_summary = ${escapeSql(pv.finish_summary)}, metadata_json = ${escapeSql(JSON.stringify(pv.product_metadata_json || {}))} WHERE id = ${escapeSql(row.product_id)};`
            );
        }
        rollbackLines.push(
            `UPDATE paper_variants SET finish = ${escapeSql(pv.finish)}, grain_direction = ${escapeSql(pv.grain_direction)}, metadata_json = ${escapeSql(JSON.stringify(pv.variant_metadata_json || {}))} WHERE id = ${escapeSql(row.variant_id)};`
        );
    }

    rollbackLines.push('COMMIT;');
    fs.writeFileSync(diff943CsvOutPath, diffCsvLines.join('\n') + '\n', 'utf8');
    fs.writeFileSync(rollbackSqlOutPath, rollbackLines.join('\n') + '\n', 'utf8');

    const planSummary = {
        mission: 'PAPER-MATERIALS-RECOVERY-03R',
        generatedAt: new Date().toISOString(),
        mode: isExecute ? 'EXECUTE' : 'DRY_RUN_PREPARATION',
        odsSha256,
        odsTotalRows: odsRawRows.length,
        catalogTotalVariants: reconciliation.totalVariants,
        counts: reconciliation.counts,
        eligibleForAutoUpdateCount: eligibleRows.length,
        distinctEligibleProductsCount: seenRollbackProductIds.size,
        csvOutPath,
        diff943CsvOutPath,
        rollbackSqlOutPath,
        eligibleDiffRecords: diffRecords
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
        distinctEligibleProductsCount: planSummary.distinctEligibleProductsCount,
        csvOutPath: planSummary.csvOutPath,
        diff943CsvOutPath: planSummary.diff943CsvOutPath,
        rollbackSqlOutPath: planSummary.rollbackSqlOutPath
    }, null, 2));

    if (isExecute) {
        if (process.env.PAPER_MATERIALS_RECOVERY_03R_APPROVED !== 'true') {
            throw new Error(
                'SAFETY_GATE_BLOCKED: Selective production write of the 943 SAFE_UNIQUE_MATCH variants requires explicit approval (PAPER_MATERIALS_RECOVERY_03R_APPROVED=true).'
            );
        }

        const dotenv = require('dotenv');
        if (fs.existsSync('/opt/printprice-os/ppos-control-plane/.env.production')) {
            dotenv.config({ path: '/opt/printprice-os/ppos-control-plane/.env.production' });
        }
        if (fs.existsSync('/opt/printprice-os/ppos-control-plane/.env')) {
            dotenv.config({ path: '/opt/printprice-os/ppos-control-plane/.env' });
        }
        const db = require('../src/api/services/mysqlClient');
        const conn = await db.getConnection();
        const BATCH_SIZE = 100;

        try {
            for (let i = 0; i < eligibleRows.length; i += BATCH_SIZE) {
                const chunk = eligibleRows.slice(i, i + BATCH_SIZE);
                await conn.beginTransaction();
                try {
                    for (const item of chunk) {
                        const [dbRows] = await conn.query(
                            `SELECT v.id, v.product_id, p.name AS product_name, p.category, p.finish_summary,
                                    p.metadata_json AS product_metadata_json,
                                    v.gsm, v.width_mm, v.height_mm, v.finish, v.grain_direction,
                                    v.caliper_um, v.caliper_source, v.caliper_confidence_status,
                                    v.metadata_json AS variant_metadata_json
                             FROM paper_variants v
                             JOIN paper_products p ON p.id = v.product_id
                             WHERE v.id = ? FOR UPDATE`,
                            [item.variant_id]
                        );
                        if (!dbRows || dbRows.length !== 1) {
                            throw new Error(`Variant ${item.variant_id} not found in paper_variants`);
                        }
                        const dbVar = dbRows[0];

                        // Verify identity
                        if (
                            dbVar.product_name.trim() !== item.product_name.trim() ||
                            Number(dbVar.gsm) !== Number(item.gsm) ||
                            Math.round(Number(dbVar.width_mm)) !== Number(item.width_mm) ||
                            Math.round(Number(dbVar.height_mm)) !== Number(item.height_mm)
                        ) {
                            throw new Error(`IDENTITY_MISMATCH on ${item.variant_id}`);
                        }

                        // Never touch accredited grain
                        if (dbVar.grain_direction !== 'UNKNOWN') {
                            throw new Error(`GRAIN_GUARD_TRIGGERED on ${item.variant_id}: grain_direction=${dbVar.grain_direction}`);
                        }

                        const varMeta = typeof dbVar.variant_metadata_json === 'string'
                            ? JSON.parse(dbVar.variant_metadata_json)
                            : (dbVar.variant_metadata_json || {});
                        const prodMeta = typeof dbVar.product_metadata_json === 'string'
                            ? JSON.parse(dbVar.product_metadata_json)
                            : (dbVar.product_metadata_json || {});

                        const nextVarMeta = {
                            ...varMeta,
                            original_code: varMeta.original_code || item.ods_code || '',
                            ods_materials_recovery: {
                                mission: 'PAPER-MATERIALS-RECOVERY-03R',
                                source_file: 'Paper data base.ods.zip',
                                source_sha256: odsSha256,
                                ods_source_row: Number(item.ods_source_row),
                                ods_xml_row: Number(item.ods_xml_row),
                                ods_code: item.ods_code || null,
                                ods_provider: item.ods_provider || null,
                                ods_sortiment: item.ods_sortiment || null,
                                ods_paper_type: item.ods_paper_type_raw,
                                ods_coat: item.ods_coat_raw,
                                paper_type: item.proposed_paper_type,
                                coating_status: item.proposed_coating_status,
                                coating_confidence: item.proposed_coating_confidence,
                                finish: item.proposed_finish,
                                rules_applied: item.rules_applied,
                                previous_category: dbVar.category,
                                previous_finish: dbVar.finish,
                                recovered_at: new Date().toISOString()
                            }
                        };

                        const nextProdMeta = {
                            ...prodMeta,
                            coating_status: item.proposed_coating_status,
                            coating_confidence: item.proposed_coating_confidence,
                            ods_paper_type_raw: item.ods_paper_type_raw,
                            ods_coat_raw: item.ods_coat_raw
                        };

                        // Update paper_variants (ONLY finish and metadata_json; caliper_* and grain_direction untouched)
                        await conn.query(
                            `UPDATE paper_variants
                             SET finish = ?, metadata_json = ?
                             WHERE id = ? AND grain_direction = 'UNKNOWN'`,
                            [item.proposed_finish, JSON.stringify(nextVarMeta), item.variant_id]
                        );

                        // Update paper_products (category, finish_summary, metadata_json)
                        await conn.query(
                            `UPDATE paper_products
                             SET category = ?, finish_summary = ?, metadata_json = ?
                             WHERE id = ?`,
                            [item.proposed_paper_type, item.proposed_finish, JSON.stringify(nextProdMeta), item.product_id]
                        );
                    }
                    await conn.commit();
                } catch (batchErr) {
                    await conn.rollback();
                    throw batchErr;
                }
            }
        } finally {
            conn.release();
        }
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
