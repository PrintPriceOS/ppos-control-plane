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
    icon?: React.ReactNode;
    missingRequirements?: string[];
    dependencyHint?: string;
    onAction?: () => void;
}

export const SetupModuleCard: React.FC<SetupModuleCardProps> = ({
    title,
    description,
    status,
    isActionable,
    icon,
    missingRequirements = [],
    dependencyHint,
    onAction
}) => {
    const getCtaLabel = () => {
        if (status === 'COMPLETE') return 'Review / Edit';
        if (status === 'IN_PROGRESS') return 'Continue Setup';
        return 'Start Setup';
    };

    const isLocked = !isActionable;

    // State-aware icon background & color mapping
    const getIconStyles = () => {
        if (isLocked) {
            return {
                bg: '#f4f4f5',
                color: '#a1a1aa',
                border: '#e4e4e7'
            };
        }
        if (status === 'COMPLETE') {
            return {
                bg: 'rgba(16, 185, 129, 0.1)',
                color: '#059669',
                border: 'rgba(16, 185, 129, 0.2)'
            };
        }
        if (status === 'IN_PROGRESS') {
            return {
                bg: 'rgba(217, 119, 6, 0.1)',
                color: '#d97706',
                border: 'rgba(217, 119, 6, 0.2)'
            };
        }
        if (status === 'NEEDS_ATTENTION') {
            return {
                bg: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                border: 'rgba(239, 68, 68, 0.2)'
            };
        }
        return {
            bg: '#f4f4f5',
            color: '#71717a',
            border: '#e4e4e7'
        };
    };

    const iconStyle = getIconStyles();

    return (
        <div 
            className="group"
            style={{
                background: isLocked ? '#f4f4f5' : '#ffffff',
                border: `1px solid ${status === 'COMPLETE' ? '#10b981' : status === 'NEEDS_ATTENTION' ? '#ef4444' : isLocked ? '#e4e4e7' : '#e4e4e7'}`,
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isLocked ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s ease-out'
            }}
        >
            <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {icon && (
                            <div 
                                aria-hidden="true"
                                style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    backgroundColor: iconStyle.bg,
                                    color: iconStyle.color,
                                    border: `1px solid ${iconStyle.border}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'transform 180ms ease-out, color 180ms ease-out',
                                    flexShrink: 0
                                }}
                            >
                                <span style={{ display: 'inline-flex', transform: 'scale(1.3)' }}>
                                    {icon}
                                </span>
                            </div>
                        )}
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: 700, color: isLocked ? '#71717a' : '#09090b', margin: 0 }}>
                                {title}
                            </h3>
                        </div>
                    </div>
                    <div>
                        {status === 'COMPLETE' && <CheckCircle size={18} style={{ color: '#10b981' }} />}
                        {status === 'IN_PROGRESS' && <Clock size={18} style={{ color: '#d97706' }} />}
                        {status === 'NEEDS_ATTENTION' && <AlertCircle size={18} style={{ color: '#ef4444' }} />}
                        {isLocked && <Lock size={18} style={{ color: '#a1a1aa' }} />}
                    </div>
                </div>
                <p style={{ fontSize: '13px', color: isLocked ? '#a1a1aa' : '#52525b', lineHeight: '1.5', margin: '0 0 14px 0' }}>
                    {description}
                </p>

                {missingRequirements.length > 0 && status !== 'COMPLETE' && (
                    <div style={{
                        background: '#fffbeb',
                        border: '1px solid #fef3c7',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        marginBottom: '16px'
                    }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Missing Requirements:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#78350f' }}>
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
                            background: status === 'COMPLETE' ? '#f4f4f5' : '#dc0000',
                            color: status === 'COMPLETE' ? '#18181b' : '#ffffff',
                            border: status === 'COMPLETE' ? '1px solid #e4e4e7' : 'none',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            width: '100%',
                            justifyContent: 'center',
                            boxShadow: status === 'COMPLETE' ? 'none' : '0 2px 4px rgba(220, 0, 0, 0.2)'
                        }}
                    >
                        {getCtaLabel()} <ArrowRight size={14} />
                    </button>
                ) : (
                    <div style={{
                        background: '#e4e4e7',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: '#52525b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontWeight: 500
                    }}>
                        <Lock size={14} color="#71717a" />
                        <span>{dependencyHint || 'Prerequisite required'}</span>
                    </div>
                )}
            </div>
        </div>
    );
};


