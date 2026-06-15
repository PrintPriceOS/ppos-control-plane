/**
 * src/ui/components/auth/AuthToast.tsx
 *
 * Floating toast notification for Auth Identity Suite.
 * Self-dismisses after 5s. Supports success, error, warning variants.
 * Used across LoginForm, RegisterForm, ForgotPasswordForm.
 */
import React, { useEffect, useState } from 'react';
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    XCircleIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
    id: string;
    variant: ToastVariant;
    title: string;
    body?: string;
}

interface AuthToastProps {
    toasts: ToastMessage[];
    onDismiss: (id: string) => void;
}

const VARIANT_CONFIG: Record<ToastVariant, {
    icon: React.FC<{ className?: string }>;
    bg: string;
    border: string;
    title: string;
    iconColor: string;
}> = {
    success: {
        icon: CheckCircleIcon,
        bg: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.3)',
        title: '#6ee7b7',
        iconColor: '#10b981',
    },
    error: {
        icon: XCircleIcon,
        bg: 'rgba(239,68,68,0.12)',
        border: 'rgba(239,68,68,0.3)',
        title: '#fca5a5',
        iconColor: '#ef4444',
    },
    warning: {
        icon: ExclamationTriangleIcon,
        bg: 'rgba(234,179,8,0.12)',
        border: 'rgba(234,179,8,0.3)',
        title: '#fde68a',
        iconColor: '#eab308',
    },
    info: {
        icon: CheckCircleIcon,
        bg: 'rgba(99,102,241,0.12)',
        border: 'rgba(99,102,241,0.3)',
        title: '#a5b4fc',
        iconColor: '#6366f1',
    },
};

const Toast: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
    const [visible, setVisible] = useState(false);
    const config = VARIANT_CONFIG[toast.variant];
    const Icon = config.icon;

    useEffect(() => {
        // Animate in
        const inTimer = setTimeout(() => setVisible(true), 10);
        // Auto-dismiss
        const outTimer = setTimeout(() => {
            setVisible(false);
            setTimeout(() => onDismiss(toast.id), 300);
        }, 5000);
        return () => { clearTimeout(inTimer); clearTimeout(outTimer); };
    }, [toast.id, onDismiss]);

    return (
        <div
            role="alert"
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '14px 16px',
                background: config.bg,
                border: `1px solid ${config.border}`,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                minWidth: '280px',
                maxWidth: '380px',
                transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(12px)',
                fontFamily: "'Manrope', system-ui, sans-serif",
            }}
        >
            <Icon style={{ width: 20, height: 20, color: config.iconColor, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: config.title }}>{toast.title}</p>
                {toast.body && (
                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                        {toast.body}
                    </p>
                )}
            </div>
            <button
                onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}
                aria-label="Dismiss notification"
            >
                <XMarkIcon style={{ width: 16, height: 16 }} />
            </button>
        </div>
    );
};

export const AuthToastContainer: React.FC<AuthToastProps> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                zIndex: 10000,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                alignItems: 'flex-end',
            }}
            aria-live="polite"
            aria-label="Notifications"
        >
            {toasts.map((t) => (
                <Toast key={t.id} toast={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuthToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = (variant: ToastVariant, title: string, body?: string) => {
        const id = `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, variant, title, body }]);
    };

    const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

    return { toasts, addToast, dismiss };
}
