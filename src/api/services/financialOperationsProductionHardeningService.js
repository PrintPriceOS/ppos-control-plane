const crypto = require('crypto');

class FinancialOperationsProductionHardeningService {
    constructor() {
        this._mockRuns = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async evaluateHardening({ sourceData, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const run = {
            id: crypto.randomUUID(),
            hardening_run_id: `hr_${crypto.randomUUID()}`,
            tenant_id: sourceData.tenantId || null,
            sandbox_id: sourceData.sandboxId || null,
            pilot_program_id: sourceData.pilotProgramId || null,
            release_gate_id: sourceData.releaseGateId || null,
            readiness_run_id: sourceData.readinessRunId || null,
            hardening_scope: sourceData.sandboxId ? 'PARTNER_SANDBOX' : (sourceData.pilotProgramId ? 'PILOT' : 'GLOBAL'),
            security_status: 'UNKNOWN',
            configuration_status: 'UNKNOWN',
            observability_status: 'UNKNOWN',
            rollback_status: 'UNKNOWN',
            incident_response_status: 'UNKNOWN',
            audit_status: 'UNKNOWN',
            checks: [],
            blockers: [],
            warnings: [],
            evidence: { evaluated_at: new Date().toISOString() },
            source_snapshot_json: { ...sourceData },
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        const checks = {
            FULL_PUBLIC_DISABLED: sourceData.fullPublicEnabled === false,
            LIVE_PAYMENT_EXECUTION_DISABLED: sourceData.livePaymentEnabled === false,
            LIVE_REFUND_EXECUTION_DISABLED: sourceData.liveRefundEnabled === false,
            LIVE_PAYOUT_EXECUTION_DISABLED: sourceData.livePayoutEnabled === false,
            EXTERNAL_INVOICE_SUBMISSION_DISABLED: sourceData.externalInvoiceEnabled === false,
            TAX_FILING_AUTOMATION_DISABLED: sourceData.taxFilingEnabled === false,
            MOCK_PROVIDER_LOCAL_ONLY: sourceData.mockProviderLocalOnly !== false,
            SANDBOX_ONLY_MODE_CONFIRMED: sourceData.sandboxOnly !== false,
            RELEASE_GATE_APPROVAL_AUDITED: sourceData.releaseGateAudited === true,
            PILOT_RUNS_AUDITED: sourceData.pilotRunsAudited !== false,
            PARTNER_SANDBOX_RUNS_AUDITED: sourceData.sandboxRunsAudited !== false,
            RATE_LIMITS_CONFIGURED: sourceData.rateLimitsConfigured === true,
            INCIDENT_RESPONSE_READY: sourceData.incidentResponseReady === true,
            ROLLBACK_PATH_DOCUMENTED: sourceData.rollbackPathDocumented === true,
            OBSERVABILITY_EVENTS_PRESENT: sourceData.observabilityEventsPresent === true,
            SOURCE_RECORD_MUTATION_DISABLED: sourceData.mutationDisabled !== false
        };

        // Populate checks
        for (const [code, passed] of Object.entries(checks)) {
            run.checks.push({
                check_code: code,
                check_status: passed ? 'PASS' : 'FAIL'
            });
        }

        // Configuration
        if (!checks.FULL_PUBLIC_DISABLED || !checks.LIVE_PAYMENT_EXECUTION_DISABLED || !checks.LIVE_REFUND_EXECUTION_DISABLED || !checks.LIVE_PAYOUT_EXECUTION_DISABLED || !checks.EXTERNAL_INVOICE_SUBMISSION_DISABLED || !checks.TAX_FILING_AUTOMATION_DISABLED || !checks.MOCK_PROVIDER_LOCAL_ONLY || !checks.SANDBOX_ONLY_MODE_CONFIRMED || !checks.RATE_LIMITS_CONFIGURED || !checks.SOURCE_RECORD_MUTATION_DISABLED) {
            run.configuration_status = 'BLOCKED';
            run.blockers.push('BLOCKED_BY_CONFIGURATION');
            if (!checks.FULL_PUBLIC_DISABLED) run.blockers.push('FULL_PUBLIC enabled');
            if (!checks.MOCK_PROVIDER_LOCAL_ONLY) run.blockers.push('External execution flag enabled');
        } else {
            run.configuration_status = 'PASS';
        }

        // Security
        if (run.configuration_status === 'BLOCKED') {
            run.security_status = 'BLOCKED';
            run.blockers.push('BLOCKED_BY_SECURITY');
        } else {
            run.security_status = 'PASS';
        }

        // Audit
        if (!checks.RELEASE_GATE_APPROVAL_AUDITED || !checks.PILOT_RUNS_AUDITED || !checks.PARTNER_SANDBOX_RUNS_AUDITED) {
            run.audit_status = 'BLOCKED';
            run.blockers.push('BLOCKED_BY_AUDIT_GAPS');
            run.blockers.push('Missing audit timeline');
        } else {
            run.audit_status = 'PASS';
        }

        // Observability
        if (!checks.OBSERVABILITY_EVENTS_PRESENT) {
            run.observability_status = 'BLOCKED';
            run.blockers.push('BLOCKED_BY_OBSERVABILITY');
            run.blockers.push('Missing observability events');
        } else {
            run.observability_status = 'PASS';
        }

        // Rollback
        if (!checks.ROLLBACK_PATH_DOCUMENTED) {
            run.rollback_status = 'BLOCKED';
            run.blockers.push('BLOCKED_BY_ROLLBACK');
            run.blockers.push('Missing rollback path');
        } else {
            run.rollback_status = 'PASS';
        }

        // Incident
        if (!checks.INCIDENT_RESPONSE_READY) {
            run.incident_response_status = 'BLOCKED';
            run.blockers.push('BLOCKED_BY_INCIDENT_RESPONSE');
        } else {
            run.incident_response_status = 'PASS';
        }

        if (run.blockers.length > 0) {
            run.hardening_status = run.blockers[0]; // First blocker sets status
        } else {
            run.hardening_status = 'READY_FOR_PRODUCTION_READINESS_REVIEW';
        }

        this._mockRuns.push(run);

        await this._recordEvent({
            eventType: 'FINOPS_PRODUCTION_HARDENING_RUN_CREATED',
            actor,
            hardening_run_id: run.hardening_run_id,
            sandbox_id: run.sandbox_id,
            pilot_program_id: run.pilot_program_id,
            release_gate_id: run.release_gate_id,
            readiness_run_id: run.readiness_run_id,
            tenant_id: run.tenant_id,
            message: `Hardening run created with status: ${run.hardening_status}`
        });

        if (run.blockers.length > 0) {
            await this._recordEvent({
                eventType: 'FINOPS_PRODUCTION_HARDENING_BLOCKER_DETECTED',
                actor,
                hardening_run_id: run.hardening_run_id,
                message: `Hardening blockers detected: ${run.blockers.join(', ')}`
            });
        }

        if (run.hardening_status === 'READY_FOR_PRODUCTION_READINESS_REVIEW') {
            await this._recordEvent({
                eventType: 'FINOPS_PRODUCTION_HARDENING_READY_FOR_REVIEW',
                actor,
                hardening_run_id: run.hardening_run_id,
                message: `Hardening run is ready for production readiness review`
            });
        }

        return run;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            hardening_run_id: event.hardening_run_id,
            sandbox_id: event.sandbox_id,
            pilot_program_id: event.pilot_program_id,
            release_gate_id: event.release_gate_id,
            readiness_run_id: event.readiness_run_id,
            tenant_id: event.tenant_id,
            payload_json: { message: event.message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsProductionHardeningService;
