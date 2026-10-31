'use strict';
// Phase 122D Smoke Test — Internal Order Lifecycle Pilot E2E Regression

const path = require('path');

let pass = 0;
let fail = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}`);
    fail++;
  }
}

// Phase 122.1: set test mode so tenant allowlist allows all tenants in smoke
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';

console.log('\n=== Phase 122D — Internal Order Lifecycle Pilot E2E Regression ===\n');

const Svc = require(path.join(__dirname, '../src/api/services/internalOrderLifecyclePilotService.js'));
const svc = new Svc();

(async () => {
  try {
    // 1. Create pilot lifecycle run
    const run = await svc.createPilotLifecycleRun({ tenant_id: 'e2e-tenant-122', requested_by: 'e2e-test' });
    const runId = run.pilot_run && run.pilot_run.pilot_run_id;
    check('1. Create pilot lifecycle run', !!runId);

    // 2. Evaluate readiness
    const readiness = await svc.evaluatePilotLifecycleReadiness({ pilot_run_id: runId, tenant_id: 'e2e-tenant-122' });
    check('2. Evaluate readiness', readiness.readiness_status === 'READY_FOR_INTERNAL_ORDER' || readiness.readiness_status === 'BLOCKED');

    // 3. Create internal pilot order
    const order = await svc.createInternalPilotOrder({ pilot_run_id: runId, tenant_id: 'e2e-tenant-122' });
    const orderId = order.pilot_order && order.pilot_order.pilot_order_id;
    check('3. Create internal pilot order', !!orderId);

    // 4. Execute lifecycle
    const lifecycle = await svc.executeInternalOrderLifecycle({ pilot_run_id: runId, pilot_order_id: orderId, tenant_id: 'e2e-tenant-122' });
    check('4. Execute lifecycle', lifecycle.lifecycle_status === 'LIFECYCLE_PASSED' || lifecycle.lifecycle_status === 'LIFECYCLE_FAILED');

    // 5. List lifecycle steps
    const steps = await svc.listLifecycleSteps({ pilot_run_id: runId });
    check('5. List lifecycle steps', (steps.steps || []).length > 0);

    // 6. Create rollback point
    const rbp = await svc.createRollbackPoint({ pilot_run_id: runId, pilot_order_id: orderId });
    check('6. Create rollback point', rbp.rollback_point && rbp.rollback_point.rollback_simulated_only === true);

    // 7. Simulate rollback
    const rbs = await svc.simulateLifecycleRollback({ pilot_run_id: runId, pilot_order_id: orderId });
    check('7. Simulate rollback', rbs.rollback_simulated === true && rbs.rollback_executed === false);

    // 8. Get audit timeline
    const timeline = await svc.getLifecycleAuditTimeline({ pilot_run_id: runId });
    check('8. Get audit timeline', (timeline.audit_timeline || []).length > 0);

    // 9. Build evidence pack
    const ep = await svc.buildInternalOrderLifecycleEvidencePack({ pilot_run_id: runId, pilot_order_id: orderId });
    check('9. Build evidence pack', !!ep.evidence_pack_id);

    // Verify required audit events
    const auditEvents = (timeline.audit_timeline || []).map(a => a.event_type);
    // Re-fetch after evidence pack
    const timeline2 = await svc.getLifecycleAuditTimeline({ pilot_run_id: runId });
    const allEvents = (timeline2.audit_timeline || []).map(a => a.event_type);

    const requiredEvents = [
      'PILOT_LIFECYCLE_RUN_CREATED',
      'PILOT_LIFECYCLE_READINESS_EVALUATED',
      'INTERNAL_PILOT_ORDER_CREATED',
      'INTERNAL_ORDER_LIFECYCLE_EXECUTED',
      'PILOT_ROLLBACK_POINT_CREATED',
      'PILOT_LIFECYCLE_ROLLBACK_SIMULATED',
      'INTERNAL_ORDER_LIFECYCLE_EVIDENCE_PACK_BUILT',
    ];
    for (const evt of requiredEvents) {
      check(`Audit event ${evt} exists`, allEvents.includes(evt));
    }

    // Verify all safety flags remain disabled
    check('Safety: pilotOnly true', ep.safety && ep.safety.pilotOnly === true);
    check('Safety: fullPublicEnabled false', ep.safety && ep.safety.fullPublicEnabled === false);
    check('Safety: openMarketplaceAccessEnabled false', ep.safety && ep.safety.openMarketplaceAccessEnabled === false);
    check('Safety: liveProviderConnectivityEnabled false', ep.safety && ep.safety.liveProviderConnectivityEnabled === false);
    check('Safety: paymentExecutionEnabled false', ep.safety && ep.safety.paymentExecutionEnabled === false);
    check('Safety: refundExecutionEnabled false', ep.safety && ep.safety.refundExecutionEnabled === false);
    check('Safety: payoutExecutionEnabled false', ep.safety && ep.safety.payoutExecutionEnabled === false);
    check('Safety: externalTaxSubmissionEnabled false', ep.safety && ep.safety.externalTaxSubmissionEnabled === false);
    check('Safety: externalAccountingSubmissionEnabled false', ep.safety && ep.safety.externalAccountingSubmissionEnabled === false);
    check('Safety: providerExternalSubmissionEnabled false', ep.safety && ep.safety.providerExternalSubmissionEnabled === false);
    check('Safety: sourceMutationOutsidePilotScope false', ep.safety && ep.safety.sourceMutationOutsidePilotScope === false);

  } catch (e) {
    check(`E2E error: ${e.message}`, false);
  }

  console.log(`\n  Phase 122D: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
})();
