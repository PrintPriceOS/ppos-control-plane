import React from 'react';
import { TYPOGRAPHY, COLORS } from '../design-system/tokens';

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ 
  label, 
  value, 
  subtext, 
  trend,
  className = '' 
}) => {
  return (
    <div className={`${COLORS.cards.base} flex flex-col justify-between ${className}`}>
      <span className={`font-manrope text-[11px] font-semibold uppercase tracking-[0.4px] ${COLORS.adaptive.textMuted} block`}>
        {label}
      </span>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`${TYPOGRAPHY.scale.h1.className} ${COLORS.adaptive.textPrimary}`}>
          {value}
        </span>
        {trend && (
          <span className={`font-manrope text-[11px] font-bold ${trend === 'up' ? 'text-[#10B981]' : trend === 'down' ? 'text-[#EF4444]' : COLORS.adaptive.textMuted}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '•'}
          </span>
        )}
      </div>
      {subtext && (
        <span className={`font-manrope text-[11px] ${COLORS.adaptive.textMuted} block mt-1`}>
          {subtext}
        </span>
      )}
    </div>
  );
};
