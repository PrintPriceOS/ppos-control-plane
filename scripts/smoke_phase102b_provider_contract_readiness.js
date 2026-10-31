'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderContractReadinessService = require('../src/api/services/financialOperationsProviderContractReadinessService');

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

// Mock Sandbox Service to avoid full instantiation in this isolated test
class MockSandboxService {
    constructor() {
        this.sb = {
            live_provider_connectivity_enabled: false,
            live_credentials_present: false,
            full_public_enabled: false
        };
    }
    _getSandbox(id) {
        return this.sb;
    }
}

async function runSmoke() {
    console.log('\n━━━ Phase 102B — Provider Contract Readiness Smoke ━━━\n');

    const sbSvc = new MockSandboxService();
    const svc = new FinancialOperationsProviderContractReadinessService(sbSvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const c1 = await svc.createContract({
        providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER', providerName: 'Stripe Mock',
        contractReference: 'REF-123', contractVersion: '1.0', contractScope: 'Global Processing',
        providerSandboxId: 'psand_1'
    }, actorAdmin);

    // SC1: Missing reviews block readiness
    const r1 = await svc.evaluateReadiness(c1.provider_contract_id, {}, actorAdmin);
    assert(r1.status === 'BLOCKED', 'SC1: Unreviewed contract is BLOCKED');
    assert(r1.blockers.includes('LEGAL_REVIEW_PENDING'), 'SC1: LEGAL_REVIEW_PENDING blocker exists');
    assert(r1.blockers.includes('FINANCE_REVIEW_PENDING'), 'SC1: FINANCE_REVIEW_PENDING blocker exists');
    assert(r1.blockers.includes('DATA_PROCESSING_REVIEW_PENDING'), 'SC1: DATA_PROCESSING_REVIEW_PENDING blocker exists');

    // SC2: Approved reviews allow readiness
    c1.legal_review_status = 'APPROVED';
    c1.finance_review_status = 'APPROVED';
    c1.security_review_status = 'APPROVED';
    c1.operations_review_status = 'APPROVED';
    c1.data_processing_review_status = 'APPROVED';
    
    const r2 = await svc.evaluateReadiness(c1.provider_contract_id, {}, actorAdmin);
    assert(r2.status === 'READY', 'SC2: Fully reviewed contract is READY');

    // SC3: Live connectivity blocks readiness
    sbSvc.sb.live_provider_connectivity_enabled = true;
    const r3 = await svc.evaluateReadiness(c1.provider_contract_id, {}, actorAdmin);
    assert(r3.status === 'BLOCKED' && r3.blockers.includes('LIVE_PROVIDER_CONNECTIVITY_ENABLED'), 'SC3: live_provider_connectivity_enabled blocks readiness');

    // SC4: Live credentials block readiness
    sbSvc.sb.live_provider_connectivity_enabled = false;
    sbSvc.sb.live_credentials_present = true;
    const r4 = await svc.evaluateReadiness(c1.provider_contract_id, {}, actorAdmin);
    assert(r4.status === 'BLOCKED' && r4.blockers.includes('LIVE_CREDENTIALS_PRESENT'), 'SC4: live_credentials_present blocks readiness');

    // SC5: FULL_PUBLIC blocks readiness
    sbSvc.sb.live_credentials_present = false;
    sbSvc.sb.full_public_enabled = true;
    const r5 = await svc.evaluateReadiness(c1.provider_contract_id, {}, actorAdmin);
    assert(r5.status === 'BLOCKED' && r5.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC5: FULL_PUBLIC in sandbox blocks readiness');

    sbSvc.sb.full_public_enabled = false;
    const r6 = await svc.evaluateReadiness(c1.provider_contract_id, { full_public_enabled: true }, actorAdmin);
    assert(r6.status === 'BLOCKED' && r6.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC6: FULL_PUBLIC in global blocks readiness');

    // SC7: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderContractReadinessService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments'), 'SC7: Source objects remain unchanged');
    assert(!content.includes('axios') && !content.includes('http'), 'SC7: No external calls');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 102B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
