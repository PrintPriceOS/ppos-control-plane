import React, { useState, useRef } from 'react';
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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="glass w-full max-w-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] border border-white/20 dark:border-white/10 overflow-hidden flex flex-col transform transition-all scale-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <CloudArrowUpIcon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-[#ECECF1] tracking-tight italic-text-off">Trigger New Job</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            <XMarkIcon className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {status === 'success' ? (
            <div className="text-center py-8 space-y-4">
              <CheckCircleIcon className="w-16 h-16 text-emerald-500 mx-auto" />
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-[#ECECF1]">Job Created Successfully</h3>
                <p className="text-sm text-slate-500 font-medium">Job ID: <span className="font-mono text-primary">#{result?.job?.id?.slice(0, 8)}</span></p>
              </div>
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-opacity"
              >
                Close & View Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* File Dropzone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all
                  ${file ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-white/10 hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-white/[0.02]'}
                `}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="application/pdf"
                  onChange={handleFileChange}
                />
                {file ? (
                  <div className="space-y-2">
                    <DocumentIcon className="w-12 h-12 text-primary mx-auto" />
                    <div className="text-sm font-bold text-slate-700 dark:text-[#ECECF1] truncate max-w-xs mx-auto">
                      {file.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • PDF Document
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <CloudArrowUpIcon className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto" />
                    <div className="text-sm font-bold text-slate-500">Click or drag PDF here to upload</div>
                    <div className="text-xs text-slate-400">Maximum size: 2 GB</div>
                  </div>
                )}
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-2 gap-4 italic-text-off">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tenant Identity</label>
                  <input 
                    type="text" 
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="system, or tenant_id..."
                    className="w-full bg-slate-50 dark:bg-white/[0.03] border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Job Type</label>
                  <select 
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/[0.03] border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="ANALYZE">ANALYZE</option>
                    <option value="AUTOFIX">AUTOFIX</option>
                    <option value="CERTIFY">CERTIFY</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Policy / Profile</label>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-black uppercase tracking-tighter border border-primary/20">
                      BFF Policy Enforcement Active
                    </span>
                  </div>
                  <select 
                    value={policy}
                    onChange={(e) => setPolicy(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/[0.03] border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-[#ECECF1] focus:ring-2 focus:ring-primary/20"
                  >
                    {policies.length > 0 ? (
                      policies.map((p: any) => (
                        <option key={p.slug || p.id} value={p.slug || p.id}>
                          {p.name} ({p.slug || p.id})
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
                  <p className="text-[10px] text-slate-400 ml-1 font-medium italic-text-off">
                    Select a standardized profile. Governance rules will be applied during analysis.
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-center gap-2 text-red-600 dark:text-red-400 italic-text-off">
                  <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-xs font-bold">{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {status !== 'success' && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 italic-text-off">
            <button 
              disabled={status !== 'idle' && status !== 'error'}
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-[#ECECF1] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              disabled={!file || (status !== 'idle' && status !== 'error')}
              onClick={handleUpload}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:grayscale"
            >
              {(status === 'uploading' || status === 'creating_job') ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  <span>{status === 'uploading' ? 'Uploading...' : 'Finalizing...'}</span>
                </>
              ) : (
                <>
                  <CloudArrowUpIcon className="w-5 h-5" />
                  <span>Execute Job</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
