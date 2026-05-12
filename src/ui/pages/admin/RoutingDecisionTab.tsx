import React, { useState, useEffect } from "react";
import {
    ArrowsRightLeftIcon,
    CurrencyEuroIcon,
    CpuChipIcon,
    BoltIcon,
    ExclamationTriangleIcon,
    CheckBadgeIcon,
    InformationCircleIcon,
    ChartBarIcon,
    QueueListIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";
import { toDisplayText } from '../../lib/display';

export const RoutingDecisionTab: React.FC = () => {
    const [specs, setSpecs] = useState({
        binding: 'hc',
        paper: 'offset',
        copies: 1000,
        colour: 'full',
        is_rush: false
    });
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [health, setHealth] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        fetchHealth();
    }, []);

    const fetchHealth = async () => {
        try {
            const data = await adminApi.getRoutingHealth();
            setHealth(data.readiness || null);
        } catch (err) {
            console.error('Failed to fetch routing health:', err);
        }
    };

    const handleSearch = async () => {
        setSearching(true);
        try {
            const res = await adminApi.getRoutingRecommendations(specs);
            setRecommendations(res.recommendations || []);
        } catch (err) {
            console.error('Routing search failed:', err);
        } finally {
            setSearching(false);
        }
    };

    const handleDispatch = async (recommendation: any) => {
        const jobId = `job_${Math.floor(Math.random() * 1000000)}`;
        if (!confirm(`Execute production dispatch to Node ${String(recommendation?.nodeId || '').slice(0,8)}?`)) return;
        
        try {
            const res = await adminApi.assignDispatch(jobId, recommendation);
            alert(`Dispatch ${res.dispatchId} executed successfully! Track it in the Production Dispatch tab.`);
        } catch (err) {
            alert(`Dispatch failed: ${err}`);
        }
    };

    return (
        <div className="space-y-8 animate-slide-fade">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-indigo-500 rounded-none shadow-none shadow-indigo-200">
                            <ArrowsRightLeftIcon className="w-6 h-6 text-slate-900 dark:text-white" />
                        </div>
                        Autonomous Routing Engine
                    </h2>
                    <p className="text-sm text-slate-500 font-medium mt-1">Multi-factor manufacturing orchestration & dispatch intelligence.</p>
                </div>

                {health && (
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-none border ${
                        health.state === 'LIVE' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                        health.state === 'DEGRADED' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                        'bg-red-50 border-red-100 text-red-700'
                    }`}>
                        <div className={`w-2 h-2 rounded-none animate-pulse ${
                            health.state === 'LIVE' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                        <span className="text-[10px] font-black uppercase tracking-widest">{health.state} SYSTEM</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Specs Input */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="glass p-6 rounded-none border border-white shadow-none">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <QueueListIcon className="w-4 h-4 text-indigo-500" />
                            Production Specs
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Binding Type</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    value={specs.binding}
                                    onChange={(e) => setSpecs({...specs, binding: e.target.value})}
                                >
                                    <option value="hc">Hardcover (Smyth)</option>
                                    <option value="pb">Softcover (Perfect)</option>
                                    <option value="st">Stapled</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Paper Stock</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    value={specs.paper}
                                    onChange={(e) => setSpecs({...specs, paper: e.target.value})}
                                >
                                    <option value="offset">Offset 80gsm</option>
                                    <option value="mc">Coated 115gsm</option>
                                    <option value="munken">Munken 90gsm</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Run Length</label>
                                    <input 
                                        type="number"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        value={specs.copies}
                                        onChange={(e) => setSpecs({...specs, copies: parseInt(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Colour</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        value={specs.colour}
                                        onChange={(e) => setSpecs({...specs, colour: e.target.value})}
                                    >
                                        <option value="full">4/4 Full Colour</option>
                                        <option value="bw">1/1 B&W</option>
                                    </select>
                                </div>
                            </div>

                            <div className="pt-4">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input 
                                        type="checkbox"
                                        className="w-5 h-5 rounded-none border-slate-200 text-indigo-600 focus:ring-indigo-500"
                                        checked={specs.is_rush}
                                        onChange={(e) => setSpecs({...specs, is_rush: e.target.checked})}
                                    />
                                    <span className="text-sm font-black text-slate-700 group-hover:text-indigo-600 transition-colors">Rush Production Mode</span>
                                </label>
                            </div>

                            <button 
                                onClick={handleSearch}
                                disabled={searching}
                                className="w-full btn-primary-premium !py-4 mt-6 flex items-center justify-center gap-2"
                            >
                                {searching ? (
                                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                ) : (
                                    <CpuChipIcon className="w-5 h-5" />
                                )}
                                Evaluate Routing
                            </button>
                        </div>
                    </div>

                    {/* Readiness Summary */}
                    {health && (
                        <div className="bg-slate-900 rounded-none p-6 text-white shadow-none">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Readiness Intelligence</h4>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold">Compatible Nodes</span>
                                    <span className="text-xs font-black text-indigo-400">{health.details.nodes}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold">Machine Registry</span>
                                    <span className="text-xs font-black text-indigo-400">{health.details.machines}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold">Pricing Profiles</span>
                                    <span className="text-xs font-black text-emerald-400">{health.details.pricing}</span>
                                </div>
                                {health.missing.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-white/10">
                                        <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-2">Signals Missing</div>
                                        {health.missing.map((m: string) => (
                                            <div key={m} className="text-[10px] text-slate-400 flex items-center gap-2">
                                                <ExclamationTriangleIcon className="w-3 h-3 text-amber-500" /> {m}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Recommendations List */}
                <div className="lg:col-span-8 space-y-6">
                    {recommendations.length > 0 ? (
                        <div className="space-y-4">
                            {recommendations.map((rec, i) => (
                                <div key={i} className="glass rounded-none border border-white shadow-none overflow-hidden animate-slide-fade" style={{ animationDelay: `${i * 100}ms` }}>
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-slate-900 rounded-none flex items-center justify-center text-white text-xl font-black">
                                                    #{i + 1}
                                                </div>
                                                <div>
                                                    <h4 className="text-lg font-black text-slate-900 tracking-tight">Node {String(rec?.nodeId || '').slice(0, 8)}</h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Machine: {String(rec?.machineId || '').replace(/machine_|_primary/g, '')}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-black text-indigo-600 leading-none">{rec.finalScore}</div>
                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Routing Score</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                                            <div className="text-center p-3 bg-slate-50 rounded-none border border-slate-100">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Technical</div>
                                                <div className="text-sm font-black text-slate-900">{rec.technicalScore}</div>
                                            </div>
                                            <div className="text-center p-3 bg-slate-50 rounded-none border border-slate-100">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Economic</div>
                                                <div className="text-sm font-black text-slate-900">{rec.economicScore}</div>
                                            </div>
                                            <div className="text-center p-3 bg-slate-50 rounded-none border border-slate-100">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Reliability</div>
                                                <div className="text-sm font-black text-slate-900">{rec.reliabilityScore}</div>
                                            </div>
                                            <div className="text-center p-3 bg-slate-50 rounded-none border border-slate-100">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Congestion</div>
                                                <div className="text-sm font-black text-slate-900">{rec.congestionScore}</div>
                                            </div>
                                            <div className="text-center p-3 bg-slate-50 rounded-none border border-slate-100">
                                                <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">SLA</div>
                                                <div className="text-sm font-black text-slate-900">{rec.slaScore}</div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-6">
                                            {rec.reasons.map((r: string, j: number) => (
                                                <span key={j} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-none text-[10px] font-black uppercase tracking-tight border border-indigo-100">
                                                    <CheckBadgeIcon className="w-3.5 h-3.5" /> {r}
                                                </span>
                                            ))}
                                        </div>

                                        <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                                            <div className="flex gap-6">
                                                <div className="flex items-center gap-2">
                                                    <CurrencyEuroIcon className="w-5 h-5 text-emerald-500" />
                                                    <div>
                                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Est. Production Cost</div>
                                                        <div className="text-sm font-black text-slate-900">€{rec.estimatedCost.toLocaleString()}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <BoltIcon className="w-5 h-5 text-amber-500" />
                                                    <div>
                                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Est. Turnaround</div>
                                                        <div className="text-sm font-black text-slate-900">{rec.estimatedProductionDays} Days</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleDispatch(rec)}
                                                className="px-6 py-2.5 bg-slate-900 text-white rounded-none text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-none shadow-slate-200"
                                            >
                                                Execute Dispatch
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full min-h-[500px] glass rounded-none border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-4">
                            <div className="p-6 bg-slate-100 rounded-none animate-pulse">
                                <ViewfinderCircleIcon className="w-12 h-12 opacity-20" />
                            </div>
                            <div className="text-center">
                                <p className="font-black uppercase text-xs tracking-widest opacity-40">Ready for Routing Evaluation</p>
                                <p className="text-xs font-medium opacity-30 mt-1">Define production specs to see autonomous recommendations</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ViewfinderCircleIcon = (props: any) => (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
);
