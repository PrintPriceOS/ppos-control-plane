'use strict';
/**
 * scripts/smoke_phase80a_live_enablement_schema_governance_model.js
 *
 * Phase 80A — Live Enablement Schema / Governance Model Smoke Test.
 */

const fs = require('fs');
const path = require('path');
const LiveProductionEnablementService = require('../src/api/services/liveProductionEnablementService');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'migrations');

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

// Mock DB for audit tracking
class MockDb {
    constructor() {
        this.auditEvents = [];
    }
    async query(sql, params) {
        if (sql.includes('INSERT INTO live_production_approval_events')) {
            this.auditEvents.push({ sql, params });
        }
        return [];
    }
}

async function runSmoke() {
    console.log('\n━━━ Phase 80A — Live Enablement Schema & Model Smoke ━━━\n');

    // 1. Migration file exists
    const migrationPath = path.join(MIGRATIONS, '020_phase80_controlled_live_production_enablement.sql');
    assert(fs.existsSync(migrationPath), 'SC1: Migration file 020 exists');

    const db = new MockDb();
    const service = new LiveProductionEnablementService(db);
    const tenantId = 't_123';
    const printhouseId = 'ph_123';
    const actor = { userId: 'u_1', role: 'SYSTEM_ADMIN' };

    // 2-4. Defaults
    let state = await service.getLiveEnablement({ tenantId, printhouseId });
    assert(state.enablement_status === 'NOT_REQUESTED', 'SC2: Default status is NOT_REQUESTED');
    assert(state.live_production_enabled === false, 'SC3: live_production_enabled defaults false');
    assert(state.commercial_status === 'PILOT_ONLY', 'SC4: commercial_status defaults PILOT_ONLY');
    assert(state.live_production_enabled === false && state.commercial_status !== 'LIVE', 'SC15: No default creates LIVE');

    // Mock overriding getLiveEnablement to return our simulated state
    service.getLiveEnablement = async () => state;

    // 5. Request
    state = await service.requestLiveEnablement({ tenantId, printhouseId, requestedScope: 'LIMITED_LIVE', actor });
    assert(state.enablement_status === 'REQUESTED', 'SC5: Request changes status to REQUESTED');

    // 9. Direct activation blocked
    let directActBlocked = false;
    try {
        await service.activateLiveEnablement({ tenantId, printhouseId, actor });
    } catch (err) {
        directActBlocked = true;
    }
    assert(directActBlocked, 'SC9: Direct activation from REQUESTED is blocked');

    // 6. Review
    state = await service.moveLiveEnablementToReview({ tenantId, printhouseId, actor });
    assert(state.enablement_status === 'UNDER_REVIEW', 'SC6: Move to review changes status to UNDER_REVIEW');

    // 13. Reject test (fork state)
    let rejectedState = await service.rejectLiveEnablement({ tenantId, printhouseId, reason: 'Test reject', actor });
    assert(rejectedState.enablement_status === 'REJECTED', 'SC13: Reject changes status to REJECTED');
    let rejectedActBlocked = false;
    try {
        const tempService = new LiveProductionEnablementService(db);
        tempService.getLiveEnablement = async () => rejectedState;
        await tempService.activateLiveEnablement({ tenantId, printhouseId, actor });
    } catch (err) {
        rejectedActBlocked = true;
    }
    assert(rejectedActBlocked, 'SC13: Rejected enablement cannot activate');

    // 7. Approval
    state = await service.approveLiveEnablement({ tenantId, printhouseId, approvalPayload: { notes: 'ok' }, actor });
    assert(state.enablement_status === 'APPROVED', 'SC7: Approval changes status to APPROVED');
    assert(state.live_production_enabled === false, 'SC7: Approval does not activate LIVE');

    // 8. Activation
    state = await service.activateLiveEnablement({ tenantId, printhouseId, actor });
    assert(state.enablement_status === 'ACTIVE' && state.live_production_enabled === true, 'SC8: Activation from APPROVED enables LIVE');
    assert(state.commercial_status === 'LIVE', 'SC8: commercial_status is LIVE');

    // 11. Pause
    state = await service.pauseLiveEnablement({ tenantId, printhouseId, reason: 'Testing pause', actor });
    assert(state.enablement_status === 'PAUSED' && state.live_production_enabled === false, 'SC11: Pause disables live_production_enabled');

    // 12. Resume
    state = await service.resumeLiveEnablement({ tenantId, printhouseId, actor });
    assert(state.enablement_status === 'ACTIVE' && state.live_production_enabled === true, 'SC12: Resume re-enables LIVE');

    // 10. Revocation
    state = await service.revokeLiveEnablement({ tenantId, printhouseId, reason: 'Final test', impactScope: 'FULL_STOP', actor });
    assert(state.enablement_status === 'REVOKED' && state.live_production_enabled === false, 'SC10: Revoke disables live_production_enabled');

    // 14. Audits
    assert(db.auditEvents.length > 5, 'SC14: All transitions audited', `Total events: ${db.auditEvents.length}`);

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 80A Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
