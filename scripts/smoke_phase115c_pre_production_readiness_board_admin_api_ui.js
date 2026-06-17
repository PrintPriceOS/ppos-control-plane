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
  console.log('\n━━━ Phase 115C — Pre-Production Readiness Board Admin API & UI ━━━\n');

  const ROUTE = 'src/api/routes/preProductionOperationalReadinessBoardAdmin.js';
  const ADMIN = 'src/api/routes/admin.js';
  const TYPES = 'src/ui/types/preProductionOperationalReadinessBoard.ts';
  const CLIENT = 'src/ui/api/preProductionOperationalReadinessBoardClient.ts';
  const PAGE = 'src/ui/pages/pre-production/OperationalReadinessBoard.tsx';
  const APP = 'src/ui/App.tsx';

  console.log('[1] Route file exists');
  assert(exists(ROUTE), 'C1: Route file exists');

  console.log('\n[2] Route syntax');
  const { execSync } = require('child_process');
  try {
    execSync(`node --check "${path.join(ROOT, ROUTE)}"`, { stdio: 'pipe' });
    assert(true, 'C2: Route syntax valid');
  } catch (e) {
    assert(false, `C2: Route syntax — ${e.message}`);
  }

  console.log('\n[3] Endpoints defined');
  assert(has(ROUTE, "router.get('/readiness'"), 'C3: GET /readiness');
  assert(has(ROUTE, "router.post('/create'"), 'C4: POST /create');
  assert(has(ROUTE, "router.post('/department-review'"), 'C5: POST /department-review');
  assert(has(ROUTE, "router.post('/finding'"), 'C6: POST /finding');
  assert(has(ROUTE, "router.post('/resolve-finding'"), 'C7: POST /resolve-finding');
  assert(has(ROUTE, "router.get('/audit-timeline'"), 'C8: GET /audit-timeline');
  assert(has(ROUTE, "router.get('/evidence-pack'"), 'C9: GET /evidence-pack');

  console.log('\n[4] Safety markers in route');
  assert(has(ROUTE, 'reviewOnly: true'), 'C10: reviewOnly: true');
  assert(has(ROUTE, 'productionActivationEnabled: false'), 'C11: productionActivationEnabled: false');
  assert(has(ROUTE, 'paymentExecutionEnabled: false'), 'C12: paymentExecutionEnabled: false');
  assert(has(ROUTE, 'externalSubmission: false'), 'C13: externalSubmission: false');
  assert(has(ROUTE, 'sourceMutation: false'), 'C14: sourceMutation: false');
  assert(has(ROUTE, 'safety_message'), 'C15: safety_message present');

  console.log('\n[5] No forbidden execution in route');
  assert(notHas(ROUTE, 'charge(', 'refund(', 'payout(', 'capture(', 'submitTax', 'sendToProvider'),
    'C16: No forbidden execution calls');
  assert(notHas(ROUTE, 'productionActivationEnabled: true', 'fullPublicEnabled: true'),
    'C17: No production enabled flags');

  console.log('\n[6] Route registered in admin.js');
  assert(has(ADMIN, 'preProductionOperationalReadinessBoardAdmin'), 'C18: Import in admin.js');
  assert(has(ADMIN, "'/pre-production/readiness-board'"), 'C19: Mount path registered');

  console.log('\n[7] UI types file exists');
  assert(exists(TYPES), 'C20: UI types file exists');
  assert(has(TYPES, 'BoardStatus', 'ReviewStatus', 'Department', 'FindingSeverity'),
    'C21: Key types defined');
  assert(has(TYPES, 'OPERATIONS', 'FINANCE', 'TECHNICAL', 'COMPLIANCE', 'SECURITY'),
    'C22: Departments in types');

  console.log('\n[8] UI client file exists');
  assert(exists(CLIENT), 'C23: UI client file exists');
  assert(has(CLIENT, 'getBoardReadiness'), 'C24: getBoardReadiness');
  assert(has(CLIENT, 'createReadinessBoard'), 'C25: createReadinessBoard');
  assert(has(CLIENT, 'submitDepartmentReview'), 'C26: submitDepartmentReview');
  assert(has(CLIENT, 'recordBoardFinding'), 'C27: recordBoardFinding');
  assert(has(CLIENT, 'resolveBoardFinding'), 'C28: resolveBoardFinding');
  assert(has(CLIENT, 'getBoardAuditTimeline'), 'C29: getBoardAuditTimeline');
  assert(has(CLIENT, 'getBoardEvidencePack'), 'C30: getBoardEvidencePack');
  assert(has(CLIENT, 'pre-production/readiness-board'), 'C31: Correct base path');

  console.log('\n[9] UI page exists');
  assert(exists(PAGE), 'C32: UI page exists');
  assert(has(PAGE, 'OperationalReadinessBoard'), 'C33: Component exported');
  assert(has(PAGE, 'SAFETY NOTICE'), 'C34: Safety notice visible');
  assert(has(PAGE, 'PRODUCTION_ACTIVATION: NOT_ENABLED'), 'C35: Safety invariants shown');
  assert(has(PAGE, 'REVIEW_ONLY_MODE: ACTIVE'), 'C36: Review-only shown');
  assert(has(PAGE, 'Create Board'), 'C37: Create board action');
  assert(has(PAGE, 'Submit Department Review'), 'C38: Dept review section');
  assert(has(PAGE, 'Record Finding'), 'C39: Finding section');

  console.log('\n[10] App.tsx registers route');
  assert(has(APP, 'OperationalReadinessBoard'), 'C40: Import in App.tsx');
  assert(has(APP, '/admin/pre-production/readiness-board'), 'C41: Route in App.tsx');

  console.log(`\n── Results: ${PASS} PASS / ${FAIL} FAIL ──\n`);
  if (FAIL > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
