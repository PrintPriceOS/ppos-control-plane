'use strict';
// Phase 121D Smoke Test — Controlled Production Pilot Acceptance Pack

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

console.log('\n=== Phase 121D — Controlled Production Pilot Acceptance Pack ===\n');

// --- Phase 121 A-C smoke files exist ---
const phase121Smokes = [
  'smoke_phase121a_controlled_production_pilot_schema.js',
  'smoke_phase121b_controlled_production_pilot_service.js',
  'smoke_phase121c_controlled_production_pilot_admin_api_ui.js',
];
for (const f of phase121Smokes) {
  check(`${f} exists`, fs.existsSync(path.join(__dirname, f)));
}

// --- Prior phase acceptance smokes exist ---
const priorSmokes = [
  'smoke_phase113g_production_activation_gate_acceptance_pack.js',
  'smoke_phase114e_controlled_production_activation_dry_run_acceptance_pack.js',
  'smoke_phase115d_pre_production_readiness_board_acceptance_pack.js',
  'smoke_phase116d_production_deployment_readiness_acceptance_pack.js',
  'smoke_phase117d_production_deployment_dry_run_acceptance_pack.js',
  'smoke_phase118d_observability_incident_acceptance_pack.js',
  'smoke_phase119d_security_compliance_acceptance_pack.js',
  'smoke_phase120d_final_preproduction_release_candidate_acceptance_pack.js',
];
for (const f of priorSmokes) {
  check(`Prior phase smoke ${f} exists`, fs.existsSync(path.join(__dirname, f)));
}

// --- Phase 120.1 evidence exists ---
check('Phase 120.1 docs exist',
  fs.existsSync(path.join(__dirname, '../docs/phase120_1_migration_integrity_acceptance_env_repair.md')));
check('Phase 120.1 acceptance smoke exists',
  fs.existsSync(path.join(__dirname, 'smoke_phase120_1_migration_integrity_acceptance.js')));

// --- Core Phase 121 files exist ---
check('Migration 063 exists',
  fs.existsSync(path.join(__dirname, '../migrations/063_phase121_controlled_production_pilot_activation_gate.sql')));
check('Service file exists',
  fs.existsSync(path.join(__dirname, '../src/api/services/controlledProductionPilotActivationService.js')));
check('Route file exists',
  fs.existsSync(path.join(__dirname, '../src/api/routes/controlledProductionPilotActivationAdmin.js')));
check('UI types exist',
  fs.existsSync(path.join(__dirname, '../src/ui/types/controlledProductionPilotActivation.ts')));
check('UI client exists',
  fs.existsSync(path.join(__dirname, '../src/ui/api/controlledProductionPilotActivationClient.ts')));
check('UI page exists',
  fs.existsSync(path.join(__dirname, '../src/ui/pages/production/ControlledProductionPilotActivation.tsx')));
check('Phase 121 docs exist',
  fs.existsSync(path.join(__dirname, '../docs/phase121_controlled_production_pilot_activation_gate.md')));

// --- Static safety scan on service ---
const servicePath = path.join(__dirname, '../src/api/services/controlledProductionPilotActivationService.js');
if (fs.existsSync(servicePath)) {
  const svcSrc = fs.readFileSync(servicePath, 'utf8');

  const unsafePatterns = [
    { pattern: 'fullPublicEnabled: true', label: 'fullPublicEnabled: true' },
    { pattern: 'openMarketplaceEnabled: true', label: 'openMarketplaceEnabled: true' },
    { pattern: 'unrestrictedLiveProviderConnectivityEnabled: true', label: 'unrestrictedLiveProviderConnectivityEnabled: true' },
    { pattern: 'externalSubmission: true', label: 'externalSubmission: true' },
    { pattern: 'sourceMutation: true', label: 'sourceMutation: true' },
    { pattern: 'liveProviderConnectivityEnabled: true', label: 'liveProviderConnectivityEnabled: true' },
    { pattern: 'paymentExecutionEnabled: true', label: 'paymentExecutionEnabled: true' },
    { pattern: 'refundExecutionEnabled: true', label: 'refundExecutionEnabled: true' },
    { pattern: 'payoutExecutionEnabled: true', label: 'payoutExecutionEnabled: true' },
    { pattern: 'submitTax', label: 'submitTax' },
    { pattern: 'submitVat', label: 'submitVat' },
    { pattern: 'sendToProvider', label: 'sendToProvider' },
    { pattern: 'charge(', label: 'charge(' },
    { pattern: 'refund(', label: 'refund(' },
    { pattern: 'payout(', label: 'payout(' },
    { pattern: 'capture(', label: 'capture(' },
  ];

  for (const u of unsafePatterns) {
    check(`No ${u.label} in service`, !svcSrc.includes(u.pattern));
  }
}

