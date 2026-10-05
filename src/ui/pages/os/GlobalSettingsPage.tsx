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
    CommandLineIcon,
    KeyIcon,
    DocumentDuplicateIcon,
    TrashIcon,
    ArrowUpTrayIcon
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
    const [mfaEnabled, setMfaEnabled] = useState<boolean>(false);
    const [mfaRecoveryRemaining, setMfaRecoveryRemaining] = useState<number | null>(null);
    const [mfaSetupModalOpen, setMfaSetupModalOpen] = useState<boolean>(false);
    const [mfaDisableModalOpen, setMfaDisableModalOpen] = useState<boolean>(false);
    const [mfaSetupData, setMfaSetupData] = useState<{ secret?: string; uri?: string; recoveryCodes?: string[] } | null>(null);
    const [mfaVerifyCode, setMfaVerifyCode] = useState<string>('');
    const [mfaDisablePassword, setMfaDisablePassword] = useState<string>('');
    const [mfaActionLoading, setMfaActionLoading] = useState<boolean>(false);
    const [mfaMessage, setMfaMessage] = useState<{ text: string; error?: boolean } | null>(null);
    const [copiedSecret, setCopiedSecret] = useState<boolean>(false);
    const [copiedCodes, setCopiedCodes] = useState<boolean>(false);

    // Active Sessions State
    const [sessionsList, setSessionsList] = useState<any[]>([]);
    const [loadingSessions, setLoadingSessions] = useState<boolean>(false);
    const [sessionActionMsg, setSessionActionMsg] = useState<string | null>(null);

    const [auditRecords, setAuditRecords] = useState<any[]>([]);
    const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

    // Helper: determine current session JTI
    const getCurrentSessionId = (): string | null => {
        if (currentUser?.sessionId) return currentUser.sessionId;
        const token = getAuthToken();
        if (!token || token.startsWith('dev_')) return null;
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                return payload.jti || null;
            }
        } catch {
            return null;
        }
        return null;
    };
    const currentSessionId = getCurrentSessionId();

    // ── Integrations State ───────────────────────────────────────────────────
    const [webhookUrl, setWebhookUrl] = useState<string>(() => {
        try {
            return localStorage.getItem('ppos_webhook_url') || '';
        } catch {
            return '';
        }
    });
    const [webhookSecret] = useState<string>('••••••••••••••••••••••••••••••••');
    const [webhookSubscriptions, setWebhookSubscriptions] = useState<any[]>([]);
    const [webhookDeliveries, setWebhookDeliveries] = useState<any[]>([]);
    const [loadingWebhooks, setLoadingWebhooks] = useState<boolean>(false);
    const [webhookActionMsg, setWebhookActionMsg] = useState<string | null>(null);
    const [testWebhookStatus, setTestWebhookStatus] = useState<string | null>(null);
    const [testingWebhook, setTestingWebhook] = useState<boolean>(false);

    // Slack Alerts State
    const [slackEnabled, setSlackEnabled] = useState<boolean>(false);
    const [slackWebhook, setSlackWebhook] = useState<string>('');
    const [slackChannel, setSlackChannel] = useState<string>('#factory-alerts');
    const [slackEvents, setSlackEvents] = useState<string[]>(['calibration_alert', 'qc_alert', 'sla_alert', 'order_alert']);
    const [testingSlack, setTestingSlack] = useState<boolean>(false);
    const [slackTestStatus, setSlackTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
    const [slackSaving, setSlackSaving] = useState<boolean>(false);
    const [slackSavedMsg, setSlackSavedMsg] = useState<string | null>(null);

    // Navigation item definitions with translated labels
    const NAV: { id: Section; label: string; icon: React.ElementType }[] = [
        { id: 'general',       label: t('settings.nav.general'),       icon: Cog6ToothIcon },
        { id: 'notifications', label: t('settings.nav.notifications'), icon: BellIcon },
        { id: 'security',      label: t('settings.nav.security'),      icon: ShieldCheckIcon },
        { id: 'integrations',  label: t('settings.nav.integrations'),  icon: ServerIcon },
        { id: 'appearance',    label: t('settings.nav.appearance'),    icon: PaintBrushIcon },
    ];

    // Loaders for Security & Integrations
    const loadMfaStatus = () => {
        adminFetch<any>('/api/auth/mfa/status')
            .then(res => {
                if (res && res.ok) {
                    setMfaEnabled(Boolean(res.mfa_enabled));
                    if (res.recovery_codes_remaining !== undefined) {
                        setMfaRecoveryRemaining(res.recovery_codes_remaining);
                    }
                }
            })
            .catch(() => {});
    };

    const loadSessions = () => {
        setLoadingSessions(true);
        adminFetch<any>('/api/auth/sessions')
            .then(res => {
                if (res && res.ok && Array.isArray(res.sessions)) {
                    setSessionsList(res.sessions);
                } else if (Array.isArray(res)) {
                    setSessionsList(res);
                }
            })
            .catch(() => setSessionsList([]))
            .finally(() => setLoadingSessions(false));
    };

    const loadWebhooks = () => {
        setLoadingWebhooks(true);
        Promise.all([
            adminFetch<any>('/api/admin/webhooks/subscriptions').catch(() => ({ ok: false, data: [] })),
            adminFetch<any>('/api/admin/webhooks/deliveries').catch(() => ({ ok: false, data: [] }))
        ]).then(([subsRes, delRes]) => {
            const subs = subsRes?.data || (Array.isArray(subsRes) ? subsRes : []);
            const dels = delRes?.data || (Array.isArray(delRes) ? delRes : []);
            setWebhookSubscriptions(subs);
            setWebhookDeliveries(dels);
            if (subs.length > 0 && !webhookUrl) {
                setWebhookUrl(subs[0].url);
            }
        }).finally(() => setLoadingWebhooks(false));
    };

    const loadSlack = () => {
        adminFetch<any>('/api/admin/notifications/slack')
            .then(res => {
                if (res && res.ok && res.data) {
                    const d = res.data;
                    setSlackEnabled(Boolean(d.enabled));
                    if (d.webhook_url) setSlackWebhook(d.webhook_url);
                    if (d.channel_name) setSlackChannel(d.channel_name);
                    if (Array.isArray(d.events)) setSlackEvents(d.events);
                }
            })
            .catch(() => {});
    };

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

        // Load initial MFA and Sessions
        loadMfaStatus();
        loadSessions();
        loadWebhooks();
        loadSlack();
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

    // ── MFA Handlers ─────────────────────────────────────────────────────────
    const handleStartMfaSetup = async () => {
        setMfaActionLoading(true);
        setMfaMessage(null);
        setCopiedSecret(false);
        setCopiedCodes(false);
        try {
            const res = await adminFetch<any>('/api/auth/mfa/setup', { method: 'POST' });
            if (res && (res.ok || res.secret)) {
                setMfaSetupData(res);
                setMfaSetupModalOpen(true);
            } else {
                setMfaMessage({ text: res?.error || 'Failed to initialize MFA setup', error: true });
            }
        } catch (e: any) {
            setMfaMessage({ text: e?.message || 'Error starting MFA setup', error: true });
        } finally {
            setMfaActionLoading(false);
        }
    };

    const handleConfirmMfaSetup = async () => {
        if (!mfaVerifyCode || mfaVerifyCode.trim().length < 6) return;
        setMfaActionLoading(true);
        setMfaMessage(null);
        try {
            const res = await adminFetch<any>('/api/auth/mfa/confirm', {
                method: 'POST',
                body: JSON.stringify({ code: mfaVerifyCode.trim() })
            });
            if (res && (res.ok || res.mfa_enabled)) {
                setMfaEnabled(true);
                setMfaSetupModalOpen(false);
                setMfaSetupData(null);
                setMfaVerifyCode('');
                setMfaMessage({ text: t('settings.security.mfaStatusActive') });
                loadMfaStatus();
            } else {
                setMfaMessage({ text: res?.error || 'Invalid verification code', error: true });
            }
        } catch (e: any) {
            setMfaMessage({ text: e?.message || 'Verification failed', error: true });
        } finally {
            setMfaActionLoading(false);
        }
    };

    const handleDisableMfa = async () => {
        if (!mfaDisablePassword) return;
        setMfaActionLoading(true);
        setMfaMessage(null);
        try {
            const res = await adminFetch<any>('/api/auth/mfa/disable', {
                method: 'POST',
                body: JSON.stringify({ password: mfaDisablePassword })
            });
            if (res && res.ok) {
                setMfaEnabled(false);
                setMfaDisableModalOpen(false);
                setMfaDisablePassword('');
                setMfaMessage({ text: t('settings.security.mfaStatusDisabled') });
                loadMfaStatus();
            } else {
                setMfaMessage({ text: res?.error || 'Failed to disable MFA', error: true });
            }
        } catch (e: any) {
            setMfaMessage({ text: e?.message || 'Error disabling MFA', error: true });
        } finally {
            setMfaActionLoading(false);
        }
    };

    // ── Sessions Handlers ────────────────────────────────────────────────────
    const handleRevokeSession = async (sessionId: string) => {
        try {
            const res = await adminFetch<any>('/api/auth/sessions/revoke', {
                method: 'POST',
                body: JSON.stringify({ sessionId })
            });
            if (res && res.ok) {
                setSessionActionMsg(t('settings.security.sessionRevokedSuccess'));
                loadSessions();
                setTimeout(() => setSessionActionMsg(null), 3500);
            } else {
                setSessionActionMsg(res?.error || 'Revocation failed');
            }
        } catch (e: any) {
            setSessionActionMsg(e?.message || 'Error revoking session');
        }
    };

    const handleRevokeAllOtherSessions = async () => {
        try {
            const res = await adminFetch<any>('/api/auth/sessions/revoke', {
                method: 'POST',
                body: JSON.stringify({ revokeAll: true })
            });
            if (res && res.ok) {
                setSessionActionMsg(t('settings.security.sessionRevokeAllSuccess'));
                loadSessions();
                setTimeout(() => setSessionActionMsg(null), 3500);
            } else {
                setSessionActionMsg(res?.error || 'Revoke all failed');
            }
        } catch (e: any) {
            setSessionActionMsg(e?.message || 'Error revoking all sessions');
        }
    };

    // ── Webhooks Handlers ────────────────────────────────────────────────────
    const handleCreateWebhookSubscription = async () => {
        if (!webhookUrl) return;
        try {
            const res = await adminFetch<any>('/api/admin/webhooks/subscriptions', {
                method: 'POST',
                body: JSON.stringify({
                    url: webhookUrl,
                    events: ['*']
                })
            });
            if (res && res.ok) {
                setWebhookActionMsg('Webhook subscription updated.');
                loadWebhooks();
                setTimeout(() => setWebhookActionMsg(null), 3000);
            } else {
                setWebhookActionMsg(res?.error || 'Failed to save subscription');
            }
        } catch (e: any) {
            setWebhookActionMsg(e?.message || 'Error saving subscription');
        }
    };

    const handleRotateSecret = async (subId: string) => {
        try {
            const res = await adminFetch<any>(`/api/admin/webhooks/subscriptions/${encodeURIComponent(subId)}/rotate-secret`, {
                method: 'POST'
            });
            if (res && res.ok) {
                setWebhookActionMsg(t('settings.integrations.rotateSecretSuccess'));
                loadWebhooks();
                setTimeout(() => setWebhookActionMsg(null), 3000);
            } else {
                setWebhookActionMsg(res?.error || 'Failed to rotate secret');
            }
        } catch (e: any) {
            setWebhookActionMsg(e?.message || 'Error rotating secret');
        }
    };

    const handleTestWebhook = async () => {
        setTestingWebhook(true);
        setTestWebhookStatus(null);
        try {
            const res = await adminFetch<any>('/api/admin/webhooks/test', { method: 'POST' });
            if (res && res.ok) {
                setTestWebhookStatus(t('settings.integrations.testPayloadSuccess'));
                loadWebhooks();
            } else {
                setTestWebhookStatus(res?.error || 'Failed to enqueue test webhook');
            }
        } catch (e: any) {
            setTestWebhookStatus(e?.message || 'Error testing webhook');
        } finally {
            setTestingWebhook(false);
        }
    };

    const handleResendDelivery = async (deliveryId: string) => {
        try {
            const res = await adminFetch<any>(`/api/admin/webhooks/deliveries/${encodeURIComponent(deliveryId)}/resend`, {
                method: 'POST'
            });
            if (res && res.ok) {
                setWebhookActionMsg('Webhook redelivery processed.');
                loadWebhooks();
                setTimeout(() => setWebhookActionMsg(null), 3000);
            } else {
                setWebhookActionMsg(res?.error || 'Failed to redeliver');
            }
        } catch (e: any) {
            setWebhookActionMsg(e?.message || 'Error redelivering webhook');
        }
    };

    // ── Slack Handlers ───────────────────────────────────────────────────────
    const handleSaveSlack = async () => {
        setSlackSaving(true);
        setSlackSavedMsg(null);
        try {
            const res = await adminFetch<any>('/api/admin/notifications/slack', {
                method: 'POST',
                body: JSON.stringify({
                    enabled: slackEnabled,
                    webhookUrl: slackWebhook.startsWith('https://hooks.slack.com/services/T***') ? undefined : slackWebhook,
                    channelName: slackChannel,
                    events: slackEvents
                })
            });
            if (res && res.ok) {
                setSlackSavedMsg(t('settings.integrations.slackSaved'));
                loadSlack();
                setTimeout(() => setSlackSavedMsg(null), 3000);
            } else {
                setSlackSavedMsg(res?.error || 'Failed to save Slack settings');
            }
        } catch (e: any) {
            setSlackSavedMsg(e?.message || 'Error saving Slack settings');
        } finally {
            setSlackSaving(false);
        }
    };

    const handleTestSlack = async () => {
        setTestingSlack(true);
        setSlackTestStatus(null);
        try {
            const res = await adminFetch<any>('/api/admin/notifications/slack/test', {
                method: 'POST'
            });
            if (res && res.ok && res.data?.ok) {
                setSlackTestStatus({ ok: true, message: `${t('settings.integrations.slackTestSuccess')} (${res.data.durationMs}ms)` });
            } else {
                const errMsg = res?.data?.error || res?.error || 'Slack webhook returned failure';
                setSlackTestStatus({ ok: false, message: errMsg });
            }
        } catch (e: any) {
            setSlackTestStatus({ ok: false, message: e?.message || 'Network error reaching Slack' });
        } finally {
            setTestingSlack(false);
        }
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

                            {/* Two-Factor Authentication (2FA / TOTP) Card */}
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                                {t('settings.security.mfa')}
                                            </p>
                                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${
                                                mfaEnabled 
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                                                    : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                            }`}>
                                                {mfaEnabled ? t('settings.security.mfaStatusActive') : t('settings.security.mfaStatusDisabled')}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-1">
                                            {mfaEnabled 
                                                ? (mfaRecoveryRemaining !== null 
                                                    ? `${mfaRecoveryRemaining} recovery codes remaining.` 
                                                    : 'RFC 6238 TOTP authenticator protection enabled.')
                                                : 'Protect your account with Google Authenticator, 1Password, or any RFC 6238 app.'}
                                        </p>
                                    </div>
                                    <div>
                                        {mfaEnabled ? (
                                            <button
                                                id="settings-mfa-disable-btn"
                                                type="button"
                                                onClick={() => { setMfaDisableModalOpen(true); setMfaMessage(null); }}
                                                className="px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/30 text-xs font-bold rounded-none hover:bg-red-500/20 transition-colors cursor-pointer"
                                            >
                                                {t('settings.security.mfaDisableBtn')}
                                            </button>
                                        ) : (
                                            <button
                                                id="settings-mfa-enroll-btn"
                                                type="button"
                                                onClick={handleStartMfaSetup}
                                                disabled={mfaActionLoading}
                                                className="px-3 py-1.5 bg-zinc-900 dark:bg-[#dc0000] text-white text-xs font-bold rounded-none hover:bg-zinc-800 dark:hover:bg-red-600 transition-colors cursor-pointer flex items-center gap-1.5"
                                            >
                                                {mfaActionLoading ? (
                                                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <KeyIcon className="w-3.5 h-3.5" />
                                                )}
                                                <span>{t('settings.security.mfaSetupBtn')}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {mfaMessage && (
                                    <div className={`p-2.5 text-xs font-medium border-l-2 ${
                                        mfaMessage.error 
                                            ? 'bg-red-500/10 border-red-500 text-red-500' 
                                            : 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                                    }`}>
                                        {mfaMessage.text}
                                    </div>
                                )}
                            </div>

                            {/* Active User Sessions Table */}
                            <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-widest text-[#dc0000]">
                                            {t('settings.security.sessionsTitle')}
                                        </p>
                                        <p className="text-xs text-zinc-500 font-medium">
                                            {t('settings.security.sessionsDesc')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            id="settings-sessions-refresh-btn"
                                            type="button"
                                            onClick={loadSessions}
                                            disabled={loadingSessions}
                                            className="p-1.5 text-zinc-400 hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 cursor-pointer"
                                            title="Refresh Sessions"
                                        >
                                            <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
                                        </button>
                                        <button
                                            id="settings-sessions-revoke-all-btn"
                                            type="button"
                                            onClick={handleRevokeAllOtherSessions}
                                            disabled={sessionsList.filter(s => s.status === 'ACTIVE').length <= 1}
                                            className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-xs font-bold rounded-none hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                        >
                                            {t('settings.security.sessionRevokeAll')}
                                        </button>
                                    </div>
                                </div>

                                {sessionActionMsg && (
                                    <div className="p-2.5 bg-zinc-100 dark:bg-zinc-900 border-l-2 border-[#dc0000] text-xs font-mono text-zinc-700 dark:text-zinc-300">
                                        {sessionActionMsg}
                                    </div>
                                )}

                                <div className="border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                                    <table className="w-full text-left text-xs font-mono">
                                        <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                                            <tr>
                                                <th className="p-3">Status</th>
                                                <th className="p-3">{t('settings.security.sessionIp')}</th>
                                                <th className="p-3">{t('settings.security.sessionAgent')}</th>
                                                <th className="p-3">{t('settings.security.sessionCreated')}</th>
                                                <th className="p-3">{t('settings.security.sessionLastActive')}</th>
                                                <th className="p-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                            {loadingSessions ? (
                                                <tr>
                                                    <td colSpan={6} className="p-4 text-center text-zinc-500">
                                                        <ArrowPathIcon className="w-4 h-4 animate-spin inline-block text-[#dc0000] mr-2" />
                                                        Loading active sessions...
                                                    </td>
                                                </tr>
                                            ) : sessionsList.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="p-4 text-center text-zinc-500">
                                                        No active sessions tracked.
                                                    </td>
                                                </tr>
                                            ) : (
                                                sessionsList.map((sess: any) => {
                                                    const isCurrent = currentSessionId && String(sess.id) === String(currentSessionId);
                                                    return (
                                                        <tr key={sess.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                                                            <td className="p-3">
                                                                {isCurrent ? (
                                                                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                                        {t('settings.security.sessionCurrent')}
                                                                    </span>
                                                                ) : sess.status === 'ACTIVE' ? (
                                                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                                        ACTIVE
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-zinc-500/20 text-zinc-400">
                                                                        REVOKED
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-zinc-800 dark:text-zinc-200">{sess.ip_address || '127.0.0.1'}</td>
                                                            <td className="p-3 text-zinc-500 dark:text-zinc-400 max-w-xs truncate" title={sess.user_agent}>
                                                                {sess.user_agent ? (sess.user_agent.length > 36 ? sess.user_agent.slice(0, 36) + '...' : sess.user_agent) : 'Browser Client'}
                                                            </td>
                                                            <td className="p-3 text-zinc-400 text-[11px]">
                                                                {sess.created_at ? new Date(sess.created_at).toLocaleString() : '—'}
                                                            </td>
                                                            <td className="p-3 text-zinc-400 text-[11px]">
                                                                {sess.last_active ? new Date(sess.last_active).toLocaleString() : 'Recent'}
                                                            </td>
                                                            <td className="p-3 text-right">
                                                                {!isCurrent && sess.status === 'ACTIVE' && (
                                                                    <button
                                                                        onClick={() => handleRevokeSession(sess.id)}
                                                                        className="px-2 py-1 text-[10px] font-bold uppercase text-red-500 hover:text-red-400 border border-red-500/30 hover:border-red-500 transition-colors cursor-pointer"
                                                                    >
                                                                        {t('settings.security.sessionRevoke')}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
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

                            {/* Outbound Signed Webhooks */}
                            <div className="space-y-4">
                                <Field label={t('settings.integrations.webhookUrl')}>
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <input 
                                                id="settings-webhook-url"
                                                value={webhookUrl} 
                                                onChange={e => setWebhookUrl(e.target.value)} 
                                                placeholder="https://mfg.yourprinthouse.com/api/ppos/dispatch" 
                                                className={inputCls} 
                                            />
                                            <button
                                                id="settings-webhook-save-sub-btn"
                                                type="button"
                                                onClick={handleCreateWebhookSubscription}
                                                className="px-4 py-2 bg-zinc-900 dark:bg-[#dc0000] text-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-red-600 shrink-0 cursor-pointer"
                                            >
                                                Save
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                id="settings-webhook-test-btn"
                                                type="button"
                                                onClick={handleTestWebhook}
                                                disabled={testingWebhook}
                                                className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer flex items-center gap-1.5"
                                            >
                                                {testingWebhook ? (
                                                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <CommandLineIcon className="w-3.5 h-3.5" />
                                                )}
                                                <span>{testingWebhook ? 'Enqueuing...' : t('settings.integrations.testWebhookBtn')}</span>
                                            </button>
                                            {testWebhookStatus && (
                                                <span className="text-xs font-medium text-emerald-500 flex items-center gap-1">
                                                    <CheckIcon className="w-3.5 h-3.5" />
                                                    {testWebhookStatus}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Field>

                                <Field label={t('settings.integrations.webhookSecret')}>
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <input 
                                                value={webhookSecret} 
                                                readOnly 
                                                className={`${inputCls} font-mono text-xs opacity-80 cursor-not-allowed`} 
                                            />
                                            {webhookSubscriptions.length > 0 && (
                                                <button
                                                    id="settings-webhook-rotate-btn"
                                                    type="button"
                                                    onClick={() => handleRotateSecret(webhookSubscriptions[0].id)}
                                                    className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 shrink-0 cursor-pointer"
                                                >
                                                    {t('settings.integrations.rotateSecretBtn')}
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-zinc-500 font-medium">
                                            {t('settings.integrations.webhookSecretHint')}
                                        </p>
                                    </div>
                                </Field>

                                {webhookActionMsg && (
                                    <div className="p-2.5 bg-zinc-100 dark:bg-zinc-900 border-l-2 border-[#dc0000] text-xs font-mono text-zinc-700 dark:text-zinc-300">
                                        {webhookActionMsg}
                                    </div>
                                )}

                                {/* Webhook Outbox Deliveries Table */}
                                <div className="space-y-2 pt-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-black uppercase tracking-widest text-[#dc0000]">
                                            {t('settings.integrations.recentDeliveriesTitle')}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={loadWebhooks}
                                            disabled={loadingWebhooks}
                                            className="p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                                            title="Refresh Deliveries"
                                        >
                                            <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingWebhooks ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>

                                    <div className="border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                                        <table className="w-full text-left text-xs font-mono">
                                            <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                                                <tr>
                                                    <th className="p-2.5">Event</th>
                                                    <th className="p-2.5">Target</th>
                                                    <th className="p-2.5">Status</th>
                                                    <th className="p-2.5">Code</th>
                                                    <th className="p-2.5">Time</th>
                                                    <th className="p-2.5 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                                {loadingWebhooks ? (
                                                    <tr>
                                                        <td colSpan={6} className="p-3 text-center text-zinc-500">Loading deliveries...</td>
                                                    </tr>
                                                ) : webhookDeliveries.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="p-3 text-center text-zinc-500">No webhook deliveries recorded.</td>
                                                    </tr>
                                                ) : (
                                                    webhookDeliveries.slice(0, 5).map((del: any) => (
                                                        <tr key={del.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                                                            <td className="p-2.5 font-bold text-zinc-900 dark:text-zinc-100">{del.event_type}</td>
                                                            <td className="p-2.5 text-zinc-500 truncate max-w-xs" title={del.target_url}>{del.target_url}</td>
                                                            <td className="p-2.5">
                                                                <span className={`px-1.5 py-0.5 text-[9px] font-bold ${
                                                                    del.status === 'DELIVERED' 
                                                                        ? 'bg-emerald-500/20 text-emerald-400' 
                                                                        : del.status === 'FAILED'
                                                                        ? 'bg-red-500/20 text-red-400'
                                                                        : 'bg-amber-500/20 text-amber-400'
                                                                }`}>
                                                                    {del.status}
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 text-zinc-400">{del.status_code || '—'}</td>
                                                            <td className="p-2.5 text-zinc-400 text-[10px]">
                                                                {del.created_at ? new Date(del.created_at).toLocaleTimeString() : 'Recent'}
                                                            </td>
                                                            <td className="p-2.5 text-right">
                                                                <button
                                                                    onClick={() => handleResendDelivery(del.id)}
                                                                    className="px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-300 hover:text-white border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-800 transition-colors cursor-pointer"
                                                                >
                                                                    {t('settings.integrations.resendBtn')}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Slack Channel Alerts */}
                            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                                <ToggleRow 
                                    id="settings-slack-toggle"
                                    label={t('settings.integrations.slackToggle')} 
                                    desc={t('settings.integrations.slackDesc')} 
                                    checked={slackEnabled} 
                                    onChange={() => setSlackEnabled(v => !v)} 
                                />

                                {slackEnabled && (
                                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4">
                                        <div className="p-2.5 bg-blue-500/10 border-l-2 border-blue-500 text-xs text-blue-600 dark:text-blue-400 font-medium">
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

                                        <Field label={t('settings.integrations.slackChannel')}>
                                            <input 
                                                id="settings-slack-channel"
                                                value={slackChannel}
                                                onChange={e => setSlackChannel(e.target.value)}
                                                placeholder="#factory-alerts" 
                                                className={inputCls} 
                                            />
                                        </Field>

                                        {/* Events Checkbox Grid */}
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Subscribed Alert Events</label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                                {[
                                                    { id: 'calibration_alert', label: 'Pricing Calibration Accepted' },
                                                    { id: 'qc_alert', label: 'Preflight / QC Failures' },
                                                    { id: 'sla_alert', label: 'SLA Threshold Warnings' },
                                                    { id: 'order_alert', label: 'Production Order Dispatched' }
                                                ].map(ev => (
                                                    <label key={ev.id} className="flex items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer">
                                                        <input 
                                                            type="checkbox"
                                                            checked={slackEvents.includes(ev.id)}
                                                            onChange={e => {
                                                                if (e.target.checked) {
                                                                    setSlackEvents(prev => [...prev, ev.id]);
                                                                } else {
                                                                    setSlackEvents(prev => prev.filter(x => x !== ev.id));
                                                                }
                                                            }}
                                                            className="rounded-none text-[#dc0000] focus:ring-0 cursor-pointer"
                                                        />
                                                        <span>{ev.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <button
                                                id="settings-slack-save-btn"
                                                type="button"
                                                onClick={handleSaveSlack}
                                                disabled={slackSaving}
                                                className="px-4 py-2 bg-zinc-900 dark:bg-[#dc0000] text-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-red-600 transition-colors cursor-pointer flex items-center gap-1.5"
                                            >
                                                {slackSaving && <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />}
                                                <span>Save Slack Config</span>
                                            </button>

                                            <button
                                                id="settings-slack-test-btn"
                                                type="button"
                                                onClick={handleTestSlack}
                                                disabled={testingSlack}
                                                className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5"
                                            >
                                                {testingSlack ? (
                                                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <BellIcon className="w-3.5 h-3.5" />
                                                )}
                                                <span>{testingSlack ? 'Sending...' : t('settings.integrations.slackTestBtn')}</span>
                                            </button>
                                        </div>

                                        {slackSavedMsg && (
                                            <div className="p-2.5 bg-emerald-500/10 border-l-2 border-emerald-500 text-xs text-emerald-500 font-medium">
                                                {slackSavedMsg}
                                            </div>
                                        )}

                                        {slackTestStatus && (
                                            <div className={`p-2.5 text-xs font-medium border-l-2 ${
                                                slackTestStatus.ok 
                                                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' 
                                                    : 'bg-red-500/10 border-red-500 text-red-500'
                                            }`}>
                                                {slackTestStatus.message}
                                            </div>
                                        )}
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

            {/* MFA Setup Modal */}
            {mfaSetupModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 max-w-lg w-full space-y-4 shadow-xl">
                        <div className="flex items-center gap-3">
                            <ShieldCheckIcon className="w-6 h-6 text-[#dc0000]" />
                            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                                {t('settings.security.mfaModalSetupTitle')}
                            </h3>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            {t('settings.security.mfaModalStatus')}
                        </p>

                        {/* Secret Key Display */}
                        {mfaSetupData?.secret && (
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    {t('settings.security.mfaSecretLabel')}
                                </label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="text" 
                                        readOnly 
                                        value={mfaSetupData.secret} 
                                        className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-xs font-bold text-[#dc0000] select-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard?.writeText(mfaSetupData.secret || '');
                                            setCopiedSecret(true);
                                            setTimeout(() => setCopiedSecret(false), 2000);
                                        }}
                                        className="px-3 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-200 shrink-0 cursor-pointer flex items-center gap-1"
                                    >
                                        <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                                        <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Recovery Codes Grid */}
                        {mfaSetupData?.recoveryCodes && (
                            <div className="space-y-1.5 pt-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                        {t('settings.security.mfaRecoveryCodesLabel')}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard?.writeText(mfaSetupData.recoveryCodes?.join('\n') || '');
                                            setCopiedCodes(true);
                                            setTimeout(() => setCopiedCodes(false), 2000);
                                        }}
                                        className="text-[11px] font-bold text-[#dc0000] hover:underline cursor-pointer flex items-center gap-1"
                                    >
                                        <DocumentDuplicateIcon className="w-3 h-3" />
                                        <span>{copiedCodes ? 'Copied All' : 'Copy All'}</span>
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 font-mono text-[11px] text-center">
                                    {mfaSetupData.recoveryCodes.map((code, idx) => (
                                        <span key={idx} className="p-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 select-all font-bold text-zinc-800 dark:text-zinc-200">
                                            {code}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Verification Input */}
                        <div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                {t('settings.security.mfaCodePrompt')}
                            </label>
                            <input 
                                id="settings-mfa-verify-code-input"
                                type="text"
                                maxLength={6}
                                value={mfaVerifyCode}
                                onChange={e => setMfaVerifyCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="123456"
                                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-center text-lg tracking-widest text-zinc-900 dark:text-zinc-100 font-bold focus:outline-none focus:border-[#dc0000]"
                            />
                        </div>

                        {mfaMessage && (
                            <div className={`p-2 text-xs font-medium border-l-2 ${
                                mfaMessage.error 
                                    ? 'bg-red-500/10 border-red-500 text-red-500' 
                                    : 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                            }`}>
                                {mfaMessage.text}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                            <button
                                id="settings-mfa-close-btn"
                                type="button"
                                onClick={() => { setMfaSetupModalOpen(false); setMfaSetupData(null); }}
                                className="px-4 py-2 text-xs font-bold uppercase border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                                {t('settings.security.mfaCloseBtn')}
                            </button>
                            <button
                                id="settings-mfa-confirm-btn"
                                type="button"
                                onClick={handleConfirmMfaSetup}
                                disabled={mfaVerifyCode.length < 6 || mfaActionLoading}
                                className="px-4 py-2 bg-zinc-900 dark:bg-[#dc0000] text-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                            >
                                {mfaActionLoading && <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />}
                                <span>{t('settings.security.mfaConfirmBtn')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MFA Disable Confirmation Modal */}
            {mfaDisableModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 max-w-md w-full space-y-4 shadow-xl">
                        <div className="flex items-center gap-3">
                            <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
                            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                                {t('settings.security.mfaDisableTitle')}
                            </h3>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Disabling two-factor authentication will lower your account security.
                        </p>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                {t('settings.security.mfaPasswordPrompt')}
                            </label>
                            <input 
                                id="settings-mfa-disable-password-input"
                                type="password"
                                value={mfaDisablePassword}
                                onChange={e => setMfaDisablePassword(e.target.value)}
                                placeholder="••••••••••••"
                                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#dc0000]"
                            />
                        </div>

                        {mfaMessage && (
                            <div className={`p-2 text-xs font-medium border-l-2 ${
                                mfaMessage.error 
                                    ? 'bg-red-500/10 border-red-500 text-red-500' 
                                    : 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
                            }`}>
                                {mfaMessage.text}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                            <button
                                type="button"
                                onClick={() => { setMfaDisableModalOpen(false); setMfaDisablePassword(''); }}
                                className="px-4 py-2 text-xs font-bold uppercase border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                id="settings-mfa-disable-confirm-btn"
                                type="button"
                                onClick={handleDisableMfa}
                                disabled={!mfaDisablePassword || mfaActionLoading}
                                className="px-4 py-2 bg-red-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                            >
                                {mfaActionLoading && <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />}
                                <span>{t('settings.security.mfaDisableConfirmBtn')}</span>
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
