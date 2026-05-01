// pages/admin/WorkerFleetTab.tsx
import React from "react";
import { getWorkerFleet, setWorkerStatus } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { 
    CpuChipIcon, 
    SignalIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    WrenchIcon
} from "@heroicons/react/24/outline";

export const WorkerFleetTab: React.FC = () => {
    const { data, status, error, refetch } = useAdminQuery("worker-fleet", () => getWorkerFleet());

    if (status === "loading") return <div className="p-20 text-center animate-pulse font-bold text-slate-400">Discovering Worker Topology...</div>;
    if (status === "error") return <div className="p-10 bg-red-50 text-red-700 rounded-xl">Error: {error}</div>;

    const fleet = data?.fleet || [];

    const handleStatusChange = async (id: string, newStatus: string) => {
        if (!confirm(`Are you sure you want to set ${id} to ${newStatus}?`)) return;
        await setWorkerStatus(id, newStatus);
        refetch();
    };

    return (
        <div className="space-y-6 animate-slide-fade">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {fleet.map((w: any) => (
                    <div key={w.id} className="glass rounded-2xl border border-white p-6 shadow-sm hover-slide flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${w.isOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <CpuChipIcon className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="text-sm font-black text-slate-800 tracking-tight">{w.hostname}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{w.id}</div>
                                </div>
                            </div>
                            <StatusBadge status={w.status} online={w.isOnline} />
                        </div>

                        <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100">
                            <Metric label="Capability Score" value={`${w.health_score}%`} color={w.health_score > 80 ? 'emerald' : 'amber'} />
                            <Metric label="Concurrency" value={w.concurrency} color="blue" />
                            <Metric label="GS Version" value={w.gs_version || 'N/A'} color="slate" />
                            <Metric label="Memory Profile" value={`${w.memory_profile_mb} MB`} color="indigo" />
                        </div>

                        <div className="space-y-2">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Capabilities</div>
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(w.capabilities || {}).map(([cap, enabled]) => enabled && (
                                    <span key={cap} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[9px] font-bold uppercase">
                                        {cap.replace(/_/g, ' ')}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="mt-auto pt-4 flex gap-2">
                            <button 
                                onClick={() => handleStatusChange(w.id, 'HEALTHY')}
                                className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest border border-slate-200 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-100 transition-all"
                            >
                                Activate
                            </button>
                            <button 
                                onClick={() => handleStatusChange(w.id, 'DEGRADED')}
                                className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest border border-slate-200 rounded-lg hover:bg-amber-50 hover:text-amber-600 hover:border-amber-100 transition-all"
                            >
                                Maintenance
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const StatusBadge = ({ status, online }: { status: string, online: boolean }) => (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
        online ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'
    }`}>
        <div className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
        <span className="text-[9px] font-black uppercase tracking-widest">{online ? status : 'OFFLINE'}</span>
    </div>
);

const Metric = ({ label, value, color }: { label: string, value: any, color: string }) => (
    <div>
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
        <div className={`text-xs font-black text-${color}-600`}>{value}</div>
    </div>
);
