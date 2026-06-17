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

console.log('\nPhase 118B — Production Observability & Incident Readiness Service\n');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/api/services/productionObservabilityIncidentReadinessService.js');
const serviceCode = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, 'utf8') : '';

check('Service file exists', fs.existsSync(servicePath));
check('Service: evaluateObservabilityReadiness method', serviceCode.includes('evaluateObservabilityReadiness'));
check('Service: simulateIncident method', serviceCode.includes('simulateIncident'));
check('Service: simulateAlertDispatch method', serviceCode.includes('simulateAlertDispatch'));
check('Service: recordIncidentFinding method', serviceCode.includes('recordIncidentFinding'));
check('Service: resolveIncidentFinding method', serviceCode.includes('resolveIncidentFinding'));
check('Service: buildIncidentReadinessEvidencePack method', serviceCode.includes('buildIncidentReadinessEvidencePack'));

// Safety flags
check('Service: simulation_only: true', serviceCode.includes('simulation_only: true'));
check('Service: real_alert_dispatched: false', serviceCode.includes('real_alert_dispatched: false'));
check('Service: production_mutation_enabled: false', serviceCode.includes('production_mutation_enabled: false'));
check('Service: external_submission_enabled: false', serviceCode.includes('external_submission_enabled: false'));
check('Service: payment_execution_enabled: false', serviceCode.includes('payment_execution_enabled: false'));
check('Service: refund_execution_enabled: false', serviceCode.includes('refund_execution_enabled: false'));
check('Service: payout_execution_enabled: false', serviceCode.includes('payout_execution_enabled: false'));
check('Service: full_public_enabled: false', serviceCode.includes('full_public_enabled: false'));
check('Service: live_provider_connectivity_enabled: false', serviceCode.includes('live_provider_connectivity_enabled: false'));
check('Service: simulationOnly: true', serviceCode.includes('simulationOnly: true'));
check('Service: reviewOnly: true', serviceCode.includes('reviewOnly: true'));

// Phase safety string
check('Service: PHASE_118 safety string', serviceCode.includes('PHASE_118_SIMULATION_ONLY'));

// Incident categories
check('Service: API_DOWN category', serviceCode.includes('API_DOWN'));
check('Service: DB_CONNECTION_FAILURE category', serviceCode.includes('DB_CONNECTION_FAILURE'));
check('Service: REDIS_CONNECTION_FAILURE category', serviceCode.includes('REDIS_CONNECTION_FAILURE'));
check('Service: PAYMENT_PROVIDER_FAILURE_SIMULATED category', serviceCode.includes('PAYMENT_PROVIDER_FAILURE_SIMULATED'));
check('Service: PREFLIGHT_SERVICE_DEGRADED category', serviceCode.includes('PREFLIGHT_SERVICE_DEGRADED'));
check('Service: QUEUE_BACKLOG category', serviceCode.includes('QUEUE_BACKLOG'));
check('Service: HIGH_ERROR_RATE category', serviceCode.includes('HIGH_ERROR_RATE'));
check('Service: SECURITY_ALERT category', serviceCode.includes('SECURITY_ALERT'));
check('Service: DATA_EXPORT_BLOCKED category', serviceCode.includes('DATA_EXPORT_BLOCKED'));
check('Service: ROLLBACK_REQUIRED category', serviceCode.includes('ROLLBACK_REQUIRED'));

// Forbidden patterns
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

// Service syntax check
const { execSync } = require('child_process');
try {
  execSync(`node --check "${servicePath}"`, { stdio: 'pipe' });
  check('Service: node --check passes', true);
} catch (e) {
  check('Service: node --check passes', false);
}

// Runtime check
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
  check('Service instance created', !!svc);
  check('evaluateObservabilityReadiness is a function', typeof svc.evaluateObservabilityReadiness === 'function');
  check('simulateIncident is a function', typeof svc.simulateIncident === 'function');
  check('simulateAlertDispatch is a function', typeof svc.simulateAlertDispatch === 'function');
  check('recordIncidentFinding is a function', typeof svc.recordIncidentFinding === 'function');
  check('resolveIncidentFinding is a function', typeof svc.resolveIncidentFinding === 'function');
  check('buildIncidentReadinessEvidencePack is a function', typeof svc.buildIncidentReadinessEvidencePack === 'function');

  (async () => {
    try {
      const readiness = await svc.evaluateObservabilityReadiness({ actor: 'smoke-test' });
      check('evaluateObservabilityReadiness returns result', !!readiness);
      check('evaluateObservabilityReadiness: simulationOnly true', readiness.simulationOnly === true);
      check('evaluateObservabilityReadiness: reviewOnly true', readiness.reviewOnly === true);
      check('evaluateObservabilityReadiness: safety present', !!readiness.safety);
      check('evaluateObservabilityReadiness: safety.realAlertDispatched false', readiness.safety && readiness.safety.realAlertDispatched === false);
      check('evaluateObservabilityReadiness: safety.paymentExecutionEnabled false', readiness.safety && readiness.safety.paymentExecutionEnabled === false);
      check('evaluateObservabilityReadiness: checks array present', Array.isArray(readiness.checks));

      const incident = await svc.simulateIncident({ incident_category: 'API_DOWN', actor: 'smoke-test' });
      check('simulateIncident returns result', !!incident);
      check('simulateIncident: simulationOnly true', incident.simulationOnly === true);
      check('simulateIncident: real_alert_dispatched false', incident.real_alert_dispatched === false);
      check('simulateIncident: status SIMULATED', incident.status === 'SIMULATED');

      const alert = await svc.simulateAlertDispatch({ alert_type: 'TEST', actor: 'smoke-test' });
      check('simulateAlertDispatch: dispatched false', alert.dispatched === false);
      check('simulateAlertDispatch: real_alert_dispatched false', alert.real_alert_dispatched === false);
      check('simulateAlertDispatch: simulationOnly true', alert.simulationOnly === true);

      const finding = await svc.recordIncidentFinding({ description: 'Test finding', actor: 'smoke-test' });
      check('recordIncidentFinding: finding_id present', !!finding.finding_id);
      check('recordIncidentFinding: simulationOnly true', finding.simulationOnly === true);

      const evidence = await svc.buildIncidentReadinessEvidencePack({ actor: 'smoke-test' });
      check('buildIncidentReadinessEvidencePack returns result', !!evidence);
      check('evidencePack: simulationOnly true', evidence.simulationOnly === true);
      check('evidencePack: reviewOnly true', evidence.reviewOnly === true);
      check('evidencePack: safety_invariants present', !!evidence.safety_invariants);
      check('evidencePack: simulation_only invariant true', evidence.safety_invariants && evidence.safety_invariants.simulation_only === true);
      check('evidencePack: real_alert_dispatched invariant false', evidence.safety_invariants && evidence.safety_invariants.real_alert_dispatched === false);
      check('evidencePack: payment_execution_enabled false', evidence.safety_invariants && evidence.safety_invariants.payment_execution_enabled === false);
      check('evidencePack: phase is 118', evidence.phase === 118);

      console.log(`\nPhase 118B: PASS ${passed} | FAIL ${failed}`);
      if (failed > 0) process.exit(1);
    } catch (err) {
      console.error('Runtime error:', err.message);
      process.exit(1);
    }
  })();
} else {
  console.log(`\nPhase 118B: PASS ${passed} | FAIL ${failed}`);
  if (failed > 0) process.exit(1);
}
