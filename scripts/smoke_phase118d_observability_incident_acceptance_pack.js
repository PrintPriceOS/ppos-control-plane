'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

console.log('\nPhase 118D — Production Observability & Incident Readiness Acceptance Pack\n');

const root = path.resolve(__dirname, '..');

// --- Phase 118A: Schema ---
const migrationFile = path.join(root, 'migrations/060_phase118_production_observability_incident_readiness.sql');
const sql = fs.existsSync(migrationFile) ? fs.readFileSync(migrationFile, 'utf8') : '';
check('Phase 118A: migration file 060 exists', fs.existsSync(migrationFile));
check('Phase 118A: production_observability_checks table', sql.includes('production_observability_checks'));
check('Phase 118A: production_incident_readiness_runs table', sql.includes('production_incident_readiness_runs'));
check('Phase 118A: production_incident_simulations table', sql.includes('production_incident_simulations'));
check('Phase 118A: production_incident_audits table', sql.includes('production_incident_audits'));
check('Phase 118A: safety columns present', sql.includes('simulation_only') && sql.includes('real_alert_dispatched'));

// --- Phase 118B: Service ---
const servicePath = path.join(root, 'src/api/services/productionObservabilityIncidentReadinessService.js');
const serviceCode = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
check('Phase 118B: service file exists', fs.existsSync(servicePath));
check('Phase 118B: evaluateObservabilityReadiness', serviceCode.includes('evaluateObservabilityReadiness'));
check('Phase 118B: simulateIncident', serviceCode.includes('simulateIncident'));
check('Phase 118B: simulateAlertDispatch', serviceCode.includes('simulateAlertDispatch'));
check('Phase 118B: recordIncidentFinding', serviceCode.includes('recordIncidentFinding'));
check('Phase 118B: resolveIncidentFinding', serviceCode.includes('resolveIncidentFinding'));
check('Phase 118B: buildIncidentReadinessEvidencePack', serviceCode.includes('buildIncidentReadinessEvidencePack'));
check('Phase 118B: PHASE_118 safety string', serviceCode.includes('PHASE_118_SIMULATION_ONLY'));

// --- Phase 118C: Route, UI ---
const routePath = path.join(root, 'src/api/routes/productionObservabilityIncidentReadinessAdmin.js');
const routeCode = fs.existsSync(routePath) ? fs.readFileSync(routePath, 'utf8') : '';
check('Phase 118C: route file exists', fs.existsSync(routePath));

const uiClientPath = path.join(root, 'src/ui/api/productionObservabilityIncidentReadinessClient.ts');
const uiTypesPath = path.join(root, 'src/ui/types/productionObservabilityIncidentReadiness.ts');
const uiPagePath = path.join(root, 'src/ui/pages/operations/ProductionIncidentReadiness.tsx');
check('Phase 118C: UI client exists', fs.existsSync(uiClientPath));
check('Phase 118C: UI types exists', fs.existsSync(uiTypesPath));
check('Phase 118C: UI page exists', fs.existsSync(uiPagePath));

const adminJs = path.join(root, 'src/api/routes/admin.js');
const adminCode = fs.existsSync(adminJs) ? fs.readFileSync(adminJs, 'utf8') : '';
check("Phase 118C: admin.js mounts '/operations/incident-readiness'", adminCode.includes("'/operations/incident-readiness'"));

const appTsx = path.join(root, 'src/ui/App.tsx');
const appCode = fs.existsSync(appTsx) ? fs.readFileSync(appTsx, 'utf8') : '';
check('Phase 118C: App.tsx registers /admin/operations/incident-readiness', appCode.includes('/admin/operations/incident-readiness'));

// --- Safety static scan: service ---
check('Service: no charge( call', !serviceCode.includes('charge('));
check('Service: no .refund( call', !serviceCode.includes('.refund('));
check('Service: no .payout( call', !serviceCode.includes('.payout('));
check('Service: no .capture( call', !serviceCode.includes('.capture('));
check('Service: no submitTax', !serviceCode.includes('submitTax'));
check('Service: no submitVat', !serviceCode.includes('submitVat'));
check('Service: no sendToProvider', !serviceCode.includes('sendToProvider'));
check('Service: no externalSubmission: true', !serviceCode.includes('externalSubmission: true'));
check('Service: no sourceMutation: true', !serviceCode.includes('sourceMutation: true'));
check('Service: no paymentExecutionEnabled: true', !serviceCode.includes('paymentExecutionEnabled: true'));
check('Service: no liveProviderConnectivityEnabled: true', !serviceCode.includes('liveProviderConnectivityEnabled: true'));
check('Service: no realAlertDispatched: true', !serviceCode.includes('realAlertDispatched: true'));
check('Service: no productionMutationEnabled: true', !serviceCode.includes('productionMutationEnabled: true'));
check('Service: no fullPublicEnabled: true', !serviceCode.includes('fullPublicEnabled: true'));

// --- Safety static scan: route ---
check('Route: no realAlertDispatched: true', !routeCode.includes('realAlertDispatched: true'));
check('Route: no paymentExecutionEnabled: true', !routeCode.includes('paymentExecutionEnabled: true'));
check('Route: no externalSubmission: true', !routeCode.includes('externalSubmission: true'));
check('Route: no productionMutationEnabled: true', !routeCode.includes('productionMutationEnabled: true'));

