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
        base_cost_per_sheet: 0.05,
        setup_cost: 150,
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

    return (
        <div className="space-y-6 font-manrope">
            {/* Top Bar Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className={`text-xl font-black tracking-tight ${isLight ? 'text-zinc-900' : 'text-white'}`}>Pricing Intelligence Engine</h2>
                    <p className={`text-sm font-medium ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>Model production economics and manage margins.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* View Switcher Tabs */}
                    <div className={`flex border p-1 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950 border-zinc-800'}`}>
                        <button
                            onClick={() => setView('profiles')}
                            className={`px-3 py-1 text-xs font-black uppercase tracking-wider transition-all ${
                                view === 'profiles'
                                    ? (isLight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-zinc-800 text-white')
                                    : (isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white')
                            }`}
                        >
                            Profiles
                        </button>
                        <button
                            onClick={() => setView('routing')}
                            className={`px-3 py-1 text-xs font-black uppercase tracking-wider transition-all ${
                                view === 'routing'
                                    ? (isLight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-zinc-800 text-white')
                                    : (isLight ? 'text-zinc-500 hover:text-zinc-900' : 'text-zinc-400 hover:text-white')
                            }`}
                        >
                            Routing Decisions
                        </button>
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-none text-sm font-black uppercase tracking-widest transition-all shadow-none active:scale-95 flex-shrink-0 ${
                            isLight ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-zinc-100 text-zinc-900 hover:bg-white'
                        }`}
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
                    <div className={`rounded-none p-8 max-w-md w-full border transition-all ${
                        isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                    }`}>
                        <h3 className="text-xl font-black mb-6">Create Pricing Profile</h3>
                        <div className="space-y-4 font-mono">
                            <div>
                                <label className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${
                                    isLight ? 'text-zinc-400' : 'text-zinc-500'
                                }`}>Printhouse ID</label>
                                <input 
                                    type="text" 
                                    value={formData.printer_id}
                                    onChange={e => setFormData({...formData, printer_id: e.target.value})}
                                    className={`w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all ${
                                        isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-white'
                                    }`}
                                    placeholder="e.g. adv-2025"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${
                                        isLight ? 'text-zinc-400' : 'text-zinc-500'
                                    }`}>Base Cost / Sheet</label>
                                    <input 
                                        type="number" 
                                        step="0.001"
                                        value={formData.base_cost_per_sheet}
                                        onChange={e => setFormData({...formData, base_cost_per_sheet: parseFloat(e.target.value)})}
                                        className={`w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all ${
                                            isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${
                                        isLight ? 'text-zinc-400' : 'text-zinc-500'
                                    }`}>Setup Cost</label>
                                    <input 
                                        type="number" 
                                        value={formData.setup_cost}
                                        onChange={e => setFormData({...formData, setup_cost: parseFloat(e.target.value)})}
                                        className={`w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all ${
                                            isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-white'
                                        }`}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${
                                    isLight ? 'text-zinc-400' : 'text-zinc-500'
                                }`}>Min. Job Fee</label>
                                <input 
                                    type="number" 
                                    value={formData.minimum_job_fee}
                                    onChange={e => setFormData({...formData, minimum_job_fee: parseFloat(e.target.value)})}
                                    className={`w-full px-4 py-3 rounded-none border text-sm font-bold outline-none transition-all ${
                                        isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-white'
                                    }`}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8 font-sans">
                            <button 
                                onClick={handleCreateProfile}
                                disabled={isSaving || !formData.printer_id}
                                className={`flex-1 py-3 rounded-none font-black uppercase text-xs tracking-widest disabled:opacity-50 transition-all ${
                                    isLight ? 'bg-zinc-900 text-white hover:bg-zinc-800' : 'bg-zinc-100 text-zinc-900 hover:bg-white'
                                }`}
                            >
                                {isSaving ? 'Saving...' : 'Save Profile'}
                            </button>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className={`px-6 py-3 border rounded-none font-black uppercase text-xs tracking-widest transition-all ${
                                    isLight ? 'border-zinc-200 text-zinc-400 hover:bg-zinc-50' : 'border-zinc-800 text-zinc-500 hover:bg-zinc-800'
                                }`}
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
                    { label: "Pricing Profiles", value: profiles.length, icon: ArchiveBoxIcon, color: isLight ? "text-blue-600" : "text-blue-400", bg: isLight ? "bg-blue-50" : "bg-blue-950/40" },
                    { label: "Active Nodes", value: profiles.filter(p => p.active).length, icon: TagIcon, color: isLight ? "text-emerald-600" : "text-emerald-400", bg: isLight ? "bg-emerald-50" : "bg-emerald-950/40" },
                    { label: "Avg Markup", value: "35%", icon: CalculatorIcon, color: isLight ? "text-amber-600" : "text-amber-400", bg: isLight ? "bg-amber-50" : "bg-amber-950/40" },
                    { label: "Economic Health", value: "92%", icon: ChartPieIcon, color: isLight ? "text-rose-600" : "text-rose-400", bg: isLight ? "bg-rose-50" : "bg-rose-950/40" }
                ].map((stat, i) => (
                    <div key={i} className={`p-4 rounded-none border transition-all flex items-center justify-between ${
                        isLight ? 'bg-white border-zinc-100 text-zinc-900' : 'bg-zinc-900 border-zinc-800 text-white'
                    }`}>
                        <div>
                            <div className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>{stat.label}</div>
                            <div className="text-xl font-black mt-0.5">{stat.value}</div>
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
                <div className={`rounded-none border overflow-hidden transition-all ${
                    isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'
                }`}>
                    <div className={`px-6 py-4 border-b flex items-center justify-between ${
                        isLight ? 'bg-zinc-50/50 border-zinc-100' : 'bg-zinc-950/40 border-zinc-800'
                    }`}>
                        <h3 className={`font-black text-xs uppercase tracking-widest ${isLight ? 'text-zinc-900' : 'text-white'}`}>Active Economic Profiles</h3>
                        <button onClick={fetchProfiles} className={`transition-colors ${isLight ? 'text-zinc-400 hover:text-zinc-600' : 'text-zinc-500 hover:text-zinc-300'}`}>
                            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className={`text-[10px] font-black uppercase tracking-widest border-b ${
                                    isLight ? 'bg-zinc-50/50 text-zinc-400 border-zinc-100' : 'bg-zinc-950/40 text-zinc-500 border-zinc-800'
                                }`}>
                                    <th className="px-6 py-4">Printer / Machine</th>
                                    <th className="px-6 py-4">Scope</th>
                                    <th className="px-6 py-4">Base Cost</th>
                                    <th className="px-6 py-4">Setup</th>
                                    <th className="px-6 py-4">Min. Fee</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${isLight ? 'divide-zinc-100' : 'divide-zinc-800/60'}`}>
                                {profiles.map((p, i) => (
                                    <tr key={i} className={`transition-colors ${isLight ? 'hover:bg-zinc-50/50' : 'hover:bg-zinc-800/40'}`}>
                                        <td className="px-6 py-4">
                                            <div className={`font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>{p.printer_name}</div>
                                            <div className={`text-[10px] uppercase font-bold ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>{p.machine_nickname || 'Printer-wide'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded-none text-[8px] font-black uppercase ${
                                                p.pricing_scope === 'MACHINE' 
                                                    ? (isLight ? 'bg-purple-50 text-purple-600' : 'bg-purple-950 text-purple-400') 
                                                    : (isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-950 text-blue-400')
                                            }`}>
                                                {p.pricing_scope}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 font-mono text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>{p.base_cost_per_sheet} {p.currency}</td>
                                        <td className={`px-6 py-4 font-mono text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>{p.setup_cost} {p.currency}</td>
                                        <td className={`px-6 py-4 font-mono text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>{p.minimum_job_fee} {p.currency}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-none ${p.active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                                                <span className={`text-[10px] font-black uppercase ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>{p.active ? 'Active' : 'Disabled'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-[10px] font-black uppercase text-indigo-500 hover:underline">Edit</button>
                                        </td>
                                    </tr>
                                ))}
                                {profiles.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={7} className={`px-6 py-12 text-center uppercase font-black text-xs tracking-widest ${
                                            isLight ? 'text-zinc-400' : 'text-zinc-600'
                                        }`}>
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
                    <div className={`rounded-none border overflow-hidden transition-all ${
                        isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'
                    }`}>
                        <div className={`px-6 py-4 border-b flex items-center justify-between ${
                            isLight ? 'bg-zinc-50/50 border-zinc-100' : 'bg-zinc-950/40 border-zinc-800'
                        }`}>
                            <h3 className={`font-black text-xs uppercase tracking-widest ${isLight ? 'text-zinc-900' : 'text-white'}`}>Economic Routing Decisions</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className={`text-[10px] font-black uppercase tracking-widest border-b ${
                                        isLight ? 'bg-zinc-50/50 text-zinc-400 border-zinc-100' : 'bg-zinc-950/40 text-zinc-500 border-zinc-800'
                                    }`}>
                                        <th className="px-6 py-4">Task / Job</th>
                                        <th className="px-6 py-4">Selected Node</th>
                                        <th className="px-6 py-4">Final Score</th>
                                        <th className="px-6 py-4">Estimated Margin</th>
                                        <th className="px-6 py-4">Decision Date</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${isLight ? 'divide-zinc-100' : 'divide-zinc-800/60'}`}>
                                    {routingHistory.map((h, i) => {
                                        const decision = h.final_decision_json || {};
                                        return (
                                            <tr key={i} className={`transition-colors ${isLight ? 'hover:bg-zinc-50/50' : 'hover:bg-zinc-800/40'}`}>
                                                <td className="px-6 py-4">
                                                    <div className={`font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>{h.job_name}</div>
                                                    <div className={`text-[10px] font-bold ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>{h.job_id}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={`text-xs font-bold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>{decision.printer_name || 'N/A'}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`text-sm font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>{decision.final_routing_score}</div>
                                                        <div className={`w-12 h-1 rounded-none overflow-hidden ${isLight ? 'bg-zinc-100' : 'bg-zinc-800'}`}>
                                                            <div className="h-full bg-emerald-500" style={{ width: `${decision.final_routing_score}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-xs font-bold text-emerald-500">{decision.margin_pct}%</div>
                                                    <div className={`text-[10px] ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>+{decision.estimated_margin} EUR</div>
                                                </td>
                                                <td className={`px-6 py-4 text-[10px] font-bold ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
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
                    <div className={`rounded-none border overflow-hidden transition-all ${
                        isLight ? 'bg-white border-rose-100' : 'bg-zinc-900 border-rose-950/60'
                    }`}>
                        <div className={`px-6 py-4 border-b flex items-center justify-between ${
                            isLight ? 'bg-rose-50/30 border-rose-50' : 'bg-rose-950/20 border-rose-950/40'
                        }`}>
                            <h3 className={`font-black text-xs uppercase tracking-widest ${isLight ? 'text-rose-900' : 'text-rose-400'}`}>Economic Conflict Inspector</h3>
                        </div>
                        <div className={`divide-y ${isLight ? 'divide-rose-50' : 'divide-rose-950/30'}`}>
                            {conflicts.map((c, i) => (
                                <div key={i} className={`px-6 py-4 flex items-start gap-4 transition-colors ${
                                    isLight ? 'hover:bg-rose-50/10' : 'hover:bg-rose-950/10'
                                }`}>
                                    <div className={`mt-1 w-2 h-2 rounded-none flex-shrink-0 ${c.severity === 'HIGH' ? 'bg-rose-500 animate-pulse' : c.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase text-rose-500">{c.conflict_type}</span>
                                            <span className={`text-[10px] font-bold ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>• {c.job_name}</span>
                                        </div>
                                        <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>{c.conflict_description}</p>
                                    </div>
                                    <div className={`text-[10px] font-bold ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                        {new Date(c.created_at).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))}
                            {conflicts.length === 0 && (
                                <div className={`px-6 py-8 text-center uppercase font-black text-xs tracking-widest italic ${
                                    isLight ? 'text-zinc-400' : 'text-zinc-600'
                                }`}>
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
