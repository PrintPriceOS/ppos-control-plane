import React from 'react';
import { 
  ShieldCheckIcon, 
  TagIcon, 
  LockClosedIcon, 
  CpuChipIcon, 
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

export interface GovernanceSnapshot {
  profile: string; // e.g. 'ENTERPRISE', 'STANDARD'
  serviceTier: string; // e.g. 'TIER-1', 'LEGACY'
  tenantIsolation: 'LOGICAL' | 'DEDICATED' | 'STRICT';
  supportModel: 'PROVIDER_MANAGED' | 'CUSTOMER_MANAGED';
  upgradeMode: 'CANARY' | 'AUTOMATIC' | 'MANUAL';
  effectiveLimits?: {
    rateLimitRpm: number;
    concurrency: number;
    maxBytes: number;
  };
  enforcementMode: 'SHADOW' | 'ENFORCING' | 'PERMISSIVE';
  blockReason?: string;
}

interface GovernanceSnapshotViewerProps {
  snapshot?: GovernanceSnapshot;
  isLoading?: boolean;
}

export const GovernanceSnapshotViewer: React.FC<GovernanceSnapshotViewerProps> = ({ snapshot, isLoading }) => {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-slate-100 rounded w-1/2" />
        <div className="grid grid-cols-2 gap-2">
           <div className="h-10 bg-slate-50 rounded" />
           <div className="h-10 bg-slate-50 rounded" />
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="p-8 rounded-3xl bg-slate-50 border border-dashed border-slate-200 text-center">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest italic-text-off">Governance Snapshot Not Available</p>
        <p className="text-[10px] text-slate-400 mt-2 italic-text-off">No policy posture was recorded for this specific trace identifier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 italic-text-off">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <StatItem label="Profile" value={snapshot.profile} icon={TagIcon} />
        <StatItem label="Tier" value={snapshot.serviceTier} icon={CpuChipIcon} />
        <StatItem label="Isolation" value={snapshot.tenantIsolation} icon={LockClosedIcon} />
        <StatItem label="Support" value={snapshot.supportModel} icon={ShieldCheckIcon} />
        <StatItem label="Upgrade" value={snapshot.upgradeMode} icon={ArrowPathIcon} />
        <StatItem 
            label="Enforcement" 
            value={snapshot.enforcementMode} 
            icon={ShieldCheckIcon} 
            color={snapshot.enforcementMode === 'ENFORCING' ? 'emerald' : 'amber'} 
        />
      </div>

      {snapshot.blockReason && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500 shrink-0" />
          <div>
             <p className="text-[10px] font-black text-red-400 uppercase tracking-widest leading-none mb-1">Block Logic Triggered</p>
             <p className="text-sm font-bold text-red-700 leading-tight">{snapshot.blockReason}</p>
          </div>
        </div>
      )}

      {snapshot.effectiveLimits && (
        <div className="pt-2 border-t border-slate-100">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Effective Resource Limits</p>
           <div className="flex gap-4">
              <div className="flex flex-col">
                 <span className="text-xs font-bold text-slate-700">{snapshot.effectiveLimits.rateLimitRpm} RPM</span>
                 <span className="text-[9px] text-slate-400 font-medium">Rate Matching</span>
              </div>
              <div className="flex flex-col">
                 <span className="text-xs font-bold text-slate-700">{snapshot.effectiveLimits.concurrency}</span>
                 <span className="text-[9px] text-slate-400 font-medium">Max Parallel</span>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const StatItem = ({ label, value, icon: Icon, color = 'slate' }: any) => (
  <div className="p-3 rounded-xl bg-white border border-slate-100 flex flex-col gap-1 shadow-sm">
    <div className="flex items-center gap-1.5 text-slate-400">
       <Icon className={`w-3 h-3 ${color === 'emerald' ? 'text-emerald-500' : color === 'amber' ? 'text-amber-500' : ''}`} />
       <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <p className={`text-[11px] font-black tracking-tight ${color === 'emerald' ? 'text-emerald-600' : color === 'amber' ? 'text-amber-600' : 'text-slate-900'}`}>
        {value}
    </p>
  </div>
);
