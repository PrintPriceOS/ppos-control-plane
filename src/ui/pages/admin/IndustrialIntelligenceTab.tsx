/**
 * src/ui/pages/admin/IndustrialIntelligenceTab.tsx
 * 
 * Phase 29 - Predictive Industrial Intelligence Layer.
 * Visualizes failure predictions, congestion forecasts, and autonomous optimization.
 */
import React from 'react';
import { useAdminQuery } from '../../hooks/useAdminData';
import { 
    getReliabilityRanking, 
    getCongestionForecast, 
    getFederationIntelligence, 
    getOptimizationHistory, 
    getManufacturingPredictions 
} from '../../lib/adminApi';
import { 
    CpuChipIcon, 
    ChartBarIcon, 
    ArrowTrendingUpIcon, 
    GlobeAltIcon,
    BeakerIcon,
    AcademicCapIcon
} from '@heroicons/react/24/outline';

export const IndustrialIntelligenceTab: React.FC = () => {
    const reliability = useAdminQuery('intel:reliability', getReliabilityRanking, 10000);
    const congestion = useAdminQuery('intel:congestion', getCongestionForecast, 10000);
    const federation = useAdminQuery('intel:federation', getFederationIntelligence, 15000);
    const optimization = useAdminQuery('intel:optimization', getOptimizationHistory, 10000);
    const predictions = useAdminQuery('intel:predictions', getManufacturingPredictions, 5000);

    return (
        <div className="space-y-8 pb-20">
            {/* Intelligence Header */}
            <div className="p-8 bg-slate-900 rounded-none text-white shadow-none border border-slate-800 relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/20 rounded-none border border-blue-500/30">
                            <AcademicCapIcon className="w-6 h-6 text-blue-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Phase 29 — Industrial Intelligence</span>
                    </div>
                    <h2 className="text-3xl font-black tracking-tighter mb-2 italic">Predictive Manufacturing Optimization</h2>
                    <p className="text-slate-400 text-sm font-medium max-w-2xl">
                        Autonomous learning engine active. Analyzing historical dispatch patterns, forecasting congestion, and recalibrating reliability scores across the federation.
                    </p>
                </div>
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-none" />
                <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-none" />
            </div>

            {/* Predictive Failure Radar & Congestion */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Predictive Failure Radar */}
                <div className="ppos-surface rounded-none border ppos-border p-6 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <ChartBarIcon className="w-4 h-4" />
                        Live Failure Prediction Radar
                    </h3>
                    <div className="space-y-4">
                        {(predictions.data?.predictions || []).map((p: any) => (
                            <div key={p.id} className="p-4 ppos-surface-muted border ppos-border rounded-none flex items-center justify-between group hover:border-red-500/40 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-none border-4 ppos-border shadow-none flex items-center justify-center ppos-surface overflow-hidden relative">
                                        <div className="absolute inset-0 bg-red-500/10" />
                                        <span className="text-[10px] font-black text-red-600 relative z-10">{Math.round(p.failure_probability * 100)}%</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-tight">Dispatch #{p.dispatch_id.slice(0, 8)}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase">{p.reason_code}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Mitigation</p>
                                    <button className="px-3 py-1 ppos-surface border ppos-border text-[10px] font-black text-blue-600 dark:text-blue-400 rounded-none hover:bg-blue-50 dark:hover:bg-white/5 transition-all">AUTO-REROUTE</button>
                                </div>
                            </div>
                        ))}
                        {(!predictions.data?.predictions || predictions.data.predictions.length === 0) && (
                            <div className="py-12 text-center opacity-30 italic text-xs font-bold uppercase tracking-widest text-slate-400">No imminent failures predicted</div>
                        )}
                    </div>
                </div>

                {/* Congestion Forecast Timeline */}
                <div className="ppos-surface rounded-none border ppos-border p-6 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <ArrowTrendingUpIcon className="w-4 h-4" />
                        60m Congestion Forecast
                    </h3>
                    <div className="space-y-3">
                        {(congestion.data?.forecasts || []).slice(0, 6).map((f: any) => (
                            <div key={f.node_id} className="p-4 ppos-surface-muted rounded-none border ppos-border flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase">Node #{f.node_id.slice(0, 8)}</span>
                                        <span className="text-[10px] font-black text-slate-400">{f.predicted_utilization_pct}% PROJECTED</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-none overflow-hidden">
                                        <div 
                                            className={`h-full rounded-none transition-all duration-1000 ${f.predicted_utilization_pct > 80 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${f.predicted_utilization_pct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Reliability Ranking & Federation Resilience */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Reliability Ranking */}
                <div className="lg:col-span-2 ppos-surface rounded-none border ppos-border shadow-none overflow-hidden">
                    <div className="p-6 border-b ppos-border flex items-center justify-between">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <CpuChipIcon className="w-4 h-4" />
                            Reliability Trust Index
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="ppos-surface-muted">
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Printer Node</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-center">Trust Score</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-center">SLA History</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-center">Stability</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                                {(reliability.data?.ranking || []).map((r: any) => (
                                    <tr key={r.printer_id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-800 dark:text-zinc-200">{r.company_name}</span>
                                                <span className="text-[10px] text-slate-400 font-bold uppercase">{r.city}, {r.country}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-none text-xs font-black ${
                                                r.trust_score > 90 ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400' :
                                                r.trust_score > 70 ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400' : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                                            }`}>
                                                {r.trust_score}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center text-[10px] font-black text-slate-500 uppercase">
                                            {Math.round(r.sla_success_rate * 100)}%
                                        </td>
                                        <td className="px-6 py-4 text-center text-[10px] font-black text-slate-500 uppercase">
                                            {Math.round(r.heartbeat_stability * 100)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Federation Resilience Map */}
                <div className="bg-slate-900 rounded-none border border-slate-800 p-6 text-white shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <GlobeAltIcon className="w-4 h-4 text-blue-400" />
                        Federation Resilience
                    </h3>
                    <div className="space-y-6">
                        {(federation.data?.snapshots || []).map((s: any) => (
                            <div key={s.region} className="p-4 bg-white/5 border border-white/10 rounded-none">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{s.region}</span>
                                    <span className="text-lg font-black">{s.resilience_score}%</span>
                                </div>
                                <div className="flex items-center gap-1 h-1.5 w-full bg-white/10 rounded-none overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-none" style={{ width: `${s.resilience_score}%` }} />
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <div className="text-center p-2 bg-white/5 rounded-none">
                                        <p className="text-[8px] font-black text-slate-500 uppercase">Health</p>
                                        <p className="text-xs font-black text-emerald-400">{s.health_score}</p>
                                    </div>
                                    <div className="text-center p-2 bg-white/5 rounded-none">
                                        <p className="text-[8px] font-black text-slate-500 uppercase">Bottlenecks</p>
                                        <p className="text-xs font-black text-red-400">{s.bottleneck_count}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Optimization Activity Feed & Learning Console */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Optimization Loop */}
                <div className="ppos-surface rounded-none border ppos-border p-6 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <BeakerIcon className="w-4 h-4" />
                        Autonomous Learning Console
                    </h3>
                    <div className="space-y-4">
                        {(optimization.data?.cycles || []).slice(0, 5).map((c: any) => (
                            <div key={c.id} className="p-4 ppos-surface-muted border ppos-border rounded-none flex items-center gap-4">
                                <div className="w-10 h-10 rounded-none bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                                    <CpuChipIcon className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase">{c.cycle_type}</p>
                                    <p className="text-[10px] text-slate-500 font-bold">Processed {c.input_size} signals • Delta: +{c.improvement_delta}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* System Efficiency Metric */}
                <div className="bg-emerald-500 rounded-none p-10 text-white flex flex-col justify-center relative overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-80">Orchestration Efficiency Gain</p>
                        <h2 className="text-6xl font-black italic tracking-tighter mb-4">+14.2%</h2>
                        <p className="text-sm font-bold opacity-90 max-w-xs leading-relaxed">
                            Throughput improvement detected via autonomous weight recalibration in the EU-WEST federation region.
                        </p>
                    </div>
                    <ArrowTrendingUpIcon className="absolute -bottom-10 -right-10 w-64 h-64 text-white/10 group-hover:scale-110 transition-all duration-700" />
                </div>
            </div>
        </div>
    );
};
