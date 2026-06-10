import React from 'react';

/**
 * Phase 73D — MachineCompatibilityPanel
 *
 * Displays the compatibility matching state of the assigned machine against preflight capability signals.
 */

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
    machineChip: {
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
    badge: (compatible) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: compatible ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        border: `1px solid ${compatible ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        borderRadius: '20px',
        padding: '4px 12px',
        fontSize: '12px',
        fontWeight: 600,
        color: compatible ? '#22c55e' : '#ef4444'
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
    reasonItem: {
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

export interface MachineCompatibilityPanelProps {
    machineReadinessUx?: {
        machine_match_required: boolean;
        incompatible_machine_reasons: Record<string, string[]>;
        warnings: string[];
        machine_signals?: any;
    };
    assignedMachineId?: string | null;
    audience?: 'operator' | 'customer';
}

export function MachineCompatibilityPanel({
    machineReadinessUx,
    assignedMachineId = null,
    audience = 'operator'
}: MachineCompatibilityPanelProps) {
    if (!assignedMachineId) {
        return (
            <div style={styles.panel} data-testid="machine-compatibility-panel-empty">
                <p style={styles.emptyState}>No machine assigned to this job.</p>
            </div>
        );
    }

    if (!machineReadinessUx) {
        return (
            <div style={styles.panel} data-testid="machine-compatibility-panel-no-governance">
                <div style={styles.header}>
                    <h4 style={styles.title}>Machine Compatibility</h4>
                    <span style={styles.machineChip} data-testid="machine-chip">
                        ⚙️ {assignedMachineId}
                    </span>
                    <span style={styles.badge(true)} data-testid="compatibility-badge">
                        ✅ Unrestricted
                    </span>
                </div>
                <p style={styles.emptyState}>No active capability matching constraints for this preflight job.</p>
            </div>
        );
    }

    const {
        machine_match_required,
        incompatible_machine_reasons = {},
        warnings = []
    } = machineReadinessUx;

    const reasons = incompatible_machine_reasons[assignedMachineId] || incompatible_machine_reasons['default'] || [];
    const isCompatible = reasons.length === 0;

    return (
        <div style={styles.panel} data-testid="machine-compatibility-panel">
            {/* Header */}
            <div style={styles.header}>
                <h4 style={styles.title}>Machine Compatibility</h4>

                <span style={styles.machineChip} data-testid="machine-chip">
                    ⚙️ {assignedMachineId}
                </span>

                <span style={styles.badge(isCompatible)} data-testid="compatibility-badge">
                    {isCompatible ? '✅ Compatible' : '❌ Incompatible'}
                </span>
            </div>

            {/* Incompatibility Reasons */}
            {!isCompatible && (
                <div style={styles.section} data-testid="incompatibility-reasons">
                    <p style={styles.sectionTitle}>Mismatches & Blockers</p>
                    {reasons.map((reason, i) => (
                        <div key={reason} style={styles.reasonItem} data-testid={`reason-${i}`}>
                            <span>🚫</span>
                            <span>{reason}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
                <div style={styles.section} data-testid="machine-warnings">
                    <p style={styles.sectionTitle}>Advisory Warnings</p>
                    {warnings.map((warning, i) => (
                        <div key={warning} style={styles.warningItem} data-testid={`warning-${i}`}>
                            <span>⚠️</span>
                            <span>{warning}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Clean State */}
            {isCompatible && warnings.length === 0 && (
                <div style={styles.section} data-testid="compatibility-clean">
                    <p style={styles.emptyState}>
                        ✅ All preflight parameters match machine capabilities perfectly.
                    </p>
                </div>
            )}

            {/* Governance note */}
            {audience === 'operator' && (
                <div style={styles.govNote} data-testid="machine-gov-note">
                    ℹ️ <strong>Fleet Governance:</strong> Machine capability matching enforces that target hardware profiles meet preflight structural specifications.
                </div>
            )}
        </div>
    );
}

export default MachineCompatibilityPanel;
