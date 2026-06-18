'use strict';

const path = require('path');
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Phase 122.1C: Blocker Findings Enforcement ===\n');

// Set test mode env for smoke
process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.PILOT_TENANT_ALLOWLIST = '';

const svcPath = path.resolve(__dirname, '..', 'src', 'api', 'services', 'internalOrderLifecyclePilotService.js');
delete require.cache[require.resolve(svcPath)];
const InternalOrderLifecyclePilotService = require(svcPath);
const svc = new InternalOrderLifecyclePilotService();

(async () => {
  // Create a run
  const runResult = await svc.createPilotLifecycleRun({ tenant_id: 'test_tenant_blocker', requested_by: 'smoke_test' });
  const pilotRunId = runResult.pilot_run.pilot_run_id;
  assert(!!pilotRunId, 'Created pilot run for blocker test');

  // Record a blocker finding
  const findingResult = await svc.recordLifecycleFinding({
    pilot_run_id: pilotRunId,
    finding_key: 'CRITICAL_BLOCKER_TEST',
    severity: 'BLOCKER',
    blocks_lifecycle: true,
  });
  assert(findingResult.finding.blocks_lifecycle === true, 'Recorded blocker finding with blocks_lifecycle=true');

  // Execute lifecycle should be blocked
  const execResult = await svc.executeInternalOrderLifecycle({
    pilot_run_id: pilotRunId,
    tenant_id: 'test_tenant_blocker',
  });
  assert(execResult.lifecycle_status === 'BLOCKED_BY_FINDINGS', 'Lifecycle execution blocked by unresolved blocker findings');
  assert(execResult.steps.length === 0, 'No steps executed when blocked');

  // Resolve the finding
  await svc.resolveLifecycleFinding({
    pilot_run_id: pilotRunId,
    finding_id: findingResult.finding.finding_id,
    resolved_by: 'smoke_test',
  });

  // Now lifecycle should succeed
  // Need to reset run status first
  const run = svc._runs.get(pilotRunId);
  if (run) run.status = 'READY_FOR_INTERNAL_ORDER';

  const execResult2 = await svc.executeInternalOrderLifecycle({
    pilot_run_id: pilotRunId,
    tenant_id: 'test_tenant_blocker',
  });
  assert(execResult2.lifecycle_status === 'LIFECYCLE_PASSED', 'Lifecycle passes after blocker resolved');
  assert(execResult2.steps.length > 0, 'Steps executed after blocker resolved');

  // pilot_run_id enforcement: create order fails for unknown run
  let orderError = null;
  try {
    await svc.createInternalPilotOrder({ pilot_run_id: 'nonexistent_run', tenant_id: 'test_tenant_blocker' });
  } catch (e) { orderError = e; }
  assert(orderError !== null, 'createInternalPilotOrder fails for nonexistent pilot_run_id');
  assert(orderError && orderError.message.includes('does not exist'), 'Error message mentions pilot_run_id does not exist');

  // pilot_run_id enforcement: execute lifecycle fails for unknown run
  let execError = null;
  try {
    await svc.executeInternalOrderLifecycle({ pilot_run_id: 'nonexistent_run', tenant_id: 'test_tenant_blocker' });
  } catch (e) { execError = e; }
  assert(execError !== null, 'executeInternalOrderLifecycle fails for nonexistent pilot_run_id');
  assert(execError && execError.message.includes('does not exist'), 'Error message mentions pilot_run_id does not exist');

  // Audit event for blocked lifecycle
  const timeline = await svc.getLifecycleAuditTimeline({ pilot_run_id: pilotRunId });
  const blockedEvent = timeline.audit_timeline.find(a => a.event_type === 'INTERNAL_ORDER_LIFECYCLE_BLOCKED_BY_FINDINGS');
  assert(!!blockedEvent, 'Audit event INTERNAL_ORDER_LIFECYCLE_BLOCKED_BY_FINDINGS recorded');

  // Source verification
  const fs = require('fs');
  const src = fs.readFileSync(svcPath, 'utf8');
  assert(src.includes('BLOCKED_BY_FINDINGS'), 'Service source contains BLOCKED_BY_FINDINGS status');
  assert(src.includes('INTERNAL_ORDER_LIFECYCLE_BLOCKED_BY_FINDINGS'), 'Service source contains BLOCKED_BY_FINDINGS audit event');

  console.log(`\n=== Phase 122.1C Results: PASS ${passed} | FAIL ${failed} ===`);
  if (failed > 0) process.exit(1);
})().catch(err => {
  console.error('Smoke 122.1C failed:', err);
  process.exit(1);
});
