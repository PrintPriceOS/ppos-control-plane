import React from 'react';
import { ProductionActivationGateAuditEvent } from '../../types/financialOperationsProductionActivationReview';
import { ClockIcon } from '@heroicons/react/24/outline';

interface AuditTimelineProps {
  events: ProductionActivationGateAuditEvent[];
  loading: boolean;
}

export const FinancialOperationsProductionActivationReviewAuditTimeline: React.FC<AuditTimelineProps> = ({ events, loading }) => {
  return (
    <div className="bg-[#141416] border border-white/10 p-5 space-y-4">
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">
          Gate Audit Log &amp; Timeline
        </h3>
        <p className="text-[10px] text-slate-500 mt-1 font-mono">
          Immutable forensic history of status mutations and evaluations
        </p>
      </div>

      {loading ? (
        <div className="py-4 text-center text-xs text-slate-500 font-mono animate-pulse">
          Loading audit events...
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-4 font-mono">No events recorded yet.</p>
      ) : (
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {events.map((event) => (
            <div key={event.id} className="flex gap-4 text-xs font-mono">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-none bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="w-px h-full bg-white/10 min-h-[20px]" />
              </div>
              <div className="flex-1 bg-white/5 border border-white/10 p-3 rounded-none">
                <div className="flex justify-between items-start flex-wrap gap-2 text-[10px] mb-1.5">
                  <span className="font-black text-indigo-400 uppercase tracking-wider">{event.event_type}</span>
                  <span className="text-slate-500">{new Date(event.created_at).toLocaleString()}</span>
                </div>
                <p className="text-slate-300 text-xs font-sans">{event.payload_json?.message || 'Action executed'}</p>
                <div className="mt-2 text-[9px] text-slate-500 flex justify-between">
                  <span>Actor: {event.actor_id || 'system'} ({event.actor_type})</span>
                  <span>ID: {event.id.slice(0, 8)}...</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FinancialOperationsProductionActivationReviewAuditTimeline;
