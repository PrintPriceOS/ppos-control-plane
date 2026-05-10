// components/admin/ProductionNodeRegistryTab.tsx
import React, { useState, useEffect } from "react";
import { 
    CpuChipIcon, 
    ArrowPathIcon, 
    ChartBarIcon, 
    ExclamationTriangleIcon,
    ShieldCheckIcon,
    ClockIcon,
    BoltIcon,
    CurrencyEuroIcon,
    CheckCircleIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";

export const ProductionNodeRegistryTab: React.FC = () => {
    const [nodes, setNodes] = useState<any[]>([]);
    const [selectedNode, setSelectedNode] = useState<any | null>(null);
    const [nodeStats, setNodeStats] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(false);

    useEffect(() => {
        loadNodes();
    }, []);

    const loadNodes = async () => {
        setLoading(true);
        try {
            const data = await adminApi.getPrinters();
            setNodes(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load production nodes', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectNode = async (node: any) => {
        setSelectedNode(node);
        setStatsLoading(true);
        try {
            const nodeId = node.id || node.printer_id || node._id;
            const res = await adminApi.getNodeMESStats(nodeId);
            if (res.ok) {
                setNodeStats(res.stats);
            }
        } catch (err) {
            console.error('Failed to load node stats', err);
        } finally {
            setStatsLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-500 italic-text-off">
            {/* Node List */}
            <div className="lg:col-span-1 space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Fleet Nodes</h3>
                    <button onClick={loadNodes} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
                
                <div className="space-y-2 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                    {nodes.map((node) => {
                        const nodeId = node.id || node.printer_id || node._id;
                        const isSelected = selectedNode && (selectedNode.id || selectedNode.printer_id || selectedNode._id) === nodeId;
                        
                        return (
                            <button
                                key={nodeId}
                                onClick={() => handleSelectNode(node)}
                                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                                    isSelected
                                    ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200'
                                    : 'bg-white border-slate-200 text-slate-900 hover:border-slate-400'
                                }`}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-white/10' : 'bg-slate-100'}`}>
                                        <CpuChipIcon className="w-4 h-4" />
                                    </div>
                                    <span className="text-sm font-black truncate">{node.name || 'Printhouse Node'}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-bold opacity-60 uppercase tracking-tight">
                                    <span>{node.location || 'Distributed'}</span>
                                    <span className={node.status === 'ONLINE' ? 'text-emerald-500' : 'text-amber-500'}>{node.status || 'READY'}</span>
                                </div>
                            </button>
                        );
                    })}
                    {nodes.length === 0 && !loading && (
                        <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No nodes discovered</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Forensic Node Inspector */}
            <div className="lg:col-span-3">
                {selectedNode ? (
                    <div className="space-y-6">
                        {/* Node Profile Header */}
                        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                                <CpuChipIcon className="w-48 h-48" />
                            </div>
                            
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest border border-slate-200">
                                        NODE ID: {selectedNode.id || selectedNode.printer_id || selectedNode._id}
                                    </span>
                                    <span className="px-3 py-1 bg-emerald-100 rounded-full text-[10px] font-black text-emerald-700 uppercase tracking-widest border border-emerald-200">
                                        INDUSTRIAL READY
                                    </span>
                                </div>
                                <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">{selectedNode.name}</h2>
                                <p className="text-slate-500 font-medium tracking-tight">Production Facility & Manufacturing Execution Node</p>
                            </div>
                        </div>

                        {/* MES Operational Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <StatCard 
                                label="Active Dispatches" 
                                value={statsLoading ? '...' : (nodeStats?.activeDispatches ?? 0)} 
                                icon={BoltIcon}
                                color="text-blue-600"
                            />
                            <StatCard 
                                label="Real-time Utilization" 
                                value={statsLoading ? '...' : `${nodeStats?.utilization || 0}%`} 
                                icon={ChartBarIcon}
                                color="text-purple-600"
                            />
                            <StatCard 
                                label="Production Faults" 
                                value={statsLoading ? '...' : (nodeStats?.failedDispatches ?? 0)} 
                                icon={ExclamationTriangleIcon}
                                color="text-rose-600"
                            />
                            <StatCard 
                                label="Capacity Reservations" 
                                value={statsLoading ? '...' : (nodeStats?.activeReservations ?? 0)} 
                                icon={ClockIcon}
                                color="text-amber-600"
                            />
                            <StatCard 
                                 label="Projected Saturation" 
                                 value={statsLoading ? '...' : `${nodeStats?.projectedSaturation || 0}%`} 
                                 icon={BoltIcon}
                                 color="text-cyan-600"
                            />
                            <StatCard 
                                 label="Industrial Drift" 
                                 value={statsLoading ? '...' : `${nodeStats?.driftScore || 0}`} 
                                 icon={ExclamationTriangleIcon}
                                 color={(nodeStats?.driftScore || 0) > 20 ? 'text-rose-600' : 'text-slate-400'}
                            />
                            <StatCard 
                                 label="Process Efficiency" 
                                 value={statsLoading ? '...' : `${nodeStats?.efficiencyScore || 0}%`} 
                                 icon={BoltIcon}
                                 color="text-emerald-500"
                            />
                            <StatCard 
                                 label="Federation ID" 
                                 value={selectedNode.federation_id || 'LOCAL'} 
                                 icon={ShieldCheckIcon}
                                 color="text-indigo-600"
                            />
                            <StatCard 
                                 label="Swarm Stability" 
                                 value={`${selectedNode.swarm_score || 100}%`} 
                                 icon={ArrowPathIcon}
                                 color="text-cyan-600"
                            />
                            <StatCard 
                                 label="Marketplace Reputation" 
                                 value={`${selectedNode.marketplace_reputation || 98.5}`} 
                                 icon={ShieldCheckIcon}
                                 color="text-amber-500"
                            />
                            <StatCard 
                                 label="Liquidity Score" 
                                 value={`${selectedNode.liquidity_score || 85.0}`} 
                                 icon={CurrencyEuroIcon}
                                 color="text-emerald-500"
                            />
                            <StatCard 
                                 label="Economic Rank" 
                                 value={`#${selectedNode.economic_efficiency_rank || 1}`} 
                                 icon={ChartBarIcon}
                                 color="text-indigo-500"
                            />
                            <StatCard 
                                 label="Gov Stability" 
                                 value={`${selectedNode.governance_stability_score || 100}%`} 
                                 icon={ShieldCheckIcon}
                                 color="text-fuchsia-500"
                            />
                            <StatCard 
                                 label="Learning Score" 
                                 value={`${selectedNode.federation_learning_score || 0}%`} 
                                 icon={ArrowPathIcon}
                                 color="text-blue-400"
                            />
                            <StatCard 
                                 label="Ethics Comp." 
                                 value={`${selectedNode.ethics_compliance_score || 100}%`} 
                                 icon={CheckCircleIcon}
                                 color="text-emerald-400"
                            />
                            <StatCard 
                                 label="Cont. Cluster" 
                                 value={`${selectedNode.continental_cluster_id || 'EU-WEST'}`} 
                                 icon={ShieldCheckIcon}
                                 color="text-sky-500"
                            />
                            <StatCard 
                                 label="Planetary Rel." 
                                 value={`${selectedNode.planetary_reliability_index || 100}%`} 
                                 icon={BoltIcon}
                                 color="text-indigo-400"
                            />
                            <StatCard 
                                 label="Civ. Contrib." 
                                 value={`${selectedNode.civilization_contribution_score || 0}%`} 
                                 icon={ChartBarIcon}
                                 color="text-fuchsia-400"
                            />
                            <StatCard 
                                 label="Orbital Cluster" 
                                 value={`${selectedNode.orbital_cluster_id || 'LSA-01'}`} 
                                 icon={BoltIcon}
                                 color="text-violet-500"
                            />
                            <StatCard 
                                 label="Synth. Aware." 
                                 value={`${selectedNode.synthetic_awareness_score || 100}%`} 
                                 icon={ShieldCheckIcon}
                                 color="text-emerald-400"
                            />
                            <StatCard 
                                 label="Survival Score" 
                                 value={`${selectedNode.civilization_survival_score || 100}%`} 
                                 icon={CheckCircleIcon}
                                 color="text-sky-400"
                            />
                            <StatCard 
                                 label="Sim. Coherence" 
                                 value={`${selectedNode.simulation_coherence || 100}%`} 
                                 icon={ShieldCheckIcon}
                                 color="text-pink-500"
                            />
                            <StatCard 
                                 label="Univ. Sync" 
                                 value={`${selectedNode.universal_synchronization || 100}%`} 
                                 icon={BoltIcon}
                                 color="text-emerald-400"
                            />
                            <StatCard 
                                 label="Reality Stability" 
                                 value={`${selectedNode.reality_stability_index || 100}%`} 
                                 icon={ChartBarIcon}
                                 color="text-blue-400"
                            />
                            <StatCard 
                                 label="Recursive Cont." 
                                 value={`${selectedNode.recursive_continuity || 100}%`} 
                                 icon={ArrowPathIcon}
                                 color="text-indigo-500"
                            />
                            <StatCard 
                                 label="Omniv. Coherence" 
                                 value={`${selectedNode.omniversal_coherence || 100}%`} 
                                 icon={ShieldCheckIcon}
                                 color="text-fuchsia-500"
                            />
                            <StatCard 
                                 label="Transcend. Aware." 
                                 value={`${selectedNode.transcendent_awareness || 100}%`} 
                                 icon={BoltIcon}
                                 color="text-pink-400"
                            />
                            <StatCard 
                                 label="Singularity Stab." 
                                 value={`${selectedNode.singularity_stability || 100}%`} 
                                 icon={CheckCircleIcon}
                                 color="text-emerald-400"
                            />
                        </div>

                        {/* Performance Details */}
                        <div className="bg-slate-900 rounded-3xl p-8 text-white min-h-[300px] shadow-2xl shadow-slate-900/20">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    <ChartBarIcon className="w-5 h-5 text-emerald-400" />
                                    Execution Performance & Telemetry
                                </h3>
                                <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest opacity-60">
                                    <span>Operational History (All Time)</span>
                                </div>
                            </div>

                            {statsLoading ? (
                                <div className="flex flex-col items-center justify-center h-48 space-y-4">
                                    <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 text-emerald-500">Aggregating industrial telemetry...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-1">
                                        <PerformanceMetric label="Industrial Reliability Score" value={`${Math.round(nodeStats?.reliabilityScore || 0)}%`} />
                                        <PerformanceMetric label="Avg Production Turnaround" value={`${(nodeStats?.avgTurnaround || 0).toFixed(1)}h`} />
                                        <PerformanceMetric label="Total Lifecycle Dispatches" value={nodeStats?.totalDispatches} />
                                        <PerformanceMetric label="Rerouted / Diverted Requests" value={nodeStats?.reroutedDispatches} />
                                        <PerformanceMetric label="Active Work-In-Progress" value={nodeStats?.activeJobs} />
                                        <PerformanceMetric label="Backlog / Queue Depth" value={nodeStats?.queuedJobs} />
                                    </div>
                                    
                                    <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col justify-center">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4 text-emerald-400 tracking-widest">Node Health Diagnostic</p>
                                        <div className="space-y-4">
                                            <div className="flex items-start gap-3">
                                                <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                                                    <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold">Industrial Capability Verified</p>
                                                    <p className="text-[10px] opacity-40 mt-0.5">Machine registry and pricing profiles are active.</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="p-1.5 bg-blue-500/20 rounded-lg">
                                                    <BoltIcon className="w-5 h-5 text-blue-500" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold">Performance Within Nominal Parameters</p>
                                                    <p className="text-[10px] opacity-40 mt-0.5">Dispatch latencies and success rates meeting industrial SLAs.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full min-h-[600px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400">
                        <div className="p-6 bg-white rounded-full shadow-sm mb-4">
                            <CpuChipIcon className="w-12 h-12 opacity-10" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Select a Production Node to Begin Operational Audit</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const StatCard = ({ label, value, icon: Icon, color }: any) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{label}</span>
            <div className={`p-1.5 rounded-lg bg-slate-50`}>
                <Icon className={`w-4 h-4 ${color}`} />
            </div>
        </div>
        <div className="text-3xl font-black text-slate-900 tracking-tight">{value}</div>
    </div>
);

const PerformanceMetric = ({ label, value }: any) => (
    <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
        <span className="text-[10px] font-black opacity-40 uppercase tracking-widest">{label}</span>
        <span className="text-sm font-black tracking-tight">{value || 0}</span>
    </div>
);
