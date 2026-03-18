import React from 'react';
import { Drawer } from './Drawer';
import { GlobeAltIcon, ShieldCheckIcon, CubeIcon, ClockIcon } from '@heroicons/react/24/outline';

interface TenantDetailDrawerProps {
  tenant: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TenantDetailDrawer: React.FC<TenantDetailDrawerProps> = ({ tenant, isOpen, onClose }) => {
  if (!tenant) return null;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Tenant: ${tenant.tenant_id}`}>
      <div className="space-y-8 italic-text-off">
        {/* Status Header */}
        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <GlobeAltIcon className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900 tracking-tight">Active Source</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enforced Isolation</span>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Configuration Context</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-100 bg-white">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Service Tier</p>
              <p className="text-sm font-bold text-slate-900">Tier 1 - Enterprise</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-100 bg-white">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rate Limit</p>
              <p className="text-sm font-bold text-slate-900">5,000 RPM</p>
            </div>
          </div>
        </div>

        {/* Governance Flags */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Governance Flags</h3>
          <div className="space-y-2">
            {[
              { label: 'Data Sovereignty Compliance', enforced: true },
              { label: 'Audit Trail Persistence', enforced: true },
              { label: 'Automated Quarantine', enforced: false },
            ].map((flag, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <span className="text-sm font-medium text-slate-700">{flag.label}</span>
                {flag.enforced ? (
                  <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Usage Summary */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Usage Summary</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-3 rounded-xl bg-slate-50">
               <p className="text-lg font-black text-slate-900">{tenant.totalJobs}</p>
               <p className="text-[9px] font-bold text-slate-400 uppercase">Jobs</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-slate-50">
               <p className="text-lg font-black text-slate-900">{tenant.successRate.toFixed(1)}%</p>
               <p className="text-[9px] font-bold text-slate-400 uppercase">Success</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-slate-50">
               <p className="text-lg font-black text-slate-900">{tenant.avgLatencyMs}ms</p>
               <p className="text-[9px] font-bold text-slate-400 uppercase">Latency</p>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
