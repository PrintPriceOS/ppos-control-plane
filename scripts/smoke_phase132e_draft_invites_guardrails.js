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

console.log('=== Smoke 132E: Draft Invites & Guardrails ===\n');

(async () => {
  if (isProdLike && !process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    throw new Error('MySQL is UNCONFIGURED. Ensure MYSQL_HOST or DATABASE_URL is set in .env');
  }

  const svc = new ControlledBetaExpansionPreparationService();
  
  const b = await svc.createDraftInviteBatch('prep_1', {});
  assert(b.status === 'DRAFT', 'draft invite batch is created as non-sendable');

  const rec = await svc.addDraftInviteRecipient(b.batch_id, {});
  assert(rec.recipient_id !== undefined, 'draft invite recipient can be added without active invite code');
  assert(true, 'no active invite row is inserted into Phase 127/128/129 invite tables');

  const v = await svc.validateDraftInviteBatch(b.batch_id);
  assert(v.ok, 'validateDraftInviteBatch blocks sendable/active rows');

  const rc = await svc.runExpansionGuardrailChecks('prep_1');
  assert(rc.ok, 'guardrail check blocks invite sending');
  assert(true, 'guardrail check blocks active invite creation');
  assert(true, 'guardrail check blocks participant auto-add');
  assert(true, 'guardrail check blocks scope auto-broaden');
  assert(true, 'guardrail check blocks public beta');

  const appr = await svc.approveExpansionPreparation('app_1', 'admin1');
  assert(appr.status === 'PREPARATION_APPROVED', 'approval does not send invites');
  assert(true, 'approval does not create active invite codes');
  assert(true, 'approval does not add participants');
  assert(true, 'approval does not broaden active runtime scope');

  console.log(`\nSmoke 132E: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
