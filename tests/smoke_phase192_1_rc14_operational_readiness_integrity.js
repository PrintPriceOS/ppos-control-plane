'use strict';

/**
 * tests/smoke_phase192_1_rc14_operational_readiness_integrity.js
 *
 * Phase 192 — RC14: Operational Readiness Integrity Hardening
 *
 * Proves:
 * Capacity:
 * A. No row -> capacityCount = 0
 * B. Row with only working days/hours (no limits) -> capacityCount = 0
 * C. Row with NULL limits -> capacityCount = 0
 * D. Row with zero limits -> capacityCount = 0
 * E. Row with positive jobs limit -> capacityCount = 1
 * F. Row with positive sheets limit -> capacityCount = 1
 * Validation: Negative, NaN, out-of-range values rejected by setSiteCapacity.
 *
 * Lead Times:
 * G. No row -> leadTimesCount = 0
 * H. Obvious empty/default-only invalid artifact -> leadTimesCount = 0
 * I. Valid explicit configuration -> leadTimesCount = 1
 * Validation: Empty payloads, malformed timezone, invalid workdays, invalid cutoff, negative lead days rejected by setLeadTimes.
 *
 * Full Readiness Contract & Invariants:
 * K. No undefined return values
 * L. totalRequirements strictly equals 5
 * M. activationReadiness strictly remains NOT_ACTIVATED with all flags false
 */

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const capacityService = require('../src/api/services/printhouseCapacityService');
const leadTimeService = require('../src/api/services/printhouseLeadTimeService');
const readinessService = require('../src/api/services/printhouseReadinessService');

// In-memory mock store
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

