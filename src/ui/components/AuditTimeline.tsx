import React from 'react';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  EllipsisHorizontalCircleIcon, 
  ClockIcon, 
  FingerPrintIcon, 
  ShieldExclamationIcon,
  CircleStackIcon,
  PlayCircleIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';

export interface TimelineStage {
  id: string; // e.g. 'AUTH', 'POLICY', 'QUEUED', 'STARTED', 'COMPLETED'
  label: string;
  timestamp: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  details?: string;
  action_by?: string;
}

interface AuditTimelineProps {
  requestId?: string;
  stages: TimelineStage[];
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ requestId, stages }) => {
  return (
    <div className="space-y-6 italic-text-off">
      {requestId && (
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
           <div className="flex items-center gap-2">
              <FingerPrintIcon className="w-4 h-4 text-slate-400" />
              <div className="flex flex-col">
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Correlation Key</span>
                 <span className="text-[11px] font-mono font-bold text-slate-900 tracking-tight">{requestId}</span>
              </div>
           </div>
        </div>
      )}

      <div className="relative pl-8 space-y-8">
        {/* Continuous Line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-100" />

        {stages.map((stage, idx) => (
          <div key={idx} className="relative group transition-all">
            {/* Stage Icon Dot */}
            <div className={`absolute -left-8 top-0.5 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center transition-all ${
              stage.status === 'SUCCESS' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 
              stage.status === 'FAILED' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 
              stage.status === 'PENDING' ? 'bg-blue-500 text-white animate-pulse-slow shadow-lg shadow-blue-500/20' : 'bg-slate-200 text-white'
            }`}>
              {stage.status === 'SUCCESS' ? <CheckCircleIcon className="w-5 h-5" /> : 
               stage.status === 'FAILED' ? <XCircleIcon className="w-5 h-5" /> : 
               stage.status === 'PENDING' ? <EllipsisHorizontalCircleIcon className="w-5 h-5" /> : <ClockIcon className="w-5 h-5" />}
            </div>

            {/* Stage Content */}
            <div className={`p-4 rounded-2xl border transition-all ${
              stage.status === 'SUCCESS' ? 'bg-white border-slate-100 group-hover:border-emerald-200' : 
              stage.status === 'FAILED' ? 'bg-red-50/20 border-red-100' : 
              stage.status === 'PENDING' ? 'bg-blue-50/20 border-blue-100' : 'bg-slate-50 border-slate-100 opacity-60'
            }`}>
              <div className="flex items-center justify-between gap-4 mb-2">
                 <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{stage.label}</span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                      stage.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 
                      stage.status === 'FAILED' ? 'bg-red-100 text-red-700' : 
                      stage.status === 'PENDING' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {stage.status}
                    </span>
                 </div>
                 <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px]">
                    <ClockIcon className="w-3.5 h-3.5" />
                    {new Date(stage.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                 </div>
              </div>
              
              {stage.details && (
                <p className="text-xs font-bold text-slate-500 leading-relaxed max-w-lg mb-2">{stage.details}</p>
              )}

              {stage.action_by && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50">
                    <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center font-mono text-[8px] text-slate-500">
                      {stage.action_by.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Enforced by {stage.action_by}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {stages.length === 0 && (
          <div className="p-8 text-center text-slate-400 font-bold italic">No lifecycle events recorded for this correlation key.</div>
        )}
      </div>
    </div>
  );
};
