/**
 * tests/smoke_phase192_1_rc16_machine_capability_onboarding.js
 *
 * Phase 192 — RC16: Machine Capability Onboarding Completion Test Suite
 *
 * Covers requirements C1 through C16:
 * C1. Machine with no technical capability -> capabilityCount = 0
 * C2. supported_color_modes_json = [] -> capabilityCount = 0
 * C3. Valid CMYK selection -> capabilityCount = 1
 * C4. Explicit supports_pdfx = true -> capabilityCount = 1
 * C5. All boolean flags false -> capabilityCount = 0
 * C6. machine_type = 'DIGITAL_PRESS' alone -> capabilityCount = 0
 * C7. Invalid color mode rejected (INVALID_COLOR_MODES)
 * C8. Invalid print method rejected (INVALID_PRINT_METHODS)
 * C9. Invalid sides value rejected (INVALID_SIDES)
 * C10. Invalid dimensions rejected (INVALID_DIMENSIONS)
 * C11. Explicit false values survive update correctly
 * C12. Existing capability values load/edit without unintended loss
 * C13. Derived capability service returns capabilities matching stored configuration
 * C14. No undefined values in computeReadiness()
 * C15. totalRequirements strictly equals 5
 * C16. Activation readiness remains fail-closed (NOT_ACTIVATED, all flags false)
 */

'use strict';

const assert = require('assert');

// In-memory mock database store
const memoryStore = {
  printer_nodes: [],
  printhouse_machines: [],
  materials_catalog: [],
  printhouse_site_capacities: [],
  printhouse_site_lead_times: [],
  printhouse_shipping_regions: [],
  printhouse_integrations: []
};

