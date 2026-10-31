'use strict';

const ControlledBetaInviteIssuanceService = require('../src/api/services/controlledBetaInviteIssuanceService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

(async () => {
  console.log('=== Smoke 133C: Invite Issuance Readiness ===');
  const service = new ControlledBetaInviteIssuanceService();
  process.env.DB_UNREACHABLE = 'true';

  const gateId = 'gate_test_133c';

  // 1. Initial State: Binds missing dependencies
  const g1 = await service.createInviteIssuanceGate({
    issuance_gate_id: gateId,
    preparation_id: 'prep_missing',
    phase132_evidence_pack_id: 'ev_missing',
    tenant_id: 'tenant_c',
    cohort_id: 'cohort_c',
    max_invites_allowed: 10,
    max_invites_to_issue: 5
  });

  let r = await service.evaluateInviteIssuanceReadiness(gateId);
  assert(r.ok === false, 'Readiness fails initially');
  assert(r.blocked_reasons.includes('PHASE_132_PREPARATION_MISSING'), 'Blocks on missing preparation');
  assert(r.blocked_reasons.includes('PHASE_132_EVIDENCE_MISSING_OR_DEGRADED'), 'Blocks on missing evidence pack');

  // 2. Supply Preparation, but not approved
  service.setMockState('gates', 'prep_missing', { preparation_status: 'DRAFT' });
  r = await service.evaluateInviteIssuanceReadiness(gateId);
  assert(r.blocked_reasons.includes('PHASE_132_PREPARATION_NOT_APPROVED'), 'Blocks on unapproved preparation');

  // Approve it
  service.setMockState('gates', 'prep_missing', { preparation_status: 'APPROVED' });

  // 3. Supply Pack, but missing integrity hash
  service.setMockState('gates', 'ev_missing', { redaction_status: 'REDACTED' });
  r = await service.evaluateInviteIssuanceReadiness(gateId);
  assert(r.blocked_reasons.includes('PHASE_132_EVIDENCE_MISSING_OR_DEGRADED'), 'Blocks on pack without hash');

  // Give it integrity hash
  service.setMockState('gates', 'ev_missing', { evidence_integrity_hash: 'hash_133c' });

  // 4. Missing upstream dependencies
  r = await service.evaluateInviteIssuanceReadiness(gateId);
  assert(r.blocked_reasons.includes('PHASE_131_DEPENDENCY_DEGRADED'), 'Blocks on Phase 131 decision degraded');
  assert(r.blocked_reasons.includes('PHASE_130_DEPENDENCY_DEGRADED'), 'Blocks on Phase 130 evidence degraded');

  // Supply dependencies
  service.setMockState('gates', 'phase131_cohort_c', { decision_status: 'APPROVED' });
  service.setMockState('gates', 'phase130_cohort_c', { evidence_integrity_hash: 'mon_hash' });
  service.setMockState('gates', 'phase129_cohort_c', { evidence_integrity_hash: 'act_hash' });
  service.setMockState('gates', 'phase128_1_cohort_c', { restart_safe: true });

  r = await service.evaluateInviteIssuanceReadiness(gateId);
  assert(r.ok === true, 'Readiness resolves to READY when dependencies are supplied');

  // 5. Active Kill Switch
  g1.kill_switch_active = 1;
  r = await service.evaluateInviteIssuanceReadiness(gateId);
  assert(r.blocked_reasons.includes('ACTIVE_KILL_SWITCH_PRESENT'), 'Blocks when kill switch active');
  g1.kill_switch_active = 0;

  // 6. Blocker Findings
  await service.recordInviteIssuanceFinding(gateId, 'BLOCKER', 'finding_c', { info: 'error' });
  r = await service.evaluateInviteIssuanceReadiness(gateId);
  assert(r.blocked_reasons.includes('UNRESOLVED_BLOCKER_FINDINGS'), 'Blocks with unresolved blocker findings');

  console.log(`Smoke 133C: Finished. Passed: ${passed}, Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
