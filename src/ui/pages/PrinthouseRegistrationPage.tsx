/**
 * src/ui/pages/PrinthouseRegistrationPage.tsx
 *
 * Auth Identity Suite — Printhouse Registration (Phase Auth v2).
 * Fused with Partner B2B Onboarding Flow.
 *
 * Visual Standard: Glassmorphic Cards inside AuthShell.
 */
import React, { useState, useCallback, useEffect, useRef, CSSProperties } from 'react';
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
    DocumentTextIcon,
    SparklesIcon,
    AdjustmentsHorizontalIcon,
    ScaleIcon,
    ChartBarIcon,
    CpuChipIcon,
    TrashIcon,
    PlusIcon,
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
        0: { label: 'Very weak',  color: '#ef4444' },
        1: { label: 'Weak',       color: '#f97316' },
        2: { label: 'Medium',     color: '#eab308' },
        3: { label: 'Strong',     color: '#22c55e' },
        4: { label: 'Very strong',color: '#10b981' },
    };
    return { score: clamped, ...map[clamped] };
}

const COUNTRIES = [
    { code: 'US', label: 'United States' },
    { code: 'ES', label: 'Spain' },
    { code: 'MX', label: 'Mexico' },
    { code: 'AR', label: 'Argentina' },
    { code: 'CO', label: 'Colombia' },
    { code: 'CL', label: 'Chile' },
    { code: 'PE', label: 'Peru' },
    { code: 'DE', label: 'Germany' },
    { code: 'FR', label: 'France' },
    { code: 'IT', label: 'Italy' },
    { code: 'PT', label: 'Portugal' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'OTHER', label: 'Other' },
];

const B2B_PRODUCTION_TYPES = [
    'Offset', 'Digital', 'Large Format', 'Packaging', 'Hardcover Binding', 'Softcover Binding', 'Spiral/Wire-O'
];

const B2B_CERTIFICATIONS = [
    'ISO 12647 (PSO)', 'FOGRA Cert', 'GRACoL / G7', 'ISO 9001', 'ISO 14001', 'BRC Packaging', 'FSC Certified', 'PEFC', 'SGP Partnership', 'EMAS'
];

const B2B_QA_MODULES = [
    { id: 'preflight', label: 'File Validation / Preflight Audit', desc: 'Pre-production verification of digital assets and trapping.' },
    { id: 'densitometry', label: 'On-press Densitometry', desc: 'Real-time monitoring of color density and registration.' },
    { id: 'sampling', label: 'In-process Random Sampling', desc: 'Periodic quality checks during high-volume production.' },
    { id: 'finishing', label: 'Post-press / Finishing Audit', desc: 'Verification of binding, cutting, and lamination tolerances.' },
    { id: 'traceability', label: 'Traceability / Batch Logging', desc: 'Detailed event logging for every production node state.' },
    { id: 'packaging', label: 'Final Packaging QC', desc: 'Automated weight and quantity audit before dispatch.' }
];

const B2B_INTEGRATIONS = [
    { title: 'Dashboard only', badge: 'MANUAL', desc: 'Manage jobs via the PrintPrice OS portal. Best for starting out.' },
    { title: 'API-ready', badge: 'INTEGRATED', desc: 'Connect your ERP/MIS (JDF/JMF) for direct order processing.' },
    { title: 'Fully automated routing', badge: 'ORCHESTRATED', desc: 'Zero manual touch. Files routed directly to your DFE.' }
];

interface MachineTemplate {
    id: string;
    manufacturer: string;
    model: string;
    machine_type: 'OFFSET' | 'DIGITAL' | 'OTHER';
    category: 'Offset' | 'Digital' | 'Large Format' | 'Finishing';
}

