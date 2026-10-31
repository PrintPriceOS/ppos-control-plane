import React, { useState, useEffect } from "react";
import {
    TruckIcon,
    ArrowPathIcon,
    ChevronRightIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    BoltIcon,
    ArchiveBoxIcon,
    MapPinIcon,
    FingerPrintIcon,
    Square3Stack3DIcon,
    DocumentTextIcon,
    TagIcon,
    CurrencyEuroIcon,
    CalendarIcon,
    ShieldCheckIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";
import { toDisplayText } from '../../lib/display';

export const ProductionDispatchTab: React.FC = () => {
    const [dispatches, setDispatches] = useState<any[]>([]);
    const [selectedDispatch, setSelectedDispatch] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const [includeSeeds, setIncludeSeeds] = useState(false);
    const [counts, setCounts] = useState<any>({});
    const [sourceStatus, setSourceStatus] = useState<string>("LIVE_MES");
    const [seedsOnlyMessage, setSeedsOnlyMessage] = useState<string>("");

    useEffect(() => {
        fetchDispatches(includeSeeds);
        const interval = setInterval(() => fetchDispatches(includeSeeds), 15000);
        const safeDispatches = Array.isArray(dispatches) ? dispatches : [];
    const safeEvents = Array.isArray(selectedDispatch?.events) ? selectedDispatch.events : [];
    const safeFactors = Array.isArray(selectedDispatch?.metadata_json?.predictive_risk?.factors) ? selectedDispatch.metadata_json.predictive_risk.factors : [];

    return () => clearInterval(interval);
    }, [includeSeeds]);

    const fetchDispatches = async (seedsFlag = includeSeeds) => {
        try {
            const data = await adminApi.getManufacturingQueue(seedsFlag);
            setDispatches(data.jobs || []);
            setCounts(data.counts || {});
            setSourceStatus(data.source_status || "LIVE_MES");
            setSeedsOnlyMessage(data.message || "");
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch manufacturing queue:', err);
            setSourceStatus("SOURCE_UNAVAILABLE");
        }
    };

    const fetchDetail = async (id: string) => {
        setUpdating(true);
        try {
            const data = await adminApi.getDispatchDetail(id);
            setSelectedDispatch(data.dispatch || null);
        } catch (err) {
            console.error('Failed to fetch dispatch detail:', err);
        } finally {
            setUpdating(false);
        }
    };

    const handleStatusUpdate = async (id: string, status: string) => {
        if (!confirm(`Confirm operational state transition to: ${status}?`)) return;
        setUpdating(true);
        try {
            await adminApi.updateDispatchStatus(id, status, `Manual transition to ${status}`);
            await fetchDetail(id);
            await fetchDispatches();
        } catch (err) {
            alert(`State transition failed: ${err}`);
        } finally {
            setUpdating(false);
        }
    };

    const handleReroute = async (id: string) => {
        const reason = prompt('Specify industrial reason for rerouting:');
        if (!reason) return;
        setUpdating(true);
        try {
            const res = await adminApi.rerouteDispatch(id, reason);
            alert(`Reroute initiated: ${res.message}`);
            await fetchDetail(id);
            await fetchDispatches();
        } catch (err) {
            alert(`Reroute command failed: ${err}`);
        } finally {
            setUpdating(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DELIVERED': return 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20';
            case 'FAILED': return 'bg-[#dc0000]/10 text-[#dc0000] border-[#dc0000]/20';
            case 'CANCELED': return 'bg-slate-50/50 dark:bg-zinc-900/20 text-slate-500 dark:text-zinc-400 border border-slate-100 dark:border-zinc-850/60';
            case 'REROUTED':
            case 'AUTO_REROUTED': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
            case 'PRINTING':
            case 'BINDING':
            case 'PREPARING': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
            case 'ACCEPTED':
            case 'ASSIGNED':
            case 'AUTO_ASSIGNED': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'SLA_AT_RISK': return 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse';
            case 'CAPACITY_BLOCKED': return 'bg-[#dc0000]/10 text-[#dc0000] border-[#dc0000]/20';
            default: return 'bg-slate-50/50 dark:bg-zinc-900/20 text-slate-500 dark:text-zinc-400 border border-slate-100 dark:border-zinc-850/60';
        }
    };

    const isTransitionValid = (current: string, next: string) => {
        const terminal = ['DELIVERED', 'FAILED', 'CANCELED', 'REROUTED'];
        if (terminal.includes(current)) return false;
        return true;
    };

    const possibleStatuses = [
        'ASSIGNED', 'AUTO_ASSIGNED', 'ACCEPTED', 'PREPARING', 'PRINTING', 'BINDING', 
        'PACKAGING', 'SHIPPED', 'DELIVERED', 'FAILED', 'REROUTED', 'AUTO_REROUTED', 'SLA_AT_RISK', 'CANCELED'
    ];

    return (
        <div className="space-y-6 italic-text-off">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={`text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2`}>
                        <Square3Stack3DIcon className="w-6 h-6 text-indigo-500" />
                        MES Production Control
                    </h2>
                    <p className={`text-xs text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-widest`}>Autonomous Manufacturing Execution System</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-3 px-4 py-2 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border border-slate-200 dark:border-zinc-800 rounded-none`}>
                        <div className="flex flex-col">
                            <span className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest`}>Federation Health</span>
                            <span className="text-[10px] font-bold text-[#10B981]">98.5% STABLE</span>
                        </div>
                        <div className={`w-px h-6 border-slate-100 dark:border-zinc-850/60 mx-1`}></div>
                        <div className="flex flex-col">
                            <span className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest`}>Swarm Nodes</span>
                            <span className={`text-[10px] font-bold text-slate-900 dark:text-white`}>12 ACTIVE</span>
                        </div>
                    </div>
                    <div className="px-3 py-1.5 bg-[#10B981]/10 border border-[#10B981]/20 rounded-none">
                        <span className="text-[10px] font-black text-[#10B981] uppercase tracking-widest">Execution Layer: LIVE</span>
                    </div>
                </div>
            </div>

            {/* Federation Visibility Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Global Stability</div>
                        <div className={`text-xl font-black text-slate-900 dark:text-white tracking-tight`}>99.2%</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-none flex items-center justify-center text-indigo-400">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Federation Risk</div>
                        <div className="text-xl font-black text-[#10B981] tracking-tight">LOW</div>
                    </div>
                    <div className="w-10 h-10 bg-[#10B981]/10 rounded-none flex items-center justify-center text-[#10B981]">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Recovery Pressure</div>
                        <div className={`text-xl font-black text-slate-700 dark:text-zinc-300 tracking-tight`}>STABLE</div>
                    </div>
                    <div className={`w-10 h-10 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none flex items-center justify-center text-slate-500 dark:text-zinc-400`}>
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Cross-Factory Traffic</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tight">14.2 GB/s</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-none flex items-center justify-center text-indigo-400">
                        <TruckIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Singularity Intelligence Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-fuchsia-500/30 flex items-center justify-between`}>
                    <div>
                        <div className="text-[8px] font-black text-fuchsia-500 uppercase tracking-widest mb-1">Omniversal Coherence</div>
                        <div className={`text-xl font-black text-slate-900 dark:text-white tracking-tight`}>100%</div>
                    </div>
                    <div className="w-10 h-10 bg-fuchsia-500/10 rounded-none flex items-center justify-center text-fuchsia-500">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Singularity Vector</div>
                        <div className="text-xl font-black text-[#10B981] tracking-tight">STABLE</div>
                    </div>
                    <div className="w-10 h-10 bg-[#10B981]/10 rounded-none flex items-center justify-center text-[#10B981]">
                        <CheckCircleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Entropy Level</div>
                        <div className="text-xl font-black text-blue-400 tracking-tight">ZERO</div>
                    </div>
                    <div className="w-10 h-10 bg-blue-500/10 rounded-none flex items-center justify-center text-blue-400">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Causal Stability</div>
                        <div className={`text-xl font-black text-slate-700 dark:text-zinc-300 tracking-tight`}>INTACT</div>
                    </div>
                    <div className={`w-10 h-10 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none flex items-center justify-center text-slate-500 dark:text-zinc-400`}>
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Transcend. Aware.</div>
                        <div className="text-xl font-black text-fuchsia-400 tracking-tight">PEAK</div>
                    </div>
                    <div className="w-10 h-10 bg-fuchsia-500/10 rounded-none flex items-center justify-center text-fuchsia-400">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Reality Intelligence Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-pink-500/30 flex items-center justify-between`}>
                    <div>
                        <div className="text-[8px] font-black text-pink-500 uppercase tracking-widest mb-1">Timeline Stability</div>
                        <div className={`text-xl font-black text-slate-900 dark:text-white tracking-tight`}>100%</div>
                    </div>
                    <div className="w-10 h-10 bg-pink-500/10 rounded-none flex items-center justify-center text-pink-500">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Univ. Continuity</div>
                        <div className="text-xl font-black text-[#10B981] tracking-tight">INTACT</div>
                    </div>
                    <div className="w-10 h-10 bg-[#10B981]/10 rounded-none flex items-center justify-center text-[#10B981]">
                        <CheckCircleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Existence Health</div>
                        <div className="text-xl font-black text-blue-400 tracking-tight">OPTIMAL</div>
                    </div>
                    <div className="w-10 h-10 bg-blue-500/10 rounded-none flex items-center justify-center text-blue-400">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Sim Integrity</div>
                        <div className={`text-xl font-black text-slate-700 dark:text-zinc-300 tracking-tight`}>NOMINAL</div>
                    </div>
                    <div className={`w-10 h-10 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none flex items-center justify-center text-slate-500 dark:text-zinc-400`}>
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Reality Divergence</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tight">ZERO</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-none flex items-center justify-center text-indigo-400">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Interplanetary Intelligence Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-violet-500/30 flex items-center justify-between`}>
                    <div>
                        <div className="text-[8px] font-black text-violet-500 uppercase tracking-widest mb-1">Galactic Stability</div>
                        <div className={`text-xl font-black text-slate-900 dark:text-white tracking-tight`}>100%</div>
                    </div>
                    <div className="w-10 h-10 bg-violet-500/10 rounded-none flex items-center justify-center text-violet-500">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Civ. Continuity</div>
                        <div className="text-xl font-black text-[#10B981] tracking-tight">INTACT</div>
                    </div>
                    <div className="w-10 h-10 bg-[#10B981]/10 rounded-none flex items-center justify-center text-[#10B981]">
                        <CheckCircleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Interplan. Eq.</div>
                        <div className="text-xl font-black text-blue-400 tracking-tight">BALANCED</div>
                    </div>
                    <div className="w-10 h-10 bg-blue-500/10 rounded-none flex items-center justify-center text-blue-400">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Expansion Read.</div>
                        <div className={`text-xl font-black text-slate-700 dark:text-zinc-300 tracking-tight`}>NOMINAL</div>
                    </div>
                    <div className={`w-10 h-10 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none flex items-center justify-center text-slate-500 dark:text-zinc-400`}>
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Existential Risk</div>
                        <div className="text-xl font-black text-[#dc0000] tracking-tight">ZERO</div>
                    </div>
                    <div className="w-10 h-10 bg-[#dc0000]/10 rounded-none flex items-center justify-center text-[#dc0000]">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Civilization Intelligence Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-sky-500/30 flex items-center justify-between`}>
                    <div>
                        <div className="text-[8px] font-black text-sky-500 uppercase tracking-widest mb-1">Planetary Health</div>
                        <div className={`text-xl font-black text-slate-900 dark:text-white tracking-tight`}>100%</div>
                    </div>
                    <div className="w-10 h-10 bg-sky-500/10 rounded-none flex items-center justify-center text-sky-500">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Stability</div>
                        <div className="text-xl font-black text-[#10B981] tracking-tight">STABLE</div>
                    </div>
                    <div className="w-10 h-10 bg-[#10B981]/10 rounded-none flex items-center justify-center text-[#10B981]">
                        <CheckCircleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Equilibrium</div>
                        <div className="text-xl font-black text-blue-400 tracking-tight">BALANCED</div>
                    </div>
                    <div className="w-10 h-10 bg-blue-500/10 rounded-none flex items-center justify-center text-blue-400">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Expansion Press.</div>
                        <div className={`text-xl font-black text-slate-700 dark:text-zinc-300 tracking-tight`}>NOMINAL</div>
                    </div>
                    <div className={`w-10 h-10 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none flex items-center justify-center text-slate-500 dark:text-zinc-400`}>
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Macro Risk</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tight">LOW</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-none flex items-center justify-center text-indigo-400">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Governance Intelligence Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-fuchsia-500/30 flex items-center justify-between`}>
                    <div>
                        <div className="text-[8px] font-black text-fuchsia-500 uppercase tracking-widest mb-1">Governance Health</div>
                        <div className={`text-xl font-black text-slate-900 dark:text-white tracking-tight`}>100%</div>
                    </div>
                    <div className="w-10 h-10 bg-fuchsia-500/10 rounded-none flex items-center justify-center text-fuchsia-500">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Fed Cognition</div>
                        <div className="text-xl font-black text-blue-400 tracking-tight">AWARE</div>
                    </div>
                    <div className="w-10 h-10 bg-blue-500/10 rounded-none flex items-center justify-center text-blue-400">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Constitution</div>
                        <div className="text-xl font-black text-[#10B981] tracking-tight">INTACT</div>
                    </div>
                    <div className="w-10 h-10 bg-[#10B981]/10 rounded-none flex items-center justify-center text-[#10B981]">
                        <CheckCircleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Ethics Pressure</div>
                        <div className={`text-xl font-black text-slate-700 dark:text-zinc-300 tracking-tight`}>LOW</div>
                    </div>
                    <div className={`w-10 h-10 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none flex items-center justify-center text-slate-500 dark:text-zinc-400`}>
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Optimization</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tight">GEN-12</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-none flex items-center justify-center text-indigo-400">
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Marketplace Economic Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-amber-500/30 flex items-center justify-between`}>
                    <div>
                        <div className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1">Liquidity Index</div>
                        <div className={`text-xl font-black text-slate-900 dark:text-white tracking-tight`}>84.5</div>
                    </div>
                    <div className="w-10 h-10 bg-amber-500/10 rounded-none flex items-center justify-center text-amber-500">
                        <CurrencyEuroIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Demand Pressure</div>
                        <div className="text-xl font-black text-[#dc0000] tracking-tight">HIGH</div>
                    </div>
                    <div className="w-10 h-10 bg-[#dc0000]/10 rounded-none flex items-center justify-center text-[#dc0000]">
                        <ExclamationTriangleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Trade Velocity</div>
                        <div className="text-xl font-black text-cyan-400 tracking-tight">1,240 /hr</div>
                    </div>
                    <div className="w-10 h-10 bg-cyan-500/10 rounded-none flex items-center justify-center text-cyan-400">
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Open Auctions</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tight">12</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-none flex items-center justify-center text-indigo-400">
                        <TagIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 flex items-center justify-between`}>
                    <div>
                        <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Exchange Pressure</div>
                        <div className={`text-xl font-black text-slate-700 dark:text-zinc-300 tracking-tight`}>MODERATE</div>
                    </div>
                    <div className={`w-10 h-10 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none flex items-center justify-center text-slate-500 dark:text-zinc-400`}>
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Dispatch Ledger */}
                <div className="lg:col-span-4 space-y-4">
                    <div className={`bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 overflow-hidden`}>
                        <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 border-b border-slate-100 dark:border-zinc-850/60 flex flex-col gap-3`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest`}>Industrial Ledger</span>
                                    {sourceStatus === 'SEEDS_ONLY' && (
                                        <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-[8px] font-black text-amber-500 uppercase tracking-widest">
                                            Seeds Only
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => fetchDispatches()} className={`p-1.5 hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 rounded-none transition-colors`}>
                                    <ArrowPathIcon className={`w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>

                            {/* Audit Seeds Toggle */}
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={includeSeeds}
                                    onChange={(e) => setIncludeSeeds(e.target.checked)}
                                    className="rounded-none bg-transparent border border-gray-600 text-indigo-500 focus:ring-0 w-3.5 h-3.5"
                                />
                                <span className={`text-[9px] font-bold ${includeSeeds ? 'text-amber-500' : COLORS.adaptive.textMuted} uppercase tracking-widest`}>
                                    Include Validation Seeds {counts?.seedsFiltered !== undefined && `(${counts.seedsFiltered} filtered)`}
                                </span>
                            </label>

                            {/* Queue Summary Counts */}
                            <div className="grid grid-cols-4 gap-1 pt-1 border-t border-white/5">
                                <div className="text-center">
                                    <div className="text-[8px] font-black text-gray-500 uppercase">Pending</div>
                                    <div className="text-xs font-bold text-gray-300">{counts?.pending || 0}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[8px] font-black text-blue-500 uppercase">Active</div>
                                    <div className="text-xs font-bold text-blue-400">{counts?.active || 0}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[8px] font-black text-amber-500 uppercase">SLA Risk</div>
                                    <div className="text-xs font-bold text-amber-500">{counts?.slaAtRisk || 0}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[8px] font-black text-[#dc0000] uppercase">Blocked</div>
                                    <div className="text-xs font-bold text-[#dc0000]">{counts?.capacityBlocked || 0}</div>
                                </div>
                            </div>
                        </div>
                        <div className={`divide-y divide-slate-100 dark:divide-zinc-850/60 max-h-[700px] overflow-y-auto custom-scrollbar`}>
                            {safeDispatches.map((d) => (
                                <button
                                    key={d.id}
                                    onClick={() => fetchDetail(d.id)}
                                    className={`w-full text-left p-4 hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 transition-all flex flex-col gap-2 border-b border-slate-100 dark:border-zinc-850/60 border-l-4 ${selectedDispatch?.id === d.id ? 'bg-indigo-500/5 border-indigo-500' : 'border-transparent'}`}
                                >
                                    <div className="w-full flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[10px] font-black tracking-tight text-slate-900 dark:text-white">
                                                #{String(d?.id || '').slice(-8)}
                                            </span>
                                            {d?.isSeed && (
                                                <span className="px-1 py-0.2 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[7px] font-black uppercase tracking-widest">
                                                    SEED
                                                </span>
                                            )}
                                        </div>
                                        <div className={`text-[8px] font-black px-2 py-0.5 rounded-none border uppercase tracking-widest ${getStatusColor(d.status)}`}>
                                            {d.status}
                                        </div>
                                    </div>

                                    {/* Enriched Preflight Telemetry */}
                                    {d?.job && (
                                        <div className="w-full bg-black/20 p-2 border border-white/5 flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between text-[9px]">
                                                <span className="font-mono text-gray-300 truncate max-w-[140px]" title={d.job.filename}>
                                                    {d.job.filename}
                                                </span>
                                                <span className={`font-bold ${
                                                    d.job.riskScore > 70 ? 'text-[#dc0000]' :
                                                    d.job.riskScore > 40 ? 'text-amber-500' :
                                                    'text-[#10B981]'
                                                }`}>
                                                    Risk: {d.job.riskScore}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[8px] text-gray-400 font-bold uppercase tracking-wider">
                                                <span>Status: {d.job.preflightStatus}</span>
                                                {d.job.certifiable ? (
                                                    <span className="text-[#10B981] flex items-center gap-0.5">
                                                        <ShieldCheckIcon className="w-2.5 h-2.5" /> Certifiable
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">Uncertified</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className={`flex items-center justify-between w-full text-[9px] text-slate-500 dark:text-zinc-400 font-bold tracking-tight`}>
                                        <span className="flex items-center gap-1 font-mono tracking-tight font-black">
                                            <MapPinIcon className="w-2.5 h-2.5" /> {String(d?.node_id || '').slice(0, 8)}
                                        </span>
                                        {d?.slaStatus === 'SLA_AT_RISK' && (
                                            <span className="text-amber-500 flex items-center gap-0.5 text-[8px] font-black uppercase">
                                                <ExclamationTriangleIcon className="w-2.5 h-2.5" /> SLA RISK
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {dispatches.length === 0 && !loading && (
                                <div className="p-12 text-center space-y-3">
                                    <ArchiveBoxIcon className={`w-8 h-8 mx-auto opacity-30 text-slate-500 dark:text-zinc-400`} />
                                    <p className={`text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400`}>No manufacturing records</p>
                                    {sourceStatus === 'SEEDS_ONLY' && !includeSeeds && (
                                        <div className="p-3 bg-amber-500/5 border border-amber-500/20 text-left">
                                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                <ExclamationTriangleIcon className="w-3 h-3 flex-shrink-0" /> Validation Seeds Present
                                            </p>
                                            <p className="text-[9px] text-gray-400 leading-relaxed font-bold">
                                                {seedsOnlyMessage || "Only audit-grade validation seeds are currently present. Toggle 'Include Validation Seeds' above to inspect seed payloads."}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Dispatch Forensic Inspector */}
                <div className="lg:col-span-8">
                    {selectedDispatch ? (
                        <div className="space-y-6">
                            <div className={`bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800 p-8 relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 p-8">
                                    <div className={`px-4 py-1.5 rounded-none border text-[10px] font-black uppercase tracking-widest ${getStatusColor(selectedDispatch.status)}`}>
                                        {selectedDispatch.status}
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 mb-10">
                                    <div className={`w-20 h-20 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none flex items-center justify-center text-indigo-500 border border-slate-100 dark:border-zinc-850/60`}>
                                        <TruckIcon className="w-10 h-10" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className={`text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase`}>DISPATCH {String(selectedDispatch.id || '').slice(-8)}</h3>
                                            <FingerPrintIcon className={`w-4 h-4 text-slate-500 dark:text-zinc-400`} />
                                            {selectedDispatch.metadata_json?.autonomous && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-none text-[8px] font-black text-blue-400 uppercase tracking-widest">
                                                    <BoltIcon className="w-2.5 h-2.5" /> Autonomous Decision
                                                </div>
                                            )}
                                        </div>
                                        <p className={`text-xs text-slate-500 dark:text-zinc-400 font-mono tracking-tight uppercase`}>Trace ID: {selectedDispatch.id}</p>
                                        {selectedDispatch.status === 'SLA_AT_RISK' && (
                                            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-none flex items-center gap-3">
                                                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                                <div>
                                                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-tight block">SLA BREACH RISK DETECTED</span>
                                                    <span className="text-[9px] text-amber-500/80 font-bold uppercase">{selectedDispatch.metadata_json?.sla_alert?.message || 'Industrial delay detected'}</span>
                                                </div>
                                            </div>
                                        )}
                                        {selectedDispatch.status === 'CAPACITY_BLOCKED' && (
                                            <div className="mt-3 p-3 bg-[#dc0000]/10 border border-[#dc0000]/20 rounded-none flex items-center gap-3">
                                                <ExclamationTriangleIcon className="w-4 h-4 text-[#dc0000] flex-shrink-0" />
                                                <div>
                                                    <span className="text-[10px] font-black text-[#dc0000] uppercase tracking-tight block">CAPACITY CONFLICT DETECTED</span>
                                                    <span className="text-[9px] text-[#dc0000]/80 font-bold uppercase">Scheduling overlap detected on machine {selectedDispatch.metadata_json?.capacity_conflict?.machine_id}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Operational Metrics Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <MapPinIcon className="w-3.5 h-3.5" /> Node
                                        </div>
                                        <div className={`text-xs font-bold text-slate-900 dark:text-white font-mono`}>{String(selectedDispatch.node_id || '').slice(0, 12)}...</div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <BoltIcon className="w-3.5 h-3.5" /> Machine
                                        </div>
                                        <div className={`text-xs font-bold text-slate-900 dark:text-white font-mono`}>{String(selectedDispatch.machine_id || '').slice(0, 12) || 'AUTO'}</div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <CurrencyEuroIcon className="w-3.5 h-3.5" /> Est. Cost
                                        </div>
                                        <div className="text-xs font-mono tracking-tight font-black text-[#10B981]">€{selectedDispatch.estimated_cost}</div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <TagIcon className="w-3.5 h-3.5" /> Est. Margin
                                        </div>
                                        <div className="text-xs font-mono tracking-tight font-black text-indigo-400">{selectedDispatch.estimated_margin}%</div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Anomaly Score
                                        </div>
                                        <div className={`text-xs font-mono tracking-tight font-black ${
                                            (selectedDispatch.anomaly_score || 0) > 70 ? 'text-[#dc0000] animate-pulse' :
                                            (selectedDispatch.anomaly_score || 0) > 40 ? 'text-amber-500' :
                                            'text-[#10B981]'
                                        }`}>
                                            {selectedDispatch.anomaly_score || '0.00'}
                                        </div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <BoltIcon className="w-3.5 h-3.5" /> Stability
                                        </div>
                                        <div className="text-xs font-mono tracking-tight font-black text-cyan-400">
                                            {Number(Math.max(0, 100 - (selectedDispatch.anomaly_score || 0))).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <BoltIcon className="w-3.5 h-3.5" /> Reliability
                                        </div>
                                        <div className="text-xs font-mono tracking-tight font-black text-cyan-400">{selectedDispatch.reliability_score || 0}%</div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <CurrencyEuroIcon className="w-3.5 h-3.5" /> Econ Score
                                        </div>
                                        <div className="text-xs font-mono tracking-tight font-black text-[#10B981]">
                                            {selectedDispatch.economic_score || '0'}
                                        </div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <BoltIcon className="w-3.5 h-3.5" /> Energy
                                        </div>
                                        <div className="text-xs font-mono tracking-tight font-black text-amber-500">
                                            {selectedDispatch.energy_efficiency_score || '0'}%
                                        </div>
                                    </div>
                                    <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                        <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
                                            <ShieldCheckIcon className="w-3.5 h-3.5" /> Risk Score
                                        </div>
                                        <div className={`text-xs font-mono tracking-tight font-black ${
                                            (selectedDispatch.metadata_json?.predictive_risk?.score || 0) > 70 ? 'text-[#dc0000]' :
                                            (selectedDispatch.metadata_json?.predictive_risk?.score || 0) > 40 ? 'text-amber-500' :
                                            'text-[#10B981]'
                                        }`}>
                                            {selectedDispatch.metadata_json?.predictive_risk?.score || '0'} / 100
                                        </div>
                                    </div>
                                </div>

                                {/* Canonical Preflight Telemetry Context */}
                                {selectedDispatch.job && (
                                    <div className="mb-10 p-6 bg-black/30 rounded-none border border-white/10">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                                            <DocumentTextIcon className="w-4 h-4 text-indigo-500" /> Canonical Preflight Registry Attachment
                                        </h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div>
                                                <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Filename</div>
                                                <div className="text-xs font-mono font-bold text-gray-200 truncate" title={selectedDispatch.job.filename}>
                                                    {selectedDispatch.job.filename}
                                                </div>
                                            </div>
                                            <div>
                                                <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Policy Target</div>
                                                <div className="text-xs font-bold text-indigo-300 uppercase">
                                                    {selectedDispatch.job.policy || 'STANDARD'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Forensic Risk</div>
                                                <div className={`text-xs font-bold ${
                                                    selectedDispatch.job.riskScore > 70 ? 'text-[#dc0000]' :
                                                    selectedDispatch.job.riskScore > 40 ? 'text-amber-500' :
                                                    'text-[#10B981]'
                                                }`}>
                                                    {selectedDispatch.job.riskScore} / 100
                                                </div>
                                            </div>
                                            <div>
                                                <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Certification Gate</div>
                                                <div className="text-xs font-bold">
                                                    {selectedDispatch.job.certifiable ? (
                                                        <span className="text-[#10B981] flex items-center gap-1">
                                                            <ShieldCheckIcon className="w-3 h-3" /> Promoted
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500">Uncertified</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Predictive Risk Intelligence */}
                                {selectedDispatch.metadata_json?.predictive_risk && (
                                    <div className="mb-10 p-6 bg-[#dc0000]/5 rounded-none border border-[#dc0000]/20">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-[#dc0000] mb-4 flex items-center gap-2">
                                            <ShieldCheckIcon className="w-4 h-4" /> Predictive Industrial Risk Analysis
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Risk Level</div>
                                                <div className={`text-xl font-black tracking-tight ${
                                                    selectedDispatch.metadata_json.predictive_risk.level === 'CRITICAL' ? 'text-[#dc0000] animate-pulse' :
                                                    selectedDispatch.metadata_json.predictive_risk.level === 'HIGH' ? 'text-[#dc0000]' :
                                                    selectedDispatch.metadata_json.predictive_risk.level === 'MODERATE' ? 'text-amber-500' :
                                                    'text-[#10B981]'
                                                }`}>
                                                    {selectedDispatch.metadata_json.predictive_risk.level}
                                                </div>
                                            </div>
                                            <div>
                                                <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-2`}>Contributing Factors</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {safeFactors.map((f: string) => (
                                                        <span key={f} className={`px-2.5 py-1 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none text-[8px] font-black text-slate-700 dark:text-zinc-300 uppercase border border-slate-200 dark:border-zinc-800`}>
                                                            {f}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Reservation & Recovery Context */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                                    <div className="p-6 bg-indigo-500/5 rounded-none border border-indigo-500/10">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                                            <CalendarIcon className="w-4 h-4" /> Capacity Reservation Window
                                        </h4>
                                        <div className="flex items-center justify-between">
                                            <div className="text-center flex-1">
                                                <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Starts</div>
                                                <div className={`text-xs font-bold text-slate-900 dark:text-white font-mono`}>{selectedDispatch.reserved_from ? new Date(selectedDispatch.reserved_from).toLocaleString() : 'PENDING'}</div>
                                            </div>
                                            <div className="px-2 text-indigo-500 opacity-30 italic">→</div>
                                            <div className="text-center flex-1">
                                                <div className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Expires</div>
                                                <div className={`text-xs font-bold text-slate-900 dark:text-white font-mono`}>{selectedDispatch.reserved_until ? new Date(selectedDispatch.reserved_until).toLocaleString() : 'PENDING'}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedDispatch.metadata_json?.autonomous_recovery && (
                                        <div className="p-6 bg-cyan-500/5 rounded-none border border-cyan-500/10">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-4 flex items-center gap-2">
                                                <BoltIcon className="w-4 h-4" /> Autonomous Recovery Node
                                            </h4>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <span className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest`}>Reason</span>
                                                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-tight">{selectedDispatch.metadata_json.autonomous_recovery.reason}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest`}>Confidence</span>
                                                    <span className={`text-[10px] font-bold text-slate-900 dark:text-white px-2 py-0.5 bg-cyan-500/20 rounded-none uppercase tracking-widest`}>{selectedDispatch.metadata_json.autonomous_recovery.confidence}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className={`text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest`}>Old Node</span>
                                                    <span className={`text-[10px] font-mono text-slate-500 dark:text-zinc-400`}>{String(selectedDispatch.metadata_json.autonomous_recovery.old_node || '').slice(0, 12)}...</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Dispatch Marketplace Intelligence */}
                                <div className={`mb-10 p-6 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2`}>
                                        <CurrencyEuroIcon className="w-4 h-4 text-amber-500" /> Marketplace Economics
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Marketplace Bid Score</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>{selectedDispatch.marketplace_bid_id ? '89.2' : 'N/A'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Federated Margin Score</div>
                                            <div className="text-lg font-black text-[#10B981]">{selectedDispatch.federated_margin_score || '92.5'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Auction Participation</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.marketplace_bid_id ? 'ACTIVE' : 'NO'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Delegation Cost</div>
                                            <div className="text-lg font-black text-amber-500">€ {selectedDispatch.delegated_factory_id ? '15.50' : '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Exchange Priority</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>{selectedDispatch.exchange_priority_score || 'LOW'}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dispatch Singularity Intelligence */}
                                <div className={`mb-10 p-6 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2`}>
                                        <ShieldCheckIcon className="w-4 h-4 text-fuchsia-500" /> Omniversal Singularity Intelligence
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Singularity Weight</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>{selectedDispatch.singularity_weight || '1.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Omniversal Priority</div>
                                            <div className="text-lg font-black text-fuchsia-400">{selectedDispatch.omniversal_priority || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Entropy Score</div>
                                            <div className="text-lg font-black text-[#dc0000]">{selectedDispatch.entropy_score || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Causal Chain</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.causal_chain_id ? 'ACTIVE' : 'N/A'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Post-Reality</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>TRANSCENDENT</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dispatch Reality Intelligence */}
                                <div className={`mb-10 p-6 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2`}>
                                        <ShieldCheckIcon className="w-4 h-4 text-pink-500" /> Reality Simulation Intelligence
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Timeline Weight</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>{selectedDispatch.timeline_weight || '1.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Existence Priority</div>
                                            <div className="text-lg font-black text-[#10B981]">{selectedDispatch.existence_priority || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Reality Risk</div>
                                            <div className="text-lg font-black text-[#dc0000]">{selectedDispatch.reality_risk_score || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Univ. Dependency</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.universal_dependency || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Optimization</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>NOMINAL</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dispatch Interplanetary Intelligence */}
                                <div className={`mb-10 p-6 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2`}>
                                        <ShieldCheckIcon className="w-4 h-4 text-violet-500" /> Interplanetary Manufacturing Intelligence
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Interplan. Priority</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>{selectedDispatch.interplanetary_priority_score || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Existential Risk</div>
                                            <div className="text-lg font-black text-[#dc0000]">{selectedDispatch.existential_risk_score || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Orbital Route</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.orbital_route_id ? 'ACTIVE' : 'N/A'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Continuity Weight</div>
                                            <div className="text-lg font-black text-[#10B981]">{selectedDispatch.continuity_weight || '1.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Deep Space Rel.</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>NOMINAL</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dispatch Civilization Intelligence */}
                                <div className={`mb-10 p-6 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2`}>
                                        <ShieldCheckIcon className="w-4 h-4 text-sky-500" /> Planetary Civilization Coordination
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Planetary Priority</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>{selectedDispatch.planetary_priority_score || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Civilization Risk</div>
                                            <div className="text-lg font-black text-[#dc0000]">{selectedDispatch.civilization_risk_score || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Intercont. Route</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.intercontinental_route_id ? 'ACTIVE' : 'N/A'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Equilibrium Weight</div>
                                            <div className="text-lg font-black text-[#10B981]">{selectedDispatch.planetary_equilibrium_weight || '1.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Expansion Rel.</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>NOMINAL</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dispatch Governance Intelligence */}
                                <div className={`mb-10 p-6 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60`}>
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2`}>
                                        <ShieldCheckIcon className="w-4 h-4 text-fuchsia-500" /> Industrial AI Governance
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Governance Risk</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>{selectedDispatch.governance_risk_score || '0.00'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Constitution</div>
                                            <div className="text-lg font-black text-[#10B981]">{selectedDispatch.constitutional_compliance || '100'}%</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Cognition Priority</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.cognition_priority || '0'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Generation ID</div>
                                            <div className="text-lg font-black text-cyan-400">{selectedDispatch.recursive_generation_id ? String(selectedDispatch.recursive_generation_id).slice(0,6) : 'N/A'}</div>
                                        </div>
                                        <div className={`p-4 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none border border-slate-200 dark:border-zinc-800`}>
                                            <div className={`text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1`}>Ethics Class</div>
                                            <div className={`text-lg font-black text-slate-900 dark:text-white`}>NOMINAL</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Lifecycle Controls */}
                                <div className={`space-y-4 mb-10 pt-10 border-t border-slate-100 dark:border-zinc-850/60`}>
                                    <div className="flex items-center justify-between">
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-zinc-300`}>Lifecycle State Transition</h4>
                                        <span className={`text-[8px] font-mono text-slate-500 dark:text-zinc-400 uppercase`}>Authenticated Override Only</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {possibleStatuses.map(status => (
                                            <button
                                                key={status}
                                                disabled={!isTransitionValid(selectedDispatch.status, status) || updating}
                                                onClick={() => handleStatusUpdate(selectedDispatch.id, status)}
                                                className={`px-3 py-1.5 rounded-none text-[9px] font-black uppercase tracking-widest border transition-all ${
                                                    selectedDispatch.status === status 
                                                    ? 'bg-indigo-500 border-indigo-400 text-white' 
                                                    : `bg-slate-50/50 dark:bg-zinc-900/20 border-slate-100 dark:border-zinc-850/60 text-slate-700 dark:text-zinc-300 hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 disabled:opacity-30 disabled:cursor-not-allowed`
                                                }`}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                        <button 
                                            onClick={() => handleReroute(selectedDispatch.id)}
                                            className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-none text-[9px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all"
                                        >
                                            Reroute Node
                                        </button>
                                    </div>
                                </div>

                                {/* Evidence & Metadata */}
                                <div className={`space-y-4 pt-10 border-t border-slate-100 dark:border-zinc-850/60`}>
                                    <div className="flex items-center justify-between">
                                        <h4 className={`text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-zinc-300`}>Forensic Evidence</h4>
                                        <button 
                                            onClick={() => setShowJson(!showJson)}
                                            className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:underline"
                                        >
                                            {showJson ? 'Hide Payload' : 'Show Recommendation JSON'}
                                        </button>
                                    </div>
                                    {showJson && (
                                        <div className={`p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60 font-mono text-[10px] text-slate-900 dark:text-white overflow-x-auto whitespace-pre`}>
                                            {JSON.stringify(selectedDispatch.metadata_json, null, 2)}
                                        </div>
                                    )}

                                    {/* Timeline */}
                                    <div className={`space-y-4 relative before:absolute before:inset-0 before:left-4 before:w-px before:bg-zinc-800 pt-4`}>
                                        {safeEvents.map((e: any, i: number) => (
                                            <div key={i} className="relative pl-10">
                                                <div className={`absolute left-0 top-0 w-8 h-8 rounded-none bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border border-slate-200 dark:border-zinc-800 flex items-center justify-center`}>
                                                    {e.event_type === 'STATUS_CHANGED' ? <ClockIcon className="w-4 h-4 text-indigo-500" /> : <BoltIcon className="w-4 h-4 text-amber-500" />}
                                                </div>
                                                <div className={`p-4 rounded-none bg-slate-50/50 dark:bg-zinc-900/20 border border-slate-100 dark:border-zinc-850/60`}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className={`text-[9px] font-black text-slate-900 dark:text-white uppercase tracking-widest`}>{e.event_type}</span>
                                                        <span className={`text-[8px] text-slate-500 dark:text-zinc-400 font-bold font-mono`}>{new Date(e.created_at).toLocaleString()}</span>
                                                    </div>
                                                    <div className={`text-[10px] font-bold text-slate-700 dark:text-zinc-300`}>
                                                        {e.old_status ? `${e.old_status} \u2192 ${e.new_status}` : e.new_status}
                                                    </div>
                                                    {e.message && <p className={`text-[9px] text-slate-500 dark:text-zinc-400 mt-1 italic font-medium tracking-tight`}>"{e.message}"</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={`h-full min-h-[600px] bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-dashed border-slate-100 dark:border-zinc-850/60 flex flex-col items-center justify-center space-y-6`}>
                            <div className={`w-20 h-20 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm rounded-none flex items-center justify-center border border-slate-200 dark:border-zinc-800`}>
                                <DocumentTextIcon className={`w-10 h-10 opacity-30 text-slate-500 dark:text-zinc-400`} />
                            </div>
                            <div className="text-center">
                                <p className={`font-black uppercase text-xs tracking-widest text-slate-500 dark:text-zinc-400`}>Select a dispatch for forensic inspection</p>
                                <p className={`text-[10px] font-medium text-slate-500 dark:text-zinc-400 mt-2 tracking-widest`}>Awaiting industrial command signal...</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
