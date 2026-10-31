'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ControlledBetaExpansionPreparationService = require('../src/api/services/controlledBetaExpansionPreparationService');
const db = require('../src/api/services/mysqlClient');

console.log('=== Smoke 132.0.12: Real DB Phase 128.1 Signal Persistence ===\n');

// 1. MUST require real DB
const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';
const isForceReal = process.env.FORCE_REAL_DB_SMOKE === 'true';

if (!isProdLike && !isForceReal) {
  console.error('FAIL: This test MUST run in real DB mode. Set FORCE_REAL_DB_SMOKE=true or NODE_ENV=production');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  // 2. Fail if MySQL is unavailable
  try {
    await db.query('SELECT 1');
    console.log('MySQL connection successful.\n');
  } catch (err) {
    console.error('FAIL: MySQL is unavailable:', err.message);
    process.exit(1);
  }

  const svc = new ControlledBetaExpansionPreparationService();

  // Helper to check schema
  const getTableColumns = async (tableName) => {
    try {
      const rows = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()", [tableName]);
      return rows.map(r => r.COLUMN_NAME);
    } catch (e) {
      return [];
    }
  };

  const buildInsertForExistingColumns = async (tableName, desiredRow) => {
    const cols = await getTableColumns(tableName);
    const finalRow = {};
    for (const [k, v] of Object.entries(desiredRow)) {
      if (cols.includes(k)) finalRow[k] = v;
    }
    const keys = Object.keys(finalRow);
    const vals = Object.values(finalRow);
    const placeholders = keys.map(() => '?').join(', ');
    const q = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
    return { q, vals };
  };

  // 3. Inspect real Phase 128.1 table schemas
  const candidateTables = [
    'limited_beta_runtime_restart_drills',
    'limited_beta_runtime_restart_evidence_packs',
    'limited_beta_runtime_evidence_packs',
    'controlled_beta_runtime_restart_drills',
    'controlled_beta_runtime_restart_evidence_packs'
  ];

  let bestTable = null;
  let bestCols = [];
  for (const t of candidateTables) {
    const cols = await getTableColumns(t);
    if (cols.length > 0) {
      const hasDirect = cols.includes('recovered_from_db') || cols.includes('restart_safe');
      const hasPayload = ['evidence_payload', 'evidence_json', 'payload_json', 'recovery_payload', 'evidence_data_json'].some(c => cols.includes(c));
      console.log(`Table schema check -> ${t}: columns count = ${cols.length}, hasDirect = ${hasDirect}, hasPayload = ${hasPayload}`);
      if (hasDirect || hasPayload) {
        if (!bestTable || hasDirect) {
          bestTable = t;
          bestCols = cols;
        }
      }
    }
  }

  assert(bestTable !== null, `Found a suitable Phase 128.1 table: ${bestTable}`);

  const runId = `smoke132_0_12_${Date.now()}`;
  const prepId = `${runId}_prep`;
  const revId = `${runId}_rev`;
  const actId = `${runId}_act`;

  // 4. Insert context-bound Phase 128.1 evidence using the same helper logic as 132C
  const row = {};
  const payload = {
    restart_recovery_status: 'VERIFIED_AFTER_RESTART',
    recovered_from_db: true,
    db_recovered: true,
    persistence_recovered: true,
    memory_state_detected: false,
    memory_fallback_detected: false,
    restart_safe: true,
    recovery_safe: true,
    restart_recovery_safe: true,
    recovery_integrity_hash: 'hash',
    evidence_integrity_hash: 'hash',
    context: {
      preparation_id: prepId,
      review_id: revId,
      decision_id: `${runId}_dec`,
      activation_id: actId,
      gate_id: `${runId}_gate`,
      cohort_id: `${runId}_cohort`,
      tenant_id: `${runId}_tenant`
    },
    restart: {
      restart_recovery_status: 'VERIFIED_AFTER_RESTART',
      recovered_from_db: true,
      db_recovered: true,
      persistence_recovered: true,
      memory_state_detected: false,
      memory_fallback_detected: false,
      restart_safe: true,
      recovery_safe: true,
      restart_recovery_safe: true,
      recovery_integrity_hash: 'hash'
    },
    recovery: {
      restart_recovery_status: 'VERIFIED_AFTER_RESTART',
      recovered_from_db: true,
      db_recovered: true,
      persistence_recovered: true,
      memory_state_detected: false,
      memory_fallback_detected: false,
      restart_safe: true,
      recovery_safe: true,
      restart_recovery_safe: true,
      recovery_integrity_hash: 'hash'
    }
  };

  if (bestCols.includes('recovered_from_db')) { row.recovered_from_db = 1; }
  else if (bestCols.includes('db_recovered')) { row.db_recovered = 1; }
  else if (bestCols.includes('persistence_recovered')) { row.persistence_recovered = 1; }
  
  if (bestCols.includes('memory_state_detected')) { row.memory_state_detected = 0; }
  else if (bestCols.includes('memory_fallback_detected')) { row.memory_fallback_detected = 0; }
  
  if (bestCols.includes('restart_safe')) { row.restart_safe = 1; }
  else if (bestCols.includes('recovery_safe')) { row.recovery_safe = 1; }
  else if (bestCols.includes('restart_recovery_safe')) { row.restart_recovery_safe = 1; }
  
  if (bestCols.includes('restart_recovery_status')) { row.restart_recovery_status = 'VERIFIED_AFTER_RESTART'; }
  if (bestCols.includes('recovery_integrity_hash')) { row.recovery_integrity_hash = 'hash'; }
  if (bestCols.includes('evidence_integrity_hash')) { row.evidence_integrity_hash = 'hash'; }

  if (bestCols.includes('preparation_id')) row.preparation_id = prepId;
  if (bestCols.includes('review_id')) row.review_id = revId;
  if (bestCols.includes('decision_id')) row.decision_id = `${runId}_dec`;
  if (bestCols.includes('activation_id')) row.activation_id = actId;
  if (bestCols.includes('gate_id')) row.gate_id = `${runId}_gate`;
  if (bestCols.includes('cohort_id')) row.cohort_id = `${runId}_cohort`;
  if (bestCols.includes('tenant_id')) row.tenant_id = `${runId}_tenant`;

  const idCol = ['evidence_pack_id', 'pack_id', 'drill_id', 'restart_drill_id', 'id', 'marker'].find(c => bestCols.includes(c));
  const rowId = prepId + '_drill';
  if (idCol) {
    row[idCol] = rowId;
  }

  const payloadCol = ['evidence_payload', 'evidence_json', 'payload_json', 'recovery_payload', 'evidence_data_json'].find(c => bestCols.includes(c));
  if (payloadCol) {
    row[payloadCol] = JSON.stringify(payload);
  }

  const { q, vals } = await buildInsertForExistingColumns(bestTable, row);
  await db.query(q, vals);

  // 5. Re-read the row from DB and verify signals
  let readRow = null;
  if (idCol) {
    const readRows = await db.query(`SELECT * FROM ${bestTable} WHERE ${idCol} = ?`, [rowId]);
    if (readRows && readRows.length > 0) {
      readRow = readRows[0];
    }
  }

  assert(readRow !== null, `Re-read inserted row from ${bestTable}`);

  let readPayload = null;
  if (payloadCol && readRow[payloadCol]) {
    try {
      readPayload = typeof readRow[payloadCol] === 'string' ? JSON.parse(readRow[payloadCol]) : readRow[payloadCol];
      if (Buffer.isBuffer(readPayload)) {
        readPayload = JSON.parse(readPayload.toString('utf8'));
      }
    } catch (e) {
      readPayload = {};
    }
  }

  const toBool = (val) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    if (typeof val === 'string') {
      const s = val.trim().toLowerCase();
      return s === 'true' || s === '1';
    }
    return !!val;
  };

  let recovered_from_db_val = false;
  let memory_state_detected_val = true;
  let restart_safe_val = false;
  let status_val = null;
  let hash_val = null;

  if ('recovered_from_db' in readRow) recovered_from_db_val = toBool(readRow.recovered_from_db) === true;
  else if ('db_recovered' in readRow) recovered_from_db_val = toBool(readRow.db_recovered) === true;
  else if ('persistence_recovered' in readRow) recovered_from_db_val = toBool(readRow.persistence_recovered) === true;
  
  if ('memory_state_detected' in readRow) memory_state_detected_val = toBool(readRow.memory_state_detected) === true;
  else if ('memory_fallback_detected' in readRow) memory_state_detected_val = toBool(readRow.memory_fallback_detected) === true;

  if ('restart_safe' in readRow) restart_safe_val = toBool(readRow.restart_safe) === true;
  else if ('recovery_safe' in readRow) restart_safe_val = toBool(readRow.recovery_safe) === true;
  else if ('restart_recovery_safe' in readRow) restart_safe_val = toBool(readRow.restart_recovery_safe) === true;

  status_val = readRow.restart_recovery_status || readRow.recovery_status || readRow.status || null;
  hash_val = readRow.recovery_integrity_hash || readRow.evidence_integrity_hash || readRow.integrity_hash || null;

  if (readPayload) {
    const restart = readPayload.restart || readPayload.recovery || readPayload;
    if (!recovered_from_db_val) {
      recovered_from_db_val = restart.recovered_from_db === true || restart.recovered_from_db === 1 || restart.recovered_from_db === 'true';
    }
    if (memory_state_detected_val !== false) {
      memory_state_detected_val = restart.memory_state_detected === true || restart.memory_state_detected === 1 || restart.memory_state_detected === 'true';
    }
    if (!restart_safe_val) {
      restart_safe_val = restart.restart_safe === true || restart.restart_safe === 1 || restart.restart_safe === 'true' ||
                         restart.recovery_safe === true || restart.recovery_safe === 1 || restart.recovery_safe === 'true' ||
                         restart.restart_recovery_safe === true || restart.restart_recovery_safe === 1 || restart.restart_recovery_safe === 'true';
    }
    if (!status_val) {
      status_val = restart.restart_recovery_status || restart.recovery_status || restart.status || null;
    }
    if (!hash_val) {
      hash_val = restart.recovery_integrity_hash || restart.evidence_integrity_hash || restart.integrity_hash || readPayload.evidence_integrity_hash || null;
    }
  }

  assert(recovered_from_db_val === true, 'recovered_from_db=true persisted in DB');
  assert(memory_state_detected_val === false, 'memory_state_detected=false persisted in DB');
  assert(restart_safe_val === true, 'restart_safe=true persisted in DB');
  assert(status_val === 'VERIFIED_AFTER_RESTART', 'restart_recovery_status persisted in DB');
  assert(hash_val === 'hash', 'integrity hash persisted in DB');

  // Test service normalization
  const normalized = svc.normalizeRestartEvidence(readRow, readPayload);
  assert(normalized.recovered_from_db === true, 'normalizeRestartEvidence reads recovered_from_db=true');
  assert(normalized.memory_state_detected === false, 'normalizeRestartEvidence reads memory_state_detected=false');
  assert(normalized.restart_safe === true, 'normalizeRestartEvidence reads restart_safe=true');
  assert(normalized.status_ok === true, 'normalizeRestartEvidence reads status_ok=true');
  assert(normalized.hash_ok === true, 'normalizeRestartEvidence reads hash_ok=true');

  // Cleanup
  if (idCol) {
    await db.query(`DELETE FROM ${bestTable} WHERE ${idCol} = ?`, [rowId]);
    console.log('Cleanup completed successfully.');
  }

  console.log(`\nSmoke 132.0.12: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error('FATAL error in 132.0.12:', err);
  process.exit(1);
});
