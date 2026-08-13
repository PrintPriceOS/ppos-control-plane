#!/usr/bin/env node
'use strict';

/**
 * scripts/smoke_phase191d1_machines_capabilities.js
 *
 * Phase 191D.1 — Smoke Test: Machines & Production Capabilities
 *
 * Verifies end-to-end:
 *   1. Machine template listing
 *   2. Machine CRUD (create from template, get, update, list, archive)
 *   3. Field protection (protected fields stripped from updates)
 *   4. Capability type listing
 *   5. Site capability computation
 *   6. Tenant capability summary
 *   7. Readiness service returns operational readiness data
 *   8. Validation enforcement (invalid payloads rejected)
 *
 * Prerequisites:
 *   - Database seeded with test fixture (init_test_db.js)
 *   - At least one printer_nodes row with a valid tenant_id
 *   - Server running OR direct service-level invocation
 *
 * Usage:
 *   DATABASE_URL=... node scripts/smoke_phase191d1_machines_capabilities.js
 */

const db = require('../src/api/services/mysqlClient');
const machineService = require('../src/api/services/printhouseMachineService');
const capabilityService = require('../src/api/services/printhouseCapabilityOnboardingService');
const readinessService = require('../src/api/services/printhouseReadinessService');

let passed = 0;
let failed = 0;
const results = [];

function assert(label, condition, detail = '') {
    if (condition) {
        passed++;
        results.push({ label, status: 'PASS' });
        console.log(`  ✅ ${label}`);
    } else {
        failed++;
        results.push({ label, status: 'FAIL', detail });
        console.error(`  ❌ ${label} ${detail ? '— ' + detail : ''}`);
    }
}

async function assertThrows(label, fn, expectedMsg) {
    try {
        await fn();
        failed++;
        results.push({ label, status: 'FAIL', detail: 'Expected error not thrown' });
        console.error(`  ❌ ${label} — Expected error not thrown`);
    } catch (err) {
        const msgOk = !expectedMsg || err.message.includes(expectedMsg);
        if (msgOk) {
            passed++;
            results.push({ label, status: 'PASS' });
            console.log(`  ✅ ${label}`);
        } else {
            failed++;
            results.push({ label, status: 'FAIL', detail: `Got: ${err.message}` });
            console.error(`  ❌ ${label} — Expected "${expectedMsg}", got "${err.message}"`);
        }
    }
}

