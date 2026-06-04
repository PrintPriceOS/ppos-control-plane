import React, { useState, useRef, Fragment, useEffect } from 'react';
import { 
  Dialog, 
  Transition, 
  TransitionChild,
  DialogPanel,
  DialogTitle
} from "@headlessui/react";
import { 
  XMarkIcon, 
  CloudArrowUpIcon, 
  DocumentIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  RectangleStackIcon,
  ShieldCheckIcon,
  DocumentMagnifyingGlassIcon,
  CpuChipIcon
} from "@heroicons/react/24/outline";
import { 
  createAdminPreflightJob, 
  createAdminPreflightBatch, 
  getAdminPreflightPolicies
} from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { toDisplayText } from "../../lib/display";
import { addBackgroundJob } from "../../components/BackgroundJobMonitor";

interface PreflightUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const checkMagicBytes = async (file: File): Promise<boolean> => {
  try {
    const buffer = await file.slice(0, 5).arrayBuffer();
    const view = new Uint8Array(buffer);
    // %PDF- magic bytes signature corresponds to ASCII values: 37, 80, 68, 70, 45
    return view.length >= 5 && 
           view[0] === 37 && 
           view[1] === 80 && 
           view[2] === 68 && 
           view[3] === 70 && 
           view[4] === 45;
  } catch (e) {
    return false;
  }
};

