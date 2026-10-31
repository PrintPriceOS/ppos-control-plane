const crypto = require('crypto');

class FinancialOperationsProviderConnectivityTestService {
    constructor(sandboxService) {
        this.sandboxService = sandboxService;
        this._mockTests = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createTest(providerSandboxId, payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const sandbox = this.sandboxService._getSandbox(providerSandboxId);

        const test = {
            id: crypto.randomUUID(),
            connection_test_id: `ctest_${crypto.randomUUID()}`,
            provider_sandbox_id: sandbox.provider_sandbox_id,
            tenant_id: sandbox.tenant_id,
            provider_key: sandbox.provider_key,
            provider_type: sandbox.provider_type,
            test_status: 'CREATED',
            connectivity_mode: payload.connectivityMode || 'MOCK_PROVIDER',
            operation_type: payload.operationType,
            request_payload_json: payload.requestPayload || {},
            response_payload_json: null,
            blockers_json: [],
            warnings_json: [],
            evidence_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        if (sandbox.sandbox_status !== 'ACTIVE_SANDBOX') {
            test.test_status = 'BLOCKED';
            test.blockers_json.push('Sandbox is not ACTIVE_SANDBOX');
        }

        if (!sandbox.allowed_operation_types_json.includes(test.operation_type)) {
            test.test_status = 'BLOCKED';
            test.blockers_json.push(`Operation type ${test.operation_type} is not in allowlist`);
        }

        if (sandbox.live_provider_connectivity_enabled) {
            test.test_status = 'BLOCKED';
            test.blockers_json.push('Live provider connectivity is enabled. Tests are blocked to prevent accidental live execution.');
        }

        if (sandbox.live_credentials_present) {
            test.test_status = 'BLOCKED';
            test.blockers_json.push('Live credentials are present. Tests are blocked to prevent accidental live execution.');
        }

        if (test.test_status !== 'BLOCKED') {
            test.test_status = 'READY_FOR_TEST';
        }

        this._mockTests.set(test.connection_test_id, test);

        await this._recordEvent(
            test.test_status === 'BLOCKED' ? 'FINOPS_PROVIDER_CONNECTION_TEST_BLOCKED' : 'FINOPS_PROVIDER_CONNECTION_TEST_CREATED',
            test,
            actor,
            `Connection test created. Status: ${test.test_status}`
        );

        return test;
    }

    async executeMockTest(connectionTestId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const test = this._getTest(connectionTestId);

        if (test.test_status !== 'READY_FOR_TEST') {
            throw new Error(`Cannot execute mock test. Current status: ${test.test_status}`);
        }
        if (test.connectivity_mode !== 'MOCK_PROVIDER') {
            throw new Error('Test connectivity mode must be MOCK_PROVIDER');
        }

        // Local deterministic response
        test.response_payload_json = {
            mock_status: 'SUCCESS',
            mock_transaction_id: `mock_txn_${crypto.randomUUID()}`,
            message: 'Local deterministic mock response. No external API was called.'
        };
        test.test_status = 'MOCK_COMPLETED';
        test.completed_at = new Date().toISOString();
        test.completed_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_MOCK_TEST_COMPLETED', test, actor, 'Mock test completed locally');
        return test;
    }

    async executeStubTest(connectionTestId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const test = this._getTest(connectionTestId);

        if (test.test_status !== 'READY_FOR_TEST') {
            throw new Error(`Cannot execute stub test. Current status: ${test.test_status}`);
        }
        if (test.connectivity_mode !== 'STUBBED_PROVIDER') {
            throw new Error('Test connectivity mode must be STUBBED_PROVIDER');
        }

        test.response_payload_json = {
            stub_status: 'SUCCESS',
            stub_reference: `stub_ref_${crypto.randomUUID()}`,
            message: 'Local deterministic stub response. No external API was called.'
        };
        test.test_status = 'STUB_COMPLETED';
        test.completed_at = new Date().toISOString();
        test.completed_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_STUB_TEST_COMPLETED', test, actor, 'Stub test completed locally');
        return test;
    }

    async executeDryRun(connectionTestId, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN']);
        const test = this._getTest(connectionTestId);

        if (test.test_status !== 'READY_FOR_TEST') {
            throw new Error(`Cannot execute dry run. Current status: ${test.test_status}`);
        }
        if (test.connectivity_mode !== 'DRY_RUN') {
            throw new Error('Test connectivity mode must be DRY_RUN');
        }

        test.result_snapshot_json = {
            dry_run_status: 'SUCCESS',
            simulated_changes: [],
            message: 'Dry run completed. Source records were not modified.'
        };
        test.test_status = 'DRY_RUN_COMPLETED';
        test.completed_at = new Date().toISOString();
        test.completed_by = actor.userId;

        await this._recordEvent('FINOPS_PROVIDER_DRY_RUN_COMPLETED', test, actor, 'Dry run completed locally');
        return test;
    }

    _getTest(id) {
        const test = this._mockTests.get(id);
        if (!test) throw new Error('Connection test not found');
        return test;
    }

    async _recordEvent(eventType, test, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            provider_sandbox_id: test.provider_sandbox_id,
            connection_test_id: test.connection_test_id,
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

module.exports = FinancialOperationsProviderConnectivityTestService;
