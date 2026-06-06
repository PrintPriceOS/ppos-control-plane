import React from 'react';

export interface ReviewDecisionUxAction {
    id: string;
    label: string;
    tooltip: string;
    tone: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
    disabled: boolean;
    disabled_reason: string | null;
    requires_confirmation: boolean;
    payload_preview?: any;
}

export interface ReviewDecisionUx {
    review_required: boolean;
    decision_state: string;
    status_badge: string;
    status_tone: string;
    decision_summary: string;
    requires_reupload: boolean;
    required_files: any[];
    readiness_effect: {
        invoice_allowed: boolean;
        payment_allowed: boolean;
        production_unlock_allowed: boolean;
        production_queue_allowed: boolean;
    };
    available_actions: ReviewDecisionUxAction[];
    primary_review_artifact?: any;
    warnings: string[];
    blockers: string[];
}

export interface ReviewDecisionPanelProps {
    decisionUx: ReviewDecisionUx;
    onActionClick: (action: ReviewDecisionUxAction) => void;
    audience?: 'customer' | 'operator';
}

export const ReviewDecisionPanel: React.FC<ReviewDecisionPanelProps> = ({
    decisionUx,
    onActionClick,
    audience = 'operator'
}) => {
    if (!decisionUx) return null;

    // Do not show operator actions to customers
    const showActions = audience === 'operator' && decisionUx.available_actions && decisionUx.available_actions.length > 0;

    return (
        <div className="review-decision-panel mt-4 p-4 border rounded-md bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold">Review Decision</h3>
                <span className={`px-2 py-1 text-sm font-medium rounded-full badge-${decisionUx.status_tone}`}>
                    {decisionUx.status_badge}
                </span>
            </div>
            
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                {decisionUx.decision_summary}
            </p>

            {decisionUx.requires_reupload && (
                <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md text-sm">
                    A replacement file is required before this order can continue.
                </div>
            )}

            {decisionUx.warnings && decisionUx.warnings.length > 0 && (
                <div className="mb-4 space-y-1">
                    {decisionUx.warnings.map((w, idx) => (
                        <div key={idx} className="text-xs text-yellow-600 dark:text-yellow-400">
                            Warning: {w}
                        </div>
                    ))}
                </div>
            )}

            {showActions && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    {decisionUx.available_actions.map(action => (
                        <button
                            key={action.id}
                            onClick={() => onActionClick(action)}
                            disabled={action.disabled}
                            title={action.disabled ? action.disabled_reason || action.tooltip : action.tooltip}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md focus:outline-none transition-colors 
                                ${action.disabled ? 'opacity-50 cursor-not-allowed bg-gray-300 text-gray-600' : 
                                    action.tone === 'success' ? 'bg-green-600 hover:bg-green-700 text-white' :
                                    action.tone === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' :
                                    action.tone === 'warning' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' :
                                    action.tone === 'info' ? 'bg-blue-500 hover:bg-blue-600 text-white' :
                                    'bg-indigo-600 hover:bg-indigo-700 text-white'
                                }`}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
