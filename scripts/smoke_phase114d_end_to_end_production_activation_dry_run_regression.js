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

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function src(relPath) {
  try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
  catch (_) { return ''; }
}

function has(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => content.includes(p));
}

function notHas(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => !content.includes(p));
}

async function run() {
  console.log('\n━━━ Phase 114D — Controlled Production Activation Dry Run E2E Regression ━━━\n');

  // ── 1. Phase 114A — Migration file ───────────────────────────────────────────
  console.log('[1] Phase 114A — Schema artifacts');
  assert(exists('migrations/056_phase114_controlled_production_activation_dry_run.sql'),
    'E2E_114A_1: Migration 056 exists');

  // ── 2. Phase 114B — Service file ─────────────────────────────────────────────
  console.log('\n[2] Phase 114B — Service artifacts');
  const svcRel = 'src/api/services/financialOperationsProductionActivationDryRunService.js';
  assert(exists(svcRel), 'E2E_114B_1: Service file exists');
  assert(exists('scripts/smoke_phase114b_production_activation_dry_run_service.js'),
    'E2E_114B_2: Phase 114B smoke exists');

  // ── 3. Phase 114C — Admin API / UI artifacts ─────────────────────────────────
  console.log('\n[3] Phase 114C — Admin API / UI artifacts');
  const routeRel = 'src/api/routes/financialOperationsProductionActivationDryRunAdmin.js';
  assert(exists(routeRel), 'E2E_114C_1: Route file exists');
  assert(exists('src/ui/types/financialOperationsProductionActivationDryRun.ts'),
    'E2E_114C_2: UI types file exists');
  assert(exists('src/ui/api/financialOperationsProductionActivationDryRunClient.ts'),
    'E2E_114C_3: UI client file exists');
  assert(exists('src/ui/pages/financial-operations-production-activation/ProductionActivationDryRun.tsx'),
    'E2E_114C_4: UI page file exists');
  assert(exists('scripts/smoke_phase114c_production_activation_dry_run_admin_api_ui.js'),
    'E2E_114C_5: Phase 114C smoke exists');
  assert(has('src/api/routes/admin.js', '/financials/activation-dry-run'),
    'E2E_114C_6: admin.js mounts /financials/activation-dry-run');
  assert(has('src/ui/App.tsx', '/admin/production-activation-dry-run'),
    'E2E_114C_7: App.tsx registers /admin/production-activation-dry-run');

  // ── 4. Full dry-run lifecycle via service ─────────────────────────────────────
  console.log('\n[4] Full dry-run lifecycle (readiness → create → execute → evidence → rollback)');
  let dryRunId;
  let auditTimeline = [];
  try {
    const DryRunService = require('../src/api/services/financialOperationsProductionActivationDryRunService');
    const svc = new DryRunService();

    // 4a — readiness
    const readiness = await svc.evaluateDryRunReadiness({ gate_reference_id: 'gate_e2e_114d' });
    assert(readiness.status === 'READY_FOR_DRY_RUN', 'E2E_LIFECYCLE_1: evaluateDryRunReadiness → READY_FOR_DRY_RUN');
    assert(readiness.dryRunOnly === true, 'E2E_LIFECYCLE_2: readiness dryRunOnly: true');
    assert(readiness.paymentExecutionEnabled === false, 'E2E_LIFECYCLE_3: readiness paymentExecutionEnabled: false');
    assert(readiness.liveProviderConnectivityEnabled === false, 'E2E_LIFECYCLE_4: readiness liveProviderConnectivityEnabled: false');
    assert(readiness.externalSubmission === false, 'E2E_LIFECYCLE_5: readiness externalSubmission: false');
    assert(readiness.sourceMutation === false, 'E2E_LIFECYCLE_6: readiness sourceMutation: false');

    // 4b — create
    const created = await svc.createDryRun({ requested_by: 'e2e_114d', gate_reference_id: 'gate_e2e_114d' });
    dryRunId = created.dry_run_id;
    assert(typeof dryRunId === 'string' && dryRunId.length > 0, 'E2E_LIFECYCLE_7: createDryRun returns dry_run_id');
    assert(created.dryRunOnly === true, 'E2E_LIFECYCLE_8: createDryRun dryRunOnly: true');
    assert(created.reviewOnly === true, 'E2E_LIFECYCLE_9: createDryRun reviewOnly: true');
    assert(created.paymentExecutionEnabled === false, 'E2E_LIFECYCLE_10: createDryRun paymentExecutionEnabled: false');
    assert(created.refundExecutionEnabled === false, 'E2E_LIFECYCLE_11: createDryRun refundExecutionEnabled: false');
    assert(created.payoutExecutionEnabled === false, 'E2E_LIFECYCLE_12: createDryRun payoutExecutionEnabled: false');
    assert(created.liveProviderConnectivityEnabled === false, 'E2E_LIFECYCLE_13: createDryRun liveProviderConnectivityEnabled: false');
    assert(created.externalSubmission === false, 'E2E_LIFECYCLE_14: createDryRun externalSubmission: false');
    assert(created.sourceMutation === false, 'E2E_LIFECYCLE_15: createDryRun sourceMutation: false');
    assert(created.fullPublicEnabled === false, 'E2E_LIFECYCLE_16: createDryRun fullPublicEnabled: false');
    assert(created.dry_run_only === true, 'E2E_LIFECYCLE_17: createDryRun dry_run_only DB flag: true');
    assert(created.external_submission_enabled === false, 'E2E_LIFECYCLE_18: createDryRun external_submission_enabled: false');
    assert(created.source_mutation_enabled === false, 'E2E_LIFECYCLE_19: createDryRun source_mutation_enabled: false');

    // 4c — re-evaluate readiness with dry_run_id context (records audit)
    await svc.evaluateDryRunReadiness({ dry_run_id: dryRunId, gate_reference_id: 'gate_e2e_114d' });

    // 4d — execute
    const executed = await svc.executeDryRun({ dry_run_id: dryRunId });
    assert(executed.dry_run_status === 'DRY_RUN_PASSED', 'E2E_LIFECYCLE_20: executeDryRun → DRY_RUN_PASSED');
    assert(Array.isArray(executed.simulated_activation_steps), 'E2E_LIFECYCLE_21: executeDryRun has simulated_activation_steps');
    assert(executed.simulated_activation_steps.length > 0, 'E2E_LIFECYCLE_22: simulated_activation_steps is non-empty');
    assert(executed.dryRunOnly === true, 'E2E_LIFECYCLE_23: executeDryRun dryRunOnly: true');
    assert(executed.paymentExecutionEnabled === false, 'E2E_LIFECYCLE_24: executeDryRun paymentExecutionEnabled: false');
    assert(executed.refundExecutionEnabled === false, 'E2E_LIFECYCLE_25: executeDryRun refundExecutionEnabled: false');
    assert(executed.payoutExecutionEnabled === false, 'E2E_LIFECYCLE_26: executeDryRun payoutExecutionEnabled: false');
    assert(executed.liveProviderConnectivityEnabled === false, 'E2E_LIFECYCLE_27: executeDryRun liveProviderConnectivityEnabled: false');
    assert(executed.externalSubmission === false, 'E2E_LIFECYCLE_28: executeDryRun externalSubmission: false');
    assert(executed.sourceMutation === false, 'E2E_LIFECYCLE_29: executeDryRun sourceMutation: false');

    // step-level safety
    const allStepsDryRunOnly = executed.simulated_activation_steps.every(s => s.dry_run_only === true);
    assert(allStepsDryRunOnly, 'E2E_LIFECYCLE_30: all simulated steps have dry_run_only: true');

    // 4e — list steps
    const stepsRes = await svc.listDryRunSteps({ dry_run_id: dryRunId });
    assert(Array.isArray(stepsRes.steps), 'E2E_LIFECYCLE_31: listDryRunSteps returns steps array');
    assert(stepsRes.steps.length > 0, 'E2E_LIFECYCLE_32: listDryRunSteps is non-empty');
    assert(stepsRes.dryRunOnly === true, 'E2E_LIFECYCLE_33: listDryRunSteps dryRunOnly: true');

    // 4f — evidence pack
    const evidence = await svc.buildDryRunEvidencePack({ dry_run_id: dryRunId });
    assert(evidence.dryRunOnly === true, 'E2E_LIFECYCLE_34: evidence pack dryRunOnly: true');
    assert(evidence.reviewOnly === true, 'E2E_LIFECYCLE_35: evidence pack reviewOnly: true');
    assert(!!evidence.safety_invariants, 'E2E_LIFECYCLE_36: evidence pack has safety_invariants');
    assert(evidence.safety_invariants.full_public_enabled === false, 'E2E_LIFECYCLE_37: evidence.safety_invariants.full_public_enabled: false');
    assert(evidence.safety_invariants.payment_execution_enabled === false, 'E2E_LIFECYCLE_38: evidence.safety_invariants.payment_execution_enabled: false');
    assert(evidence.safety_invariants.live_provider_connectivity_enabled === false, 'E2E_LIFECYCLE_39: evidence.safety_invariants.live_provider_connectivity_enabled: false');
    assert(Array.isArray(evidence.simulated_activation_steps), 'E2E_LIFECYCLE_40: evidence pack has simulated_activation_steps');
    assert(Array.isArray(evidence.audit_summary), 'E2E_LIFECYCLE_41: evidence pack has audit_summary');
    assert(evidence.externalSubmission === false, 'E2E_LIFECYCLE_42: evidence pack externalSubmission: false');
    assert(evidence.sourceMutation === false, 'E2E_LIFECYCLE_43: evidence pack sourceMutation: false');

    // 4g — rollback simulation
    const rollback = await svc.simulateRollback({ dry_run_id: dryRunId, rollback_reason: 'E2E_TEST' });
    assert(rollback.rollback_simulated_only === true, 'E2E_LIFECYCLE_44: simulateRollback rollback_simulated_only: true');
    assert(rollback.dryRunOnly === true, 'E2E_LIFECYCLE_45: simulateRollback dryRunOnly: true');
    assert(rollback.sourceMutation === false, 'E2E_LIFECYCLE_46: simulateRollback sourceMutation: false');
    assert(rollback.paymentExecutionEnabled === false, 'E2E_LIFECYCLE_47: simulateRollback paymentExecutionEnabled: false');
    assert(Array.isArray(rollback.simulated_steps_json), 'E2E_LIFECYCLE_48: simulateRollback has simulated_steps_json');
    assert(rollback.simulated_steps_json.length > 0, 'E2E_LIFECYCLE_49: rollback simulated_steps_json is non-empty');
    const allRollbackDryRunOnly = rollback.simulated_steps_json.every(s => s.dry_run_only === true);
    assert(allRollbackDryRunOnly, 'E2E_LIFECYCLE_50: all rollback steps have dry_run_only: true');

    // 4h — audit timeline
    const auditRes = await svc.getDryRunAuditTimeline({ dry_run_id: dryRunId });
    assert(Array.isArray(auditRes.audit_timeline), 'E2E_LIFECYCLE_51: getDryRunAuditTimeline returns array');
    auditTimeline = auditRes.audit_timeline;

    const eventTypes = auditTimeline.map(e => e.event_type);
    assert(eventTypes.includes('DRY_RUN_CREATED'), 'E2E_AUDIT_1: audit contains DRY_RUN_CREATED');
    assert(eventTypes.includes('DRY_RUN_READINESS_EVALUATED'), 'E2E_AUDIT_2: audit contains DRY_RUN_READINESS_EVALUATED');
    assert(eventTypes.includes('DRY_RUN_EXECUTED'), 'E2E_AUDIT_3: audit contains DRY_RUN_EXECUTED');
    assert(eventTypes.includes('DRY_RUN_EVIDENCE_PACK_BUILT'), 'E2E_AUDIT_4: audit contains DRY_RUN_EVIDENCE_PACK_BUILT');
    assert(eventTypes.includes('ROLLBACK_SIMULATED'), 'E2E_AUDIT_5: audit contains ROLLBACK_SIMULATED');

    // all audit entries carry safety markers
    const allAuditsSafe = auditTimeline.every(e => e.safety_markers && e.safety_markers.dryRunOnly === true);
    assert(allAuditsSafe, 'E2E_AUDIT_6: all audit entries carry dryRunOnly: true safety_markers');

  } catch (err) {
    FAIL++;
    console.error(`  ❌  [FAIL] Lifecycle error: ${err.message}`);
  }

  // ── 5. Static safety scan — service file ─────────────────────────────────────
  console.log('\n[5] Static safety scan — service file');
  const FORBIDDEN_SERVICE = [
    'charge(',
    'refund(',
    'payout(',
    'capture(',
    'submitTax',
    'submitVat',
    'sendToProvider',
    'externalSubmission: true',
    'sourceMutation: true',
    'fullPublicEnabled: true',
    'liveProviderConnectivityEnabled: true',
    'paymentExecutionEnabled: true',
    'refundExecutionEnabled: true',
    'payoutExecutionEnabled: true',
  ];
  for (const f of FORBIDDEN_SERVICE) {
    assert(notHas(svcRel, f), `STATIC_SVC: No "${f}" in service`);
  }

  // ── 6. Static safety scan — route file ───────────────────────────────────────
  console.log('\n[6] Static safety scan — route file');
  const FORBIDDEN_ROUTE = [
    'charge(',
    'refund(',
    'payout(',
    'capture(',
    'submitTax',
    'externalSubmission: true',
    'sourceMutation: true',
    'fullPublicEnabled: true',
    'paymentExecutionEnabled: true',
    'liveProviderConnectivityEnabled: true',
  ];
  for (const f of FORBIDDEN_ROUTE) {
    assert(notHas(routeRel, f), `STATIC_ROUTE: No "${f}" in route`);
  }

  // ── 7. Phase 114 safety strings present in service ───────────────────────────
  console.log('\n[7] Phase safety strings in service');
  assert(has(svcRel, 'PHASE_114_DRY_RUN_ONLY'), 'SAFETY_STR_1: PHASE_114_DRY_RUN_ONLY string present');
  assert(has(svcRel, 'dry_run_only: true'), 'SAFETY_STR_2: dry_run_only: true present');
  assert(has(svcRel, 'rollback_simulated_only: true'), 'SAFETY_STR_3: rollback_simulated_only: true present');
  assert(has(svcRel, 'payment_execution_enabled: false'), 'SAFETY_STR_4: payment_execution_enabled: false present');
  assert(has(svcRel, 'live_provider_connectivity_enabled: false'), 'SAFETY_STR_5: live_provider_connectivity_enabled: false present');

  // ── 8. UI safety notice ───────────────────────────────────────────────────────
  console.log('\n[8] UI page safety notice');
  const pageRel = 'src/ui/pages/financial-operations-production-activation/ProductionActivationDryRun.tsx';
  assert(has(pageRel, 'dry-run only'), 'UI_SAFE_1: UI contains "dry-run only"');
  assert(has(pageRel, 'No production activation, live provider connectivity'), 'UI_SAFE_2: UI contains full safety notice');

  // ── 9. Route and UI registration still intact ────────────────────────────────
  console.log('\n[9] Route and UI registration');
  assert(has('src/api/routes/admin.js', 'financialOperationsProductionActivationDryRunAdmin'),
    'REG_1: admin.js imports dry-run router');
  assert(has('src/api/routes/admin.js', '/financials/activation-dry-run'),
    'REG_2: admin.js mounts /financials/activation-dry-run');
  assert(has('src/ui/App.tsx', 'ProductionActivationDryRun'),
    'REG_3: App.tsx imports ProductionActivationDryRun');
  assert(has('src/ui/App.tsx', '/admin/production-activation-dry-run'),
    'REG_4: App.tsx registers /admin/production-activation-dry-run');

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phase 114D E2E Regression Results: PASS: ${PASS} | FAIL: ${FAIL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (FAIL > 0) {
    console.error('\nPhase 114D: FAILED');
    process.exit(1);
  } else {
    console.log('\nPhase 114D: PASSED');
    console.log('PRINTPRICE OS — PHASE 114D E2E DRY RUN REGRESSION');
    console.log('STATUS: VALIDATED');
    console.log('DRY_RUN_LIFECYCLE: VALIDATED');
    console.log('ROLLBACK_SIMULATION: ACTIVE (simulated only)');
    console.log('AUDIT_TRAIL: DRY_RUN_CREATED → DRY_RUN_READINESS_EVALUATED → DRY_RUN_EXECUTED → DRY_RUN_EVIDENCE_PACK_BUILT → ROLLBACK_SIMULATED');
    console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
    console.log('FULL_PUBLIC: NOT_ENABLED');
    console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
    console.log('PAYMENT_EXECUTION: NOT_ENABLED');
    console.log('REFUND_EXECUTION: NOT_ENABLED');
    console.log('PAYOUT_EXECUTION: NOT_ENABLED');
    console.log('EXTERNAL_TAX_SUBMISSION: NOT_ENABLED');
    console.log('EXTERNAL_ACCOUNTING_SUBMISSION: NOT_ENABLED');
    console.log('PROVIDER_EXTERNAL_SUBMISSION: NOT_ENABLED');
    console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
  }
}

run().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
