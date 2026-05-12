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
import { COLORS } from '../../design-system/tokens';

export const IndustrialEconomicTab: React.FC = () => {
    const overview = useAdminQuery('econ:overview', getDispatchEconomicOverview, 10000);
    const risk = useAdminQuery('econ:risk', getEconomicRisk, 10000);
    const history = useAdminQuery('econ:profitability', getProfitabilityHistory, 15000);

    return (
        <div className="space-y-8 pb-20 italic-text-off">
            {/* Economic Header */}
            <div className={`p-10 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} shadow-none relative overflow-hidden`}>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-[#10B981]/10 rounded-none border border-[#10B981]/20">
                            <BanknotesIcon className="w-6 h-6 text-[#10B981]" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#10B981]">Phase 30 — Economic Intelligence</span>
                    </div>
                    <div className="flex items-end justify-between gap-10">
                        <div>
                            <h2 className={`text-4xl font-black tracking-tighter mb-4 ${COLORS.adaptive.textPrimary}`}>Autonomous Industrial Margin Optimization</h2>
                            <p className={`${COLORS.adaptive.textSecondary} text-sm font-medium max-w-xl leading-relaxed`}>
                                Maximizing industrial efficiency through real-time margin evaluation, energy-aware routing, and predictive cost escalation forecasting.
                            </p>
                        </div>
                        <div className="text-right">
                            <p className={`text-[10px] font-black text-[#10B981] uppercase tracking-widest mb-1`}>Global Efficiency Score</p>
                            <p className={`text-6xl font-black ${COLORS.adaptive.textPrimary} tracking-tighter`}>94.8%</p>
                        </div>
                    </div>
                </div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#10B981]/5 blur-[120px] rounded-none translate-x-1/2 -translate-y-1/2" />
            </div>

            {/* Economic Risk Radar & Margin Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Economic Risk Radar */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-8 flex items-center gap-2`}>
                        <ShieldExclamationIcon className="w-4 h-4 text-[#dc0000]" />
                        Predictive Economic Risk Radar
                    </h3>
                    <div className="space-y-6">
                        {safeArray(risk.data?.risks).map((r: any, idx: number) => (
                            <div key={idx} className={`p-5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} rounded-none relative overflow-hidden group hover:border-[#dc0000]/40 transition-colors`}>
                                <div className="relative z-10 flex items-center justify-between">
                                    <div>
                                        <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-1`}>{r.region}</p>
                                        <p className={`text-sm font-black ${COLORS.adaptive.textPrimary} uppercase tracking-tight`}>{r.risk_type}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-[#dc0000] uppercase">Impact Score</p>
                                        <p className={`text-xl font-black ${COLORS.adaptive.textPrimary}`}>{r.impact_score}</p>
                                    </div>
                                </div>
                                <div className={`mt-4 h-1.5 w-full ${COLORS.adaptive.surface} rounded-none overflow-hidden`}>
                                    <div className="h-full bg-[#dc0000] rounded-none" style={{ width: `${r.probability * 100}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Dispatch Margin Timeline */}
                <div className={`lg:col-span-2 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 shadow-none`}>
                    <div className="flex items-center justify-between mb-8">
                        <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest flex items-center gap-2`}>
                            <PresentationChartLineIcon className="w-4 h-4 text-[#10B981]" />
                            Live Dispatch Margin Activity
                        </h3>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Avg Margin</p>
                                <p className="text-sm font-black text-[#10B981]">+18.4%</p>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {safeArray(history.data?.history).slice(0, 5).map((h: any) => (
                            <div key={h.id} className={`p-5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} rounded-none flex items-center justify-between group ${COLORS.adaptive.hoverSurface} transition-colors`}>
                                <div className="flex items-center gap-6">
                                    <div className={`w-12 h-12 rounded-none ${COLORS.adaptive.surface} flex items-center justify-center border ${COLORS.adaptive.borderSubtle}`}>
                                        <CurrencyDollarIcon className="w-6 h-6 text-[#10B981]" />
                                    </div>
                                    <div>
                                        <p className={`text-xs font-black ${COLORS.adaptive.textPrimary} uppercase tracking-tight`}>Dispatch #{h.dispatch_id.slice(0, 8)}</p>
                                        <p className={`text-[10px] ${COLORS.adaptive.textMuted} font-bold uppercase`}>Node #{h.node_id.slice(0, 8)}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black text-[#10B981]">+${Number(h.net_margin || 0).toFixed(2)}</p>
                                    <p className={`text-[10px] ${COLORS.adaptive.textMuted} font-black uppercase`}>NET MARGIN</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Federation Profitability Map & Energy Load */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cost Escalation Forecast */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 shadow-none relative overflow-hidden`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-8 flex items-center gap-2`}>
                        <ArrowPathIcon className="w-4 h-4" />
                        Cost Escalation Forecast
                    </h3>
                    <div className="grid grid-cols-2 gap-6">
                        <div className={`p-6 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} text-center`}>
                            <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase mb-2`}>Regional Pressure</p>
                            <p className={`text-3xl font-black ${COLORS.adaptive.textPrimary}`}>MEDIUM</p>
                        </div>
                        <div className={`p-6 bg-[#10B981]/5 rounded-none border border-[#10B981]/20 text-center`}>
                            <p className="text-[10px] font-black text-[#10B981] uppercase mb-2">Efficiency Gain</p>
                            <p className="text-3xl font-black text-[#10B981]">+5.2%</p>
                        </div>
                    </div>
                    <div className={`mt-8 p-6 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle}`}>
                        <div className="flex items-center justify-between mb-4">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${COLORS.adaptive.textMuted}`}>Autonomous Rebalance Active</span>
                            <span className="w-2 h-2 bg-[#10B981] rounded-none animate-pulse" />
                        </div>
                        <p className={`text-xs font-medium ${COLORS.adaptive.textSecondary} leading-relaxed`}>
                            "System has autonomously rerouted 12% of high-cost logistics jobs from EU-WEST to Central EU hubs, saving approximately $1.4k in the last cycle."
                        </p>
                    </div>
                </div>

                {/* Regional Energy Load Panel */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-8 flex items-center gap-2`}>
                        <BoltIcon className="w-4 h-4 text-amber-500" />
                        Regional Energy Load Panel
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                        {[
                            { region: 'EU-WEST', load: 65, status: 'MODERATE' },
                            { region: 'US-EAST', load: 42, status: 'OPTIMAL' },
                            { region: 'ASIA-SOUTH', load: 88, status: 'CRITICAL' }
                        ].map((r) => (
                            <div key={r.region} className={`p-4 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-none ${r.load > 80 ? 'bg-[#dc0000]' : r.load > 60 ? 'bg-amber-500' : 'bg-[#10B981]'}`} />
                                    <span className={`text-xs font-black ${COLORS.adaptive.textPrimary} uppercase tracking-widest`}>{r.region}</span>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className={`text-[10px] font-black ${r.load > 80 ? 'text-[#dc0000]' : COLORS.adaptive.textMuted}`}>{r.status}</span>
                                    <span className={`text-sm font-black ${COLORS.adaptive.textPrimary}`}>{r.load}% LOAD</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Economic Optimization Feed */}
            <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} shadow-none overflow-hidden`}>
                <div className={`p-8 border-b ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest flex items-center gap-2`}>
                        <ArrowPathIcon className="w-4 h-4" />
                        Economic Optimization Activity Feed
                    </h3>
                </div>
                <div className="p-8">
                    <div className={`space-y-4 divide-y ${COLORS.adaptive.divideSubtle}`}>
                        {safeArray(overview.data?.snapshots).slice(0, 5).map((s: any) => (
                            <div key={s.id} className={`flex items-start gap-4 pt-4 first:pt-0 ${COLORS.adaptive.hoverSurface} rounded-none transition-colors`}>
                                <div className={`w-10 h-10 rounded-none ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-center shrink-0`}>
                                    <PresentationChartLineIcon className={`w-5 h-5 ${COLORS.adaptive.textSecondary}`} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs font-black ${COLORS.adaptive.textPrimary} uppercase`}>{s.optimization_type}</span>
                                        <span className={`text-[10px] ${COLORS.adaptive.textMuted} font-bold`}>• {new Date(s.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    <p className={`text-xs ${COLORS.adaptive.textSecondary} font-medium`}>Projected Margin Delta: +{s.projected_margin_delta}% • Global Efficiency: {s.efficiency_score}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
