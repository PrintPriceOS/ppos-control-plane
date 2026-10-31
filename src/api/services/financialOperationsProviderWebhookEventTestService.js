const crypto = require('crypto');

class FinancialOperationsProviderWebhookEventTestService {
    constructor(sandboxService) {
        this.sandboxService = sandboxService;
        this._mockTests = new Map();
        this._mockEvents = [];
        this.SUPPORTED_EVENTS = [
            'PAYMENT_AUTHORIZED_EVENT', 'PAYMENT_CAPTURED_EVENT', 'PAYMENT_FAILED_EVENT',
            'REFUND_CREATED_EVENT', 'REFUND_FAILED_EVENT', 'PAYOUT_CREATED_EVENT',
            'PAYOUT_FAILED_EVENT', 'INVOICE_SUBMITTED_EVENT', 'TAX_FILING_STATUS_EVENT',
            'ACCOUNTING_EXPORT_STATUS_EVENT'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createEventTest(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const sandbox = this.sandboxService._getSandbox(payload.webhookSandboxId);

        let blockers = [];
        if (sandbox.webhook_status === 'SUSPENDED') blockers.push('WEBHOOK_SANDBOX_SUSPENDED');
        if (sandbox.live_endpoint_enabled) blockers.push('LIVE_ENDPOINT_ENABLED');
        if (sandbox.live_signing_secret_present) blockers.push('LIVE_SIGNING_SECRET_PRESENT');
        if (!this.SUPPORTED_EVENTS.includes(payload.eventType)) blockers.push('UNSUPPORTED_EVENT_TYPE');

        const test = {
            id: crypto.randomUUID(),
            webhook_event_test_id: `evtest_${crypto.randomUUID()}`,
            webhook_sandbox_id: sandbox.webhook_sandbox_id,
            tenant_id: sandbox.tenant_id,
            provider_key: sandbox.provider_key,
            provider_type: sandbox.provider_type,
            event_type: payload.eventType,
            event_status: blockers.length > 0 ? 'BLOCKED' : 'CREATED',
            webhook_mode: payload.webhookMode || sandbox.webhook_mode,
            request_payload_json: null,
            signature_payload_json: null,
            response_payload_json: null,
            blockers_json: blockers,
            warnings_json: [],
            evidence_json: {},
            result_snapshot_json: null,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockTests.set(test.webhook_event_test_id, test);

        if (blockers.length > 0) {
            await this._recordEvent('FINOPS_PROVIDER_WEBHOOK_EVENT_TEST_BLOCKED', test, actor, `Event test blocked: ${blockers.join(',')}`);
        } else {
            await this._recordEvent('FINOPS_PROVIDER_WEBHOOK_EVENT_TEST_CREATED', test, actor, 'Draft webhook event test created');
        }

        return test;
    }

    async runMockEvent(webhookEventTestId, actor) {
        return this._runTestMode(webhookEventTestId, actor, 'MOCK_WEBHOOK', 'MOCK_EVENT_COMPLETED');
    }

    async runStubEvent(webhookEventTestId, actor) {
        return this._runTestMode(webhookEventTestId, actor, 'STUBBED_WEBHOOK', 'STUB_EVENT_COMPLETED');
    }

    async runDryRunEvent(webhookEventTestId, actor) {
        const test = await this._runTestMode(webhookEventTestId, actor, 'DRY_RUN_EVENT', 'DRY_RUN_EVENT_COMPLETED');
        test.result_snapshot_json = { simulated_internal_state: 'NO_CHANGES_MADE', external_calls_blocked: true };
        return test;
    }

    async _runTestMode(webhookEventTestId, actor, requiredMode, completionEvent) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const test = this._getTest(webhookEventTestId);

        if (test.event_status === 'BLOCKED') {
            throw new Error('Cannot run blocked event test');
        }

        test.request_payload_json = { event: test.event_type, id: `evt_${crypto.randomUUID()}`, simulated: true };
        test.signature_payload_json = { header: 'fake-signature-only', signature: 'sandbox_fake_sig' };
        test.response_payload_json = { status: 200, message: `Processed ${requiredMode} deterministically` };
        test.event_status = completionEvent;
        test.completed_at = new Date().toISOString();
        test.completed_by = actor.userId;

        await this._recordEvent(`FINOPS_PROVIDER_WEBHOOK_${completionEvent}`, test, actor, `${requiredMode} completed successfully`);
        return test;
    }

    _getTest(id) {
        const test = this._mockTests.get(id);
        if (!test) throw new Error('Webhook event test not found');
        return test;
    }

    async _recordEvent(eventType, test, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            webhook_event_test_id: test.webhook_event_test_id,
            webhook_sandbox_id: test.webhook_sandbox_id,
            tenant_id: test.tenant_id,
            provider_key: test.provider_key,
            provider_type: test.provider_type,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderWebhookEventTestService;
