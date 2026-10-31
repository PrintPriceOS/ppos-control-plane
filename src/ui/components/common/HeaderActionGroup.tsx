/**
 * src/ui/components/common/HeaderActionGroup.tsx
 *
 * Canonical Dark Industrial Telemetry Header:
 * - H1 white title + descriptive subtitle in `text-slate-400`
 * - Contextual navigation tabs (`PROFILES | ROUTING DECISIONS` or equivalent)
 * - Primary action button in white with black text (`+ NEW ...`)
 */
import React from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';

export interface HeaderTabOption {
    id: string;
    label: string;
    badge?: string | number;
}

export interface HeaderActionGroupProps {
    title: string;
    subtitle?: string;
    tabs?: HeaderTabOption[];
    activeTabId?: string;
    onTabChange?: (tabId: string) => void;
    primaryActionLabel?: string;
    onPrimaryAction?: () => void;
    secondaryActions?: React.ReactNode;
    mode?: 'onboarding' | 'workspace';
}

export const HeaderActionGroup: React.FC<HeaderActionGroupProps> = ({
    title,
    subtitle,
    tabs = [],
    activeTabId,
    onTabChange,
    primaryActionLabel,
    onPrimaryAction,
    secondaryActions,
    mode = 'workspace'
}) => {
    return (
        <div
            data-testid="header-action-group"
            data-mode={mode}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
            <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white m-0">
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-sm font-medium text-slate-400 mt-1 m-0">
                        {subtitle}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                {tabs.length > 0 && (
                    <div
                        role="tablist"
                        className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#0f1013] border border-slate-200 dark:border-[#1f2228]"
                    >
                        {tabs.map(tab => {
                            const isActive = tab.id === activeTabId;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => onTabChange?.(tab.id)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                                        isActive
                                            ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                                            : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    <span>{tab.label}</span>
                                    {tab.badge !== undefined && (
                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/10">
                                            {tab.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {secondaryActions}

                {primaryActionLabel && onPrimaryAction && (
                    <button
                        type="button"
                        data-testid="header-primary-action-btn"
                        onClick={onPrimaryAction}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all bg-white text-black hover:bg-slate-100 border border-slate-300 dark:border-white/20 cursor-pointer shrink-0 shadow-xs"
                    >
                        <PlusIcon className="w-4 h-4 stroke-[2.5]" />
                        <span>{primaryActionLabel}</span>
                    </button>
                )}
            </div>
        </div>
    );
};

