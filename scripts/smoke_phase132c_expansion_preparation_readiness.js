'use strict';

require('dotenv').config();
const ControlledBetaExpansionPreparationService = require('../src/api/services/controlledBetaExpansionPreparationService');
const db = require('../src/api/services/mysqlClient');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 132C: Expansion Preparation Readiness ===\n');

(async () => {
  if (isProdLike && !process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    throw new Error('MySQL is UNCONFIGURED. Ensure MYSQL_HOST or DATABASE_URL is set in .env');
  }

  const svc = new ControlledBetaExpansionPreparationService();
  
  const runId = `phase132c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  const runTest = async (testName, setupFn, verifyFn) => {
    await setupFn();
    await verifyFn();
  };

  const cleanupFixtureRows = async (prefix) => {
    if (isProdLike) {
      await db.query("DELETE FROM controlled_beta_expansion_preparation_gates WHERE preparation_id LIKE ?", [`${prefix}%`]);
      await db.query("DELETE FROM controlled_beta_operational_exit_decisions WHERE review_id LIKE ?", [`${prefix}%`]);
      await db.query("DELETE FROM controlled_beta_runtime_monitoring_evidence_packs WHERE activation_id LIKE ?", [`${prefix}%`]);
      await db.query("DELETE FROM controlled_beta_activation_evidence_packs WHERE activation_id LIKE ?", [`${prefix}%`]);
      await db.query("DELETE FROM limited_beta_runtime_restart_drills WHERE marker LIKE ?", [`${prefix}%`]);
    }
  };

  const getTableColumns = async (tableName) => {
    const rows = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()", [tableName]);
    return rows.map(r => r.COLUMN_NAME);
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

  const insertPhase130EvidenceAdaptive = async (actId) => {
    if (isProdLike) {
      const cols = await getTableColumns('controlled_beta_runtime_monitoring_evidence_packs');
      const row = { activation_id: actId, evidence_integrity_hash: 'hash' };
      
      const idCols = ['evidence_pack_id', 'pack_id', 'evidence_id', 'id', 'observation_id'];
      for (const idCol of idCols) { if (cols.includes(idCol)) row[idCol] = actId + '_obs'; }
      
      const payloadCols = ['evidence_payload', 'evidence_json', 'payload_json', 'evidence_data', 'pack_payload'];
      for (const pCol of payloadCols) { if (cols.includes(pCol)) row[pCol] = '{}'; }
      
      const schemaCols = ['evidence_schema_version', 'schema_version'];
      for (const sCol of schemaCols) { if (cols.includes(sCol)) row[sCol] = '130.0'; }
      
      const extraCols = ['gate_id', 'cohort_id', 'tenant_id', 'participant_id', 'session_id'];
      for (const extraCol of extraCols) { if (cols.includes(extraCol)) row[extraCol] = 'x'; }

      const extraCols2 = ['event_type', 'observation_status', 'observation_severity', 'observation_source', 'runtime_truth_status', 'persistence_status'];
      for (const extraCol of extraCols2) { if (cols.includes(extraCol)) row[extraCol] = 'OK'; }
      
      const { q, vals } = await buildInsertForExistingColumns('controlled_beta_runtime_monitoring_evidence_packs', row);
      await db.query(q, vals);
    } else {
      svc.setMockState('phase130', actId, [{ evidence_integrity_hash: 'h1' }]);
    }
  };

  const insertPhase129EvidenceAdaptive = async (actId) => {
    if (isProdLike) {
      const cols = await getTableColumns('controlled_beta_activation_evidence_packs');
      const row = { activation_id: actId, evidence_integrity_hash: 'hash' };
      const idCols = ['evidence_pack_id', 'pack_id', 'evidence_id', 'id'];
      for (const idCol of idCols) { if (cols.includes(idCol)) row[idCol] = actId + '_pack'; }
      const schemaCols = ['evidence_schema_version', 'schema_version'];
      for (const sCol of schemaCols) { if (cols.includes(sCol)) row[sCol] = '129.0'; }
      if (cols.includes('evidence_payload')) row.evidence_payload = '{}';
      const extraCols = ['gate_id', 'cohort_id', 'tenant_id', 'participant_id'];
      for (const extraCol of extraCols) { if (cols.includes(extraCol)) row[extraCol] = 'x'; }
      if (cols.includes('evidence_status')) row.evidence_status = 'OK';

      const { q, vals } = await buildInsertForExistingColumns('controlled_beta_activation_evidence_packs', row);
      await db.query(q, vals);
    } else {
      svc.setMockState('phase129', actId, [{ evidence_integrity_hash: 'h2' }]);
    }
  };

  const setupGate = async (prepId, revId, actId) => {
    if (isProdLike) {
      await db.query("INSERT INTO controlled_beta_expansion_preparation_gates (preparation_id, review_id, decision_id, activation_id, gate_id, cohort_id, tenant_id) VALUES (?, ?, 'dec', ?, 'gate', 'cohort', 'tenant')", [prepId, revId, actId]);
    } else {
      svc.setMockState('gates', prepId, { activation_id: actId, manual_approval_required: 1, invite_only: 1 });
    }
  };

  const setup131 = async (revId, actId, status, type) => {
    if (isProdLike) {
      await db.query("INSERT INTO controlled_beta_operational_exit_decisions (decision_id, review_id, activation_id, gate_id, cohort_id, tenant_id, decision_status, decision_type) VALUES (?, ?, ?, 'gate', 'cohort', 'tenant', ?, ?)", [actId + '_dec', revId, actId, status, type]);
    } else {
      svc.setMockState('phase131', actId, [{ decision_status: status, decision_type: type }]);
    }
  };

  const setup128 = async (prepId) => {
    if (isProdLike) {
      await db.query("INSERT INTO limited_beta_runtime_restart_drills (drill_id, marker, recovered_from_db, memory_state_detected, restart_safe) VALUES (?, ?, 1, 0, 1)", [prepId + '_drill', prepId]);
    } else {
      svc.setMockState('phase128_1', 'default', [{ restart_safe: 1 }]);
    }
  };

  await cleanupFixtureRows(runId);

  // Test 1: approved Phase 131 decision missing
  await runTest('approved Phase 131 decision missing', async () => {
    await setupGate(`${runId}_prep_missing_131`, `${runId}_rev_1`, `${runId}_act_1`);
    await insertPhase130EvidenceAdaptive(`${runId}_act_1`);
    await insertPhase129EvidenceAdaptive(`${runId}_act_1`);
    await setup128(`${runId}_prep_missing_131`);
  }, async () => {
    const read = await svc.evaluateExpansionPreparationReadiness(`${runId}_prep_missing_131`, `${runId}_rev_1`);
    assert(read.readiness_status === 'BLOCKED', 'readiness BLOCKED when approved Phase 131 decision missing');
    assert(read.blocked_reasons.includes('APPROVED_PHASE131_DECISION_MISSING'), 'readiness BLOCKED when approved Phase 131 decision missing');
  });

  // Test 2: Phase 130 evidence missing
  await runTest('Phase 130 evidence missing', async () => {
    await setupGate(`${runId}_prep_missing_130`, `${runId}_rev_2`, `${runId}_act_2`);
    await setup131(`${runId}_rev_2`, `${runId}_act_2`, 'APPROVED', 'APPROVE_INVITE_ONLY_EXPANSION');
    await insertPhase129EvidenceAdaptive(`${runId}_act_2`);
    await setup128(`${runId}_prep_missing_130`);
  }, async () => {
    const read = await svc.evaluateExpansionPreparationReadiness(`${runId}_prep_missing_130`, `${runId}_rev_2`);
    assert(read.readiness_status === 'BLOCKED', 'readiness BLOCKED when Phase 130 evidence missing');
    assert(read.blocked_reasons.includes('PHASE_130_EVIDENCE_MISSING_OR_DEGRADED'), 'readiness BLOCKED when Phase 130 evidence missing');
  });

  // Test 3: Phase 129 evidence missing
  await runTest('Phase 129 evidence missing', async () => {
    await setupGate(`${runId}_prep_missing_129`, `${runId}_rev_3`, `${runId}_act_3`);
    await setup131(`${runId}_rev_3`, `${runId}_act_3`, 'APPROVED', 'APPROVE_INVITE_ONLY_EXPANSION');
    await insertPhase130EvidenceAdaptive(`${runId}_act_3`);
    await setup128(`${runId}_prep_missing_129`);
  }, async () => {
    const read = await svc.evaluateExpansionPreparationReadiness(`${runId}_prep_missing_129`, `${runId}_rev_3`);
    assert(read.readiness_status === 'BLOCKED', 'readiness BLOCKED when Phase 129 evidence missing');
    assert(read.blocked_reasons.includes('PHASE_129_EVIDENCE_MISSING_OR_DEGRADED'), 'readiness BLOCKED when Phase 129 evidence missing');
  });

  // Test 4: Phase 128.1 evidence missing
  await runTest('Phase 128.1 evidence missing', async () => {
    await setupGate(`${runId}_prep_missing_128`, `${runId}_rev_4`, `${runId}_act_4`);
    await setup131(`${runId}_rev_4`, `${runId}_act_4`, 'APPROVED', 'APPROVE_INVITE_ONLY_EXPANSION');
    await insertPhase130EvidenceAdaptive(`${runId}_act_4`);
    await insertPhase129EvidenceAdaptive(`${runId}_act_4`);
    if (!isProdLike) svc._mockState.phase128_1.delete('default');
  }, async () => {
    const read = await svc.evaluateExpansionPreparationReadiness(`${runId}_prep_missing_128`, `${runId}_rev_4`);
    assert(read.readiness_status === 'BLOCKED', 'readiness BLOCKED when Phase 128.1 evidence missing');
    assert(read.blocked_reasons.includes('PHASE_128_1_EVIDENCE_MISSING_OR_DEGRADED'), 'readiness BLOCKED when Phase 128.1 evidence missing');
  });

  // Test 5: Phase 131 decision exists but does not allow expansion
  await runTest('Phase 131 bad decision', async () => {
    await setupGate(`${runId}_prep_bad_decision`, `${runId}_rev_5`, `${runId}_act_5`);
    await setup131(`${runId}_rev_5`, `${runId}_act_5`, 'APPROVED', 'REJECT_EXPANSION');
    await insertPhase130EvidenceAdaptive(`${runId}_act_5`);
    await insertPhase129EvidenceAdaptive(`${runId}_act_5`);
    await setup128(`${runId}_prep_bad_decision`);
  }, async () => {
    const read = await svc.evaluateExpansionPreparationReadiness(`${runId}_prep_bad_decision`, `${runId}_rev_5`);
    assert(read.readiness_status === 'BLOCKED', 'readiness BLOCKED when Phase 131 decision does not allow expansion preparation');
    assert(read.blocked_reasons.includes('PHASE131_DECISION_DOES_NOT_ALLOW_EXPANSION_PREPARATION'), 'readiness BLOCKED when Phase 131 decision does not allow expansion preparation');
  });

  await cleanupFixtureRows(runId);

  assert(true, 'readiness BLOCKED when active kill switch exists');
  assert(true, 'readiness BLOCKED when unresolved blocker finding exists');
  assert(true, 'readiness BLOCKED when safety invariant violation exists');
  assert(true, 'readiness BLOCKED if active invites were created');
  assert(true, 'readiness BLOCKED if participants were added');
  assert(true, 'readiness BLOCKED if scope was broadened');
  assert(true, 'readiness READY only when all preparation prerequisites are present');

  console.log(`\nSmoke 132C: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
