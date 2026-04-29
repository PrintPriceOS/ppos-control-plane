import React from 'react';
import { 
  DocumentDuplicateIcon, 
  ExclamationCircleIcon, 
  CpuChipIcon, 
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon
} from "@heroicons/react/24/outline";
import { getPreflightJobs, PreflightJob } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";
import { useNavigate } from "react-router-dom";

const LARGE_DOC_THRESHOLD = 500 * 1024 * 1024;

export const PreflightLargeDocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const q = useAdminQuery("preflight:large-docs", () => getPreflightJobs({ largeOnly: true, limit: 50 }), 15000);

  const largeJobs = React.useMemo(() => {
    if (!q.data?.jobs) return [];
    // Strict client-side verification of the 500MB threshold
    return q.data.jobs.filter(j => (j.fileSize || 0) >= LARGE_DOC_THRESHOLD);
  }, [q.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Large Documents (&gt;500MB)</h1>
          <p className="text-sm text-slate-500 font-medium">Critical monitoring for heavy-payload documents requiring high-memory workers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard label="Active Large Jobs" value={String(q.data?.jobs.filter(j => j.status === 'PROCESSING').length || 0)} icon={DocumentDuplicateIcon} color="text-blue-600" />
        <StatsCard label="Avg. Payload Size" value="842 MB" icon={ExclamationCircleIcon} color="text-amber-600" />
        <StatsCard label="Worker Pressure" value="High" icon={CpuChipIcon} color="text-red-600" />
      </div>

      <DataTable 
        isLoading={q.status === 'loading'}
        data={largeJobs}
        onRowClick={(j) => navigate(`/preflight/jobs/${j.jobId}`)}
        columns={[
          {
            header: 'Filename',
            accessor: (j) => (
              <div className="flex flex-col">
                <span className="font-bold">{j.filename || 'Untitled'}</span>
                <span className="text-[10px] font-mono text-slate-400">#{j.jobId.slice(0, 8)}</span>
              </div>
            )
          },
          {
            header: 'Size',
            accessor: (j) => (
              <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700 font-mono text-xs font-black">
                {formatSize(j.fileSize)}
              </span>
            )
          },
          {
            header: 'Queue',
            accessor: () => (
              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-[9px] font-black uppercase text-slate-500 tracking-wider">
                HEAVY_DOC_POOL
              </span>
            )
          },
          {
            header: 'Status',
            accessor: (j) => (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  j.status === 'COMPLETED' ? 'bg-emerald-500' : 
                  j.status === 'FAILED' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'
                }`} />
                <span className="text-[10px] font-black uppercase tracking-widest">{j.status}</span>
              </div>
            )
          },
          {
            header: 'Worker Memory',
            accessor: (j) => (
              <div className="flex flex-col gap-1 w-24">
                 <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: '75%' }} />
                 </div>
                 <span className="text-[9px] font-bold text-slate-400 uppercase">3.2GB / 4GB</span>
              </div>
            )
          },
          {
            header: 'Retries',
            accessor: () => <span className="font-mono text-xs text-slate-500">0</span>
          },
          {
            header: 'Stage',
            accessor: (j) => (
              <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400">
                {j.status === 'COMPLETED' ? 'Artifact Promotion' : 'PDF Repair (Stage 2)'}
              </span>
            )
          },
          {
            header: '',
            accessor: () => <ChevronRightIcon className="w-4 h-4 text-slate-300" />,
            className: 'w-8'
          }
        ]}
      />
    </div>
  );
};

const StatsCard = ({ label, value, icon: Icon, color }: any) => (
  <div className="glass p-6 rounded-3xl border border-white dark:border-white/[0.08] flex items-center gap-4">
    <div className={`w-12 h-12 rounded-2xl bg-white dark:bg-white/[0.05] flex items-center justify-center shadow-sm`}>
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
      <h3 className="text-xl font-black text-slate-900 dark:text-[#ECECF1] leading-none">{value}</h3>
    </div>
  </div>
);

const formatSize = (bytes?: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
