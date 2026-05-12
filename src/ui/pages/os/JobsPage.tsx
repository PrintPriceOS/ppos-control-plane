import React from 'react';
import { QueueListIcon, FunnelIcon, ClockIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { getJobs } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";
import { JobDetailDrawer } from "../../components/JobDetailDrawer";
import { short } from "../../lib/formatters";
import { safeArray } from "../../lib/display";

export const JobsPage: React.FC = () => {
  const [selectedJob, setSelectedJob] = React.useState<any | null>(null);
  const q = useAdminQuery("jobs:global", () => getJobs({ limit: 50 }), 10000);

  const sStr = (v: any): string => {
    if (!v) return '';
    if (typeof v === 'object') {
      const msg = v.message || v.code || v.error || JSON.stringify(v);
      return typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
    }
    return String(v);
  };
  const jobs = safeArray(q.data?.jobs || (q.data as any)?.data);

  return (
    <div className="space-y-4">
      {/* High-Density Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-white/10">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Jobs & Pipeline Visibility Console</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">Real-time status of all preflight and autofix requests across the regional BullMQ stack.</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 dark:text-zinc-500">
          <span>Active Pipes: <strong className="text-slate-800 dark:text-zinc-300">2</strong></span>
          <span>•</span>
          <span>Ledger Indexing: <strong className="text-emerald-600 dark:text-emerald-500">Online</strong></span>
        </div>
      </div>

      {/* Compressed Operational Toolbar */}
      <div className="p-2 bg-slate-50 dark:bg-[#131314] border border-slate-200 dark:border-white/[0.07] flex items-center gap-3 italic-text-off font-mono text-xs">
          <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
              <input 
                  type="text" 
                  placeholder="Filter signature by ID, Tenant, or Action DTO..." 
                  className="w-full bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-none pl-8 pr-3 py-1 text-xs font-bold text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-slate-900 dark:focus:border-white/30"
              />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button className="px-3 py-1 bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-600 dark:text-zinc-400 font-black uppercase tracking-wider leading-none transition-colors text-[11px]">
                Status: All
            </button>
            <button className="px-3 py-1 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-zinc-200 text-white dark:text-black font-black uppercase tracking-wider leading-none transition-colors text-[11px]">
                Force Sync
            </button>
          </div>
      </div>

      {/* Ultra-Dense Execution Row Table with Signal Prioritization and Quiet-Healthy Filtering */}
      <DataTable 
        isLoading={q.status === 'loading'}
        data={jobs}
        compact={true}
        onRowClick={(j) => setSelectedJob(j)}
        rowClassName={(j) => {
          // Task 1 & 2: Problems emerge instantly; Healthy states fade quietly into the background
          if (j.status === 'FAILED' || j.error) return 'bg-red-50/80 dark:bg-red-950/20 border-l-2 border-red-600';
          if (j.attempts && j.attempts > 0) return 'bg-amber-50/40 dark:bg-amber-950/10 border-l-2 border-amber-500';
          if (j.status === 'COMPLETED') return 'opacity-75 hover:opacity-100 transition-opacity';
          return '';
        }}
        columns={[
          {
            header: 'Job ID',
            accessor: (j) => {
              const isQuiet = j.status === 'COMPLETED';
              return (
                <span className={`font-mono text-xs ${isQuiet ? 'text-slate-400 dark:text-zinc-500 font-normal' : 'text-slate-900 dark:text-white font-bold'}`}>
                  {short(j.id, 14)}
                </span>
              );
            }
          },
          {
            header: 'Tenant Scope',
            accessor: (j) => {
              const isQuiet = j.status === 'COMPLETED';
              return (
                <span className={`font-mono text-[11px] ${isQuiet ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-600 dark:text-zinc-400 font-bold'}`}>
                  {sStr(j.tenant_id)}
                </span>
              );
            }
          },
          {
            header: 'Task Profile',
            accessor: (j) => {
              const isQuiet = j.status === 'COMPLETED';
              return (
                <span className={`px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-wider ${
                  isQuiet ? 'border-slate-100 bg-transparent text-slate-400 dark:border-white/[0.03] dark:text-zinc-600' : 
                  'border-slate-200 bg-white dark:bg-[#1a1a1b] text-slate-700 dark:text-zinc-300 dark:border-white/10'
                }`}>
                  {sStr(j.type)}
                </span>
              );
            }
          },
          {
            header: 'Status Consensus',
            accessor: (j) => {
              const isQuiet = j.status === 'COMPLETED';
              const isFail = j.status === 'FAILED';
              return (
                <div className="flex items-center gap-1.5 font-mono">
                  <span className={`w-2 h-2 rounded-none border shrink-0 ${
                    isQuiet ? 'bg-emerald-600/40 border-emerald-700/30' : 
                    isFail ? 'bg-red-500 border-red-700 font-bold' : 'bg-blue-500 border-blue-700 animate-pulse'
                  }`} />
                  <span className={`text-[10px] font-black uppercase tracking-wider leading-none ${
                    isQuiet ? 'text-emerald-700/60 dark:text-emerald-500/50 font-normal' : 
                    isFail ? 'text-red-700 dark:text-red-400 font-black' : 'text-blue-700 dark:text-blue-400'
                  }`}>
                    {sStr(j.status)}
                  </span>
                </div>
              );
            }
          },
          {
            header: 'Telemetry Indicators',
            accessor: (j) => {
              const isQuiet = j.status === 'COMPLETED';
              const hasRetries = j.attempts && j.attempts > 0;
              return (
                <div className="flex items-center gap-1 font-mono text-[9px] select-none">
                  {/* Retry Counter: elevated if active, muted if zero */}
                  <span className={`px-1 py-0.2 border ${
                    hasRetries ? 'bg-amber-100 border-amber-300 text-amber-900 font-black dark:bg-amber-950 dark:border-amber-700 dark:text-amber-300' : 
                    isQuiet ? 'bg-transparent border-slate-100 text-slate-300 dark:border-white/[0.02] dark:text-zinc-700' : 
                    'bg-slate-50 border-slate-200 text-slate-500 dark:bg-[#1a1a1b] dark:border-white/[0.05] dark:text-zinc-400'
                  }`} title="Retries Applied">
                    R:{typeof j.attempts === 'object' ? 0 : (j.attempts || 0)}
                  </span>

                  {/* Error Indicator: elevated if present */}
                  {j.error ? (
                    <span className="px-1 py-0.2 border border-red-300 bg-red-100 text-red-800 font-black dark:bg-red-950 dark:border-red-800 dark:text-red-300" title="Execution Errors Detected">
                      ERR
                    </span>
                  ) : (
                    <span className={`px-1 py-0.2 border ${
                      isQuiet ? 'bg-transparent border-transparent text-slate-300 dark:text-zinc-700' : 
                      'bg-slate-50 border-slate-100 text-slate-400 dark:bg-transparent dark:border-white/[0.03] dark:text-zinc-600'
                    }`}>
                      OK
                    </span>
                  )}

                  {/* Runtime Duration */}
                  {j.duration_ms && (
                    <span className={`px-1 py-0.2 border ${
                      isQuiet ? 'bg-transparent border-transparent text-slate-400 dark:text-zinc-600 font-normal' : 
                      'bg-white border-slate-100 text-slate-700 dark:bg-[#1a1a1b] dark:border-white/[0.05] dark:text-zinc-300 font-bold'
                    }`} title="Runtime Latency">
                      {typeof j.duration_ms === 'object' ? '---' : j.duration_ms}ms
                    </span>
                  )}
                </div>
              );
            }
          },
          {
            header: 'Ingress TS',
            accessor: (j) => {
              const isQuiet = j.status === 'COMPLETED';
              return (
                <span className={`font-mono text-[10px] ${isQuiet ? 'text-slate-300 dark:text-zinc-700' : 'text-slate-500 dark:text-zinc-500'}`}>
                  {j.created_at ? new Date(j.created_at).toISOString().split('T')[1]?.substring(0, 8) : '---'}
                </span>
              );
            },
            className: 'text-right'
          },
          {
            header: '',
            accessor: () => (
              <button className="p-1 text-slate-300 hover:text-slate-900 dark:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </button>
            ),
            className: 'w-8 text-center'
          }
        ]}
      />

      <JobDetailDrawer 
        job={selectedJob}
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
};
