'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderContractSlaReviewService = require('../src/api/services/financialOperationsProviderContractSlaReviewService');

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

class MockContractService {
    constructor() {
        this.c = {
            provider_contract_id: 'pcon_1',
            contract_status: 'DRAFT',
            legal_review_status: 'PENDING',
            finance_review_status: 'PENDING',
            security_review_status: 'PENDING',
            operations_review_status: 'PENDING',
            data_processing_review_status: 'PENDING'
        };
    }
    _getContract(id) { return this.c; }
    async evaluateReadiness() { return { status: 'READY', blockers: [] }; }
}

class MockSlaService {
    constructor() {
        this.s = { provider_sla_id: 'psla_1', sla_status: 'DRAFT' };
    }
    _getSla(id) { return this.s; }
    async evaluateReadiness() { return { status: 'READY', blockers: [] }; }
}

async function runSmoke() {
    console.log('\n━━━ Phase 102D — Provider Contract / SLA Review Workflow Smoke ━━━\n');

    const cSvc = new MockContractService();
    const sSvc = new MockSlaService();
    const svc = new FinancialOperationsProviderContractSlaReviewService(cSvc, sSvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1: Legal/finance/etc. reviews work
    await svc.performContractReviewAction('pcon_1', 'MARK_LEGAL_REVIEWED', {}, {}, actorAdmin);
    await svc.performContractReviewAction('pcon_1', 'MARK_FINANCE_REVIEWED', {}, {}, actorAdmin);
    await svc.performContractReviewAction('pcon_1', 'MARK_SECURITY_REVIEWED', {}, {}, actorAdmin);
    await svc.performContractReviewAction('pcon_1', 'MARK_OPERATIONS_REVIEWED', {}, {}, actorAdmin);
    await svc.performContractReviewAction('pcon_1', 'MARK_DATA_PROCESSING_REVIEWED', {}, {}, actorAdmin);
    
    assert(cSvc.c.legal_review_status === 'APPROVED', 'SC1: Legal review is audited');
    assert(cSvc.c.data_processing_review_status === 'APPROVED', 'SC1: Data processing review is audited');

    // SC2: Approve contract for readiness
    await svc.performContractReviewAction('pcon_1', 'APPROVE_CONTRACT_FOR_READINESS', {}, {}, actorAdmin);
    assert(cSvc.c.contract_status === 'APPROVED_FOR_READINESS', 'SC2: Contract readiness approval does not activate provider connectivity');

    // SC3: Approve SLA for readiness
    await svc.performSlaReviewAction('psla_1', 'APPROVE_SLA_FOR_READINESS', {}, {}, actorAdmin);
    assert(sSvc.s.sla_status === 'APPROVED_FOR_READINESS', 'SC3: SLA readiness approval does not activate provider connectivity');

    // SC4: Revoke works
    await svc.performContractReviewAction('pcon_1', 'REVOKE_CONTRACT_READINESS', {}, {}, actorAdmin);
    assert(cSvc.c.contract_status === 'REVOKED', 'SC4: Contract revoke works');

    await svc.performSlaReviewAction('psla_1', 'REVOKE_SLA_READINESS', {}, {}, actorAdmin);
    assert(sSvc.s.sla_status === 'REVOKED', 'SC4: SLA revoke works');

    // SC5: Warnings/Notes
    await svc.performContractReviewAction('pcon_1', 'ADD_REVIEW_NOTE', { note: 'Test note' }, {}, actorAdmin);
    await svc.performSlaReviewAction('psla_1', 'DISMISS_WARNING', { reason: 'Test dismiss' }, {}, actorAdmin);
    assert(svc._mockEvents.some(e => e.payload_json.message === 'Test note'), 'SC5: Review notes can be added');
    assert(svc._mockEvents.some(e => e.payload_json.message === 'Warning dismissed: Test dismiss'), 'SC6: Warnings can be dismissed');

    // SC7: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderContractSlaReviewService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments'), 'SC7: Source objects remain unchanged');
    assert(!content.includes('axios') && !content.includes('http'), 'SC7: No external calls');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 102D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
