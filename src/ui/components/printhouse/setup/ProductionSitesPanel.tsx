/**
 * src/ui/components/printhouse/setup/ProductionSitesPanel.tsx
 * 
 * Manages listing, creating, and completing canonical production sites (`printer_nodes`).
 * Integrated with shared CountrySelect and TimezoneSelect components.
 * Completes placeholder DRAFT sites without duplicating nodes.
 */
import React, { useState } from 'react';
import { FieldGuidance } from './FieldGuidance';
import { Factory, Plus, Edit2, AlertCircle } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';
import { useLocale } from '../../../i18n';
import { CountrySelect } from '../../common/CountrySelect';
import { TimezoneSelect } from '../../common/TimezoneSelect';
import { getLocalizedCountryName } from '../../../lib/countryCatalog';

interface SiteData {
    siteId: string;
    siteName: string;
    siteCode?: string;
    country: string;
    city: string;
    phone?: string;
    website?: string;
    timezone?: string;
    isPrimary?: boolean;
    status: string;
}

export const ProductionSitesPanel: React.FC<{ sites?: SiteData[]; onSaved?: () => void }> = ({ sites = [], onSaved }) => {
    const { locale, t } = useLocale();
    const [isEditing, setIsEditing] = useState(false);
    const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<SiteData>>({
        siteName: '',
        country: 'ES',
        city: '',
        phone: '',
        timezone: 'Europe/Madrid'
    });

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const openCreateForm = () => {
        setEditingSiteId(null);
        setForm({ siteName: '', country: 'ES', city: '', phone: '', timezone: 'Europe/Madrid' });
        setIsEditing(true);
    };

    const openEditForm = (site: SiteData) => {
        setEditingSiteId(site.siteId);
        setForm({
            siteName: site.siteName,
            country: site.country === 'Pending Setup' ? 'ES' : site.country,
            city: site.city === 'Pending Setup' ? '' : site.city,
            phone: site.phone || '',
            timezone: site.timezone || 'Europe/Madrid'
        });
        setIsEditing(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);

        try {
            const token = getAuthToken();
            const url = editingSiteId 
                ? `/api/printhouse/onboarding/sites/${editingSiteId}`
                : '/api/printhouse/onboarding/sites';

            const method = editingSiteId ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(form)
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                setIsEditing(false);
                if (onSaved) onSaved();
            } else {
                setErrorMsg(data.error || t('setup.sites.errorSave') || 'Failed to save production site.');
            }
        } catch (err) {
            setErrorMsg(t('setup.sites.errorNetwork') || 'Network error while saving production site.');
        } finally {
            setLoading(false);
        }
    };

    const formatSiteStatus = (statusStr: string) => {
        if (!statusStr) return '';
        const lower = statusStr.toLowerCase();
        const key = `status.${lower}`;
        const translated = t(key as any);
        if (translated && translated !== key) return translated;
        return statusStr;
    };

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-2xs transition-colors">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white m-0 tracking-tight">
                        {t('setup.sites.title') || 'Production Sites'}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-0 font-medium">
                        {t('setup.sites.subtitle') || 'Manage your physical printing facilities and production nodes.'}
                    </p>
                </div>
                {!isEditing && (
                    <button
                        onClick={openCreateForm}
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                        <Plus size={16} /> {t('setup.sites.addSite') || 'Add Production Site'}
                    </button>
                )}
            </div>

            {errorMsg && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 p-3.5 rounded-xl mb-5 flex items-center gap-2 text-xs font-medium">
                    <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0" /> {errorMsg}
                </div>
            )}

            {isEditing ? (
                <form onSubmit={handleSubmit} className="bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 sm:p-6 mb-5 space-y-4">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mt-0 mb-3 tracking-tight">
                        {editingSiteId ? (t('setup.sites.editSite') || 'Edit Production Site') : (t('setup.sites.configurePrimary') || 'Configure Primary Site')}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                                <span>{t('setup.sites.facilityName') || 'Facility / Site Name'} <span className="text-[#dc0000]">*</span></span>
                                <FieldGuidance 
                                    title={t('setup.sites.facilityGuidanceTitle') || 'Facility Name'} 
                                    description={t('setup.sites.facilityGuidanceDesc') || 'Unique name for this printing plant (e.g. Madrid Main Plant).'} 
                                />
                            </label>
                            <input
                                type="text"
                                required
                                value={form.siteName || ''}
                                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                                placeholder="e.g. Central Production Plant"
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3.5 py-2.5 rounded-xl text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <CountrySelect
                                id="site-country-select"
                                label={t('setup.sites.country') || 'Country'}
                                required
                                value={form.country || ''}
                                onChange={(code) => setForm({ ...form, country: code })}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                {t('setup.sites.city') || 'City / Location'} <span className="text-[#dc0000]">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                value={form.city || ''}
                                onChange={(e) => setForm({ ...form, city: e.target.value })}
                                placeholder="e.g. Madrid"
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3.5 py-2.5 rounded-xl text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <TimezoneSelect
                                id="site-timezone-select"
                                label={t('setup.sites.timezone') || 'Site Timezone'}
                                required
                                value={form.timezone || 'Europe/Madrid'}
                                onChange={(tz) => setForm({ ...form, timezone: tz })}
                                countryCode={form.country}
                                helperText={
                                    <FieldGuidance 
                                        title={t('setup.sites.timezoneGuidanceTitle') || 'Site Timezone'} 
                                        description={t('setup.sites.timezoneGuidanceDesc') || 'Used to compute SLA deadlines and scheduling cut-off times.'} 
                                    />
                                }
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl text-xs transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                        >
                            {loading ? (t('common.saving') || 'Saving...') : (t('setup.sites.saveSite') || 'Save Production Site')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                        >
                            {t('common.cancel') || 'Cancel'}
                        </button>
                    </div>
                </form>
            ) : null}

            {/* Sites List */}
            <div className="flex flex-col gap-3">
                {sites.map((site) => {
                    const countryDisplay = site.country ? getLocalizedCountryName(site.country, locale) : (t('setup.sites.pendingCountry') || 'Pending Country');
                    return (
                        <div key={site.siteId} className="bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:px-5 flex items-center justify-between transition-colors shadow-2xs">
                            <div className="flex items-center gap-3.5">
                                <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                                    <Factory size={22} className={site.status === 'CONFIGURING' || site.status === 'active' || site.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : site.status === 'SUSPENDED' ? 'text-rose-500' : 'text-amber-500'} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white m-0 tracking-tight">{site.siteName}</h4>
                                        {site.isPrimary && (
                                            <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                                                {t('setup.sites.primaryPlant') || 'Primary Plant'}
                                            </span>
                                        )}
                                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                                            site.status === 'SUSPENDED'
                                                ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                                : site.status === 'ACTIVE' || site.status === 'CONFIGURING'
                                                    ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                        }`}>
                                            {formatSiteStatus(site.status)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-0 font-medium">
                                        {site.city || t('setup.sites.pendingCity') || 'Pending City'}, {countryDisplay} ({site.timezone || 'Europe/Madrid'})
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => openEditForm(site)}
                                className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-200 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                            >
                                <Edit2 size={14} /> {t('setup.sites.configureSite') || 'Configure Site'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
