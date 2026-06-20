'use strict';

process.env.DB_UNREACHABLE = 'true';

const service = require('../src/api/services/controlledBetaRuntimeSessionService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 135G: Runtime Session Evidence Pack ===');

  const gateId = 'sg_test_135g';
  const acceptanceGateId = 'agate_test_135g';
  const participantId = 'part_test_135g';
  const tenantId = 'tenant_beta_01';
  const cohortId = 'cohort_beta_01';

  // Seed mock state
  service.setMockState('gates', gateId, {
    session_gate_id: gateId,
    acceptance_gate_id: acceptanceGateId,
    participant_id: participantId,
    tenant_id: tenantId,
    cohort_id: cohortId,
    gate_status: 'APPROVED',
    kill_switch_active: 0,
    manual_approval_required: 1,
    auto_session_creation_enabled: 0
  });
  service.setMockState('sessionLimits', gateId, {
    session_gate_id: gateId,
    participant_id: participantId,
    max_sessions: 5,
    max_concurrent_sessions: 2,
    session_ttl_minutes: 30,
    daily_action_limit: 100,
    feature_scope_json: { allowed: ['feature:read'] }
  });

  const evp = await service.buildRuntimeSessionEvidencePack(gateId);
  const data = evp.evidence_data_json;

  // Assertions
  assert(evp.evidence_schema_version === '135.0', 'Evidence schema version is 135.0');
  assert(evp.evidence_integrity_hash !== undefined, 'Evidence integrity hash is present');
  assert(evp.redaction_status === 'REDACTED', 'Evidence status is marked REDACTED');

  assert(data.phase134_dependency !== undefined, 'Includes Phase 134 dependency summary');
  assert(data.limits !== undefined, 'Includes limits summary');
  assert(data.sessions_summary !== undefined, 'Includes sessions summary');
  assert(data.findings !== undefined, 'Includes findings summary');
  assert(data.safety_invariants !== undefined, 'Includes safety invariants verification');
  assert(data.redaction_proof !== undefined, 'Includes redaction proof');

  // Redaction checks
  const rawDataStr = JSON.stringify(evp);
  assert(!rawDataStr.includes('tok_'), 'Confirms raw session tokens are excluded');
  assert(!rawDataStr.includes('@example.com'), 'Confirms raw participant emails are excluded');

  console.log(`Smoke 135G: Finished. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
