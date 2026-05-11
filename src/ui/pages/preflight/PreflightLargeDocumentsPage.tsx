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
import { short } from "../../lib/formatters";

const LARGE_DOC_THRESHOLD = 500 * 1024 * 1024;


export const PreflightLargeDocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const q = useAdminQuery("preflight:large-docs", () => getPreflightJobs({ largeOnly: true, limit: 50 }), 15000);

  const largeJobs = q.data?.jobs || [];

  return (
    <div className="space-y-6 italic-text-off">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Large Documents (&gt;500MB)</h1>
          <p className="text-sm text-slate-500 font-medium">Critical monitoring for heavy-payload documents requiring high-memory workers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard label="Detected Large Files" value={String(largeJobs.length)} icon={DocumentDuplicateIcon} color="text-blue-600" />
        <StatsCard label="Avg. Payload Size" value={largeJobs.length > 0 ? formatSize(largeJobs.reduce((acc: number, curr: any) => acc + (curr.file_size || 0), 0) / largeJobs.length) : '0 B'} icon={ExclamationCircleIcon} color="text-amber-600" />
        <StatsCard label="System Pressure" value={largeJobs.some((j: any) => j.status === 'PROCESSING') ? 'High' : 'Nominal'} icon={CpuChipIcon} color={largeJobs.some((j: any) => j.status === 'PROCESSING') ? 'text-red-600' : 'text-emerald-600'} />
      </div>

      <DataTable 
        isLoading={q.status === 'loading'}
        data={largeJobs}
        onRowClick={(j) => navigate(`/preflight/jobs/${j.id}`)}
        columns={[
          {
            header: 'Filename',
            accessor: (j) => (
              <div className="flex flex-col">
                <span className="font-bold truncate max-w-xs">{j.metadata_json?.originalFilename || 'Untitled'}</span>
                <span className="text-[10px] font-mono text-slate-400">#{short(j.id, 8)}</span>
              </div>
            )
          },

          {
            header: 'Tenant',
            accessor: (j) => <span className="font-bold text-primary">{j.tenant_id}</span>
          },
          {
            header: 'Impact',
            accessor: (j) => (
              <span className="px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-mono text-xs font-black">
                {formatSize(j.file_size)}
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
            header: 'Progress',
            accessor: (j) => (
              <div className="flex flex-col gap-1 w-24">
                 <div className="h-1.5 bg-slate-100 dark:bg-[#131314]/[0.05] rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${j.progress || 0}%` }} />
                 </div>
                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{j.progress || 0}% Complete</span>
              </div>
            )
          },
          {
            header: 'Type',
            accessor: (j) => <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">{j.type}</span>
          },
          {
            header: 'Created',
            accessor: (j) => <span className="text-xs text-slate-400">{new Date(j.created_at).toLocaleDateString()}</span>
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
    <div className={`w-12 h-12 rounded-2xl bg-white dark:bg-[#131314]/[0.05] flex items-center justify-center shadow-sm`}>
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
