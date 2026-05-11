/**
 * src/ui/pages/admin/IndustrialTemporalTab.tsx
 * 
 * Phase 32 - Temporal Industrial Intelligence & Multi-Timeline Orchestration.
 * Visualizes future federation states, parallel timelines, and temporal risks.
 */
import React from 'react';
import { useAdminQuery } from '../../hooks/useAdminData';
import { 
    getTemporalOverview, 
    getFutureForecasts, 
    getParallelTimelines,
    getTemporalRisk 
} from '../../lib/adminApi';
import { 
    ClockIcon, 
    ViewColumnsIcon, 
    SparklesIcon, 
    ArrowTrendingUpIcon,
    VariableIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';

export const IndustrialTemporalTab: React.FC = () => {
    const overview = useAdminQuery('temp:overview', getTemporalOverview, 20000);
    const futures = useAdminQuery('temp:futures', getFutureForecasts, 20000);
    const timelines = useAdminQuery('temp:timelines', getParallelTimelines, 30000);
    const risks = useAdminQuery('temp:risk', getTemporalRisk, 20000);

    return (
        <div className="space-y-8 pb-20">
            {/* Temporal Header */}
            <div className="p-10 bg-slate-950 rounded-none-[3rem] text-white shadow-none relative overflow-hidden border border-slate-900">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/20 rounded-none border border-indigo-500/30">
                            <ClockIcon className="w-6 h-6 text-indigo-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Phase 32 — Temporal Intelligence</span>
                    </div>
                    <div className="flex items-end justify-between gap-10">
                        <div>
                            <h2 className="text-4xl font-black tracking-tighter mb-4 italic">Predictive Future-State Manufacturing Engine</h2>
                            <p className="text-slate-400 text-sm font-medium max-w-xl leading-relaxed">
                                Simulating multiple manufacturing futures and optimizing industrial trajectories through multi-timeline orchestration and temporal risk forecasting.
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Temporal Stability Index</p>
                            <p className="text-6xl font-black text-white italic tracking-tighter">96.4</p>
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-20" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Timeline Stability Radar */}
                <div className="bg-white rounded-none-[2.5rem] border border-slate-200 p-8 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <SparklesIcon className="w-4 h-4 text-indigo-500" />
                        Parallel Timeline Stability
                    </h3>
                    <div className="space-y-6">
                        {(timelines.data?.timelines || []).map((t: any, idx: number) => (
                            <div key={idx} className="p-6 bg-slate-50 border border-slate-100 rounded-none group hover:border-indigo-200 transition-all">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-none uppercase">{t.id.split('_')[1]}</span>
                                    <span className="text-sm font-black text-slate-900 italic">{t.ranking}%</span>
                                </div>
                                <p className="text-xs font-bold text-slate-600 leading-tight mb-4">{t.desc}</p>
                                <div className="h-1.5 w-full bg-slate-200 rounded-none overflow-hidden">
                                    <div className="h-full bg-indigo-500" style={{ width: `${t.ranking}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Future Federation Projection Map */}
                <div className="lg:col-span-2 bg-slate-900 rounded-none-[2.5rem] p-8 text-white shadow-none relative overflow-hidden">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <VariableIcon className="w-4 h-4 text-purple-400" />
                        Future-State Federation Projections
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {(futures.data?.forecasts || []).slice(0, 4).map((f: any, idx: number) => (
                            <div key={idx} className="p-6 bg-white/5 border border-white/10 rounded-none hover:bg-white/10 transition-all">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="p-3 bg-white/5 rounded-none">
                                        <ArrowTrendingUpIcon className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <span className="text-[10px] font-black text-slate-500 uppercase">+{f.horizon_hours}H HORIZON</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Congestion</p>
                                        <p className="text-2xl font-black italic">{f.predicted_congestion_pct.toFixed(1)}%</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Survivability</p>
                                        <p className="text-2xl font-black italic text-indigo-400">{f.survivability_index}%</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Temporal Risk & Optimization Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Temporal Risk Heatmap */}
                <div className="bg-white rounded-none-[2.5rem] border border-slate-200 p-8 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <VariableIcon className="w-4 h-4 text-pink-500" />
                        Temporal Risk Heatmap
                    </h3>
                    <div className="space-y-4">
                        {(risks.data?.risks || []).map((r: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-none border border-slate-100">
                                <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-none ${r.probability > 0.1 ? 'bg-pink-500 animate-pulse' : 'bg-slate-300'}`} />
                                    <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{r.risk_type}</span>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">T-Minus {r.time_to_impact_hours}H</p>
                                    <p className="text-xs font-black text-pink-500">{(r.probability * 100).toFixed(0)}% PROBABILITY</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Future-State Optimization Feed */}
                <div className="bg-slate-50 rounded-none-[2.5rem] border border-slate-200 p-8 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <ArrowPathIcon className="w-4 h-4 text-indigo-500" />
                        Future-State Optimization Feed
                    </h3>
                    <div className="space-y-4">
                        {(overview.data?.snapshots || []).slice(0, 5).map((s: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-4 p-4 hover:bg-white rounded-none transition-all group">
                                <div className="w-10 h-10 rounded-none bg-white border border-slate-200 flex items-center justify-center shrink-0 group-hover:border-indigo-200">
                                    <ClockIcon className="w-5 h-5 text-slate-400 group-hover:text-indigo-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900 uppercase mb-1">{s.forecast_type}</p>
                                    <p className="text-[10px] text-slate-500 font-medium italic">Stability: {s.stability_score}% • Divergence: {s.divergence_index}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
