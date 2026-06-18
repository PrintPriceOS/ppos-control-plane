'use strict';

const fs = require('fs');
const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.1D: Prior Phase Evidence Verification ===\n');

const svcPath = path.resolve(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecyclePilotService.js');
const src = fs.readFileSync(svcPath, 'utf8');

// Prior phase evidence is NOT hardcoded true
assert(!src.includes("addCheck('PHASE_120_1_INTEGRITY_REFERENCE', true,"), 'Phase 120.1 check is NOT hardcoded true');
assert(!src.includes("addCheck('PHASE_121_PILOT_ACTIVATION_REFERENCE', true,"), 'Phase 121 check is NOT hardcoded true');

// Prior phase evidence uses DB verification
assert(src.includes('_verifyPriorPhaseEvidence'), 'Service uses _verifyPriorPhaseEvidence method');
assert(src.includes('schema_versions'), 'Service checks schema_versions table');
assert(src.includes('PRIOR_PHASE_EVIDENCE_UNVERIFIED'), 'Service returns PRIOR_PHASE_EVIDENCE_UNVERIFIED when evidence unavailable');
assert(src.includes('priorPhaseEvidenceStatus'), 'Service exposes priorPhaseEvidenceStatus');
assert(src.includes('MIGRATIONS_063_064_APPLIED'), 'Service checks migrations 063 and 064 applied');

// Functional test
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.PILOT_TENANT_ALLOWLIST = '';

delete require.cache[require.resolve(svcPath)];
const InternalOrderLifecyclePilotService = require(svcPath);
const svc = new InternalOrderLifecyclePilotService();

(async () => {
  // Without DB, prior phase evidence should be UNVERIFIED
  const readiness = await svc.evaluatePilotLifecycleReadiness({ tenant_id: 'test_tenant_evidence' });

  // priorPhaseEvidenceStatus should be in the response
  assert(readiness.priorPhaseEvidenceStatus !== undefined, 'readiness includes priorPhaseEvidenceStatus');

  // Without DB access, evidence should be unverified (degraded)
  if (!svc._db) {
    assert(
      readiness.priorPhaseEvidenceStatus === 'PRIOR_PHASE_EVIDENCE_UNVERIFIED',
      'Without DB, priorPhaseEvidenceStatus is PRIOR_PHASE_EVIDENCE_UNVERIFIED'
    );
  }

  // Check that readiness checks include prior phase checks
  const checkNames = readiness.checks.map(c => c.check);
  assert(checkNames.includes('PHASE_120_1_INTEGRITY_REFERENCE'), 'Readiness includes PHASE_120_1_INTEGRITY_REFERENCE check');
  assert(checkNames.includes('PHASE_121_PILOT_ACTIVATION_REFERENCE'), 'Readiness includes PHASE_121_PILOT_ACTIVATION_REFERENCE check');
  assert(checkNames.includes('MIGRATIONS_063_064_APPLIED'), 'Readiness includes MIGRATIONS_063_064_APPLIED check');

  // Evidence pack should include priorPhaseEvidenceStatus
  const runResult = await svc.createPilotLifecycleRun({ tenant_id: 'test_tenant_evidence', requested_by: 'smoke_test' });
  const pilotRunId = runResult.pilot_run.pilot_run_id;

  const evidencePack = await svc.buildInternalOrderLifecycleEvidencePack({ pilot_run_id: pilotRunId });
  assert(evidencePack.evidence_pack.readiness_summary.priorPhaseEvidenceStatus !== undefined, 'Evidence pack includes priorPhaseEvidenceStatus');

  console.log(`\n=== Phase 122.1D Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Smoke 122.1D failed:', err);
  process.exit(1);
});
