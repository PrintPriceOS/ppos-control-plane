import React from 'react';
import { COLORS } from '../design-system/tokens';

export type BadgeStatus = 
  | 'COMPLETED' 
  | 'IN_PROGRESS' 
  | 'QUEUED' 
  | 'FAILED' 
  | 'OFFLINE' 
  | 'DEGRADED' 
  | 'ACTIVE' 
  | 'PENDING'
  | string;

export interface StatusBadgeProps {
  status: BadgeStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const normStatus = String(status).toUpperCase();
  
  // Resolve colors using unified tokens
  let styleConfig = COLORS.badges.offline;
  if (normStatus.includes('COMPLETED') || normStatus.includes('SUCCESS')) {
    styleConfig = COLORS.badges.completed;
  } else if (normStatus.includes('PROGRESS') || normStatus.includes('PROCESSING') || normStatus.includes('RUNNING')) {
    styleConfig = COLORS.badges.inProgress;
  } else if (normStatus.includes('QUEUED')) {
    styleConfig = COLORS.badges.queued;
  } else if (normStatus.includes('FAIL') || normStatus.includes('ERROR') || normStatus.includes('REJECTED')) {
    styleConfig = COLORS.badges.failed;
  } else if (normStatus.includes('DEGRADED') || normStatus.includes('WARN')) {
    styleConfig = COLORS.badges.degraded;
  } else if (normStatus.includes('ACTIVE') || normStatus.includes('LIVE')) {
    styleConfig = COLORS.badges.active;
  } else if (normStatus.includes('PENDING') || normStatus.includes('IDLE')) {
    styleConfig = COLORS.badges.pending;
  }

  return (
    <span 
      className={`font-manrope text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-none border inline-flex items-center justify-center ${className}`}
      style={{
        backgroundColor: styleConfig.bg,
        color: styleConfig.text,
        borderColor: styleConfig.border,
      }}
    >
      {status}
    </span>
  );
};