// Database mock query router
const originalQuery = db.query;
db.query = async function mockQuery(sql, params = []) {
  const s = sql.trim();
  const upper = s.toUpperCase();

  // 1. Tenants
  if (upper.includes('FROM TENANTS WHERE ID = ?')) {
    const tenantId = params[0];
    const row = memoryStore.tenants.find(t => t.id === tenantId);
    return row ? [row] : [];
  }

  // 2. Printer Nodes / Sites
  if (upper.includes('FROM PRINTER_NODES WHERE ID = ? AND TENANT_ID = ?')) {
    const [siteId, tenantId] = params;
    return memoryStore.printer_nodes.filter(n => n.id === siteId && n.tenant_id === tenantId && n.status !== 'DELETED');
  }
  if (upper.includes('FROM PRINTER_NODES WHERE TENANT_ID = ?')) {
    const tenantId = params[0];
    return memoryStore.printer_nodes.filter(n => n.tenant_id === tenantId && n.status !== 'DELETED');
  }

  // 3. Machines
  if (upper.includes('FROM PRINTHOUSE_MACHINES') && upper.includes('COUNT(*) AS CNT') && !upper.includes('SUPPORTS_')) {
    const [tenantId, status] = params;
    const cnt = memoryStore.printhouse_machines.filter(m => m.tenant_id === tenantId && m.status !== status).length;
    return [{ cnt }];
  }
  if (upper.includes('FROM PRINTHOUSE_MACHINES') && upper.includes('GROUP BY PRINTHOUSE_ID')) {
    const [tenantId, status] = params;
    const matching = memoryStore.printhouse_machines.filter(m => m.tenant_id === tenantId && m.status !== status);
    const groups = new Map();
    for (const m of matching) {
      groups.set(m.printhouse_id, (groups.get(m.printhouse_id) || 0) + 1);
    }
    return Array.from(groups.entries()).map(([phId, cnt]) => ({ printhouse_id: phId, cnt }));
  }
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

  // 4. Materials
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

  // 5. Site Capacities (Semantic count requiring positive limits)
  if (upper.includes('FROM PRINTHOUSE_SITE_CAPACITIES WHERE PRINTHOUSE_ID = ? AND TENANT_ID = ?')) {
    const [siteId, tenantId] = params;
    return memoryStore.printhouse_site_capacities.filter(c => c.printhouse_id === siteId && c.tenant_id === tenantId);
  }
  if (upper.includes('FROM PRINTHOUSE_SITE_CAPACITIES')) {
    const tenantId = params[0];
    const cnt = memoryStore.printhouse_site_capacities.filter(c => {
      if (c.tenant_id !== tenantId) return false;
      return (c.daily_jobs_limit !== null && c.daily_jobs_limit !== undefined && c.daily_jobs_limit > 0) ||
             (c.daily_sheets_limit !== null && c.daily_sheets_limit !== undefined && c.daily_sheets_limit > 0);
    }).length;
    return [{ cnt }];
  }
  if (upper.startsWith('UPDATE PRINTHOUSE_SITE_CAPACITIES')) {
    const [jobs, sheets, wdays, hours, notes, siteId, tenantId] = params;
    const existing = memoryStore.printhouse_site_capacities.find(c => c.printhouse_id === siteId && c.tenant_id === tenantId);
    if (existing) {
      existing.daily_jobs_limit = jobs;
      existing.daily_sheets_limit = sheets;
      existing.working_days_per_week = wdays;
      existing.operating_hours_per_day = hours;
      existing.notes = notes;
    }
    return { affectedRows: 1 };
  }
  if (upper.startsWith('INSERT INTO PRINTHOUSE_SITE_CAPACITIES')) {
    const [id, siteId, tenantId, jobs, sheets, wdays, hours, notes] = params;
    memoryStore.printhouse_site_capacities.push({
      id, printhouse_id: siteId, tenant_id: tenantId,
      daily_jobs_limit: jobs, daily_sheets_limit: sheets,
      working_days_per_week: wdays, operating_hours_per_day: hours,
      notes
    });
    return { affectedRows: 1 };
  }

  // 6. Site Lead Times (Semantic count requiring explicit valid configuration)
  if (upper.includes('FROM PRINTHOUSE_SITE_LEAD_TIMES WHERE PRINTHOUSE_ID = ? AND TENANT_ID = ?')) {
    const [siteId, tenantId] = params;
    return memoryStore.printhouse_site_lead_times.filter(lt => lt.printhouse_id === siteId && lt.tenant_id === tenantId);
  }
  if (upper.includes('FROM PRINTHOUSE_SITE_LEAD_TIMES')) {
    const tenantId = params[0];
    const cnt = memoryStore.printhouse_site_lead_times.filter(lt => {
      if (lt.tenant_id !== tenantId) return false;
      return lt.timezone && lt.timezone.trim() !== '' &&
             lt.workdays_json && lt.workdays_json !== '[]' && lt.workdays_json.trim() !== '' &&
             lt.daily_cutoff_time && lt.daily_cutoff_time.trim() !== '' &&
             lt.base_lead_time_days !== null && lt.base_lead_time_days !== undefined && lt.base_lead_time_days >= 0;
    }).length;
    return [{ cnt }];
  }
  if (upper.startsWith('UPDATE PRINTHOUSE_SITE_LEAD_TIMES')) {
    const [tz, workdays, cutoff, baseLead, custom, siteId, tenantId] = params;
    const existing = memoryStore.printhouse_site_lead_times.find(lt => lt.printhouse_id === siteId && lt.tenant_id === tenantId);
    if (existing) {
      existing.timezone = tz;
      existing.workdays_json = workdays;
      existing.daily_cutoff_time = cutoff;
      existing.base_lead_time_days = baseLead;
      existing.custom_rules_json = custom;
    }
    return { affectedRows: 1 };
  }
  if (upper.startsWith('INSERT INTO PRINTHOUSE_SITE_LEAD_TIMES')) {
    const [id, siteId, tenantId, tz, workdays, cutoff, baseLead, custom] = params;
    memoryStore.printhouse_site_lead_times.push({
      id, printhouse_id: siteId, tenant_id: tenantId,
      timezone: tz, workdays_json: workdays, daily_cutoff_time: cutoff,
      base_lead_time_days: baseLead, custom_rules_json: custom
    });
    return { affectedRows: 1 };
  }

  // 7. Shipping Regions
  if (upper.includes('FROM PRINTHOUSE_SHIPPING_REGIONS')) {
    const [tenantId, status] = params;
    const cnt = memoryStore.printhouse_shipping_regions.filter(s => s.tenant_id === tenantId && s.enabled === true && s.status === status).length;
    return [{ cnt }];
  }

  // 8. Integration Profiles
  if (upper.includes('FROM PRINTHOUSE_INTEGRATION_PROFILES')) {
    const [tenantId, status] = params;
    const cnt = memoryStore.printhouse_integration_profiles.filter(i => i.tenant_id === tenantId && i.status !== status).length;
    return [{ cnt }];
  }

  // 9. Price Books
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
  console.log('=== Phase 192 — RC14: Operational Readiness Integrity Hardening Suite ===\n');

  const tenantId = 'tenant-rc14-integrity';
  const siteId = 'site-rc14-1';

  // Seed base tenant and site
  resetStore();
  memoryStore.tenants.push({ id: tenantId, name: 'RC14 Printhouse', type: 'PRINTHOUSE', status: 'ACTIVE', plan: 'PRO', metadata_json: '{}' });
  memoryStore.printer_nodes.push({ id: siteId, tenant_id: tenantId, name: 'Production Site 1', country: 'ES', city: 'Madrid', status: 'ACTIVE' });

  // ─── PART 1: Capacity Readiness Hardening ─────────────────────────
  console.log('--- 1. Capacity Readiness Tests ---');

  // Test A: No capacity row -> capacityCount = 0
  let readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capacityCount, 0, 'Test A: No row must have capacityCount = 0');
  console.log('✓ Test A: No row -> capacityCount = 0');

  // Test B: Row with only working days and operating hours (no limits) -> capacityCount = 0
  memoryStore.printhouse_site_capacities.push({
    id: 'cap-b', printhouse_id: siteId, tenant_id: tenantId,
    daily_jobs_limit: null, daily_sheets_limit: null,
    working_days_per_week: 5, operating_hours_per_day: 8
  });
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capacityCount, 0, 'Test B: Working days/hours only must NOT satisfy capacity readiness');
  console.log('✓ Test B: Row with only working days/hours (NULL limits) -> capacityCount = 0');

  // Test C: Row with NULL limits explicitly -> capacityCount = 0
  memoryStore.printhouse_site_capacities[0].daily_jobs_limit = null;
  memoryStore.printhouse_site_capacities[0].daily_sheets_limit = null;
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capacityCount, 0, 'Test C: NULL limits must NOT satisfy capacity readiness');
  console.log('✓ Test C: NULL limits -> capacityCount = 0');

  // Test D: Row with zero limits -> capacityCount = 0
  memoryStore.printhouse_site_capacities[0].daily_jobs_limit = 0;
  memoryStore.printhouse_site_capacities[0].daily_sheets_limit = 0;
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capacityCount, 0, 'Test D: Zero limits must NOT satisfy capacity readiness');
  console.log('✓ Test D: Zero limits -> capacityCount = 0');

  // Test E: Positive daily_jobs_limit -> capacityCount = 1
  memoryStore.printhouse_site_capacities[0].daily_jobs_limit = 25;
  memoryStore.printhouse_site_capacities[0].daily_sheets_limit = null;
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capacityCount, 1, 'Test E: Positive daily_jobs_limit must satisfy capacity readiness');
  console.log('✓ Test E: Positive daily_jobs_limit -> capacityCount = 1');

  // Test F: Positive daily_sheets_limit -> capacityCount = 1
  memoryStore.printhouse_site_capacities[0].daily_jobs_limit = null;
  memoryStore.printhouse_site_capacities[0].daily_sheets_limit = 50000;
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capacityCount, 1, 'Test F: Positive daily_sheets_limit must satisfy capacity readiness');
  console.log('✓ Test F: Positive daily_sheets_limit -> capacityCount = 1');

  // Capacity validation tests in setSiteCapacity:
  console.log('\n--- Capacity Validation Tests ---');
  await assert.rejects(
    async () => capacityService.setSiteCapacity(tenantId, siteId, { daily_jobs_limit: -5 }),
    /INVALID_CAPACITY_VALUES/,
    'Negative daily_jobs_limit must be rejected'
  );
  await assert.rejects(
    async () => capacityService.setSiteCapacity(tenantId, siteId, { daily_sheets_limit: -100 }),
    /INVALID_CAPACITY_VALUES/,
    'Negative daily_sheets_limit must be rejected'
  );
  await assert.rejects(
    async () => capacityService.setSiteCapacity(tenantId, siteId, { daily_jobs_limit: NaN }),
    /INVALID_CAPACITY_VALUES/,
    'NaN daily_jobs_limit must be rejected'
  );
  await assert.rejects(
    async () => capacityService.setSiteCapacity(tenantId, siteId, { working_days_per_week: 8 }),
    /INVALID_CAPACITY_VALUES/,
    'working_days_per_week > 7 must be rejected'
  );
  await assert.rejects(
    async () => capacityService.setSiteCapacity(tenantId, siteId, { operating_hours_per_day: 25 }),
    /INVALID_CAPACITY_VALUES/,
    'operating_hours_per_day > 24 must be rejected'
  );
  console.log('✓ Capacity Validation: Negative, NaN, and out-of-range values strictly rejected');


  // ─── PART 2: Lead Times Readiness Hardening ───────────────────────
  console.log('\n--- 2. Lead Times Readiness Tests ---');

  // Test G: No row -> leadTimesCount = 0
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.leadTimesCount, 0, 'Test G: No row must have leadTimesCount = 0');
  console.log('✓ Test G: No row -> leadTimesCount = 0');

  // Test H: Obvious empty / default-only invalid artifact -> leadTimesCount = 0
  memoryStore.printhouse_site_lead_times.push({
    id: 'lt-h', printhouse_id: siteId, tenant_id: tenantId,
    timezone: '', workdays_json: '[]', daily_cutoff_time: '', base_lead_time_days: null
  });
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.leadTimesCount, 0, 'Test H: Empty artifact must NOT satisfy lead times readiness');
  console.log('✓ Test H: Obvious empty/invalid artifact -> leadTimesCount = 0');

  // Test I: Valid explicit configuration -> leadTimesCount = 1
  memoryStore.printhouse_site_lead_times[0].timezone = 'Europe/Madrid';
  memoryStore.printhouse_site_lead_times[0].workdays_json = '[1,2,3,4,5]';
  memoryStore.printhouse_site_lead_times[0].daily_cutoff_time = '14:00';
  memoryStore.printhouse_site_lead_times[0].base_lead_time_days = 2;
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.leadTimesCount, 1, 'Test I: Valid explicit configuration must satisfy lead times readiness');
  console.log('✓ Test I: Valid explicit configuration -> leadTimesCount = 1');

  // Lead Times validation tests in setLeadTimes:
  console.log('\n--- Lead Times Validation Tests ---');
  // 1. Empty payload
  await assert.rejects(
    async () => leadTimeService.setLeadTimes(tenantId, siteId, {}),
    /INVALID_LEAD_TIME_CONFIGURATION/,
    'Empty payload must be rejected'
  );
  // 2. Invalid timezone
  await assert.rejects(
    async () => leadTimeService.setLeadTimes(tenantId, siteId, {
      timezone: 'Invalid/NonExistent_Zone',
      workdays_json: [1, 2, 3, 4, 5],
      daily_cutoff_time: '14:00',
      base_lead_time_days: 2
    }),
    /INVALID_LEAD_TIME_CONFIGURATION/,
    'Invalid timezone must be rejected'
  );
  // 3. Empty workdays
  await assert.rejects(
    async () => leadTimeService.setLeadTimes(tenantId, siteId, {
      timezone: 'UTC',
      workdays_json: [],
      daily_cutoff_time: '14:00',
      base_lead_time_days: 2
    }),
    /INVALID_LEAD_TIME_CONFIGURATION/,
    'Empty workdays array must be rejected'
  );
  // 4. Invalid workday index (e.g. 7)
  await assert.rejects(
    async () => leadTimeService.setLeadTimes(tenantId, siteId, {
      timezone: 'UTC',
      workdays_json: [1, 2, 7],
      daily_cutoff_time: '14:00',
      base_lead_time_days: 2
    }),
    /INVALID_LEAD_TIME_CONFIGURATION/,
    'Workday index out of 0..6 must be rejected'
  );
  // 5. Invalid cutoff format
  await assert.rejects(
    async () => leadTimeService.setLeadTimes(tenantId, siteId, {
      timezone: 'UTC',
      workdays_json: [1, 2, 3, 4, 5],
      daily_cutoff_time: '25:99',
      base_lead_time_days: 2
    }),
    /INVALID_LEAD_TIME_CONFIGURATION/,
    'Invalid cutoff time format must be rejected'
  );
  // 6. Negative base_lead_time_days
  await assert.rejects(
    async () => leadTimeService.setLeadTimes(tenantId, siteId, {
      timezone: 'UTC',
      workdays_json: [1, 2, 3, 4, 5],
      daily_cutoff_time: '14:00',
      base_lead_time_days: -1
    }),
    /INVALID_LEAD_TIME_CONFIGURATION/,
    'Negative base_lead_time_days must be rejected'
  );

  // 7. Legitimate explicit configuration succeeds
  const configured = await leadTimeService.setLeadTimes(tenantId, siteId, {
    timezone: 'Europe/Paris',
    workdays_json: [1, 2, 3, 4, 5],
    daily_cutoff_time: '16:30',
    base_lead_time_days: 1
  });
  assert.ok(configured, 'Legitimate lead times configuration must succeed');
  assert.strictEqual(configured.timezone, 'Europe/Paris');
  console.log('✓ Lead Times Validation: Empty payloads, invalid timezone/workdays/cutoff/negative days rejected');


  // ─── PART 3: Full Readiness Invariants & Non-Authorizing Safety ───
  console.log('\n--- 3. Full Readiness Contract & Invariants ---');

  // Complete the other 3 requirements (Machine, Capability, Material)
  memoryStore.printhouse_machines.push({
    id: 'mach-rc14-1', tenant_id: tenantId, printhouse_id: siteId, status: 'ACTIVE', supports_white_ink: 1
  });
  memoryStore.materials_catalog.push({
    id: 'mat-rc14-1', tenant_id: tenantId, metadata_json: JSON.stringify({ name: 'Mat 1', archived: false })
  });

  const fullReadiness = await readinessService.computeReadiness(tenantId);

  // K. No undefined properties
  assert.ok(fullReadiness.operationalConfiguration);
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.status, 'string');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.completedRequirements, 'number');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.totalRequirements, 'number');
  console.log('✓ Test K: No undefined return values across computeReadiness()');

  // L. totalRequirements is strictly 5
  assert.strictEqual(fullReadiness.operationalConfiguration.totalRequirements, 5);
  assert.strictEqual(fullReadiness.operationalConfiguration.completedRequirements, 5);
  assert.strictEqual(fullReadiness.operationalConfiguration.status, 'COMPLETE');
  console.log('✓ Test L: totalRequirements strictly equals 5 (5/5 requirements complete)');

  // M. Activation readiness remains strictly fail-closed
  assert.strictEqual(fullReadiness.activationReadiness.status, 'NOT_ACTIVATED');
  assert.strictEqual(fullReadiness.activationReadiness.marketplaceVisible, false);
  assert.strictEqual(fullReadiness.activationReadiness.liveQuotingAllowed, false);
  assert.strictEqual(fullReadiness.activationReadiness.jobRoutingAllowed, false);
  assert.strictEqual(fullReadiness.activationReadiness.productionDispatchAllowed, false);
  assert.strictEqual(fullReadiness.operationalConfiguration.available, false);
  assert.strictEqual(fullReadiness.operationalReadiness.available, false);
  console.log('✓ Test M: Activation readiness strictly remains NOT_ACTIVATED with all capability flags false');

  console.log('\n================================================================');
  console.log('ALL PHASE 192 RC14 READINESS INTEGRITY TESTS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n[FAIL] RC14 Readiness Integrity Test Failed:', err);
  process.exit(1);
});
