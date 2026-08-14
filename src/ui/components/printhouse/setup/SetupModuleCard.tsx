/**
 * src/ui/components/printhouse/setup/SetupModuleCard.tsx
 * 
 * Displays an individual onboarding module card.
 */
import React from 'react';
import { ArrowRight, CheckCircle, Clock, Lock, AlertCircle } from 'lucide-react';

interface SetupModuleCardProps {
    title: string;
    description: string;
    status: 'COMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED' | 'NEEDS_ATTENTION' | 'LOCKED';
    isActionable: boolean;
    icon?: React.ReactNode;
    missingRequirements?: string[];
    dependencyHint?: string;
    onAction?: () => void;
}

export const SetupModuleCard: React.FC<SetupModuleCardProps> = ({
    title,
    description,
    status,
    isActionable,
    icon,
    missingRequirements = [],
    dependencyHint,
    onAction
}) => {
    const getCtaLabel = () => {
        if (status === 'COMPLETE') return 'Review / Edit';
        if (status === 'IN_PROGRESS') return 'Continue Setup';
        return 'Start Setup';
    };

    const isLocked = !isActionable;

    // State-aware icon background & color mapping
    const getIconStyles = () => {
        if (isLocked) {
            return {
                bg: 'bg-zinc-100 dark:bg-zinc-800',
                color: 'text-zinc-400 dark:text-zinc-500',
                border: 'border-zinc-200 dark:border-zinc-700'
            };
        }
        if (status === 'COMPLETE') {
            return {
                bg: 'bg-emerald-50 dark:bg-emerald-950/40',
                color: 'text-emerald-600 dark:text-emerald-400',
                border: 'border-emerald-200 dark:border-emerald-800/60'
            };
        }
        if (status === 'IN_PROGRESS') {
            return {
                bg: 'bg-amber-50 dark:bg-amber-950/40',
                color: 'text-amber-600 dark:text-amber-400',
                border: 'border-amber-200 dark:border-amber-800/60'
            };
        }
        if (status === 'NEEDS_ATTENTION') {
            return {
                bg: 'bg-red-50 dark:bg-red-950/40',
                color: 'text-red-600 dark:text-red-400',
                border: 'border-red-200 dark:border-red-800/60'
            };
        }
        return {
            bg: 'bg-zinc-100 dark:bg-zinc-800',
            color: 'text-zinc-600 dark:text-zinc-300',
            border: 'border-zinc-200 dark:border-zinc-700'
        };
    };

    const iconStyle = getIconStyles();

    return (
        <div
            className={`group ${
                isLocked 
                    ? 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/80 shadow-none' 
                    : status === 'COMPLETE'
                        ? 'bg-white dark:bg-[#18181b] border-emerald-500/80 dark:border-emerald-500/60 shadow-xs'
                        : status === 'NEEDS_ATTENTION'
                            ? 'bg-white dark:bg-[#18181b] border-red-500/80 dark:border-red-500/60 shadow-xs'
                            : 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-[#27272a] shadow-xs'
            } border rounded-xl p-6 flex flex-col justify-between transition-all hover:shadow-md`}
        >
            <div>
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <div 
                                aria-hidden="true"
                                className={`w-[38px] h-[38px] rounded-lg border flex items-center justify-center shrink-0 transition-transform duration-180 ease-out group-hover:scale-105 ${iconStyle.bg} ${iconStyle.color} ${iconStyle.border}`}
                            >
                                <span className="inline-flex scale-[1.3]">
                                    {icon}
                                </span>
                            </div>
                        )}
                        <div>
                            <h3 className={`text-sm font-bold m-0 ${isLocked ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-white'}`}>
                                {title}
                            </h3>
                        </div>
                    </div>
                    <div>
                        {status === 'COMPLETE' && <CheckCircle size={18} className="text-emerald-500" />}
                        {status === 'IN_PROGRESS' && <Clock size={18} className="text-amber-600 dark:text-amber-500" />}
                        {status === 'NEEDS_ATTENTION' && <AlertCircle size={18} className="text-red-500" />}
                        {isLocked && <Lock size={18} className="text-zinc-400 dark:text-zinc-600" />}
                    </div>
                </div>
                <p className={`text-xs leading-relaxed mb-3.5 ${isLocked ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-600 dark:text-zinc-400'}`}>
                    {description}
                </p>

                {missingRequirements.length > 0 && status !== 'COMPLETE' && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg p-2.5 sm:px-3 mb-4">
                        <div className="text-[11px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider mb-1">
                            Missing Requirements:
                        </div>
                        <ul className="m-0 pl-4 text-xs text-amber-800 dark:text-amber-200/90 space-y-0.5">
                            {missingRequirements.map((req, idx) => (
                                <li key={idx}>{req}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div>
                {isActionable ? (
                    <button
                        onClick={onAction}
                        className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            status === 'COMPLETE'
                                ? 'bg-zinc-100 dark:bg-zinc-800/90 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700'
                                : 'bg-[#dc0000] hover:bg-red-700 text-white shadow-xs'
                        }`}
                    >
                        {getCtaLabel()} <ArrowRight size={14} />
                    </button>
                ) : (
                    <div className="py-2.5 px-4 bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-semibold text-center flex items-center justify-center gap-1.5 cursor-not-allowed">
                        <Lock size={14} />
                        <span>{dependencyHint || 'Prerequisites required'}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

