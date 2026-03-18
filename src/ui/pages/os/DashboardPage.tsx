import React from 'react';
import { 
  Square3Stack3DIcon, 
  CheckBadgeIcon, 
  BanknotesIcon, 
  ClockIcon, 
  ArrowTrendingUpIcon, 
  ScaleIcon, 
  BoltIcon, 
  QueueListIcon,
  ShieldCheckIcon,
  ServerIcon,
  ArrowRightIcon
} from "@heroicons/react/24/outline";
import { getOverview, getQueue } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";

const KpiCard = ({ title, value, sub, Icon, color }: { title: string; value: string; sub?: string; Icon: any; color: string }) => (
  <div className="glass p-5 rounded-2xl border border-white flex flex-col gap-4 group hover:border-primary/20 transition-all">
    <div className="flex items-center justify-between">
      <div className={`p-3 rounded-xl bg-${color}/10 text-${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      {sub && <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sub}</span>}
    </div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
      <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
    </div>
  </div>
);

export const DashboardPage: React.FC = () => {
    const o = useAdminQuery("overview:24h", () => getOverview("24h"), 30000);
    const q = useAdminQuery("queue-live", getQueue, 10000);

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">OS Control Center</h1>
                    <p className="text-sm text-slate-500 font-medium">Global governance, real-time vitals, and infrastructure coordination.</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest">
                   <ClockIcon className="w-4 h-4" />
                   <span>Last 24 Hours</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Global Jobs" value={String(o.data?.totalJobs || 0)} Icon={Square3Stack3DIcon} color="primary" />
                <KpiCard title="SLA Success" value={`${(o.data?.successRate || 0).toFixed(1)}%`} Icon={CheckBadgeIcon} color="emerald" />
                <KpiCard title="Mean Latency" value={`${o.data?.avgLatencyMs || 0}ms`} Icon={BoltIcon} color="amber" />
                <KpiCard title="Queue Depth" value={String(o.data?.queueBacklog || 0)} Icon={QueueListIcon} color="orange" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Governance Summary */}
                <div className="lg:col-span-2 glass rounded-2xl border border-white p-6 flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ShieldCheckIcon className="w-5 h-5 text-slate-400" />
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Governance Blocks</h3>
                        </div>
                        <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                            Explore All <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="space-y-4 italic-text-off">
                        {[
                            { id: 'GB-101', name: 'Regional Data Sovereignty v1.2', status: 'Enforced', impact: 'Global' },
                            { id: 'GB-102', name: 'Tenant Isolation Protocol v2.0', status: 'Enforced', impact: 'eu-west-1' }
                        ].map(block => (
                            <div key={block.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center font-mono text-[10px] font-black">
                                       {block.id}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">{block.name}</p>
                                        <p className="text-[10px] text-slate-400 font-black uppercase">{block.impact}</p>
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                                    {block.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Worker Status */}
                <div className="glass rounded-2xl border border-white p-6 flex flex-col gap-6">
                    <div className="flex items-center gap-3">
                        <ServerIcon className="w-5 h-5 text-slate-400" />
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Worker Cluster</h3>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                         <div className="relative">
                            <svg className="w-32 h-32 transform -rotate-90">
                                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100" />
                                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray="364.4" strokeDashoffset={364.4 * (1 - 0.85)} className="text-primary" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-black text-slate-900">85%</span>
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Efficiency</span>
                            </div>
                         </div>
                         <p className="text-sm font-bold text-slate-900 mt-2">12/12 Workers Active</p>
                         <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Regional Cluster eu-west-1</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
