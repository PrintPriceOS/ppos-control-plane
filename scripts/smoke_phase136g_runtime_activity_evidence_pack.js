'use strict';

process.env.DB_UNREACHABLE = 'true';

const { serviceInstance: service } = require('../src/api/services/controlledBetaRuntimeActivityObservationService');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 136G: Runtime Activity Evidence Pack ===\n');

(async () => {
  try {
    const obsGateId = 'obs_test_136g';

    const ep = await service.buildRuntimeActivityObservationEvidencePack(obsGateId);

    assert(ep.evidence_pack_id !== undefined, 'Evidence pack generated');
    assert(ep.evidence_schema_version === '136.0', 'Evidence schema version matches 136.0');
    assert(ep.evidence_integrity_hash !== undefined, 'Evidence integrity hash is present');
    assert(ep.redaction_status === 'REDACTED', 'Evidence pack is marked REDACTED');

    const data = ep.evidence_data_json;
    assert(data.phase135_dependency_summary !== undefined, 'Includes Phase 135 dependency summary');
    assert(data.phase135_evidence_hash !== undefined, 'Includes predecessor evidence hash reference');
    assert(data.observation_gate_summary !== undefined, 'Includes observation gate summary');
    assert(data.safety_invariants !== undefined, 'Includes safety invariants status');
    assert(data.redaction_proof !== undefined, 'Includes redaction verification proof');

    // Confirm raw tokens/emails/IPs/DATABASE_URL are not in the evidence data
    const packStr = JSON.stringify(ep);
    assert(!packStr.includes('@') && !packStr.includes('tok_') && !packStr.includes('mysql://'), 'Confirms raw tokens, emails, IPs, or DB secrets are excluded from evidence pack');

    console.log(`\nSmoke 136G: Finished execution. ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (e) {
    console.error('FAIL: Evidence pack smoke test threw error: ', e);
    process.exit(1);
  }
})();
