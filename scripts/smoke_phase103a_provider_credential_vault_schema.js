'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 103A — Provider Credential Vault Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/043_phase103_provider_credential_vault_readiness.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_credential_vaults'), 'SC2: Vaults table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_credential_checks'), 'SC2: Checks table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_credential_rotation_reviews'), 'SC2: Rotation reviews table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_credential_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_credential_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('secret_material_present BOOLEAN DEFAULT FALSE'), 'SC3: secret_material_present defaults false');
    assert(content.includes('live_credentials_present BOOLEAN DEFAULT FALSE'), 'SC3: live_credentials_present defaults false');
    assert(content.includes('mock_secret_enabled BOOLEAN DEFAULT TRUE'), 'SC3: mock_secret_enabled defaults true');
    assert(content.includes('stubbed_secret_enabled BOOLEAN DEFAULT TRUE'), 'SC3: stubbed_secret_enabled defaults true');
    assert(content.includes('redaction_required BOOLEAN DEFAULT TRUE'), 'SC3: redaction_required defaults true');
    assert(content.includes('live_provider_connectivity_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_provider_connectivity_enabled defaults false');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC3: full_public_enabled defaults false');

    assert(!content.includes('live_credential_storage'), 'SC4: No live credential storage table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity'), 'SC5: No live provider connectivity table exists');
    assert(!content.includes('execute_payment') && !content.includes('execute_refund') && !content.includes('execute_payout'), 'SC6: No execution tables exist');
    assert(!content.includes('external_submission'), 'SC7: No external submission table exists');
    assert(content.includes('evidence_json'), 'SC8: Schema is credential-vault-readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 103A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
