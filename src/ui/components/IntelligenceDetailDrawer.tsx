import React from 'react';
import { Drawer } from './Drawer';
import { 
  ExclamationTriangleIcon, 
  CpuChipIcon, 
  WrenchScrewdriverIcon,
  ClockIcon,
  TagIcon,
  BeakerIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

interface IntelligenceDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  type: 'anomaly' | 'insight' | 'recommendation';
}

export const IntelligenceDetailDrawer: React.FC<IntelligenceDetailDrawerProps> = ({
  isOpen,
  onClose,
  data,
  type
}) => {
  if (!data) return null;

  const getHeaderIcon = () => {
    switch (type) {
      case 'anomaly': return <ExclamationTriangleIcon className="w-8 h-8 text-amber-500" />;
      case 'insight': return <CpuChipIcon className="w-8 h-8 text-blue-500" />;
      case 'recommendation': return <WrenchScrewdriverIcon className="w-8 h-8 text-emerald-500" />;
    }
  };

  const getBadgeColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'HIGH': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'MEDIUM': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`${type.toUpperCase()} DETAILS`}>
      <div className="space-y-8">
        {/* Header Info */}
        <div className="flex items-start gap-5 p-6 bg-slate-50 rounded-3xl border border-slate-100">
          <div className="p-3 bg-white rounded-2xl shadow-sm">
            {getHeaderIcon()}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${getBadgeColor(data.severity)}`}>
                {data.severity}
              </span>
              <span className="text-[11px] font-black text-slate-400 font-mono">
                {data.id}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 leading-tight">
              {data.summary || data.category}
            </h3>
          </div>
        </div>

        {/* Core Content */}
        <div className="space-y-6 px-2">
          <section className="space-y-3">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <TagIcon className="w-4 h-4" /> Description & Rationale
            </h4>
            <p className="text-slate-600 font-medium leading-relaxed">
              {data.reason || data.explanation || data.rationale}
            </p>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Affected Entity</span>
              <p className="font-bold text-slate-900 truncate">{data.entityType}: {data.entityId}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detection Time</span>
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <ClockIcon className="w-4 h-4 text-slate-400" />
                <span>{new Date(data.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          {/* Evidence / Metrics */}
          {data.evidence && (
            <section className="space-y-3">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <BeakerIcon className="w-4 h-4" /> Evidence Captured
              </h4>
              <div className="p-5 bg-slate-900 rounded-2xl font-mono text-xs text-blue-300 overflow-x-auto shadow-inner">
                <pre>{JSON.stringify(data.evidence, null, 2)}</pre>
              </div>
            </section>
          )}

          {/* Contract Context */}
          {data.contractContext && (
            <section className="space-y-3">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4" /> Contract Posture
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.contractContext).map(([k, v]: [string, any]) => (
                  <span key={k} className="px-3 py-1.5 bg-primary/5 text-primary border border-primary/10 rounded-lg text-xs font-bold">
                    {k}: {v}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Action Call for Recommendations */}
          {type === 'recommendation' && (
            <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-emerald-800">
                <WrenchScrewdriverIcon className="w-6 h-6" />
                <h4 className="font-black">Suggested Manual Action</h4>
              </div>
              <p className="text-emerald-700 font-medium">{data.suggestedAction}</p>
              <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Manual Only Mode Active
              </div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};
