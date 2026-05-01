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
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Execution Orchestration</h2>
                    <p className="text-xs text-slate-500 font-medium">Intelligent routing and circuit-breaker management.</p>
                </div>
                <button 
                    onClick={handleRunAnalysis}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg shadow-slate-900/10"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                    RUN HEALTH ANALYSIS
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Fleet Health Card */}
                <div className="glass p-6 rounded-3xl border border-white relative overflow-hidden">
                    <div className="flex items-start justify-between mb-8">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fleet Health Score</p>
                            <h3 className="text-4xl font-black text-slate-900">{snapshot?.fleetHealth?.score || 0}%</h3>
                        </div>
                        <div className={`p-3 rounded-2xl ${snapshot?.fleetHealth?.score > 70 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                            <ShieldCheckIcon className={`w-6 h-6 ${snapshot?.fleetHealth?.score > 70 ? 'text-emerald-600' : 'text-amber-600'}`} />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <HealthStat label="Online Nodes" value={snapshot?.fleetHealth?.onlineCount || 0} total={snapshot?.fleetHealth?.totalNodes || 0} />
                        <HealthStat label="Avg Memory Pressure" value={`${snapshot?.fleetHealth?.avgMemUsage || 0}%`} color="text-blue-600" />
                        <HealthStat label="Capacity Headroom" value="Nominal" color="text-emerald-600" />
                    </div>
                </div>

                {/* Queue Routing Rules */}
                <div className="glass p-6 rounded-3xl border border-white">
                    <div className="flex items-center gap-2 mb-6">
                        <BoltIcon className="w-5 h-5 text-slate-900" />
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Active Routing Rules</h3>
                    </div>
                    <div className="space-y-3">
                        <RoutingRule label="Standard Pipelines" queue="preflight_async_queue" condition="Size < 500MB" />
                        <RoutingRule label="Heavy Payloads" queue="preflight_large_document" condition="Size > 500MB" />
                        <RoutingRule label="Isolated Quarantine" queue="preflight_quarantine" condition="Tenant Restricted" />
                    </div>
                </div>
            </div>

            {/* Circuit Breaker Status */}
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6">
                <div className="flex items-center gap-2 mb-4">
                    <ExclamationTriangleIcon className="w-5 h-5 text-slate-900" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Circuit Breaker & Quarantine</h3>
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

const HealthStat = ({ label, value, total, color = "text-slate-900" }: any) => (
    <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500">{label}</span>
        <div className="flex items-center gap-2">
            <span className={`text-xs font-black ${color}`}>{value} {total !== undefined && <span className="text-slate-300">/ {total}</span>}</span>
        </div>
    </div>
);

const RoutingRule = ({ label, queue, condition }: any) => (
    <div className="flex items-center justify-between p-3 bg-white/50 rounded-2xl border border-slate-100">
        <div>
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{label}</p>
            <p className="text-[9px] font-bold text-slate-400 font-mono">{queue}</p>
        </div>
        <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black text-slate-500 uppercase">{condition}</span>
    </div>
);

const CircuitBreakerCard = ({ label, status, detail }: any) => (
    <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{status}</span>
        </div>
        <p className="text-[10px] font-bold text-slate-900">{detail}</p>
    </div>
);
