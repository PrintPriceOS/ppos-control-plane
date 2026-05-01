import React, { useState, useEffect } from 'react';
import { 
  ClockIcon, 
  UserIcon, 
  CpuChipIcon, 
  GlobeAltIcon,
  TagIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import { adminFetch } from '../../lib/adminApi';

interface ProductionEvent {
  id: string;
  tenant_id: string;
  production_package_id: string;
  dispatch_id: string;
  event_type: string;
  actor_type: 'USER' | 'SYSTEM' | 'NODE' | 'API';
  actor_id: string;
  message: string;
  metadata_json: any;
  created_at: string;
}

export const ProductionTimeline: React.FC<{ packageId?: string }> = ({ packageId }) => {
  const [events, setEvents] = useState<ProductionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, [packageId]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const url = packageId 
        ? `/api/admin/production/packages/${packageId}/events`
        : '/api/admin/production/events';
      const data = await adminFetch<any>(url);
      if (data.ok) {
        setEvents(data.events);
      }
    } catch (err) {
      console.error('Failed to fetch events', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ClockIcon className="h-6 w-6 text-indigo-600" />
            {packageId ? `PACKAGE TIMELINE: #${packageId.substring(0,8)}` : 'GLOBAL PRODUCTION STREAM'}
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Operational Audit Trail</p>
        </div>
      </div>

      <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 pb-8">
        {events.map((event, idx) => (
          <div key={event.id} className="relative pl-8">
            {/* Timeline Dot */}
            <div className={`
              absolute -left-[11px] top-1 h-5 w-5 rounded-full border-4 border-white shadow-sm ring-1 ring-slate-200
              ${getEventColor(event.event_type)}
            `}></div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter border ${getEventBadgeStyle(event.event_type)}`}>
                      {event.event_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-[10px] font-bold text-slate-500 uppercase">
                    {getActorIcon(event.actor_type)}
                    {event.actor_type}: {event.actor_id.substring(0, 8)}
                  </div>
                </div>

                <p className="text-sm text-slate-700 font-medium">{event.message}</p>

                {event.metadata_json && Object.keys(event.metadata_json).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-50">
                    <button 
                      onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                      className="text-[10px] font-black text-slate-400 hover:text-slate-600 flex items-center gap-1 uppercase tracking-widest transition-colors"
                    >
                      {expandedEvent === event.id ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
                      {expandedEvent === event.id ? 'Hide Data' : 'View Metadata'}
                    </button>
                    
                    {expandedEvent === event.id && (
                      <pre className="mt-2 p-3 bg-slate-900 text-indigo-300 text-[10px] rounded-lg overflow-x-auto font-mono leading-relaxed">
                        {JSON.stringify(event.metadata_json, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {events.length === 0 && (
          <div className="pl-8 text-slate-400 text-sm font-bold uppercase tracking-widest italic py-10">
            No production events recorded for this context.
          </div>
        )}
      </div>
    </div>
  );
};

const getEventColor = (type: string) => {
  if (type.includes('CREATED')) return 'bg-indigo-500';
  if (type.includes('DISPATCHED')) return 'bg-blue-500';
  if (type.includes('ACCEPTED')) return 'bg-emerald-500';
  if (type.includes('REJECTED')) return 'bg-rose-500';
  if (type.includes('STARTED')) return 'bg-amber-500';
  if (type.includes('COMPLETED')) return 'bg-teal-500';
  return 'bg-slate-400';
};

const getEventBadgeStyle = (type: string) => {
  if (type.includes('CREATED')) return 'bg-indigo-50 text-indigo-700 border-indigo-100';
  if (type.includes('DISPATCHED')) return 'bg-blue-50 text-blue-700 border-blue-100';
  if (type.includes('ACCEPTED')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (type.includes('REJECTED')) return 'bg-rose-50 text-rose-700 border-rose-100';
  if (type.includes('STARTED')) return 'bg-amber-50 text-amber-700 border-amber-100';
  if (type.includes('COMPLETED')) return 'bg-teal-50 text-teal-700 border-teal-100';
  return 'bg-slate-50 text-slate-700 border-slate-100';
};

const getActorIcon = (type: string) => {
  switch (type) {
    case 'USER': return <UserIcon className="h-3 w-3" />;
    case 'NODE': return <CpuChipIcon className="h-3 w-3" />;
    case 'API': return <GlobeAltIcon className="h-3 w-3" />;
    default: return <TagIcon className="h-3 w-3" />;
  }
};