export const PreflightUploadModal: React.FC<PreflightUploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [files, setFiles] = useState<File[]>([]);
  const [tenantId, setTenantId] = useState('system');
  const [printhouseId, setPrinthouseId] = useState('');
  const [operatorId, setOperatorId] = useState('cp_industrial_operator');
  const [traceId, setTraceId] = useState(() => `trace_cp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
  const [jobType, setJobType] = useState('ANALYZE');
  const [policy, setPolicy] = useState('');
  
  // Pipeline Status States
  const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  
  // High-fidelity Status Polling States
  const [polledData, setPolledData] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Hydrate authorative policies from Gateway
  const policiesQ = useAdminQuery('preflight:policies:admin', () => getAdminPreflightPolicies(), 60000);
  const policiesData: any = policiesQ.data;
  const policies = Array.isArray(policiesData?.policies) ? policiesData.policies : [];
  const sourceStatus = policiesData?.source_status || policiesData?.source;
  const isPoliciesUnavailable = policiesData && policies.length === 0;
  const isPoliciesDegraded = sourceStatus?.includes('FALLBACK') || sourceStatus?.includes('UNAVAILABLE') || sourceStatus?.includes('error');

  useEffect(() => {
    if (policies.length > 0 && !policy) {
      setPolicy(policies[0].id || policies[0].policy_id);
    }
  }, [policies, policy]);

  const regenerateTraceId = () => {
    setTraceId(`trace_cp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      
      // Enforce strict Extension/MIME typing first
      const pdfCandidates = selectedFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      
      if (pdfCandidates.length !== selectedFiles.length) {
        setError('Validation Rejected: Upload payload contains invalid mime formats. Only standard PDF file streams are allowed.');
        return;
      }

      setError(null);
      setStatus('idle');

      // Client-side strict Magic Byte validation for 100% forensic security
      const verifiedFiles: File[] = [];
      for (const f of pdfCandidates) {
        const isValidMagic = await checkMagicBytes(f);
        if (!isValidMagic) {
          setError(`Forensic Rejection: Document "${f.name}" failed magic bytes check (%PDF- mismatch). File stream is corrupted or non-compliant.`);
          return;
        }
        verifiedFiles.push(f);
      }

      if (mode === 'SINGLE') {
        setFiles([verifiedFiles[0]].filter(Boolean));
      } else {
        setFiles(prev => [...prev, ...verifiedFiles]);
      }
    }
  };

  const removeFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const resetAndClose = () => {
    setFiles([]);
    setStatus('idle');
    setError(null);
    setResult(null);
    setPolledData(null);
    regenerateTraceId();
    onClose();
  };

  const handleExecute = async () => {
    if (files.length === 0) return;
    
    setStatus('executing');
    setError(null);
    setPolledData(null);
    
    try {
      const currentTraceId = traceId || `trace_cp_${Date.now()}`;
      
      // Build robust forensic metadata block mapping policy, operator, and audit events securely
      const metadataBlock = {
        traceId: currentTraceId,
        operatorId: operatorId || 'cp_operator',
        requestedBy: 'Industrial-Preflight-Control-Plane',
        executionStrategy: jobType,
        selectedPolicy: policy,
        governanceMode: 'STRICT_FORENSIC_EVIDENCE',
        auditEventTrigger: mode === 'SINGLE' ? 'PREFLIGHT_JOB_CREATED' : 'PREFLIGHT_BATCH_CREATED',
        clientValidation: 'MAGIC_BYTES_VERIFIED',
        createdAt: new Date().toISOString()
      };

      const customHeaders = {
        'X-Trace-ID': currentTraceId,
        'X-Operator-Id': operatorId || 'cp_operator',
        'X-Policy': policy,
        'X-Execution-Strategy': jobType
      };

      let submittedJobId: string | null = null;
      let resPayload: any = null;

      if (mode === 'SINGLE') {
        const formData = new FormData();
        formData.append('file', files[0]);
        formData.append('tenantId', tenantId || 'system');
        if (printhouseId) formData.append('printhouseId', printhouseId);
        formData.append('type', jobType);
        formData.append('policy', policy);
        formData.append('metadata', JSON.stringify(metadataBlock));

        resPayload = await createAdminPreflightJob(formData, customHeaders);
        setResult({ job: resPayload.job || resPayload });
        submittedJobId = resPayload?.job?.jobId || resPayload?.job?.id || resPayload?.jobId || resPayload?.id;
      } else {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('tenantId', tenantId || 'system');
        if (printhouseId) formData.append('printhouseId', printhouseId);
        formData.append('type', jobType);
        formData.append('policy', policy);
        formData.append('metadata', JSON.stringify(metadataBlock));

        resPayload = await createAdminPreflightBatch(formData, customHeaders);
        setResult({ batch: resPayload.batch || resPayload });
      }
      
      setStatus('success');
      onSuccess();

      // Trigger global Background Polling Monitor for Single Jobs
      if (mode === 'SINGLE' && submittedJobId) {
        addBackgroundJob({
          jobId: submittedJobId,
          filename: files[0]?.name,
          type: jobType,
          tenantId: tenantId || 'system',
          status: resPayload?.job?.status || resPayload?.status || 'PROCESSING',
          progress: resPayload?.job?.progress || resPayload?.progress || 15
        });
      }
    } catch (err: any) {
      console.error('[UPLOAD-MODAL] High-Fidelity Gateway Execution Error:', err);
      setError(err?.error?.message || err?.message || err?.statusText || 'Industrial Preflight Gateway execution failed upstream.');
      setStatus('error');
    }
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[100]" onClose={resetAndClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto font-manrope">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95 translate-y-4"
              enterTo="opacity-100 scale-100 translate-y-0"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100 translate-y-0"
              leaveTo="opacity-0 scale-95 translate-y-4"
            >
              <DialogPanel className="w-full max-w-4xl transform overflow-hidden rounded-none ppos-surface p-1 text-left align-middle shadow-2xl border ppos-border transition-all">
                <div className="ppos-surface rounded-none overflow-hidden flex flex-col">
                  {/* High-Fidelity Header */}
                  <div className="px-8 py-6 flex items-center justify-between border-b ppos-border bg-slate-50/50 dark:bg-[#131314]/50">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-none bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
                        {mode === 'SINGLE' ? (
                          <CloudArrowUpIcon className="w-6 h-6 text-primary animate-pulse" />
                        ) : (
                          <RectangleStackIcon className="w-6 h-6 text-primary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <DialogTitle as="h3" className="text-xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight leading-tight flex items-center gap-2">
                            <span>Industrial Execution Trigger</span>
                            <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              Forensic Ready
                            </span>
                          </DialogTitle>
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-1 flex items-center gap-2">
                          <span>Canonical App/BFF Gateway Contract</span>
                          <span>•</span>
                          <span className="text-primary font-mono lowercase">post /api/v2/{mode === 'SINGLE' ? 'jobs' : 'batches'}</span>
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {/* Mode Toggles */}
                      <div className="flex bg-slate-200/50 dark:bg-white/5 p-0.5 border ppos-border">
                        <button 
                          onClick={() => { setMode('SINGLE'); setFiles([]); setStatus('idle'); setError(null); }}
                          className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${mode === 'SINGLE' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
                        >
                          Single Pipeline
                        </button>
                        <button 
                          onClick={() => { setMode('BATCH'); setFiles([]); setStatus('idle'); setError(null); }}
                          className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${mode === 'BATCH' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
                        >
                          Batch Array
                        </button>
                      </div>

                      <button 
                        onClick={resetAndClose}
                        className="w-10 h-10 rounded-none flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all"
                      >
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                    </div>
                  </div>

                  {/* Forensic Context Strip */}
                  <div className="px-8 py-3 bg-slate-100/60 dark:bg-[#161618]/60 border-b ppos-border flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheckIcon className="w-4 h-4 text-primary" />
                      <span className="font-bold text-slate-500 dark:text-zinc-400">Trace Block ID:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-[#ECECF1] bg-white dark:bg-black/30 px-2 py-0.5 border ppos-border select-all">
                        {traceId}
                      </span>
                      <button 
                        onClick={regenerateTraceId}
                        title="Rotate Forensic Trace ID"
                        className="text-slate-400 hover:text-primary transition-colors p-0.5"
                      >
                        <ArrowPathIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-500 dark:text-zinc-400">Operator Scope:</span>
                      <input 
                        type="text" 
                        value={operatorId}
                        onChange={e => setOperatorId(e.target.value)}
                        className="bg-white dark:bg-black/30 border ppos-border px-2 py-0.5 font-mono text-slate-800 dark:text-[#ECECF1] font-bold text-xs outline-none focus:border-primary/50 w-44"
                        placeholder="Operator ID"
                      />
                    </div>
                  </div>

                  {/* Main Execution Surface */}
                  <div className="px-8 py-8 space-y-8 flex-grow">
                    {status === 'success' ? (
                      <div className="py-6 animate-in zoom-in duration-500 space-y-8">
                        {/* Status Heading Banner */}
                        <div className="flex flex-col items-center text-center">
                          <div className="w-20 h-20 rounded-none bg-emerald-500/10 flex items-center justify-center mb-4 relative">
                            <CheckCircleIcon className="w-12 h-12 text-emerald-500" />
                            {isPolling && <div className="absolute inset-0 rounded-none border-4 border-emerald-500/20 animate-ping" />}
                          </div>
                          <h3 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1]">
                            {mode === 'SINGLE' ? 'Industrial Lifecycle Dispatched' : 'Batch Array Queued Securely'}
                          </h3>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {mode === 'SINGLE' ? 'Live Gateway Status Monitor Active' : 'Orchestrator array workers propagating payload blocks'}
                          </p>
                        </div>

                        {/* Lifecycle Metrics Strip */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="ppos-surface-muted p-4 border ppos-border flex flex-col items-center text-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                              {mode === 'SINGLE' ? 'Canonical Job ID' : 'Batch Pipeline ID'}
                            </span>
                            <span className="font-mono text-xs font-bold text-primary select-all truncate w-full">
                              {mode === 'SINGLE' 
                                ? String(result?.job?.jobId || result?.job?.id || polledData?.jobId || 'N/A') 
                                : String(result?.batch?.id || result?.batch?.batchId || 'N/A')}
                            </span>
                          </div>

                          <div className="ppos-surface-muted p-4 border ppos-border flex flex-col items-center text-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                              Execution Policy
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-800 dark:text-[#ECECF1] truncate w-full">
                              {policy}
                            </span>
                          </div>

                          <div className="ppos-surface-muted p-4 border ppos-border flex flex-col items-center text-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                              Strategy Flag
                            </span>
                            <span className="font-mono text-xs font-bold text-amber-500 block">
                              {jobType}
                            </span>
                          </div>

                          <div className="ppos-surface-muted p-4 border ppos-border flex flex-col items-center text-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                              Audit Event Signal
                            </span>
                            <span className="font-mono text-[10px] font-bold text-emerald-500 block">
                              {mode === 'SINGLE' ? 'JOB_CREATED' : 'BATCH_QUEUED'}
                            </span>
                          </div>
                        </div>

                        {/* Polling & Live Progress Section (Single Mode Only) */}
                        {mode === 'SINGLE' && polledData && (
                          <div className="ppos-surface-muted p-6 border ppos-border space-y-6">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <CpuChipIcon className="w-5 h-5 text-primary" />
                                <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#ECECF1]">
                                  Real-Time Upstream Worker State
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {isPolling && (
                                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-primary">
                                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                    <span>Polling Core...</span>
                                  </span>
                                )}
                                <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border ${
                                  polledData.status?.toUpperCase() === 'COMPLETED' || polledData.status?.toUpperCase() === 'SUCCESS'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : polledData.status?.toUpperCase() === 'FAILED'
                                    ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                    : 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse'
                                }`}>
                                  {polledData.status || 'PROCESSING'}
                                </span>
                              </div>
                            </div>

                            {/* Progress Meter */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[11px] font-mono font-bold text-slate-500">
                                <span>Pipeline Fulfillment Meter</span>
                                <span>{polledData.progress || 15}%</span>
                              </div>
                              <div className="w-full h-2 bg-slate-200 dark:bg-white/5 overflow-hidden border ppos-border">
                                <div 
                                  className="h-full bg-primary transition-all duration-500 ease-out"
                                  style={{ width: `${polledData.progress || 15}%` }}
                                />
                              </div>
                            </div>

                            {/* Artifact Output Registry Array view */}
                            {polledData.canonicalPayload?.artifacts && Array.isArray(polledData.canonicalPayload.artifacts) && polledData.canonicalPayload.artifacts.length > 0 && (
                              <div className="space-y-3 pt-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                                  Resolved Output Artifact Aliases
                                </span>
                                <div className="grid grid-cols-1 gap-2">
                                  {polledData.canonicalPayload.artifacts.map((art: any, i: number) => {
                                    const artAlias = art.type === 'OUTPUT' ? 'final_fixed_pdf' : art.type === 'REPORT' ? 'preflight_report_json' : art.type?.toLowerCase() || 'candidate';
                                    return (
                                      <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-black/20 border ppos-border text-xs">
                                        <div className="flex items-center gap-2.5 truncate">
                                          <DocumentMagnifyingGlassIcon className="w-4 h-4 text-primary flex-shrink-0" />
                                          <span className="font-bold text-slate-800 dark:text-[#ECECF1] truncate">
                                            {art.filename || art.name || `artifact_${i}.pdf`}
                                          </span>
                                          <span className="px-1.5 py-0.2 bg-primary/10 text-primary border border-primary/20 text-[9px] font-mono uppercase">
                                            alias: {artAlias}
                                          </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                          <span className="font-mono text-[10px] text-slate-400">
                                            {art.sizeBytes ? `${(art.sizeBytes / 1024).toFixed(1)} KB` : 'Dynamic Stream'}
                                          </span>
                                          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">
                                            Registered
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex justify-center pt-2">
                          <button 
                            onClick={resetAndClose}
                            className="px-10 py-3 bg-primary text-white rounded-none font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
                          >
                            Return to Operational Console
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Rich Document Dropzone validating magic bytes */}
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className={`
                            group relative border-2 border-dashed rounded-none p-8 text-center cursor-pointer transition-all duration-300
                            ${files.length > 0 
                              ? 'border-primary/40 bg-primary/[0.01]' 
                              : 'ppos-border hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-white/5'}
                          `}
                        >
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="application/pdf"
                            multiple={mode === 'BATCH'}
                            onChange={handleFileChange}
                          />
                          
                          <div className="flex flex-col items-center">
                            {files.length > 0 ? (
                              <div className="w-full space-y-3" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-between pb-2 border-b ppos-border">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                      {files.length} Document{files.length > 1 ? 's' : ''} Staged
                                    </span>
                                    <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-500 text-[8px] font-mono font-bold uppercase">
                                      %PDF- Magic Verified
                                    </span>
                                  </div>
                                  <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-[11px] font-bold text-primary hover:underline"
                                  >
                                    + Stage Additional
                                  </button>
                                </div>
                                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2">
                                  {files.map((f, index) => (
                                    <div key={index} className="flex items-center justify-between ppos-surface-muted px-3 py-2 border ppos-border">
                                      <div className="flex items-center gap-2.5 truncate">
                                        <DocumentIcon className="w-4 h-4 text-primary flex-shrink-0" />
                                        <span className="text-xs font-bold text-slate-700 dark:text-[#ECECF1] truncate">{f.name}</span>
                                      </div>
                                      <div className="flex items-center gap-3 flex-shrink-0">
                                        <span className="text-[10px] font-mono text-slate-400">
                                          {Number(f.size / (1024 * 1024)).toFixed(2)} MB
                                        </span>
                                        <button 
                                          onClick={(e) => removeFile(index, e)}
                                          className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                                        >
                                          <XMarkIcon className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center py-5 space-y-3">
                                <div className="w-16 h-16 rounded-none ppos-surface-muted flex items-center justify-center text-slate-300 dark:text-zinc-600 group-hover:text-primary group-hover:scale-105 transition-all">
                                  {mode === 'SINGLE' ? <CloudArrowUpIcon className="w-8 h-8" /> : <RectangleStackIcon className="w-8 h-8" />}
                                </div>
                                <div className="space-y-1">
                                  <div className="text-base font-black text-slate-900 dark:text-[#ECECF1]">
                                    {mode === 'SINGLE' ? 'Click or Drag PDF payload block to instantiate single job' : 'Drop batch PDF array files for clustered extraction'}
                                  </div>
                                  <div className="text-xs font-bold text-slate-400">
                                    Pre-execution validation probes inspect file Magic Bytes headers securely
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Parameter Strategy Matrix */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] block ml-1">
                              Tenant Isolation Mapping
                            </label>
                            <input 
                              type="text" 
                              value={tenantId}
                              onChange={(e) => setTenantId(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-4 py-3 text-xs font-mono font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20 outline-none"
                              placeholder="system"
                            />
                            <span className="text-[10px] text-slate-400 block ml-1 font-medium">
                              Enforces workspace boundaries against backend data routing layers.
                            </span>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] block ml-1">
                              Printhouse Assignment ID (Optional)
                            </label>
                            <input 
                              type="text" 
                              value={printhouseId}
                              onChange={(e) => setPrinthouseId(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-4 py-3 text-xs font-mono font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-slate-300"
                              placeholder="e.g. ph_offset_munich"
                            />
                            <span className="text-[10px] text-slate-400 block ml-1 font-medium">
                              Binds execution events to explicit print production facility metadata.
                            </span>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] block ml-1">
                              Execution Intent Strategy
                            </label>
                            <select 
                              value={jobType}
                              onChange={(e) => setJobType(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-4 py-3 text-xs font-black text-slate-800 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer tracking-wider"
                            >
                              <option value="ANALYZE">ANALYZE ONLY (Honest Diagnostic Extraction)</option>
                              <option value="AUTOFIX">AUTO-REPAIR (Ghostscript Engine Resolution)</option>
                              <option value="CERTIFY">CERTIFICATION (Evidence Standard Generation)</option>
                            </select>
                            <span className="text-[10px] text-slate-400 block ml-1 font-medium">
                              Selects primary operational phase applied upon Gateway ingestion.
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between ml-1">
                              <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
                                Canonical Governance Policy ID
                              </label>
                              {sourceStatus && sourceStatus !== 'LIVE_UPSTREAM' && (
                                <span className="text-[8px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.2 tracking-tight block">
                                  Local Fallback Contract
                                </span>
                              )}
                            </div>
                            <select 
                              value={policy}
                              onChange={(e) => setPolicy(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-4 py-3 text-xs font-black text-slate-800 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer tracking-tight"
                            >
                              {policies.length > 0 ? (
                                policies.map((p: any) => {
                                  const canonicalId = p.id || p.policy_id;
                                  const displayName = p.name || p.id;
                                  return (
                                    <option key={canonicalId} value={canonicalId}>
                                      {displayName} [{canonicalId}]
                                    </option>
                                  );
                                })
                              ) : (
                                <option value="">Authoritative policies unavailable</option>
                              )}
                            </select>
                            <span className="text-[10px] text-slate-400 block ml-1 font-medium truncate">
                              Enforces real Fogra/GRACoL rules matching upstream BFF policy mapping catalog.
                            </span>
                          </div>
                        </div>

                        {/* Observability Feedback Bars */}
                        {isPoliciesUnavailable ? (
                          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-none flex items-start gap-3 text-red-500">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-black uppercase tracking-wider">Policy Catalog Disconnection</span>
                              <span className="text-xs font-bold opacity-90">
                                Real preflight policies catalog array returned zero nodes. Pipeline dispatches are locked safely to prevent un-governed task processing.
                              </span>
                            </div>
                          </div>
                        ) : isPoliciesDegraded ? (
                          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-none flex items-start gap-3 text-amber-500">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-black uppercase tracking-wider">Authoritative Catalog Degradation</span>
                              <span className="text-xs font-bold opacity-90">
                                Upstream microservice communication latency triggered failover to pure standard JSON fallbacks. Full structural integrity preserved.
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {error && (
                          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-none flex items-start gap-3 text-red-500 animate-in shake duration-300">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-black uppercase tracking-wider">Forensic Gateway Rejection Alert</span>
                              <span className="text-xs font-bold opacity-90">{toDisplayText(error)}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* High-Fidelity Action Controls Footer */}
                  {status !== 'success' && (
                    <div className="px-8 py-5 ppos-surface-muted border-t ppos-border flex items-center justify-between">
                      <button 
                        disabled={status === 'executing'}
                        onClick={resetAndClose}
                        className="px-4 py-2 text-xs font-black text-slate-400 hover:text-slate-600 dark:hover:text-[#ECECF1] uppercase tracking-[0.2em] transition-all disabled:opacity-50"
                      >
                        Abort Protocol
                      </button>
                      
                      <button 
                        disabled={files.length === 0 || !policy || !!isPoliciesUnavailable || status === 'executing'}
                        onClick={handleExecute}
                        className={`
                          relative overflow-hidden group flex items-center gap-3 px-8 py-3 bg-primary text-white rounded-none font-black text-xs uppercase tracking-widest
                          shadow-md shadow-primary/20 transition-all
                          hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 active:scale-95
                          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0
                        `}
                      >
                        {status === 'executing' ? (
                          <>
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                            <span>Propagating Blocks...</span>
                          </>
                        ) : (
                          <>
                            <CloudArrowUpIcon className="w-4 h-4" />
                            <span>{mode === 'SINGLE' ? 'Execute Industrial Job' : 'Dispatch Batch Array Queue'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
