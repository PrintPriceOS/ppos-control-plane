/**
 * src/ui/pages/PrinthouseRegistrationPage.tsx
 *
 * Auth Identity Suite — Printhouse Registration (Phase Auth v2).
 *
 * Multi-step flow:
 *   Step 1 — Company Details (name, country, city, website, phone)
 *   Step 2 — Admin Account (email, password + strength meter, confirm)
 *   Step 3 — Success / auto-redirect
 *
 * Features:
 *  - Password strength indicator (zxcvbn-style rules without the lib)
 *  - Client-side validation per step before advancing
 *  - Email normalization (trim + lowercase)
 *  - Toast notifications for API errors (no hard crash)
 *  - Animated step transitions
 *  - Rate-limit button lock
 */
import React, { useState, useCallback, CSSProperties } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    BuildingOfficeIcon,
    EnvelopeIcon,
    LockClosedIcon,
    GlobeAltIcon,
    PhoneIcon,
    ArrowRightIcon,
    ArrowLeftIcon,
    CheckCircleIcon,
    EyeIcon,
    EyeSlashIcon,
    MapPinIcon,
} from '@heroicons/react/24/outline';
import { setAuthToken, setAuthUser } from '../lib/authStore';
import { AuthInput, AuthButton } from '../components/auth/AuthShell';
import { AuthToastContainer, useAuthToast } from '../components/auth/AuthToast';
import { PrintPriceLogo } from '../components/PrintPriceLogo';

// ─────────────────────────────────────────────────────────────────────────────
// Password strength checker
// ─────────────────────────────────────────────────────────────────────────────

interface StrengthResult { score: 0 | 1 | 2 | 3 | 4; label: string; color: string; }

function checkPasswordStrength(pw: string): StrengthResult {
    let score = 0;
    if (pw.length >= 8)  score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
    const map: Record<0 | 1 | 2 | 3 | 4, { label: string; color: string }> = {
        0: { label: 'Muy débil',  color: '#ef4444' },
        1: { label: 'Débil',     color: '#f97316' },
        2: { label: 'Regular',   color: '#eab308' },
        3: { label: 'Fuerte',    color: '#22c55e' },
        4: { label: 'Muy fuerte',color: '#10b981' },
    };
    return { score: clamped, ...map[clamped] };
}

