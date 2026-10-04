import React, { useEffect } from 'react';
import { 
  Square3Stack3DIcon, 
  CheckBadgeIcon, 
  ClockIcon, 
  BoltIcon, 
  QueueListIcon,
  ShieldCheckIcon,
  ServerIcon,
  ArrowRightIcon,
  CircleStackIcon
} from "@heroicons/react/24/outline";
import { getOverview, getQueue, getGovernanceBlocks } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { getUserRole, isPrinthouseUser } from "../../lib/authStore";
import { DataTable } from "../../components/DataTable";
import { useLocale } from "../../i18n";

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  primary: { bg: "bg-zinc-950/40", text: "text-zinc-400" },
  emerald: { bg: "bg-emerald-950/40", text: "text-emerald-400" },
  amber:   { bg: "bg-amber-950/40", text: "text-amber-400" },
  orange:  { bg: "bg-red-950/40", text: "text-red-400" },
};

const KpiCard = ({ title, value, sub, Icon, color }: { title: string; value: string; sub?: string; Icon: any; color: string }) => {
  const cfg = COLOR_MAP[color] || COLOR_MAP.primary;
  return (
    <div className="glass border ppos-border ppos-surface text-[#ECECF1] p-5 rounded-none flex flex-col gap-4 group hover:border-zinc-500 transition-all shadow-none">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-none ${cfg.bg} ${cfg.text} border ppos-border`}>
          <Icon className="w-6 h-6" />
        </div>
        {sub && <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sub}</span>}
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <p className="font-mono font-black text-3xl tracking-tight text-white dark:text-[#ECECF1]">{value}</p>
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
    const { t } = useLocale();
    const role = getUserRole();
    const isPrinthouse = isPrinthouseUser();

    // Consume background-refresh native support with 5000ms
    const o = useAdminQuery("overview:24h", () => getOverview("24h"), 5000);
    const q = useAdminQuery("queue-live", getQueue, 5000);
    const gov = useAdminQuery("governance-blocks", getGovernanceBlocks, 5000);

    // Defensive destructuring supporting both camelCase and snake_case properties
    const efficiencyPct = o.data?.efficiencyRate ?? o.data?.efficiency_rate ?? 0.85;
    const activeWorkers = o.data?.activeWorkers ?? o.data?.active_workers ?? 12;
    const totalWorkers = o.data?.totalWorkers ?? o.data?.total_workers ?? 12;

    const queueData = q.data ? [
        { status: 'Active', count: q.data.active ?? q.data.active_count ?? 0, description: t('dashboard.statusActiveDesc') || 'Jobs currently being processed by workers' },
        { status: 'Waiting', count: q.data.waiting ?? q.data.waiting_count ?? 0, description: t('dashboard.statusWaitingDesc') || 'Jobs in queue waiting for an available worker' },
        { status: 'Delayed', count: q.data.delayed ?? q.data.delayed_count ?? 0, description: t('dashboard.statusDelayedDesc') || 'Scheduled or delayed jobs' },
        { status: 'Failed', count: q.data.failed ?? q.data.failed_count ?? 0, description: t('dashboard.statusFailedDesc') || 'Jobs that encountered errors during execution' },
        { status: 'Completed', count: q.data.completed ?? q.data.completed_count ?? 0, description: t('dashboard.statusCompletedDesc') || 'Successfully completed jobs' },
    ] : [];

    const queueColumns = [
        {
            header: t('dashboard.queueStatus') || 'Queue Status',
            accessor: (row: any) => {
                const label = 
                    row.status === 'Active' ? (t('dashboard.queueStatusActive') || 'Active') :
                    row.status === 'Waiting' ? (t('dashboard.queueStatusWaiting') || 'Waiting') :
                    row.status === 'Delayed' ? (t('dashboard.queueStatusDelayed') || 'Delayed') :
                    row.status === 'Failed' ? (t('dashboard.queueStatusFailed') || 'Failed') :
                    row.status === 'Completed' ? (t('dashboard.queueStatusCompleted') || 'Completed') :
                    row.status;
                return (
                    <span className={`font-bold ${
                        row.status === 'Failed' ? 'text-red-400' :
                        row.status === 'Completed' ? 'text-emerald-400' :
                        row.status === 'Active' ? 'text-blue-400' :
                        'text-[#ECECF1]'
                    }`}>
                        {label}
                    </span>
                );
            }
        },
        {
            header: t('dashboard.jobCount') || 'Job Count',
            accessor: (row: any) => (
                <span className="font-mono font-black text-white dark:text-[#ECECF1]">
                    {row.count}
                </span>
            )
        },
        {
            header: t('dashboard.description') || 'Description',
            accessor: (row: any) => (
                <span className="text-zinc-400">
                    {row.description}
                </span>
            )
        }
    ];

    return (
        <div className="space-y-8 font-manrope">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b ppos-border pb-4">
                <div>
                    <h1 className="text-2xl font-black text-white dark:text-[#ECECF1] tracking-tight">
                        {isPrinthouse ? (t('dashboard.printhouseHub') || 'Printhouse Hub') : (t('dashboard.osControlCenter') || 'OS Control Center')}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                        {isPrinthouse 
                          ? (t('dashboard.printhouseDesc') || 'Real-time production vitals, job status, and operational metrics.')
                          : (t('dashboard.osControlDesc') || 'Global governance, real-time vitals, and infrastructure coordination.')}
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950/40 text-zinc-300 border border-zinc-800 rounded-none text-xs font-bold uppercase tracking-widest">
                   <ClockIcon className="w-4 h-4" />
                   <span>{t('dashboard.last24Hours') || 'Last 24 Hours'}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title={isPrinthouse ? (t('dashboard.assignedJobs') || "Assigned Jobs") : (t('dashboard.globalJobs') || "Global Jobs")} value={String(o.data?.totalJobs || o.data?.total_jobs || 0)} Icon={Square3Stack3DIcon} color="primary" />
                <KpiCard title={t('dashboard.slaSuccess') || "SLA Success"} value={`${Number(o.data?.successRate || o.data?.success_rate || 0).toFixed(1)}%`} Icon={CheckBadgeIcon} color="emerald" />
                <KpiCard title={isPrinthouse ? (t('dashboard.avgTurnaround') || "Avg. Turnaround") : (t('dashboard.meanLatency') || "Mean Latency")} value={`${o.data?.avgLatencyMs || o.data?.avg_latency_ms || 0}ms`} Icon={BoltIcon} color="amber" />
                <KpiCard title={isPrinthouse ? (t('dashboard.pendingAction') || "Pending Action") : (t('dashboard.queueDepth') || "Queue Depth")} value={String(o.data?.queueBacklog || o.data?.queue_backlog || 0)} Icon={QueueListIcon} color="orange" />
            </div>

            {!isPrinthouse && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 glass border ppos-border ppos-surface text-[#ECECF1] p-6 flex flex-col gap-6 shadow-none">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <ShieldCheckIcon className="w-5 h-5 text-zinc-400" />
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('dashboard.activeGovBlocks') || 'Active Governance Blocks'}</h3>
                            </div>
                            <button className="text-xs font-bold text-[#dc0000] dark:text-red-400 hover:underline flex items-center gap-1">
                                {t('dashboard.exploreAll') || 'Explore All'} <ArrowRightIcon className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            {(gov.data?.blocks ?? []).map(block => (
                                <div key={block.id} className="flex items-center justify-between p-4 rounded-none bg-zinc-950/20 border border-zinc-800">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-none bg-zinc-950/40 border border-zinc-800 flex items-center justify-center font-mono text-[10px] font-bold text-[#ECECF1]">
                                        {abbreviateId(block.id)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{block.name}</p>
                                            <p className="text-[10px] text-zinc-400 font-bold uppercase">{block.id} · {block.impact}</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-none bg-emerald-950/40 text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                                        {block.status}
                                    </span>
                                </div>
                            ))}
                            {gov.data?.blocks?.length === 0 && (
                                <p className="text-xs text-zinc-400 text-center py-4">{t('dashboard.noActiveGovBlocks') || 'No active governance blocks'}</p>
                            )}
                        </div>
                    </div>

                    <div className="glass border ppos-border ppos-surface text-[#ECECF1] p-6 flex flex-col gap-6 shadow-none">
                        <div className="flex items-center gap-3">
                            <ServerIcon className="w-5 h-5 text-zinc-400" />
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t('dashboard.workerCluster') || 'Worker Cluster'}</h3>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                            <div className="relative">
                                <svg className="w-32 h-32 transform -rotate-90">
                                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-zinc-800/40 dark:text-zinc-900/60" />
                                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray="364.4" strokeDashoffset={364.4 * (1 - efficiencyPct)} className="text-[#dc0000]" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-mono font-black text-white dark:text-[#ECECF1]">{Math.round(efficiencyPct * 100)}%</span>
                                    <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">{t('dashboard.efficiency') || 'Efficiency'}</span>
                                </div>
                            </div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-2">{activeWorkers}/{totalWorkers} {t('dashboard.workersActive') || 'Workers Active'}</p>
                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{t('dashboard.regionalCluster') || 'Regional Cluster eu-west-1'}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass border ppos-border ppos-surface text-[#ECECF1] overflow-hidden shadow-none mt-6" id="queue-stream">
                <div className="px-6 py-4 bg-slate-900/50 border-b ppos-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CircleStackIcon className="w-5 h-5 text-slate-400" />
                        <div className="font-bold text-slate-800 dark:text-white text-sm tracking-tight">{t('dashboard.queueStream') || 'Queue Stream'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-none bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('dashboard.liveBufferTrace') || 'Live Buffer Trace'}</span>
                    </div>
                </div>
                <div className="p-0">
                    {q.status === "loading" && <div className="p-10 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">{t('dashboard.attachingStream') || 'Attaching to stream...'}</div>}
                    {q.status === "error" && <div className="p-10 text-center text-red-500 text-sm font-bold">{t('dashboard.errorLoadingStream') || 'Error loading stream'}</div>}
                    {(q.status === "success" || q.status === "refetching" || q.data) && q.data && (
                        <div className="bg-black/20 border-t ppos-border">
                            <DataTable 
                                columns={queueColumns}
                                data={queueData}
                                compact={true}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
