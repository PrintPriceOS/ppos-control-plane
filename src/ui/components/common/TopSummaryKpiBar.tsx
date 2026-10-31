/**
 * src/ui/components/common/TopSummaryKpiBar.tsx
 *
 * Canonical row of 4 condensed Dark Industrial Telemetry KPI cards:
 * - Uppercase label (`text-xs tracking-wider text-slate-400`)
 * - Monospace numeric highlight value
 * - Right-aligned themed icon container with subtle background
 */
import React from 'react';
import { SummaryKpiItem } from './types';

export interface TopSummaryKpiBarProps {
    items: SummaryKpiItem[];
    className?: string;
}

const ACCENT_MAP: Record<NonNullable<SummaryKpiItem['accent']>, { iconColor: string; iconBg: string }> = {
    blue: {
        iconColor: 'text-[#3b82f6]',
        iconBg: 'bg-blue-500/10 border border-blue-500/20'
    },
    emerald: {
        iconColor: 'text-[#10b981]',
        iconBg: 'bg-emerald-500/10 border border-emerald-500/20'
    },
    amber: {
        iconColor: 'text-[#f59e0b]',
        iconBg: 'bg-amber-500/10 border border-amber-500/20'
    },
    rose: {
        iconColor: 'text-[#e11d48]',
        iconBg: 'bg-rose-500/10 border border-rose-500/20'
    },
    slate: {
        iconColor: 'text-[#94a3b8]',
        iconBg: 'bg-slate-500/10 border border-slate-500/20'
    }
};

export const TopSummaryKpiBar: React.FC<TopSummaryKpiBarProps> = ({ items, className = '' }) => {
    return (
        <div
            data-testid="top-summary-kpi-bar"
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}
        >
            {items.map((item, idx) => {
                const accent = ACCENT_MAP[item.accent || 'blue'];
                const Icon = item.icon;
                return (
                    <div
                        key={item.id || idx}
                        data-testid={`kpi-card-${idx}`}
                        className="p-4 rounded-xl bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#1f2228] flex items-center justify-between transition-all shadow-2xs"
                    >
                        <div className="min-w-0">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 truncate">
                                {item.label}
                            </div>
                            <div className="text-xl font-mono font-black tracking-tight text-slate-900 dark:text-white mt-1">
                                {item.value}
                            </div>
                            {item.subvalue && (
                                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                    {item.subvalue}
                                </div>
                            )}
                        </div>
                        {Icon && (
                            <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent.iconBg} ${accent.iconColor}`}
                            >
                                <Icon className="w-5 h-5" />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

