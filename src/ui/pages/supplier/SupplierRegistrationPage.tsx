/**
 * src/ui/pages/supplier/SupplierRegistrationPage.tsx
 *
 * Dedicated B2B Paper Supplier Self-Service Registration Page.
 * Visual Standard: Glassmorphic Cards inside AuthShell, brand accent #dc0000.
 * Adheres to Impeccable standards, zero horizontal scroll, trilingual localization.
 */

import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Building2,
    Mail,
    Lock,
    Globe,
    Phone,
    ArrowRight,
    ArrowLeft,
    CheckCircle2,
    Eye,
    EyeOff,
    MapPin,
    FileText,
    Sparkles,
    ShieldCheck,
    Coins,
    Layers,
    Truck,
    Package,
    Clock,
    AlertCircle
} from 'lucide-react';
import { setAuthToken, setAuthUser, setActiveContext } from '../../lib/authStore';
import { AuthInput, AuthButton, AuthShell } from '../../components/auth/AuthShell';
import { AuthToastContainer, useAuthToast } from '../../components/auth/AuthToast';
import { COUNTRIES, getCountryDisplayName } from '../../lib/countryCatalog';
import { useLocale } from '../../i18n';

// ── Password strength evaluator ──────────────────────────────────────────────

interface StrengthResult {
    score: 0 | 1 | 2 | 3 | 4;
    label: string;
    color: string;
}

function checkPasswordStrength(pw: string): StrengthResult {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
    const map: Record<0 | 1 | 2 | 3 | 4, { label: string; color: string }> = {
        0: { label: 'Muy débil', color: '#ef4444' },
        1: { label: 'Débil', color: '#f97316' },
        2: { label: 'Media', color: '#eab308' },
        3: { label: 'Robusta', color: '#22c55e' },
        4: { label: 'Excelente', color: '#10b981' },
    };
    return { score: clamped, ...map[clamped] };
}

// ── Paper Categories Catalog ──────────────────────────────────────────────────

interface CategoryOption {
    id: string;
    label: string;
    subtitle: string;
}

const PAPER_CATEGORIES: CategoryOption[] = [
    { id: 'COATED', label: 'Estucados / Couché', subtitle: 'Brillo, Mate, Silk (80-400 gsm)' },
    { id: 'UNCOATED', label: 'Offset / No Estucado', subtitle: 'Edición, papelería y preprint (60-350 gsm)' },
    { id: 'CARTON', label: 'Cartoncillo & Folding', subtitle: 'GC1, GC2, SBS para packaging plegable' },
    { id: 'SPECIALTY', label: 'Especialidades & Texturados', subtitle: 'Verjurados, teñidos en masa, perlados' },
    { id: 'DIGITAL', label: 'Papel Certificado Digital', subtitle: 'Optimizado HP Indigo y tóner electrostático' },
    { id: 'PACKAGING', label: 'Kraft & Embalaje', subtitle: 'Papeles reciclados, liners y embalaje industrial' },
];

const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP'];

