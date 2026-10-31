/**
 * src/ui/components/common/StatusBadge.tsx
 *
 * Canonical Dark Industrial Telemetry Status Pill ('ACTIVE', 'INACTIVE', 'OFFLINE', 'QUEUED', 'HEALTHY', etc.).
 */
import React from 'react';
import { StatusBadge as BaseStatusBadge, BadgeStatus, StatusBadgeProps as BaseProps } from '../StatusBadge';

export type { BadgeStatus };

export interface StatusBadgeProps extends BaseProps {
    showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '', showDot = true }) => {
    const norm = String(status || '').toUpperCase();

    let dotColor = 'bg-slate-400';
    let pillStyle = 'bg-[#14161a] border-[#1f2228] text-slate-300';

    if (norm === 'ACTIVE' || norm === 'HEALTHY' || norm === 'ONLINE' || norm === 'COMPLETED' || norm === 'COMPLETE' || norm === 'SYNCED') {
        dotColor = 'bg-[#10b981]';
        pillStyle = 'bg-emerald-950/40 border-emerald-500/30 text-[#10b981]';
    } else if (norm === 'QUEUED' || norm === 'IN_PROGRESS' || norm === 'WARNING' || norm === 'DEGRADED' || norm === 'PROCESSING' || norm === 'UNDER MAINTENANCE') {
        dotColor = 'bg-[#f59e0b]';
        pillStyle = 'bg-amber-950/40 border-amber-500/30 text-[#f59e0b]';
    } else if (norm === 'OFFLINE' || norm === 'FAILED' || norm === 'ERROR' || norm === 'REJECTED') {
        dotColor = 'bg-[#dc2626]';
        pillStyle = 'bg-red-950/40 border-red-500/30 text-red-400';
    } else if (norm === 'INFO' || norm === 'RUNNING') {
        dotColor = 'bg-[#3b82f6]';
        pillStyle = 'bg-blue-950/40 border-blue-500/30 text-[#3b82f6]';
    } else if (norm === 'INACTIVE' || norm === 'DISABLED' || norm === 'STANDBY') {
        dotColor = 'bg-[#64748b]';
        pillStyle = 'bg-slate-900/60 border-[#1f2228] text-[#94a3b8]';
    } else {
        return <BaseStatusBadge status={status} className={className} />;
    }

    return (
        <span
            data-testid={`status-badge-${norm.toLowerCase()}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors ${pillStyle} ${className}`}
        >
            {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />}
            <span>{status}</span>
        </span>
    );
};

