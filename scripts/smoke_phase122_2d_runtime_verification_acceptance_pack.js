'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.2D: Runtime Verification Acceptance Pack ===\n');

// --- File existence ---
const files = [
  'migrations/066_phase122_2_internal_order_lifecycle_runtime_verification.sql',
  'src/api/services/internalOrderLifecycleRuntimeVerificationService.js',
  'src/api/routes/internalOrderLifecycleRuntimeVerificationAdmin.js',
  'src/ui/types/internalOrderLifecycleRuntimeVerification.ts',
  'src/ui/api/internalOrderLifecycleRuntimeVerificationClient.ts',
  'src/ui/pages/production/InternalOrderLifecycleRuntimeVerification.tsx',
  'docs/phase122_2_runtime_restart_recovery_manual_drill.md',
  'docs/phase122_2_internal_order_lifecycle_runtime_verification.md',
];
for (const f of files) {
  assert(fs.existsSync(path.resolve(__dirname, '..', f)), `File exists: ${f}`);
}

// --- No code executes a real restart ---
const codeFiles = [
  'src/api/services/internalOrderLifecycleRuntimeVerificationService.js',
  'src/api/routes/internalOrderLifecycleRuntimeVerificationAdmin.js',
];
for (const f of codeFiles) {
  const src = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
  assert(!src.includes('child_process'), `${f}: no child_process`);
  assert(!src.includes('exec("pm2'), `${f}: no exec pm2`);
  assert(!src.includes("exec('pm2"), `${f}: no exec pm2 single-quote`);
  assert(!src.includes('serviceRestartExecuted: true'), `${f}: no serviceRestartExecuted true`);
  assert(!src.includes('realRestartExecuted: true'), `${f}: no realRestartExecuted true`);
  assert(!src.includes('productionActivationEnabled: true'), `${f}: no productionActivationEnabled true`);
  assert(!src.includes('fullPublicEnabled: true'), `${f}: no fullPublicEnabled true`);
  assert(!src.includes('paymentExecutionEnabled: true'), `${f}: no paymentExecutionEnabled true`);
  assert(!src.includes('charge('), `${f}: no charge(`);
  assert(!src.includes('refund('), `${f}: no refund(`);
  assert(!src.includes('payout('), `${f}: no payout(`);
  assert(!src.includes('sendToProvider'), `${f}: no sendToProvider`);
  assert(!src.includes('submitTax'), `${f}: no submitTax`);
  assert(!src.includes('submitVat'), `${f}: no submitVat`);
  assert(!src.includes('submitAccounting'), `${f}: no submitAccounting`);
  assert(!src.includes('externalSubmission: true'), `${f}: no externalSubmission true`);
  assert(!src.includes('sourceMutation: true'), `${f}: no sourceMutation true`);
}

// --- Service functional smoke ---
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const Service = require(path.resolve(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecycleRuntimeVerificationService.js'));
const svc = new Service();

(async () => {
  // Create run
  const createResult = await svc.createRuntimeVerificationRun({ tenant_id: 'acceptance-tenant', requested_by: 'acceptance' });
  assert(createResult.verification_run, 'Acceptance: run created');
  const runId = createResult.verification_run.verification_run_id;

  // Run all checks
  const dbCheck = await svc.verifyDbReadThrough({ verification_run_id: runId });
  assert(dbCheck.check, 'Acceptance: DB read-through check');

  const memCheck = await svc.verifyMemoryEmptyRecovery({ verification_run_id: runId });
  assert(memCheck.check, 'Acceptance: memory empty recovery check');

  const auditCheck = await svc.verifyAuditTimelineRecovery({ verification_run_id: runId });
  assert(auditCheck.check, 'Acceptance: audit timeline recovery check');

  const evidenceCheck = await svc.verifyEvidencePackRecovery({ verification_run_id: runId });
  assert(evidenceCheck.check, 'Acceptance: evidence pack recovery check');

  const allowlistCheck = await svc.verifyAllowlistFailClosedRuntime({ verification_run_id: runId });
  assert(allowlistCheck.check, 'Acceptance: allowlist fail-closed check');

  const blockerCheck = await svc.verifyBlockerFindingRuntime({ verification_run_id: runId });
  assert(blockerCheck.check, 'Acceptance: blocker finding check');

  // Evidence pack
  const pack = await svc.buildRuntimeVerificationEvidencePack({ verification_run_id: runId });
  assert(pack.evidence_pack, 'Acceptance: evidence pack built');
  assert(pack.evidence_pack.integrity_hash, 'Acceptance: evidence integrity hash');
  assert(pack.evidence_pack.evidence_schema_version === '122.2', 'Acceptance: evidence schema version 122.2');
  assert(pack.evidence_pack.memory_fallback_production_valid === false, 'Acceptance: memory fallback not production valid');
  assert(pack.evidence_pack.restart_drill_instructions.manual_only === true, 'Acceptance: restart manual only');
  assert(pack.evidence_pack.restart_drill_instructions.no_code_restart === true, 'Acceptance: no code restart');
  assert(pack.evidence_pack.safety_invariants.fullPublicEnabled === false, 'Acceptance: fullPublic disabled');
  assert(pack.evidence_pack.safety_invariants.paymentExecutionEnabled === false, 'Acceptance: payment disabled');
  assert(pack.evidence_pack.safety_invariants.serviceRestartExecuted === false, 'Acceptance: service restart not executed');
  assert(pack.evidence_pack.safety_invariants.realRestartExecuted === false, 'Acceptance: real restart not executed');
  assert(pack.evidence_pack.safety_invariants.no_code_restart === true, 'Acceptance: no_code_restart in invariants');
  assert(pack.evidence_pack.safety_invariants.all_restart_actions_manual === true, 'Acceptance: all_restart_actions_manual');

  // Audit timeline
  const timeline = await svc.getVerificationAuditTimeline({ verification_run_id: runId });
  assert(timeline.audit_timeline.length > 0, 'Acceptance: audit timeline has events');

  // Readiness
  const readiness = await svc.getReadiness({});
  assert(readiness.readiness, 'Acceptance: readiness returned');
  assert(readiness.readiness.memory_fallback_production_valid === false, 'Acceptance: readiness memory fallback not valid');

  // Phase 122 still intact
  const phase122ServicePath = path.resolve(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecyclePilotService.js');
  assert(fs.existsSync(phase122ServicePath), 'Phase 122 service still exists');
  const phase122RoutePath = path.resolve(__dirname, '..', 'src', 'api', 'routes', 'internalOrderLifecyclePilotAdmin.js');
  assert(fs.existsSync(phase122RoutePath), 'Phase 122 route still exists');

  // Phase 122.1 still intact
  const migration065 = path.resolve(__dirname, '..', 'migrations', '065_phase122_1_internal_order_lifecycle_pilot_hardening.sql');
  assert(fs.existsSync(migration065), 'Phase 122.1 migration still exists');

  console.log(`\n=== Phase 122.2D Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Acceptance smoke test error:', err);
  process.exit(1);
});
