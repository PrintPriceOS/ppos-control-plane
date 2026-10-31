import React from 'react';

/**
 * Phase 72D — PolicyProfilePanel
 *
 * Operator-facing React component displaying the active policy profile status.
 * Shows: active profile chip, profile_passed badge, blockers list, warnings list.
 *
 * Governance display rules:
 *  - Never display "Production Certified", "Standards Certified", or any compliance
 *    claim derived from profile_passed alone.
 *  - Profile blockers are blocking (not just advisory).
 *  - Profile warnings are advisory only.
 */

// Inline styles (no external CSS dependencies for this scaffold)
const styles = {
    panel: {
        background: '#1a1d27',
        border: '1px solid #2e3148',
        borderRadius: '12px',
        padding: '20px 24px',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: '#e2e4f0',
        marginBottom: '16px'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px'
    },
    title: {
        fontSize: '15px',
        fontWeight: 600,
        color: '#ffffff',
        margin: 0
    },
    profileChip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: '#252a3d',
        border: '1px solid #3d4466',
        borderRadius: '20px',
        padding: '4px 12px',
        fontSize: '12px',
        fontWeight: 500,
        color: '#a0aacf',
        letterSpacing: '0.3px'
    },
    badge: (passed) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: passed ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        border: `1px solid ${passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        borderRadius: '20px',
        padding: '4px 12px',
        fontSize: '12px',
        fontWeight: 600,
        color: passed ? '#22c55e' : '#ef4444'
    }),
    section: {
        marginTop: '12px'
    },
    sectionTitle: {
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        color: '#6b7496',
        marginBottom: '8px'
    },
    blockerItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px 12px',
        background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.18)',
        borderRadius: '8px',
        marginBottom: '6px',
        fontSize: '13px',
        color: '#fca5a5'
    },
    warningItem: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '8px 12px',
        background: 'rgba(234,179,8,0.06)',
        border: '1px solid rgba(234,179,8,0.18)',
        borderRadius: '8px',
        marginBottom: '6px',
        fontSize: '13px',
        color: '#fde047'
    },
    emptyState: {
        fontSize: '13px',
        color: '#4a5068',
        fontStyle: 'italic',
        padding: '4px 0'
    },
    govNote: {
        marginTop: '16px',
        padding: '10px 14px',
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#818cf8',
        lineHeight: 1.5
    }
};

/**
 * @param {Object} props
 * @param {Object} props.policyProfileUx   - from policyProfileService.buildProfilePanel()
 * @param {string} [props.audience]        - 'operator' (default) | 'customer'
 */
export function PolicyProfilePanel({ policyProfileUx, audience = 'operator' }) {
    if (!policyProfileUx) {
        return (
            <div style={styles.panel} data-testid="policy-profile-panel-empty">
                <p style={styles.emptyState}>No policy profile active for this job.</p>
            </div>
        );
    }

    const {
        active_profile,
        profile_passed,
        profile_blockers = [],
        profile_warnings = [],
        blockers_detail  = [],
        evaluated_at
    } = policyProfileUx;

    const hasBlockers  = profile_blockers.length > 0;
    const hasWarnings  = profile_warnings.length > 0;
    const profileLabel = active_profile?.profile_label || active_profile?.profile_id || 'Unknown';

    return (
        <div style={styles.panel} data-testid="policy-profile-panel">

            {/* Header */}
            <div style={styles.header}>
                <h4 style={styles.title}>Policy Profile</h4>

                {/* Profile chip */}
                <span style={styles.profileChip} data-testid="profile-chip">
                    🎯 {profileLabel}
                </span>

                {/* Pass/fail badge */}
                <span
                    style={styles.badge(profile_passed)}
                    data-testid="profile-passed-badge"
                    aria-label={profile_passed ? 'Profile passed' : 'Profile failed'}
                >
                    {profile_passed ? '✅ Profile Passed' : '❌ Profile Failed'}
                </span>
            </div>

            {/* Blockers */}
            {hasBlockers && (
                <div style={styles.section} data-testid="profile-blockers">
                    <p style={styles.sectionTitle}>Profile Blockers</p>
                    {profile_blockers.map((blocker, i) => {
                        const detail = blockers_detail.find(d => d.code === blocker);
                        return (
                            <div
                                key={blocker}
                                style={styles.blockerItem}
                                data-testid={`profile-blocker-${i}`}
                            >
                                <span>🚫</span>
                                <div>
                                    <strong>{blocker}</strong>
                                    {detail?.description && (
                                        <div style={{ marginTop: '2px', opacity: 0.8 }}>
                                            {detail.description}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Warnings */}
            {hasWarnings && (
                <div style={styles.section} data-testid="profile-warnings">
                    <p style={styles.sectionTitle}>Profile Warnings (Advisory)</p>
                    {profile_warnings.map((warning, i) => (
                        <div
                            key={warning}
                            style={styles.warningItem}
                            data-testid={`profile-warning-${i}`}
                        >
                            <span>⚠️</span>
                            <span>{warning}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Clean state */}
            {!hasBlockers && !hasWarnings && (
                <div style={styles.section}>
                    <p style={styles.emptyState} data-testid="profile-clean">
                        ✅ No profile violations detected.
                    </p>
                </div>
            )}

            {/* Governance note — always shown to operator */}
            {audience === 'operator' && (
                <div style={styles.govNote} data-testid="profile-gov-note">
                    ℹ️ <strong>Governance:</strong> Profile pass does not imply production certification
                    or standards compliance. Profile results are advisory constraints only.
                    {evaluated_at && (
                        <span style={{ display: 'block', marginTop: '4px', opacity: 0.7 }}>
                            Evaluated: {new Date(evaluated_at).toLocaleString()}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

export default PolicyProfilePanel;
