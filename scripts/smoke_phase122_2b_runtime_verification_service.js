'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.2B: Runtime Verification Service ===\n');

// Service file exists
const servicePath = path.resolve(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecycleRuntimeVerificationService.js');
assert(fs.existsSync(servicePath), 'Service file exists');

const src = fs.readFileSync(servicePath, 'utf8');

// Required methods
const requiredMethods = [
  'createRuntimeVerificationRun',
  'verifyDbReadThrough',
  'verifyMemoryEmptyRecovery',
  'verifyAuditTimelineRecovery',
  'verifyEvidencePackRecovery',
  'verifyAllowlistFailClosedRuntime',
  'verifyBlockerFindingRuntime',
  'buildRuntimeVerificationEvidencePack',
  'getVerificationAuditTimeline',
  'getReadiness',
];
for (const m of requiredMethods) {
  assert(src.includes(m), `Service exposes method: ${m}`);
}

// Safety markers
assert(src.includes('pilotOnly: true'), 'Safety: pilotOnly true');
assert(src.includes('runtimeVerificationOnly: true'), 'Safety: runtimeVerificationOnly true');
assert(src.includes('fullPublicEnabled: false'), 'Safety: fullPublicEnabled false');
assert(src.includes('paymentExecutionEnabled: false'), 'Safety: paymentExecutionEnabled false');
assert(src.includes('refundExecutionEnabled: false'), 'Safety: refundExecutionEnabled false');
assert(src.includes('payoutExecutionEnabled: false'), 'Safety: payoutExecutionEnabled false');
assert(src.includes('productionActivationEnabled: false'), 'Safety: productionActivationEnabled false');
assert(src.includes('serviceRestartExecuted: false'), 'Safety: serviceRestartExecuted false');
assert(src.includes('realRestartExecuted: false'), 'Safety: realRestartExecuted false');

// DB read-through markers
assert(src.includes('_dbRead'), 'DB read-through method exists');
assert(src.includes('_dbWrite'), 'DB write method exists');
assert(src.includes('_getRunById'), 'DB read-through for runs exists');

// Memory fallback markers
assert(src.includes('memory_fallback_production_valid'), 'Memory fallback production valid marker');
assert(src.includes('MEMORY_FALLBACK'), 'MEMORY_FALLBACK persistence mode');
assert(src.includes('FALLBACK_ONLY'), 'FALLBACK_ONLY persistence status');

// Evidence pack
assert(src.includes('EVIDENCE_SCHEMA_VERSION'), 'Evidence schema version defined');
assert(src.includes('integrity_hash'), 'Evidence integrity hash');
assert(src.includes('manual_only: true'), 'Restart drill: manual only');
assert(src.includes('no_code_restart: true'), 'Restart drill: no code restart');

// No real restart (pm2 restart appears in documentation strings only, not as executable code)
assert(!src.includes('child_process'), 'No child_process in service');
assert(!src.includes('exec('), 'No exec() in service');
assert(!src.includes("require('child_process')"), 'No require child_process in service');
assert(!src.includes('spawn('), 'No spawn() in service');

// Forbidden patterns
const forbiddenPatterns = [
  'fullPublicEnabled: true', 'paymentExecutionEnabled: true',
  'productionActivationEnabled: true', 'serviceRestartExecuted: true',
  'realRestartExecuted: true',
  'charge(', 'capture(', 'refund(', 'payout(', 'sendToProvider',
  'submitTax', 'submitVat', 'submitAccounting',
];
for (const p of forbiddenPatterns) {
  assert(!src.includes(p), `Service does not contain forbidden pattern: ${p}`);
}

// Functional test: instantiate service in smoke mode
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const Service = require(servicePath);
const svc = new Service();
assert(typeof svc.createRuntimeVerificationRun === 'function', 'createRuntimeVerificationRun is callable');
assert(typeof svc.verifyDbReadThrough === 'function', 'verifyDbReadThrough is callable');
assert(typeof svc.verifyMemoryEmptyRecovery === 'function', 'verifyMemoryEmptyRecovery is callable');
assert(typeof svc.buildRuntimeVerificationEvidencePack === 'function', 'buildRuntimeVerificationEvidencePack is callable');

// Run a smoke lifecycle
(async () => {
  const createResult = await svc.createRuntimeVerificationRun({ tenant_id: 'smoke-tenant-122-2', requested_by: 'smoke' });
  assert(createResult.verification_run, 'Create run returns verification_run');
  assert(createResult.verification_run.verification_run_id, 'Run has verification_run_id');
  assert(createResult.safety, 'Create run returns safety markers');
  assert(createResult.safety.serviceRestartExecuted === false, 'serviceRestartExecuted is false in response');
  assert(createResult.safety.realRestartExecuted === false, 'realRestartExecuted is false in response');

  const runId = createResult.verification_run.verification_run_id;

  const dbCheck = await svc.verifyDbReadThrough({ verification_run_id: runId });
  assert(dbCheck.check, 'DB read-through returns check');
  assert(dbCheck.check.check_type === 'DB_READ_THROUGH', 'Check type is DB_READ_THROUGH');

  const memCheck = await svc.verifyMemoryEmptyRecovery({ verification_run_id: runId });
  assert(memCheck.check, 'Memory recovery returns check');
  assert(memCheck.check.check_type === 'MEMORY_EMPTY_RECOVERY', 'Check type is MEMORY_EMPTY_RECOVERY');

  const auditCheck = await svc.verifyAuditTimelineRecovery({ verification_run_id: runId });
  assert(auditCheck.check, 'Audit recovery returns check');

  const allowlistCheck = await svc.verifyAllowlistFailClosedRuntime({ verification_run_id: runId });
  assert(allowlistCheck.check, 'Allowlist check returns check');
  assert(allowlistCheck.check.check_type === 'ALLOWLIST_FAIL_CLOSED_RUNTIME', 'Check type is ALLOWLIST_FAIL_CLOSED_RUNTIME');

  const blockerCheck = await svc.verifyBlockerFindingRuntime({ verification_run_id: runId });
  assert(blockerCheck.check, 'Blocker check returns check');

  const evidencePack = await svc.buildRuntimeVerificationEvidencePack({ verification_run_id: runId });
  assert(evidencePack.evidence_pack, 'Evidence pack returned');
  assert(evidencePack.evidence_pack.integrity_hash, 'Evidence pack has integrity hash');
  assert(evidencePack.evidence_pack.restart_drill_instructions, 'Evidence pack has restart drill instructions');
  assert(evidencePack.evidence_pack.restart_drill_instructions.manual_only === true, 'Restart is manual only');
  assert(evidencePack.evidence_pack.restart_drill_instructions.no_code_restart === true, 'No code restart');
  assert(evidencePack.evidence_pack.memory_fallback_production_valid === false, 'Memory fallback not production valid');
  assert(evidencePack.evidence_pack.safety_invariants.fullPublicEnabled === false, 'Evidence: fullPublic false');
  assert(evidencePack.evidence_pack.safety_invariants.paymentExecutionEnabled === false, 'Evidence: payment false');

  const timeline = await svc.getVerificationAuditTimeline({ verification_run_id: runId });
  assert(timeline.audit_timeline, 'Audit timeline returned');
  assert(timeline.audit_timeline.length > 0, 'Audit timeline has events');

  const readiness = await svc.getReadiness({ verification_run_id: runId });
  assert(readiness.readiness, 'Readiness returned');
  assert(readiness.readiness.memory_fallback_production_valid === false, 'Readiness: memory fallback not production valid');

  console.log(`\n=== Phase 122.2B Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
