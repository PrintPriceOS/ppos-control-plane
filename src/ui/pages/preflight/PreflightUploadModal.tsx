import React, { useState, useRef, Fragment } from 'react';
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
  RectangleStackIcon
} from "@heroicons/react/24/outline";
import { createAdminPreflightJob, createAdminPreflightBatch, getAdminPreflightPolicies } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { toDisplayText } from "../../lib/display";

interface PreflightUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PreflightUploadModal: React.FC<PreflightUploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [files, setFiles] = useState<File[]>([]);
  const [tenantId, setTenantId] = useState('system');
  const [printhouseId, setPrinthouseId] = useState('');
  const [jobType, setJobType] = useState('ANALYZE');
  const [policy, setPolicy] = useState('');
  const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const policiesQ = useAdminQuery('preflight:policies:admin', () => getAdminPreflightPolicies(), 60000);
  const policiesData: any = policiesQ.data;
  const policies = Array.isArray(policiesData?.policies) ? policiesData.policies : [];
  const sourceStatus = policiesData?.source;
  const isPoliciesUnavailable = policiesData && (!policiesData.ok || policies.length === 0);

  React.useEffect(() => {
    if (policies.length > 0 && !policy) {
      setPolicy(policies[0].slug || policies[0].id);
    }
  }, [policies, policy]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = selectedFiles.filter(f => f.type === 'application/pdf');
      
      if (validFiles.length !== selectedFiles.length) {
        setError('Only PDF documents are accepted for industrial execution.');
      } else {
        setError(null);
      }

      if (mode === 'SINGLE') {
        setFiles([validFiles[0]].filter(Boolean));
      } else {
        setFiles(prev => [...prev, ...validFiles]);
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
    onClose();
  };

  const handleExecute = async () => {
    if (files.length === 0) return;
    
    setStatus('executing');
    setError(null);
    
    try {
      if (mode === 'SINGLE') {
        const formData = new FormData();
        formData.append('file', files[0]);
        formData.append('tenantId', tenantId || 'system');
        if (printhouseId) formData.append('printhouseId', printhouseId);
        formData.append('type', jobType);
        formData.append('policy', policy);

        const resData = await createAdminPreflightJob(formData);
        setResult({ job: resData.job || resData });
      } else {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('tenantId', tenantId || 'system');
        if (printhouseId) formData.append('printhouseId', printhouseId);
        formData.append('type', jobType);
        formData.append('policy', policy);

        const resData = await createAdminPreflightBatch(formData);
        setResult({ batch: resData.batch || resData });
      }
      
      setStatus('success');
      onSuccess();
    } catch (err: any) {
      console.error('[UPLOAD-MODAL] High-Fidelity Execution Error:', err);
      setError(err.message || err.statusText || 'Industrial Preflight execution failed upstream.');
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
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md" />
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
              <DialogPanel className="w-full max-w-3xl transform overflow-hidden rounded-none ppos-surface p-1 text-left align-middle shadow-2xl border ppos-border transition-all">
                <div className="ppos-surface rounded-none overflow-hidden">
                  {/* Header */}
                  <div className="px-8 py-6 flex items-center justify-between border-b ppos-border bg-slate-50/50 dark:bg-[#131314]/30">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-none bg-primary/10 flex items-center justify-center border border-primary/20">
                        {mode === 'SINGLE' ? <CloudArrowUpIcon className="w-6 h-6 text-primary" /> : <RectangleStackIcon className="w-6 h-6 text-primary" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <DialogTitle as="h3" className="text-xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight leading-tight">
                            Industrial Execution Trigger
                          </DialogTitle>
                          <div className="flex bg-slate-200/50 dark:bg-white/5 p-0.5 border ppos-border">
                            <button 
                              onClick={() => { setMode('SINGLE'); setFiles([]); }}
                              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${mode === 'SINGLE' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
                            >
                              Single Job
                            </button>
                            <button 
                              onClick={() => { setMode('BATCH'); setFiles([]); }}
                              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${mode === 'BATCH' ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'}`}
                            >
                              Batch Execution
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
                          Canonical V2 Engine Interface
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={resetAndClose}
                      className="w-10 h-10 rounded-none flex items-center justify-center hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all"
                    >
                      <XMarkIcon className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="px-8 py-8 space-y-8">
                    {status === 'success' ? (
                      <div className="py-12 flex flex-col items-center text-center animate-in zoom-in duration-500">
                        <div className="w-24 h-24 rounded-none bg-emerald-500/10 flex items-center justify-center mb-6 relative">
                          <CheckCircleIcon className="w-16 h-16 text-emerald-500" />
                          <div className="absolute inset-0 rounded-none border-4 border-emerald-500/20 animate-ping" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] mb-2">Execution Pipeline Initialized</h3>
                        <p className="text-slate-500 dark:text-zinc-400 max-w-sm mb-8 font-medium">
                          {mode === 'SINGLE' 
                            ? 'The document payload has been successfully dispatched to the persistent preflight node.'
                            : 'Batch documents have been propagated to the industrial queue array successfully.'}
                        </p>
                        <div className="px-6 py-4 rounded-none ppos-surface-muted border ppos-border w-full max-w-md mb-8 flex flex-col items-center">
                          <span className="text-[10px] font-black text-slate-400 uppercase block mb-1 tracking-widest">
                            {mode === 'SINGLE' ? 'Canonical Job ID' : 'Canonical Batch Identifier'}
                          </span>
                          <span className="font-mono text-primary font-bold text-base select-all">
                            {mode === 'SINGLE' ? String(result?.job?.jobId || result?.job?.id || 'N/A') : String(result?.batch?.id || result?.batch?.batchId || 'N/A')}
                          </span>
                        </div>
                        <button 
                          onClick={resetAndClose}
                          className="w-full max-w-xs py-4 bg-primary text-white rounded-none font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
                        >
                          Return to Console
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* File Dropzone */}
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
                                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                    {files.length} Document{files.length > 1 ? 's' : ''} Staged
                                  </span>
                                  <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-[11px] font-bold text-primary hover:underline"
                                  >
                                    + Add More
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
                              <div className="flex flex-col items-center py-4">
                                <div className="w-16 h-16 rounded-none ppos-surface-muted flex items-center justify-center mb-4 text-slate-300 dark:text-zinc-600 group-hover:text-primary transition-colors">
                                  {mode === 'SINGLE' ? <CloudArrowUpIcon className="w-10 h-10" /> : <RectangleStackIcon className="w-10 h-10" />}
                                </div>
                                <div className="text-base font-black text-slate-900 dark:text-[#ECECF1]">
                                  {mode === 'SINGLE' ? 'Click or drop PDF document to map payload' : 'Drop multiple PDF documents for array execution'}
                                </div>
                                <div className="text-xs font-bold text-slate-400 mt-1">
                                  Strict compliance enforcement • Zero mock data injection
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Configuration Grid */}
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-1">
                              Tenant Identity Context
                            </label>
                            <input 
                              type="text" 
                              value={tenantId}
                              onChange={(e) => setTenantId(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-4 py-3 text-sm font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20 outline-none"
                              placeholder="system"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-1">
                              Printhouse Scope (Optional)
                            </label>
                            <input 
                              type="text" 
                              value={printhouseId}
                              onChange={(e) => setPrinthouseId(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-4 py-3 text-sm font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-slate-300"
                              placeholder="e.g. ph_offset_berlin"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-1">
                              Strategy Execution Type
                            </label>
                            <select 
                              value={jobType}
                              onChange={(e) => setJobType(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-4 py-3 text-sm font-black text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
                            >
                              <option value="ANALYZE">ANALYZE ONLY</option>
                              <option value="AUTOFIX">AUTO-REPAIR</option>
                              <option value="CERTIFY">CERTIFICATION</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between ml-1">
                              <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
                                Compliance Governance Policy
                              </label>
                              {sourceStatus && sourceStatus !== 'LIVE_UPSTREAM' && (
                                <span className="text-[8px] font-black uppercase text-amber-500 tracking-tight block">
                                  Local Fallback
                                </span>
                              )}
                            </div>
                            <select 
                              value={policy}
                              onChange={(e) => setPolicy(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-4 py-3 text-sm font-black text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20 outline-none cursor-pointer"
                            >
                              {policies.length > 0 ? (
                                policies.map((p: any) => (
                                  <option key={p.slug || p.id} value={p.slug || p.id}>
                                    {p.name || p.slug}
                                  </option>
                                ))
                              ) : (
                                <option value="">No real policies available</option>
                              )}
                            </select>
                          </div>
                        </div>

                        {isPoliciesUnavailable && (
                          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-none flex items-start gap-3 text-red-500">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-black uppercase tracking-wider">Catalog Error</span>
                              <span className="text-xs font-bold opacity-90">
                                Real preflight policies are unavailable. Transformation is disabled until upstream policy catalog is restored.
                              </span>
                            </div>
                          </div>
                        )}

                        {error && (
                          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-none flex items-start gap-3 text-red-500 animate-in shake duration-300">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-black uppercase tracking-wider">Gateway Rejection</span>
                              <span className="text-xs font-bold opacity-90">{toDisplayText(error)}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  {status !== 'success' && (
                    <div className="px-8 py-5 ppos-surface-muted border-t ppos-border flex items-center justify-between">
                      <button 
                        disabled={status === 'executing'}
                        onClick={resetAndClose}
                        className="px-4 py-2 text-xs font-black text-slate-400 hover:text-slate-600 dark:hover:text-[#ECECF1] uppercase tracking-[0.2em] transition-all disabled:opacity-50"
                      >
                        Abort
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
                            <span>Propagating...</span>
                          </>
                        ) : (
                          <>
                            <CloudArrowUpIcon className="w-4 h-4" />
                            <span>{mode === 'SINGLE' ? 'Execute Job' : 'Execute Batch Array'}</span>
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