const COUNTRIES = [
    { code: 'ES', label: 'España' },
    { code: 'MX', label: 'México' },
    { code: 'AR', label: 'Argentina' },
    { code: 'CO', label: 'Colombia' },
    { code: 'CL', label: 'Chile' },
    { code: 'PE', label: 'Perú' },
    { code: 'US', label: 'Estados Unidos' },
    { code: 'DE', label: 'Alemania' },
    { code: 'FR', label: 'Francia' },
    { code: 'IT', label: 'Italia' },
    { code: 'PT', label: 'Portugal' },
    { code: 'GB', label: 'Reino Unido' },
    { code: 'OTHER', label: 'Otro' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────────────

interface FormData {
    companyName: string;
    contactName: string;
    country: string;
    city: string;
    phone: string;
    website: string;
    email: string;
    password: string;
    confirmPassword: string;
}

function isDark() {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
}

// ─────────────────────────────────────────────────────────────────────────────
// PrinthouseRegistrationPage
// ─────────────────────────────────────────────────────────────────────────────

export const PrinthouseRegistrationPage: React.FC = () => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [formData, setFormData] = useState<FormData>({
        companyName: '', contactName: '', country: 'ES', city: '',
        phone: '', website: '', email: '', password: '', confirmPassword: '',
    });
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});
    const [showPw, setShowPw]   = useState(false);
    const [showCpw, setShowCpw] = useState(false);
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { toasts, addToast, dismiss } = useAuthToast();
    const dark = isDark();

    const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData((p) => ({ ...p, [key]: e.target.value }));
        setFieldErrors((p) => ({ ...p, [key]: undefined }));
    };

    // ── Step 1 validation ─────────────────────────────────────────────────────
    const validateStep1 = (): boolean => {
        const errs: typeof fieldErrors = {};
        if (!formData.companyName.trim()) errs.companyName = 'El nombre de la empresa es obligatorio';
        if (!formData.contactName.trim()) errs.contactName = 'El nombre de contacto es obligatorio';
        if (!formData.city.trim()) errs.city = 'La ciudad es obligatoria';
        if (formData.website && !/^https?:\/\//.test(formData.website.trim())) {
            errs.website = 'La URL debe comenzar con http:// o https://';
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    // ── Step 2 validation ─────────────────────────────────────────────────────
    const validateStep2 = (): boolean => {
        const errs: typeof fieldErrors = {};
        const cleanEmail = formData.email.trim().toLowerCase();
        if (!cleanEmail) errs.email = 'El email es obligatorio';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errs.email = 'Formato de email inválido';
        if (!formData.password) errs.password = 'La contraseña es obligatoria';
        else if (formData.password.length < 8) errs.password = 'Mínimo 8 caracteres';
        else if (checkPasswordStrength(formData.password).score < 2) errs.password = 'Contraseña demasiado débil';
        if (formData.password !== formData.confirmPassword) errs.confirmPassword = 'Las contraseñas no coinciden';
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const goToStep2 = () => { if (validateStep1()) setStep(2); };
    const goToStep1 = () => { setStep(1); setFieldErrors({}); };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateStep2()) return;

        setLoading(true);
        try {
            const payload = {
                companyName: formData.companyName.trim(),
                contactName: formData.contactName.trim(),
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                country: formData.country,
                city: formData.city.trim(),
                phone: formData.phone.trim() || undefined,
                website: formData.website.trim() || undefined,
            };

            const response = await fetch('/api/auth/printhouse/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                addToast('error', 'Error en el registro', data?.error || `Error ${response.status}. Inténtalo de nuevo.`);
                return;
            }
            if (!data.token || !data.user) {
                addToast('error', 'Respuesta inesperada', 'El servidor no devolvió una sesión válida.');
                return;
            }

            setAuthToken(data.token);
            setAuthUser(data.user);
            setStep(3);

            setTimeout(() => navigate('/dashboard', { replace: true }), 2500);
        } catch {
            addToast('error', 'Error de conexión', 'No se puede alcanzar el servidor. Comprueba tu conexión.');
        } finally {
            setLoading(false);
        }
    }, [formData, navigate, addToast]);

    // ─────────────────────────────────────────────────────────────────────────
    // Styles
    // ─────────────────────────────────────────────────────────────────────────

    const backdrop: CSSProperties = {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: dark
            ? 'radial-gradient(ellipse at 20% 20%, rgba(220,0,0,0.07) 0%, transparent 60%), #0e0e0f'
            : 'radial-gradient(ellipse at 20% 20%, rgba(220,0,0,0.04) 0%, transparent 60%), #f1f5f9',
        fontFamily: "'Manrope', system-ui, sans-serif",
    };

    const cardWrap: CSSProperties = {
        width: '100%',
        maxWidth: 640,
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
    };

    const glassCard: CSSProperties = {
        background: dark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        padding: '36px',
        boxShadow: dark
            ? '0 32px 64px rgba(0,0,0,0.6)'
            : '0 32px 64px rgba(0,0,0,0.10)',
    };

    const stepDot = (n: number): CSSProperties => ({
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', fontWeight: 800,
        background: step >= n ? '#dc0000' : dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
        color: step >= n ? '#fff' : dark ? '#52525b' : '#94a3b8',
        border: `1px solid ${step >= n ? '#dc0000' : dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        transition: 'all 0.25s ease',
    });

    const stepLine: CSSProperties = {
        flex: 1, height: 1,
        background: step >= 2 ? '#dc0000' : dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
        transition: 'background 0.25s ease',
    };

    const strength = checkPasswordStrength(formData.password);

    // ── Success Screen ─────────────────────────────────────────────────────────
    if (step === 3) {
        return (
            <>
                <div style={backdrop}>
                    <div style={{ ...cardWrap, maxWidth: 440 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ width: 72, height: 72, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <CheckCircleIcon style={{ width: 40, height: 40, color: '#10b981' }} />
                            </div>
                            <PrintPriceLogo className="w-10 h-10 mx-auto mb-4" />
                            <h1 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a' }}>
                                ¡Registro completado!
                            </h1>
                            <p style={{ margin: '0 0 4px', fontSize: '14px', color: dark ? '#71717a' : '#64748b' }}>
                                Tu imprenta ha sido registrada en la red PrintPrice.
                            </p>
                            <p style={{ margin: 0, fontSize: '13px', color: dark ? '#52525b' : '#94a3b8' }}>
                                Redirigiendo al panel de control…
                            </p>
                        </div>
                    </div>
                </div>
                <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
            </>
        );
    }

    // ── Main Form ──────────────────────────────────────────────────────────────
    return (
        <>
            <div style={backdrop}>
                <div style={cardWrap}>
                    {/* Branding */}
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 52, height: 52, background: dark ? 'rgba(220,0,0,0.15)' : 'rgba(220,0,0,0.08)', border: '1px solid rgba(220,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <PrintPriceLogo className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a', letterSpacing: '-0.3px' }}>
                                Únete a la Red PrintPrice
                            </h1>
                            <p style={{ margin: '3px 0 0', fontSize: '11px', fontWeight: 700, color: dark ? '#71717a' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Self-Service Onboarding
                            </p>
                        </div>
                    </div>

                    {/* Stepper */}
                    <div style={glassCard}>
                        {/* Step indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '28px' }}>
                            <div style={stepDot(1)}>1</div>
                            <div style={stepLine} />
                            <div style={stepDot(2)}>2</div>
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a' }}>
                                {step === 1 ? 'Datos de la Empresa' : 'Cuenta de Administrador'}
                            </h2>
                            <p style={{ margin: 0, fontSize: '13px', color: dark ? '#71717a' : '#64748b' }}>
                                {step === 1
                                    ? 'Información básica de tu imprenta.'
                                    : 'Credenciales para acceder al panel de control.'}
                            </p>
                        </div>

                        {/* ── STEP 1 ────────────────────────────────────────────── */}
                        {step === 1 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <AuthInput
                                        id="reg-company"
                                        label="Nombre de la Empresa *"
                                        type="text"
                                        autoFocus
                                        placeholder="Imprenta García S.L."
                                        value={formData.companyName}
                                        onChange={set('companyName')}
                                        icon={BuildingOfficeIcon as any}
                                        error={fieldErrors.companyName}
                                    />
                                </div>
                                <AuthInput
                                    id="reg-contact"
                                    label="Nombre de Contacto *"
                                    type="text"
                                    placeholder="Juan García"
                                    value={formData.contactName}
                                    onChange={set('contactName')}
                                    icon={BuildingOfficeIcon as any}
                                    error={fieldErrors.contactName}
                                />
                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                        País *
                                    </label>
                                    <select
                                        id="reg-country"
                                        value={formData.country}
                                        onChange={set('country')}
                                        style={{
                                            width: '100%', padding: '11px 14px',
                                            background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                            border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
                                            color: dark ? '#f4f4f5' : '#0f172a',
                                            fontSize: '14px', fontWeight: 500, outline: 'none',
                                            fontFamily: "'Manrope', system-ui, sans-serif",
                                        }}
                                    >
                                        {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                                    </select>
                                </div>
                                <AuthInput
                                    id="reg-city"
                                    label="Ciudad *"
                                    type="text"
                                    placeholder="Madrid"
                                    value={formData.city}
                                    onChange={set('city')}
                                    icon={MapPinIcon as any}
                                    error={fieldErrors.city}
                                />
                                <AuthInput
                                    id="reg-phone"
                                    label="Teléfono (Opcional)"
                                    type="tel"
                                    placeholder="+34 91 000 0000"
                                    value={formData.phone}
                                    onChange={set('phone')}
                                    icon={PhoneIcon as any}
                                />
                                <AuthInput
                                    id="reg-website"
                                    label="Web (Opcional)"
                                    type="url"
                                    placeholder="https://tuimprenta.com"
                                    value={formData.website}
                                    onChange={set('website')}
                                    icon={GlobeAltIcon as any}
                                    error={fieldErrors.website}
                                />

                                <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                                    <AuthButton id="reg-next" type="button" onClick={goToStep2} accentColor="#dc0000">
                                        <span>Siguiente — Crear cuenta</span>
                                        <ArrowRightIcon style={{ width: 16, height: 16 }} />
                                    </AuthButton>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2 ────────────────────────────────────────────── */}
                        {step === 2 && (
                            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <AuthInput
                                    id="reg-email"
                                    label="Email del Administrador *"
                                    type="email"
                                    autoFocus
                                    autoComplete="email"
                                    placeholder="admin@tuimprenta.com"
                                    value={formData.email}
                                    onChange={set('email')}
                                    icon={EnvelopeIcon as any}
                                    error={fieldErrors.email}
                                    disabled={loading}
                                />

                                <div>
                                    <AuthInput
                                        id="reg-password"
                                        label="Contraseña *"
                                        type={showPw ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        placeholder="Mínimo 8 caracteres"
                                        value={formData.password}
                                        onChange={set('password')}
                                        icon={LockClosedIcon as any}
                                        error={fieldErrors.password}
                                        disabled={loading}
                                        rightSlot={
                                            <button type="button" onClick={() => setShowPw((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: dark ? '#52525b' : '#94a3b8' }} aria-label="Toggle password visibility">
                                                {showPw ? <EyeSlashIcon style={{ width: 16, height: 16 }} /> : <EyeIcon style={{ width: 16, height: 16 }} />}
                                            </button>
                                        }
                                    />

                                    {/* Password strength meter */}
                                    {formData.password.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                                                {[0, 1, 2, 3].map((i) => (
                                                    <div key={i} style={{
                                                        flex: 1, height: 3,
                                                        background: i < strength.score ? strength.color : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                                        transition: 'background 0.2s ease',
                                                    }} />
                                                ))}
                                            </div>
                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: strength.color, fontFamily: "'Manrope', system-ui, sans-serif" }}>
                                                Seguridad: {strength.label}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <AuthInput
                                    id="reg-confirm-password"
                                    label="Confirmar Contraseña *"
                                    type={showCpw ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Repite la contraseña"
                                    value={formData.confirmPassword}
                                    onChange={set('confirmPassword')}
                                    icon={LockClosedIcon as any}
                                    error={fieldErrors.confirmPassword}
                                    disabled={loading}
                                    rightSlot={
                                        <button type="button" onClick={() => setShowCpw((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: dark ? '#52525b' : '#94a3b8' }} aria-label="Toggle confirm password visibility">
                                            {showCpw ? <EyeSlashIcon style={{ width: 16, height: 16 }} /> : <EyeIcon style={{ width: 16, height: 16 }} />}
                                        </button>
                                    }
                                />

                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={goToStep1}
                                        disabled={loading}
                                        style={{
                                            flex: '0 0 auto', padding: '13px 16px',
                                            background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                            border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                            color: dark ? '#a1a1aa' : '#64748b',
                                            fontSize: '13px', fontWeight: 700,
                                            cursor: loading ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            fontFamily: "'Manrope', system-ui, sans-serif",
                                        }}
                                    >
                                        <ArrowLeftIcon style={{ width: 14, height: 14 }} />
                                        Atrás
                                    </button>
                                    <div style={{ flex: 1 }}>
                                        <AuthButton id="reg-submit" type="submit" loading={loading} disabled={loading} accentColor="#dc0000">
                                            <CheckCircleIcon style={{ width: 16, height: 16 }} />
                                            <span>Completar Registro</span>
                                        </AuthButton>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>

                    {/* Footer */}
                    <p style={{ textAlign: 'center', fontSize: '12px', color: dark ? '#3f3f46' : '#94a3b8', fontWeight: 600, margin: 0 }}>
                        ¿Ya tienes cuenta?{' '}
                        <Link to="/login" style={{ color: '#dc0000', textDecoration: 'none', fontWeight: 700 }}>
                            Iniciar sesión
                        </Link>
                    </p>
                </div>
            </div>

            <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
        </>
    );
};
