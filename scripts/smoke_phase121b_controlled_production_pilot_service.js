'use strict';
// Phase 121B Smoke Test — Controlled Production Pilot Service

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

console.log('\n=== Phase 121B — Controlled Production Pilot Service ===\n');

const servicePath = path.join(__dirname, '../src/api/services/controlledProductionPilotActivationService.js');
check('Service file exists', fs.existsSync(servicePath));

if (fs.existsSync(servicePath)) {
  const src = fs.readFileSync(servicePath, 'utf8');

  // Required methods
  const methods = [
    'createPilotRun',
    'registerPilotTenant',
    'evaluatePilotReadiness',
    'activatePilotForTenant',
    'suspendPilotTenant',
    'recordPilotFinding',
    'resolvePilotFinding',
    'createPilotRollbackPoint',
    'simulatePilotRollback',
    'buildPilotEvidencePack',
    'getPilotAuditTimeline',
  ];
  for (const m of methods) {
    check(`Method ${m} exists`, src.includes(m));
  }

  // Safety markers
  check('controlledPilotOnly: true', src.includes('controlledPilotOnly: true'));
  check('fullPublicEnabled: false', src.includes('fullPublicEnabled: false'));
  check('openMarketplaceEnabled: false', src.includes('openMarketplaceEnabled: false'));
  check('paymentExecutionEnabled: false', src.includes('paymentExecutionEnabled: false'));
  check('refundExecutionEnabled: false', src.includes('refundExecutionEnabled: false'));
  check('payoutExecutionEnabled: false', src.includes('payoutExecutionEnabled: false'));
  check('externalSubmission: false', src.includes('externalSubmission: false'));
  check('sourceMutation: false', src.includes('sourceMutation: false'));
  check('rollbackAvailable: true', src.includes('rollbackAvailable: true'));

  // Static safety scan
  check('No fullPublicEnabled: true', !src.includes('fullPublicEnabled: true'));
  check('No openMarketplaceEnabled: true', !src.includes('openMarketplaceEnabled: true'));
  check('No paymentExecutionEnabled: true', !src.includes('paymentExecutionEnabled: true'));
  check('No refundExecutionEnabled: true', !src.includes('refundExecutionEnabled: true'));
  check('No payoutExecutionEnabled: true', !src.includes('payoutExecutionEnabled: true'));
  check('No externalSubmission: true', !src.includes('externalSubmission: true'));
  check('No sourceMutation: true', !src.includes('sourceMutation: true'));
  check('No charge( call', !src.includes('charge('));
  check('No submitTax call', !src.includes('submitTax'));
  check('No submitVat call', !src.includes('submitVat'));
  check('No sendToProvider call', !src.includes('sendToProvider'));

  // Tenant activation is allowlist-only
  check('Allowlist enforcement for unknown tenants', src.includes('not registered'));

  // Instantiation test
  const Svc = require(servicePath);
  const svc = new Svc();

  // Test createPilotRun
  (async () => {
    try {
      const run = await svc.createPilotRun({ created_by: 'smoke_test' });
      check('createPilotRun returns pilot_run', !!run.pilot_run);
      check('createPilotRun returns safety', !!run.safety);
      check('createPilotRun safety.controlledPilotOnly is true', run.safety.controlledPilotOnly === true);
      check('createPilotRun safety.fullPublicEnabled is false', run.safety.fullPublicEnabled === false);

      const pilotRunId = run.pilot_run.pilot_run_id;

      // Register tenant
      const reg = await svc.registerPilotTenant({ pilot_run_id: pilotRunId, tenant_id: 'test-tenant-1', tenant_name: 'Test Tenant' });
      check('registerPilotTenant returns tenant', !!reg.tenant);
      check('Tenant status is REGISTERED', reg.tenant.tenant_status === 'REGISTERED');

      // Activate registered tenant
      const act = await svc.activatePilotForTenant({ pilot_run_id: pilotRunId, tenant_id: 'test-tenant-1' });
      check('activatePilotForTenant succeeds for registered tenant', act.tenant.tenant_status === 'PILOT_ACTIVE');

      // Activate unknown tenant should throw
      let unknownBlocked = false;
      try {
        await svc.activatePilotForTenant({ pilot_run_id: pilotRunId, tenant_id: 'unknown-tenant-999' });
      } catch (e) {
        unknownBlocked = e.message.includes('not registered');
      }
      check('activatePilotForTenant refuses unknown tenant', unknownBlocked);

      // Suspend tenant
      const sus = await svc.suspendPilotTenant({ pilot_run_id: pilotRunId, tenant_id: 'test-tenant-1', reason: 'Test suspension' });
      check('suspendPilotTenant works', sus.tenant.tenant_status === 'PILOT_SUSPENDED');

      // Rollback point
      const rbp = await svc.createPilotRollbackPoint({ pilot_run_id: pilotRunId, rollback_point_name: 'Test Point' });
      check('createPilotRollbackPoint returns rollback_point', !!rbp.rollback_point);
      check('Rollback point status is CREATED', rbp.rollback_point.rollback_status === 'CREATED');

      // Simulate rollback
      const sim = await svc.simulatePilotRollback({ rollback_id: rbp.rollback_point.id });
      check('simulatePilotRollback is simulation only', sim.simulation.simulation_only === true);
      check('simulatePilotRollback rollback_executed is false', sim.simulation.rollback_executed === false);

      // Evidence pack
      const ev = await svc.buildPilotEvidencePack({ pilot_run_id: pilotRunId });
      check('Evidence pack includes safety', !!ev.safety);
      check('Evidence pack safety.controlledPilotOnly', ev.safety.controlledPilotOnly === true);

      // Audit timeline
      const timeline = await svc.getPilotAuditTimeline({ pilot_run_id: pilotRunId });
      check('Audit timeline has entries', timeline.count > 0);

      const expectedEvents = [
        'PILOT_RUN_CREATED',
        'PILOT_TENANT_REGISTERED',
        'PILOT_TENANT_ACTIVATED',
        'PILOT_TENANT_SUSPENDED',
        'PILOT_ROLLBACK_POINT_CREATED',
        'PILOT_ROLLBACK_SIMULATED',
        'PILOT_EVIDENCE_PACK_BUILT',
      ];
      const eventTypes = timeline.timeline.map((a) => a.event_type);
      for (const evt of expectedEvents) {
        check(`Audit event ${evt} present`, eventTypes.includes(evt));
      }

      console.log(`\n  Phase 121B: ${pass} passed, ${fail} failed\n`);
      if (fail > 0) process.exit(1);
    } catch (e) {
      console.error('  FATAL  Smoke test error:', e.message);
      process.exit(1);
    }
  })();
} else {
  console.log(`\n  Phase 121B: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}
