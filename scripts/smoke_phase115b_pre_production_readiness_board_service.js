'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;

function assert(condition, label) {
  if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
  else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
  return condition;
}

const ROOT = path.resolve(__dirname, '..');
const SVC_PATH = path.join(ROOT, 'src/api/services/preProductionOperationalReadinessBoardService.js');

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

async function run() {
  console.log('\n━━━ Phase 115B — Pre-Production Readiness Board Service ━━━\n');

  const SVC_REL = 'src/api/services/preProductionOperationalReadinessBoardService.js';

  console.log('[1] Service file exists');
  assert(exists(SVC_REL), 'B1: Service file exists');

  console.log('\n[2] Syntax check');
  const { execSync } = require('child_process');
  try {
    execSync(`node --check "${SVC_PATH}"`, { stdio: 'pipe' });
    assert(true, 'B2: Syntax valid');
  } catch (e) {
    assert(false, `B2: Syntax valid — ${e.message}`);
  }

  console.log('\n[3] Required methods present');
  assert(has(SVC_REL, 'createBoardReview'), 'B3: createBoardReview');
  assert(has(SVC_REL, 'evaluateBoardReadiness'), 'B4: evaluateBoardReadiness');
  assert(has(SVC_REL, 'submitDepartmentReview'), 'B5: submitDepartmentReview');
  assert(has(SVC_REL, 'recordFinding'), 'B6: recordFinding');
  assert(has(SVC_REL, 'resolveFinding'), 'B7: resolveFinding');
  assert(has(SVC_REL, 'buildBoardEvidencePack'), 'B8: buildBoardEvidencePack');
  assert(has(SVC_REL, 'getBoardAuditTimeline'), 'B9: getBoardAuditTimeline');

  console.log('\n[4] Safety markers present');
  assert(has(SVC_REL, 'reviewOnly: true'), 'B10: reviewOnly: true');
  assert(has(SVC_REL, 'productionActivationEnabled: false'), 'B11: productionActivationEnabled: false');
  assert(has(SVC_REL, 'fullPublicEnabled: false'), 'B12: fullPublicEnabled: false');
  assert(has(SVC_REL, 'liveProviderConnectivityEnabled: false'), 'B13: liveProviderConnectivityEnabled: false');
  assert(has(SVC_REL, 'paymentExecutionEnabled: false'), 'B14: paymentExecutionEnabled: false');
  assert(has(SVC_REL, 'refundExecutionEnabled: false'), 'B15: refundExecutionEnabled: false');
  assert(has(SVC_REL, 'payoutExecutionEnabled: false'), 'B16: payoutExecutionEnabled: false');
  assert(has(SVC_REL, 'externalSubmission: false'), 'B17: externalSubmission: false');
  assert(has(SVC_REL, 'sourceMutation: false'), 'B18: sourceMutation: false');

  console.log('\n[5] Safety flags (DB columns) present');
  assert(has(SVC_REL, 'review_only: true'), 'B19: review_only: true');
  assert(has(SVC_REL, 'production_activation_enabled: false'), 'B20: production_activation_enabled: false');
  assert(has(SVC_REL, 'external_submission_enabled: false'), 'B21: external_submission_enabled: false');
  assert(has(SVC_REL, 'source_mutation_enabled: false'), 'B22: source_mutation_enabled: false');

  console.log('\n[6] All departments defined');
  assert(has(SVC_REL, 'OPERATIONS', 'FINANCE', 'TECHNICAL', 'COMPLIANCE', 'SECURITY', 'CUSTOMER_SUPPORT', 'PRINT_PARTNER_SUCCESS'),
    'B23: All 7 departments');

  console.log('\n[7] Phase safety string present');
  assert(has(SVC_REL, 'PHASE_115_REVIEW_ONLY'), 'B24: PHASE_115_REVIEW_ONLY');

  console.log('\n[8] No forbidden execution patterns');
  assert(notHas(SVC_REL, 'charge(', 'refund(', 'payout(', 'capture(', 'submitTax', 'submitVat', 'sendToProvider'),
    'B25: No forbidden execution calls');
  assert(notHas(SVC_REL, 'production_activation_enabled: true', 'full_public_enabled: true'),
    'B26: No production enabled flags');

  console.log('\n[9] Live service instantiation and method calls');
  let svc;
  try {
    const BoardService = require(SVC_PATH);
    svc = new BoardService();
    assert(typeof svc.createBoardReview === 'function', 'B27: createBoardReview is function');
    assert(typeof svc.evaluateBoardReadiness === 'function', 'B28: evaluateBoardReadiness is function');
    assert(typeof svc.submitDepartmentReview === 'function', 'B29: submitDepartmentReview is function');
    assert(typeof svc.recordFinding === 'function', 'B30: recordFinding is function');
    assert(typeof svc.resolveFinding === 'function', 'B31: resolveFinding is function');
    assert(typeof svc.buildBoardEvidencePack === 'function', 'B32: buildBoardEvidencePack is function');
    assert(typeof svc.getBoardAuditTimeline === 'function', 'B33: getBoardAuditTimeline is function');
  } catch (e) {
    assert(false, `B27-B33: Service instantiation failed — ${e.message}`);
  }

  if (svc) {
    console.log('\n[10] createBoardReview returns safety markers');
    const board = await svc.createBoardReview({ requested_by: 'smoke-test' });
    assert(board.safety && board.safety.reviewOnly === true, 'B34: createBoardReview.safety.reviewOnly === true');
    assert(board.safety && board.safety.productionActivationEnabled === false, 'B35: productionActivationEnabled false');
    assert(board.safety && board.safety.paymentExecutionEnabled === false, 'B36: paymentExecutionEnabled false');
    assert(board.safety && board.safety.externalSubmission === false, 'B37: externalSubmission false');
    assert(board.safety && board.safety.sourceMutation === false, 'B38: sourceMutation false');
    assert(typeof board.board_id === 'string', 'B39: board_id is string');

    const boardId = board.board_id;

    console.log('\n[11] evaluateBoardReadiness returns safety markers');
    const readiness = await svc.evaluateBoardReadiness({ board_id: boardId });
    assert(readiness.safety && readiness.safety.reviewOnly === true, 'B40: readiness.safety.reviewOnly');
    assert(typeof readiness.readiness === 'string', 'B41: readiness.readiness is string');

    console.log('\n[12] submitDepartmentReview returns review_only');
    const rev = await svc.submitDepartmentReview({
      board_id: boardId, department: 'TECHNICAL', reviewer: 'smoke', status: 'APPROVED',
    });
    assert(rev.review_only === true, 'B42: review_only true');
    assert(rev.safety && rev.safety.reviewOnly === true, 'B43: rev.safety.reviewOnly');

    console.log('\n[13] recordFinding works');
    const finding = await svc.recordFinding({ board_id: boardId, title: 'Smoke test finding', raised_by: 'smoke' });
    assert(finding.safety && finding.safety.reviewOnly === true, 'B44: finding safety');
    assert(typeof finding.finding_id === 'string', 'B45: finding_id is string');

    console.log('\n[14] resolveFinding works');
    const resolved = await svc.resolveFinding({ board_id: boardId, finding_id: finding.finding_id, resolved_by: 'smoke' });
    assert(resolved.status === 'RESOLVED', 'B46: finding resolved');

    console.log('\n[15] buildBoardEvidencePack returns safety invariants');
    const pack = await svc.buildBoardEvidencePack({ board_id: boardId });
    assert(pack.safety && pack.safety.reviewOnly === true, 'B47: pack.safety.reviewOnly');
    assert(pack.safety_invariants && pack.safety_invariants.review_only === true, 'B48: safety_invariants.review_only');
    assert(pack.safety_invariants && pack.safety_invariants.production_activation_enabled === false, 'B49: safety_invariants.production_activation_enabled false');

    console.log('\n[16] getBoardAuditTimeline returns events');
    const timeline = await svc.getBoardAuditTimeline({ board_id: boardId });
    assert(Array.isArray(timeline.audit_timeline), 'B50: audit_timeline is array');
    assert(timeline.audit_timeline.some(e => e.event_type === 'BOARD_CREATED'), 'B51: BOARD_CREATED in timeline');
    assert(timeline.safety && timeline.safety.reviewOnly === true, 'B52: timeline.safety.reviewOnly');
  }

  console.log(`\n── Results: ${PASS} PASS / ${FAIL} FAIL ──\n`);
  if (FAIL > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
