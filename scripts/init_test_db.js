// scripts/init_test_db.js
// TEST-ONLY: This script initializes the schema and baseline data for a disposable test database.
// It must NEVER be run in production or against a non-local database host.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// --- Strict Environmental Protection Gates ---
if (process.env.ALLOW_DISPOSABLE_DB_INIT !== 'true') {
    console.error('ERROR: ALLOW_DISPOSABLE_DB_INIT=true is required to run this script.');
    process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: Database initialization is forbidden in NODE_ENV=production.');
    process.exit(1);
}

// Parse active DB config
let host = process.env.MYSQL_HOST || 'localhost';
let database = process.env.MYSQL_DATABASE || '';

if (process.env.DATABASE_URL) {
    try {
        const parsed = new URL(process.env.DATABASE_URL);
        host = parsed.hostname;
        database = parsed.pathname.replace(/^\//, '');
    } catch (e) {
        console.error('ERROR: Invalid DATABASE_URL format.');
        process.exit(1);
    }
} else {
    // Default fallback to local test DB
    process.env.DATABASE_URL = 'mysql://ppos_test_user:ppos_test_password@127.0.0.1:3308/ppos_test_phase191b';
    const parsed = new URL(process.env.DATABASE_URL);
    host = parsed.hostname;
    database = parsed.pathname.replace(/^\//, '');
}

// Enforce local host protection
const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (!isLocal) {
    console.error(`ERROR: Database initialization rejected for non-local host: ${host}`);
    process.exit(1);
}

// Enforce test naming conventions
if (!database.toLowerCase().includes('test')) {
    console.error(`ERROR: Database name must contain 'test': ${database}`);
    process.exit(1);
}

const FORBIDDEN_DB_NAMES = ['ppos_production', 'ppos_prod', 'printpriceos', 'printpriceos_prod'];
if (FORBIDDEN_DB_NAMES.includes(database.toLowerCase())) {
    console.error(`ERROR: Database name is blocked as a potential production database: ${database}`);
    process.exit(1);
}

console.log(`[SAFETY CHECK PASSED] Target Database: host=${host}, database=${database}`);

process.env.PPOS_MIGRATION_EXECUTION = 'true';
process.env.PPOS_ENABLE_SCHEMA_MUTATION = 'true';
process.env.PPOS_FORCE_SCHEMA_MUTATION = 'true';

const mysqlClient = require('../src/api/services/mysqlClient');
const schemaService = require('../src/api/services/controlPlaneSchemaService');
const mfgSchema = require('../src/migrations/phase184g_manufacturing_persistence_schema');
const provSchema = require('../src/migrations/phase184g_industrial_provisioning_schema');

async function executeSqlFile(filePath, db) {
    console.log(`Executing ${filePath}...`);
    const sql = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    for (const statement of statements) {
        try {
            await db.query(statement);
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_TABLE_EXISTS_ERROR') {
                console.error(`Error executing statement in ${filePath}: ${err.message}`);
                console.error(`Statement was: ${statement.substring(0, 100)}...`);
            }
        }
    }
}

async function init() {
    const dbPool = mysqlClient.getPool();
    const conn = await dbPool.getConnection();
    try {
        console.log('Fixing collation first...');
        await conn.query('ALTER DATABASE ppos_test_phase191b CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        
        console.log('Initializing test database schema...');
        await schemaService.init();
        
        console.log('Applying baseline doc migrations...');
        await executeSqlFile('scripts/phase190_test_fixture_base.sql', conn);
        await executeSqlFile('docs/migrations/printhouse_onboarding.sql', conn);
        await executeSqlFile('docs/migrations/printhouse_pricing_restore.sql', conn);
        await executeSqlFile('docs/migrations/phase10_industrial_operations.sql', conn);
        await executeSqlFile('migrations/015_phase76_printhouse_capabilities.sql', conn);

        console.log('Applying Phase 184G DDL modules...');
        await mfgSchema.up(conn);
        await provSchema.up(conn);
        
        console.log('Seeding schema_versions baseline to bypass legacy migrations...');
        const ledgerModule = require('../src/migrations/phase184g_migration_ledger_schema');
        await ledgerModule.up(mysqlClient);
        const ledgerGovModule = require('../src/migrations/phase185_migration_ledger_governance_schema');
        await ledgerGovModule.up(mysqlClient);
        
        const fs = require('fs');
        const path = require('path');
        const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, '../migrations/migration-integrity-baseline.json'), 'utf8'));
        
        for (const m of baseline.migrations) {
            const prefixNum = parseInt(m.prefix, 10);
            if (prefixNum > 136) continue;
            
            const filename = m.path.split('/').pop();
            const checksum = m.canonicalSha256 || m.sha256;
            await conn.query(`
                INSERT IGNORE INTO schema_versions 
                (version, description, checksum, state, record_type, migration_path, execution_id, applied_at) 
                VALUES (?, ?, ?, 'APPLIED', 'MIGRATION', ?, UUID(), NOW())
            `, [filename, filename, checksum, m.path]);
        }


        
        console.log('Test database schema initialized successfully.');
    } catch (err) {
        console.error('Failed to initialize test schema:', err);
    } finally {
        conn.release();
        await mysqlClient.closePool();
        process.exit(0);
    }
}

init();
