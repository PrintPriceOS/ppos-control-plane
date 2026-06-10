import React, { useState, useEffect } from 'react';

/**
 * Phase 74D — AuditBundlePanel
 *
 * Exposes compliance bundle UI, download action, manifest stability hash indicators,
 * interactive lifecycle timeline, and sanitization compliance badge.
 */

const styles = {
    panel: {
        background: '#131520',
        border: '1px solid #2e3148',
        borderRadius: '12px',
        padding: '24px',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: '#e2e4f0',
        marginBottom: '20px'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        gap: '12px',
        borderBottom: '1px solid #222538',
        paddingBottom: '16px',
        marginBottom: '20px'
    },
    titleSection: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    },
    title: {
        fontSize: '18px',
        fontWeight: 600,
        color: '#ffffff',
        margin: 0
    },
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(59, 130, 246, 0.1)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '20px',
        padding: '4px 12px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#60a5fa'
    },
    downloadBtn: {
        background: '#3b82f6',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    hashLockSection: {
        background: '#1a1d2d',
        border: '1px solid #2b2e4a',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '20px'
    },
    hashLockHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px'
    },
    hashTitle: {
        fontSize: '13px',
        fontWeight: 600,
        color: '#8f9bb3',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        margin: 0
    },
    hashValue: {
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '13px',
        background: '#10121d',
        padding: '8px 12px',
        borderRadius: '6px',
        color: '#34d399',
        border: '1px solid #1f2235',
        wordBreak: 'break-all' as const
    },
    timelineSection: {
        marginTop: '20px'
    },
    timelineTitle: {
        fontSize: '15px',
        fontWeight: 600,
        color: '#ffffff',
        marginBottom: '16px'
    },
    timeline: {
        position: 'relative' as const,
        paddingLeft: '24px',
        borderLeft: '2px solid #25283e'
    },
    timelineItem: {
        position: 'relative' as const,
        marginBottom: '20px'
    },
    timelineDot: {
        position: 'absolute' as const,
        left: '-31px',
        top: '2px',
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        background: '#3b82f6',
        border: '2px solid #131520'
    },
    timelineContent: {
        background: '#191b2a',
        border: '1px solid #23263d',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '13px'
    },
    timelineHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '6px'
    },
    timelineActor: {
        fontWeight: 600,
        color: '#ffffff'
    },
    timelineDate: {
        color: '#8f9bb3',
        fontSize: '11px'
    },
    timelineType: {
        display: 'inline-block',
        background: '#252a3d',
        borderRadius: '4px',
        padding: '2px 6px',
        fontSize: '11px',
        color: '#a0aacf',
        marginBottom: '4px'
    },
    timelineBody: {
        color: '#cbd5e1',
        lineHeight: 1.4
    },
    loading: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '40px',
        color: '#8f9bb3'
    },
    error: {
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '8px',
        padding: '16px',
        color: '#f87171',
        fontSize: '14px'
    }
};

interface AuditBundlePanelProps {
    jobId: string;
    orderId?: string;
    audience?: 'operator' | 'customer';
}

export function AuditBundlePanel({ jobId, orderId, audience = 'customer' }: AuditBundlePanelProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bundle, setBundle] = useState<any | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchBundle = async () => {
            try {
                setLoading(true);
                setError(null);
                const queryParams = new URLSearchParams();
                if (orderId) queryParams.append('orderId', orderId);
                queryParams.append('audience', audience);

                const response = await fetch(`/api/admin/preflight/jobs/${jobId}/audit-bundle?${queryParams.toString()}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch compliance audit bundle: ${response.statusText}`);
                }
                const data = await response.json();
                if (isMounted) {
                    if (data.ok && data.manifest) {
                        setBundle(data.manifest);
                    } else {
                        throw new Error(data.error?.message || 'Invalid response format');
                    }
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(err.message);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchBundle();
        return () => {
            isMounted = false;
        };
    }, [jobId, orderId, audience]);

    const handleDownload = () => {
        if (!bundle) return;
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-bundle-${bundle.order_id || orderId || 'order'}-${audience}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div style={styles.loading} data-testid="audit-bundle-panel-loading">
                <span>🔄 Compiling defensible audit bundle...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.error} data-testid="audit-bundle-panel-error">
                ⚠️ Error: {error}
            </div>
        );
    }

    if (!bundle) {
        return null;
    }

    const { manifest_hash, lifecycle_timeline = [], preflight_outcome = {} } = bundle;

    return (
        <div style={styles.panel} data-testid="audit-bundle-panel">
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.titleSection}>
                    <h3 style={styles.title}>Defensible Compliance Export</h3>
                    <span style={styles.badge} data-testid="sanitization-badge">
                        🔒 Sanitization Compliant ({audience})
                    </span>
                </div>
                <button
                    style={styles.downloadBtn}
                    onClick={handleDownload}
                    data-testid="download-bundle-btn"
                >
                    📥 Download Audit Bundle
                </button>
            </div>

            {/* Hash Lock Section */}
            <div style={styles.hashLockSection} data-testid="hash-lock-section">
                <div style={styles.hashLockHeader}>
                    <h4 style={styles.hashTitle}>Tamper-Detection Hash Lock (SHA-256)</h4>
                    <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>✓ LOCKED</span>
                </div>
                <div style={styles.hashValue} data-testid="manifest-hash">
                    {manifest_hash || 'Pending Calculation'}
                </div>
            </div>

            {/* Preflight Outcome Summary */}
            <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>Preflight Outcome</h4>
                <div style={{ background: '#191b2a', border: '1px solid #23263d', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#8f9bb3', fontSize: '13px' }}>Outcome:</span>
                        <strong style={{ fontSize: '13px' }}>{preflight_outcome.outcome}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#8f9bb3', fontSize: '13px' }}>Severity:</span>
                        <strong style={{ fontSize: '13px' }}>{preflight_outcome.severity}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8f9bb3', fontSize: '13px' }}>Summary Title:</span>
                        <strong style={{ fontSize: '13px' }}>{preflight_outcome.summary_title}</strong>
                    </div>
                </div>
            </div>

            {/* Lifecycle Timeline */}
            <div style={styles.timelineSection}>
                <h4 style={styles.timelineTitle}>Lifecycle Audit Timeline</h4>
                {lifecycle_timeline.length === 0 ? (
                    <p style={{ color: '#8f9bb3', fontStyle: 'italic', fontSize: '13px' }}>No events recorded on this lifecycle.</p>
                ) : (
                    <div style={styles.timeline} data-testid="lifecycle-timeline">
                        {lifecycle_timeline.map((event: any, index: number) => (
                            <div key={event.event_id || index} style={styles.timelineItem} data-testid={`timeline-item-${index}`}>
                                <div style={styles.timelineDot} />
                                <div style={styles.timelineContent}>
                                    <div style={styles.timelineHeader}>
                                        <span style={styles.timelineActor}>
                                            👤 {event.actor_type} ({event.actor_id})
                                        </span>
                                        <span style={styles.timelineDate}>
                                            {new Date(event.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={styles.timelineType}>{event.type}</div>
                                    <div style={styles.timelineBody}>
                                        {event.payload?.message || JSON.stringify(event.payload || {})}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default AuditBundlePanel;
