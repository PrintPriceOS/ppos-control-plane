#!/usr/bin/env node
'use strict';

/**
 * test/integration/smoke_phase191d2_http_routes.js
 *
 * Phase 191D.2 — HTTP Integration Test Suite
 *
 * Boots the actual Fastify application in a child process and calls
 * the registered routes over HTTP, verifying:
 *   1. Authentication scenarios (no JWT, malformed JWT, expired JWT, valid roles, suspended status)
 *   2. Route registration (all onboarding routes exist and respond)
 *   3. Tenant isolation (safe cross-tenant access rejection)
 *   4. Payload protection (rejection of protected fields with FIELD_NOT_EDITABLE)
 */

const { spawn } = require('child_process');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const db = require('../../src/api/services/mysqlClient');

const PORT = 4567;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = 'test_secret_for_integration_smoke';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

// Helper to sign JWTs
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

function assertHttp(label, status, expectedStatus, bodyAssert = () => true) {
    if (status === expectedStatus) {
        passed++;
        console.log(`  ✅ HTTP: ${label} (Got ${status})`);
    } else {
        failed++;
        console.error(`  ❌ HTTP: ${label} — Expected status ${expectedStatus}, got ${status}`);
    }
}

async function run() {
    console.log('\n=== Phase 191D.2 HTTP Integration Tests ===\n');

    // ──── Step 1: Seed Test Data ───────────────────────────────────────────
    console.log('Seeding integration test database...');
    // Ensure test db
    const rows = await db.query('SELECT DATABASE() AS db');
    const dbName = rows[0]?.db || '';
    if (!dbName.includes('test')) {
        console.error(`Aborting: Integration test must only run against a test database. Current: ${dbName}`);
        process.exit(1);
    }

    // Cleanup
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

    await db.query(`
        INSERT INTO printer_nodes (id, tenant_id, name, country, city, status, email) 
        VALUES ('site-C', 'tenant-suspended', 'Site C', 'ES', 'Valencia', 'ACTIVE', 'site-c@tenant-c.com')
    `);
    await db.query(`INSERT INTO printhouses (id, tenant_id, name, status) VALUES ('site-C', 'tenant-suspended', 'Site C', 'ACTIVE')`);

    // Seed one machine for Tenant A
    await db.query(`
        INSERT INTO printhouse_machines (id, printhouse_id, tenant_id, machine_name, machine_type, status)
        VALUES ('machine-A1', 'site-A', 'tenant-a', 'Initial Machine A', 'DIGITAL_PRESS', 'ACTIVE')
    `);

    console.log('Test data seeded.');

    // ──── Step 2: Spawn Fastify Server ──────────────────────────────────────
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
        serverProcess.stderr.on('data', (data) => {
            console.error('[SERVER STDERR]:', data.toString());
        });
        // Safety timeout
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
    const tokenExpired = signToken({ id: 'user-exp', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-a' }, '-1s');

    try {
        // ─── 1. Authentication Tests ───
        console.log('\n--- 1. Authentication ---');

        // No JWT
        let res = await fetch(`${BASE_URL}/api/printhouse/onboarding/machines/templates`);
        assertHttp('No JWT returns 401', res.status, 401);

        // Malformed JWT
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/machines/templates`, {
            headers: { 'Authorization': 'Bearer invalid-token-xyz' }
        });
        assertHttp('Malformed JWT returns 401', res.status, 401);

        // Expired JWT
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/machines/templates`, {
            headers: { 'Authorization': `Bearer ${tokenExpired}` }
        });
        assertHttp('Expired JWT returns 401', res.status, 401);

        // Suspended tenant
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/machines/templates`, {
            headers: { 'Authorization': `Bearer ${tokenSuspended}` }
        });
        assertHttp('Suspended tenant returns 403', res.status, 403);

        // Non-Printhouse user (Customer)
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/machines/templates`, {
            headers: { 'Authorization': `Bearer ${tokenCustomer}` }
        });
        assertHttp('Non-Printhouse role returns 403', res.status, 403);

        // Approved administrator
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/machines/templates`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('Valid Printhouse admin returns 200', res.status, 200);

        // ─── 2. Route Registration & Verifications ───
        console.log('\n--- 2. Route Registration ---');

        // GET /api/printhouse/onboarding/machines/templates
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/machines/templates`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('GET /machines/templates exists', res.status, 200);

        // GET /api/printhouse/onboarding/capabilities/types
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/capabilities/types`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('GET /capabilities/types exists', res.status, 200);

        // GET /api/printhouse/onboarding/sites/:siteId/machines
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/machines`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('GET /sites/:siteId/machines exists', res.status, 200);

        // GET /api/printhouse/onboarding/sites/:siteId/machines/:machineId
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/machines/machine-A1`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('GET /sites/:siteId/machines/:machineId exists', res.status, 200);

        // GET /api/printhouse/onboarding/sites/:siteId/capabilities
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/capabilities`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('GET /sites/:siteId/capabilities exists', res.status, 200);

        // GET /api/printhouse/onboarding/capabilities/summary
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/capabilities/summary`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('GET /capabilities/summary exists', res.status, 200);

        // ─── 3. Tenant Isolation ───
        console.log('\n--- 3. Tenant Isolation ---');

        // List foreign site
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-B/machines`, {
            headers: { 'Authorization': `Bearer ${tokenA}` }
        });
        assertHttp('Blocked listing foreign site', res.status, 403);

        // Create in foreign site
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-B/machines`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ machine_name: 'Stolen Machine', machine_type: 'DIGITAL_PRESS' })
        });
        assertHttp('Blocked creating machine in foreign site', res.status, 403);

        // Read foreign machine
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/machines/machine-A1`, {
            headers: { 'Authorization': `Bearer ${tokenB}` }
        });
        assertHttp('Blocked reading foreign machine (returns 404/403)', res.status === 404 || res.status === 403 ? res.status : 0, res.status);

        // Update foreign machine
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/machines/machine-A1`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${tokenB}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ machine_name: 'Hack Name' })
        });
        assertHttp('Blocked updating foreign machine', res.status === 404 || res.status === 403 ? res.status : 0, res.status);

        // ─── 4. Payload Protection ───
        console.log('\n--- 4. Payload Protection (FIELD_NOT_EDITABLE) ---');

        // Send id in POST
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/machines`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: 'custom-id-should-be-generated-by-server',
                machine_name: 'Protected Field Press',
                machine_type: 'DIGITAL_PRESS'
            })
        });
        assertHttp('POST with id returns 400', res.status, 400);
        const postErr = await res.json();
        assert.strictEqual(postErr.error, 'FIELD_NOT_EDITABLE');
        assert(postErr.fields.includes('id'));
        console.log('✓ Rejection contains violating field: "id"');

        // Send tenant_id in PUT
        res = await fetch(`${BASE_URL}/api/printhouse/onboarding/sites/site-A/machines/machine-A1`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tenant_id: 'malicious-new-tenant'
            })
        });
        assertHttp('PUT with tenant_id returns 400', res.status, 400);
        const putErr = await res.json();
        assert.strictEqual(putErr.error, 'FIELD_NOT_EDITABLE');
        assert(putErr.fields.includes('tenant_id'));
        console.log('✓ Rejection contains violating field: "tenant_id"');

    } catch (err) {
        console.error('Test execution error:', err);
        failed++;
    } finally {
        console.log('\nStopping Fastify server...');
        serverProcess.kill('SIGTERM');
        
        console.log('Cleaning up database...');
        await db.query('DELETE FROM printhouse_machines WHERE tenant_id IN ("tenant-A", "tenant-B", "tenant-Suspended")');
        await db.query('DELETE FROM printhouses WHERE tenant_id IN ("tenant-A", "tenant-B", "tenant-Suspended")');
        await db.query('DELETE FROM printer_nodes WHERE tenant_id IN ("tenant-A", "tenant-B", "tenant-Suspended")');
        await db.query('DELETE FROM tenants WHERE id IN ("tenant-A", "tenant-B", "tenant-Suspended")');
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
