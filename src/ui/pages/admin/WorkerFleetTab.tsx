// pages/admin/WorkerFleetTab.tsx
import React from "react";
import { getWorkerFleet, setWorkerStatus } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { toDisplayText, safeArray } from "../../lib/display";
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
    if (status === "error") return <div className="p-10 bg-red-500/10 text-red-500 border border-red-500/20">Error: {toDisplayText(error)}</div>;

    const fleet = safeArray(data?.fleet);

    const handleStatusChange = async (id: string, newStatus: string) => {
        if (!confirm(`Are you sure you want to set ${id} to ${newStatus}?`)) return;
        await setWorkerStatus(id, newStatus);
        refetch();
    };

    return (
        <div className="space-y-6 animate-slide-fade">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {fleet.map((w: any) => (
                    <div key={w.id} className="bg-white dark:bg-[#131314] border border-white/10 p-6 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 ${w.isOnline ? 'bg-emerald-500/10 text-emerald-500' : 'bg-white/5 text-white/20'}`}>
                                    <CpuChipIcon className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="text-sm font-black text-slate-800 tracking-tight">{w.hostname}</div>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{w.id}</div>
                                </div>
                            </div>
                            <StatusBadge status={w.status} online={w.isOnline} />
                        </div>

                        <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5">
                            <Metric label="Capability Score" value={`${w.health_score}%`} color={w.health_score > 80 ? 'emerald' : 'amber'} />
                            <Metric label="Concurrency" value={w.concurrency} color="blue" />
                            <Metric label="GS Version" value={w.gs_version || 'N/A'} color="slate" />
                            <Metric label="Memory Profile" value={`${w.memory_profile_mb} MB`} color="indigo" />
                        </div>

                        <div className="space-y-2">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Capabilities</div>
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(w.capabilities || {}).map(([cap, enabled]) => enabled && (
                                    <span key={cap} className="px-2 py-0.5 bg-white/5 text-white/40 text-[9px] font-bold uppercase">
                                        {String(cap || '').replace(/_/g, ' ')}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="mt-auto pt-4 flex gap-2">
                            <button 
                                onClick={() => handleStatusChange(w.id, 'HEALTHY')}
                                className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest border border-white/10 hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/20 transition-all"
                            >
                                Activate
                            </button>
                            <button 
                                onClick={() => handleStatusChange(w.id, 'DEGRADED')}
                                className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest border border-white/10 hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/20 transition-all"
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
    <div className={`flex items-center gap-1.5 px-2.5 py-1 border ${
        online ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-white/5 border-white/10 text-white/20'
    }`}>
        <div className={`w-1.5 h-1.5 ${online ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
        <span className="text-[9px] font-black uppercase tracking-widest">{online ? status : 'OFFLINE'}</span>
    </div>
);

const Metric = ({ label, value, color }: { label: string, value: any, color: string }) => (
    <div>
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
        <div className={`text-xs font-black text-${color}-600`}>{value}</div>
    </div>
);
