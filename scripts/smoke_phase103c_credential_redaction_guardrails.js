'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsCredentialRedactionGuardrailService = require('../src/api/services/financialOperationsCredentialRedactionGuardrailService');

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
    console.log('\n━━━ Phase 103C — Credential Redaction / Exposure Guardrail Smoke ━━━\n');

    const svc = new FinancialOperationsCredentialRedactionGuardrailService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1: PASS when all payloads are redacted
    const r1 = await svc.evaluatePayload('cvault_1', '{"key":"REDACTED_REFERENCE"}', actorAdmin);
    assert(r1.status === 'PASS', 'SC1: PASS when all payloads are redacted');

    // SC2: BLOCKED when API key-like string appears
    const r2 = await svc.evaluatePayload('cvault_1', '{"key":"sk_live_12345abcde"}', actorAdmin);
    assert(r2.status === 'BLOCKED' && r2.blockers.includes('API_KEY_DETECTED'), 'SC2: BLOCKED when API key-like string appears');

    // SC3: BLOCKED when private key marker appears
    const r3 = await svc.evaluatePayload('cvault_1', '{"key":"-----BEGIN PRIVATE KEY-----\\nMIIE...\\n"}', actorAdmin);
    assert(r3.status === 'BLOCKED' && r3.blockers.includes('PRIVATE_KEY_DETECTED'), 'SC3: BLOCKED when private key marker appears');

    // SC4: BLOCKED when bearer token appears
    const r4 = await svc.evaluatePayload('cvault_1', '{"auth":"Bearer eyJhbGciOiJIUzI1NiJ9..."}', actorAdmin);
    assert(r4.status === 'BLOCKED' && r4.blockers.includes('BEARER_TOKEN_DETECTED'), 'SC4: BLOCKED when bearer token appears');

    // SC5: BLOCKED when webhook secret appears
    const r5 = await svc.evaluatePayload('cvault_1', '{"sec":"whsec_12345"}', actorAdmin);
    assert(r5.status === 'BLOCKED' && r5.blockers.includes('WEBHOOK_SECRET_DETECTED'), 'SC5: BLOCKED when webhook secret appears');

    // SC6: WARNING when credential reference lacks hash
    const vault = { credential_vault_id: 'cvault_1', credential_reference: 'ref_123' };
    const r6 = await svc.evaluateReadinessRecord(vault, actorAdmin);
    assert(r6.status === 'WARNING' && r6.warnings.includes('CREDENTIAL_REFERENCE_HASH_MISSING'), 'SC6: WARNING when credential reference lacks hash');

    // SC7: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsCredentialRedactionGuardrailService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments'), 'SC7: Source objects remain unchanged');
    assert(!content.includes('axios') && !content.includes('http'), 'SC7: No external calls');
    assert(!content.includes('decrypt'), 'SC7: Guardrail service is read-only and does not decrypt');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 103C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
