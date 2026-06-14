/**
 * src/ui/pages/admin/IndustrialLiveTab.tsx
 * 
 * Phase 28 - Live Autonomous Dispatch Orchestration.
 * Global operational dashboard for industrial execution.
 */
import React from 'react';
import { safeArray } from '../../lib/display';
import { useAdminQuery } from '../../hooks/useAdminData';
import { 
    getIndustrialLiveState, 
    getActiveDispatches, 
    getLiveSLARisks, 
    getRerouteEvents, 
    getLiveCapacity,
    triggerSLAScan,
    triggerRebalance,
    getPrinthouses
} from '../../lib/adminApi';
import { 
    ServerIcon, 
    ArrowPathIcon, 
    ExclamationCircleIcon, 
    QueueListIcon,
    BoltIcon,
    ShieldCheckIcon,
    XMarkIcon,
    PlusIcon
} from '@heroicons/react/24/outline';

import { MachineDetailDrawer } from '../../components/MachineDetailDrawer';
import { MachineCapabilityEditor } from '../printhouse/MachineCapabilityEditor';
import { listMachines } from '../../api/printhouseCapabilitiesClient';

export const IndustrialLiveTab: React.FC = () => {
    const liveState = useAdminQuery('industrial-live-state', getIndustrialLiveState, 5000);
    const activeDispatches = useAdminQuery('active-dispatches', getActiveDispatches, 5000);
    const slaRisks = useAdminQuery('sla-risks-live', getLiveSLARisks, 10000);
    const reroutes = useAdminQuery('reroute-events', getRerouteEvents, 10000);
    const capacity = useAdminQuery('capacity-live', getLiveCapacity, 5000);

    const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
    
    const [isOnboardOpen, setIsOnboardOpen] = React.useState(false);
    const [printhouses, setPrinthouses] = React.useState<any[]>([]);
    const [selectedPrinthouseId, setSelectedPrinthouseId] = React.useState<string>('');
    const [editingMachine, setEditingMachine] = React.useState<any>(null);

    React.useEffect(() => {
        if (isOnboardOpen) {
            getPrinthouses().then(data => {
                const normalized = (data || []).map((p: any) => ({
                    ...p,
                    id: p.id || p._id || p.printer_id || p.node_id || p.tenant_id,
                    name: p.name || p.company_name || p.companyName || p.id
                }));
                setPrinthouses(normalized);
                if (normalized.length > 0 && !selectedPrinthouseId) {
                    setSelectedPrinthouseId(normalized[0].id);
                }
            });
        }
    }, [isOnboardOpen, selectedPrinthouseId]);

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
        <div className="space-y-8 pb-20 italic-text-off">
            {/* Header Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 glass border border-zinc-800 bg-zinc-950/40">
                        <BoltIcon className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight">Live Orchestration Loop</h2>
                        <p className="text-xs text-zinc-500 font-medium">Autonomous dispatch and SLA monitoring active.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => { setEditingMachine(null); setSelectedPrinthouseId(''); setIsOnboardOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-none"
                    >
                        <PlusIcon className="w-4 h-4 text-white" />
                        ONBOARD FLEET UNIT
                    </button>
                    <button 
                        onClick={handleScan}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-900/20 text-zinc-200 text-xs font-bold border border-zinc-700 hover:border-zinc-400 transition-colors shadow-none"
                    >
                        <ArrowPathIcon className="w-4 h-4" />
                        RUN SLA SCAN
                    </button>
                    <button 
                        onClick={handleRebalance}
                        className="flex items-center gap-2 px-4 py-2 bg-[#dc0000] text-white text-xs font-bold hover:bg-[#dc0000]/90 transition-colors shadow-none"
                    >
                        <BoltIcon className="w-4 h-4 text-white" />
                        AUTO REBALANCE
                    </button>
                </div>
            </div>

            {/* Industrial Heatmap & Risks */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Capacity Heatmap */}
                <div className="lg:col-span-2 glass border border-zinc-800 bg-zinc-950/40 p-6">
                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <ServerIcon className="w-4 h-4" />
                        Global Capacity Heatmap (Live Telemetry)
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {safeArray(capacity.data?.overview ?? []).map((node: any) => (
                            <div 
                                key={node.node_id} 
                                className="p-4 bg-zinc-900/20 border border-zinc-800 group hover:border-[#dc0000] hover:bg-zinc-900/50 transition-all text-left rounded-none flex flex-col justify-between"
                            >
                                <div className="cursor-pointer" onClick={() => openMachine(node.node_id)}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className={`w-2 h-2 rounded-none ${node.status === 'ONLINE' ? 'bg-[#10B981]' : 'bg-[#dc0000]'}`} />
                                        <span className="text-[10px] font-black text-zinc-500 uppercase">{node.city || 'GLOBAL'}</span>
                                    </div>
                                    <p className="text-sm font-black text-white mb-1 truncate">{node.company_name}</p>
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-bold text-zinc-500 uppercase">{node.freshness_state} LOAD</span>
                                            <span className="text-[10px] font-mono font-black text-white tracking-tight">{node.utilization_pct}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-zinc-950/40 rounded-none overflow-hidden">
                                            <div 
                                                className={`h-full rounded-none transition-all duration-1000 ${
                                                    node.utilization_pct > 90 ? 'bg-[#dc0000]' : 
                                                    node.utilization_pct > 70 ? 'bg-amber-500' : 'bg-[#10B981]'
                                                }`} 
                                                style={{ width: `${node.utilization_pct}%` }} 
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-2 border-t border-zinc-800 flex justify-end">
                                    <button
                                        onClick={async () => {
                                            if (!node.printhouse_id) {
                                                alert('Printhouse association not found for this node.');
                                                return;
                                            }
                                            try {
                                                const res = await listMachines(node.printhouse_id);
                                                if (res.ok && res.machines) {
                                                    const found = res.machines.find((x: any) => x.id === node.node_id);
                                                    if (found) {
                                                        setEditingMachine(found);
                                                        setIsOnboardOpen(true);
                                                    } else {
                                                        alert('Machine specifications not found in capabilities registry.');
                                                    }
                                                }
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        }}
                                        className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors"
                                    >
                                        Edit Specs
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Live SLA Risks */}
                <div className="glass border border-zinc-800 bg-zinc-950/40 p-6">
                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <ExclamationCircleIcon className="w-4 h-4" />
                        Evidence-Backed SLA Risks
                    </h3>
                    <div className="space-y-4">
                        {safeArray(slaRisks.data?.risks ?? []).map((risk: any) => (
                            <div 
                                key={risk.dispatch_id} 
                                onClick={() => openMachine(risk.node_id)}
                                className="p-4 rounded-none bg-zinc-900/20 border border-zinc-800 relative overflow-hidden group cursor-pointer hover:border-amber-500 transition-all"
                            >
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                                    risk.risk_level === 'CRITICAL' ? 'bg-[#dc0000]' : 
                                    risk.risk_level === 'HIGH' ? 'bg-amber-500' : 'bg-blue-500'
                                }`} />
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-tight">#{String(risk?.dispatch_id || '').slice(-8)}</span>
                                    <div className="flex items-center gap-1">
                                        <ShieldCheckIcon className="w-3 h-3 text-[#10B981]" />
                                        <span className="text-[10px] font-bold text-[#10B981] uppercase">{risk.evidence_count} Proofs</span>
                                    </div>
                                </div>
                                <p className="text-xs font-black text-white mb-1">{risk.node_name}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">DRIFT: +{risk.sla_drift_minutes}m</span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-none border ${
                                        risk.risk_level === 'CRITICAL' ? 'bg-[#dc0000]/10 text-[#dc0000] border-[#dc0000]/20' : 
                                        risk.risk_level === 'HIGH' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                    }`}>
                                        {risk.risk_level}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {(!slaRisks.data?.risks || slaRisks.data.risks.length === 0) && (
                            <div className="text-center py-10">
                                <div className="w-10 h-10 bg-zinc-900/20 rounded-none flex items-center justify-center mx-auto mb-3 border border-zinc-800">
                                    <ShieldCheckIcon className="w-5 h-5 text-zinc-500" />
                                </div>
                                <p className="text-xs font-bold text-zinc-500">All dispatches within SLA.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Active Dispatch Queue */}
            <div className="glass border border-zinc-800 bg-zinc-950/40 rounded-none overflow-hidden">
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <QueueListIcon className="w-4 h-4" />
                        Active Industrial Dispatch Queue
                    </h3>
                    <span className="text-[10px] font-mono font-black px-2 py-1 bg-zinc-900/20 text-zinc-400 border border-zinc-800 rounded-none">
                        {activeDispatches.data?.dispatches?.length || 0} ACTIVE
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-zinc-900/20 border-b border-zinc-800">
                                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Dispatch ID</th>
                                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Target Node</th>
                                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">SLA ETA</th>
                                <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {safeArray(activeDispatches.data?.dispatches ?? []).map((d: any) => (
                                <tr 
                                    key={d.id} 
                                    onClick={() => openMachine(d.print_node_id)}
                                    className="hover:bg-zinc-900/50 cursor-pointer transition-colors"
                                >
                                    <td className="px-6 py-4 text-xs font-mono font-bold text-blue-500">#{String(d?.id || '').slice(0, 12)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-white">{d.node_name}</span>
                                            <span className="text-[10px] text-zinc-500 font-bold uppercase">{d.receiver_tenant_id}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-none border text-[10px] font-black uppercase ${
                                            d.status === 'IN_PRODUCTION' ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20' :
                                            d.status === 'ALLOCATED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-zinc-900/20 text-zinc-500 border-zinc-800'
                                        }`}>
                                            {d.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-zinc-400">
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
                                    <td className="px-6 py-4 text-[10px] font-bold text-zinc-500">{new Date(d.created_at).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Reroute Timeline */}
            <div className="glass border border-zinc-800 bg-zinc-950/40 p-6">
                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-6">Autonomous Reroute &amp; Event Log</h3>
                <div className="space-y-3">
                    {safeArray(reroutes.data?.events ?? []).map((e: any) => (
                        <div key={e.id} className="p-4 bg-zinc-900/20 rounded-none border border-zinc-800 flex items-center justify-between transition-all">
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-none border ${e.event_type === 'AUTONOMOUS_REROUTE' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                                    {e.event_type === 'AUTONOMOUS_REROUTE' ? <BoltIcon className="w-5 h-5" /> : <ExclamationCircleIcon className="w-5 h-5" />}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-white">{e.message}</p>
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase">{e.event_type} • {new Date(e.created_at).toLocaleTimeString()}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Impact</p>
                                <p className="text-xs font-bold text-[#10B981]">SLA PRESERVED</p>
                            </div>
                        </div>
                    ))}
                    {(reroutes.data?.events || []).length === 0 && (
                        <div className="py-10 text-center opacity-30">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">No Autonomous Events Logged</p>
                        </div>
                    )}
                </div>
            </div>

            <MachineDetailDrawer 
                isOpen={isDrawerOpen} 
                machineId={selectedMachineId} 
                onClose={() => setIsDrawerOpen(false)} 
            />

            {isOnboardOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto glass border border-zinc-800 bg-zinc-950/40 p-6 shadow-2xl space-y-6">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Onboard Fleet Unit</h3>
                                <p className="text-[10px] text-zinc-500 font-medium">Direct regional database unit registration.</p>
                            </div>
                            <button 
                                onClick={() => { setIsOnboardOpen(false); setSelectedPrinthouseId(''); setEditingMachine(null); }}
                                className="p-1.5 bg-zinc-900/20 border border-zinc-800 text-zinc-200 hover:border-[#dc0000] transition-colors"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {!editingMachine && (
                                <div>
                                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Select Target Printhouse</label>
                                    <select 
                                        value={selectedPrinthouseId}
                                        onChange={e => setSelectedPrinthouseId(e.target.value)}
                                        className="w-full max-w-md px-3 py-2 bg-zinc-900/20 border border-zinc-800 text-xs font-bold focus:outline-none focus:border-[#dc0000] text-zinc-200 bg-transparent"
                                    >
                                        <option value="" disabled className="text-zinc-500">-- Choose Printhouse --</option>
                                        {printhouses.map(ph => (
                                            <option key={ph.id} value={ph.id} className="bg-zinc-950">
                                                {ph.name} ({ph.city || 'Global'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {(selectedPrinthouseId || editingMachine) && (
                                <div className="border-t border-zinc-800 pt-6">
                                    <MachineCapabilityEditor 
                                        printhouseId={selectedPrinthouseId || editingMachine?.printhouse_id} 
                                        editingMachine={editingMachine}
                                        onMutationSuccess={() => {
                                            capacity.refetch();
                                            setIsOnboardOpen(false);
                                            setEditingMachine(null);
                                        }}
                                        onCancelEdit={() => {
                                            setIsOnboardOpen(false);
                                            setEditingMachine(null);
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
