#!/usr/bin/env node
'use strict';

/**
 * scripts/recover_paper_calipers_from_ods.cjs
 *
 * MISIÓN PAPER-CALIPER-RECOVERY-02 — Fases 5, 6 & 8:
 * Deterministic, Idempotent, Transactional Recovery of Paper Calipers in Production
 * from Original Supplier Dataset (`Paper data base.ods.zip`) without creating products,
 * duplicating variants, or mutating commercial attributes/prices.
 *
 * Enforces all 10 mandatory rules of Phase 5 + Phase 6 reconciliation state preservation.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const dotenvPathProd = '/opt/printprice-os/ppos-control-plane/.env.production';
  const dotenvPathDefault = '/opt/printprice-os/ppos-control-plane/.env';
  const dotenv = require('/opt/printprice-os/ppos-control-plane/node_modules/dotenv');
  if (fs.existsSync(dotenvPathProd)) dotenv.config({ path: dotenvPathProd });
  if (fs.existsSync(dotenvPathDefault)) dotenv.config({ path: dotenvPathDefault });

  const db = require('/opt/printprice-os/ppos-control-plane/src/api/services/mysqlClient');
  const planPath = process.argv[2] || '/tmp/recovery_plan_matrix.json';
  const outputLogPath = process.argv[3] || '/tmp/recovery_execution_result.json';

  if (!fs.existsSync(planPath)) {
    throw new Error(`Recovery plan file not found at ${planPath}`);
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const matrixRows = plan.matrixRows;
  if (!Array.isArray(matrixRows) || matrixRows.length !== 1524) {
    throw new Error(`Expected 1524 matrixRows in recovery plan, got ${matrixRows ? matrixRows.length : 0}`);
  }

  const eligibleRows = matrixRows.filter(
    r => r.classification === 'SAFE_UNIQUE_MATCH' && r.eligible_for_auto_update === true
  );
  const conflictRows = matrixRows.filter(
    r => r.classification === 'SOURCE_CALIPER_CONFLICT'
  );
  const ambiguousRows = matrixRows.filter(
    r => r.classification === 'AMBIGUOUS_MATCH'
  );
  const unmatchedRows = matrixRows.filter(
    r => r.classification === 'UNMATCHED'
  );

  if (eligibleRows.length !== 1162) {
    throw new Error(`Expected exactly 1162 SAFE_UNIQUE_MATCH rows, got ${eligibleRows.length}`);
  }

  const conn = await db.getConnection();
  const executionReport = {
    mission: 'PAPER-CALIPER-RECOVERY-02',
    startedAt: new Date().toISOString(),
    odsSha256: plan.odsSha256,
    batchesExecuted: [],
    firstRunSummary: null,
    secondRunIdempotencySummary: null,
    beforeState: null,
    afterState: null
  };

  try {
    // 1. Capture BEFORE state and checksums
    const [beforeChecksums] = await conn.query(
      'CHECKSUM TABLE paper_products, paper_variants, paper_technical_caliper_reference, paper_caliper_reconciliation_candidates, supplier_paper_offers'
    );
    const [beforeProdCount] = await conn.query('SELECT COUNT(*) AS cnt FROM paper_products');
    const [beforeVarStats] = await conn.query(`
      SELECT
        caliper_source,
        caliper_confidence_status,
        COUNT(*) AS cnt,
        SUM(CASE WHEN caliper_um IS NOT NULL AND caliper_um > 0 THEN 1 ELSE 0 END) AS with_caliper,
        SUM(CASE WHEN caliper_um IS NULL OR caliper_um <= 0 THEN 1 ELSE 0 END) AS without_caliper
      FROM paper_variants
      GROUP BY caliper_source, caliper_confidence_status
      ORDER BY caliper_source, caliper_confidence_status
    `);
    const [beforeCandStats] = await conn.query(`
      SELECT reconciliation_status, review_decision, COUNT(*) AS cnt
      FROM paper_caliper_reconciliation_candidates
      GROUP BY reconciliation_status, review_decision
      ORDER BY reconciliation_status, review_decision
    `);

    executionReport.beforeState = {
      paper_products_count: Number(beforeProdCount[0].cnt),
      variantsBreakdown: beforeVarStats,
      reconciliationCandidatesBreakdown: beforeCandStats,
      tableChecksums: beforeChecksums
    };

    // Helper function to execute a controlled batch pass (used for Run 1 and Run 2 idempotency check)
    const runRecoveryPass = async (passLabel) => {
      const BATCH_SIZE = 100;
      let totalVariantsUpdated = 0;
      let totalVariantsAlreadyUpToDate = 0;
      let totalReconciliationUpdated = 0;
      const batchLogs = [];

      for (let i = 0; i < eligibleRows.length; i += BATCH_SIZE) {
        const chunk = eligibleRows.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
        let batchUpdated = 0;
        let batchSkippedIdempotent = 0;

        await conn.beginTransaction();
        try {
          for (const item of chunk) {
            const [dbRows] = await conn.query(
              `SELECT v.id, v.product_id, p.name AS product_name, v.gsm, v.width_mm, v.height_mm,
                      v.caliper_um, v.caliper_mm, v.bulk_factor, v.caliper_source,
                      v.caliper_confidence_status, v.caliper_revision, v.metadata_json
               FROM paper_variants v
               JOIN paper_products p ON p.id = v.product_id
               WHERE v.id = ? FOR UPDATE`,
              [item.variant_id]
            );

            if (!dbRows || dbRows.length !== 1) {
              throw new Error(`ANOMALY: Variant ${item.variant_id} not found in paper_variants`);
            }
            const dbVar = dbRows[0];

            // Verify technical identity has not drifted
            if (
              dbVar.product_name.trim() !== item.product_name.trim() ||
              Number(dbVar.gsm) !== Number(item.gsm) ||
              Math.round(Number(dbVar.width_mm)) !== Number(item.width_mm) ||
              Math.round(Number(dbVar.height_mm)) !== Number(item.height_mm)
            ) {
              throw new Error(
                `IDENTITY_MISMATCH on ${item.variant_id}: DB=(${dbVar.product_name}, ${dbVar.gsm}, ${dbVar.width_mm}x${dbVar.height_mm}) vs Plan=(${item.product_name}, ${item.gsm}, ${item.width_mm}x${item.height_mm})`
              );
            }

            // Rule 2: Never overwrite VERIFIED
            if (dbVar.caliper_confidence_status === 'VERIFIED') {
              throw new Error(`RULE_2_VIOLATION: Attempted to modify VERIFIED variant ${item.variant_id}`);
            }

            const targetUm = Number(Number(item.proposed_caliper_um).toFixed(2));
            const targetMm = Number(Number(item.proposed_caliper_mm).toFixed(4));
            const targetBulk = Number(Number(item.proposed_bulk_factor).toFixed(3));
            const currentUm = dbVar.caliper_um !== null ? Number(Number(dbVar.caliper_um).toFixed(2)) : null;

            // Rule 3: Never overwrite a different existing caliper
            if (currentUm !== null && Math.abs(currentUm - targetUm) > 0.01) {
              throw new Error(
                `RULE_3_VIOLATION: Variant ${item.variant_id} has existing caliper ${currentUm} um != target ${targetUm} um`
              );
            }

            const currentMeta = typeof dbVar.metadata_json === 'string'
              ? JSON.parse(dbVar.metadata_json)
              : (dbVar.metadata_json || {});

            // Check idempotency: is this variant already updated with identical values and ods_caliper_recovery metadata?
            const alreadyRecovered = (
              currentUm !== null &&
              Math.abs(currentUm - targetUm) <= 0.001 &&
              dbVar.caliper_source === 'SUPPLIER_IMPORT' &&
              dbVar.caliper_confidence_status === 'REFERENCE_IMPORTED' &&
              currentMeta.ods_caliper_recovery &&
              String(currentMeta.ods_caliper_recovery.ods_source_row) === String(item.ods_source_row)
            );

            if (alreadyRecovered) {
              batchSkippedIdempotent++;
              totalVariantsAlreadyUpToDate++;
              continue;
            }

            const nextMeta = {
              ...currentMeta,
              original_code: currentMeta.original_code || item.ods_code || '',
              ods_caliper_recovery: {
                mission: 'PAPER-CALIPER-RECOVERY-02',
                source_file: 'Paper data base.ods.zip',
                source_sha256: plan.odsSha256,
                ods_source_row: Number(item.ods_source_row),
                ods_xml_row: Number(item.ods_xml_row),
                ods_code: item.ods_code || null,
                ods_provider: item.ods_provider || null,
                ods_coat: item.ods_coat || null,
                ods_paper_type: item.ods_paper_type || null,
                ods_microns_raw: item.ods_microns_raw,
                ods_thickness_mm_raw: item.ods_thickness_mm_raw,
                previous_caliper_um: currentUm,
                previous_caliper_source: dbVar.caliper_source,
                recovered_at: new Date().toISOString()
              }
            };

            const nextRevision = currentUm === null
              ? Number(dbVar.caliper_revision || 1)
              : Number(dbVar.caliper_revision || 1) + 1;

            // Update ONLY caliper technical fields & metadata_json; preserve updated_at or commercial columns untouched
            const [updRes] = await conn.query(
              `UPDATE paper_variants
               SET caliper_um = ?,
                   caliper_mm = ?,
                   bulk_factor = ?,
                   caliper_source = 'SUPPLIER_IMPORT',
                   caliper_confidence_status = 'REFERENCE_IMPORTED',
                   caliper_revision = ?,
                   metadata_json = ?
               WHERE id = ?`,
              [targetUm, targetMm, targetBulk, nextRevision, JSON.stringify(nextMeta), item.variant_id]
            );

            if (updRes.affectedRows === 1) {
              batchUpdated++;
              totalVariantsUpdated++;
            }

            // Phase 6: Update paper_caliper_reconciliation_candidates for this recovered variant
            // Preserves Livonia reference_id, proposed_caliper_um, candidate_references_json, and review_decision!
            const [candRows] = await conn.query(
              'SELECT * FROM paper_caliper_reconciliation_candidates WHERE variant_id = ? FOR UPDATE',
              [item.variant_id]
            );
            if (candRows && candRows.length > 0) {
              const cand = candRows[0];
              const livoniaUm = cand.proposed_caliper_um !== null ? Number(cand.proposed_caliper_um) : null;
              let nextRecStatus = cand.reconciliation_status;
              let noteSuffix = ` [ODS Recovery: row ${item.ods_source_row} -> ${targetUm} um (SUPPLIER_IMPORT/REFERENCE_IMPORTED)]`;

              if (
                cand.reconciliation_status === 'SAFE_EXACT_MATCH' &&
                livoniaUm !== null &&
                Math.abs(livoniaUm - targetUm) > 0.01
              ) {
                nextRecStatus = 'CONFLICT_EXISTING_CALIPER';
                noteSuffix = ` [ODS Recovery: row ${item.ods_source_row} set existing_caliper_um=${targetUm} um (SUPPLIER_IMPORT), which differs from Livonia ${livoniaUm} um]`;
              }

              const baseNotes = (cand.notes || '').replace(/\s*\[ODS Recovery:.*\]$/, '');
              const mergedNotes = (baseNotes + noteSuffix).slice(0, 512);

              await conn.query(
                `UPDATE paper_caliper_reconciliation_candidates
                 SET existing_caliper_um = ?,
                     reconciliation_status = ?,
                     notes = ?
                 WHERE id = ?`,
                [targetUm, nextRecStatus, mergedNotes, cand.id]
              );
              totalReconciliationUpdated++;
            }
          }

          await conn.commit();
          batchLogs.push({
            pass: passLabel,
            batchIndex,
            rowsInBatch: chunk.length,
            batchUpdated,
            batchSkippedIdempotent
          });
        } catch (batchErr) {
          await conn.rollback();
          throw batchErr;
        }
      }

      // Also record in Phase 6 the 9 conflict rows in paper_caliper_reconciliation_candidates (only if not already annotated)
      if (passLabel === 'PASS_1_INITIAL_RECOVERY') {
        await conn.beginTransaction();
        try {
          for (const cItem of conflictRows) {
            const [candRows] = await conn.query(
              'SELECT * FROM paper_caliper_reconciliation_candidates WHERE variant_id = ? FOR UPDATE',
              [cItem.variant_id]
            );
            if (candRows && candRows.length > 0) {
              const cand = candRows[0];
              const baseNotes = (cand.notes || '').replace(/\s*\[ODS Conflict:.*\]$/, '');
              const conflictNote = `${baseNotes} [ODS Conflict: row ${cItem.ods_source_row} has ${cItem.proposed_caliper_um} um vs existing Livonia ${cItem.previous_caliper_um} um; existing preserved]`.slice(0, 512);
              await conn.query(
                `UPDATE paper_caliper_reconciliation_candidates
                 SET notes = ?
                 WHERE id = ?`,
                [conflictNote, cand.id]
              );
            }
          }
          await conn.commit();
        } catch (confErr) {
          await conn.rollback();
          throw confErr;
        }
      }

      return {
        passLabel,
        totalEligibleChecked: eligibleRows.length,
        totalVariantsUpdated,
        totalVariantsAlreadyUpToDate,
        totalReconciliationUpdated,
        batchesCount: batchLogs.length,
        batchLogs
      };
    };

    // Execute Pass 1 (Recovery)
    executionReport.firstRunSummary = await runRecoveryPass('PASS_1_INITIAL_RECOVERY');

    // Execute Pass 2 (Idempotency Verification: must produce 0 updates!)
    executionReport.secondRunIdempotencySummary = await runRecoveryPass('PASS_2_IDEMPOTENCY_VERIFICATION');

    if (executionReport.secondRunIdempotencySummary.totalVariantsUpdated !== 0) {
      throw new Error(
        `IDEMPOTENCY_FAILURE: Second run updated ${executionReport.secondRunIdempotencySummary.totalVariantsUpdated} rows instead of 0!`
      );
    }

    // Capture AFTER state and verify commercial tables checksum invariance
    const [afterChecksums] = await conn.query(
      'CHECKSUM TABLE paper_products, paper_variants, paper_technical_caliper_reference, paper_caliper_reconciliation_candidates, supplier_paper_offers'
    );
    const [afterProdCount] = await conn.query('SELECT COUNT(*) AS cnt FROM paper_products');
    const [afterVarStats] = await conn.query(`
      SELECT
        caliper_source,
        caliper_confidence_status,
        COUNT(*) AS cnt,
        SUM(CASE WHEN caliper_um IS NOT NULL AND caliper_um > 0 THEN 1 ELSE 0 END) AS with_caliper,
        SUM(CASE WHEN caliper_um IS NULL OR caliper_um <= 0 THEN 1 ELSE 0 END) AS without_caliper
      FROM paper_variants
      GROUP BY caliper_source, caliper_confidence_status
      ORDER BY caliper_source, caliper_confidence_status
    `);
    const [afterCandStats] = await conn.query(`
      SELECT reconciliation_status, review_decision, COUNT(*) AS cnt
      FROM paper_caliper_reconciliation_candidates
      GROUP BY reconciliation_status, review_decision
      ORDER BY reconciliation_status, review_decision
    `);

    // Verify commercial columns invariance between paper_variants and paper_variants_backup_recovery02_20261028
    const [commercialDiffs] = await conn.query(`
      SELECT COUNT(*) AS diff_cnt
      FROM paper_variants v
      JOIN paper_variants_backup_recovery02_20261028 b ON b.id = v.id
      WHERE v.product_id != b.product_id
         OR v.gsm != b.gsm
         OR v.width_mm != b.width_mm
         OR v.height_mm != b.height_mm
         OR v.is_reel != b.is_reel
         OR IFNULL(v.finish, '') != IFNULL(b.finish, '')
         OR v.grain_direction != b.grain_direction
         OR v.fingerprint != b.fingerprint
    `);

    if (Number(commercialDiffs[0].diff_cnt) !== 0) {
      throw new Error(`COMMERCIAL_INVARIANCE_VIOLATION: ${commercialDiffs[0].diff_cnt} variants had non-caliper columns modified!`);
    }

    executionReport.afterState = {
      paper_products_count: Number(afterProdCount[0].cnt),
      commercialColumnsDiffCount: Number(commercialDiffs[0].diff_cnt),
      variantsBreakdown: afterVarStats,
      reconciliationCandidatesBreakdown: afterCandStats,
      tableChecksums: afterChecksums
    };
    executionReport.completedAt = new Date().toISOString();

    fs.writeFileSync(outputLogPath, JSON.stringify(executionReport, null, 2), 'utf8');
    console.log(JSON.stringify(executionReport, null, 2));

    conn.release();
    process.exit(0);
  } catch (err) {
    conn.release();
    console.error('RECOVERY ERROR:', err);
    process.exit(1);
  }
}

main();
