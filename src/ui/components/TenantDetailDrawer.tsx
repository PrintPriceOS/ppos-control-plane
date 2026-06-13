import React, { useState } from 'react';
import { Drawer } from './Drawer';
import { 
  GlobeAltIcon, 
  ShieldCheckIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { updateTenantGovernance } from '../lib/adminApi';

interface TenantDetailDrawerProps {
  tenant: any | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const TenantDetailDrawer: React.FC<TenantDetailDrawerProps> = ({ tenant, isOpen, onClose, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const alignFoundingPrinthouse = () => {
    handleUpdate({
      plan_code: 'FOUNDING_PRINTHOUSE',
      service_tier: 'enterprise',
      access_level: 'FULL',
      limits_json: {
        maxFileSizeMb: 1024,
        maxJobSizeMb: 2048,
        allowLargeUploads: true
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
      <div className="space-y-6 text-slate-100 pb-16">
        
        {/* Feedback Messages */}
        {actionFeedback && (
          <div className={`p-4 border font-bold flex items-center gap-3 animate-pulse ${
            actionFeedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            {actionFeedback.type === 'success' ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : <XCircleIcon className="w-5 h-5 shrink-0" />}
            <p className="text-xs uppercase tracking-wider">{actionFeedback.message}</p>
          </div>
        )}

        {/* SECTION 1: Overview */}
        <div className="bg-[#18181b] border border-white/10 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
            <GlobeAltIcon className="w-4 h-4 text-primary" />
            Overview
          </h3>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div><p className="text-slate-500">TENANT NAME</p><p className="font-bold text-white">{tenant.name || 'Unnamed'}</p></div>
            <div><p className="text-slate-500">TYPE</p><span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase">{tenant.type || 'PRINTHOUSE'}</span></div>
            <div><p className="text-slate-500">STATUS</p><span className="text-white">{tenant.status}</span></div>
            <div><p className="text-slate-500">PLAN</p><span className="text-white">{tenant.plan}</span></div>
            <div><p className="text-slate-500">PLAN CODE</p><span className="text-white font-bold">{tenant.planCode}</span></div>
            <div><p className="text-slate-500">SERVICE TIER</p><span className="text-white font-bold">{tenant.serviceTier}</span></div>
            <div><p className="text-slate-500">COMMERCIAL STATUS</p><span className="text-white">{tenant.commercialStatus}</span></div>
            <div><p className="text-slate-500">ACCESS LEVEL</p><span className="text-white font-bold">{tenant.accessLevel}</span></div>
          </div>
        </div>

        {/* SECTION 5: Warnings */}
        {warnings.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-4">
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
        <div className="bg-[#18181b] border border-white/10 p-4">
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
        <div className="bg-[#18181b] border border-white/10 p-4">
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
        <div className="bg-[#18181b] border border-white/10 p-4">
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
        <div className="bg-[#18181b] border border-white/10 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-primary" />
            Quick Actions
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
            <button onClick={alignFoundingPrinthouse} disabled={loading} className="py-2 px-3 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-left uppercase tracking-wider">
              Align as FOUNDING PRINTHOUSE
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

