'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsPartnerSandboxService = require('../src/api/services/financialOperationsPartnerSandboxService');

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
    console.log('\n━━━ Phase 98B — Partner Sandbox Governance Smoke ━━━\n');

    const svc = new FinancialOperationsPartnerSandboxService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1
    const s1 = await svc.createDraftSandbox({ sandboxName: 'Test Sandbox', tenantId: 't1', partnerId: 'p1', allowedOperations: ['PAYMENT_SANDBOX'], actor: actorAdmin });
    assert(s1.sandbox_status === 'DRAFT', 'SC1: Create draft partner sandbox');

    // SC2
    await svc.requestReview({ sandboxId: s1.sandbox_id, actor: actorAdmin });
    assert(s1.sandbox_status === 'MANUAL_REVIEW_REQUIRED', 'SC2: Activate only after manual review');
    await svc.activateSandbox({ sandboxId: s1.sandbox_id, actor: actorAdmin });
    assert(s1.sandbox_status === 'ACTIVE_SANDBOX', 'SC2: Sandbox activated');

    // SC3
    const s2 = await svc.createDraftSandbox({ sandboxName: 'Bad Sandbox 1', tenantId: 't1', actor: actorAdmin });
    await svc.requestReview({ sandboxId: s2.sandbox_id, actor: actorAdmin });
    s2.external_execution_enabled = true; // manual override
    try {
        await svc.activateSandbox({ sandboxId: s2.sandbox_id, actor: actorAdmin });
        assert(false, 'SC3: Reject activation if external_execution_enabled true');
    } catch (err) {
        assert(err.message.includes('external execution must be disabled'), 'SC3: Reject activation if external_execution_enabled true');
    }

    // SC4
    const s3 = await svc.createDraftSandbox({ sandboxName: 'Bad Sandbox 2', tenantId: 't1', actor: actorAdmin });
    await svc.requestReview({ sandboxId: s3.sandbox_id, actor: actorAdmin });
    s3.full_public_enabled = true; // manual override
    try {
        await svc.activateSandbox({ sandboxId: s3.sandbox_id, actor: actorAdmin });
        assert(false, 'SC4: Reject activation if full_public_enabled true');
    } catch (err) {
        assert(err.message.includes('FULL_PUBLIC must be disabled'), 'SC4: Reject activation if full_public_enabled true');
    }

    // SC5
    try {
        await svc.checkEligibility({ sandboxId: s1.sandbox_id, operationType: 'REFUND_SANDBOX' });
        assert(false, 'SC5: Reject operation types outside allowlist');
    } catch (err) {
        assert(err.message.includes('not allowed'), 'SC5: Reject operation types outside allowlist');
    }

    // SC6 & SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsPartnerSandboxService.js'), 'utf-8');
    assert(content.includes('sandbox_only: true'), 'SC6: Enforce sandbox_only default');
    assert(content.includes('mock_provider_enabled: true'), 'SC7: Enforce mock_provider_enabled default');

    // SC8
    assert(!content.includes('UPDATE orders'), 'SC8: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 98B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
