'use strict';

/**
 * tests/smoke_phase192_1_rc13_printhouse_readiness.js
 *
 * Phase 192.1 — Printhouse Readiness Runtime Blocker Remediation / RC13
 *
 * Proves:
 * 1. _computeOperationalReadiness() and computeReadiness() return defined objects on success.
 * 2. Zero configuration -> NOT_STARTED, 0 / 5 requirements.
 * 3. Partial configuration -> IN_PROGRESS, 1..4 / 5 requirements.
 * 4. All 5 requirements -> READY, 5 / 5 requirements.
 * 5. ACTIVE + enabled shipping region increments shippingCount.
 * 6. ARCHIVED / disabled shipping does not increment shippingCount.
 * 7. Non-DISABLED integration increments integrationCount.
 * 8. DISABLED integration does not increment integrationCount.
 * 9. Integrations remain optional and do not affect the 5/5 operational calculation.
 * 10. activationReadiness remains NOT_ACTIVATED with all authorization flags false.
 * 11. Catch / degradation path returns complete shape without undefined fields.
 */

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const readinessService = require('../src/api/services/printhouseReadinessService');

// Mock in-memory database store
const memoryStore = {
  tenants: [],
  printer_nodes: [],
  printhouse_machines: [],
  materials_catalog: [],
  printhouse_site_capacities: [],
  printhouse_site_lead_times: [],
  printhouse_shipping_regions: [],
  printhouse_integration_profiles: [],
  printhouse_price_books: []
};

// Intercept db.query to use memoryStore
const originalQuery = db.query;
db.query = async function mockQuery(sql, params = []) {
  const s = sql.trim();
  const upper = s.toUpperCase();

  // Tenant query
  if (upper.includes('FROM TENANTS WHERE ID = ?')) {
    const tenantId = params[0];
    const row = memoryStore.tenants.find(t => t.id === tenantId);
    return row ? [row] : [];
  }

  // Sites query
  if (upper.includes('FROM PRINTER_NODES WHERE TENANT_ID = ?')) {
    const tenantId = params[0];
    return memoryStore.printer_nodes.filter(n => n.tenant_id === tenantId && n.status !== 'DELETED');
  }

  // Machines count query
  if (upper.includes('FROM PRINTHOUSE_MACHINES WHERE TENANT_ID = ? AND STATUS != ?') && upper.includes('COUNT(*) AS CNT') && !upper.includes('SUPPORTS_')) {
    const [tenantId, status] = params;
    const cnt = memoryStore.printhouse_machines.filter(m => m.tenant_id === tenantId && m.status !== status).length;
    return [{ cnt }];
  }

  // Site machine group query
  if (upper.includes('FROM PRINTHOUSE_MACHINES WHERE TENANT_ID = ? AND STATUS != ? GROUP BY PRINTHOUSE_ID')) {
    const [tenantId, status] = params;
    const matching = memoryStore.printhouse_machines.filter(m => m.tenant_id === tenantId && m.status !== status);
    const groups = new Map();
    for (const m of matching) {
      groups.set(m.printhouse_id, (groups.get(m.printhouse_id) || 0) + 1);
    }
    return Array.from(groups.entries()).map(([phId, cnt]) => ({ printhouse_id: phId, cnt }));
  }

  // Capability count query
  if (upper.includes('FROM PRINTHOUSE_MACHINES') && upper.includes('SUPPORTS_')) {
    const [tenantId, status] = params;
    const cnt = memoryStore.printhouse_machines.filter(m => {
      if (m.tenant_id !== tenantId || m.status === status) return false;
      return m.supports_pdfx || m.supports_pdfa || m.supports_variable_data ||
             m.supports_white_ink || m.supports_spot_uv || m.supports_lamination ||
             m.supports_hardcover || m.supports_softcover || m.supports_saddle_stitch ||
             m.supports_perfect_binding || m.supports_case_binding ||
             m.supported_color_modes_json;
    }).length;
    return [{ cnt }];
  }

  // Materials count query
  if (upper.includes('FROM MATERIALS_CATALOG')) {
    const tenantId = params[0];
    const cnt = memoryStore.materials_catalog.filter(mat => {
      if (mat.tenant_id !== tenantId) return false;
      if (mat.metadata_json) {
        try {
          const meta = typeof mat.metadata_json === 'string' ? JSON.parse(mat.metadata_json) : mat.metadata_json;
          if (meta && meta.archived === true) return false;
        } catch (e) {}
      }
      return true;
    }).length;
    return [{ cnt }];
  }

  // Site capacities query
  if (upper.includes('FROM PRINTHOUSE_SITE_CAPACITIES')) {
    const tenantId = params[0];
    const cnt = memoryStore.printhouse_site_capacities.filter(c => c.tenant_id === tenantId).length;
    return [{ cnt }];
  }

  // Site lead times query
  if (upper.includes('FROM PRINTHOUSE_SITE_LEAD_TIMES')) {
    const tenantId = params[0];
    const cnt = memoryStore.printhouse_site_lead_times.filter(lt => lt.tenant_id === tenantId).length;
    return [{ cnt }];
  }

  // Shipping regions query
  if (upper.includes('FROM PRINTHOUSE_SHIPPING_REGIONS')) {
    const [tenantId, status] = params;
    const cnt = memoryStore.printhouse_shipping_regions.filter(s => s.tenant_id === tenantId && s.enabled === true && s.status === status).length;
    return [{ cnt }];
  }

  // Integration profiles query
  if (upper.includes('FROM PRINTHOUSE_INTEGRATION_PROFILES')) {
    const [tenantId, status] = params;
    const cnt = memoryStore.printhouse_integration_profiles.filter(i => i.tenant_id === tenantId && i.status !== status).length;
    return [{ cnt }];
  }

  // Price books query
  if (upper.includes('FROM PRINTHOUSE_PRICE_BOOKS')) {
    const tenantId = params[0];
    return memoryStore.printhouse_price_books.filter(pb => pb.tenant_id === tenantId);
  }

  return [];
};

