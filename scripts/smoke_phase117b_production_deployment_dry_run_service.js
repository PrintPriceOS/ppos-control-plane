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

console.log('\nPhase 117B — Production Deployment Dry Run Service Smoke Test\n');

const servicePath = path.resolve(__dirname, '../src/api/services/productionDeploymentDryRunRollbackDrillService.js');
const serviceCode = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';

check('Service file exists', fs.existsSync(servicePath));
check('createDeploymentDryRun method exists', serviceCode.includes('async createDeploymentDryRun'));
check('evaluateDeploymentDryRunReadiness method exists', serviceCode.includes('async evaluateDeploymentDryRunReadiness'));
check('executeDeploymentDryRun method exists', serviceCode.includes('async executeDeploymentDryRun'));
check('simulateServiceRestart method exists', serviceCode.includes('async simulateServiceRestart'));
check('simulateHealthCheck method exists', serviceCode.includes('async simulateHealthCheck'));
check('simulateRollback method exists', serviceCode.includes('async simulateRollback'));
check('buildDeploymentDryRunEvidencePack method exists', serviceCode.includes('async buildDeploymentDryRunEvidencePack'));
check('getDryRunSteps method exists', serviceCode.includes('async getDryRunSteps'));
check('getDryRunAuditTimeline method exists', serviceCode.includes('async getDryRunAuditTimeline'));

check('SAFETY_FLAGS: deployment_dry_run_only: true', serviceCode.includes('deployment_dry_run_only: true'));
check('SAFETY_FLAGS: real_deployment_executed: false', serviceCode.includes('real_deployment_executed: false'));
check('SAFETY_FLAGS: service_restart_executed: false', serviceCode.includes('service_restart_executed: false'));
check('SAFETY_FLAGS: rollback_executed: false', serviceCode.includes('rollback_executed: false'));
check('SAFETY_FLAGS: production_activation_enabled: false', serviceCode.includes('production_activation_enabled: false'));
check('SAFETY_FLAGS: payment_execution_enabled: false', serviceCode.includes('payment_execution_enabled: false'));
check('SAFETY_FLAGS: source_mutation_enabled: false', serviceCode.includes('source_mutation_enabled: false'));

check('SAFETY_MARKERS: deploymentDryRunOnly: true', serviceCode.includes('deploymentDryRunOnly: true'));
check('SAFETY_MARKERS: realDeploymentExecuted: false', serviceCode.includes('realDeploymentExecuted: false'));
check('SAFETY_MARKERS: serviceRestartExecuted: false', serviceCode.includes('serviceRestartExecuted: false'));
check('SAFETY_MARKERS: rollbackExecuted: false', serviceCode.includes('rollbackExecuted: false'));

check('No forbidden: charge(', !serviceCode.includes('charge('));
check('No forbidden: refund(', !serviceCode.includes('.refund('));
check('No forbidden: payout(', !serviceCode.includes('.payout('));
check('No forbidden: capture(', !serviceCode.includes('.capture('));
check('No forbidden: submitTax', !serviceCode.includes('submitTax'));
check('No forbidden: sendToProvider', !serviceCode.includes('sendToProvider'));
check('No forbidden: externalSubmission: true', !serviceCode.includes('externalSubmission: true'));
check('No forbidden: sourceMutation: true', !serviceCode.includes('sourceMutation: true'));
check('No forbidden: realDeploymentExecuted: true', !serviceCode.includes('realDeploymentExecuted: true'));

// Runtime test
let DryRunService;
try {
  DryRunService = require('../src/api/services/productionDeploymentDryRunRollbackDrillService');
  check('Service module loads without error', true);
} catch (err) {
  check('Service module loads without error', false);
  console.error('  Load error:', err.message);
}

if (DryRunService) {
  let svc;
  try {
    svc = new DryRunService();
    check('Service instantiates', true);
  } catch (err) {
    check('Service instantiates', false);
  }

  if (svc) {
    (async () => {
      try {
        const readiness = await svc.evaluateDeploymentDryRunReadiness({ dry_run_id: 'test-117' });
        check('evaluateDeploymentDryRunReadiness returns dryRunOnly: true', readiness.dryRunOnly === true);
        check('evaluateDeploymentDryRunReadiness returns safety markers', !!readiness.safety);
        check('evaluateDeploymentDryRunReadiness safety.realDeploymentExecuted is false', readiness.safety && readiness.safety.realDeploymentExecuted === false);

        const created = await svc.createDeploymentDryRun({ requested_by: 'smoke-test' });
        check('createDeploymentDryRun returns dry_run_id', !!created.dry_run_id);
        check('createDeploymentDryRun returns dryRunOnly: true', created.dryRunOnly === true);
        check('createDeploymentDryRun safety.realDeploymentExecuted is false', created.safety && created.safety.realDeploymentExecuted === false);
        check('createDeploymentDryRun safety.serviceRestartExecuted is false', created.safety && created.safety.serviceRestartExecuted === false);

        const dryRunId = created.dry_run_id;
        const executed = await svc.executeDeploymentDryRun({ dry_run_id: dryRunId, actor: 'smoke' });
        check('executeDeploymentDryRun returns status DRY_RUN_PASSED', executed.status === 'DRY_RUN_PASSED');
        check('executeDeploymentDryRun safety.realDeploymentExecuted is false', executed.safety && executed.safety.realDeploymentExecuted === false);

        const restart = await svc.simulateServiceRestart({ dry_run_id: dryRunId });
        check('simulateServiceRestart: simulated is true', restart.simulated === true);
        check('simulateServiceRestart: real_restart_executed is false', restart.real_restart_executed === false);
        check('simulateServiceRestart: serviceRestartExecuted is false', restart.serviceRestartExecuted === false);

        const health = await svc.simulateHealthCheck({ dry_run_id: dryRunId });
        check('simulateHealthCheck: simulated result present', !!health.health_check_results);
        check('simulateHealthCheck: simulated_only is true', health.health_check_results && health.health_check_results.simulated_only === true);

        const rollback = await svc.simulateRollback({ dry_run_id: dryRunId, actor: 'smoke' });
        check('simulateRollback returns rollback_drill_id', !!rollback.rollback_drill_id);
        check('simulateRollback: rollback_simulated_only is true', rollback.rollback_simulated_only === true);
        check('simulateRollback: real_rollback_executed is false', rollback.real_rollback_executed === false);
        check('simulateRollback: rollbackExecuted is false', rollback.rollbackExecuted === false);

        const pack = await svc.buildDeploymentDryRunEvidencePack({ dry_run_id: dryRunId });
        check('buildDeploymentDryRunEvidencePack returns dry_run_id', !!pack.dry_run_id);
        check('buildDeploymentDryRunEvidencePack: dryRunOnly is true', pack.dryRunOnly === true);
        check('buildDeploymentDryRunEvidencePack: externalSubmission is false', pack.externalSubmission === false);
        check('buildDeploymentDryRunEvidencePack: sourceMutation is false', pack.sourceMutation === false);

        const stepsResult = await svc.getDryRunSteps({ dry_run_id: dryRunId });
        check('getDryRunSteps returns steps array', Array.isArray(stepsResult.steps));

        const auditResult = await svc.getDryRunAuditTimeline({ dry_run_id: dryRunId });
        check('getDryRunAuditTimeline returns audit_timeline array', Array.isArray(auditResult.audit_timeline));

        console.log(`\nPhase 117B: ${passed} passed, ${failed} failed`);
        if (failed > 0) process.exit(1);
        console.log('STATUS: PASS');
      } catch (err) {
        console.error('Runtime error:', err.message);
        process.exit(1);
      }
    })();
  }
}
