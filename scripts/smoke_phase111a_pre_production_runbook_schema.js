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
    console.log('\n━━━ Phase 111A — Pre-Production Runbook Schema Smoke ━━━\n');

    const migPath = path.join(ROOT, 'migrations/051_phase111_financial_operations_pre_production_runbook.sql');
    
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const content = fs.readFileSync(migPath, 'utf-8');

    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pre_production_runbooks'), 'SC2: Runbooks table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pre_production_runbook_sections'), 'SC2: Sections table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pre_production_runbook_tasks'), 'SC2: Tasks table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pre_production_runbook_findings'), 'SC2: Findings table defined');
    assert(content.includes('CREATE TABLE IF NOT EXISTS financial_operations_pre_production_runbook_audit_events'), 'SC2: Audit events table defined');

    assert(content.includes('requires_manual_confirmation BOOLEAN DEFAULT TRUE'), 'SC3: requires_manual_confirmation defaults true');
    assert(content.includes('production_execution_enabled BOOLEAN DEFAULT FALSE'), 'SC3: production_execution_enabled defaults false');
    assert(content.includes('full_public_enabled BOOLEAN DEFAULT FALSE'), 'SC3: full_public_enabled defaults false');
    assert(content.includes('live_provider_connectivity_enabled BOOLEAN DEFAULT FALSE'), 'SC3: live_provider_connectivity_enabled defaults false');

    assert(!content.includes('CREATE TABLE IF NOT EXISTS production_activation_execution'), 'SC4: No production activation execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS full_public_enablement'), 'SC5: No FULL_PUBLIC enablement table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS live_provider_connectivity'), 'SC6: No live provider connectivity table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS payment_execution'), 'SC7: No payment/refund/payout execution table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS external_submission'), 'SC8: No external submission table exists');
    assert(!content.includes('CREATE TABLE IF NOT EXISTS source_record_mutation'), 'SC9: No source mutation table exists');

    assert(content.includes('evidence_json') && content.includes('source_snapshot_json') && content.includes('runbook_mode'), 'SC10: Schema is pre-production-runbook/readiness/audit/evidence oriented');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 111A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
