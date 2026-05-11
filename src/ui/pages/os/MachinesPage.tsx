import React, { useState, useMemo } from 'react';
import { 
    CpuChipIcon, 
    SignalIcon, 
    GlobeAltIcon,
    BoltIcon,
    ScaleIcon,
    MagnifyingGlassIcon,
    FunnelIcon,
    ArrowPathIcon,
    ClockIcon,
    MapPinIcon
} from "@heroicons/react/24/outline";
import { DataTable } from '../../components/DataTable';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getMachines } from '../../lib/adminApi';

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
        return (withData.reduce((s, m) => s + (m.uptimeScore || 0), 0) / withData.length).toFixed(1);
    }, [rawMachines]);

    const avgEfficiency = useMemo(() => {
        const withData = rawMachines.filter(m => m.economicEfficiency !== null && m.healthState !== 'OFFLINE');
        if (!withData.length) return null;
        return (withData.reduce((s, m) => s + (m.economicEfficiency || 0), 0) / withData.length).toFixed(1);
    }, [rawMachines]);

    const getHealthColor = (state: string) => {
        switch (state) {
            case 'ONLINE':
            case 'HEALTHY':
            case 'PROCESSING':
                return 'bg-emerald-500';
            case 'DEGRADED':
            case 'CAPACITY_BLOCKED':
                return 'bg-amber-500';
            case 'OFFLINE':
                return 'bg-red-500';
            default:
                return 'bg-slate-300';
        }
    };

    const getHealthPillClass = (state: string) => {
        switch (state) {
            case 'ONLINE':
            case 'HEALTHY':
            case 'PROCESSING':
                return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            case 'DEGRADED':
            case 'CAPACITY_BLOCKED':
                return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'OFFLINE':
                return 'bg-red-50 text-red-600 border-red-100';
            default:
                return 'bg-slate-50 text-slate-500 border-slate-100';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Industrial Machines</h1>
                    {q.data?.timestamp && (
                        <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-full text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            <ClockIcon className="w-3 h-3" />
                            <span>Sync: {new Date(q.data.timestamp).toLocaleTimeString()}</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                   <button 
                     onClick={() => q.refetch()}
                     className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-[#1a1a1b]/5 transition-colors text-slate-400"
                     title="Force Telemetry Refresh"
                   >
                     <ArrowPathIcon className={`w-4 h-4 ${q.isFetching ? 'animate-spin' : ''}`} />
                   </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Fleet', value: rawMachines.length, icon: CpuChipIcon, color: 'primary' },
                    { label: 'Active Nodes', value: activeNodes, icon: SignalIcon, color: 'emerald' },
                    { label: 'Avg. Uptime', value: avgUptime ? `${avgUptime}%` : 'N/A', icon: BoltIcon, color: 'blue' },
                    { label: 'Grid Efficiency', value: avgEfficiency ? `${avgEfficiency}%` : 'N/A', icon: ScaleIcon, color: 'indigo' },
                ].map((stat, i) => (
                    <div key={i} className="glass p-3 rounded-xl border border-white flex items-center gap-3 shadow-sm">
                        <div className={`p-2 rounded-lg ${stat.color === 'primary' ? 'bg-slate-100 text-slate-600' : 
                                          stat.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
                                          stat.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                                          'bg-indigo-100 text-indigo-600'}`}>
                            <stat.icon className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
                            <p className="text-lg font-black text-slate-900 tracking-tighter leading-none">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3 bg-white dark:bg-[#131314]/[0.03] p-1.5 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
                <div className="relative flex-1 w-full">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text"
                        placeholder="Search fleet..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 bg-transparent text-sm focus:ring-0 border-none outline-none font-medium"
                    />
                </div>
                <div className="h-6 w-[1px] bg-slate-200 dark:bg-[#131314]/10 hidden md:block" />
                <div className="flex items-center gap-1">
                    {['ALL', 'ONLINE', 'DEGRADED', 'OFFLINE'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${filterStatus === status ? 'bg-white dark:bg-[#131314]/10 text-primary shadow-sm ring-1 ring-slate-200 dark:ring-white/20' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {q.status === 'error' && (
                <div className="glass px-5 py-4 rounded-2xl border border-red-200 bg-red-50 text-sm font-medium text-red-600 flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                        <SignalIcon className="w-5 h-5" />
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
                                <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-[#131314]/5 flex items-center justify-center flex-shrink-0 border border-slate-100 dark:border-white/10 relative">
                                    <CpuChipIcon className="w-5 h-5 text-slate-400" />
                                    {m.profileCompletenessScore < 100 && (
                                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 border-2 border-white rounded-full" />
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-slate-900 dark:text-[#ECECF1] leading-tight">{m.companyName || 'Industrial Node'}</p>
                                        {m.profileCompletenessScore < 75 && (
                                            <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-[8px] font-black text-amber-600 border border-amber-100 uppercase tracking-tighter">
                                                Needs Profile
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] font-mono text-slate-400 uppercase">{m.id}</span>
                                        {m.clusterId && (
                                            <span className="px-1 py-0.5 rounded bg-slate-100 dark:bg-[#131314]/5 text-[9px] font-black text-slate-400 uppercase tracking-tighter border border-slate-200/50">
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
                                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                    <GlobeAltIcon className={`w-3.5 h-3.5 ${m.needsProfile ? 'text-amber-400' : 'text-slate-300'}`} />
                                    <span className={`text-xs font-bold ${m.needsProfile ? 'text-amber-600 italic' : ''}`}>
                                        {m.locationLabel}
                                    </span>
                                </div>
                                {m.needsProfile && (
                                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-tighter">
                                        Complete print node profile
                                    </p>
                                )}
                                {m.region && !m.needsProfile && (
                                    <div className="flex items-center gap-1.5 text-slate-400">
                                        <MapPinIcon className="w-3 h-3" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{m.region}</span>
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
                                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider w-fit ${getHealthPillClass(m.healthState)}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${getHealthColor(m.healthState)}`} />
                                    {m.healthState}
                                </div>
                                {m.healthState === 'OFFLINE' && (
                                    <div className="px-1.5 py-0.5 rounded bg-slate-100 text-[8px] font-black text-slate-500 uppercase tracking-tighter w-fit">
                                        No live heartbeat
                                    </div>
                                )}
                                <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-black text-slate-400 uppercase">Proc:</span>
                                    <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400">{m.machineState}</span>
                                    <span className="text-slate-300 mx-0.5">|</span>
                                    <span className="text-[9px] font-black text-slate-400 uppercase">Worker:</span>
                                    <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400">{m.workerState}</span>
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
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                        <span>Util / Cap</span>
                                        <span className={m.capacityUtilizationPct === null ? 'italic font-medium' : ''}>
                                            {m.capacityUtilizationPct !== null ? `${m.capacityUtilizationPct}%` : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-[#131314]/5 rounded-full overflow-hidden">
                                        {m.capacityUtilizationPct !== null && (
                                            <div 
                                                className={`h-full rounded-full transition-all duration-1000 ${
                                                    m.capacityUtilizationPct > 90 ? 'bg-red-500' : 
                                                    m.capacityUtilizationPct > 70 ? 'bg-amber-500' : 'bg-primary'
                                                }`}
                                                style={{ width: `${m.capacityUtilizationPct}%` }}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">Completeness</span>
                                    <div className="flex items-center gap-1">
                                        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full rounded-full ${m.telemetryCompletenessScore > 75 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                                style={{ width: `${m.telemetryCompletenessScore}%` }}
                                            />
                                        </div>
                                        <span className="text-[8px] font-bold text-slate-500">{m.telemetryCompletenessScore}%</span>
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
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Uptime</p>
                                    <p className={`text-xs font-bold ${m.uptimeScore !== null && m.uptimeScore > 95 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {m.uptimeScore !== null ? `${m.uptimeScore}%` : 'N/A'}
                                    </p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Efficiency</p>
                                    <p className="text-xs font-bold text-slate-400">
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
                                    <SignalIcon className={`w-4 h-4 ${m.lastHeartbeatAt && (new Date().getTime() - new Date(m.lastHeartbeatAt).getTime() < 900000) ? 'text-emerald-500' : 'text-slate-300'}`} />
                                    <span className="text-[10px] font-black text-slate-500 font-mono">
                                        {m.lastHeartbeatAt ? new Date(m.lastHeartbeatAt).toLocaleTimeString() : 'NEVER'}
                                    </span>
                                </div>
                                {m.lastHeartbeatAt && (
                                    <p className="text-[9px] font-medium text-slate-400">
                                        Sync: {Math.floor((new Date().getTime() - new Date(m.lastHeartbeatAt).getTime()) / 60000)}m ago
                                    </p>
                                )}
                            </div>
                        ),
                        sortKey: 'lastHeartbeatAt'
                    }
                ]}
            />
            
            <div className="flex items-center justify-between py-4 border-t border-slate-100 dark:border-white/[0.05]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Showing {filteredMachines.length} of {rawMachines.length} Grid Nodes
                </p>
                <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
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
        </div>
    );
};
