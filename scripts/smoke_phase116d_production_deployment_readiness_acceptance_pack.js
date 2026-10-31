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
  console.log('\n━━━ Phase 116D — Production Deployment Readiness Acceptance Pack ━━━\n');

  // ── 1. Prior smokes ────────────────────────────────────────────────────────
  console.log('[1] Prior phase smoke scripts');
  assert(exists('scripts/smoke_phase116a_production_deployment_readiness_schema.js'), 'ACC1: 116A smoke exists');
  assert(exists('scripts/smoke_phase116b_production_deployment_readiness_service.js'), 'ACC2: 116B smoke exists');
  assert(exists('scripts/smoke_phase116c_production_deployment_readiness_admin_api_ui.js'), 'ACC3: 116C smoke exists');

  // ── 2. Migration ───────────────────────────────────────────────────────────
  console.log('\n[2] Migration 058');
  const MIG = 'migrations/058_phase116_production_deployment_readiness_checklist.sql';
  assert(exists(MIG), 'ACC4: Migration 058 exists');
  assert(has(MIG, 'production_deployment_readiness_checks',
    'production_deployment_readiness_results',
    'production_deployment_readiness_findings',
    'production_deployment_readiness_audits'), 'ACC5: All 4 tables defined');

  // ── 3. Service ─────────────────────────────────────────────────────────────
  console.log('\n[3] Service');
  const SVC = 'src/api/services/productionDeploymentReadinessChecklistService.js';
  assert(exists(SVC), 'ACC6: Service file exists');
  assert(syntaxOk(SVC), 'ACC7: Service syntax valid');
  assert(has(SVC,
    'evaluateEnvironmentReadiness', 'evaluateMigrationReadiness', 'evaluateBackupReadiness',
    'evaluateSecretsReadiness', 'evaluateObservabilityReadiness', 'evaluateRollbackReadiness',
    'evaluateSupportReadiness', 'buildDeploymentReadinessEvidencePack',
    'recordFinding', 'resolveFinding', 'getAuditTimeline'),
    'ACC8: All 11 service methods');

  // ── 4. Route ───────────────────────────────────────────────────────────────
  console.log('\n[4] Route');
  const ROUTE = 'src/api/routes/productionDeploymentReadinessChecklistAdmin.js';
  assert(exists(ROUTE), 'ACC9: Route file exists');
  assert(syntaxOk(ROUTE), 'ACC10: Route syntax valid');
  assert(has(ROUTE,
    "router.get('/checks'", "router.post('/evaluate'",
    "router.post('/finding'", "router.post('/resolve-finding'",
    "router.get('/evidence-pack'", "router.get('/audit-timeline'"),
    'ACC11: All 6 endpoints');

  // ── 5. Admin.js mount ──────────────────────────────────────────────────────
  console.log('\n[5] admin.js mount');
  assert(has('src/api/routes/admin.js', "'/deployment/readiness'"), 'ACC12: Mount path registered');
  assert(has('src/api/routes/admin.js', 'productionDeploymentReadinessChecklistAdmin'), 'ACC13: Require present');

  // ── 6. UI files ────────────────────────────────────────────────────────────
  console.log('\n[6] UI files');
  assert(exists('src/ui/types/productionDeploymentReadinessChecklist.ts'), 'ACC14: UI types exist');
  assert(exists('src/ui/api/productionDeploymentReadinessChecklistClient.ts'), 'ACC15: UI client exists');
  assert(exists('src/ui/pages/deployment/ProductionDeploymentReadiness.tsx'), 'ACC16: UI page exists');
  assert(has('src/ui/App.tsx', '/admin/deployment/readiness'), 'ACC17: App.tsx route registered');
  assert(has('src/ui/App.tsx', 'ProductionDeploymentReadiness'), 'ACC18: Component imported in App.tsx');

  // ── 7. Safety markers present across all files ─────────────────────────────
  console.log('\n[7] Safety markers');
  assert(has(SVC, 'checklist_only: true', 'deployment_executed: false',
    'production_activation_enabled: false'), 'ACC19: Service safety flags');
  assert(has(ROUTE, 'checklistOnly: true', 'deploymentExecuted: false',
    'productionActivationEnabled: false'), 'ACC20: Route safety markers');
  assert(has('src/ui/pages/deployment/ProductionDeploymentReadiness.tsx',
    'CHECKLIST-ONLY MODE', 'No deployment, production activation'),
    'ACC21: UI safety notice');

  // ── 8. No forbidden execution patterns ────────────────────────────────────
  console.log('\n[8] Static safety scan');
  const filesToScan = [SVC, ROUTE];
  const forbidden = ['charge(', 'capture(', 'refund(', 'payout(', 'submitTax', 'submitVat', 'sendToProvider',
    'externalSubmission: true', 'sourceMutation: true', 'fullPublicEnabled: true',
    'liveProviderConnectivityEnabled: true', 'paymentExecutionEnabled: true',
    'deploymentExecuted: true', 'productionActivationEnabled: true'];

  for (const file of filesToScan) {
    const content = src(file);
    for (const pattern of forbidden) {
      if (content.includes(pattern)) {
        assert(false, `ACC22: FORBIDDEN PATTERN "${pattern}" found in ${file}`);
      }
    }
  }
  assert(true, 'ACC22: No forbidden execution patterns in service or route');

  // ── 9. Runtime evidence pack ───────────────────────────────────────────────
  console.log('\n[9] Runtime evidence pack');
  let pack;
  try {
    const Svc = require(path.join(ROOT, SVC));
    const svc = new Svc();
    pack = await svc.buildDeploymentReadinessEvidencePack({
      actor: 'acceptance-smoke',
      backup_timestamp: '2026-06-17T00:00:00Z',
      rollback_script_documented: true,
      escalation_contacts_documented: true,
    });

    assert(pack.checklist_only === true, 'ACC23: evidence pack checklist_only: true');
    assert(pack.deployment_executed === false, 'ACC24: evidence pack deployment_executed: false');
    assert(pack.production_activation_enabled === false, 'ACC25: production_activation_enabled: false');
    assert(pack.full_public_enabled === false, 'ACC26: full_public_enabled: false');
    assert(pack.live_provider_connectivity_enabled === false, 'ACC27: live_provider_connectivity_enabled: false');
    assert(pack.payment_execution_enabled === false, 'ACC28: payment_execution_enabled: false');
    assert(pack.refund_execution_enabled === false, 'ACC29: refund_execution_enabled: false');
    assert(pack.payout_execution_enabled === false, 'ACC30: payout_execution_enabled: false');
    assert(pack.external_submission_enabled === false, 'ACC31: external_submission_enabled: false');
    assert(pack.source_mutation_enabled === false, 'ACC32: source_mutation_enabled: false');
    assert(pack.categories && Object.keys(pack.categories).length >= 7, 'ACC33: All 7 categories in evidence pack');
    assert(pack.summary && typeof pack.summary.total === 'number', 'ACC34: Evidence pack has summary');
    assert(pack.safety && pack.safety.checklistOnly === true, 'ACC35: safety.checklistOnly: true');
    assert(typeof pack.phase_safety_string === 'string' &&
      pack.phase_safety_string.includes('PHASE_116_CHECKLIST_ONLY'), 'ACC36: PHASE_116_CHECKLIST_ONLY in safety string');
    assert(pack.generated_at, 'ACC37: Evidence pack has generated_at timestamp');
  } catch (err) {
    assert(false, `ACC23-ACC37: Evidence pack generation failed: ${err.message}`);
  }

  // ── 10. Docs ───────────────────────────────────────────────────────────────
  console.log('\n[10] Documentation');
  assert(exists('docs/phase116_production_deployment_readiness_checklist.md'), 'ACC38: Phase 116 docs exist');
  assert(has('docs/phase116_production_deployment_readiness_checklist.md',
    'Phase 116', 'checklist-only', 'CHECKLIST_ONLY'), 'ACC39: Docs contain safety content');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('PRINTPRICE OS — PHASE 116 PRODUCTION DEPLOYMENT READINESS CHECKLIST');
  console.log('STATUS: ' + (FAIL === 0 ? 'VALIDATED' : 'FAILED'));
  console.log('CHECKLIST_ONLY_MODE: ACTIVE');
  console.log('DEPLOYMENT_EXECUTED: NOT_EXECUTED');
  console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
  console.log('FULL_PUBLIC: NOT_ENABLED');
  console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
  console.log('PAYMENT_EXECUTION: NOT_ENABLED');
  console.log('REFUND_EXECUTION: NOT_ENABLED');
  console.log('PAYOUT_EXECUTION: NOT_ENABLED');
  console.log('EXTERNAL_SUBMISSION: NOT_ENABLED');
  console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Phase 116D RESULT: ${PASS} PASS / ${FAIL} FAIL\n`);
  if (FAIL > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
