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
  ArrowPathIcon
} from "@heroicons/react/24/outline";
import { uploadPreflightFile, createPreflightJob, getGlobalPolicies } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { toDisplayText } from "../../lib/display";

interface PreflightUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PreflightUploadModal: React.FC<PreflightUploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [tenantId, setTenantId] = useState('system');
  const [jobType, setJobType] = useState('ANALYZE');
  const [policy, setPolicy] = useState('OFFSET_MODERN_COATED');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'creating_job' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const policiesQ = useAdminQuery('preflight:policies:global', () => getGlobalPolicies(), 60000);
  const policies = policiesQ.data?.policies || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type !== 'application/pdf') {
        setError('Only PDF files are allowed');
        return;
      }
      setFile(selected);
      setError(null);
    }
  };

  const resetAndClose = () => {
    setFile(null);
    setStatus('idle');
    setError(null);
    setResult(null);
    onClose();
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setStatus('uploading');
    setError(null);
    
    try {
      // 1. Upload file
      const upload = await uploadPreflightFile(file, tenantId);
      
      // 2. Create job
      setStatus('creating_job');
      const job = await createPreflightJob({
        uploadId: upload.id,
        type: jobType,
        policy,
        tenantId
      });
      
      setResult({ upload, job });
      setStatus('success');
      onSuccess();
    } catch (err: any) {
      console.error('[UPLOAD-MODAL] Error:', err);
      setError(err.message || 'Operation failed');
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
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
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
              <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-none ppos-surface p-1 text-left align-middle shadow-none border ppos-border transition-all">
                <div className="ppos-surface rounded-none overflow-hidden">
                  {/* Header */}
                  <div className="px-8 py-6 flex items-center justify-between border-b ppos-border">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-none bg-primary/10 flex items-center justify-center border border-primary/20">
                        <CloudArrowUpIcon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <DialogTitle as="h3" className="text-xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight leading-tight">
                          Trigger New Job
                        </DialogTitle>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-0.5">
                          Industrial Preflight Engine
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
                        <h3 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] mb-2">Job Successfully Initialized</h3>
                        <p className="text-slate-500 dark:text-zinc-400 max-w-sm mb-8">
                          Your document has been registered. The intelligence layer is now processing the telemetry.
                        </p>
                        <div className="px-6 py-4 rounded-none ppos-surface-muted border ppos-border w-full max-w-xs mb-8">
                          <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Generated Job ID</span>
                          <span className="font-mono text-primary font-bold text-lg select-all">#{String(result?.job?.id || '').slice(0, 12)}</span>
                        </div>
                        <button 
                          onClick={resetAndClose}
                          className="w-full max-w-xs py-4 bg-primary text-white rounded-none font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all active:scale-95"
                        >
                          View Live Pipeline
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* File Dropzone */}
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className={`
                            group relative border-2 border-dashed rounded-none p-10 text-center cursor-pointer transition-all duration-300
                            ${file 
                              ? 'border-primary bg-primary/[0.02] shadow-[0_0_40px_-10px_rgba(var(--primary-rgb),0.1)]' 
                              : 'ppos-border hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-white/5'}
                          `}
                        >
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="application/pdf"
                            onChange={handleFileChange}
                          />
                          
                          <div className="flex flex-col items-center">
                            {file ? (
                              <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2">
                                <div className="w-16 h-16 rounded-none bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                  <DocumentIcon className="w-8 h-8 text-primary" />
                                </div>
                                <div className="text-base font-black text-slate-800 dark:text-[#ECECF1] truncate max-w-[300px]">
                                  {file.name}
                                </div>
                                <div className="text-xs font-bold text-primary mt-1 px-3 py-1 bg-primary/10 rounded-none">
                                  {(file.size / (1024 * 1024)).toFixed(2)} MB • READY
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <div className="w-16 h-16 rounded-none ppos-surface-muted flex items-center justify-center mb-4 text-slate-300 dark:text-zinc-600 group-hover:text-primary transition-colors">
                                  <CloudArrowUpIcon className="w-10 h-10" />
                                </div>
                                <div className="text-base font-black text-slate-900 dark:text-[#ECECF1]">
                                  Click or drop PDF to begin
                                </div>
                                <div className="text-xs font-bold text-slate-400 mt-1">
                                  Maximum industrial payload: 2 GB
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Configuration Grid */}
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-1">
                              Tenant Identity
                            </label>
                            <div className="relative group">
                              <input 
                                type="text" 
                                value={tenantId}
                                onChange={(e) => setTenantId(e.target.value)}
                                className="w-full ppos-surface-muted border ppos-border rounded-none px-5 py-4 text-sm font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-4 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none"
                                placeholder="system"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] ml-1">
                              Strategy Type
                            </label>
                            <select 
                              value={jobType}
                              onChange={(e) => setJobType(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-5 py-4 text-sm font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-4 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none appearance-none cursor-pointer"
                            >
                              <option value="ANALYZE">ANALYZE ONLY</option>
                              <option value="AUTOFIX">AUTO-REPAIR</option>
                              <option value="CERTIFY">CERTIFICATION</option>
                            </select>
                          </div>

                          <div className="col-span-2 space-y-2">
                            <div className="flex items-center justify-between ml-1">
                              <label className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
                                Compliance Policy / Profile
                              </label>
                              <div className="flex items-center gap-1.5 px-2 py-1 rounded-none bg-primary/10 border border-primary/20">
                                <div className="w-1 h-1 rounded-none bg-primary animate-pulse" />
                                <span className="text-[8px] font-black text-primary uppercase tracking-tight">Active Governance</span>
                              </div>
                            </div>
                            <select 
                              value={policy}
                              onChange={(e) => setPolicy(e.target.value)}
                              className="w-full ppos-surface-muted border ppos-border rounded-none px-5 py-4 text-sm font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-4 focus:ring-primary/10 focus:border-primary/30 transition-all outline-none appearance-none cursor-pointer"
                            >
                              {policies.length > 0 ? (
                                policies.map((p: any) => (
                                  <option key={p.slug || p.id} value={p.slug || p.id}>
                                    {p.name}
                                  </option>
                                ))
                              ) : (
                                <>
                                  <option value="OFFSET_MODERN_COATED">Offset Modern Coated (ISO Coated v2)</option>
                                  <option value="DIGITAL_STANDARD">Digital Standard (sRGB)</option>
                                  <option value="ISO_NEWSPAPER">ISO Newspaper</option>
                                </>
                              )}
                            </select>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-500 ml-1 font-bold">
                              Policy rules determine the auto-repair strategy and structural validation thresholds.
                            </p>
                          </div>
                        </div>

                        {error && (
                          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-none flex items-start gap-3 text-red-500 animate-in shake duration-300">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-black uppercase tracking-wider">Initialization Error</span>
                              <span className="text-xs font-bold opacity-90">{toDisplayText(error)}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Footer */}
                  {status !== 'success' && (
                    <div className="px-8 py-6 ppos-surface-muted border-t ppos-border flex items-center justify-between">
                      <button 
                        disabled={status !== 'idle' && status !== 'error'}
                        onClick={resetAndClose}
                        className="px-6 py-3 text-xs font-black text-slate-400 hover:text-slate-600 dark:hover:text-[#ECECF1] uppercase tracking-[0.2em] transition-all disabled:opacity-50"
                      >
                        Abort Operation
                      </button>
                      
                      <div className="flex items-center gap-4">
                        <button 
                          disabled={!file || (status !== 'idle' && status !== 'error')}
                          onClick={handleUpload}
                          className={`
                            relative overflow-hidden group flex items-center gap-3 px-10 py-4 bg-primary text-white rounded-none font-black text-sm
                            shadow-[0_12px_24px_-8px_rgba(var(--primary-rgb),0.5)] transition-all
                            hover:shadow-[0_20px_32px_-10px_rgba(var(--primary-rgb),0.6)] hover:-translate-y-1 active:scale-95
                            disabled:opacity-30 disabled:grayscale disabled:hover:translate-y-0
                          `}
                        >
                          {(status === 'uploading' || status === 'creating_job') ? (
                            <>
                              <ArrowPathIcon className="w-5 h-5 animate-spin" />
                              <span className="uppercase tracking-widest">Processing...</span>
                            </>
                          ) : (
                            <>
                              <CloudArrowUpIcon className="w-5 h-5" />
                              <span className="uppercase tracking-widest">Execute Job</span>
                            </>
                          )}
                          <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]" />
                        </button>
                      </div>
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

