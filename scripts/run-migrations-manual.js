/**
 * scripts/run-migrations-manual.js
 * 
 * Manually triggers the MigrationService to apply pending SQL migrations.
 */
require('dotenv').config();
const migrationService = require('../src/api/services/migrationService');

async function run() {
    console.log('[MIGRATION-RUNNER] Starting manual migration process...');
    try {
        await migrationService.runMigrations();
        console.log('[MIGRATION-RUNNER] Migrations completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('[MIGRATION-RUNNER] Migration failed:', err.message);
        process.exit(1);
    }
}

run();
