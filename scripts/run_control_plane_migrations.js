'use strict';

// Set migration context to bypass guards
process.env.PPOS_MIGRATION_EXECUTION = 'true';
process.env.PPOS_ENABLE_SCHEMA_MUTATION = 'true';

const migrationService = require('../src/api/services/migrationService');
const mysqlClient = require('../src/api/services/mysqlClient');

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== PPOS Control Plane Migration CLI Runner ===`);
  if (isDryRun) {
    console.log(`[DRY-RUN MODE ENABLED]`);
  }

  try {
    const service = new migrationService();
    if (isDryRun) {
      console.log(`Checking database connectivity and pending migrations (dry-run)...`);
      await service.ensureMigrationTable();
      console.log(`Dry-run validation complete. Database connection available.`);
    } else {
      console.log(`Applying pending migrations...`);
      const result = await service.runMigrations();
      console.log(`Migration execution complete.`);
    }
  } catch (err) {
    console.error(`Migration CLI failed:`, err.message);
    process.exit(1);
  } finally {
    try {
      await mysqlClient.closePool();
    } catch (e) {}
  }
}

run();
