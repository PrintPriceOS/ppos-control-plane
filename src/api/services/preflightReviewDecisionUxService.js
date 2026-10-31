/**
 * Presentation/Decision Guidance UX Contract for Preflight Human Reviews.
 * This service strictly defines presentation properties and actions. It does NOT mutate state.
 */

function buildReviewDecisionUx({ human_report, artifact_trust, artifact_ux, readiness, review_decision, audience, snapshot_id }) {
    const isCustomer = audience === 'customer' || audience === 'public';

    // Parse current review decision from parameters (fallback to defaults if undefined)
    const active_decision = (review_decision?.decision || 'NO_DECISION').toUpperCase();
    const isReviewRequired = human_report?.review_required || false;
    
    // Determine readiness effect
    const readiness_effect = {
        invoice_allowed: false,
        payment_allowed: false,
        production_unlock_allowed: false,
        production_queue_allowed: false
    };

    if (active_decision === 'APPROVED_WITH_WARNINGS' || active_decision === 'APPROVED_FOR_PRODUCTION') {
        // May allow progression if no other non-review blockers exist. This reflects local permission,
        // global readiness depends on the full readiness output.
        readiness_effect.invoice_allowed = true;
        readiness_effect.payment_allowed = true;
        readiness_effect.production_unlock_allowed = true;
        readiness_effect.production_queue_allowed = true;
    }

    // Prepare decision state labels
    let decision_summary = '';
    let status_badge = 'Review required';
    let status_tone = 'warning';
    let requires_reupload = false;
    let required_files = [];

    switch (active_decision) {
        case 'APPROVED_WITH_WARNINGS':
            status_badge = 'Approved with warnings';
            status_tone = 'success';
            decision_summary = isCustomer ? 
                'Your file was approved with warnings and the order may continue.' : 
                'The file was approved with warnings and may continue.';
            break;
        case 'APPROVED_FOR_PRODUCTION':
            status_badge = 'Approved for production';
            status_tone = 'success';
            decision_summary = isCustomer ? 
                'Your file was approved and the order may continue.' : 
                'The file was approved for production by human review.';
            break;
        case 'REJECTED_REQUIRES_REUPLOAD':
            status_badge = 'Reupload required';
            status_tone = 'danger';
            requires_reupload = true;
            decision_summary = isCustomer ? 
                'Your file needs to be replaced before the order can continue. Please upload a new version.' : 
                'The file was rejected and must be replaced.';
            break;
        case 'REQUEST_CUSTOMER_REUPLOAD':
            status_badge = 'New file requested';
            status_tone = 'danger';
            requires_reupload = true;
            decision_summary = isCustomer ? 
                'Your file needs to be replaced before the order can continue. Please upload a new version.' : 
                'A replacement file has been requested from the customer.';
            break;
        case 'NEEDS_MORE_INFORMATION':
            status_badge = 'Needs information';
            status_tone = 'warning';
            decision_summary = isCustomer ? 
                'Your file requires review before invoice, payment, or production can continue.' : 
                'More information is required before a decision can be made.';
            break;
        case 'NO_DECISION':
        default:
            status_badge = 'Review required';
            status_tone = 'warning';
            decision_summary = isCustomer ? 
                'Your file requires review before invoice, payment, or production can continue.' : 
                'A human decision is required before this order can continue.';
            break;
    }

    // Determine available operator actions
    const available_actions = [];

    if (!isCustomer) {
        const canDecide = !snapshot_id ? false : true;
        const disabledReason = !snapshot_id ? 'A report snapshot_id is required to make a decision.' : null;

        available_actions.push({
            id: 'APPROVE_WITH_WARNINGS',
            label: 'Approve with warnings',
            tooltip: 'Allow the order to continue while preserving warnings in the audit trail. Use only after reviewing the artifact.',
            tone: 'warning',
            disabled: !canDecide,
            disabled_reason: disabledReason,
            requires_confirmation: false,
            payload_preview: {
                snapshot_id: snapshot_id || "MISSING",
                decision: 'APPROVED_WITH_WARNINGS',
                reason: 'Operator approved with warnings'
            }
        });

        available_actions.push({
            id: 'APPROVE_FOR_PRODUCTION',
            label: 'Approve for production',
            tooltip: 'Approve this artifact for production. This does not imply PDF/X or PDF/A standards certification unless validator evidence exists.',
            tone: 'success',
            disabled: !canDecide,
            disabled_reason: disabledReason,
            requires_confirmation: false,
            payload_preview: {
                snapshot_id: snapshot_id || "MISSING",
                decision: 'APPROVED_FOR_PRODUCTION',
                reason: 'Operator approved for production'
            }
        });

        available_actions.push({
            id: 'REJECT_REQUIRES_REUPLOAD',
            label: 'Reject and require reupload',
            tooltip: 'Reject this artifact and require the customer to upload a replacement file.',
            tone: 'danger',
            disabled: !canDecide,
            disabled_reason: disabledReason,
            requires_confirmation: true,
            payload_preview: {
                snapshot_id: snapshot_id || "MISSING",
                decision: 'REJECTED_REQUIRES_REUPLOAD',
                reason: 'Operator rejected. Reupload required.'
            }
        });

        available_actions.push({
            id: 'REQUEST_CUSTOMER_REUPLOAD',
            label: 'Request new file',
            tooltip: 'Ask the customer to upload a corrected replacement file.',
            tone: 'danger',
            disabled: !canDecide,
            disabled_reason: disabledReason,
            requires_confirmation: true,
            payload_preview: {
                snapshot_id: snapshot_id || "MISSING",
                decision: 'REQUEST_CUSTOMER_REUPLOAD',
                reason: 'Operator requests new file'
            }
        });

        available_actions.push({
            id: 'NEEDS_MORE_INFORMATION',
            label: 'Needs more information',
            tooltip: 'Pause the job while requesting clarification before approval or rejection.',
            tone: 'info',
            disabled: !canDecide,
            disabled_reason: disabledReason,
            requires_confirmation: false,
            payload_preview: {
                snapshot_id: snapshot_id || "MISSING",
                decision: 'NEEDS_MORE_INFORMATION',
                reason: 'Operator needs more info'
            }
        });

        available_actions.push({
            id: 'VIEW_REVIEW_ARTIFACT',
            label: 'View review file',
            tooltip: 'Open the recommended review artifact before making a decision.',
            tone: 'primary',
            disabled: false,
            disabled_reason: null,
            requires_confirmation: false
        });

        available_actions.push({
            id: 'VIEW_HUMAN_REPORT',
            label: 'View human report',
            tooltip: 'Read the detailed explanation of findings, fixes, warnings, and review requirements.',
            tone: 'primary',
            disabled: false,
            disabled_reason: null,
            requires_confirmation: false
        });
    }

    return {
        review_required: isReviewRequired,
        decision_state: active_decision,
        status_badge,
        status_tone,
        decision_summary,
        requires_reupload,
        required_files,
        readiness_effect,
        available_actions,
        primary_review_artifact: human_report?.artifact_recommendations?.review_pdf || null,
        warnings: human_report?.warnings || [],
        blockers: human_report?.blockers || []
    };
}

module.exports = {
    buildReviewDecisionUx
};