const COVERAGE_OPTIONS = [
    { id: 'LOCAL', label: 'Local / Provincial (24h)' },
    { id: 'REGIONAL', label: 'Regional / Autonómico (24-48h)' },
    { id: 'NATIONAL', label: 'Cobertura Nacional Completa' },
    { id: 'INTERNATIONAL', label: 'Internacional / Exportación UE' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const SupplierRegistrationPage: React.FC = () => {
    const navigate = useNavigate();
    const { t, locale } = useLocale();
    const { toasts, addToast, dismiss } = useAuthToast();

    // Step state: 1: Company, 2: Catalog/Distribution, 3: Credentials, 4: Success
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    // Form fields
    const [companyName, setCompanyName] = useState('');
    const [brandName, setBrandName] = useState('');
    const [taxId, setTaxId] = useState('');
    const [country, setCountry] = useState('ES');
    const [city, setCity] = useState('');
    const [website, setWebsite] = useState('');
    const [contactName, setContactName] = useState('');
    const [phone, setPhone] = useState('');

    const [currencies, setCurrencies] = useState<string[]>(['EUR']);
    const [categories, setCategories] = useState<string[]>(['COATED', 'UNCOATED']);
    const [deliveryCoverage, setDeliveryCoverage] = useState('NATIONAL');
    const [minOrderValue, setMinOrderValue] = useState('250');
    const [leadTimeDays, setLeadTimeDays] = useState('2');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [authorityConfirmed, setAuthorityConfirmed] = useState(false);

    // Registered response data for success screen
    const [registeredData, setRegisteredData] = useState<any>(null);

    // Validation helpers
    const passwordStrength = useMemo(() => checkPasswordStrength(password), [password]);
    const passwordsMatch = password && confirmPassword && password === confirmPassword;
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    const toggleCurrency = (curr: string) => {
        setCurrencies(prev => {
            if (prev.includes(curr)) {
                if (prev.length === 1) return prev; // Keep at least one
                return prev.filter(c => c !== curr);
            } else {
                return [...prev, curr];
            }
        });
    };

    const toggleCategory = (catId: string) => {
        setCategories(prev => {
            if (prev.includes(catId)) {
                if (prev.length === 1) return prev; // Keep at least one
                return prev.filter(c => c !== catId);
            } else {
                return [...prev, catId];
            }
        });
    };

    // Step 1 Validation
    const validateStep1 = (): boolean => {
        if (!companyName.trim()) {
            addToast('error', 'Campo obligatorio', 'Introduzca la razón social o nombre de la empresa proveedora.');
            return false;
        }
        if (!city.trim()) {
            addToast('error', 'Campo obligatorio', 'Introduzca la ciudad o centro logístico principal.');
            return false;
        }
        if (!contactName.trim()) {
            addToast('error', 'Campo obligatorio', 'Introduzca el nombre del responsable comercial o de operaciones.');
            return false;
        }
        if (!phone.trim()) {
            addToast('error', 'Campo obligatorio', 'Introduzca un teléfono de contacto directo o de pedidos.');
            return false;
        }
        return true;
    };

    // Step 2 Validation
    const validateStep2 = (): boolean => {
        if (currencies.length === 0) {
            addToast('error', 'Moneda requerida', 'Seleccione al menos una moneda de facturación admitida.');
            return false;
        }
        if (categories.length === 0) {
            addToast('error', 'Catálogo requerido', 'Seleccione al menos una familia de papel suministrada.');
            return false;
        }
        return true;
    };

    // Step 3 Validation & Submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setServerError(null);

        if (!isEmailValid) {
            addToast('error', 'Email no válido', 'Introduzca un email corporativo válido.');
            return;
        }
        if (password.length < 8) {
            addToast('error', 'Contraseña débil', 'La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (password !== confirmPassword) {
            addToast('error', 'Discrepancia', 'Las contraseñas introducidas no coinciden.');
            return;
        }
        if (!termsAccepted) {
            addToast('error', 'Términos B2B', 'Debe aceptar las condiciones comerciales y de gobernanza B2B.');
            return;
        }
        if (!authorityConfirmed) {
            addToast('error', 'Representación', 'Debe confirmar su capacidad para representar a la distribuidora.');
            return;
        }

        setLoading(true);

        const payload = {
            companyName: companyName.trim(),
            brandName: brandName.trim() || undefined,
            taxId: taxId.trim() || undefined,
            country,
            city: city.trim(),
            website: website.trim() || undefined,
            contactName: contactName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            password,
            currencies,
            categories,
            deliveryCoverage,
            minOrderValue: parseFloat(minOrderValue) || 0,
            leadTimeDays: parseInt(leadTimeDays, 10) || 2,
            termsAccepted: true
        };

        try {
            const res = await fetch('/api/auth/supplier/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.ok) {
                const msg = data.error || 'No se pudo completar el registro. Compruebe los datos e inténtelo de nuevo.';
                setServerError(msg);
                addToast('error', 'Error en el registro', msg);
                return;
            }

            // Successfully registered!
            if (data.token) {
                setAuthToken(data.token);
            }
            if (data.user) {
                setAuthUser(data.user);
            }
            setActiveContext('supplier');

            setRegisteredData(data);
            setStep(4);
            addToast('success', '¡Registro completado!', 'Proveedor activado en PrintPrice Paper Hub.');

        } catch (err: any) {
            const netErr = 'Error de red al conectar con el servidor. Inténtelo de nuevo.';
            setServerError(netErr);
            addToast('error', 'Fallo de conexión', netErr);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <AuthShell
                title={t('supplier.register.title')}
                subtitle={t('supplier.register.subtitle')}
                maxWidth={680}
            >
                {/* Hub Header Badge */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        color: '#dc0000',
                        textTransform: 'uppercase',
                        background: 'rgba(220, 0, 0, 0.1)',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid rgba(220, 0, 0, 0.25)',
                        fontFamily: "'Manrope', system-ui, sans-serif"
                    }}>
                        {t('supplier.register.badge')}
                    </span>
                    <span style={{
                        fontSize: '12px',
                        color: '#a1a1aa',
                        fontFamily: "'Manrope', system-ui, sans-serif"
                    }}>
                        {step < 4 ? `Paso ${step} de 3` : 'Completado'}
                    </span>
                </div>

                {/* Stepper Progress Bar */}
                {step < 4 && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                        {[1, 2, 3].map((s) => {
                            const isCurrent = step === s;
                            const isDone = step > s;
                            return (
                                <div
                                    key={s}
                                    style={{
                                        flex: 1,
                                        height: '4px',
                                        borderRadius: '2px',
                                        background: isDone
                                            ? '#10b981'
                                            : isCurrent
                                                ? '#dc0000'
                                                : 'rgba(255, 255, 255, 0.12)',
                                        transition: 'background 0.3s ease'
                                    }}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Server Error Alert Banner */}
                {serverError && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '14px 16px',
                        marginBottom: '20px',
                        borderRadius: '6px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#fca5a5',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        fontFamily: "'Manrope', system-ui, sans-serif"
                    }}>
                        <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ flex: 1 }}>
                            <strong>Error en la solicitud:</strong> {serverError}
                            {serverError.includes('already exists') && (
                                <div style={{ marginTop: '8px' }}>
                                    <Link
                                        to="/login"
                                        style={{
                                            color: '#ffffff',
                                            textDecoration: 'underline',
                                            fontWeight: 700
                                        }}
                                    >
                                        Haga clic aquí para iniciar sesión con su cuenta existente →
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── STEP 1: Company & Fiscal ─────────────────────────────────── */}
                {step === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ marginBottom: '8px' }}>
                            <h3 style={{
                                fontSize: '16px',
                                fontWeight: 800,
                                color: '#ffffff',
                                margin: '0 0 4px 0',
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                1. {t('supplier.register.step1')}
                            </h3>
                            <p style={{
                                fontSize: '13px',
                                color: '#a1a1aa',
                                margin: 0,
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                Datos fiscales y de contacto de la entidad distribuidora o fabricante de papel.
                            </p>
                        </div>

                        {/* Dual Column Layout */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: '14px'
                        }}>
                            <AuthInput
                                id="supplier-company-name"
                                label={`${t('supplier.register.companyName')} *`}
                                icon={Building2}
                                placeholder="Ej. Torraspapel Distribución S.A."
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                autoFocus
                                required
                            />

                            <AuthInput
                                id="supplier-brand-name"
                                label={t('supplier.register.brandName')}
                                icon={Sparkles}
                                placeholder="Ej. Lecta Group / Torras"
                                value={brandName}
                                onChange={(e) => setBrandName(e.target.value)}
                            />

                            <AuthInput
                                id="supplier-tax-id"
                                label={t('supplier.register.taxId')}
                                icon={FileText}
                                placeholder="Ej. ESA08000000 / DE123456789"
                                value={taxId}
                                onChange={(e) => setTaxId(e.target.value)}
                            />

                            {/* Country Selector */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#ffffff',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    fontFamily: "'Manrope', system-ui, sans-serif"
                                }}>
                                    {t('supplier.register.country')} *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: '14px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        pointerEvents: 'none',
                                        color: '#a1a1aa'
                                    }}>
                                        <Globe size={16} />
                                    </div>
                                    <select
                                        id="supplier-country"
                                        value={country}
                                        onChange={(e) => setCountry(e.target.value)}
                                        style={{
                                            width: '100%',
                                            paddingLeft: '40px',
                                            paddingRight: '14px',
                                            paddingTop: '11px',
                                            paddingBottom: '11px',
                                            background: 'rgba(255, 255, 255, 0.04)',
                                            border: '1px solid rgba(255, 255, 255, 0.12)',
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            outline: 'none',
                                            fontFamily: "'Manrope', system-ui, sans-serif",
                                            boxSizing: 'border-box'
                                        }}
                                    >
                                        {COUNTRIES.map((c) => (
                                            <option key={c.code} value={c.code} style={{ background: '#18181b', color: '#ffffff' }}>
                                                {getCountryDisplayName(c.code, locale)} ({c.code})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <AuthInput
                                id="supplier-city"
                                label={`${t('supplier.register.city')} *`}
                                icon={MapPin}
                                placeholder="Ej. Zaragoza / Madrid"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                required
                            />

                            <AuthInput
                                id="supplier-website"
                                label={t('supplier.register.website')}
                                icon={Globe}
                                placeholder="https://www.papelera-ejemplo.es"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                            />

                            <AuthInput
                                id="supplier-contact-name"
                                label={`${t('supplier.register.contactName')} *`}
                                icon={ShieldCheck}
                                placeholder="Ej. Laura Martínez Gómez"
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                required
                            />

                            <AuthInput
                                id="supplier-phone"
                                label={`${t('supplier.register.phone')} *`}
                                icon={Phone}
                                placeholder="+34 91 123 4567"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required
                            />
                        </div>

                        <div style={{ marginTop: '12px' }}>
                            <AuthButton
                                id="step1-next-button"
                                type="button"
                                onClick={() => {
                                    if (validateStep1()) setStep(2);
                                }}
                                accentColor="#dc0000"
                            >
                                <span>{t('supplier.register.step2')}</span>
                                <ArrowRight size={16} />
                            </AuthButton>
                        </div>
                    </div>
                )}

                {/* ── STEP 2: Distribution & Catalog ──────────────────────────── */}
                {step === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <div style={{ marginBottom: '4px' }}>
                            <h3 style={{
                                fontSize: '16px',
                                fontWeight: 800,
                                color: '#ffffff',
                                margin: '0 0 4px 0',
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                2. {t('supplier.register.step2')}
                            </h3>
                            <p style={{
                                fontSize: '13px',
                                color: '#a1a1aa',
                                margin: 0,
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                Configure las monedas, categorías de papel y capacidades de distribución logística.
                            </p>
                        </div>

                        {/* Currency Pills */}
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 700,
                                color: '#ffffff',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '8px',
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                {t('supplier.register.currencies')} *
                            </label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {CURRENCY_OPTIONS.map((c) => {
                                    const isSelected = currencies.includes(c);
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => toggleCurrency(c)}
                                            style={{
                                                flex: 1,
                                                padding: '10px 14px',
                                                background: isSelected ? 'rgba(220, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                                                border: `1px solid ${isSelected ? '#dc0000' : 'rgba(255, 255, 255, 0.12)'}`,
                                                color: isSelected ? '#ffffff' : '#a1a1aa',
                                                fontWeight: isSelected ? 800 : 500,
                                                fontSize: '14px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                fontFamily: "'Manrope', system-ui, sans-serif",
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <Coins size={15} style={{ color: isSelected ? '#dc0000' : '#71717a' }} />
                                            {c}
                                            {isSelected && <CheckCircle2 size={14} style={{ color: '#10b981' }} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Paper Categories Grid */}
                        <div>
                            <label style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 700,
                                color: '#ffffff',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                marginBottom: '8px',
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                {t('supplier.register.categories')} *
                            </label>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                gap: '10px'
                            }}>
                                {PAPER_CATEGORIES.map((cat) => {
                                    const isSelected = categories.includes(cat.id);
                                    return (
                                        <div
                                            key={cat.id}
                                            onClick={() => toggleCategory(cat.id)}
                                            style={{
                                                padding: '12px 14px',
                                                background: isSelected ? 'rgba(220, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                                                border: `1px solid ${isSelected ? '#dc0000' : 'rgba(255, 255, 255, 0.08)'}`,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: '10px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <div style={{
                                                width: '18px',
                                                height: '18px',
                                                marginTop: '2px',
                                                border: `1px solid ${isSelected ? '#dc0000' : 'rgba(255, 255, 255, 0.3)'}`,
                                                background: isSelected ? '#dc0000' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                {isSelected && <CheckCircle2 size={13} style={{ color: '#ffffff' }} />}
                                            </div>
                                            <div>
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: 700,
                                                    color: isSelected ? '#ffffff' : '#d4d4d8',
                                                    fontFamily: "'Manrope', system-ui, sans-serif"
                                                }}>
                                                    {cat.label}
                                                </div>
                                                <div style={{
                                                    fontSize: '11px',
                                                    color: '#71717a',
                                                    marginTop: '2px',
                                                    fontFamily: "'Manrope', system-ui, sans-serif"
                                                }}>
                                                    {cat.subtitle}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Delivery Coverage & Logistics Options */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: '14px'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#ffffff',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    fontFamily: "'Manrope', system-ui, sans-serif"
                                }}>
                                    {t('supplier.register.deliveryCoverage')}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: '14px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        pointerEvents: 'none',
                                        color: '#a1a1aa'
                                    }}>
                                        <Truck size={16} />
                                    </div>
                                    <select
                                        id="supplier-delivery-coverage"
                                        value={deliveryCoverage}
                                        onChange={(e) => setDeliveryCoverage(e.target.value)}
                                        style={{
                                            width: '100%',
                                            paddingLeft: '40px',
                                            paddingRight: '14px',
                                            paddingTop: '11px',
                                            paddingBottom: '11px',
                                            background: 'rgba(255, 255, 255, 0.04)',
                                            border: '1px solid rgba(255, 255, 255, 0.12)',
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            outline: 'none',
                                            fontFamily: "'Manrope', system-ui, sans-serif",
                                            boxSizing: 'border-box'
                                        }}
                                    >
                                        {COVERAGE_OPTIONS.map((cov) => (
                                            <option key={cov.id} value={cov.id} style={{ background: '#18181b', color: '#ffffff' }}>
                                                {cov.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <AuthInput
                                id="supplier-min-order"
                                label={t('supplier.register.minOrderValue')}
                                icon={Package}
                                type="number"
                                min="0"
                                step="50"
                                value={minOrderValue}
                                onChange={(e) => setMinOrderValue(e.target.value)}
                            />

                            <AuthInput
                                id="supplier-lead-time"
                                label={t('supplier.register.leadTimeDays')}
                                icon={Clock}
                                type="number"
                                min="1"
                                max="30"
                                value={leadTimeDays}
                                onChange={(e) => setLeadTimeDays(e.target.value)}
                            />
                        </div>

                        {/* Navigation Buttons */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                style={{
                                    flex: 1,
                                    padding: '12px 16px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.12)',
                                    color: '#d4d4d8',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    fontFamily: "'Manrope', system-ui, sans-serif"
                                }}
                            >
                                <ArrowLeft size={16} />
                                <span>Atrás: Empresa</span>
                            </button>

                            <div style={{ flex: 2 }}>
                                <AuthButton
                                    id="step2-next-button"
                                    type="button"
                                    onClick={() => {
                                        if (validateStep2()) setStep(3);
                                    }}
                                    accentColor="#dc0000"
                                >
                                    <span>{t('supplier.register.step3')}</span>
                                    <ArrowRight size={16} />
                                </AuthButton>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STEP 3: Credentials & Terms ─────────────────────────────── */}
                {step === 3 && (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ marginBottom: '4px' }}>
                            <h3 style={{
                                fontSize: '16px',
                                fontWeight: 800,
                                color: '#ffffff',
                                margin: '0 0 4px 0',
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                3. {t('supplier.register.step3')}
                            </h3>
                            <p style={{
                                fontSize: '13px',
                                color: '#a1a1aa',
                                margin: 0,
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                Configure las credenciales del usuario Administrador del Proveedor y confirme la adhesión B2B.
                            </p>
                        </div>

                        <AuthInput
                            id="supplier-admin-email"
                            label={`${t('supplier.register.email')} *`}
                            icon={Mail}
                            type="email"
                            placeholder="pedidos@papelera-ejemplo.es"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            autoFocus
                            required
                        />

                        {/* Password with Strength Meter */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <AuthInput
                                id="supplier-admin-password"
                                label={`${t('supplier.register.password')} *`}
                                icon={Lock}
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                                rightSlot={
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa' }}
                                        tabIndex={-1}
                                        aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                }
                            />

                            {/* Password Strength Indicator */}
                            {password.length > 0 && (
                                <div style={{ marginTop: '4px' }}>
                                    <div style={{ display: 'flex', gap: '4px', height: '4px', marginBottom: '4px' }}>
                                        {[0, 1, 2, 3].map((lvl) => (
                                            <div
                                                key={lvl}
                                                style={{
                                                    flex: 1,
                                                    height: '100%',
                                                    borderRadius: '2px',
                                                    background: lvl <= passwordStrength.score - 1
                                                        ? passwordStrength.color
                                                        : 'rgba(255, 255, 255, 0.1)',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <div style={{
                                        fontSize: '11px',
                                        color: passwordStrength.color,
                                        fontWeight: 600,
                                        fontFamily: "'Manrope', system-ui, sans-serif"
                                    }}>
                                        Robustez: {passwordStrength.label} (mínimo 8 caracteres)
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <AuthInput
                            id="supplier-admin-confirm-password"
                            label={`${t('supplier.register.confirmPassword')} *`}
                            icon={Lock}
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="••••••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            rightSlot={
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {passwordsMatch && (
                                        <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa' }}
                                        tabIndex={-1}
                                        aria-label={showConfirmPassword ? 'Ocultar confirmación' : 'Ver confirmación'}
                                    >
                                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            }
                        />

                        {/* Commercial Terms & Governance Checkboxes */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            padding: '14px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '4px',
                            marginTop: '6px'
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: '#d4d4d8',
                                lineHeight: 1.5,
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                <input
                                    id="supplier-terms-accepted"
                                    type="checkbox"
                                    checked={termsAccepted}
                                    onChange={(e) => setTermsAccepted(e.target.checked)}
                                    style={{
                                        accentColor: '#dc0000',
                                        marginTop: '3px',
                                        width: '16px',
                                        height: '16px'
                                    }}
                                    required
                                />
                                <span>{t('supplier.register.terms')}</span>
                            </label>

                            <label style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: '#d4d4d8',
                                lineHeight: 1.5,
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                <input
                                    id="supplier-authority-confirmed"
                                    type="checkbox"
                                    checked={authorityConfirmed}
                                    onChange={(e) => setAuthorityConfirmed(e.target.checked)}
                                    style={{
                                        accentColor: '#dc0000',
                                        marginTop: '3px',
                                        width: '16px',
                                        height: '16px'
                                    }}
                                    required
                                />
                                <span>{t('supplier.register.authority')}</span>
                            </label>
                        </div>

                        {/* Navigation & Submit Buttons */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                style={{
                                    flex: 1,
                                    padding: '12px 16px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.12)',
                                    color: '#d4d4d8',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    fontFamily: "'Manrope', system-ui, sans-serif"
                                }}
                            >
                                <ArrowLeft size={16} />
                                <span>Atrás: Catálogo</span>
                            </button>

                            <div style={{ flex: 2 }}>
                                <AuthButton
                                    id="supplier-submit-registration"
                                    type="submit"
                                    loading={loading}
                                    disabled={loading || !termsAccepted || !authorityConfirmed || !passwordsMatch}
                                    accentColor="#dc0000"
                                >
                                    <span>
                                        {loading
                                            ? t('supplier.register.submitting')
                                            : t('supplier.register.submit')}
                                    </span>
                                    {!loading && <ArrowRight size={16} />}
                                </AuthButton>
                            </div>
                        </div>
                    </form>
                )}

                {/* ── STEP 4: Success View ────────────────────────────────────── */}
                {step === 4 && (
                    <div style={{
                        textAlign: 'center',
                        padding: '16px 0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '16px'
                    }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '2px solid rgba(16, 185, 129, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#10b981',
                            boxShadow: '0 0 24px rgba(16, 185, 129, 0.25)'
                        }}>
                            <CheckCircle2 size={36} />
                        </div>

                        <div>
                            <h2 style={{
                                fontSize: '20px',
                                fontWeight: 800,
                                color: '#ffffff',
                                margin: '0 0 8px 0',
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                {t('supplier.register.successTitle')}
                            </h2>
                            <p style={{
                                fontSize: '13px',
                                color: '#a1a1aa',
                                lineHeight: 1.6,
                                maxWidth: '500px',
                                margin: '0 auto',
                                fontFamily: "'Manrope', system-ui, sans-serif"
                            }}>
                                {t('supplier.register.successSubtitle')}
                            </p>
                        </div>

                        {/* Summary Details Card */}
                        {registeredData && (
                            <div style={{
                                width: '100%',
                                padding: '16px 20px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '6px',
                                textAlign: 'left',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>Proveedor</span>
                                    <span style={{ fontSize: '13px', color: '#ffffff', fontWeight: 800 }}>{registeredData.supplier?.name}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>Administrador</span>
                                    <span style={{ fontSize: '13px', color: '#ffffff', fontWeight: 600 }}>{registeredData.user?.email}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', color: '#71717a', textTransform: 'uppercase', fontWeight: 700 }}>Rol Asignado</span>
                                    <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 800, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                        SUPPLIER_ADMIN (Activo)
                                    </span>
                                </div>
                            </div>
                        )}

                        <div style={{ width: '100%', marginTop: '8px' }}>
                            <AuthButton
                                id="go-to-supplier-dashboard"
                                type="button"
                                onClick={() => navigate('/supplier/dashboard', { replace: true })}
                                accentColor="#dc0000"
                            >
                                <span>{t('supplier.register.goToDashboard')}</span>
                                <ArrowRight size={16} />
                            </AuthButton>
                        </div>
                    </div>
                )}

                {/* ── Footer Cross-Links ─────────────────────────────────────── */}
                <div style={{
                    marginTop: '24px',
                    paddingTop: '16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <div style={{
                        fontSize: '12px',
                        color: '#71717a',
                        fontFamily: "'Manrope', system-ui, sans-serif"
                    }}>
                        {t('supplier.register.hasAccount')}{' '}
                        <Link
                            to="/login"
                            style={{
                                color: '#dc0000',
                                textDecoration: 'none',
                                fontWeight: 700
                            }}
                        >
                            {t('supplier.register.loginLink')}
                        </Link>
                    </div>

                    <div style={{
                        fontSize: '12px',
                        color: '#71717a',
                        fontFamily: "'Manrope', system-ui, sans-serif"
                    }}>
                        <Link
                            to="/printhouse/register"
                            style={{
                                color: '#a1a1aa',
                                textDecoration: 'none',
                                fontWeight: 600
                            }}
                        >
                            {t('supplier.register.printhouseLink')}
                        </Link>
                    </div>
                </div>
            </AuthShell>

            <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
        </>
    );
};
