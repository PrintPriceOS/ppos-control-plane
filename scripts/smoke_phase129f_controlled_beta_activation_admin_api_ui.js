'use strict';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

console.log('=== Smoke 129f: Controlled Beta Cohort Activation Admin API Verification ===\n');

process.env.NODE_ENV = 'test';
process.env.ALLOW_DB_FALLBACK_FOR_SMOKE = 'true';
process.env.JWT_SECRET = 'test_secret';

const controlledBetaCohortActivationAdmin = require('../src/api/routes/controlledBetaCohortActivationAdmin');

function findRoute(method, path) {
  const route = controlledBetaCohortActivationAdmin.stack.find(layer => {
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
    const reqReadiness = { query: { activation_id: 'act_123' } };
    const resReadiness = {
      json: (data) => { readinessResult = data; },
      status: function(code) { return this; }
    };
    await readinessHandler(reqReadiness, resReadiness);

    assert(readinessResult !== null, "Readiness response received");
    assert(readinessResult.ok === false, "Readiness is ok: false by default in test");
    assert(readinessResult.safety !== undefined, "Readiness safety object is present");
    assert(readinessResult.safety.fullPublicEnabled === false, "Safety fullPublicEnabled is false");

    // 2. Test POST /create
    const createHandler = findRoute('POST', '/create');
    let createResult = null;
    const reqCreate = { body: { gate_id: 'gate_129', cohort_id: 'cohort_129', tenant_id: 'tenant_129' } };
    const resCreate = {
      json: (data) => { createResult = data; },
      status: function(code) { return this; }
    };
    await createHandler(reqCreate, resCreate);

    assert(createResult !== null, "Create response received");
    assert(createResult.ok === true, "Create returns ok: true");
    const actId = createResult.activation.activation_id;

    // 3. Test POST /kill-switch/trigger
    const ksHandler = findRoute('POST', '/kill-switch/trigger');
    let ksResult = null;
    const reqKS = { body: { activation_id: actId, reason: 'Api test emergency stop' } };
    const resKS = {
      json: (data) => { ksResult = data; },
      status: function(code) { return this; }
    };
    await ksHandler(reqKS, resKS);

    assert(ksResult !== null, "Kill switch trigger response received");
    assert(ksResult.ok === true, "Kill switch trigger returns ok: true");
    assert(ksResult.kill_switch_active === true, "Kill switch is active");

    // 4. Test GET /evidence-pack
    const packHandler = findRoute('GET', '/evidence-pack');
    let packResult = null;
    const reqPack = { query: { activation_id: actId } };
    const resPack = {
      json: (data) => { packResult = data; },
      status: function(code) { return this; }
    };
    await packHandler(reqPack, resPack);

    assert(packResult !== null, "Evidence pack response received");
    assert(packResult.ok === true, "Evidence pack returns ok: true");
    assert(packResult.evidence_pack.evidence_schema_version === '129.0', "Evidence pack has schema version 129.0");

    console.log(`\nSmoke 129f: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    process.exit(0);
  } catch (err) {
    console.error("FATAL ERROR in 129f:", err);
    process.exit(1);
  }
})();
