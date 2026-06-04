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
  listAdminPreflightPolicies,
  getAdminPreflightJobAuditTimeline
} from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { toDisplayText } from "../../lib/display";
import { 
  isTerminalDiagnosticStatus,
  isTerminalFailureStatus,
  isTerminalStatus,
  isDegradedDiagnosticStatus,
  mapPhase10Status,
  collectFindings
} from "../../lib/preflightStatusHelpers";

function renderAnalysisIntegrity(payload: any): string {
  if (!payload) return '100% Native';
  
  const statusStr = (payload.analysis_status || payload.status || '').toUpperCase();
  const outcomeCategory = (payload.outcome_category || payload.outcomeCategory || '').toUpperCase();
  const realExtraction = payload.analysisIntegrity?.realExtraction;
  const degradedMode = payload.analysisIntegrity?.degradedMode;
  
  const findings = collectFindings(payload);
  const summary = payload.summary || payload.analysis?.summary || payload.result?.summary || '';
  const hasSummary = typeof summary === 'string' ? !!summary.trim() : !!summary;
  const coverage = payload.analyzerCoverage || payload.analyzer_coverage || payload.analysis?.analyzerCoverage || payload.result?.analyzerCoverage;
  const hasCoverage = !!(coverage && (typeof coverage === 'object' ? Object.keys(coverage).length > 0 : true));
  const hasUsableFindings = findings.length > 0;
  
  const isFailedEnvStatus = statusStr === 'FAILED_RUNTIME_ENVIRONMENT' || statusStr === 'ENGINE_ENVIRONMENT_FAILURE';
  const isFailedEnvCategory = outcomeCategory === 'ENVIRONMENT_FAILURE';
  const isFailedEnvExtraction = realExtraction === false && !hasUsableFindings && !hasSummary && !hasCoverage;
  
  const isFullEnvironmentFailure = isFailedEnvStatus || isFailedEnvCategory || isFailedEnvExtraction;
  
  if (isFullEnvironmentFailure) {
    return 'RUNTIME_ENVIRONMENT_FAILURE';
  }
  
  const missingTools = Array.isArray(payload.missing_tools) ? payload.missing_tools : 
                       (Array.isArray(payload.missingTools) ? payload.missingTools : 
                       (Array.isArray(payload.analysis?.missing_tools) ? payload.analysis.missing_tools : []));
                       
  if (missingTools.length > 0) {
    return 'DEGRADED_EXTRACTION';
  }
  
  const analysisType = payload.analysis_type || payload.analysisType || payload.analysis?.analysis_type;
  if (analysisType === 'DEGRADED') {
    return 'DEGRADED_EXTRACTION';
  }
  
  const integ = payload.analysisIntegrity || {};
  if (integ.realExtraction === true && integ.degradedMode === false) {
    return 'REAL_EXTRACTION';
  }
  
  if (typeof payload.analysisIntegrity === 'string') return payload.analysisIntegrity;
  if (integ.fallbackUsed) return 'FALLBACK';
  if (integ.degradedMode) return 'DEGRADED';
  
  return '100% Native';
}