async function main() {
    console.log('\n=== Phase 191D.1 Smoke Test: Machines & Capabilities ===\n');

    // ──── Setup: find or create a test tenant and site ──────────────────────
    let tenantId, siteId;
    let createdTestData = false;

    try {
        const tenants = await db.query('SELECT id FROM tenants LIMIT 1');
        tenantId = tenants[0]?.id;

        if (!tenantId) {
            // Seed minimal test data
            tenantId = 'smoke_tenant_191d1';
            await db.query(
                `INSERT IGNORE INTO tenants (id, name, status, plan, metadata_json) VALUES (?, ?, ?, ?, ?)`,
                [tenantId, 'Smoke Test PrintHouse', 'ACTIVE', 'PROFESSIONAL', JSON.stringify({ country: 'ES', contact_name: 'Test User' })]
            );
            createdTestData = true;
        }
        assert('Tenant exists', !!tenantId, tenantId);

        const sites = await db.query('SELECT id FROM printer_nodes WHERE tenant_id = ? LIMIT 1', [tenantId]);
        siteId = sites[0]?.id;

        if (!siteId) {
            siteId = 'smoke_site_191d1';
            await db.query(
                `INSERT IGNORE INTO printer_nodes (id, tenant_id, name, country, city, status) VALUES (?, ?, ?, ?, ?, ?)`,
                [siteId, tenantId, 'Smoke Test Production Site', 'ES', 'Madrid', 'ACTIVE']
            );
            // Ensure printhouses row exists for FK
            await db.query(
                `INSERT IGNORE INTO printhouses (id, tenant_id, name, status) VALUES (?, ?, ?, ?)`,
                [siteId, tenantId, 'Smoke Test Printhouse', 'ACTIVE']
            );
            createdTestData = true;
        }
        assert('Production site exists', !!siteId, siteId);
    } catch (err) {
        console.error('FATAL: Cannot find/create test tenant/site:', err.message);
        process.exit(1);
    }

    const actor = { userId: 'smoke-test', tenantId, role: 'PRINTHOUSE_ADMIN' };

    // ──── 1. Machine Templates ──────────────────────────────────────────────
    console.log('\n--- Machine Templates ---');
    const templates = machineService.getTemplates();
    assert('Templates available', templates.length > 0, `count=${templates.length}`);
    assert('Templates contain OFFSET_PRESS', templates.some(t => t.template_id === 'OFFSET_PRESS'));
    assert('Templates contain DIGITAL_PRESS', templates.some(t => t.template_id === 'DIGITAL_PRESS'));

    // ──── 2. Machine Creation (from template) ──────────────────────────────
    console.log('\n--- Machine CRUD ---');
    const machine = await machineService.createMachine(tenantId, siteId, {
        machine_name: 'Smoke Test Offset Press',
        template_id: 'OFFSET_PRESS'
    }, actor);
    assert('Machine created', !!machine);
    assert('Machine has ID', !!machine.id);
    assert('Machine name correct', machine.machine_name === 'Smoke Test Offset Press');
    assert('Machine type from template', machine.machine_type === 'OFFSET_PRESS');
    assert('Machine tenant isolated', machine.tenant_id === tenantId);
    assert('Machine site scoped', machine.printhouse_id === siteId);
    assert('Template applied max_sheet_width_mm', machine.max_sheet_width_mm === 720);

    // Create a digital press too
    const digitalMachine = await machineService.createMachine(tenantId, siteId, {
        machine_name: 'Smoke Test Digital Press',
        template_id: 'DIGITAL_PRESS',
        supports_variable_data: true
    }, actor);
    assert('Digital press created', !!digitalMachine);
    assert('Digital press VDP enabled', digitalMachine.supports_variable_data === 1 || digitalMachine.supports_variable_data === true);

    // ──── 3. Machine Get ────────────────────────────────────────────────────
    const fetched = await machineService.getMachine(tenantId, siteId, machine.id);
    assert('Machine fetched by ID', !!fetched);
    assert('Fetched machine matches', fetched.id === machine.id);

    // ──── 4. Machine List ───────────────────────────────────────────────────
    const list = await machineService.listMachines(tenantId, siteId);
    assert('Machine list returns results', list.length >= 2);

    // ──── 5. Machine Update ─────────────────────────────────────────────────
    const updated = await machineService.updateMachine(tenantId, siteId, machine.id, {
        machine_name: 'Updated Offset Press',
        manufacturer: 'Heidelberg',
        model: 'XL 106-8P'
    }, actor);
    assert('Machine updated', !!updated);
    assert('Name updated', updated.machine_name === 'Updated Offset Press');
    assert('Manufacturer set', updated.manufacturer === 'Heidelberg');

    // ──── 6. Field Protection ───────────────────────────────────────────────
    console.log('\n--- Field Protection ---');
    await assertThrows('Reject id mutation',
        () => machineService.updateMachine(tenantId, siteId, machine.id, { id: 'HACKED_ID' }, actor),
        'FIELD_NOT_EDITABLE'
    );
    await assertThrows('Reject tenant_id mutation',
        () => machineService.updateMachine(tenantId, siteId, machine.id, { tenant_id: 'HACKED_TENANT' }, actor),
        'FIELD_NOT_EDITABLE'
    );
    await assertThrows('Reject printhouse_id mutation',
        () => machineService.updateMachine(tenantId, siteId, machine.id, { printhouse_id: 'HACKED_SITE' }, actor),
        'FIELD_NOT_EDITABLE'
    );
    await assertThrows('Reject approved mutation',
        () => machineService.updateMachine(tenantId, siteId, machine.id, { approved: true }, actor),
        'FIELD_NOT_EDITABLE'
    );

    // ──── 7. Validation Enforcement ─────────────────────────────────────────
    console.log('\n--- Validation ---');
    await assertThrows('Reject invalid machine_type',
        () => machineService.createMachine(tenantId, siteId, { machine_name: 'Bad', machine_type: 'INVALID' }, actor),
        'INVALID_TYPE'
    );
    await assertThrows('Reject missing machine_name',
        () => machineService.createMachine(tenantId, siteId, { machine_type: 'DIGITAL_PRESS' }, actor),
        'INVALID_NAME'
    );
    await assertThrows('Reject invalid TAC',
        () => machineService.createMachine(tenantId, siteId, { machine_name: 'Bad', machine_type: 'DIGITAL_PRESS', max_tac_percent: 500 }, actor),
        'INVALID_TAC'
    );

    // Cross-tenant isolation
    await assertThrows('Reject cross-tenant access',
        () => machineService.listMachines('fake-tenant-xyz', siteId),
        'UNAUTHORIZED_TENANT_ACCESS'
    );

    // ──── 8. Capability Types ───────────────────────────────────────────────
    console.log('\n--- Capabilities ---');
    const capTypes = capabilityService.getCapabilityTypes();
    assert('Capability types available', capTypes.length > 0, `count=${capTypes.length}`);
    assert('Has PRINT_CMYK type', capTypes.some(t => t.type === 'PRINT_CMYK'));
    assert('Has FINISH_LAMINATION type', capTypes.some(t => t.type === 'FINISH_LAMINATION'));

    // ──── 9. Site Capability Computation ────────────────────────────────────
    const siteProfile = await capabilityService.computeSiteCapabilities(tenantId, siteId);
    assert('Site profile computed', !!siteProfile);
    assert('Site has machines', siteProfile.machine_count >= 2);
    assert('Site has capabilities', siteProfile.capability_count > 0);
    assert('PRINT_CMYK derived', siteProfile.capabilities.some(c => c.type === 'PRINT_CMYK'));

    // ──── 10. Tenant Capability Summary ────────────────────────────────────
    const tenantProfile = await capabilityService.computeTenantCapabilities(tenantId);
    assert('Tenant profile computed', !!tenantProfile);
    assert('Tenant has sites', tenantProfile.site_count > 0);
    assert('Tenant has total machines', tenantProfile.total_machines >= 2);

    // ──── 11. Readiness Service ────────────────────────────────────────────
    console.log('\n--- Readiness ---');
    const readiness = await readinessService.computeReadiness(tenantId);
    assert('Readiness computed', !!readiness);
    assert('Account setup present', !!readiness.accountSetup);
    assert('Operational readiness present', !!readiness.operationalReadiness);
    assert('Operational machine count > 0', readiness.operationalReadiness.machineCount > 0);
    assert('Operational status not NOT_AVAILABLE', readiness.operationalReadiness.status !== 'NOT_AVAILABLE');

    // ──── 12. Machine Archive ──────────────────────────────────────────────
    console.log('\n--- Archive ---');
    await machineService.archiveMachine(tenantId, siteId, machine.id, actor);
    const archived = await machineService.getMachine(tenantId, siteId, machine.id);
    assert('Machine archived', archived.status === 'ARCHIVED');

    await assertThrows('Reject archive of non-existent machine',
        () => machineService.archiveMachine(tenantId, siteId, 'fake_machine_id_999', actor),
        'MACHINE_NOT_FOUND'
    );

    // ──── Cleanup ──────────────────────────────────────────────────────────
    console.log('\n--- Cleanup ---');
    await db.query('DELETE FROM printhouse_machines WHERE tenant_id = ? AND machine_name LIKE ?', [tenantId, 'Smoke Test%']);
    await db.query('DELETE FROM printhouse_machines WHERE tenant_id = ? AND machine_name LIKE ?', [tenantId, 'Updated%']);
    await db.query('DELETE FROM printhouse_machines WHERE tenant_id = ? AND machine_name LIKE ?', [tenantId, 'Still Safe%']);
    if (createdTestData) {
        await db.query('DELETE FROM printhouses WHERE id = ?', [siteId]);
        await db.query('DELETE FROM printer_nodes WHERE id = ?', [siteId]);
        await db.query('DELETE FROM tenants WHERE id = ?', [tenantId]);
        console.log('  🧹 Test data (tenant, site) cleaned up');
    }
    console.log('  🧹 Test machines cleaned up');

    // ──── Report ───────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log(`Phase 191D.1 Smoke Test: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(60));

    if (failed > 0) {
        console.log('\nFailed tests:');
        results.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`  ❌ ${r.label}${r.detail ? ': ' + r.detail : ''}`);
        });
    }

    await db.closePool();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
});
