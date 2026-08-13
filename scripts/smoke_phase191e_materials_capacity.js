/**
 * scripts/smoke_phase191e_materials_capacity.js
 *
 * Phase 191E Service-Level Smoke Test.
 * Asserts Materials CRUD, machine-material compatibility provenance,
 * site and machine capacities configuration, localized lead times with cutoff rollovers,
 * and strict field protections.
 */

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const materialService = require('../src/api/services/printhouseMaterialService');
const capacityService = require('../src/api/services/printhouseCapacityService');
const leadTimeService = require('../src/api/services/printhouseLeadTimeService');

const tenantId = 'tenant-smoke-191e';
const siteId = 'site-smoke-191e';
const machineId = 'mach-smoke-191e';
const actor = { id: 'smoke-actor', role: 'PRINTHOUSE_ADMIN' };

let passed = 0;
let failed = 0;

function assertTest(label, condition) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        console.error(`  ❌ ${label}`);
    }
}

async function assertThrows(label, fn, expectedErrMessage) {
    try {
        await fn();
        failed++;
        console.error(`  ❌ ${label} — Expected error was not thrown`);
    } catch (err) {
        if (expectedErrMessage && err.message !== expectedErrMessage) {
            failed++;
            console.error(`  ❌ ${label} — Expected error ${expectedErrMessage}, got ${err.message}`);
        } else {
            passed++;
            console.log(`  ✅ ${label} (Correctly threw: ${err.message})`);
        }
    }
}

