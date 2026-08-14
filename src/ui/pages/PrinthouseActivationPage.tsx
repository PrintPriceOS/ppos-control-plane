/**
 * src/ui/pages/PrinthouseActivationPage.tsx
 * 
 * Phase 191B — Account Activation Confirmation Page.
 * 
 * Scanner-Resistant: Automatically inspects the token on mount to verify validity,
 * but requires an explicit user click on "Activate My Account" before invoking POST /api/auth/printhouse/activate.
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Lock, ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { setAuthToken, setAuthUser } from '../lib/authStore';
import { PrintPriceLogo } from '../components/PrintPriceLogo';

export const PrinthouseActivationPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token') || '';

    const [status, setStatus] = useState<'INSPECTING' | 'READY' | 'ACTIVATING' | 'SUCCESS' | 'ERROR'>('INSPECTING');
    const [maskedEmail, setMaskedEmail] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [confirmPassword, setConfirmPassword] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setStatus('ERROR');
            setErrorMessage('Activation link is missing a valid token.');
            return;
        }

        // 1. Inspect token without consuming
        fetch('/api/auth/printhouse/activation/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawToken: token })
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok && data.status === 'READY_TO_ACTIVATE') {
                setStatus('READY');
                setMaskedEmail(data.maskedEmail || '');
                // Strip raw token from visible browser URL to prevent referrer leakage
                if (typeof window !== 'undefined' && window.history?.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } else {
                setStatus('ERROR');
                setErrorMessage(data.error?.message || 'This activation link is invalid or has expired.');
            }
        })
        .catch(() => {
            setStatus('ERROR');
            setErrorMessage('Unable to connect to authentication server.');
        });
    }, [token]);

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 8) {
            setErrorMessage('Password must be at least 8 characters long.');
            return;
        }
        if (password !== confirmPassword) {
            setErrorMessage('Passwords do not match.');
            return;
        }

        setStatus('ACTIVATING');
        setErrorMessage(null);

        try {
            const res = await fetch('/api/auth/printhouse/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawToken: token, password })
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                setStatus('SUCCESS');
                if (data.token) setAuthToken(data.token);
                if (data.user) setAuthUser(data.user);

                setTimeout(() => {
                    navigate('/printhouse/setup', { replace: true });
                }, 1500);
            } else {
                setStatus('ERROR');
                setErrorMessage(data.error?.message || 'Activation failed. Please try again or request a new link.');
            }
        } catch (err) {
            setStatus('ERROR');
            setErrorMessage('Network error during activation.');
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'radial-gradient(circle at 50% 20%, #1a0505 0%, #09090b 80%)',
            color: '#f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
        }}>
            <div style={{
                maxWidth: '440px',
                width: '100%',
                background: 'rgba(24, 24, 27, 0.8)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(220, 0, 0, 0.2)',
                borderRadius: '16px',
                padding: '36px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <PrintPriceLogo height={32} />
                    <h1 style={{ fontSize: '22px', fontWeight: 700, marginTop: '16px', color: '#ffffff' }}>
                        Account Activation
                    </h1>
                </div>

                {status === 'INSPECTING' && (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <RefreshCw size={32} className="animate-spin" style={{ color: '#dc0000', margin: '0 auto 16px auto' }} />
                        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Verifying activation link...</p>
                    </div>
                )}

                {status === 'READY' && (
                    <form onSubmit={handleActivate}>
                        <div style={{
                            background: 'rgba(220, 0, 0, 0.08)',
                            border: '1px solid rgba(220, 0, 0, 0.2)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <ShieldCheck size={20} style={{ color: '#dc0000', flexShrink: 0 }} />
                            <span style={{ fontSize: '13px', color: '#e4e4e7' }}>
                                Activating account for <strong style={{ color: '#ffffff' }}>{maskedEmail}</strong>
                            </span>
                        </div>

                        {errorMessage && (
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid #ef4444',
                                color: '#fca5a5',
                                fontSize: '13px',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                marginBottom: '16px'
                            }}>
                                {errorMessage}
                            </div>
                        )}

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                                Set Your Administrator Password
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="At least 8 characters"
                                style={{
                                    width: '100%',
                                    background: '#09090b',
                                    border: '1px solid #27272a',
                                    color: '#ffffff',
                                    padding: '12px 14px',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-enter password"
                                style={{
                                    width: '100%',
                                    background: '#09090b',
                                    border: '1px solid #27272a',
                                    color: '#ffffff',
                                    padding: '12px 14px',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <button
                            type="submit"
                            style={{
                                width: '100%',
                                background: '#dc0000',
                                color: '#ffffff',
                                border: 'none',
                                padding: '14px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '15px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            Activate Account & Enter Workspace <ArrowRight size={18} />
                        </button>
                    </form>
                )}

                {status === 'ACTIVATING' && (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <RefreshCw size={32} className="animate-spin" style={{ color: '#dc0000', margin: '0 auto 16px auto' }} />
                        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Creating your workspace and issuing session...</p>
                    </div>
                )}

                {status === 'SUCCESS' && (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <CheckCircle size={48} style={{ color: '#10b981', margin: '0 auto 16px auto' }} />
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>Account Activated!</h2>
                        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Redirecting to your Printhouse dashboard...</p>
                    </div>
                )}

                {status === 'ERROR' && (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <AlertTriangle size={48} style={{ color: '#ef4444', margin: '0 auto 16px auto' }} />
                        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>Activation Issue</h2>
                        <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '24px' }}>{errorMessage}</p>
                        <Link
                            to="/printhouse/register"
                            style={{
                                display: 'inline-block',
                                background: '#27272a',
                                color: '#ffffff',
                                textDecoration: 'none',
                                padding: '10px 20px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: 500
                            }}
                        >
                            Back to Registration
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
};
