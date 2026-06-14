import React from 'react';
import { CpuChipIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { getPreflightWorkers } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";

export const PreflightWorkersPage: React.FC = () => {
  const q = useAdminQuery("preflight:workers", getPreflightWorkers, 10000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Worker Health</h1>
        <p className="text-sm text-slate-500 font-medium">Real-time status of PDF engine worker nodes.</p>
      </div>

      <DataTable 
        isLoading={q.status === 'loading'}
        data={q.data?.workers || []}
        rowClassName={(w) => w.status !== 'ONLINE' && w.status !== 'BUSY' ? '!bg-red-500/[0.04] dark:!bg-red-950/20 border-l-2 border-l-red-500' : ''}
        columns={[
          {
            header: 'Worker ID',
            accessor: (w) => (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-none bg-slate-100 dark:bg-[#131314]/[0.05] flex items-center justify-center">
                  <CpuChipIcon className="w-4 h-4 text-slate-400" />
                </div>
                <span className="font-bold">{w.name}</span>
              </div>
            )
          },
          {
            header: 'Status',
            accessor: (w) => (
              <div className="flex items-center gap-2">
                {w.status === 'ONLINE' ? (
                  <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                ) : w.status === 'BUSY' ? (
                  <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />
                ) : (
                  <XCircleIcon className="w-4 h-4 text-red-500" />
                )}
                <span className="text-[10px] font-black uppercase tracking-widest">{w.status}</span>
              </div>
            )
          },
          {
            header: 'CPU Usage',
            accessor: (w) => <UsageBar value={w.cpuUsage} />
          },
          {
            header: 'Memory Usage',
            accessor: (w) => <UsageBar value={w.memUsage} />
          },
          {
            header: 'Active Jobs',
            accessor: (w) => <span className="font-mono font-bold text-slate-700 dark:text-[#ECECF1]">{w.activeJobs}</span>
          },
          {
            header: 'Last Seen',
            accessor: (w) => <span className="text-xs text-slate-400">{new Date(w.lastSeen).toLocaleTimeString()}</span>
          },
          {
            header: 'Cluster Governance',
            accessor: (w) => (
              <div className="flex gap-2">
                <button 
                  onClick={() => alert(`Isolating node: ${w.name}`)}
                  className="px-2.5 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[9px] font-black uppercase tracking-wider transition-all border border-red-500/20"
                >
                  Isolate Node
                </button>
                <button 
                  onClick={() => alert(`Flushing cache for node: ${w.name}`)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-[9px] font-black uppercase tracking-wider transition-all border border-slate-200 dark:border-zinc-700"
                >
                  Flush Cache
                </button>
              </div>
            )
          }
        ]}
      />
      
      {!q.data?.workers && q.status !== 'loading' && (
        <div className="p-10 text-center font-bold text-slate-300 italic uppercase tracking-widest border-2 border-dashed border-slate-100 rounded-none">
          Endpoint Unavailable: Worker Health data could not be fetched.
        </div>
      )}
    </div>
  );
};

const UsageBar = ({ value }: { value: number }) => (
  <div className="flex flex-col gap-1 w-24">
    <div className="h-1.5 bg-slate-100 dark:bg-[#131314]/[0.05] rounded-none overflow-hidden">
      <div className={`h-full ${value > 80 ? 'bg-red-500' : value > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
           style={{ width: `${value}%` }} />
    </div>
    <span className="text-[9px] font-bold text-slate-400 uppercase">{value}%</span>
  </div>
);
