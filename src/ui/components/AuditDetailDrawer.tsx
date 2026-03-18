import React from 'react';
import { Drawer } from './Drawer';
import { GovernanceSnapshotViewer } from './GovernanceSnapshotViewer';
import { AuditTimeline, TimelineStage } from './AuditTimeline';
import { FingerPrintIcon, ShieldCheckIcon, GlobeAmericasIcon, UserCircleIcon } from '@heroicons/react/24/outline';

interface AuditDetailDrawerProps {
  auditEntry: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AuditDetailDrawer: React.FC<AuditDetailDrawerProps> = ({ auditEntry, isOpen, onClose }) => {
  if (!auditEntry) return null;

  // Mock stages for reconstruction demonstration
  const stages: TimelineStage[] = [
    { id: 'AUTH', label: 'Authentication', timestamp: auditEntry.created_at, status: 'SUCCESS' as const, details: 'API Key validated successfully. Scope: os:admin', action_by: 'AuthAuthority-EU1' },
    { id: 'POLICY', label: 'Governance Check', timestamp: auditEntry.created_at, status: (auditEntry.action === 'BLOCKED' ? 'FAILED' : 'SUCCESS') as any, details: auditEntry.policy_slug || 'Standard isolation policy enforced.', action_by: 'PolicyEnforcer-V2' },
  ];

  if (auditEntry.job_id) {
    stages.push({ id: 'QUEUED', label: 'Job Queued', timestamp: auditEntry.created_at, status: 'SUCCESS' as const, details: `Job ${auditEntry.job_id} effectively enqueued in BullMQ.` });
  }

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Trace Detail: ${auditEntry.id?.toString().slice(0, 8) || 'Unknown'}`}>
      <div className="space-y-10 italic-text-off">
        {/* Core Metadata Grid */}
        <div className="grid grid-cols-2 gap-4">
           <MetadataItem label="Action" value={auditEntry.action} color={auditEntry.action === 'BLOCKED' ? 'red' : 'emerald'} />
           <MetadataItem label="Tenant" value={auditEntry.tenant_id} icon={GlobeAmericasIcon} />
           <MetadataItem label="Deployment" value={auditEntry.deployment_id || 'eu-west-1'} icon={ShieldCheckIcon} />
           <MetadataItem label="User / Role" value={auditEntry.user_role || 'os:admin'} icon={UserCircleIcon} />
        </div>

        {/* Timeline Reconstruction */}
        <div>
           <SectionHeader label="Lifecycle Reconstruction" />
           <div className="mt-6">
              <AuditTimeline requestId={auditEntry.request_id} stages={stages} />
           </div>
        </div>

        {/* Governance Snapshot */}
        <div>
           <SectionHeader label="Governance Posture (at Request Time)" />
           <div className="mt-6">
              <GovernanceSnapshotViewer 
                snapshot={auditEntry.governance_snapshot} 
              />
           </div>
        </div>

        {/* Raw Log Excerpt */}
        <div>
           <SectionHeader label="Resource & Evidence" />
           <div className="mt-4 flex flex-col gap-2">
              <div className="p-4 rounded-xl border border-slate-100 bg-white font-mono text-[10px] text-slate-500 overflow-auto max-h-40">
                  {JSON.stringify(auditEntry, null, 2)}
              </div>
              <p className="text-[10px] text-slate-400 font-bold px-4">
                 Forensic Proof Hash: sha256:{Math.random().toString(36).substring(7)}
              </p>
           </div>
        </div>
      </div>
    </Drawer>
  );
};

const MetadataItem = ({ label, value, icon: Icon, color = 'slate' }: any) => (
  <div className="flex flex-col gap-1 px-4 py-3 rounded-2xl bg-white border border-slate-100 shadow-sm">
     <div className="flex items-center gap-1.5 text-slate-400">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
     </div>
     <span className={`text-sm font-black tracking-tight ${color === 'red' ? 'text-red-600' : color === 'emerald' ? 'text-emerald-600' : 'text-slate-900'}`}>
        {value}
     </span>
  </div>
);

const SectionHeader = ({ label }: { label: string }) => (
  <div className="flex items-center gap-4">
     <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{label}</span>
     <div className="h-[1px] w-full bg-slate-100" />
  </div>
);
