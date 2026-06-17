'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
  if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
  else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
  return condition;
}

const ROOT = path.resolve(__dirname, '..');
const SVC_PATH = path.join(ROOT, 'src/api/services/financialOperationsProductionActivationDryRunService.js');

async function run() {
  console.log('\n━━━ Phase 114B — Controlled Production Activation Dry Run Service Smoke ━━━\n');

  // ── 1. File existence ──────────────────────────────────────────────────────
  assert(fs.existsSync(SVC_PATH), 'FILE_1: Service file exists');

  const src = fs.readFileSync(SVC_PATH, 'utf-8');

  // ── 2. Required methods present ────────────────────────────────────────────
  assert(src.includes('createDryRun'), 'METHOD_1: createDryRun exists');
  assert(src.includes('evaluateDryRunReadiness'), 'METHOD_2: evaluateDryRunReadiness exists');
  assert(src.includes('executeDryRun'), 'METHOD_3: executeDryRun exists');
  assert(src.includes('simulateRollback'), 'METHOD_4: simulateRollback exists');
  assert(src.includes('buildDryRunEvidencePack'), 'METHOD_5: buildDryRunEvidencePack exists');
  assert(src.includes('listDryRunSteps'), 'METHOD_6: listDryRunSteps exists');
  assert(src.includes('getDryRunAuditTimeline'), 'METHOD_7: getDryRunAuditTimeline exists');

  // ── 3. Safety flags hardcoded ──────────────────────────────────────────────
  assert(src.includes('dry_run_only: true'), 'SAFETY_1: dry_run_only: true present');
  assert(src.includes('external_submission_enabled: false'), 'SAFETY_2: external_submission_enabled: false present');
  assert(src.includes('source_mutation_enabled: false'), 'SAFETY_3: source_mutation_enabled: false present');
  assert(src.includes('full_public_enabled: false'), 'SAFETY_4: full_public_enabled: false present');
  assert(src.includes('live_provider_connectivity_enabled: false'), 'SAFETY_5: live_provider_connectivity_enabled: false present');
  assert(src.includes('payment_execution_enabled: false'), 'SAFETY_6: payment_execution_enabled: false present');
  assert(src.includes('refund_execution_enabled: false'), 'SAFETY_7: refund_execution_enabled: false present');
  assert(src.includes('payout_execution_enabled: false'), 'SAFETY_8: payout_execution_enabled: false present');

  // ── 4. No forbidden external client calls ──────────────────────────────────
  const forbidden = ['charge(', 'refund(', 'payout(', 'capture(', 'submitTax', 'submitVat', 'sendToProvider'];
  for (const f of forbidden) {
    assert(!src.includes(f), `NO_FORBIDDEN_${f.toUpperCase()}: No "${f}" call in service`);
  }

  // ── 5. No source record mutation ───────────────────────────────────────────
  assert(!src.includes('UPDATE orders'), 'NO_MUTATION_1: No "UPDATE orders" in service');
  assert(!src.includes('DELETE FROM'), 'NO_MUTATION_2: No "DELETE FROM" in service');

  // ── 6. Phase safety string present ────────────────────────────────────────
  assert(src.includes('PHASE_114_DRY_RUN_ONLY'), 'SAFETY_STR: Phase safety string present');
  assert(src.includes('rollback_simulated_only: true'), 'ROLLBACK_SAFE: rollback_simulated_only: true present');

  // ── 7. Runtime behavior ────────────────────────────────────────────────────
  const DryRunService = require(SVC_PATH);
  const svc = new DryRunService();

  // createDryRun — returns safety markers
  const created = await svc.createDryRun({ gate_reference_id: 'gate_test_1', requested_by: 'smoke_test' });
  assert(created.dryRunOnly === true, 'RT_1: createDryRun returns dryRunOnly: true');
  assert(created.externalSubmission === false, 'RT_2: createDryRun returns externalSubmission: false');
  assert(created.dry_run_only === true, 'RT_3: createDryRun returns dry_run_only: true');
  assert(typeof created.dry_run_id === 'string', 'RT_4: createDryRun returns a dry_run_id');

  // evaluateDryRunReadiness — returns safety markers
  const readiness = await svc.evaluateDryRunReadiness({ dry_run_id: created.dry_run_id, gate_reference_id: 'gate_test_1' });
  assert(readiness.dryRunOnly === true, 'RT_5: evaluateDryRunReadiness returns dryRunOnly: true');
  assert(readiness.status === 'READY_FOR_DRY_RUN', 'RT_6: evaluateDryRunReadiness returns READY_FOR_DRY_RUN');
  assert(readiness.safety_invariants.payment_execution_enabled === false, 'RT_7: payment_execution_enabled invariant is false');

  // executeDryRun — returns safety markers, no live execution
  const executed = await svc.executeDryRun({ dry_run_id: created.dry_run_id });
  assert(executed.dryRunOnly === true, 'RT_8: executeDryRun returns dryRunOnly: true');
  assert(executed.paymentExecutionEnabled === false, 'RT_9: executeDryRun returns paymentExecutionEnabled: false');
  assert(executed.liveProviderConnectivityEnabled === false, 'RT_10: executeDryRun returns liveProviderConnectivityEnabled: false');
  assert(executed.dry_run_status === 'DRY_RUN_PASSED', 'RT_11: executeDryRun returns DRY_RUN_PASSED');

  // simulateRollback — simulated only
  const rollback = await svc.simulateRollback({ dry_run_id: created.dry_run_id, rollback_reason: 'SMOKE_TEST' });
  assert(rollback.rollback_simulated_only === true, 'RT_12: simulateRollback returns rollback_simulated_only: true');
  assert(rollback.dryRunOnly === true, 'RT_13: simulateRollback returns dryRunOnly: true');

  // listDryRunSteps
  const stepsList = await svc.listDryRunSteps({ dry_run_id: created.dry_run_id });
  assert(Array.isArray(stepsList.steps), 'RT_14: listDryRunSteps returns steps array');
  assert(stepsList.steps.length > 0, 'RT_15: listDryRunSteps returns at least one step');
  assert(stepsList.dryRunOnly === true, 'RT_16: listDryRunSteps returns dryRunOnly: true');

  // getDryRunAuditTimeline
  const timeline = await svc.getDryRunAuditTimeline({ dry_run_id: created.dry_run_id });
  assert(Array.isArray(timeline.audit_timeline), 'RT_17: getDryRunAuditTimeline returns audit_timeline array');
  const eventTypes = timeline.audit_timeline.map(e => e.event_type);
  assert(eventTypes.includes('DRY_RUN_CREATED'), 'RT_18: audit timeline includes DRY_RUN_CREATED');
  assert(eventTypes.includes('DRY_RUN_EXECUTED'), 'RT_19: audit timeline includes DRY_RUN_EXECUTED');
  assert(eventTypes.includes('ROLLBACK_SIMULATED'), 'RT_20: audit timeline includes ROLLBACK_SIMULATED');

  // buildDryRunEvidencePack — redacted/safe
  const pack = await svc.buildDryRunEvidencePack({ dry_run_id: created.dry_run_id });
  assert(pack.dryRunOnly === true, 'RT_21: evidencePack returns dryRunOnly: true');
  assert(pack.externalSubmission === false, 'RT_22: evidencePack returns externalSubmission: false');
  assert(pack.sourceMutation === false, 'RT_23: evidencePack returns sourceMutation: false');
  assert(Array.isArray(pack.audit_summary), 'RT_24: evidencePack includes audit_summary');
  assert(typeof pack.safety_invariants === 'object', 'RT_25: evidencePack includes safety_invariants');

  // ── 8. Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Phase 114B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
  console.log(`${'─'.repeat(64)}\n`);

  if (FAIL > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
