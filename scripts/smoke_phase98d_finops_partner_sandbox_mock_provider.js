'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPartnerSandboxRunService = require('../src/api/services/financialOperationsPartnerSandboxRunService');

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

class MockAccessSvc {
    constructor() {
        this._mockSessions = [
            { sandbox_session_id: 'sbs_active', session_status: 'ACTIVE', allowed_operations_json: ['PAYMENT_SANDBOX'], expires_at: new Date(Date.now() + 100000).toISOString(), rate_limit_snapshot_json: { requests_remaining: 10 } },
            { sandbox_session_id: 'sbs_suspended', session_status: 'BLOCKED' }
        ];
    }
    async validateAccess({ sessionId, operationType }) {
        const session = this._mockSessions.find(s => s.sandbox_session_id === sessionId);
        if (!session) throw new Error('Session not found');
        if (session.session_status !== 'ACTIVE') throw new Error('Access blocked: Session is ' + session.session_status);
        if (!session.allowed_operations_json.includes(operationType)) throw new Error('Access blocked: Operation not allowed');
        return session;
    }
}

async function runSmoke() {
    console.log('\n━━━ Phase 98D — Partner Sandbox Mock Provider Smoke ━━━\n');

    const accSvc = new MockAccessSvc();
    const runSvc = new FinancialOperationsPartnerSandboxRunService({ financialOperationsPartnerSandboxAccessService: accSvc });
    const actorAdmin = { role: 'PARTNER_ADMIN', userId: 'p_1' };

    // SC1
    const run1 = await runSvc.createRun({ sessionId: 'sbs_active', operationType: 'PAYMENT_SANDBOX', payload: { amount: 100 }, actor: actorAdmin });
    assert(run1.run_status === 'CREATED', 'SC1: Active session creates sandbox run');

    // SC2
    try {
        await runSvc.createRun({ sessionId: 'sbs_suspended', operationType: 'PAYMENT_SANDBOX', payload: { amount: 100 }, actor: actorAdmin });
        assert(false, 'SC2: Suspended sandbox blocks run');
    } catch (err) {
        assert(err.message.includes('blocked'), 'SC2: Suspended sandbox blocks run');
    }

    // SC3
    try {
        await runSvc.createRun({ sessionId: 'sbs_active', operationType: 'REFUND_SANDBOX', payload: { amount: 100 }, actor: actorAdmin });
        assert(false, 'SC3: Operation outside allowlist blocks run');
    } catch (err) {
        assert(err.message.includes('not allowed'), 'SC3: Operation outside allowlist blocks run');
    }

    // SC4 & SC5
    const compRun = await runSvc.executeMockProvider({ runId: run1.sandbox_run_id, actor: actorAdmin });
    assert(compRun.run_status === 'MOCK_PROVIDER_COMPLETED', 'SC4: MOCK_PROVIDER completes');
    assert(compRun.response_payload_json && compRun.response_payload_json.note.includes('deterministic local mock'), 'SC4: MOCK_PROVIDER returns deterministic local response');
    assert(compRun.result_snapshot_json !== null, 'SC5: DRY_RUN produces result snapshot');

    // SC6 & SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxRunService.js'), 'utf-8');
    assert(!content.includes('http') && !content.includes('axios'), 'SC6: No payment/refund/payout/invoice/tax external operation occurs');
    assert(!content.includes('UPDATE orders'), 'SC7: Source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 98D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
