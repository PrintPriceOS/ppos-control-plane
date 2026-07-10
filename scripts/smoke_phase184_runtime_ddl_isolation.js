'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

console.log('=== Phase 184: Runtime DDL Isolation Smoke Test ===\n');

// 1. Static Scan
console.log('1. Static Scan for Runtime DDL:');
const disallowedRegex = /\b(CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX|DROP INDEX|TRUNCATE|RENAME TABLE)\b/i;
const allowedPaths = [
  'migrations',
  'src/migrations',
  'scripts',
  'tests',
  'test',
  'src/api/services/controlPlaneSchemaService.js',
  'src/api/services/industrialProvisioningService.js',
  'src/api/services/ManufacturingPersistenceService.js',
  'src/api/services/migrationService.js'
];

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(path.join(__dirname, '..'), fullPath).replace(/\\/g, '/');

    if (allowedPaths.some(p => relPath.startsWith(p))) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // We check if the content contains disallowed DDL strings and is not a comment
      const matches = content.match(disallowedRegex);
      if (matches) {
        // Double check: if it's just a comment or a false positive we can inspect lines
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (disallowedRegex.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*')) {
            console.error(`Error: Disallowed DDL statement found in runtime file: ${relPath}:${i + 1}`);
            console.error(`  Line: ${line.trim()}`);
            process.exit(1);
          }
        }
      }
    }
  }
}

scanDir(path.join(__dirname, '../src'));
console.log('  PASS: Static scan completed. No disallowed runtime DDL found.');

// 2. Import-Time Safety with guarded DB query mock
console.log('\n2. Import-Time Safety Verification:');
const dbMock = require('../src/api/services/mysqlClient');

let queryCount = 0;
let executedDdl = [];

// Intercept queries
dbMock.query = async (sql) => {
  queryCount++;
  if (disallowedRegex.test(sql)) {
    executedDdl.push(sql);
    throw new Error(`RUNTIME_DDL_FORBIDDEN: ${sql}`);
  }
  return []; // Return empty array to satisfy read-only queries
};

try {
  // Clear require cache for target files so they load with the mock active
  const targets = [
    '../src/api/services/schemaCompatibilityService',
    '../src/api/services/preflightRegistrySyncService',
    '../src/api/services/industrialProvisioningService',
    '../src/api/services/ManufacturingPersistenceService',
    '../src/api/services/preflightOperationsService'
  ];

  for (const t of targets) {
    delete require.cache[require.resolve(t)];
    require(t);
  }

  console.log(`  PASS: Imported modules successfully without DDL queries. (Queries issued: ${queryCount})`);
  assert.equal(executedDdl.length, 0, 'No DDL should be executed during import');
} catch (err) {
  console.error('Import-time safety validation failed:', err);
  process.exit(1);
}

// 3. Schema Compatibility service evaluation tests
console.log('\n3. Schema Compatibility Evaluation Tests:');
const compatibilityService = require('../src/api/services/schemaCompatibilityService');

(async () => {
  // Test A: Compatible Schema Mock
  dbMock.query = async (sql) => {
    if (sql.includes('information_schema.columns')) {
      return [
        { TABLE_NAME: 'tenants', COLUMN_NAME: 'id' },
        { TABLE_NAME: 'tenants', COLUMN_NAME: 'status' },
        { TABLE_NAME: 'tenants', COLUMN_NAME: 'plan' },
        { TABLE_NAME: 'api_keys', COLUMN_NAME: 'id' },
        { TABLE_NAME: 'api_keys', COLUMN_NAME: 'tenant_id' },
        { TABLE_NAME: 'api_keys', COLUMN_NAME: 'status' },
        { TABLE_NAME: 'jobs', COLUMN_NAME: 'id' },
        { TABLE_NAME: 'jobs', COLUMN_NAME: 'tenant_id' },
        { TABLE_NAME: 'jobs', COLUMN_NAME: 'status' },
        { TABLE_NAME: 'preflight_jobs', COLUMN_NAME: 'id' },
        { TABLE_NAME: 'preflight_jobs', COLUMN_NAME: 'tenant_id' },
        { TABLE_NAME: 'preflight_jobs', COLUMN_NAME: 'status' },
        { TABLE_NAME: 'preflight_jobs', COLUMN_NAME: 'original_name' }
      ];
    }
    return [];
  };

  let res = await compatibilityService.evaluateSchemaCompatibility();
  assert.equal(res.status, 'READY', 'Mocked compatible schema should report READY');
  console.log('  PASS: Compatible schema evaluates to READY.');

  // Test B: Missing Table
  dbMock.query = async (sql) => {
    if (sql.includes('information_schema.columns')) {
      return [
        { TABLE_NAME: 'api_keys', COLUMN_NAME: 'id' }
      ];
    }
    return [];
  };

  res = await compatibilityService.evaluateSchemaCompatibility();
  assert.equal(res.status, 'SCHEMA_NOT_READY', 'Missing table should report SCHEMA_NOT_READY');
  const coreCheck = res.checks.find(c => c.capability === 'CORE_RUNTIME');
  assert(coreCheck.missingTables.includes('tenants'), 'Should report missing tenants table');
  console.log('  PASS: Missing required tables evaluates to SCHEMA_NOT_READY.');

  // Test C: Missing Column
  dbMock.query = async (sql) => {
    if (sql.includes('information_schema.columns')) {
      return [
        { TABLE_NAME: 'tenants', COLUMN_NAME: 'id' },
        { TABLE_NAME: 'api_keys', COLUMN_NAME: 'id' }
      ];
    }
    return [];
  };

  res = await compatibilityService.evaluateSchemaCompatibility();
  assert.equal(res.status, 'SCHEMA_NOT_READY', 'Missing column should report SCHEMA_NOT_READY');
  console.log('  PASS: Missing required columns evaluates to SCHEMA_NOT_READY.');

  // Test D: Database Unreachable
  dbMock.query = async () => {
    throw new Error('ECONNREFUSED');
  };

  res = await compatibilityService.evaluateSchemaCompatibility();
  assert.equal(res.status, 'DATABASE_UNREACHABLE', 'Database query exception should report DATABASE_UNREACHABLE');
  console.log('  PASS: Unreachable database evaluates to DATABASE_UNREACHABLE.');

  console.log('\nPhase 184 Smoke Test: PASSED');
  process.exit(0);
})().catch(err => {
  console.error('Compatibility assertion checks failed:', err);
  process.exit(1);
});
