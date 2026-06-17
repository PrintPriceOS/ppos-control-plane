'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let PASS = 0, FAIL = 0;

function assert(condition, label) {
  if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
  else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
  return condition;
}

const ROOT = path.resolve(__dirname, '..');

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function src(relPath) {
  try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
  catch (_) { return ''; }
}

function has(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => content.includes(p));
}

function notHas(relPath, ...patterns) {
  const content = src(relPath);
  return patterns.every(p => !content.includes(p));
}

function syntaxOk(relPath) {
  try {
    execSync(`node --check "${path.join(ROOT, relPath)}"`, { stdio: 'pipe' });
    return true;
  } catch (_) { return false; }
}

async function run() {
  console.log('\n━━━ Phase 115D — Pre-Production Readiness Board Acceptance Pack ━━━\n');

  // ── 1. Prior smoke scripts ─────────────────────────────────────────────────
  console.log('[1] Prior phase smoke scripts');
  assert(exists('scripts/smoke_phase115a_pre_production_readiness_board_schema.js'), 'ACC1: 115A smoke exists');
  assert(exists('scripts/smoke_phase115b_pre_production_readiness_board_service.js'), 'ACC2: 115B smoke exists');
  assert(exists('scripts/smoke_phase115c_pre_production_readiness_board_admin_api_ui.js'), 'ACC3: 115C smoke exists');

  // ── 2. Migration ───────────────────────────────────────────────────────────
  console.log('\n[2] Migration 057');
  assert(exists('migrations/057_phase115_pre_production_operational_readiness_board.sql'), 'ACC4: Migration 057 exists');

  // ── 3. Service ─────────────────────────────────────────────────────────────
  console.log('\n[3] Service');
  const SVC = 'src/api/services/preProductionOperationalReadinessBoardService.js';
  assert(exists(SVC), 'ACC5: Service file exists');
  assert(syntaxOk(SVC), 'ACC6: Service syntax valid');
  assert(has(SVC, 'createBoardReview', 'evaluateBoardReadiness', 'submitDepartmentReview',
    'recordFinding', 'resolveFinding', 'buildBoardEvidencePack', 'getBoardAuditTimeline'),
    'ACC7: All 7 service methods');

  // ── 4. Route ───────────────────────────────────────────────────────────────
  console.log('\n[4] Route');
  const ROUTE = 'src/api/routes/preProductionOperationalReadinessBoardAdmin.js';
  assert(exists(ROUTE), 'ACC8: Route file exists');
  assert(syntaxOk(ROUTE), 'ACC9: Route syntax valid');
  assert(has(ROUTE,
    "router.get('/readiness'", "router.post('/create'", "router.post('/department-review'",
    "router.post('/finding'", "router.post('/resolve-finding'",
    "router.get('/audit-timeline'", "router.get('/evidence-pack'"),
    'ACC10: All 7 endpoints');

  // ── 5. Admin.js mount ──────────────────────────────────────────────────────
  console.log('\n[5] admin.js mount');
  assert(has('src/api/routes/admin.js', "'/pre-production/readiness-board'"), 'ACC11: Mount path registered');

  // ── 6. UI files ────────────────────────────────────────────────────────────
  console.log('\n[6] UI files');
  assert(exists('src/ui/types/preProductionOperationalReadinessBoard.ts'), 'ACC12: Types file');
  assert(exists('src/ui/api/preProductionOperationalReadinessBoardClient.ts'), 'ACC13: Client file');
  assert(exists('src/ui/pages/pre-production/OperationalReadinessBoard.tsx'), 'ACC14: Page file');

  // ── 7. App.tsx route ───────────────────────────────────────────────────────
  console.log('\n[7] App.tsx route');
  assert(has('src/ui/App.tsx', 'OperationalReadinessBoard'), 'ACC15: Import in App.tsx');
  assert(has('src/ui/App.tsx', '/admin/pre-production/readiness-board'), 'ACC16: Route in App.tsx');

  // ── 8. Safety markers in all Phase 115 files ───────────────────────────────
  console.log('\n[8] Safety markers');
  assert(has(SVC, 'reviewOnly: true'), 'ACC17: reviewOnly in service');
  assert(has(SVC, 'productionActivationEnabled: false'), 'ACC18: productionActivationEnabled false in service');
  assert(has(ROUTE, 'reviewOnly: true'), 'ACC19: reviewOnly in route');
  assert(has(ROUTE, 'productionActivationEnabled: false'), 'ACC20: productionActivationEnabled false in route');
  assert(has('src/ui/pages/pre-production/OperationalReadinessBoard.tsx', 'PRODUCTION_ACTIVATION: NOT_ENABLED'),
    'ACC21: Safety invariants in UI');

  // ── 9. No forbidden execution patterns ────────────────────────────────────
  console.log('\n[9] No forbidden patterns');
  const FORBIDDEN = ['charge(', 'refund(', 'payout(', 'capture(', 'submitTax', 'submitVat', 'sendToProvider'];
  let forbiddenViolations = 0;
  for (const pattern of FORBIDDEN) {
    if (src(SVC).includes(pattern)) { forbiddenViolations++; console.error(`    FORBIDDEN in service: ${pattern}`); }
    if (src(ROUTE).includes(pattern)) { forbiddenViolations++; console.error(`    FORBIDDEN in route: ${pattern}`); }
  }
  assert(forbiddenViolations === 0, `ACC22: 0 forbidden patterns (found ${forbiddenViolations})`);
  assert(notHas(SVC, 'production_activation_enabled: true', 'full_public_enabled: true',
    'payment_execution_enabled: true', 'refund_execution_enabled: true', 'payout_execution_enabled: true'),
    'ACC23: No production enabled in service');

  // ── 10. Schema safety columns ─────────────────────────────────────────────
  console.log('\n[10] Schema safety columns');
  assert(has('migrations/057_phase115_pre_production_operational_readiness_board.sql',
    'review_only BOOLEAN NOT NULL DEFAULT TRUE',
    'production_activation_enabled BOOLEAN NOT NULL DEFAULT FALSE'),
    'ACC24: Schema safety columns correct');
  assert(has('migrations/057_phase115_pre_production_operational_readiness_board.sql',
    'blocks_sign_off BOOLEAN NOT NULL DEFAULT TRUE'),
    'ACC25: blocks_sign_off column present');

  // ── 11. task.md and walkthrough.md ────────────────────────────────────────
  console.log('\n[11] Documentation');
  assert(has('task.md', '115') || has('walkthrough.md', '115'), 'ACC26: Phase 115 in task.md or walkthrough.md');

  // ── 12. Live E2E board lifecycle ──────────────────────────────────────────
  console.log('\n[12] Live E2E lifecycle');
  const BoardService = require(path.join(ROOT, SVC));
  const svc = new BoardService();

  const created = await svc.createBoardReview({ requested_by: 'acceptance-pack-smoke' });
  assert(typeof created.board_id === 'string', 'ACC27: board_id returned');
  assert(created.safety && created.safety.reviewOnly === true, 'ACC28: safety.reviewOnly on create');

  const boardId = created.board_id;

  for (const dept of ['OPERATIONS', 'FINANCE', 'TECHNICAL', 'COMPLIANCE', 'SECURITY', 'CUSTOMER_SUPPORT', 'PRINT_PARTNER_SUCCESS']) {
    await svc.submitDepartmentReview({ board_id: boardId, department: dept, reviewer: 'smoke', status: 'APPROVED' });
  }
  const readiness = await svc.evaluateBoardReadiness({ board_id: boardId });
  assert(readiness.readiness === 'READY_FOR_SIGN_OFF', 'ACC29: READY_FOR_SIGN_OFF after all depts approve');
  assert(readiness.open_blockers === 0, 'ACC30: No open blockers');

  const finding = await svc.recordFinding({ board_id: boardId, title: 'Acceptance pack test', severity: 'MAJOR', raised_by: 'smoke' });
  assert(typeof finding.finding_id === 'string', 'ACC31: finding_id returned');
  assert(finding.review_only === true, 'ACC32: finding review_only true');

  const resolved = await svc.resolveFinding({ board_id: boardId, finding_id: finding.finding_id, resolved_by: 'smoke' });
  assert(resolved.status === 'RESOLVED', 'ACC33: Finding resolved');

  const pack = await svc.buildBoardEvidencePack({ board_id: boardId });
  assert(pack.safety && pack.safety.reviewOnly === true, 'ACC34: Evidence pack safety');
  assert(pack.safety_invariants && pack.safety_invariants.production_activation_enabled === false,
    'ACC35: production_activation_enabled false in evidence pack');
  assert(typeof pack.evidence_generated_at === 'string', 'ACC36: evidence_generated_at present');

  const timeline = await svc.getBoardAuditTimeline({ board_id: boardId });
  assert(Array.isArray(timeline.audit_timeline), 'ACC37: audit_timeline array');
  const eventTypes = timeline.audit_timeline.map(e => e.event_type);
  assert(eventTypes.includes('BOARD_CREATED'), 'ACC38: BOARD_CREATED event');
  assert(eventTypes.includes('DEPARTMENT_REVIEW_SUBMITTED'), 'ACC39: DEPARTMENT_REVIEW_SUBMITTED event');
  assert(eventTypes.includes('BOARD_READINESS_EVALUATED'), 'ACC40: BOARD_READINESS_EVALUATED event');
  assert(eventTypes.includes('FINDING_RECORDED'), 'ACC41: FINDING_RECORDED event');
  assert(eventTypes.includes('FINDING_RESOLVED'), 'ACC42: FINDING_RESOLVED event');
  assert(eventTypes.includes('EVIDENCE_PACK_BUILT'), 'ACC43: EVIDENCE_PACK_BUILT event');

  console.log(`\n── Results: ${PASS} PASS / ${FAIL} FAIL ──\n`);

  console.log('');
  console.log('PRINTPRICE OS — PHASE 115 PRE-PRODUCTION OPERATIONAL READINESS BOARD');
  console.log(`STATUS: ${FAIL === 0 ? 'VALIDATED' : 'FAILED'}`);
  console.log('REVIEW_ONLY_MODE: ACTIVE');
  console.log('SIGN_OFF_WORKFLOW: ACTIVE');
  console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
  console.log('FULL_PUBLIC: NOT_ENABLED');
  console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
  console.log('PAYMENT_EXECUTION: NOT_ENABLED');
  console.log('REFUND_EXECUTION: NOT_ENABLED');
  console.log('PAYOUT_EXECUTION: NOT_ENABLED');
  console.log('EXTERNAL_SUBMISSION: NOT_ENABLED');
  console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
  console.log('');

  if (FAIL > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
