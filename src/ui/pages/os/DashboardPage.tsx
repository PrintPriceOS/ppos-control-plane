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
import { getOverview, getQueue, getGovernanceBlocks } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { getUserRole, isPrinthouseUser } from "../../lib/authStore";

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  primary: { bg: "bg-zinc-50 dark:bg-zinc-900", text: "text-zinc-600 dark:text-zinc-300" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400" },
  amber:   { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400" },
  orange:  { bg: "bg-red-50 dark:bg-red-950/40", text: "text-[#dc0000] dark:text-red-400" },
};

const KpiCard = ({ title, value, sub, Icon, color }: { title: string; value: string; sub?: string; Icon: any; color: string }) => {
  const cfg = COLOR_MAP[color] || COLOR_MAP.primary;
  return (
    <div className="bg-white dark:bg-zinc-950 p-5 rounded-none border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4 group hover:border-zinc-400 dark:hover:border-zinc-700 transition-all shadow-none">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-none ${cfg.bg} ${cfg.text}`}>
          <Icon className="w-6 h-6" />
        </div>
        {sub && <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{sub}</span>}
      </div>
      <div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{title}</p>
        <p className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">{value}</p>
      </div>
    </div>
  );
};

function abbreviateId(id: string): string {
    const parts = id.split('_');
    const initials = parts
        .filter(p => isNaN(Number(p)))
        .map(p => p[0].toUpperCase())
        .join('');
    const num = parts.filter(p => !isNaN(Number(p)) && p !== '').map(Number).pop();
    return num !== undefined ? `${initials}-${num}` : initials;
}

export const DashboardPage: React.FC = () => {
    const role = getUserRole();
    const isPrinthouse = isPrinthouseUser();

    const o = useAdminQuery("overview:24h", () => getOverview("24h"), 30000);
    const q = useAdminQuery("queue-live", getQueue, 10000);
    const gov = useAdminQuery("governance-blocks", getGovernanceBlocks, 60000);

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                        {isPrinthouse ? 'Printhouse Hub' : 'OS Control Center'}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                        {isPrinthouse 
                          ? 'Real-time production vitals, job status, and operational metrics.' 
                          : 'Global governance, real-time vitals, and infrastructure coordination.'}
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 rounded-none text-xs font-bold uppercase tracking-widest">
                   <ClockIcon className="w-4 h-4" />
                   <span>Last 24 Hours</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title={isPrinthouse ? "Assigned Jobs" : "Global Jobs"} value={String(o.data?.totalJobs || 0)} Icon={Square3Stack3DIcon} color="primary" />
                <KpiCard title="SLA Success" value={`${Number(o.data?.successRate || 0).toFixed(1)}%`} Icon={CheckBadgeIcon} color="emerald" />
                <KpiCard title={isPrinthouse ? "Avg. Turnaround" : "Mean Latency"} value={`${o.data?.avgLatencyMs || 0}ms`} Icon={BoltIcon} color="amber" />
                <KpiCard title={isPrinthouse ? "Pending Action" : "Queue Depth"} value={String(o.data?.queueBacklog || 0)} Icon={QueueListIcon} color="orange" />
            </div>

            {!isPrinthouse && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Governance Summary */}
                    <div className="lg:col-span-2 bg-white dark:bg-zinc-950 rounded-none border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col gap-6 shadow-none">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <ShieldCheckIcon className="w-5 h-5 text-zinc-400" />
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Active Governance Blocks</h3>
                            </div>
                            <button className="text-xs font-bold text-[#dc0000] dark:text-red-400 hover:underline flex items-center gap-1">
                                Explore All <ArrowRightIcon className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            {(gov.data?.blocks ?? []).map(block => (
                                <div key={block.id} className="flex items-center justify-between p-4 rounded-none bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-none bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                                        {abbreviateId(block.id)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{block.name}</p>
                                            <p className="text-[10px] text-zinc-400 font-bold uppercase">{block.id} · {block.impact}</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-none bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest border border-emerald-100 dark:border-emerald-900/60">
                                        {block.status}
                                    </span>
                                </div>
                            ))}
                            {gov.data?.blocks?.length === 0 && (
                                <p className="text-xs text-zinc-400 text-center py-4">No active governance blocks</p>
                            )}
                        </div>
                    </div>

                    {/* Worker Status */}
                    <div className="bg-white dark:bg-zinc-950 rounded-none border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col gap-6 shadow-none">
                        <div className="flex items-center gap-3">
                            <ServerIcon className="w-5 h-5 text-zinc-400" />
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Worker Cluster</h3>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                            <div className="relative">
                                <svg className="w-32 h-32 transform -rotate-90">
                                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-zinc-100 dark:text-zinc-900" />
                                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray="364.4" strokeDashoffset={364.4 * (1 - 0.85)} className="text-[#dc0000]" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">85%</span>
                                    <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Efficiency</span>
                                </div>
                            </div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-2">12/12 Workers Active</p>
                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Regional Cluster eu-west-1</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
