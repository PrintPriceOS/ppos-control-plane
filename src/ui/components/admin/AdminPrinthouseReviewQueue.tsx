/**
 * src/ui/components/admin/AdminPrinthouseReviewQueue.tsx
 * 
 * Phase 191H — Admin Governance Review Queue Panel.
 * Allows platform administrators to view submitted Printhouse review queue,
 * inspect evidence snapshots, request changes, approve reviews, execute
 * controlled atomic activations, and suspend active marketplace nodes.
 */
import React, { useState, useEffect } from 'react';

interface Review {
    id: string;
    tenantId: string;
    status: string;
    submittedAt: string;
    reasonCode?: string;
    explanation?: string;
    snapshot?: any;
}

export const AdminPrinthouseReviewQueue: React.FC = () => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [selectedReview, setSelectedReview] = useState<Review | null>(null);
    const [reasonCode, setReasonCode] = useState<string>('CAPABILITY_REVIEW_REQUIRED');
    const [explanation, setExplanation] = useState<string>('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadQueue();
    }, []);

    const loadQueue = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/printhouse-reviews', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
            });
            const data = await res.json();
            if (data.success) {
                setReviews(data.reviews || []);
            }
        } catch (e) {
            setReviews([]);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: 'start' | 'approve' | 'request-changes' | 'reject' | 'activate' | 'suspend') => {
        if (!selectedReview) return;
        setMessage(null);
        try {
            const body: any = {};
            if (action === 'request-changes' || action === 'reject' || action === 'suspend') {
                body.reasonCode = reasonCode;
                body.explanation = explanation;
            }

            const res = await fetch(`/api/admin/printhouse-reviews/${selectedReview.id}/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: `Action '${action}' executed successfully.` });
                loadQueue();
                setSelectedReview(null);
            } else {
                setMessage({ type: 'error', text: data.error || 'Action failed' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error executing action' });
        }
    };

    return (
        <div style={{ background: '#191b2a', border: '1px solid #23263d', borderRadius: '12px', padding: '24px', color: '#fff' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#fff' }}>Admin Printhouse Governance Queue</h3>

            {message && (
                <div style={{
                    padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
                    background: message.type === 'success' ? '#065f46' : '#991b1b', color: '#fff'
                }}>
                    {message.text}
                </div>
            )}

            {loading ? (
                <p style={{ color: '#9095a9', fontSize: '13px' }}>Loading review queue...</p>
            ) : reviews.length === 0 ? (
                <p style={{ color: '#9095a9', fontSize: '13px' }}>No Printhouse review submissions pending.</p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: selectedReview ? '1fr 1fr' : '1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {reviews.map(r => (
                            <div
                                key={r.id}
                                onClick={() => setSelectedReview(r)}
                                style={{
                                    background: selectedReview?.id === r.id ? '#1e293b' : '#11131f',
                                    border: `1px solid ${selectedReview?.id === r.id ? '#3b82f6' : '#23263d'}`,
                                    borderRadius: '8px', padding: '12px', cursor: 'pointer'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong>Tenant: {r.tenantId}</strong>
                                    <span style={{ fontSize: '11px', background: '#334155', padding: '2px 6px', borderRadius: '4px' }}>{r.status}</span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Submitted: {r.submittedAt}</div>
                            </div>
                        ))}
                    </div>

                    {selectedReview && (
                        <div style={{ background: '#11131f', border: '1px solid #23263d', borderRadius: '8px', padding: '16px' }}>
                            <h4 style={{ margin: '0 0 12px', fontSize: '15px' }}>Review Detail: {selectedReview.id}</h4>
                            <p style={{ fontSize: '12px', color: '#94a3b8' }}>Status: <strong>{selectedReview.status}</strong></p>

                            {selectedReview.status === 'READY_FOR_REVIEW' && (
                                <button
                                    onClick={() => handleAction('start')}
                                    style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', marginBottom: '12px' }}
                                >
                                    Start Review
                                </button>
                            )}

                            {['READY_FOR_REVIEW', 'UNDER_REVIEW'].includes(selectedReview.status) && (
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                    <button
                                        onClick={() => handleAction('approve')}
                                        style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        Approve Review
                                    </button>
                                </div>
                            )}

                            {selectedReview.status === 'APPROVED' && (
                                <div style={{ marginBottom: '12px' }}>
                                    <button
                                        onClick={() => handleAction('activate')}
                                        style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        ⚡ Execute Controlled Activation
                                    </button>
                                </div>
                            )}

                            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #23263d' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: '#a0a5ba', marginBottom: '4px' }}>Reason Code (For Request Changes / Reject / Suspend)</label>
                                <select
                                    value={reasonCode}
                                    onChange={e => setReasonCode(e.target.value)}
                                    style={{ width: '100%', padding: '6px', borderRadius: '4px', background: '#1c1f30', border: '1px solid #333852', color: '#fff', marginBottom: '8px' }}
                                >
                                    <option value="COMPANY_INFORMATION_INCOMPLETE">COMPANY_INFORMATION_INCOMPLETE</option>
                                    <option value="CAPABILITY_REVIEW_REQUIRED">CAPABILITY_REVIEW_REQUIRED</option>
                                    <option value="PRICING_REVIEW_REQUIRED">PRICING_REVIEW_REQUIRED</option>
                                    <option value="QUALITY_REVIEW_REQUIRED">QUALITY_REVIEW_REQUIRED</option>
                                </select>

                                <label style={{ display: 'block', fontSize: '12px', color: '#a0a5ba', marginBottom: '4px' }}>Explanation</label>
                                <textarea
                                    value={explanation}
                                    onChange={e => setExplanation(e.target.value)}
                                    rows={2}
                                    style={{ width: '100%', padding: '6px', borderRadius: '4px', background: '#1c1f30', border: '1px solid #333852', color: '#fff', marginBottom: '8px' }}
                                />

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => handleAction('request-changes')}
                                        style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        Request Changes
                                    </button>
                                    <button
                                        onClick={() => handleAction('suspend')}
                                        style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        Suspend
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