const COMMON_MACHINE_TEMPLATES: MachineTemplate[] = [
    // Offset
    { id: "tpl-1", manufacturer: "Heidelberg", model: "Speedmaster XL 106", machine_type: "OFFSET", category: "Offset" },
    { id: "tpl-2", manufacturer: "Heidelberg", model: "Speedmaster CX 102", machine_type: "OFFSET", category: "Offset" },
    { id: "tpl-3", manufacturer: "Komori", model: "Lithrone G40", machine_type: "OFFSET", category: "Offset" },
    // Digital
    { id: "tpl-7", manufacturer: "HP", model: "Indigo 100K Digital Press", machine_type: "DIGITAL", category: "Digital" },
    { id: "tpl-8", manufacturer: "HP", model: "Indigo 12000 Digital Press", machine_type: "DIGITAL", category: "Digital" },
    { id: "tpl-10", manufacturer: "Canon", model: "imagePRESS V1350", machine_type: "DIGITAL", category: "Digital" },
    // Large Format
    { id: "tpl-15", manufacturer: "Konica Minolta", model: "AccurioJet KM-1e", machine_type: "DIGITAL", category: "Large Format" },
    // Finishing
    { id: "tpl-17", manufacturer: "Müller Martini", model: "Alegro Perfect Binder", machine_type: "OTHER", category: "Finishing" },
    { id: "tpl-19", manufacturer: "Horizon", model: "StitchLiner Mark III", machine_type: "OTHER", category: "Finishing" },
    { id: "tpl-21", manufacturer: "Bobst", model: "Novacut 106 ER", machine_type: "OTHER", category: "Finishing" },
    { id: "tpl-22", manufacturer: "Polar", model: "Titan 115 Cutter", machine_type: "OTHER", category: "Finishing" }
];

// ─────────────────────────────────────────────────────────────────────────────
// Form state interface
// ─────────────────────────────────────────────────────────────────────────────

interface FormData {
    // Step 1: Legal
    termsAccepted: boolean;
    termsReviewed: boolean;
    // Step 2: Company
    companyName: string;
    contactName: string;
    country: string;
    city: string;
    phone: string;
    website: string;
    // Step 3: Admin Account
    email: string;
    password: string;
    confirmPassword: string;
    // B2B Stepper extra qualifications
    productionTypes: string[];
    maxSheetSize: string;
    presses: Array<{ templateId: string; quantity: number; name: string }>;
    typicalJobs: string;
    monthlyVolume: string;
    utilization: string;
    integrationLevel: string;
    standards: boolean;
    certifications: string[];
    qaModules: string[];
    qaCustomDetails: string;
}

function isDark() {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark');
}

// ─────────────────────────────────────────────────────────────────────────────
// PrinthouseRegistrationPage
// ─────────────────────────────────────────────────────────────────────────────

