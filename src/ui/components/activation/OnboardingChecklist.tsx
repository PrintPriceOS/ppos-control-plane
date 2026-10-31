import React from 'react';
import { CheckCircle, Circle, ArrowRight } from 'lucide-react';

export interface OnboardingTask {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    actionLabel?: string;
    onAction?: () => void;
}

interface OnboardingChecklistProps {
    tasks: OnboardingTask[];
}

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ tasks }) => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    return (
        <div style={{
            background: isDark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: isDark ? '0 32px 64px rgba(0,0,0,0.6)' : '0 32px 64px rgba(0,0,0,0.10)',
        }}>
            <h2 style={{
                fontSize: '20px',
                fontWeight: 600,
                color: isDark ? '#ffffff' : '#0f172a',
                marginBottom: '8px'
            }}>
                Setup Your Node
            </h2>
            <p style={{
                fontSize: '14px',
                color: isDark ? '#a1a1aa' : '#64748b',
                marginBottom: '24px'
            }}>
                Complete these steps to verify your account and start receiving orders from the marketplace.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {tasks.map((task, index) => (
                    <div key={task.id} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        padding: '16px',
                        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderRadius: '12px',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                        opacity: task.completed ? 0.7 : 1,
                        transition: 'opacity 0.3s ease'
                    }}>
                        <div style={{ marginRight: '16px', marginTop: '2px' }}>
                            {task.completed ? (
                                <CheckCircle size={24} color="#10b981" />
                            ) : (
                                <Circle size={24} color={isDark ? '#52525b' : '#94a3b8'} />
                            )}
                        </div>
                        <div style={{ flex: 1 }}>
                            <h3 style={{
                                fontSize: '16px',
                                fontWeight: 500,
                                color: task.completed ? (isDark ? '#a1a1aa' : '#64748b') : (isDark ? '#ffffff' : '#0f172a'),
                                textDecoration: task.completed ? 'line-through' : 'none',
                                marginBottom: '4px'
                            }}>
                                {task.title}
                            </h3>
                            <p style={{
                                fontSize: '13px',
                                color: isDark ? '#a1a1aa' : '#64748b',
                                marginBottom: (!task.completed && task.actionLabel) ? '12px' : '0'
                            }}>
                                {task.description}
                            </p>
                            {(!task.completed && task.actionLabel) && (
                                <button
                                    onClick={task.onAction}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#dc0000',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = '#b90000'}
                                    onMouseOut={(e) => e.currentTarget.style.background = '#dc0000'}
                                >
                                    {task.actionLabel}
                                    <ArrowRight size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
