import React, { useState } from 'react';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon, 
  CpuChipIcon, 
  DocumentArrowDownIcon, 
  ShieldCheckIcon,
  ServerStackIcon,
  DocumentDuplicateIcon,
  InformationCircleIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import { safeArray } from '../lib/display';

export interface TimelineEventItem {
  id: string;
  stage: string;
  title: string;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'SKIPPED';
  timestamp: string;
  details?: string;
  telemetry?: Record<string, any>;
  source_origin?: string; // e.g. 'QUEUE', 'WORKER', 'ARTIFACT', 'AUDIT_LOG'
}

interface ExecutionTimelineProps {
  events: TimelineEventItem[];
  isLoading?: boolean;
}

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({ events, isLoading }) => {
  const safeEvents = safeArray(events);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [compactMode, setCompactMode] = useState<boolean>(true); // Default to compact noise mode
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getStageIcon = (stage: string, status: string) => {
    if (status === 'FAILURE') return <XCircleIcon className="w-3 h-3 text-red-600 dark:text-red-400" />;
    switch (stage.toUpperCase()) {
      case 'INGRESS': return <ShieldCheckIcon className="w-3 h-3 text-slate-400" />;
      case 'QUEUED': return <ServerStackIcon className="w-3 h-3 text-slate-400" />;
      case 'ASSIGNED': return <CpuChipIcon className="w-3 h-3 text-slate-400" />;
      case 'PROCESSING': return <DocumentArrowDownIcon className="w-3 h-3 text-amber-600" />;
      case 'COMPLETED': return <CheckCircleIcon className="w-3 h-3 text-emerald-600/60" />;
      default: return <ClockIcon className="w-3 h-3 text-slate-400" />;
    }
  };

  const getStageAccent = (stage: string, status: string) => {
    // Task 6: Color priority system — SUCCESS: muted green, WARNING: amber, FAILURE: strong red, INFO: neutral/slate
    if (status === 'FAILURE') return 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300 font-black';
    switch (stage.toUpperCase()) {
      case 'COMPLETED': return 'border-emerald-700/20 bg-transparent text-emerald-700/60 dark:text-emerald-500/50 font-normal';
      case 'PROCESSING': return 'border-amber-500/30 bg-amber-50/20 text-amber-700 dark:text-amber-400 font-bold';
      default: return 'border-slate-200 dark:border-white/5 bg-transparent text-slate-500 dark:text-zinc-400 font-normal';
    }
  };

  const getOriginBadge = (evt: TimelineEventItem, stage: string) => {
    const origin = evt.source_origin?.toUpperCase() || '';
    if (origin.includes('QUEUE') || stage === 'QUEUED') return { label: 'Q', bg: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#1a1a1b] dark:border-white/[0.04]', desc: 'Redis Queue Pipe' };
    if (origin.includes('WORKER') || stage === 'PROCESSING' || stage === 'ASSIGNED') return { label: 'W', bg: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#1a1a1b] dark:border-white/[0.04]', desc: 'Worker Fleet Node' };
    if (origin.includes('ARTIFACT')) return { label: 'A', bg: 'bg-amber-50/40 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400', desc: 'Storage Artifact Handle' };
    return { label: 'L', bg: 'bg-transparent text-slate-400 border-slate-100 dark:border-white/[0.02]', desc: 'Persistent Audit Ledger' };
  };

  if (isLoading) {
    return (
      <div className="p-4 border border-slate-100 bg-slate-50/50 dark:bg-[#131314] dark:border-white/5 space-y-2 animate-pulse">
        <div className="h-3 bg-slate-200 dark:bg-white/10 w-1/4" />
        <div className="h-8 bg-slate-100 dark:bg-white/5 w-full" />
        <div className="h-8 bg-slate-100 dark:bg-white/5 w-full" />
      </div>
    );
  }

  if (!safeEvents || safeEvents.length === 0) {
    return (
      <div className="p-3 border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/20 dark:bg-transparent text-center italic-text-off">
        <InformationCircleIcon className="w-4 h-4 text-slate-400 mx-auto mb-1" />
        <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-widest">No sequential execution traces captured</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 italic-text-off font-mono select-none">
      {/* High-Density Control Bar */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-white/10 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Stage Traces</span>
          <span className="px-1 py-0.2 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-zinc-400 border dark:border-white/10 font-bold">{safeEvents.length} Checkpoints</span>
        </div>
        
        <button 
          onClick={() => setCompactMode(!compactMode)}
          className="flex items-center gap-1 px-2 py-0.5 bg-slate-50 dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-zinc-300 font-bold transition-colors"
          title="Toggle scan density compression"
        >
          {compactMode ? <EyeIcon className="w-3 h-3 text-primary" /> : <EyeSlashIcon className="w-3 h-3" />}
          <span>{compactMode ? 'Noise Suppressed' : 'Expanded Details'}</span>
        </button>
      </div>

      <div className="relative pl-5 space-y-1.5">
        {/* Compressed Backbone Guide */}
        <div className="absolute left-[9px] top-2 bottom-2 w-[1px] bg-slate-200 dark:bg-white/10" />

        {safeEvents.map((evt, idx) => {
          const accentClasses = getStageAccent(evt.stage, evt.status);
          const isError = evt.status === 'FAILURE';
          const titleUpper = evt.title.toUpperCase();
          const isRetry = titleUpper.includes('RETRY') || titleUpper.includes('ATTEMPT');
          const isArtifactErr = titleUpper.includes('ARTIFACT') && isError;
          const originBadge = getOriginBadge(evt, evt.stage);
          
          // Calculate precise runtime duration delta inline
          let deltaString = '';
          let diff = 0;
          if (idx > 0 && safeEvents[idx - 1].timestamp && evt.timestamp) {
            diff = new Date(evt.timestamp).getTime() - new Date(safeEvents[idx - 1].timestamp).getTime();
            if (!isNaN(diff) && diff >= 0) {
              deltaString = `+${diff}ms`;
            }
          }

          const isLongDuration = diff > 1500; // Queue bottlenecks emphasized
          const uniqueKey = evt.id || String(idx);
          
          // Task 3 & 4: Timeline prioritization — Retries expand automatically, failures auto-highlight. Successful logs collapsed.
          const isRowExpanded = !compactMode || expandedIds[uniqueKey] || isError || isRetry || isArtifactErr;
          const hasInnerData = evt.details || (evt.telemetry && Object.keys(evt.telemetry).length > 0);

          return (
            <div key={uniqueKey} className="relative group text-xs">
              {/* Ultra-Compact Timeline Connector Pin */}
              <div className={`absolute -left-5 top-1.5 w-4 h-4 rounded-none border flex items-center justify-center bg-white dark:bg-[#131314] ${
                isError ? 'border-red-500 bg-red-50 dark:bg-red-950' : 
                isRetry ? 'border-amber-500' : 'border-slate-300 dark:border-white/20'
              }`}>
                {getStageIcon(evt.stage, evt.status)}
              </div>

              {/* Compressed Box Wrapper with Elevated Emphasis for Risks */}
              <div className={`border transition-all ${
                isError ? 'bg-red-50/60 dark:bg-red-950/20 border-red-300 dark:border-red-800/60' : 
                isRetry ? 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-300 dark:border-amber-700/50' : 
                'bg-white dark:bg-[#131314] border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
              }`}>
                
                {/* Primary Inline Flex Row */}
                <div className="p-1.5 flex flex-wrap items-center justify-between gap-2 leading-none">
                  
                  {/* Left Side: Identifiers */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {/* Origin Token Micro-Chip */}
                    <span 
                      className={`w-3.5 h-3.5 flex items-center justify-center text-[8px] font-black border leading-none shrink-0 ${originBadge.bg}`}
                      title={`Origin: ${originBadge.desc}`}
                    >
                      {originBadge.label}
                    </span>

                    {/* Stage Chip */}
                    <span className={`px-1.5 py-0.5 text-[8px] font-black tracking-widest border uppercase shrink-0 ${accentClasses}`}>
                      {evt.stage}
                    </span>

                    {/* Action Title: Dimmed if healthy, bold if risky */}
                    <span className={`truncate ${
                      isError ? 'text-red-800 dark:text-red-300 font-black' : 
                      isRetry ? 'text-amber-900 dark:text-amber-300 font-bold' : 
                      evt.stage === 'COMPLETED' ? 'text-slate-500 dark:text-zinc-500 font-normal' : 'text-slate-900 dark:text-white font-medium'
                    }`} title={evt.title}>
                      {evt.title}
                    </span>

                    {/* Inline Delta Indicator: elevated if bottlenecked */}
                    {deltaString && (
                      <span className={`text-[9px] font-black px-1 py-0.2 border shrink-0 ${
                        isLongDuration ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 animate-pulse' : 
                        'text-slate-400 bg-slate-50 border-slate-100 dark:bg-transparent dark:border-white/[0.03] dark:text-zinc-600'
                      }`} title={isLongDuration ? 'Queue Bottleneck / Long Transition Duration' : 'Delta runtime'}>
                        {deltaString}
                      </span>
                    )}

                    {/* Compact Inner Data Indicator Button */}
                    {compactMode && hasInnerData && !isError && !isRetry && (
                      <button 
                        onClick={() => toggleExpand(uniqueKey)}
                        className="px-1 text-[8px] font-bold text-slate-400 dark:text-zinc-600 hover:text-primary tracking-tighter uppercase underline"
                      >
                        {expandedIds[uniqueKey] ? 'Hide' : 'Inspect'}
                      </button>
                    )}
                  </div>

                  {/* Right Side: Timestamp & Tools */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] font-mono ${isError ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-400 dark:text-zinc-600 font-normal'}`}>
                      {evt.timestamp ? new Date(evt.timestamp).toISOString().split('T')[1]?.replace('Z', '') : '---'}
                    </span>
                    
                    <button 
                      onClick={() => handleCopy(evt.details || evt.title, uniqueKey)}
                      title="Copy frame details"
                      className="text-slate-300 dark:text-zinc-700 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                    >
                      {copiedId === uniqueKey ? (
                        <span className="text-[7px] font-black text-emerald-600 dark:text-emerald-500 uppercase">Copied</span>
                      ) : (
                        <DocumentDuplicateIcon className="w-2.5 h-2.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Telemetry Sub-Pane (Rendered when Auto-Expanded or Clicked) */}
                {isRowExpanded && hasInnerData && (
                  <div className={`p-1.5 border-t text-[10px] space-y-1 select-text ${
                    isError ? 'border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/10' : 
                    isRetry ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/5' : 
                    'border-slate-100 dark:border-white/[0.04] bg-slate-50/80 dark:bg-[#1a1a1b]/40'
                  }`}>
                    {evt.details && (
                      <p className={`font-sans leading-tight break-all ${
                        isError ? 'text-red-800 dark:text-red-300 font-bold' : 
                        isRetry ? 'text-amber-900 dark:text-amber-300 font-medium' : 'text-slate-600 dark:text-zinc-400'
                      }`}>
                        {evt.details}
                      </p>
                    )}

                    {evt.telemetry && Object.keys(evt.telemetry).length > 0 && (
                      <div className="pt-1 border-t border-slate-200/60 dark:border-white/[0.04]">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-0.5 font-mono">
                          {Object.entries(evt.telemetry).map(([k, v]) => (
                            <div key={k} className="flex items-baseline justify-between gap-1 overflow-hidden">
                              <span className="text-slate-400 dark:text-zinc-500 text-[9px] truncate">{k}:</span>
                              <span className={`text-[9px] font-bold truncate ${
                                typeof v === 'boolean' ? (v ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-400 dark:text-zinc-600') : 
                                isError ? 'text-red-900 dark:text-red-200 font-black' : 'text-slate-800 dark:text-zinc-300'
                              }`}>
                                {String(v)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