// --- Static safety scan on route ---
const routePath = path.join(__dirname, '../src/api/routes/controlledProductionPilotActivationAdmin.js');
if (fs.existsSync(routePath)) {
  const routeSrc = fs.readFileSync(routePath, 'utf8');
  check('No fullPublicEnabled: true in route', !routeSrc.includes('fullPublicEnabled: true'));
  check('No paymentExecutionEnabled: true in route', !routeSrc.includes('paymentExecutionEnabled: true'));
  check('No charge( in route', !routeSrc.includes('charge('));
}

// --- App.tsx route registered ---
const appPath = path.join(__dirname, '../src/ui/App.tsx');
if (fs.existsSync(appPath)) {
  const appSrc = fs.readFileSync(appPath, 'utf8');
  check('Route /admin/production/pilot-activation in App.tsx', appSrc.includes('/admin/production/pilot-activation'));
}

// --- Functional validation: allowlist-only tenant activation ---
const Svc = require(servicePath);
const svc = new Svc();

(async () => {
  try {
    const run = await svc.createPilotRun({ created_by: 'acceptance_test' });
    const pilotRunId = run.pilot_run.pilot_run_id;

    // Unknown tenant activation should fail
    let unknownBlocked = false;
    try {
      await svc.activatePilotForTenant({ pilot_run_id: pilotRunId, tenant_id: 'not-registered-tenant' });
    } catch (e) {
      unknownBlocked = e.message.includes('not registered');
    }
    check('Unknown tenant activation is BLOCKED', unknownBlocked);

    // Register and activate
    await svc.registerPilotTenant({ pilot_run_id: pilotRunId, tenant_id: 'allowed-tenant', tenant_name: 'Allowed' });
    const act = await svc.activatePilotForTenant({ pilot_run_id: pilotRunId, tenant_id: 'allowed-tenant' });
    check('Registered tenant activation succeeds', act.tenant.tenant_status === 'PILOT_ACTIVE');

    // Suspend
    const sus = await svc.suspendPilotTenant({ pilot_run_id: pilotRunId, tenant_id: 'allowed-tenant' });
    check('Tenant suspension works', sus.tenant.tenant_status === 'PILOT_SUSPENDED');

    // Rollback point + simulation
    const rbp = await svc.createPilotRollbackPoint({ pilot_run_id: pilotRunId });
    check('Rollback point created', rbp.rollback_point.rollback_status === 'CREATED');
    const sim = await svc.simulatePilotRollback({ rollback_id: rbp.rollback_point.id });
    check('Rollback simulation is simulation only', sim.simulation.simulation_only === true);
    check('Rollback not actually executed', sim.simulation.rollback_executed === false);

    // Evidence pack includes safety
    const ev = await svc.buildPilotEvidencePack({ pilot_run_id: pilotRunId });
    check('Evidence pack has safety markers', !!ev.safety);
    check('Evidence pack controlledPilotOnly', ev.safety.controlledPilotOnly === true);
    check('Evidence pack fullPublicEnabled false', ev.safety.fullPublicEnabled === false);

    // Audit timeline
    const timeline = await svc.getPilotAuditTimeline({ pilot_run_id: pilotRunId });
    const eventTypes = timeline.timeline.map((a) => a.event_type);
    const requiredEvents = [
      'PILOT_RUN_CREATED',
      'PILOT_TENANT_REGISTERED',
      'PILOT_TENANT_ACTIVATED',
      'PILOT_TENANT_SUSPENDED',
      'PILOT_ROLLBACK_POINT_CREATED',
      'PILOT_ROLLBACK_SIMULATED',
      'PILOT_EVIDENCE_PACK_BUILT',
    ];
    for (const evt of requiredEvents) {
      check(`Audit event ${evt} present`, eventTypes.includes(evt));
    }

    // No real execution flags
    check('No real payment execution', ev.safety.paymentExecutionEnabled === false);
    check('No real refund execution', ev.safety.refundExecutionEnabled === false);
    check('No real payout execution', ev.safety.payoutExecutionEnabled === false);
    check('No unrestricted production activation', ev.safety.fullPublicEnabled === false);

    console.log(`\n  Phase 121D: ${pass} passed, ${fail} failed\n`);
    if (fail > 0) process.exit(1);
  } catch (e) {
    console.error('  FATAL  Acceptance test error:', e.message);
    process.exit(1);
  }
})();
