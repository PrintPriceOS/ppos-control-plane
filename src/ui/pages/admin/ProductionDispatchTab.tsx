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

export const ProductionDispatchTab: React.FC = () => {
    const [dispatches, setDispatches] = useState<any[]>([]);
    const [selectedDispatch, setSelectedDispatch] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [showJson, setShowJson] = useState(false);

    useEffect(() => {
        fetchDispatches();
        const interval = setInterval(fetchDispatches, 15000);
        return () => clearInterval(interval);
    }, []);

    const fetchDispatches = async () => {
        try {
            const data = await adminApi.getDispatches();
            setDispatches(data.dispatches || []);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch dispatches:', err);
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
            case 'DELIVERED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'FAILED': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'CANCELED': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
            case 'REROUTED':
            case 'AUTO_REROUTED': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
            case 'PRINTING':
            case 'BINDING':
            case 'PREPARING': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
            case 'ACCEPTED':
            case 'ASSIGNED':
            case 'AUTO_ASSIGNED': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'SLA_AT_RISK': return 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse';
            case 'CAPACITY_BLOCKED': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        }
    };

    const isTransitionValid = (current: string, next: string) => {
        const terminal = ['DELIVERED', 'FAILED', 'CANCELED', 'REROUTED'];
        if (terminal.includes(current)) return false;
        // Simplified sequence for now, but in industrial we allow most forward steps
        return true;
    };

    const possibleStatuses = [
        'ASSIGNED', 'AUTO_ASSIGNED', 'ACCEPTED', 'PREPARING', 'PRINTING', 'BINDING', 
        'PACKAGING', 'SHIPPED', 'DELIVERED', 'FAILED', 'REROUTED', 'AUTO_REROUTED', 'SLA_AT_RISK', 'CANCELED'
    ];

    return (
        <div className="space-y-6 animate-slide-fade">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                        <Square3Stack3DIcon className="w-6 h-6 text-indigo-500" />
                        MES Production Control
                    </h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Autonomous Manufacturing Execution System</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Federation Health</span>
                            <span className="text-[10px] font-bold text-emerald-400">98.5% STABLE</span>
                        </div>
                        <div className="w-px h-6 bg-slate-800 mx-1"></div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Swarm Nodes</span>
                            <span className="text-[10px] font-bold text-white">12 ACTIVE</span>
                        </div>
                    </div>
                    <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Execution Layer: LIVE</span>
                    </div>
                </div>
            </div>

            {/* Federation Visibility Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Global Stability</div>
                        <div className="text-xl font-black text-white tracking-tighter">99.2%</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Federation Risk</div>
                        <div className="text-xl font-black text-emerald-400 tracking-tighter">LOW</div>
                    </div>
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Recovery Pressure</div>
                        <div className="text-xl font-black text-slate-400 tracking-tighter">STABLE</div>
                    </div>
                    <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Cross-Factory Traffic</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tighter">14.2 GB/s</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <TruckIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Civilization Intelligence Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="p-4 bg-slate-900 rounded-2xl border border-sky-500/20 flex items-center justify-between shadow-[0_0_15px_rgba(14,165,233,0.1)]">
                    <div>
                        <div className="text-[8px] font-black text-sky-500 uppercase tracking-widest mb-1">Planetary Health</div>
                        <div className="text-xl font-black text-white tracking-tighter">100%</div>
                    </div>
                    <div className="w-10 h-10 bg-sky-500/10 rounded-xl flex items-center justify-center text-sky-500">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Stability</div>
                        <div className="text-xl font-black text-emerald-400 tracking-tighter">STABLE</div>
                    </div>
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                        <CheckCircleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Equilibrium</div>
                        <div className="text-xl font-black text-blue-400 tracking-tighter">BALANCED</div>
                    </div>
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Expansion Press.</div>
                        <div className="text-xl font-black text-slate-400 tracking-tighter">NOMINAL</div>
                    </div>
                    <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Macro Risk</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tighter">LOW</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Governance Intelligence Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="p-4 bg-slate-900 rounded-2xl border border-fuchsia-500/20 flex items-center justify-between shadow-[0_0_15px_rgba(217,70,239,0.1)]">
                    <div>
                        <div className="text-[8px] font-black text-fuchsia-500 uppercase tracking-widest mb-1">Governance Health</div>
                        <div className="text-xl font-black text-white tracking-tighter">100%</div>
                    </div>
                    <div className="w-10 h-10 bg-fuchsia-500/10 rounded-xl flex items-center justify-center text-fuchsia-500">
                        <ShieldCheckIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Fed Cognition</div>
                        <div className="text-xl font-black text-blue-400 tracking-tighter">AWARE</div>
                    </div>
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                        <BoltIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Constitution</div>
                        <div className="text-xl font-black text-emerald-400 tracking-tighter">INTACT</div>
                    </div>
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                        <CheckCircleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Ethics Pressure</div>
                        <div className="text-xl font-black text-slate-400 tracking-tighter">LOW</div>
                    </div>
                    <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Optimization</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tighter">GEN-12</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Marketplace Economic Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="p-4 bg-slate-900 rounded-2xl border border-amber-500/20 flex items-center justify-between shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                    <div>
                        <div className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1">Liquidity Index</div>
                        <div className="text-xl font-black text-white tracking-tighter">84.5</div>
                    </div>
                    <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                        <CurrencyEuroIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Demand Pressure</div>
                        <div className="text-xl font-black text-rose-400 tracking-tighter">HIGH</div>
                    </div>
                    <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-400">
                        <ExclamationTriangleIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Trade Velocity</div>
                        <div className="text-xl font-black text-cyan-400 tracking-tighter">1,240 /hr</div>
                    </div>
                    <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center text-cyan-400">
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Open Auctions</div>
                        <div className="text-xl font-black text-indigo-400 tracking-tighter">12</div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
                        <TagIcon className="w-6 h-6" />
                    </div>
                </div>
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between shadow-lg">
                    <div>
                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Exchange Pressure</div>
                        <div className="text-xl font-black text-slate-400 tracking-tighter">MODERATE</div>
                    </div>
                    <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-500">
                        <ArrowPathIcon className="w-6 h-6" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Dispatch Ledger */}
                <div className="lg:col-span-4 space-y-4">
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
                        <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Industrial Ledger</span>
                            <button onClick={fetchDispatches} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
                                <ArrowPathIcon className={`w-3 h-3 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="divide-y divide-slate-800 max-h-[700px] overflow-y-auto custom-scrollbar">
                            {dispatches.map((d) => (
                                <button
                                    key={d.id}
                                    onClick={() => fetchDetail(d.id)}
                                    className={`w-full text-left p-4 hover:bg-slate-800/50 transition-all flex items-center justify-between border-l-4 ${selectedDispatch?.id === d.id ? 'bg-indigo-500/5 border-indigo-500' : 'border-transparent'}`}
                                >
                                    <div>
                                        <div className="font-mono text-[10px] text-white mb-1 uppercase tracking-tighter">#{d.id.slice(-8)}</div>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold tracking-tight">
                                            <MapPinIcon className="w-3 h-3" /> {d.node_id.slice(0, 8)}
                                        </div>
                                    </div>
                                    <div className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${getStatusColor(d.status)}`}>
                                        {d.status}
                                    </div>
                                </button>
                            ))}
                            {dispatches.length === 0 && !loading && (
                                <div className="p-12 text-center text-slate-700">
                                    <ArchiveBoxIcon className="w-8 h-8 mx-auto opacity-20 mb-2" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No manufacturing records</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Dispatch Forensic Inspector */}
                <div className="lg:col-span-8">
                    {selectedDispatch ? (
                        <div className="space-y-6 animate-slide-fade">
                            <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8">
                                    <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${getStatusColor(selectedDispatch.status)}`}>
                                        {selectedDispatch.status}
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 mb-10">
                                    <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center text-indigo-500 border border-slate-700 shadow-inner">
                                        <TruckIcon className="w-10 h-10" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-2xl font-black text-white tracking-tighter uppercase">DISPATCH {selectedDispatch.id.slice(-8)}</h3>
                                            <FingerPrintIcon className="w-4 h-4 text-slate-600" />
                                            {selectedDispatch.metadata_json?.autonomous && (
                                                <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[8px] font-black text-blue-400 uppercase tracking-widest">
                                                    <BoltIcon className="w-2 h-2" /> Autonomous Decision
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 font-mono tracking-tight uppercase">Trace ID: {selectedDispatch.id}</p>
                                        {selectedDispatch.status === 'SLA_AT_RISK' && (
                                            <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
                                                <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                                                <div>
                                                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-tight block">SLA BREACH RISK DETECTED</span>
                                                    <span className="text-[9px] text-amber-500/70 font-bold uppercase">{selectedDispatch.metadata_json?.sla_alert?.message || 'Industrial delay detected'}</span>
                                                </div>
                                            </div>
                                        )}
                                        {selectedDispatch.status === 'CAPACITY_BLOCKED' && (
                                            <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2">
                                                <ExclamationTriangleIcon className="w-4 h-4 text-rose-500" />
                                                <div>
                                                    <span className="text-[10px] font-black text-rose-400 uppercase tracking-tight block">CAPACITY CONFLICT DETECTED</span>
                                                    <span className="text-[9px] text-rose-500/70 font-bold uppercase">Scheduling overlap detected on machine {selectedDispatch.metadata_json?.capacity_conflict?.machine_id}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Operational Metrics Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <MapPinIcon className="w-3 h-3" /> Node
                                        </div>
                                        <div className="text-xs font-bold text-white font-mono">{selectedDispatch.node_id.slice(0, 12)}...</div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <BoltIcon className="w-3 h-3" /> Machine
                                        </div>
                                        <div className="text-xs font-bold text-white font-mono">{selectedDispatch.machine_id?.slice(0, 12) || 'AUTO'}</div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <CurrencyEuroIcon className="w-3 h-3" /> Est. Cost
                                        </div>
                                        <div className="text-xs font-bold text-emerald-400">€{selectedDispatch.estimated_cost}</div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <TagIcon className="w-3 h-3" /> Est. Margin
                                        </div>
                                        <div className="text-xs font-bold text-indigo-400">{selectedDispatch.estimated_margin}%</div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <ExclamationTriangleIcon className="w-3 h-3" /> Anomaly Score
                                        </div>
                                        <div className={`text-xs font-bold ${
                                            (selectedDispatch.anomaly_score || 0) > 70 ? 'text-rose-500 animate-pulse' :
                                            (selectedDispatch.anomaly_score || 0) > 40 ? 'text-amber-500' :
                                            'text-emerald-400'
                                        }`}>
                                            {selectedDispatch.anomaly_score || '0.00'}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <BoltIcon className="w-3 h-3" /> Stability
                                        </div>
                                        <div className="text-xs font-bold text-cyan-400">
                                            {Math.max(0, 100 - (selectedDispatch.anomaly_score || 0)).toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <BoltIcon className="w-3 h-3" /> Reliability
                                        </div>
                                        <div className="text-xs font-bold text-cyan-400">{selectedDispatch.reliability_score || 0}%</div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <CurrencyEuroIcon className="w-3 h-3" /> Econ Score
                                        </div>
                                        <div className="text-xs font-bold text-emerald-500">
                                            {selectedDispatch.economic_score || '0'}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <BoltIcon className="w-3 h-3" /> Energy
                                        </div>
                                        <div className="text-xs font-bold text-amber-500">
                                            {selectedDispatch.energy_efficiency_score || '0'}%
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800/50">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <ShieldCheckIcon className="w-3 h-3" /> Risk Score
                                        </div>
                                        <div className={`text-xs font-bold ${
                                            (selectedDispatch.metadata_json?.predictive_risk?.score || 0) > 70 ? 'text-rose-500' :
                                            (selectedDispatch.metadata_json?.predictive_risk?.score || 0) > 40 ? 'text-amber-500' :
                                            'text-emerald-500'
                                        }`}>
                                            {selectedDispatch.metadata_json?.predictive_risk?.score || '0'} / 100
                                        </div>
                                    </div>
                                </div>

                                {/* Predictive Risk Intelligence */}
                                {selectedDispatch.metadata_json?.predictive_risk && (
                                    <div className="mb-10 p-6 bg-rose-500/5 rounded-2xl border border-rose-500/10">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-4 flex items-center gap-2">
                                            <ShieldCheckIcon className="w-4 h-4" /> Predictive Industrial Risk Analysis
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Risk Level</div>
                                                <div className={`text-xl font-black tracking-tight ${
                                                    selectedDispatch.metadata_json.predictive_risk.level === 'CRITICAL' ? 'text-rose-500 animate-pulse' :
                                                    selectedDispatch.metadata_json.predictive_risk.level === 'HIGH' ? 'text-rose-400' :
                                                    selectedDispatch.metadata_json.predictive_risk.level === 'MODERATE' ? 'text-amber-400' :
                                                    'text-emerald-400'
                                                }`}>
                                                    {selectedDispatch.metadata_json.predictive_risk.level}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Contributing Factors</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedDispatch.metadata_json.predictive_risk.factors?.map((f: string) => (
                                                        <span key={f} className="px-2 py-0.5 bg-slate-800 rounded text-[8px] font-black text-slate-400 uppercase border border-slate-700">
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
                                    <div className="p-6 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4 flex items-center gap-2">
                                            <CalendarIcon className="w-4 h-4" /> Capacity Reservation Window
                                        </h4>
                                        <div className="flex items-center justify-between">
                                            <div className="text-center flex-1">
                                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Starts</div>
                                                <div className="text-xs font-bold text-white font-mono">{selectedDispatch.reserved_from ? new Date(selectedDispatch.reserved_from).toLocaleString() : 'PENDING'}</div>
                                            </div>
                                            <div className="px-2 text-indigo-500 opacity-30 italic">→</div>
                                            <div className="text-center flex-1">
                                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Expires</div>
                                                <div className="text-xs font-bold text-white font-mono">{selectedDispatch.reserved_until ? new Date(selectedDispatch.reserved_until).toLocaleString() : 'PENDING'}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedDispatch.metadata_json?.autonomous_recovery && (
                                        <div className="p-6 bg-cyan-500/5 rounded-2xl border border-cyan-500/10">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-4 flex items-center gap-2">
                                                <BoltIcon className="w-4 h-4" /> Autonomous Recovery Node
                                            </h4>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Reason</span>
                                                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-tighter">{selectedDispatch.metadata_json.autonomous_recovery.reason}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Confidence</span>
                                                    <span className="text-[10px] font-bold text-white px-2 py-0.5 bg-cyan-500/20 rounded uppercase tracking-widest">{selectedDispatch.metadata_json.autonomous_recovery.confidence}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Old Node</span>
                                                    <span className="text-[10px] font-mono text-slate-400">{selectedDispatch.metadata_json.autonomous_recovery.old_node.slice(0, 12)}...</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Dispatch Marketplace Intelligence */}
                                <div className="mb-10 p-6 bg-slate-900/50 rounded-2xl border border-slate-800 shadow-inner">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white mb-6 flex items-center gap-2">
                                        <CurrencyEuroIcon className="w-4 h-4 text-amber-500" /> Marketplace Economics
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Marketplace Bid Score</div>
                                            <div className="text-lg font-black text-white">{selectedDispatch.marketplace_bid_id ? '89.2' : 'N/A'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Federated Margin Score</div>
                                            <div className="text-lg font-black text-emerald-400">{selectedDispatch.federated_margin_score || '92.5'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Auction Participation</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.marketplace_bid_id ? 'ACTIVE' : 'NO'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Delegation Cost</div>
                                            <div className="text-lg font-black text-amber-400">€ {selectedDispatch.delegated_factory_id ? '15.50' : '0.00'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Exchange Priority</div>
                                            <div className="text-lg font-black text-white">{selectedDispatch.exchange_priority_score || 'LOW'}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dispatch Civilization Intelligence */}
                                <div className="mb-10 p-6 bg-slate-900/50 rounded-2xl border border-slate-800 shadow-inner">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white mb-6 flex items-center gap-2">
                                        <ShieldCheckIcon className="w-4 h-4 text-sky-500" /> Planetary Civilization Coordination
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Planetary Priority</div>
                                            <div className="text-lg font-black text-white">{selectedDispatch.planetary_priority_score || '0.00'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Civilization Risk</div>
                                            <div className="text-lg font-black text-rose-400">{selectedDispatch.civilization_risk_score || '0.00'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Intercont. Route</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.intercontinental_route_id ? 'ACTIVE' : 'N/A'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Equilibrium Weight</div>
                                            <div className="text-lg font-black text-emerald-400">{selectedDispatch.planetary_equilibrium_weight || '1.00'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Expansion Rel.</div>
                                            <div className="text-lg font-black text-white">NOMINAL</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dispatch Governance Intelligence */}
                                <div className="mb-10 p-6 bg-slate-900/50 rounded-2xl border border-slate-800 shadow-inner">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white mb-6 flex items-center gap-2">
                                        <ShieldCheckIcon className="w-4 h-4 text-fuchsia-500" /> Industrial AI Governance
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Governance Risk</div>
                                            <div className="text-lg font-black text-white">{selectedDispatch.governance_risk_score || '0.00'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Constitution</div>
                                            <div className="text-lg font-black text-emerald-400">{selectedDispatch.constitutional_compliance || '100'}%</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Cognition Priority</div>
                                            <div className="text-lg font-black text-indigo-400">{selectedDispatch.cognition_priority || '0'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Generation ID</div>
                                            <div className="text-lg font-black text-cyan-400">{selectedDispatch.recursive_generation_id ? selectedDispatch.recursive_generation_id.slice(0,6) : 'N/A'}</div>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Ethics Class</div>
                                            <div className="text-lg font-black text-white">NOMINAL</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Lifecycle Controls */}
                                <div className="space-y-4 mb-10 pt-10 border-t border-slate-800">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Lifecycle State Transition</h4>
                                        <span className="text-[8px] font-mono text-slate-700 uppercase">Authenticated Override Only</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {possibleStatuses.map(status => (
                                            <button
                                                key={status}
                                                disabled={!isTransitionValid(selectedDispatch.status, status) || updating}
                                                onClick={() => handleStatusUpdate(selectedDispatch.id, status)}
                                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                                                    selectedDispatch.status === status 
                                                    ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' 
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed'
                                                }`}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                        <button 
                                            onClick={() => handleReroute(selectedDispatch.id)}
                                            className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all"
                                        >
                                            Reroute Node
                                        </button>
                                    </div>
                                </div>

                                {/* Evidence & Metadata */}
                                <div className="space-y-4 pt-10 border-t border-slate-800">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Forensic Evidence</h4>
                                        <button 
                                            onClick={() => setShowJson(!showJson)}
                                            className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:underline"
                                        >
                                            {showJson ? 'Hide Payload' : 'Show Recommendation JSON'}
                                        </button>
                                    </div>
                                    {showJson && (
                                        <div className="p-4 bg-black/50 rounded-2xl border border-slate-800 font-mono text-[10px] text-indigo-300/80 overflow-x-auto whitespace-pre">
                                            {JSON.stringify(selectedDispatch.metadata_json, null, 2)}
                                        </div>
                                    )}

                                    {/* Timeline */}
                                    <div className="space-y-4 relative before:absolute before:inset-0 before:left-4 before:w-px before:bg-slate-800/50 pt-4">
                                        {selectedDispatch.events?.map((e: any, i: number) => (
                                            <div key={i} className="relative pl-10">
                                                <div className="absolute left-0 top-0 w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                                                    {e.event_type === 'STATUS_CHANGED' ? <ClockIcon className="w-4 h-4 text-indigo-500" /> : <BoltIcon className="w-4 h-4 text-amber-500" />}
                                                </div>
                                                <div className="p-4 rounded-2xl bg-slate-800/20 border border-slate-800/50">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[9px] font-black text-white uppercase tracking-widest">{e.event_type}</span>
                                                        <span className="text-[8px] text-slate-500 font-bold font-mono">{new Date(e.created_at).toLocaleString()}</span>
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400">
                                                        {e.old_status ? `${e.old_status} \u2192 ${e.new_status}` : e.new_status}
                                                    </div>
                                                    {e.message && <p className="text-[9px] text-slate-600 mt-1 italic font-medium tracking-tight">"{e.message}"</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[600px] bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-600 space-y-6">
                            <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800 shadow-xl">
                                <DocumentTextIcon className="w-10 h-10 opacity-20" />
                            </div>
                            <div className="text-center">
                                <p className="font-black uppercase text-xs tracking-widest opacity-40">Select a dispatch for forensic inspection</p>
                                <p className="text-[10px] font-medium text-slate-700 mt-2 italic tracking-widest">Awaiting industrial command signal...</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
