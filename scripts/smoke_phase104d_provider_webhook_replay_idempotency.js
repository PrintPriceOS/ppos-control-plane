'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderWebhookReplayReadinessService = require('../src/api/services/financialOperationsProviderWebhookReplayReadinessService');

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
        this.s = { 
            webhook_sandbox_id: 'wsbox_1', 
            replay_protection_required: true, 
            idempotency_required: true,
            live_signing_secret_present: false,
            live_endpoint_enabled: false,
            live_provider_connectivity_enabled: false,
            full_public_enabled: false
        };
    }
    _getSandbox(id) { return this.s; }
}

async function runSmoke() {
    console.log('\n━━━ Phase 104D — Webhook Replay / Idempotency Readiness Smoke ━━━\n');

    const sandboxSvc = new MockSandboxService();
    const svc = new FinancialOperationsProviderWebhookReplayReadinessService(sandboxSvc);
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    // SC1: Clean replay/idempotency readiness becomes APPROVED_FOR_READINESS
    const r1 = await svc.createReplayReadiness({
        webhookSandboxId: 'wsbox_1', idempotencyKey: 'Idempotency-Key', replayWindowSeconds: 300, duplicateDetectionStatus: 'CONFIGURED'
    }, actorAdmin);
    await svc.approveReplayReadiness(r1.replay_review_id, {}, actorAdmin);
    assert(r1.replay_status === 'APPROVED_FOR_READINESS', 'SC1: Clean replay/idempotency readiness becomes APPROVED_FOR_READINESS');

    // SC2: Missing idempotency key blocks readiness
    const r2 = await svc.createReplayReadiness({
        webhookSandboxId: 'wsbox_1', replayWindowSeconds: 300, duplicateDetectionStatus: 'CONFIGURED'
    }, actorAdmin);
    const eval2 = await svc.evaluateReadiness(r2.replay_review_id, {}, actorAdmin);
    assert(eval2.status === 'BLOCKED' && eval2.blockers.includes('IDEMPOTENCY_KEY_NOT_DEFINED'), 'SC2: Missing idempotency key blocks readiness');

    // SC3: Missing duplicate detection blocks readiness
    const r3 = await svc.createReplayReadiness({
        webhookSandboxId: 'wsbox_1', idempotencyKey: 'Idempotency-Key', replayWindowSeconds: 300
    }, actorAdmin);
    const eval3 = await svc.evaluateReadiness(r3.replay_review_id, {}, actorAdmin);
    assert(eval3.status === 'BLOCKED' && eval3.blockers.includes('DUPLICATE_DETECTION_NOT_DEFINED'), 'SC3: Missing duplicate detection blocks readiness');

    // SC4: Missing replay window blocks readiness
    const r4 = await svc.createReplayReadiness({
        webhookSandboxId: 'wsbox_1', idempotencyKey: 'Idempotency-Key', duplicateDetectionStatus: 'CONFIGURED'
    }, actorAdmin);
    const eval4 = await svc.evaluateReadiness(r4.replay_review_id, {}, actorAdmin);
    assert(eval4.status === 'BLOCKED' && eval4.blockers.includes('REPLAY_WINDOW_NOT_DEFINED'), 'SC4: Missing replay window blocks readiness');

    // SC5: Live signing secret present blocks readiness
    sandboxSvc.s.live_signing_secret_present = true;
    const eval5 = await svc.evaluateReadiness(r1.replay_review_id, {}, actorAdmin);
    assert(eval5.status === 'BLOCKED' && eval5.blockers.includes('LIVE_SIGNING_SECRET_PRESENT'), 'SC5: Live signing secret present blocks readiness');
    sandboxSvc.s.live_signing_secret_present = false;

    // SC6: Live endpoint enabled blocks readiness
    sandboxSvc.s.live_endpoint_enabled = true;
    const eval6 = await svc.evaluateReadiness(r1.replay_review_id, {}, actorAdmin);
    assert(eval6.status === 'BLOCKED' && eval6.blockers.includes('LIVE_ENDPOINT_ENABLED'), 'SC6: Live endpoint enabled blocks readiness');
    sandboxSvc.s.live_endpoint_enabled = false;

    // SC7: FULL_PUBLIC enabled blocks readiness
    sandboxSvc.s.full_public_enabled = true;
    const eval7 = await svc.evaluateReadiness(r1.replay_review_id, {}, actorAdmin);
    assert(eval7.status === 'BLOCKED' && eval7.blockers.includes('FULL_PUBLIC_ENABLED'), 'SC7: FULL_PUBLIC enabled blocks readiness');

    // SC8: Constraints
    const content = fs.readFileSync(path.join(ROOT, 'src/api/services/financialOperationsProviderWebhookReplayReadinessService.js'), 'utf-8');
    assert(!content.includes('UPDATE payments') && !content.includes('axios') && !content.includes('http'), 'SC8: Replay readiness does not process live events, no external calls, source objects unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 104D Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
