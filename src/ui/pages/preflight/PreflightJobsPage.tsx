import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  QueueListIcon, 
  FunnelIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ArrowPathIcon, 
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  DocumentIcon,
  ChevronRightIcon
} from "@heroicons/react/24/outline";
import { getPreflightJobs, getStorageSummary, PreflightJob } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";
import { PreflightUploadModal } from "./PreflightUploadModal";

export const PreflightJobsPage: React.FC = () => {
  const navigate = useNavigate();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [filter, setFilter] = useState({
    tenant: '',
    status: '',
    type: '',
    risk: '',
    largeOnly: false
  });

  const q = useAdminQuery(
    `preflight:jobs:${JSON.stringify(filter)}`, 
    () => getPreflightJobs({ 
      limit: 50,
      tenant: filter.tenant || undefined,
      status: filter.status || undefined,
      type: filter.type || undefined,
      risk: filter.risk || undefined,
      largeOnly: filter.largeOnly
    }), 
    15000
  );

  const storageQ = useAdminQuery('preflight:storage:global', () => getStorageSummary(), 30000);

  const LARGE_DOC_THRESHOLD = 500 * 1024 * 1024;

  const filteredJobs = React.useMemo(() => {
    if (!q.data?.jobs) return [];
    if (filter.largeOnly) {
      return q.data.jobs.filter(j => (j.fileSize || 0) >= LARGE_DOC_THRESHOLD);
    }
    return q.data.jobs;
  }, [q.data, filter.largeOnly]);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'CRITICAL': return 'text-red-600 bg-red-100';
      case 'HIGH': return 'text-orange-600 bg-orange-100';
      case 'MEDIUM': return 'text-amber-600 bg-amber-100';
      case 'LOW': return 'text-blue-600 bg-blue-100';
      default: return 'text-slate-500 bg-slate-100';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Preflight Jobs</h1>
          <p className="text-sm text-slate-500 font-medium">Operational overview of all preflight analysis and repair jobs.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Storage Quota Card */}
          <div className="hidden lg:flex flex-col items-end glass px-4 py-2 rounded-2xl border border-white/20">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Storage</div>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black text-slate-700 dark:text-[#ECECF1]">
                {storageQ.data ? (storageQ.data.totalBytes / (1024*1024*1024)).toFixed(2) : '0.00'} GB
              </span>
              <span className="text-[10px] font-bold text-slate-400">used</span>
            </div>
            {storageQ.status === 'loading' && <div className="w-20 h-1 bg-slate-100 rounded-full mt-1 animate-pulse" />}
          </div>

          <button 
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-2xl font-black text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            <CloudArrowUpIcon className="w-5 h-5" />
            <span>Execute New Job</span>
          </button>
        </div>
      </div>

      <PreflightUploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => {
          q.refetch();
          storageQ.refetch();
        }}
      />

      {/* Filters Bar */}
      <div className="glass p-4 rounded-2xl border border-white dark:border-white/[0.08] flex flex-wrap items-center gap-4 italic-text-off">
          <div className="flex-1 min-w-[200px] relative">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
              <input 
                  type="text" 
                  placeholder="Filter by Tenant ID..." 
                  value={filter.tenant}
                  onChange={(e) => setFilter({ ...filter, tenant: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-white/[0.03] border-none rounded-xl pl-10 pr-4 py-2 text-sm font-bold text-slate-700 dark:text-[#ECECF1] placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20"
              />
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <select 
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="bg-slate-50 dark:bg-white/[0.03] border-none rounded-xl px-3 py-2 text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Status: All</option>
              <option value="COMPLETED">Completed</option>
              <option value="PROCESSING">Processing</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>

            <select 
              value={filter.type}
              onChange={(e) => setFilter({ ...filter, type: e.target.value })}
              className="bg-slate-50 dark:bg-white/[0.03] border-none rounded-xl px-3 py-2 text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Type: All</option>
              <option value="ANALYZE">Analyze</option>
              <option value="AUTOFIX">Autofix</option>
              <option value="CERTIFY">Certify</option>
            </select>

            <select 
              value={filter.risk}
              onChange={(e) => setFilter({ ...filter, risk: e.target.value })}
              className="bg-slate-50 dark:bg-white/[0.03] border-none rounded-xl px-3 py-2 text-xs font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Risk: All</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="NONE">None</option>
            </select>

            <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-white/[0.03] rounded-xl cursor-pointer">
              <input 
                type="checkbox" 
                checked={filter.largeOnly}
                onChange={(e) => setFilter({ ...filter, largeOnly: e.target.checked })}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Large Docs Only</span>
            </label>

            <button 
              onClick={() => q.refetch()}
              className="p-2 bg-slate-100 dark:bg-white/[0.06] rounded-xl hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors"
            >
              <ArrowPathIcon className={`w-4 h-4 text-slate-500 ${q.status === 'refetching' ? 'animate-spin' : ''}`} />
            </button>
          </div>
      </div>

      <DataTable 
        isLoading={q.status === 'loading'}
        data={filteredJobs}
        onRowClick={(j) => navigate(`/preflight/jobs/${j.jobId}`)}
        columns={[
          {
            header: 'Job ID',
            accessor: (j) => (
              <div className="flex flex-col">
                <span className="font-mono text-[10px] text-slate-400">#{j.jobId.slice(0, 8)}</span>
                <span className="font-bold truncate max-w-[120px]" title={j.filename || 'Untitled'}>
                  {j.filename || 'Untitled'}
                </span>
              </div>
            )
          },
          {
            header: 'Tenant',
            accessor: (j) => <span className="font-bold text-primary">{j.tenantId}</span>
          },
          {
            header: 'Type / Policy',
            accessor: (j) => (
              <div className="flex flex-col gap-1">
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-fit">
                  {j.type}
                </span>
                <span className="text-[10px] font-medium text-slate-400 truncate max-w-[100px]">
                  {j.policy || 'No Policy'}
                </span>
              </div>
            )
          },
          {
            header: 'Size',
            accessor: (j) => <span className="text-xs font-mono text-slate-500">{formatSize(j.fileSize)}</span>
          },
          {
            header: 'Status',
            accessor: (j) => (
              <div className="flex items-center gap-2">
                {j.status === 'COMPLETED' ? (
                  <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                ) : j.status === 'FAILED' ? (
                  <XCircleIcon className="w-4 h-4 text-red-500" />
                ) : j.status === 'CANCELLED' ? (
                  <XCircleIcon className="w-4 h-4 text-slate-300" />
                ) : (
                  <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />
                )}
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  j.status === 'COMPLETED' ? 'text-emerald-600' : 
                  j.status === 'FAILED' ? 'text-red-600' : 
                  j.status === 'CANCELLED' ? 'text-slate-400' : 'text-blue-600'
                }`}>
                  {j.status}
                </span>
              </div>
            )
          },
          {
            header: 'Risk',
            accessor: (j) => (
              j.destructiveFixRisk ? (
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${getRiskColor(j.destructiveFixRisk)}`}>
                  {j.destructiveFixRisk}
                </span>
              ) : <span className="text-slate-300">—</span>
            )
          },
          {
            header: 'Analysis',
            accessor: (j) => (
              <div className="flex items-center gap-3 text-[10px]">
                <div className="flex flex-col">
                  <span className="text-slate-400 uppercase font-black tracking-tighter">Issues</span>
                  <span className="font-bold text-slate-700 dark:text-[#ECECF1]">{j.issueCount ?? 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-400 uppercase font-black tracking-tighter">Fixes</span>
                  <span className="font-bold text-emerald-600">{j.fixCount ?? 0}</span>
                </div>
              </div>
            )
          },
          {
            header: 'Created',
            accessor: (j) => (
              <div className="flex flex-col text-[10px] text-slate-400">
                 <div className="flex items-center gap-1">
                   <ClockIcon className="w-3 h-3" />
                   {new Date(j.createdAt).toLocaleDateString()}
                 </div>
                 <div className="font-mono">{new Date(j.createdAt).toLocaleTimeString()}</div>
               </div>
            )
          },
          {
            header: '',
            accessor: () => (
              <ChevronRightIcon className="w-4 h-4 text-slate-300" />
            ),
            className: 'w-8'
          }
        ]}
      />
      
      {q.error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 italic-text-off">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm font-bold">
            Failed to load jobs: {q.error}
            <button onClick={() => q.refetch()} className="ml-4 underline">Retry</button>
          </div>
        </div>
      )}
    </div>
  );
};
