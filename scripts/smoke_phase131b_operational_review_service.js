'use strict';

const fs = require('fs');
const path = require('path');
const ControlledBetaOperationalReviewService = require('../src/api/services/controlledBetaOperationalReviewService');
const db = require('../src/api/services/mysqlClient');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 131B: Operational Review Service ===\n');

(async () => {
  const serviceFile = path.join(__dirname, '../src/api/services/controlledBetaOperationalReviewService.js');
  assert(fs.existsSync(serviceFile), 'service file exists');

  const svc = new ControlledBetaOperationalReviewService();
  
  assert(typeof svc.evaluateOperationalReviewReadiness === 'function', 'evaluateOperationalReviewReadiness exists');
  assert(typeof svc.createOperationalReview === 'function', 'createOperationalReview exists');
  assert(typeof svc.ingestRuntimeObservationInputs === 'function', 'ingestRuntimeObservationInputs exists');
  assert(typeof svc.evaluateExitCriteria === 'function', 'evaluateExitCriteria exists');
  assert(typeof svc.calculateOperationalReviewScore === 'function', 'calculateOperationalReviewScore exists');
  assert(typeof svc.calculateExpansionReadinessScore === 'function', 'calculateExpansionReadinessScore exists');
  assert(typeof svc.calculateOperationalRiskScore === 'function', 'calculateOperationalRiskScore exists');
  assert(typeof svc.recordOperationalReviewFinding === 'function', 'recordOperationalReviewFinding exists');
  assert(typeof svc.resolveOperationalReviewFinding === 'function', 'resolveOperationalReviewFinding exists');
  assert(typeof svc.buildExpansionRecommendation === 'function', 'buildExpansionRecommendation exists');
  assert(typeof svc.createExitDecisionDraft === 'function', 'createExitDecisionDraft exists');
  assert(typeof svc.submitExitDecisionForApproval === 'function', 'submitExitDecisionForApproval exists');
  assert(typeof svc.approveExitDecision === 'function', 'approveExitDecision exists');
  assert(typeof svc.rejectExitDecision === 'function', 'rejectExitDecision exists');
  assert(typeof svc.blockExpansion === 'function', 'blockExpansion exists');
  assert(typeof svc.recommendRemediation === 'function', 'recommendRemediation exists');
  assert(typeof svc.recommendControlledExpansion === 'function', 'recommendControlledExpansion exists');
  assert(typeof svc.recommendRemainInBeta === 'function', 'recommendRemainInBeta exists');
  assert(typeof svc.recommendPauseBeta === 'function', 'recommendPauseBeta exists');
  assert(typeof svc.buildOperationalReviewEvidencePack === 'function', 'buildOperationalReviewEvidencePack exists');
  assert(typeof svc.getOperationalReviewAuditTimeline === 'function', 'getOperationalReviewAuditTimeline exists');
  assert(typeof svc.getOperationalReviewDashboardState === 'function', 'getOperationalReviewDashboardState exists');

  const rev = await svc.createOperationalReview({ activation_id: 'act_123', gate_id: 'g_1', cohort_id: 'c_1', tenant_id: 't_1' });
  assert(rev.status === 'DRAFT', 'operational review can be created');

  const ing = await svc.ingestRuntimeObservationInputs(rev.review_id, 'act_123');
  assert(ing.ok, 'Phase 130 inputs can be ingested from DB-backed evidence');

  const ex = await svc.evaluateExitCriteria(rev.review_id, 'act_123');
  assert(ex.ok !== undefined, 'exit criteria can be evaluated');

  const sc = await svc.calculateOperationalReviewScore(rev.review_id, 'act_123');
  assert(sc.operational_score !== undefined, 'scores can be calculated');

  const rec = await svc.buildExpansionRecommendation(rev.review_id, 'act_123');
  assert(rec.recommendation !== undefined, 'expansion recommendation can be built');

  const dr = await svc.createExitDecisionDraft(rev.review_id, 'act_123', 'BLOCK_EXPANSION');
  assert(dr.status === 'DRAFT', 'decision draft can be created');

  const fn = await svc.recordOperationalReviewFinding(rev.review_id, 'act_123', { finding_severity: 'MEDIUM' });
  assert(fn.finding_id !== undefined, 'finding can be created');

  const rf = await svc.resolveOperationalReviewFinding(fn.finding_id);
  assert(rf.ok, 'finding can be resolved');

  const ep = await svc.buildOperationalReviewEvidencePack(rev.review_id, 'act_123');
  assert(ep.evidence_schema_version === '131.0', 'evidence pack can be built');

  const au = await svc.getOperationalReviewAuditTimeline(rev.review_id);
  assert(Array.isArray(au), 'audit timeline can be returned');

  console.log(`\nSmoke 131B: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
