import React, { useEffect, useState, useRef } from 'react';
import { Drawer } from './Drawer';
import { short } from '../lib/formatters';
import { safeArray } from '../lib/display';
import { getArtifactUxForArtifact } from '../../lib/artifactUx';
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
import { VisualProofPanel } from './preflight/VisualProofPanel';
import { COLORS } from '../design-system/tokens';

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

      if (activeJobIdRef.current !== id) return;

      setForensics({
        detail: detRes?.ok ? detRes.job : null,
        traceId: detRes?.trace_id,
        timeline: safeArray(timRes?.ok ? (timRes.timeline || (timRes as any)?.data) : []),
        timelineStatus: timRes?.source_status,
        logs: safeArray(logRes?.ok ? (logRes.logs || (logRes as any)?.data) : []),
        logsStatus: logRes?.source_status,
        artifacts: safeArray(artRes?.ok ? (artRes.artifacts || (artRes as any)?.data) : []),
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

  const renderErrorString = (errVal: any): string => {
    if (!errVal) return '';
    if (typeof errVal === 'string') return errVal;
    if (typeof errVal === 'object') {
      const msg = errVal.message || errVal.code || errVal.error || JSON.stringify(errVal);
      return typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
    }
    return String(errVal);
  };

  const currentJobStatus = forensics.detail?.status || job.status || 'UNKNOWN';
  const durationValue = forensics.detail?.duration_ms ?? job.duration_ms;
  const inputData = forensics.detail?.input_payload || {};
  const workerData = forensics.worker || {};
  const resultData = forensics.result || {};

  const hasRetries = (job.attempts && job.attempts > 0) || (workerData.retries_attempted && workerData.retries_attempted > 0);
  const isFailed = currentJobStatus === 'FAILED' || resultData.error_reason || job.error;
  const isMissingArtifacts = forensics.artifactsStatus === 'ARTIFACT_NOT_AVAILABLE' || (forensics.artifacts && forensics.artifacts.some(a => !a.available));
  const isMissingWorker = forensics.workerStatus === 'WORKER_TELEMETRY_UNAVAILABLE';
  
  const showEscalationZone = isFailed || hasRetries || isMissingArtifacts || isMissingWorker;

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={`TASK ID: ${short(job.id, 14)}`} maxWidth="max-w-xl">
        <div className={`space-y-3 italic-text-off font-mono select-none md:p-1 lg:p-0 ${COLORS.adaptive.textPrimary}`}>
          
          {/* Bloomberg-Terminal Density Meta Strip Header */}
          <div className={`p-2 border flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] ${
            isFailed ? 'bg-[#dc0000]/10 border-[#dc0000]/30' : 
            currentJobStatus === 'COMPLETED' ? `${COLORS.adaptive.surfaceMuted} border-[#10B981]/30` : 
            `${COLORS.adaptive.surface} ${COLORS.adaptive.borderPrimary}`
          }`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-none border shrink-0 ${
                currentJobStatus === 'COMPLETED' ? 'bg-[#10B981] border-[#10B981]' : 
                isFailed ? 'bg-[#dc0000] border-[#dc0000]' : 'bg-blue-500 border-blue-700 animate-pulse'
              }`} />
              <span className={`font-black tracking-tight ${
                isFailed ? 'text-[#dc0000]' : 
                currentJobStatus === 'COMPLETED' ? 'text-[#10B981]' : COLORS.adaptive.textPrimary
              }`}>{renderErrorString(currentJobStatus)}</span>
              <span className={COLORS.adaptive.textMuted}>|</span>
              <span className={`text-[10px] ${COLORS.adaptive.textMuted} font-bold uppercase`}>Type: {renderErrorString(job.type)}</span>
            </div>

            <div className="flex items-center gap-3 text-[10px]">
              {forensics.traceId && (
                <span className={`${COLORS.adaptive.textSecondary} truncate max-w-[140px]`}>
                  Trace: <strong className={`${COLORS.adaptive.textPrimary} font-mono`}>{short(forensics.traceId, 8)}</strong>
                </span>
              )}
              <span className={`${COLORS.adaptive.textSecondary} flex items-center gap-1`}>
                <ClockIcon className={`w-3 h-3 ${COLORS.adaptive.textMuted}`} />
                <strong className={`${COLORS.adaptive.textPrimary} font-mono`}>
                  {durationValue !== null && durationValue !== undefined ? `${durationValue}ms` : '---'}
                </strong>
              </span>
              <span className={COLORS.adaptive.textMuted}>Tenant: <strong className={COLORS.adaptive.textSecondary}>{renderErrorString(job.tenant_id || 'system')}</strong></span>
            </div>
          </div>

          {/* Operational Attention Zone */}
          {showEscalationZone && (
            <div className={`p-2 border leading-tight space-y-1 ${
              isFailed ? 'bg-[#dc0000]/10 border-[#dc0000]/30 text-[#dc0000]' : 
              'bg-amber-500/10 border-amber-500/30 text-amber-500'
            }`}>
              <div className="flex items-center gap-1.5 border-b pb-1 border-current/20">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest block leading-none">Top Priority Escalation Zone</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-0.5">
                {isFailed && (
                  <span className="font-bold flex items-center gap-1">
                    <strong className="text-[10px] uppercase bg-[#dc0000]/20 px-1 border border-[#dc0000]/30">Failure Triggered</strong>
                    <span>{renderErrorString(resultData.error_reason || job.error) || 'Execution halted'}</span>
                  </span>
                )}
                {hasRetries && (
                  <span className="font-bold flex items-center gap-1 text-amber-500">
                    <strong className="text-[10px] uppercase bg-amber-500/20 px-1 border border-amber-500/30">Queue Retry Block</strong>
                    <span>Attempt {job.attempts || workerData.retries_attempted || 1} active</span>
                  </span>
                )}
                {isMissingArtifacts && (
                  <span className={`font-medium ${COLORS.adaptive.textSecondary} text-[11px]`}>
                    ⚠️ Storage Binary Asset unmapped
                  </span>
                )}
                {isMissingWorker && (
                  <span className={`font-medium ${COLORS.adaptive.textMuted} text-[11px]`}>
                    ⚠️ Worker node diagnostics detached
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Compressed Navigation Switch */}
          <div className={`flex border-b ${COLORS.adaptive.borderSubtle} overflow-x-auto custom-scrollbar text-[11px]`}>
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
                {forensics.timelineStatus === 'NO_EVENT_SOURCE_AVAILABLE' && !loading && (
                  <div className={`px-2 py-1 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} text-[10px] ${COLORS.adaptive.textMuted} font-medium flex items-center justify-between gap-2`}>
                    <div className="flex items-center gap-1.5 truncate">
                      <ExclamationTriangleIcon className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>Timeline log array unindexed by DB rows</span>
                    </div>
                    <span className="text-[9px] text-amber-500 uppercase tracking-tight shrink-0 font-bold">FALLBACK ROW</span>
                  </div>
                )}

                <ExecutionTimeline events={forensics.timeline} isLoading={loading} />
                
                {(forensics.detail?.governance_snapshot || job.governance_snapshot) && (
                  <div className={`pt-2 border-t ${COLORS.adaptive.borderSubtle}`}>
                    <span className={`text-[9px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-wider block mb-1`}>Enforced Posture Matrix</span>
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
                      <div className={`px-2 py-1 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} text-[10px] ${COLORS.adaptive.textMuted} uppercase tracking-tight text-center font-bold`}>
                        NO INGESTED PAYLOAD ATTACHED
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <InlineMeta label="Target Profile" val={inputData.policy || inputData.requested_profile || inputData.policy_profile || 'STRICT_DEFAULT'} />
                          <InlineMeta label="Package Correlator" val={inputData.packageId || inputData.manufacturing_package_id || 'UNATTACHED_RAW_STREAM'} />
                        </div>

                        <div>
                          <span className={`text-[9px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest block mb-0.5`}>Raw JSON Object Structure</span>
                          <pre className={`p-2 ${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.textPrimary} text-[9px] overflow-x-auto max-h-48 border ${COLORS.adaptive.borderSubtle} custom-scrollbar select-text font-mono`}>
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
                    <span className={`text-[9px] font-mono font-bold ${COLORS.adaptive.textMuted} uppercase tracking-tight`}>
                      SRC: {forensics.logsStatus}
                    </span>
                  )}
                </div>
                {loading ? <SectionLoader /> : (
                  <>
                    {forensics.logsStatus === 'LOG_SOURCE_UNAVAILABLE' || forensics.logs.length === 0 ? (
                      <div className={`px-2 py-1 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} text-[10px] ${COLORS.adaptive.textMuted} uppercase tracking-tight text-center font-bold`}>
                        NO EXECUTION LOGS AVAILABLE
                      </div>
                    ) : (
                      <div className={`bg-black/40 p-2 border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.textPrimary} text-[9px] space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar select-text font-mono`}>
                        {safeArray(forensics.logs).map((logItem, index) => (
                          <div key={index} className={`flex items-start gap-2 ${COLORS.adaptive.hoverSurface} p-0.5 leading-tight`}>
                            <span className={`select-none font-bold text-[8px] w-12 shrink-0 ${COLORS.adaptive.textMuted}`}>
                              {logItem.timestamp?.split('T')[1]?.substring(0, 8) || '00:00:00'}
                            </span>
                            <span className={`px-1 text-[7px] font-black uppercase shrink-0 leading-none py-0.2 border ${
                              logItem.severity === 'ERROR' ? 'bg-[#dc0000]/20 text-[#dc0000] border-[#dc0000]/30' : 
                              logItem.severity === 'WARN' ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : `${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.textMuted}`
                            }`}>
                              {logItem.severity || 'INFO'}
                            </span>
                            <span className="break-all">{renderErrorString(logItem.message)}</span>
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
                      <div className={`px-2 py-1 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} text-[10px] ${COLORS.adaptive.textMuted} uppercase tracking-tight text-center font-bold`}>
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
                          <div className={`p-2 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-between gap-2 text-[11px]`}>
                            <div className="min-w-0">
                              <span className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest block leading-none`}>Machine/Node Bind</span>
                              <span className={`font-bold ${COLORS.adaptive.textPrimary} truncate block mt-0.5`}>{renderErrorString(workerData.machine_node)}</span>
                              {workerData.hostname && (
                                <span className={`text-[9px] ${COLORS.adaptive.textMuted} truncate block`}>Host: {workerData.hostname}</span>
                              )}
                            </div>
                            <button 
                              onClick={() => setSelectedMachineId(workerData.machine_node)}
                              className={`px-2 py-1 ${COLORS.adaptive.surface} border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.textPrimary} text-[9px] font-black uppercase tracking-tight transition-colors shrink-0`}
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
                    <div className={`p-1.5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex flex-wrap items-center justify-between gap-2 text-[10px]`}>
                      <div>
                        <span className={`${COLORS.adaptive.textMuted} font-bold uppercase`}>Final Ledger Lock:</span>{' '}
                        <strong className={`font-black uppercase ${
                          resultData.final_job_status === 'COMPLETED' ? 'text-[#10B981] font-normal' : `${COLORS.adaptive.textPrimary} font-bold`
                        }`}>
                          {renderErrorString(resultData.final_job_status || currentJobStatus)}
                        </strong>
                      </div>
                      <div className="truncate max-w-[200px]">
                        <span className={`${COLORS.adaptive.textMuted} font-bold uppercase`}>Block Ref:</span>{' '}
                        <strong className={`${COLORS.adaptive.textPrimary} font-mono truncate`}>{renderErrorString(resultData.audit_correlation || job.id)}</strong>
                      </div>
                    </div>

                    {resultData.error_reason && (
                      <div className="p-2 bg-[#dc0000]/10 border border-[#dc0000]/30 text-[#dc0000] text-[10px] space-y-0.5 select-text font-mono">
                        <span className="text-[8px] font-black uppercase tracking-wider block">Captured Output Error Signature</span>
                        <p className="font-bold leading-tight break-all">{renderErrorString(resultData.error_reason)}</p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={`font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>Evidence Asset Pool</span>
                        <span className={`text-[9px] font-bold ${COLORS.adaptive.textMuted}`}>
                          {forensics.artifactsStatus ? `STATUS: ${forensics.artifactsStatus}` : 'OK'}
                        </span>
                      </div>
                      
                      {forensics.artifactsStatus === 'ARTIFACT_NOT_AVAILABLE' || forensics.artifacts.length === 0 ? (
                        <div className={`px-2 py-1 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} text-[10px] ${COLORS.adaptive.textMuted} uppercase tracking-tight text-center font-bold`}>
                          NO ARTIFACTS REGISTERED
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {safeArray(forensics.artifacts).map((artifactItem, i) => {
                            const ux = getArtifactUxForArtifact(artifactItem, forensics.detail?.report?.artifact_ux || job?.artifact_ux || resultData?.artifact_ux || null, 'operator');
                            return (
                            <div key={artifactItem.artifact_id || i} className={`p-2 ${COLORS.adaptive.surface} border ${COLORS.adaptive.borderPrimary} flex flex-col justify-between text-[10px] leading-tight space-y-1`}>
                              <div className="min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`font-bold ${COLORS.adaptive.textPrimary} truncate`} title={ux.tooltip || (typeof artifactItem.filename === 'string' ? artifactItem.filename : renderErrorString(artifactItem.filename))}>
                                    {ux.display_label || renderErrorString(artifactItem.filename)}
                                  </span>
                                  <span className={`text-[8px] font-bold ${COLORS.adaptive.textMuted} shrink-0`}>
                                    {artifactItem.size_bytes ? `${Number((artifactItem.size_bytes || 0) / 1024).toFixed(1)} KB` : '---'}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between">
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border ${
                                    ux.status_tone === 'danger' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                    ux.status_tone === 'warning' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                    ux.status_tone === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                    ux.status_tone === 'info' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                    `${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.textMuted} ${COLORS.adaptive.borderSubtle}`
                                  }`}>
                                    {ux.status_badge || 'Artifact'}
                                  </span>
                                  {artifactItem.checksum_sha256 ? (
                                    <span className={`text-[8px] font-mono ${COLORS.adaptive.textMuted} block truncate max-w-[100px]`} title={artifactItem.checksum_sha256}>
                                      SHA256: {artifactItem.checksum_sha256.substring(0, 8)}...
                                    </span>
                                  ) : (
                                    <span className={`text-[8px] font-mono ${COLORS.adaptive.textMuted} block italic`}>Hash omitted</span>
                                  )}
                                </div>
                              </div>

                              <div className={`pt-1 border-t ${COLORS.adaptive.borderSubtle} flex items-center justify-between text-[9px]`}>
                                {artifactItem.available && artifactItem.download_url && ux.download_allowed !== false ? (
                                  <a 
                                    href={artifactItem.download_url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-0.5 font-black text-[#dc0000] hover:underline uppercase tracking-tight"
                                    title={ux.tooltip || 'Download this artifact'}
                                  >
                                    <ArrowDownTrayIcon className="w-2.5 h-2.5" />
                                    {ux.button_label || 'Fetch Asset'}
                                  </a>
                                ) : (
                                  <span className={`font-black ${COLORS.adaptive.textMuted} uppercase tracking-tight truncate font-normal`} title={ux.tooltip || 'Download not allowed'}>
                                    {ux.download_allowed === false ? 'Download Blocked' : renderErrorString(artifactItem.reason || 'STORAGE UNLINKED')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )})}
                        </div>
                      )}
                    </div>

                    {/* Phase 69D: Visual Proof Panel in operator job drawer */}
                    {(resultData?.visual_diff_governance || forensics.detail?.report?.visual_diff_governance) && (
                      <VisualProofPanel
                        visualDiffGovernance={resultData?.visual_diff_governance || forensics.detail?.report?.visual_diff_governance}
                        audience="operator"
                        jobId={job?.id}
                      />
                    )}

                    {resultData.certified_bundle_id && (
                      <div className={`p-1.5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-between text-[10px] font-mono`}>
                        <span className={COLORS.adaptive.textMuted}>Bundle Seal:</span>
                        <span className={`font-black ${COLORS.adaptive.textPrimary}`}>{renderErrorString(resultData.certified_bundle_id)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </Drawer>

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
      active ? 'border-[#dc0000] text-[#dc0000] bg-[#dc0000]/5' : `border-transparent ${COLORS.adaptive.textMuted} hover:text-zinc-900 dark:hover:text-zinc-100`
    }`}
  >
    {label}
    {count !== undefined && count > 0 && (
      <span className={`px-1 py-0.1 text-[8px] font-black border leading-none ${
        active ? 'bg-[#dc0000] text-white border-[#dc0000]' : `${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.textMuted} ${COLORS.adaptive.borderSubtle}`
      }`}>
        {count}
      </span>
    )}
  </button>
);

const SectionHeader = ({ label }: { label: string }) => (
  <div className={`flex items-center justify-between pb-1 border-b ${COLORS.adaptive.borderSubtle}`}>
    <span className={`text-[9px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>{label}</span>
  </div>
);

const InlineMeta = ({ label, val }: { label: string, val: any }) => (
  <div className={`p-1.5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} min-w-0`}>
    <span className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-wider block leading-none truncate`}>{label}</span>
    <span className={`font-bold ${COLORS.adaptive.textPrimary} block truncate mt-0.5`}>{typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}</span>
  </div>
);

const SectionLoader = () => (
  <div className="py-6 space-y-2 animate-pulse">
    <div className={`h-2.5 ${COLORS.adaptive.surfaceMuted} w-1/4`} />
    <div className={`h-10 ${COLORS.adaptive.surfaceMuted} w-full`} />
  </div>
);
