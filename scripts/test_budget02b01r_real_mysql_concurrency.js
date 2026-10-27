/**
 * scripts/test_budget02b01r_real_mysql_concurrency.js
 * 
 * PrintPrice OS — BUDGET-02B-01R: Real MySQL 8 Concurrency & Idempotency Certification Script.
 * 
 * Tests real InnoDB multi-connection behavior against MySQL 8.0:
 * 1. Creates ephemeral database `ppos_ephemeral_budget02b01r`.
 * 2. Applies migration 167 with stored generated column `active_role_slot` & `uk_opd_active_role`.
 * 3. Simulates parallel concurrent inserts across two independent MySQL connections.
 * 4. Proves that NEVER can two ACTIVE decisions exist for the same (tenant, order_intent, paper_role).
 * 5. Proves persistent idempotency key uniqueness (uk_opd_idempotency).
 * 6. Executes safe rollback script.
 */

'use strict';

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysqlClient = require('../src/api/services/mysqlClient');
const orderPaperDecisionService = require('../src/api/services/orderPaperDecisionService');

const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const MYSQL_PORT = parseInt(process.env.MYSQL_PORT || '3306');
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'ci_test_password';
const EPHEMERAL_DB = 'ppos_ephemeral_budget02b01r';

async function runRealConcurrencyCertification() {
    console.log('=== BUDGET-02B-01R: CERTIFICACIÓN REAL DE CONCURRENCIA E IDEMPOTENCIA EN MYSQL 8 ===\n');
    console.log(`Connecting to MySQL 8.0 at ${MYSQL_HOST}:${MYSQL_PORT} (User: ${MYSQL_USER})...`);

    let adminConn;
    try {
        adminConn = await mysql.createConnection({
            host: MYSQL_HOST,
            port: MYSQL_PORT,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            multipleStatements: true
        });
    } catch (err) {
        console.warn(`[SKIP] MySQL 8.0 server not reachable at ${MYSQL_HOST}:${MYSQL_PORT}: ${err.message}`);
        console.log('[INFO] This script is designed for live MySQL environments and executes automatically in GitHub Actions CI.');
        return;
    }

    try {
        const [verRows] = await adminConn.query('SELECT VERSION() as version');
        console.log(`[PASS] MySQL Server Version: ${verRows[0].version}`);

        // 1. Create ephemeral database
        console.log(`\n[STEP 1] Creating ephemeral database: ${EPHEMERAL_DB}...`);
        await adminConn.query(`DROP DATABASE IF EXISTS ${EPHEMERAL_DB}`);
        await adminConn.query(`CREATE DATABASE ${EPHEMERAL_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await adminConn.query(`USE ${EPHEMERAL_DB}`);
        console.log(`[PASS] Ephemeral database ready.`);

        // 2. Create prerequisite schema (paper_products, paper_variants, orders)
        console.log(`\n[STEP 2] Creating baseline tables for foreign keys...`);
        await adminConn.query(`
            CREATE TABLE paper_products (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(64) NOT NULL,
                brand VARCHAR(64) NULL
            ) ENGINE=InnoDB;

            CREATE TABLE paper_variants (
                id VARCHAR(64) PRIMARY KEY,
                product_id VARCHAR(64) NOT NULL,
                gsm INT NOT NULL,
                width_mm DECIMAL(10,2) NOT NULL,
                height_mm DECIMAL(10,2) NOT NULL,
                finish VARCHAR(64) NULL,
                FOREIGN KEY (product_id) REFERENCES paper_products(id)
            ) ENGINE=InnoDB;

            CREATE TABLE orders (
                id VARCHAR(64) PRIMARY KEY,
                order_ref VARCHAR(64) NOT NULL,
                tenant_id VARCHAR(64) NOT NULL,
                offer_print_house VARCHAR(64) NOT NULL,
                offer_price DECIMAL(14,2) NOT NULL,
                status VARCHAR(32) NOT NULL
            ) ENGINE=InnoDB;

            INSERT INTO paper_products VALUES ('prod_1', 'Coral Book White', 'UNCOATED', 'Coral');
            INSERT INTO paper_variants VALUES ('var_coral_90', 'prod_1', 90, 700.0, 1000.0, 'MATTE');
            INSERT INTO paper_variants VALUES ('var_creator_115', 'prod_1', 115, 700.0, 1000.0, 'SILK');
            INSERT INTO orders VALUES ('ord_1', 'job_bpe_1782', 'tenant_books_es', 'print_madrid', 1782.30, 'IN_PREPARATION');
        `);
        console.log(`[PASS] Baseline catalog and orders created.`);

        // 3. Apply migration 167
        const migrationPath = path.resolve(__dirname, '../migrations/167_phase196f_order_paper_decisions.sql');
        console.log(`\n[STEP 3] Applying migration 167: ${migrationPath}...`);
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        await adminConn.query(migrationSql);
        console.log(`[PASS] Migration 167 applied successfully.`);

        // 4. Verify columns and stored generated constraint
        console.log(`\n[STEP 4] Verifying stored generated column active_role_slot and indexes...`);
        const [colRows] = await adminConn.query(`
            SELECT COLUMN_NAME, GENERATION_EXPRESSION, EXTRA 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = '${EPHEMERAL_DB}' 
              AND TABLE_NAME = 'order_paper_decisions' 
              AND COLUMN_NAME = 'active_role_slot'
        `);
        if (colRows.length === 0) {
            throw new Error('Column active_role_slot not found in order_paper_decisions');
        }
        console.log(`[PASS] Stored generated column verified: ${colRows[0].GENERATION_EXPRESSION} (${colRows[0].EXTRA})`);

        // 5. Real Concurrency Test with 2 Independent MySQL Connections
        console.log(`\n[STEP 5] Testing parallel concurrency with 2 independent MySQL connections...`);
        const connA = await mysql.createConnection({
            host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: EPHEMERAL_DB
        });
        const connB = await mysql.createConnection({
            host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: EPHEMERAL_DB
        });

        const insertDecisionSql = `
            INSERT INTO order_paper_decisions (
                id, tenant_id, external_order_intent_id, canonical_order_id, printhouse_tenant_id,
                operator_id, paper_role, requested_variant_id, decision_action, alternative_variant_id,
                snapshot_requested_gsm, snapshot_requested_width_mm, snapshot_requested_height_mm,
                snapshot_requested_finish, snapshot_requested_category,
                estimated_cost_delta, currency, economic_status,
                decision_number, status, idempotency_key, payload_fingerprint
            ) VALUES (?, 'tenant_books_es', 'intent_conc_test', 'job_bpe_1782', 'print_madrid',
                'op_1', 'INTERIOR', 'var_coral_90', 'CONFIRM', NULL,
                90, 700, 1000, 'MATTE', 'UNCOATED',
                0.0000, 'EUR', 'DELTA_ZERO_CONFIRMED',
                1, 'ACTIVE', ?, 'fp_test')
        `;

        let connASucceeded = false;
        let connBSucceeded = false;
        let dupEntryCaught = false;

        // Execute parallel inserts trying to create ACTIVE decisions simultaneously
        const [resA, resB] = await Promise.allSettled([
            connA.query(insertDecisionSql, ['dec_a_' + Date.now(), 'key_a_' + Date.now()]),
            connB.query(insertDecisionSql, ['dec_b_' + Date.now(), 'key_b_' + Date.now()])
        ]);

        if (resA.status === 'fulfilled') connASucceeded = true;
        else if (resA.reason && resA.reason.code === 'ER_DUP_ENTRY') dupEntryCaught = true;

        if (resB.status === 'fulfilled') connBSucceeded = true;
        else if (resB.reason && resB.reason.code === 'ER_DUP_ENTRY') dupEntryCaught = true;

        console.log(`Connection A result: ${resA.status === 'fulfilled' ? 'SUCCESS' : resA.reason.code}`);
        console.log(`Connection B result: ${resB.status === 'fulfilled' ? 'SUCCESS' : resB.reason.code}`);

        // Count how many ACTIVE decisions exist in the database
        const [activeRows] = await adminConn.query(`
            SELECT COUNT(*) as active_count 
            FROM order_paper_decisions 
            WHERE tenant_id = 'tenant_books_es' 
              AND external_order_intent_id = 'intent_conc_test' 
              AND paper_role = 'INTERIOR' 
              AND status = 'ACTIVE'
        `);
        const activeCount = activeRows[0].active_count;
        console.log(`[PASS] Total ACTIVE decisions for role in database: ${activeCount}`);

        if (activeCount !== 1) {
            throw new Error(`CRITICAL CONCURRENCY FAILURE: Expected exactly 1 ACTIVE decision, found ${activeCount}`);
        }
        console.log(`[PASS] MySQL 8 uk_opd_active_role physically prevented duplicate active decisions!`);

        await connA.end();
        await connB.end();

        // 6. Real MySQL 8 Order Cancellation & Reassignment Race Under Row Lock (R-02)
        console.log(`\n[STEP 6] Testing Order Cancellation & Reassignment Race Under Row Lock (R-02)...`);
        await adminConn.query(`
            INSERT INTO orders VALUES 
            ('ord_race_cancel', 'job_race_cancel', 'tenant_books_es', 'print_madrid', 1782.30, 'IN_PREPARATION'),
            ('ord_race_reassign', 'job_race_reassign', 'tenant_books_es', 'print_madrid', 1782.30, 'IN_PREPARATION')
        `);

        const raceConn1 = await mysql.createConnection({
            host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: EPHEMERAL_DB
        });
        const raceConn2 = await mysql.createConnection({
            host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: EPHEMERAL_DB
        });

        // Test 6.1: Cancellation Race
        console.log('Testing cancellation race: Conn 1 cancels while Conn 2 acquires lock...');
        await raceConn1.beginTransaction();
        await raceConn1.query(`SELECT id, status FROM orders WHERE id = 'ord_race_cancel' FOR UPDATE`);
        await raceConn1.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = 'ord_race_cancel'`);

        // Conn 2 starts in parallel; will block on orders row lock until Conn 1 commits
        let conn2LockedStatus = null;
        let conn2RejectedWithIneligible = false;
        const conn2Promise = (async () => {
            await raceConn2.beginTransaction();
            const [lockedRows] = await raceConn2.query(
                `SELECT id, order_ref, tenant_id, offer_print_house, offer_price, status 
                 FROM orders 
                 WHERE id = 'ord_race_cancel' 
                 FOR UPDATE`
            );
            conn2LockedStatus = lockedRows[0].status;
            if (lockedRows[0].status === 'CANCELLED') {
                conn2RejectedWithIneligible = true;
                await raceConn2.rollback();
            } else {
                // Should never happen because Conn 1 cancelled it
                await raceConn2.query(insertDecisionSql, ['dec_cancelled_' + Date.now(), 'key_cancelled_' + Date.now()]);
                await raceConn2.commit();
            }
        })();

        // Give conn 2 time to queue behind row lock, then commit conn 1
        await new Promise(r => setTimeout(r, 50));
        await raceConn1.commit();
        await conn2Promise;

        console.log(`[PASS] Conn 2 read locked order status: '${conn2LockedStatus}'`);
        if (!conn2RejectedWithIneligible) {
            throw new Error('CRITICAL R-02 FAILURE: Conn 2 failed to reject cancelled order under lock');
        }
        const [cancelDecRows] = await adminConn.query(
            `SELECT COUNT(*) as cnt FROM order_paper_decisions WHERE canonical_order_id = 'job_race_cancel'`
        );
        if (cancelDecRows[0].cnt !== 0) {
            throw new Error('CRITICAL R-02 FAILURE: Decision was written for cancelled order');
        }
        console.log(`[PASS] Zero decisions recorded for cancelled order under lock race.`);

        // Test 6.2: Reassignment Race
        console.log('Testing reassignment race: Conn 1 reassigns while Conn 2 acquires lock...');
        await raceConn1.beginTransaction();
        await raceConn1.query(`SELECT id, offer_print_house FROM orders WHERE id = 'ord_race_reassign' FOR UPDATE`);
        await raceConn1.query(`UPDATE orders SET offer_print_house = 'print_barcelona' WHERE id = 'ord_race_reassign'`);

        let conn2LockedPrinthouse = null;
        let conn2RejectedWithUnauthorized = false;
        const conn2ReassignPromise = (async () => {
            await raceConn2.beginTransaction();
            const [lockedRows] = await raceConn2.query(
                `SELECT id, order_ref, tenant_id, offer_print_house, offer_price, status 
                 FROM orders 
                 WHERE id = 'ord_race_reassign' 
                 FOR UPDATE`
            );
            conn2LockedPrinthouse = lockedRows[0].offer_print_house;
            // Caller printhouse was 'print_madrid'; order was reassigned to 'print_barcelona'
            if (lockedRows[0].offer_print_house !== 'print_madrid') {
                conn2RejectedWithUnauthorized = true;
                await raceConn2.rollback();
            } else {
                await raceConn2.commit();
            }
        })();

        await new Promise(r => setTimeout(r, 50));
        await raceConn1.commit();
        await conn2ReassignPromise;

        console.log(`[PASS] Conn 2 read locked printhouse: '${conn2LockedPrinthouse}'`);
        if (!conn2RejectedWithUnauthorized) {
            throw new Error('CRITICAL R-02 FAILURE: Conn 2 failed to reject reassigned order under lock');
        }
        const [reassignDecRows] = await adminConn.query(
            `SELECT COUNT(*) as cnt FROM order_paper_decisions WHERE canonical_order_id = 'job_race_reassign'`
        );
        if (reassignDecRows[0].cnt !== 0) {
            throw new Error('CRITICAL R-02 FAILURE: Decision was written for reassigned order');
        }
        console.log(`[PASS] Zero decisions recorded for reassigned order under lock race.`);

        await raceConn1.end();
        await raceConn2.end();

        // 6.3: Integrated Real Service Concurrency & Idempotent Replay Race against Order Cancellation
        console.log('\n[STEP 6.3] Testing orderPaperDecisionService.recordDecision integrated replay race against order cancellation...');
        const savedDatabaseUrl = process.env.DATABASE_URL;
        const ephemeralDatabaseUrl = `mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/${EPHEMERAL_DB}`;
        process.env.DATABASE_URL = ephemeralDatabaseUrl;
        process.env.MYSQL_HOST = MYSQL_HOST;
        process.env.MYSQL_PORT = String(MYSQL_PORT);
        process.env.MYSQL_USER = MYSQL_USER;
        process.env.MYSQL_PASSWORD = MYSQL_PASSWORD;
        process.env.MYSQL_DATABASE = EPHEMERAL_DB;
        await mysqlClient.closePool();

        // Setup orders for service replay race
        await adminConn.query(`
            INSERT INTO orders VALUES 
            ('ord_svc_cancel', 'job_svc_cancel', 'tenant_books_es', 'print_madrid', 1782.30, 'IN_PREPARATION'),
            ('ord_svc_reassign', 'job_svc_reassign', 'tenant_books_es', 'print_madrid', 1782.30, 'IN_PREPARATION')
        `);

        // Record initial decision for ord_svc_cancel via real service
        const initialCancelDecision = await orderPaperDecisionService.recordDecision({
            tenantId: 'tenant_books_es',
            printhouseId: 'print_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_svc_cancel',
            externalOrderIntentId: 'intent_svc_cancel_01',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90',
            idempotencyKey: 'idem_svc_cancel_key'
        });
        console.log(`[PASS] Initial decision recorded via real service: id=${initialCancelDecision.id}, replay=${initialCancelDecision.idempotent_replay}`);

        // Start cancellation transaction on raw connection to hold exclusive lock
        const lockConn = await mysql.createConnection({
            host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: EPHEMERAL_DB
        });
        await lockConn.beginTransaction();
        await lockConn.query(`SELECT id FROM orders WHERE id = 'ord_svc_cancel' FOR UPDATE`);
        await lockConn.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = 'ord_svc_cancel'`);

        // Concurrently invoke orderPaperDecisionService.recordDecision with the replay key
        let replayCancelErr = null;
        const replayCancelPromise = orderPaperDecisionService.recordDecision({
            tenantId: 'tenant_books_es',
            printhouseId: 'print_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_svc_cancel',
            externalOrderIntentId: 'intent_svc_cancel_01',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90',
            idempotencyKey: 'idem_svc_cancel_key'
        }).catch(err => {
            replayCancelErr = err;
        });

        // Give the service call 50ms to queue behind the row lock
        await new Promise(r => setTimeout(r, 50));
        // Commit cancellation to release row lock
        await lockConn.commit();
        await replayCancelPromise;

        if (!replayCancelErr || replayCancelErr.code !== 'ORDER_INELIGIBLE' || replayCancelErr.statusCode !== 422) {
            throw new Error(`CRITICAL: Replay service call failed to reject cancelled order under lock: ${replayCancelErr ? replayCancelErr.message : 'No error'}`);
        }
        console.log(`[PASS] Replay service call correctly rejected under lock with 422 ORDER_INELIGIBLE: ${replayCancelErr.message}`);

        // 6.4: Integrated Real Service Concurrency & Idempotent Replay Race against Printhouse Reassignment
        console.log('\n[STEP 6.4] Testing orderPaperDecisionService.recordDecision integrated replay race against printhouse reassignment...');
        // Record initial decision for ord_svc_reassign via real service
        const initialReassignDecision = await orderPaperDecisionService.recordDecision({
            tenantId: 'tenant_books_es',
            printhouseId: 'print_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_svc_reassign',
            externalOrderIntentId: 'intent_svc_reassign_01',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90',
            idempotencyKey: 'idem_svc_reassign_key'
        });
        console.log(`[PASS] Initial decision recorded via real service: id=${initialReassignDecision.id}, replay=${initialReassignDecision.idempotent_replay}`);

        // Start reassignment transaction on raw connection to hold lock
        await lockConn.beginTransaction();
        await lockConn.query(`SELECT id FROM orders WHERE id = 'ord_svc_reassign' FOR UPDATE`);
        await lockConn.query(`UPDATE orders SET offer_print_house = 'print_malaga' WHERE id = 'ord_svc_reassign'`);

        // Concurrently invoke orderPaperDecisionService.recordDecision from print_madrid with the replay key
        let replayReassignErr = null;
        const replayReassignPromise = orderPaperDecisionService.recordDecision({
            tenantId: 'tenant_books_es',
            printhouseId: 'print_madrid',
            operatorId: 'operator_carlos',
            jobId: 'job_svc_reassign',
            externalOrderIntentId: 'intent_svc_reassign_01',
            paperRole: 'INTERIOR',
            decisionAction: 'CONFIRM',
            requestedVariantId: 'var_coral_90',
            idempotencyKey: 'idem_svc_reassign_key'
        }, { isSuperAdmin: false }).catch(err => {
            replayReassignErr = err;
        });

        // Give the service call 50ms to queue behind the row lock
        await new Promise(r => setTimeout(r, 50));
        // Commit reassignment to release row lock
        await lockConn.commit();
        await replayReassignPromise;

        if (!replayReassignErr || replayReassignErr.code !== 'PRINTHOUSE_UNAUTHORIZED' || replayReassignErr.statusCode !== 403) {
            throw new Error(`CRITICAL: Replay service call failed to reject reassigned order under lock: ${replayReassignErr ? replayReassignErr.message : 'No error'}`);
        }
        console.log(`[PASS] Replay service call correctly rejected under lock with 403 PRINTHOUSE_UNAUTHORIZED: ${replayReassignErr.message}`);

        await lockConn.end();

        // 6.5: Economic Quote Invariant Verification
        console.log('\n[STEP 6.5] Verifying strict BPE economic quote preservation (1.782,30 €)...');
        const [allOrders] = await adminConn.query(`SELECT id, order_ref, offer_price FROM orders`);
        for (const ord of allOrders) {
            if (Number(ord.offer_price) !== 1782.30) {
                throw new Error(`CRITICAL: Order ${ord.id} (${ord.order_ref}) price was mutated: ${ord.offer_price}`);
            }
        }
        console.log(`[PASS] All orders maintained exact 1.782,30 € quote invariant without mutation.`);
        await mysqlClient.closePool();
        if (savedDatabaseUrl) {
            process.env.DATABASE_URL = savedDatabaseUrl;
        } else {
            delete process.env.DATABASE_URL;
        }

        // 7. Test Idempotency Key Uniqueness on Real MySQL
        console.log(`\n[STEP 7] Testing idempotency key uniqueness constraint on real MySQL...`);
        let idempotencyDupCaught = false;
        try {
            await adminConn.query(insertDecisionSql, ['dec_c_' + Date.now(), 'idem_duplicate_key']);
            await adminConn.query(insertDecisionSql, ['dec_d_' + Date.now(), 'idem_duplicate_key']);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                idempotencyDupCaught = true;
                console.log(`[PASS] Real MySQL rejected duplicate idempotency key with ER_DUP_ENTRY.`);
            }
        }
        if (!idempotencyDupCaught) {
            throw new Error('Expected ER_DUP_ENTRY for duplicate idempotency key on real MySQL');
        }

        // 8. Test Rollback Script
        console.log(`\n[STEP 8] Executing rollback script...`);
        const rollbackPath = path.resolve(__dirname, '../migrations/rollback/rollback_167_phase196f_order_paper_decisions.sql');
        const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
        await adminConn.query(rollbackSql);
        const [postRollbackRows] = await adminConn.query(`SHOW TABLES LIKE 'order_paper_decisions'`);
        if (postRollbackRows.length === 0) {
            console.log(`[PASS] Table order_paper_decisions dropped cleanly by rollback script.`);
        } else {
            throw new Error('Table order_paper_decisions still exists after rollback');
        }

        // 8. Clean up ephemeral DB
        await adminConn.query(`DROP DATABASE IF EXISTS ${EPHEMERAL_DB}`);
        console.log(`\n[PASS] Ephemeral database cleaned up.`);
        console.log(`\n=== REAL MYSQL 8 CONCURRENCY CERTIFICATION: 100% SUCCESS ===\n`);

    } finally {
        await adminConn.end();
    }
}

if (require.main === module) {
    runRealConcurrencyCertification().catch(err => {
        console.error('Certification failed:', err);
        process.exit(1);
    });
}

module.exports = { runRealConcurrencyCertification };
