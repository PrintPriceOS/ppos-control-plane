import React from 'react';
import { Drawer } from './Drawer';
import { GlobeAltIcon, ShieldCheckIcon, CubeIcon, ClockIcon } from '@heroicons/react/24/outline';
import { COLORS } from '../design-system/tokens';

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
        <div className={`flex items-center gap-4 ${COLORS.adaptive.surfaceMuted} p-4 rounded-none border ${COLORS.adaptive.borderSubtle}`}>
          <div className={`w-12 h-12 rounded-none ${COLORS.adaptive.surface} border ${COLORS.adaptive.borderPrimary} flex items-center justify-center`}>
            <GlobeAltIcon className={`w-6 h-6 ${COLORS.adaptive.textMuted}`} />
          </div>
          <div>
            <p className={`text-xl font-black ${COLORS.adaptive.textPrimary} tracking-tight`}>Active Source</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-none bg-emerald-500" />
              <span className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>Enforced Isolation</span>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="space-y-4">
          <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest border-b ${COLORS.adaptive.borderSubtle} pb-2`}>Configuration Context</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
              <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-1`}>Service Tier</p>
              <p className={`text-sm font-bold ${COLORS.adaptive.textPrimary}`}>Tier 1 - Enterprise</p>
            </div>
            <div className={`p-4 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
              <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-1`}>Rate Limit</p>
              <p className={`text-sm font-bold ${COLORS.adaptive.textPrimary}`}>5,000 RPM</p>
            </div>
          </div>
        </div>

        {/* Governance Flags */}
        <div className="space-y-4">
          <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest border-b ${COLORS.adaptive.borderSubtle} pb-2`}>Governance Flags</h3>
          <div className="space-y-2">
            {[
              { label: 'Data Sovereignty Compliance', enforced: true },
              { label: 'Audit Trail Persistence', enforced: true },
              { label: 'Automated Quarantine', enforced: false },
            ].map((flag, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-none ${COLORS.adaptive.hoverSurface} transition-colors`}>
                <span className={`text-sm font-medium ${COLORS.adaptive.textPrimary}`}>{flag.label}</span>
                {flag.enforced ? (
                  <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
                ) : (
                  <div className={`w-5 h-5 rounded-none border-2 ${COLORS.adaptive.borderPrimary}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Usage Summary */}
        <div className="space-y-4">
          <h3 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest border-b ${COLORS.adaptive.borderSubtle} pb-2`}>Usage Summary</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className={`text-center p-3 rounded-none ${COLORS.adaptive.surfaceMuted}`}>
               <p className={`text-lg font-black ${COLORS.adaptive.textPrimary}`}>{tenant.totalJobs}</p>
               <p className={`text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>Jobs</p>
            </div>
            <div className={`text-center p-3 rounded-none ${COLORS.adaptive.surfaceMuted}`}>
               <p className={`text-lg font-black ${COLORS.adaptive.textPrimary}`}>{Number(tenant.successRate || 0).toFixed(1)}%</p>
               <p className={`text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>Success</p>
            </div>
            <div className={`text-center p-3 rounded-none ${COLORS.adaptive.surfaceMuted}`}>
               <p className={`text-lg font-black ${COLORS.adaptive.textPrimary}`}>{tenant.avgLatencyMs}ms</p>
               <p className={`text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>Latency</p>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
