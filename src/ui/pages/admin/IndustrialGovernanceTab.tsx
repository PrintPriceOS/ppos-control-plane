/**
 * src/ui/pages/admin/IndustrialGovernanceTab.tsx
 * 
 * Phase 31 - Global Industrial Governance & Resilience.
 * Visualizes planetary resilience, cascading risks, and continuity status.
 */
import React from 'react';
import { useAdminQuery } from '../../hooks/useAdminData';
import { 
    getGovernanceOverview, 
    getRegionalResilience, 
    getSystemicRisk,
    runResilienceSimulation
} from '../../lib/adminApi';
import { 
    ShieldCheckIcon, 
    GlobeAltIcon, 
    ExclamationTriangleIcon, 
    ScaleIcon,
    ServerStackIcon
} from '@heroicons/react/24/outline';
import { safeArray } from '../../lib/display';
import { COLORS } from '../../design-system/tokens';

export const IndustrialGovernanceTab: React.FC = () => {
    const overview = useAdminQuery('gov:overview', getGovernanceOverview, 15000);
    const resilience = useAdminQuery('gov:resilience', getRegionalResilience, 15000);
    const systemic = useAdminQuery('gov:systemic', getSystemicRisk, 15000);

    const runSimulation = async () => {
        const res = await runResilienceSimulation();
        if (res.ok) {
            alert(`Simulation Complete: Global Survivability Index ${Number(res.simulation?.global_survivability_index || 0).toFixed(1)}%`);
        }
    };

    return (
        <div className="space-y-8 pb-20 italic-text-off">
            {/* Governance Header */}
            <div className={`p-10 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} shadow-none relative overflow-hidden`}>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/10 rounded-none border border-indigo-500/20">
                            <ShieldCheckIcon className="w-6 h-6 text-indigo-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Phase 31 — Planetary Governance</span>
                    </div>
                    <div className="flex items-end justify-between gap-10">
                        <div>
                            <h2 className={`text-4xl font-black tracking-tighter mb-4 ${COLORS.adaptive.textPrimary}`}>Planetary Manufacturing Stability Layer</h2>
                            <p className={`${COLORS.adaptive.textSecondary} text-sm font-medium max-w-xl leading-relaxed`}>
                                Governing global industrial continuity through cascading failure detection, regional redundancy protection, and autonomous resilience enforcement.
                            </p>
                        </div>
                        <div className="text-right">
                            <button 
                                onClick={runSimulation}
                                className={`px-6 py-3 ${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.textPrimary} border ${COLORS.adaptive.borderSubtle} text-xs font-black uppercase tracking-widest rounded-none hover:border-indigo-500/40 transition-colors shadow-none`}
                            >
                                Run Resilience Stress Test
                            </button>
                        </div>
                    </div>
                </div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 blur-[120px] rounded-none translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Systemic Risk Radar */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-8 flex items-center gap-2`}>
                        <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />
                        Cascading Failure Radar
                    </h3>
                    <div className="space-y-6">
                        {safeArray(systemic.data?.risks).map((r: any, idx: number) => (
                            <div key={idx} className={`p-5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} rounded-none relative overflow-hidden group hover:border-orange-500/40 transition-colors`}>
                                <p className="text-[10px] font-black text-orange-500 uppercase mb-1">{r.risk_type}</p>
                                <div className="flex items-end justify-between">
                                    <p className={`text-sm font-black ${COLORS.adaptive.textPrimary} uppercase tracking-tight`}>Systemic Impact</p>
                                    <p className={`text-2xl font-black ${COLORS.adaptive.textPrimary}`}>{r.systemic_impact_pct}%</p>
                                </div>
                                <div className={`mt-4 h-1 w-full ${COLORS.adaptive.surface} rounded-none overflow-hidden`}>
                                    <div className="h-full bg-orange-500" style={{ width: `${r.probability * 100}%` }} />
                                </div>
                            </div>
                        ))}
                        {safeArray(systemic.data?.risks).length === 0 && (
                            <div className="text-center py-10">
                                <p className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase`}>No active systemic risks</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Planetary Resilience Map */}
                <div className={`lg:col-span-2 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 shadow-none relative overflow-hidden`}>
                    <div className="relative z-10">
                        <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-8 flex items-center gap-2`}>
                            <GlobeAltIcon className="w-4 h-4 text-indigo-400" />
                            Planetary Resilience Map
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {safeArray(resilience.data?.resilience).slice(0, 6).map((r: any) => (
                                <div key={r.id} className={`p-5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} rounded-none`}>
                                    <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase mb-2`}>{r.region}</p>
                                    <div className="flex items-end justify-between">
                                        <p className={`text-xl font-black ${COLORS.adaptive.textPrimary}`}>{r.survivability_score}%</p>
                                        <div className={`w-2 h-2 rounded-none ${r.survivability_score > 80 ? 'bg-indigo-400' : 'bg-orange-400'}`} />
                                    </div>
                                    <p className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase mt-2`}>SURVIVABILITY</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Continuity & Enforcement */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Governance Enforcement Feed */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-8 flex items-center gap-2`}>
                        <ScaleIcon className="w-4 h-4" />
                        Governance Enforcement Feed
                    </h3>
                    <div className="space-y-4">
                        {safeArray(overview.data?.snapshots).slice(0, 5).map((s: any) => (
                            <div key={s.id} className={`flex items-center justify-between p-4 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-none ${COLORS.adaptive.surface} flex items-center justify-center border ${COLORS.adaptive.borderSubtle}`}>
                                        <ShieldCheckIcon className="w-4 h-4 text-indigo-400" />
                                    </div>
                                    <span className={`text-xs font-black ${COLORS.adaptive.textPrimary} uppercase tracking-tight`}>RESILIENCE_SNAPSHOT</span>
                                </div>
                                <div className="text-right">
                                    <span className={`text-[10px] font-black text-indigo-400 border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 rounded-none`}>{s.governance_status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Continuity Stability Timeline */}
                <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 shadow-none`}>
                    <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-8 flex items-center gap-2`}>
                        <ServerStackIcon className="w-4 h-4 text-indigo-500" />
                        Federation Survivability Index
                    </h3>
                    <div className="flex flex-col items-center justify-center py-6">
                        <div className={`text-6xl font-black ${COLORS.adaptive.textPrimary} tracking-tighter mb-2`}>88.4</div>
                        <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>Global Stability Rating</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className={`p-4 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} text-center shadow-none`}>
                            <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Redundancy</p>
                            <p className="text-lg font-black text-indigo-400">1.4x</p>
                        </div>
                        <div className={`p-4 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} text-center shadow-none`}>
                            <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Diversity</p>
                            <p className="text-lg font-black text-indigo-400">85%</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
