/**
 * src/ui/pages/LoginPage.tsx
 *
 * Auth Identity Suite — Login Form (Phase Auth v2).
 * Glassmorphic dual-theme design with:
 *  - JWT storage via authStore (secure localStorage)
 *  - Rate-limit button lock (disabled during in-flight request)
 *  - Toast notifications for 401/500 errors
 *  - Password visibility toggle
 *  - Redirect param preservation (?redirect=/path)
 *  - Seamless transition to /auth/forgot-password
 */
import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
    EnvelopeIcon,
    LockClosedIcon,
    ArrowRightIcon,
    EyeIcon,
    EyeSlashIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { setAuthToken, setAuthUser } from '../lib/authStore';
import { AuthShell, AuthInput, AuthButton } from '../components/auth/AuthShell';
import { AuthToastContainer, useAuthToast } from '../components/auth/AuthToast';

// ─────────────────────────────────────────────────────────────────────────────

function getRedirectPath(search: string, fallback = '/dashboard'): string {
    const params = new URLSearchParams(search);
    const redirect = params.get('redirect');
    if (!redirect) return fallback;
    // Only allow relative paths (prevent open redirect)
    try {
        const url = new URL(redirect, window.location.origin);
        if (url.origin === window.location.origin) return url.pathname + url.search;
    } catch {}
    return fallback;
}

function isDark() {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
}

// ─────────────────────────────────────────────────────────────────────────────

export const LoginPage: React.FC = () => {
    const [email, setEmail]         = useState('');
    const [password, setPassword]   = useState('');
    const [showPw, setShowPw]       = useState(false);
    const [loading, setLoading]     = useState(false);
    const [fieldError, setFieldErr] = useState<{ email?: string; password?: string }>({});

    const navigate  = useNavigate();
    const location  = useLocation();
    const { toasts, addToast, dismiss } = useAuthToast();

    // Determine redirect destination
    const redirectTo = getRedirectPath(
        location.search,
        (location.state as any)?.from?.pathname || '/dashboard'
    );

    const validate = (): boolean => {
        const errors: typeof fieldError = {};
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) errors.email = 'El email es obligatorio';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errors.email = 'Formato de email inválido';
        if (!password) errors.password = 'La contraseña es obligatoria';
        setFieldErr(errors);
        return Object.keys(errors).length === 0;
    };

    const handleLogin = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    password,
                }),
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                addToast('error', 'Credenciales inválidas', 'Verifica tu email y contraseña e inténtalo de nuevo.');
                return;
            }
            if (!response.ok) {
                addToast('error', 'Error de autenticación', data?.error || `Error del servidor (${response.status}). Inténtalo de nuevo.`);
                return;
            }

            if (!data.token || !data.user) {
                addToast('error', 'Respuesta inesperada', 'El servidor no devolvió un token válido.');
                return;
            }

            setAuthToken(data.token);
            setAuthUser(data.user);

            addToast('success', '¡Acceso autorizado!', 'Redirigiendo al panel de control…');
            setTimeout(() => navigate(redirectTo, { replace: true }), 800);
        } catch (err: any) {
            addToast('error', 'Error de conexión', 'No se puede alcanzar el servidor. Comprueba tu conexión.');
        } finally {
            setLoading(false);
        }
    }, [email, password, redirectTo, navigate, addToast]);

    const dark = isDark();

    return (
        <>
            <AuthShell title="PrintPrice Control Plane" subtitle="Governance & Operations">
                {/* Card header */}
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <ShieldCheckIcon style={{ width: 20, height: 20, color: '#dc0000' }} />
                        <h2 style={{
                            margin: 0, fontSize: '17px', fontWeight: 800,
                            color: dark ? '#f4f4f5' : '#0f172a',
                            fontFamily: "'Manrope', system-ui, sans-serif",
                        }}>
                            Autenticación Requerida
                        </h2>
                    </div>
                    <p style={{
                        margin: 0, fontSize: '13px', color: dark ? '#71717a' : '#64748b',
                        fontFamily: "'Manrope', system-ui, sans-serif",
                    }}>
                        Accede al panel usando tus credenciales de operador.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <AuthInput
                        id="login-email"
                        label="Email"
                        type="email"
                        autoComplete="email"
                        autoFocus
                        placeholder="admin@printprice.pro"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setFieldErr((p) => ({ ...p, email: undefined })); }}
                        icon={EnvelopeIcon as any}
                        error={fieldError.email}
                        disabled={loading}
                    />

                    <AuthInput
                        id="login-password"
                        label="Contraseña"
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setFieldErr((p) => ({ ...p, password: undefined })); }}
                        icon={LockClosedIcon as any}
                        error={fieldError.password}
                        disabled={loading}
                        rightSlot={
                            <button
                                type="button"
                                onClick={() => setShowPw((v) => !v)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: dark ? '#52525b' : '#94a3b8' }}
                                aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {showPw
                                    ? <EyeSlashIcon style={{ width: 16, height: 16 }} />
                                    : <EyeIcon style={{ width: 16, height: 16 }} />
                                }
                            </button>
                        }
                    />

                    {/* Forgot password link */}
                    <div style={{ textAlign: 'right', marginTop: '-8px' }}>
                        <Link
                            to={`/auth/forgot-password${location.search}`}
                            style={{
                                fontSize: '12px', fontWeight: 600, color: '#dc0000',
                                textDecoration: 'none', fontFamily: "'Manrope', system-ui, sans-serif",
                            }}
                        >
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>

                    <AuthButton
                        id="login-submit"
                        type="submit"
                        loading={loading}
                        disabled={loading}
                        accentColor="#dc0000"
                        style={{ marginTop: '8px' }}
                    >
                        <span>Autorizar Acceso</span>
                        <ArrowRightIcon style={{ width: 16, height: 16 }} />
                    </AuthButton>
                </form>

                {/* Divider */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    margin: '24px 0 0', color: dark ? '#3f3f46' : '#cbd5e1',
                }}>
                    <div style={{ flex: 1, height: 1, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Manrope', system-ui, sans-serif" }}>
                        Acceso Restringido
                    </span>
                    <div style={{ flex: 1, height: 1, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)' }} />
                </div>
                <p style={{
                    textAlign: 'center', fontSize: '11px', fontWeight: 600,
                    color: dark ? '#3f3f46' : '#94a3b8',
                    fontFamily: "'Manrope', system-ui, sans-serif",
                    margin: '10px 0 0',
                }}>
                    Solo para operadores autorizados del sistema
                </p>
            </AuthShell>

            <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
        </>
    );
};
