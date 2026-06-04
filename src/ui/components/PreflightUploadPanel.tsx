import React, { useState, useRef, useEffect, DragEvent } from 'react';
import { 
  CloudArrowUpIcon, 
  DocumentIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  DocumentMagnifyingGlassIcon,
  ShieldCheckIcon,
  ArrowPathIcon
} from "@heroicons/react/24/outline";
import { 
  createAdminPreflightJob, 
  getAdminPreflightPolicies, 
  logAdminPreflightUiAudit 
} from "../lib/adminApi";
import { useAdminQuery } from "../hooks/useAdminData";
import { toDisplayText } from "../lib/display";

const checkMagicBytes = async (file: File): Promise<boolean> => {
  try {
    const buffer = await file.slice(0, 5).arrayBuffer();
    const view = new Uint8Array(buffer);
    return view.length >= 5 && view[0] === 37 && view[1] === 80 && view[2] === 68 && view[3] === 70 && view[4] === 45;
  } catch (e) {
    return false;
  }
};

export const PreflightUploadPanel: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [tenantId, setTenantId] = useState('system');
  const [jobType, setJobType] = useState('ANALYZE');
  const [policy, setPolicy] = useState('');
  
  const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const policiesQ = useAdminQuery('preflight:policies:admin', () => getAdminPreflightPolicies(), 60000);
  const policiesData: any = policiesQ.data;
  const policies = Array.isArray(policiesData?.policies) ? policiesData.policies : [];
  
  useEffect(() => {
    if (policies.length > 0 && !policy) {
      setPolicy(policies[0].id || policies[0].policy_id);
    }
  }, [policies, policy]);

  useEffect(() => {
    logAdminPreflightUiAudit({ event_type: 'PREFLIGHT_UPLOAD_PANEL_OPENED' }).catch(() => {});
  }, []);

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };
  
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };
  
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };
  
  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFileSelection(e.target.files[0]);
    }
  };

  const processFileSelection = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only standard PDF file streams are allowed.');
      logAdminPreflightUiAudit({ event_type: 'PREFLIGHT_UPLOAD_REJECTED', filename: selectedFile.name, file_size: selectedFile.size }).catch(() => {});
      return;
    }

    const isValidMagic = await checkMagicBytes(selectedFile);
    if (!isValidMagic) {
      setError(`Forensic Rejection: Document failed magic bytes check (%PDF- mismatch).`);
      logAdminPreflightUiAudit({ event_type: 'PREFLIGHT_UPLOAD_REJECTED', filename: selectedFile.name, file_size: selectedFile.size }).catch(() => {});
      return;
    }

    setError(null);
    setStatus('idle');
    setFile(selectedFile);
    logAdminPreflightUiAudit({ event_type: 'PREFLIGHT_FILE_SELECTED', filename: selectedFile.name, file_size: selectedFile.size }).catch(() => {});
  };

  const resetPanel = () => {
    setFile(null);
    setStatus('idle');
    setError(null);
  };

  const handleExecute = async () => {
    if (!file) return;
    
    setStatus('executing');
    setError(null);
    
    try {
      logAdminPreflightUiAudit({ 
        event_type: 'PREFLIGHT_JOB_SUBMITTED', 
        filename: file.name, 
        file_size: file.size, 
        execution_mode: jobType, 
        policy_id: policy 
      }).catch(() => {});

      const metadataBlock = {
        requestedBy: 'Industrial-Preflight-Control-Plane',
        executionStrategy: jobType,
        selectedPolicy: policy,
        clientValidation: 'MAGIC_BYTES_VERIFIED',
        createdAt: new Date().toISOString()
      };

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', tenantId || 'system');
      formData.append('type', jobType);
      formData.append('policy', policy);
      formData.append('metadata', JSON.stringify(metadataBlock));

      const customHeaders = {
        'X-Policy': policy,
        'X-Execution-Strategy': jobType
      };

      await createAdminPreflightJob(formData, customHeaders);
      
      setStatus('success');
      onSuccess();
      setTimeout(resetPanel, 3000);
    } catch (err: any) {
      setError(err?.error?.message || err?.message || err?.statusText || 'Industrial Preflight Gateway execution failed upstream.');
      setStatus('error');
    }
  };

  return (
    <div className="ppos-surface border ppos-border p-6 font-manrope">
      <div className="flex items-center gap-2 mb-6">
        <CloudArrowUpIcon className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-[#ECECF1]">
          Industrial Preflight Execution
        </h2>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Upload Dropzone */}
        <div 
          className={`
            flex-1 min-h-[200px] border-2 border-dashed rounded-none p-6 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center
            ${isDragActive ? 'border-primary bg-primary/5' : file ? 'border-emerald-500/40 bg-emerald-500/[0.02]' : 'ppos-border hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-white/5'}
          `}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="application/pdf"
            onChange={handleFileChange}
          />
          
          {file ? (
            <div className="flex flex-col items-center gap-3">
              <DocumentIcon className="w-12 h-12 text-emerald-500" />
              <div className="font-bold text-sm text-slate-800 dark:text-[#ECECF1] truncate max-w-[200px]">{file.name}</div>
              <div className="text-xs font-mono text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
              <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">Ready</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 pointer-events-none">
              <CloudArrowUpIcon className={`w-10 h-10 ${isDragActive ? 'text-primary' : 'text-slate-400'}`} />
              <div className="text-sm font-black text-slate-800 dark:text-white">Click or drag PDF payload block</div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Enforces Magic Byte Checks</div>
              <button 
                className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-[#ECECF1] text-xs font-black uppercase tracking-wider transition-colors pointer-events-auto"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Select PDF File
              </button>
            </div>
          )}
        </div>

        {/* Configuration Pane */}
        <div className="flex-1 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Tenant Isolation</label>
              <input 
                type="text" 
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full ppos-surface-muted border ppos-border px-3 py-2 text-xs font-mono font-bold text-slate-700 dark:text-white focus:ring-1 focus:ring-primary/30 outline-none"
                placeholder="system"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Policy Catalog</label>
              <select 
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
                className="w-full ppos-surface-muted border ppos-border px-3 py-2 text-xs font-black text-slate-700 dark:text-white focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer truncate"
              >
                {policies.length > 0 ? (
                  policies.map((p: any) => (
                    <option key={p.id || p.policy_id} value={p.id || p.policy_id}>
                      {p.name || p.id}
                    </option>
                  ))
                ) : (
                  <option value="">Unavailable</option>
                )}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Execution Mode</label>
            <div className="grid grid-cols-1 gap-2">
              <div 
                className={`p-3 border ppos-border flex items-start gap-3 cursor-pointer transition-all ${jobType === 'ANALYZE' ? 'border-primary bg-primary/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                onClick={() => setJobType('ANALYZE')}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${jobType === 'ANALYZE' ? 'border-primary' : 'border-slate-300'}`}>
                  {jobType === 'ANALYZE' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-slate-800 dark:text-white">Analyze Only</div>
                  <div className="text-[10px] text-slate-500">Checks the PDF and produces diagnostics. It may not produce a corrected PDF.</div>
                </div>
              </div>
              
              <div 
                className={`p-3 border ppos-border flex items-start gap-3 cursor-pointer transition-all ${jobType === 'AUTOFIX' ? 'border-primary bg-primary/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                onClick={() => setJobType('AUTOFIX')}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${jobType === 'AUTOFIX' ? 'border-primary' : 'border-slate-300'}`}>
                  {jobType === 'AUTOFIX' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-slate-800 dark:text-white">Autofix</div>
                  <div className="text-[10px] text-slate-500">Attempts to repair the PDF and should produce a Fixed PDF when successful.</div>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold flex gap-2 items-start">
              <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
              <span>{toDisplayText(error)}</span>
            </div>
          )}

          <button 
            disabled={!file || !policy || status === 'executing' || status === 'success'}
            onClick={handleExecute}
            className={`
              w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition-all shadow-md
              ${status === 'success' ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-primary shadow-primary/20'}
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
          >
            {status === 'executing' ? (
              <><ArrowPathIcon className="w-4 h-4 animate-spin" /><span>Processing</span></>
            ) : status === 'success' ? (
              <><CheckCircleIcon className="w-4 h-4" /><span>Dispatched Successfully</span></>
            ) : (
              <span>Execute Preflight Job</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
