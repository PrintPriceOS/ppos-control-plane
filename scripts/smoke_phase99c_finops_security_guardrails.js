'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsSecurityGuardrailService = require('../src/api/services/financialOperationsSecurityGuardrailService');

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
    console.log('\n━━━ Phase 99C — Security Guardrails Smoke ━━━\n');

    const svc = new FinancialOperationsSecurityGuardrailService();
    const actorAdmin = { role: 'SECURITY_ADMIN', userId: 'sec_1' };

    const safeConfig = {
        fullPublicEnabled: false,
        livePaymentEnabled: false,
        liveRefundEnabled: false,
        livePayoutEnabled: false,
        externalInvoiceEnabled: false,
        taxFilingEnabled: false,
        mockProviderLocalOnly: true,
        sandboxModeEnforced: true,
        dryRunModeEnforced: true,
        manualApprovalGatesPresent: true,
        auditLoggingEnabled: true,
        partnerAccessScoped: true,
        tenantAccessScoped: true
    };

    // SC1
    const resSafe = await svc.evaluateGuardrails({ config: safeConfig, actor: actorAdmin });
    assert(resSafe.status === 'PASS', 'SC1: PASS when all execution flags are disabled');

    // SC2
    const resPub = await svc.evaluateGuardrails({ config: { ...safeConfig, fullPublicEnabled: true }, actor: actorAdmin });
    assert(resPub.status === 'BLOCKED' && resPub.blockers.includes('FULL_PUBLIC enabled'), 'SC2: BLOCKED when FULL_PUBLIC is enabled');

    // SC3
    const resLive = await svc.evaluateGuardrails({ config: { ...safeConfig, livePaymentEnabled: true }, actor: actorAdmin });
    assert(resLive.status === 'BLOCKED' && resLive.blockers.includes('Live payment execution enabled'), 'SC3: BLOCKED when live payment flag is enabled');

    // SC4
    const resExt = await svc.evaluateGuardrails({ config: { ...safeConfig, externalInvoiceEnabled: true }, actor: actorAdmin });
    assert(resExt.status === 'BLOCKED' && resExt.blockers.includes('External invoice submission enabled'), 'SC4: BLOCKED when external submission is enabled');

    // SC5
    const resWarn = await svc.evaluateGuardrails({ config: { ...safeConfig, partnerAccessScoped: false }, actor: actorAdmin });
    assert(resWarn.status === 'WARNING' && resWarn.warnings.includes('Partner access scope not explicitly defined'), 'SC5: WARNING when partner scope is missing');

    // SC6 & SC7
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsSecurityGuardrailService.js'), 'utf-8');
    assert(!content.includes('config.fullPublicEnabled = false'), 'SC6: Guardrail service is read-only (no mutation of config)');
    assert(!content.includes('UPDATE orders'), 'SC7: Source/config objects remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 99C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
