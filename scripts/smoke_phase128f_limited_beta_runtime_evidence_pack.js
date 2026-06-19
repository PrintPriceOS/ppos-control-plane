'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128f: Beta Runtime Evidence Pack Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
const svc = new LimitedBetaRuntimeService();

(async () => {
  try {
    svc._db = {
      query: async (sql, params) => {
        if (sql.includes('schema_versions')) {
          return [{ version: '073_phase127_1_limited_beta_preparation_persistence_truth' }];
        }
        if (sql.includes('limited_beta_evidence_packs')) {
          return [{ evidence_data_json: JSON.stringify({ runtimeTruthStatus: 'VERIFIED', persistenceStatus: 'PERSISTED' }) }];
        }
        if (sql.includes('limited_beta_preparation_gates')) {
          return [{ readiness_status: 'READY', invite_only: 1, full_public_enabled: 0 }];
        }
        if (sql.includes('limited_beta_support_escalations')) {
          return [{ escalation_id: 'se-1' }];
        }
        if (sql.includes('limited_beta_incident_rollback_plans')) {
          return [{ plan_id: 'rp-1' }];
        }
        return [];
      }
    };

    const result = await svc.buildRuntimeEvidencePack({ gate_id: 'gate_123' });
    assert(result.evidence_pack !== undefined, "Evidence pack generation succeeded");

    const pack = result.evidence_pack;
    assert(pack.evidence_schema_version === '128.0', "Evidence schema version is 128.0");
    assert(typeof pack.evidence_integrity_hash === 'string' && pack.evidence_integrity_hash.length === 64, "Integrity hash is valid SHA-256 string");

    // Secret Redaction Checks:
    const dataStr = JSON.stringify(pack.evidence_data_json);
    const forbiddenSecrets = [
      'password',
      'passwd',
      'secret',
      'token',
      'private_key',
      'mysql://',
      'DATABASE_URL'
    ];

    for (const secret of forbiddenSecrets) {
      assert(!dataStr.includes(secret), `Evidence pack does not contain raw secret identifier: ${secret}`);
    }

    console.log(`\nSmoke 128f: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error("FATAL ERROR in 128f:", err);
    process.exit(1);
  }
})();
