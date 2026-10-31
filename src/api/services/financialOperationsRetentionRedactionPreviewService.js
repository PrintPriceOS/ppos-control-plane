const crypto = require('crypto');

class FinancialOperationsRetentionRedactionPreviewService {
    constructor(policyService) {
        this._mockEvents = [];
        this._mockReviews = [];
        this.policyService = policyService;
        this.SUPPORTED_MODES = [
            'RETENTION_PREVIEW_ONLY', 'REDACTION_PREVIEW_ONLY',
            'DELETION_ELIGIBILITY_PREVIEW_ONLY', 'ANONYMIZATION_PREVIEW_ONLY',
            'POLICY_SIMULATION_ONLY'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createPreviewReview(policyId, mode, candidateRecords, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        if (!this.SUPPORTED_MODES.includes(mode)) {
            throw new Error(`Unsupported preview mode: ${mode}`);
        }

        const policy = this.policyService ? this.policyService._mockPolicies.find(p => p.retention_policy_id === policyId) : null;
        
        let status = 'READY_FOR_REVIEW';
        const blockers = [];
        const warnings = [];

        if (!policy) {
            status = 'BLOCKED_BY_POLICY_GAP';
            blockers.push('RETENTION_POLICY_NOT_FOUND');
        } else if (policy.policy_status !== 'APPROVED_FOR_READINESS') {
            status = 'BLOCKED_BY_POLICY_GAP';
            blockers.push('RETENTION_POLICY_NOT_APPROVED');
        }

        const reviewId = `rr_${crypto.randomUUID()}`;

        const review = {
            id: crypto.randomUUID(),
            retention_review_id: reviewId,
            retention_policy_id: policyId,
            tenant_id: null,
            review_status: status,
            review_scope: mode,
            data_domain: policy ? policy.data_domain : 'UNKNOWN',
            candidate_record_count: candidateRecords.length,
            eligible_for_retention_count: 0,
            eligible_for_redaction_count: 0,
            eligible_for_deletion_count: 0,
            blocked_by_legal_hold_count: 0,
            blockers_json: blockers,
            warnings_json: warnings,
            source_snapshot_json: candidateRecords,
            result_snapshot_json: [],
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockReviews.push(review);
        await this._recordEvent('FINOPS_RETENTION_REDACTION_PREVIEW_CREATED', review, actor, `Review ${reviewId} created for mode ${mode}`);

        if (status === 'BLOCKED_BY_POLICY_GAP') {
            return review;
        }

        await this._recordEvent('FINOPS_RETENTION_POLICY_SIMULATED', review, actor, 'Simulating retention policy');

        const results = [];
        const nowMs = Date.now();
        const periodMs = policy.retention_period_days * 24 * 60 * 60 * 1000;

        for (const record of candidateRecords) {
            const resultRecord = JSON.parse(JSON.stringify(record));
            let eligibleForRedact = false;
            let eligibleForDelete = false;

            const recDateMs = new Date(record.created_at || nowMs).getTime();
            const ageMs = nowMs - recDateMs;

            if (record.legal_hold) {
                review.blocked_by_legal_hold_count++;
                await this._recordEvent('FINOPS_RETENTION_LEGAL_HOLD_BLOCKER_DETECTED', review, actor, `Legal hold detected on record ${record.id}`);
                warnings.push(`Record ${record.id} blocked by legal hold`);
            } else if (ageMs > periodMs) {
                if (mode === 'DELETION_ELIGIBILITY_PREVIEW_ONLY' && policy.deletion_allowed) {
                    eligibleForDelete = true;
                    review.eligible_for_deletion_count++;
                    resultRecord._preview_status = 'ELIGIBLE_FOR_DELETION';
                } else if (mode === 'REDACTION_PREVIEW_ONLY' && policy.redaction_required) {
                    eligibleForRedact = true;
                    review.eligible_for_redaction_count++;
                    resultRecord._preview_status = 'ELIGIBLE_FOR_REDACTION';
                    if (resultRecord.customer_name) resultRecord.customer_name = '[REDACTED]';
                    if (resultRecord.customer_email) resultRecord.customer_email = '[REDACTED]';
                }
            } else {
                review.eligible_for_retention_count++;
                resultRecord._preview_status = 'RETAINED';
            }

            results.push(resultRecord);
        }

        review.result_snapshot_json = results;

        if (mode === 'REDACTION_PREVIEW_ONLY') {
            await this._recordEvent('FINOPS_REDACTION_PREVIEW_GENERATED', review, actor, 'Redaction preview generated');
        } else if (mode === 'DELETION_ELIGIBILITY_PREVIEW_ONLY') {
            await this._recordEvent('FINOPS_DELETION_ELIGIBILITY_PREVIEW_GENERATED', review, actor, 'Deletion eligibility preview generated');
        }

        if (warnings.length > 0) {
            await this._recordEvent('FINOPS_RETENTION_REDACTION_WARNING_RAISED', review, actor, `Warnings generated during simulation`);
        }

        return review;
    }

    async _recordEvent(eventType, review, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            retention_review_id: review ? review.retention_review_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsRetentionRedactionPreviewService;
