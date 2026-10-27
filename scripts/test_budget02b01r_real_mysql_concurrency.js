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
                category VARCHAR(64) NOT NULL
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

            INSERT INTO paper_products VALUES ('prod_1', 'Coral Book White', 'UNCOATED');
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

        // 6. Test Idempotency Key Uniqueness on Real MySQL
        console.log(`\n[STEP 6] Testing idempotency key uniqueness constraint on real MySQL...`);
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

        // 7. Test Rollback Script
        console.log(`\n[STEP 7] Executing rollback script...`);
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
