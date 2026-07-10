'use strict';

const fs = require('fs');
const path = require('path');
const {
  discoverMigrations,
  calculateFileChecksum,
  classifySqlStatements,
  findPrefixCollisions
} = require('./lib/migrationIntegrity');

const rootDir = path.join(__dirname, '..');
const migrationsDir = path.join(rootDir, 'migrations');
const baselinePath = path.join(migrationsDir, 'migration-integrity-baseline.json');

const args = process.argv.slice(2);
const isWrite = args.includes('--write');
const isReplace = args.includes('--replace-existing');

(() => {
  console.log('=== Phase 183 Migration Baseline Generator ===\n');

  if (!isWrite) {
    console.error('Error: Must pass --write to generate baseline.');
    console.log('Usage: node scripts/generate_phase183_migration_baseline.js --write [--replace-existing]');
    process.exit(1);
  }

  const baselineExists = fs.existsSync(baselinePath);
  if (baselineExists && !isReplace) {
    console.error('Error: Baseline file already exists at migrations/migration-integrity-baseline.json');
    console.error('Use --replace-existing to overwrite the baseline.');
    console.warn('WARNING: Replacing the baseline may legitimize retroactive migration changes.');
    process.exit(1);
  }

  console.log('Scanning migrations directory...');
  const { migrations } = discoverMigrations(migrationsDir);
  console.log(`Found ${migrations.length} migration files.`);

  const migrationsRecord = [];

  for (const m of migrations) {
    const sha = calculateFileChecksum(m.absolutePath);
    const content = fs.readFileSync(m.absolutePath, 'utf8');
    const classification = classifySqlStatements(content);
    const size = fs.statSync(m.absolutePath).size;

    migrationsRecord.push({
      path: m.relativePath.replace(/\\/g, '/'),
      prefix: m.prefix,
      sha256: sha,
      sizeBytes: size,
      containsDdl: classification.containsDdl,
      containsDml: classification.containsDml,
      containsTransaction: classification.containsTransaction,
      statementTypes: classification.statementTypes
    });
  }

  const collisions = findPrefixCollisions(migrations);

  // Filter collisions to clean JSON mapping
  const approvedCollisions = {};
  for (const [prefix, paths] of Object.entries(collisions)) {
    approvedCollisions[prefix] = paths.map(p => p.replace(/\\/g, '/'));
  }

  const baselineJson = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    hashAlgorithm: 'sha256',
    approvedPrefixCollisions: approvedCollisions,
    migrations: migrationsRecord
  };

  fs.writeFileSync(baselinePath, JSON.stringify(baselineJson, null, 2), 'utf8');
  console.log(`\nSuccess: Generated baseline at migrations/migration-integrity-baseline.json`);
  console.log(`Total migrations baselined: ${migrationsRecord.length}`);
})();
