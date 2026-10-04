import React, { useState, useEffect } from 'react';
import { 
    getTheme, 
    setTheme, 
    subscribeTheme,
    Theme, 
    getDensity, 
    setDensity, 
    subscribeDensity,
    Density, 
    getAnimations, 
    setAnimations,
    subscribeAnimations
} from '../../lib/themeStore';
import { useLocale, Locale } from '../../i18n';
import { 
    getUserRole, 
    getUserTenantId, 
    isSuperAdmin, 
    isPrinthouseUser, 
    getAuthUser,
    getAuthToken 
} from '../../lib/authStore';
import { adminFetch } from '../../lib/adminApi';
import {
    Cog6ToothIcon,
    GlobeAltIcon,
    BellIcon,
    ShieldCheckIcon,
    ServerIcon,
    PaintBrushIcon,
    CheckIcon,
    ArrowPathIcon,
    BuildingOffice2Icon,
    ClockIcon,
    ExclamationTriangleIcon,
    CommandLineIcon
} from "@heroicons/react/24/outline";

type Section = 'general' | 'notifications' | 'security' | 'integrations' | 'appearance';

const Toggle: React.FC<{ checked: boolean; onChange: () => void; id?: string }> = ({ checked, onChange, id }) => (
    <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-none transition-colors cursor-pointer ${
            checked ? 'bg-[#dc0000]' : 'bg-zinc-200 dark:bg-zinc-800'
        }`}
    >
        <span 
            className={`inline-block h-4 w-4 transform rounded-none bg-white shadow-none border border-transparent transition-transform ${
                checked ? 'translate-x-6' : 'translate-x-1'
            }`} 
        />
    </button>
);

export const GlobalSettingsPage: React.FC = () => {
    const { locale, setLocale, t } = useLocale();
    const [active, setActive] = useState<Section>('general');
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const currentUser = getAuthUser();
    const userRole = getUserRole();
    const tenantId = getUserTenantId() || 'tenant-demo-local';
    const isSuper = isSuperAdmin();
    const isPrinthouse = isPrinthouseUser();

    // ── Appearance State ─────────────────────────────────────────────────────
    const [theme, setThemeState] = useState<Theme>(getTheme());
    const [density, setDensityState] = useState<Density>(getDensity());
    const [animations, setAnimationsState] = useState<boolean>(getAnimations());

    // ── General State ────────────────────────────────────────────────────────
    const [timezone, setTimezone] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_timezone') || 'Europe/Madrid';
        } catch {
            return 'Europe/Madrid';
        }
    });
    const [companyName, setCompanyName] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_draft_company_name') || currentUser?.companyName || '';
        } catch {
            return currentUser?.companyName || '';
        }
    });
    const [taxId, setTaxId] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_draft_tax_id') || currentUser?.taxId || '';
        } catch {
            return currentUser?.taxId || '';
        }
    });
    const [country, setCountry] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_draft_country') || currentUser?.country || 'ES';
        } catch {
            return currentUser?.country || 'ES';
        }
    });
    const [address, setAddress] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_draft_address') || currentUser?.address || '';
        } catch {
            return currentUser?.address || '';
        }
    });
    const [region] = useState<string>('EU-WEST-1 (Primary Sovereign Cloud)');
    const [profileError, setProfileError] = useState<string | null>(null);
    const [notifError, setNotifError] = useState<string | null>(null);

    // ── Notifications State (Scoped by Role & Tenant) ────────────────────────
    const [notifEmail, setNotifEmail] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_notif_email') || currentUser?.email || '';
        } catch {
            return '';
        }
    });
    const [notifJobDispatch, setNotifJobDispatch] = useState<boolean>(true);
    const [notifPreflightFail, setNotifPreflightFail] = useState<boolean>(true);
    const [notifSlaWarning, setNotifSlaWarning] = useState<boolean>(true);
    // Superadmin-only alerts
    const [notifPlatformAnomalies, setNotifPlatformAnomalies] = useState<boolean>(false);
    const [notifDeployments, setNotifDeployments] = useState<boolean>(false);

    // ── Security State ───────────────────────────────────────────────────────
    const [sessionTimeout, setSessionTimeout] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_session_timeout_min') || '60';
        } catch {
            return '60';
        }
    });
    const [mfaModalOpen, setMfaModalOpen] = useState<boolean>(false);
    const [auditRecords, setAuditRecords] = useState<any[]>([]);
    const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

    // ── Integrations State ───────────────────────────────────────────────────
    const [webhookUrl, setWebhookUrl] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_webhook_url') || '';
        } catch {
            return '';
        }
    });
    const [webhookSecret] = useState<string>('••••••••••••••••••••••••••••••••');
    const [slackEnabled, setSlackEnabled] = useState<boolean>(false);
    const [slackWebhook, setSlackWebhook] = useState<string>('');
    const [testWebhookStatus, setTestWebhookStatus] = useState<string | null>(null);
    const [testingWebhook, setTestingWebhook] = useState<boolean>(false);

    // Navigation item definitions with translated labels
    const NAV: { id: Section; label: string; icon: React.ElementType }[] = [
        { id: 'general',       label: t('settings.nav.general'),       icon: Cog6ToothIcon },
        { id: 'notifications', label: t('settings.nav.notifications'), icon: BellIcon },
        { id: 'security',      label: t('settings.nav.security'),      icon: ShieldCheckIcon },
        { id: 'integrations',  label: t('settings.nav.integrations'),  icon: ServerIcon },
        { id: 'appearance',    label: t('settings.nav.appearance'),    icon: PaintBrushIcon },
    ];

    // Load initial tenant company profile, notification preferences, and audit log
    useEffect(() => {
        // Load company profile from backend if available
        adminFetch<any>('/api/printhouse/onboarding/company-profile')
            .then(res => {
                if (res && res.company) {
                    if (res.company.company_name) setCompanyName(res.company.company_name);
                    if (res.company.tax_id) setTaxId(res.company.tax_id);
                    if (res.company.country) setCountry(res.company.country);
                    if (res.company.address) setAddress(res.company.address);
                }
            })
            .catch(() => {});

        // Load tenant notification preferences from authorized endpoint
        adminFetch<any>(`/api/admin/tenants/${encodeURIComponent(tenantId)}/notification-preferences`)
            .then(res => {
                if (res && res.prefs) {
                    const p = res.prefs;
                    if (p.email_order_alerts !== undefined) setNotifJobDispatch(Boolean(p.email_order_alerts));
                    if (p.email_qc_alerts !== undefined) setNotifPreflightFail(Boolean(p.email_qc_alerts));
                    if (p.email_sla_alerts !== undefined) {
                        setNotifSlaWarning(Boolean(p.email_sla_alerts));
                    } else if (p.email_finance_alerts !== undefined) {
                        setNotifSlaWarning(Boolean(p.email_finance_alerts));
                    }
                    if (p.webhook_endpoint) setWebhookUrl(p.webhook_endpoint);
                    if (p.email_recipients_json) {
                        try {
                            const recs = typeof p.email_recipients_json === 'string' ? JSON.parse(p.email_recipients_json) : p.email_recipients_json;
                            if (Array.isArray(recs) && recs.length > 0) setNotifEmail(recs[0]);
                        } catch {}
                    }
                }
            })
            .catch(() => {});

        // Load audit log scoped strictly to tenant
        setLoadingAudit(true);
        const auditQuery = isSuper ? '/api/admin/audit?limit=6' : `/api/admin/audit?tenant=${encodeURIComponent(tenantId)}&limit=6`;
        adminFetch<any>(auditQuery)
            .then(res => {
                const list = res.data || res.events || res.audit || [];
                setAuditRecords(Array.isArray(list) ? list.slice(0, 6) : []);
            })
            .catch(() => setAuditRecords([]))
            .finally(() => setLoadingAudit(false));
    }, [tenantId, isSuper]);

    // Bi-directional subscription to theme, density, and animation stores
    useEffect(() => {
        const unsubTheme = subscribeTheme(t => setThemeState(t));
        const unsubDensity = subscribeDensity(d => setDensityState(d));
        const unsubAnim = subscribeAnimations(a => setAnimationsState(a));
        return () => {
            unsubTheme();
            unsubDensity();
            unsubAnim();
        };
    }, []);

    // Handle Theme Change
    const handleThemeChange = (newTheme: Theme) => {
        setTheme(newTheme);
    };

    // Handle Density Change
    const handleDensityChange = (newDensity: Density) => {
        setDensity(newDensity);
    };

    // Handle Animations Change
    const handleAnimationsChange = (enabled: boolean) => {
        setAnimations(enabled);
    };

    // Handle Language Change
    const handleLanguageChange = (newLoc: Locale) => {
        setLocale(newLoc);
    };

    // Handle Test Webhook (Honest notice when no live gateway is connected)
    const handleTestWebhook = () => {
        setTestingWebhook(true);
        setTestWebhookStatus(null);
        setTimeout(() => {
            setTestingWebhook(false);
            setTestWebhookStatus(t('settings.integrations.testPayloadUnavailable'));
        }, 500);
    };

    // Save All Settings
    const handleSave = async () => {
        setSaving(true);
        setStatusMessage(null);
        setProfileError(null);
        setNotifError(null);
        let tenantProfileFailed = false;
        let notifFailed = false;

        try {
            // 1. Persist personal preferences locally
            localStorage.setItem('ppos_timezone', timezone);
            localStorage.setItem('ppos_notif_email', notifEmail);
            localStorage.setItem('ppos_session_timeout_min', sessionTimeout);
            localStorage.setItem('ppos_webhook_url', webhookUrl);

            // 2. Persist notification preferences to authorized tenant endpoint
            try {
                const token = getAuthToken();
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json'
                };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const putRes = await fetch(`/api/admin/tenants/${encodeURIComponent(tenantId)}/notification-preferences`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        email_order_alerts: notifJobDispatch ? 1 : 0,
                        email_qc_alerts: notifPreflightFail ? 1 : 0,
                        email_sla_alerts: notifSlaWarning ? 1 : 0,
                        email_recipients_json: notifEmail ? [notifEmail] : [],
                        webhook_endpoint: webhookUrl || null
                    })
                });

                const putData = await putRes.json().catch(() => ({}));
                if (!putRes.ok || !putData.ok) {
                    notifFailed = true;
                    setNotifError(putData?.error || `HTTP ${putRes.status}: Failed to save notification preferences`);
                }
            } catch (err: any) {
                notifFailed = true;
                setNotifError(err?.message || 'Network error saving notification preferences');
            }

            // 3. Persist tenant company profile to backend endpoint
            try {
                const token = getAuthToken();
                const patchRes = await fetch('/api/printhouse/onboarding/company-profile', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        company_name: companyName,
                        tax_id: taxId,
                        country: country,
                        address: address
                    })
                });

                const patchData = await patchRes.json().catch(() => ({}));
                if (!patchRes.ok || !patchData.ok) {
                    tenantProfileFailed = true;
                    setProfileError(patchData?.error || `HTTP ${patchRes.status}: Server error updating tenant profile`);
                }
            } catch (err: any) {
                // Do NOT swallow backend failure: retain draft and mark failure
                tenantProfileFailed = true;
                setProfileError(err?.message || 'Server error updating tenant profile');
            }

            if (tenantProfileFailed && notifFailed) {
                setStatusMessage(t('settings.error'));
            } else if (tenantProfileFailed) {
                setStatusMessage(t('settings.savedLocalOnly'));
            } else if (notifFailed) {
                setStatusMessage(t('settings.savedProfileOnly'));
            } else {
                setSaved(true);
                setStatusMessage(t('settings.saved'));
                setTimeout(() => {
                    setSaved(false);
                    setStatusMessage(null);
                }, 3000);
            }
        } catch (e: any) {
            setStatusMessage(t('settings.error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {t('settings.title')}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                    {t('settings.subtitle')}
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 min-h-[560px]">
                {/* Sidebar */}
                <nav className="w-full md:w-56 shrink-0 space-y-1">
                    {NAV.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            id={`settings-tab-${id}`}
                            onClick={() => setActive(id)}
                            className={`settings-nav-btn w-full flex items-center gap-3 px-4 py-3 rounded-none text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                active === id
                                    ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-[#dc0000] border-l-2 border-[#dc0000]'
                                    : 'text-zinc-500 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-200 border-l-2 border-transparent'
                            }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span>{label}</span>
                        </button>
                    ))}

                    {/* Tenant & Role Badge */}
                    <div className="mt-8 p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-[10px]">
                        <p className="font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Active Tenant</p>
                        <p className="font-mono font-bold text-zinc-800 dark:text-zinc-200 truncate mt-0.5">{tenantId}</p>
                        <p className="font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-2">Effective Role</p>
                        <span className={`inline-block mt-0.5 px-1.5 py-0.5 font-bold uppercase tracking-wider ${
                            isSuper ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                        }`}>
                            {userRole}
                        </span>
                    </div>
                </nav>

                {/* Panel */}
                <div className="settings-panel flex-1 bg-white dark:bg-zinc-950 rounded-none border border-zinc-200 dark:border-zinc-800 p-8 space-y-6">

                    {/* ── GENERAL ────────────────────────────────────────── */}
                    {active === 'general' && (
                        <>
                            <SectionHeader 
                                icon={GlobeAltIcon} 
                                title={t('settings.general.title')} 
                                description={t('settings.general.desc')} 
                            />

                            {/* Personal & Regional Preferences */}
                            <div className="space-y-4 pt-2">
                                <h3 className="text-xs font-black uppercase tracking-widest text-[#dc0000]">
                                    {t('settings.general.personalSection')}
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label={t('settings.general.language')}>
                                        <select 
                                            id="settings-select-lang"
                                            value={locale} 
                                            onChange={e => handleLanguageChange(e.target.value as Locale)} 
                                            className={inputCls}
                                        >
                                            <option value="en">English (EN)</option>
                                            <option value="es">Español (ES)</option>
                                            <option value="de">Deutsch (DE)</option>
                                        </select>
                                    </Field>

                                    <Field label={t('settings.general.timezone')}>
                                        <select 
                                            id="settings-select-timezone"
                                            value={timezone} 
                                            onChange={e => setTimezone(e.target.value)} 
                                            className={inputCls}
                                        >
                                            <option value="Europe/Madrid">Europe/Madrid (CET/CEST)</option>
                                            <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
                                            <option value="Europe/London">Europe/London (GMT/BST)</option>
                                            <option value="UTC">UTC (Universal Coordinated Time)</option>
                                            <option value="America/New_York">America/New_York (EST/EDT)</option>
                                        </select>
                                    </Field>
                                </div>

                                <Field label={t('settings.general.region')}>
                                    <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span>{region}</span>
                                        <span className="ml-auto text-[10px] uppercase font-bold text-zinc-400">
                                            {t('settings.general.regionNotice')}
                                        </span>
                                    </div>
                                </Field>
                            </div>

                            {/* Tenant Organization Profile */}
                            <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                                <h3 className="text-xs font-black uppercase tracking-widest text-[#dc0000]">
                                    {t('settings.general.tenantSection')}
                                </h3>

                                {profileError && (
                                    <div className="p-3 bg-amber-500/10 border-l-2 border-amber-500 text-xs text-amber-700 dark:text-amber-400 font-medium">
                                        <p><strong>{t('settings.savedLocalOnly')}</strong></p>
                                        <p className="mt-1 text-[11px] font-mono">{profileError}</p>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label={t('settings.general.companyName')}>
                                        <input 
                                            id="settings-input-company"
                                            value={companyName} 
                                            onChange={e => {
                                                const v = e.target.value;
                                                setCompanyName(v);
                                                try { localStorage.setItem('ppos_draft_company_name', v); } catch {}
                                            }} 
                                            placeholder="Enter registered legal company name"
                                            className={inputCls} 
                                            disabled={!isPrinthouse && !isSuper}
                                        />
                                    </Field>
                                    <Field label={t('settings.general.taxId')}>
                                        <input 
                                            id="settings-input-taxid"
                                            value={taxId} 
                                            onChange={e => {
                                                const v = e.target.value;
                                                setTaxId(v);
                                                try { localStorage.setItem('ppos_draft_tax_id', v); } catch {}
                                            }} 
                                            placeholder="e.g. DE123456789 / B12345678"
                                            className={inputCls} 
                                            disabled={!isPrinthouse && !isSuper}
                                        />
                                    </Field>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label={t('settings.general.country')}>
                                        <select 
                                            id="settings-select-country"
                                            value={country} 
                                            onChange={e => {
                                                const v = e.target.value;
                                                setCountry(v);
                                                try { localStorage.setItem('ppos_draft_country', v); } catch {}
                                            }} 
                                            className={inputCls}
                                        >
                                            <option value="ES">Spain (ES)</option>
                                            <option value="DE">Germany (DE)</option>
                                            <option value="FR">France (FR)</option>
                                            <option value="IT">Italy (IT)</option>
                                            <option value="PT">Portugal (PT)</option>
                                            <option value="NL">Netherlands (NL)</option>
                                        </select>
                                    </Field>
                                    <Field label={t('settings.general.currency')}>
                                        <input 
                                            value="EUR (€) — Euro" 
                                            disabled 
                                            className={`${inputCls} opacity-75 cursor-not-allowed`} 
                                        />
                                    </Field>
                                </div>

                                <Field label={t('settings.general.address')}>
                                    <input 
                                        id="settings-input-address"
                                        value={address} 
                                        onChange={e => {
                                            const v = e.target.value;
                                            setAddress(v);
                                            try { localStorage.setItem('ppos_draft_address', v); } catch {}
                                        }} 
                                        placeholder="Plant / headquarters street address"
                                        className={inputCls} 
                                    />
                                </Field>
                            </div>
                        </>
                    )}

                    {/* ── NOTIFICATIONS ──────────────────────────────────── */}
                    {active === 'notifications' && (
                        <>
                            <SectionHeader 
                                icon={BellIcon} 
                                title={t('settings.notifications.title')} 
                                description={t('settings.notifications.desc')} 
                            />

                            {/* Role Scope Notice */}
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border-l-2 border-[#dc0000] text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                {isSuper ? t('settings.notifications.roleNoticeSuperadmin') : t('settings.notifications.roleNoticePrinthouse')}
                            </div>

                            {notifError && (
                                <div id="settings-notif-error-banner" className="p-3 bg-red-500/10 border-l-2 border-red-500 text-xs text-red-600 dark:text-red-400 font-medium">
                                    <p><strong>{t('settings.notifications.saveFailed')}</strong></p>
                                    <p className="mt-1 text-[11px] font-mono">{notifError}</p>
                                </div>
                            )}

                            <Field label={t('settings.notifications.email')}>
                                <input 
                                    id="settings-notif-email"
                                    value={notifEmail} 
                                    onChange={e => setNotifEmail(e.target.value)} 
                                    placeholder="operations@yourprinthouse.com"
                                    className={inputCls} 
                                    type="email" 
                                />
                            </Field>

                            {/* Printhouse Operational Event Subscriptions */}
                            <div className="space-y-1 divide-y divide-zinc-100 dark:divide-zinc-900">
                                <ToggleRow 
                                    id="notif-event-dispatch"
                                    label={t('settings.notifications.eventJobDispatch')} 
                                    desc={t('settings.notifications.eventJobDispatchDesc')} 
                                    checked={notifJobDispatch} 
                                    onChange={() => setNotifJobDispatch(v => !v)} 
                                />
                                <ToggleRow 
                                    id="notif-event-preflight"
                                    label={t('settings.notifications.eventPreflightFail')} 
                                    desc={t('settings.notifications.eventPreflightFailDesc')} 
                                    checked={notifPreflightFail} 
                                    onChange={() => setNotifPreflightFail(v => !v)} 
                                />
                                <ToggleRow 
                                    id="notif-event-sla"
                                    label={t('settings.notifications.eventSlaWarning')} 
                                    desc={t('settings.notifications.eventSlaWarningDesc')} 
                                    checked={notifSlaWarning} 
                                    onChange={() => setNotifSlaWarning(v => !v)} 
                                />

                                {/* Superadmin Only System Alerts */}
                                {isSuper && (
                                    <>
                                        <ToggleRow 
                                            id="notif-event-anomalies"
                                            label={t('settings.notifications.eventPlatformAnomalies')} 
                                            desc={t('settings.notifications.eventPlatformAnomaliesDesc')} 
                                            checked={notifPlatformAnomalies} 
                                            onChange={() => setNotifPlatformAnomalies(v => !v)} 
                                        />
                                        <ToggleRow 
                                            id="notif-event-deployments"
                                            label={t('settings.notifications.eventDeployments')} 
                                            desc={t('settings.notifications.eventDeploymentsDesc')} 
                                            checked={notifDeployments} 
                                            onChange={() => setNotifDeployments(v => !v)} 
                                        />
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── SECURITY ───────────────────────────────────────── */}
                    {active === 'security' && (
                        <>
                            <SectionHeader 
                                icon={ShieldCheckIcon} 
                                title={t('settings.security.title')} 
                                description={t('settings.security.desc')} 
                            />

                            <Field label={t('settings.security.sessionTimeout')}>
                                <div className="space-y-1">
                                    <input 
                                        id="settings-session-timeout"
                                        value={sessionTimeout} 
                                        onChange={e => setSessionTimeout(e.target.value)} 
                                        className={inputCls} 
                                        type="number" 
                                        min={10} 
                                        max={480} 
                                    />
                                    <p className="text-[11px] text-zinc-500 font-medium">
                                        {t('settings.security.sessionTimeoutDesc')}
                                    </p>
                                </div>
                            </Field>

                            {/* Honest MFA Section (Not Available / Integration Pending) */}
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                            {t('settings.security.mfa')}
                                        </p>
                                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                            {t('settings.security.mfaStatusPending')}
                                        </p>
                                    </div>
                                    <button
                                        id="settings-mfa-enroll-btn"
                                        type="button"
                                        onClick={() => setMfaModalOpen(true)}
                                        className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-xs font-bold rounded-none hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                    >
                                        {t('settings.security.mfaDetailsBtn')}
                                    </button>
                                </div>
                            </div>

                            {/* Real Audit Trail Preview */}
                            <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-widest text-[#dc0000]">
                                            {t('settings.security.auditLog')}
                                        </p>
                                        <p className="text-xs text-zinc-500 font-medium">
                                            {t('settings.security.auditLogDesc')}
                                        </p>
                                    </div>
                                    <a
                                        href="/forensics"
                                        className="text-xs font-bold text-[#dc0000] hover:underline"
                                    >
                                        {t('settings.security.openForensics')}
                                    </a>
                                </div>

                                <div className="border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {loadingAudit ? (
                                        <div className="p-4 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                                            <ArrowPathIcon className="w-4 h-4 animate-spin text-[#dc0000]" />
                                            <span>{t('settings.security.loadingAudit')}</span>
                                        </div>
                                    ) : auditRecords.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-zinc-500">
                                            {t('settings.security.auditEmpty')}
                                        </div>
                                    ) : (
                                        auditRecords.map((log: any, idx: number) => (
                                            <div key={log.id || idx} className="p-3 text-xs flex items-center justify-between font-mono">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-1 py-0.5 text-[9px] font-bold ${
                                                        log.severity === 'ERROR' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                                                    }`}>
                                                        {log.event_type || 'AUDIT'}
                                                    </span>
                                                    <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-xs">
                                                        {log.message || log.entity_type}
                                                    </span>
                                                </div>
                                                <span className="text-zinc-400 text-[10px]">
                                                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : 'Recent'}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── INTEGRATIONS ───────────────────────────────────── */}
                    {active === 'integrations' && (
                        <>
                            <SectionHeader 
                                icon={ServerIcon} 
                                title={t('settings.integrations.title')} 
                                description={t('settings.integrations.desc')} 
                            />

                            {/* Outbound Webhook */}
                            <Field label={t('settings.integrations.webhookUrl')}>
                                <div className="space-y-2">
                                    <input 
                                        id="settings-webhook-url"
                                        value={webhookUrl} 
                                        onChange={e => setWebhookUrl(e.target.value)} 
                                        placeholder="https://mfg.yourprinthouse.com/api/ppos/dispatch" 
                                        className={inputCls} 
                                    />
                                    <div className="flex items-center gap-3">
                                        <button
                                            id="settings-webhook-test-btn"
                                            type="button"
                                            onClick={handleTestWebhook}
                                            disabled={testingWebhook}
                                            className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                                        >
                                            {testingWebhook ? 'Delivering...' : t('settings.integrations.testWebhookBtn')}
                                        </button>
                                        {testWebhookStatus && (
                                            <span className="text-xs font-medium text-amber-500 flex items-center gap-1">
                                                <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                                {testWebhookStatus}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </Field>

                            <Field label={t('settings.integrations.webhookSecret')}>
                                <div className="space-y-1">
                                    <input 
                                        value={webhookSecret} 
                                        readOnly 
                                        className={`${inputCls} font-mono text-xs opacity-80 cursor-not-allowed`} 
                                    />
                                    <p className="text-[11px] text-zinc-500 font-medium">
                                        {t('settings.integrations.webhookSecretHint')}
                                    </p>
                                </div>
                            </Field>

                            {/* Slack Channel Alerts */}
                            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                                <ToggleRow 
                                    id="settings-slack-toggle"
                                    label={t('settings.integrations.slackToggle')} 
                                    desc={t('settings.integrations.slackDesc')} 
                                    checked={slackEnabled} 
                                    onChange={() => setSlackEnabled(v => !v)} 
                                />
                                {slackEnabled && (
                                    <div className="space-y-2">
                                        <div className="p-2.5 bg-amber-500/10 border-l-2 border-amber-500 text-xs text-amber-600 dark:text-amber-400 font-medium">
                                            {t('settings.integrations.slackPendingNotice')}
                                        </div>
                                        <Field label={t('settings.integrations.slackWebhook')}>
                                            <input 
                                                id="settings-slack-url"
                                                value={slackWebhook}
                                                onChange={e => setSlackWebhook(e.target.value)}
                                                placeholder="https://hooks.slack.com/services/T00/B00/XXXX" 
                                                className={inputCls} 
                                            />
                                        </Field>
                                    </div>
                                )}
                            </div>

                            {/* Shopfloor Connectors Catalog */}
                            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                                <h3 className="text-xs font-black uppercase tracking-widest text-[#dc0000]">
                                    {t('settings.integrations.connectorsTitle')}
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {[
                                        { name: 'JDF / JMF Factory Bridge', type: 'JDF', status: t('settings.integrations.statusActive'), badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
                                        { name: 'Prinect / Heidelberg Connector', type: 'MIS', status: t('settings.integrations.statusActive'), badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
                                        { name: 'HP Indigo Production Pro', type: 'DFE', status: t('settings.integrations.statusActive'), badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
                                        { name: 'SAP ERP / RFC Gateway', type: 'ERP', status: t('settings.integrations.statusRoadmap'), badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
                                    ].map((c, i) => (
                                        <div key={i} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{c.name}</p>
                                                <p className="text-[10px] font-mono text-zinc-400 mt-0.5">Type: {c.type}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${c.badge}`}>
                                                {c.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── APPEARANCE ─────────────────────────────────────── */}
                    {active === 'appearance' && (
                        <>
                            <SectionHeader 
                                icon={PaintBrushIcon} 
                                title={t('settings.appearance.title')} 
                                description={t('settings.appearance.desc')} 
                            />

                            {/* Color Scheme: Industrial Dark vs Corporate Light */}
                            <Field label={t('settings.appearance.theme')}>
                                <div className="grid grid-cols-2 gap-3 mt-1">
                                    <button
                                        id="settings-theme-dark-btn"
                                        type="button"
                                        title={t('settings.appearance.themeDarkTooltip') || 'Industrial Dark theme'}
                                        aria-label={t('settings.appearance.themeDarkTooltip') || 'Industrial Dark theme'}
                                        onClick={() => handleThemeChange('dark')}
                                        className={`py-4 px-4 text-xs font-bold uppercase tracking-widest border transition-all cursor-pointer flex flex-col items-center gap-2 ${
                                            theme === 'dark'
                                                ? 'bg-zinc-900 text-white border-[#dc0000] ring-1 ring-[#dc0000]'
                                                : 'bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                                        }`}
                                    >
                                        <span className="text-lg">🌙</span>
                                        <span>{t('settings.appearance.dark')}</span>
                                    </button>
                                    <button
                                        id="settings-theme-light-btn"
                                        type="button"
                                        title={t('settings.appearance.themeLightTooltip') || 'Corporate Light theme'}
                                        aria-label={t('settings.appearance.themeLightTooltip') || 'Corporate Light theme'}
                                        onClick={() => handleThemeChange('light')}
                                        className={`py-4 px-4 text-xs font-bold uppercase tracking-widest border transition-all cursor-pointer flex flex-col items-center gap-2 ${
                                            theme === 'light'
                                                ? 'bg-white text-zinc-900 border-[#dc0000] ring-1 ring-[#dc0000]'
                                                : 'bg-white/60 text-zinc-500 border-zinc-200 hover:border-zinc-300'
                                        }`}
                                    >
                                        <span className="text-lg">☀️</span>
                                        <span>{t('settings.appearance.light')}</span>
                                    </button>
                                </div>
                            </Field>

                            {/* UI Density */}
                            <Field label={t('settings.appearance.density')}>
                                <div className="space-y-2 mt-1">
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            id="settings-density-comfortable-btn"
                                            type="button"
                                            title={t('settings.appearance.densityComfortableTooltip') || 'Comfortable density'}
                                            aria-label={t('settings.appearance.densityComfortableTooltip') || 'Comfortable density'}
                                            onClick={() => handleDensityChange('comfortable')}
                                            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                                                density === 'comfortable'
                                                    ? 'bg-zinc-900 dark:bg-zinc-900 text-white dark:text-[#dc0000] border-[#dc0000]'
                                                    : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'
                                            }`}
                                        >
                                            {t('settings.appearance.comfortable')}
                                        </button>
                                        <button
                                            id="settings-density-compact-btn"
                                            type="button"
                                            title={t('settings.appearance.densityCompactTooltip') || 'Compact density'}
                                            aria-label={t('settings.appearance.densityCompactTooltip') || 'Compact density'}
                                            onClick={() => handleDensityChange('compact')}
                                            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                                                density === 'compact'
                                                    ? 'bg-zinc-900 dark:bg-zinc-900 text-white dark:text-[#dc0000] border-[#dc0000]'
                                                    : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'
                                            }`}
                                        >
                                            {t('settings.appearance.compact')}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-zinc-500 font-medium">
                                        {t('settings.appearance.densityDesc')}
                                    </p>
                                </div>
                            </Field>

                            {/* UI Animations with Reduced Motion fallback */}
                            <div className="pt-2">
                                <ToggleRow 
                                    id="settings-animations-toggle"
                                    title={t('settings.appearance.animationsTooltip')}
                                    label={t('settings.appearance.animations')} 
                                    desc={t('settings.appearance.animationsDesc')} 
                                    checked={animations} 
                                    onChange={() => handleAnimationsChange(!animations)} 
                                />
                            </div>
                        </>
                    )}

                    {/* ── SAVE BAR ───────────────────────────────────────── */}
                    <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
                        <button
                            id="settings-save-btn"
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2.5 bg-zinc-900 dark:bg-[#dc0000] text-white text-xs font-bold uppercase tracking-widest rounded-none hover:bg-zinc-800 dark:hover:bg-red-600 transition-colors cursor-pointer flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                    <span>{t('settings.saving')}</span>
                                </>
                            ) : (
                                <span>{t('settings.save')}</span>
                            )}
                        </button>
                        {saved ? (
                            <span id="settings-status-success" className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                                <CheckIcon className="w-4 h-4" /> 
                                {statusMessage || t('settings.saved')}
                            </span>
                        ) : statusMessage ? (
                            <span id="settings-status-error" className="flex items-center gap-1.5 text-xs font-bold text-red-500">
                                <ExclamationTriangleIcon className="w-4 h-4" />
                                {statusMessage}
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Honest MFA Integration Architecture Modal */}
            {mfaModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 max-w-lg w-full space-y-4 shadow-xl">
                        <div className="flex items-center gap-3">
                            <ShieldCheckIcon className="w-6 h-6 text-[#dc0000]" />
                            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                                {t('settings.security.mfaModalTitle')}
                            </h3>
                        </div>
                        <div className="p-3 bg-amber-500/10 border-l-2 border-amber-500 text-xs text-amber-600 dark:text-amber-400 font-medium">
                            {t('settings.security.mfaModalStatus')}
                        </div>
                        <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                            <p>
                                <strong>{t('settings.security.mfaModalArchitecture')}</strong>
                            </p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>{t('settings.security.mfaModalWebAuthn')}</li>
                                <li>{t('settings.security.mfaModalTotp')}</li>
                                <li>{t('settings.security.mfaModalIsolation')}</li>
                            </ul>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                id="settings-mfa-close-btn"
                                type="button"
                                onClick={() => setMfaModalOpen(false)}
                                className="px-4 py-2 text-xs font-bold uppercase border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                                {t('settings.security.mfaCloseBtn')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Visual Components ───────────────────────────────────────────────────────

const inputCls = "settings-input w-full px-4 py-2.5 rounded-none bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-[#dc0000]";

const SectionHeader: React.FC<{ icon: React.ElementType; title: string; description: string }> = ({ icon: Icon, title, description }) => (
    <div className="flex items-center gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="p-2 rounded-none bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
            <Icon className="w-5 h-5 text-[#dc0000]" />
        </div>
        <div>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tight">{title}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{description}</p>
        </div>
    </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

const ToggleRow: React.FC<{ label: string; desc: string; checked: boolean; onChange: () => void; id?: string; title?: string }> = ({ label, desc, checked, onChange, id, title }) => (
    <div className="flex items-center justify-between py-3" title={title}>
        <div className="pr-4">
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{label}</p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">{desc}</p>
        </div>
        <Toggle id={id} checked={checked} onChange={onChange} />
    </div>
);
