import React from 'react';

export type BadgeStatus = 
  | 'COMPLETED' 
  | 'IN_PROGRESS' 
  | 'QUEUED' 
  | 'FAILED' 
  | 'OFFLINE' 
  | 'DEGRADED' 
  | 'ACTIVE' 
  | 'SUSPENDED'
  | 'PENDING'
  | 'INFO'
  | string;

export interface StatusBadgeProps {
  status: BadgeStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const normStatus = String(status).toUpperCase();
  
  // Resolve industrial cinematic dark tokens as per specification
  let classes = "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 hover:dark:bg-zinc-700";

  if (normStatus.includes('ACTIVE') || normStatus.includes('LIVE') || normStatus.includes('COMPLETED') || normStatus.includes('SUCCESS') || normStatus.includes('SUCCEEDED')) {
    classes = "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400";
  } else if (normStatus.includes('SUSPENDED') || normStatus.includes('DEGRADED') || normStatus.includes('WARN')) {
    classes = "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400";
  } else if (normStatus.includes('FAIL') || normStatus.includes('ERROR') || normStatus.includes('REJECTED')) {
    classes = "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400";
  } else if (normStatus.includes('INFO') || normStatus.includes('PROGRESS') || normStatus.includes('PROCESSING') || normStatus.includes('RUNNING')) {
    classes = "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50 text-sky-700 dark:text-sky-400";
  } else if (normStatus.includes('QUEUED') || normStatus.includes('PENDING') || normStatus.includes('IDLE')) {
    classes = "bg-amber-50/50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-900/50 text-amber-600 dark:text-amber-400/90";
  }

  return (
    <span 
      className={`font-manrope text-[11px] font-semibold tracking-wide uppercase px-2 py-1 rounded-none border inline-flex items-center justify-center transition-colors ${classes} ${className}`}
    >
      {status}
    </span>
  );
};
