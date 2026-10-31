'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPartnerSandboxAccessService = require('../src/api/services/financialOperationsPartnerSandboxAccessService');

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

class MockSandboxSvc {
    constructor() { this._mockSandboxes = []; }
}

async function runSmoke() {
    console.log('\n━━━ Phase 98C — Partner Sandbox Access Smoke ━━━\n');

    const sbSvc = new MockSandboxSvc();
    const accSvc = new FinancialOperationsPartnerSandboxAccessService({ financialOperationsPartnerSandboxService: sbSvc });
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const activeSb = { sandbox_id: 'sb_active', sandbox_status: 'ACTIVE_SANDBOX', allowed_operation_types_json: ['PAYMENT_SANDBOX'], max_requests_per_day: 1 };
    const suspendedSb = { sandbox_id: 'sb_suspended', sandbox_status: 'SUSPENDED', allowed_operation_types_json: ['PAYMENT_SANDBOX'], max_requests_per_day: 10 };
    sbSvc._mockSandboxes.push(activeSb, suspendedSb);

    // SC1
    const session = await accSvc.createSession({ sandboxId: 'sb_active', requestedOperations: ['PAYMENT_SANDBOX'], actor: actorAdmin });
    assert(session.session_status === 'ACTIVE', 'SC1: Active sandbox creates active session');

    // SC2
    try {
        await accSvc.createSession({ sandboxId: 'sb_suspended', requestedOperations: ['PAYMENT_SANDBOX'], actor: actorAdmin });
        assert(false, 'SC2: Suspended sandbox blocks session');
    } catch (err) {
        assert(err.message.includes('not active'), 'SC2: Suspended sandbox blocks session');
    }

    // SC3
    const expiredSession = await accSvc.createSession({ sandboxId: 'sb_active', requestedOperations: ['PAYMENT_SANDBOX'], actor: actorAdmin });
    expiredSession.expires_at = new Date(Date.now() - 10000).toISOString(); // fake expiration
    try {
        await accSvc.validateAccess({ sessionId: expiredSession.sandbox_session_id, operationType: 'PAYMENT_SANDBOX' });
        assert(false, 'SC3: Expired session blocks access');
    } catch (err) {
        assert(err.message.includes('expired'), 'SC3: Expired session blocks access');
    }

    // SC4
    await accSvc.revokeSession({ sessionId: session.sandbox_session_id, actor: actorAdmin });
    try {
        await accSvc.validateAccess({ sessionId: session.sandbox_session_id, operationType: 'PAYMENT_SANDBOX' });
        assert(false, 'SC4: Revoked session blocks access');
    } catch (err) {
        assert(err.message.includes('REVOKED'), 'SC4: Revoked session blocks access');
    }

    // SC5
    const session2 = await accSvc.createSession({ sandboxId: 'sb_active', requestedOperations: ['PAYMENT_SANDBOX'], actor: actorAdmin });
    try {
        await accSvc.validateAccess({ sessionId: session2.sandbox_session_id, operationType: 'REFUND_SANDBOX' });
        assert(false, 'SC5: Operation outside allowlist blocks access');
    } catch (err) {
        assert(err.message.includes('not allowed'), 'SC5: Operation outside allowlist blocks access');
    }

    // SC6
    await accSvc.validateAccess({ sessionId: session2.sandbox_session_id, operationType: 'PAYMENT_SANDBOX' });
    try {
        await accSvc.validateAccess({ sessionId: session2.sandbox_session_id, operationType: 'PAYMENT_SANDBOX' });
        assert(false, 'SC6: Rate limit warning is generated');
    } catch (err) {
        assert(err.message.includes('Rate limit exceeded'), 'SC6: Rate limit warning is generated');
    }

    // SC7 & SC8
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxAccessService.js'), 'utf-8');
    assert(!content.includes('http') && !content.includes('axios'), 'SC7: No external execution occurs');
    assert(!content.includes('UPDATE orders'), 'SC8: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 98C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