function resetStore() {
  for (const k of Object.keys(memoryStore)) {
    memoryStore[k] = [];
  }
}

async function runTests() {
  console.log('=== Phase 192.1 — Printhouse Readiness Runtime Blocker Remediation Suite (RC13) ===\n');

  const tenantId = 'tenant-readiness-rc13';

  // Test 1: Zero configuration -> NOT_STARTED, 0/5
  resetStore();
  memoryStore.tenants.push({ id: tenantId, name: 'Ph-Configuring', type: 'PRINTHOUSE', status: 'ACTIVE', plan: 'STARTER', metadata_json: '{}' });

  const readiness0 = await readinessService.computeReadiness(tenantId);
  assert.ok(readiness0, 'computeReadiness must return a defined object');
  assert.ok(readiness0.operationalConfiguration, 'operationalConfiguration must be defined');
  assert.strictEqual(readiness0.operationalConfiguration.status, 'NOT_STARTED');
  assert.strictEqual(readiness0.operationalConfiguration.completedRequirements, 0);
  assert.strictEqual(readiness0.operationalConfiguration.totalRequirements, 5);
  assert.strictEqual(readiness0.operationalConfiguration.available, false);
  assert.strictEqual(readiness0.shippingReadiness.activeRegionsCount, 0);
  assert.strictEqual(readiness0.integrationReadiness.activeProfilesCount, 0);
  console.log('✓ Test 1: Zero configuration -> NOT_STARTED (0 / 5 requirements)');

  // Test 2: Partial configuration (1 requirement: Machine) -> IN_PROGRESS, 1/5
  memoryStore.printhouse_machines.push({
    id: 'mach-1',
    tenant_id: tenantId,
    printhouse_id: 'site-1',
    status: 'ACTIVE',
    supports_pdfx: 0
  });

  const readiness1 = await readinessService.computeReadiness(tenantId);
  assert.strictEqual(readiness1.operationalConfiguration.status, 'IN_PROGRESS');
  assert.strictEqual(readiness1.operationalConfiguration.completedRequirements, 1);
  assert.strictEqual(readiness1.operationalConfiguration.machineCount, 1);
  assert.strictEqual(readiness1.operationalConfiguration.capabilityCount, 0);
  console.log('✓ Test 2: Partial configuration (1 requirement) -> IN_PROGRESS (1 / 5 requirements)');

  // Test 3: Partial configuration (2 requirements: Machine + Capability) -> IN_PROGRESS, 2/5
  memoryStore.printhouse_machines[0].supports_pdfx = 1;

  const readiness2 = await readinessService.computeReadiness(tenantId);
  assert.strictEqual(readiness2.operationalConfiguration.status, 'IN_PROGRESS');
  assert.strictEqual(readiness2.operationalConfiguration.completedRequirements, 2);
  assert.strictEqual(readiness2.operationalConfiguration.capabilityCount, 1);
  console.log('✓ Test 3: Partial configuration (2 requirements) -> IN_PROGRESS (2 / 5 requirements)');

  // Test 4: Partial configuration (3 requirements: + Material) -> IN_PROGRESS, 3/5
  memoryStore.materials_catalog.push({
    id: 'mat-1',
    tenant_id: tenantId,
    metadata_json: JSON.stringify({ name: 'Silk 350g', archived: false })
  });

  const readiness3 = await readinessService.computeReadiness(tenantId);
  assert.strictEqual(readiness3.operationalConfiguration.status, 'IN_PROGRESS');
  assert.strictEqual(readiness3.operationalConfiguration.completedRequirements, 3);
  assert.strictEqual(readiness3.operationalConfiguration.materialCount, 1);
  console.log('✓ Test 4: Partial configuration (3 requirements) -> IN_PROGRESS (3 / 5 requirements)');

  // Test 5: Partial configuration (4 requirements: + Capacity) -> IN_PROGRESS, 4/5
  memoryStore.printhouse_site_capacities.push({
    id: 'cap-1',
    tenant_id: tenantId,
    site_id: 'site-1',
    daily_capacity: 1000
  });

  const readiness4 = await readinessService.computeReadiness(tenantId);
  assert.strictEqual(readiness4.operationalConfiguration.status, 'IN_PROGRESS');
  assert.strictEqual(readiness4.operationalConfiguration.completedRequirements, 4);
  assert.strictEqual(readiness4.operationalConfiguration.capacityCount, 1);
  console.log('✓ Test 5: Partial configuration (4 requirements) -> IN_PROGRESS (4 / 5 requirements)');

  // Test 6: All 5 requirements complete (+ Lead times) -> COMPLETE (READY), 5/5
  memoryStore.printhouse_site_lead_times.push({
    id: 'lt-1',
    tenant_id: tenantId,
    site_id: 'site-1',
    standard_lead_time_days: 2
  });

  const readiness5 = await readinessService.computeReadiness(tenantId);
  assert.strictEqual(readiness5.operationalConfiguration.status, 'COMPLETE');
  assert.strictEqual(readiness5.operationalConfiguration.completedRequirements, 5);
  assert.strictEqual(readiness5.operationalConfiguration.totalRequirements, 5);
  assert.strictEqual(readiness5.operationalConfiguration.blockingIssues.length, 0);
  assert.strictEqual(readiness5.operationalConfiguration.available, false);
  console.log('✓ Test 6: All 5 requirements complete -> COMPLETE/READY (5 / 5 requirements)');

  // Test 7: Shipping region filtering (ACTIVE + enabled vs ARCHIVED / disabled)
  memoryStore.printhouse_shipping_regions.push(
    { id: 'ship-1', tenant_id: tenantId, enabled: true, status: 'ACTIVE' },
    { id: 'ship-2', tenant_id: tenantId, enabled: false, status: 'ACTIVE' },
    { id: 'ship-3', tenant_id: tenantId, enabled: true, status: 'ARCHIVED' }
  );

  const readinessShip = await readinessService.computeReadiness(tenantId);
  assert.strictEqual(readinessShip.shippingReadiness.activeRegionsCount, 1, 'Only ACTIVE and enabled shipping regions count');
  assert.strictEqual(readinessShip.shippingReadiness.status, 'COMPLETE');
  assert.strictEqual(readinessShip.operationalConfiguration.completedRequirements, 5, 'Shipping does not alter 5/5 requirements');
  console.log('✓ Test 7: Shipping regions correctly filtered (ACTIVE+enabled counted, disabled/archived ignored, does not alter 5/5)');

  // Test 8: Integrations filtering (ACTIVE/CONFIGURED vs DISABLED)
  memoryStore.printhouse_integration_profiles.push(
    { id: 'int-1', tenant_id: tenantId, status: 'ACTIVE' },
    { id: 'int-2', tenant_id: tenantId, status: 'DISABLED' }
  );

  const readinessInt = await readinessService.computeReadiness(tenantId);
  assert.strictEqual(readinessInt.integrationReadiness.activeProfilesCount, 1, 'Only non-DISABLED integration profiles count');
  assert.strictEqual(readinessInt.integrationReadiness.status, 'CONFIGURED');
  assert.strictEqual(readinessInt.operationalConfiguration.completedRequirements, 5, 'Integrations remain optional and do not alter 5/5');
  console.log('✓ Test 8: Integrations correctly filtered (non-DISABLED counted, DISABLED ignored, optional for 5/5)');

  // Test 9: Activation readiness strictly fail-closed
  assert.strictEqual(readiness5.activationReadiness.status, 'NOT_ACTIVATED');
  assert.strictEqual(readiness5.activationReadiness.marketplaceVisible, false);
  assert.strictEqual(readiness5.activationReadiness.liveQuotingAllowed, false);
  assert.strictEqual(readiness5.activationReadiness.jobRoutingAllowed, false);
  assert.strictEqual(readiness5.activationReadiness.productionDispatchAllowed, false);
  console.log('✓ Test 9: Activation readiness strictly fail-closed (NOT_ACTIVATED, all flags false)');

  // Test 10: Fail-safe degradation on DB query failure returns complete shape without undefined fields
  const brokenQuery = db.query;
  db.query = async function() {
    throw new Error('SIMULATED_DB_ERROR');
  };

  const degraded = await readinessService._computeOperationalReadiness(tenantId, []);
  assert.ok(degraded, 'Degraded object must be defined');
  assert.strictEqual(degraded.status, 'NOT_AVAILABLE');
  assert.strictEqual(degraded.available, false);
  assert.strictEqual(degraded.shippingCount, 0);
  assert.strictEqual(degraded.integrationCount, 0);
  assert.strictEqual(degraded.completedRequirements, 0);
  assert.strictEqual(degraded.totalRequirements, 5);
  assert.ok(Array.isArray(degraded.blockingIssues));
  assert.ok(Array.isArray(degraded.advisories));
  console.log('✓ Test 10: Graceful degradation shape verified (all fields defined, zero undefined dereferences)');

  db.query = brokenQuery;

  console.log('\n================================================================');
  console.log('ALL PHASE 192.1 RC13 READINESS TESTS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n[FAIL] RC13 Readiness Test Failed:', err);
  process.exit(1);
});
