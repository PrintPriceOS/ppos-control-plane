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
    ChartBarIcon,
    ServerStackIcon,
    ScaleIcon
} from '@heroicons/react/24/outline';

export const IndustrialGovernanceTab: React.FC = () => {
    const overview = useAdminQuery('gov:overview', getGovernanceOverview, 15000);
    const resilience = useAdminQuery('gov:resilience', getRegionalResilience, 15000);
    const systemic = useAdminQuery('gov:systemic', getSystemicRisk, 15000);

    const runSimulation = async () => {
        const res = await runResilienceSimulation();
        if (res.ok) {
            alert(`Simulation Complete: Global Survivability Index ${res.simulation.global_survivability_index.toFixed(1)}%`);
        }
    };

    return (
        <div className="space-y-8 pb-20">
            {/* Governance Header */}
            <div className="p-10 bg-indigo-950 rounded-none-[3rem] text-white shadow-none relative overflow-hidden border border-indigo-900">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/20 rounded-none border border-indigo-500/30">
                            <ShieldCheckIcon className="w-6 h-6 text-indigo-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400">Phase 31 — Planetary Governance</span>
                    </div>
                    <div className="flex items-end justify-between gap-10">
                        <div>
                            <h2 className="text-4xl font-black tracking-tighter mb-4 italic">Planetary Manufacturing Stability Layer</h2>
                            <p className="text-indigo-400/60 text-sm font-medium max-w-xl leading-relaxed">
                                Governing global industrial continuity through cascading failure detection, regional redundancy protection, and autonomous resilience enforcement.
                            </p>
                        </div>
                        <div className="text-right">
                            <button 
                                onClick={runSimulation}
                                className="px-6 py-3 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black uppercase tracking-widest rounded-none transition-all shadow-none"
                            >
                                Run Resilience Stress Test
                            </button>
                        </div>
                    </div>
                </div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-[120px] rounded-none translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Systemic Risk Radar */}
                <div className="bg-white rounded-none-[2.5rem] border border-slate-200 p-8 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />
                        Cascading Failure Radar
                    </h3>
                    <div className="space-y-6">
                        {(systemic.data?.risks || []).map((r: any, idx: number) => (
                            <div key={idx} className="p-5 bg-orange-50 border border-orange-100 rounded-none-[1.5rem] relative overflow-hidden">
                                <p className="text-[10px] font-black text-orange-600 uppercase mb-1">{r.risk_type}</p>
                                <div className="flex items-end justify-between">
                                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Systemic Impact</p>
                                    <p className="text-2xl font-black text-orange-700 italic">{r.systemic_impact_pct}%</p>
                                </div>
                                <div className="mt-4 h-1 w-full bg-orange-200 rounded-none overflow-hidden">
                                    <div className="h-full bg-orange-500" style={{ width: `${r.probability * 100}%` }} />
                                </div>
                            </div>
                        ))}
                        {(!systemic.data?.risks || systemic.data?.risks.length === 0) && (
                            <div className="text-center py-10">
                                <p className="text-xs font-black text-slate-300 uppercase italic">No active systemic risks</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Planetary Resilience Map */}
                <div className="lg:col-span-2 bg-slate-900 rounded-none-[2.5rem] p-8 text-white shadow-none relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                            <GlobeAltIcon className="w-4 h-4 text-indigo-400" />
                            Planetary Resilience Map
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {(resilience.data?.resilience || []).slice(0, 6).map((r: any) => (
                                <div key={r.id} className="p-5 bg-white/5 border border-white/10 rounded-none">
                                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2">{r.region}</p>
                                    <div className="flex items-end justify-between">
                                        <p className="text-xl font-black italic">{r.survivability_score}%</p>
                                        <div className={`w-2 h-2 rounded-none ${r.survivability_score > 80 ? 'bg-indigo-400' : 'bg-orange-400'}`} />
                                    </div>
                                    <p className="text-[8px] font-black text-slate-600 uppercase mt-2">SURVIVABILITY</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Continuity & Enforcement */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Governance Enforcement Feed */}
                <div className="bg-white rounded-none-[2.5rem] border border-slate-200 p-8 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <ScaleIcon className="w-4 h-4" />
                        Governance Enforcement Feed
                    </h3>
                    <div className="space-y-4">
                        {(overview.data?.snapshots || []).slice(0, 5).map((s: any) => (
                            <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-none border border-slate-100">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-none bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                        <ShieldCheckIcon className="w-4 h-4 text-indigo-500" />
                                    </div>
                                    <span className="text-xs font-black text-slate-900 uppercase tracking-tight">RESILIENCE_SNAPSHOT</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-1 rounded-none">{s.governance_status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Continuity Stability Timeline */}
                <div className="bg-slate-50 rounded-none-[2.5rem] border border-slate-200 p-8 shadow-none">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <ServerStackIcon className="w-4 h-4 text-indigo-500" />
                        Federation Survivability Index
                    </h3>
                    <div className="flex flex-col items-center justify-center py-6">
                        <div className="text-6xl font-black text-slate-900 italic tracking-tighter mb-2">88.4</div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Stability Rating</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="p-4 bg-white rounded-none text-center shadow-none">
                            <p className="text-[10px] font-black text-slate-400 uppercase">Redundancy</p>
                            <p className="text-lg font-black text-indigo-500">1.4x</p>
                        </div>
                        <div className="p-4 bg-white rounded-none text-center shadow-none">
                            <p className="text-[10px] font-black text-slate-400 uppercase">Diversity</p>
                            <p className="text-lg font-black text-indigo-500">85%</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
