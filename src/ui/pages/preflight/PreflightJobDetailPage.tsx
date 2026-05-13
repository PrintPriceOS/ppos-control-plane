import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeftIcon,
  CubeIcon,
  ClockIcon,
  ShieldCheckIcon,
  DocumentArrowDownIcon,
  TicketIcon,
  CommandLineIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CircleStackIcon,
  XCircleIcon,
  DocumentIcon,
  ArrowPathIcon,
  WrenchScrewdriverIcon
} from "@heroicons/react/24/outline";
import { 
  getAdminPreflightJob, 
  listAdminPreflightArtifacts, 
  requestAdminPreflightFix, 
  retryAdminPreflightJob, 
  downloadAdminPreflightArtifact,
  listAdminPreflightPolicies
} from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { toDisplayText } from "../../lib/display";

export const PreflightJobDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  
  const [selectedPolicy, setSelectedPolicy] = useState('');
  const [actionStatus, setActionStatus] = useState<'idle' | 'fixing' | 'retrying' | 'error'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);

  // High-Fidelity unmocked queries
  const jobQ = useAdminQuery(`admin:preflight:job:${jobId}`, () => getAdminPreflightJob(jobId!), 5000);
  const artifactsQ = useAdminQuery(`admin:preflight:artifacts:${jobId}`, () => listAdminPreflightArtifacts(jobId!), 10000);
  const policiesQ = useAdminQuery('admin:preflight:policies', () => listAdminPreflightPolicies(), 60000);

  if (jobQ.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-24 font-manrope">
        <div className="flex flex-col items-center gap-3">
          <ArrowPathIcon className="w-8 h-8 text-primary animate-spin" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Hydrating High-Fidelity Telemetry...</span>
        </div>
      </div>
    );
  }

  const jobRes = jobQ.data;
  if (!jobRes || !jobRes.ok) {
    return (
      <div className="p-12 text-center font-manrope">
        <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
          <XCircleIcon className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">Job Telemetry Unavailable</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
          The requested record could not be hydrated from local persistence or the live upstream Gateway proxy.
        </p>
        <Link to="/preflight/jobs" className="mt-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary hover:underline">
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
      </div>
    );
  }

  const status = jobRes.status || 'UNKNOWN';
  const sourceStatus = jobRes.source_status || 'LOCAL_FALLBACK';
  const payload = jobRes.canonicalPayload || {};
  const registry = jobRes.registryRecord || {};

  const policies = Array.isArray(policiesQ.data?.policies) ? policiesQ.data.policies : [];

  const handleTriggerFix = async () => {
    if (!jobId) return;
    setActionStatus('fixing');
    setActionError(null);
    try {
      await requestAdminPreflightFix(jobId, selectedPolicy ? { policy: selectedPolicy } : {});
      await jobQ.refetch();
      await artifactsQ.refetch();
      setActionStatus('idle');
    } catch (err: any) {
      console.error('[DETAIL-ACTION] Trigger fix error:', err);
      setActionError(err.message || 'Fix execution failed upstream.');
      setActionStatus('error');
    }
  };

  const handleTriggerRetry = async () => {
    if (!jobId) return;
    setActionStatus('retrying');
    setActionError(null);
    try {
      await retryAdminPreflightJob(jobId);
      await jobQ.refetch();
      await artifactsQ.refetch();
      setActionStatus('idle');
    } catch (err: any) {
      console.error('[DETAIL-ACTION] Trigger retry error:', err);
      // Expose explicit unmocked failures (like 501 Not Implemented) perfectly
      setActionError(err.message || 'Retry operation rejected by upstream contract.');
      setActionStatus('error');
    }
  };

  const handleDirectDownload = async (artifactId: string, filename?: string) => {
    try {
      const blob = await downloadAdminPreflightArtifact(jobId!, artifactId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename || `${artifactId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Direct download error: ${err.message || 'File stream unavailable'}`);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat(Number((bytes || 0) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isSuccess = status === 'COMPLETED' || status === 'SUCCESS';
  const isFail = status === 'FAILED' || sourceStatus.includes('UNAVAILABLE') || status.includes('UNAVAILABLE');

  // Extract authentic forensic timeline directly from canonical upstream engine response
  const realTimelineArray = Array.isArray(payload.forensics) ? payload.forensics : (Array.isArray(payload.timeline) ? payload.timeline : []);

  return (
    <div className="space-y-8 font-manrope">
      {/* Detail Header Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-50/50 dark:bg-[#131314]/30 p-4 border ppos-border">
        <div className="flex items-center gap-3">
          <Link to="/preflight/jobs" className="p-2 hover:bg-slate-200 dark:hover:bg-white/5 transition-colors">
            <ArrowLeftIcon className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Canonical Evidence Base</h1>
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest">
                {payload.type || registry.type || 'ANALYZE'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">#{jobId}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 block">Fidelity Mode</span>
            <span className={`text-[10px] font-mono font-bold uppercase ${sourceStatus.includes('LIVE') ? 'text-emerald-500' : 'text-amber-500'}`}>
              {sourceStatus}
            </span>
          </div>

          <div className={`px-3 py-1.5 flex items-center gap-2 border font-black text-xs uppercase tracking-widest ${
            isSuccess ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' :
            isFail ? 'bg-red-500/10 border-red-500/30 text-red-600' : 'bg-blue-500/10 border-blue-500/30 text-blue-600'
          }`}>
            {isSuccess ? <CheckCircleIcon className="w-4 h-4" /> : isFail ? <XCircleIcon className="w-4 h-4" /> : <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            <span>{isFail ? 'UPSTREAM DEGRADED / FAILED' : status}</span>
          </div>
        </div>
      </div>

      {/* Fail-Loud Message Box */}
      {isFail && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-500">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">Engine Diagnostics Failure</h4>
            <p className="text-xs font-bold mt-0.5">{payload.error?.message || payload.error_json?.message || 'Upstream execution layer encountered a critical process fault or rejected verification.'}</p>
            {payload.error?.details && (
              <pre className="mt-2 text-[10px] bg-red-500/5 p-2.5 overflow-x-auto text-red-400 font-mono">
                {typeof payload.error.details === 'object' ? JSON.stringify(payload.error.details, null, 2) : payload.error.details}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Double Column: Operations Panel & Canonical Tree */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Action Dashboard Panel */}
          <div className="glass p-5 rounded-none border ppos-border space-y-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Operational Actions Gate
            </span>

            {actionError && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold">
                Action Rejection: {actionError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-1">
              {/* Optional Policy Selection for Trigger Fix */}
              <div className="flex-1 min-w-[200px]">
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Target Override Policy</label>
                <select 
                  value={selectedPolicy}
                  onChange={(e) => setSelectedPolicy(e.target.value)}
                  className="w-full ppos-surface-muted border ppos-border px-3 py-2 text-xs font-bold text-slate-700 dark:text-[#ECECF1] outline-none cursor-pointer"
                >
                  <option value="">Keep Assigned Canonical Policy</option>
                  {policies.map((p: any) => {
                    const canonicalId = p.id || p.policy_id;
                    const displayName = p.name || p.id;
                    return (
                      <option key={canonicalId} value={canonicalId}>
                        {displayName}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-end gap-2 pt-3">
                <button 
                  disabled={actionStatus !== 'idle'}
                  onClick={handleTriggerFix}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-black uppercase tracking-widest shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
                >
                  {actionStatus === 'fixing' ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <WrenchScrewdriverIcon className="w-4 h-4" />}
                  <span>Trigger Fix</span>
                </button>

                <button 
                  disabled={actionStatus !== 'idle'}
                  onClick={handleTriggerRetry}
                  className="flex items-center gap-2 px-5 py-2 ppos-surface-muted border ppos-border text-xs font-black uppercase tracking-widest hover:border-primary/40 active:scale-95 transition-all disabled:opacity-40"
                  title="Proxy to upstream retry contract"
                >
                  {actionStatus === 'retrying' ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowPathIcon className="w-4 h-4" />}
                  <span>Trigger Retry</span>
                </button>
              </div>
            </div>
            <p className="text-[9px] text-slate-400 font-bold">
              Note: Fix triggers native multi-stage repair wrappers. Retry proxy propagation verifies V2 server compliance fail-loudly.
            </p>
          </div>

          {/* Canonical Payload Metrics */}
          <div className="glass p-6 rounded-none border ppos-border grid grid-cols-2 md:grid-cols-4 gap-6">
            <MetaItem label="Original Filename" value={payload.filename || registry.filename || 'Untitled.pdf'} icon={DocumentIcon} />
            <MetaItem label="Tenant Context" value={payload.tenantId || registry.tenantId || 'system'} icon={CircleStackIcon} />
            <MetaItem label="Active Policy" value={payload.policy || registry.policy || 'Standard Baseline'} icon={ShieldCheckIcon} />
            <MetaItem label="Extraction Fidelity" value={payload.analysisIntegrity || '100% Native'} icon={CubeIcon} />
            <MetaItem label="Structural Issues" value={String(payload.issues?.length || payload.analysis?.issues?.length || 0)} icon={ExclamationTriangleIcon} />
            <MetaItem label="Applied Repairs" value={String(payload.fixes?.length || payload.repairs?.length || 0)} icon={ShieldCheckIcon} />
            <MetaItem label="File Storage Size" value={formatSize(payload.fileSize || registry.fileSize)} icon={CommandLineIcon} />
            <MetaItem label="Execution Stage" value={payload.step || 'TERMINAL'} icon={ClockIcon} />
          </div>

          {/* Forensic Real Timeline */}
          <div className="space-y-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Authentic Engine & Worker Forensics
            </span>
            
            {realTimelineArray.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {realTimelineArray.map((tItem: any, index: number) => (
                  <div key={index} className="ppos-surface-muted p-3 border ppos-border flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-primary uppercase tracking-wider">{tItem.eventType || tItem.stage || tItem.type || 'EVENT'}</span>
                      <span className="font-mono text-[9px] text-slate-400">{tItem.timestamp ? new Date(tItem.timestamp).toLocaleTimeString() : 'N/A'}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-[#ECECF1]">{tItem.message || tItem.details || JSON.stringify(tItem)}</span>
                    {tItem.metadata && typeof tItem.metadata === 'object' && (
                      <pre className="text-[9px] text-slate-400 bg-white/5 p-1 mt-1 font-mono">
                        {JSON.stringify(tItem.metadata)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center border ppos-border ppos-surface-muted">
                <p className="text-xs font-bold text-slate-400 italic">No localized timeline events array exposed by canonical payload.</p>
                <div className="mt-4 flex items-center justify-center gap-6 text-[11px] font-mono text-slate-500">
                  <span>Created: {new Date(payload.createdAt || registry.createdAt || Date.now()).toLocaleString()}</span>
                  <span>Updated: {new Date(payload.updatedAt || registry.updatedAt || Date.now()).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {/* Raw Diagnostics Tree Preview */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Raw V2 Upstream Contract Payload Map
            </span>
            <pre className="text-[10px] bg-slate-950 text-emerald-400 p-4 max-h-80 overflow-y-auto font-mono border ppos-border">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>

        </div>

        {/* Right Single Column: Artifacts Direct Delivery */}
        <div className="space-y-8">
          
          {/* Artifact Repository Output List */}
          <div className="glass p-5 rounded-none border ppos-border space-y-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Direct Artifact Downloads
            </span>

            {artifactsQ.status === 'loading' ? (
              <div className="h-10 flex items-center justify-center">
                <ArrowPathIcon className="w-4 h-4 text-primary animate-spin" />
              </div>
            ) : (artifactsQ.data?.artifacts && artifactsQ.data.artifacts.length > 0) ? (
              <div className="space-y-2">
                {artifactsQ.data.artifacts.map((a: any, i: number) => (
                  <div key={i} className="ppos-surface-muted p-2.5 border ppos-border flex flex-col gap-1.5 group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <DocumentArrowDownIcon className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-xs font-bold text-slate-800 dark:text-white truncate" title={a.filename || a.name}>
                          {a.filename || a.name || 'document.pdf'}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 flex-shrink-0 uppercase bg-white/5 px-1.5 py-0.5">
                        {a.type || 'OUTPUT'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t ppos-border">
                      <span className="text-[9px] font-mono text-slate-400">
                        {formatSize(a.sizeBytes || a.size)}
                      </span>
                      
                      <div className="flex items-center gap-2">
                        {/* If upstream yields native static storagePath/S3 url, expose it transparently */}
                        {(a.storagePath || a.path || '').startsWith('http') && (
                          <a 
                            href={a.storagePath || a.path} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-[9px] font-bold text-slate-400 hover:text-primary underline"
                          >
                            Direct S3 URI
                          </a>
                        )}

                        <button 
                          onClick={() => handleDirectDownload(a.artifactId || a.id, a.filename || a.name)}
                          className="text-[10px] font-black uppercase text-primary hover:underline flex items-center gap-0.5"
                        >
                          <span>Stream Proxied</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs font-bold text-slate-400 italic">No artifacts mapped to registry payload.</p>
                {isSuccess && (
                  <button 
                    onClick={() => handleDirectDownload('output', payload.filename || 'certified_output.pdf')}
                    className="mt-3 w-full py-2 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-colors"
                  >
                    Force Stream Standard Output Blob
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Upstream Worker Telemetry Verification */}
          <div className="glass p-5 rounded-none border ppos-border space-y-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Upstream Engine Fingerprint
            </span>
            <div className="p-3 bg-slate-900 text-white space-y-3 font-mono">
              <div className="flex items-center gap-2">
                <CpuChipIcon className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-xs font-bold text-slate-200 truncate">V2 Engine Node Protocol</span>
              </div>
              <div className="text-[10px] text-slate-400 space-y-1">
                <div>Contract Mode: <span className="text-emerald-400">{payload.mode || 'Service Live'}</span></div>
                <div>Trace Span ID: <span className="text-slate-300">{payload.traceId || 'N/A'}</span></div>
                <div>Origin Forward: <span className="text-slate-300">Industrial Preflight Control Base</span></div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

const MetaItem = ({ label, value, icon: Icon }: any) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-1.5 text-slate-400 uppercase font-black text-[9px] tracking-widest">
      <Icon className="w-3 h-3" />
      {label}
    </div>
    <span className="text-xs font-bold truncate text-slate-900 dark:text-[#ECECF1]" title={String(value)}>{value}</span>
  </div>
);
