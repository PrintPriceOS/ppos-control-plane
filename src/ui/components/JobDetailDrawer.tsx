import React, { useEffect, useState, useRef } from 'react';
import { Drawer } from './Drawer';
import { short } from '../lib/formatters';
import { GovernanceSnapshotViewer } from './GovernanceSnapshotViewer';
import { ExecutionTimeline, TimelineEventItem } from './ExecutionTimeline';
import { MachineDetailDrawer } from './MachineDetailDrawer';
import { 
  getJobDetail, 
  getJobTimeline, 
  getJobLogs, 
  getJobArtifacts, 
  getJobWorkerDetails, 
  getJobResult 
} from '../lib/adminApi';
import { 
  CubeIcon, 
  ClockIcon, 
  ArrowDownTrayIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface JobDetailDrawerProps {
  job: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({ job, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'input' | 'logs' | 'worker' | 'result'>('timeline');
  const [loading, setLoading] = useState(false);
  const activeJobIdRef = useRef<string | null>(null);

  const [forensics, setForensics] = useState<{
    detail: any | null;
    traceId?: string | null;
    timeline: TimelineEventItem[];
    timelineStatus?: string;
    logs: any[];
    logsStatus?: string;
    artifacts: any[];
    artifactsStatus?: string;
    worker: any | null;
    workerStatus?: string;
    result: any | null;
  }>({
    detail: null,
    timeline: [],
    logs: [],
    artifacts: [],
    worker: null,
    result: null
  });

  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && job?.id) {
      activeJobIdRef.current = job.id;
      setActiveTab('timeline');
      fetchDynamicForensics(job.id);
    } else {
      activeJobIdRef.current = null;
    }
  }, [isOpen, job?.id]);

  const fetchDynamicForensics = async (id: string) => {
    setLoading(true);
    try {
      const [detRes, timRes, logRes, artRes, wrkRes, rstRes] = await Promise.all([
        getJobDetail(id),
        getJobTimeline(id),
        getJobLogs(id),
        getJobArtifacts(id),
        getJobWorkerDetails(id),
        getJobResult(id)
      ]);

      // Strict validation constraint: Discard stale API callbacks if active job context changed
      if (activeJobIdRef.current !== id) return;

      setForensics({
        detail: detRes?.ok ? detRes.job : null,
        traceId: detRes?.trace_id,
        timeline: timRes?.ok ? (timRes.timeline || []) : [],
        timelineStatus: timRes?.source_status,
        logs: logRes?.ok ? (logRes.logs || []) : [],
        logsStatus: logRes?.source_status,
        artifacts: artRes?.ok ? (artRes.artifacts || []) : [],
        artifactsStatus: artRes?.source_status,
        worker: wrkRes?.ok ? wrkRes.worker : null,
        workerStatus: wrkRes?.source_status,
        result: rstRes?.ok ? rstRes.resulting_state : null
      });
    } catch (err) {
      console.error('[FORENSIC-BINDING-ERROR]', err);
    } finally {
      if (activeJobIdRef.current === id) {
        setLoading(false);
      }
    }
  };

  if (!job) return null;

  const currentJobStatus = forensics.detail?.status || job.status || 'UNKNOWN';
  const durationValue = forensics.detail?.duration_ms ?? job.duration_ms;
  const inputData = forensics.detail?.input_payload || {};
  const workerData = forensics.worker || {};
  const resultData = forensics.result || {};

  // Task 7: Operational Attention Zones — Evaluate current risks upfront to eliminate tab-scanning fatigue
  const hasRetries = (job.attempts && job.attempts > 0) || (workerData.retries_attempted && workerData.retries_attempted > 0);
  const isFailed = currentJobStatus === 'FAILED' || resultData.error_reason || job.error;
  const isMissingArtifacts = forensics.artifactsStatus === 'ARTIFACT_NOT_AVAILABLE' || (forensics.artifacts && forensics.artifacts.some(a => !a.available));
  const isMissingWorker = forensics.workerStatus === 'WORKER_TELEMETRY_UNAVAILABLE';
  
  const showEscalationZone = isFailed || hasRetries || isMissingArtifacts || isMissingWorker;

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={`TASK ID: ${short(job.id, 14)}`}>
        {/* Task 5: Adaptive Density scaling — inner parameters dynamically pad based on viewport sizes */}
        <div className="space-y-3 italic-text-off font-mono text-slate-800 dark:text-zinc-200 select-none md:p-1 lg:p-0">
          
          {/* Bloomberg-Terminal Density Meta Strip Header */}
          <div className={`p-2 border flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] ${
            isFailed ? 'bg-red-50/20 dark:bg-red-950/10 border-red-300 dark:border-red-900/50' : 
            currentJobStatus === 'COMPLETED' ? 'bg-slate-50/60 dark:bg-[#131314]/40 border-slate-200 dark:border-white/[0.05]' : 
            'bg-slate-100 dark:bg-[#1a1a1b] border-slate-300 dark:border-white/10'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-none border shrink-0 ${
                currentJobStatus === 'COMPLETED' ? 'bg-emerald-600/40 border-emerald-700/30' : 
                isFailed ? 'bg-red-500 border-red-700' : 'bg-blue-500 border-blue-700 animate-pulse'
              }`} />
              <span className={`font-black tracking-tight ${
                isFailed ? 'text-red-700 dark:text-red-400' : 
                currentJobStatus === 'COMPLETED' ? 'text-slate-500 dark:text-zinc-500 font-normal' : 'text-slate-900 dark:text-white'
              }`}>{currentJobStatus}</span>
              <span className="text-slate-300 dark:text-zinc-700">|</span>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold uppercase">Type: {job.type}</span>
            </div>

            <div className="flex items-center gap-3 text-[10px]">
              {forensics.traceId && (
                <span className="text-slate-500 dark:text-zinc-500 truncate max-w-[140px]">
                  Trace: <strong className="text-slate-800 dark:text-zinc-300 font-mono">{short(forensics.traceId, 8)}</strong>
                </span>
              )}
              <span className="text-slate-500 dark:text-zinc-500 flex items-center gap-1">
                <ClockIcon className="w-3 h-3 text-slate-400 dark:text-zinc-600" />
                <strong className="text-slate-800 dark:text-zinc-300 font-mono">
                  {durationValue !== null && durationValue !== undefined ? `${durationValue}ms` : '---'}
                </strong>
              </span>
              <span className="text-slate-400 dark:text-zinc-600">Tenant: <strong className="text-slate-700 dark:text-zinc-400">{job.tenant_id || 'system'}</strong></span>
            </div>
          </div>

          {/* Task 7: Operational Attention Zone — Upfront Escalation Strip to elevate anomalies immediately */}
          {showEscalationZone && (
            <div className={`p-2 border leading-tight space-y-1 ${
              isFailed ? 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200' : 
              'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
            }`}>
              <div className="flex items-center gap-1.5 border-b pb-1 border-current/20">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest block leading-none">Top Priority Escalation Zone</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-0.5">
                {isFailed && (
                  <span className="font-bold flex items-center gap-1 text-red-700 dark:text-red-400">
                    <strong className="text-[10px] uppercase bg-red-100 dark:bg-red-900/50 px-1 border border-red-300 dark:border-red-700">Failure Triggered</strong>
                    <span>{resultData.error_reason || job.error || 'Execution halted'}</span>
                  </span>
                )}
                {hasRetries && (
                  <span className="font-bold flex items-center gap-1 text-amber-800 dark:text-amber-300">
                    <strong className="text-[10px] uppercase bg-amber-100 dark:bg-amber-900/50 px-1 border border-amber-300 dark:border-amber-700">Queue Retry Block</strong>
                    <span>Attempt {job.attempts || workerData.retries_attempted || 1} active</span>
                  </span>
                )}
                {isMissingArtifacts && (
                  <span className="font-medium text-slate-600 dark:text-zinc-400 text-[11px]">
                    ⚠️ Storage Binary Asset unmapped
                  </span>
                )}
                {isMissingWorker && (
                  <span className="font-medium text-slate-500 dark:text-zinc-500 text-[11px]">
                    ⚠️ Worker node diagnostics detached
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Compressed Navigation Switch */}
          <div className="flex border-b border-slate-200 dark:border-white/10 overflow-x-auto custom-scrollbar text-[11px]">
            <TabButton 
              active={activeTab === 'timeline'} 
              onClick={() => setActiveTab('timeline')}
              label="Timeline" 
              count={forensics.timeline.length} 
            />
            <TabButton 
              active={activeTab === 'input'} 
              onClick={() => setActiveTab('input')}
              label="Payload" 
            />
            <TabButton 
              active={activeTab === 'logs'} 
              onClick={() => setActiveTab('logs')}
              label="Logs" 
              count={forensics.logs.length}
            />
            <TabButton 
              active={activeTab === 'worker'} 
              onClick={() => setActiveTab('worker')}
              label="Worker" 
            />
            <TabButton 
              active={activeTab === 'result'} 
              onClick={() => setActiveTab('result')}
              label="Evidence" 
            />
          </div>

          {/* Mobile-First Preview Fallback Viewport Wrapper */}
          <div className="min-h-[220px] text-xs">
            {activeTab === 'timeline' && (
              <div className="space-y-3">
                {/* Compact Inline Warning Strip */}
                {forensics.timelineStatus === 'NO_EVENT_SOURCE_AVAILABLE' && !loading && (
                  <div className="px-2 py-1 bg-slate-50 dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/[0.05] text-[10px] text-slate-500 dark:text-zinc-400 font-medium flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <ExclamationTriangleIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>Timeline log array unindexed by DB rows</span>
                    </div>
                    <span className="text-[9px] text-slate-400 uppercase tracking-tighter shrink-0 font-bold">FALLBACK ROW</span>
                  </div>
                )}

                <ExecutionTimeline events={forensics.timeline} isLoading={loading} />
                
                {(forensics.detail?.governance_snapshot || job.governance_snapshot) && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-white/[0.04]">
                    <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">Enforced Posture Matrix</span>
                    <GovernanceSnapshotViewer snapshot={forensics.detail?.governance_snapshot || job.governance_snapshot} />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'input' && (
              <div className="space-y-2.5">
                <SectionHeader label="Ingested Frame Data" />
                {loading ? <SectionLoader /> : (
                  <div className="space-y-2">
                    {!inputData || Object.keys(inputData).length === 0 ? (
                      <div className="px-2 py-1 bg-slate-50 dark:bg-[#131314] border border-slate-200 dark:border-white/[0.04] text-[10px] text-slate-400 dark:text-zinc-600 uppercase tracking-tight text-center font-bold">
                        NO INGESTED PAYLOAD ATTACHED
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <InlineMeta label="Target Profile" val={inputData.policy || inputData.requested_profile || inputData.policy_profile || 'STRICT_DEFAULT'} />
                          <InlineMeta label="Package Correlator" val={inputData.packageId || inputData.manufacturing_package_id || 'UNATTACHED_RAW_STREAM'} />
                        </div>

                        <div>
                          <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest block mb-0.5">Raw JSON Object Structure</span>
                          <pre className="p-2 bg-slate-950 dark:bg-[#09090b] text-slate-200 dark:text-zinc-300 text-[9px] overflow-x-auto max-h-48 border border-slate-800 dark:border-white/5 custom-scrollbar select-text font-mono">
                            {JSON.stringify(inputData, null, 2)}
                          </pre>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionHeader label="Terminal Stream History" />
                  {forensics.logsStatus && (
                    <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-tight">
                      SRC: {forensics.logsStatus}
                    </span>
                  )}
                </div>
                {loading ? <SectionLoader /> : (
                  <>
                    {forensics.logsStatus === 'LOG_SOURCE_UNAVAILABLE' || forensics.logs.length === 0 ? (
                      <div className="px-2 py-1 bg-slate-50 dark:bg-[#131314] border border-slate-200 dark:border-white/[0.04] text-[10px] text-slate-400 dark:text-zinc-600 uppercase tracking-tight text-center font-bold">
                        NO EXECUTION LOGS AVAILABLE
                      </div>
                    ) : (
                      <div className="bg-slate-950 dark:bg-[#09090b] p-2 border border-slate-800 dark:border-white/5 text-slate-300 text-[9px] space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar select-text font-mono">
                        {forensics.logs.map((logItem, index) => (
                          <div key={index} className="flex items-start gap-2 hover:bg-slate-900 dark:hover:bg-white/[0.02] p-0.5 leading-tight">
                            <span className="text-slate-600 dark:text-zinc-600 select-none font-bold text-[8px] w-12 shrink-0">
                              {logItem.timestamp?.split('T')[1]?.substring(0, 8) || '00:00:00'}
                            </span>
                            <span className={`px-1 text-[7px] font-black uppercase shrink-0 leading-none py-0.2 border ${
                              logItem.severity === 'ERROR' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 
                              logItem.severity === 'WARN' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 dark:bg-white/[0.04] dark:border-transparent dark:text-zinc-500'
                            }`}>
                              {logItem.severity || 'INFO'}
                            </span>
                            <span className="text-slate-200 dark:text-zinc-300 break-all">{logItem.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'worker' && (
              <div className="space-y-2.5">
                <SectionHeader label="Assigned Fleet Node Footprint" />
                {loading ? <SectionLoader /> : (
                  <>
                    {forensics.workerStatus === 'WORKER_TELEMETRY_UNAVAILABLE' || !workerData || Object.keys(workerData).length === 0 ? (
                      <div className="px-2 py-1 bg-slate-50 dark:bg-[#131314] border border-slate-200 dark:border-white/[0.04] text-[10px] text-slate-400 dark:text-zinc-600 uppercase tracking-tight text-center font-bold">
                        NO WORKER TELEMETRY
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                          <InlineMeta label="Target Agent" val={workerData.worker_id || 'unmapped'} />
                          <InlineMeta label="State" val={workerData.status || 'UNSPECIFIED'} />
                          <InlineMeta label="Region" val={workerData.region || 'unspecified'} />
                          <InlineMeta label="Queue Pipe" val={workerData.queue_assigned || 'default'} />
                        </div>

                        {workerData.machine_node && (
                          <div className="p-2 bg-slate-50 dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/[0.04] flex items-center justify-between gap-2 text-[11px]">
                            <div className="min-w-0">
                              <span className="text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest block leading-none">Machine/Node Bind</span>
                              <span className="font-bold text-slate-900 dark:text-white truncate block mt-0.5">{workerData.machine_node}</span>
                              {workerData.hostname && (
                                <span className="text-[9px] text-slate-500 dark:text-zinc-500 truncate block">Host: {workerData.hostname}</span>
                              )}
                            </div>
                            <button 
                              onClick={() => setSelectedMachineId(workerData.machine_node)}
                              className="px-2 py-1 bg-white dark:bg-[#131314] border border-slate-300 dark:border-white/10 hover:border-slate-900 dark:hover:border-white/30 text-slate-900 dark:text-zinc-200 text-[9px] font-black uppercase tracking-tight transition-colors shrink-0"
                            >
                              Inspect Node
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <InlineMeta label="Retries Applied" val={String(workerData.retries_attempted ?? 0)} />
                          <InlineMeta label="Last Heartbeat" val={workerData.last_heartbeat ? new Date(workerData.last_heartbeat).toLocaleTimeString() : 'Unsynced'} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'result' && (
              <div className="space-y-3">
                <SectionHeader label="Ledger Consensus Outcomes" />
                {loading ? <SectionLoader /> : (
                  <div className="space-y-2.5">
                    {/* Compact Consensus Block */}
                    <div className="p-1.5 bg-slate-50 dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/[0.04] flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-400 dark:text-zinc-500 font-bold uppercase">Final Ledger Lock:</span>{' '}
                        <strong className={`font-black uppercase ${
                          resultData.final_job_status === 'COMPLETED' ? 'text-emerald-700 dark:text-emerald-500/80 font-normal' : 'text-slate-900 dark:text-white font-bold'
                        }`}>
                          {resultData.final_job_status || currentJobStatus}
                        </strong>
                      </div>
                      <div className="truncate max-w-[200px]">
                        <span className="text-slate-400 dark:text-zinc-500 font-bold uppercase">Block Ref:</span>{' '}
                        <strong className="text-slate-800 dark:text-zinc-300 font-mono truncate">{resultData.audit_correlation || job.id}</strong>
                      </div>
                    </div>

                    {resultData.error_reason && (
                      <div className="p-2 bg-red-50/20 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-200 text-[10px] space-y-0.5 select-text font-mono">
                        <span className="text-[8px] font-black uppercase tracking-wider block text-red-600 dark:text-red-400">Captured Output Error Signature</span>
                        <p className="font-bold leading-tight break-all">{resultData.error_reason}</p>
                      </div>
                    )}

                    {/* Highly Compressed Evidence Artifacts Array */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Evidence Asset Pool</span>
                        <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-600">
                          {forensics.artifactsStatus ? `STATUS: ${forensics.artifactsStatus}` : 'OK'}
                        </span>
                      </div>
                      
                      {forensics.artifactsStatus === 'ARTIFACT_NOT_AVAILABLE' || forensics.artifacts.length === 0 ? (
                        <div className="px-2 py-1 bg-slate-50 dark:bg-[#131314] border border-slate-200 dark:border-white/[0.04] text-[10px] text-slate-400 dark:text-zinc-600 uppercase tracking-tight text-center font-bold">
                          NO ARTIFACTS REGISTERED
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {forensics.artifacts.map((artifactItem, i) => (
                            <div key={artifactItem.artifact_id || i} className="p-2 bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/[0.05] flex flex-col justify-between text-[10px] leading-tight space-y-1">
                              <div className="min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-slate-900 dark:text-zinc-100 truncate" title={artifactItem.filename}>
                                    {artifactItem.filename}
                                  </span>
                                  <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-500 shrink-0">
                                    {artifactItem.size_bytes ? `${(artifactItem.size_bytes / 1024).toFixed(1)} KB` : '---'}
                                  </span>
                                </div>
                                {artifactItem.checksum_sha256 ? (
                                  <span className="text-[8px] font-mono text-slate-400 dark:text-zinc-600 block truncate" title={artifactItem.checksum_sha256}>
                                    SHA256: {artifactItem.checksum_sha256.substring(0, 16)}...
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-mono text-slate-400 dark:text-zinc-700 block italic">Hash omitted</span>
                                )}
                              </div>

                              <div className="pt-1 border-t border-slate-100 dark:border-white/[0.03] flex items-center justify-between text-[9px]">
                                {artifactItem.available && artifactItem.download_url ? (
                                  <a 
                                    href={artifactItem.download_url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-0.5 font-black text-primary hover:underline uppercase tracking-tighter"
                                  >
                                    <ArrowDownTrayIcon className="w-2.5 h-2.5" />
                                    Fetch Asset
                                  </a>
                                ) : (
                                  <span className="font-black text-slate-400 dark:text-zinc-600 uppercase tracking-tighter truncate font-normal">
                                    {artifactItem.reason || 'STORAGE UNLINKED'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {resultData.certified_bundle_id && (
                      <div className="p-1.5 bg-slate-50 dark:bg-[#131314] border border-slate-200 dark:border-white/[0.04] flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-500 dark:text-zinc-500 font-bold">Bundle Seal:</span>
                        <span className="text-slate-900 dark:text-zinc-200 font-black">{resultData.certified_bundle_id}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </Drawer>

      {/* Machine Details Shortcut Overlay */}
      <MachineDetailDrawer 
        machineId={selectedMachineId} 
        isOpen={!!selectedMachineId} 
        onClose={() => setSelectedMachineId(null)} 
      />
    </>
  );
};

const TabButton = ({ active, onClick, label, count }: { active: boolean, onClick: () => void, label: string, count?: number }) => (
  <button 
    onClick={onClick}
    className={`px-3 py-1 font-black uppercase tracking-tight transition-colors border-b-2 whitespace-nowrap flex items-center gap-1 ${
      active ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300'
    }`}
  >
    {label}
    {count !== undefined && count > 0 && (
      <span className={`px-1 py-0.1 text-[8px] font-black border leading-none ${
        active ? 'bg-primary text-white border-primary' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/[0.04] dark:border-transparent dark:text-zinc-400'
      }`}>
        {count}
      </span>
    )}
  </button>
);

const SectionHeader = ({ label }: { label: string }) => (
  <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 dark:border-white/[0.05]">
    <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{label}</span>
  </div>
);

const InlineMeta = ({ label, val }: { label: string, val: string }) => (
  <div className="p-1.5 bg-slate-50 dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/[0.04] min-w-0">
    <span className="text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider block leading-none truncate">{label}</span>
    <span className="font-bold text-slate-900 dark:text-zinc-200 block truncate mt-0.5">{val}</span>
  </div>
);

const SectionLoader = () => (
  <div className="py-6 space-y-2 animate-pulse">
    <div className="h-2.5 bg-slate-200 dark:bg-white/10 w-1/4" />
    <div className="h-10 bg-slate-100 dark:bg-white/5 w-full" />
  </div>
);
