'use strict';

const ControlledBetaInviteIssuanceService = require('../src/api/services/controlledBetaInviteIssuanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 133G: Invite Issuance Evidence Pack ===');
  const service = new ControlledBetaInviteIssuanceService();
  process.env.DB_UNREACHABLE = 'true';

  const gateId = 'gate_test_133g';

  const gate = await service.createInviteIssuanceGate({
    issuance_gate_id: gateId,
    preparation_id: 'prep_g',
    phase132_evidence_pack_id: 'ev_132_g',
    tenant_id: 'tenant_g',
    cohort_id: 'cohort_g',
    max_invites_allowed: 10,
    max_invites_to_issue: 5
  });

  // Setup ready dependency state
  service.setMockState('gates', 'prep_g', { preparation_status: 'APPROVED' });
  service.setMockState('gates', 'ev_132_g', { evidence_integrity_hash: 'ev_g_hash' });
  service.setMockState('gates', 'phase131_cohort_g', { decision_status: 'APPROVED' });
  service.setMockState('gates', 'phase130_cohort_g', { evidence_integrity_hash: 'mon_hash' });
  service.setMockState('gates', 'phase129_cohort_g', { evidence_integrity_hash: 'act_hash' });
  service.setMockState('gates', 'phase128_1_cohort_g', { restart_safe: true });

  const pack = await service.buildInviteIssuanceEvidencePack(gateId);

  assert(pack.evidence_schema_version === '133.0', 'Evidence schema version is 133.0');
  assert(pack.evidence_integrity_hash.length === 64, 'Evidence integrity hash is calculated and present');
  assert(pack.redaction_status === 'REDACTED', 'Evidence status is marked REDACTED');

  const data = pack.evidence_data_json;
  assert(data.preparation_id === 'prep_g', 'Contains Phase 132 preparation reference');
  assert(data.phase132_evidence_pack_id === 'ev_132_g', 'Contains Phase 132 evidence pack reference');
  assert(data.readiness.ok === true, 'Contains readiness evaluation snapshot');
  assert(data.safety_invariants.full_public_enabled === false, 'Confirms full_public_enabled is disabled');
  assert(data.safety_invariants.open_marketplace_enabled === false, 'Confirms open_marketplace_enabled is disabled');

  console.log(`Smoke 133G: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
