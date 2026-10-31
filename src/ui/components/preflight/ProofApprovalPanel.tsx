import React from 'react';
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    XCircleIcon,
    ClockIcon,
    ShieldExclamationIcon,
} from '@heroicons/react/24/outline';

interface ProofApprovalGovernance {
    proof_required?: boolean;
    proof_available?: boolean;
    proof_status?: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | string;
    visual_change_detected?: boolean;
    review_required?: boolean;
    production_certified?: boolean;
    standard_certified?: boolean;
    warnings?: string[];
    evidence?: Record<string, any>;
}

interface ProofApprovalUxPayload {
    approval_state: string;
    status_badge: string;
    status_tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
    label: string;
    description: string;
    proof_required: boolean;
    proof_available: boolean;
    proof_approved: boolean;
    proof_rejected: boolean;
    visual_change_detected: boolean;
    production_blocked: boolean;
    production_certified: boolean;
    standard_certified: boolean;
    warnings: string[];
    proof_id?: string | null;
    customer_feedback?: string | null;
}

interface ProofApprovalPanelProps {
    proofApprovalGovernance?: ProofApprovalGovernance | null;
    proofApprovalUx?: ProofApprovalUxPayload | null;
    audience?: 'operator' | 'customer';
}

const APPROVAL_STATES = {
    NOT_REQUIRED: 'PROOF_NOT_REQUIRED',
    REQUIRED: 'PROOF_REQUIRED',
    PENDING_CUSTOMER: 'PROOF_PENDING_CUSTOMER',
    APPROVED: 'PROOF_APPROVED',
    REJECTED_REUPLOAD: 'PROOF_REJECTED_REUPLOAD_REQUIRED',
} as const;

