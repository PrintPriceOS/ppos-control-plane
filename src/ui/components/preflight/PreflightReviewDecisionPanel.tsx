import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface Props {
    jobId: string;
    snapshotId: string;
    onDecisionMade: () => void;
}

export const PreflightReviewDecisionPanel: React.FC<Props> = ({ jobId, snapshotId, onDecisionMade }) => {
    const [decision, setDecision] = useState<string>('');
    const [reason, setReason] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: latestDecision, refetch } = useQuery(
        [`admin:preflight:job:${jobId}:decision`],
        async () => {
            const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
            const res = await fetch(`/api/admin/preflight/jobs/${jobId}/review-decision`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (res.status === 404 && data.error === 'NOT_FOUND') return null;
            if (!data.ok) throw new Error(data.message || 'Failed to fetch decision');
            return data.decision;
        },
        { retry: false }
    );

    const handleSubmit = async () => {
        if (!decision) return;
        try {
            setIsSubmitting(true);
            const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
            const res = await fetch(`/api/admin/preflight/jobs/${jobId}/review-decision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    snapshotId,
                    decision,
                    reason,
                    approvedArtifactType: decision.startsWith('APPROVED') ? 'review_pdf' : null
                })
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.message || 'Failed to submit decision');
            
            await refetch();
            onDecisionMade();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-5 border ppos-border bg-slate-50 dark:bg-black/20 font-manrope">
            <h3 className="text-sm font-black uppercase tracking-widest mb-4">Operator Review Decision</h3>

            {latestDecision && (
                <div className="mb-4 p-3 border ppos-border bg-white dark:bg-white/5">
                    <span className="text-[10px] uppercase font-black text-slate-400 block mb-1">Current Active Decision</span>
                    <div className="flex items-center gap-2">
                        {latestDecision.decision === 'APPROVED_FOR_PRODUCTION' && <CheckCircleIcon className="w-5 h-5 text-emerald-500" />}
                        {latestDecision.decision === 'REJECTED_REQUIRES_REUPLOAD' && <XCircleIcon className="w-5 h-5 text-red-500" />}
                        {latestDecision.decision === 'APPROVED_WITH_WARNINGS' && <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />}
                        <span className="font-bold">{latestDecision.decision}</span>
                    </div>
                    {latestDecision.reason && (
                        <p className="text-xs mt-2 italic text-slate-600 dark:text-slate-400">"{latestDecision.reason}"</p>
                    )}
                </div>
            )}

            <div className="space-y-4">
                <div>
                    <label className="text-[10px] font-black uppercase tracking-widest block mb-2 text-slate-500">Record New Decision</label>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="decision" value="APPROVED_FOR_PRODUCTION" onChange={(e) => setDecision(e.target.value)} />
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Approve</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="decision" value="APPROVED_WITH_WARNINGS" onChange={(e) => setDecision(e.target.value)} />
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Approve w/ Warnings</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="decision" value="REJECTED_REQUIRES_REUPLOAD" onChange={(e) => setDecision(e.target.value)} />
                            <span className="text-xs font-bold text-red-600 dark:text-red-400">Reject (Reupload)</span>
                        </label>
                    </div>
                </div>

                {decision && (
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest block mb-1 text-slate-500">Reason / Notes (Optional)</label>
                        <textarea 
                            value={reason} 
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full p-2 border ppos-border bg-white dark:bg-black text-xs min-h-[60px]"
                            placeholder="Provide context for the customer or internal team..."
                        />
                    </div>
                )}

                <button 
                    onClick={handleSubmit} 
                    disabled={!decision || isSubmitting}
                    className="px-4 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                >
                    {isSubmitting ? 'Recording...' : 'Record Decision'}
                </button>
            </div>
        </div>
    );
};
