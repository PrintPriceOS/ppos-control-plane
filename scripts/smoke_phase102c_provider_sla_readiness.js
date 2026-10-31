'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderSlaReadinessService = require('../src/api/services/financialOperationsProviderSlaReadinessService');

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

class MockSandboxService {
    constructor() {
        this.sb = { live_provider_connectivity_enabled: false, full_public_enabled: false };
    }
    _getSandbox(id) { return this.sb; }
}

class MockContractService {
    constructor() {
        this.c = { contract_status: 'APPROVED_FOR_READINESS' };
    }
    _getContract(id) { return this.c; }
}

async function runSmoke() {
    console.log('\n━━━ Phase 102C — Provider SLA Readiness Smoke ━━━\n');

    const sbSvc = new MockSandboxService();
    const cSvc = new MockContractService();
    const svc = new FinancialOperationsProviderSlaReadinessService(sbSvc, cSvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const sla1 = await svc.createSla({
        providerContractId: 'pcon_1', providerSandboxId: 'psand_1', providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER',
        uptimeTarget: '99.99%', responseTimeTarget: '< 200ms', incidentResponseTarget: '< 15m', supportHours: '24/7',
        escalationPath: ['L1', 'L2'], monitoringRequirements: ['Ping', 'Errors'], rollbackRequirements: ['Auto', 'Manual'],
        rateLimitCommitments: ['1000/s']
    }, actorAdmin);

    // SC1: Clean SLA is READY
    const r1 = await svc.evaluateReadiness(sla1.provider_sla_id, {}, actorAdmin);
    assert(r1.status === 'READY', 'SC1: Clean SLA is READY');

    // SC2: Missing targets block readiness
    const sla2 = await svc.createSla({
        providerContractId: 'pcon_1', providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER',
        responseTimeTarget: '< 200ms', incidentResponseTarget: '< 15m', supportHours: '24/7',
        escalationPath: ['L1'], monitoringRequirements: ['Ping'], rollbackRequirements: ['Auto'], rateLimitCommitments: ['1000/s']
    }, actorAdmin);
    const r2 = await svc.evaluateReadiness(sla2.provider_sla_id, {}, actorAdmin);
    assert(r2.status === 'BLOCKED' && r2.blockers.includes('UPTIME_TARGET_MISSING'), 'SC2: Missing uptime target blocks readiness');

    // SC3: Missing arrays block readiness
    const sla3 = await svc.createSla({
        providerContractId: 'pcon_1', providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER',
        uptimeTarget: '99.99%', responseTimeTarget: '< 200ms', incidentResponseTarget: '< 15m', supportHours: '24/7',
        escalationPath: [], monitoringRequirements: ['Ping'], rollbackRequirements: [], rateLimitCommitments: ['1000/s']
    }, actorAdmin);
    const r3 = await svc.evaluateReadiness(sla3.provider_sla_id, {}, actorAdmin);
    assert(r3.status === 'BLOCKED' && r3.blockers.includes('ESCALATION_PATH_MISSING') && r3.blockers.includes('ROLLBACK_REQUIREMENTS_MISSING'), 'SC3: Missing escalation/rollback blocks readiness');

    // SC4: Contract not approved blocks readiness
    cSvc.c.contract_status = 'PENDING';
    const r4 = await svc.evaluateReadiness(sla1.provider_sla_id, {}, actorAdmin);
    assert(r4.status === 'BLOCKED' && r4.blockers.includes('CONTRACT_NOT_APPROVED'), 'SC4: Missing linked approved contract blocks readiness');

    // SC5: Live connectivity blocks readiness
    cSvc.c.contract_status = 'APPROVED_FOR_READINESS';
    sbSvc.sb.live_provider_connectivity_enabled = true;
    const r5 = await svc.evaluateReadiness(sla1.provider_sla_id, {}, actorAdmin);
    assert(r5.status === 'BLOCKED' && r5.blockers.includes('LIVE_PROVIDER_CONNECTIVITY_ENABLED'), 'SC5: Live connectivity blocks readiness');

    // SC6: FULL_PUBLIC blocks readiness
    sbSvc.sb.live_provider_connectivity_enabled = false;
    sbSvc.sb.full_public_enabled = true;
    const r6 = await svc.evaluateReadiness(sla1.provider_sla_id, {}, actorAdmin);
    assert(r6.status === 'BLOCKED' && r6.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC6: FULL_PUBLIC blocks readiness');

    // SC7: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderSlaReadinessService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments'), 'SC7: Source objects remain unchanged');
    assert(!content.includes('axios') && !content.includes('http'), 'SC7: No external calls');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 102C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
