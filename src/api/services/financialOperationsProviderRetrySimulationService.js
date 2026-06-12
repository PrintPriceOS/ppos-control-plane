const crypto = require('crypto');

class FinancialOperationsProviderRetrySimulationService {
    constructor() {
        this._mockEvents = [];
        this._mockFindings = [];
        this.SUPPORTED_RETRY_MODES = [
            'SANDBOX_RETRY', 'DRY_RUN_RETRY', 'MOCK_RETRY',
            'STUBBED_RETRY', 'SIMULATION_ONLY', 'FAILURE_RETRY_READINESS_ONLY'
        ];
        this.SUPPORTED_BACKOFF_STRATEGIES = [
            'FIXED_DELAY', 'LINEAR_BACKOFF', 'EXPONENTIAL_BACKOFF',
            'JITTERED_EXPONENTIAL_BACKOFF', 'NO_RETRY', 'MANUAL_REVIEW_REQUIRED'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateRetryPolicy(classifiedFailure, policyJson, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        await this._recordEvent('FINOPS_PROVIDER_RETRY_POLICY_EVALUATED', classifiedFailure, actor, `Evaluating policy for failure category ${classifiedFailure.failure_category}`);

        if (!policyJson) {
            await this._createFinding(classifiedFailure, 'MISSING_RETRY_POLICY', 'HIGH', 'Missing policy', 'retry policy missing');
            return { action: 'BLOCK' };
        }

        if (policyJson.max_attempts === undefined) {
            await this._createFinding(classifiedFailure, 'MISSING_MAX_ATTEMPTS', 'HIGH', 'Missing max attempts', 'max attempts missing');
            return { action: 'BLOCK' };
        }

        if (policyJson.max_attempts > 10 || policyJson.max_attempts < 0) {
            await this._createFinding(classifiedFailure, 'UNSAFE_INFINITE_RETRY', 'CRITICAL', 'Policy allows too many or infinite retries', 'unsafe infinite retry');
            await this._recordEvent('FINOPS_PROVIDER_RETRY_POLICY_BLOCKER_DETECTED', classifiedFailure, actor, 'Infinite retry blocked');
            return { action: 'BLOCK' };
        }

        if (classifiedFailure.failure_category === 'PROVIDER_4XX' && policyJson.strategy !== 'NO_RETRY') {
            await this._createFinding(classifiedFailure, 'RETRY_ON_NON_RETRYABLE', 'MEDIUM', 'Attempting retry on a 4XX error', 'retry on non-retryable failure');
            return { action: 'NO_RETRY' };
        }

        if (!policyJson.dead_letter_path) {
            await this._createFinding(classifiedFailure, 'MISSING_DEAD_LETTER_PATH', 'HIGH', 'No fallback defined', 'missing dead-letter path');
            return { action: 'BLOCK' };
        }

        if (!classifiedFailure.request_payload_json.idempotency_key && policyJson.strategy !== 'NO_RETRY') {
            await this._createFinding(classifiedFailure, 'MISSING_IDEMPOTENCY_KEY', 'CRITICAL', 'Cannot retry without idempotency key', 'retry without idempotency key');
            await this._recordEvent('FINOPS_PROVIDER_RETRY_POLICY_BLOCKER_DETECTED', classifiedFailure, actor, 'Blocked: Missing idempotency key');
            return { action: 'BLOCK' };
        }

        return { action: 'PROCEED', strategy: policyJson.strategy, max_attempts: policyJson.max_attempts };
    }

    async simulateRetrySchedule(classifiedFailure, policyJson, attemptNumber, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const evalResult = await this.evaluateRetryPolicy(classifiedFailure, policyJson, actor);

        if (evalResult.action !== 'PROCEED') {
            return { scheduled: false, reason: evalResult.action };
        }

        const baseDelay = policyJson.base_delay_ms || 1000;
        let delayMs = 0;

        switch (policyJson.strategy) {
            case 'FIXED_DELAY':
                delayMs = baseDelay;
                break;
            case 'LINEAR_BACKOFF':
                delayMs = baseDelay * attemptNumber;
                break;
            case 'EXPONENTIAL_BACKOFF':
                delayMs = baseDelay * Math.pow(2, attemptNumber - 1);
                break;
            case 'JITTERED_EXPONENTIAL_BACKOFF':
                // Deterministic jitter for simulation using attemptNumber
                delayMs = (baseDelay * Math.pow(2, attemptNumber - 1)) + (attemptNumber * 10);
                break;
            default:
                delayMs = 0;
        }

        await this._recordEvent('FINOPS_PROVIDER_RETRY_ATTEMPT_SIMULATED', classifiedFailure, actor, `Simulated attempt ${attemptNumber} with delay ${delayMs}ms using ${policyJson.strategy}`);

        return { scheduled: true, delayMs, strategy: policyJson.strategy };
    }

    async _createFinding(record, code, severity, message, description) {
        const finding = {
            id: crypto.randomUUID(),
            failure_retry_run_id: record.failure_retry_run_id,
            retry_attempt_id: record.retry_attempt_id,
            finding_code: code,
            severity,
            category: 'POLICY_VIOLATION',
            message,
            recommended_action: description,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        this._mockFindings.push(finding);
        return finding;
    }

    async _recordEvent(eventType, record, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            failure_retry_run_id: record ? record.failure_retry_run_id : null,
            retry_attempt_id: record ? record.retry_attempt_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderRetrySimulationService;
