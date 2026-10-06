/**
 * src/ui/components/printhouse/setup/SetupProgressSummary.tsx
 * 
 * Compact 4-block horizontal progress strip for Setup Hub Overview.
 * Displays real progress metrics, discrete segments, and localized statuses.
 */
import React from 'react';
import { ShieldCheck, Clock, Tag, CheckCircle2 } from 'lucide-react';
import { useLocale } from '../../../i18n';

interface ReadinessData {
    accountSetup?: {
        status: string;
        completedRequirements: number;
        totalRequirements: number;
    };
    operationalConfiguration?: {
        status: string;
        completedRequirements: number;
        totalRequirements: number;
    };
    pricingReadiness?: {
        status: string;
        priceBookCount?: number;
        hasPublished?: boolean;
    };
    marketplaceReadiness?: {
        status: string;
        available: boolean;
        message?: string;
    };
}

export const SetupProgressSummary: React.FC<{ readiness?: ReadinessData }> = ({ readiness }) => {
    const { t } = useLocale();
    const account = readiness?.accountSetup;
    const config = readiness?.operationalConfiguration;
    const pricing = readiness?.pricingReadiness;

    const isCoreComplete = account?.status === 'COMPLETE' && config?.status === 'COMPLETE' && pricing?.status === 'COMPLETE';

    const getLocalizedStatus = (status?: string) => {
        if (status === 'COMPLETE') return t('setup.status.completed') || 'Completado';
        if (status === 'IN_PROGRESS') return t('setup.status.inProgress') || 'En curso';
        return t('setup.status.notStarted') || 'Pendiente';
    };

    const accountCompleted = account?.completedRequirements ?? 0;
    const accountTotal = account?.totalRequirements || 6;

    const opsCompleted = config?.completedRequirements ?? 0;
    const opsTotal = config?.totalRequirements || 5;

    const isPricingComplete = pricing?.status === 'COMPLETE';
    const isPricingInProgress = pricing?.status === 'IN_PROGRESS';

    return (
        <div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2" 
            role="region" 
            aria-label={t('setup.summary.regionLabel') || 'Readiness Dimensions Overview'}
        >
            {/* 1. Account & Identity Dimension */}
            <div className={`bg-white dark:bg-[#18181b] border ${account?.status === 'COMPLETE' ? 'border-emerald-300 dark:border-emerald-800/80' : 'border-zinc-200 dark:border-zinc-800'} rounded-xl p-2.5 shadow-2xs transition-colors motion-reduce:transition-none flex flex-col justify-between h-[64px]`}>
                <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <ShieldCheck size={14} className={account?.status === 'COMPLETE' ? 'text-emerald-500 shrink-0' : 'text-amber-500 shrink-0'} />
                        <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate">
                            {t('setup.summary.dimensionAccount') || 'Cuenta e Identidad'}
                        </span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        account?.status === 'COMPLETE'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}>
                        {getLocalizedStatus(account?.status)}
                    </span>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-zinc-900 dark:text-white">
                            {accountCompleted} / {accountTotal}
                        </span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            {t('setup.summary.requirementsCount') || 'requisitos verificados'}
                        </span>
                    </div>
                    {/* Discrete Progress Bar (6 segments) */}
                    <div className="flex gap-1 h-1.5 w-full" aria-hidden="true">
                        {Array.from({ length: accountTotal }).map((_, i) => (
                            <div
                                key={i}
                                className={`flex-1 rounded-full transition-colors motion-reduce:transition-none ${
                                    i < accountCompleted
                                        ? 'bg-emerald-500 dark:bg-emerald-400'
                                        : 'bg-zinc-200 dark:bg-zinc-700'
                                }`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* 2. Operational Capacity Dimension */}
            <div className={`bg-white dark:bg-[#18181b] border ${config?.status === 'COMPLETE' ? 'border-emerald-300 dark:border-emerald-800/80' : 'border-zinc-200 dark:border-zinc-800'} rounded-xl p-2.5 shadow-2xs transition-colors motion-reduce:transition-none flex flex-col justify-between h-[64px]`}>
                <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <Clock size={14} className={config?.status === 'COMPLETE' ? 'text-emerald-500 shrink-0' : 'text-amber-500 shrink-0'} />
                        <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate">
                            {t('setup.summary.dimensionOps') || 'Capacidad Operativa'}
                        </span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        config?.status === 'COMPLETE'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}>
                        {getLocalizedStatus(config?.status)}
                    </span>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-zinc-900 dark:text-white">
                            {opsCompleted} / {opsTotal}
                        </span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            {t('setup.summary.requirementsCount') || 'requisitos verificados'}
                        </span>
                    </div>
                    {/* Discrete Progress Bar (5 segments) */}
                    <div className="flex gap-1 h-1.5 w-full" aria-hidden="true">
                        {Array.from({ length: opsTotal }).map((_, i) => (
                            <div
                                key={i}
                                className={`flex-1 rounded-full transition-colors motion-reduce:transition-none ${
                                    i < opsCompleted
                                        ? 'bg-emerald-500 dark:bg-emerald-400'
                                        : 'bg-zinc-200 dark:bg-zinc-700'
                                }`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* 3. Industrial Pricing Dimension */}
            <div className={`bg-white dark:bg-[#18181b] border ${isPricingComplete ? 'border-emerald-300 dark:border-emerald-800/80' : 'border-zinc-200 dark:border-zinc-800'} rounded-xl p-2.5 shadow-2xs transition-colors motion-reduce:transition-none flex flex-col justify-between h-[64px]`}>
                <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <Tag size={14} className={isPricingComplete ? 'text-emerald-500 shrink-0' : 'text-amber-500 shrink-0'} />
                        <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate">
                            {t('setup.summary.dimensionPricing') || 'Precios Industriales'}
                        </span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        isPricingComplete
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    }`}>
                        {getLocalizedStatus(pricing?.status)}
                    </span>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[11px] font-semibold text-zinc-900 dark:text-white truncate">
                            {isPricingComplete ? (t('setup.summary.ratesConfigured') || 'Tarifas listas') : (t('setup.summary.ratesPending') || 'Sin configurar')}
                        </span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0">
                            {pricing?.priceBookCount ? `${pricing.priceBookCount} cat.` : '0 cat.'}
                        </span>
                    </div>
                    {/* Discrete Progress Bar (2 segments: Manufacturing Rates + Commercial Catalog) */}
                    <div className="flex gap-1 h-1.5 w-full" aria-hidden="true">
                        <div
                            className={`flex-1 rounded-full transition-colors motion-reduce:transition-none ${
                                isPricingComplete || isPricingInProgress ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-zinc-200 dark:bg-zinc-700'
                            }`}
                        />
                        <div
                            className={`flex-1 rounded-full transition-colors motion-reduce:transition-none ${
                                isPricingComplete ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-zinc-200 dark:bg-zinc-700'
                            }`}
                        />
                    </div>
                </div>
            </div>

            {/* 4. Overall Marketplace Review Status */}
            <div className={`bg-white dark:bg-[#18181b] border ${isCoreComplete ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/20 dark:bg-emerald-950/10' : 'border-zinc-200 dark:border-zinc-800'} rounded-xl p-2.5 shadow-2xs transition-colors motion-reduce:transition-none flex flex-col justify-between h-[64px]`}>
                <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 size={14} className={isCoreComplete ? 'text-emerald-500 shrink-0' : 'text-amber-500 shrink-0'} />
                        <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate">
                            {t('setup.summary.dimensionMarketplace') || 'Estado del Marketplace'}
                        </span>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        isCoreComplete
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                    }`}>
                        {isCoreComplete ? (t('setup.status.readyForReview') || 'Revisión') : (t('setup.status.inProgress') || 'En curso')}
                    </span>
                </div>
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                        <span className={`text-[11px] font-bold truncate ${isCoreComplete ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                            {isCoreComplete ? (t('setup.summary.readyForReview') || 'Listo para revisión') : (t('setup.summary.inPreparation') || 'En preparación')}
                        </span>
                    </div>
                    {/* Discrete Progress Bar (3 segments: Identity + Ops + Rates) */}
                    <div className="flex gap-1 h-1.5 w-full" aria-hidden="true">
                        <div className={`flex-1 rounded-full transition-colors motion-reduce:transition-none ${account?.status === 'COMPLETE' ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                        <div className={`flex-1 rounded-full transition-colors motion-reduce:transition-none ${config?.status === 'COMPLETE' ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                        <div className={`flex-1 rounded-full transition-colors motion-reduce:transition-none ${pricing?.status === 'COMPLETE' ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                    </div>
                </div>
            </div>
        </div>
    );
};
