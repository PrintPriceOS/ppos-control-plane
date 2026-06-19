'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 128e: Beta Runtime Admin API Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.JWT_SECRET = 'test_secret';

const limitedBetaRuntimeAdminRouter = require('../src/api/routes/limitedBetaRuntimeAdmin');

// Helper to simulate calling router endpoints
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
    // 1. Test GET /readiness
    const readinessHandler = findRoute('GET', '/readiness');
    let readinessResult = null;
    const reqReadiness = { query: { gate_id: 'gate_123' } };
    const resReadiness = {
      json: (data) => { readinessResult = data; },
      status: function(code) { return this; }
    };
    await readinessHandler(reqReadiness, resReadiness);

    assert(readinessResult !== null, "Readiness response received");
    assert(readinessResult.ok === false, "Readiness is ok: false by default in test");
    assert(readinessResult.safety !== undefined, "Readiness safety object is present");
    assert(readinessResult.safety.fullPublicEnabled === false, "Safety fullPublicEnabled is false");

    // 2. Test POST /kill-switch/trigger
    const ksHandler = findRoute('POST', '/kill-switch/trigger');
    let ksResult = null;
    const reqKS = { body: { gate_id: 'gate_123', reason: 'Api test emergency stop' } };
    const resKS = {
      json: (data) => { ksResult = data; },
      status: function(code) { return this; }
    };
    await ksHandler(reqKS, resKS);

    assert(ksResult !== null, "Kill switch trigger response received");
    assert(ksResult.ok === true, "Kill switch trigger returns ok: true");
    assert(ksResult.kill_switch.kill_switch_enabled === 1, "Kill switch is active");

    // 3. Test POST /kill-switch/clear
    const ksClearHandler = findRoute('POST', '/kill-switch/clear');
    let ksClearResult = null;
    const reqKSClear = { body: { gate_id: 'gate_123' } };
    const resKSClear = {
      json: (data) => { ksClearResult = data; },
      status: function(code) { return this; }
    };
    await ksClearHandler(reqKSClear, resKSClear);

    assert(ksClearResult !== null, "Kill switch clear response received");
    assert(ksClearResult.ok === true, "Kill switch clear returns ok: true");

    // 4. Test GET /evidence-pack
    const packHandler = findRoute('GET', '/evidence-pack');
    let packResult = null;
    const reqPack = { query: { gate_id: 'gate_123' } };
    const resPack = {
      json: (data) => { packResult = data; },
      status: function(code) { return this; }
    };
    await packHandler(reqPack, resPack);

    assert(packResult !== null, "Evidence pack response received");
    assert(packResult.ok === true, "Evidence pack returns ok: true");
    assert(packResult.evidence_pack.evidence_schema_version === '128.0', "Evidence pack has schema version 128.0");

    console.log(`\nSmoke 128e: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error("FATAL ERROR in 128e:", err);
    process.exit(1);
  }
})();
