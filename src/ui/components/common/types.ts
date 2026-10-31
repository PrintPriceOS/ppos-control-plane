/**
 * src/ui/components/common/types.ts
 *
 * Canonical Dark Industrial Telemetry UI Design System Tokens & Dual-Mode Contracts.
 */
import React from 'react';

export interface SharedModuleProps {
    mode?: 'onboarding' | 'workspace';
    onNextStep?: () => void;
    onPrevStep?: () => void;
    printhouseId?: string;
}

export const INDUSTRIAL_TELEMETRY_TOKENS = Object.freeze({
    bgPrimary: '#0a0b0d',
    bgSecondary: '#0f1013',
    surfaceCard: '#14161a',
    surfaceHover: '#181b20',
    borderCard: '#1f2228',
    activeNavPillRed: '#dc2626',
    activeNavPillRose: '#e11d48',
    statusHealthy: '#10b981',
    statusWarning: '#f59e0b',
    statusInfo: '#3b82f6',
    textMuted: '#94a3b8',
    textSecondary: '#64748b'
});

export interface SummaryKpiItem {
    id?: string;
    label: string;
    value: string | number;
    subvalue?: string;
    icon?: React.ComponentType<{ className?: string }>;
    accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
}

