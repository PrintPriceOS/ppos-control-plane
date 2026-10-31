// scripts/verify_db_isolation.js
// Verification script to prove MySQL constraints natively prevent tenant-site cross-association.

require('dotenv').config();
const db = require('../src/api/services/mysqlClient');

async function run() {
    console.log('=== Database-Level Tenant Isolation Constraint Verification ===');
    
    // Ensure we are connected to a test DB
    const pool = db.getPool();
    const [dbNameRow] = await pool.query('SELECT DATABASE() AS db');
    const dbName = dbNameRow[0]?.db || '';
    if (!dbName.includes('test')) {
        console.error(`Aborting: Verification must only run against a test database. Current: ${dbName}`);
        process.exit(1);
    }

    let testPassed = false;
    let cleanupNeeded = true;

    try {
        // Cleanup pre-existing test data if any
        await pool.query('DELETE FROM printhouse_machines WHERE tenant_id IN ("tenant-A", "tenant-B")');
        await pool.query('DELETE FROM printhouses WHERE id = "site-A"');
        await pool.query('DELETE FROM printer_nodes WHERE id = "site-A"');
        await pool.query('DELETE FROM tenants WHERE id IN ("tenant-A", "tenant-B")');

        console.log('Step 1: Creating Tenant A and Site A...');
        await pool.query(
            `INSERT INTO tenants (id, name, status, plan) VALUES ('tenant-A', 'Tenant A', 'ACTIVE', 'PRO')`
        );
        await pool.query(
            `INSERT INTO printer_nodes (id, tenant_id, name, country, city, status, email) 
             VALUES ('site-A', 'tenant-A', 'Site A', 'ES', 'Madrid', 'ACTIVE', 'site-a@tenant-a.com')`
        );
        await pool.query(
            `INSERT INTO printhouses (id, tenant_id, name, status) VALUES ('site-A', 'tenant-A', 'Site A', 'ACTIVE')`
        );

        console.log('Step 2: Creating Tenant B...');
        await pool.query(
            `INSERT INTO tenants (id, name, status, plan) VALUES ('tenant-B', 'Tenant B', 'ACTIVE', 'PRO')`
        );

        console.log('Step 3: Attempting to insert Machine linked to Site A (Tenant A) but owned by Tenant B...');
        try {
            await pool.query(
                `INSERT INTO printhouse_machines (id, printhouse_id, tenant_id, machine_name, machine_type, status) 
                 VALUES ('mach-violator', 'site-A', 'tenant-B', 'Violating Machine', 'DIGITAL_PRESS', 'ACTIVE')`
            );
            console.error('❌ FAILURE: MySQL accepted cross-tenant association! Constraints are missing or broken.');
        } catch (err) {
            if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
                console.log('✅ SUCCESS: MySQL natively rejected the insert due to foreign key constraints!');
                console.log(`   Error: ${err.message}`);
                testPassed = true;
            } else {
                console.error(`❌ FAILURE: Insert failed but with an unexpected error: ${err.message}`);
            }
        }
    } catch (err) {
        console.error('Unexpected error during verification execution:', err);
    } finally {
        if (cleanupNeeded) {
            console.log('Step 4: Cleaning up verification test data...');
            try {
                await pool.query('DELETE FROM printhouse_machines WHERE tenant_id IN ("tenant-A", "tenant-B")');
                await pool.query('DELETE FROM printhouses WHERE id = "site-A"');
                await pool.query('DELETE FROM printer_nodes WHERE id = "site-A"');
                await pool.query('DELETE FROM tenants WHERE id IN ("tenant-A", "tenant-B")');
                console.log('   Cleanup completed.');
            } catch (cleanupErr) {
                console.error('   Cleanup failed:', cleanupErr.message);
            }
        }
        await db.closePool();
        process.exit(testPassed ? 0 : 1);
    }
}

run();
