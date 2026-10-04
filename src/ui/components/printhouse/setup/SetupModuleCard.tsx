/**
 * src/ui/components/printhouse/setup/SetupModuleCard.tsx
 * 
 * Displays an individual onboarding module card.
 */
import React from 'react';
import { ArrowRight, CheckCircle, Clock, Lock, AlertCircle } from 'lucide-react';
import { useLocale } from '../../../i18n';

interface SetupModuleCardProps {
    title: string;
    description: string;
    status: 'COMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED' | 'NEEDS_ATTENTION' | 'LOCKED';
    isActionable: boolean;
    isRecommended?: boolean;
    ctaLabel?: string;
    icon?: React.ReactNode;
    missingRequirements?: string[];
    dependencyHint?: string;
    onAction?: () => void;
    onResolveDependency?: () => void;
}

export const SetupModuleCard: React.FC<SetupModuleCardProps> = ({
    title,
    description,
    status,
    isActionable,
    isRecommended = false,
    ctaLabel,
    icon,
    missingRequirements = [],
    dependencyHint,
    onAction,
    onResolveDependency
}) => {
    const { t } = useLocale();

    const resolvedCtaLabel = () => {
        if (ctaLabel) return ctaLabel;
        if (status === 'COMPLETE') return t('setup.module.cta.review') || 'Review / Edit';
        if (status === 'IN_PROGRESS') return t('setup.module.cta.continue') || 'Continue Setup';
        return t('setup.module.cta.start') || 'Start Setup';
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
        if (isRecommended) {
            return {
                bg: 'bg-red-50 dark:bg-red-950/40',
                color: 'text-[#dc0000] dark:text-red-400',
                border: 'border-red-200 dark:border-red-800/60'
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

    // High contrast container styling distinguishing recommended vs complete vs pending vs locked
    const getContainerStyles = () => {
        if (isRecommended) {
            return 'bg-white dark:bg-[#18181b] border-2 border-[#dc0000] dark:border-red-500 shadow-md ring-1 ring-red-500/20';
        }
        if (isLocked) {
            return 'bg-zinc-50/80 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 shadow-none';
        }
        if (status === 'COMPLETE') {
            return 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/40 shadow-2xs';
        }
        if (status === 'NEEDS_ATTENTION') {
            return 'bg-white dark:bg-[#18181b] border-red-300 dark:border-red-800/80 shadow-2xs';
        }
        return 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-zinc-800 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700';
    };

    return (
        <div
            className={`group ${getContainerStyles()} rounded-xl p-5 sm:p-6 flex flex-col justify-between transition-all relative`}
        >
            {/* Top pill for recommended status */}
            {isRecommended && (
                <div className="absolute -top-2.5 left-5 bg-[#dc0000] text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-xs">
                    {t('setup.card.recommendedBadge') || 'Recommended Next Action'}
                </div>
            )}

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
                            <h3 className={`text-sm font-bold m-0 ${isLocked ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>
                                {title}
                            </h3>
                        </div>
                    </div>
                    <div>
                        {status === 'COMPLETE' && (
                            <span title={t('setup.status.completed') || 'Completed'}>
                                <CheckCircle 
                                    size={18} 
                                    className="text-emerald-500" 
                                    aria-label={t('setup.status.completed') || 'Completed'} 
                                />
                            </span>
                        )}
                        {status === 'IN_PROGRESS' && (
                            <span title={t('setup.status.inProgress') || 'In Progress'}>
                                <Clock 
                                    size={18} 
                                    className="text-amber-600 dark:text-amber-500" 
                                    aria-label={t('setup.status.inProgress') || 'In Progress'} 
                                />
                            </span>
                        )}
                        {status === 'NEEDS_ATTENTION' && (
                            <span title={t('setup.status.needsAttention') || 'Needs Attention'}>
                                <AlertCircle 
                                    size={18} 
                                    className="text-red-500" 
                                    aria-label={t('setup.status.needsAttention') || 'Needs Attention'} 
                                />
                            </span>
                        )}
                        {isLocked && (
                            <span title={t('setup.status.prerequisitesRequired') || 'Prerequisites Required'}>
                                <Lock 
                                    size={18} 
                                    className="text-zinc-400 dark:text-zinc-500" 
                                    aria-label={t('setup.status.prerequisitesRequired') || 'Prerequisites Required'} 
                                />
                            </span>
                        )}
                    </div>
                </div>
                <p className={`text-xs leading-relaxed mb-3.5 ${isLocked ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                    {description}
                </p>

                {missingRequirements.length > 0 && status !== 'COMPLETE' && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg p-2.5 sm:px-3 mb-4">
                        <div className="text-[11px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider mb-1">
                            {t('setup.module.missingRequirements') || 'Missing Requirements:'}
                        </div>
                        <ul className="m-0 pl-4 text-xs text-amber-800 dark:text-amber-200/90 space-y-0.5">
                            {missingRequirements.map((req, idx) => (
                                <li key={idx}>{req}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="pt-2">
                {isActionable ? (
                    <button
                        type="button"
                        onClick={onAction}
                        className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            isRecommended
                                ? 'bg-[#dc0000] hover:bg-red-700 text-white shadow-xs font-bold'
                                : status === 'COMPLETE'
                                    ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700'
                                    : 'bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 shadow-xs'
                        }`}
                    >
                        <span>{resolvedCtaLabel()}</span>
                        <ArrowRight size={14} />
                    </button>
                ) : (
                    <div className="space-y-2">
                        <div className="py-2 px-3 bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs flex items-center gap-2">
                            <Lock size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="truncate">{dependencyHint || t('setup.card.blockedBadge') || 'Prerequisites required'}</span>
                        </div>
                        {onResolveDependency && (
                            <button
                                type="button"
                                onClick={onResolveDependency}
                                className="w-full py-2 px-3 bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                                <span>{t('setup.module.resolveDependency') || 'Resolve Dependency'}</span>
                                <ArrowRight size={13} className="text-[#dc0000]" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};


