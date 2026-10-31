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

console.log('\nPhase 117D — Production Deployment Dry Run Acceptance Pack\n');

const root = path.resolve(__dirname, '..');

// --- Schema ---
const migrationFile = path.join(root, 'migrations/059_phase117_production_deployment_dry_run_rollback_drill.sql');
check('Phase 117A: migration file 059 exists', fs.existsSync(migrationFile));

// --- Service ---
const servicePath = path.join(root, 'src/api/services/productionDeploymentDryRunRollbackDrillService.js');
check('Phase 117B: service file exists', fs.existsSync(servicePath));

// --- Route ---
const routePath = path.join(root, 'src/api/routes/productionDeploymentDryRunAdmin.js');
check('Phase 117C: route file exists', fs.existsSync(routePath));

// --- UI ---
const uiClientPath = path.join(root, 'src/ui/api/productionDeploymentDryRunClient.ts');
const uiTypesPath = path.join(root, 'src/ui/types/productionDeploymentDryRun.ts');
const uiPagePath = path.join(root, 'src/ui/pages/deployment/ProductionDeploymentDryRun.tsx');
check('Phase 117C: UI client exists', fs.existsSync(uiClientPath));
check('Phase 117C: UI types exists', fs.existsSync(uiTypesPath));
check('Phase 117C: UI page exists', fs.existsSync(uiPagePath));

// --- Admin mount ---
const adminJs = path.join(root, 'src/api/routes/admin.js');
const adminCode = fs.existsSync(adminJs) ? fs.readFileSync(adminJs, 'utf8') : '';
check('admin.js registers /deployment/dry-run', adminCode.includes("'/deployment/dry-run'"));

// --- App.tsx route ---
const appTsx = path.join(root, 'src/ui/App.tsx');
const appCode = fs.existsSync(appTsx) ? fs.readFileSync(appTsx, 'utf8') : '';
check('App.tsx registers /admin/deployment/dry-run', appCode.includes('/admin/deployment/dry-run'));

// --- Safety scan: service ---
const serviceCode = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';
check('Service: no charge( call', !serviceCode.includes('charge('));
check('Service: no .refund( call', !serviceCode.includes('.refund('));
check('Service: no .payout( call', !serviceCode.includes('.payout('));
check('Service: no .capture( call', !serviceCode.includes('.capture('));
check('Service: no submitTax call', !serviceCode.includes('submitTax'));
check('Service: no submitVat call', !serviceCode.includes('submitVat'));
check('Service: no sendToProvider call', !serviceCode.includes('sendToProvider'));
check('Service: no externalSubmission: true', !serviceCode.includes('externalSubmission: true'));
check('Service: no sourceMutation: true', !serviceCode.includes('sourceMutation: true'));
check('Service: no realDeploymentExecuted: true', !serviceCode.includes('realDeploymentExecuted: true'));
check('Service: no paymentExecutionEnabled: true', !serviceCode.includes('paymentExecutionEnabled: true'));
check('Service: no liveProviderConnectivityEnabled: true', !serviceCode.includes('liveProviderConnectivityEnabled: true'));

// --- Safety scan: route ---
const routeCode = fs.existsSync(routePath) ? fs.readFileSync(routePath, 'utf8') : '';
check('Route: no realDeploymentExecuted: true', !routeCode.includes('realDeploymentExecuted: true'));
check('Route: no productionActivationEnabled: true', !routeCode.includes('productionActivationEnabled: true'));
check('Route: no paymentExecutionEnabled: true', !routeCode.includes('paymentExecutionEnabled: true'));

// --- Runtime validation ---
let DryRunService;
try {
  DryRunService = require('../src/api/services/productionDeploymentDryRunRollbackDrillService');
  check('Service module loads', true);
} catch (err) {
  check('Service module loads', false);
}

