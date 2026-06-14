import React, { useState, useMemo, useEffect } from 'react';
import { 
    CpuChipIcon, 
    SignalIcon, 
    GlobeAltIcon,
    BoltIcon,
    ScaleIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    ClockIcon,
    MapPinIcon,
    XMarkIcon
} from "@heroicons/react/24/outline";
import { DataTable } from '../../components/DataTable';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getMachines, getPrinthouses } from '../../lib/adminApi';
import { StatusBadge } from '../../components/StatusBadge';
import { MachineCapabilityEditor } from '../printhouse/MachineCapabilityEditor';
import { listMachines } from '../../api/printhouseCapabilitiesClient';

interface Machine {
    id: string;
    companyName: string;
    status: string;
    healthState: string;
    machineState: string;
    workerState: string;
    locationLabel: string;
    city: string;
    country: string;
    region: string;
    needsProfile: boolean;
    capacityUtilizationPct: number | null;
    throughput: number | null;
    uptimeScore: number | null;
    economicEfficiency: number | null;
    lastHeartbeatAt: string | null;
    federationId?: string;
    clusterId?: string;
    telemetryCompletenessScore: number;
    missingTelemetry: string[];
    profileCompletenessScore: number;
    missingProfileFields: string[];
}

export const MachinesPage: React.FC = () => {
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    
    const [isOnboardOpen, setIsOnboardOpen] = useState(false);
    const [printhouses, setPrinthouses] = useState<any[]>([]);
    const [selectedPrinthouseId, setSelectedPrinthouseId] = useState<string>('');
    const [editingMachine, setEditingMachine] = useState<any>(null);

    useEffect(() => {
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

    const q = useAdminQuery<{ ok: boolean; total: number; machines: Machine[]; status: string; timestamp: string }>('machines', getMachines);

    const rawMachines = q.data?.machines ?? [];
    
    // Filtering logic
    const filteredMachines = useMemo(() => {
        return rawMachines.filter(m => {
            const matchesSearch = !search || 
                m.companyName.toLowerCase().includes(search.toLowerCase()) || 
                m.id.toLowerCase().includes(search.toLowerCase()) ||
                m.locationLabel.toLowerCase().includes(search.toLowerCase());
            
            const matchesStatus = filterStatus === 'ALL' || m.healthState === filterStatus;
            
            return matchesSearch && matchesStatus;
        });
    }, [rawMachines, search, filterStatus]);

    // Derived stats (Strictly truthful)
    const activeNodes = rawMachines.filter(m => 
        m.healthState === 'ONLINE' || m.healthState === 'PROCESSING' || m.healthState === 'HEALTHY'
    ).length;

    const avgUptime = useMemo(() => {
        const withData = rawMachines.filter(m => m.uptimeScore !== null && m.healthState !== 'OFFLINE');
        if (!withData.length) return null;
        return Number(withData.reduce((s, m) => s + Number(m.uptimeScore || 0), 0) / withData.length).toFixed(1);
    }, [rawMachines]);

    const avgEfficiency = useMemo(() => {
        const withData = rawMachines.filter(m => m.economicEfficiency !== null && m.healthState !== 'OFFLINE');
        if (!withData.length) return null;
        return Number(withData.reduce((s, m) => s + Number(m.economicEfficiency || 0), 0) / withData.length).toFixed(1);
    }, [rawMachines]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Industrial Machines</h1>
                    {q.data?.timestamp && (
                        <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                            <ClockIcon className="w-3 h-3" />
                            <span>Sync: {new Date(q.data.timestamp).toLocaleTimeString()}</span>
                        </div>
                    )}
                </div>
                 <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                          setEditingMachine(null);
                          setSelectedPrinthouseId('');
                          setIsOnboardOpen(true);
                      }}
                      className="px-4 py-2 bg-[#dc0000] text-white text-xs font-bold hover:bg-[#dc0000]/90 transition-colors uppercase tracking-wider shadow-none"
                    >
                      + Onboard Fleet Unit
                    </button>
                    <button 
                      onClick={() => q.refetch()}
                      className="p-1.5 rounded-none border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400"
                      title="Force Telemetry Refresh"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${q.isFetching ? 'animate-spin' : ''}`} />
                    </button>
                 </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                    { label: 'Total Fleet', value: rawMachines.length, icon: CpuChipIcon, config: { bg: "bg-zinc-50 dark:bg-zinc-900", text: "text-zinc-500 dark:text-zinc-400" } },
                    { label: 'Active Nodes', value: activeNodes, icon: SignalIcon, config: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-500 dark:text-emerald-400" } },
                    { label: 'Avg. Uptime', value: avgUptime ? `${avgUptime}%` : 'N/A', icon: BoltIcon, config: { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-500 dark:text-sky-400" } },
                    { label: 'Grid Efficiency', value: avgEfficiency ? `${avgEfficiency}%` : 'N/A', icon: ScaleIcon, config: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-500 dark:text-amber-400" } },
                ].map((stat, i) => (
                    <div key={i} className="bg-white dark:bg-zinc-950 p-3 rounded-none border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 shadow-none">
                        <div className={`p-2 rounded-none ${stat.config.bg} ${stat.config.text}`}>
                            <stat.icon className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
                            <p className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tighter leading-none">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3 bg-white dark:bg-zinc-950 p-1.5 rounded-none border border-zinc-200 dark:border-zinc-800 shadow-none">
                <div className="relative flex-1 w-full">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input 
                        type="text"
                        placeholder="Search fleet..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 bg-transparent text-zinc-900 dark:text-zinc-100 text-sm focus:ring-0 border-none outline-none font-medium placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                    />
                </div>
                <div className="h-6 w-[1px] bg-zinc-200 dark:bg-zinc-800 hidden md:block" />
                <div className="flex items-center gap-1">
                    {['ALL', 'ONLINE', 'DEGRADED', 'OFFLINE'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-3 py-1.5 rounded-none text-[9px] font-bold uppercase tracking-wider transition-all ${filterStatus === status ? 'bg-zinc-50 dark:bg-zinc-900 text-[#dc0000] dark:text-red-400 ring-1 ring-zinc-200 dark:ring-zinc-800' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {q.status === 'error' && (
                <div className="p-4 rounded-none border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-3">
                    <div className="p-2 bg-red-100 dark:bg-red-900/60 rounded-none">
                        <SignalIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <span>Failed to synchronize grid telemetry: {q.error}</span>
                </div>
            )}

            <DataTable<Machine>
                isLoading={q.status === 'loading'}
                data={filteredMachines}
                columns={[
                    {
                        header: 'Machine / Node',
                        accessor: (m) => (
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-none bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center flex-shrink-0 border border-zinc-200 dark:border-zinc-800 relative">
                                    <CpuChipIcon className="w-5 h-5 text-zinc-400" />
                                    {m.profileCompletenessScore < 100 && (
                                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 border border-zinc-950 rounded-none" />
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{m.companyName || 'Industrial Node'}</p>
                                        {m.profileCompletenessScore < 75 && (
                                            <span className="px-1.5 py-0.5 rounded-none bg-amber-50 dark:bg-amber-950/40 text-[8px] font-bold text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 uppercase tracking-wide">
                                                Needs Profile
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] font-mono text-zinc-400 uppercase">{m.id}</span>
                                        {m.clusterId && (
                                            <span className="px-1 py-0.5 rounded-none bg-zinc-50 dark:bg-zinc-900 text-[9px] font-bold text-zinc-400 uppercase tracking-wide border border-zinc-200 dark:border-zinc-800">
                                                {m.clusterId}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ),
                        sortKey: 'companyName'
                    },
                    {
                        header: 'Geolocation',
                        accessor: (m) => (
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                                    <GlobeAltIcon className={`w-3.5 h-3.5 ${m.needsProfile ? 'text-amber-400' : 'text-zinc-400'}`} />
                                    <span className={`text-xs font-bold ${m.needsProfile ? 'text-amber-600 dark:text-amber-400 italic' : ''}`}>
                                        {m.locationLabel}
                                    </span>
                                </div>
                                {m.needsProfile && (
                                    <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wide">
                                        Complete print node profile
                                    </p>
                                )}
                                {m.region && !m.needsProfile && (
                                    <div className="flex items-center gap-1.5 text-zinc-400">
                                        <MapPinIcon className="w-3 h-3" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{m.region}</span>
                                    </div>
                                )}
                            </div>
                        ),
                        sortKey: 'locationLabel'
                    },
                    {
                        header: 'Grid Health',
                        accessor: (m) => (
                            <div className="flex flex-col gap-1.5">
                                <div className="w-fit">
                                    <StatusBadge status={m.healthState} />
                                </div>
                                {m.healthState === 'OFFLINE' && (
                                    <div className="px-1.5 py-0.5 rounded-none bg-zinc-50 dark:bg-zinc-900 text-[8px] font-bold text-zinc-500 uppercase tracking-wide w-fit">
                                        No live heartbeat
                                    </div>
                                )}
                                <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-bold text-zinc-400 uppercase">Proc:</span>
                                    <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-400">{m.machineState}</span>
                                    <span className="text-zinc-300 dark:text-zinc-700 mx-0.5">|</span>
                                    <span className="text-[9px] font-bold text-zinc-400 uppercase">Worker:</span>
                                    <span className="text-[9px] font-bold text-zinc-600 dark:text-zinc-400">{m.workerState}</span>
                                </div>
                            </div>
                        ),
                        sortKey: 'healthState'
                    },
                    {
                        header: 'Industrial Stats',
                        accessor: (m) => (
                            <div className="space-y-2 w-36">
                                <div>
                                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-zinc-400 mb-1">
                                        <span>Util / Cap</span>
                                        <span className={m.capacityUtilizationPct === null ? 'italic font-medium' : ''}>
                                            {m.capacityUtilizationPct !== null ? `${m.capacityUtilizationPct}%` : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-900 rounded-none overflow-hidden">
                                        {m.capacityUtilizationPct !== null && (
                                            <div 
                                                className={`h-full rounded-none transition-all duration-1000 ${
                                                    m.capacityUtilizationPct > 90 ? 'bg-red-500' : 
                                                    m.capacityUtilizationPct > 70 ? 'bg-amber-500' : 'bg-red-600'
                                                }`}
                                                style={{ width: `${m.capacityUtilizationPct}%` }}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[8px] font-bold text-zinc-400 uppercase">Completeness</span>
                                    <div className="flex items-center gap-1">
                                        <div className="w-12 h-1 bg-zinc-100 dark:bg-zinc-900 rounded-none overflow-hidden">
                                            <div 
                                                className={`h-full rounded-none ${m.telemetryCompletenessScore > 75 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                style={{ width: `${m.telemetryCompletenessScore}%` }}
                                            />
                                        </div>
                                        <span className="text-[8px] font-bold text-zinc-500">{m.telemetryCompletenessScore}%</span>
                                    </div>
                                </div>
                            </div>
                        ),
                        sortKey: 'capacityUtilizationPct'
                    },
                    {
                        header: 'Performance',
                        accessor: (m) => (
                            <div className="flex items-center gap-4">
                                <div className="text-center">
                                    <p className="text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Uptime</p>
                                    <p className={`text-xs font-bold ${m.uptimeScore !== null && m.uptimeScore > 95 ? 'text-emerald-500' : 'text-zinc-500'}`}>
                                        {m.uptimeScore !== null ? `${m.uptimeScore}%` : 'N/A'}
                                    </p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Efficiency</p>
                                    <p className="text-xs font-bold text-zinc-500">
                                        {m.economicEfficiency !== null ? `${m.economicEfficiency}%` : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        ),
                        sortKey: 'uptimeScore'
                    },
                    {
                        header: 'Telemetry Integrity',
                        accessor: (m) => (
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                    <SignalIcon className={`w-4 h-4 ${m.lastHeartbeatAt && (new Date().getTime() - new Date(m.lastHeartbeatAt).getTime() < 900000) ? 'text-emerald-500' : 'text-zinc-600'}`} />
                                    <span className="text-[10px] font-bold text-zinc-500 font-mono">
                                        {m.lastHeartbeatAt ? new Date(m.lastHeartbeatAt).toLocaleTimeString() : 'NEVER'}
                                    </span>
                                </div>
                                {m.lastHeartbeatAt && (
                                    <p className="text-[9px] font-medium text-zinc-400">
                                        Sync: {Math.floor((new Date().getTime() - new Date(m.lastHeartbeatAt).getTime()) / 60000)}m ago
                                    </p>
                                )}
                            </div>
                        ),
                        sortKey: 'lastHeartbeatAt'
                    },
                    {
                        header: 'Actions',
                        accessor: (m) => (
                            <button
                                onClick={async () => {
                                    if (!m.printhouseId) {
                                        alert('Printhouse association not found for this node.');
                                        return;
                                    }
                                    try {
                                        const res = await listMachines(m.printhouseId);
                                        if (res.ok && res.machines) {
                                            const found = res.machines.find((x: any) => x.id === m.id);
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
                                className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 transition-colors"
                            >
                                Edit Specs
                            </button>
                        )
                    }
                ]}
            />
            
            <div className="flex items-center justify-between py-4 border-t border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Showing {filteredMachines.length} of {rawMachines.length} Grid Nodes
                </p>
                <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-none bg-emerald-500" /> ONLINE
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-none bg-amber-500" /> DEGRADED
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-none bg-red-500" /> OFFLINE
                    </div>
                </div>
            </div>

            {isOnboardOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-6">
                        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
                            <div>
                                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">Onboard / Edit Fleet Unit</h3>
                                <p className="text-[10px] text-zinc-500 font-medium">Direct regional database unit registration.</p>
                            </div>
                            <button 
                                onClick={() => { setIsOnboardOpen(false); setSelectedPrinthouseId(''); setEditingMachine(null); }}
                                className="p-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:border-[#dc0000] transition-colors"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {!editingMachine && (
                                <div>
                                    <label className="block text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2">Select Target Printhouse</label>
                                    <select 
                                        value={selectedPrinthouseId}
                                        onChange={e => setSelectedPrinthouseId(e.target.value)}
                                        className="w-full max-w-md px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-[#dc0000] text-zinc-900 dark:text-zinc-100 bg-transparent"
                                    >
                                        <option value="" disabled className="text-zinc-500">-- Choose Printhouse --</option>
                                        {printhouses.map(ph => (
                                            <option key={ph.id} value={ph.id} className="bg-white dark:bg-zinc-950">
                                                {ph.name} ({ph.city || 'Global'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {(selectedPrinthouseId || editingMachine) && (
                                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                                    <MachineCapabilityEditor 
                                        printhouseId={selectedPrinthouseId || editingMachine?.printhouseId} 
                                        editingMachine={editingMachine}
                                        onMutationSuccess={() => {
                                            q.refetch();
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
