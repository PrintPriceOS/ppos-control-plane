/**
 * src/ui/components/printhouse/setup/CapabilitiesPanel.tsx
 *
 * Phase 191D.1 — Production Capabilities Panel
 *
 * Displays derived capabilities for a selected site.
 * Capabilities are computed from machine configuration (provenance model).
 */
import React, { useState, useEffect } from 'react';
import { Shield, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

interface Capability {
    type: string;
    label: string;
    module: string;
    active: boolean;
    source_machine_ids: string[];
}

interface SiteOption {
    siteId: string;
    siteName: string;
}

const MODULE_COLORS: Record<string, string> = {
    PRINT: '#3b82f6',
    FINISHING: '#f59e0b',
    QUALITY: '#22c55e',
    FORMAT: '#a855f7',
    UNKNOWN: '#71717a'
};

export const CapabilitiesPanel: React.FC<{ sites?: SiteOption[] }> = ({ sites = [] }) => {
    const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.siteId || '');
    const [capabilities, setCapabilities] = useState<Capability[]>([]);
    const [machineCount, setMachineCount] = useState(0);
    const [loading, setLoading] = useState(false);

    const fetchCapabilities = async (siteId: string) => {
        if (!siteId) return;
        setLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`/api/printhouse/onboarding/sites/${siteId}/capabilities`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setCapabilities(data.capabilities || []);
                setMachineCount(data.machine_count || 0);
            }
        } catch (err) {
            console.error('Error fetching capabilities:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedSiteId) fetchCapabilities(selectedSiteId);
    }, [selectedSiteId]);

    useEffect(() => {
        if (sites.length > 0 && !selectedSiteId) {
            setSelectedSiteId(sites[0].siteId);
        }
    }, [sites]);

    const groupedByModule = capabilities.reduce<Record<string, Capability[]>>((acc, cap) => {
        const mod = cap.module || 'UNKNOWN';
        if (!acc[mod]) acc[mod] = [];
        acc[mod].push(cap);
        return acc;
    }, {});

    const inputStyle: React.CSSProperties = {
        width: '100%', background: '#18181b', border: '1px solid #3f3f46',
        borderRadius: '8px', padding: '10px 14px', color: '#f4f4f5', fontSize: '14px',
        outline: 'none'
    };

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            {/* Site Selector */}
            {sites.length > 1 && (
                <div className="mb-5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Production Site
                    </label>
                    <select
                        value={selectedSiteId}
                        onChange={e => setSelectedSiteId(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors cursor-pointer"
                    >
                        {sites.map(s => (
                            <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <Shield size={20} className="text-[#dc0000]" />
                    <h3 className="m-0 text-lg font-bold text-zinc-900 dark:text-white">
                        Production Capabilities
                    </h3>
                </div>
                <button
                    onClick={() => fetchCapabilities(selectedSiteId)}
                    className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 p-2 rounded-lg transition-colors cursor-pointer"
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Summary Bar */}
            <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:px-5 mb-5 flex flex-wrap gap-8 transition-colors">
                <div>
                    <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">{capabilities.length}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">capabilities</span>
                </div>
                <div>
                    <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">{machineCount}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">active machines</span>
                </div>
                <div>
                    <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">{Object.keys(groupedByModule).length}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">modules</span>
                </div>
            </div>

            {loading && (
                <div className="text-center py-10 text-zinc-500">
                    <RefreshCw size={24} className="animate-spin inline-block" />
                </div>
            )}

            {/* Capability Groups */}
            {!loading && Object.entries(groupedByModule).map(([module, caps]) => (
                <div key={module} className="mb-5">
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-zinc-200 dark:border-zinc-800">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: MODULE_COLORS[module] || '#71717a' }}
                        />
                        <h4 className="m-0 text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                            {module}
                        </h4>
                        <span className="text-xs text-zinc-400">({caps.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {caps.map(cap => (
                            <div
                                key={cap.type}
                                className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 sm:px-4 flex items-center gap-2.5 transition-colors"
                            >
                                {cap.active
                                    ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    : <XCircle size={16} className="text-red-500 shrink-0" />
                                }
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">{cap.label}</div>
                                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                        {cap.source_machine_ids.length} machine{cap.source_machine_ids.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Empty State */}
            {!loading && capabilities.length === 0 && (
                <div className="text-center py-10 text-zinc-500 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <Shield size={32} className="mb-3 opacity-40 mx-auto" />
                    <p className="m-0 font-semibold text-zinc-800 dark:text-zinc-200 text-sm">No capabilities detected</p>
                    <p className="mt-1 mb-0 text-xs text-zinc-500">
                        Add machines and configure their features to automatically derive production capabilities.
                    </p>
                </div>
            )}

            {/* Provenance Notice */}
            {capabilities.length > 0 && (
                <div className="mt-4 p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-900 dark:text-indigo-300">
                    💡 Capabilities are automatically derived from your machine configuration.
                    Update machine features to modify your capability profile.
                </div>
            )}
        </div>
    );
};
