import React, { useState } from 'react';
import { 
  ShieldCheckIcon as Shield, 
  ClockIcon as Clock, 
  ExclamationTriangleIcon as AlertTriangle, 
  CheckCircleIcon as CheckCircle, 
  InformationCircleIcon as Info, 
  ChevronDownIcon as ChevronDown, 
  ChevronUpIcon as ChevronUp, 
  LinkIcon 
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

interface GovernanceLedgerPanelProps {
  ledgerPayload: any;
  onRefresh: () => void;
}

const severityColor = (severity: string) => {
  switch (severity) {
    case 'error': return 'text-red-500 bg-red-500/10 border-red-500/20';
    case 'warning': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    case 'success': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    case 'info':
    default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
  }
};

const SeverityIcon = ({ severity, className = '' }: { severity: string, className?: string }) => {
  switch (severity) {
    case 'error': return <AlertTriangle className={className} />;
    case 'warning': return <AlertTriangle className={className} />;
    case 'success': return <CheckCircle className={className} />;
    case 'info':
    default: return <Info className={className} />;
  }
};

export const GovernanceLedgerPanel: React.FC<GovernanceLedgerPanelProps> = ({ ledgerPayload, onRefresh }) => {
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  const toggleEvent = (id: string) => {
    setExpandedEvents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!ledgerPayload) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500">
        <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Governance ledger is not available yet for this job.</p>
      </div>
    );
  }

  const { ledger, event_count, source } = ledgerPayload;

  if (!ledger || ledger.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500">
        <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Governance ledger is not available yet for this job.</p>
      </div>
    );
  }

  return (
    <details className="bg-gray-900 border border-gray-800 rounded-lg flex flex-col mt-6 group">
      <summary className="p-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center cursor-pointer list-none">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white tracking-wide">Governance Ledger</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 ml-2 border border-gray-700">
            {event_count} Events
          </span>
          {source === 'registry_fallback' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 ml-2">
              Registry Fallback
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.preventDefault(); onRefresh(); }}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors"
          >
            Refresh Ledger
          </button>
          <div className="text-gray-500 group-open:hidden"><ChevronDown className="w-5 h-5" /></div>
          <div className="text-gray-500 hidden group-open:block"><ChevronUp className="w-5 h-5" /></div>
        </div>
      </summary>

      <div className="p-4 border-t border-gray-800">
        {source === 'registry_fallback' && (
          <div className="mb-4 text-xs text-amber-500/80 bg-amber-500/5 p-3 rounded border border-amber-500/10">
            Showing registry-derived ledger because no audit records were found.
          </div>
        )}

        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-800 before:to-transparent">
          {ledger.map((event: any, idx: number) => {
            const isExpanded = expandedEvents[event.id || idx];
            const meta = event.metadata || {};
            const linkedJobs = [meta.parent_job_id, meta.child_job_id, meta.fix_job_id].filter(Boolean);

            return (
              <div key={event.id || idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                {/* Timeline dot */}
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-gray-900 bg-gray-800 text-slate-500 group-[.is-active]:text-slate-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2`}>
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center ${severityColor(event.severity)}`}>
                      <SeverityIcon severity={event.severity} className="w-4 h-4" />
                   </div>
                </div>

                {/* Card */}
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-gray-800 bg-gray-900 shadow">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-200 text-sm">{event.label}</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(event.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-400 mb-3">{event.summary}</div>
                  
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[10px] px-1.5 py-0.5 uppercase tracking-wider rounded bg-gray-800 text-gray-400 border border-gray-700">
                      {event.category}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 uppercase tracking-wider rounded bg-gray-800 text-gray-400 border border-gray-700">
                      Actor: {event.actor?.label || 'System'}
                    </span>
                    {linkedJobs.length > 0 && linkedJobs.map(lj => (
                       <Link key={lj} to={`/preflight/jobs/${lj}`} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1 hover:bg-indigo-500/20 transition-colors">
                          <LinkIcon className="w-3 h-3" /> {lj}
                       </Link>
                    ))}
                  </div>

                  {/* Expand toggle */}
                  <button 
                    onClick={() => toggleEvent(event.id || idx)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors mt-2"
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {isExpanded ? 'Hide Details' : 'Show Forensic Details'}
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-3 p-3 bg-gray-950 rounded border border-gray-800 text-xs overflow-x-auto">
                      <div className="mb-2">
                        <span className="text-gray-500">Raw Event Type:</span> <code className="text-indigo-400">{event.event_type}</code>
                      </div>
                      <div className="mb-2">
                        <span className="text-gray-500">Trace ID:</span> <code className="text-gray-400">{event.forensic?.trace_id || 'N/A'}</code>
                      </div>
                      <div className="mb-2">
                        <span className="text-gray-500">Tenant:</span> <code className="text-gray-400">{event.forensic?.tenant_id}</code>
                      </div>
                      <div className="mb-1 text-gray-500">Metadata:</div>
                      <pre className="text-gray-400 whitespace-pre-wrap">{JSON.stringify(event.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
};
