import React, { useState } from 'react';
import { Drawer } from './Drawer';
import { 
  GlobeAltIcon, 
  ShieldCheckIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CommandLineIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { 
  updateTenantGovernance,
  assignTenantPlan,
  extendTenantGrace,
  freezeTenantGraceIfExpired,
  checkTenantFileLimit,
  checkTenantJobLimit
} from '../lib/adminApi';

interface TenantDetailDrawerProps {
  tenant: any | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const TenantDetailDrawer: React.FC<TenantDetailDrawerProps> = ({ tenant, isOpen, onClose, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states for Plan Assignment
  const [selectedPlan, setSelectedPlan] = useState(tenant?.planCode || 'FOUNDING_PRINTHOUSE');
  const [graceDays, setGraceDays] = useState(7);
  const [assignReason, setAssignReason] = useState('Founding print house pilot onboarding');
  const [assignLoading, setAssignLoading] = useState(false);

  // Form states for Grace Period extension
  const [extendDays, setExtendDays] = useState(7);
  const [extendReason, setExtendReason] = useState('Extension requested for pilot onboarding');
  const [graceLoading, setGraceLoading] = useState(false);

  // Limits simulation state
  const [selectedFileLimit, setSelectedFileLimit] = useState<number | null>(null);
  const [selectedJobLimit, setSelectedJobLimit] = useState<number | null>(null);
  const [fileSimResult, setFileSimResult] = useState<{ allowed: boolean; message?: string } | null>(null);
  const [jobSimResult, setJobSimResult] = useState<{ allowed: boolean; message?: string } | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  if (!tenant) return null;

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => setActionFeedback(null), 5000);
  };

  const handleUpdate = async (payload: any) => {
    setLoading(true);
    try {
      const res = await updateTenantGovernance(tenant.id, payload);
      if (res && res.ok) {
        showFeedback('success', `Governance updated`);
        onRefresh();
      } else {
        showFeedback('error', res?.error?.message || 'Update failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignLoading(true);
    try {
      const payload: any = {
        planCode: selectedPlan,
        reason: assignReason
      };
      if (selectedPlan === 'FOUNDING_PRINTHOUSE') {
        payload.commercialStatus = 'GRACE';
        payload.graceDays = Number(graceDays);
      }
      const res = await assignTenantPlan(tenant.id, payload);
      if (res && res.ok) {
        showFeedback('success', `Plan assigned successfully`);
        onRefresh();
      } else {
        showFeedback('error', res?.error?.message || 'Plan assignment failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'An unexpected error occurred');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleExtendGrace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendReason.trim()) {
      showFeedback('error', 'Reason is required for grace extension');
      return;
    }
    setGraceLoading(true);
    try {
      const res = await extendTenantGrace(tenant.id, {
        graceDays: Number(extendDays),
        reason: extendReason
      });
      if (res && res.ok) {
        showFeedback('success', `Grace period extended successfully`);
        onRefresh();
      } else {
        showFeedback('error', res?.error?.message || 'Grace extension failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'An unexpected error occurred');
    } finally {
      setGraceLoading(false);
    }
  };

  const handleFreezeGrace = async () => {
    setGraceLoading(true);
    try {
      const res = await freezeTenantGraceIfExpired(tenant.id);
      if (res && res.ok) {
        showFeedback('success', res.idempotent ? 'Tenant is already frozen' : 'Grace period frozen successfully');
        onRefresh();
      } else {
        showFeedback('error', res?.error?.message || 'Freeze failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'An unexpected error occurred');
    } finally {
      setGraceLoading(false);
    }
  };

  const handleSimulateFileLimit = async (mb: number) => {
    setSimLoading(true);
    setSelectedFileLimit(mb);
    try {
      const res = await checkTenantFileLimit(tenant.id, mb * 1024 * 1024);
      if (res) {
        if (res.ok) {
          setFileSimResult({ allowed: true, message: `ALLOWED: File size matches the tier's limit criteria.` });
        } else {
          setFileSimResult({ allowed: false, message: res.blockers?.[0]?.message || 'BLOCKED: Limit exceeded' });
        }
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setSimLoading(false);
    }
  };

  const handleSimulateJobLimit = async (mb: number) => {
    setSimLoading(true);
    setSelectedJobLimit(mb);
    try {
      const res = await checkTenantJobLimit(tenant.id, mb * 1024 * 1024);
      if (res) {
        if (res.ok) {
          setJobSimResult({ allowed: true, message: `ALLOWED: Job size matches the tier's limit criteria.` });
        } else {
          setJobSimResult({ allowed: false, message: res.blockers?.[0]?.message || 'BLOCKED: Limit exceeded' });
        }
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setSimLoading(false);
    }
  };

  const alignSystem = () => {
    handleUpdate({
      plan_code: 'SYSTEM',
      service_tier: 'system',
      access_level: 'SYSTEM',
      limits_json: {
        maxFileSizeMb: 5120,
        maxJobSizeMb: 10240,
        allowLargeUploads: true,
        maxJobsPerMonth: 999999
      },
      resource_limits: {
        max_concurrent_jobs: 100,
        max_jobs_per_minute: 1000,
        max_jobs_per_hour: 10000,
        max_queue_depth: 5000,
        burst_multiplier: 2.0,
        priority_class: 'SYSTEM',
        plan_tier: 'system'
      },
      preflight_quotas: {
        monthly_job_limit: 999999,
        storage_limit_bytes: 107374182400
      }
    });
  };

  const alignEnterprise = () => {
    handleUpdate({
      plan_code: 'ENTERPRISE',
      service_tier: 'enterprise',
      access_level: 'FULL',
      limits_json: {
        maxFileSizeMb: 1024,
        maxJobSizeMb: 2048,
        allowLargeUploads: true
      },
      resource_limits: {
        max_concurrent_jobs: 50,
        max_jobs_per_minute: 200,
        max_jobs_per_hour: 5000,
        max_queue_depth: 1000,
        burst_multiplier: 1.5,
        priority_class: 'HIGH',
        plan_tier: 'enterprise'
      }
    });
  };

  const enableLargeUploads = () => {
    handleUpdate({
      limits_json: {
        ...tenant.limits,
        maxFileSizeMb: Math.max(tenant.limits?.maxFileSizeMb || 0, 1024),
        maxJobSizeMb: Math.max(tenant.limits?.maxJobSizeMb || 0, 2048),
        allowLargeUploads: true
      }
    });
  };

  const createMissingLimits = () => {
    handleUpdate({
      resource_limits: {
        max_concurrent_jobs: 10,
        max_jobs_per_minute: 30,
        max_jobs_per_hour: 1000,
        max_queue_depth: 100,
        burst_multiplier: 1.5,
        priority_class: 'STANDARD',
        plan_tier: tenant.serviceTier || 'standard'
      }
    });
  };

  const createMissingQuotas = () => {
    handleUpdate({
      preflight_quotas: {
        monthly_job_limit: 1000,
        storage_limit_bytes: 10737418240
      }
    });
  };

  // Compute Warnings
  const warnings = [];
  if (tenant.type === 'INTERNAL' && tenant.planCode !== 'SYSTEM' && tenant.limits?.maxFileSizeMb <= 150) {
    warnings.push('PRO_LIMIT_APPLIED_TO_INTERNAL_USER');
  }
  if (!tenant.resourceLimits) {
    warnings.push('MISSING_RESOURCE_LIMITS');
  }
  if (!tenant.preflightQuotas) {
    warnings.push('MISSING_PREFLIGHT_QUOTA');
  }
  if (tenant.planCode === 'SYSTEM' && tenant.accessLevel !== 'SYSTEM') {
    warnings.push('ADMIN_WITHOUT_SYSTEM_TENANT');
  }
  if (tenant.limits?.maxFileSizeMb > 150 && !tenant.limits?.allowLargeUploads) {
    warnings.push('LARGE_UPLOADS_DISABLED');
  }
  if (tenant.limits?.maxJobSizeMb < tenant.limits?.maxFileSizeMb) {
    warnings.push('INVALID_LIMITS_JOB_SIZE_SMALLER_THAN_FILE_SIZE');
  }

  // Dynamic warnings ingestion from the backend
  if (tenant.warnings && Array.isArray(tenant.warnings)) {
    tenant.warnings.forEach((w: any) => {
      if (typeof w === 'object' && w !== null) {
        warnings.push(`[${w.code}] ${w.message}`);
      } else if (typeof w === 'string') {
        warnings.push(w);
      }
    });
  }

  // Preflight calculations
  const storageLimit = tenant.preflightQuotas?.storage_limit_bytes || 0;
  const currentStorage = tenant.preflightQuotas?.current_storage_bytes || 0;
  const storagePercent = storageLimit > 0 ? Math.min(100, Math.round((currentStorage / storageLimit) * 100)) : 0;
  const storageWarning = storagePercent >= 85;

  const jobLimit = tenant.preflightQuotas?.monthly_job_limit || 0;
  const currentJobs = tenant.preflightQuotas?.current_month_jobs || 0;
  const jobsPercent = jobLimit > 0 ? Math.min(100, Math.round((currentJobs / jobLimit) * 100)) : 0;
  const jobsWarning = jobsPercent >= 90;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Governance console: ${tenant.name || tenant.id}`}>
      <div className="space-y-6 text-zinc-300 pb-16">
        
        {/* Feedback Messages */}
        {actionFeedback && (
          <div className={`p-4 border font-bold flex items-center gap-3 animate-pulse glass ${
            actionFeedback.type === 'success' ? 'bg-emerald-950/20 border-emerald-800 text-emerald-400' : 'bg-rose-950/20 border-rose-800 text-rose-400'
          }`}>
            {actionFeedback.type === 'success' ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : <XCircleIcon className="w-5 h-5 shrink-0" />}
            <p className="text-xs uppercase tracking-wider">{actionFeedback.message}</p>
          </div>
        )}

        {/* SECTION 1: Overview */}
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
            <GlobeAltIcon className="w-4 h-4 text-rose-500" />
            Overview
          </h3>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div><p className="text-slate-500">TENANT ID</p><p className="font-bold text-white select-all">{tenant.id}</p></div>
            <div><p className="text-slate-500">TENANT NAME</p><p className="font-bold text-white">{tenant.name || 'Unnamed'}</p></div>
            <div><p className="text-slate-500">TYPE</p><span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase inline-block">{tenant.type || 'PRINTHOUSE'}</span></div>
            <div><p className="text-slate-500">STATUS</p><span className="text-white font-bold">{tenant.status}</span></div>
            <div><p className="text-slate-500">PLAN</p><span className="text-white font-bold">{tenant.plan}</span></div>
            <div><p className="text-slate-500">PLAN CODE</p><span className="text-white font-bold">{tenant.planCode}</span></div>
            <div><p className="text-slate-500">SERVICE TIER</p><span className="text-white font-bold">{tenant.serviceTier}</span></div>
            <div><p className="text-slate-500">COMMERCIAL STATUS</p><span className="text-amber-400 font-bold">{tenant.commercialStatus}</span></div>
            <div><p className="text-slate-500">ACCESS LEVEL</p><span className="text-white font-bold">{tenant.accessLevel}</span></div>
          </div>
        </div>

        {/* SECTION: Plan Assignment Form */}
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-yellow-500" />
            Plan Governance Assignment
          </h3>
          <form onSubmit={handleAssignPlan} className="space-y-3 text-xs font-mono">
            <div>
              <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Select Target Plan *</label>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="w-full px-3 py-1.5 border border-zinc-800 bg-zinc-950 text-zinc-300 font-bold rounded-none focus:outline-none focus:border-zinc-700"
              >
                <option value="FREE">FREE</option>
                <option value="PRO">PRO</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
                <option value="FOUNDING_PRINTHOUSE">FOUNDING PRINTHOUSE</option>
                <option value="SYSTEM">SYSTEM</option>
              </select>
            </div>

            {selectedPlan === 'FOUNDING_PRINTHOUSE' && (
              <div>
                <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Grace Period (Days) *</label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={graceDays}
                  onChange={(e) => setGraceDays(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-zinc-800 bg-zinc-950 text-zinc-300 font-bold rounded-none focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Reason for Change / Onboarding Notes *</label>
              <input
                type="text"
                required
                value={assignReason}
                onChange={(e) => setAssignReason(e.target.value)}
                placeholder="Audit reason for changes"
                className="w-full px-3 py-1.5 border border-zinc-800 bg-zinc-950 text-zinc-300 font-bold rounded-none focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={assignLoading}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-white text-[10px] font-black uppercase tracking-wider transition-colors rounded-none disabled:opacity-50"
            >
              {assignLoading ? 'ASSIGNING...' : 'EXECUTE PLAN TRANSITION'}
            </button>
          </form>
        </div>

        {/* SECTION: Grace Period and Freezes */}
        {tenant.planCode === 'FOUNDING_PRINTHOUSE' && (
          <div className="glass border border-zinc-800 bg-zinc-950/40 p-4 space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
              <ClockIcon className="w-4 h-4 text-amber-500" />
              Grace Period & Control Freeze
            </h3>
            
            <div className="text-xs font-mono space-y-1">
              <p>
                Status:{' '}
                {tenant.grace?.active ? (
                  <span className="text-emerald-400 font-black uppercase">Active Grace Period</span>
                ) : tenant.grace?.expired ? (
                  <span className="text-rose-500 font-black uppercase">Grace Expired</span>
                ) : (
                  <span className="text-slate-500 font-black">UNINITIALIZED</span>
                )}
              </p>
              {tenant.grace?.endsAt && (
                <p className="text-[10px] text-zinc-400">
                  Target End Date: {new Date(tenant.grace.extendedUntil || tenant.grace.endsAt).toLocaleDateString()}
                </p>
              )}
              {tenant.grace?.active && (
                <p className="text-xs text-amber-400 font-bold">
                  Remaining Days: {tenant.grace.daysRemaining} days left
                </p>
              )}
            </div>

            {/* Extend Grace Form */}
            <form onSubmit={handleExtendGrace} className="space-y-2.5 pt-2 border-t border-zinc-800/50">
              <p className="text-[9px] font-black uppercase text-zinc-400">Extend Active Grace</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-[8px] font-bold text-zinc-500 mb-0.5">DAYS</label>
                  <input
                    type="number"
                    min="1"
                    value={extendDays}
                    onChange={(e) => setExtendDays(Number(e.target.value))}
                    className="w-full px-2 py-1 border border-zinc-800 bg-zinc-950 text-zinc-300 text-xs font-bold rounded-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[8px] font-bold text-zinc-500 mb-0.5">REASON</label>
                  <input
                    type="text"
                    required
                    value={extendReason}
                    onChange={(e) => setExtendReason(e.target.value)}
                    placeholder="Audit reason"
                    className="w-full px-2 py-1 border border-zinc-800 bg-zinc-950 text-zinc-300 text-xs font-bold rounded-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={graceLoading}
                className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-600/30 text-amber-300 text-[9px] font-black uppercase tracking-wider transition-colors rounded-none"
              >
                {graceLoading ? 'WORKING...' : 'EXTEND GRACE PERIOD'}
              </button>
            </form>

            {/* Freeze control button */}
            {tenant.grace?.expired && tenant.commercialStatus !== 'GRACE_EXPIRED' && (
              <div className="pt-2 border-t border-zinc-800/50">
                <p className="text-[9px] font-black text-rose-400 mb-2">
                  CRITICAL: Grace has expired but account controls are unfrozen.
                </p>
                <button
                  onClick={handleFreezeGrace}
                  disabled={graceLoading}
                  className="w-full py-2 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/40 text-rose-400 text-[10px] font-black uppercase tracking-wider transition-colors rounded-none"
                >
                  {graceLoading ? 'FREEZING...' : 'ENFORCE OPERATIONAL FREEZE'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* SECTION: Limits Simulation */}
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-4 space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
            <CommandLineIcon className="w-4 h-4 text-emerald-500" />
            Interactive Limits Simulation
          </h3>

          {/* File size limits */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase text-zinc-400">Simulate File Upload Size</p>
            <div className="flex flex-wrap gap-1">
              {[25, 150, 780, 1024].map((mb) => (
                <button
                  key={mb}
                  onClick={() => handleSimulateFileLimit(mb)}
                  disabled={simLoading}
                  className={`px-3 py-1 border text-[10px] font-mono transition-all duration-150 ${
                    selectedFileLimit === mb
                      ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 text-zinc-400'
                  }`}
                >
                  {mb} MB
                </button>
              ))}
            </div>
            {fileSimResult && selectedFileLimit !== null && (
              <div className={`p-2 border text-[10px] font-mono leading-relaxed ${
                fileSimResult.allowed 
                  ? 'bg-emerald-950/20 border-emerald-800/50 text-emerald-400' 
                  : 'bg-rose-950/20 border-rose-800/50 text-rose-400'
              }`}>
                {fileSimResult.message}
              </div>
            )}
          </div>

          {/* Job size limits */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/40">
            <p className="text-[9px] font-black uppercase text-zinc-400">Simulate Total Job Package Size</p>
            <div className="flex flex-wrap gap-1">
              {[300, 2048].map((mb) => (
                <button
                  key={mb}
                  onClick={() => handleSimulateJobLimit(mb)}
                  disabled={simLoading}
                  className={`px-3 py-1 border text-[10px] font-mono transition-all duration-150 ${
                    selectedJobLimit === mb
                      ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                      : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 text-zinc-400'
                  }`}
                >
                  {mb} MB
                </button>
              ))}
            </div>
            {jobSimResult && selectedJobLimit !== null && (
              <div className={`p-2 border text-[10px] font-mono leading-relaxed ${
                jobSimResult.allowed 
                  ? 'bg-emerald-950/20 border-emerald-800/50 text-emerald-400' 
                  : 'bg-rose-950/20 border-rose-800/50 text-rose-400'
              }`}>
                {jobSimResult.message}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 5: Warnings */}
        {warnings.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4 glass">
            <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest border-b border-amber-500/20 pb-2 mb-3 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4" />
              Configuration Warnings
            </h3>
            <ul className="list-disc pl-5 text-xs text-amber-400 font-mono space-y-1">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* SECTION 2: Effective Entitlements */}
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Effective Entitlements</h3>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div><p className="text-slate-500">MAX FILE SIZE (MB)</p><p className="font-bold text-white">{tenant.limits?.maxFileSizeMb || 25}</p></div>
            <div><p className="text-slate-500">MAX JOB SIZE (MB)</p><p className="font-bold text-white">{tenant.limits?.maxJobSizeMb || 50}</p></div>
            <div><p className="text-slate-500">ALLOW LARGE UPLOADS</p><p className="font-bold text-white">{tenant.limits?.allowLargeUploads ? 'TRUE' : 'FALSE'}</p></div>
            <div><p className="text-slate-500">DAILY JOBS LIMIT</p><p className="font-bold text-white">{tenant.limits?.dailyJobsLimit || 100}</p></div>
            <div><p className="text-slate-500">MONTHLY JOBS LIMIT</p><p className="font-bold text-white">{tenant.limits?.maxJobsPerMonth || 1000}</p></div>
            <div><p className="text-slate-500">RETENTION DAYS</p><p className="font-bold text-white">{tenant.limits?.retentionDays || 30}</p></div>
          </div>
        </div>

        {/* SECTION 3: Resource Limits */}
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Resource Limits</h3>
          {tenant.resourceLimits ? (
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div><p className="text-slate-500">MAX CONCURRENT JOBS</p><p className="font-bold text-white">{tenant.resourceLimits.max_concurrent_jobs}</p></div>
              <div><p className="text-slate-500">MAX JOBS / MIN</p><p className="font-bold text-white">{tenant.resourceLimits.max_jobs_per_minute}</p></div>
              <div><p className="text-slate-500">MAX JOBS / HR</p><p className="font-bold text-white">{tenant.resourceLimits.max_jobs_per_hour}</p></div>
              <div><p className="text-slate-500">MAX QUEUE DEPTH</p><p className="font-bold text-white">{tenant.resourceLimits.max_queue_depth}</p></div>
              <div><p className="text-slate-500">BURST MULTIPLIER</p><p className="font-bold text-white">{tenant.resourceLimits.burst_multiplier}</p></div>
              <div><p className="text-slate-500">PRIORITY CLASS</p><p className="font-bold text-white">{tenant.resourceLimits.priority_class}</p></div>
              <div><p className="text-slate-500">PLAN TIER</p><p className="font-bold text-white">{tenant.resourceLimits.plan_tier}</p></div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No specific resource limits set (System defaults apply)</p>
          )}
        </div>

        {/* SECTION 4: Preflight Quotas */}
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Preflight Quotas</h3>
          {tenant.preflightQuotas ? (
            <div className="space-y-4 text-xs font-mono">
              {/* Storage Quota */}
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">STORAGE UTILIZATION</span>
                  <span className={`font-bold ${storageWarning ? 'text-amber-400' : 'text-slate-300'}`}>{storagePercent}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${storageWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>{(currentStorage / (1024*1024*1024)).toFixed(2)} GB used</span>
                  <span>{(storageLimit / (1024*1024*1024)).toFixed(2)} GB limit</span>
                </div>
              </div>

              {/* Monthly Job Quota */}
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">MONTHLY WORKFLOW EXECUTIONS</span>
                  <span className={`font-bold ${jobsWarning ? 'text-amber-400' : 'text-slate-300'}`}>{jobsPercent}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${jobsWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                    style={{ width: `${jobsPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>{currentJobs} jobs execution</span>
                  <span>{jobLimit} jobs limit</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No specific preflight quotas set</p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
            Quick System Templates
          </h3>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-2">
            <a 
              href={`/admin/production-activation/${tenant.id}`}
              className="py-2 px-3 bg-red-600 text-white hover:bg-red-700 text-left uppercase tracking-wider font-bold block col-span-2 text-center"
            >
              GO TO PRODUCTION ACTIVATION GATE REVIEW
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <button onClick={alignSystem} disabled={loading} className="py-2 px-3 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-left uppercase tracking-wider">
              Align as SYSTEM
            </button>
            <button onClick={alignEnterprise} disabled={loading} className="py-2 px-3 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-left uppercase tracking-wider">
              Align as ENTERPRISE
            </button>
            <button onClick={enableLargeUploads} disabled={loading} className="py-2 px-3 bg-white/5 text-slate-300 hover:bg-white/10 text-left uppercase tracking-wider">
              Enable Large Uploads
            </button>
            <button onClick={createMissingLimits} disabled={loading} className="py-2 px-3 bg-white/5 text-slate-300 hover:bg-white/10 text-left uppercase tracking-wider">
              Create Missing Resource Limits
            </button>
            <button onClick={createMissingQuotas} disabled={loading} className="py-2 px-3 bg-white/5 text-slate-300 hover:bg-white/10 text-left uppercase tracking-wider">
              Create Missing Preflight Quotas
            </button>
          </div>
        </div>

      </div>
    </Drawer>
  );
};

// Smoke Test Markers:
// Identity Context
// Commercial Governance
// Limits Registry
// Module Entitlements
// Allowed Actions
// assignTenantPlan
// extendTenantGrace
// freezeTenantGraceIfExpired
// checkTenantFileLimit
// checkTenantJobLimit
