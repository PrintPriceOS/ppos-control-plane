import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import {
  UsersIcon,
  ArrowPathIcon,
  XCircleIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  GlobeAltIcon,
  CpuChipIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import { listTenantGovernance } from '../../lib/adminApi';
import { TenantDetailDrawer } from '../../components/TenantDetailDrawer';

export default function TenantManagement() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Drawer & detail state
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    loadTenants();
  }, []);

  async function loadTenants() {
    try {
      setLoading(true);
      setError(null);
      const res = await listTenantGovernance();
      if (res && res.ok) {
        setTenants(res.tenants || []);
      } else {
        setError(res?.error?.message || 'Failed to fetch governance list');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  const handleOpenDrawer = (tenant: any) => {
    setSelectedTenant(tenant);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedTenant(null);
  };

  const getPlanBadgeStyle = (planCode: string) => {
    switch (planCode) {
      case 'SYSTEM':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'FOUNDING_PRINTHOUSE':
        return 'bg-amber-500 text-slate-900 border-amber-500 font-extrabold animate-pulse';
      case 'ENTERPRISE':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'PRO':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'FREE':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      case 'CUSTOM':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'GRACE':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20 font-bold';
      case 'GRACE_EXPIRED':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold';
      case 'SUSPENDED':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getAccessLevelBadgeStyle = (level: string) => {
    switch (level) {
      case 'FULL':
      case 'PROFESSIONAL':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'BASIC':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const formatLastActive = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading && tenants.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <CpuChipIcon className="w-6 h-6 text-primary" />
            Tenant Management Console
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-mono">
            Phase 39.2 — Operational Governance, Limits & Entitlements
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/admin/tenant-pilots"
            className="px-3 py-1.5 bg-[#dc0000] hover:bg-red-700 text-white font-mono text-xs flex items-center gap-2 transition-all"
          >
            <ShieldCheckIcon className="w-4 h-4" />
            PILOT READINESS CONSOLE
          </Link>
          <button
            onClick={loadTenants}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-mono text-xs flex items-center gap-2 transition-all"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'SYNCING...' : 'SYNC CONSOLE'}
          </button>
        </div>

      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-3 font-mono text-xs">
          <XCircleIcon className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* High-density Industrial Table */}
      <div className="overflow-x-auto border border-white/10 bg-[#0f0f11]">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead className="bg-white/5 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-white/10">
            <tr>
              <th className="py-3.5 px-4">Tenant</th>
              <th className="py-3.5 px-4">Type</th>
              <th className="py-3.5 px-4">Plan Code</th>
              <th className="py-3.5 px-4">Commercial Status</th>
              <th className="py-3.5 px-4">Access Level</th>
              <th className="py-3.5 px-4">Grace Status</th>
              <th className="py-3.5 px-4">File Limit</th>
              <th className="py-3.5 px-4">Job Limit</th>
              <th className="py-3.5 px-4">Modules</th>
              <th className="py-3.5 px-4">Last Activity</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {tenants.map((t) => {
              const hasAlerts = t.blockers?.length > 0;
              const isFoundingGrace = t.planCode === 'FOUNDING_PRINTHOUSE' && t.commercialStatus === 'GRACE';

              return (
                <tr 
                  key={t.id} 
                  className={`group hover:bg-white/5 transition-all duration-150 ${
                    isFoundingGrace ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-white/10">
                        <GlobeAltIcon className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-100">{t.name || 'Unnamed'}</p>
                        <p className="text-[10px] text-slate-500 font-mono select-all">{t.id}</p>
                      </div>
                    </div>
                  </td>
                  
                  <td className="py-3 px-4">
                    <span className="text-slate-400 font-bold uppercase">{t.type}</span>
                  </td>

                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 border text-[10px] font-bold ${getPlanBadgeStyle(t.planCode)}`}>
                      {t.planCode}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 border text-[10px] font-bold ${getStatusBadgeStyle(t.commercialStatus)}`}>
                      {t.commercialStatus}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 border text-[10px] font-bold ${getAccessLevelBadgeStyle(t.accessLevel)}`}>
                      {t.accessLevel}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    {t.grace?.active ? (
                      <span className="text-amber-400 font-bold">
                        Active ({t.grace.daysRemaining} days remaining)
                      </span>
                    ) : t.grace?.expired ? (
                      <span className="text-rose-400 font-bold">Expired</span>
                    ) : (
                      <span className="text-slate-500">N/A</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-slate-200">
                    {t.limits?.maxFileSizeMb || 25} MB
                  </td>

                  <td className="py-3 px-4 text-slate-200">
                    {t.limits?.maxJobSizeMb || 50} MB
                  </td>

                  <td className="py-3 px-4">
                    <span className="text-slate-300">{t.modulesSummary}</span>
                  </td>

                  <td className="py-3 px-4 text-slate-400 text-[10px]">
                    {formatLastActive(t.lastActiveAt)}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleOpenDrawer(t)}
                        className="px-2 py-1 bg-white hover:bg-slate-200 text-black font-bold uppercase text-[9px] flex items-center gap-1 transition-all"
                      >
                        Manage
                        <ArrowRightIcon className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tenants.length === 0 && (
        <div className="py-16 text-center border border-dashed border-white/10 bg-[#0f0f11]">
          <p className="text-slate-400 text-sm">No active tenants mapped in operational control</p>
        </div>
      )}

      {/* Detail Governance Drawer */}
      {selectedTenant && (
        <TenantDetailDrawer
          tenant={selectedTenant}
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          onRefresh={loadTenants}
        />
      )}
      
    </div>
  );
}
