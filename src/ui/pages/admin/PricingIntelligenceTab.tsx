import React, { useState, useEffect } from "react";
import {
    CurrencyEuroIcon,
    PlusIcon,
    ArchiveBoxIcon,
    CalculatorIcon,
    TagIcon,
    ChartPieIcon,
    ArrowPathIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";
import { useTheme } from "../../hooks/useTheme";

export const PricingIntelligenceTab: React.FC = () => {
    const [view, setView] = useState<'profiles' | 'routing'>('profiles');
    const [profiles, setProfiles] = useState<any[]>([]);
    const [routingHistory, setRoutingHistory] = useState<any[]>([]);
    const [conflicts, setConflicts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const theme = useTheme();
    const isLight = theme === 'light';

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        printer_id: '',
        pricing_scope: 'PRINTER',
        target_margin_pct: 20,
        platform_markup_pct: 15,
        dynamic_routing_premium: 0,
        currency: 'EUR',
        minimum_job_fee: 50
    });

    useEffect(() => {
        if (view === 'profiles') fetchProfiles();
        if (view === 'routing') fetchRoutingData();
    }, [view]);

    const handleCreateProfile = async () => {
        if (!formData.printer_id) return;
        setIsSaving(true);
        try {
            await adminApi.createPricingProfile(formData);
            setIsModalOpen(false);
            fetchProfiles();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const fetchRoutingData = async () => {
        setLoading(true);
        try {
            const [historyData, conflictData] = await Promise.all([
                adminApi.getEconomicRoutingHistory(),
                adminApi.getEconomicRoutingConflicts()
            ]);
            setRoutingHistory(Array.isArray(historyData) ? historyData : []);
            setConflicts(Array.isArray(conflictData) ? conflictData : []);
        } catch (err: any) {
            setError(err.message);
            setRoutingHistory([]);
            setConflicts([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const data = await adminApi.getPricingProfiles();
            setProfiles(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(err.message);
            setProfiles([]);
        } finally {
            setLoading(false);
        }
    };

    const safeProfiles = Array.isArray(profiles) ? profiles : [];
    const safeRoutingHistory = Array.isArray(routingHistory) ? routingHistory : [];
    const safeConflicts = Array.isArray(conflicts) ? conflicts : [];

    return (
        <div className="space-y-6 font-manrope">
            {/* Top Bar Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">Pricing Intelligence Engine</h2>
                    <p className="text-sm font-medium text-slate-505 dark:text-zinc-400">Model production economics and manage margins.</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* View Switcher Tabs */}
                    <div className="flex border border-slate-200 dark:border-zinc-800 p-1 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm">
                        <button
                            onClick={() => setView('profiles')}
                            className={`px-3 py-1 text-xs font-black uppercase tracking-wider transition-all ${
                                view === 'profiles'
                                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20 shadow-none'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900/30'
                            }`}
                        >
                            Profiles
                        </button>
                        <button
                            onClick={() => setView('routing')}
                            className={`px-3 py-1 text-xs font-black uppercase tracking-wider transition-all ${
                                view === 'routing'
                                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20 shadow-none'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900/30'
                            }`}
                        >
                            Routing Decisions
                        </button>
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-none text-sm font-black uppercase tracking-widest transition-all shadow-none active:scale-95 flex-shrink-0 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white text-white"
                    >
                        <PlusIcon className="w-4 h-4" /> New Profile
                    </button>
                </div>
            </div>

            {/* Error Indicator */}
            {error && (
                <div className="p-3 bg-red-950/40 border border-red-800 text-red-400 text-xs font-mono">
                    Error: {error}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
                    <div className="rounded-none p-8 max-w-md w-full border transition-all bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white">
                        <h3 className="text-xl font-black mb-6">Create Pricing Profile</h3>
                        <div className="space-y-4 font-mono">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-500 dark:text-zinc-400">Printhouse ID</label>
                                <input
                                    type="text"
                                    value={formData.printer_id}
                                    onChange={e => setFormData({...formData, printer_id: e.target.value})}
                                    className="w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-black/40 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800"
                                    placeholder="e.g. adv-2025"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-505 dark:text-zinc-400">Target Margin (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.target_margin_pct}
                                        onChange={e => setFormData({...formData, target_margin_pct: parseFloat(e.target.value)})}
                                        className="w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-black/40 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-505 dark:text-zinc-400">Platform Markup (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.platform_markup_pct}
                                        onChange={e => setFormData({...formData, platform_markup_pct: parseFloat(e.target.value)})}
                                        className="w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-black/40 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-505 dark:text-zinc-400">Dynamic Routing Premium (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.dynamic_routing_premium}
                                        onChange={e => setFormData({...formData, dynamic_routing_premium: parseFloat(e.target.value)})}
                                        className="w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-black/40 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest mb-1 text-slate-505 dark:text-zinc-400">Min. Job Fee</label>
                                    <input
                                        type="number"
                                        value={formData.minimum_job_fee}
                                        onChange={e => setFormData({...formData, minimum_job_fee: parseFloat(e.target.value)})}
                                        className="w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all bg-slate-100/50 dark:bg-black/40 text-slate-900 dark:text-white border-slate-200 dark:border-zinc-800"
                                    />
                                </div>
                            </div>

                        </div>
                        <div className="flex gap-3 mt-8 font-sans">
                            <button
                                onClick={handleCreateProfile}
                                disabled={isSaving || !formData.printer_id}
                                className="flex-1 py-3 rounded-none font-black uppercase text-xs tracking-widest disabled:opacity-50 transition-all bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white text-white"
                            >
                                {isSaving ? 'Saving...' : 'Save Profile'}
                            </button>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-3 border rounded-none font-black uppercase text-xs tracking-widest transition-all border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900/30"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Pricing Profiles", value: safeProfiles.length, icon: ArchiveBoxIcon, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40" },
                    { label: "Active Nodes", value: safeProfiles.filter(p => p.active).length, icon: TagIcon, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
                    { label: "Avg Markup", value: "35%", icon: CalculatorIcon, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40" },
                    { label: "Economic Health", value: "92%", icon: ChartPieIcon, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/40" }
                ].map((stat, i) => (
                    <div key={i} className="p-4 rounded-none border transition-all flex items-center justify-between bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">{stat.label}</div>
                            <div className="text-xl font-mono tracking-tight font-black mt-0.5">{stat.value}</div>
                        </div>
                        <div className={`w-10 h-10 ${stat.bg} ${stat.color} rounded-none flex items-center justify-center`}>
                            <stat.icon className="w-5 h-5" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Conditional Views */}
            {view === 'profiles' ? (
                /* Profiles Table */
                <div className="rounded-none border overflow-hidden transition-all bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border-slate-200 dark:border-zinc-800">
                    <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/20 border-b border-slate-100 dark:border-zinc-850/60">
                        <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Active Economic Profiles</h3>
                        <button onClick={fetchProfiles} className="transition-colors text-slate-500 dark:text-zinc-400">
                            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] font-black uppercase tracking-widest border-b bg-slate-50/50 dark:bg-zinc-900/20 border-b border-slate-100 dark:border-zinc-850/60 text-slate-500 dark:text-zinc-400">
                                    <th className="px-6 py-4">Printer / Machine</th>
                                    <th className="px-6 py-4">Scope</th>
                                    <th className="px-6 py-4">Target Margin</th>
                                    <th className="px-6 py-4">Markup</th>
                                    <th className="px-6 py-4">Min. Fee</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-zinc-850/60">
                                {safeProfiles.map((p, i) => (
                                    <tr key={i} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-zinc-900/30">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900 dark:text-white">{p.printer_name}</div>
                                            <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-zinc-400">{p.machine_nickname || 'Printer-wide'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded-none text-[8px] font-black uppercase ${
                                                p.pricing_scope === 'MACHINE'
                                                    ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400'
                                                    : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                                            }`}>
                                                {p.pricing_scope}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono tracking-tight font-black text-xs text-slate-900 dark:text-white">{p.target_margin_pct}%</td>
                                        <td className="px-6 py-4 font-mono tracking-tight font-black text-xs text-slate-900 dark:text-white">{p.platform_markup_pct}%</td>
                                        <td className="px-6 py-4 font-mono tracking-tight font-black text-xs text-slate-900 dark:text-white">{p.minimum_job_fee} {p.currency}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-none ${p.active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                                <span className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400">{p.active ? 'Active' : 'Disabled'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-[10px] font-black uppercase text-indigo-500 hover:underline">Edit</button>
                                        </td>
                                    </tr>
                                ))}
                                {safeProfiles.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center uppercase font-black text-xs tracking-widest text-slate-500 dark:text-zinc-450">
                                            No pricing profiles defined
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Economic Routing History */}
                    <div className="rounded-none border overflow-hidden transition-all bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border-slate-200 dark:border-zinc-800">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50/50 dark:bg-zinc-900/20 border-b border-slate-100 dark:border-zinc-850/60">
                            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Economic Routing Decisions</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-[10px] font-black uppercase tracking-widest border-b bg-slate-50/50 dark:bg-zinc-900/20 border-b border-slate-100 dark:border-zinc-850/60 text-slate-550 dark:text-zinc-400">
                                        <th className="px-6 py-4">Task / Job</th>
                                        <th className="px-6 py-4">Selected Node</th>
                                        <th className="px-6 py-4">Final Score</th>
                                        <th className="px-6 py-4">Estimated Margin</th>
                                        <th className="px-6 py-4">Decision Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-zinc-850/60">
                                    {safeRoutingHistory.map((h, i) => {
                                        const decision = h.final_decision_json || {};
                                        return (
                                            <tr key={i} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-zinc-900/30">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-900 dark:text-white">{h.job_name}</div>
                                                    <div className="text-[10px] font-mono tracking-tight font-black text-slate-500 dark:text-zinc-400">{h.job_id}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-xs font-bold text-slate-900 dark:text-white">{decision.printer_name || 'N/A'}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-mono tracking-tight font-black text-slate-900 dark:text-white">{decision.final_routing_score}</div>
                                                        <div className="w-12 h-1 rounded-none overflow-hidden bg-slate-100 dark:bg-zinc-800">
                                                            <div className="h-full bg-emerald-500" style={{ width: `${decision.final_routing_score}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-mono tracking-tight font-black text-xs text-emerald-500">{decision.margin_pct}%</div>
                                                    <div className="font-mono tracking-tight font-black text-[10px] text-slate-550 dark:text-zinc-400">+{decision.estimated_margin} EUR</div>
                                                </td>
                                                <td className="px-6 py-4 text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                                                    {new Date(h.created_at).toLocaleString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Conflict Inspector */}
                    <div className="rounded-none border overflow-hidden transition-all bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border-slate-200 dark:border-zinc-800">
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-rose-50/30 dark:bg-rose-950/20 border-b border-rose-100 dark:border-rose-900/40">
                            <h3 className="font-black text-xs uppercase tracking-widest text-rose-600 dark:text-rose-400">Economic Conflict Inspector</h3>
                        </div>
                        <div className="divide-y divide-rose-100 dark:divide-rose-950/20">
                            {safeConflicts.map((c, i) => (
                                <div key={i} className="px-6 py-4 flex items-start gap-4 transition-colors hover:bg-rose-50/10 dark:hover:bg-rose-950/10">
                                    <div className={`mt-1 w-2 h-2 rounded-none flex-shrink-0 ${c.severity === 'HIGH' ? 'bg-rose-500 animate-pulse' : c.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase text-rose-500">{c.conflict_type}</span>
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">â€¢ {c.job_name}</span>
                                        </div>
                                        <p className="text-xs mt-0.5 text-slate-900 dark:text-white">{c.conflict_description}</p>
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                                        {new Date(c.created_at).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))}
                            {safeConflicts.length === 0 && (
                                <div className="px-6 py-8 text-center uppercase font-black text-xs tracking-widest italic text-slate-550 dark:text-zinc-400">
                                    No economic conflicts detected
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
