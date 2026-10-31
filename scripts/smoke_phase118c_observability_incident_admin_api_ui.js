'use strict';

const fs = require('fs');
const path = require('path');

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

console.log('\nPhase 118C — Production Observability & Incident Readiness Admin API & UI\n');

const root = path.resolve(__dirname, '..');

// --- Route file ---
const routePath = path.join(root, 'src/api/routes/productionObservabilityIncidentReadinessAdmin.js');
const routeCode = fs.existsSync(routePath) ? fs.readFileSync(routePath, 'utf8') : '';

check('Route file exists', fs.existsSync(routePath));
check('Route: GET /readiness endpoint', routeCode.includes("router.get('/readiness'"));
check('Route: POST /simulate-incident endpoint', routeCode.includes("router.post('/simulate-incident'"));
check('Route: POST /simulate-alert endpoint', routeCode.includes("router.post('/simulate-alert'"));
check('Route: POST /finding endpoint', routeCode.includes("router.post('/finding'"));
check('Route: POST /resolve-finding endpoint', routeCode.includes("router.post('/resolve-finding'"));
check('Route: GET /evidence-pack endpoint', routeCode.includes("router.get('/evidence-pack'"));
check('Route: uses requireAdmin middleware', routeCode.includes('requireAdmin'));
check('Route: calls IncidentReadinessService', routeCode.includes('IncidentReadinessService') || routeCode.includes('productionObservabilityIncidentReadinessService'));
check('Route: safeResponse returns safety markers', routeCode.includes('safeResponse'));
check('Route: simulationOnly: true', routeCode.includes('simulationOnly: true'));
check('Route: realAlertDispatched: false', routeCode.includes('realAlertDispatched: false'));
check('Route: paymentExecutionEnabled: false', routeCode.includes('paymentExecutionEnabled: false'));
check('Route: externalSubmission: false', routeCode.includes('externalSubmission: false'));
check('Route: safety_message present', routeCode.includes('safety_message'));

// Forbidden in route
check('Route: no realAlertDispatched: true', !routeCode.includes('realAlertDispatched: true'));
check('Route: no paymentExecutionEnabled: true', !routeCode.includes('paymentExecutionEnabled: true'));
check('Route: no productionMutationEnabled: true', !routeCode.includes('productionMutationEnabled: true'));
check('Route: no externalSubmission: true', !routeCode.includes('externalSubmission: true'));

// Syntax check
const { execSync } = require('child_process');
try {
  execSync(`node --check "${routePath}"`, { stdio: 'pipe' });
  check('Route: node --check passes', true);
} catch (e) {
  check('Route: node --check passes', false);
}

// --- admin.js mount ---
const adminJs = path.join(root, 'src/api/routes/admin.js');
const adminCode = fs.existsSync(adminJs) ? fs.readFileSync(adminJs, 'utf8') : '';
check('admin.js: requires productionObservabilityIncidentReadinessAdmin', adminCode.includes('productionObservabilityIncidentReadinessAdmin'));
check("admin.js: mounts '/operations/incident-readiness'", adminCode.includes("'/operations/incident-readiness'"));

// --- UI client ---
const uiClientPath = path.join(root, 'src/ui/api/productionObservabilityIncidentReadinessClient.ts');
const uiClientCode = fs.existsSync(uiClientPath) ? fs.readFileSync(uiClientPath, 'utf8') : '';
check('UI client exists', fs.existsSync(uiClientPath));
check('UI client: getObservabilityReadiness function', uiClientCode.includes('getObservabilityReadiness'));
check('UI client: simulateIncident function', uiClientCode.includes('simulateIncident'));
check('UI client: simulateAlertDispatch function', uiClientCode.includes('simulateAlertDispatch'));
check('UI client: recordIncidentFinding function', uiClientCode.includes('recordIncidentFinding'));
check('UI client: resolveIncidentFinding function', uiClientCode.includes('resolveIncidentFinding'));
check('UI client: getIncidentReadinessEvidencePack function', uiClientCode.includes('getIncidentReadinessEvidencePack'));
check('UI client: BASE path /api/admin/operations/incident-readiness', uiClientCode.includes('/api/admin/operations/incident-readiness'));

// --- UI types ---
const uiTypesPath = path.join(root, 'src/ui/types/productionObservabilityIncidentReadiness.ts');
const uiTypesCode = fs.existsSync(uiTypesPath) ? fs.readFileSync(uiTypesPath, 'utf8') : '';
check('UI types exists', fs.existsSync(uiTypesPath));
check('UI types: IncidentCategory type', uiTypesCode.includes('IncidentCategory'));
check('UI types: SafetyMarkers interface', uiTypesCode.includes('SafetyMarkers'));
check('UI types: ObservabilityReadinessResult interface', uiTypesCode.includes('ObservabilityReadinessResult'));
check('UI types: IncidentReadinessEvidencePack interface', uiTypesCode.includes('IncidentReadinessEvidencePack'));
check('UI types: simulationOnly: true', uiTypesCode.includes('simulationOnly: true'));
check('UI types: realAlertDispatched: false', uiTypesCode.includes('realAlertDispatched: false'));

// --- UI page ---
const uiPagePath = path.join(root, 'src/ui/pages/operations/ProductionIncidentReadiness.tsx');
const uiPageCode = fs.existsSync(uiPagePath) ? fs.readFileSync(uiPagePath, 'utf8') : '';
check('UI page exists', fs.existsSync(uiPagePath));
check('UI page: ProductionIncidentReadiness component', uiPageCode.includes('ProductionIncidentReadiness'));
check('UI page: simulation-only safety notice', uiPageCode.includes('SIMULATION ONLY') || uiPageCode.includes('simulation-only') || uiPageCode.includes('Simulation Only'));
check('UI page: INTERNAL_TEST_SINK_ONLY reference', uiPageCode.includes('INTERNAL_TEST_SINK_ONLY'));
check('UI page: simulateIncident call', uiPageCode.includes('simulateIncident'));
check('UI page: simulateAlertDispatch call', uiPageCode.includes('simulateAlertDispatch'));
check('UI page: getIncidentReadinessEvidencePack call', uiPageCode.includes('getIncidentReadinessEvidencePack'));
check('UI page: incident categories listed', uiPageCode.includes('API_DOWN'));

// --- App.tsx ---
const appTsx = path.join(root, 'src/ui/App.tsx');
const appCode = fs.existsSync(appTsx) ? fs.readFileSync(appTsx, 'utf8') : '';
check('App.tsx: imports ProductionIncidentReadiness', appCode.includes('ProductionIncidentReadiness'));
check('App.tsx: registers /admin/operations/incident-readiness', appCode.includes('/admin/operations/incident-readiness'));

console.log(`\nPhase 118C: PASS ${passed} | FAIL ${failed}`);
if (failed > 0) process.exit(1);
