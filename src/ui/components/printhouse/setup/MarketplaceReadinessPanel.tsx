/**
 * src/ui/components/printhouse/setup/MarketplaceReadinessPanel.tsx
 * 
 * Phase 191H — Final Setup Hub Module: Marketplace Readiness & Governed Submission Panel.
 * Displays progress across all 6 onboarding modules, displays reviewer change requests,
 * and gates the 'Submit for Admin Review' action on zero blocking issues.
 */
import React, { useState, useEffect } from 'react';
import { CheckSquare } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

interface MarketplaceReadinessPanelProps {
    onSaved?: () => void;
}

export const MarketplaceReadinessPanel: React.FC<MarketplaceReadinessPanelProps> = ({ onSaved }) => {
    const [loading, setLoading] = useState<boolean>(true);
    const [reviewStatus, setReviewStatus] = useState<any>(null);
    const [readiness, setReadiness] = useState<any>(null);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/printhouse/onboarding/review-status', {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setReviewStatus(data.reviewStatus);
                setReadiness(data.readinessSummary);
            }
        } catch (e) {
            setReviewStatus({ status: 'DRAFT' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitForReview = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            const res = await fetch('/api/printhouse/onboarding/submit-for-review', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: 'Onboarding setup submitted for admin review successfully!' });
                loadData();
                if (onSaved) onSaved();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to submit for review' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error submitting for review' });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="text-zinc-500 p-5 text-xs">Loading marketplace readiness status...</div>;
    }

    const currentStatus = reviewStatus?.status || 'DRAFT';
    const blockers = readiness?.accountSetup?.blockingIssues || [];
    const canSubmit = blockers.length === 0 && ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'].includes(currentStatus);

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                    <CheckSquare size={20} className="text-[#dc0000]" />
                    <h3 className="m-0 text-lg font-bold text-zinc-900 dark:text-white">
                        Marketplace Readiness & Governed Review
                    </h3>
                </div>
                <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">
                    Final step before marketplace activation. Review your onboarding module statuses and submit for official platform review.
                </p>
            </div>

            {message && (
                <div className={`p-3 rounded-lg text-xs mb-4 ${
                    message.type === 'success' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' 
                        : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                }`}>
                    {message.text}
                </div>
            )}

            {/* Status Banner */}
            <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 mb-6 transition-colors">
                <div className="flex justify-between items-center flex-wrap gap-3">
                    <div>
                        <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">CURRENT REVIEW STATUS</div>
                        <div className={`text-xl font-bold mt-0.5 ${currentStatus === 'APPROVED' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {currentStatus}
                        </div>
                    </div>
                    {currentStatus === 'APPROVED' && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold">
                            ✓ MARKETPLACE APPROVED
                        </div>
                    )}
                </div>

                {currentStatus === 'CHANGES_REQUESTED' && (
                    <div className="mt-3.5 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg text-amber-900 dark:text-amber-300 text-xs">
                        <strong>Reviewer Change Request ({reviewStatus.reasonCode}):</strong>
                        <p className="m-0 mt-1">{reviewStatus.explanation}</p>
                    </div>
                )}
            </div>

            {/* Submission Gate Section */}
            <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center transition-colors">
                <h4 className="m-0 mb-1.5 text-sm font-bold text-zinc-900 dark:text-white">Submit Setup for Official Review</h4>
                <p className="m-0 mb-4 text-xs text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed">
                    Once submitted, an immutable evidence snapshot will be recorded for platform administrators. Submitting does not automatically enable live production routing.
                </p>

                <button
                    onClick={handleSubmitForReview}
                    disabled={!canSubmit || submitting}
                    className={`font-semibold px-6 py-2.5 rounded-lg text-xs transition-colors shadow-xs ${
                        canSubmit 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer' 
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-300 dark:border-zinc-700'
                    }`}
                >
                    {submitting ? 'Submitting Snapshot...' : currentStatus === 'READY_FOR_REVIEW' || currentStatus === 'UNDER_REVIEW' ? 'Review Currently Underway' : 'Submit for Admin Review'}
                </button>

                {!canSubmit && blockers.length > 0 && (
                    <p className="m-0 mt-3 text-xs text-red-600 dark:text-red-400 font-medium">
                        ⚠️ You have {blockers.length} blocking issues in previous modules that must be resolved before submitting.
                    </p>
                )}
            </div>
        </div>
    );
};
