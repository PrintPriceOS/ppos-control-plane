'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderWebhookSandboxService = require('../src/api/services/financialOperationsProviderWebhookSandboxService');

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
    console.log('\n━━━ Phase 104B — Provider Webhook Sandbox Readiness Smoke ━━━\n');

    const svc = new FinancialOperationsProviderWebhookSandboxService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const c1 = await svc.createWebhookSandboxReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        webhookMode: 'MOCK_WEBHOOK'
    }, actorAdmin);

    assert(c1.webhook_status === 'DRAFT', 'SC1: Create draft webhook sandbox readiness record');

    // SC2: Approve clean mock/stub webhook sandbox for readiness
    await svc.approveWebhookSandboxReadiness(c1.webhook_sandbox_id, {}, actorAdmin);
    assert(c1.webhook_status === 'APPROVED_FOR_READINESS', 'SC2: Approve clean mock/stub webhook sandbox for readiness');

    // SC3: Reject if live_endpoint_enabled true
    const c3 = await svc.createWebhookSandboxReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        liveEndpointEnabled: true
    }, actorAdmin);
    const r3 = await svc.evaluateReadiness(c3.webhook_sandbox_id, {}, actorAdmin);
    assert(r3.status === 'BLOCKED' && r3.blockers.includes('LIVE_ENDPOINT_ENABLED'), 'SC3: Reject if live_endpoint_enabled true');

    // SC4: Reject if live_signing_secret_present true
    const c4 = await svc.createWebhookSandboxReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        liveSigningSecretPresent: true
    }, actorAdmin);
    const r4 = await svc.evaluateReadiness(c4.webhook_sandbox_id, {}, actorAdmin);
    assert(r4.status === 'BLOCKED' && r4.blockers.includes('LIVE_SIGNING_SECRET_PRESENT'), 'SC4: Reject if live_signing_secret_present true');

    // SC5: Reject if live_provider_connectivity_enabled true
    const c5 = await svc.createWebhookSandboxReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        liveProviderConnectivityEnabled: true
    }, actorAdmin);
    const r5 = await svc.evaluateReadiness(c5.webhook_sandbox_id, {}, actorAdmin);
    assert(r5.status === 'BLOCKED' && r5.blockers.includes('LIVE_PROVIDER_CONNECTIVITY_ENABLED'), 'SC5: Reject if live_provider_connectivity_enabled true');

    // SC6: Reject if FULL_PUBLIC enabled
    const c6 = await svc.createWebhookSandboxReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        fullPublicEnabled: true
    }, actorAdmin);
    const r6 = await svc.evaluateReadiness(c6.webhook_sandbox_id, {}, actorAdmin);
    assert(r6.status === 'BLOCKED' && r6.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC6: Reject if FULL_PUBLIC enabled');

    // SC7: Reject if redaction_required false
    const c7 = await svc.createWebhookSandboxReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        redactionRequired: false
    }, actorAdmin);
    const r7 = await svc.evaluateReadiness(c7.webhook_sandbox_id, {}, actorAdmin);
    assert(r7.status === 'BLOCKED' && r7.blockers.includes('REDACTION_NOT_REQUIRED'), 'SC7: Reject if redaction_required false');

    // SC8: Reject if replay_protection_required false
    const c8 = await svc.createWebhookSandboxReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        replayProtectionRequired: false
    }, actorAdmin);
    const r8 = await svc.evaluateReadiness(c8.webhook_sandbox_id, {}, actorAdmin);
    assert(r8.status === 'BLOCKED' && r8.blockers.includes('REPLAY_PROTECTION_NOT_REQUIRED'), 'SC8: Reject if replay_protection_required false');

    // SC9: Reject if idempotency_required false
    const c9 = await svc.createWebhookSandboxReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        idempotencyRequired: false
    }, actorAdmin);
    const r9 = await svc.evaluateReadiness(c9.webhook_sandbox_id, {}, actorAdmin);
    assert(r9.status === 'BLOCKED' && r9.blockers.includes('IDEMPOTENCY_NOT_REQUIRED'), 'SC9: Reject if idempotency_required false');


    // SC10: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookSandboxService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments') && !content.includes('axios') && !content.includes('http'), 'SC10: Source objects remain unchanged and no external calls');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 104B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
