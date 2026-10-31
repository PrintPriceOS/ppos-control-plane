import React, { useState, useEffect } from 'react';

/**
 * Phase 75D — RecommendedActionsPanel React Component
 *
 * Displays safe next actions, visual risk levels, missing tools,
 * and lists blocked unsafe auto-actions with an explicit approval confirmation gate.
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
        borderBottom: '1px solid #222538',
        paddingBottom: '16px',
        marginBottom: '20px'
    },
    title: {
        fontSize: '18px',
        fontWeight: 600,
        color: '#ffffff',
        margin: 0
    },
    riskBadge: (risk: string) => {
        let bg = 'rgba(59, 130, 246, 0.1)';
        let border = '1px solid rgba(59, 130, 246, 0.3)';
        let color = '#60a5fa';
        if (risk === 'HIGH' || risk === 'critical') {
            bg = 'rgba(239, 68, 68, 0.1)';
            border = '1px solid rgba(239, 68, 68, 0.3)';
            color = '#f87171';
        } else if (risk === 'MEDIUM' || risk === 'warning') {
            bg = 'rgba(245, 158, 11, 0.1)';
            border = '1px solid rgba(245, 158, 11, 0.3)';
            color = '#fbbf24';
        }
        return {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: bg,
            border: border,
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            color: color
        };
    },
    section: {
        marginBottom: '24px'
    },
    sectionTitle: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#8f9bb3',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        marginBottom: '12px'
    },
    actionCard: {
        background: '#191b2a',
        border: '1px solid #23263d',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    actionTitle: {
        fontWeight: 600,
        color: '#ffffff',
        marginBottom: '4px'
    },
    actionDesc: {
        fontSize: '13px',
        color: '#cbd5e1'
    },
    unsafeBlock: {
        background: 'rgba(239, 68, 68, 0.05)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: '8px',
        padding: '16px',
        marginTop: '16px'
    },
    unsafeTitle: {
        color: '#f87171',
        fontSize: '14px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '8px'
    },
    gateSection: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid rgba(239, 68, 68, 0.15)'
    },
    checkbox: {
        width: '18px',
        height: '18px',
        cursor: 'pointer'
    },
    checkboxLabel: {
        fontSize: '13px',
        color: '#fca5a5',
        cursor: 'pointer',
        fontWeight: 500
    },
    btnApply: (disabled: boolean) => ({
        background: disabled ? '#2d3142' : '#10b981',
        color: disabled ? '#6b7280' : '#ffffff',
        border: 'none',
        borderRadius: '6px',
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s'
    }),
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

interface RecommendedActionsPanelProps {
    jobId: string;
    onApplyFix?: (fixId: string, approvedUnsafe: boolean) => Promise<void>;
}

export function RecommendedActionsPanel({ jobId, onApplyFix }: RecommendedActionsPanelProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [gov, setGov] = useState<any | null>(null);
    const [approvedUnsafe, setApprovedUnsafe] = useState(false);
    const [applying, setApplying] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchRecommendations = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await fetch(`/api/admin/preflight/jobs/${jobId}/recommendations`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch recommendations: ${response.statusText}`);
                }
                const data = await response.json();
                if (isMounted) {
                    if (data.ok && data.recommendation_governance) {
                        setGov(data.recommendation_governance);
                    } else {
                        throw new Error(data.error?.message || 'Invalid recommendations response format');
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

        fetchRecommendations();
        return () => {
            isMounted = false;
        };
    }, [jobId]);

    const handleApply = async (actionId: string, isUnsafe: boolean) => {
        if (isUnsafe && !approvedUnsafe) return;
        if (!onApplyFix) return;

        try {
            setApplying(actionId);
            await onApplyFix(actionId, approvedUnsafe);
        } catch (err: any) {
            alert(err.message || 'Failed to apply recommended action.');
        } finally {
            setApplying(null);
        }
    };

    if (loading) {
        return (
            <div style={styles.loading} data-testid="recommendations-loading">
                <span>🔄 Fetching recommendation signals...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.error} data-testid="recommendations-error">
                ⚠️ Error: {error}
            </div>
        );
    }

    if (!gov) {
        return null;
    }

    const { recommendation_signals = {}, recommended_next_actions = [], unsafe_auto_actions = [], human_review_actions = [] } = gov;
    const hasUnsafe = unsafe_auto_actions.length > 0;

    return (
        <div style={styles.panel} data-testid="recommendations-panel">
            {/* Header */}
            <div style={styles.header}>
                <h3 style={styles.title}>Intelligence & Recommendation Layer</h3>
                <span style={styles.riskBadge(recommendation_signals.risk_level)} data-testid="risk-badge">
                    ⚠️ Risk Level: {recommendation_signals.risk_level}
                </span>
            </div>

            {/* Signals block */}
            <div style={styles.section} data-testid="recommendation-signals">
                <h4 style={styles.sectionTitle}>Engine Capability Signals</h4>
                <div style={{ background: '#191b2a', border: '1px solid #23263d', borderRadius: '8px', padding: '16px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: '#8f9bb3' }}>Fixability Status:</span>
                        <strong>{recommendation_signals.fixability}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: '#8f9bb3' }}>Visual Sensitivity:</span>
                        <strong>{recommendation_signals.visual_sensitivity}</strong>
                    </div>
                    {recommendation_signals.missing_tool && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: '#8f9bb3' }}>Missing Tool:</span>
                            <strong style={{ color: '#f87171' }}>{recommendation_signals.missing_tool}</strong>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8f9bb3' }}>Validator Required:</span>
                        <strong>{recommendation_signals.validator_required ? 'Yes' : 'No'}</strong>
                    </div>
                </div>
            </div>

            {/* Recommended next steps */}
            <div style={styles.section} data-testid="recommended-actions">
                <h4 style={styles.sectionTitle}>Safe Next Steps</h4>
                {recommended_next_actions.length === 0 ? (
                    <p style={{ color: '#8f9bb3', fontStyle: 'italic', fontSize: '13px' }}>No safe automatic steps recommended.</p>
                ) : (
                    recommended_next_actions.map((action: any, i: number) => {
                        const isDestructive = unsafe_auto_actions.includes(action.action_id);
                        return (
                            <div key={action.action_id || i} style={styles.actionCard} data-testid={`action-card-${i}`}>
                                <div>
                                    <div style={styles.actionTitle}>{action.label}</div>
                                    <div style={styles.actionDesc}>{action.description}</div>
                                </div>
                                {onApplyFix && (
                                    <button
                                        style={styles.btnApply(isDestructive && !approvedUnsafe)}
                                        disabled={applying === action.action_id || (isDestructive && !approvedUnsafe)}
                                        onClick={() => handleApply(action.action_id, isDestructive)}
                                        data-testid={`apply-btn-${action.action_id}`}
                                    >
                                        {applying === action.action_id ? 'Applying...' : 'Execute'}
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Unsafe actions blocker warning */}
            {hasUnsafe && (
                <div style={styles.unsafeBlock} data-testid="unsafe-auto-actions">
                    <div style={styles.unsafeTitle}>
                        🛡️ Safety Block: Destructive Fixes Detected
                    </div>
                    <p style={{ fontSize: '13px', color: '#fca5a5', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                        The following actions involve destructive changes (e.g. profile conversions, transparency flattening) and cannot be auto-applied without operator approval:
                    </p>
                    <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px', fontSize: '13px', color: '#fca5a5' }}>
                        {unsafe_auto_actions.map((act: string, idx: number) => (
                            <li key={idx} data-testid={`unsafe-action-item-${idx}`}>{act}</li>
                        ))}
                    </ul>

                    {/* Operator approval check */}
                    <div style={styles.gateSection}>
                        <input
                            type="checkbox"
                            id="approve-unsafe-checkbox"
                            style={styles.checkbox}
                            checked={approvedUnsafe}
                            onChange={(e) => setApprovedUnsafe(e.target.checked)}
                            data-testid="approve-unsafe-checkbox"
                        />
                        <label htmlFor="approve-unsafe-checkbox" style={styles.checkboxLabel}>
                            I explicitly authorize execution of these potentially destructive visual changes.
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RecommendedActionsPanel;
