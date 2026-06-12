const crypto = require('crypto');

class FinancialOperationsProductionActivationReviewService {
    constructor() {
        this._mockRuns = [];
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async aggregateReview({ sourceData, actor }) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const review = {
            id: crypto.randomUUID(),
            activation_review_id: `par_${crypto.randomUUID()}`,
            tenant_id: sourceData.tenantId || null,
            hardening_run_id: sourceData.hardeningRunId || null,
            sandbox_id: sourceData.sandboxId || null,
            pilot_program_id: sourceData.pilotProgramId || null,
            release_gate_id: sourceData.releaseGateId || null,
            readiness_run_id: sourceData.readinessRunId || null,
            review_scope: sourceData.sandboxId ? 'PARTNER_SANDBOX_READINESS' : (sourceData.pilotProgramId ? 'PILOT_READINESS' : 'GLOBAL_ACTIVATION_READINESS'),
            security_status: 'UNKNOWN',
            operational_status: 'UNKNOWN',
            compliance_readiness_status: 'UNKNOWN',
            audit_status: 'UNKNOWN',
            rollback_status: 'UNKNOWN',
            go_no_go_status: 'PENDING',
            checks: [],
            blockers: [],
            warnings: [],
            evidence: { aggregated_at: new Date().toISOString() },
            source_snapshot_json: { ...sourceData },
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        const checks = {
            PHASE_95_READINESS_VALIDATED: sourceData.readinessValidated === true,
            PHASE_96_RELEASE_GATES_VALIDATED: sourceData.releaseGatesValidated === true,
            PHASE_97_PILOT_MODE_VALIDATED: sourceData.pilotModeValidated === true,
            PHASE_98_PARTNER_SANDBOX_VALIDATED: sourceData.partnerSandboxValidated === true,
            PHASE_99_PRODUCTION_HARDENING_VALIDATED: sourceData.productionHardeningValidated === true,
            FULL_PUBLIC_DISABLED: sourceData.fullPublicEnabled === false,
            PRODUCTION_ACTIVATION_DISABLED: sourceData.productionActivationEnabled === false,
            LIVE_PROVIDER_CONNECTIVITY_DISABLED: sourceData.liveProviderConnectivityEnabled === false,
            LIVE_PAYMENT_EXECUTION_DISABLED: sourceData.livePaymentEnabled === false,
            LIVE_REFUND_EXECUTION_DISABLED: sourceData.liveRefundEnabled === false,
            LIVE_PAYOUT_EXECUTION_DISABLED: sourceData.livePayoutEnabled === false,
            EXTERNAL_INVOICE_SUBMISSION_DISABLED: sourceData.externalInvoiceEnabled === false,
            TAX_FILING_AUTOMATION_DISABLED: sourceData.taxFilingEnabled === false,
            SOURCE_RECORD_MUTATION_DISABLED: sourceData.mutationDisabled !== false,
            AUDIT_TIMELINE_COMPLETE: sourceData.auditTimelineComplete === true,
            ROLLBACK_PATH_DOCUMENTED: sourceData.rollbackPathDocumented === true,
            INCIDENT_RESPONSE_READY: sourceData.incidentResponseReady === true,
            OBSERVABILITY_READY: sourceData.observabilityReady === true,
            MANUAL_APPROVALS_PRESENT: sourceData.manualApprovalsPresent === true
        };

        // Populate checks
        for (const [code, passed] of Object.entries(checks)) {
            review.checks.push({
                check_code: code,
                check_status: passed ? 'PASS' : 'FAIL'
            });
        }

        // Security
        if (!checks.FULL_PUBLIC_DISABLED || !checks.LIVE_PROVIDER_CONNECTIVITY_DISABLED || !checks.PRODUCTION_ACTIVATION_DISABLED || !checks.LIVE_PAYMENT_EXECUTION_DISABLED || !checks.LIVE_REFUND_EXECUTION_DISABLED || !checks.LIVE_PAYOUT_EXECUTION_DISABLED || !checks.EXTERNAL_INVOICE_SUBMISSION_DISABLED || !checks.TAX_FILING_AUTOMATION_DISABLED || !checks.SOURCE_RECORD_MUTATION_DISABLED) {
            review.security_status = 'BLOCKED';
            review.blockers.push('BLOCKED_BY_SECURITY');
            if (!checks.FULL_PUBLIC_DISABLED) review.blockers.push('FULL_PUBLIC enabled');
            if (!checks.PRODUCTION_ACTIVATION_DISABLED) review.blockers.push('Production activation enabled');
            if (!checks.LIVE_PROVIDER_CONNECTIVITY_DISABLED) review.blockers.push('Live provider connectivity enabled');
        } else {
            review.security_status = 'PASS';
        }

        // Operational
        if (!checks.PHASE_99_PRODUCTION_HARDENING_VALIDATED || !checks.INCIDENT_RESPONSE_READY || !checks.OBSERVABILITY_READY) {
            review.operational_status = 'BLOCKED';
            review.blockers.push('BLOCKED_BY_OPERATIONAL_READINESS');
            if (!checks.PHASE_99_PRODUCTION_HARDENING_VALIDATED) review.blockers.push('Missing Phase 99 production hardening evidence');
        } else {
            review.operational_status = 'PASS';
        }

        // Compliance
        if (!checks.PHASE_95_READINESS_VALIDATED || !checks.PHASE_96_RELEASE_GATES_VALIDATED || !checks.PHASE_97_PILOT_MODE_VALIDATED || !checks.PHASE_98_PARTNER_SANDBOX_VALIDATED || !checks.MANUAL_APPROVALS_PRESENT) {
            review.compliance_readiness_status = 'BLOCKED';
            review.blockers.push('BLOCKED_BY_COMPLIANCE_READINESS');
        } else {
            review.compliance_readiness_status = 'PASS';
        }

        // Audit
        if (!checks.AUDIT_TIMELINE_COMPLETE) {
            review.audit_status = 'BLOCKED';
            review.blockers.push('BLOCKED_BY_AUDIT_GAPS');
            review.blockers.push('Missing audit timeline evidence');
        } else {
            review.audit_status = 'PASS';
        }

        // Rollback
        if (!checks.ROLLBACK_PATH_DOCUMENTED) {
            review.rollback_status = 'BLOCKED';
            review.blockers.push('BLOCKED_BY_ROLLBACK');
            review.blockers.push('Missing rollback path documentation');
        } else {
            review.rollback_status = 'PASS';
        }

        if (review.blockers.length > 0) {
            review.review_status = review.blockers[0]; // First blocker sets status
        } else if (review.warnings.length > 0) {
            review.review_status = 'MANUAL_REVIEW_REQUIRED';
        } else {
            review.review_status = 'READY_FOR_GO_NO_GO_REVIEW';
        }

        this._mockRuns.push(review);

        await this._recordEvent({
            eventType: 'FINOPS_PRODUCTION_ACTIVATION_REVIEW_CREATED',
            actor,
            activation_review_id: review.activation_review_id,
            tenant_id: review.tenant_id,
            message: `Production activation review created`
        });

        await this._recordEvent({
            eventType: 'FINOPS_PRODUCTION_ACTIVATION_REVIEW_AGGREGATED',
            actor,
            activation_review_id: review.activation_review_id,
            tenant_id: review.tenant_id,
            message: `Review evidence aggregated. Status: ${review.review_status}`
        });

        if (review.blockers.length > 0) {
            await this._recordEvent({
                eventType: 'FINOPS_PRODUCTION_ACTIVATION_REVIEW_BLOCKER_DETECTED',
                actor,
                activation_review_id: review.activation_review_id,
                message: `Review blockers detected: ${review.blockers.join(', ')}`
            });
        }

        if (review.warnings.length > 0) {
            await this._recordEvent({
                eventType: 'FINOPS_PRODUCTION_ACTIVATION_REVIEW_WARNING_RAISED',
                actor,
                activation_review_id: review.activation_review_id,
                message: `Review warnings raised: ${review.warnings.join(', ')}`
            });
        }

        if (review.review_status === 'READY_FOR_GO_NO_GO_REVIEW') {
            await this._recordEvent({
                eventType: 'FINOPS_PRODUCTION_ACTIVATION_READY_FOR_GO_NO_GO_REVIEW',
                actor,
                activation_review_id: review.activation_review_id,
                message: `Review is ready for Go / No-Go decision`
            });
        }

        return review;
    }

    async _recordEvent(event) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: event.eventType,
            actor_id: event.actor.userId,
            actor_type: event.actor.role,
            activation_review_id: event.activation_review_id,
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

module.exports = FinancialOperationsProductionActivationReviewService;