if (DryRunService) {
  (async () => {
    const svc = new DryRunService();

    const created = await svc.createDeploymentDryRun({ requested_by: 'acceptance-117' });
    check('createDeploymentDryRun: ok', !!created.dry_run_id);
    check('createDeploymentDryRun: deploymentDryRunOnly true', created.safety && created.safety.deploymentDryRunOnly === true);
    check('createDeploymentDryRun: realDeploymentExecuted false', created.safety && created.safety.realDeploymentExecuted === false);

    const dryRunId = created.dry_run_id;

    const readiness = await svc.evaluateDeploymentDryRunReadiness({ dry_run_id: dryRunId });
    check('evaluateDeploymentDryRunReadiness: READY_FOR_DRY_RUN', readiness.readiness_status === 'READY_FOR_DRY_RUN');
    check('evaluateDeploymentDryRunReadiness: safety_invariants present', !!readiness.safety_invariants);

    const executed = await svc.executeDeploymentDryRun({ dry_run_id: dryRunId, actor: 'acceptance' });
    check('executeDeploymentDryRun: DRY_RUN_PASSED', executed.status === 'DRY_RUN_PASSED');
    check('executeDeploymentDryRun: simulated_deployment_steps present', Array.isArray(executed.simulated_deployment_steps));

    const restart = await svc.simulateServiceRestart({ dry_run_id: dryRunId });
    check('simulateServiceRestart: simulated=true, real_restart_executed=false', restart.simulated === true && restart.real_restart_executed === false);

    const health = await svc.simulateHealthCheck({ dry_run_id: dryRunId });
    check('simulateHealthCheck: simulated_only=true', health.health_check_results && health.health_check_results.simulated_only === true);

    const rollback = await svc.simulateRollback({ dry_run_id: dryRunId });
    check('simulateRollback: rollback_simulated_only=true', rollback.rollback_simulated_only === true);
    check('simulateRollback: real_rollback_executed=false', rollback.real_rollback_executed === false);
    check('simulateRollback: rollbackExecuted=false', rollback.rollbackExecuted === false);

    const pack = await svc.buildDeploymentDryRunEvidencePack({ dry_run_id: dryRunId });
    check('evidencePack: dryRunOnly=true', pack.dryRunOnly === true);
    check('evidencePack: externalSubmission=false', pack.externalSubmission === false);
    check('evidencePack: sourceMutation=false', pack.sourceMutation === false);
    check('evidencePack: paymentExecutionEnabled=false', pack.paymentExecutionEnabled === false);
    check('evidencePack: liveProviderConnectivityEnabled=false', pack.liveProviderConnectivityEnabled === false);

    const stepsResult = await svc.getDryRunSteps({ dry_run_id: dryRunId });
    check('getDryRunSteps: steps array present', Array.isArray(stepsResult.steps));

    const auditResult = await svc.getDryRunAuditTimeline({ dry_run_id: dryRunId });
    check('getDryRunAuditTimeline: audit_timeline present', Array.isArray(auditResult.audit_timeline));

    const expectedEvents = ['DRY_RUN_CREATED', 'DRY_RUN_READINESS_EVALUATED', 'DRY_RUN_STARTED', 'DRY_RUN_EXECUTED', 'SERVICE_RESTART_SIMULATED', 'HEALTH_CHECK_SIMULATED', 'ROLLBACK_SIMULATED', 'DRY_RUN_EVIDENCE_PACK_BUILT'];
    const eventTypes = auditResult.audit_timeline.map(a => a.event_type);
    for (const evt of expectedEvents) {
      check(`Audit event: ${evt}`, eventTypes.includes(evt));
    }

    console.log('\n--------------------------------------------------');
    console.log('PRINTPRICE OS — PHASE 117 PRODUCTION DEPLOYMENT DRY RUN / ROLLBACK DRILL');
    console.log(`STATUS: ${failed === 0 ? 'VALIDATED' : 'FAILED'}`);
    console.log('DEPLOYMENT_DRY_RUN_MODE: ACTIVE');
    console.log('ROLLBACK_DRILL: ACTIVE');
    console.log('REAL_DEPLOYMENT_EXECUTED: NOT_ENABLED');
    console.log('SERVICE_RESTART_EXECUTED: NOT_ENABLED');
    console.log('PRODUCTION_ACTIVATION: NOT_ENABLED');
    console.log('FULL_PUBLIC: NOT_ENABLED');
    console.log('LIVE_PROVIDER_CONNECTIVITY: NOT_ENABLED');
    console.log('PAYMENT_EXECUTION: NOT_ENABLED');
    console.log('REFUND_EXECUTION: NOT_ENABLED');
    console.log('PAYOUT_EXECUTION: NOT_ENABLED');
    console.log('EXTERNAL_SUBMISSION: NOT_ENABLED');
    console.log('SOURCE_RECORD_MUTATION: NOT_ENABLED');
    console.log('--------------------------------------------------\n');

    console.log(`Phase 117D: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    console.log('STATUS: PASS');
  })().catch(err => {
    console.error('Runtime error:', err.message);
    process.exit(1);
  });
}
