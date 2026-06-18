'use strict';
// Phase 122B Smoke Test — Internal Order Lifecycle Pilot Service

const fs = require('fs');
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

console.log('\n=== Phase 122B — Internal Order Lifecycle Pilot Service ===\n');

const servicePath = path.join(__dirname, '../src/api/services/internalOrderLifecyclePilotService.js');
check('Service file exists', fs.existsSync(servicePath));

if (fs.existsSync(servicePath)) {
  const src = fs.readFileSync(servicePath, 'utf8');

  // Required methods
  const methods = [
    'createPilotLifecycleRun',
    'evaluatePilotLifecycleReadiness',
    'createInternalPilotOrder',
    'executeInternalOrderLifecycle',
    'createRollbackPoint',
    'simulateLifecycleRollback',
    'recordLifecycleFinding',
    'resolveLifecycleFinding',
    'listLifecycleSteps',
    'getLifecycleAuditTimeline',
    'buildInternalOrderLifecycleEvidencePack',
  ];
  for (const m of methods) {
    check(`Method ${m} exists`, src.includes(m));
  }

  // Syntax check
  try {
    require(servicePath);
    check('Service syntax valid', true);
  } catch (e) {
    check(`Service syntax valid: ${e.message}`, false);
  }

  // Safety markers
  check('pilotOnly: true', src.includes('pilotOnly: true'));
  check('internalOrderLifecycleOnly: true', src.includes('internalOrderLifecycleOnly: true'));
  check('reviewOnly: true', src.includes('reviewOnly: true'));
  check('fullPublicEnabled: false', src.includes('fullPublicEnabled: false'));
  check('openMarketplaceAccessEnabled: false', src.includes('openMarketplaceAccessEnabled: false'));
  check('liveProviderConnectivityEnabled: false', src.includes('liveProviderConnectivityEnabled: false'));
  check('paymentExecutionEnabled: false', src.includes('paymentExecutionEnabled: false'));
  check('refundExecutionEnabled: false', src.includes('refundExecutionEnabled: false'));
  check('payoutExecutionEnabled: false', src.includes('payoutExecutionEnabled: false'));
  check('externalTaxSubmissionEnabled: false', src.includes('externalTaxSubmissionEnabled: false'));
  check('externalAccountingSubmissionEnabled: false', src.includes('externalAccountingSubmissionEnabled: false'));
  check('providerExternalSubmissionEnabled: false', src.includes('providerExternalSubmissionEnabled: false'));
  check('sourceMutationOutsidePilotScope: false', src.includes('sourceMutationOutsidePilotScope: false'));

  // Functional tests with in-memory fallback
  const Svc = require(servicePath);
  const svc = new Svc();

  (async () => {
    try {
      // createPilotLifecycleRun
      const run = await svc.createPilotLifecycleRun({ tenant_id: 'test-tenant-122' });
      check('createPilotLifecycleRun returns pilotOnly true', run.safety && run.safety.pilotOnly === true);
      const runId = run.pilot_run && run.pilot_run.pilot_run_id;
      check('createPilotLifecycleRun returns pilot_run_id', !!runId);

      // evaluatePilotLifecycleReadiness
      const readiness = await svc.evaluatePilotLifecycleReadiness({ pilot_run_id: runId, tenant_id: 'test-tenant-122' });
      check('evaluatePilotLifecycleReadiness returns READY_FOR_INTERNAL_ORDER or BLOCKED',
        readiness.readiness_status === 'READY_FOR_INTERNAL_ORDER' || readiness.readiness_status === 'BLOCKED');

      // createInternalPilotOrder
      const order = await svc.createInternalPilotOrder({ pilot_run_id: runId, tenant_id: 'test-tenant-122' });
      const orderId = order.pilot_order && order.pilot_order.pilot_order_id;
      check('createInternalPilotOrder creates pilot_order_id', !!orderId);

      // executeInternalOrderLifecycle
      const lifecycle = await svc.executeInternalOrderLifecycle({ pilot_run_id: runId, pilot_order_id: orderId, tenant_id: 'test-tenant-122' });
      const stepKeys = (lifecycle.steps || []).map(s => s.step_key);
      const requiredSteps = [
        'PILOT_TENANT_ALLOWLIST_VERIFIED',
        'PRICING_SNAPSHOT_REFERENCED',
        'FILE_PACKAGE_REFERENCED',
        'PREFLIGHT_READINESS_REFERENCED',
        'INVOICE_READINESS_REFERENCED',
        'PRODUCTION_READINESS_REFERENCED',
        'PAYMENT_EXECUTION_BLOCK_VERIFIED',
        'PROVIDER_EXTERNAL_SUBMISSION_BLOCK_VERIFIED',
        'SOURCE_MUTATION_BOUNDARY_VERIFIED',
        'AUDIT_TIMELINE_BUILT',
        'EVIDENCE_PACK_BUILT',
      ];
      for (const sk of requiredSteps) {
        check(`Step ${sk} created`, stepKeys.includes(sk));
      }

      // createRollbackPoint
      const rbp = await svc.createRollbackPoint({ pilot_run_id: runId });
      check('createRollbackPoint marks rollback_simulated_only true',
        rbp.rollback_point && rbp.rollback_point.rollback_simulated_only === true);

      // simulateLifecycleRollback
      const rbs = await svc.simulateLifecycleRollback({ pilot_run_id: runId });
      check('simulateLifecycleRollback marks rollback_executed false', rbs.rollback_executed === false);

      // evidence pack
      const ep = await svc.buildInternalOrderLifecycleEvidencePack({ pilot_run_id: runId });
      check('Evidence pack contains pilotOnly true', ep.evidence_pack && ep.evidence_pack.pilotOnly === true);
      check('Evidence pack contains fullPublicEnabled false', ep.evidence_pack && ep.evidence_pack.fullPublicEnabled === false);
      check('Evidence pack contains paymentExecutionEnabled false', ep.evidence_pack && ep.evidence_pack.paymentExecutionEnabled === false);
      check('Evidence pack contains providerExternalSubmissionEnabled false', ep.evidence_pack && ep.evidence_pack.providerExternalSubmissionEnabled === false);
      check('Evidence pack contains sourceMutationOutsidePilotScope false', ep.evidence_pack && ep.evidence_pack.sourceMutationOutsidePilotScope === false);

    } catch (e) {
      check(`Functional test error: ${e.message}`, false);
    }

    // Static forbidden pattern scan
    const forbiddenPatterns = [
      'charge(', '.charge(', 'capture(', '.capture(',
      'refund(', '.refund(', 'payout(', '.payout(',
      'submitTax', 'submitVat', 'submitAccounting', 'sendToProvider',
      'externalSubmission: true', 'sourceMutation: true',
      'fullPublicEnabled: true', 'openMarketplaceAccessEnabled: true',
      'liveProviderConnectivityEnabled: true', 'paymentExecutionEnabled: true',
      'refundExecutionEnabled: true', 'payoutExecutionEnabled: true',
      'providerExternalSubmissionEnabled: true', 'sourceMutationOutsidePilotScope: true',
    ];
    for (const p of forbiddenPatterns) {
      check(`No forbidden pattern: ${p}`, !src.includes(p));
    }

    console.log(`\n  Phase 122B: ${pass} passed, ${fail} failed\n`);
    if (fail > 0) process.exit(1);
  })();
}
