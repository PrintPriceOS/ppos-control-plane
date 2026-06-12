const crypto = require('crypto');

class FinancialOperationsProviderEventReconciliationService {
    constructor() {
        this._mockRuns = new Map();
        this._mockEvents = [];
        this._mockMatches = new Map();
        this._mockFindings = new Map();
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createReconciliationRun(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const run = {
            id: crypto.randomUUID(),
            event_reconciliation_run_id: `recrun_${crypto.randomUUID()}`,
            tenant_id: payload.tenantId || null,
            provider_key: payload.providerKey,
            provider_type: payload.providerType,
            provider_name: payload.providerName || 'Unknown Provider',
            webhook_sandbox_id: payload.webhookSandboxId || null,
            provider_sandbox_id: payload.providerSandboxId || null,
            credential_vault_id: payload.credentialVaultId || null,
            readiness_run_id: payload.readinessRunId || null,
            reconciliation_status: 'CREATED',
            reconciliation_scope: payload.reconciliationScope || 'SANDBOX_ONLY',
            event_mode: payload.eventMode,
            source_event_count: 0,
            matched_event_count: 0,
            unmatched_event_count: 0,
            duplicate_event_count: 0,
            mismatched_event_count: 0,
            blockers_json: [],
            warnings_json: [],
            evidence_json: {},
            source_snapshot_json: null,
            result_snapshot_json: null,
            metadata_json: {},
            created_at: new Date().toISOString(),
            created_by: actor.userId,
            updated_at: new Date().toISOString()
        };

        this._mockRuns.set(run.event_reconciliation_run_id, run);
        await this._recordEvent('FINOPS_PROVIDER_EVENT_RECONCILIATION_RUN_CREATED', run, actor, 'Reconciliation run created');
        return run;
    }

    async matchEvent(eventReconciliationRunId, normalizedEvent, internalReference, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN']);
        const run = this._getRun(eventReconciliationRunId);

        run.source_event_count++;

        if (!normalizedEvent.idempotency_key) {
            await this._createFinding(run, normalizedEvent, null, 'MISSING_IDEMPOTENCY_KEY', 'HIGH', 'Idempotency key missing');
            run.mismatched_event_count++;
            return this._recordMatch(run, normalizedEvent, internalReference, 'MANUAL_REVIEW_REQUIRED', actor);
        }

        // Simulate duplicate detection
        if (this._isDuplicate(normalizedEvent)) {
            await this._createFinding(run, normalizedEvent, null, 'DUPLICATE_EVENT', 'MEDIUM', 'Duplicate provider event detected');
            run.duplicate_event_count++;
            await this._recordEvent('FINOPS_PROVIDER_EVENT_DUPLICATE_DETECTED', run, actor, 'Duplicate detected');
            return this._recordMatch(run, normalizedEvent, internalReference, 'DUPLICATE', actor);
        }

        if (!internalReference) {
            await this._createFinding(run, normalizedEvent, null, 'UNMATCHED_EVENT', 'MEDIUM', 'No internal reference found for event');
            run.unmatched_event_count++;
            await this._recordEvent('FINOPS_PROVIDER_EVENT_UNMATCHED', run, actor, 'Unmatched event detected');
            return this._recordMatch(run, normalizedEvent, null, 'UNMATCHED', actor);
        }

        const matchId = `match_${crypto.randomUUID()}`;
        let matchStatus = 'MATCHED';

        if (Number(normalizedEvent.amount) !== Number(internalReference.amount)) {
            matchStatus = 'MISMATCHED_AMOUNT';
            run.mismatched_event_count++;
            await this._createFinding(run, normalizedEvent, matchId, 'AMOUNT_MISMATCH', 'HIGH', `Expected ${internalReference.amount}, got ${normalizedEvent.amount}`);
        } else if (normalizedEvent.currency !== internalReference.currency) {
            matchStatus = 'MISMATCHED_CURRENCY';
            run.mismatched_event_count++;
            await this._createFinding(run, normalizedEvent, matchId, 'CURRENCY_MISMATCH', 'HIGH', `Expected ${internalReference.currency}, got ${normalizedEvent.currency}`);
        } else {
            run.matched_event_count++;
        }

        if (matchStatus !== 'MATCHED') {
            await this._recordEvent('FINOPS_PROVIDER_EVENT_MISMATCH_DETECTED', run, actor, `Mismatch detected: ${matchStatus}`);
        } else {
            await this._recordEvent('FINOPS_PROVIDER_EVENT_MATCHED', run, actor, 'Event matched successfully');
        }

        return this._recordMatch(run, normalizedEvent, internalReference, matchStatus, actor, matchId);
    }

    async _createFinding(run, event, matchId, code, severity, message) {
        const finding = {
            id: crypto.randomUUID(),
            event_reconciliation_run_id: run.event_reconciliation_run_id,
            provider_event_record_id: event.provider_event_record_id,
            provider_event_match_id: matchId,
            finding_code: code,
            severity,
            category: 'RECONCILIATION',
            message,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        this._mockFindings.set(finding.id, finding);
        return finding;
    }

    async _recordMatch(run, event, ref, status, actor, forceId) {
        const match = {
            id: crypto.randomUUID(),
            provider_event_match_id: forceId || `match_${crypto.randomUUID()}`,
            event_reconciliation_run_id: run.event_reconciliation_run_id,
            provider_event_record_id: event.provider_event_record_id,
            internal_reference_id: ref ? ref.id : null,
            match_status: status,
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };
        this._mockMatches.set(match.provider_event_match_id, match);
        return match;
    }

    _isDuplicate(event) {
        if (event.request_payload_json?.duplicate === true) return true;
        return false;
    }

    _getRun(id) {
        const run = this._mockRuns.get(id);
        if (!run) throw new Error('Reconciliation run not found');
        return run;
    }

    async _recordEvent(eventType, run, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            event_reconciliation_run_id: run.event_reconciliation_run_id,
            provider_key: run.provider_key,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProviderEventReconciliationService;
