const crypto = require('crypto');

class FinancialOperationsGoNoGoReviewService {
    constructor() {
        this._mockReviews = new Map();
        this._mockEvents = [];
    }

    _assertRole(actor, allowedRoles) {
        if (!allowedRoles.includes(actor.role)) {
            throw new Error(`Unauthorized. Actor role ${actor.role} not in ${allowedRoles.join(',')}`);
        }
    }

    async processAction(activationReviewId, action, payload, actor) {
        this._assertRole(actor, ['SYSTEM_ADMIN', 'CONTROL_PLANE_ADMIN', 'EXECUTIVE', 'FINANCE_ADMIN', 'SECURITY_ADMIN']);

        let review = this._mockReviews.get(activationReviewId);
        if (!review) {
            review = {
                activation_review_id: activationReviewId,
                review_status: payload.review_status || 'READY_FOR_GO_NO_GO_REVIEW',
                go_no_go_status: 'PENDING',
                notes: [],
                tenant_id: payload.tenant_id || null
            };
            this._mockReviews.set(activationReviewId, review);
        }

        switch (action) {
            case 'REQUEST_GO_NO_GO_REVIEW':
                if (review.review_status !== 'READY_FOR_GO_NO_GO_REVIEW') {
                    throw new Error('Review must be READY_FOR_GO_NO_GO_REVIEW to request Go / No-Go review');
                }
                review.go_no_go_status = 'IN_REVIEW';
                await this._recordEvent('FINOPS_GO_NO_GO_REVIEW_REQUESTED', review, actor, 'Go / No-Go review requested');
                break;

            case 'MARK_GO_RECOMMENDED':
                this._assertRole(actor, ['EXECUTIVE']);
                if (review.review_status.startsWith('BLOCKED')) {
                    throw new Error('Cannot mark GO on a blocked review');
                }
                review.go_no_go_status = 'GO_RECOMMENDED';
                await this._recordEvent('FINOPS_GO_RECOMMENDED_FOR_FUTURE_CONTROLLED_ACTIVATION', review, actor, 'GO recommended for future controlled activation review (Does NOT activate production)');
                break;

            case 'MARK_CONDITIONAL_GO':
                this._assertRole(actor, ['EXECUTIVE']);
                if (review.review_status.startsWith('BLOCKED')) {
                    throw new Error('Cannot mark CONDITIONAL_GO on a blocked review');
                }
                review.go_no_go_status = 'CONDITIONAL_GO_RECOMMENDED';
                await this._recordEvent('FINOPS_CONDITIONAL_GO_RECOMMENDED', review, actor, `Conditional GO recommended: ${payload.note}`);
                break;

            case 'MARK_NO_GO':
                this._assertRole(actor, ['EXECUTIVE', 'SYSTEM_ADMIN']);
                review.go_no_go_status = 'NO_GO';
                review.review_status = 'BLOCKED_BY_NO_GO_DECISION';
                await this._recordEvent('FINOPS_NO_GO_DECISION_RECORDED', review, actor, `NO_GO decision recorded: ${payload.note}`);
                break;

            case 'REVOKE_GO_RECOMMENDATION':
                this._assertRole(actor, ['EXECUTIVE', 'SYSTEM_ADMIN']);
                review.go_no_go_status = 'REVOKED';
                review.review_status = 'MANUAL_REVIEW_REQUIRED';
                await this._recordEvent('FINOPS_GO_RECOMMENDATION_REVOKED', review, actor, `GO recommendation revoked: ${payload.note}`);
                break;

            case 'ADD_EXECUTIVE_REVIEW_NOTE':
            case 'ADD_FINANCE_REVIEW_NOTE':
            case 'ADD_SECURITY_REVIEW_NOTE':
            case 'ADD_OPERATIONS_REVIEW_NOTE':
                review.notes.push({ action, note: payload.note, actor: actor.userId, timestamp: new Date().toISOString() });
                await this._recordEvent('FINOPS_GO_NO_GO_REVIEW_NOTE_ADDED', review, actor, `${action}: ${payload.note}`);
                break;

            default:
                throw new Error(`Unsupported action: ${action}`);
        }

        return review;
    }

    async _recordEvent(eventType, review, actor, message) {
        const ev = {
            id: crypto.randomUUID(),
            event_type: eventType,
            actor_id: actor.userId,
            actor_type: actor.role,
            activation_review_id: review.activation_review_id,
            tenant_id: review.tenant_id,
            payload_json: { message },
            created_at: new Date().toISOString()
        };
        this._mockEvents.push(ev);
        return ev;
    }
}

module.exports = FinancialOperationsGoNoGoReviewService;
