import React from 'react';
import { Drawer } from './Drawer';
import { GovernanceSnapshotViewer } from './GovernanceSnapshotViewer';
import { AuditTimeline } from './AuditTimeline';
import { 
  CubeIcon, 
  CircleStackIcon, 
  ClockIcon, 
  ExclamationTriangleIcon, 
  PaperClipIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';

interface JobDetailDrawerProps {
  job: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({ job, isOpen, onClose }) => {
  if (!job) return null;

  // Mock stages for job reconstruction
  const stages = [
    { id: 'AUTH', label: 'Auth & Handshake', timestamp: job.created_at, status: 'SUCCESS' as const, action_by: 'Auth-EU1' },
    { id: 'POLICY', label: 'Policy Resolution', timestamp: job.created_at, status: 'SUCCESS' as const, details: 'Standard-Isolation Match', action_by: 'Posturer-V1' },
    { id: 'QUEUED', label: 'Enqueued', timestamp: job.created_at, status: 'SUCCESS' as const, details: 'Pushed to BullMQ: preflight_async_queue' },
    { id: 'STARTED', label: 'Processing Started', timestamp: job.updated_at, status: (job.status === 'RUNNING' || job.status === 'COMPLETED' ? 'SUCCESS' : 'PENDING') as any, details: 'Worker Cluster EU-WEST-1C matched.' },
    { id: 'COMPLETED', label: 'Finalizing', timestamp: job.updated_at, status: (job.status === 'COMPLETED' ? 'SUCCESS' : job.status === 'FAILED' ? 'FAILED' : 'PENDING') as any, details: job.error || 'Execution success.' },
  ];

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Job Evidence: ${job.id?.slice(0, 10) || 'N/A'}`}>
      <div className="space-y-10 italic-text-off">
        {/* Status Header */}
        <div className="flex items-center gap-6 p-6 rounded-3xl bg-slate-50 border border-slate-100 shadow-sm">
           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
             job.status === 'COMPLETED' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 
             job.status === 'FAILED' ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-blue-500 text-white shadow-blue-500/20'
           }`}>
              <CubeIcon className="w-8 h-8" />
           </div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Execution Status</p>
              <h3 className="text-xl font-black text-slate-900 leading-none">{job.status}</h3>
              <div className="flex items-center gap-2 mt-2">
                 <ClockIcon className="w-3 h-3 text-slate-300" />
                 <span className="text-[10px] font-bold text-slate-400">P95 Latency: {Math.random() > 0.5 ? '450ms' : '1.2s'}</span>
              </div>
           </div>
        </div>

        {/* Reconstruction */}
        <div>
           <SectionHeader label="Lifecycle & Trace" />
           <div className="mt-6">
              <AuditTimeline requestId={job.id} stages={stages} />
           </div>
        </div>

        {/* Posture */}
        <div>
           <SectionHeader label="Applied Posture Snapshot" />
           <div className="mt-6">
              <GovernanceSnapshotViewer 
                snapshot={job.governance_snapshot} 
              />
           </div>
        </div>

        {/* Evidence Links */}
        <div>
           <SectionHeader label="Evidence & Artifacts" />
           <div className="mt-4 grid grid-cols-2 gap-2">
              <ArtifactLink icon={PaperClipIcon} label="Input Payload" />
              <ArtifactLink icon={PaperClipIcon} label="Execution Logs" />
              <ArtifactLink icon={GlobeAltIcon} label="Worker Details" />
              <ArtifactLink icon={CircleStackIcon} label="Resulting State" />
           </div>
        </div>
      </div>
    </Drawer>
  );
};

const SectionHeader = ({ label }: { label: string }) => (
  <div className="flex items-center gap-4">
     <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{label}</span>
     <div className="h-[1px] w-full bg-slate-100" />
  </div>
);

const ArtifactLink = ({ icon: Icon, label }: any) => (
  <button className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-100 hover:border-primary/20 hover:bg-primary/5 transition-all text-left group">
     <Icon className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
     <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">{label}</span>
  </button>
);
