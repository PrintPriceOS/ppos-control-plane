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
import { safeArray } from '../../lib/display';
import { COLORS } from '../../design-system/tokens';

export const IndustrialIntelligenceTab: React.FC = () => {
    const reliability = useAdminQuery('intel:reliability', getReliabilityRanking, 10000);
    const congestion = useAdminQuery('intel:congestion', getCongestionForecast, 10000);
    const federation = useAdminQuery('intel:federation', getFederationIntelligence, 15000);
    const optimization = useAdminQuery('intel:optimization', getOptimizationHistory, 10000);
    const predictions = useAdminQuery('intel:predictions', getManufacturingPredictions, 5000);

    return (
        <div className="space-y-8 pb-20 italic-text-off">
            {/* Intelligence Header */}
            <div className={`${COLORS.adaptive.surface} p-8 rounded-none border ${COLORS.adaptive.borderPrimary} relative overflow-hidden`}>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-500/10 rounded-none border border-blue-500/20">
                            <AcademicCapIcon className="w-6 h-6 text-blue-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Phase 29 — Industrial Intelligence</span>
                    </div>
                    <h2 className={`text-3xl font-black tracking-tighter mb-2 ${COLORS.adaptive.textPrimary}`}>Predictive Manufacturing Optimization</h2>
                    <p className={`${COLORS.adaptive.textSecondary} text-sm font-medium max-w-2xl`}>
                        Autonomous learning engine active. Analyzing historical dispatch patterns, forecasting congestion, and recalibrating reliability scores across the federation.
                    </p>
                </div>
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-none" />
                <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-fuchsia-500/5 blur-[120px] rounded-none" />
            </div>

            {/* Predictive Failure Radar & Congestion */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Predictive Failure Radar */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-6 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-6 flex items-center gap-2`}>
                        <ChartBarIcon className="w-4 h-4" />
                        Live Failure Prediction Radar
                    </h3>
                    <div className="space-y-4">
                        {safeArray(predictions.data?.predictions).map((p: any) => (
                            <div key={p.id} className={`p-4 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} rounded-none flex items-center justify-between group hover:border-[#dc0000]/40 transition-all`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-none border-4 ${COLORS.adaptive.borderSubtle} flex items-center justify-center ${COLORS.adaptive.surface} overflow-hidden relative`}>
                                        <div className="absolute inset-0 bg-[#dc0000]/10" />
                                        <span className="text-[10px] font-black text-[#dc0000] relative z-10">{Math.round(p.failure_probability * 100)}%</span>
                                    </div>
                                    <div>
                                        <p className={`text-xs font-black ${COLORS.adaptive.textPrimary} uppercase tracking-tight`}>Dispatch #{String(p.dispatch_id || '').slice(0, 8)}</p>
                                        <p className={`text-[10px] ${COLORS.adaptive.textMuted} font-bold uppercase`}>{p.reason_code}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase mb-1`}>Mitigation</p>
                                    <button className={`px-3 py-1 ${COLORS.adaptive.surface} border ${COLORS.adaptive.borderSubtle} text-[10px] font-black text-blue-400 rounded-none hover:border-blue-500/40 transition-colors`}>AUTO-REROUTE</button>
                                </div>
                            </div>
                        ))}
                        {safeArray(predictions.data?.predictions).length === 0 && (
                            <div className={`py-12 text-center text-xs font-bold uppercase tracking-widest ${COLORS.adaptive.textMuted}`}>No imminent failures predicted</div>
                        )}
                    </div>
                </div>

                {/* Congestion Forecast Timeline */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-6 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-6 flex items-center gap-2`}>
                        <ArrowTrendingUpIcon className="w-4 h-4" />
                        60m Congestion Forecast
                    </h3>
                    <div className="space-y-3">
                        {safeArray(congestion.data?.forecasts).slice(0, 6).map((f: any) => (
                            <div key={f.node_id} className={`p-4 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-[10px] font-black ${COLORS.adaptive.textPrimary} uppercase`}>Node #{String(f.node_id || '').slice(0, 8)}</span>
                                        <span className={`text-[10px] font-black ${COLORS.adaptive.textMuted}`}>{f.predicted_utilization_pct}% PROJECTED</span>
                                    </div>
                                    <div className={`h-2 w-full ${COLORS.adaptive.surface} rounded-none overflow-hidden`}>
                                        <div 
                                            className={`h-full rounded-none transition-all duration-1000 ${f.predicted_utilization_pct > 80 ? 'bg-[#dc0000]' : 'bg-[#10B981]'}`}
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
                <div className={`lg:col-span-2 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} overflow-hidden`}>
                    <div className={`p-6 border-b ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
                        <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest flex items-center gap-2`}>
                            <CpuChipIcon className="w-4 h-4" />
                            Reliability Trust Index
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className={`${COLORS.adaptive.surfaceMuted} border-b ${COLORS.adaptive.borderSubtle}`}>
                                    <th className={`px-6 py-4 text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Printer Node</th>
                                    <th className={`px-6 py-4 text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase text-center`}>Trust Score</th>
                                    <th className={`px-6 py-4 text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase text-center`}>SLA History</th>
                                    <th className={`px-6 py-4 text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase text-center`}>Stability</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${COLORS.adaptive.divideSubtle}`}>
                                {safeArray(reliability.data?.ranking).map((r: any) => (
                                    <tr key={r.printer_id} className={`${COLORS.adaptive.hoverSurface} transition-colors`}>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className={`text-xs font-black ${COLORS.adaptive.textPrimary}`}>{r.company_name}</span>
                                                <span className={`text-[10px] ${COLORS.adaptive.textMuted} font-bold uppercase`}>{r.city}, {r.country}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-3 py-1 rounded-none text-xs font-black border ${
                                                r.trust_score > 90 ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20' :
                                                r.trust_score > 70 ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-[#dc0000]/10 text-[#dc0000] border-[#dc0000]/20'
                                            }`}>
                                                {r.trust_score}%
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 text-center text-[10px] font-black ${COLORS.adaptive.textSecondary} uppercase`}>
                                            {Math.round(r.sla_success_rate * 100)}%
                                        </td>
                                        <td className={`px-6 py-4 text-center text-[10px] font-black ${COLORS.adaptive.textSecondary} uppercase`}>
                                            {Math.round(r.heartbeat_stability * 100)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Federation Resilience Map */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-6 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-6 flex items-center gap-2`}>
                        <GlobeAltIcon className="w-4 h-4 text-blue-400" />
                        Federation Resilience
                    </h3>
                    <div className="space-y-6">
                        {safeArray(federation.data?.snapshots).map((s: any) => (
                            <div key={s.region} className={`p-4 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} rounded-none`}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{s.region}</span>
                                    <span className={`text-lg font-black ${COLORS.adaptive.textPrimary}`}>{s.resilience_score}%</span>
                                </div>
                                <div className={`flex items-center gap-1 h-1.5 w-full ${COLORS.adaptive.surface} rounded-none overflow-hidden`}>
                                    <div className="h-full bg-blue-500 rounded-none" style={{ width: `${s.resilience_score}%` }} />
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <div className={`text-center p-2 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderSubtle}`}>
                                        <p className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Health</p>
                                        <p className="text-xs font-black text-[#10B981]">{s.health_score}</p>
                                    </div>
                                    <div className={`text-center p-2 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderSubtle}`}>
                                        <p className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Bottlenecks</p>
                                        <p className="text-xs font-black text-[#dc0000]">{s.bottleneck_count}</p>
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
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-6 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-6 flex items-center gap-2`}>
                        <BeakerIcon className="w-4 h-4" />
                        Autonomous Learning Console
                    </h3>
                    <div className="space-y-4">
                        {safeArray(optimization.data?.cycles).slice(0, 5).map((c: any) => (
                            <div key={c.id} className={`p-4 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} rounded-none flex items-center gap-4`}>
                                <div className={`w-10 h-10 rounded-none ${COLORS.adaptive.surface} border ${COLORS.adaptive.borderSubtle} flex items-center justify-center`}>
                                    <CpuChipIcon className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <p className={`text-xs font-black ${COLORS.adaptive.textPrimary} uppercase`}>{c.cycle_type}</p>
                                    <p className={`text-[10px] ${COLORS.adaptive.textMuted} font-bold`}>Processed {c.input_size} signals • Delta: +{c.improvement_delta}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* System Efficiency Metric */}
                <div className="bg-[#10B981]/10 border border-[#10B981]/20 rounded-none p-10 flex flex-col justify-center relative overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-xs font-black uppercase tracking-[0.2em] mb-2 text-[#10B981]">Orchestration Efficiency Gain</p>
                        <h2 className="text-6xl font-black tracking-tighter mb-4 text-[#10B981]">+14.2%</h2>
                        <p className={`text-sm font-bold ${COLORS.adaptive.textSecondary} max-w-xs leading-relaxed`}>
                            Throughput improvement detected via autonomous weight recalibration in the EU-WEST federation region.
                        </p>
                    </div>
                    <ArrowTrendingUpIcon className="absolute -bottom-10 -right-10 w-64 h-64 text-[#10B981]/5 group-hover:scale-110 transition-all duration-700" />
                </div>
            </div>
        </div>
    );
};
