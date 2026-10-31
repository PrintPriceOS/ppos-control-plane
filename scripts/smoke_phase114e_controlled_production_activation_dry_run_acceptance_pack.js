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
  console.log('\n━━━ Phase 114E — Controlled Production Activation Dry Run Acceptance Pack ━━━\n');

  // ── 1. Prior smoke scripts ────────────────────────────────────────────────────
  console.log('[1] Prior phase smoke scripts exist');
  assert(exists('scripts/smoke_phase114b_production_activation_dry_run_service.js'),
    'ACC_1: Phase 114B smoke exists');
  assert(exists('scripts/smoke_phase114c_production_activation_dry_run_admin_api_ui.js'),
    'ACC_2: Phase 114C smoke exists');
  assert(exists('scripts/smoke_phase114d_end_to_end_production_activation_dry_run_regression.js'),
    'ACC_3: Phase 114D smoke exists');

  // ── 2. Migration artifact ─────────────────────────────────────────────────────
  console.log('\n[2] Migration artifact');
  assert(exists('migrations/056_phase114_controlled_production_activation_dry_run.sql'),
    'ACC_4: Migration 056 exists');

  // ── 3. Service file ───────────────────────────────────────────────────────────
  console.log('\n[3] Service file');
  const svcRel = 'src/api/services/financialOperationsProductionActivationDryRunService.js';
  assert(exists(svcRel), 'ACC_5: Service file exists');
  assert(has(svcRel, 'createDryRun'), 'ACC_6: service exposes createDryRun');
  assert(has(svcRel, 'evaluateDryRunReadiness'), 'ACC_7: service exposes evaluateDryRunReadiness');
  assert(has(svcRel, 'executeDryRun'), 'ACC_8: service exposes executeDryRun');
  assert(has(svcRel, 'simulateRollback'), 'ACC_9: service exposes simulateRollback');
  assert(has(svcRel, 'buildDryRunEvidencePack'), 'ACC_10: service exposes buildDryRunEvidencePack');
  assert(has(svcRel, 'listDryRunSteps'), 'ACC_11: service exposes listDryRunSteps');
  assert(has(svcRel, 'getDryRunAuditTimeline'), 'ACC_12: service exposes getDryRunAuditTimeline');

  // ── 4. Route file ─────────────────────────────────────────────────────────────
  console.log('\n[4] Route file');
  const routeRel = 'src/api/routes/financialOperationsProductionActivationDryRunAdmin.js';
  assert(exists(routeRel), 'ACC_13: Route file exists');
  assert(has(routeRel, '/readiness'), 'ACC_14: route exposes /readiness');
  assert(has(routeRel, '/create'), 'ACC_15: route exposes /create');
  assert(has(routeRel, '/execute'), 'ACC_16: route exposes /execute');
  assert(has(routeRel, '/simulate-rollback'), 'ACC_17: route exposes /simulate-rollback');
  assert(has(routeRel, '/steps'), 'ACC_18: route exposes /steps');
  assert(has(routeRel, '/audit-timeline'), 'ACC_19: route exposes /audit-timeline');
  assert(has(routeRel, '/evidence-pack'), 'ACC_20: route exposes /evidence-pack');

  // ── 5. UI client, types, page ─────────────────────────────────────────────────
  console.log('\n[5] UI artifacts');
  assert(exists('src/ui/api/financialOperationsProductionActivationDryRunClient.ts'),
    'ACC_21: UI client exists');
  assert(exists('src/ui/types/financialOperationsProductionActivationDryRun.ts'),
    'ACC_22: UI types exist');
  assert(exists('src/ui/pages/financial-operations-production-activation/ProductionActivationDryRun.tsx'),
    'ACC_23: UI page exists');

  // ── 6. App.tsx route registration ─────────────────────────────────────────────
  console.log('\n[6] App.tsx route registration');
  assert(has('src/ui/App.tsx', '/admin/production-activation-dry-run'),
    'ACC_24: App.tsx registers /admin/production-activation-dry-run');
  assert(has('src/ui/App.tsx', 'ProductionActivationDryRun'),
    'ACC_25: App.tsx imports ProductionActivationDryRun');

  // ── 7. Dry-run safety markers in service ─────────────────────────────────────
  console.log('\n[7] Dry-run safety markers in service');
  assert(has(svcRel, 'dry_run_only: true'), 'SAFETY_1: dry_run_only: true present in service');
  assert(has(svcRel, 'external_submission_enabled: false'), 'SAFETY_2: external_submission_enabled: false in service');
  assert(has(svcRel, 'source_mutation_enabled: false'), 'SAFETY_3: source_mutation_enabled: false in service');
  assert(has(svcRel, 'full_public_enabled: false'), 'SAFETY_4: full_public_enabled: false in service');
  assert(has(svcRel, 'live_provider_connectivity_enabled: false'), 'SAFETY_5: live_provider_connectivity_enabled: false in service');
  assert(has(svcRel, 'payment_execution_enabled: false'), 'SAFETY_6: payment_execution_enabled: false in service');
  assert(has(svcRel, 'refund_execution_enabled: false'), 'SAFETY_7: refund_execution_enabled: false in service');
  assert(has(svcRel, 'payout_execution_enabled: false'), 'SAFETY_8: payout_execution_enabled: false in service');
  assert(has(svcRel, 'dryRunOnly: true'), 'SAFETY_9: dryRunOnly: true present in service');
  assert(has(svcRel, 'reviewOnly: true'), 'SAFETY_10: reviewOnly: true present in service');
  assert(has(svcRel, 'PHASE_114_DRY_RUN_ONLY'), 'SAFETY_11: PHASE_114_DRY_RUN_ONLY string present in service');

  // ── 8. Rollback simulation is explicitly simulated only ───────────────────────
  console.log('\n[8] Rollback simulation markers');
  assert(has(svcRel, 'rollback_simulated_only: true'), 'ROLLBACK_1: rollback_simulated_only: true present in service');
  assert(notHas(svcRel, 'rollback_simulated_only: false'), 'ROLLBACK_2: rollback_simulated_only: false absent from service');

  // ── 9. Forbidden external execution patterns ──────────────────────────────────
  console.log('\n[9] Forbidden external execution patterns');
  const FORBIDDEN = [
    'charge(',
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
  for (const pattern of FORBIDDEN) {
    assert(notHas(svcRel, pattern), `FORBIDDEN_SVC: No "${pattern}" in service`);
    assert(notHas(routeRel, pattern), `FORBIDDEN_ROUTE: No "${pattern}" in route`);
  }

  // ── 10. DB schema safety columns in migration ─────────────────────────────────
  console.log('\n[10] DB schema safety columns');
  const migRel = 'migrations/056_phase114_controlled_production_activation_dry_run.sql';
  assert(has(migRel, 'dry_run_only BOOLEAN NOT NULL DEFAULT TRUE'),
    'SCHEMA_1: migration has dry_run_only DEFAULT TRUE');
  assert(has(migRel, 'external_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE'),
    'SCHEMA_2: migration has external_submission_enabled DEFAULT FALSE');
  assert(has(migRel, 'source_mutation_enabled BOOLEAN NOT NULL DEFAULT FALSE'),
    'SCHEMA_3: migration has source_mutation_enabled DEFAULT FALSE');
  assert(has(migRel, 'full_public_enabled BOOLEAN NOT NULL DEFAULT FALSE'),
    'SCHEMA_4: migration has full_public_enabled DEFAULT FALSE');
  assert(has(migRel, 'live_provider_connectivity_enabled BOOLEAN NOT NULL DEFAULT FALSE'),
    'SCHEMA_5: migration has live_provider_connectivity_enabled DEFAULT FALSE');
  assert(has(migRel, 'payment_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'),
    'SCHEMA_6: migration has payment_execution_enabled DEFAULT FALSE');
  assert(has(migRel, 'refund_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'),
    'SCHEMA_7: migration has refund_execution_enabled DEFAULT FALSE');
  assert(has(migRel, 'payout_execution_enabled BOOLEAN NOT NULL DEFAULT FALSE'),
    'SCHEMA_8: migration has payout_execution_enabled DEFAULT FALSE');

  // ── 11. Full dry-run lifecycle via service ────────────────────────────────────
  console.log('\n[11] Full dry-run lifecycle via service (acceptance validation)');
  try {
    const DryRunService = require('../src/api/services/financialOperationsProductionActivationDryRunService');
    const svc = new DryRunService();

    const readiness = await svc.evaluateDryRunReadiness({ gate_reference_id: 'gate_114e_acceptance' });
    assert(readiness.status === 'READY_FOR_DRY_RUN', 'LIFECYCLE_1: evaluateDryRunReadiness → READY_FOR_DRY_RUN');
    assert(readiness.dryRunOnly === true, 'LIFECYCLE_2: readiness dryRunOnly: true');

    const created = await svc.createDryRun({ requested_by: '114e_acceptance', gate_reference_id: 'gate_114e_acceptance' });
    const dryRunId = created.dry_run_id;
    assert(typeof dryRunId === 'string' && dryRunId.length > 0, 'LIFECYCLE_3: createDryRun returns dry_run_id');
    assert(created.dryRunOnly === true, 'LIFECYCLE_4: createDryRun dryRunOnly: true');
    assert(created.reviewOnly === true, 'LIFECYCLE_5: createDryRun reviewOnly: true');
    assert(created.paymentExecutionEnabled === false, 'LIFECYCLE_6: createDryRun paymentExecutionEnabled: false');
    assert(created.liveProviderConnectivityEnabled === false, 'LIFECYCLE_7: createDryRun liveProviderConnectivityEnabled: false');
    assert(created.externalSubmission === false, 'LIFECYCLE_8: createDryRun externalSubmission: false');
    assert(created.sourceMutation === false, 'LIFECYCLE_9: createDryRun sourceMutation: false');

    await svc.evaluateDryRunReadiness({ dry_run_id: dryRunId, gate_reference_id: 'gate_114e_acceptance' });

    const executed = await svc.executeDryRun({ dry_run_id: dryRunId });
    assert(executed.dry_run_status === 'DRY_RUN_PASSED', 'LIFECYCLE_10: executeDryRun → DRY_RUN_PASSED');
    assert(executed.dryRunOnly === true, 'LIFECYCLE_11: executeDryRun dryRunOnly: true');
    assert(executed.paymentExecutionEnabled === false, 'LIFECYCLE_12: executeDryRun paymentExecutionEnabled: false');

    const steps = await svc.listDryRunSteps({ dry_run_id: dryRunId });
    assert(Array.isArray(steps.steps) && steps.steps.length > 0, 'LIFECYCLE_13: listDryRunSteps non-empty');
    assert(steps.dryRunOnly === true, 'LIFECYCLE_14: listDryRunSteps dryRunOnly: true');

    const evidence = await svc.buildDryRunEvidencePack({ dry_run_id: dryRunId });
    assert(evidence.dryRunOnly === true, 'LIFECYCLE_15: evidence pack dryRunOnly: true');
    assert(evidence.reviewOnly === true, 'LIFECYCLE_16: evidence pack reviewOnly: true');
    assert(!!evidence.safety_invariants, 'LIFECYCLE_17: evidence pack has safety_invariants');
    assert(evidence.safety_invariants.full_public_enabled === false,
      'LIFECYCLE_18: evidence.safety_invariants.full_public_enabled: false');
    assert(evidence.safety_invariants.payment_execution_enabled === false,
      'LIFECYCLE_19: evidence.safety_invariants.payment_execution_enabled: false');
    assert(evidence.safety_invariants.live_provider_connectivity_enabled === false,
      'LIFECYCLE_20: evidence.safety_invariants.live_provider_connectivity_enabled: false');
    assert(Array.isArray(evidence.simulated_activation_steps),
      'LIFECYCLE_21: evidence pack has simulated_activation_steps');
    assert(Array.isArray(evidence.audit_summary),
      'LIFECYCLE_22: evidence pack has audit_summary');
    assert(evidence.externalSubmission === false, 'LIFECYCLE_23: evidence pack externalSubmission: false');
    assert(evidence.sourceMutation === false, 'LIFECYCLE_24: evidence pack sourceMutation: false');

    const rollback = await svc.simulateRollback({ dry_run_id: dryRunId, rollback_reason: '114e_acceptance' });
    assert(rollback.rollback_simulated_only === true, 'LIFECYCLE_25: simulateRollback rollback_simulated_only: true');
    assert(rollback.dryRunOnly === true, 'LIFECYCLE_26: simulateRollback dryRunOnly: true');
    assert(rollback.sourceMutation === false, 'LIFECYCLE_27: simulateRollback sourceMutation: false');
    assert(rollback.paymentExecutionEnabled === false, 'LIFECYCLE_28: simulateRollback paymentExecutionEnabled: false');

    const auditRes = await svc.getDryRunAuditTimeline({ dry_run_id: dryRunId });
    assert(Array.isArray(auditRes.audit_timeline), 'LIFECYCLE_29: getDryRunAuditTimeline returns array');
    const eventTypes = auditRes.audit_timeline.map(e => e.event_type);
    assert(eventTypes.includes('DRY_RUN_CREATED'), 'LIFECYCLE_30: audit contains DRY_RUN_CREATED');
    assert(eventTypes.includes('DRY_RUN_READINESS_EVALUATED'), 'LIFECYCLE_31: audit contains DRY_RUN_READINESS_EVALUATED');
    assert(eventTypes.includes('DRY_RUN_EXECUTED'), 'LIFECYCLE_32: audit contains DRY_RUN_EXECUTED');
    assert(eventTypes.includes('DRY_RUN_EVIDENCE_PACK_BUILT'), 'LIFECYCLE_33: audit contains DRY_RUN_EVIDENCE_PACK_BUILT');
    assert(eventTypes.includes('ROLLBACK_SIMULATED'), 'LIFECYCLE_34: audit contains ROLLBACK_SIMULATED');

  } catch (err) {
    FAIL++;
    console.error(`  ❌  [FAIL] Lifecycle error: ${err.message}`);
  }

  // ── 12. task.md and walkthrough.md include Phase 114 evidence ─────────────────
  console.log('\n[12] Documentation evidence');
  assert(has('task.md', '114'), 'DOCS_1: task.md references Phase 114');
  assert(has('walkthrough.md', '114'), 'DOCS_2: walkthrough.md references Phase 114');
  assert(has('task.md', 'DRY_RUN'), 'DOCS_3: task.md contains DRY_RUN evidence');
  assert(has('walkthrough.md', 'DRY_RUN'), 'DOCS_4: walkthrough.md contains DRY_RUN evidence');

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Phase 114E Acceptance Pack Results: PASS: ${PASS} | FAIL: ${FAIL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (FAIL > 0) {
    console.error('\nPhase 114E: FAILED');
    process.exit(1);
  } else {
    console.log('\nPhase 114E: PASSED');
    console.log('');
    console.log('PRINTPRICE OS — PHASE 114 CONTROLLED PRODUCTION ACTIVATION DRY RUN');
    console.log('STATUS: VALIDATED');
    console.log('DRY_RUN_MODE: ACTIVE');
    console.log('ROLLBACK_SIMULATION: ACTIVE');
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
