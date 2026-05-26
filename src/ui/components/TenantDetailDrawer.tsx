import React, { useState } from 'react';
import { Drawer } from './Drawer';
import { 
  GlobeAltIcon, 
  ShieldCheckIcon, 
  CubeIcon, 
  ClockIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon
} from '@heroicons/react/24/outline';
import { COLORS } from '../design-system/tokens';
import { 
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
  
  // States for interactive controls
  const [selectedPlanCode, setSelectedPlanCode] = useState('FOUNDING_PRINTHOUSE');
  const [assignReason, setAssignReason] = useState('Founding print house pilot onboarding');
  const [assignGraceDays, setAssignGraceDays] = useState(7);

  const [extendGraceDays, setExtendGraceDays] = useState(7);
  const [extendReason, setExtendReason] = useState('Pilot extension approved manually');

  const [fileLimitTestVal, setFileLimitTestVal] = useState(780); // Default to 780 MB for the smoke check path
  const [fileLimitResult, setFileLimitResult] = useState<string | null>(null);

  const [jobLimitTestVal, setJobLimitTestVal] = useState(2048);
  const [jobLimitResult, setJobLimitResult] = useState<string | null>(null);

  if (!tenant) return null;

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => setActionFeedback(null), 5000);
  };

  const handleAssignPlan = async () => {
    setLoading(true);
    try {
      const payload: any = {
        planCode: selectedPlanCode,
        commercialStatus: selectedPlanCode === 'FOUNDING_PRINTHOUSE' ? 'GRACE' : 'ACTIVE',
        reason: assignReason
      };
      if (selectedPlanCode === 'FOUNDING_PRINTHOUSE') {
        payload.graceDays = assignGraceDays;
      }
      const res = await assignTenantPlan(tenant.id, payload);
      if (res && res.ok) {
        showFeedback('success', `Plan assigned: ${selectedPlanCode}`);
        onRefresh();
      } else {
        showFeedback('error', res?.error?.message || 'Plan assignment failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExtendGrace = async () => {
    if (!extendReason.trim()) {
      showFeedback('error', 'Extension reason is required');
      return;
    }
    setLoading(true);
    try {
      const res = await extendTenantGrace(tenant.id, {
        graceDays: extendGraceDays,
        reason: extendReason
      });
      if (res && res.ok) {
        showFeedback('success', `Grace extended by ${extendGraceDays} days`);
        onRefresh();
      } else {
        showFeedback('error', res?.error?.message || 'Grace extension failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFreeze = async () => {
    setLoading(true);
    try {
      const res = await freezeTenantGraceIfExpired(tenant.id);
      if (res && res.ok) {
        showFeedback('success', res.idempotent ? 'Tenant was already frozen' : 'Tenant grace period frozen successfully');
        onRefresh();
      } else {
        showFeedback('error', res?.error?.message || 'Freeze action failed');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckFileLimit = async () => {
    setFileLimitResult('Checking...');
    try {
      const bytes = fileLimitTestVal * 1024 * 1024;
      const res = await checkTenantFileLimit(tenant.id, bytes);
      if (res && res.ok) {
        setFileLimitResult(`ALLOWED: Limit is ${res.limits?.maxFileSizeMb || 'N/A'} MB`);
      } else {
        setFileLimitResult(`BLOCKED: ${res?.blockers?.[0]?.message || 'Limit exceeded'}`);
      }
    } catch (err: any) {
      setFileLimitResult(`ERROR: ${err.message}`);
    }
  };

  const handleCheckJobLimit = async () => {
    setJobLimitResult('Checking...');
    try {
      const bytes = jobLimitTestVal * 1024 * 1024;
      const res = await checkTenantJobLimit(tenant.id, bytes);
      if (res && res.ok) {
        setJobLimitResult(`ALLOWED: Limit is ${res.limits?.maxJobSizeMb || 'N/A'} MB`);
      } else {
        setJobLimitResult(`BLOCKED: ${res?.blockers?.[0]?.message || 'Limit exceeded'}`);
      }
    } catch (err: any) {
      setJobLimitResult(`ERROR: ${err.message}`);
    }
  };

  // Modules List
  const modulesList = [
    'budget_app', 'basic_preflight', 'full_preflight', 'marketplace_orders',
    'file_repository', 'print_house_handoff', 'production_readiness',
    'production_queue', 'machine_assignment', 'federation_telemetry',
    'dispatch_orchestration', 'api_access', 'advanced_audit', 'tenant_admin'
  ];

  // Actions/Entitlements List
  const actionsList = [
    'LOGIN', 'VIEW_CONTROL_PLANE', 'RUN_PREFLIGHT', 'UPLOAD_PRODUCTION_FILE',
    'PREPARE_PRINTHOUSE_HANDOFF', 'QUEUE_PRODUCTION', 'ASSIGN_MACHINE',
    'COMPLETE_PRODUCTION', 'PREPARE_DELIVERY_HANDOFF'
  ];

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

        {/* SECTION 1: Identity */}
        <div className="bg-[#18181b] border border-white/10 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Identity Context</h3>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <p className="text-slate-500">TENANT ID</p>
              <p className="font-bold text-white break-all">{tenant.id}</p>
            </div>
            <div>
              <p className="text-slate-500">NAME</p>
              <p className="font-bold text-white">{tenant.name || 'Unnamed'}</p>
            </div>
            <div>
              <p className="text-slate-500">TYPE</p>
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase">
                {tenant.type || 'PRINTHOUSE'}
              </span>
            </div>
            <div>
              <p className="text-slate-500">STATUS</p>
              <span className={`px-2 py-0.5 border font-bold uppercase ${
                tenant.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {tenant.status || 'ACTIVE'}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 2: Commercial Governance */}
        <div className="bg-[#18181b] border border-white/10 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Commercial Governance</h3>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono mb-4">
            <div>
              <p className="text-slate-500">PLAN CODE</p>
              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
                {tenant.planCode || tenant.plan || 'FREE'}
              </span>
            </div>
            <div>
              <p className="text-slate-500">COMMERCIAL STATUS</p>
              <span className={`px-2 py-0.5 border font-bold ${
                tenant.commercialStatus === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                tenant.commercialStatus === 'GRACE' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                {tenant.commercialStatus || 'ACTIVE'}
              </span>
            </div>
            <div>
              <p className="text-slate-500">ACCESS LEVEL</p>
              <p className="font-bold text-white">{tenant.accessLevel || 'BASIC'}</p>
            </div>
            <div>
              <p className="text-slate-500">DAYS REMAINING (GRACE)</p>
              <p className="font-bold text-white">{tenant.grace?.active ? `${tenant.grace.daysRemaining} days` : 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-500">GRACE STARTED</p>
              <p className="font-bold text-white">{tenant.grace?.startedAt ? new Date(tenant.grace.startedAt).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-500">GRACE ENDS</p>
              <p className="font-bold text-white">
                {tenant.grace?.extendedUntil 
                  ? `${new Date(tenant.grace.extendedUntil).toLocaleDateString()} (Extended)` 
                  : tenant.grace?.endsAt ? new Date(tenant.grace.endsAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 3: Limits */}
        <div className="bg-[#18181b] border border-white/10 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Limits Registry</h3>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <p className="text-slate-500">MAX FILE SIZE</p>
              <p className="font-bold text-white">{tenant.limits?.maxFileSizeMb || 25} MB</p>
            </div>
            <div>
              <p className="text-slate-500">MAX JOB SIZE</p>
              <p className="font-bold text-white">{tenant.limits?.maxJobSizeMb || 50} MB</p>
            </div>
            <div>
              <p className="text-slate-500">MAX JOBS / MONTH</p>
              <p className="font-bold text-white">{tenant.limits?.maxJobsPerMonth || 1000}</p>
            </div>
            <div>
              <p className="text-slate-500">RETENTION DAYS</p>
              <p className="font-bold text-white">{tenant.limits?.retentionDays || 30} days</p>
            </div>
          </div>
        </div>

        {/* SECTION 4: Modules Checklist */}
        <div className="bg-[#18181b] border border-white/10 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Module Entitlements</h3>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            {modulesList.map((mod) => {
              const hasModule = tenant.limits?.modules?.[mod] !== false && (tenant.planCode !== 'FREE' || ['basic_preflight', 'file_repository', 'tenant_admin'].includes(mod));
              return (
                <div key={mod} className="flex items-center gap-2 py-1">
                  <span className={`w-2 h-2 ${hasModule ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                  <span className={hasModule ? 'text-white' : 'text-slate-500 line-through'}>{mod}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 5: Actions Matrix */}
        <div className="bg-[#18181b] border border-white/10 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Allowed Actions</h3>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            {actionsList.map((act) => {
              const isAllowed = tenant.status !== 'SUSPENDED' && (
                tenant.commercialStatus !== 'GRACE_EXPIRED' || 
                ['LOGIN', 'VIEW_CONTROL_PLANE'].includes(act)
              );
              return (
                <div key={act} className="flex items-center gap-2 py-1">
                  <span className={`w-2 h-2 ${isAllowed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className={isAllowed ? 'text-white' : 'text-rose-500 line-through'}>{act}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 6: Admin Operational Actions */}
        <div className="bg-[#18181b] border border-white/10 p-4 space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 mb-3">Governance Overrides</h3>

          {/* Assign Plan */}
          <div className="p-3 bg-white/5 border border-white/10 space-y-2">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">Assign Plan</span>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedPlanCode}
                onChange={(e) => setSelectedPlanCode(e.target.value)}
                className="bg-black/50 border border-white/20 text-xs px-2 py-1 outline-none text-white font-mono"
              >
                <option value="FREE">FREE</option>
                <option value="PRO">PRO</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
                <option value="CUSTOM">CUSTOM</option>
                <option value="FOUNDING_PRINTHOUSE">FOUNDING_PRINTHOUSE</option>
                <option value="SYSTEM">SYSTEM</option>
              </select>
              {selectedPlanCode === 'FOUNDING_PRINTHOUSE' && (
                <input
                  type="number"
                  placeholder="Grace Days"
                  value={assignGraceDays}
                  onChange={(e) => setAssignGraceDays(parseInt(e.target.value) || 7)}
                  className="bg-black/50 border border-white/20 text-xs px-2 py-1 outline-none text-white font-mono"
                />
              )}
            </div>
            <input
              type="text"
              placeholder="Assignment Reason"
              value={assignReason}
              onChange={(e) => setAssignReason(e.target.value)}
              className="w-full bg-black/50 border border-white/20 text-xs px-2 py-1 outline-none text-white font-mono"
            />
            <button
              onClick={handleAssignPlan}
              disabled={loading}
              className="w-full py-1 bg-white hover:bg-slate-200 text-black font-bold uppercase text-[10px]"
            >
              Assign Plan
            </button>
          </div>

          {/* Extend Grace */}
          <div className="p-3 bg-white/5 border border-white/10 space-y-2">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">Extend Grace Period</span>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Days"
                value={extendGraceDays}
                onChange={(e) => setExtendGraceDays(parseInt(e.target.value) || 7)}
                className="w-20 bg-black/50 border border-white/20 text-xs px-2 py-1 outline-none text-white font-mono"
              />
              <input
                type="text"
                placeholder="Reason (Required)"
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
                className="flex-1 bg-black/50 border border-white/20 text-xs px-2 py-1 outline-none text-white font-mono"
              />
            </div>
            <button
              onClick={handleExtendGrace}
              disabled={loading}
              className="w-full py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold uppercase text-[10px]"
            >
              Apply Grace Extension
            </button>
          </div>

          {/* Freeze If Expired */}
          <div className="p-3 bg-rose-500/5 border border-rose-500/20 space-y-2">
            <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider block">Enforce Expiry Freeze</span>
            <div className="flex gap-2 text-[9px] text-rose-400 items-start">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              <p>This does not delete data and does not block login. It freezes new production actions only.</p>
            </div>
            <button
              onClick={handleFreeze}
              disabled={loading}
              className="w-full py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold uppercase text-[10px]"
            >
              Enforce Freeze
            </button>
          </div>

          {/* Check Limits */}
          <div className="p-3 bg-white/5 border border-white/10 space-y-2">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider block">Limits Simulation</span>
            
            {/* File Limit */}
            <div className="space-y-1">
              <label className="text-[9px] text-slate-400 block font-mono">Check File Upload Limit</label>
              <div className="flex gap-2">
                <select
                  value={fileLimitTestVal}
                  onChange={(e) => setFileLimitTestVal(parseInt(e.target.value))}
                  className="bg-black/50 border border-white/20 text-xs px-2 py-1 outline-none text-white font-mono"
                >
                  <option value="25">25 MB</option>
                  <option value="150">150 MB</option>
                  <option value="780">780 MB</option>
                  <option value="1024">1024 MB</option>
                </select>
                <button
                  onClick={handleCheckFileLimit}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 font-bold uppercase text-[10px]"
                >
                  Test File size
                </button>
              </div>
              {fileLimitResult && (
                <p className={`text-[10px] font-mono font-bold mt-1 ${fileLimitResult.includes('ALLOWED') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {fileLimitResult}
                </p>
              )}
            </div>

            {/* Job Limit */}
            <div className="space-y-1 mt-2">
              <label className="text-[9px] text-slate-400 block font-mono">Check Job Limit</label>
              <div className="flex gap-2">
                <select
                  value={jobLimitTestVal}
                  onChange={(e) => setJobLimitTestVal(parseInt(e.target.value))}
                  className="bg-black/50 border border-white/20 text-xs px-2 py-1 outline-none text-white font-mono"
                >
                  <option value="300">300 MB</option>
                  <option value="2048">2048 MB</option>
                </select>
                <button
                  onClick={handleCheckJobLimit}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 font-bold uppercase text-[10px]"
                >
                  Test Job size
                </button>
              </div>
              {jobLimitResult && (
                <p className={`text-[10px] font-mono font-bold mt-1 ${jobLimitResult.includes('ALLOWED') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {jobLimitResult}
                </p>
              )}
            </div>

          </div>

        </div>

      </div>
    </Drawer>
  );
};
