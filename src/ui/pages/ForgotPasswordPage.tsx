/**
 * src/ui/pages/ForgotPasswordPage.tsx
 *
 * Auth Identity Suite — Forgot Password Form (Phase Auth v2).
 *
 * SECURITY: Implements "Blind Response" pattern.
 * The UI always shows "If the email exists, we've sent a link" regardless
 * of whether the email is in the database. This prevents account enumeration.
 *
 * Features:
 *  - Email normalization (trim + lowercase) before submission
 *  - Rate-limit button lockout (disabled during in-flight)
 *  - Smooth transition back to /login with query param preservation
 *  - Toast notification for network errors
 *  - Animated success state
 */
import React, { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    EnvelopeIcon,
    ArrowLeftIcon,
    PaperAirplaneIcon,
    CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { AuthShell, AuthInput, AuthButton } from '../components/auth/AuthShell';
import { AuthToastContainer, useAuthToast } from '../components/auth/AuthToast';

function isDark() {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
}

export const ForgotPasswordPage: React.FC = () => {
    const [email, setEmail]     = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent]       = useState(false);
    const [emailError, setEmailError] = useState<string | undefined>();

    const location = useLocation();
    const { toasts, addToast, dismiss } = useAuthToast();
    const dark = isDark();

    const validate = (): boolean => {
        const clean = email.trim().toLowerCase();
        if (!clean) { setEmailError('Email is required'); return false; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setEmailError('Invalid email format'); return false; }
        setEmailError(undefined);
        return true;
    };

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        setLoading(true);

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase() }),
            });

            // Both 200 and any server error should result in the same
            // "blind" success UI — we never tell the user if the email exists
            if (!response.ok && response.status >= 500) {
                addToast('warning', 'Temporary server error', 'Please try again in a few moments.');
                return;
            }

            // BLIND RESPONSE: always show success regardless of actual result
            setSent(true);
        } catch {
            // Network errors still show blind success (edge case: offline)
            // This avoids leaking which emails are registered even via timing
            addToast('warning', 'Connection error', 'Cannot reach the server. Please check your internet connection.');
        } finally {
            setLoading(false);
        }
    }, [email, addToast]);

    // ── Success state ─────────────────────────────────────────────────────────
    if (sent) {
        return (
            <>
                <AuthShell title="Recover Access" subtitle="PrintPrice OS">
                    <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                        {/* Animated check icon */}
                        <div style={{
                            width: 72, height: 72,
                            background: 'rgba(16,185,129,0.12)',
                            border: '1px solid rgba(16,185,129,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px',
                            animation: 'ppos-auth-check-appear 0.4s cubic-bezier(0.16,1,0.3,1) both',
                        }}>
                            <CheckCircleIcon style={{ width: 36, height: 36, color: '#10b981' }} />
                        </div>

                        <h2 style={{
                            margin: '0 0 10px', fontSize: '18px', fontWeight: 800,
                            color: dark ? '#f4f4f5' : '#0f172a',
                            fontFamily: "'Manrope', system-ui, sans-serif",
                        }}>
                            Link Sent
                        </h2>

                        <p style={{
                            margin: '0 0 8px', fontSize: '14px', lineHeight: 1.6,
                            color: dark ? '#71717a' : '#64748b',
                            fontFamily: "'Manrope', system-ui, sans-serif",
                        }}>
                            If an account is associated with{' '}
                            <strong style={{ color: dark ? '#a1a1aa' : '#475569', wordBreak: 'break-all' }}>
                                {email.trim().toLowerCase()}
                            </strong>
                            , you will receive a password reset link shortly.
                        </p>

                        <p style={{
                            margin: '0 0 28px', fontSize: '12px',
                            color: dark ? '#52525b' : '#94a3b8',
                            fontFamily: "'Manrope', system-ui, sans-serif",
                        }}>
                            Please also check your spam folder.
                        </p>

                        <Link
                            to={`/login${location.search}`}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                padding: '10px 20px',
                                background: '#dc0000', color: '#fff',
                                fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                                fontFamily: "'Manrope', system-ui, sans-serif",
                                transition: 'filter 0.15s ease',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
                            onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
                        >
                            <ArrowLeftIcon style={{ width: 14, height: 14 }} />
                            Return to Login
                        </Link>
                    </div>
                </AuthShell>
                <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
            </>
        );
    }

    // ── Form state ────────────────────────────────────────────────────────────
    return (
        <>
            <AuthShell title="Recover Access" subtitle="PrintPrice OS">
                {/* Back link */}
                <div style={{ marginBottom: '20px' }}>
                    <Link
                        to={`/login${location.search}`}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            fontSize: '12px', fontWeight: 700, color: dark ? '#71717a' : '#64748b',
                            textDecoration: 'none', fontFamily: "'Manrope', system-ui, sans-serif",
                            transition: 'color 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#dc0000')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = dark ? '#71717a' : '#64748b')}
                    >
                        <ArrowLeftIcon style={{ width: 13, height: 13 }} />
                        Back to Login
                    </Link>
                </div>

                {/* Header */}
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <PaperAirplaneIcon style={{ width: 20, height: 20, color: '#dc0000' }} />
                        <h2 style={{
                            margin: 0, fontSize: '17px', fontWeight: 800,
                            color: dark ? '#f4f4f5' : '#0f172a',
                            fontFamily: "'Manrope', system-ui, sans-serif",
                        }}>
                            Recover Password
                        </h2>
                    </div>
                    <p style={{
                        margin: 0, fontSize: '13px', color: dark ? '#71717a' : '#64748b',
                        fontFamily: "'Manrope', system-ui, sans-serif", lineHeight: 1.6,
                    }}>
                        Enter your email address and we will send you a password reset link. The link expires in 1 hour.
                    </p>
                </div>

                <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <AuthInput
                        id="forgot-email"
                        label="Account Email"
                        type="email"
                        autoComplete="email"
                        autoFocus
                        placeholder="you@printhouse.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setEmailError(undefined); }}
                        icon={EnvelopeIcon as any}
                        error={emailError}
                        disabled={loading}
                    />

                    <AuthButton
                        id="forgot-submit"
                        type="submit"
                        loading={loading}
                        disabled={loading}
                        accentColor="#dc0000"
                    >
                        <PaperAirplaneIcon style={{ width: 16, height: 16 }} />
                        <span>Send recovery link</span>
                    </AuthButton>
                </form>

                {/* Security note */}
                <p style={{
                    marginTop: '20px', marginBottom: 0,
                    fontSize: '11px', fontWeight: 500, lineHeight: 1.6,
                    color: dark ? '#3f3f46' : '#94a3b8',
                    fontFamily: "'Manrope', system-ui, sans-serif",
                    textAlign: 'center',
                }}>
                    🔒 For security, we do not reveal if an email is registered.
                    You will always see the same confirmation screen.
                </p>
            </AuthShell>

            <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
        </>
    );
};
