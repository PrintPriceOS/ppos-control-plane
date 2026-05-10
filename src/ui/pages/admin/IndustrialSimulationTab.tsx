/**
 * src/ui/pages/admin/IndustrialSimulationTab.tsx
 * 
 * Phase 33 - Reality Simulation & Synthetic Operations Twin.
 * Visualizes synthetic federation health, simulation runs, and autonomous recommendations.
 */
import React from 'react';
import { useAdminQuery } from '../../hooks/useAdminData';
import { 
    getSimulationOverview, 
    getSimulationRuns, 
    getSimulationRecommendations,
    getFutureProjections,
    runManualSimulation
} from '../../lib/adminApi';
import { 
    CpuChipIcon, 
    BeakerIcon, 
    LightBulbIcon, 
    RocketLaunchIcon,
    ShieldExclamationIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';

export const IndustrialSimulationTab: React.FC = () => {
    const overview = useAdminQuery('sim:overview', getSimulationOverview, 15000);
    const runs = useAdminQuery('sim:runs', getSimulationRuns, 15000);
    const recs = useAdminQuery('sim:recs', getSimulationRecommendations, 15000);
    const projections = useAdminQuery('sim:projections', getFutureProjections, 15000);

    const executeSimulation = async () => {
        const res = await runManualSimulation('FEDERATION_STRESS_TEST');
        if (res.ok) {
            alert(`Simulation Triggered: ID ${res.result.simulation_id}`);
        }
    };

    return (
        <div className="space-y-8 pb-20">
            {/* Simulation Header */}
            <div className="p-10 bg-emerald-950 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border border-emerald-900">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
                            <CpuChipIcon className="w-6 h-6 text-emerald-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Phase 33 — Reality Simulation</span>
                    </div>
                    <div className="flex items-end justify-between gap-10">
                        <div>
                            <h2 className="text-4xl font-black tracking-tighter mb-4 italic">Synthetic Industrial Reality Twin</h2>
                            <p className="text-emerald-400/60 text-sm font-medium max-w-xl leading-relaxed">
                                Evaluating autonomous manufacturing decisions in a synthetic mirror of the global federation before any production mutation occurs.
                            </p>
                        </div>
                        <div className="text-right">
                            <button 
                                onClick={executeSimulation}
                                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg flex items-center gap-2"
                            >
                                <RocketLaunchIcon className="w-4 h-4" />
                                Trigger Stress Simulation
                            </button>
                        </div>
                    </div>
                </div>
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recommendation Feed */}
                <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <LightBulbIcon className="w-4 h-4 text-emerald-500" />
                        Autonomous Recommendations
                    </h3>
                    <div className="space-y-4">
                        {(recs.data?.recommendations || []).map((r: any, idx: number) => (
                            <div key={idx} className="p-5 bg-slate-50 border border-slate-100 rounded-3xl">
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${
                                        r.action === 'EXECUTE' ? 'bg-emerald-100 text-emerald-700' : 
                                        r.action === 'HOLD' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                                    }`}>
                                        {r.action}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-400">{Math.round(r.confidence_score * 100)}% CONFIDENCE</span>
                                </div>
                                <p className="text-xs font-bold text-slate-800 leading-tight">{r.reason}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Simulation Run History */}
                <div className="lg:col-span-2 bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <BeakerIcon className="w-4 h-4 text-emerald-400" />
                        Synthetic Timeline Branching
                    </h3>
                    <div className="space-y-4">
                        {(runs.data?.runs || []).slice(0, 5).map((run: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                                        <ArrowPathIcon className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-slate-300">{run.simulation_type}</p>
                                        <p className="text-[10px] text-slate-500 font-medium italic">ID: {run.simulation_id}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${
                                        run.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                                    }`}>
                                        {run.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Future Projection Radar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <RocketLaunchIcon className="w-4 h-4 text-emerald-500" />
                        Simulation Future Radar
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        {(projections.data?.projections || []).slice(0, 4).map((p: any, idx: number) => {
                            const state = JSON.parse(p.projected_state);
                            return (
                                <div key={idx} className="p-5 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-4">Horizon {p.horizon_hours}H</p>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Survivability</span>
                                            <span className="text-xs font-black text-emerald-600">{Math.round(state.survivability * 100)}%</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">Congestion</span>
                                            <span className="text-xs font-black text-slate-800">{Math.round(state.congestion * 100)}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Systemic Instability Monitor */}
                <div className="bg-slate-50 rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                        <ShieldExclamationIcon className="w-4 h-4 text-rose-500" />
                        Synthetic Instability Monitor
                    </h3>
                    <div className="flex flex-col items-center justify-center py-10">
                        <div className="text-6xl font-black text-slate-900 italic tracking-tighter mb-2">0.04</div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Variance Index</p>
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-slate-100 text-center">
                        <p className="text-[10px] font-black text-emerald-600 uppercase">System Status: NOMINAL</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
