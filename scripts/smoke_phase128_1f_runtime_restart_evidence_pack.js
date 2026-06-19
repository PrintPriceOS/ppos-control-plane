'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1f: Restart Recovery Evidence Pack Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

const LimitedBetaRuntimeService = require('../src/api/services/limitedBetaRuntimeService');
const svc = new LimitedBetaRuntimeService();

(async () => {
  try {
    svc._db = {
      query: async (sql, params) => {
        if (sql.includes('schema_versions')) {
          return [{ version: '075_phase128_1_runtime_persistence_restart_recovery_drill' }];
        }
        if (sql.includes('limited_beta_runtime_restart_drills')) {
          return [{
            drill_id: 'drill_123',
            gate_id: 'gate_123',
            restart_recovery_status: 'RECOVERY_VERIFIED',
            before_restart_snapshot_hash: 'beforeHash123',
            after_restart_snapshot_hash: 'afterHash123'
          }];
        }
        return [];
      }
    };

    const result = await svc.buildRuntimeRestartRecoveryEvidencePack('drill_123', 'gate_123');
    assert(result.evidence_pack !== undefined, "Evidence pack generation succeeded");

    const pack = result.evidence_pack;
    assert(pack.evidence_schema_version === '128.1', "Evidence schema version is 128.1");
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

    console.log(`\nSmoke 128.1f: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error("FATAL ERROR in 128.1f:", err);
    process.exit(1);
  }
})();