// --- Syntax checks ---
try {
  execSync(`node --check "${servicePath}"`, { stdio: 'pipe' });
  check('Syntax: service passes node --check', true);
} catch (e) {
  check('Syntax: service passes node --check', false);
}
try {
  execSync(`node --check "${routePath}"`, { stdio: 'pipe' });
  check('Syntax: route passes node --check', true);
} catch (e) {
  check('Syntax: route passes node --check', false);
}

// --- Runtime validation ---
let SvcClass;
try {
  SvcClass = require('../src/api/services/productionObservabilityIncidentReadinessService');
  check('Service module loads', true);
} catch (err) {
  check('Service module loads', false);
  console.error('  Load error:', err.message);
}

if (SvcClass) {
  const svc = new SvcClass();

  (async () => {
    try {
      const readiness = await svc.evaluateObservabilityReadiness({ actor: 'acceptance-smoke' });
      check('Runtime: observability readiness returns result', !!readiness);
      check('Runtime: simulationOnly true', readiness.simulationOnly === true);
      check('Runtime: reviewOnly true', readiness.reviewOnly === true);
      check('Runtime: safety.realAlertDispatched false', readiness.safety && readiness.safety.realAlertDispatched === false);
      check('Runtime: safety.paymentExecutionEnabled false', readiness.safety && readiness.safety.paymentExecutionEnabled === false);
      check('Runtime: safety.externalSubmission false', readiness.safety && readiness.safety.externalSubmission === false);
      check('Runtime: safety.productionMutationEnabled false', readiness.safety && readiness.safety.productionMutationEnabled === false);
      check('Runtime: incident_categories present', Array.isArray(readiness.incident_categories) && readiness.incident_categories.length > 0);
      check('Runtime: API_DOWN in categories', readiness.incident_categories && readiness.incident_categories.includes('API_DOWN'));
      check('Runtime: ROLLBACK_REQUIRED in categories', readiness.incident_categories && readiness.incident_categories.includes('ROLLBACK_REQUIRED'));

      const incident = await svc.simulateIncident({ incident_category: 'DB_CONNECTION_FAILURE', severity: 'HIGH', actor: 'acceptance-smoke' });
      check('Runtime: simulateIncident status SIMULATED', incident.status === 'SIMULATED');
      check('Runtime: simulateIncident real_alert_dispatched false', incident.real_alert_dispatched === false);
      check('Runtime: simulateIncident simulationOnly true', incident.simulationOnly === true);

      const alertDispatch = await svc.simulateAlertDispatch({ alert_type: 'SECURITY_ALERT_TEST', sink: 'INTERNAL_TEST_SINK_ONLY', actor: 'acceptance-smoke' });
      check('Runtime: simulateAlertDispatch dispatched false', alertDispatch.dispatched === false);
      check('Runtime: simulateAlertDispatch real_alert_dispatched false', alertDispatch.real_alert_dispatched === false);

      const finding = await svc.recordIncidentFinding({ description: 'Acceptance pack finding', severity: 'LOW', actor: 'acceptance-smoke' });
      check('Runtime: recordIncidentFinding returns finding_id', !!finding.finding_id);

      const evidencePack = await svc.buildIncidentReadinessEvidencePack({ actor: 'acceptance-smoke' });
      check('Runtime: evidence pack built', !!evidencePack);
      check('Runtime: evidence pack phase is 118', evidencePack.phase === 118);
      check('Runtime: evidence pack simulationOnly true', evidencePack.simulationOnly === true);
      check('Runtime: evidence pack safety_invariants present', !!evidencePack.safety_invariants);
      check('Runtime: evidence pack simulation_only invariant true', evidencePack.safety_invariants && evidencePack.safety_invariants.simulation_only === true);
      check('Runtime: evidence pack real_alert_dispatched false', evidencePack.safety_invariants && evidencePack.safety_invariants.real_alert_dispatched === false);
      check('Runtime: evidence pack payment_execution_enabled false', evidencePack.safety_invariants && evidencePack.safety_invariants.payment_execution_enabled === false);
      check('Runtime: evidence pack payout_execution_enabled false', evidencePack.safety_invariants && evidencePack.safety_invariants.payout_execution_enabled === false);

      printFinalStatus();
    } catch (err) {
      console.error('Runtime error:', err.message);
      process.exit(1);
    }
  })();
} else {
  printFinalStatus();
}

function printFinalStatus() {
  console.log('\n' + '='.repeat(60));
  console.log('PRINTPRICE OS — PHASE 118 PRODUCTION OBSERVABILITY & INCIDENT READINESS');
  console.log(`STATUS: ${failed === 0 ? 'VALIDATED' : 'FAILED'}`);
  console.log('SIMULATION_MODE: ACTIVE');
  console.log('REAL_ALERT_DISPATCH: NOT_ENABLED');
  console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
  console.log('FULL_PUBLIC: NOT_ENABLED');
  console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
  console.log('PAYMENT_EXECUTION: NOT_ENABLED');
  console.log('REFUND_EXECUTION: NOT_ENABLED');
  console.log('PAYOUT_EXECUTION: NOT_ENABLED');
  console.log('EXTERNAL_SUBMISSION: NOT_ENABLED');
  console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
  console.log('='.repeat(60));
  console.log(`\nPhase 118D: PASS ${passed} | FAIL ${failed}`);
  if (failed > 0) process.exit(1);
}
