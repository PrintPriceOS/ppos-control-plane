/**
 * src/ui/pages/admin/IndustrialEconomicTab.tsx
 * 
 * Phase 30 - Autonomous Industrial Economic Engine.
 * Visualizes profitability, economic risks, and margin optimization.
 */
import React from 'react';
import { useAdminQuery } from '../../hooks/useAdminData';
import { 
    getDispatchEconomicOverview, 
    getEconomicRisk, 
    getProfitabilityHistory 
} from '../../lib/adminApi';
import { 
    BanknotesIcon, 
    PresentationChartLineIcon, 
    ShieldExclamationIcon, 
    CurrencyDollarIcon,
    ArrowPathIcon,
    BoltIcon
} from '@heroicons/react/24/outline';
import { safeArray } from '../../lib/display';

export const IndustrialEconomicTab: React.FC = () => {
    const overview = useAdminQuery('econ:overview', getDispatchEconomicOverview, 10000);
    const risk = useAdminQuery('econ:risk', getEconomicRisk, 10000);
    const history = useAdminQuery('econ:profitability', getProfitabilityHistory, 15000);

    return (
        <div className="space-y-8 pb-20">
            {/* Economic Header */}
            <div className="p-10 bg-emerald-950 rounded-none text-white shadow-none relative overflow-hidden border border-emerald-900">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-500/20 rounded-none border border-emerald-500/30">
                            <BanknotesIcon className="w-6 h-6 text-emerald-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Phase 30 — Economic Intelligence</span>
                    </div>
                    <div className="flex items-end justify-between gap-10">
                        <div>
                            <h2 className="text-4xl font-black tracking-tighter mb-4 italic">Autonomous Industrial Margin Optimization</h2>
                            <p className="text-emerald-400/60 text-sm font-medium max-w-xl leading-relaxed">
                                Maximizing industrial efficiency through real-time margin evaluation, energy-aware routing, and predictive cost escalation forecasting.
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Global Efficiency Score</p>
                            <p className="text-6xl font-black text-white italic tracking-tighter">94.8%</p>
                        </div>
                    </div>
                </div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 blur-[120px] rounded-none translate-x-1/2 -translate-y-1/2" />
            </div>

            {/* Economic Risk Radar & Margin Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Economic Risk Radar */}
                <div className="ppos-surface rounded-none border ppos-border p-8 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <ShieldExclamationIcon className="w-4 h-4 text-red-500" />
                        Predictive Economic Risk Radar
                    </h3>
                    <div className="space-y-6">
                        {safeArray(risk.data?.risks).map((r: any, idx: number) => (
                            <div key={idx} className="p-5 ppos-surface-muted border ppos-border rounded-none relative overflow-hidden group hover:border-red-500/40 transition-all">
                                <div className="relative z-10 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{r.region}</p>
                                        <p className="text-sm font-black text-slate-800 dark:text-zinc-200 uppercase tracking-tight">{r.risk_type}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-red-500 uppercase">Impact Score</p>
                                        <p className="text-xl font-black text-slate-900 dark:text-white italic">{r.impact_score}</p>
                                    </div>
                                </div>
                                <div className="mt-4 h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-none overflow-hidden">
                                    <div className="h-full bg-red-500 rounded-none" style={{ width: `${r.probability * 100}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Dispatch Margin Timeline */}
                <div className="lg:col-span-2 bg-slate-900 rounded-none border border-slate-800 p-8 text-white shadow-none">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <PresentationChartLineIcon className="w-4 h-4 text-emerald-400" />
                            Live Dispatch Margin Activity
                        </h3>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-500 uppercase">Avg Margin</p>
                                <p className="text-sm font-black text-emerald-400">+18.4%</p>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {safeArray(history.data?.history).slice(0, 5).map((h: any) => (
                            <div key={h.id} className="p-5 bg-white/5 border border-white/10 rounded-none flex items-center justify-between group hover:bg-white/10 transition-all">
                                <div className="flex items-center gap-6">
                                    <div className="w-12 h-12 rounded-none bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                        <CurrencyDollarIcon className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-white uppercase tracking-tight">Dispatch #{h.dispatch_id.slice(0, 8)}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">Node #{h.node_id.slice(0, 8)}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black italic text-emerald-400">+${Number(h.net_margin || 0).toFixed(2)}</p>
                                    <p className="text-[10px] text-slate-500 font-black uppercase">NET MARGIN</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Federation Profitability Map & Energy Load */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cost Escalation Forecast */}
                <div className="ppos-surface rounded-none border ppos-border p-8 shadow-none relative overflow-hidden">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <ArrowPathIcon className="w-4 h-4" />
                        Cost Escalation Forecast
                    </h3>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 ppos-surface-muted rounded-none border ppos-border text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Regional Pressure</p>
                            <p className="text-3xl font-black text-slate-900 dark:text-white italic">MEDIUM</p>
                        </div>
                        <div className="p-6 bg-emerald-50 dark:bg-emerald-950/30 rounded-none border border-emerald-100 dark:border-emerald-900/30 text-center">
                            <p className="text-[10px] font-black text-emerald-600 uppercase mb-2">Efficiency Gain</p>
                            <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400 italic">+5.2%</p>
                        </div>
                    </div>
                    <div className="mt-8 p-6 bg-slate-900 rounded-none border border-slate-800 text-white">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Autonomous Rebalance Active</span>
                            <span className="w-2 h-2 bg-emerald-500 rounded-none animate-pulse" />
                        </div>
                        <p className="text-xs font-medium text-slate-400 leading-relaxed italic">
                            "System has autonomously rerouted 12% of high-cost logistics jobs from EU-WEST to Central EU hubs, saving approximately $1.4k in the last cycle."
                        </p>
                    </div>
                </div>

                {/* Regional Energy Load Panel */}
                <div className="ppos-surface rounded-none border ppos-border p-8 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <BoltIcon className="w-4 h-4 text-yellow-500" />
                        Regional Energy Load Panel
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                        {[
                            { region: 'EU-WEST', load: 65, status: 'MODERATE' },
                            { region: 'US-EAST', load: 42, status: 'OPTIMAL' },
                            { region: 'ASIA-SOUTH', load: 88, status: 'CRITICAL' }
                        ].map((r) => (
                            <div key={r.region} className="p-4 ppos-surface-muted rounded-none border ppos-border flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-none ${r.load > 80 ? 'bg-red-500' : r.load > 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
                                    <span className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-widest">{r.region}</span>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className={`text-[10px] font-black ${r.load > 80 ? 'text-red-500' : 'text-slate-400'}`}>{r.status}</span>
                                    <span className="text-sm font-black text-slate-900 dark:text-white">{r.load}% LOAD</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Economic Optimization Feed */}
            <div className="ppos-surface rounded-none border ppos-border shadow-none overflow-hidden">
                <div className="p-8 border-b ppos-border flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <ArrowPathIcon className="w-4 h-4" />
                        Economic Optimization Activity Feed
                    </h3>
                </div>
                <div className="p-8">
                    <div className="space-y-4">
                        {safeArray(overview.data?.snapshots).slice(0, 5).map((s: any) => (
                            <div key={s.id} className="flex items-start gap-4 p-4 hover:bg-slate-50 dark:hover:bg-white/5 rounded-none transition-all">
                                <div className="w-10 h-10 rounded-none bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                                    <PresentationChartLineIcon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-black text-slate-900 dark:text-white uppercase">{s.optimization_type}</span>
                                        <span className="text-[10px] text-slate-400 font-bold">• {new Date(s.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium italic">Projected Margin Delta: +{s.projected_margin_delta}% • Global Efficiency: {s.efficiency_score}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
