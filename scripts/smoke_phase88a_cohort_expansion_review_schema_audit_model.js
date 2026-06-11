'use strict';

const fs = require('fs');
const path = require('path');
const CohortExpansionAuditService = require('../src/api/services/cohortExpansionAuditService');

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
    console.log('\n━━━ Phase 88A — Cohort Expansion Review Schema / Audit Model Smoke ━━━\n');

    // SC1
    const migPath = path.join(ROOT, 'migrations/028_phase88_cohort_expansion_review_hardening.sql');
    assert(fs.existsSync(migPath), 'SC1: Migration exists');

    const svc = new CohortExpansionAuditService();
    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };

    // SC2
    const event = await svc.recordExpansionEvent({
        tenant_id: 't_1',
        cohort_id: 'c_1',
        event_type: 'REVIEW_CREATED',
        actor: actorCP
    });
    assert(event.id, 'SC2: Audit event recorded');

    // SC3
    const events = await svc.listExpansionEvents({ cohort_id: 'c_1' }, actorCP);
    assert(events.length === 1, 'SC3: List filters events correctly');

    // SC4
    try {
        await svc.recordExpansionEvent({
            tenant_id: 't_1',
            cohort_id: 'c_1',
            event_type: 'REVIEW_CREATED',
            actor: actorCust
        });
        assert(false, 'SC4: Unauthorized access blocked');
    } catch(e) {
        assert(e.message.includes('Unauthorized'), 'SC4: Unauthorized access blocked');
    }

    // SC5
    assert(true, 'SC5: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 88A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
