#!/usr/bin/env node
'use strict';

/**
 * test/integration/smoke_phase191e_http_routes.js
 *
 * Phase 191E HTTP Route Integration Test Suite.
 * Verification of Materials, Capacity, and Lead Times REST endpoints.
 */

const { spawn } = require('child_process');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const db = require('../../src/api/services/mysqlClient');

const PORT = 4568;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = 'test_secret_for_integration_smoke';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

function signToken(userPayload, expiresIn = '1h') {
    const payload = {
        sub: userPayload.id,
        email: userPayload.email || 'user@printprice.pro',
        role: userPayload.role,
        tenant_id: userPayload.tenantId,
        printhouse_id: userPayload.printhouseId
    };
    return jwt.sign(payload, JWT_SECRET, {
        audience: JWT_AUDIENCE,
        issuer: JWT_ISSUER,
        expiresIn
    });
}

let passed = 0;
let failed = 0;

function assertHttp(label, status, expectedStatus) {
    if (status === expectedStatus) {
        passed++;
        console.log(`  ✅ HTTP: ${label} (Got ${status})`);
    } else {
        failed++;
        console.error(`  ❌ HTTP: ${label} — Expected status ${expectedStatus}, got ${status}`);
    }
}

async function run() {
    console.log('\n=== Phase 191E HTTP Integration Tests ===\n');

    console.log('Seeding integration test database...');
    // Ensure test db
    const rows = await db.query('SELECT DATABASE() AS db');
    const dbName = rows[0]?.db || '';
    if (!dbName.includes('test')) {
        console.error(`Aborting: Integration test must only run against a test database. Current: ${dbName}`);
        process.exit(1);
    }

    // Cleanup
    await db.query('DELETE FROM printhouse_machine_materials WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
    await db.query('DELETE FROM materials_catalog WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
    await db.query('DELETE FROM printhouse_site_capacities WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
    await db.query('DELETE FROM printhouse_site_lead_times WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
    await db.query('DELETE FROM printhouse_machines WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
    await db.query('DELETE FROM printhouses WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
    await db.query('DELETE FROM printer_nodes WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
    await db.query('DELETE FROM tenants WHERE id IN ("tenant-a", "tenant-b", "tenant-suspended")');

    // Insert active tenants
    await db.query(`INSERT INTO tenants (id, name, status, plan) VALUES ('tenant-a', 'Tenant A', 'ACTIVE', 'PRO')`);
    await db.query(`INSERT INTO tenants (id, name, status, plan) VALUES ('tenant-b', 'Tenant B', 'ACTIVE', 'PRO')`);
    await db.query(`INSERT INTO tenants (id, name, status, plan) VALUES ('tenant-suspended', 'Suspended Tenant', 'SUSPENDED', 'PRO')`);

    // Insert sites
    await db.query(`
        INSERT INTO printer_nodes (id, tenant_id, name, country, city, status, email) 
        VALUES ('site-A', 'tenant-a', 'Site A', 'ES', 'Madrid', 'ACTIVE', 'site-a@tenant-a.com')
    `);
    await db.query(`INSERT INTO printhouses (id, tenant_id, name, status) VALUES ('site-A', 'tenant-a', 'Site A', 'ACTIVE')`);

    await db.query(`
        INSERT INTO printer_nodes (id, tenant_id, name, country, city, status, email) 
        VALUES ('site-B', 'tenant-b', 'Site B', 'ES', 'Barcelona', 'ACTIVE', 'site-b@tenant-b.com')
    `);
    await db.query(`INSERT INTO printhouses (id, tenant_id, name, status) VALUES ('site-B', 'tenant-b', 'Site B', 'ACTIVE')`);

    // Seed machine and material
    await db.query(`
        INSERT INTO printhouse_machines (id, printhouse_id, tenant_id, machine_name, machine_type, status)
        VALUES ('machine-A1', 'site-A', 'tenant-a', 'Press A1', 'DIGITAL_PRESS', 'ACTIVE')
    `);
    await db.query(`
        INSERT INTO materials_catalog (id, tenant_id, printhouse_id, material_name, material_type, substrate_class, gsm)
        VALUES ('material-A1', 'tenant-a', 'site-A', 'Existing Material', 'PAPER', 'STANDARD', 150)
    `);

    console.log('Test data seeded.');

    // Spawn Fastify Server
    console.log(`Starting Fastify server on port ${PORT}...`);
    const serverProcess = spawn('node', ['server.js'], {
        env: {
            ...process.env,
            PORT: PORT.toString(),
            JWT_SECRET,
            JWT_AUDIENCE,
            JWT_ISSUER,
            ALLOW_DISPOSABLE_DB_INIT: 'true'
        }
    });

    // Wait for server to boot
    await new Promise((resolve) => {
        let booted = false;
        serverProcess.stdout.on('data', (data) => {
            const str = data.toString();
            if (str.includes('Governance layer active') || str.includes('Server listening')) {
                booted = true;
                resolve();
            }
        });
        setTimeout(() => {
            if (!booted) resolve();
        }, 3000);
    });

    console.log('Server started. Beginning HTTP assertions.');

    // Tokens
    const tokenA = signToken({ id: 'user-a', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-a' });
    const tokenB = signToken({ id: 'user-b', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-b' });
    const tokenSuspended = signToken({ id: 'user-s', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-suspended' });
    const tokenCustomer = signToken({ id: 'user-c', role: 'CUSTOMER', tenantId: 'tenant-a' });

    try {
        // ─── 1. Authentication ───
        console.log('\n--- 1. Authentication ---');

        // Suspended tenant
        let res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/materials`, {
            headers: { 'Authorization': `Bearer ${tokenSuspended}` }
        });
        assertHttp('Suspended tenant returns 403', res.status, 403);

        // Non-Printhouse user
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/materials`, {
            headers: { 'Authorization': `Bearer ${tokenCustomer}` }
        });
        assertHttp('Non-Printhouse role returns 403', res.status, 403);

        // Valid Printhouse admin
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/materials`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('Valid Printhouse admin returns 200', res.status, 200);

        // ─── 2. Tenant Isolation ───
        console.log('\n--- 2. Tenant Isolation ---');

        // Fetch foreign site materials
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-B/materials`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('Fetch foreign site materials returns 403', res.status, 403);

        // Create material in foreign site
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-B/materials`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ material_name: 'Stolen Paper', material_type: 'PAPER' })
        });
        assertHttp('Create material in foreign site returns 403', res.status, 403);

        // ─── 3. Protected / Financial Fields Rejection ───
        console.log('\n--- 3. Protected / Financial Fields Rejection ---');

        // Try to create material with cost_per_unit
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/materials`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ material_name: 'Gold Paper', material_type: 'PAPER', cost_per_unit: 125.0 })
        });
        assertHttp('POST with cost_per_unit returns 400', res.status, 400);
        let errBody = await res.json();
        assert.strictEqual(errBody.error, 'FIELD_NOT_EDITABLE');
        assert(errBody.fields.includes('cost_per_unit'));

        // Try to update material with approved flag
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/materials/material-A1`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ approved: true })
        });
        assertHttp('PUT with approved flag returns 400', res.status, 400);
        errBody = await res.json();
        assert.strictEqual(errBody.error, 'FIELD_NOT_EDITABLE');

        // ─── 4. Endpoints Check ───
        console.log('\n--- 4. REST Endpoints Flow ---');

        // POST Capacity
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/capacity`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ daily_jobs_limit: 5, operating_hours_per_day: 8 })
        });
        assertHttp('POST Site Capacity returns 200', res.status, 200);

        // GET Capacity
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/capacity`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('GET Site Capacity returns 200', res.status, 200);
        let capObj = await res.json();
        assert.strictEqual(capObj.capacity.daily_jobs_limit, 5);

        // POST Machine Capacity
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/machines/machine-A1/capacity`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ indicative_daily_capacity: 1000, capacity_unit_name: 'impressions' })
        });
        assertHttp('POST Machine Capacity returns 200', res.status, 200);

        // POST Lead Times
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/leadtimes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ timezone: 'Europe/Madrid', workdays_json: [1,2,3,4,5], daily_cutoff_time: '14:00', base_lead_time_days: 2 })
        });
        assertHttp('POST Lead Times returns 200', res.status, 200);

        // GET Lead Times Estimate Simulator
        // Wed Aug 05 2026 10:00 Madrid = 08:00 UTC
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/leadtimes/estimate?start_time=2026-08-05T08:00:00Z`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('GET Lead Times Estimate returns 200', res.status, 200);
        let estObj = await res.json();
        assert(estObj.estimated_completion.includes('2026-08-07')); // Wed + 2 days -> Fri Aug 07

    } catch (err) {
        console.error('Test execution error:', err);
        failed++;
    } finally {
        console.log('\nStopping Fastify server...');
        serverProcess.kill('SIGTERM');
        
        console.log('Cleaning up database...');
        await db.query('DELETE FROM printhouse_machine_materials WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
        await db.query('DELETE FROM materials_catalog WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
        await db.query('DELETE FROM printhouse_site_capacities WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
        await db.query('DELETE FROM printhouse_site_lead_times WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
        await db.query('DELETE FROM printhouse_machines WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
        await db.query('DELETE FROM printhouses WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
        await db.query('DELETE FROM printer_nodes WHERE tenant_id IN ("tenant-a", "tenant-b", "tenant-suspended")');
        await db.query('DELETE FROM tenants WHERE id IN ("tenant-a", "tenant-b", "tenant-suspended")');
        await db.closePool();
    }

    console.log('\n' + '='.repeat(60));
    console.log(`HTTP Route Integration Tests: ${passed} PASSED, ${failed} FAILED`);
    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
