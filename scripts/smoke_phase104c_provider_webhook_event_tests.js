'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderWebhookEventTestService = require('../src/api/services/financialOperationsProviderWebhookEventTestService');

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
        this.s = { webhook_sandbox_id: 'wsbox_1', webhook_status: 'ACTIVE_SANDBOX', live_endpoint_enabled: false, live_signing_secret_present: false };
    }
    _getSandbox(id) { return this.s; }
}

async function runSmoke() {
    console.log('\n━━━ Phase 104C — Webhook Event Mock / Stub Test Smoke ━━━\n');

    const sandboxSvc = new MockSandboxService();
    const svc = new FinancialOperationsProviderWebhookEventTestService(sandboxSvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1: Active webhook sandbox creates mock event test
    const t1 = await svc.createEventTest({ webhookSandboxId: 'wsbox_1', eventType: 'PAYMENT_AUTHORIZED_EVENT', webhookMode: 'MOCK_WEBHOOK' }, actorAdmin);
    assert(t1.event_status === 'CREATED', 'SC1: Active webhook sandbox creates mock event test');

    // SC2: Suspended webhook sandbox blocks test
    sandboxSvc.s.webhook_status = 'SUSPENDED';
    const t2 = await svc.createEventTest({ webhookSandboxId: 'wsbox_1', eventType: 'PAYMENT_AUTHORIZED_EVENT', webhookMode: 'MOCK_WEBHOOK' }, actorAdmin);
    assert(t2.event_status === 'BLOCKED' && t2.blockers_json.includes('WEBHOOK_SANDBOX_SUSPENDED'), 'SC2: Suspended webhook sandbox blocks test');
    sandboxSvc.s.webhook_status = 'ACTIVE_SANDBOX';

    // SC3: Unsupported event type blocks test
    const t3 = await svc.createEventTest({ webhookSandboxId: 'wsbox_1', eventType: 'INVALID_EVENT', webhookMode: 'MOCK_WEBHOOK' }, actorAdmin);
    assert(t3.event_status === 'BLOCKED' && t3.blockers_json.includes('UNSUPPORTED_EVENT_TYPE'), 'SC3: Unsupported event type blocks test');

    // SC4: Live endpoint flag blocks test
    sandboxSvc.s.live_endpoint_enabled = true;
    const t4 = await svc.createEventTest({ webhookSandboxId: 'wsbox_1', eventType: 'PAYMENT_AUTHORIZED_EVENT', webhookMode: 'MOCK_WEBHOOK' }, actorAdmin);
    assert(t4.event_status === 'BLOCKED' && t4.blockers_json.includes('LIVE_ENDPOINT_ENABLED'), 'SC4: Live endpoint flag blocks test');
    sandboxSvc.s.live_endpoint_enabled = false;

    // SC5: Live signing secret present blocks test
    sandboxSvc.s.live_signing_secret_present = true;
    const t5 = await svc.createEventTest({ webhookSandboxId: 'wsbox_1', eventType: 'PAYMENT_AUTHORIZED_EVENT', webhookMode: 'MOCK_WEBHOOK' }, actorAdmin);
    assert(t5.event_status === 'BLOCKED' && t5.blockers_json.includes('LIVE_SIGNING_SECRET_PRESENT'), 'SC5: Live signing secret present blocks test');
    sandboxSvc.s.live_signing_secret_present = false;

    // SC6: MOCK_WEBHOOK returns deterministic local response
    const tm = await svc.runMockEvent(t1.webhook_event_test_id, actorAdmin);
    assert(tm.event_status === 'MOCK_EVENT_COMPLETED' && tm.response_payload_json.status === 200, 'SC6: MOCK_WEBHOOK returns deterministic local response');

    // SC7: STUBBED_WEBHOOK returns deterministic local response
    const t7 = await svc.createEventTest({ webhookSandboxId: 'wsbox_1', eventType: 'PAYMENT_AUTHORIZED_EVENT', webhookMode: 'STUBBED_WEBHOOK' }, actorAdmin);
    const ts = await svc.runStubEvent(t7.webhook_event_test_id, actorAdmin);
    assert(ts.event_status === 'STUB_EVENT_COMPLETED' && ts.response_payload_json.status === 200, 'SC7: STUBBED_WEBHOOK returns deterministic local response');

    // SC8: DRY_RUN_EVENT produces result snapshot
    const t8 = await svc.createEventTest({ webhookSandboxId: 'wsbox_1', eventType: 'PAYMENT_AUTHORIZED_EVENT', webhookMode: 'DRY_RUN_EVENT' }, actorAdmin);
    const tdr = await svc.runDryRunEvent(t8.webhook_event_test_id, actorAdmin);
    assert(tdr.event_status === 'DRY_RUN_EVENT_COMPLETED' && tdr.result_snapshot_json, 'SC8: DRY_RUN_EVENT produces result snapshot');

    // SC9: Fake signatures are marked fake/sandbox only
    assert(tm.signature_payload_json.signature === 'sandbox_fake_sig', 'SC9: Fake signatures are marked fake/sandbox only');

    // SC10: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookEventTestService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments') && !content.includes('axios') && !content.includes('http'), 'SC10: No external operation occurs and source records remain unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 104C Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
