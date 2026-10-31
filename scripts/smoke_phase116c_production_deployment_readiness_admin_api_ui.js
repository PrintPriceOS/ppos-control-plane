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
  console.log('\n━━━ Phase 116C — Production Deployment Readiness Admin API & UI ━━━\n');

  const ROUTE = 'src/api/routes/productionDeploymentReadinessChecklistAdmin.js';
  const ADMIN = 'src/api/routes/admin.js';
  const CLIENT = 'src/ui/api/productionDeploymentReadinessChecklistClient.ts';
  const TYPES = 'src/ui/types/productionDeploymentReadinessChecklist.ts';
  const PAGE = 'src/ui/pages/deployment/ProductionDeploymentReadiness.tsx';
  const APPTSX = 'src/ui/App.tsx';

  console.log('[1] Route file');
  assert(exists(ROUTE), 'C1: Route file exists');
  assert(syntaxOk(ROUTE), 'C2: Route syntax valid');
  assert(has(ROUTE, "router.get('/checks'"), 'C3: GET /checks endpoint');
  assert(has(ROUTE, "router.post('/evaluate'"), 'C4: POST /evaluate endpoint');
  assert(has(ROUTE, "router.post('/finding'"), 'C5: POST /finding endpoint');
  assert(has(ROUTE, "router.post('/resolve-finding'"), 'C6: POST /resolve-finding endpoint');
  assert(has(ROUTE, "router.get('/evidence-pack'"), 'C7: GET /evidence-pack endpoint');
  assert(has(ROUTE, "router.get('/audit-timeline'"), 'C8: GET /audit-timeline endpoint');

  console.log('\n[2] Safety markers in route');
  assert(has(ROUTE, 'checklistOnly: true'), 'C9: checklistOnly: true in safety markers');
  assert(has(ROUTE, 'deploymentExecuted: false'), 'C10: deploymentExecuted: false');
  assert(has(ROUTE, 'productionActivationEnabled: false'), 'C11: productionActivationEnabled: false');
  assert(has(ROUTE, 'paymentExecutionEnabled: false'), 'C12: paymentExecutionEnabled: false');
  assert(has(ROUTE, 'safety_message'), 'C13: safety_message present');
  assert(has(ROUTE, 'checklist-only'), 'C14: checklist-only in safety message');

  console.log('\n[3] admin.js mount');
  assert(has(ADMIN, "'/deployment/readiness'"), 'C15: /deployment/readiness mount in admin.js');
  assert(has(ADMIN, 'productionDeploymentReadinessChecklistAdmin'), 'C16: productionDeploymentReadinessChecklistAdmin required');

  console.log('\n[4] UI client');
  assert(exists(CLIENT), 'C17: UI client exists');
  assert(has(CLIENT, 'getDeploymentReadinessChecks'), 'C18: getDeploymentReadinessChecks');
  assert(has(CLIENT, 'evaluateDeploymentReadiness'), 'C19: evaluateDeploymentReadiness');
  assert(has(CLIENT, 'recordDeploymentFinding'), 'C20: recordDeploymentFinding');
  assert(has(CLIENT, 'resolveDeploymentFinding'), 'C21: resolveDeploymentFinding');
  assert(has(CLIENT, 'getDeploymentReadinessEvidencePack'), 'C22: getDeploymentReadinessEvidencePack');
  assert(has(CLIENT, 'getDeploymentReadinessAuditTimeline'), 'C23: getDeploymentReadinessAuditTimeline');
  assert(has(CLIENT, "'/api/admin/deployment/readiness'"), 'C24: Correct API base path');

  console.log('\n[5] UI types');
  assert(exists(TYPES), 'C25: UI types file exists');
  assert(has(TYPES, 'CheckStatus', 'CheckCategory', 'FindingSeverity', 'EvidencePack',
    'EvaluatePayload', 'RecordFindingPayload', 'SafetyMarkers'), 'C26: Required types exported');
  assert(has(TYPES, "checklistOnly: true", "deploymentExecuted: false"), 'C27: Safety types use readonly true/false');

  console.log('\n[6] UI page');
  assert(exists(PAGE), 'C28: UI page exists');
  assert(has(PAGE, 'ProductionDeploymentReadiness'), 'C29: Component exported');
  assert(has(PAGE, 'CHECKLIST-ONLY MODE'), 'C30: Safety notice visible in UI');
  assert(has(PAGE, 'No deployment, production activation'), 'C31: Full safety notice text');
  assert(has(PAGE, 'checklistOnly: true'), 'C32: UI displays checklistOnly marker');
  assert(has(PAGE, 'deploymentExecuted: false'), 'C33: UI displays deploymentExecuted marker');
  assert(has(PAGE, 'evaluateDeploymentReadiness'), 'C34: UI calls evaluateDeploymentReadiness');
  assert(has(PAGE, 'getDeploymentReadinessEvidencePack'), 'C35: UI calls getDeploymentReadinessEvidencePack');

  console.log('\n[7] App.tsx route');
  assert(has(APPTSX, '/admin/deployment/readiness'), 'C36: /admin/deployment/readiness route in App.tsx');
  assert(has(APPTSX, 'ProductionDeploymentReadiness'), 'C37: ProductionDeploymentReadiness imported in App.tsx');

  console.log('\n[8] No forbidden patterns in route');
  assert(notHas(ROUTE, 'charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'sendToProvider'),
    'C38: No forbidden execution patterns in route');
  assert(notHas(ROUTE, 'deploymentExecuted: true', 'productionActivationEnabled: true',
    'paymentExecutionEnabled: true'), 'C39: No enabled production flags in route');

  console.log(`\n━━━ Phase 116C RESULT: ${PASS} PASS / ${FAIL} FAIL ━━━\n`);
  if (FAIL > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
