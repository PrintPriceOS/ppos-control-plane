import React, { useState, useEffect } from 'react';
import { getTheme, setTheme, Theme } from '../../lib/themeStore';
import {
    Cog6ToothIcon,
    GlobeAltIcon,
    BellIcon,
    ShieldCheckIcon,
    ServerIcon,
    PaintBrushIcon,
    CheckIcon,
} from "@heroicons/react/24/outline";

type Section = 'general' | 'notifications' | 'security' | 'integrations' | 'appearance';

const NAV: { id: Section; label: string; icon: React.ElementType }[] = [
    { id: 'general',       label: 'General',       icon: Cog6ToothIcon },
    { id: 'notifications', label: 'Notifications',  icon: BellIcon },
    { id: 'security',      label: 'Security',       icon: ShieldCheckIcon },
    { id: 'integrations',  label: 'Integrations',   icon: ServerIcon },
    { id: 'appearance',    label: 'Appearance',     icon: PaintBrushIcon },
];

const Toggle: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
    <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-none transition-colors ${checked ? 'bg-[#dc0000]' : 'bg-zinc-200 dark:bg-zinc-800'}`}
    >
        <span className={`inline-block h-4 w-4 transform rounded-none bg-white shadow-none border border-transparent transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

export const GlobalSettingsPage: React.FC = () => {
    const [active, setActive] = useState<Section>('general');
    const [saved, setSaved] = useState(false);

    // General
    const [region, setRegion] = useState('EU-WEST-1');
    const [timezone, setTimezone] = useState('UTC');
    const [language, setLanguage] = useState('en');

    // Notifications
    const [notifAnomalies, setNotifAnomalies] = useState(true);
    const [notifDeployments, setNotifDeployments] = useState(true);
    const [notifHealth, setNotifHealth] = useState(false);
    const [notifEmail, setNotifEmail] = useState('admin@printprice.io');

    // Security
    const [sessionTimeout, setSessionTimeout] = useState('60');
    const [mfa, setMfa] = useState(false);
    const [auditLog, setAuditLog] = useState(true);

    // Integrations
    const [webhookUrl, setWebhookUrl] = useState('');
    const [slackEnabled, setSlackEnabled] = useState(false);

    // Appearance
    const [density, setDensity] = useState<'compact' | 'comfortable'>('comfortable');
    const [animations, setAnimations] = useState(true);
    const [theme, setThemeState] = useState<Theme>(getTheme());

    const handleThemeChange = (newTheme: Theme) => {
        setThemeState(newTheme);
        setTheme(newTheme);
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Global Settings</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Platform-wide configuration for PrintPrice OS Control Plane.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 min-h-[520px]">
                {/* Sidebar */}
                <nav className="w-full md:w-52 shrink-0 space-y-1">
                    {NAV.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActive(id)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-none text-sm font-bold transition-all ${
                                active === id
                                    ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-[#dc0000] border-l-2 border-[#dc0000]'
                                    : 'text-zinc-500 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 hover:text-zinc-900 dark:hover:text-zinc-200 border-l-2 border-transparent'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </nav>

                {/* Panel */}
                <div className="flex-1 bg-white dark:bg-zinc-950 rounded-none border border-zinc-200 dark:border-zinc-800 p-8 space-y-6">

                    {active === 'general' && (
                        <>
                            <SectionHeader icon={GlobeAltIcon} title="General" description="Core platform preferences." />
                            <div className="mb-8 p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                                <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-3">Quick Theme Toggle</p>
                                <div className="flex gap-2">
                                    {(['light', 'dark'] as const).map(t => (
                                        <button key={t} onClick={() => handleThemeChange(t)}
                                            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest border transition-all ${theme === t ? 'bg-[#dc0000] text-white border-[#dc0000]' : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500'}`}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <Field label="Primary Region">
                                <select value={region} onChange={e => setRegion(e.target.value)} className={inputCls}>
                                    <option>EU-WEST-1</option>
                                    <option>US-EAST-1</option>
                                    <option>AP-SOUTHEAST-1</option>
                                </select>
                            </Field>
                            <Field label="Default Timezone">
                                <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inputCls}>
                                    <option>UTC</option>
                                    <option>America/New_York</option>
                                    <option>Europe/Madrid</option>
                                    <option>Asia/Tokyo</option>
                                </select>
                            </Field>
                            <Field label="Interface Language">
                                <select value={language} onChange={e => setLanguage(e.target.value)} className={inputCls}>
                                    <option value="en">English</option>
                                    <option value="es">Español</option>
                                </select>
                            </Field>
                        </>
                    )}

                    {active === 'notifications' && (
                        <>
                            <SectionHeader icon={BellIcon} title="Notifications" description="Choose which events trigger alerts." />
                            <ToggleRow label="Anomaly Alerts" desc="Get notified when the intelligence layer detects an anomaly." checked={notifAnomalies} onChange={() => setNotifAnomalies(v => !v)} />
                            <ToggleRow label="Deployment Events" desc="Alerts for deployment status changes." checked={notifDeployments} onChange={() => setNotifDeployments(v => !v)} />
                            <ToggleRow label="Health Degradation" desc="Alert when any service health drops below threshold." checked={notifHealth} onChange={() => setNotifHealth(v => !v)} />
                            <Field label="Notification Email">
                                <input value={notifEmail} onChange={e => setNotifEmail(e.target.value)} className={inputCls} type="email" />
                            </Field>
                        </>
                    )}

                    {active === 'security' && (
                        <>
                            <SectionHeader icon={ShieldCheckIcon} title="Security" description="Access control and audit settings." />
                            <Field label="Session Timeout (minutes)">
                                <input value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} className={inputCls} type="number" min={5} max={480} />
                            </Field>
                            <ToggleRow label="Multi-Factor Authentication" desc="Require MFA for all superuser logins." checked={mfa} onChange={() => setMfa(v => !v)} />
                            <ToggleRow label="Audit Log" desc="Record all admin actions to the audit trail." checked={auditLog} onChange={() => setAuditLog(v => !v)} />
                        </>
                    )}

                    {active === 'integrations' && (
                        <>
                            <SectionHeader icon={ServerIcon} title="Integrations" description="External service connections." />
                            <Field label="Webhook URL">
                                <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/..." className={inputCls} />
                            </Field>
                            <ToggleRow label="Slack Notifications" desc="Send critical alerts to a Slack channel." checked={slackEnabled} onChange={() => setSlackEnabled(v => !v)} />
                            {slackEnabled && (
                                <Field label="Slack Webhook">
                                    <input placeholder="https://hooks.slack.com/services/..." className={inputCls} />
                                </Field>
                            )}
                        </>
                    )}

                    {active === 'appearance' && (
                        <>
                            <SectionHeader icon={PaintBrushIcon} title="System Theme" description="Choose between corporate light and industrial dark mode." />
                            <div className="flex gap-3 mb-8">
                                {(['light', 'dark'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => handleThemeChange(t)}
                                        className={`flex-1 px-4 py-4 rounded-none text-xs font-bold uppercase tracking-widest border transition-all ${
                                            theme === t 
                                                ? 'bg-[#dc0000] text-white border-[#dc0000]' 
                                                : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-700'
                                        }`}
                                    >
                                        {t} MODE
                                    </button>
                                ))}
                            </div>

                            <SectionHeader icon={PaintBrushIcon} title="UI Layout" description="Visual density preferences." />
                            <Field label="UI Density">
                                <div className="flex gap-3">
                                    {(['compact', 'comfortable'] as const).map(d => (
                                        <button
                                            key={d}
                                            onClick={() => setDensity(d)}
                                            className={`px-4 py-2 rounded-none text-sm font-bold border transition-all capitalize ${density === d ? 'bg-zinc-900 dark:bg-zinc-900 text-white dark:text-[#dc0000] border-zinc-900 dark:border-[#dc0000]' : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-700'}`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                            <ToggleRow label="UI Animations" desc="Enable smooth transitions and motion." checked={animations} onChange={() => setAnimations(v => !v)} />
                        </>
                    )}

                    {/* Save */}
                    <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
                        <button
                            onClick={handleSave}
                            className="px-6 py-2.5 bg-zinc-900 dark:bg-[#dc0000] text-white text-sm font-bold rounded-none hover:bg-zinc-800 dark:hover:bg-red-600 transition-colors"
                        >
                            Save Changes
                        </button>
                        {saved && (
                            <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-500">
                                <CheckIcon className="w-4 h-4" /> Saved
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── helpers ────────────────────────────────────────────────────────────────

const inputCls = "w-full px-4 py-2.5 rounded-none bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-[#dc0000]";

const SectionHeader: React.FC<{ icon: React.ElementType; title: string; description: string }> = ({ icon: Icon, title, description }) => (
    <div className="flex items-center gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="p-2 rounded-none bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
            <Icon className="w-5 h-5" />
        </div>
        <div>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{title}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{description}</p>
        </div>
    </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{label}</label>
        {children}
    </div>
);

const ToggleRow: React.FC<{ label: string; desc: string; checked: boolean; onChange: () => void }> = ({ label, desc, checked, onChange }) => (
    <div className="flex items-center justify-between py-2">
        <div>
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{label}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{desc}</p>
        </div>
        <Toggle checked={checked} onChange={onChange} />
    </div>
);