async function run() {
    console.log('\n=== Phase 191E Service-Level Smoke Test ===\n');

    // 1. Seed base tenant, site and machine
    console.log('Seeding test company structures...');
    await db.query('DELETE FROM printhouse_machine_materials WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM materials_catalog WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM printhouse_site_capacities WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM printhouse_site_lead_times WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM printhouse_machines WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM printer_nodes WHERE tenant_id = ?', [tenantId]);
    await db.query('DELETE FROM tenants WHERE id = ?', [tenantId]);

    await db.query(`INSERT INTO tenants (id, name, status, plan) VALUES (?, 'Smoke 191E', 'ACTIVE', 'PRO')`, [tenantId]);
    await db.query(`
        INSERT INTO printer_nodes (id, tenant_id, name, country, city, status, email)
        VALUES (?, ?, 'Madrid Site', 'ES', 'Madrid', 'ACTIVE', 'madrid@smoke191e.com')
    `, [siteId, tenantId]);
    await db.query(`
        INSERT INTO printhouse_machines (id, printhouse_id, tenant_id, machine_name, machine_type, status)
        VALUES (?, ?, ?, 'Smoke Heidelberg Press', 'OFFSET_PRESS', 'ACTIVE')
    `, [machineId, siteId, tenantId]);

    console.log('Seed completed.\n');

    try {
        // ─── 2. Materials Catalog & Compatibilities ──────────────────────────
        console.log('--- 1. Materials & Compatibility ---');
        
        // Create material
        const material = await materialService.createMaterial(tenantId, siteId, {
            material_name: 'Premium Silk Coated 300g',
            material_type: 'PAPER',
            gsm: 300,
            sheet_format: 'SRA3'
        });
        assertTest('Material catalog entry created', !!material);
        assertTest('Material name matches', material.material_name === 'Premium Silk Coated 300g');
        assertTest('GSM set correctly', material.gsm === 300);

        // Protected fields block (pricing/financial/activation)
        await assertThrows(
            'Reject cost_per_unit in material create',
            () => materialService.createMaterial(tenantId, siteId, { material_name: 'Illegal Cost', cost_per_unit: 10.0 }),
            'FIELD_NOT_EDITABLE'
        );
        await assertThrows(
            'Reject approved status mutation in update',
            () => materialService.updateMaterial(tenantId, siteId, material.id, { approved: true }),
            'FIELD_NOT_EDITABLE'
        );

        // Associate with machine with explicit provenance
        const link = await materialService.associateMachineMaterial(
            tenantId,
            siteId,
            machineId,
            material.id,
            'certified_format_match'
        );
        assertTest('Compatibility link created', !!link);
        assertTest('Provenance matches expected label', link.compatibility_provenance === 'certified_format_match');

        // Query compatibility provenance
        const list = await materialService.listMachineCompatibilities(tenantId, siteId, machineId);
        assertTest('Machine compatibilities returned', list.length > 0);
        assertTest('First item matches material ID', list[0].material_catalog_id === material.id);
        assertTest('Provenance preserved in registry query', list[0].compatibility_provenance === 'certified_format_match');

        // ─── 3. Capacity Configuration ────────────────────────────────────────
        console.log('\n--- 2. Production Capacity ---');

        // Configure site capacity
        const capacity = await capacityService.setSiteCapacity(tenantId, siteId, {
            daily_jobs_limit: 10,
            daily_sheets_limit: 25000,
            working_days_per_week: 5,
            operating_hours_per_day: 16,
            notes: 'Two shifts daily'
        });
        assertTest('Site capacity configured', !!capacity);
        assertTest('Daily jobs limit matches', capacity.daily_jobs_limit === 10);
        assertTest('Daily sheets limit matches', capacity.daily_sheets_limit === 25000);

        // Reject activation changes in capacity
        await assertThrows(
            'Reject routing activation flag in capacity update',
            () => capacityService.setSiteCapacity(tenantId, siteId, { routing_enabled: true }),
            'FIELD_NOT_EDITABLE'
        );

        // Set machine-specific throughput
        const machCap = await capacityService.setMachineCapacity(tenantId, siteId, machineId, {
            indicative_daily_capacity: 15000,
            capacity_unit_name: 'sheets'
        });
        assertTest('Machine capacity config updated', !!machCap);
        assertTest('Indicative daily capacity matches', machCap.indicative_daily_capacity === 15000);
        assertTest('Capacity unit name is stored', machCap.capacity_unit_name === 'sheets');

        // ─── 4. Localized Lead Times & Completion Forecast ────────────────────
        console.log('\n--- 3. Lead Times & Cutoff Rollovers ---');

        // Configure lead times: UTC timezone, Mon-Fri, cutoff at 14:00, 2 days base lead
        const leadTimes = await leadTimeService.setLeadTimes(tenantId, siteId, {
            timezone: 'Europe/Madrid',
            workdays_json: [1, 2, 3, 4, 5],
            daily_cutoff_time: '14:00',
            base_lead_time_days: 2
        });
        assertTest('Lead times rules stored', !!leadTimes);
        assertTest('Timezone is Europe/Madrid', leadTimes.timezone === 'Europe/Madrid');

        // Test 1: Job received Wednesday morning (10:00 Madrid time)
        // 2026-08-05 (Wed) 10:00 Madrid is 08:00 UTC
        const estimate1 = await leadTimeService.calculateEstimatedProductionCompletion(tenantId, siteId, '2026-08-05T08:00:00Z');
        // Pre-cutoff Wednesday start + 2 working days -> Thursday, Friday. Expected Completion: Friday (2026-08-07).
        assertTest('Wednesday 10:00 Madrid completes Friday', estimate1.includes('2026-08-07'));

        // Test 2: Job received Wednesday afternoon (15:00 Madrid time)
        // 2026-08-05 (Wed) 15:00 Madrid is 13:00 UTC
        const estimate2 = await leadTimeService.calculateEstimatedProductionCompletion(tenantId, siteId, '2026-08-05T13:00:00Z');
        // Post-cutoff Wednesday rolls start to Thursday morning. Thursday + 2 working days -> Friday, Monday.
        // Expected Completion: Monday (2026-08-10).
        assertTest('Wednesday 15:00 Madrid rolls to Monday', estimate2.includes('2026-08-10'));

        // Test 3: Job received Friday night (20:00 Madrid time)
        // 2026-08-07 (Fri) 20:00 Madrid is 18:00 UTC
        const estimate3 = await leadTimeService.calculateEstimatedProductionCompletion(tenantId, siteId, '2026-08-07T18:00:00Z');
        // Post-cutoff Friday rolls start to Monday morning. Monday + 2 working days -> Tuesday, Wednesday.
        // Expected Completion: Wednesday (2026-08-12).
        assertTest('Friday night rolls to next Wednesday', estimate3.includes('2026-08-12'));

    } catch (err) {
        console.error('Fatal Test Run Failure:', err);
        failed++;
    } finally {
        // Cleanup
        console.log('\n--- Cleanup ---');
        await db.query('DELETE FROM printhouse_machine_materials WHERE tenant_id = ?', [tenantId]);
        await db.query('DELETE FROM materials_catalog WHERE tenant_id = ?', [tenantId]);
        await db.query('DELETE FROM printhouse_site_capacities WHERE tenant_id = ?', [tenantId]);
        await db.query('DELETE FROM printhouse_site_lead_times WHERE tenant_id = ?', [tenantId]);
        await db.query('DELETE FROM printhouse_machines WHERE tenant_id = ?', [tenantId]);
        await db.query('DELETE FROM printer_nodes WHERE tenant_id = ?', [tenantId]);
        await db.query('DELETE FROM tenants WHERE id = ?', [tenantId]);
        await db.closePool();
    }

    console.log('\n' + '='.repeat(65));
    console.log(`Phase 191E Service-Level Smoke Test: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(65));

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
