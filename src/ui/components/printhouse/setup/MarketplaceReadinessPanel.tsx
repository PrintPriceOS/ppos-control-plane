/**
 * src/ui/components/printhouse/setup/MarketplaceReadinessPanel.tsx
 * 
 * Phase 191H — Final Setup Hub Module: Marketplace Readiness & Governed Submission Panel.
 * Displays progress across all 6 onboarding modules, displays reviewer change requests,
 * and gates the 'Submit for Admin Review' action on zero blocking issues.
 */
import React, { useState, useEffect } from 'react';

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
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
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
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
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
        return <div style={{ color: '#9095a9', padding: '20px' }}>Loading marketplace readiness status...</div>;
    }

    const currentStatus = reviewStatus?.status || 'DRAFT';
    const blockers = readiness?.accountSetup?.blockingIssues || [];
    const canSubmit = blockers.length === 0 && ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'].includes(currentStatus);

    return (
        <div style={{ background: '#191b2a', border: '1px solid #23263d', borderRadius: '12px', padding: '24px', color: '#fff' }}>
            <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f0f2f5' }}>
                    Marketplace Readiness & Governed Review
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#9095a9' }}>
                    Final step before marketplace activation. Review your 6 onboarding module statuses and submit for official platform review.
                </p>
            </div>

            {message && (
                <div style={{
                    padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
                    background: message.type === 'success' ? '#065f46' : '#991b1b', color: '#fff'
                }}>
                    {message.text}
                </div>
            )}

            {/* Status Banner */}
            <div style={{ background: '#11131f', border: '1px solid #23263d', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>CURRENT REVIEW STATUS</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: currentStatus === 'APPROVED' ? '#34d399' : '#fbbf24', marginTop: '2px' }}>
                            {currentStatus}
                        </div>
                    </div>
                    {currentStatus === 'APPROVED' && (
                        <div style={{ background: '#064e3b', color: '#34d399', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                            ✓ MARKETPLACE APPROVED
                        </div>
                    )}
                </div>

                {currentStatus === 'CHANGES_REQUESTED' && (
                    <div style={{ marginTop: '14px', padding: '12px', background: '#451a03', border: '1px solid #78350f', borderRadius: '6px', color: '#fde68a', fontSize: '13px' }}>
                        <strong>Reviewer Change Request ({reviewStatus.reasonCode}):</strong>
                        <p style={{ margin: '4px 0 0' }}>{reviewStatus.explanation}</p>
                    </div>
                )}
            </div>

            {/* Submission Gate Section */}
            <div style={{ background: '#11131f', border: '1px solid #23263d', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '16px', color: '#fff' }}>Submit Setup for Official Review</h4>
                <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8', maxWidth: '600px', marginInline: 'auto' }}>
                    Once submitted, an immutable evidence snapshot will be recorded for platform administrators. Submitting does not automatically enable live production routing.
                </p>

                <button
                    onClick={handleSubmitForReview}
                    disabled={!canSubmit || submitting}
                    style={{
                        background: canSubmit ? '#10b981' : '#334155',
                        color: canSubmit ? '#fff' : '#94a3b8',
                        border: 'none', borderRadius: '6px', padding: '10px 24px', fontSize: '14px', fontWeight: 600,
                        cursor: canSubmit ? 'pointer' : 'not-allowed'
                    }}
                >
                    {submitting ? 'Submitting Snapshot...' : currentStatus === 'READY_FOR_REVIEW' || currentStatus === 'UNDER_REVIEW' ? 'Review Currently Underway' : 'Submit for Admin Review'}
                </button>

                {!canSubmit && blockers.length > 0 && (
                    <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#f87171' }}>
                        ⚠️ You have {blockers.length} blocking issues in previous modules that must be resolved before submitting.
                    </p>
                )}
            </div>
        </div>
    );
};