export const PreflightJobDetailPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  
  const [selectedPolicy, setSelectedPolicy] = useState('');
  const [actionStatus, setActionStatus] = useState<'idle' | 'fixing' | 'retrying' | 'error' | 'success'>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [childFixJobId, setChildFixJobId] = useState<string | null>(null);

  // High-Fidelity unmocked queries
  const jobQ = useAdminQuery(`admin:preflight:job:${jobId}`, () => getAdminPreflightJob(jobId!), 5000);
  const artifactsQ = useAdminQuery(`admin:preflight:artifacts:${jobId}`, () => listAdminPreflightArtifacts(jobId!), 10000);
  const policiesQ = useAdminQuery('admin:preflight:policies', () => listAdminPreflightPolicies(), 60000);
  const auditTimelineQ = useAdminQuery(`admin:preflight:job:${jobId}:audit-timeline`, () => getAdminPreflightJobAuditTimeline(jobId!), 15000);

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

  // Safely extract missing tools array
  const missingTools = Array.isArray(payload.missing_tools) ? payload.missing_tools : 
                       (Array.isArray(payload.missingTools) ? payload.missingTools : 
                       (Array.isArray(payload.analysis?.missing_tools) ? payload.analysis.missing_tools : []));
                       
  const statusStr = (payload.analysis_status || payload.status || status || '').toUpperCase();
  const outcomeCategory = (payload.outcome_category || payload.outcomeCategory || '').toUpperCase();
  const realExtraction = payload.analysisIntegrity?.realExtraction;
  const degradedMode = payload.analysisIntegrity?.degradedMode;
  
  // Usable findings, summary, analyzerCoverage
  const findings = collectFindings(payload);
  const summary = payload.summary || payload.analysis?.summary || payload.result?.summary || '';
  const hasSummary = typeof summary === 'string' ? !!summary.trim() : !!summary;
  const coverage = payload.analyzerCoverage || payload.analyzer_coverage || payload.analysis?.analyzerCoverage || payload.result?.analyzerCoverage;
  const hasCoverage = !!(coverage && (typeof coverage === 'object' ? Object.keys(coverage).length > 0 : true));
  const hasUsableFindings = findings.length > 0;
  
  const isFailedEnvStatus = statusStr === 'FAILED_RUNTIME_ENVIRONMENT' || statusStr === 'ENGINE_ENVIRONMENT_FAILURE';
  const isFailedEnvCategory = outcomeCategory === 'ENVIRONMENT_FAILURE';
  const isFailedEnvExtraction = realExtraction === false && !hasUsableFindings && !hasSummary && !hasCoverage;
  
  const isFullEnvironmentFailure = isFailedEnvStatus || isFailedEnvCategory || isFailedEnvExtraction;
  
  const hasEnvFailure = isFullEnvironmentFailure;
  const isDegradedAnalysis = payload.analysis_type === 'DEGRADED' || payload.forensic_event === 'FORENSIC_DEGRADED_ANALYSIS' || (missingTools.length > 0 && !isFullEnvironmentFailure);

  const isSuccess = isTerminalDiagnosticStatus(status);
  const jobFailure = isTerminalFailureStatus(status);
  const sourceUnavailable = sourceStatus.includes('UNAVAILABLE');
  const isFail = jobFailure;

  // Change status copy transparently
  let statusDisplayText = status;
  if (hasEnvFailure) {
    statusDisplayText = 'ENGINE ENVIRONMENT FAILURE';
  } else if (isDegradedAnalysis || isDegradedDiagnosticStatus(status)) {
    statusDisplayText = 'DEGRADED ANALYSIS';
  } else if (status === 'COMPLETED_WITH_FINDINGS') {
    statusDisplayText = 'COMPLETED WITH FINDINGS';
  } else if (isFail) {
    statusDisplayText = 'FAILED';
  }

  // Determine certification blockage and action gating
  // "Do not block autofix only because analysis is DEGRADED/PARTIAL."
  // "If missingTools exist but degradedMode=true or realExtraction=true: do not block autofix."
  const isFixBlocked = hasEnvFailure;
  
  const integ = payload.analysisIntegrity || {};
  let certBlockedReason = payload.certificationBlockedReason || integ.certificationBlockedReason || '';
  if (!certBlockedReason && isFixBlocked) {
    if (hasEnvFailure) {
      certBlockedReason = 'Full environment failure blocks certification and fix invariants.';
    }
  }

  // Deduplicate findings and sanitize structural issue counts using collectFindings
  const deduplicatedIssuesCount = findings.length;

  const handleTriggerFix = async () => {
    if (!jobId || isFixBlocked) return;
    setActionStatus('fixing');
    setActionError(null);
    setChildFixJobId(null);
    try {
      const res = await requestAdminPreflightFix(jobId, selectedPolicy ? { policy: selectedPolicy } : {});
      if (res && res.child_job_id) {
        setChildFixJobId(res.child_job_id);
      } else if (res && res.fix_job_id) {
        setChildFixJobId(res.fix_job_id);
      }
      await jobQ.refetch();
      await artifactsQ.refetch();
      setActionStatus('success');
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
            hasEnvFailure || isFail ? 'bg-red-500/10 border-red-500/30 text-red-600' :
            isDegradedAnalysis ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' :
            isSuccess ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-blue-500/10 border-blue-500/30 text-blue-600'
          }`}>
            {isSuccess && !hasEnvFailure ? <CheckCircleIcon className="w-4 h-4" /> : (hasEnvFailure || isFail) ? <XCircleIcon className="w-4 h-4" /> : <ExclamationTriangleIcon className="w-4 h-4" />}
            <span>{statusDisplayText}</span>
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

      {/* Phase 10 status banners */}
      {jobQ.data?.live_hydration_disabled && (
        <div className="p-4 bg-slate-500/10 border border-slate-500/20 flex items-start gap-3 text-slate-500 rounded-none">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">Live Hydration Suppressed</h4>
            <p className="text-xs font-bold mt-0.5">This job is served from persistent registry. Upstream live hydration is unavailable.</p>
          </div>
        </div>
      )}
      {sourceUnavailable && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-500 rounded-none">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">Upstream Gateway Unavailable</h4>
            <p className="text-xs font-bold mt-0.5">The upstream preflight engine is currently offline or unreachable. Displaying cached diagnostic records from the local Control Plane evidence vault.</p>
          </div>
        </div>
      )}
      {status?.toUpperCase() === 'DEGRADED' && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-500 rounded-none">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">DEGRADED ANALYSIS DETECTION</h4>
            <p className="text-xs font-bold mt-0.5">Preflight completed in degraded extraction mode. Some structural details might be approximated, but the file is certifiable and autofix is available.</p>
          </div>
        </div>
      )}
      {status?.toUpperCase() === 'PARTIAL' && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-500 rounded-none">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">PARTIAL ANALYSIS WARNING</h4>
            <p className="text-xs font-bold mt-0.5">Preflight run was partially completed. Operational telemetry is preserved, but some checks were bypassed.</p>
          </div>
        </div>
      )}
      {status?.toUpperCase() === 'PARTIAL_ARTIFACTS' && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-500 rounded-none">
          <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">PARTIAL ARTIFACTS AVAILABLE</h4>
            <p className="text-xs font-bold mt-0.5">Analysis completed, but only partial output artifacts were successfully compiled and registered upstream.</p>
          </div>
        </div>
      )}
      {status?.toUpperCase() === 'COMPLETED_WITH_FINDINGS' && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 flex items-start gap-3 text-blue-500 rounded-none">
          <CheckCircleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">COMPLETED WITH FINDINGS</h4>
            <p className="text-xs font-bold mt-0.5">Preflight checks successfully finished. Active issues/findings have been detected in the document layout.</p>
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

            {childFixJobId && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4" />
                    Fix job created: {childFixJobId}
                  </h4>
                  <p className="text-[10px] font-bold mt-1 text-emerald-700 dark:text-emerald-500">
                    Fixed artifacts are ready in the Fix Result job.
                  </p>
                </div>
                <Link 
                  to={`/preflight/jobs/${childFixJobId}`} 
                  className="px-4 py-2 bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
                >
                  <span>Open Fix Result</span>
                  <ArrowLeftIcon className="w-3 h-3 rotate-180" />
                </Link>
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
                  disabled={actionStatus !== 'idle' || isFixBlocked}
                  onClick={handleTriggerFix}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-xs font-black uppercase tracking-widest shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title={isFixBlocked ? certBlockedReason : "Trigger native multi-stage repair"}
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
                  <span>{hasEnvFailure ? 'Retry after environment repair' : 'Trigger Retry'}</span>
                </button>
              </div>
            </div>

            {isFixBlocked && (
              <div className="text-[10px] text-red-500 font-bold bg-red-500/5 p-2.5 border border-red-500/10 flex items-center gap-2 mt-2">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                <span>Fix action guarded/disabled: {certBlockedReason}</span>
              </div>
            )}

            <p className="text-[9px] text-slate-400 font-bold">
              Note: Fix triggers native multi-stage repair wrappers. Retry proxy propagation verifies V2 server compliance fail-loudly.
            </p>
          </div>

          {/* Canonical Payload Metrics */}
          <div className="glass p-6 rounded-none border ppos-border grid grid-cols-2 md:grid-cols-4 gap-6">
            <MetaItem label="Original Filename" value={payload.filename || registry.filename || 'Untitled.pdf'} icon={DocumentIcon} />
            <MetaItem label="Tenant Context" value={payload.tenantId || registry.tenantId || 'system'} icon={CircleStackIcon} />
            <MetaItem label="Active Policy" value={payload.policy || registry.policy || 'Standard Baseline'} icon={ShieldCheckIcon} />
            <MetaItem label="Extraction Fidelity" value={renderAnalysisIntegrity(payload)} icon={CubeIcon} />
            <MetaItem label="Structural Issues" value={String(deduplicatedIssuesCount)} icon={ExclamationTriangleIcon} />
            <MetaItem label="Applied Repairs" value={String(payload.fixes?.length || payload.repairs?.length || 0)} icon={ShieldCheckIcon} />
            <MetaItem label="File Storage Size" value={formatSize(payload.fileSize || registry.fileSize)} icon={CommandLineIcon} />
            <MetaItem label="Execution Stage" value={payload.step || 'TERMINAL'} icon={ClockIcon} />
          </div>

          {/* Dedicated UI Panel for Environment Integrity */}
          <div className="glass p-6 rounded-none border ppos-border bg-slate-900/90 dark:bg-[#131314] text-slate-100 space-y-4 font-manrope">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <WrenchScrewdriverIcon className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-200">Environment & Analysis Integrity</h3>
              </div>
              {hasEnvFailure ? (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-black uppercase tracking-widest">
                  DEGRADED RUNTIME
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-widest">
                  TOOLS VERIFIED
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Required CLI Tools</span>
                <div className="flex flex-wrap gap-1">
                  {['pdfinfo', 'pdfimages', 'mutool', 'gs'].map((tool) => (
                    <span key={tool} className="px-1.5 py-0.5 bg-white/5 font-mono text-[10px] text-slate-300">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Missing Tool Diagnostics</span>
                {hasEnvFailure || missingTools.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {missingTools.map((tool: string) => (
                      <span key={tool} className="px-1.5 py-0.5 bg-red-500/20 text-red-400 font-mono text-[10px] border border-red-500/30">
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-emerald-400 font-bold text-[11px]">All runtime dependencies present</span>
                )}
              </div>

              <div className="md:col-span-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Extraction & Runtime Errors</span>
                <span className="font-mono text-[11px] text-amber-400/90 block bg-black/40 p-2.5 border border-white/5">
                  {payload.extractionErrors || payload.extraction_errors || payload.error?.message || payload.analysis?.error || 'None reported'}
                </span>
              </div>

              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Worker/Engine Fingerprint</span>
                <span className="font-mono text-[11px] text-slate-300 truncate block">
                  {payload.workerFingerprint || payload.engineFingerprint || payload.fingerprint || payload.worker_id || 'V2 Preflight Engine (Native/Degraded)'}
                </span>
              </div>

              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Certification Blocked Reason</span>
                <span className={`text-[11px] font-bold block truncate ${certBlockedReason ? 'text-red-400' : 'text-slate-400'}`} title={certBlockedReason || 'Certification path permitted'}>
                  {certBlockedReason || 'Certification path permitted'}
                </span>
              </div>
            </div>

            {/* Phase 10 Contract Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-3 border-t border-white/10">
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Analysis Integrity</span>
                <div className="space-y-1 font-mono text-[10px] text-slate-300">
                  <div>Real Extraction: <span className={realExtraction ? 'text-emerald-400' : 'text-red-400'}>{String(realExtraction ?? 'N/A')}</span></div>
                  <div>Degraded Mode: <span className={degradedMode ? 'text-amber-400' : 'text-emerald-400'}>{String(degradedMode ?? 'N/A')}</span></div>
                  <div>Cert. Allowed: <span className={integ.certificationAllowed ? 'text-emerald-400' : 'text-red-400'}>{String(integ.certificationAllowed ?? 'N/A')}</span></div>
                </div>
              </div>
              
              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Analyzer Coverage</span>
                {coverage ? (
                  <div className="space-y-1 font-mono text-[10px] text-slate-300 max-h-24 overflow-y-auto">
                    {Object.entries(coverage).map(([key, val]) => (
                      <div key={key} className="truncate">
                        {key}: <span className={val ? 'text-emerald-400' : 'text-slate-400'}>{String(val)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-500 font-bold text-[10px] italic">Not Provided</span>
                )}
              </div>

              <div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Artifact Integrity</span>
                {payload.artifactIntegrity || payload.result?.artifactIntegrity ? (
                  <div className="space-y-1 font-mono text-[10px] text-slate-300">
                    {(() => {
                      const art = payload.artifactIntegrity || payload.result?.artifactIntegrity || {};
                      return (
                        <>
                          <div>Ready: <span className={art.ready ? 'text-emerald-400' : 'text-red-400'}>{String(art.ready ?? 'N/A')}</span></div>
                          <div className="truncate" title={art.checksum}>Checksum: <span className="text-blue-400">{art.checksum || 'N/A'}</span></div>
                          <div>Integrity: <span className={art.integrityVerified ? 'text-emerald-400' : 'text-slate-400'}>{String(art.integrityVerified ?? 'N/A')}</span></div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <span className="text-slate-500 font-bold text-[10px] italic">Not Provided</span>
                )}
              </div>
            </div>
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

          {/* Canonical Audit Ledger Timeline */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Canonical Preflight Audit Ledger
              </span>
              <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 text-[9px] font-black uppercase tracking-widest">api_audit_logs</span>
            </div>
            
            {auditTimelineQ.status === 'loading' ? (
              <div className="h-10 flex items-center justify-center border ppos-border ppos-surface-muted">
                <ArrowPathIcon className="w-4 h-4 text-primary animate-spin" />
              </div>
            ) : auditTimelineQ.data?.events?.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {auditTimelineQ.data.events.map((e: any, index: number) => (
                  <div key={index} className="ppos-surface-muted p-3 border ppos-border flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{e.event_type}</span>
                      <span className="font-mono text-[9px] text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-black text-slate-500">Actor:</span>
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{e.user_id || e.actor || 'System'}</span>
                      <span className="text-[10px] font-black text-slate-500 ml-2">Status:</span>
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{e.status}</span>
                    </div>
                    {e.metadata_json && (
                      <pre className="text-[9px] text-slate-500 bg-white/5 p-1 mt-1 font-mono overflow-x-auto">
                        {JSON.stringify(e.metadata_json, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center border ppos-border ppos-surface-muted">
                <p className="text-xs font-bold text-slate-400 italic">No global audit records found for this Job ID.</p>
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
            ) : (() => {
              // The API returns normalized artifacts.
              const items = artifactsQ.data?.artifacts || [];
              const hasUpstreamArtifacts = payload.artifacts || payload.artifact_list || payload.availableArtifacts || (payload.result?.artifacts);
              
              if (items.length === 0) {
                if (hasUpstreamArtifacts) {
                  return (
                    <div className="text-center py-4 space-y-2">
                      <p className="text-xs font-bold text-amber-500 italic">Artifacts detected upstream but not yet persisted.</p>
                      <button onClick={() => { jobQ.refetch(); artifactsQ.refetch(); }} className="text-xs text-primary hover:underline font-black uppercase tracking-widest">
                        Refresh Artifacts
                      </button>
                    </div>
                  );
                }
                if (isTerminalStatus(status) && (payload.type === 'AUTOFIX' || payload.type === 'REPAIR')) {
                   return (
                    <div className="text-center py-4">
                      <p className="text-xs font-bold text-slate-400 italic">No corrected PDF was produced for this job.</p>
                    </div>
                   );
                }
                return (
                  <div className="text-center py-4">
                    <p className="text-xs font-bold text-slate-400 italic">No downloadable artifacts are mapped for this job yet.</p>
                  </div>
                );
              }

              const primaryAliasCandidates = ['final_fixed_pdf', 'fixed_pdf', 'corrected_pdf', 'repaired_pdf', 'repair_pdf', 'production_pdf', 'printable_pdf'];
              const primaryItem = items.find((a: any) => primaryAliasCandidates.includes(a.alias));
              const secondaryItems = items.filter((a: any) => a !== primaryItem);

              return (
                <div className="space-y-4">
                  {primaryItem && primaryItem.downloadable ? (
                    <button 
                      onClick={() => handleDirectDownload(primaryItem.alias || primaryItem.id, primaryItem.filename)}
                      className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-primary text-white font-black uppercase tracking-widest shadow-sm hover:opacity-90 active:scale-95 transition-all group"
                      title={primaryItem.label}
                    >
                      <DocumentArrowDownIcon className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                      <span>Download Fixed PDF</span>
                    </button>
                  ) : primaryItem && !primaryItem.downloadable ? (
                    <div className="w-full flex flex-col items-center justify-center p-4 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                      <DocumentIcon className="w-6 h-6 mb-2 text-slate-400" />
                      <span className="text-xs font-bold text-center">Artifact registered but contains no downloadable bytes yet.</span>
                      <button onClick={() => { jobQ.refetch(); artifactsQ.refetch(); }} className="mt-2 text-[10px] text-primary hover:underline font-black uppercase tracking-widest">
                        Refresh Artifacts
                      </button>
                    </div>
                  ) : null}

                  {secondaryItems.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {secondaryItems.map((a: any, i: number) => (
                        a.downloadable ? (
                          <button 
                            key={i}
                            onClick={() => handleDirectDownload(a.alias || a.id, a.filename)}
                            className="flex items-center justify-between p-3 ppos-surface-muted border ppos-border hover:border-primary/40 transition-colors group"
                            title={`Download ${a.filename} (${formatSize(a.size_bytes)})`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <DocumentIcon className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
                              <span className="text-xs font-bold text-slate-700 dark:text-[#ECECF1] truncate">{a.label || a.alias || a.type}</span>
                            </div>
                            <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">{formatSize(a.size_bytes)}</span>
                          </button>
                        ) : (
                          <div 
                            key={i}
                            className="flex items-center justify-between p-3 ppos-surface-muted border ppos-border opacity-50 cursor-not-allowed"
                            title="Artifact registered but 0 bytes"
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <DocumentIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              <span className="text-xs font-bold text-slate-500 truncate">{a.label || a.alias || a.type}</span>
                            </div>
                            <span className="text-[9px] font-mono text-slate-400 whitespace-nowrap">0 B</span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
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
