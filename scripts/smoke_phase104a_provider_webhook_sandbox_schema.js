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
    console.log('\n━━━ Phase 104A — Provider Webhook Sandbox Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/044_phase104_provider_webhook_sandbox_readiness.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_webhook_sandboxes'), 'SC2: Sandboxes table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_webhook_event_tests'), 'SC2: Event tests table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_webhook_replay_reviews'), 'SC2: Replay reviews table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_webhook_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_provider_webhook_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('live_endpoint_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_endpoint_enabled defaults false');
    assert(content.includes('sandbox_endpoint_enabled BOOLEAN DEFAULT TRUE'), 'SC3: sandbox_endpoint_enabled defaults true');
    assert(content.includes('mock_webhook_enabled BOOLEAN DEFAULT TRUE'), 'SC3: mock_webhook_enabled defaults true');
    assert(content.includes('stubbed_webhook_enabled BOOLEAN DEFAULT TRUE'), 'SC3: stubbed_webhook_enabled defaults true');
    assert(content.includes('live_signing_secret_present BOOLEAN DEFAULT FALSE'), 'SC3: live_signing_secret_present defaults false');
    assert(content.includes('redaction_required BOOLEAN DEFAULT TRUE'), 'SC3: redaction_required defaults true');
    assert(content.includes('replay_protection_required BOOLEAN DEFAULT TRUE'), 'SC3: replay_protection_required defaults true');
    assert(content.includes('idempotency_required BOOLEAN DEFAULT TRUE'), 'SC3: idempotency_required defaults true');
    assert(content.includes('live_provider_connectivity_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_provider_connectivity_enabled defaults false');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC3: full_public_enabled defaults false');

    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_webhook_delivery'), 'SC4: No live webhook delivery/execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS execute_payment') && !content.includes('CREATE TABLE IF NOT EXISTS execute_refund'), 'SC5: No live payment/refund/payout execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS external_submission'), 'SC6: No external submission table exists');
    assert(content.includes('evidence_json'), 'SC7: Schema is webhook-sandbox-readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 104A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