// Mock mysqlClient
const mockDb = {
  query: async (sql, params = []) => {
    const upper = sql.trim().toUpperCase();

    // 1. Printer Nodes
    if (upper.includes('FROM PRINTER_NODES WHERE ID = ?')) {
      const id = params[0];
      return memoryStore.printer_nodes.filter(n => n.id === id);
    }
    if (upper.includes('FROM PRINTER_NODES WHERE TENANT_ID = ?')) {
      const tenantId = params[0];
      return memoryStore.printer_nodes.filter(n => n.tenant_id === tenantId);
    }

    // 2. Machine counts & group
    if (upper.includes('SELECT PRINTHOUSE_ID, COUNT(*) AS CNT FROM PRINTHOUSE_MACHINES WHERE TENANT_ID = ? AND STATUS != ? GROUP BY PRINTHOUSE_ID')) {
      const [tenantId, status] = params;
      const filtered = memoryStore.printhouse_machines.filter(m => m.tenant_id === tenantId && m.status !== status);
      const groups = {};
      filtered.forEach(m => {
        groups[m.printhouse_id] = (groups[m.printhouse_id] || 0) + 1;
      });
      return Object.entries(groups).map(([printhouse_id, cnt]) => ({ printhouse_id, cnt }));
    }

    if (upper.includes('SELECT COUNT(*) AS CNT FROM PRINTHOUSE_MACHINES WHERE TENANT_ID = ? AND STATUS != ?') && !upper.includes('SUPPORTS_')) {
      const [tenantId, status] = params;
      const cnt = memoryStore.printhouse_machines.filter(m => m.tenant_id === tenantId && m.status !== status).length;
      return [{ cnt }];
    }

    // 3. Machine Capabilities count
    if (upper.includes('SELECT COUNT(*) AS CNT FROM PRINTHOUSE_MACHINES') && upper.includes('SUPPORTS_')) {
      const [tenantId, status] = params;
      const cnt = memoryStore.printhouse_machines.filter(m => {
        if (m.tenant_id !== tenantId || m.status === status) return false;
        
        const hasFlag = m.supports_pdfx === 1 || m.supports_pdfx === true ||
                        m.supports_pdfa === 1 || m.supports_pdfa === true ||
                        m.supports_variable_data === 1 || m.supports_variable_data === true ||
                        m.supports_white_ink === 1 || m.supports_white_ink === true ||
                        m.supports_spot_uv === 1 || m.supports_spot_uv === true ||
                        m.supports_lamination === 1 || m.supports_lamination === true ||
                        m.supports_hardcover === 1 || m.supports_hardcover === true ||
                        m.supports_softcover === 1 || m.supports_softcover === true ||
                        m.supports_saddle_stitch === 1 || m.supports_saddle_stitch === true ||
                        m.supports_perfect_binding === 1 || m.supports_perfect_binding === true ||
                        m.supports_case_binding === 1 || m.supports_case_binding === true;

        const hasColor = m.supported_color_modes_json !== null &&
                         m.supported_color_modes_json !== undefined &&
                         m.supported_color_modes_json !== '' &&
                         m.supported_color_modes_json !== '[]' &&
                         (Array.isArray(m.supported_color_modes_json) ? m.supported_color_modes_json.length > 0 : true);

        const hasPrintMethod = m.supported_print_methods_json !== null &&
                              m.supported_print_methods_json !== undefined &&
                              m.supported_print_methods_json !== '' &&
                              m.supported_print_methods_json !== '[]' &&
                              (Array.isArray(m.supported_print_methods_json) ? m.supported_print_methods_json.length > 0 : true);

        const hasSides = m.supported_sides_json !== null &&
                         m.supported_sides_json !== undefined &&
                         m.supported_sides_json !== '' &&
                         m.supported_sides_json !== '[]' &&
                         (Array.isArray(m.supported_sides_json) ? m.supported_sides_json.length > 0 : true);

        return hasFlag || hasColor || hasPrintMethod || hasSides;
      }).length;
      return [{ cnt }];
    }

    // 4. Machine SELECT by id / site
    if (upper.includes('FROM PRINTHOUSE_MACHINES WHERE ID = ? AND PRINTHOUSE_ID = ? AND TENANT_ID = ?')) {
      const [id, siteId, tenantId] = params;
      return memoryStore.printhouse_machines.filter(m => m.id === id && m.printhouse_id === siteId && m.tenant_id === tenantId);
    }
    if (upper.includes('FROM PRINTHOUSE_MACHINES WHERE PRINTHOUSE_ID = ? AND TENANT_ID = ?')) {
      const [siteId, tenantId, status] = params;
      return memoryStore.printhouse_machines.filter(m => {
        if (m.printhouse_id !== siteId || m.tenant_id !== tenantId) return false;
        if (status && m.status === status) return false;
        return true;
      });
    }

    // 5. Machine INSERT
    if (upper.startsWith('INSERT INTO PRINTHOUSE_MACHINES')) {
      const [
        id, siteId, tenantId, name, type, manufacturer, model, status,
        maxW, maxH, minW, minH, maxPW, maxPH,
        colorModes, printMethods, sides,
        maxPages, maxFileSize, maxTac,
        pdfx, pdfa, vdp, whiteInk, spotUv, lamination,
        hardcover, softcover, saddle, perfect, caseBind, meta
      ] = params;

      const newMachine = {
        id,
        printhouse_id: siteId,
        tenant_id: tenantId,
        machine_name: name,
        machine_type: type,
        manufacturer,
        model,
        status,
        max_sheet_width_mm: maxW,
        max_sheet_height_mm: maxH,
        min_sheet_width_mm: minW,
        min_sheet_height_mm: minH,
        max_print_width_mm: maxPW,
        max_print_height_mm: maxPH,
        supported_color_modes_json: colorModes,
        supported_print_methods_json: printMethods,
        supported_sides_json: sides,
        max_pages_per_job: maxPages,
        max_file_size_mb: maxFileSize,
        max_tac_percent: maxTac,
        supports_pdfx: pdfx,
        supports_pdfa: pdfa,
        supports_variable_data: vdp,
        supports_white_ink: whiteInk,
        supports_spot_uv: spotUv,
        supports_lamination: lamination,
        supports_hardcover: hardcover,
        supports_softcover: softcover,
        supports_saddle_stitch: saddle,
        supports_perfect_binding: perfect,
        supports_case_binding: caseBind,
        metadata_json: meta
      };
      memoryStore.printhouse_machines.push(newMachine);
      return { affectedRows: 1 };
    }

    // 6. Machine UPDATE
    if (upper.startsWith('UPDATE PRINTHOUSE_MACHINES')) {
      if (upper.includes('SET STATUS = ?')) {
        const [status, id, siteId, tenantId] = params;
        const m = memoryStore.printhouse_machines.find(x => x.id === id && x.printhouse_id === siteId && x.tenant_id === tenantId);
        if (m) m.status = status;
        return { affectedRows: 1 };
      }

      const [
        name, type, manufacturer, model, status,
        maxW, maxH, minW, minH, maxPW, maxPH,
        colorModes, printMethods, sides,
        maxPages, maxFileSize, maxTac,
        pdfx, pdfa, vdp, whiteInk, spotUv, lamination,
        hardcover, softcover, saddle, perfect, caseBind, meta,
        machineId, siteId, tenantId
      ] = params;

      const m = memoryStore.printhouse_machines.find(x => x.id === machineId && x.printhouse_id === siteId && x.tenant_id === tenantId);
      if (m) {
        if (name !== null) m.machine_name = name;
        if (type !== null) m.machine_type = type;
        if (manufacturer !== null) m.manufacturer = manufacturer;
        if (model !== null) m.model = model;
        if (status !== null) m.status = status;
        if (maxW !== null) m.max_sheet_width_mm = maxW;
        if (maxH !== null) m.max_sheet_height_mm = maxH;
        if (minW !== null) m.min_sheet_width_mm = minW;
        if (minH !== null) m.min_sheet_height_mm = minH;
        if (maxPW !== null) m.max_print_width_mm = maxPW;
        if (maxPH !== null) m.max_print_height_mm = maxPH;
        if (colorModes !== null) m.supported_color_modes_json = colorModes;
        if (printMethods !== null) m.supported_print_methods_json = printMethods;
        if (sides !== null) m.supported_sides_json = sides;
        if (maxPages !== null) m.max_pages_per_job = maxPages;
        if (maxFileSize !== null) m.max_file_size_mb = maxFileSize;
        if (maxTac !== null) m.max_tac_percent = maxTac;
        if (pdfx !== null) m.supports_pdfx = pdfx;
        if (pdfa !== null) m.supports_pdfa = pdfa;
        if (vdp !== null) m.supports_variable_data = vdp;
        if (whiteInk !== null) m.supports_white_ink = whiteInk;
        if (spotUv !== null) m.supports_spot_uv = spotUv;
        if (lamination !== null) m.supports_lamination = lamination;
        if (hardcover !== null) m.supports_hardcover = hardcover;
        if (softcover !== null) m.supports_softcover = softcover;
        if (saddle !== null) m.supports_saddle_stitch = saddle;
        if (perfect !== null) m.supports_perfect_binding = perfect;
        if (caseBind !== null) m.supports_case_binding = caseBind;
        if (meta !== null) m.metadata_json = meta;
      }
      return { affectedRows: 1 };
    }

    // 7. Materials
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

    // 8. Site Capacities
    if (upper.includes('FROM PRINTHOUSE_SITE_CAPACITIES')) {
      const tenantId = params[0];
      const cnt = memoryStore.printhouse_site_capacities.filter(c => {
        if (c.tenant_id !== tenantId) return false;
        return (c.daily_jobs_limit !== null && c.daily_jobs_limit !== undefined && c.daily_jobs_limit > 0) ||
               (c.daily_sheets_limit !== null && c.daily_sheets_limit !== undefined && c.daily_sheets_limit > 0);
      }).length;
      return [{ cnt }];
    }

    // 9. Site Lead Times
    if (upper.includes('FROM PRINTHOUSE_SITE_LEAD_TIMES')) {
      const tenantId = params[0];
      const cnt = memoryStore.printhouse_site_lead_times.filter(lt => {
        if (lt.tenant_id !== tenantId) return false;
        let rules = {};
        if (lt.custom_rules_json) {
          try {
            rules = typeof lt.custom_rules_json === 'string' ? JSON.parse(lt.custom_rules_json) : lt.custom_rules_json;
          } catch (e) {}
        }
        return lt.timezone && lt.timezone.trim() !== '' &&
               lt.workdays_json && lt.workdays_json !== '' && lt.workdays_json !== '[]' &&
               lt.daily_cutoff_time && lt.daily_cutoff_time.trim() !== '' &&
               lt.base_lead_time_days !== null && lt.base_lead_time_days !== undefined && lt.base_lead_time_days >= 0 &&
               rules && rules.configuration_source === 'EXPLICIT_ONBOARDING';
      }).length;
      return [{ cnt }];
    }

    // 10. Shipping regions & Integrations
    if (upper.includes('FROM PRINTHOUSE_SHIPPING_REGIONS')) {
      const tenantId = params[0];
      const rows = memoryStore.printhouse_shipping_regions.filter(r => r.tenant_id === tenantId && r.status === 'ACTIVE' && r.enabled === 1);
      return [{ cnt: rows.length }];
    }
    if (upper.includes('FROM PRINTHOUSE_INTEGRATIONS')) {
      const tenantId = params[0];
      const rows = memoryStore.printhouse_integrations.filter(i => i.tenant_id === tenantId && i.status !== 'DISABLED');
      return [{ cnt: rows.length }];
    }

    return [];
  }
};

