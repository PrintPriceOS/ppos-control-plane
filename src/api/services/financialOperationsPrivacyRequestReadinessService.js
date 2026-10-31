const crypto = require('crypto');

class FinancialOperationsPrivacyRequestReadinessService {
    constructor() {
        this._mockEvents = [];
        this._mockReviews = [];
        this._mockFindings = [];
        this.SUPPORTED_TYPES = [
            'DATA_ACCESS_PREVIEW', 'DATA_EXPORT_PREVIEW', 'DATA_REDACTION_PREVIEW',
            'DATA_DELETION_ELIGIBILITY_PREVIEW', 'DATA_PORTABILITY_PREVIEW', 'DATA_SUBJECT_LOOKUP_PREVIEW'
        ];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async createPrivacyRequestReview(payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        if (!this.SUPPORTED_TYPES.includes(payload.requestType)) {
            throw new Error(`Unsupported request type: ${payload.requestType}`);
        }

        const reviewId = `prr_${crypto.randomUUID()}`;
        const review = {
            id: crypto.randomUUID(),
            privacy_request_review_id: reviewId,
            tenant_id: payload.tenantId || null,
            request_type: payload.requestType,
            request_status: 'CREATED',
            requester_reference: payload.requesterReference || null,
            requester_reference_hash: payload.requesterReference ? this._hash(payload.requesterReference) : null,
            data_subject_reference: payload.dataSubjectReference || null,
            data_subject_reference_hash: payload.dataSubjectReference ? this._hash(payload.dataSubjectReference) : null,
            data_domains_json: payload.dataDomains || [],
            redaction_preview_json: null,
            export_preview_json: null,
            blockers_json: [],
            warnings_json: [],
            source_snapshot_json: [],
            result_snapshot_json: [],
            created_at: new Date().toISOString(),
            created_by: actor.userId
        };

        this._mockReviews.push(review);
        await this._recordEvent('FINOPS_PRIVACY_REQUEST_REVIEW_CREATED', review, actor, `Privacy request review ${reviewId} created`);

        return review;
    }

    async evaluatePrivacyRequest(reviewId, candidateRecords, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'SECURITY_ADMIN', 'CONTROL_PLANE_ADMIN']);

        const review = this._mockReviews.find(r => r.privacy_request_review_id === reviewId);
        if (!review) throw new Error('Privacy request review not found');

        await this._recordEvent('FINOPS_PRIVACY_REQUEST_EVALUATED', review, actor, 'Evaluating privacy request');

        if (!review.data_subject_reference_hash) {
            await this._createFinding(review, 'MISSING_DATA_SUBJECT_HASH', 'HIGH', 'Privacy', 'Data subject reference must be hashed');
            review.blockers_json.push('DATA_SUBJECT_NOT_HASHED');
        }

        const results = [];
        let blockedByLegalHold = false;
        let blockedByTaxRetention = false;
        let blockedByFinRecordKeeping = false;

        for (const record of candidateRecords) {
            const res = JSON.parse(JSON.stringify(record));
            res._preview_status = 'EVALUATED';

            if (record.legal_hold) {
                blockedByLegalHold = true;
                review.blockers_json.push(`Record ${record.id} blocked by legal hold`);
            }
            if (record.tax_retention_required) {
                blockedByTaxRetention = true;
                review.blockers_json.push(`Record ${record.id} blocked by tax retention`);
            }
            if (record.financial_record_keeping_required) {
                blockedByFinRecordKeeping = true;
                review.blockers_json.push(`Record ${record.id} blocked by financial record keeping`);
            }

            if (review.request_type === 'DATA_ACCESS_PREVIEW' || review.request_type === 'DATA_EXPORT_PREVIEW' || review.request_type === 'DATA_REDACTION_PREVIEW') {
                if (res.customer_name) res.customer_name = '[REDACTED]';
                if (res.customer_email) res.customer_email = '[REDACTED]';
                if (res.ssn) res.ssn = '[REDACTED]';
                if (res.card_number) res.card_number = '[REDACTED]';
            }

            results.push(res);
        }

        review.result_snapshot_json = results;

        if (review.request_type === 'DATA_ACCESS_PREVIEW' || review.request_type === 'DATA_REDACTION_PREVIEW') {
            review.redaction_preview_json = results;
            await this._recordEvent('FINOPS_PRIVACY_REDACTION_PREVIEW_GENERATED', review, actor, 'Redaction preview generated');
        } else if (review.request_type === 'DATA_EXPORT_PREVIEW' || review.request_type === 'DATA_PORTABILITY_PREVIEW') {
            review.export_preview_json = {
                metadata: { reviewId: review.privacy_request_review_id, note: 'MANUAL_EXPORT_PREVIEW_ONLY' },
                data: results
            };
            await this._recordEvent('FINOPS_PRIVACY_EXPORT_PREVIEW_GENERATED', review, actor, 'Export preview generated');
        }

        if (blockedByLegalHold) review.request_status = 'BLOCKED_BY_LEGAL_HOLD';
        else if (blockedByTaxRetention) review.request_status = 'BLOCKED_BY_TAX_RETENTION';
        else if (blockedByFinRecordKeeping) review.request_status = 'BLOCKED_BY_FINANCIAL_RECORD_KEEPING';
        else if (review.blockers_json.length > 0) review.request_status = 'REJECTED';
        else review.request_status = 'READY_FOR_REVIEW';

        if (review.request_status.startsWith('BLOCKED_')) {
            await this._recordEvent('FINOPS_PRIVACY_REQUEST_BLOCKED', review, actor, `Request blocked: ${review.request_status}`);
        } else if (review.warnings_json.length > 0) {
            await this._recordEvent('FINOPS_PRIVACY_REQUEST_WARNING_RAISED', review, actor, 'Warnings raised during evaluation');
        }

        return review;
    }

    _hash(val) {
        return crypto.createHash('sha256').update(val).digest('hex');
    }

    async _createFinding(review, code, severity, category, message) {
        const finding = {
            id: crypto.randomUUID(),
            privacy_request_review_id: review.privacy_request_review_id,
            finding_code: code,
            severity,
            category,
            message,
            status: 'OPEN',
            created_at: new Date().toISOString()
        };
        this._mockFindings.push(finding);
        return finding;
    }

    async _recordEvent(eventType, review, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            privacy_request_review_id: review ? review.privacy_request_review_id : null,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsPrivacyRequestReadinessService;
