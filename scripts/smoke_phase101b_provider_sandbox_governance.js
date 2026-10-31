'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderSandboxService = require('../src/api/services/financialOperationsProviderSandboxService');

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
    console.log('\n━━━ Phase 101B — Provider Sandbox Governance Smoke ━━━\n');

    const svc = new FinancialOperationsProviderSandboxService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1: Create Draft
    const sb1 = await svc.createSandboxConfig({
        tenantId: 't1',
        providerKey: 'stripe_mock',
        providerType: 'PAYMENT_PROVIDER',
        providerName: 'Stripe Mock',
        allowedOperations: ['PAYMENT_AUTH_TEST'],
        blockedOperations: ['PAYMENT_CAPTURE_TEST']
    }, actorAdmin);

    assert(sb1.sandbox_status === 'DRAFT', 'SC1: Sandbox created in DRAFT status');
    assert(sb1.sandbox_only === true, 'SC1: sandbox_only enforced');
    assert(sb1.mock_provider_enabled === true, 'SC1: mock_provider_enabled enforced');

    // SC2: Manual review required before activation
    try {
        await svc.activateSandbox(sb1.provider_sandbox_id, actorAdmin);
        assert(false, 'SC2: Should not activate from DRAFT');
    } catch(e) {
        assert(e.message.includes('Must be in review or suspended'), 'SC2: Activation requires review');
    }

    const reviewed = await svc.requestReview(sb1.provider_sandbox_id, actorAdmin);
    assert(reviewed.sandbox_status === 'MANUAL_REVIEW_REQUIRED', 'SC2: Review requested');

    const active = await svc.activateSandbox(sb1.provider_sandbox_id, actorAdmin);
    assert(active.sandbox_status === 'ACTIVE_SANDBOX', 'SC2: Activated successfully');

    // SC3: Block live_provider_connectivity_enabled
    const sbLive = await svc.createSandboxConfig({
        providerKey: 'live_test', providerType: 'PAYMENT_PROVIDER', providerName: 'Live'
    }, actorAdmin);
    sbLive.live_provider_connectivity_enabled = true; // Force it for testing
    await svc.requestReview(sbLive.provider_sandbox_id, actorAdmin);
    try {
        await svc.activateSandbox(sbLive.provider_sandbox_id, actorAdmin);
        assert(false, 'SC3: Should not activate if live provider connectivity enabled');
    } catch(e) {
        assert(e.message.includes('live_provider_connectivity_enabled is true'), 'SC3: Activation blocked by live connectivity');
    }

    // SC4: Block live_credentials_present
    const sbCred = await svc.createSandboxConfig({
        providerKey: 'cred_test', providerType: 'PAYMENT_PROVIDER', providerName: 'Cred'
    }, actorAdmin);
    sbCred.live_credentials_present = true;
    await svc.requestReview(sbCred.provider_sandbox_id, actorAdmin);
    try {
        await svc.activateSandbox(sbCred.provider_sandbox_id, actorAdmin);
        assert(false, 'SC4: Should not activate if live credentials present');
    } catch(e) {
        assert(e.message.includes('live_credentials_present is true'), 'SC4: Activation blocked by live credentials');
    }

    // SC5: Block full_public_enabled
    const sbPub = await svc.createSandboxConfig({
        providerKey: 'pub_test', providerType: 'PAYMENT_PROVIDER', providerName: 'Pub'
    }, actorAdmin);
    sbPub.full_public_enabled = true;
    await svc.requestReview(sbPub.provider_sandbox_id, actorAdmin);
    try {
        await svc.activateSandbox(sbPub.provider_sandbox_id, actorAdmin);
        assert(false, 'SC5: Should not activate if FULL_PUBLIC enabled');
    } catch(e) {
        assert(e.message.includes('full_public_enabled is true'), 'SC5: Activation blocked by FULL_PUBLIC');
    }

    // SC6
    const sus = await svc.suspendSandbox(sb1.provider_sandbox_id, actorAdmin);
    assert(sus.sandbox_status === 'SUSPENDED', 'SC6: Suspend works');

    // SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderSandboxService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments'), 'SC7: Source objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 101B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
