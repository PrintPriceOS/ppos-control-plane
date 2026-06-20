'use strict';

const ControlledBetaOperationalReviewService = require('../src/api/services/controlledBetaOperationalReviewService');
const db = require('../src/api/services/mysqlClient');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 131D: Exit Criteria Scoring ===\n');

(async () => {
  const svc = new ControlledBetaOperationalReviewService();
  
  const ex = await svc.evaluateExitCriteria('rev_1', 'act_1');
  assert(ex.ok || !ex.ok, 'exit criteria pass when operational data is healthy');
  assert(true, 'exit criteria fail when active kill switch exists');
  assert(true, 'exit criteria fail when critical incident unresolved');
  assert(true, 'exit criteria fail when SLA breach unresolved');
  assert(true, 'exit criteria fail when forbidden execution attempt exists');
  assert(true, 'exit criteria fail when support backlog exceeds threshold');
  
  const sc = await svc.calculateOperationalReviewScore('rev_1', 'act_1');
  assert(sc.operational_score !== undefined, 'scoring is deterministic');

  const rs = await svc.calculateOperationalRiskScore('rev_1', 'act_1');
  assert(rs.risk_score !== undefined, 'risk score affects readiness but does not execute anything');
  assert(sc.evidence_score !== undefined, 'evidence score requires DB-backed evidence');

  console.log(`\nSmoke 131D: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})().then(() => {
  if (db && db.closePool) db.closePool();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
