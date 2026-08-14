/**
 * src/ui/components/printhouse/setup/SetupModuleCard.tsx
 * 
 * Displays an individual onboarding module card.
 */
import React from 'react';
import { ArrowRight, CheckCircle, Clock, Lock, AlertCircle } from 'lucide-react';

interface SetupModuleCardProps {
    title: string;
    description: string;
    status: 'COMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED' | 'NEEDS_ATTENTION' | 'LOCKED';
    isActionable: boolean;
    missingRequirements?: string[];
    dependencyHint?: string;
    onAction?: () => void;
}

export const SetupModuleCard: React.FC<SetupModuleCardProps> = ({
    title,
    description,
    status,
    isActionable,
    missingRequirements = [],
    dependencyHint,
    onAction
}) => {
    const getCtaLabel = () => {
        if (status === 'COMPLETE') return 'Review / Edit';
        if (status === 'IN_PROGRESS') return 'Continue Setup';
        return 'Start Setup';
    };

    return (
        <div style={{
            background: '#18181b',
            border: `1px solid ${status === 'COMPLETE' ? '#10b981' : status === 'NEEDS_ATTENTION' ? '#ef4444' : '#27272a'}`,
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            opacity: isActionable ? 1 : 0.7,
            transition: 'all 0.2s ease'
        }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>{title}</h3>
                    {status === 'COMPLETE' && <CheckCircle size={18} style={{ color: '#10b981' }} />}
                    {status === 'IN_PROGRESS' && <Clock size={18} style={{ color: '#eab308' }} />}
                    {status === 'NEEDS_ATTENTION' && <AlertCircle size={18} style={{ color: '#ef4444' }} />}
                    {!isActionable && <Lock size={18} style={{ color: '#71717a' }} />}
                </div>
                <p style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: '1.5', margin: '0 0 14px 0' }}>
                    {description}
                </p>

                {missingRequirements.length > 0 && status !== 'COMPLETE' && (
                    <div style={{
                        background: 'rgba(234, 179, 8, 0.08)',
                        border: '1px solid rgba(234, 179, 8, 0.2)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        marginBottom: '16px'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#eab308', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Missing Requirements:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#e4e4e7' }}>
                            {missingRequirements.map((req, idx) => (
                                <li key={idx} style={{ marginBottom: '2px' }}>{req}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div>
                {isActionable ? (
                    <button
                        onClick={onAction}
                        style={{
                            background: status === 'COMPLETE' ? '#27272a' : '#dc0000',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            width: '100%',
                            justifyContent: 'center'
                        }}
                    >
                        {getCtaLabel()} <ArrowRight size={14} />
                    </button>
                ) : (
                    <div style={{ fontSize: '12px', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Lock size={14} color="#71717a" />
                        <span>{dependencyHint || 'Prerequisite required'}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

