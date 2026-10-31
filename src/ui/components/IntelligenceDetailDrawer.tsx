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
import { COLORS } from '../design-system/tokens';

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
      case 'recommendation': return <WrenchScrewdriverIcon className="w-8 h-8 text-[#10B981]" />;
    }
  };

  const getBadgeColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-[#dc0000]/10 text-[#dc0000] border-[#dc0000]/20';
      case 'HIGH': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'MEDIUM': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return `${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.textSecondary} ${COLORS.adaptive.borderSubtle}`;
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`${type.toUpperCase()} DETAILS`} maxWidth="max-w-xl">
      <div className={`space-y-8 italic-text-off ${COLORS.adaptive.textPrimary}`}>
        {/* Header Info */}
        <div className={`flex items-start gap-5 p-6 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle}`}>
          <div className={`p-3 ${COLORS.adaptive.surface} rounded-none border ${COLORS.adaptive.borderPrimary}`}>
            {getHeaderIcon()}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`px-2.5 py-0.5 rounded-none text-[10px] font-black uppercase border ${getBadgeColor(data.severity)}`}>
                {data.severity || 'INFO'}
              </span>
              <span className={`text-[11px] font-black ${COLORS.adaptive.textMuted} font-mono`}>
                {data.id}
              </span>
            </div>
            <h3 className={`text-xl font-black ${COLORS.adaptive.textPrimary} leading-tight`}>
              {data.summary || data.category}
            </h3>
          </div>
        </div>

        {/* Core Content */}
        <div className="space-y-6 px-2">
          <section className="space-y-3">
            <h4 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest flex items-center gap-2`}>
              <TagIcon className="w-4 h-4" /> Description & Rationale
            </h4>
            <p className={`${COLORS.adaptive.textSecondary} font-medium leading-relaxed`}>
              {data.reason || data.explanation || data.rationale}
            </p>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <div className={`p-4 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} space-y-1`}>
              <span className={`text-[10px] font-bold ${COLORS.adaptive.textMuted} uppercase tracking-wider`}>Affected Entity</span>
              <p className={`font-bold ${COLORS.adaptive.textPrimary} truncate`}>{data.entityType}: {data.entityId}</p>
            </div>
            <div className={`p-4 ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} space-y-1`}>
              <span className={`text-[10px] font-bold ${COLORS.adaptive.textMuted} uppercase tracking-wider`}>Detection Time</span>
              <div className={`flex items-center gap-2 font-bold ${COLORS.adaptive.textPrimary}`}>
                <ClockIcon className={`w-4 h-4 ${COLORS.adaptive.textMuted}`} />
                <span>{new Date(data.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          {/* Evidence / Metrics */}
          {data.evidence && (
            <section className="space-y-3">
              <h4 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest flex items-center gap-2`}>
                <BeakerIcon className="w-4 h-4" /> Evidence Captured
              </h4>
              <div className={`p-5 bg-black/40 border ${COLORS.adaptive.borderSubtle} rounded-none font-mono text-xs ${COLORS.adaptive.textPrimary} overflow-x-auto`}>
                <pre>{JSON.stringify(data.evidence, null, 2)}</pre>
              </div>
            </section>
          )}

          {/* Contract Context */}
          {data.contractContext && (
            <section className="space-y-3">
              <h4 className={`text-xs font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest flex items-center gap-2`}>
                <ShieldCheckIcon className="w-4 h-4" /> Contract Posture
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.contractContext).map(([k, v]: [string, any]) => (
                  <span key={k} className={`px-3 py-1.5 ${COLORS.adaptive.surface} ${COLORS.adaptive.textSecondary} border ${COLORS.adaptive.borderPrimary} rounded-none text-xs font-bold`}>
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Action Call for Recommendations */}
          {type === 'recommendation' && (
            <div className={`p-6 ${COLORS.adaptive.surfaceMuted} border border-[#10B981]/30 rounded-none space-y-4`}>
              <div className="flex items-center gap-3 text-[#10B981]">
                <WrenchScrewdriverIcon className="w-6 h-6" />
                <h4 className="font-black">Suggested Manual Action</h4>
              </div>
              <p className={COLORS.adaptive.textPrimary}>{data.suggestedAction}</p>
              <div className="flex items-center gap-2 text-[10px] font-black text-[#10B981] uppercase tracking-widest">
                <span className="w-2 h-2 bg-[#10B981] rounded-none animate-pulse" />
                Manual Only Mode Active
              </div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};
