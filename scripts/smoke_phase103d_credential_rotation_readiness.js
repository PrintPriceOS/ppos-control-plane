'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsCredentialRotationReadinessService = require('../src/api/services/financialOperationsCredentialRotationReadinessService');

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

class MockVaultService {
    constructor() {
        this.v = { live_credentials_present: false, live_provider_connectivity_enabled: false, full_public_enabled: false, redaction_required: true };
    }
    _getVault(id) { return this.v; }
}

async function runSmoke() {
    console.log('\n━━━ Phase 103D — Credential Rotation Readiness Smoke ━━━\n');

    const vaultSvc = new MockVaultService();
    const svc = new FinancialOperationsCredentialRotationReadinessService(vaultSvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1: Clean rotation policy becomes APPROVED_FOR_READINESS
    const r1 = await svc.createRotationReadiness({
        credentialVaultId: 'cvault_1', providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER',
        nextRotationDueAt: '2026-12-31T23:59:59Z',
        rotationPolicy: { interval_days: 90, revocation_path: '/revoke', emergency_rotation_path: '/emergency', owner: 'security@' }
    }, actorAdmin);
    await svc.approveRotationReadiness(r1.rotation_review_id, {}, actorAdmin);
    assert(r1.rotation_status === 'APPROVED_FOR_READINESS', 'SC1: Clean rotation policy becomes APPROVED_FOR_READINESS');

    // SC2: Missing rotation policy blocks readiness
    const r2 = await svc.createRotationReadiness({
        credentialVaultId: 'cvault_1', providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER',
        nextRotationDueAt: '2026-12-31T23:59:59Z',
        rotationPolicy: { revocation_path: '/revoke', emergency_rotation_path: '/emergency', owner: 'security@' }
    }, actorAdmin);
    const eval2 = await svc.evaluateReadiness(r2.rotation_review_id, {}, actorAdmin);
    assert(eval2.status === 'BLOCKED' && eval2.blockers.includes('ROTATION_POLICY_NOT_DEFINED'), 'SC2: Missing rotation policy interval blocks readiness');

    // SC3: Missing emergency rotation path blocks readiness
    const r3 = await svc.createRotationReadiness({
        credentialVaultId: 'cvault_1', providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER',
        nextRotationDueAt: '2026-12-31T23:59:59Z',
        rotationPolicy: { interval_days: 90, revocation_path: '/revoke', owner: 'security@' }
    }, actorAdmin);
    const eval3 = await svc.evaluateReadiness(r3.rotation_review_id, {}, actorAdmin);
    assert(eval3.status === 'BLOCKED' && eval3.blockers.includes('EMERGENCY_ROTATION_PATH_NOT_DEFINED'), 'SC3: Missing emergency rotation path blocks readiness');

    // SC4: Missing owner blocks readiness
    const r4 = await svc.createRotationReadiness({
        credentialVaultId: 'cvault_1', providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER',
        nextRotationDueAt: '2026-12-31T23:59:59Z',
        rotationPolicy: { interval_days: 90, revocation_path: '/revoke', emergency_rotation_path: '/emergency' }
    }, actorAdmin);
    const eval4 = await svc.evaluateReadiness(r4.rotation_review_id, {}, actorAdmin);
    assert(eval4.status === 'BLOCKED' && eval4.blockers.includes('OWNER_NOT_DEFINED'), 'SC4: Missing owner blocks readiness');

    // SC5: Live credentials present blocks readiness
    vaultSvc.v.live_credentials_present = true;
    const eval5 = await svc.evaluateReadiness(r1.rotation_review_id, {}, actorAdmin);
    assert(eval5.status === 'BLOCKED' && eval5.blockers.includes('LIVE_CREDENTIALS_PRESENT'), 'SC5: Live credentials present blocks readiness');

    // SC6: FULL_PUBLIC enabled blocks readiness
    vaultSvc.v.live_credentials_present = false;
    vaultSvc.v.full_public_enabled = true;
    const eval6 = await svc.evaluateReadiness(r1.rotation_review_id, {}, actorAdmin);
    assert(eval6.status === 'BLOCKED' && eval6.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC6: FULL_PUBLIC enabled blocks readiness');

    // SC7: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsCredentialRotationReadinessService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments') && !content.includes('UPDATE vaults'), 'SC7: Source objects remain unchanged');
    assert(!content.includes('axios') && !content.includes('http'), 'SC8: Rotation readiness does not rotate or revoke real credentials (no external calls)');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 103D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
