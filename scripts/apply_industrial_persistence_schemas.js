'use strict';

/**
 * scripts/apply_industrial_persistence_schemas.js
 *
 * Phase 184G Industrial Persistence Executor for CI and disposable environments.
 *
 * Purpose:
 * Safely applies the extracted Phase 184G structural DDL schemas:
 *   1. phase184g_manufacturing_persistence_schema.up(db)
 *   2. phase184g_industrial_provisioning_schema.up(db)
 *
 * Design Guarantees:
 * 1. Executes strictly after migration 163 has completed.
 * 2. Protected by ephemeral isolation guards (non-production, disposable name, localhost/CI).
 * 3. Does NOT insert records into schema_versions (zero ledger alteration).
 * 4. Structural validation and post-condition checks.
 * 5. Full error propagation with no silent masking of unexpected SQL errors.
 */

require('dotenv').config();
const mysqlClient = require('../src/api/services/mysqlClient');
const mfgSchema = require('../src/migrations/phase184g_manufacturing_persistence_schema');
const provSchema = require('../src/migrations/phase184g_industrial_provisioning_schema');

/**
 * Verification of ephemeral isolation guards.
 */
function checkEphemeralIsolation(env = process.env) {
    if (env.NODE_ENV === 'production') {
        return { ok: false, reason: 'Strictly FORBIDDEN in NODE_ENV=production' };
    }

    if (env.PPOS_CI_EPHEMERAL_FIXTURES !== 'true') {
        return { ok: false, reason: 'PPOS_CI_EPHEMERAL_FIXTURES flag is not enabled' };
    }

    const isCiEnvironment = env.GITHUB_ACTIONS === 'true' || env.CI === 'true';
    if (!isCiEnvironment) {
        return { ok: false, reason: 'Execution rejected: Requires accredited CI environment (GITHUB_ACTIONS=true or CI=true)' };
    }

    let host = env.MYSQL_HOST || 'localhost';
    let database = env.MYSQL_DATABASE || '';

    if (env.DATABASE_URL) {
        try {
            const parsed = new URL(env.DATABASE_URL);
            host = parsed.hostname;
            database = parsed.pathname.replace(/^\//, '');
        } catch (e) {
            return { ok: false, reason: 'Invalid DATABASE_URL format' };
        }
    }

    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocal) {
        return { ok: false, reason: `Rejected non-local host: ${host}` };
    }

    const FORBIDDEN_DB_NAMES = ['ppos_production', 'ppos_prod', 'printpriceos', 'printpriceos_prod', 'production', 'prod'];
    const dbLower = (database || '').toLowerCase();
    if (!dbLower || FORBIDDEN_DB_NAMES.includes(dbLower)) {
        return { ok: false, reason: `Database name '${database}' is empty or blocked as production` };
    }

    const isDisposable = dbLower.includes('ci') || dbLower.includes('test') || dbLower.includes('ephemeral') || dbLower.includes('tmp');
    if (!isDisposable) {
        return { ok: false, reason: `Database '${database}' does not match disposable ephemeral naming pattern ('ci', 'test', 'ephemeral', 'tmp')` };
    }

    return { ok: true, host, database };
}

/**
 * Validates postconditions: critical tables must exist after 184G application.
 */
async function verifyPostconditions(db) {
    const requiredTables = [
        'print_nodes',
        'node_heartbeats',
        'print_node_machine_profiles',
        'manufacturing_packages',
        'manufacturing_dispatches',
        'manufacturing_capacity_reservations',
        'manufacturing_dispatch_events',
        'federation_factories',
        'live_capacity_snapshots'
    ];

    for (const table of requiredTables) {
        const rows = await db.query(
            'SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
            [table]
        );
        if (rows[0].cnt === 0) {
            throw new Error(`POSTCONDITION_FAILED: Required industrial table '${table}' was not created by 184G schemas.`);
        }
    }

    // Verify critical columns on print_nodes
    const requiredPrintNodeCols = ['machine_state', 'worker_state', 'sync_version'];
    for (const col of requiredPrintNodeCols) {
        const rows = await db.query(
            'SELECT COUNT(*) as cnt FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = "print_nodes" AND column_name = ?',
            [col]
        );
        if (rows[0].cnt === 0) {
            throw new Error(`POSTCONDITION_FAILED: Critical column 'print_nodes.${col}' was not added.`);
        }
    }
}

async function main() {
    console.log('\n======================================================');
    console.log('   APPLYING PHASE 184G INDUSTRIAL PERSISTENCE SCHEMAS ');
    console.log('======================================================\n');

    const isolation = checkEphemeralIsolation();
    if (!isolation.ok) {
        console.error(`[FATAL] Isolation check failed: ${isolation.reason}`);
        process.exit(1);
    }
    console.log(`[PASS] Isolation confirmed on ${isolation.host} / ${isolation.database}`);

    if (process.env.PPOS_MIGRATION_EXECUTION !== 'true') {
        console.error('[FATAL] PPOS_MIGRATION_EXECUTION=true is required to execute 184G DDL modules.');
        process.exit(1);
    }

    const pool = mysqlClient.getPool();
    const conn = await pool.getConnection();

    try {
        console.log('[1/3] Executing phase184g_manufacturing_persistence_schema.up()...');
        await mfgSchema.up(conn);
        console.log('  -> Success.');

        console.log('[2/3] Executing phase184g_industrial_provisioning_schema.up()...');
        await provSchema.up(conn);
        console.log('  -> Success.');

        console.log('[3/3] Verifying 184G postconditions...');
        await verifyPostconditions(conn);
        console.log('  -> All postconditions satisfied.');

        console.log('\n[PASS] Phase 184G Industrial Persistence Schemas successfully applied.\n');
    } catch (err) {
        console.error(`\n[FATAL] Error applying Phase 184G schemas: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    } finally {
        conn.release();
        await mysqlClient.closePool();
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    checkEphemeralIsolation,
    verifyPostconditions
};
