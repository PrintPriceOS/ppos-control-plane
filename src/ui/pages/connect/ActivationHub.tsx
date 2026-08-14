import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingChecklist, OnboardingTask } from '../../components/activation/OnboardingChecklist';
import { OrdersRadar } from '../../components/activation/OrdersRadar';
import { VerifiedBadgeModal } from '../../components/activation/VerifiedBadgeModal';
import { getAuthUser, setAuthUser } from '../../lib/authStore';

export const ActivationHub: React.FC = () => {
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    // Initial gamified tasks state
    const [tasks, setTasks] = useState<OnboardingTask[]>([
        {
            id: 'node-created',
            title: 'Node Provisioned',
            description: 'Your PrintPrice Node and Tenant have been successfully created.',
            completed: true
        },
        {
            id: 'webhook-setup',
            title: 'Configure Webhooks & JDF',
            description: 'Set up your API endpoints to receive order data automatically.',
            completed: false,
            actionLabel: 'Configure API',
            onAction: () => {
                setTasks(prev => prev.map(t => t.id === 'webhook-setup' ? { ...t, completed: true } : t));
            }
        },
        {
            id: 'sandbox-test',
            title: 'Complete Sandbox Test',
            description: 'Process a test order through the Sandbox to verify your configuration.',
            completed: false,
            actionLabel: 'Run Sandbox Test',
            onAction: () => {
                setTasks(prev => prev.map(t => t.id === 'sandbox-test' ? { ...t, completed: true } : t));
            }
        }
    ]);

    // Check if all tasks are complete
    useEffect(() => {
        const allCompleted = tasks.every(t => t.completed);
        if (allCompleted) {
            // Add a small delay for dramatic effect
            const timer = setTimeout(() => setIsModalOpen(true), 800);
            return () => clearTimeout(timer);
        }
    }, [tasks]);

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleGoToDashboard = async () => {
        setIsVerifying(true);
        try {
            // Optimistic local update so the guard allows us through
            const user = getAuthUser();
            if (user) {
                const updatedUser = { 
                    ...user, 
                    metadata: { ...(user.metadata || {}), orchestration_status: 'VERIFIED' } 
                };
                setAuthUser(updatedUser);
            }
            
            // Close modal immediately so UI does not stay in blocking modal state
            setIsModalOpen(false);

            // Optional verification signal to backend
            try {
                await fetch('/api/auth/printhouse/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
            } catch {
                // Ignore network errors on optional verify ping
            }

            navigate('/dashboard', { replace: true });
        } catch {
            navigate('/dashboard', { replace: true });
        } finally {
            setIsVerifying(false);
        }
    };

    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '40px',
            background: isDark
                ? 'radial-gradient(circle at top left, rgba(220,0,0,0.05) 0%, transparent 40%), #0e0e0f'
                : 'radial-gradient(circle at top left, rgba(220,0,0,0.05) 0%, transparent 40%), #f8fafc',
            fontFamily: "'Manrope', system-ui, sans-serif",
            color: isDark ? '#fff' : '#0f172a'
        }}>
            <VerifiedBadgeModal 
                isOpen={isModalOpen} 
                onClose={handleCloseModal} 
                onGoToDashboard={handleGoToDashboard}
            />

            <div style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>Marketplace Activation Hub</h1>
                <p style={{ fontSize: '16px', color: isDark ? '#a1a1aa' : '#64748b' }}>
                    Welcome to PrintPrice. Let's get your production node ready to receive orders.
                </p>
            </div>

            <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
                {/* Left Column: Checklist */}
                <div style={{ flex: '1 1 400px', maxWidth: '600px' }}>
                    <OnboardingChecklist tasks={tasks} />
                </div>

                {/* Right Column: Radar (Phase 2 Placeholder) */}
                <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                        background: isDark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        borderRadius: '16px',
                        padding: '24px',
                        boxShadow: isDark ? '0 32px 64px rgba(0,0,0,0.6)' : '0 32px 64px rgba(0,0,0,0.10)',
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '400px'
                    }}>
                        <OrdersRadar />
                    </div>
                </div>
            </div>
        </div>
    );
};
