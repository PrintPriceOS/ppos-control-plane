'use strict';

/**
 * tests/smoke_phase192_1_rc15_material_readiness_integrity.js
 *
 * Phase 192 — RC15: Material Readiness Integrity Hardening
 *
 * Covers:
 * M1. no material row -> materialCount 0
 * M2. legacy default-generated material WITHOUT explicit provenance:
 *     New Substrate / PAPER / STANDARD / NULL / SRA3 / UNCOATED / Generic Supplier / ES
 *     -> materialCount 0
 * M3. legacy non-default-looking material WITHOUT explicit provenance
 *     -> materialCount 0 (proves provenance-based logic)
 * M4. empty create payload rejected
 * M5. whitespace-only material_name rejected
 * M6. invalid material_type rejected
 * M7. invalid substrate_class rejected
 * M8. invalid sheet_format rejected
 * M9. invalid finish_type rejected
 * M10. invalid GSM rejected (negative, zero, NaN, string)
 * M11. valid explicit material creation persists EXPLICIT_ONBOARDING provenance
 * M12. explicitly configured valid material -> materialCount 1
 * M13. archived explicit material -> materialCount 0
 * M14. legacy material explicitly re-saved with complete valid configuration -> provenance added and materialCount 1
 * M15. no undefined values in computeReadiness()
 * M16. totalRequirements strictly equals 5
 * M17. activation remains fail-closed (NOT_ACTIVATED, all flags false)
 */

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const materialService = require('../src/api/services/printhouseMaterialService');
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
  if (upper.includes('FROM PRINTHOUSE_MACHINES') && !upper.includes('COUNT(*)') && !upper.includes('GROUP BY')) {
    const [tenantId, status] = params;
    return memoryStore.printhouse_machines.filter(m => m.tenant_id === tenantId && m.status !== status);
  }

  // 4. Materials
  if (upper.includes('FROM MATERIALS_CATALOG') && upper.includes('WHERE ID = ?')) {
    const [matId, tenantId, siteId] = params;
    return memoryStore.materials_catalog.filter(m => m.id === matId && m.tenant_id === tenantId);
  }
  if (upper.includes('FROM MATERIALS_CATALOG') && upper.includes('PRINTHOUSE_ID = ? OR PRINTHOUSE_ID IS NULL') && !upper.includes('WHERE ID = ?')) {
    const [tenantId, siteId] = params;
    return memoryStore.materials_catalog.filter(m => {
      if (m.tenant_id !== tenantId) return false;
      if (m.metadata_json) {
        try {
          const meta = typeof m.metadata_json === 'string' ? JSON.parse(m.metadata_json) : m.metadata_json;
          if (meta && meta.archived === true) return false;
        } catch (e) {}
      }
      return true;
    });
  }
  if (upper.includes('FROM MATERIALS_CATALOG') && upper.includes('COUNT(*)')) {
    const tenantId = params[0];
    const cnt = memoryStore.materials_catalog.filter(mat => {
      if (mat.tenant_id !== tenantId) return false;
      let meta = {};
      if (mat.metadata_json) {
        try {
          meta = typeof mat.metadata_json === 'string' ? JSON.parse(mat.metadata_json) : mat.metadata_json;
          if (meta && meta.archived === true) return false;
        } catch (e) {}
      }
      return mat.material_name && mat.material_name.trim() !== '' &&
             mat.material_type && mat.material_type.trim() !== '' &&
             mat.substrate_class && mat.substrate_class.trim() !== '' &&
             mat.sheet_format && mat.sheet_format.trim() !== '' &&
             mat.finish_type && mat.finish_type.trim() !== '' &&
             (mat.gsm === null || mat.gsm === undefined || mat.gsm > 0) &&
             meta && meta.configuration_source === 'EXPLICIT_ONBOARDING';
    }).length;
    return [{ cnt }];
  }
  if (upper.startsWith('INSERT INTO MATERIALS_CATALOG')) {
    const [id, tenantId, siteId, name, type, subClass, gsm, format, finish, suppName, suppCountry, meta] = params;
    memoryStore.materials_catalog.push({
      id, tenant_id: tenantId, printhouse_id: siteId,
      material_name: name, material_type: type, substrate_class: subClass,
      gsm, sheet_format: format, finish_type: finish,
      supplier_name: suppName, supplier_country: suppCountry,
      metadata_json: meta
    });
    return { affectedRows: 1 };
  }
  if (upper.startsWith('UPDATE MATERIALS_CATALOG')) {
    if (upper.includes('SET METADATA_JSON = ?')) {
      const [meta, id, tenantId, siteId] = params;
      const existing = memoryStore.materials_catalog.find(m => m.id === id && m.tenant_id === tenantId);
      if (existing) {
        existing.metadata_json = meta;
      }
      return { affectedRows: 1 };
    } else {
      const [name, type, subClass, gsm, format, finish, suppName, suppCountry, meta, id, tenantId, siteId] = params;
      const existing = memoryStore.materials_catalog.find(m => m.id === id && m.tenant_id === tenantId);
      if (existing) {
        existing.material_name = name;
        existing.material_type = type;
        existing.substrate_class = subClass;
        existing.gsm = gsm;
        existing.sheet_format = format;
        existing.finish_type = finish;
        existing.supplier_name = suppName;
        existing.supplier_country = suppCountry;
        existing.metadata_json = meta;
      }
      return { affectedRows: 1 };
    }
  }

  // 5. Site Capacities
  if (upper.includes('FROM PRINTHOUSE_SITE_CAPACITIES')) {
    const tenantId = params[0];
    const cnt = memoryStore.printhouse_site_capacities.filter(c => {
      if (c.tenant_id !== tenantId) return false;
      return (c.daily_jobs_limit !== null && c.daily_jobs_limit !== undefined && c.daily_jobs_limit > 0) ||
             (c.daily_sheets_limit !== null && c.daily_sheets_limit !== undefined && c.daily_sheets_limit > 0);
    }).length;
    return [{ cnt }];
  }

  // 6. Site Lead Times
  if (upper.includes('FROM PRINTHOUSE_SITE_LEAD_TIMES')) {
    const tenantId = params[0];
    const cnt = memoryStore.printhouse_site_lead_times.filter(lt => {
      if (lt.tenant_id !== tenantId) return false;
      let isExplicit = false;
      if (lt.custom_rules_json) {
        try {
          const parsed = typeof lt.custom_rules_json === 'string' ? JSON.parse(lt.custom_rules_json) : lt.custom_rules_json;
          isExplicit = parsed && parsed.configuration_source === 'EXPLICIT_ONBOARDING';
        } catch (e) {}
      }
      return lt.timezone && lt.timezone.trim() !== '' &&
             lt.workdays_json && lt.workdays_json !== '[]' && lt.workdays_json.trim() !== '' &&
             lt.daily_cutoff_time && lt.daily_cutoff_time.trim() !== '' &&
             lt.base_lead_time_days !== null && lt.base_lead_time_days !== undefined && lt.base_lead_time_days >= 0 &&
             isExplicit;
    }).length;
    return [{ cnt }];
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
  console.log('=== Phase 192 — RC15: Material Readiness Integrity Hardening Suite ===\n');

  const tenantId = 'tenant-rc15-mat';
  const siteId = 'site-rc15-1';

  // Seed base tenant and site
  resetStore();
  memoryStore.tenants.push({ id: tenantId, name: 'RC15 Printhouse', type: 'PRINTHOUSE', status: 'ACTIVE', plan: 'PRO', metadata_json: '{}' });
  memoryStore.printer_nodes.push({ id: siteId, tenant_id: tenantId, name: 'Production Site 1', country: 'ES', city: 'Madrid', status: 'ACTIVE' });

  // ─── PART 1: Material Readiness Hardening (M1 - M14) ─────────────
  console.log('--- 1. Material Readiness & Provenance Tests (M1 - M14) ---');

  // M1: No material row -> materialCount = 0
  let readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.materialCount, 0, 'M1: No row must have materialCount = 0');
  console.log('✓ Test M1: No material row -> materialCount = 0');

  // M2: Legacy default-generated material WITHOUT explicit provenance -> materialCount = 0
  memoryStore.materials_catalog.push({
    id: 'mat-legacy-default',
    tenant_id: tenantId,
    printhouse_id: siteId,
    material_name: 'New Substrate',
    material_type: 'PAPER',
    substrate_class: 'STANDARD',
    gsm: null,
    sheet_format: 'SRA3',
    finish_type: 'UNCOATED',
    supplier_name: 'Generic Supplier',
    supplier_country: 'ES',
    metadata_json: null
  });
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.materialCount, 0, 'M2: Legacy default material without provenance must NOT satisfy readiness');
  console.log('✓ Test M2: Legacy default-generated material WITHOUT explicit provenance -> materialCount = 0');

  // M3: Legacy non-default-looking material WITHOUT explicit provenance -> materialCount = 0
  // (proves provenance-based logic, not value-blacklisting)
  memoryStore.materials_catalog[0].id = 'mat-legacy-custom';
  memoryStore.materials_catalog[0].material_name = 'Fedrigoni Tintoretto';
  memoryStore.materials_catalog[0].material_type = 'PAPER';
  memoryStore.materials_catalog[0].substrate_class = 'PREMIUM';
  memoryStore.materials_catalog[0].gsm = 250;
  memoryStore.materials_catalog[0].sheet_format = '700x1000';
  memoryStore.materials_catalog[0].finish_type = 'UNCOATED';
  memoryStore.materials_catalog[0].supplier_name = 'Fedrigoni';
  memoryStore.materials_catalog[0].supplier_country = 'IT';
  memoryStore.materials_catalog[0].metadata_json = JSON.stringify({ old_notes: 'imported' });
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.materialCount, 0, 'M3: Legacy custom material without provenance must NOT satisfy readiness');
  console.log('✓ Test M3: Legacy non-default material WITHOUT explicit provenance -> materialCount = 0 (proves provenance-based logic)');

  // M4: Empty create payload rejected
  console.log('\n--- Material Creation Validation Tests (M4 - M10) ---');
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {}),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M4: Empty create payload must be rejected'
  );
  console.log('✓ Test M4: Empty create payload rejected with INVALID_MATERIAL_CONFIGURATION');

  // M5: Whitespace-only material_name rejected
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {
      material_name: '   ',
      material_type: 'PAPER',
      substrate_class: 'STANDARD',
      sheet_format: 'SRA3',
      finish_type: 'UNCOATED'
    }),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M5: Whitespace-only material_name must be rejected'
  );
  console.log('✓ Test M5: Whitespace-only material_name rejected');

  // M6: Invalid material_type rejected
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {
      material_name: 'Gloss 130g',
      material_type: 'PLASTIC_SYNTHETIC_UNKNOWN',
      substrate_class: 'STANDARD',
      sheet_format: 'SRA3',
      finish_type: 'GLOSS'
    }),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M6: Invalid material_type must be rejected'
  );
  console.log('✓ Test M6: Invalid material_type rejected');

  // M7: Invalid substrate_class rejected
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {
      material_name: 'Gloss 130g',
      material_type: 'PAPER',
      substrate_class: '',
      sheet_format: 'SRA3',
      finish_type: 'GLOSS'
    }),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M7: Empty substrate_class must be rejected'
  );
  console.log('✓ Test M7: Invalid substrate_class rejected');

  // M8: Invalid sheet_format rejected
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {
      material_name: 'Gloss 130g',
      material_type: 'PAPER',
      substrate_class: 'STANDARD',
      sheet_format: '   ',
      finish_type: 'GLOSS'
    }),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M8: Empty sheet_format must be rejected'
  );
  console.log('✓ Test M8: Invalid sheet_format rejected');

  // M9: Invalid finish_type rejected
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {
      material_name: 'Gloss 130g',
      material_type: 'PAPER',
      substrate_class: 'STANDARD',
      sheet_format: 'SRA3',
      finish_type: ''
    }),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M9: Empty finish_type must be rejected'
  );
  console.log('✓ Test M9: Invalid finish_type rejected');

  // M10: Invalid GSM rejected
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {
      material_name: 'Gloss 130g',
      material_type: 'PAPER',
      substrate_class: 'STANDARD',
      sheet_format: 'SRA3',
      finish_type: 'GLOSS',
      gsm: -10
    }),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M10: Negative GSM must be rejected'
  );
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {
      material_name: 'Gloss 130g',
      material_type: 'PAPER',
      substrate_class: 'STANDARD',
      sheet_format: 'SRA3',
      finish_type: 'GLOSS',
      gsm: 0
    }),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M10: Zero GSM must be rejected'
  );
  await assert.rejects(
    async () => materialService.createMaterial(tenantId, siteId, {
      material_name: 'Gloss 130g',
      material_type: 'PAPER',
      substrate_class: 'STANDARD',
      sheet_format: 'SRA3',
      finish_type: 'GLOSS',
      gsm: NaN
    }),
    /INVALID_MATERIAL_CONFIGURATION/,
    'M10: NaN GSM must be rejected'
  );
  console.log('✓ Test M10: Invalid GSM (negative, zero, NaN) strictly rejected');

  // M11: Valid explicit material creation persists EXPLICIT_ONBOARDING provenance
  console.log('\n--- Material Explicit Configuration & Lifecycle Tests (M11 - M14) ---');
  // Clear legacy fixture
  memoryStore.materials_catalog = [];
  const created = await materialService.createMaterial(tenantId, siteId, {
    material_name: 'Magno Satin 300g',
    material_type: 'PAPER',
    substrate_class: 'COATED',
    gsm: 300,
    sheet_format: 'SRA3',
    finish_type: 'SATIN',
    supplier_name: 'Sappi Europe',
    supplier_country: 'BE'
  });
  assert.ok(created, 'Material creation must succeed');
  assert.strictEqual(created.material_name, 'Magno Satin 300g');
  const meta = typeof created.metadata_json === 'string' ? JSON.parse(created.metadata_json) : created.metadata_json;
  assert.strictEqual(meta.configuration_source, 'EXPLICIT_ONBOARDING');
  console.log('✓ Test M11: Valid explicit material creation persists EXPLICIT_ONBOARDING provenance');

  // M12: Explicitly configured valid material -> materialCount = 1
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.materialCount, 1, 'M12: Explicitly configured material must yield materialCount = 1');
  console.log('✓ Test M12: Explicitly configured valid material -> materialCount = 1');

  // M13: Archived explicit material -> materialCount = 0
  await materialService.archiveMaterial(tenantId, siteId, created.id);
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.materialCount, 0, 'M13: Archived material must yield materialCount = 0');
  console.log('✓ Test M13: Archived explicit material -> materialCount = 0');

  // M14: Legacy material explicitly re-saved with complete valid configuration -> provenance added and materialCount = 1
  memoryStore.materials_catalog.push({
    id: 'mat-legacy-to-resave',
    tenant_id: tenantId,
    printhouse_id: siteId,
    material_name: 'Legacy Unconfirmed',
    material_type: 'PAPER',
    substrate_class: 'STANDARD',
    gsm: 100,
    sheet_format: 'A4',
    finish_type: 'MATT',
    supplier_name: 'Old Supplier',
    supplier_country: 'FR',
    metadata_json: null
  });
  // Verify it is not ready yet
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.materialCount, 0, 'Legacy material before re-save must be count 0');

  // Explicit re-save via updateMaterial
  const updated = await materialService.updateMaterial(tenantId, siteId, 'mat-legacy-to-resave', {
    material_name: 'Confirmed Brand Paper 120g',
    gsm: 120
  });
  const updatedMeta = typeof updated.metadata_json === 'string' ? JSON.parse(updated.metadata_json) : updated.metadata_json;
  assert.strictEqual(updatedMeta.configuration_source, 'EXPLICIT_ONBOARDING');
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.materialCount, 1, 'M14: Re-saved legacy material must yield materialCount = 1');
  console.log('✓ Test M14: Legacy material explicitly re-saved with complete valid configuration -> provenance added and materialCount = 1');


  // ─── PART 2: Full 5/5 Operational Readiness Invariants ───────────
  console.log('\n--- 2. Full Readiness Contract & Invariants (M15 - M17) ---');

  // Complete the other 4 requirements:
  // 1. Machine + Capability
  memoryStore.printhouse_machines.push({
    id: 'mach-rc15-1', tenant_id: tenantId, printhouse_id: siteId, status: 'ACTIVE', supports_pdfx: 1
  });
  // 2. Capacity
  memoryStore.printhouse_site_capacities.push({
    id: 'cap-rc15-1', tenant_id: tenantId, printhouse_id: siteId, daily_jobs_limit: 50, daily_sheets_limit: 10000
  });
  // 3. Lead Times
  memoryStore.printhouse_site_lead_times.push({
    id: 'lt-rc15-1', tenant_id: tenantId, printhouse_id: siteId,
    timezone: 'Europe/Madrid', workdays_json: '[1,2,3,4,5]', daily_cutoff_time: '14:00',
    base_lead_time_days: 2,
    custom_rules_json: JSON.stringify({ configuration_source: 'EXPLICIT_ONBOARDING', configured_at: new Date().toISOString() })
  });

  const fullReadiness = await readinessService.computeReadiness(tenantId);

  // M15: No undefined values in computeReadiness()
  assert.ok(fullReadiness.operationalConfiguration);
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.status, 'string');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.completedRequirements, 'number');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.totalRequirements, 'number');
  console.log('✓ Test M15: No undefined values in computeReadiness()');

  // M16: totalRequirements strictly equals 5
  assert.strictEqual(fullReadiness.operationalConfiguration.totalRequirements, 5);
  assert.strictEqual(fullReadiness.operationalConfiguration.completedRequirements, 5);
  assert.strictEqual(fullReadiness.operationalConfiguration.status, 'COMPLETE');
  console.log('✓ Test M16: totalRequirements strictly equals 5 (5/5 requirements complete)');

  // M17: Activation readiness strictly remains fail-closed
  assert.strictEqual(fullReadiness.activationReadiness.status, 'NOT_ACTIVATED');
  assert.strictEqual(fullReadiness.activationReadiness.marketplaceVisible, false);
  assert.strictEqual(fullReadiness.activationReadiness.liveQuotingAllowed, false);
  assert.strictEqual(fullReadiness.activationReadiness.jobRoutingAllowed, false);
  assert.strictEqual(fullReadiness.activationReadiness.productionDispatchAllowed, false);
  assert.strictEqual(fullReadiness.operationalConfiguration.available, false);
  assert.strictEqual(fullReadiness.operationalReadiness.available, false);
  console.log('✓ Test M17: Activation readiness strictly remains NOT_ACTIVATED with all capability flags false');

  console.log('\n================================================================');
  console.log('ALL PHASE 192 RC15 MATERIAL READINESS INTEGRITY TESTS PASSED');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n[FAIL] RC15 Material Readiness Integrity Test Failed:', err);
  process.exit(1);
});
