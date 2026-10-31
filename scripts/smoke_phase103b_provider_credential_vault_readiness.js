'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderCredentialVaultService = require('../src/api/services/financialOperationsProviderCredentialVaultService');

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
    console.log('\n━━━ Phase 103B — Provider Credential Vault Readiness Smoke ━━━\n');

    const svc = new FinancialOperationsProviderCredentialVaultService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const c1 = await svc.createVaultReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        credentialMode: 'MOCK_SECRET'
    }, actorAdmin);

    assert(c1.vault_status === 'DRAFT', 'SC1: Create draft credential vault readiness record');

    // SC2: Approve clean mock/stub credential vault for readiness
    await svc.approveVaultReadiness(c1.credential_vault_id, {}, actorAdmin);
    assert(c1.vault_status === 'APPROVED_FOR_READINESS', 'SC2: Approve clean mock/stub credential vault for readiness');

    // SC3: Reject if secret_material_present true
    const c3 = await svc.createVaultReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        secretMaterialPresent: true
    }, actorAdmin);
    const r3 = await svc.evaluateReadiness(c3.credential_vault_id, {}, actorAdmin);
    assert(r3.status === 'BLOCKED' && r3.blockers.includes('SECRET_MATERIAL_PRESENT'), 'SC3: Reject if secret_material_present true');

    // SC4: Reject if live_credentials_present true
    const c4 = await svc.createVaultReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        liveCredentialsPresent: true
    }, actorAdmin);
    const r4 = await svc.evaluateReadiness(c4.credential_vault_id, {}, actorAdmin);
    assert(r4.status === 'BLOCKED' && r4.blockers.includes('LIVE_CREDENTIALS_PRESENT'), 'SC4: Reject if live_credentials_present true');

    // SC5: Reject if live_provider_connectivity_enabled true
    const c5 = await svc.createVaultReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        liveProviderConnectivityEnabled: true
    }, actorAdmin);
    const r5 = await svc.evaluateReadiness(c5.credential_vault_id, {}, actorAdmin);
    assert(r5.status === 'BLOCKED' && r5.blockers.includes('LIVE_PROVIDER_CONNECTIVITY_ENABLED'), 'SC5: Reject if live_provider_connectivity_enabled true');

    // SC6: Reject if FULL_PUBLIC enabled
    const c6 = await svc.createVaultReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        fullPublicEnabled: true
    }, actorAdmin);
    const r6 = await svc.evaluateReadiness(c6.credential_vault_id, {}, actorAdmin);
    assert(r6.status === 'BLOCKED' && r6.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC6: Reject if FULL_PUBLIC enabled');

    // SC7: Reject if redaction_required false
    const c7 = await svc.createVaultReadiness({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        redactionRequired: false
    }, actorAdmin);
    const r7 = await svc.evaluateReadiness(c7.credential_vault_id, {}, actorAdmin);
    assert(r7.status === 'BLOCKED' && r7.blockers.includes('REDACTION_NOT_REQUIRED'), 'SC7: Reject if redaction_required false');

    // SC8: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderCredentialVaultService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments'), 'SC8: Source objects remain unchanged');
    assert(!content.includes('axios') && !content.includes('http'), 'SC8: No external calls');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 103B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
