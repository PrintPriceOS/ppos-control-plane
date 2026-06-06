/**
 * Phase 59: Customer Remediation UX Service
 * 
 * Generates presentation-only `remediation_ux` for customer action flows.
 * Does not mutate state. Extracted from order, readiness, and review decision states.
 */

function buildCustomerRemediationUx({
    order,
    readiness,
    review_decision,
    review_decision_ux,
    human_report,
    artifact_trust,
    artifact_ux,
    customer_action,
    files,
    audience
}) {
    const isCustomer = audience === 'customer';

    const ux = {
        remediation_required: false,
        remediation_state: 'NONE',
        customer_summary: '',
        operator_summary: '',
        required_files: [],
        uploaded_files: [],
        missing_files: [],
        rejected_files: [],
        replacement_instructions: [],
        available_customer_actions: [],
        available_operator_actions: [],
        readiness_effect: {
            invoice_allowed: true,
            payment_allowed: true,
            production_unlock_allowed: true,
            production_queue_allowed: true
        },
        customer_action_link_available: false,
        customer_action_token_status: 'NOT_REQUIRED',
        warnings: [],
        blockers: [],
        next_step: ''
    };

    // Extract blockers & warnings from readiness if available
    let blockers = readiness?.blockers || [];
    let warnings = readiness?.warnings || [];

    // Evaluate Review Decision UX or Raw Decision
    const requiresReupload = review_decision_ux?.requires_reupload || 
        (review_decision && (review_decision.decision === 'REJECTED_REQUIRES_REUPLOAD' || review_decision.decision === 'REQUEST_CUSTOMER_REUPLOAD'));

    const decisionIsReject = requiresReupload;
    const isApprovedWithWarnings = review_decision && review_decision.decision === 'APPROVED_WITH_WARNINGS';
    
    // Evaluate if we are waiting for upload (customer action required but no new files yet)
    // Or if files are uploaded but not preflighted
    const hasMissingFiles = customer_action && customer_action.requiredFiles && customer_action.requiredFiles.length > 0;
    const missingFileKinds = hasMissingFiles ? customer_action.requiredFiles : [];
    
    // Evaluate remediation state
    if (decisionIsReject) {
        ux.remediation_required = true;
        ux.remediation_state = 'REUPLOAD_REQUIRED';
        ux.customer_summary = 'Your file needs to be replaced before the order can continue. Please upload a new version.';
        ux.operator_summary = 'File rejected. Waiting for customer to upload replacements.';
        ux.next_step = 'Upload replacement files.';
        // Required files comes from decision or default to what was rejected
        if (customer_action?.requiredFiles) {
            missingFileKinds.push(...customer_action.requiredFiles);
        } else if (review_decision?.approved_artifact_type) {
            // this is just fallback
            missingFileKinds.push('REPLACEMENT');
        }
    } else if (blockers.includes('CUSTOMER_REUPLOAD_REQUIRED') || blockers.includes('MISSING_INTERIOR_SLOT') || blockers.includes('MISSING_COVER_SLOT')) {
        ux.remediation_required = true;
        ux.remediation_state = 'WAITING_FOR_UPLOAD';
        ux.customer_summary = 'We are waiting for your replacement file. Invoice, payment, and production will continue after the new file is uploaded and approved.';
        ux.operator_summary = 'Blocked waiting for customer file upload.';
        ux.next_step = 'Upload replacement files.';
    } else if (blockers.includes('PREFLIGHT_REQUIRED_AFTER_REUPLOAD') || blockers.includes('INTERIOR_FILE_PENDING') || blockers.includes('COVER_FILE_PENDING')) {
        ux.remediation_required = true;
        ux.remediation_state = 'PREFLIGHT_REQUIRED';
        ux.customer_summary = 'Your replacement file has been received and is waiting for preflight checks.';
        ux.operator_summary = 'Files uploaded. Preflight required.';
        ux.next_step = 'Run preflight checks.';
    } else if (human_report?.review_required || blockers.includes('PREFLIGHT_REVIEW_DECISION_REQUIRED')) {
        ux.remediation_required = true;
        ux.remediation_state = 'PREFLIGHT_REVIEW_REQUIRED';
        ux.customer_summary = 'Your replacement file needs human review before the order can continue.';
        ux.operator_summary = 'Files preflighted. Human review decision required.';
        ux.next_step = 'Operator review required.';
    } else if (isApprovedWithWarnings) {
        ux.remediation_required = false;
        ux.remediation_state = 'APPROVED_WITH_WARNINGS';
        ux.customer_summary = 'Your file was approved with warnings and the order may continue.';
        ux.operator_summary = 'Approved with warnings. Proceed to production.';
        ux.next_step = 'Continue order.';
    } else if (blockers.length === 0 && !requiresReupload) {
        ux.remediation_required = false;
        ux.remediation_state = 'READY_TO_CONTINUE';
        ux.customer_summary = 'Your file is ready and the order can continue.';
        ux.operator_summary = 'Ready to continue.';
        ux.next_step = 'Continue order.';
    } else {
        ux.remediation_required = true;
        ux.remediation_state = 'CUSTOMER_ACTION_REQUIRED';
        ux.customer_summary = 'Your action is required to continue.';
        ux.operator_summary = 'Customer action required.';
        ux.next_step = 'Resolve blockers.';
    }

    // Map required files to customer labels
    // Deduplicate
    const uniqueMissingFileKinds = [...new Set(missingFileKinds)];
    if (uniqueMissingFileKinds.length === 0 && ux.remediation_required && ux.remediation_state === 'REUPLOAD_REQUIRED') {
        uniqueMissingFileKinds.push('OTHER');
    }

    uniqueMissingFileKinds.forEach(kind => {
        let label = 'Replacement file';
        let instruction = 'Upload the requested replacement file.';
        let actionId = 'UPLOAD_REPLACEMENT';
        let actionTooltip = 'Upload the corrected file requested by the operator. The order cannot continue until the replacement is checked.';

        if (kind === 'INTERIOR_PDF') {
            label = 'Interior PDF';
            instruction = 'Upload the print-ready interior PDF.';
            actionId = 'UPLOAD_INTERIOR';
            actionTooltip = 'Upload the corrected print-ready interior PDF.';
        } else if (kind === 'COVER_PDF') {
            label = 'Cover PDF';
            instruction = 'Upload the full cover PDF, including front cover, spine, and back cover if applicable.';
            actionId = 'UPLOAD_COVER';
            actionTooltip = 'Upload the corrected full cover PDF.';
        }

        ux.required_files.push({ kind, label });
        ux.replacement_instructions.push(instruction);
        
        if (ux.remediation_state === 'REUPLOAD_REQUIRED' || ux.remediation_state === 'WAITING_FOR_UPLOAD') {
            ux.available_customer_actions.push({
                id: actionId,
                label: `Upload ${label}`,
                tooltip: actionTooltip
            });
        }
    });

    if (ux.remediation_state === 'REUPLOAD_REQUIRED' || ux.remediation_state === 'WAITING_FOR_UPLOAD') {
        ux.available_customer_actions.push({
            id: 'VIEW_ISSUE_SUMMARY',
            label: 'View issue summary',
            tooltip: 'Review the summary explaining why a replacement file is required.'
        });
        ux.available_customer_actions.push({
            id: 'VIEW_REVIEW_REPORT',
            label: 'View review report',
            tooltip: 'Open the review report with warnings and next steps.'
        });
    }

    // Apply readiness effect
    if (ux.remediation_state === 'REUPLOAD_REQUIRED' || 
        ux.remediation_state === 'WAITING_FOR_UPLOAD' || 
        ux.remediation_state === 'PREFLIGHT_REQUIRED' || 
        ux.remediation_state === 'PREFLIGHT_REVIEW_REQUIRED' ||
        ux.remediation_state === 'CUSTOMER_ACTION_REQUIRED') {
        ux.readiness_effect = {
            invoice_allowed: false,
            payment_allowed: false,
            production_unlock_allowed: false,
            production_queue_allowed: false
        };
    }

    // Customer Action Token flow
    if (customer_action) {
        if (!customer_action.expired && customer_action.tokenPreview) {
            ux.customer_action_link_available = true;
            ux.customer_action_token_status = 'AVAILABLE';
            ux.available_operator_actions.push({
                id: 'COPY_CUSTOMER_LINK',
                label: 'Copy customer reupload link',
                tooltip: 'Copy the secure customer link for uploading replacement files.',
                tokenPreview: customer_action.tokenPreview
            });
        } else if (customer_action.expired) {
            ux.customer_action_token_status = 'EXPIRED';
            ux.available_operator_actions.push({
                id: 'GENERATE_CUSTOMER_LINK',
                label: 'Regenerate customer reupload link',
                tooltip: 'Create or refresh the secure customer action link.'
            });
        } else {
            ux.customer_action_token_status = 'MISSING';
            ux.available_operator_actions.push({
                id: 'GENERATE_CUSTOMER_LINK',
                label: 'Generate customer reupload link',
                tooltip: 'Create or refresh the secure customer action link.'
            });
        }
    } else {
        if (ux.remediation_required && (ux.remediation_state === 'REUPLOAD_REQUIRED' || ux.remediation_state === 'WAITING_FOR_UPLOAD')) {
            ux.customer_action_token_status = 'MISSING';
            ux.available_operator_actions.push({
                id: 'GENERATE_CUSTOMER_LINK',
                label: 'Generate customer reupload link',
                tooltip: 'Create or refresh the secure customer action link.'
            });
        }
    }

    if (!isCustomer) {
        ux.available_operator_actions.push({
            id: 'RECOMPUTE_READINESS',
            label: 'Recompute readiness',
            tooltip: 'Recalculate order readiness after replacement files or review decisions change.'
        });
        ux.available_operator_actions.push({
            id: 'RERUN_PREFLIGHT',
            label: 'Re-run preflight',
            tooltip: 'Run preflight checks again after replacement files are uploaded.'
        });
    }

    // Customer audience sanitization
    if (isCustomer) {
        ux.operator_summary = undefined;
        ux.available_operator_actions = undefined;
        ux.missing_files = undefined;
        ux.rejected_files = undefined;
        ux.customer_action_link_available = undefined;
        ux.customer_action_token_status = undefined;
        ux.warnings = undefined;
        ux.blockers = undefined;
    }

    return ux;
}

module.exports = {
    buildCustomerRemediationUx
};
