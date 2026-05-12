import React from 'react';
import { TYPOGRAPHY } from '../design-system/tokens';

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
    <div className={`bg-[#131314] border border-[#1F2430] p-4 flex flex-col justify-between rounded-none ${className}`}>
      <span className="font-manrope text-[11px] font-semibold uppercase tracking-[0.4px] text-[#8F96A3] block">
        {label}
      </span>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={TYPOGRAPHY.scale.h1.className} style={{ color: '#E6E6EB' }}>
          {value}
        </span>
        {trend && (
          <span className={`font-manrope text-[11px] font-bold ${trend === 'up' ? 'text-[#10B981]' : trend === 'down' ? 'text-[#EF4444]' : 'text-[#8F96A3]'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '•'}
          </span>
        )}
      </div>
      {subtext && (
        <span className="font-manrope text-[11px] text-[#8F96A3] block mt-1">
          {subtext}
        </span>
      )}
    </div>
  );
};
