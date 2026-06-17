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

console.log('\nPhase 117C — Production Deployment Dry Run Admin API / UI Smoke Test\n');

const routePath = path.resolve(__dirname, '../src/api/routes/productionDeploymentDryRunAdmin.js');
const routeCode = fs.existsSync(routePath) ? fs.readFileSync(routePath, 'utf8') : '';

check('Route file exists', fs.existsSync(routePath));
check('Route: GET /readiness exists', routeCode.includes("router.get('/readiness'"));
check('Route: POST /create exists', routeCode.includes("router.post('/create'"));
check('Route: POST /execute exists', routeCode.includes("router.post('/execute'"));
check('Route: POST /simulate-rollback exists', routeCode.includes("router.post('/simulate-rollback'"));
check('Route: GET /steps exists', routeCode.includes("router.get('/steps'"));
check('Route: GET /audit-timeline exists', routeCode.includes("router.get('/audit-timeline'"));
check('Route: GET /evidence-pack exists', routeCode.includes("router.get('/evidence-pack'"));
check('Route returns safety markers', routeCode.includes('SAFETY_MARKERS'));
check('Route returns safety_message', routeCode.includes('safety_message'));
check('Route uses requireAdmin middleware', routeCode.includes('requireAdmin'));

const adminJs = path.resolve(__dirname, '../src/api/routes/admin.js');
const adminCode = fs.existsSync(adminJs) ? fs.readFileSync(adminJs, 'utf8') : '';
check('admin.js imports productionDeploymentDryRunAdmin', adminCode.includes("require('./productionDeploymentDryRunAdmin')"));
check("admin.js mounts /deployment/dry-run", adminCode.includes("'/deployment/dry-run'"));

const uiClientPath = path.resolve(__dirname, '../src/ui/api/productionDeploymentDryRunClient.ts');
const uiClientCode = fs.existsSync(uiClientPath) ? fs.readFileSync(uiClientPath, 'utf8') : '';
check('UI client file exists', fs.existsSync(uiClientPath));
check('UI client: getDeploymentDryRunReadiness', uiClientCode.includes('getDeploymentDryRunReadiness'));
check('UI client: createDeploymentDryRun', uiClientCode.includes('createDeploymentDryRun'));
check('UI client: executeDeploymentDryRun', uiClientCode.includes('executeDeploymentDryRun'));
check('UI client: simulateDeploymentRollback', uiClientCode.includes('simulateDeploymentRollback'));
check('UI client: getDeploymentDryRunSteps', uiClientCode.includes('getDeploymentDryRunSteps'));
check('UI client: getDeploymentDryRunAuditTimeline', uiClientCode.includes('getDeploymentDryRunAuditTimeline'));
check('UI client: getDeploymentDryRunEvidencePack', uiClientCode.includes('getDeploymentDryRunEvidencePack'));
check('UI client BASE = /api/admin/deployment/dry-run', uiClientCode.includes('/api/admin/deployment/dry-run'));

const uiTypesPath = path.resolve(__dirname, '../src/ui/types/productionDeploymentDryRun.ts');
const uiTypesCode = fs.existsSync(uiTypesPath) ? fs.readFileSync(uiTypesPath, 'utf8') : '';
check('UI types file exists', fs.existsSync(uiTypesPath));
check('UI types: DryRunSafetyMarkers', uiTypesCode.includes('DryRunSafetyMarkers'));
check('UI types: deploymentDryRunOnly: true', uiTypesCode.includes('deploymentDryRunOnly: true'));
check('UI types: realDeploymentExecuted: false', uiTypesCode.includes('realDeploymentExecuted: false'));

const uiPagePath = path.resolve(__dirname, '../src/ui/pages/deployment/ProductionDeploymentDryRun.tsx');
const uiPageCode = fs.existsSync(uiPagePath) ? fs.readFileSync(uiPagePath, 'utf8') : '';
check('UI page file exists', fs.existsSync(uiPagePath));
check('UI page exports ProductionDeploymentDryRun', uiPageCode.includes('export function ProductionDeploymentDryRun'));
check('UI page contains dry-run safety notice', uiPageCode.includes('dry-run only'));
check('UI page contains no production activation messaging', uiPageCode.includes('No production activation'));
check('UI page shows readiness section', uiPageCode.includes('Readiness Check'));
check('UI page shows execute dry run action', uiPageCode.includes('Execute Dry Run'));
check('UI page shows rollback action', uiPageCode.includes('Simulate Rollback'));
check('UI page shows audit timeline', uiPageCode.includes('Audit Timeline'));
check('UI page shows evidence pack', uiPageCode.includes('Evidence Pack'));

const appTsx = path.resolve(__dirname, '../src/ui/App.tsx');
const appCode = fs.existsSync(appTsx) ? fs.readFileSync(appTsx, 'utf8') : '';
check('App.tsx imports ProductionDeploymentDryRun', appCode.includes('ProductionDeploymentDryRun'));
check('App.tsx registers /admin/deployment/dry-run route', appCode.includes('/admin/deployment/dry-run'));

check('No endpoint enables real deployment', !routeCode.includes('realDeploymentExecuted: true'));
check('No endpoint enables production activation', !routeCode.includes('productionActivationEnabled: true'));
check('No endpoint enables source mutation', !routeCode.includes('sourceMutation: true'));
check('No endpoint enables payment execution', !routeCode.includes('paymentExecutionEnabled: true'));

console.log(`\nPhase 117C: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('STATUS: PASS');
