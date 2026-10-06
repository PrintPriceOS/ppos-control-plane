/**
 * src/ui/components/printhouse/setup/SetupModuleCard.tsx
 * 
 * Displays an individual onboarding module card in a compact, accessible 4-column layout.
 */
import React, { useState } from 'react';
import { ArrowRight, CheckCircle, Clock, Lock, AlertCircle } from 'lucide-react';
import { useLocale } from '../../../i18n';
import { localizeBlocker } from '../../../lib/blockerLocalization';

interface SetupModuleCardProps {
    moduleNumber?: number;
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
    moduleNumber,
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
    const { t, locale } = useLocale();
    const [showAllRequirements, setShowAllRequirements] = useState(false);

    const resolvedCtaLabel = () => {
        if (ctaLabel) return ctaLabel;
        if (status === 'COMPLETE') return t('setup.module.cta.review') || 'Revisar / Editar';
        if (status === 'IN_PROGRESS') return t('setup.module.cta.continue') || 'Continuar configuración';
        return t('setup.module.cta.start') || 'Comenzar módulo';
    };

    const isLocked = !isActionable && status !== 'COMPLETE';

    // State-aware icon styles
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
        return {
            bg: 'bg-zinc-100 dark:bg-zinc-800',
            color: 'text-zinc-600 dark:text-zinc-300',
            border: 'border-zinc-200 dark:border-zinc-700'
        };
    };

    const iconStyle = getIconStyles();

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
        return 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-zinc-800 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700';
    };

    return (
        <div
            data-testid={`setup-module-card-${moduleNumber}`}
            data-module-card="true"
            className={`group ${getContainerStyles()} rounded-xl p-3 sm:p-3.5 flex flex-col justify-between transition-colors relative min-h-[195px]`}
        >
            <div>
                {/* Header row: Icon (32-36px visual) + Title/Number + Status Badge */}
                <div className="flex items-start gap-2.5 mb-1.5">
                    {icon && (
                        <div 
                            aria-hidden="true"
                            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-lg border flex items-center justify-center shrink-0 transition-transform motion-reduce:transition-none duration-150 group-hover:scale-105 ${iconStyle.bg} ${iconStyle.color} ${iconStyle.border}`}
                        >
                            {React.isValidElement(icon)
                                ? React.cloneElement(icon as React.ReactElement<any>, {
                                    size: 32,
                                    className: 'w-8 h-8 shrink-0'
                                  })
                                : icon}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                                #{moduleNumber}
                            </span>
                            {/* Status Badge with Icon & Text */}
                            <div className="shrink-0">
                                {status === 'COMPLETE' && (
                                    <span 
                                        title={t('setup.status.completed') || 'Completed'}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800"
                                    >
                                        <CheckCircle size={11} className="text-emerald-500 shrink-0" aria-label={t('setup.status.completed') || 'Completed'} />
                                        <span>{t('setup.status.completed') || 'Completado'}</span>
                                    </span>
                                )}
                                {status === 'IN_PROGRESS' && (
                                    <span 
                                        title={t('setup.status.inProgress') || 'In Progress'}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800"
                                    >
                                        <Clock size={11} className="text-amber-500 shrink-0" aria-label={t('setup.status.inProgress') || 'In Progress'} />
                                        <span>{t('setup.status.inProgress') || 'En curso'}</span>
                                    </span>
                                )}
                                {status === 'NEEDS_ATTENTION' && (
                                    <span 
                                        title={t('setup.status.needsAttention') || 'Needs Attention'}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800"
                                    >
                                        <AlertCircle size={11} className="text-red-500 shrink-0" aria-label={t('setup.status.needsAttention') || 'Needs Attention'} />
                                        <span>{t('setup.status.needsAttention') || 'Atención'}</span>
                                    </span>
                                )}
                                {isLocked && (
                                    <span 
                                        title={t('setup.status.prerequisitesRequired') || 'Prerequisites Required'}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700"
                                    >
                                        <Lock size={11} className="text-zinc-400 shrink-0" aria-label={t('setup.status.prerequisitesRequired') || 'Prerequisites Required'} />
                                        <span>{t('setup.status.prerequisitesRequired') || 'Bloqueado'}</span>
                                    </span>
                                )}
                                {!isLocked && (
                                    <span 
                                        title={t('setup.status.notStarted') || 'Pending'}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700"
                                    >
                                        <Clock size={11} className="text-zinc-400 shrink-0" aria-label={t('setup.status.notStarted') || 'Pending'} />
                                        <span>{t('setup.status.notStarted') || 'Pendiente'}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        <h3 className={`text-xs font-bold leading-tight break-words m-0 ${isLocked ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>
                            {title}
                        </h3>

                        {isRecommended && (
                            <div className="mt-1">
                                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-red-100 text-[#dc0000] dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-900 truncate max-w-full">
                                    {t('setup.card.recommendedBadge') || 'Recommended Next Action'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Brief description: 2 lines max */}
                <p className={`text-[11px] leading-snug line-clamp-2 mt-1 mb-2 ${isLocked ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                    {description}
                </p>

                {/* Missing requirement summary with accessible click & keyboard toggle */}
                {missingRequirements.length > 0 && status !== 'COMPLETE' && (
                    <div 
                        data-testid={`module-blockers-${moduleNumber}`}
                        className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-lg p-2 mb-2 text-[10px] text-amber-900 dark:text-amber-200"
                    >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="font-bold text-[9px] uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                {t('setup.module.pendingRequirement') || 'Requisito pendiente:'}
                            </span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAllRequirements(!showAllRequirements);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setShowAllRequirements(!showAllRequirements);
                                    }
                                }}
                                aria-expanded={showAllRequirements}
                                aria-label={showAllRequirements ? (t('setup.module.hideDetails') || 'Ocultar detalle') : (t('setup.module.viewDetails') || 'Ver detalle')}
                                className="text-[9px] font-bold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 underline cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500 rounded px-1"
                            >
                                {showAllRequirements 
                                    ? (t('setup.module.hideDetails') || 'Ocultar') 
                                    : (missingRequirements.length > 1 
                                        ? `+${missingRequirements.length - 1} (${t('setup.module.viewDetails') || 'Ver detalle'})` 
                                        : (t('setup.module.viewDetails') || 'Ver detalle'))}
                            </button>
                        </div>
                        <p className={`m-0 font-medium leading-snug break-words ${showAllRequirements ? '' : 'line-clamp-2'}`}>
                            {localizeBlocker(missingRequirements[0], locale)}
                        </p>
                        {showAllRequirements && (
                            <div className="mt-1.5 pt-1.5 border-t border-amber-200/70 dark:border-amber-900/50 space-y-1">
                                {missingRequirements.length > 1 && (
                                    <ul className="pl-3 space-y-0.5">
                                        {missingRequirements.slice(1).map((req, idx) => (
                                            <li key={idx} className="list-disc leading-snug break-words">{localizeBlocker(req, locale)}</li>
                                        ))}
                                    </ul>
                                )}
                                <div className="text-[9px] text-amber-800/80 dark:text-amber-300/80 pt-0.5">
                                    {t('setup.module.blockerActionHint') || 'Resuelve los requisitos para desbloquear el avance.'}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Consistent, Accessible Action Button */}
            <div className="pt-1">
                {isActionable ? (
                    <button
                        type="button"
                        data-testid={`setup-module-cta-${moduleNumber}`}
                        data-module-cta="true"
                        onClick={onAction}
                        className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            isRecommended
                                ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white border border-red-300 dark:border-red-800 font-bold shadow-2xs'
                                : status === 'COMPLETE'
                                    ? 'bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                                    : 'bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 shadow-2xs'
                        }`}
                    >
                        <span>{resolvedCtaLabel()}</span>
                        <ArrowRight size={13} className={isRecommended ? 'text-[#dc0000]' : ''} />
                    </button>
                ) : (
                    <div>
                        {onResolveDependency ? (
                            <button
                                type="button"
                                data-testid={`setup-module-cta-${moduleNumber}`}
                                data-module-cta="true"
                                onClick={onResolveDependency}
                                className="w-full py-1.5 px-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                                <span>{t('setup.module.resolveDependency') || 'Resolver prerrequisito'}</span>
                                <ArrowRight size={12} className="text-[#dc0000]" />
                            </button>
                        ) : (
                            <div 
                                data-testid={`setup-module-cta-${moduleNumber}`}
                                data-module-cta="true"
                                className="py-1 px-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-lg text-xs flex items-center gap-1.5 justify-center"
                            >
                                <Lock size={12} />
                                <span className="truncate">{dependencyHint || t('setup.card.blockedBadge')}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
