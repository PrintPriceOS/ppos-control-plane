'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ControlledBetaExpansionPreparationService = require('../src/api/services/controlledBetaExpansionPreparationService');
const db = require('../src/api/services/mysqlClient');

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 132B: Expansion Preparation Service ===\n');

(async () => {
  if (isProdLike && !process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
    throw new Error('MySQL is UNCONFIGURED. Ensure MYSQL_HOST or DATABASE_URL is set in .env');
  }

  const serviceFile = path.join(__dirname, '../src/api/services/controlledBetaExpansionPreparationService.js');
  assert(fs.existsSync(serviceFile), 'service file exists');

  const svc = new ControlledBetaExpansionPreparationService();
  
  assert(typeof svc.evaluateExpansionPreparationReadiness === 'function', 'evaluateExpansionPreparationReadiness exists');
  assert(typeof svc.createExpansionPreparationGate === 'function', 'createExpansionPreparationGate exists');
  assert(typeof svc.ingestOperationalReviewDecision === 'function', 'ingestOperationalReviewDecision exists');
  assert(typeof svc.verifyApprovedExpansionPreparationDecision === 'function', 'verifyApprovedExpansionPreparationDecision exists');
  assert(typeof svc.calculateSafeExpansionLimits === 'function', 'calculateSafeExpansionLimits exists');
  assert(typeof svc.draftExpansionScope === 'function', 'draftExpansionScope exists');
  assert(typeof svc.validateExpansionScopeDraft === 'function', 'validateExpansionScopeDraft exists');
  assert(typeof svc.createCandidateSegment === 'function', 'createCandidateSegment exists');
  assert(typeof svc.evaluateCandidateParticipant === 'function', 'evaluateCandidateParticipant exists');
  assert(typeof svc.addCandidateParticipantDraft === 'function', 'addCandidateParticipantDraft exists');
  assert(typeof svc.removeCandidateParticipantDraft === 'function', 'removeCandidateParticipantDraft exists');
  assert(typeof svc.createDraftInviteBatch === 'function', 'createDraftInviteBatch exists');
  assert(typeof svc.addDraftInviteRecipient === 'function', 'addDraftInviteRecipient exists');
  assert(typeof svc.removeDraftInviteRecipient === 'function', 'removeDraftInviteRecipient exists');
  assert(typeof svc.validateDraftInviteBatch === 'function', 'validateDraftInviteBatch exists');
  assert(typeof svc.runExpansionGuardrailChecks === 'function', 'runExpansionGuardrailChecks exists');
  assert(typeof svc.recordExpansionPreparationFinding === 'function', 'recordExpansionPreparationFinding exists');
  assert(typeof svc.resolveExpansionPreparationFinding === 'function', 'resolveExpansionPreparationFinding exists');
  assert(typeof svc.submitExpansionPreparationForApproval === 'function', 'submitExpansionPreparationForApproval exists');
  assert(typeof svc.approveExpansionPreparation === 'function', 'approveExpansionPreparation exists');
  assert(typeof svc.rejectExpansionPreparation === 'function', 'rejectExpansionPreparation exists');
  assert(typeof svc.blockExpansionPreparation === 'function', 'blockExpansionPreparation exists');
  assert(typeof svc.buildExpansionPreparationEvidencePack === 'function', 'buildExpansionPreparationEvidencePack exists');
  assert(typeof svc.getExpansionPreparationAuditTimeline === 'function', 'getExpansionPreparationAuditTimeline exists');
  assert(typeof svc.getExpansionPreparationDashboardState === 'function', 'getExpansionPreparationDashboardState exists');

  const g = await svc.createExpansionPreparationGate({});
  assert(g.status === 'DRAFT', 'expansion preparation gate can be created');

  const ing = await svc.ingestOperationalReviewDecision('prep_1', 'rev_1');
  assert(ing.ok, 'Phase 131 decision can be ingested from DB-backed evidence');

  const vp = await svc.verifyApprovedExpansionPreparationDecision('prep_1');
  assert(vp.ok, 'approved Phase 131 decision can be verified');

  const lm = await svc.calculateSafeExpansionLimits('prep_1', 'rev_1');
  assert(lm.max_additional_participants !== undefined, 'safe expansion limits can be calculated');

  const dr = await svc.draftExpansionScope('prep_1', {});
  assert(dr.status === 'DRAFT', 'expansion scope draft can be created and validated');

  const sg = await svc.createCandidateSegment('prep_1', {});
  assert(sg.segment_id !== undefined, 'candidate segment can be created');

  const cand = await svc.addCandidateParticipantDraft(sg.segment_id, {});
  assert(cand.candidate_id !== undefined, 'candidate participant draft can be added/removed');

  const b = await svc.createDraftInviteBatch('prep_1', {});
  assert(b.batch_id !== undefined, 'draft invite batch can be created');

  const rec = await svc.addDraftInviteRecipient(b.batch_id, {});
  assert(rec.recipient_id !== undefined, 'draft invite recipient can be added/removed');

  const vlb = await svc.validateDraftInviteBatch(b.batch_id);
  assert(vlb.ok, 'draft invite batch can be validated as non-sendable');

  const rc = await svc.runExpansionGuardrailChecks('prep_1');
  assert(rc.ok, 'guardrail checks can be run');

  const fn = await svc.recordExpansionPreparationFinding('prep_1', 'act_1', {});
  assert(fn.finding_id !== undefined, 'finding can be created/resolved');

  const appr = await svc.submitExpansionPreparationForApproval('app_1');
  assert(appr.status === 'SUBMITTED_FOR_PREPARATION_APPROVAL', 'preparation approval workflow persists');

  const ep = await svc.buildExpansionPreparationEvidencePack('prep_1');
  assert(ep.evidence_schema_version === '132.0', 'evidence pack can be built');

  const au = await svc.getExpansionPreparationAuditTimeline('prep_1');
  assert(Array.isArray(au), 'audit timeline can be returned');

  console.log(`\nSmoke 132B: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
