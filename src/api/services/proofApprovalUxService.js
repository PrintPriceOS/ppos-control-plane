'use strict';

/**
 * Phase 70D — Customer Proof Approval UX
 *
 * Builds proof_approval_ux for operator and customer audiences from
 * proof_approval_governance (Phase 70B) and visual_diff_governance (Phase 69B/69C).
 *
 * Policy:
 * - Proof approval does not imply print-ready status.
 * - Proof approval does not imply production certification.
 * - Proof approval does not imply PDF/X or PDF/A compliance.
 * - Proof approval only satisfies the visual proof gate.
 * - Rejection requires reupload — it does not auto-fix the file.
 */

const APPROVAL_STATES = {
    NOT_REQUIRED: 'PROOF_NOT_REQUIRED',
    REQUIRED: 'PROOF_REQUIRED',
    PENDING_CUSTOMER: 'PROOF_PENDING_CUSTOMER',
    APPROVED: 'PROOF_APPROVED',
    REJECTED_REUPLOAD: 'PROOF_REJECTED_REUPLOAD_REQUIRED'
};

/**
 * Resolve the proof approval state from governance inputs.
 */
function resolveApprovalState({ proof_required, proof_available, proof_status }) {
    if (!proof_required) return APPROVAL_STATES.NOT_REQUIRED;
    if (proof_status === 'APPROVED') return APPROVAL_STATES.APPROVED;
    if (proof_status === 'REJECTED') return APPROVAL_STATES.REJECTED_REUPLOAD;
    if (proof_available && proof_status === 'PENDING') return APPROVAL_STATES.PENDING_CUSTOMER;
    return APPROVAL_STATES.REQUIRED;
}

/**
 * Build proof_approval_ux for a given audience.
 *
 * @param {object} params
 * @param {object} params.proof_approval_governance   Phase 70B governance payload
 * @param {object} params.visual_diff_governance      Phase 69B/69C governance payload (fallback signals)
 * @param {'operator'|'customer'} params.audience
 * @returns {object} proof_approval_ux
 */
function buildProofApprovalUx({ proof_approval_governance, visual_diff_governance, audience }) {
    const gov = proof_approval_governance || {};
    const vdGov = visual_diff_governance || {};
    const isCustomer = audience === 'customer';

    // Compute proof_required: explicit gov flag wins, else infer from visual diff
    const proof_required = gov.proof_required === true
        || gov.visual_change_detected === true
        || vdGov.visual_change_detected === true
        || vdGov.visual_review_required === true;

    const proof_available = gov.proof_available === true || vdGov.proof_artifacts_available === true;
    const proof_status = gov.proof_status || 'NOT_REQUIRED';
    const visual_change_detected = gov.visual_change_detected === true || vdGov.visual_change_detected === true;

    const approval_state = resolveApprovalState({ proof_required, proof_available, proof_status });
    const proof_approved = approval_state === APPROVAL_STATES.APPROVED;
    const proof_rejected = approval_state === APPROVAL_STATES.REJECTED_REUPLOAD;

    // Production is blocked unless proof is not required or has been explicitly approved
    const production_blocked = proof_required && !proof_approved;

    let status_badge = '';
    let status_tone = 'neutral';
    let description = '';

    switch (approval_state) {
        case APPROVAL_STATES.NOT_REQUIRED:
            status_badge = 'Approval not required';
            status_tone = 'neutral';
            description = isCustomer
                ? 'No proof approval is required for this job. Your file can proceed normally.'
                : 'Proof approval is not required for this job. No visual changes requiring customer review were detected.';
            break;
        case APPROVAL_STATES.REQUIRED:
            status_badge = 'Proof approval required';
            status_tone = 'warning';
            description = isCustomer
                ? 'A rendered proof of your file requires your review and approval before it can proceed to production.'
                : 'Visual changes were detected. A rendered proof must be reviewed and approved by the customer before production release.';
            break;
        case APPROVAL_STATES.PENDING_CUSTOMER:
            status_badge = 'Awaiting customer approval';
            status_tone = 'info';
            description = isCustomer
                ? 'A rendered proof of your corrected file has been prepared and is awaiting your approval.'
                : 'A rendered proof has been shared with the customer. Production is paused pending their approval decision.';
            break;
        case APPROVAL_STATES.APPROVED:
            status_badge = 'Customer approved';
            status_tone = 'success';
            description = isCustomer
                ? 'You have approved the rendered proof. Your file may proceed to production upon final operator review.'
                : 'The customer has approved the rendered proof. The visual proof gate is satisfied. Other governance gates may still apply.';
            break;
        case APPROVAL_STATES.REJECTED_REUPLOAD:
            status_badge = 'Customer rejected — reupload required';
            status_tone = 'danger';
            description = isCustomer
                ? 'You have rejected the rendered proof. Please reupload a corrected file to restart the preflight process.'
                : 'The customer rejected the rendered proof. A new file upload and preflight run are required before production can proceed.';
            break;
    }

    const warnings = Array.isArray(gov.warnings) ? [...gov.warnings] : [];
    if (production_blocked && approval_state !== APPROVAL_STATES.REQUIRED) {
        // Only add blockers warning in non-trivial pending/rejected states to avoid double messaging
    }

    const base = {
        approval_state,
        status_badge,
        status_tone,
        label: 'Proof Approval Status',
        description,
        proof_required,
        proof_available,
        proof_approved,
        proof_rejected,
        visual_change_detected,
        production_blocked,
        production_certified: false,
        standard_certified: false,
        warnings
    };

    if (isCustomer) {
        // Strip operator-only fields before returning
        const { proof_rejected: _pr, ...rest } = base; // eslint-disable-line
        // Expose proof_rejected to customer so they know to reupload
        return { ...rest, proof_rejected };
    }

    return {
        ...base,
        proof_id: gov.proof_id || null,
        customer_feedback: gov.customer_feedback || null
    };
}

module.exports = { buildProofApprovalUx, APPROVAL_STATES };
