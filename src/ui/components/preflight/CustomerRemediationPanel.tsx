import React from 'react';
import {
    ExclamationTriangleIcon,
    ArrowPathIcon,
    XCircleIcon,
    DocumentArrowUpIcon,
    ClipboardDocumentIcon,
    CheckCircleIcon,
    LinkIcon
} from '@heroicons/react/24/outline';

export interface CustomerRemediationUx {
    remediation_required: boolean;
    remediation_state: string;
    customer_summary?: string;
    operator_summary?: string;
    required_files: any[];
    missing_files?: any[];
    rejected_files?: any[];
    replacement_instructions?: string[];
    available_customer_actions?: any[];
    available_operator_actions?: any[];
    readiness_effect: {
        invoice_allowed: boolean;
        payment_allowed: boolean;
        production_unlock_allowed: boolean;
        production_queue_allowed: boolean;
    };
    customer_action_link_available?: boolean;
    customer_action_token_status?: string;
    warnings?: string[];
    blockers?: string[];
    next_step: string;
}

interface CustomerRemediationPanelProps {
    remediationUx: CustomerRemediationUx;
    audience: 'customer' | 'operator';
    onActionClick?: (actionId: string, actionPayload?: any) => void;
}

export const CustomerRemediationPanel: React.FC<CustomerRemediationPanelProps> = ({
    remediationUx,
    audience,
    onActionClick
}) => {
    if (!remediationUx) return null;

    // Do not show if remediation is not required and state is purely READY_TO_CONTINUE
    // We only want to show this panel if there's an action, a blocker, or a recent upload in progress.
    if (!remediationUx.remediation_required && remediationUx.remediation_state === 'READY_TO_CONTINUE') {
        return null;
    }

    const isCustomer = audience === 'customer';

    const getStateIcon = () => {
        switch (remediationUx.remediation_state) {
            case 'REUPLOAD_REQUIRED':
            case 'WAITING_FOR_UPLOAD':
                return <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />;
            case 'PREFLIGHT_REQUIRED':
            case 'PREFLIGHT_REVIEW_REQUIRED':
                return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-pulse" />;
            case 'APPROVED_WITH_WARNINGS':
                return <CheckCircleIcon className="w-5 h-5 text-emerald-500" />;
            default:
                return <XCircleIcon className="w-5 h-5 text-red-500" />;
        }
    };

    const getThemeClass = () => {
        switch (remediationUx.remediation_state) {
            case 'REUPLOAD_REQUIRED':
            case 'WAITING_FOR_UPLOAD':
                return 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800';
            case 'PREFLIGHT_REQUIRED':
            case 'PREFLIGHT_REVIEW_REQUIRED':
                return 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800';
            case 'APPROVED_WITH_WARNINGS':
                return 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800';
            default:
                return 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800';
        }
    };

    return (
        <div className={`mt-6 p-5 border rounded-md font-manrope ${getThemeClass()}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {getStateIcon()}
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                        {isCustomer ? 'Action Required' : `Remediation: ${remediationUx.remediation_state}`}
                    </h3>
                </div>
                {/* Readiness badge for operator */}
                {!isCustomer && !remediationUx.readiness_effect.invoice_allowed && (
                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-700 border border-red-200 rounded-sm">
                        Order Blocked
                    </span>
                )}
            </div>

            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mb-4">
                {isCustomer ? remediationUx.customer_summary : remediationUx.operator_summary}
            </p>

            {/* Required Files / Instructions */}
            {remediationUx.required_files && remediationUx.required_files.length > 0 && (
                <div className="mb-4 space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Required Files</span>
                    <ul className="list-inside space-y-1">
                        {remediationUx.required_files.map((file, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                                <DocumentArrowUpIcon className="w-4 h-4 text-slate-400" />
                                {file.label}
                                {isCustomer && remediationUx.replacement_instructions && remediationUx.replacement_instructions[idx] && (
                                    <span className="text-slate-500 font-normal ml-1">- {remediationUx.replacement_instructions[idx]}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Customer Audience Actions */}
            {isCustomer && remediationUx.available_customer_actions && remediationUx.available_customer_actions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50 flex flex-wrap gap-3">
                    {remediationUx.available_customer_actions.map(action => (
                        <button
                            key={action.id}
                            onClick={() => onActionClick?.(action.id)}
                            title={action.tooltip}
                            className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest rounded-sm transition-colors
                                ${action.id.startsWith('UPLOAD') ? 'bg-primary text-white hover:bg-primary/90' : 'bg-white dark:bg-black/20 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-black/40'}
                            `}
                        >
                            {action.id.startsWith('UPLOAD') ? <DocumentArrowUpIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                            {action.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Operator Audience Actions */}
            {!isCustomer && remediationUx.available_operator_actions && remediationUx.available_operator_actions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-3">Operator Actions</span>
                    <div className="flex flex-wrap gap-3">
                        {remediationUx.available_operator_actions.map(action => (
                            <button
                                key={action.id}
                                onClick={() => onActionClick?.(action.id, action)}
                                title={action.tooltip}
                                className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-sm transition-colors border
                                    ${action.id === 'COPY_CUSTOMER_LINK' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' :
                                      action.id === 'GENERATE_CUSTOMER_LINK' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800' :
                                      'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 dark:bg-black/20 dark:text-slate-300 dark:border-slate-600'
                                    }
                                `}
                            >
                                {action.id === 'COPY_CUSTOMER_LINK' && <LinkIcon className="w-3.5 h-3.5" />}
                                {action.id === 'GENERATE_CUSTOMER_LINK' && <ArrowPathIcon className="w-3.5 h-3.5" />}
                                {action.label}
                            </button>
                        ))}
                    </div>
                    {remediationUx.customer_action_token_status && (
                         <div className="mt-3 text-[10px] font-mono text-slate-500">
                             Token Status: <span className="font-bold">{remediationUx.customer_action_token_status}</span>
                         </div>
                    )}
                </div>
            )}
        </div>
    );
};
