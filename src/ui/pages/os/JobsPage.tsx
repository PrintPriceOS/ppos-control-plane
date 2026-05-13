import React from 'react';
import { useNavigate } from 'react-router-dom';
import { QueueListIcon, FunnelIcon, ClockIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { getIncomingConsoleConsensus } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";
import { short } from "../../lib/formatters";
import { safeArray } from "../../lib/display";

export const JobsPage: React.FC = () => {
  const navigate = useNavigate();
  // Fetch canonical preflight jobs with optional legacy queue operator fallback
  const q = useAdminQuery("jobs:global:consensus", () => getIncomingConsoleConsensus({ limit: 50 }), 10000);

  const sStr = (v: any): string => {
    if (!v) return '';
    if (typeof v === 'object') {
      const msg = v.message || v.code || v.error || JSON.stringify(v);
      return typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
    }
    return String(v);
  };

  const jobs = safeArray(q.data?.jobs || (q.data as any)?.data);
  const sourceStatus = q.data?.source_status || 'PREFLIGHT_REGISTRY';
  const isLedgerOnline = sourceStatus === 'PERSISTENT_REGISTRY' || sourceStatus === 'LIVE_UPSTREAM' || sourceStatus === 'PREFLIGHT_REGISTRY';

  // Active Pipes = count of jobs with status PROCESSING/QUEUED/RUNNING
  const activePipesCount = jobs.filter(j => {
    const s = String(j.status || '').toUpperCase();
    return s === 'PROCESSING' || s === 'QUEUED' || s === 'RUNNING';
  }).length;

  return (
    <div className="space-y-4">
      {/* High-Density Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Incoming Jobs & Pipeline Console</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Authoritative ingress telemetry tracking validated preflight payloads and autofix operations.</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 dark:text-zinc-500 flex-wrap">
          <span>Active Pipes: <strong className="text-zinc-900 dark:text-zinc-200">{activePipesCount}</strong></span>
          <span>•</span>
          <span>Ledger Indexing: <strong className={isLedgerOnline ? "text-emerald-600 dark:text-emerald-500" : "text-amber-500"}>{isLedgerOnline ? 'Online' : 'Degraded'}</strong></span>
          <span>•</span>
          <span className={`px-1.5 py-0.5 border font-bold ${sourceStatus === 'LEGACY_QUEUE' ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60' : 'bg-primary/10 border-primary/20 text-primary'}`}>
            {sourceStatus}
          </span>
        </div>
      </div>

      {/* Compressed Operational Toolbar */}
      <div className="p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 font-mono text-xs shadow-none">
          <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              <input 
                  type="text" 
                  placeholder="Filter signature by canonical ID, Tenant, or Action DTO..." 
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none pl-8 pr-3 py-1 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#dc0000]"
              />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button className="px-3 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wide leading-none transition-colors text-[11px]">
                Status: All
            </button>
            <button onClick={() => q.refetch()} className="px-3 py-1 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white dark:text-zinc-200 font-bold uppercase tracking-wide leading-none transition-colors text-[11px]">
                Force Sync
            </button>
          </div>
      </div>

      {/* Primary Payload Rendering */}
      {jobs.length === 0 && q.status === 'success' ? (
        <div className="p-12 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center font-mono text-xs text-zinc-400 dark:text-zinc-600">
          No canonical preflight jobs registered yet.
        </div>
      ) : (
        <DataTable 
          isLoading={q.status === 'loading'}
          data={jobs}
          compact={true}
          onRowClick={(j) => {
            const primaryJobId = j.jobId && j.jobId !== 'unknown' ? j.jobId : j.id;
            if (primaryJobId) {
              navigate(`/preflight/jobs/${encodeURIComponent(primaryJobId)}`);
            }
          }}
          rowClassName={(j) => {
            const canonical = j.canonicalData || j.canonicalPayload || {};
            const result = canonical.result || canonical || {};
            const st = String(result.analysis_status || j.status || '').toUpperCase();
            if (st.includes('FAIL') || j.error) return 'bg-red-50/40 dark:bg-red-950/20 border-l-2 border-[#dc0000]';
            if (st === 'COMPLETED') return 'opacity-90 hover:opacity-100 transition-opacity';
            return '';
          }}
          columns={[
            {
              header: 'Job ID',
              accessor: (j) => {
                // Never show numeric queue IDs as primary job ID when canonical jobId exists.
                const isCanonical = j.jobId && j.jobId !== 'unknown';
                const displayId = isCanonical ? j.jobId : (j.id ?? '---');
                const isQuiet = j.status === 'COMPLETED';
                return (
                  <div className="flex flex-col">
                    <span className={`font-mono text-xs ${isQuiet ? 'text-zinc-400 dark:text-zinc-500 font-normal' : 'text-zinc-900 dark:text-zinc-100 font-bold'}`}>
                      {short(displayId, 18)}
                    </span>
                    {j.filename && (
                      <span className="text-[9px] text-zinc-400 font-manrope truncate max-w-[140px]" title={j.filename}>
                        {j.filename}
                      </span>
                    )}
                  </div>
                );
              }
            },
            {
              header: 'Tenant scope',
              accessor: (j) => {
                const tenantId = j.tenantId || j.tenant_id || 'system';
                const isQuiet = j.status === 'COMPLETED';
                return (
                  <span className={`font-mono text-[11px] ${isQuiet ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-300 font-bold'}`}>
                    {sStr(tenantId)}
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
                    {sStr(j.type || 'ANALYZE')}
                  </span>
                );
              }
            },
            {
              header: 'Status Consensus',
              accessor: (j) => {
                const canonical = j.canonicalData || j.canonicalPayload || {};
                const result = canonical.result || canonical || {};
                const consensusStatus = result.analysis_status || j.status || 'UNKNOWN';
                const isQuiet = consensusStatus === 'COMPLETED';
                const isFail = String(consensusStatus).toUpperCase().includes('FAIL');
                return (
                  <div className="flex items-center gap-1.5 font-mono truncate max-w-[150px]" title={consensusStatus}>
                    <span className={`w-2 h-2 rounded-none border shrink-0 ${
                      isQuiet ? 'bg-emerald-600/40 border-emerald-700/30' : 
                      isFail ? 'bg-[#dc0000] border-red-800 font-bold' : 'bg-sky-500 border-sky-700 animate-pulse'
                    }`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wide leading-none truncate ${
                      isQuiet ? 'text-emerald-700/60 dark:text-emerald-500/50 font-normal' : 
                      isFail ? 'text-[#dc0000] dark:text-red-400 font-bold' : 'text-sky-700 dark:text-sky-400'
                    }`}>
                      {sStr(consensusStatus)}
                    </span>
                  </div>
                );
              }
            },
            {
              header: 'Telemetry Indicators',
              accessor: (j) => {
                const canonical = j.canonicalData || j.canonicalPayload || {};
                const result = canonical.result || canonical || {};
                
                // Risk: result.risk_score ?? result.summary?.risk_score
                const riskVal = result.risk_score ?? result.summary?.risk_score ?? '---';
                // Issues: result.summary?.issue_count
                const issuesVal = result.summary?.issue_count ?? result.issue_count ?? '---';
                // Fidelity: result.extractionFidelity
                const fidelityVal = result.extractionFidelity || 'DEGRADED';
                
                // Artifacts: READY / PARTIAL / NONE
                let artStatus = 'NONE';
                const artsObj = safeArray(j.artifacts || canonical.artifacts);
                if (artsObj.length > 0) {
                  artStatus = 'READY';
                } else if (result.artifactIntegrity && result.artifactIntegrity.ready) {
                  artStatus = 'READY';
                } else if (result.analysis_status === 'PARTIAL_ARTIFACTS') {
                  artStatus = 'PARTIAL';
                }

                return (
                  <div className="flex flex-wrap items-center gap-1 font-mono text-[9px] select-none">
                    <span className="px-1 py-0.5 bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800" title="Computed Risk Score">
                      R:{riskVal}
                    </span>
                    <span className="px-1 py-0.5 bg-zinc-50 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800" title="Identified Diagnostic Issues">
                      issues:{issuesVal}
                    </span>
                    <span className={`px-1 py-0.5 border font-bold ${
                      fidelityVal === 'REAL_EXTRACTION' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60' :
                      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60'
                    }`} title="Extraction Pipeline Fidelity">
                      fidelity:{fidelityVal}
                    </span>
                    <span className={`px-1 py-0.5 border ${
                      artStatus === 'READY' ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/60' :
                      'bg-zinc-50 text-zinc-400 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-600 dark:border-zinc-800'
                    }`} title="Carrier Artifact Readiness">
                      artifacts:{artStatus}
                    </span>
                    {result.certifiable !== undefined && (
                      <span className={`px-1 py-0.5 border font-bold ${
                        result.certifiable ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/60' :
                        'bg-zinc-50 text-zinc-400 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-600 dark:border-zinc-800'
                      }`} title="Forensic Certifiability Consensus">
                        cert:{result.certifiable ? 'YES' : 'NO'}
                      </span>
                    )}
                  </div>
                );
              }
            },
            {
              header: 'Ingress TS',
              accessor: (j) => {
                const ts = j.createdAt || j.created_at;
                const isQuiet = j.status === 'COMPLETED';
                return (
                  <span className={`font-mono text-[10px] ${isQuiet ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'}`}>
                    {ts ? new Date(ts).toISOString().split('T')[1]?.substring(0, 8) : '---'}
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
      )}
    </div>
  );
};
