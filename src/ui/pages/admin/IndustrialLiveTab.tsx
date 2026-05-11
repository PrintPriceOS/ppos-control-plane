/**
 * src/ui/pages/admin/IndustrialLiveTab.tsx
 * 
 * Phase 28 - Live Autonomous Dispatch Orchestration.
 * Global operational dashboard for industrial execution.
 */
import React from 'react';
import { useAdminQuery } from '../../hooks/useAdminData';
import { 
    getIndustrialLiveState, 
    getActiveDispatches, 
    getLiveSLARisks, 
    getRerouteEvents, 
    getLiveCapacity,
    triggerSLAScan,
    triggerRebalance
} from '../../lib/adminApi';
import { 
    ServerIcon, 
    ArrowPathIcon, 
    ExclamationCircleIcon, 
    QueueListIcon,
    BoltIcon,
    ShieldCheckIcon
} from '@heroicons/react/24/outline';

import { MachineDetailDrawer } from '../../components/MachineDetailDrawer';

export const IndustrialLiveTab: React.FC = () => {
    const liveState = useAdminQuery('industrial-live-state', getIndustrialLiveState, 5000);
    const activeDispatches = useAdminQuery('active-dispatches', getActiveDispatches, 5000);
    const slaRisks = useAdminQuery('sla-risks-live', getLiveSLARisks, 10000);
    const reroutes = useAdminQuery('reroute-events', getRerouteEvents, 10000);
    const capacity = useAdminQuery('capacity-live', getLiveCapacity, 5000);

    const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

    const openMachine = (id: string) => {
        setSelectedMachineId(id);
        setIsDrawerOpen(true);
    };

    const handleScan = async () => {
        await triggerSLAScan();
        slaRisks.refetch();
    };

    const handleRebalance = async () => {
        await triggerRebalance();
        reroutes.refetch();
        activeDispatches.refetch();
    };

    return (
        <div className="space-y-8 pb-20">
            {/* Header Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100">
                        <BoltIcon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Live Orchestration Loop</h2>
                        <p className="text-xs text-slate-500 font-medium">Autonomous dispatch and SLA monitoring active.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleScan}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
                    >
                        <ArrowPathIcon className="w-4 h-4" />
                        RUN SLA SCAN
                    </button>
                    <button 
                        onClick={handleRebalance}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-sm"
                    >
                        <BoltIcon className="w-4 h-4" />
                        AUTO REBALANCE
                    </button>
                </div>
            </div>

            {/* Industrial Heatmap & Risks */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Capacity Heatmap */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <ServerIcon className="w-4 h-4" />
                        Global Capacity Heatmap (Live Telemetry)
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {(capacity.data?.overview || []).map((node: any) => (
                            <button 
                                key={node.node_id} 
                                onClick={() => openMachine(node.node_id)}
                                className="p-4 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-blue-500 hover:bg-white hover:shadow-xl transition-all text-left"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className={`w-2 h-2 rounded-full ${node.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    <span className="text-[10px] font-black text-slate-400 uppercase">{node.city || 'GLOBAL'}</span>
                                </div>
                                <p className="text-sm font-black text-slate-800 mb-1 truncate">{node.company_name}</p>
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{node.freshness_state} LOAD</span>
                                        <span className="text-[10px] font-black text-slate-900">{node.utilization_pct}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-1000 ${
                                                node.utilization_pct > 90 ? 'bg-red-500' : 
                                                node.utilization_pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`} 
                                            style={{ width: `${node.utilization_pct}%` }} 
                                        />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Live SLA Risks */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <ExclamationCircleIcon className="w-4 h-4" />
                        Evidence-Backed SLA Risks
                    </h3>
                    <div className="space-y-4">
                        {(slaRisks.data?.risks || []).map((risk: any) => (
                            <div 
                                key={risk.dispatch_id} 
                                onClick={() => openMachine(risk.node_id)}
                                className="p-4 rounded-2xl bg-slate-50 border border-slate-100 relative overflow-hidden group cursor-pointer hover:border-amber-500 transition-all"
                            >
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                    risk.risk_level === 'CRITICAL' ? 'bg-red-500' : 
                                    risk.risk_level === 'HIGH' ? 'bg-amber-500' : 'bg-blue-500'
                                }`} />
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">#{risk.dispatch_id.slice(-8)}</span>
                                    <div className="flex items-center gap-1">
                                        <ShieldCheckIcon className="w-3 h-3 text-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-600 uppercase">{risk.evidence_count} Proofs</span>
                                    </div>
                                </div>
                                <p className="text-xs font-black text-slate-800 mb-1">{risk.node_name}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">DRIFT: +{risk.sla_drift_minutes}m</span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                        risk.risk_level === 'CRITICAL' ? 'bg-red-100 text-red-700' : 
                                        risk.risk_level === 'HIGH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {risk.risk_level}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {(!slaRisks.data?.risks || slaRisks.data.risks.length === 0) && (
                            <div className="text-center py-10">
                                <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <ShieldCheckIcon className="w-5 h-5 text-slate-300" />
                                </div>
                                <p className="text-xs font-bold text-slate-400">All dispatches within SLA.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Active Dispatch Queue */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <QueueListIcon className="w-4 h-4" />
                        Active Industrial Dispatch Queue
                    </h3>
                    <span className="text-[10px] font-black px-2 py-1 bg-slate-100 text-slate-600 rounded-lg">
                        {activeDispatches.data?.dispatches?.length || 0} ACTIVE
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Dispatch ID</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Target Node</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">SLA ETA</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {(activeDispatches.data?.dispatches || []).map((d: any) => (
                                <tr 
                                    key={d.id} 
                                    onClick={() => openMachine(d.print_node_id)}
                                    className="hover:bg-slate-50 cursor-pointer transition-all"
                                >
                                    <td className="px-6 py-4 text-xs font-mono font-bold text-blue-600">#{d.id.slice(0, 12)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-800">{d.node_name}</span>
                                            <span className="text-[10px] text-slate-400 font-bold uppercase">{d.receiver_tenant_id}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                                            d.status === 'IN_PRODUCTION' ? 'bg-emerald-50 text-emerald-600' :
                                            d.status === 'ALLOCATED' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {d.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                        {(() => {
                                            if (!d.sla_estimate_json) return '—';
                                            try {
                                                const est = typeof d.sla_estimate_json === 'string' 
                                                    ? JSON.parse(d.sla_estimate_json) 
                                                    : d.sla_estimate_json;
                                                return new Date(est.estimated_completion).toLocaleDateString();
                                            } catch (e) {
                                                return 'ERR';
                                            }
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 text-[10px] font-bold text-slate-400">{new Date(d.created_at).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Reroute Timeline */}
            <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Autonomous Reroute & Event Log</h3>
                <div className="space-y-3">
                    {(reroutes.data?.events || []).map((e: any) => (
                        <div key={e.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center justify-between hover:shadow-md transition-all">
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-xl ${e.event_type === 'AUTONOMOUS_REROUTE' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {e.event_type === 'AUTONOMOUS_REROUTE' ? <BoltIcon className="w-5 h-5" /> : <ExclamationCircleIcon className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-800">{e.message}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{e.event_type} • {new Date(e.created_at).toLocaleTimeString()}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Impact</p>
                                <p className="text-xs font-bold text-emerald-500">SLA PRESERVED</p>
                            </div>
                        </div>
                    ))}
                    {(reroutes.data?.events || []).length === 0 && (
                        <div className="py-10 text-center opacity-30">
                            <p className="text-[10px] font-black uppercase tracking-widest">No Autonomous Events Logged</p>
                        </div>
                    )}
                </div>
            </div>

            <MachineDetailDrawer 
                isOpen={isDrawerOpen} 
                machineId={selectedMachineId} 
                onClose={() => setIsDrawerOpen(false)} 
            />
        </div>
    );
};
