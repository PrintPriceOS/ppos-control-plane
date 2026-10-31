// components/admin/OrchestrationTab.tsx
import React, { useState } from "react";
import { 
    BoltIcon, 
    ArrowPathIcon, 
    ShieldCheckIcon,
    ExclamationTriangleIcon
} from "@heroicons/react/24/outline";
import { triggerOrchestrationAnalysis } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { getIndustrialSnapshot } from "../../lib/adminApi";

export const OrchestrationTab: React.FC = () => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const q = useAdminQuery("industrial:snapshot", getIndustrialSnapshot, 10000);
    const snapshot = q.data;

    const handleRunAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            await triggerOrchestrationAnalysis();
            q.refetch();
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 italic-text-off">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Execution Orchestration</h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Intelligent routing and circuit-breaker management.</p>
                </div>
                <button 
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-zinc-800 text-white rounded-none text-xs font-black hover:bg-slate-800 dark:hover:bg-zinc-700 disabled:opacity-50 transition-all shadow-none"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                    RUN HEALTH ANALYSIS
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Fleet Health Card */}
                <div className="bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm p-6 rounded-none border border-slate-200 dark:border-zinc-800 relative overflow-hidden">
                    <div className="flex items-start justify-between mb-8">
                        <div>
                            <p className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Fleet Health Score</p>
                            <h3 className="text-4xl font-mono tracking-tight font-black text-slate-900 dark:text-white">{snapshot?.fleetHealth?.score || 0}%</h3>
                        </div>
                        <div className={`p-3 rounded-none ${snapshot?.fleetHealth?.score > 70 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-amber-50 dark:bg-amber-950/20'}`}>
                            <ShieldCheckIcon className={`w-6 h-6 ${snapshot?.fleetHealth?.score > 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <HealthStat label="Online Nodes" value={snapshot?.fleetHealth?.onlineCount || 0} total={snapshot?.fleetHealth?.totalNodes || 0} />
                        <HealthStat label="Avg Memory Pressure" value={`${snapshot?.fleetHealth?.avgMemUsage || 0}%`} color="text-blue-600 dark:text-blue-400" />
                        <HealthStat label="Capacity Headroom" value="Nominal" color="text-emerald-600 dark:text-emerald-400" />
                    </div>
                </div>

                {/* Queue Routing Rules */}
                <div className="bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm p-6 rounded-none border border-slate-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2 mb-6">
                        <BoltIcon className="w-5 h-5 text-slate-900 dark:text-white" />
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Active Routing Rules</h3>
                    </div>
                    <div className="space-y-3">
                        <RoutingRule label="Standard Pipelines" queue="preflight_async_queue" condition="Size < 500MB" />
                        <RoutingRule label="Heavy Payloads" queue="preflight_large_document" condition="Size > 500MB" />
                        <RoutingRule label="Isolated Quarantine" queue="preflight_quarantine" condition="Tenant Restricted" />
                    </div>
                </div>
            </div>

            {/* Circuit Breaker Status */}
            <div className="bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm border border-slate-200 dark:border-zinc-800 rounded-none p-6">
                <div className="flex items-center gap-2 mb-4">
                    <ExclamationTriangleIcon className="w-5 h-5 text-slate-900 dark:text-white" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Circuit Breaker & Quarantine</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <CircuitBreakerCard label="Node Auto-Quarantine" status="ACTIVE" detail="Threshold: Score < 30" />
                    <CircuitBreakerCard label="Submission Throttling" status="INACTIVE" detail="Threshold: Queue > 500" />
                    <CircuitBreakerCard label="Recursive Job Loop Detection" status="ACTIVE" detail="Global Protection" />
                </div>
            </div>
        </div>
    );
};

const HealthStat = ({ label, value, total, color = "text-slate-900 dark:text-white" }: any) => (
    <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">{label}</span>
        <div className="flex items-center gap-2">
            <span className={`text-xs font-mono tracking-tight font-black ${color}`}>{value} {total !== undefined && <span className="text-slate-300 dark:text-zinc-600">/ {total}</span>}</span>
        </div>
    </div>
);

const RoutingRule = ({ label, queue, condition }: any) => (
    <div className="flex items-center justify-between p-3 bg-slate-50/50 dark:bg-zinc-900/20 border border-slate-100 dark:border-zinc-850/60">
        <div>
            <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{label}</p>
            <p className="text-[9px] font-bold text-slate-500 dark:text-zinc-400 font-mono">{queue}</p>
        </div>
        <span className="px-2 py-0.5 bg-slate-100 dark:bg-zinc-800 rounded-none text-[9px] font-black text-slate-500 dark:text-zinc-400 uppercase">{condition}</span>
    </div>
);

const CircuitBreakerCard = ({ label, status, detail }: any) => (
    <div className="p-4 bg-slate-50/50 dark:bg-zinc-900/20 rounded-none border border-slate-100 dark:border-zinc-850/60 shadow-none">
        <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">{label}</span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-none ${status === 'ACTIVE' ? 'bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'}`}>{status}</span>
        </div>
        <p className="text-[10px] font-mono tracking-tight font-black text-slate-900 dark:text-white">{detail}</p>
    </div>
);
