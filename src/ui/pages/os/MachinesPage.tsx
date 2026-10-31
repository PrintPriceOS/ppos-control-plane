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
import { SharedModuleProps, TopSummaryKpiBar, HeaderActionGroup } from '../../components/common';

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

export const MachinesPage: React.FC<SharedModuleProps> = ({
    mode = 'workspace',
    onNextStep,
    onPrevStep
}) => {
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
        <div className="space-y-6" data-testid="machines-workspace" data-mode={mode}>
            <HeaderActionGroup
                title="Industrial Machines"
                subtitle="Machinery fleet, maximum sheet format, throughput speed and live connection state."
                mode={mode}
                primaryActionLabel="ONBOARD FLEET UNIT"
                onPrimaryAction={() => {
                    setEditingMachine(null);
                    setSelectedPrinthouseId('');
                    setIsOnboardOpen(true);
                }}
                secondaryActions={
                    <button
                        onClick={() => q.refetch()}
                        className="p-2 rounded-lg border border-slate-200 dark:border-[#1f2228] bg-white dark:bg-[#14161a] hover:bg-slate-50 dark:hover:bg-[#181b20] transition-colors text-slate-400 cursor-pointer"
                        title="Force Telemetry Refresh"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${q.isFetching ? 'animate-spin' : ''}`} />
                    </button>
                }
            />

            <TopSummaryKpiBar
                items={[
                    { id: 'total-fleet', label: 'TOTAL FLEET', value: rawMachines.length, icon: CpuChipIcon, accent: 'blue' },
                    { id: 'active-nodes', label: 'ACTIVE NODES', value: activeNodes, icon: SignalIcon, accent: 'emerald' },
                    { id: 'avg-uptime', label: 'AVG. UPTIME', value: avgUptime ? `${avgUptime}%` : 'N/A', icon: BoltIcon, accent: 'amber' },
                    { id: 'grid-efficiency', label: 'GRID EFFICIENCY', value: avgEfficiency ? `${avgEfficiency}%` : 'N/A', icon: ScaleIcon, accent: 'rose' }
                ]}
            />

            {mode === 'onboarding' && (
                <div data-testid="machines-onboarding-footer" className="flex justify-end pt-2">
                    <button
                        type="button"
                        onClick={onNextStep}
                        className="px-5 py-2 rounded-full bg-[#dc2626] hover:bg-[#e11d48] text-white text-xs font-black uppercase tracking-wider cursor-pointer"
                    >
                        Save & Continue
                    </button>
                </div>
            )}

            <div className="flex flex-col md:flex-row items-center gap-3 bg-white dark:bg-[#18181b] p-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xs">
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
                            className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${filterStatus === status ? 'bg-zinc-100 dark:bg-zinc-800 text-[#dc0000] dark:text-red-400 ring-1 ring-zinc-300 dark:ring-zinc-700' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {q.status === 'error' && (
                <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-3">
                    <div className="p-2 bg-red-100 dark:bg-red-900/60 rounded-xl">
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
                                <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center flex-shrink-0 border border-zinc-200 dark:border-zinc-800 relative">
                                    <CpuChipIcon className="w-5 h-5 text-zinc-400" />
                                    {m.profileCompletenessScore < 100 && (
                                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 border-2 border-white dark:border-zinc-950 rounded-full" />
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{m.companyName || 'Industrial Node'}</p>
                                        {m.profileCompletenessScore < 75 && (
                                            <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-[8px] font-bold text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 uppercase tracking-wide">
                                                Needs Profile
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] font-mono text-zinc-400 uppercase">{m.id}</span>
                                        {m.clusterId && (
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-50 dark:bg-zinc-900 text-[9px] font-bold text-zinc-400 uppercase tracking-wide border border-zinc-200 dark:border-zinc-800">
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
                                    <div className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[8px] font-bold text-zinc-500 uppercase tracking-wide w-fit">
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
                                    <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                                        {m.capacityUtilizationPct !== null && (
                                            <div 
                                                className={`h-full rounded-full transition-all duration-1000 ${
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
                                        <div className="w-12 h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full ${m.telemetryCompletenessScore > 75 ? 'bg-emerald-500' : 'bg-amber-500'}`}
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
                                className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 rounded-lg transition-colors cursor-pointer"
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
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> ONLINE
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" /> DEGRADED
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500" /> OFFLINE
                    </div>
                </div>
            </div>

            {isOnboardOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-2xl space-y-6">
                        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
                            <div>
                                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">Onboard / Edit Fleet Unit</h3>
                                <p className="text-[10px] text-zinc-500 font-medium">Direct regional database unit registration.</p>
                            </div>
                            <button 
                                onClick={() => { setIsOnboardOpen(false); setSelectedPrinthouseId(''); setEditingMachine(null); }}
                                className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:border-[#dc0000] transition-colors cursor-pointer"
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
                                        className="w-full max-w-md px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#dc0000]/20 focus:border-[#dc0000] text-zinc-900 dark:text-zinc-100"
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