export const ProofApprovalPanel: React.FC<ProofApprovalPanelProps> = ({
    proofApprovalGovernance,
    proofApprovalUx,
    audience = 'operator',
}) => {
    const ux = proofApprovalUx;
    const gov = proofApprovalGovernance;

    // Nothing to display when neither source is present
    if (!ux && !gov) return null;

    const isOperator = audience === 'operator';

    // Use UX payload if available, else derive from raw governance
    const approvalState = ux?.approval_state ?? (gov?.proof_required ? APPROVAL_STATES.REQUIRED : APPROVAL_STATES.NOT_REQUIRED);
    const isNotRequired = approvalState === APPROVAL_STATES.NOT_REQUIRED;
    const isRequired = approvalState === APPROVAL_STATES.REQUIRED;
    const isPending = approvalState === APPROVAL_STATES.PENDING_CUSTOMER;
    const isApproved = approvalState === APPROVAL_STATES.APPROVED;
    const isRejected = approvalState === APPROVAL_STATES.REJECTED_REUPLOAD;

    const proof_required = ux?.proof_required ?? gov?.proof_required ?? false;
    const proof_available = ux?.proof_available ?? gov?.proof_available ?? false;
    const production_blocked = ux?.production_blocked ?? (proof_required && !isApproved);
    const visual_change = ux?.visual_change_detected ?? gov?.visual_change_detected ?? false;

    const statusBadge = ux?.status_badge ?? '';
    const description = ux?.description ?? '';
    const warnings = ux?.warnings ?? gov?.warnings ?? [];
    const proofId = isOperator ? (ux?.proof_id ?? null) : null;
    const customerFeedback = isOperator ? (ux?.customer_feedback ?? null) : null;

    // Nothing useful to render when approval is not required and no state exists
    if (isNotRequired && !proof_required && !proof_available) return null;

    const panelBorder = isRejected
        ? 'border-red-500/30 bg-red-500/5'
        : isApproved
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : isPending
        ? 'border-blue-500/30 bg-blue-500/5'
        : isRequired
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'ppos-border ppos-surface-muted';

    const headerColor = isRejected
        ? 'text-red-600 dark:text-red-400'
        : isApproved
        ? 'text-emerald-600 dark:text-emerald-400'
        : isPending
        ? 'text-blue-600 dark:text-blue-400'
        : isRequired
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-600 dark:text-slate-400';

    const badgeBg = isRejected
        ? 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30'
        : isApproved
        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
        : isPending
        ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/20'
        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30';

    const HeaderIcon = isRejected
        ? XCircleIcon
        : isApproved
        ? CheckCircleIcon
        : isPending
        ? ClockIcon
        : isRequired
        ? ShieldExclamationIcon
        : InformationCircleIcon;

    return (
        <div className={`border rounded-none p-4 font-manrope space-y-3 ${panelBorder}`}>

            {/* Header */}
            <div className={`flex items-center gap-2 ${headerColor}`}>
                <HeaderIcon className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                    Customer Proof Approval
                </span>
                {statusBadge && (
                    <span className={`ml-auto px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border ${badgeBg}`}>
                        {statusBadge}
                    </span>
                )}
            </div>

            {/* Status grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatusCell
                    label="Approval Required"
                    value={proof_required ? 'Yes' : 'No'}
                    tone={proof_required ? 'warning' : 'neutral'}
                />
                <StatusCell
                    label="Proof Available"
                    value={proof_available ? 'Yes' : 'No'}
                    tone={proof_available ? 'info' : 'neutral'}
                />
                <StatusCell
                    label="Visual Change"
                    value={visual_change ? 'Detected' : (proof_required ? 'Not detected' : '—')}
                    tone={visual_change ? 'warning' : 'neutral'}
                />
                <StatusCell
                    label="Production Gate"
                    value={production_blocked ? 'Blocked' : (proof_required ? 'Cleared' : 'Not required')}
                    tone={production_blocked ? 'warning' : isApproved ? 'success' : 'neutral'}
                />
            </div>

            {/* Approval state description */}
            {description && (
                <p className={`text-[11px] font-bold leading-relaxed ${
                    isRejected ? 'text-red-600 dark:text-red-400' :
                    isApproved ? 'text-emerald-600 dark:text-emerald-400' :
                    'text-slate-600 dark:text-slate-400'
                }`}>
                    {description}
                </p>
            )}

            {/* Customer feedback (operator only) */}
            {isOperator && customerFeedback && (
                <div className="p-3 border ppos-border bg-slate-50 dark:bg-black/20 space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                        Customer Feedback
                    </span>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 font-bold italic">
                        &ldquo;{customerFeedback}&rdquo;
                    </p>
                </div>
            )}

            {/* Proof ID (operator only) */}
            {isOperator && proofId && (
                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Proof ID:</span>
                    <span className="font-mono">{proofId}</span>
                </div>
            )}

            {/* Rejection reupload guidance */}
            {isRejected && (
                <div className="p-3 border border-red-500/20 bg-red-500/5 flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-600 dark:text-red-400 font-bold">
                        {isOperator
                            ? 'The customer rejected the rendered proof. A new file upload and preflight run are required. This job cannot proceed to production until a new file is submitted and approved.'
                            : 'You have rejected the rendered proof. Please reupload a corrected file to restart the preflight process.'}
                    </p>
                </div>
            )}

            {/* Pending guidance */}
            {isPending && isOperator && (
                <div className="p-3 border border-blue-500/20 bg-blue-500/5 flex items-start gap-2">
                    <ClockIcon className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">
                        A rendered proof has been shared with the customer. Production is paused pending their approval decision.
                    </p>
                </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="space-y-1">
                    {warnings.map((w, i) => (
                        <p key={i} className="text-[10px] text-amber-600 dark:text-amber-500 font-bold bg-amber-500/10 px-2 py-1 border border-amber-500/20">
                            {w}
                        </p>
                    ))}
                </div>
            )}

            {/* Governance disclaimer */}
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest border-t ppos-border pt-2">
                Customer proof approval satisfies the visual proof gate only — it does not imply print-ready status, production certification, or PDF/X / PDF/A compliance.
            </p>
        </div>
    );
};

const StatusCell: React.FC<{ label: string; value: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = ({
    label,
    value,
    tone,
}) => {
    const toneClass =
        tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
        : tone === 'info' ? 'text-blue-600 dark:text-blue-400'
        : 'text-slate-600 dark:text-slate-400';

    return (
        <div className="p-2 border ppos-border ppos-surface-muted">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 block leading-none mb-1">{label}</span>
            <span className={`text-[10px] font-bold ${toneClass}`}>{value}</span>
        </div>
    );
};
