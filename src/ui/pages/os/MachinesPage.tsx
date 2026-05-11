import React from 'react';
import { 
    CpuChipIcon, 
    SignalIcon, 
    GlobeAltIcon,
    BoltIcon,
    ScaleIcon
} from "@heroicons/react/24/outline";
import { DataTable } from '../../components/DataTable';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getMachines } from '../../lib/adminApi';

interface Machine {
    id: string;
    companyName: string;
    status: string;
    locationLabel: string;
    machineState: string;
    workerState: string;
    capacityUtilizationPct: number;
    throughput: number;
    uptimeScore: number;
    economicEfficiency: number;
    lastHeartbeatAt: string;
}

export const MachinesPage: React.FC = () => {
    const q = useAdminQuery<{ ok: boolean; total: number; machines: Machine[]; status: string }>('machines', getMachines);

    const machines = q.data?.machines ?? [];
    
    // Derived stats
    const activeMachines = machines.filter(m => m.status === 'ACTIVE').length;
    const avgUptime = machines.length 
        ? (machines.reduce((s, m) => s + (Number(m.uptimeScore) || 0), 0) / machines.length).toFixed(1) 
        : '0';
    const avgEfficiency = machines.length 
        ? (machines.reduce((s, m) => s + (Number(m.economicEfficiency) || 0), 0) / machines.length).toFixed(1) 
        : '0';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Industrial Machines</h1>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Live fleet monitoring, telemetry, and performance metrics for configured print nodes.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Total Fleet', value: machines.length, icon: CpuChipIcon, color: 'primary' },
                    { label: 'Active Nodes', value: activeMachines, icon: SignalIcon, color: 'emerald' },
                    { label: 'Avg. Uptime Score', value: `${avgUptime}%`, icon: BoltIcon, color: 'blue' },
                    { label: 'Economic Efficiency', value: `${avgEfficiency}%`, icon: ScaleIcon, color: 'indigo' },
                ].map((stat, i) => (
                    <div key={i} className="glass p-5 rounded-2xl border border-white flex items-center gap-4 shadow-sm">
                        <div className={`p-3 rounded-xl ${stat.color === 'primary' ? 'bg-slate-100 text-slate-600' : 
                                          stat.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
                                          stat.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                                          'bg-indigo-100 text-indigo-600'}`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl font-black text-slate-900">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {q.status === 'error' && (
                <div className="glass px-5 py-4 rounded-2xl border border-red-200 bg-red-50 text-sm font-medium text-red-600">
                    Failed to load machine data: {q.error}
                </div>
            )}

            <DataTable<Machine>
                isLoading={q.status === 'loading'}
                data={machines}
                columns={[
                    {
                        header: 'Machine / Node',
                        accessor: (m) => (
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0 border border-slate-100">
                                    <CpuChipIcon className="w-5 h-5 text-slate-400" />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-900">{m.companyName || 'Unnamed Node'}</p>
                                    <p className="text-[10px] font-mono text-slate-400 uppercase">{m.id}</p>
                                </div>
                            </div>
                        ),
                    },
                    {
                        header: 'Location',
                        accessor: (m) => (
                            <div className="flex items-center gap-1.5 text-slate-600">
                                <GlobeAltIcon className="w-4 h-4 text-slate-300" />
                                <span className="text-xs font-medium">{m.locationLabel}</span>
                            </div>
                        ),
                    },
                    {
                        header: 'States',
                        accessor: (m) => (
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{m.status}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${m.machineState === 'READY' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                        {m.machineState}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${m.workerState === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                        {m.workerState}
                                    </span>
                                </div>
                            </div>
                        ),
                    },
                    {
                        header: 'Telemetry',
                        accessor: (m) => (
                            <div className="space-y-2 w-32">
                                <div>
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                        <span>Capacity</span>
                                        <span>{m.capacityUtilizationPct}%</span>
                                    </div>
                                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${m.capacityUtilizationPct > 80 ? 'bg-amber-500' : 'bg-slate-800'}`}
                                            style={{ width: `${m.capacityUtilizationPct}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                    {
                        header: 'Health',
                        accessor: (m) => (
                            <div className="flex items-center gap-4">
                                <div className="text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Uptime</p>
                                    <p className={`text-xs font-bold ${m.uptimeScore > 95 ? 'text-emerald-600' : 'text-slate-900'}`}>{m.uptimeScore}%</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Efficiency</p>
                                    <p className="text-xs font-bold text-slate-900">{m.economicEfficiency}%</p>
                                </div>
                            </div>
                        ),
                    },
                    {
                        header: 'Last Heartbeat',
                        accessor: (m) => (
                            <div className="flex items-center gap-1.5">
                                <SignalIcon className={`w-4 h-4 ${m.lastHeartbeatAt && (new Date().getTime() - new Date(m.lastHeartbeatAt).getTime() < 900000) ? 'text-emerald-500' : 'text-slate-300'}`} />
                                <span className="text-[10px] font-mono text-slate-500">
                                    {m.lastHeartbeatAt ? new Date(m.lastHeartbeatAt).toLocaleTimeString() : 'NEVER'}
                                </span>
                            </div>
                        ),
                    }
                ]}
            />
        </div>
    );
};
