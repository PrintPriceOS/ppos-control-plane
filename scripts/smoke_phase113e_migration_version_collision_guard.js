'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
    else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
    return condition;
}

async function runSmoke() {
    console.log('\n━━━ Phase 113E — Migration Version Collision Guard Smoke ━━━\n');

    // 1. Verify that migrationService.js uses the new replace-based version extraction logic
    const servicePath = path.resolve(__dirname, '../src/api/services/migrationService.js');
    assert(fs.existsSync(servicePath), 'M1: migrationService.js exists');

    const serviceCode = fs.readFileSync(servicePath, 'utf-8');

    assert(serviceCode.includes("const version = file.replace(/\\.sql$/, '')"), 'M2: Uses replace-based version naming');
    assert(serviceCode.includes('VARCHAR(255)'), 'M3: Table creation sets version to VARCHAR(255)');
    assert(serviceCode.includes('ALTER TABLE schema_versions MODIFY COLUMN version VARCHAR(255)'), 'M4: Alters version table column size safely');
    assert(serviceCode.includes('m.description.replace(/\\.sql$/, \'\')'), 'M5: Map applied migrations by description compatibility fallback');

    // Unit test mock migration parsing
    const MigrationService = require('../src/api/services/migrationService');
    const crypto = require('crypto');
    const mockChecksum013 = crypto.createHash('sha256').update('SELECT 1;').digest('hex');
    
    // Stub the database client to verify behavior without actual DB connection
    const originalQuery = require('../src/api/services/mysqlClient').query;
    const db = require('../src/api/services/mysqlClient');
    
    let queryLogs = [];
    db.query = async (sql, params) => {
        queryLogs.push({ sql, params });
        if (sql.includes('SELECT version, description, checksum FROM schema_versions')) {
            return [
                { version: '013', description: '013_paywall_tenant_subscriptions.sql', checksum: mockChecksum013 }
            ];
        }
        if (sql.includes('CREATE TABLE IF NOT EXISTS schema_versions')) {
            return [];
        }
        if (sql.includes('ALTER TABLE schema_versions')) {
            return [];
        }
        return [];
    };

    // Stub fs.readdirSync and fs.readFileSync for migrations Path
    const originalReaddirSync = fs.readdirSync;
    const originalReadFileSync = fs.readFileSync;

    fs.readdirSync = (p) => {
        if (p.endsWith('migrations')) {
            return [
                '013_paywall_tenant_subscriptions.sql',
                '013_phase39_0_tenant_plan_governance.sql'
            ];
        }
        return originalReaddirSync(p);
    };

    fs.readFileSync = (p, encoding) => {
        if (p.includes('013_paywall_tenant_subscriptions.sql')) {
            return 'SELECT 1;';
        }
        if (p.includes('013_phase39_0_tenant_plan_governance.sql')) {
            return 'SELECT 2;';
        }
        return originalReadFileSync(p, encoding);
    };

    try {
        const result = await MigrationService.runMigrations();
        
        // Assertions
        assert(result.appliedCount === 1, 'M6: Exactly 1 new migration is applied (the duplicate prefix was not skipped)');
        
        const inserts = queryLogs.filter(q => q.sql.includes('INSERT INTO schema_versions'));
        assert(inserts.length === 1, 'M7: Successfully inserted new version');
        assert(inserts[0].params[0] === '013_phase39_0_tenant_plan_governance', 'M8: Version parameter matches new full filename version format');
        assert(inserts[0].params[1] === '013_phase39_0_tenant_plan_governance.sql', 'M9: Description parameter matches full filename');
    } catch (err) {
        FAIL++;
        console.error('  ❌  [FAIL] Failed to run mock migrations:', err.message);
    } finally {
        // Restore
        db.query = originalQuery;
        fs.readdirSync = originalReaddirSync;
        fs.readFileSync = originalReadFileSync;
    }

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Migration Collision Guard Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);
    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => { console.error('Smoke crashed:', err); process.exit(1); });
