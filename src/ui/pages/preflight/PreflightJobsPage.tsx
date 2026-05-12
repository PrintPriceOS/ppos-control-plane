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
  ChevronRightIcon,
  CloudArrowUpIcon,
  RectangleStackIcon,
  ShieldCheckIcon,
  DocumentCheckIcon,
  BuildingOfficeIcon
} from "@heroicons/react/24/outline";
import { 
  listAdminPreflightJobs, 
  listAdminPreflightBatches, 
  getAdminPreflightAudit, 
  getAdminPreflightGovernance, 
  getStorageSummary, 
  getAdminPreflightPolicies,
  AdminPreflightJob 
} from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { PreflightUploadModal } from "./PreflightUploadModal";
import { short } from "../../lib/formatters";

export const PreflightJobsPage: React.FC = () => {
  const navigate = useNavigate();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'JOBS' | 'BATCHES' | 'AUDIT' | 'GOVERNANCE'>('JOBS');
  
  // High-Density Filters supporting full operational scoping
  const [filter, setFilter] = useState({
    tenant: '',
    printhouse: '',
    status: '',
    type: '',
    policy: ''
  });

  // Queries
  const jobsQ = useAdminQuery(
    `admin:preflight:jobs:${JSON.stringify(filter)}`, 
    () => listAdminPreflightJobs({ 
      tenant: filter.tenant || undefined,
      printhouse: filter.printhouse || undefined,
      status: filter.status || undefined,
      type: filter.type || undefined,
      policy: filter.policy || undefined
    }), 
    10000
  );

  const batchesQ = useAdminQuery(
    `admin:preflight:batches:${JSON.stringify(filter)}`, 
    () => listAdminPreflightBatches({ 
      tenant: filter.tenant || undefined
    }), 
    20000
  );

  const auditQ = useAdminQuery(
    `admin:preflight:audit:${JSON.stringify(filter)}`, 
    () => getAdminPreflightAudit({ 
      tenant: filter.tenant || undefined,
      status: filter.status || undefined
    }), 
    20000
  );

  const governanceQ = useAdminQuery(
    `admin:preflight:governance:${JSON.stringify(filter)}`, 
    () => getAdminPreflightGovernance({ 
      tenant: filter.tenant || undefined
    }), 
    20000
  );

  const storageQ = useAdminQuery('preflight:storage:global', () => getStorageSummary(), 30000);
  const policiesQ = useAdminQuery('preflight:policies:admin', () => getAdminPreflightPolicies(), 30000);
  const policiesData = policiesQ.data;
  const isPoliciesUnavailable = policiesData && (!policiesData.ok || !policiesData.policies || policiesData.policies.length === 0);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat(Number((bytes || 0) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Determine global up-to-date source status to expose failures transparently
  const currentSourceStatus = jobsQ.data?.source_status || 'LIVE_UPSTREAM';
  const isDegraded = currentSourceStatus.includes('UNAVAILABLE') || currentSourceStatus.includes('FALLBACK') || currentSourceStatus.includes('UNSUPPORTED');

  return (
    <div className="space-y-6 font-manrope">
      {/* Top Banner / Dashboard Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">
              Industrial Preflight Console
            </h1>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-none border ${isDegraded ? 'bg-amber-500/10 border-amber-500/30' : 'bg-primary/10 border-primary/20'}`}>
              <div className={`w-1.5 h-1.5 rounded-none animate-pulse ${isDegraded ? 'bg-amber-500' : 'bg-primary'}`} />
              <span className={`text-[9px] font-black uppercase tracking-widest ${isDegraded ? 'text-amber-500' : 'text-primary'}`}>
                {isDegraded ? `DEGRADED: ${currentSourceStatus}` : 'Upstream Contract Direct'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-bold mt-1 max-w-2xl">
            High-density administrative interface proxying unmocked job operations, array batches, and forensic audit telemetry directly onto the canonical V2 contract layer.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Global Storage Quota Card */}
          <div className="hidden lg:flex flex-col items-end glass px-4 py-2 rounded-none border border-white/20 dark:border-white/5">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Global Quota Usage</div>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black text-slate-800 dark:text-[#ECECF1]">
                {storageQ.data ? Number((storageQ.data.totalBytes || 0) / (1024*1024*1024)).toFixed(2) : '0.00'} GB
              </span>
              <span className="text-[9px] font-bold text-slate-400">allocated</span>
            </div>
          </div>

          <button 
            disabled={!!isPoliciesUnavailable}
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-none font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <CloudArrowUpIcon className="w-4 h-4" />
            <span>Trigger Payload</span>
          </button>
        </div>
      </div>

      {isPoliciesUnavailable && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-none flex items-center gap-3 text-red-500">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
          <div className="text-xs font-bold flex-1">
            Real preflight policies are unavailable. Transformation is disabled until upstream policy catalog is restored.
          </div>
        </div>
      )}

      <PreflightUploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => {
          jobsQ.refetch();
          batchesQ.refetch();
          auditQ.refetch();
          governanceQ.refetch();
          storageQ.refetch();
        }}
      />

      {/* Tabs Layout */}
      <div className="flex items-center justify-between border-b ppos-border flex-wrap gap-4 bg-slate-50/50 dark:bg-[#131314]/20 p-1">
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setActiveTab('JOBS')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'JOBS' ? 'border-primary text-primary bg-white dark:bg-[#1e1e20]/40 shadow-xs' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
          >
            <QueueListIcon className="w-4 h-4" />
            <span>Jobs Registry ({jobsQ.data?.total ?? 0})</span>
          </button>
          <button 
            onClick={() => setActiveTab('BATCHES')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'BATCHES' ? 'border-primary text-primary bg-white dark:bg-[#1e1e20]/40 shadow-xs' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
          >
            <RectangleStackIcon className="w-4 h-4" />
            <span>Batches Pipeline ({batchesQ.data?.batches?.length ?? 0})</span>
          </button>
          <button 
            onClick={() => setActiveTab('AUDIT')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'AUDIT' ? 'border-primary text-primary bg-white dark:bg-[#1e1e20]/40 shadow-xs' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
          >
            <ShieldCheckIcon className="w-4 h-4" />
            <span>Audit Ledger</span>
          </button>
          <button 
            onClick={() => setActiveTab('GOVERNANCE')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'GOVERNANCE' ? 'border-primary text-primary bg-white dark:bg-[#1e1e20]/40 shadow-xs' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
          >
            <DocumentCheckIcon className="w-4 h-4" />
            <span>Governance Matrix</span>
          </button>
        </div>

        {/* Action Refetch */}
        <button 
          onClick={() => {
            if (activeTab === 'JOBS') jobsQ.refetch();
            if (activeTab === 'BATCHES') batchesQ.refetch();
            if (activeTab === 'AUDIT') auditQ.refetch();
            if (activeTab === 'GOVERNANCE') governanceQ.refetch();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          title="Force telemetry refresh"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${jobsQ.status === 'refetching' || batchesQ.status === 'refetching' ? 'animate-spin text-primary' : ''}`} />
          <span className="uppercase tracking-widest">Refresh</span>
        </button>
      </div>

      {/* High-Density Universal Filter Bar */}
      <div className="glass p-3 rounded-none border ppos-border flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px] relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter Scope by Tenant ID..." 
            value={filter.tenant}
            onChange={(e) => setFilter({ ...filter, tenant: e.target.value })}
            className="w-full ppos-surface-muted border-none rounded-none pl-8 pr-3 py-1.5 text-xs font-bold text-slate-700 dark:text-[#ECECF1] placeholder:text-slate-400 focus:ring-1 focus:ring-primary/30 outline-none"
          />
        </div>

        <div className="flex-1 min-w-[160px] relative">
          <BuildingOfficeIcon className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter Printhouse Scope..." 
            value={filter.printhouse}
            onChange={(e) => setFilter({ ...filter, printhouse: e.target.value })}
            className="w-full ppos-surface-muted border-none rounded-none pl-8 pr-3 py-1.5 text-xs font-bold text-slate-700 dark:text-[#ECECF1] placeholder:text-slate-400 focus:ring-1 focus:ring-primary/30 outline-none"
          />
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <select 
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            className="ppos-surface-muted border-none rounded-none px-2.5 py-1.5 text-[11px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider outline-none cursor-pointer"
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
            className="ppos-surface-muted border-none rounded-none px-2.5 py-1.5 text-[11px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider outline-none cursor-pointer"
          >
            <option value="">Type: All</option>
            <option value="ANALYZE">Analyze</option>
            <option value="AUTOFIX">Autofix</option>
            <option value="CERTIFY">Certify</option>
          </select>

          <select 
            value={filter.policy}
            onChange={(e) => setFilter({ ...filter, policy: e.target.value })}
            className="ppos-surface-muted border-none rounded-none px-2.5 py-1.5 text-[11px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider outline-none cursor-pointer max-w-[160px] truncate"
          >
            <option value="">Policy: All</option>
            {(policiesData?.policies || []).map((p: any) => (
              <option key={p.slug || p.id} value={p.slug || p.id}>
                {p.name || p.slug}
              </option>
            ))}
          </select>

          {(filter.tenant || filter.printhouse || filter.status || filter.type || filter.policy) && (
            <button 
              onClick={() => setFilter({ tenant: '', printhouse: '', status: '', type: '', policy: '' })}
              className="px-2 py-1.5 text-[10px] font-black text-red-500 uppercase tracking-wider hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Table View Panel */}
      <div className="mt-2">
        {activeTab === 'JOBS' && (
          <DataTable 
            isLoading={jobsQ.status === 'loading'}
            data={jobsQ.data?.jobs || []}
            onRowClick={(j) => navigate(`/preflight/jobs/${j.jobId}`)}
            columns={[
              {
                header: 'Job Payload',
                accessor: (j) => (
                  <div className="flex flex-col py-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold text-primary">#{short(j.jobId, 10)}</span>
                      {j.batchId && (
                        <span className="px-1 py-0.2 bg-slate-100 dark:bg-white/5 text-[8px] font-bold text-slate-400 rounded-none uppercase">
                          Batch
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-xs truncate max-w-[180px] text-slate-800 dark:text-white mt-0.5" title={j.filename || 'Untitled.pdf'}>
                      {j.filename || 'Untitled.pdf'}
                    </span>
                  </div>
                )
              },
              {
                header: 'Tenant Identity',
                accessor: (j) => (
                  <div className="flex flex-col">
                    <span className="font-bold text-xs text-slate-700 dark:text-[#ECECF1]">{j.tenantId}</span>
                    {j.printhouseId && (
                      <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                        <BuildingOfficeIcon className="w-2.5 h-2.5" />
                        {j.printhouseId}
                      </span>
                    )}
                  </div>
                )
              },
              {
                header: 'Type / Scope Policy',
                accessor: (j) => (
                  <div className="flex flex-col gap-0.5">
                    <span className="px-1.5 py-0.5 rounded-none bg-slate-100 dark:bg-[#131314]/5 text-[9px] font-black uppercase text-slate-600 dark:text-zinc-400 tracking-wider w-fit">
                      {j.type || 'ANALYZE'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 truncate max-w-[120px]" title={j.policy || 'Standard Baseline'}>
                      {j.policy || 'Standard Baseline'}
                    </span>
                  </div>
                )
              },
              {
                header: 'Payload Size',
                accessor: (j) => <span className="text-xs font-mono font-bold text-slate-500">{formatSize(j.fileSize)}</span>
              },
              {
                header: 'Status & Fidelity',
                align: 'center',
                accessor: (j) => (
                  <div className="flex flex-col items-center">
                    <StatusBadge status={j.status || 'PENDING'} />
                    <span className="text-[9px] font-manrope text-[#8F96A3] uppercase tracking-tighter mt-1 block">
                      {j.canonicalData?.status ? 'Synchronized' : 'Registry Initial'}
                    </span>
                  </div>
                )
              },
              {
                header: 'Diagnostics',
                accessor: (j) => {
                  const info = j.canonicalData;
                  const issues = info?.issues?.length || info?.analysis?.issues?.length || 0;
                  const fixes = info?.fixes?.length || info?.repairs?.length || 0;
                  return (
                    <div className="flex items-center gap-3 text-[10px]">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Issues</span>
                        <span className="font-bold text-slate-700 dark:text-[#ECECF1]">{issues}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Fixes</span>
                        <span className="font-bold text-emerald-600">{fixes}</span>
                      </div>
                    </div>
                  );
                }
              },
              {
                header: 'Timeline',
                accessor: (j) => (
                  <div className="flex flex-col text-[10px] text-slate-400 font-medium">
                    <span className="text-slate-600 dark:text-zinc-300 font-bold">
                      {new Date(j.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="font-mono text-[9px]">{new Date(j.createdAt).toLocaleTimeString()}</span>
                  </div>
                )
              },
              {
                header: '',
                accessor: () => <ChevronRightIcon className="w-4 h-4 text-slate-300" />,
                className: 'w-8'
              }
            ]}
          />
        )}

        {activeTab === 'BATCHES' && (
          <DataTable 
            isLoading={batchesQ.status === 'loading'}
            data={batchesQ.data?.batches || []}
            columns={[
              {
                header: 'Batch ID',
                accessor: (b) => <span className="font-mono text-xs font-bold text-primary">#{short(b.id || b.batchId, 12)}</span>
              },
              {
                header: 'Tenant Array',
                accessor: (b) => <span className="font-bold text-xs text-slate-700 dark:text-[#ECECF1]">{b.tenantId || 'system'}</span>
              },
              {
                header: 'Staged Jobs Count',
                accessor: (b) => <span className="font-bold text-xs text-slate-600 dark:text-zinc-300">{b.jobIds?.length || b.jobs?.length || 0} Registered</span>
              },
              {
                header: 'Execution Status',
                align: 'center',
                accessor: (b) => <StatusBadge status={b.status || 'PROPAGATED'} />
              },
              {
                header: 'Timestamp',
                accessor: (b) => <span className="text-xs font-mono text-slate-400">{b.createdAt ? new Date(b.createdAt).toLocaleString() : 'N/A'}</span>
              }
            ]}
          />
        )}

        {activeTab === 'AUDIT' && (
          <DataTable 
            isLoading={auditQ.status === 'loading'}
            data={auditQ.data?.events || []}
            columns={[
              {
                header: 'Audit ID / Trace',
                accessor: (e) => (
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-white">#{e.id}</span>
                    <span className="font-mono text-[9px] text-slate-400">{short(e.trace_id || 'N/A', 10)}</span>
                  </div>
                )
              },
              {
                header: 'Tenant Identity',
                accessor: (e) => <span className="font-bold text-xs text-primary">{e.tenant_id}</span>
              },
              {
                header: 'Operation Action',
                accessor: (e) => <span className="font-black text-xs text-slate-700 dark:text-[#ECECF1] tracking-wide">{e.action}</span>
              },
              {
                header: 'Resolution Status',
                align: 'center',
                accessor: (e) => <StatusBadge status={e.status || 'SUCCESS'} />
              },
              {
                header: 'Message Trail',
                accessor: (e) => <span className="text-xs text-slate-500 max-w-xs truncate block">{e.message || 'Execution OK'}</span>
              },
              {
                header: 'Logged At',
                accessor: (e) => <span className="font-mono text-[10px] text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
              }
            ]}
          />
        )}

        {activeTab === 'GOVERNANCE' && (
          <DataTable 
            isLoading={governanceQ.status === 'loading'}
            data={governanceQ.data?.governanceEvents || []}
            columns={[
              {
                header: 'Event Ledger ID',
                accessor: (g) => <span className="font-mono text-xs font-bold">#{g.id}</span>
              },
              {
                header: 'Tenant Target',
                accessor: (g) => <span className="font-bold text-xs text-primary">{g.tenant_id}</span>
              },
              {
                header: 'Rule Policy Slug',
                accessor: (g) => <span className="font-bold text-xs text-slate-800 dark:text-white">{g.rule_slug}</span>
              },
              {
                header: 'Evaluation Status',
                align: 'center',
                accessor: (g) => <StatusBadge status={g.evaluation_result || 'PASSED'} />
              },
              {
                header: 'Enforced Action',
                accessor: (g) => <span className="font-mono text-xs text-slate-500">{g.enforcement_action || 'LOGGED_ONLY'}</span>
              },
              {
                header: 'Registered Timestamp',
                accessor: (g) => <span className="font-mono text-[10px] text-slate-400">{new Date(g.created_at).toLocaleString()}</span>
              }
            ]}
          />
        )}
      </div>

      {/* Fail-Loud Error Surface */}
      {(jobsQ.error || batchesQ.error) && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-none flex items-center gap-3 text-red-500">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
          <div className="text-xs font-bold flex-1">
            Upstream Gateway integration encountered a critical error: {jobsQ.error || batchesQ.error}
          </div>
          <button onClick={() => { jobsQ.refetch(); batchesQ.refetch(); }} className="text-xs font-black uppercase tracking-wider underline">
            Execute Retry
          </button>
        </div>
      )}
    </div>
  );
};
