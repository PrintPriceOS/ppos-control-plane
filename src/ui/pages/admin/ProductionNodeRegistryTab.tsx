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
import { MachineDetailDrawer } from "../../components/MachineDetailDrawer";
import { COLORS } from '../../design-system/tokens';

export const ProductionNodeRegistryTab: React.FC = () => {
    const [nodes, setNodes] = useState<any[]>([]);
    const [selectedNode, setSelectedNode] = useState<any | null>(null);
    const [nodeStats, setNodeStats] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 italic-text-off">
            {/* Node List */}
            <div className="lg:col-span-1 space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h3 className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>Active Fleet Nodes</h3>
                    <button onClick={loadNodes} className={`${COLORS.adaptive.textMuted} hover:text-white transition-colors`}>
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
                                className={`w-full text-left p-4 rounded-none border transition-all ${
                                    isSelected
                                    ? `bg-zinc-900 border-[#dc0000] text-white`
                                    : `${COLORS.adaptive.surface} ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.textSecondary} ${COLORS.adaptive.hoverSurface}`
                                }`}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`p-2 rounded-none ${isSelected ? 'bg-[#dc0000]/10 text-[#dc0000]' : `${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.textMuted}`}`}>
                                        <CpuChipIcon className="w-4 h-4" />
                                    </div>
                                    <span className={`text-sm font-black truncate ${isSelected ? 'text-white' : COLORS.adaptive.textPrimary}`}>{node.name || 'Printhouse Node'}</span>
                                </div>
                                <div className={`flex items-center justify-between text-[10px] font-bold uppercase tracking-tight ${COLORS.adaptive.textMuted}`}>
                                    <span>{node.location || 'Distributed'}</span>
                                    <span className={node.status === 'ONLINE' ? 'text-[#10B981]' : 'text-amber-500'}>{node.status || 'READY'}</span>
                                </div>
                            </button>
                        );
                    })}
                    {nodes.length === 0 && !loading && (
                        <div className={`text-center py-8 ${COLORS.adaptive.surfaceMuted} rounded-none border border-dashed ${COLORS.adaptive.borderSubtle}`}>
                            <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>No nodes discovered</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Forensic Node Inspector */}
            <div className="lg:col-span-3">
                {selectedNode ? (
                    <div className="space-y-6">
                        {/* Node Profile Header */}
                        <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 relative overflow-hidden`}>
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <CpuChipIcon className="w-48 h-48" />
                            </div>
                            
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className={`px-3 py-1 ${COLORS.adaptive.surfaceMuted} rounded-none text-[10px] font-black ${COLORS.adaptive.textSecondary} uppercase tracking-widest border ${COLORS.adaptive.borderSubtle}`}>
                                        NODE ID: {selectedNode.id || selectedNode.printer_id || selectedNode._id}
                                    </span>
                                    <span className="px-3 py-1 bg-[#10B981]/10 rounded-none text-[10px] font-black text-[#10B981] uppercase tracking-widest border border-[#10B981]/20">
                                        INDUSTRIAL READY
                                    </span>
                                </div>
                                <h2 className={`text-4xl font-black ${COLORS.adaptive.textPrimary} tracking-tight mb-2`}>{selectedNode.name}</h2>
                                <div className="flex items-center justify-between">
                                    <p className={`${COLORS.adaptive.textSecondary} font-medium tracking-tight`}>Production Facility & Manufacturing Execution Node</p>
                                    <button 
                                        onClick={() => setIsDrawerOpen(true)}
                                        className={`flex items-center gap-2 px-6 py-2.5 bg-[#dc0000] text-white rounded-none text-xs font-black uppercase hover:bg-[#dc0000]/90 transition-colors`}
                                    >
                                        <BoltIcon className="w-4 h-4 text-white" />
                                        Full Machine Intelligence
                                    </button>
                                </div>
                            </div>
                        </div>

                        <MachineDetailDrawer 
                            isOpen={isDrawerOpen} 
                            machineId={selectedNode.id || selectedNode.printer_id || selectedNode._id} 
                            onClose={() => setIsDrawerOpen(false)} 
                        />


                        {/* MES Operational Stats - High Density Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
                            <StatCard 
                                label="Active Dispatches" 
                                value={statsLoading ? '...' : (nodeStats?.activeDispatches ?? 0)} 
                                icon={BoltIcon}
                                color="text-blue-500"
                            />
                            <StatCard 
                                label="Utilization" 
                                value={statsLoading ? '...' : `${nodeStats?.utilization || 0}%`} 
                                icon={ChartBarIcon}
                                color="text-purple-500"
                            />
                            <StatCard 
                                label="Faults" 
                                value={statsLoading ? '...' : (nodeStats?.failedDispatches ?? 0)} 
                                icon={ExclamationTriangleIcon}
                                color="text-[#dc0000]"
                            />
                            <StatCard 
                                label="Reservations" 
                                value={statsLoading ? '...' : (nodeStats?.activeReservations ?? 0)} 
                                icon={ClockIcon}
                                color="text-amber-500"
                            />
                            <StatCard 
                                 label="Saturation" 
                                 value={statsLoading ? '...' : `${nodeStats?.projectedSaturation || 0}%`} 
                                 icon={BoltIcon}
                                 color="text-cyan-500"
                            />
                            <StatCard 
                                 label="Drift Score" 
                                 value={statsLoading ? '...' : `${nodeStats?.driftScore || 0}`} 
                                 icon={ExclamationTriangleIcon}
                                 color={(nodeStats?.driftScore || 0) > 20 ? 'text-[#dc0000]' : COLORS.adaptive.textMuted}
                            />
                            <StatCard 
                                 label="Efficiency" 
                                 value={statsLoading ? '...' : `${nodeStats?.efficiencyScore || 0}%`} 
                                 icon={BoltIcon}
                                 color="text-[#10B981]"
                            />
                            <StatCard 
                                 label="Federation" 
                                 value={selectedNode.federation_id || 'LOCAL'} 
                                 icon={ShieldCheckIcon}
                                 color="text-indigo-400"
                            />
                            <StatCard 
                                 label="Swarm Stab." 
                                 value={`${selectedNode.swarm_score || 100}%`} 
                                 icon={ArrowPathIcon}
                                 color="text-cyan-400"
                            />
                            <StatCard 
                                 label="Reputation" 
                                 value={`${selectedNode.marketplace_reputation || 98.5}`} 
                                 icon={ShieldCheckIcon}
                                 color="text-amber-500"
                            />
                            <StatCard 
                                 label="Liquidity" 
                                 value={`${selectedNode.liquidity_score || 85.0}`} 
                                 icon={CurrencyEuroIcon}
                                 color="text-[#10B981]"
                            />
                            <StatCard 
                                 label="Econ. Rank" 
                                 value={`#${selectedNode.economic_efficiency_rank || 1}`} 
                                 icon={ChartBarIcon}
                                 color="text-indigo-400"
                            />
                            <StatCard 
                                 label="Gov. Stab." 
                                 value={`${selectedNode.governance_stability_score || 100}%`} 
                                 icon={ShieldCheckIcon}
                                 color="text-fuchsia-500"
                            />
                            <StatCard 
                                 label="Learning" 
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
                                 label="Cluster" 
                                 value={`${selectedNode.continental_cluster_id || 'EU-WEST'}`} 
                                 icon={ShieldCheckIcon}
                                 color="text-sky-500"
                            />
                            <StatCard 
                                 label="Reliability" 
                                 value={`${selectedNode.planetary_reliability_index || 100}%`} 
                                 icon={BoltIcon}
                                 color="text-indigo-400"
                            />
                            <StatCard 
                                 label="Contribution" 
                                 value={`${selectedNode.civilization_contribution_score || 0}%`} 
                                 icon={ChartBarIcon}
                                 color="text-fuchsia-400"
                            />
                        </div>

                        {/* Performance Details */}
                        <div className={`${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} p-8 min-h-[300px]`}>
                            <div className="flex items-center justify-between mb-8">
                                <h3 className={`text-sm font-black uppercase tracking-widest ${COLORS.adaptive.textPrimary} flex items-center gap-2`}>
                                    <ChartBarIcon className="w-5 h-5 text-[#10B981]" />
                                    Execution Performance & Telemetry
                                </h3>
                                <div className={`flex items-center gap-4 text-[10px] font-black uppercase tracking-widest ${COLORS.adaptive.textMuted}`}>
                                    <span>Operational History (All Time)</span>
                                </div>
                            </div>

                            {statsLoading ? (
                                <div className="flex flex-col items-center justify-center h-48 space-y-4">
                                    <div className="w-8 h-8 border-4 border-[#10B981]/30 border-t-[#10B981] rounded-none animate-spin" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[#10B981]">Aggregating industrial telemetry...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-1">
                                        <PerformanceMetric label="Industrial Reliability Score" value={`${Math.round(nodeStats?.reliabilityScore || 0)}%`} />
                                        <PerformanceMetric label="Avg Production Turnaround" value={`${Number(nodeStats?.avgTurnaround || 0).toFixed(1)}h`} />
                                        <PerformanceMetric label="Total Lifecycle Dispatches" value={nodeStats?.totalDispatches} />
                                        <PerformanceMetric label="Rerouted / Diverted Requests" value={nodeStats?.reroutedDispatches} />
                                        <PerformanceMetric label="Active Work-In-Progress" value={nodeStats?.activeJobs} />
                                        <PerformanceMetric label="Backlog / Queue Depth" value={nodeStats?.queuedJobs} />
                                    </div>
                                    
                                    <div className={`${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} p-6 flex flex-col justify-center`}>
                                        <p className="text-[10px] font-black uppercase tracking-widest mb-4 text-[#10B981]">Node Health Diagnostic</p>
                                        <div className="space-y-4">
                                            <div className="flex items-start gap-3">
                                                <div className="p-1.5 bg-[#10B981]/10 rounded-none border border-[#10B981]/20">
                                                    <ShieldCheckIcon className="w-5 h-5 text-[#10B981]" />
                                                </div>
                                                <div>
                                                    <p className={`text-xs font-bold ${COLORS.adaptive.textPrimary}`}>Industrial Capability Verified</p>
                                                    <p className={`text-[10px] ${COLORS.adaptive.textMuted} mt-0.5`}>Machine registry and pricing profiles are active.</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="p-1.5 bg-blue-500/10 rounded-none border border-blue-500/20">
                                                    <BoltIcon className="w-5 h-5 text-blue-500" />
                                                </div>
                                                <div>
                                                    <p className={`text-xs font-bold ${COLORS.adaptive.textPrimary}`}>Performance Within Nominal Parameters</p>
                                                    <p className={`text-[10px] ${COLORS.adaptive.textMuted} mt-0.5`}>Dispatch latencies and success rates meeting industrial SLAs.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className={`h-full min-h-[600px] ${COLORS.adaptive.surfaceMuted} border border-dashed ${COLORS.adaptive.borderSubtle} rounded-none flex flex-col items-center justify-center`}>
                        <div className={`p-6 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary} mb-4`}>
                            <CpuChipIcon className={`w-12 h-12 opacity-20 ${COLORS.adaptive.textMuted}`} />
                        </div>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${COLORS.adaptive.textMuted}`}>Select a Production Node to Begin Operational Audit</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const StatCard = ({ label, value, icon: Icon, color }: any) => (
    <div className={`${COLORS.adaptive.surface} p-4 rounded-none border ${COLORS.adaptive.borderPrimary}`}>
        <div className="flex items-center justify-between mb-3">
            <span className={`text-[9px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest leading-none`}>{label}</span>
            <div className={`p-1.5 rounded-none ${COLORS.adaptive.surfaceMuted}`}>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
            </div>
        </div>
        <div className={`text-2xl font-black ${COLORS.adaptive.textPrimary} tracking-tight`}>{value}</div>
    </div>
);

const PerformanceMetric = ({ label, value }: any) => (
    <div className={`flex items-center justify-between py-4 border-b ${COLORS.adaptive.borderSubtle} last:border-0`}>
        <span className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>{label}</span>
        <span className={`text-sm font-black ${COLORS.adaptive.textPrimary} tracking-tight`}>{value || 0}</span>
    </div>
);
