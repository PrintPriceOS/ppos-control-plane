/**
 * src/ui/components/printhouse/setup/SetupModuleCard.tsx
 * 
 * Displays an individual onboarding module card.
 */
import React from 'react';
import { ArrowRight, CheckCircle, Clock, Lock } from 'lucide-react';

interface SetupModuleCardProps {
    title: string;
    description: string;
    status: 'COMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED' | 'LOCKED';
    isActionable: boolean;
    onAction?: () => void;
}

export const SetupModuleCard: React.FC<SetupModuleCardProps> = ({
    title,
    description,
    status,
    isActionable,
    onAction
}) => {
    return (
        <div style={{
            background: '#18181b',
            border: `1px solid ${status === 'COMPLETE' ? '#10b981' : isActionable ? '#27272a' : '#27272a'}`,
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            opacity: isActionable ? 1 : 0.6,
            transition: 'all 0.2s ease'
        }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>{title}</h3>
                    {status === 'COMPLETE' && <CheckCircle size={18} style={{ color: '#10b981' }} />}
                    {status === 'IN_PROGRESS' && <Clock size={18} style={{ color: '#eab308' }} />}
                    {!isActionable && <Lock size={18} style={{ color: '#71717a' }} />}
                </div>
                <p style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: '1.5', margin: '0 0 16px 0' }}>
                    {description}
                </p>
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
                            gap: '6px'
                        }}
                    >
                        {status === 'COMPLETE' ? 'Edit Configuration' : 'Configure Module'} <ArrowRight size={14} />
                    </button>
                ) : (
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#71717a' }}>
                        Coming in Phase 191D/E
                    </span>
                )}
            </div>
        </div>
    );
};
