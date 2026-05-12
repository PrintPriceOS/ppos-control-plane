import React from 'react';
import { TYPOGRAPHY } from '../design-system/tokens';

export interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode; // Long explanatory texts use Inter
  actions?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  description,
  actions,
  className = ''
}) => {
  return (
    <div className={`flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[#1F2430] pb-4 ${className}`}>
      <div className="space-y-1 max-w-3xl">
        <div className="flex items-center gap-3">
          <h2 className={TYPOGRAPHY.scale.h2.className} style={{ color: '#E6E6EB' }}>
            {title}
          </h2>
          {subtitle && (
            <span className="font-manrope text-[12px] font-semibold text-[#dc0000] bg-[#dc0000]/10 px-2 py-0.5 border border-[#dc0000]/20 uppercase tracking-wider">
              {subtitle}
            </span>
          )}
        </div>
        {description && (
          <p className="font-inter text-[14px] font-normal leading-relaxed text-[#8F96A3]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
