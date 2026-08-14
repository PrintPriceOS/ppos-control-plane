/**
 * src/ui/components/printhouse/setup/ProductionSitesPanel.tsx
 * 
 * Manages listing, creating, and completing canonical production sites (`printer_nodes`).
 * Completes placeholder DRAFT sites without duplicating nodes.
 */
import React, { useState } from 'react';
import { FieldGuidance } from './FieldGuidance';
import { Factory, Plus, Edit2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

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
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(form)
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                setIsEditing(false);
                if (onSaved) onSaved();
            } else {
                setErrorMsg(data.error || 'Failed to save production site.');
            }
        } catch (err) {
            setErrorMsg('Network error while saving production site.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white m-0">Production Sites</h2>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 mb-0">
                        Manage your physical printing facilities and production nodes.
                    </p>
                </div>
                {!isEditing && (
                    <button
                        onClick={openCreateForm}
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-xs transition-colors shadow-sm flex items-center gap-1.5"
                    >
                        <Plus size={16} /> Add Production Site
                    </button>
                )}
            </div>

            {errorMsg && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 p-3 rounded-lg mb-5 flex items-center gap-2 text-xs font-medium">
                    <AlertCircle size={16} className="text-red-600 dark:text-red-400" /> {errorMsg}
                </div>
            )}

            {isEditing ? (
                <form onSubmit={handleSubmit} className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 mb-5">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mt-0 mb-4">
                        {editingSiteId ? 'Edit Production Site' : 'Configure Primary Site'}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                Facility / Site Name
                                <FieldGuidance title="Facility Name" description="Unique name for this printing plant (e.g. Madrid Main Plant)." />
                            </label>
                            <input
                                type="text"
                                required
                                value={form.siteName || ''}
                                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                                placeholder="e.g. Central Production Plant"
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                Country
                            </label>
                            <input
                                type="text"
                                required
                                value={form.country || ''}
                                onChange={(e) => setForm({ ...form, country: e.target.value })}
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                City / Location
                            </label>
                            <input
                                type="text"
                                required
                                value={form.city || ''}
                                onChange={(e) => setForm({ ...form, city: e.target.value })}
                                placeholder="e.g. Madrid"
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                                Timezone
                                <FieldGuidance title="Site Timezone" description="Used to compute SLA deadlines and scheduling cut-off times." />
                            </label>
                            <select
                                value={form.timezone || 'Europe/Madrid'}
                                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                            >
                                <option value="Europe/Madrid">Europe/Madrid (CET)</option>
                                <option value="Europe/London">Europe/London (GMT)</option>
                                <option value="Europe/Paris">Europe/Paris (CET)</option>
                                <option value="America/New_York">America/New_York (EST)</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Production Site'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium px-5 py-2 rounded-lg text-xs transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : null}

            {/* Sites List */}
            <div className="flex flex-col gap-3">
                {sites.map((site) => (
                    <div key={site.siteId} className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 sm:px-5 flex items-center justify-between transition-colors">
                        <div className="flex items-center gap-3.5">
                            <Factory size={24} className={site.status === 'CONFIGURING' || site.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'} />
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white m-0">{site.siteName}</h4>
                                    {site.isPrimary && <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold px-2 py-0.5 rounded">Primary Plant</span>}
                                    <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] px-2 py-0.5 rounded">{site.status}</span>
                                </div>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 mb-0">
                                    {site.city || 'Pending City'}, {site.country || 'Pending Country'} ({site.timezone || 'CET'})
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => openEditForm(site)}
                            className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-200 px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                            <Edit2 size={14} /> Configure Site
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
