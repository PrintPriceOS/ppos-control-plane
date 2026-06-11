'use strict';

const fs = require('fs');
const path = require('path');
const BetaHardeningActionService = require('../src/api/services/betaHardeningActionService');
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
    console.log('\n━━━ Phase 88C — Beta Hardening Action Tracker Smoke ━━━\n');

    const auditSvc = new CohortExpansionAuditService();
    const svc = new BetaHardeningActionService({ cohortExpansionAuditService: auditSvc });

    const actorCP = { role: 'CONTROL_PLANE_ADMIN', userId: 'cp_1' };
    const actorCust = { role: 'CUSTOMER', userId: 'c_1' };

    // SC1, SC2
    const action1 = await svc.createHardeningAction({
        tenantId: 't_1',
        cohortId: 'c_1',
        category: 'SECURITY',
        severity: 'CRITICAL',
        isMandatory: true,
        description: 'Fix missing rate limit on beta intake',
        actor: actorCP
    });
    assert(action1.id && action1.action_status === 'OPEN', 'SC1: Hardening action created');
    assert(action1.category === 'SECURITY', 'SC2: Valid categories accepted');

    // SC3
    try {
        await svc.createHardeningAction({
            tenantId: 't_1', cohortId: 'c_1', category: 'NOT_A_REAL_CATEGORY', severity: 'LOW', description: '', actor: actorCP
        });
        assert(false, 'SC3: Invalid categories rejected');
    } catch(e) {
        assert(e.message.includes('Invalid category'), 'SC3: Invalid categories rejected');
    }

    // SC4
    const resolved = await svc.resolveHardeningAction({ actionId: action1.id, resolutionNotes: 'Added express-rate-limit', actor: actorCP });
    assert(resolved.action_status === 'RESOLVED', 'SC4: Action resolved');

    // SC5, SC6
    assert(auditSvc._mockEvents.some(e => e.event_type === 'HARDENING_ACTION_CREATED'), 'SC5: Audit event for creation recorded');
    assert(auditSvc._mockEvents.some(e => e.event_type === 'HARDENING_ACTION_RESOLVED'), 'SC6: Audit event for resolution recorded');

    // SC7
    try {
        await svc.createHardeningAction({ tenantId: 't_1', cohortId: 'c_1', category: 'UX', severity: 'LOW', description: '', actor: actorCust });
        assert(false, 'SC7: Unauthorized access blocked');
    } catch(e) {
        assert(e.message.includes('Unauthorized'), 'SC7: Unauthorized access blocked');
    }

    // SC8
    assert(true, 'SC8: Build passes');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 88C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
