'use strict';

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}${detail ? ` (${detail})` : ''}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}${detail ? `: ${detail}` : ''}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 83G — Partner Operations Acceptance Pack Smoke ━━━\n');

    const reportPath = path.join(ROOT, 'reports', 'phase83_partner_operations_acceptance_pack.md');
    
    // SC1
    assert(fs.existsSync(reportPath), 'SC1: Acceptance pack report exists');

    if (fs.existsSync(reportPath)) {
        const content = fs.readFileSync(reportPath, 'utf-8');

        // SC2
        assert(content.includes('PUBLIC_MARKETPLACE_LAUNCH: NOT_ENABLED'), 'SC2: Explicitly states public marketplace launch is disabled');

        // SC3
        assert(content.includes('PARTNER_BYPASS_GOVERNANCE: BLOCKED'), 'SC3: Confirms partner bypasses are blocked');
        
        // SC4
        assert(content.includes('TENANT_ISOLATION: ACTIVE'), 'SC4: Confirms tenant isolation is active');
    } else {
        assert(false, 'SC2: Content checks skipped because file missing');
        assert(false, 'SC3: Content checks skipped because file missing');
        assert(false, 'SC4: Content checks skipped because file missing');
    }

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 83G Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
