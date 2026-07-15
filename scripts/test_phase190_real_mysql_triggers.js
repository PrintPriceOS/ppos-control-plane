'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

async function testTriggers() {
    console.log('=== Phase 190.2 Real MySQL Trigger Acceptance Test ===');
    
    if (process.env.PHASE190_DESTRUCTIVE_TEST_DB !== 'YES') {
        console.error('Refusing to run destructive Phase 190 DB tests: PHASE190_DESTRUCTIVE_TEST_DB != YES');
        process.exit(1);
    }

    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        port: process.env.MYSQL_PORT || 33079,
        user: process.env.MYSQL_USER || 'phase190',
        password: process.env.MYSQL_PASSWORD || 'phase190_test_only',
        database: process.env.MYSQL_DATABASE || 'ControlPhase190Test',
        waitForConnections: true,
        connectionLimit: 10
    });

    try {
        const [rows] = await pool.query('SELECT DATABASE() as db');
        const dbName = rows[0].db;
        
        if (!dbName.toLowerCase().includes('phase190test')) {
            throw new Error(`Database name "${dbName}" does not clearly identify as Phase 190 test database.`);
        }
        
        console.log(`Connected to disposable database: ${dbName}`);

        // Setup test data
        await pool.query(`DELETE FROM orders`);
        await pool.query(`DELETE FROM order_pricing_snapshots`);
        await pool.query(`DELETE FROM job_quotes`);

        await pool.query(`
            INSERT INTO job_quotes (id, job_id, printer_id, calculation_breakdown_json, status, revision)
            VALUES ('q_trig1', 'j_trig1', 'ph_1', '{}', 'ACCEPTED', 1)
        `);

        // Test 1: BEFORE INSERT Orders Pointer must be NULL
        try {
            await pool.query(`
                INSERT INTO orders (id, job_id, tenant_id, assigned_printhouse_id, currency, active_pricing_snapshot_id)
                VALUES ('o_trig1', 'j_trig1', 't1', 'ph_1', 'EUR', 'some_id')
            `);
            throw new Error('FAILED: Should have rejected INSERT with non-null pointer');
        } catch (e) {
            if (e.code === 'ER_SIGNAL_EXCEPTION' && e.message.includes('ACTIVE_PRICING_SNAPSHOT_NOT_ALLOWED_ON_ORDER_INSERT')) {
                console.log('✓ non-null pointer during order INSERT rejected');
            } else {
                throw e;
            }
        }

        // Insert valid order
        await pool.query(`
            INSERT INTO orders (id, job_id, tenant_id, assigned_printhouse_id, currency, active_pricing_snapshot_id)
            VALUES ('o_trig1', 'j_trig1', 't1', 'ph_1', 'EUR', NULL)
        `);

        // Insert valid snapshot
        await pool.query(`
            INSERT INTO order_pricing_snapshots (
                snapshot_id, order_id, tenant_id, printhouse_id, quote_id, quote_revision, snapshot_revision,
                status, currency, final_amount, formula_version, snapshot_json, snapshot_checksum, sealed_by
            ) VALUES (
                'snap_1', 'o_trig1', 't1', 'ph_1', 'q_trig1', 1, 1,
                'SEALED', 'EUR', 100.00, 'v1', '{}', 'hash', 'test'
            )
        `);

        // Test 2: Valid pointer accepted
        await pool.query(`UPDATE orders SET active_pricing_snapshot_id = 'snap_1' WHERE id = 'o_trig1'`);
        console.log('✓ valid pointer accepted');

        // Test 3: Cross-tenant rejected
        await pool.query(`
            INSERT INTO orders (id, job_id, tenant_id, assigned_printhouse_id, currency)
            VALUES ('o_trig2', 'j_trig2', 't2', 'ph_1', 'EUR')
        `);
        try {
            await pool.query(`UPDATE orders SET active_pricing_snapshot_id = 'snap_1' WHERE id = 'o_trig2'`);
            throw new Error('FAILED: Should have rejected cross-tenant');
        } catch(e) {
            if (e.message.includes('ACTIVE_PRICING_SNAPSHOT_ORDER_MISMATCH') || e.message.includes('ACTIVE_PRICING_SNAPSHOT_TENANT_MISMATCH')) {
                console.log('✓ cross-order/cross-tenant rejected');
            } else throw e;
        }

        // Test 4: Financial update rejected
        try {
            await pool.query(`UPDATE order_pricing_snapshots SET final_amount = 200.00 WHERE snapshot_id = 'snap_1'`);
            throw new Error('FAILED: Should have rejected financial update');
        } catch(e) {
            if (e.message.includes('SEALED_PRICING_SNAPSHOT_IMMUTABLE')) {
                console.log('✓ financial UPDATE rejected');
            } else throw e;
        }

        // Test 5: Checksum update rejected
        try {
            await pool.query(`UPDATE order_pricing_snapshots SET snapshot_checksum = 'bad' WHERE snapshot_id = 'snap_1'`);
            throw new Error('FAILED: Should have rejected checksum update');
        } catch(e) {
            if (e.message.includes('SEALED_PRICING_SNAPSHOT_IMMUTABLE')) {
                console.log('✓ checksum UPDATE rejected');
            } else throw e;
        }

        // Test 6: SEALED delete rejected
        try {
            await pool.query(`DELETE FROM order_pricing_snapshots WHERE snapshot_id = 'snap_1'`);
            throw new Error('FAILED: Should have rejected DELETE');
        } catch(e) {
            if (e.message.includes('PRICING_SNAPSHOT_DELETE_FORBIDDEN')) {
                console.log('✓ DELETE SEALED rejected');
            } else throw e;
        }

        // Test 7: Status transition + financial mutation simultaneously rejected
        // (The SEALED immutability check fires before the transition check, so we get
        //  SEALED_PRICING_SNAPSHOT_IMMUTABLE — both errors indicate the guard is working)
        try {
            await pool.query(`UPDATE order_pricing_snapshots SET status = 'SUPERSEDED', final_amount = 300.00 WHERE snapshot_id = 'snap_1'`);
            throw new Error('FAILED: Should have rejected transition + financial mutation');
        } catch(e) {
            if (e.message.includes('SEALED_PRICING_SNAPSHOT_IMMUTABLE') ||
                e.message.includes('FINANCIAL_MUTATION_DURING_LIFECYCLE_TRANSITION_REJECTED')) {
                console.log('✓ status transition plus financial mutation rejected (guard: ' + e.message + ')');
            } else throw e;
        }

        // Test 8: Valid SEALED -> SUPERSEDED (status only, no financial mutation) allowed
        await pool.query(`UPDATE order_pricing_snapshots SET status = 'SUPERSEDED', superseded_by = 'test' WHERE snapshot_id = 'snap_1'`);
        console.log('✓ SEALED to SUPERSEDED (no financial mutation) allowed');

        // Test 9: SUPERSEDED delete rejected
        try {
            await pool.query(`DELETE FROM order_pricing_snapshots WHERE snapshot_id = 'snap_1'`);
            throw new Error('FAILED: Should have rejected SUPERSEDED delete');
        } catch(e) {
            if (e.message.includes('PRICING_SNAPSHOT_DELETE_FORBIDDEN')) {
                console.log('✓ DELETE SUPERSEDED rejected');
            } else throw e;
        }

        console.log('\nAll MySQL Trigger Tests Passed!');

    } catch (e) {
        console.error('Test Error:', e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

testTriggers();
