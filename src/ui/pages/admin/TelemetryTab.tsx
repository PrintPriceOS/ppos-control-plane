// pages/admin/TelemetryTab.tsx
import React from "react";
import { getTelemetrySnapshot } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { 
    CpuChipIcon, 
    CircleStackIcon, 
    GlobeAltIcon, 
    ExclamationCircleIcon,
    CheckCircleIcon,
    SignalIcon
} from "@heroicons/react/24/outline";
import { toDisplayText } from "../../lib/display";

export const TelemetryTab: React.FC<{ refreshMs?: number }> = ({ refreshMs = 5000 }) => {
    const { data, status, error } = useAdminQuery("telemetry-snapshot", () => getTelemetrySnapshot(), refreshMs);

    if (status === "loading") return (
        <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-none animate-spin" />
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Attaching Forensic Probes...</span>
            </div>
        </div>
    );

    if (status === "error") return (
        <div className="p-8 rounded-none bg-red-50 border border-red-100 text-center">
            <ExclamationCircleIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <div className="text-red-700 font-bold mb-1">Telemetry Interrupted</div>
            <div className="text-red-500 text-sm">{toDisplayText(error)}</div>
        </div>
    );

    if (!data) return null;

    const { queue, workers, storage, outcomes } = data;

    return (
        <div className="space-y-6 animate-slide-fade">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Worker Cluster Health */}
                <div className="glass rounded-none border border-white overflow-hidden shadow-none flex flex-col">
                    <div className="px-6 py-4 bg-slate-50/50 border-b border-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CpuChipIcon className="w-5 h-5 text-slate-400" />
                            <div className="font-bold text-slate-800 text-sm tracking-tight">Worker Cluster</div>
                        </div>
                        <StatusBadge status={workers.state} />
                    </div>
                    <div className="p-4 flex-1 space-y-3">
                        {(workers?.cluster ?? []).map((w: any) => (
                            <div key={w.id} className="flex items-center justify-between p-3 rounded-none bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-none ${w.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                    <div>
                                        <div className="text-xs font-bold text-slate-700">{w.name}</div>
                                        <div className="text-[10px] text-slate-400 uppercase tracking-widest">{w.status}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">CPU</div>
                                        <div className="text-xs font-black text-slate-800">{w.cpuUsage}%</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">MEM</div>
                                        <div className="text-xs font-black text-slate-800">{w.memUsage}%</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Queue Throughput */}
                <div className="glass rounded-none border border-white overflow-hidden shadow-none flex flex-col">
                    <div className="px-6 py-4 bg-slate-50/50 border-b border-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <SignalIcon className="w-5 h-5 text-slate-400" />
                            <div className="font-bold text-slate-800 text-sm tracking-tight">Live Throughput</div>
                        </div>
                        <StatusBadge status={queue.state} />
                    </div>
                    <div className="p-4 flex-1 space-y-4">
                        {(queue?.queues ?? []).map((q: any) => (
                            <div key={q.name} className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">{q.name}</div>
                                    <div className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-none">{q.throughput} ops/m</div>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    <QueueMetric label="Active" value={q.counts.active} color="blue" />
                                    <QueueMetric label="Waiting" value={q.counts.waiting} color="amber" />
                                    <QueueMetric label="Failed" value={q.counts.failed} color="red" />
                                    <QueueMetric label="Stalled" value={q.stalled} color="orange" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Storage Health */}
                <div className="glass rounded-none border border-white overflow-hidden shadow-none flex flex-col">
                    <div className="px-6 py-4 bg-slate-50/50 border-b border-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CircleStackIcon className="w-5 h-5 text-slate-400" />
                            <div className="font-bold text-slate-800 text-sm tracking-tight">Registry & Storage</div>
                        </div>
                        <StatusBadge status={storage.state} />
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-center items-center text-center">
                        <div className="text-4xl font-black text-slate-900 tracking-tighter">{(storage.totalSizeBytes / (1024 ** 3)).toFixed(1)} GB</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Artifact footprint</div>
                        
                        <div className="w-full h-2 bg-slate-100 rounded-none mt-6 overflow-hidden border border-slate-200">
                            <div 
                                className="h-full bg-blue-500 rounded-none" 
                                style={{ width: `${(storage.totalSizeBytes / storage.capacityBytes) * 100}%` }} 
                            />
                        </div>
                        <div className="w-full flex justify-between mt-2">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Usage: {((storage.totalSizeBytes / storage.capacityBytes) * 100).toFixed(1)}%</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Limit: {(storage.capacityBytes / (1024 ** 3)).toFixed(1)} GB</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* Failure Pattern Forensics */}
            <div className="glass rounded-none border border-white overflow-hidden shadow-none">
                <div className="px-6 py-4 bg-slate-50/50 border-b border-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <GlobeAltIcon className="w-5 h-5 text-slate-400" />
                        <div className="font-bold text-slate-800 text-sm tracking-tight">Industrial Failure Patterns (24h)</div>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(outcomes?.patterns ?? []).map((p: any) => (
                        <div key={p.failure_code || Math.random()} className="p-4 rounded-none border border-slate-100 bg-white shadow-none flex items-center justify-between">
                            <div>
                                <div className="text-xs font-black text-slate-800 font-mono tracking-tight">{p.failure_code || 'UNCATEGORIZED'}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Incident Pattern</div>
                            </div>
                            <div className="text-2xl font-black text-red-500 tracking-tighter">{p.count}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const isLive = status === 'LIVE';
    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-none border ${isLive ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
            {isLive ? <CheckCircleIcon className="w-3.5 h-3.5" /> : <ExclamationCircleIcon className="w-3.5 h-3.5" />}
            <span className="text-[10px] font-black uppercase tracking-widest">{status}</span>
        </div>
    );
};

const QueueMetric = ({ label, value, color }: { label: string; value: number; color: string }) => {
    const colors: any = {
        blue: "text-blue-600 bg-blue-50",
        amber: "text-amber-600 bg-amber-50",
        red: "text-red-600 bg-red-50",
        orange: "text-orange-600 bg-orange-50"
    };
    return (
        <div className="p-2 rounded-none bg-slate-50 border border-slate-100">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
            <div className={`text-sm font-black mt-0.5`}>{value}</div>
        </div>
    );
};
