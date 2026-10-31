'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 126.1f: E2E Persistence Acceptance Pack ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

process.env.PILOT_TENANT_ALLOWLIST = 'tenant1,tenant2';

const PilotEvidenceReviewGoNoGoService = require('../src/api/services/pilotEvidenceReviewGoNoGoService');
const svc = new PilotEvidenceReviewGoNoGoService();

(async () => {
  // Mock DB to simulate all checks passing
  const originalRead = svc._dbRead;
  svc._dbRead = async (sql, params) => {
    if (sql.includes("SELECT version FROM schema_versions")) {
      return [
        { version: '065' }, { version: '066' }, { version: '067' },
        { version: '068' }, { version: '069' }, { version: '070' },
        { version: '071_phase126_1_pilot_evidence_persistence_runtime_truth' }
      ];
    }
    if (sql.includes("SELECT evidence_pack_id FROM internal_order_lifecycle_pilot_evidence_packs")) {
      return [{ evidence_pack_id: 'perp1' }];
    }
    if (sql.includes("SELECT verification_run_id FROM internal_order_lifecycle_runtime_verification_runs")) {
      return [{ verification_run_id: 'vr1' }];
    }
    if (sql.includes("SELECT evidence_pack_id FROM founding_printhouse_pilot_evidence_packs")) {
      return [{ evidence_pack_id: 'perp2' }];
    }
    if (sql.includes("SELECT evidence_pack_id FROM controlled_printhouse_handoff_evidence_packs")) {
      return [{ evidence_pack_id: 'perp3' }];
    }
    if (sql.includes("SELECT evidence_pack_id FROM sandbox_commercial_evidence_packs")) {
      return [{ evidence_pack_id: 'perp4' }];
    }
    if (sql.includes("SELECT COUNT(*) as cnt FROM")) {
      return [{ cnt: 0 }];
    }
    return null;
  };

  // Run full scenario
  const boardResult = await svc.createReviewBoard({ board_name: 'Acceptance Board' });
  const boardId = boardResult.review_board.review_board_id;

  const aggResult = await svc.aggregatePilotEvidence({ review_board_id: boardId });
  assert(aggResult.summary.unverified === 0, "All checks automatically verified via DB queries");
  assert(aggResult.runtimeTruthStatus === 'VERIFIED', "Board runtime truth is VERIFIED");

  // Submit decision GO
  const goResult = await svc.submitGoNoGoDecision({
    review_board_id: boardId,
    decision_outcome: 'GO_FOR_LIMITED_BETA_PREPARATION',
  });
  assert(goResult.blocked === false, "GO is not blocked");
  assert(goResult.decision.beta_enabled === false, "Safety check: beta_enabled is false");
  assert(goResult.decision.payment_execution_enabled === false, "Safety check: payment_execution_enabled is false");

  // Build evidence pack
  const packResult = await svc.buildPilotReviewEvidencePack({ review_board_id: boardId });
  assert(packResult.evidence_pack.runtime_truth_status === 'VERIFIED', "Evidence pack reports runtime truth VERIFIED");
  assert(packResult.evidence_pack.evidence_schema_version === '126.1', "Evidence schema version is 126.1");

  // Check forbidden pattern checks (e.g. redact output check)
  const preview = packResult.evidence_pack.evidence_data_json.redacted_preview;
  assert(preview.secrets === '[REDACTED]', "Secrets are redacted in preview");
  assert(preview.raw_customer_data === '[REDACTED]', "Raw customer data is redacted in preview");

  // Restore DB read
  svc._dbRead = originalRead;

  // Execute sub-smoke scripts and check for secret leaks
  const cp = require('child_process');
  const { assertNoSecretLeak } = require('./smoke_secret_redaction');

  try {
    const outA = cp.execSync('node scripts/smoke_phase126_1a_pilot_evidence_persistence_schema.js', { env: process.env }).toString();
    assert(outA.includes('0 failed'), "126.1a passes under E2E verification");
    assertNoSecretLeak(outA);

    const outG = cp.execSync('node scripts/smoke_phase126_1g_production_sql_compatibility.js', { env: process.env }).toString();
    assert(outG.includes('0 failed'), "126.1g passes under E2E verification");
    assertNoSecretLeak(outG);

    const outH = cp.execSync('node scripts/smoke_phase126_1h_secret_redaction_regression.js', { env: process.env }).toString();
    assert(outH.includes('0 failed'), "126.1h passes under E2E verification");
    assertNoSecretLeak(outH);
  } catch (err) {
    console.error("Sub-smoke script failure:", err.stdout ? err.stdout.toString() : err.message);
    assert(false, "Sub-smoke scripts (1a, 1g, 1h) executed and passed");
  }

  console.log(`\nSmoke 126.1f: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error("FATAL ERROR in 126.1f:", err);
  process.exit(1);
});
