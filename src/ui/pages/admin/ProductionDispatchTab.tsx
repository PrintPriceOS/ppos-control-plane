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
    MapPinIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";

export const ProductionDispatchTab: React.FC = () => {
    const [dispatches, setDispatches] = useState<any[]>([]);
    const [selectedDispatch, setSelectedDispatch] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDispatches();
        const interval = setInterval(fetchDispatches, 10000);
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
        try {
            const data = await adminApi.getDispatchDetail(id);
            setSelectedDispatch(data.dispatch || null);
        } catch (err) {
            console.error('Failed to fetch dispatch detail:', err);
        }
    };

    const handleStatusUpdate = async (id: string, status: string) => {
        try {
            await adminApi.updateDispatchStatus(id, status, 'Manual status override');
            fetchDetail(id);
            fetchDispatches();
        } catch (err) {
            alert(`Failed to update status: ${err}`);
        }
    };

    const handleReroute = async (id: string) => {
        const reason = prompt('Reason for reroute?');
        if (!reason) return;
        try {
            await adminApi.rerouteDispatch(id, reason);
            fetchDetail(id);
            fetchDispatches();
        } catch (err) {
            alert(`Reroute failed: ${err}`);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DELIVERED': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'FAILED': return 'bg-red-50 text-red-600 border-red-100';
            case 'CANCELED':
            case 'REROUTED': return 'bg-slate-50 text-slate-600 border-slate-100';
            case 'PRINTING':
            case 'BINDING': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
            default: return 'bg-blue-50 text-blue-600 border-blue-100';
        }
    };

    return (
        <div className="space-y-6 animate-slide-fade">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <TruckIcon className="w-6 h-6 text-indigo-600" />
                        Production Dispatch Control
                    </h2>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Active manufacturing lifecycle & logistics tracking.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Dispatch List */}
                <div className="lg:col-span-4 space-y-4">
                    <div className="glass rounded-2xl border border-white overflow-hidden shadow-sm">
                        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Dispatches</span>
                            <button onClick={fetchDispatches} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
                                <ArrowPathIcon className="w-3 h-3 text-slate-500" />
                            </button>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                            {dispatches.map((d) => (
                                <button
                                    key={d.id}
                                    onClick={() => fetchDetail(d.id)}
                                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center justify-between ${selectedDispatch?.id === d.id ? 'bg-indigo-50/50 border-r-2 border-indigo-500' : ''}`}
                                >
                                    <div>
                                        <div className="font-bold text-slate-900 text-xs mb-1">DISP-{d.id.slice(5, 13)}</div>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                            <MapPinIcon className="w-3 h-3" /> Node {d.printer_id.slice(0, 8)}
                                        </div>
                                    </div>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${getStatusColor(d.status)}`}>
                                        {d.status}
                                    </span>
                                </button>
                            ))}
                            {dispatches.length === 0 && (
                                <div className="p-10 text-center text-slate-300">
                                    <ArchiveBoxIcon className="w-8 h-8 mx-auto opacity-20 mb-2" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No active dispatches</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Dispatch Inspector */}
                <div className="lg:col-span-8">
                    {selectedDispatch ? (
                        <div className="space-y-6">
                            <div className="glass rounded-3xl border border-white p-8 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8">
                                    <div className={`px-4 py-1.5 rounded-full border text-xs font-black uppercase tracking-widest ${getStatusColor(selectedDispatch.status)}`}>
                                        {selectedDispatch.status}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-2xl font-black">
                                        <TruckIcon className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Dispatch {selectedDispatch.id}</h3>
                                        <p className="text-sm text-slate-500 font-medium tracking-tight">Created {new Date(selectedDispatch.created_at).toLocaleString()}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 pt-8 border-t border-slate-100">
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Printhouse</div>
                                        <div className="text-sm font-bold text-slate-800">{selectedDispatch.printer_id}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Machine</div>
                                        <div className="text-sm font-bold text-slate-800">{selectedDispatch.machine_id}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Est. Cost</div>
                                        <div className="text-sm font-bold text-emerald-600">€{selectedDispatch.estimated_cost}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target SLA</div>
                                        <div className="text-sm font-bold text-amber-600">{selectedDispatch.sla_deadline ? new Date(selectedDispatch.sla_deadline).toLocaleDateString() : 'N/A'}</div>
                                    </div>
                                </div>

                                <div className="flex gap-2 mb-8">
                                    <select 
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none"
                                        onChange={(e) => handleStatusUpdate(selectedDispatch.id, e.target.value)}
                                        value={selectedDispatch.status}
                                    >
                                        <option value="ASSIGNED">ASSIGNED</option>
                                        <option value="ACCEPTED">ACCEPTED</option>
                                        <option value="PRINTING">PRINTING</option>
                                        <option value="BINDING">BINDING</option>
                                        <option value="SHIPPED">SHIPPED</option>
                                        <option value="DELIVERED">DELIVERED</option>
                                        <option value="FAILED">FAILED</option>
                                    </select>
                                    <button 
                                        onClick={() => handleReroute(selectedDispatch.id)}
                                        className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 text-xs font-black uppercase tracking-widest hover:bg-amber-100 transition-colors"
                                    >
                                        <ArrowPathIcon className="w-4 h-4" /> Reroute Dispatch
                                    </button>
                                </div>

                                {/* Timeline */}
                                <div className="space-y-6 pt-8 border-t border-slate-100">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Activity Timeline</h4>
                                    <div className="space-y-6 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-100">
                                        {selectedDispatch.events?.map((e: any, i: number) => (
                                            <div key={i} className="relative pl-12">
                                                <div className="absolute left-0 top-0 w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                                                    {e.event_type === 'STATUS_CHANGED' ? <ClockIcon className="w-5 h-5 text-indigo-500" /> : <BoltIcon className="w-5 h-5 text-amber-500" />}
                                                </div>
                                                <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{e.event_type}</span>
                                                        <span className="text-[9px] text-slate-400 font-medium">{new Date(e.created_at).toLocaleString()}</span>
                                                    </div>
                                                    <div className="text-xs font-bold text-slate-600">
                                                        {e.from_status ? `${e.from_status} → ${e.to_status}` : e.to_status}
                                                    </div>
                                                    {e.message && <p className="text-[10px] text-slate-400 mt-1 italic">{e.message}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[500px] glass rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-4">
                            <ArchiveBoxIcon className="w-12 h-12 opacity-20" />
                            <p className="font-black uppercase text-xs tracking-widest opacity-40">Select a dispatch to inspect details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
