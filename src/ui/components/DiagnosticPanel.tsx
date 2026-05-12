import React from 'react';

export interface DiagnosticPanelProps {
  title?: React.ReactNode;
  content: string | object | null | undefined;
  variant?: 'neutral' | 'error' | 'success' | 'warning';
  className?: string;
}

export const DiagnosticPanel: React.FC<DiagnosticPanelProps> = ({
  title = "Telemetry Payload Snapshot",
  content,
  variant = 'neutral',
  className = ''
}) => {
  let borderColor = '#1F2430';
  let bannerBg = '#0B0F14';
  let titleColor = '#8F96A3';

  if (variant === 'error') {
    borderColor = 'rgba(239, 68, 68, 0.3)';
    bannerBg = 'rgba(239, 68, 68, 0.05)';
    titleColor = '#EF4444';
  } else if (variant === 'success') {
    borderColor = 'rgba(16, 185, 129, 0.3)';
    bannerBg = 'rgba(16, 185, 129, 0.05)';
    titleColor = '#10B981';
  } else if (variant === 'warning') {
    borderColor = 'rgba(245, 158, 11, 0.3)';
    bannerBg = 'rgba(245, 158, 11, 0.05)';
    titleColor = '#F59E0B';
  }

  const rawString = typeof content === 'string' 
    ? content 
    : content 
      ? JSON.stringify(content, null, 2) 
      : '// Payload is undefined or null';

  return (
    <div className={`bg-[#0B0F14] border rounded-none overflow-hidden ${className}`} style={{ borderColor }}>
      <div className="px-3 py-2 border-b font-manrope text-[11px] font-bold tracking-[0.4px] uppercase flex items-center justify-between" style={{ borderColor, backgroundColor: bannerBg, color: titleColor }}>
        <span>{title}</span>
        <span className="text-[9px] opacity-60 lowercase font-mono">raw_json</span>
      </div>
      <pre className="p-3 font-mono text-[11px] text-[#8F96A3] overflow-x-auto max-h-96 custom-scrollbar leading-relaxed">
        {rawString}
      </pre>
    </div>
  );
};
