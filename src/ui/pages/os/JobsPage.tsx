import React from 'react';
import { QueueListIcon, FunnelIcon, ClockIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { getJobs } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";
import { JobDetailDrawer } from "../../components/JobDetailDrawer";

export const JobsPage: React.FC = () => {
  const [selectedJob, setSelectedJob] = React.useState<any | null>(null);
  const q = useAdminQuery("jobs:global", () => getJobs({ limit: 50 }), 10000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Jobs & Pipeline Visibility</h1>
          <p className="text-sm text-slate-500 font-medium">Real-time status of all preflight and autofix requests across the regional BullMQ stack.</p>
        </div>
      </div>
      <div className="glass p-4 rounded-2xl border border-white flex items-center gap-4 italic-text-off">
          <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
              <input 
                  type="text" 
                  placeholder="Filter by Job ID, Tenant ID, or Type..." 
                  className="w-full bg-slate-50 border-none rounded-xl pl-10 pr-4 py-2 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20"
              />
          </div>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest leading-none">
                <FunnelIcon className="w-4 h-4" />
                <span>Status: All</span>
            </button>
            <button className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest leading-none shadow-lg shadow-slate-900/10 active:scale-95 transition-all">
                Force Redispatch
            </button>
          </div>
      </div>

      <DataTable 
        isLoading={q.status === 'loading'}
        data={q.data?.jobs || []}
        onRowClick={(j) => setSelectedJob(j)}
        columns={[
          {
            header: 'Job ID',
            accessor: (j) => <span className="font-mono text-xs">{j.id.slice(0, 16)}...</span>
          },
          {
            header: 'Tenant',
            accessor: (j) => <span className="font-bold text-slate-600">{j.tenant_id}</span>
          },
          {
            header: 'Type',
            accessor: (j) => (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                {j.type}
              </span>
            )
          },
          {
            header: 'Status',
            accessor: (j) => (
              <div className="flex items-center gap-2">
                {j.status === 'COMPLETED' ? (
                  <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                ) : j.status === 'FAILED' ? (
                  <XCircleIcon className="w-4 h-4 text-red-500" />
                ) : (
                  <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />
                )}
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  j.status === 'COMPLETED' ? 'text-emerald-600' : 
                  j.status === 'FAILED' ? 'text-red-600' : 'text-blue-600'
                }`}>
                  {j.status}
                </span>
              </div>
            )
          },
          {
            header: 'Created At',
            accessor: (j) => (
              <div className="flex items-center gap-2 text-slate-400 font-medium text-xs">
                 <ClockIcon className="w-3.5 h-3.5" />
                 {new Date(j.created_at).toLocaleTimeString()}
               </div>
            ),
            className: 'text-right'
          },
          {
            header: '',
            accessor: () => (
              <button className="p-2 rounded-lg text-slate-300 hover:text-primary transition-colors">
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </button>
            ),
            className: 'w-10'
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
