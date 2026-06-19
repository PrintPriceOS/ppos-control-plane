'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128.1e: Admin API & UI Restart Drill Routing Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.JWT_SECRET = 'test_secret';

const limitedBetaRuntimeAdminRouter = require('../src/api/routes/limitedBetaRuntimeAdmin');

function findRoute(method, path) {
  const route = limitedBetaRuntimeAdminRouter.stack.find(layer => {
    if (layer.route) {
      const matchPath = layer.route.path === path;
      const matchMethod = layer.route.methods[method.toLowerCase()];
      return matchPath && matchMethod;
    }
    return false;
  });
  if (!route) {
    throw new Error(`Route not found for ${method} ${path}`);
  }
  return route.route.stack[0].handle;
}

(async () => {
  try {
    // 1. Test POST /restart-drill/create
    const createHandler = findRoute('POST', '/restart-drill/create');
    let createResult = null;
    const reqCreate = { body: { gate_id: 'gate_123', cohort_id: 'cohort_123', participant_id: 'part_123', tenant_id: 'tenant_123' } };
    const resCreate = {
      json: (data) => { createResult = data; },
      status: function(code) { return this; }
    };
    await createHandler(reqCreate, resCreate);
    assert(createResult !== null, "Drill creation endpoint response received");
    assert(createResult.ok === true, "Drill creation returns ok: true");
    assert(createResult.drill.restart_recovery_status === 'STARTED', "Drill status starts at STARTED");

    // 2. Test POST /restart-drill/snapshot-before
    const snapshotHandler = findRoute('POST', '/restart-drill/snapshot-before');
    let snapshotResult = null;
    const reqSnapshot = { body: { gate_id: 'gate_123' } };
    const resSnapshot = {
      json: (data) => { snapshotResult = data; },
      status: function(code) { return this; }
    };
    await snapshotHandler(reqSnapshot, resSnapshot);
    assert(snapshotResult !== null, "Snapshot before restart endpoint response received");
    assert(snapshotResult.ok === true, "Snapshot before returns ok: true");

    // 3. Test POST /restart-drill/verify-after
    const verifyHandler = findRoute('POST', '/restart-drill/verify-after');
    let verifyResult = null;
    const reqVerify = { body: { gate_id: 'gate_123' } };
    const resVerify = {
      json: (data) => { verifyResult = data; },
      status: function(code) { return this; }
    };
    await verifyHandler(reqVerify, resVerify);
    assert(verifyResult !== null, "Verify after restart endpoint response received");

    console.log(`\nSmoke 128.1e: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error("FATAL ERROR in 128.1e:", err);
    process.exit(1);
  }
})();
