'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderSandboxService = require('../src/api/services/financialOperationsProviderSandboxService');
const FinancialOperationsProviderConnectivityTestService = require('../src/api/services/financialOperationsProviderConnectivityTestService');

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
    console.log('\n━━━ Phase 101C — Provider Connectivity Test / Mock Adapter Smoke ━━━\n');

    const sbSvc = new FinancialOperationsProviderSandboxService();
    const testSvc = new FinancialOperationsProviderConnectivityTestService(sbSvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // Setup active sandbox
    const sb = await sbSvc.createSandboxConfig({
        tenantId: 't1', providerKey: 'stripe_mock', providerType: 'PAYMENT_PROVIDER',
        providerName: 'Stripe Mock', allowedOperations: ['PAYMENT_AUTH_TEST'], blockedOperations: []
    }, actorAdmin);
    await sbSvc.requestReview(sb.provider_sandbox_id, actorAdmin);
    await sbSvc.activateSandbox(sb.provider_sandbox_id, actorAdmin);

    // SC1: Active sandbox creates mock provider test
    const t1 = await testSvc.createTest(sb.provider_sandbox_id, {
        connectivityMode: 'MOCK_PROVIDER',
        operationType: 'PAYMENT_AUTH_TEST'
    }, actorAdmin);
    assert(t1.test_status === 'READY_FOR_TEST', 'SC1: Test created and ready');

    // SC2: Mock provider returns deterministic local response
    const r1 = await testSvc.executeMockTest(t1.connection_test_id, actorAdmin);
    assert(r1.test_status === 'MOCK_COMPLETED' && r1.response_payload_json.mock_status === 'SUCCESS', 'SC2: Mock completed locally');

    // SC3: Operation outside allowlist blocks test
    const t2 = await testSvc.createTest(sb.provider_sandbox_id, {
        connectivityMode: 'MOCK_PROVIDER',
        operationType: 'PAYMENT_CAPTURE_TEST'
    }, actorAdmin);
    assert(t2.test_status === 'BLOCKED', 'SC3: Operation outside allowlist blocked');

    // SC4: Suspended sandbox blocks test
    await sbSvc.suspendSandbox(sb.provider_sandbox_id, actorAdmin);
    const t3 = await testSvc.createTest(sb.provider_sandbox_id, {
        connectivityMode: 'MOCK_PROVIDER',
        operationType: 'PAYMENT_AUTH_TEST'
    }, actorAdmin);
    assert(t3.test_status === 'BLOCKED', 'SC4: Suspended sandbox blocked test');

    // Reactivate for further tests
    await sbSvc.activateSandbox(sb.provider_sandbox_id, actorAdmin);

    // SC5: STUBBED_PROVIDER returns deterministic local response
    const tStub = await testSvc.createTest(sb.provider_sandbox_id, {
        connectivityMode: 'STUBBED_PROVIDER',
        operationType: 'PAYMENT_AUTH_TEST'
    }, actorAdmin);
    const rStub = await testSvc.executeStubTest(tStub.connection_test_id, actorAdmin);
    assert(rStub.test_status === 'STUB_COMPLETED', 'SC5: Stub test completed locally');

    // SC6: DRY_RUN produces result snapshot
    const tDry = await testSvc.createTest(sb.provider_sandbox_id, {
        connectivityMode: 'DRY_RUN',
        operationType: 'PAYMENT_AUTH_TEST'
    }, actorAdmin);
    const rDry = await testSvc.executeDryRun(tDry.connection_test_id, actorAdmin);
    assert(rDry.test_status === 'DRY_RUN_COMPLETED' && rDry.result_snapshot_json, 'SC6: Dry run completed locally');

    // SC7: Live blocks
    sb.live_provider_connectivity_enabled = true;
    const tLive = await testSvc.createTest(sb.provider_sandbox_id, {
        connectivityMode: 'MOCK_PROVIDER', operationType: 'PAYMENT_AUTH_TEST'
    }, actorAdmin);
    assert(tLive.test_status === 'BLOCKED', 'SC7: Live connectivity blocks test');

    // SC8
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderConnectivityTestService.js'), 'utf-8');
    assert(!content.includes('axios') && !content.includes('http'), 'SC8: No live API calls');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 101C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