// Inject mock into services
const mysqlClientPath = require.resolve('../src/api/services/mysqlClient');
require.cache[mysqlClientPath] = {
  id: mysqlClientPath,
  filename: mysqlClientPath,
  loaded: true,
  exports: mockDb
};

const machineService = require('../src/api/services/printhouseMachineService');
const readinessService = require('../src/api/services/printhouseReadinessService');
const capabilityService = require('../src/api/services/printhouseCapabilityOnboardingService');

async function runTests() {
  console.log('=== Phase 192 — RC16: Machine Capability Onboarding & Integrity Suite ===\n');

  const tenantId = 'ph-04c8f95f';
  const siteId = 'node-9679061b';

  // Seed baseline site
  memoryStore.printer_nodes = [
    { id: siteId, tenant_id: tenantId, name: 'Main Production Hub', status: 'ACTIVE' }
  ];

  // Helper reset
  const resetMachines = () => {
    memoryStore.printhouse_machines = [];
  };

  // --- C1: Machine with no technical capability -> capabilityCount 0 ---
  console.log('--- Capability Readiness & Integrity Predicate (C1 - C6) ---');
  resetMachines();
  memoryStore.printhouse_machines.push({
    id: 'mach-blank',
    printhouse_id: siteId,
    tenant_id: tenantId,
    machine_name: 'Blank Digital Press',
    machine_type: 'DIGITAL_PRESS',
    status: 'ACTIVE',
    supported_color_modes_json: null,
    supported_print_methods_json: null,
    supported_sides_json: null,
    supports_pdfx: 0,
    supports_pdfa: 0,
    supports_variable_data: 0,
    supports_white_ink: 0,
    supports_spot_uv: 0,
    supports_lamination: 0,
    supports_hardcover: 0,
    supports_softcover: 0,
    supports_saddle_stitch: 0,
    supports_perfect_binding: 0,
    supports_case_binding: 0
  });

  let readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capabilityCount, 0, 'C1: Blank machine must produce capabilityCount = 0');
  console.log('✓ Test C1: Machine with no technical capability -> capabilityCount = 0');

  // --- C2: supported_color_modes_json = '[]' -> capabilityCount 0 ---
  memoryStore.printhouse_machines[0].supported_color_modes_json = '[]';
  memoryStore.printhouse_machines[0].supported_print_methods_json = '[]';
  memoryStore.printhouse_machines[0].supported_sides_json = '[]';
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capabilityCount, 0, 'C2: Empty JSON array [] must NOT count as a capability');
  console.log('✓ Test C2: supported_color_modes_json = [] -> capabilityCount = 0 (false-positive eliminated)');

  // --- C3: Valid CMYK selection -> capabilityCount 1 ---
  memoryStore.printhouse_machines[0].supported_color_modes_json = JSON.stringify(['CMYK']);
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capabilityCount, 1, 'C3: Valid CMYK selection must yield capabilityCount = 1');
  console.log('✓ Test C3: Valid CMYK selection -> capabilityCount = 1');

  // --- C4: Explicit supports_pdfx = true -> capabilityCount 1 ---
  memoryStore.printhouse_machines[0].supported_color_modes_json = '[]';
  memoryStore.printhouse_machines[0].supports_pdfx = 1;
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capabilityCount, 1, 'C4: Explicit supports_pdfx = 1 must yield capabilityCount = 1');
  console.log('✓ Test C4: Explicit supports_pdfx = true -> capabilityCount = 1');

  // --- C5: All boolean flags false & empty arrays -> capabilityCount 0 ---
  memoryStore.printhouse_machines[0].supports_pdfx = 0;
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capabilityCount, 0, 'C5: All false boolean flags must yield capabilityCount = 0');
  console.log('✓ Test C5: All boolean flags false -> capabilityCount = 0');

  // --- C6: machine_type DIGITAL_PRESS alone -> capabilityCount 0 ---
  memoryStore.printhouse_machines[0].machine_type = 'DIGITAL_PRESS';
  readiness = await readinessService._computeOperationalReadiness(tenantId, memoryStore.printer_nodes);
  assert.strictEqual(readiness.capabilityCount, 0, 'C6: machine_type alone must NEVER increment capabilityCount');
  console.log('✓ Test C6: machine_type DIGITAL_PRESS alone -> capabilityCount = 0 (no auto-inference)');

  // --- Backend Validation Tests (C7 - C10) ---
  console.log('\n--- Backend Validation Contract Tests (C7 - C10) ---');

  // C7: Invalid color mode rejected
  assert.throws(
    () => machineService.validateMachinePayload({
      machine_name: 'Test Machine',
      machine_type: 'DIGITAL_PRESS',
      supported_color_modes_json: ['INVALID_COLOR_MODE']
    }),
    /INVALID_COLOR_MODES/,
    'C7: Unknown color mode must be rejected'
  );
  console.log('✓ Test C7: Invalid color mode rejected with INVALID_COLOR_MODES');

  // C8: Invalid print method rejected
  assert.throws(
    () => machineService.validateMachinePayload({
      machine_name: 'Test Machine',
      machine_type: 'DIGITAL_PRESS',
      supported_print_methods_json: ['MAGIC_PRINT_METHOD']
    }),
    /INVALID_PRINT_METHODS/,
    'C8: Unknown print method must be rejected'
  );
  console.log('✓ Test C8: Invalid print method rejected with INVALID_PRINT_METHODS');

  // C9: Invalid sides value rejected
  assert.throws(
    () => machineService.validateMachinePayload({
      machine_name: 'Test Machine',
      machine_type: 'DIGITAL_PRESS',
      supported_sides_json: ['TRIPLEX']
    }),
    /INVALID_SIDES/,
    'C9: Unknown sides value must be rejected'
  );
  console.log('✓ Test C9: Invalid sides value rejected with INVALID_SIDES');

  // C10: Invalid dimensions rejected
  assert.throws(
    () => machineService.validateMachinePayload({
      machine_name: 'Test Machine',
      machine_type: 'DIGITAL_PRESS',
      max_sheet_width_mm: -100
    }),
    /INVALID_DIMENSIONS/,
    'C10: Negative dimension must be rejected'
  );
  assert.throws(
    () => machineService.validateMachinePayload({
      machine_name: 'Test Machine',
      machine_type: 'DIGITAL_PRESS',
      max_sheet_width_mm: 0
    }),
    /INVALID_DIMENSIONS/,
    'C10: Zero dimension must be rejected'
  );
  assert.throws(
    () => machineService.validateMachinePayload({
      machine_name: 'Test Machine',
      machine_type: 'DIGITAL_PRESS',
      max_sheet_width_mm: 200,
      min_sheet_width_mm: 300
    }),
    /INVALID_DIMENSIONS/,
    'C10: max_sheet_width_mm <= min_sheet_width_mm must be rejected'
  );
  console.log('✓ Test C10: Invalid dimensions rejected with INVALID_DIMENSIONS');

  // --- Machine Explicit Lifecycle & Updates (C11 - C13) ---
  console.log('\n--- Machine Configuration & Update Semantics (C11 - C13) ---');
  resetMachines();

  // Create machine with explicit technical configuration
  const created = await machineService.createMachine(tenantId, siteId, {
    machine_name: 'HP Indigo 100K Digital Press',
    machine_type: 'DIGITAL_PRESS',
    manufacturer: 'HP',
    model: '100K',
    max_sheet_width_mm: 750,
    max_sheet_height_mm: 530,
    min_sheet_width_mm: 297,
    min_sheet_height_mm: 210,
    max_print_width_mm: 740,
    max_print_height_mm: 510,
    supported_color_modes_json: ['CMYK', 'CMYK+WHITE'],
    supported_print_methods_json: ['DIGITAL_TONER'],
    supported_sides_json: ['SIMPLEX', 'DUPLEX'],
    supports_pdfx: true,
    supports_pdfa: true,
    supports_variable_data: true,
    supports_white_ink: true,
    supports_spot_uv: false,
    supports_lamination: false
  });

  assert.ok(created, 'Machine creation must succeed');
  assert.strictEqual(created.supports_pdfx, true);
  assert.strictEqual(created.supports_white_ink, true);
  assert.strictEqual(created.supports_spot_uv, false);

  // C11: Explicit false values survive update correctly
  const updated = await machineService.updateMachine(tenantId, siteId, created.id, {
    supports_white_ink: false,
    supports_pdfx: false,
    supports_spot_uv: true
  });
  assert.strictEqual(updated.supports_white_ink, false, 'C11: Explicit false supports_white_ink must persist as false');
  assert.strictEqual(updated.supports_pdfx, false, 'C11: Explicit false supports_pdfx must persist as false');
  assert.strictEqual(updated.supports_spot_uv, true, 'C11: Explicit true supports_spot_uv must persist as true');
  console.log('✓ Test C11: Explicit false values survive update correctly (no conversion to NULL or ignore)');

  // C12: Existing capability values load/edit without unintended loss
  const retrieved = await machineService.getMachine(tenantId, siteId, created.id);
  assert.deepStrictEqual(retrieved.supported_color_modes_json, ['CMYK', 'CMYK+WHITE']);
  assert.deepStrictEqual(retrieved.supported_print_methods_json, ['DIGITAL_TONER']);
  assert.deepStrictEqual(retrieved.supported_sides_json, ['SIMPLEX', 'DUPLEX']);
  assert.strictEqual(retrieved.max_sheet_width_mm, 750);
  console.log('✓ Test C12: Existing capability values load/edit without unintended loss');

  // C13: Derived capability service returns capabilities matching stored configuration
  const siteCaps = await capabilityService.computeSiteCapabilities(tenantId, siteId);
  assert.ok(Array.isArray(siteCaps.capabilities), 'siteCaps.capabilities must be an array');
  assert.ok(siteCaps.capabilities.some(c => c.type === 'PRINT_CMYK'), 'Must derive PRINT_CMYK');
  assert.ok(siteCaps.capabilities.some(c => c.type === 'FINISH_SPOT_UV'), 'Must derive FINISH_SPOT_UV');
  assert.ok(siteCaps.capabilities.some(c => c.type === 'FORMAT_SRA3'), 'Must derive format SRA3 from 750x530 dimensions');
  assert.ok(siteCaps.capabilities.some(c => c.type === 'FORMAT_LARGE'), 'Must derive format LARGE from 750x530 dimensions');
  console.log('✓ Test C13: Derived capability service returns capabilities matching stored configuration');

  // --- Full Readiness Contract & Invariants (C14 - C16) ---
  console.log('\n--- Full Readiness Contract & Invariants (C14 - C16) ---');

  // Setup remaining operational requirements to verify 5/5
  memoryStore.materials_catalog = [{
    id: 'mat-magno-300',
    tenant_id: tenantId,
    printhouse_id: siteId,
    material_name: 'Magno Satin 300g',
    material_type: 'PAPER',
    substrate_class: 'COATED',
    gsm: 300,
    sheet_format: 'SRA3',
    finish_type: 'SATIN',
    supplier_name: 'Sappi',
    supplier_country: 'BE',
    metadata_json: JSON.stringify({ configuration_source: 'EXPLICIT_ONBOARDING' })
  }];

  memoryStore.printhouse_site_capacities = [{
    id: 'cap-node-1',
    site_id: siteId,
    tenant_id: tenantId,
    daily_jobs_limit: 50,
    daily_sheets_limit: 10000,
    working_days_per_week: 5,
    operating_hours_per_day: 8
  }];

  memoryStore.printhouse_site_lead_times = [{
    id: 'lt-node-1',
    site_id: siteId,
    tenant_id: tenantId,
    timezone: 'Europe/Madrid',
    workdays_json: JSON.stringify([1, 2, 3, 4, 5]),
    daily_cutoff_time: '14:00',
    base_lead_time_days: 3,
    custom_rules_json: JSON.stringify({ configuration_source: 'EXPLICIT_ONBOARDING' })
  }];

  const fullReadiness = await readinessService.computeReadiness(tenantId, memoryStore.printer_nodes);

  // C14: No undefined values in computeReadiness()
  assert.ok(fullReadiness.operationalConfiguration, 'operationalConfiguration must be defined');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.status, 'string');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.machineCount, 'number');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.capabilityCount, 'number');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.materialCount, 'number');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.capacityCount, 'number');
  assert.strictEqual(typeof fullReadiness.operationalConfiguration.leadTimesCount, 'number');
  console.log('✓ Test C14: No undefined values in computeReadiness()');

  // C15: totalRequirements strictly equals 5
  assert.strictEqual(fullReadiness.operationalConfiguration.machineCount, 1);
  assert.strictEqual(fullReadiness.operationalConfiguration.capabilityCount, 1);
  assert.strictEqual(fullReadiness.operationalConfiguration.materialCount, 1);
  assert.strictEqual(fullReadiness.operationalConfiguration.capacityCount, 1);
  assert.strictEqual(fullReadiness.operationalConfiguration.leadTimesCount, 1);
  assert.strictEqual(fullReadiness.operationalConfiguration.completedRequirements, 5);
  assert.strictEqual(fullReadiness.operationalConfiguration.totalRequirements, 5);
  console.log('✓ Test C15: totalRequirements strictly equals 5 (5/5 requirements complete)');

  // C16: Activation readiness strictly remains fail-closed
  assert.strictEqual(fullReadiness.activationReadiness.status, 'NOT_ACTIVATED');
  assert.strictEqual(fullReadiness.activationReadiness.marketplaceVisible, false);
  assert.strictEqual(fullReadiness.activationReadiness.liveQuotingAllowed, false);
  assert.strictEqual(fullReadiness.activationReadiness.jobRoutingAllowed, false);
  assert.strictEqual(fullReadiness.activationReadiness.productionDispatchAllowed, false);
  console.log('✓ Test C16: Activation readiness strictly remains NOT_ACTIVATED with all capability flags false');

  console.log('\n================================================================');
  console.log('ALL PHASE 192 RC16 MACHINE CAPABILITY ONBOARDING TESTS PASSED');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n[FAIL] RC16 Machine Capability Onboarding Test Failed:', err);
  process.exit(1);
});
