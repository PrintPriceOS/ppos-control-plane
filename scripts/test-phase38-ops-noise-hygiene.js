// scripts/test-phase38-ops-noise-hygiene.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Ops Noise / Route Hygiene Tests...\n');

// 1. Verify UI no longer calls /api/admin/dispatch directly
const adminApiContent = fs.readFileSync(path.join(__dirname, '../src/ui/lib/adminApi.ts'), 'utf-8');
assert(!adminApiContent.includes("adminFetch<{ ok: boolean, dispatches: any[] }>(`/api/admin/dispatch`)"), "UI should not use /api/admin/dispatch directly for getDispatches");
assert(adminApiContent.includes("/api/admin/manufacturing/queue"), "UI should migrate getDispatches to manufacturing queue");
console.log('✅ UI canonical endpoint verified');

// 2. Verify decommissioned route warning is rate-limited
const dispatchAdminContent = fs.readFileSync(path.join(__dirname, '../src/api/routes/productionDispatchAdmin.js'), 'utf-8');
assert(dispatchAdminContent.includes('decommissionedRouteWarned = true'), "Decommissioned route warning must be rate-limited");
console.log('✅ Decommissioned route warning rate-limited');

// 3. Verify worker init guard
const orchestrationServiceContent = fs.readFileSync(path.join(__dirname, '../src/api/services/IndustrialEventOrchestrationService.js'), 'utf-8');
assert(orchestrationServiceContent.includes('Consumers skipped: worker connection not configured'), "Worker should skip gracefully when no connection");
console.log('✅ Industrial Event Orchestration worker guard verified');

// 4. Verify autonomous error severities
const errorFiles = [
    '../src/api/services/dispatch/AutonomousRerouteService.js',
    '../src/api/services/AutonomousSimulationLoop.js',
    '../src/api/services/economics/AutonomousEconomicLoop.js',
    '../src/api/services/intelligence/PrinterReliabilityService.js',
    '../src/api/services/temporal/AutonomousTemporalLoop.js'
];
errorFiles.forEach(f => {
    const content = fs.readFileSync(path.join(__dirname, f), 'utf-8');
    assert(!content.includes("logger.error({ event: 'temporal_cycle_failed'"), "Should downgrade temporal cycle errors to WARN");
    assert(!content.includes("logger.error({ event: 'economic_cycle_failed'"), "Should downgrade economic cycle errors to WARN");
    assert(!content.includes("logger.error({ event: 'simulation_cycle_failed'"), "Should downgrade simulation cycle errors to WARN");
    assert(!content.includes("logger.error({ event: 'recalibration_failed'"), "Should downgrade recalibration errors to WARN");
    assert(!content.includes("logger.error({ event: 'max_reroutes_exceeded'"), "Should downgrade max reroute errors to WARN");
});
console.log('✅ Autonomous error severities downgraded');

console.log('\nAll Ops Noise / Route Hygiene Tests Passed! 🚀');
