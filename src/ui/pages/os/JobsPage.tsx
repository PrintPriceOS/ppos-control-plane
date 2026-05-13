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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight uppercase">Jobs & Pipeline Visibility Console</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Real-time status of all preflight and autofix requests across the regional BullMQ stack.</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
          <span>Active Pipes: <strong className="text-zinc-900 dark:text-zinc-200">2</strong></span>
          <span>•</span>
          <span>Ledger Indexing: <strong className="text-emerald-600 dark:text-emerald-500">Online</strong></span>
        </div>
      </div>

      {/* Compressed Operational Toolbar */}
      <div className="p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 font-mono text-xs shadow-none">
          <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              <input 
                  type="text" 
                  placeholder="Filter signature by ID, Tenant, or Action DTO..." 
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none pl-8 pr-3 py-1 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#dc0000]"
              />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button className="px-3 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wide leading-none transition-colors text-[11px]">
                Status: All
            </button>
            <button className="px-3 py-1 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white dark:text-zinc-200 font-bold uppercase tracking-wide leading-none transition-colors text-[11px]">
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
          if (j.status === 'FAILED' || j.error) return 'bg-red-50/40 dark:bg-red-950/20 border-l-2 border-[#dc0000]';
          if (j.attempts && j.attempts > 0) return 'bg-amber-50/30 dark:bg-amber-950/10 border-l-2 border-amber-500';
          if (j.status === 'COMPLETED') return 'opacity-80 hover:opacity-100 transition-opacity';
          return '';
        }}
        columns={[
          {
            header: 'Job ID',
            accessor: (j) => {
              const isQuiet = j.status === 'COMPLETED';
              return (
                <span className={`font-mono text-xs ${isQuiet ? 'text-zinc-400 dark:text-zinc-500 font-normal' : 'text-zinc-900 dark:text-zinc-100 font-bold'}`}>
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
                <span className={`font-mono text-[11px] ${isQuiet ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-300 font-bold'}`}>
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
                <span className={`px-1.5 py-0.5 border text-[9px] font-bold uppercase tracking-wide ${
                  isQuiet ? 'border-zinc-200 dark:border-zinc-800/60 bg-transparent text-zinc-400 dark:text-zinc-600' : 
                  'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-200'
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
                    isFail ? 'bg-[#dc0000] border-red-800 font-bold' : 'bg-sky-500 border-sky-700 animate-pulse'
                  }`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wide leading-none ${
                    isQuiet ? 'text-emerald-700/60 dark:text-emerald-500/50 font-normal' : 
                    isFail ? 'text-[#dc0000] dark:text-red-400 font-bold' : 'text-sky-700 dark:text-sky-400'
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
                  <span className={`px-1 py-0.5 border ${
                    hasRetries ? 'bg-amber-50 border-amber-200 text-amber-800 font-bold dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-400' : 
                    isQuiet ? 'bg-transparent border-transparent text-zinc-300 dark:text-zinc-700' : 
                    'bg-zinc-50 border-zinc-200 text-zinc-500 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400'
                  }`} title="Retries Applied">
                    R:{typeof j.attempts === 'object' ? 0 : (j.attempts || 0)}
                  </span>

                  {j.error ? (
                    <span className="px-1 py-0.5 border border-red-200 bg-red-50 text-[#dc0000] font-bold dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-400" title="Execution Errors Detected">
                      ERR
                    </span>
                  ) : (
                    <span className={`px-1 py-0.5 border ${
                      isQuiet ? 'bg-transparent border-transparent text-zinc-300 dark:text-zinc-700' : 
                      'bg-zinc-50 border-zinc-200 text-zinc-400 dark:bg-transparent dark:border-zinc-800 dark:text-zinc-600'
                    }`}>
                      OK
                    </span>
                  )}

                  {j.duration_ms && (
                    <span className={`px-1 py-0.5 border ${
                      isQuiet ? 'bg-transparent border-transparent text-zinc-400 dark:text-zinc-600 font-normal' : 
                      'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 font-bold'
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
              <span className={`font-mono text-[10px] ${isQuiet ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {j.created_at ? new Date(j.created_at).toISOString().split('T')[1]?.substring(0, 8) : '---'}
              </span>
            );
          },
          className: 'text-right'
        },
        {
          header: '',
          accessor: () => (
            <button className="p-1 text-zinc-400 hover:text-zinc-900 dark:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
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
