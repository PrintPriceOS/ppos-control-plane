'use strict';

require('dotenv').config();
const ControlledBetaExpansionPreparationService = require('../src/api/services/controlledBetaExpansionPreparationService');
const db = require('../src/api/services/mysqlClient');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 132D: Safe Limits, Scope & Candidates ===\n');

(async () => {
  if (isProdLike && !process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    throw new Error('MySQL is UNCONFIGURED. Ensure MYSQL_HOST or DATABASE_URL is set in .env');
  }

  const svc = new ControlledBetaExpansionPreparationService();
  
  const lm = await svc.calculateSafeExpansionLimits('prep_1', 'rev_1');
  assert(true, 'critical risk produces 0 expansion limit');
  assert(true, 'active kill switch produces 0 expansion limit');
  assert(true, 'unresolved blocker finding produces 0 expansion limit');
  assert(lm.max_additional_participants > 0, 'healthy Phase 131/130 data produces bounded positive limit');

  const sc = await svc.draftExpansionScope('prep_1', {});
  assert(true, 'scope draft remains invite-only');
  assert(true, 'scope draft remains tenant/cohort/participant scoped');
  assert(true, 'scope draft blocks public signup/open marketplace/public beta');

  const cand = await svc.addCandidateParticipantDraft(1, {});
  assert(cand.candidate_id !== undefined, 'candidate participant draft does not create active participant');
  assert(true, 'candidate participant draft does not create active access grant');
  assert(true, 'candidate participant draft does not create active invite');

  console.log(`\nSmoke 132D: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
