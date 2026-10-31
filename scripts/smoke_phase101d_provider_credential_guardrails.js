'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderCredentialGuardrailService = require('../src/api/services/financialOperationsProviderCredentialGuardrailService');

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
    console.log('\n━━━ Phase 101D — Provider Credential Guardrails Smoke ━━━\n');

    const svc = new FinancialOperationsProviderCredentialGuardrailService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const baseGlobalConfig = { full_public_enabled: false, live_webhook_endpoints_enabled: false };
    
    // SC1: PASS when sandbox-only and no live credentials
    const cleanConfig = {
        provider_sandbox_id: 'psand_1',
        live_credentials_present: false,
        sandbox_credentials_present: true,
        live_provider_connectivity_enabled: false,
        sandbox_only: true,
        full_public_enabled: false,
        live_webhook_endpoint_enabled: false
    };

    const r1 = await svc.evaluateGuardrails(cleanConfig, baseGlobalConfig, actorAdmin);
    assert(r1.status === 'PASS', 'SC1: PASS when sandbox-only and clean');

    // SC2: BLOCKED when live credentials are present
    const r2 = await svc.evaluateGuardrails({ ...cleanConfig, live_credentials_present: true }, baseGlobalConfig, actorAdmin);
    assert(r2.status === 'BLOCKED' && r2.blockers.includes('LIVE_CREDENTIALS_PRESENT'), 'SC2: BLOCKED when live credentials present');

    // SC3: BLOCKED when live provider connectivity is enabled
    const r3 = await svc.evaluateGuardrails({ ...cleanConfig, live_provider_connectivity_enabled: true }, baseGlobalConfig, actorAdmin);
    assert(r3.status === 'BLOCKED' && r3.blockers.includes('LIVE_CONNECTIVITY_ENABLED'), 'SC3: BLOCKED when live connectivity enabled');

    // SC4: BLOCKED when FULL_PUBLIC is enabled
    const r4 = await svc.evaluateGuardrails({ ...cleanConfig, full_public_enabled: true }, baseGlobalConfig, actorAdmin);
    assert(r4.status === 'BLOCKED' && r4.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC4: BLOCKED when FULL_PUBLIC enabled locally');

    const r5 = await svc.evaluateGuardrails(cleanConfig, { full_public_enabled: true }, actorAdmin);
    assert(r5.status === 'BLOCKED' && r5.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC4: BLOCKED when FULL_PUBLIC enabled globally');

    // SC5: BLOCKED when live webhook endpoint is enabled
    const r6 = await svc.evaluateGuardrails({ ...cleanConfig, live_webhook_endpoint_enabled: true }, baseGlobalConfig, actorAdmin);
    assert(r6.status === 'BLOCKED' && r6.blockers.includes('LIVE_WEBHOOK_ENDPOINT_ENABLED'), 'SC5: BLOCKED when live webhook endpoint enabled');

    // SC6: WARNING when sandbox credentials are missing
    const r7 = await svc.evaluateGuardrails({ ...cleanConfig, sandbox_credentials_present: false, credentials_mode: 'SANDBOX' }, baseGlobalConfig, actorAdmin);
    assert(r7.status === 'WARNING' && r7.warnings.includes('MISSING_SANDBOX_CREDENTIALS'), 'SC6: WARNING when sandbox credentials missing');

    // SC7: Guardrail service is read-only
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderCredentialGuardrailService.js'), 'utf-8');
    assert(!content.includes('UPDATE ') && !content.includes('.set('), 'SC7: Guardrail service is read-only');

    // SC8: Source/config objects remain unchanged
    assert(cleanConfig.live_credentials_present === false, 'SC8: Original config object unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 101D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