export const PrinthouseRegistrationPage: React.FC = () => {
    // Steps: 1: Legal Terms, 2: Company, 3: Capabilities, 4: Machinery & Capacity, 5: Compliance & QA, 6: Admin Credentials, 7: Success
    const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);
    const [formData, setFormData] = useState<FormData>({
        termsAccepted: false,
        termsReviewed: false,
        companyName: '',
        contactName: '',
        country: 'US',
        city: '',
        phone: '',
        website: '',
        email: '',
        password: '',
        confirmPassword: '',
        productionTypes: [],
        maxSheetSize: '',
        presses: [],
        typicalJobs: '',
        monthlyVolume: '',
        utilization: '',
        integrationLevel: '',
        standards: false,
        certifications: [],
        qaModules: [],
        qaCustomDetails: '',
    });
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});
    const [showPw, setShowPw]   = useState(false);
    const [showCpw, setShowCpw] = useState(false);
    const [loading, setLoading] = useState(false);

    // Step 4 selector state
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [machineQuantity, setMachineQuantity] = useState<number>(1);

    const termsContainerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { toasts, addToast, dismiss } = useAuthToast();
    const dark = isDark();

    const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData((p) => ({ ...p, [key]: val }));
        setFieldErrors((p) => ({ ...p, [key]: undefined }));
    };

    // AutoScroll terms validation
    const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        if (formData.termsReviewed) return;
        
        const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 20;
        if (isAtBottom) {
            setFormData(prev => ({ ...prev, termsReviewed: true }));
        }
    };

    // ── Validations per step ──────────────────────────────────────────────────
    const validateStep1 = (): boolean => {
        if (!formData.termsAccepted) {
            addToast('error', 'Terms Acceptance Required', 'You must read and accept the Partner Terms to proceed.');
            return false;
        }
        return true;
    };

    const validateStep2 = (): boolean => {
        const errs: Partial<Record<keyof FormData, string>> = {};
        if (!formData.companyName.trim()) errs.companyName = 'Company name is required';
        if (!formData.contactName.trim()) errs.contactName = 'Contact name is required';
        if (!formData.city.trim()) errs.city = 'City is required';
        if (formData.website && !/^https?:\/\//.test(formData.website.trim())) {
            errs.website = 'URL must start with http:// or https://';
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateStep3 = (): boolean => {
        const errs: Partial<Record<keyof FormData, string>> = {};
        if (formData.productionTypes.length === 0) {
            addToast('warning', 'Capabilities Selection', 'Please select at least one production node capability.');
            return false;
        }
        if (!formData.maxSheetSize.trim()) {
            errs.maxSheetSize = 'Max sheet size is required (e.g. 720 x 1020 mm)';
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateStep4 = (): boolean => {
        const errs: Partial<Record<keyof FormData, string>> = {};
        if (formData.presses.length === 0) {
            addToast('warning', 'Machines Required', 'Please add at least one machine template.');
            return false;
        }
        if (!formData.monthlyVolume) errs.monthlyVolume = 'Select monthly finished copies volume';
        if (!formData.utilization) {
            addToast('warning', 'Utilization Required', 'Please select system utilization level.');
            return false;
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validateStep5 = (): boolean => {
        if (!formData.integrationLevel) {
            addToast('warning', 'Integration Protocol', 'Please select an integration protocol.');
            return false;
        }
        return true;
    };

    const validateStep6 = (): boolean => {
        const errs: Partial<Record<keyof FormData, string>> = {};
        const cleanEmail = formData.email.trim().toLowerCase();
        if (!cleanEmail) errs.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errs.email = 'Invalid email format';
        if (!formData.password) errs.password = 'Password is required';
        else if (formData.password.length < 8) errs.password = 'Minimum 8 characters';
        else if (checkPasswordStrength(formData.password).score < 2) errs.password = 'Password is too weak';
        if (formData.password !== formData.confirmPassword) errs.confirmPassword = 'Passwords do not match';
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    // ── Navigation helpers ────────────────────────────────────────────────────
    const next = () => {
        if (step === 1 && validateStep1()) setStep(2);
        else if (step === 2 && validateStep2()) setStep(3);
        else if (step === 3 && validateStep3()) setStep(4);
        else if (step === 4 && validateStep4()) setStep(5);
        else if (step === 5 && validateStep5()) setStep(6);
    };

    const back = () => {
        setFieldErrors({});
        setStep(prev => Math.max(prev - 1, 1) as any);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateStep6()) return;

        setLoading(true);
        try {
            // Bundle B2B qualification responses inside a structured metadata object
            const payload = {
                companyName: formData.companyName.trim(),
                contactName: formData.contactName.trim(),
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                country: formData.country,
                city: formData.city.trim(),
                phone: formData.phone.trim() || undefined,
                website: formData.website.trim() || undefined,
                metadata: {
                    b2b_onboarding: true,
                    terms_accepted_at: new Date().toISOString(),
                    qualification: {
                        productionTypes: formData.productionTypes,
                        maxSheetSize: formData.maxSheetSize.trim(),
                        presses: formData.presses,
                        typicalJobs: formData.typicalJobs.trim(),
                        monthlyVolume: formData.monthlyVolume,
                        utilization: formData.utilization,
                        integrationLevel: formData.integrationLevel,
                        compliance_iso_standards: formData.standards,
                        certifications: formData.certifications,
                        qaModules: formData.qaModules,
                        qaCustomDetails: formData.qaCustomDetails.trim(),
                    }
                }
            };

            const response = await fetch('/api/auth/printhouse/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                addToast('error', 'Registration error', data?.error || `Error ${response.status}. Please try again.`);
                return;
            }
            if (!data.token || !data.user) {
                addToast('error', 'Unexpected response', 'The server did not return a valid session.');
                return;
            }

            setAuthToken(data.token);
            setAuthUser(data.user);
            setStep(7);

            // Redirect trial user to dashboard where the PaywallModal or SubscriptionGuard will prompt them if needed
            setTimeout(() => navigate('/dashboard', { replace: true }), 3000);
        } catch {
            addToast('error', 'Connection error', 'Cannot reach the server. Please check your internet connection.');
        } finally {
            setLoading(false);
        }
    }, [formData, navigate, addToast]);

    // Toggle array helpers
    const toggleProductionType = (type: string) => {
        setFormData(p => ({
            ...p,
            productionTypes: p.productionTypes.includes(type)
                ? p.productionTypes.filter(t => t !== type)
                : [...p.productionTypes, type]
        }));
    };

    const toggleCertification = (cert: string) => {
        setFormData(p => ({
            ...p,
            certifications: p.certifications.includes(cert)
                ? p.certifications.filter(c => c !== cert)
                : [...p.certifications, cert]
        }));
    };

    const toggleQaModule = (moduleId: string) => {
        setFormData(p => ({
            ...p,
            qaModules: p.qaModules.includes(moduleId)
                ? p.qaModules.filter(m => m !== moduleId)
                : [...p.qaModules, moduleId]
        }));
    };

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
        maxWidth: 720,
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
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: 800,
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
    if (step === 7) {
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
                                Onboarding Complete!
                            </h1>
                            <p style={{ margin: '0 0 4px', fontSize: '14px', color: dark ? '#71717a' : '#64748b' }}>
                                Your print house has been qualified and registered.
                            </p>
                            <p style={{ margin: 0, fontSize: '13px', color: dark ? '#52525b' : '#94a3b8' }}>
                                Activating node & redirecting to dashboard…
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
                                PrintPrice Partner Network
                            </h1>
                            <p style={{ margin: '3px 0 0', fontSize: '11px', fontWeight: 700, color: dark ? '#71717a' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                B2B Qualification Stepper
                            </p>
                        </div>
                    </div>

                    {/* Stepper Card */}
                    <div style={glassCard}>
                        {/* Step indicator */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '28px' }}>
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <React.Fragment key={i}>
                                    <div style={stepDot(i)}>{i}</div>
                                    {i < 6 && <div style={{ ...stepLine, background: step >= i + 1 ? '#dc0000' : dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)' }} />}
                                </React.Fragment>
                            ))}
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a' }}>
                                {step === 1 && 'Step 1: Partner Terms'}
                                {step === 2 && 'Step 2: Company Identity'}
                                {step === 3 && 'Step 3: Node Capabilities'}
                                {step === 4 && 'Step 4: Machinery & Volume'}
                                {step === 5 && 'Step 5: Integration Standard'}
                                {step === 6 && 'Step 6: Administrator Credentials'}
                            </h2>
                            <p style={{ margin: 0, fontSize: '13px', color: dark ? '#71717a' : '#64748b' }}>
                                {step === 1 && 'Review and accept the legal B2B operating terms.'}
                                {step === 2 && 'Basic identifiers of your facility.'}
                                {step === 3 && 'Machine output dimensions and capability nodes.'}
                                {step === 4 && 'Identify baseline machinery and monthly capacity.'}
                                {step === 5 && 'Select the automated routing integration depth.'}
                                {step === 6 && 'Establish the master administrative account.'}
                            </p>
                        </div>

                        {/* ── STEP 1: TERMS ────────────────────────────────────── */}
                        {step === 1 && (
                            <div>
                                <div 
                                    ref={termsContainerRef}
                                    onScroll={handleTermsScroll}
                                    style={{
                                        height: '240px',
                                        overflowY: 'auto',
                                        padding: '16px',
                                        background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                                        marginBottom: '20px',
                                        fontSize: '12px',
                                        lineHeight: '1.6',
                                        color: dark ? '#a1a1aa' : '#475569',
                                    }}
                                >
                                    <h4 style={{ color: dark ? '#f4f4f5' : '#0f172a', fontWeight: 800, marginBottom: '8px' }}>B2B Print Node Terms</h4>
                                    <p style={{ fontSize: '10px', opacity: 0.6 }}>Last updated: 2026-03-25</p>
                                    <p><strong>1. Scope:</strong> These Partner Terms govern the commercial relationship between Print Price Pro and B2B print houses joining the PrintPrice OS network.</p>
                                    <p><strong>2. Nature of the Relationship:</strong> PrintPrice Pro operates an orchestration system connecting validated demand with qualified partners. No joint venture or employment relationship is created.</p>
                                    <p><strong>3. Admission and Qualification:</strong> Admission is subject to technical verification of capabilities, equipment, quality control modules, and compliance registry.</p>
                                    <p><strong>4. Partner Obligations:</strong> Partners must maintain accurate capacity levels, execute jobs to spec, secure customer files, and avoid platform bypass.</p>
                                    <p><strong>5. Quality and SLA:</strong> Production must strictly conform to color, binding, and finishing specs. Defective jobs require remediation or reprints.</p>
                                    <p><strong>6. Non-Circumvention:</strong> Partners agree not to bypass PrintPrice Pro to transact directly with platform-sourced publishers.</p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '10px', 
                                        cursor: formData.termsReviewed ? 'pointer' : 'not-allowed',
                                        opacity: formData.termsReviewed ? 1 : 0.5
                                    }}>
                                        <input 
                                            type="checkbox" 
                                            disabled={!formData.termsReviewed}
                                            checked={formData.termsAccepted}
                                            onChange={(e) => setFormData(p => ({ ...p, termsAccepted: e.target.checked }))}
                                            style={{ width: '18px', height: '18px', accentColor: '#dc0000' }}
                                        />
                                        <span style={{ fontWeight: 700, fontSize: '13px', color: dark ? '#e2e8f0' : '#334155' }}>I accept the Partner Operating Terms</span>
                                    </label>
                                    <span style={{ fontSize: '11px', color: '#dc0000', display: !formData.termsReviewed ? 'block' : 'none' }}>
                                        * Please scroll to the bottom of the terms container to enable acceptance.
                                    </span>
                                </div>

                                <div style={{ marginTop: '24px' }}>
                                    <AuthButton id="reg-next-1" type="button" onClick={next} disabled={!formData.termsAccepted}>
                                        <span>Accept & Continue</span>
                                        <ArrowRightIcon style={{ width: 16, height: 16 }} />
                                    </AuthButton>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 2: COMPANY IDENTITY ─────────────────────────── */}
                        {step === 2 && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <AuthInput
                                        id="reg-company"
                                        label="Company Name *"
                                        type="text"
                                        placeholder="Garciaprint Ltd"
                                        value={formData.companyName}
                                        onChange={set('companyName')}
                                        icon={BuildingOfficeIcon as any}
                                        error={fieldErrors.companyName}
                                    />
                                </div>
                                <AuthInput
                                    id="reg-contact"
                                    label="Contact Name *"
                                    type="text"
                                    placeholder="John Garcia"
                                    value={formData.contactName}
                                    onChange={set('contactName')}
                                    icon={BuildingOfficeIcon as any}
                                    error={fieldErrors.contactName}
                                />
                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                        Country *
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
                                    label="City *"
                                    type="text"
                                    placeholder="London"
                                    value={formData.city}
                                    onChange={set('city')}
                                    icon={MapPinIcon as any}
                                    error={fieldErrors.city}
                                />
                                <AuthInput
                                    id="reg-phone"
                                    label="Phone (Optional)"
                                    type="tel"
                                    placeholder="+44 20 7946 0192"
                                    value={formData.phone}
                                    onChange={set('phone')}
                                    icon={PhoneIcon as any}
                                />
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <AuthInput
                                        id="reg-website"
                                        label="Website (Optional)"
                                        type="url"
                                        placeholder="https://garciaprint.com"
                                        value={formData.website}
                                        onChange={set('website')}
                                        icon={GlobeAltIcon as any}
                                        error={fieldErrors.website}
                                    />
                                </div>

                                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', marginTop: '12px' }}>
                                    <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                    <div style={{ flex: 1 }}>
                                        <AuthButton id="reg-next-2" type="button" onClick={next}>
                                            <span>Continue</span>
                                            <ArrowRightIcon style={{ width: 16, height: 16 }} />
                                        </AuthButton>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 3: CAPABILITIES ─────────────────────────────── */}
                        {step === 3 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                                        Production Capabilities (Select all that apply) *
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {B2B_PRODUCTION_TYPES.map(type => {
                                            const active = formData.productionTypes.includes(type);
                                            return (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => toggleProductionType(type)}
                                                    style={badgeBtnStyle(active, dark)}
                                                >
                                                    {type}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <AuthInput
                                    id="reg-maxsheet"
                                    label="Max Supported Sheet Size *"
                                    type="text"
                                    placeholder="e.g. 720 x 1020 mm"
                                    value={formData.maxSheetSize}
                                    onChange={set('maxSheetSize')}
                                    icon={AdjustmentsHorizontalIcon as any}
                                    error={fieldErrors.maxSheetSize}
                                />

                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                    <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                    <div style={{ flex: 1 }}>
                                        <AuthButton id="reg-next-3" type="button" onClick={next}>
                                            <span>Continue</span>
                                            <ArrowRightIcon style={{ width: 16, height: 16 }} />
                                        </AuthButton>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 4: MACHINERY & CAPACITY ─────────────────────── */}
                        {step === 4 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                        Primary Presses & Finishing Machinery *
                                    </label>
                                    
                                    {/* Selector Row */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                        <div style={{ flex: 1 }}>
                                            <select
                                                id="reg-presses-selector"
                                                value={selectedTemplateId}
                                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                                style={selectStyle(dark)}
                                            >
                                                <option value="">-- Select Machine Template --</option>
                                                <optgroup label="Offset Presses" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                    {COMMON_MACHINE_TEMPLATES.filter(t => t.category === 'Offset').map(t => (
                                                        <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="Digital Presses" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                    {COMMON_MACHINE_TEMPLATES.filter(t => t.category === 'Digital').map(t => (
                                                        <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="Large Format" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                    {COMMON_MACHINE_TEMPLATES.filter(t => t.category === 'Large Format').map(t => (
                                                        <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="Finishing Machinery" style={{ background: dark ? '#18181b' : '#fff' }}>
                                                    {COMMON_MACHINE_TEMPLATES.filter(t => t.category === 'Finishing').map(t => (
                                                        <option key={t.id} value={t.id}>{t.manufacturer} {t.model}</option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8' }}>QTY</span>
                                            <input
                                                type="number"
                                                min="1"
                                                max="50"
                                                value={machineQuantity}
                                                onChange={(e) => setMachineQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                                style={{ ...selectStyle(dark), width: '64px', textAlign: 'center', padding: '11px 8px' }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!selectedTemplateId) {
                                                    addToast('error', 'Selection Required', 'Please choose a template from the list.');
                                                    return;
                                                }
                                                const template = COMMON_MACHINE_TEMPLATES.find(t => t.id === selectedTemplateId);
                                                if (!template) return;
                                                
                                                // Check if already added
                                                const exists = formData.presses.some(p => p.templateId === selectedTemplateId);
                                                if (exists) {
                                                    addToast('warning', 'Already Added', `${template.manufacturer} ${template.model} is already added. Adjust quantity inside the list.`);
                                                    return;
                                                }
                                                
                                                setFormData(p => ({
                                                    ...p,
                                                    presses: [...p.presses, { templateId: template.id, quantity: machineQuantity, name: `${template.manufacturer} ${template.model}` }]
                                                }));
                                                setSelectedTemplateId('');
                                                setMachineQuantity(1);
                                            }}
                                            style={{
                                                padding: '11px 16px',
                                                background: '#dc0000',
                                                color: '#fff',
                                                border: 'none',
                                                fontWeight: 800,
                                                fontSize: '13px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                fontFamily: "'Manrope', system-ui, sans-serif",
                                            }}
                                        >
                                            <PlusIcon style={{ width: 16, height: 16 }} />
                                            Add
                                        </button>
                                    </div>

                                    {/* Selected Machines List */}
                                    {formData.presses.length > 0 ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '8px' }}>
                                            {formData.presses.map((item) => {
                                                const template = COMMON_MACHINE_TEMPLATES.find(t => t.id === item.templateId);
                                                return (
                                                    <div key={item.templateId} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '12px 16px',
                                                        background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                                        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                                        borderRadius: '4px',
                                                        backdropFilter: 'blur(8px)',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{
                                                                width: '32px',
                                                                height: '32px',
                                                                background: dark ? 'rgba(220,0,0,0.15)' : 'rgba(220,0,0,0.08)',
                                                                border: '1px solid rgba(220,0,0,0.2)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                borderRadius: '4px',
                                                            }}>
                                                                <CpuChipIcon style={{ width: 16, height: 16, color: '#dc0000' }} />
                                                            </div>
                                                            <div style={{ textAlign: 'left' }}>
                                                                <div style={{ fontSize: '13px', fontWeight: 800, color: dark ? '#f4f4f5' : '#0f172a' }}>
                                                                    {item.name}
                                                                </div>
                                                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#dc0000', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
                                                                    {template?.category || 'Machine'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ fontSize: '11px', fontWeight: 800, color: dark ? '#71717a' : '#94a3b8', textTransform: 'uppercase' }}>Qty:</span>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    max="50"
                                                                    value={item.quantity}
                                                                    onChange={(e) => {
                                                                        const val = Math.max(1, parseInt(e.target.value) || 1);
                                                                        setFormData(p => ({
                                                                            ...p,
                                                                            presses: p.presses.map(m => m.templateId === item.templateId ? { ...m, quantity: val } : m)
                                                                        }));
                                                                    }}
                                                                    style={{
                                                                        width: '50px',
                                                                        padding: '4px',
                                                                        fontSize: '12px',
                                                                        fontWeight: 700,
                                                                        textAlign: 'center',
                                                                        background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                                                        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                                                                        color: dark ? '#f4f4f5' : '#0f172a',
                                                                        outline: 'none',
                                                                    }}
                                                                />
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setFormData(p => ({
                                                                        ...p,
                                                                        presses: p.presses.filter(m => m.templateId !== item.templateId)
                                                                    }));
                                                                }}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    padding: '4px',
                                                                    color: dark ? '#a1a1aa' : '#64748b',
                                                                }}
                                                            >
                                                                <TrashIcon style={{ width: 16, height: 16 }} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p style={{ margin: '0 0 12px', fontSize: '12px', color: dark ? '#52525b' : '#94a3b8', fontStyle: 'italic', textAlign: 'left' }}>
                                            No machines added yet. Select a template and click "Add".
                                        </p>
                                    )}
                                    {fieldErrors.presses && <span style={{ fontSize: '11px', color: '#ef4444' }}>{fieldErrors.presses}</span>}
                                </div>

                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                        Monthly Production Volume *
                                    </label>
                                    <select
                                        id="reg-volume"
                                        value={formData.monthlyVolume}
                                        onChange={set('monthlyVolume')}
                                        style={selectStyle(dark)}
                                    >
                                        <option value="">Select volume range...</option>
                                        <option value="< 10k copies">&lt; 10,000 copies</option>
                                        <option value="10k – 50k copies">10,000 – 50,000 copies</option>
                                        <option value="50k – 200k copies">50,000 – 200,000 copies</option>
                                        <option value="200k+ copies">200,000+ copies</option>
                                    </select>
                                    {fieldErrors.monthlyVolume && <span style={{ fontSize: '11px', color: '#ef4444' }}>{fieldErrors.monthlyVolume}</span>}
                                </div>

                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '6px' }}>
                                        System Utilization *
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {['Low', 'Medium', 'High'].map(util => {
                                            const active = formData.utilization === util;
                                            return (
                                                <button
                                                    key={util}
                                                    type="button"
                                                    onClick={() => setFormData(p => ({ ...p, utilization: util }))}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        fontSize: '12px',
                                                        fontWeight: 700,
                                                        background: active ? '#dc0000' : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                                                        color: active ? '#fff' : (dark ? '#a1a1aa' : '#475569'),
                                                        border: `1px solid ${active ? '#dc0000' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)')}`,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {util}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                    <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                    <div style={{ flex: 1 }}>
                                        <AuthButton id="reg-next-4" type="button" onClick={next}>
                                            <span>Continue</span>
                                            <ArrowRightIcon style={{ width: 16, height: 16 }} />
                                        </AuthButton>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 5: COMPLIANCE & INTEGRATION ─────────────────── */}
                        {step === 5 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                                        Integration Standard *
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {B2B_INTEGRATIONS.map(opt => {
                                            const active = formData.integrationLevel === opt.title;
                                            return (
                                                <button
                                                    key={opt.title}
                                                    type="button"
                                                    onClick={() => setFormData(p => ({ ...p, integrationLevel: opt.title }))}
                                                    style={{
                                                        padding: '12px',
                                                        textAlign: 'left',
                                                        background: active ? (dark ? 'rgba(220,0,0,0.1)' : 'rgba(220,0,0,0.05)') : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                                                        border: `1px solid ${active ? '#dc0000' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)')}`,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 800, fontSize: '13px', color: dark ? '#f4f4f5' : '#0f172a' }}>{opt.title}</span>
                                                        <span style={{ fontSize: '9px', color: '#dc0000', fontWeight: 900 }}>{opt.badge}</span>
                                                    </div>
                                                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: dark ? '#71717a' : '#64748b' }}>{opt.desc}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '10px', 
                                        cursor: 'pointer',
                                    }}>
                                        <input 
                                            type="checkbox" 
                                            checked={formData.standards}
                                            onChange={(e) => setFormData(p => ({ ...p, standards: e.target.checked }))}
                                            style={{ width: '18px', height: '18px', accentColor: '#dc0000' }}
                                        />
                                        <span style={{ fontWeight: 700, fontSize: '12px', color: dark ? '#e2e8f0' : '#334155' }}>We follow ISO print standards and FOGRA/GRACoL certifications.</span>
                                    </label>
                                </div>

                                <div>
                                    <label style={{ fontSize: '10px', fontWeight: 800, color: dark ? '#52525b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '8px' }}>
                                        Certifications
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {B2B_CERTIFICATIONS.map(cert => {
                                            const active = formData.certifications.includes(cert);
                                            return (
                                                <button
                                                    key={cert}
                                                    type="button"
                                                    onClick={() => toggleCertification(cert)}
                                                    style={badgeBtnStyle(active, dark)}
                                                >
                                                    {cert}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                    <button type="button" onClick={back} style={backBtnStyle(dark)}>Back</button>
                                    <div style={{ flex: 1 }}>
                                        <AuthButton id="reg-next-5" type="button" onClick={next}>
                                            <span>Continue</span>
                                            <ArrowRightIcon style={{ width: 16, height: 16 }} />
                                        </AuthButton>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 6: ADMIN ACCOUNT ────────────────────────────── */}
                        {step === 6 && (
                            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <AuthInput
                                    id="reg-email"
                                    label="Administrator Email *"
                                    type="email"
                                    autoFocus
                                    autoComplete="email"
                                    placeholder="admin@garciaprint.com"
                                    value={formData.email}
                                    onChange={set('email')}
                                    icon={EnvelopeIcon as any}
                                    error={fieldErrors.email}
                                    disabled={loading}
                                />

                                <div>
                                    <AuthInput
                                        id="reg-password"
                                        label="Password *"
                                        type={showPw ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        placeholder="Minimum 8 characters"
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
                                                Strength: {strength.label}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <AuthInput
                                    id="reg-confirm-password"
                                    label="Confirm Password *"
                                    type={showCpw ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Confirm password"
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
                                        onClick={back}
                                        disabled={loading}
                                        style={backBtnStyle(dark)}
                                    >
                                        <ArrowLeftIcon style={{ width: 14, height: 14 }} />
                                        Back
                                    </button>
                                    <div style={{ flex: 1 }}>
                                        <AuthButton id="reg-submit" type="submit" loading={loading} disabled={loading}>
                                            <CheckCircleIcon style={{ width: 16, height: 16 }} />
                                            <span>Complete Registration</span>
                                        </AuthButton>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>

                    {/* Footer */}
                    <p style={{ textAlign: 'center', fontSize: '12px', color: dark ? '#3f3f46' : '#94a3b8', fontWeight: 600, margin: 0 }}>
                        Already have an account?{' '}
                        <Link to="/login" style={{ color: '#dc0000', textDecoration: 'none', fontWeight: 700 }}>
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>

            <AuthToastContainer toasts={toasts} onDismiss={dismiss} />
        </>
    );
};

// Styles helpers
const backBtnStyle = (dark: boolean): CSSProperties => ({
    flex: '0 0 auto', padding: '13px 16px',
    background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    color: dark ? '#a1a1aa' : '#64748b',
    fontSize: '13px', fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px',
    fontFamily: "'Manrope', system-ui, sans-serif",
});

const badgeBtnStyle = (active: boolean, dark: boolean): CSSProperties => ({
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 700,
    background: active ? 'rgba(220,0,0,0.15)' : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
    border: `1px solid ${active ? '#dc0000' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)')}`,
    color: active ? '#dc0000' : (dark ? '#a1a1aa' : '#475569'),
    cursor: 'pointer',
    transition: 'all 0.2s ease'
});

const textareaStyle = (dark: boolean): CSSProperties => ({
    width: '100%',
    padding: '12px',
    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
    color: dark ? '#f4f4f5' : '#0f172a',
    fontSize: '14px',
    fontWeight: 500,
    outline: 'none',
    fontFamily: "'Manrope', system-ui, sans-serif",
    minHeight: '80px',
    resize: 'vertical',
    boxSizing: 'border-box'
});

const selectStyle = (dark: boolean): CSSProperties => ({
    width: '100%',
    padding: '11px 14px',
    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
    color: dark ? '#f4f4f5' : '#0f172a',
    fontSize: '14px',
    fontWeight: 500,
    outline: 'none',
    fontFamily: "'Manrope', system-ui, sans-serif",
});
