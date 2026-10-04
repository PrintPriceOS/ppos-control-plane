/**
 * src/ui/components/printhouse/setup/SetupProgressSummary.tsx
 * 
 * Displays readiness status indicators for Account Setup, Operational Readiness, and Pricing Readiness.
 */
import React from 'react';
import { ShieldCheck, Clock, Tag, CheckCircle } from 'lucide-react';
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

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7" role="region" aria-label={t('setup.summary.regionLabel') || 'Readiness Dimensions Overview'}>
            {/* 1. Account & Identity Dimension */}
            <div className={`bg-white dark:bg-[#18181b] border ${account?.status === 'COMPLETE' ? 'border-emerald-500' : 'border-zinc-200 dark:border-[#27272a]'} rounded-xl p-5 shadow-xs transition-colors flex flex-col justify-between`}>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {t('setup.summary.dimensionAccount') || 'Account & Identity'}
                        </span>
                        <ShieldCheck size={18} className={account?.status === 'COMPLETE' ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-500'} />
                    </div>
                    <div className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">
                        {account ? `${account.completedRequirements ?? 0} / ${account.totalRequirements || 6}` : '0 / 6'}
                    </div>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 flex items-center justify-between">
                    <span>{t('setup.summary.requirementsCount') || 'requirements verified'}</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${account?.status === 'COMPLETE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}`}>
                        {account?.status || 'IN_PROGRESS'}
                    </span>
                </div>
            </div>

            {/* 2. Operational Capacity Dimension */}
            <div className={`bg-white dark:bg-[#18181b] border ${config?.status === 'COMPLETE' ? 'border-emerald-500' : 'border-zinc-200 dark:border-[#27272a]'} rounded-xl p-5 shadow-xs transition-colors flex flex-col justify-between`}>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {t('setup.summary.dimensionOps') || 'Operational Readiness'}
                        </span>
                        <Clock size={18} className={config?.status === 'COMPLETE' ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-500'} />
                    </div>
                    <div className="text-2xl font-bold text-zinc-900 dark:text-white mb-1">
                        {config ? `${config.completedRequirements ?? 0} / ${config.totalRequirements || 5}` : '0 / 5'}
                    </div>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 flex items-center justify-between">
                    <span>{t('setup.summary.requirementsCount') || 'requirements verified'}</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${config?.status === 'COMPLETE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}`}>
                        {config?.status || 'IN_PROGRESS'}
                    </span>
                </div>
            </div>

            {/* 3. Industrial Pricing Dimension */}
            <div className={`bg-white dark:bg-[#18181b] border ${pricing?.status === 'COMPLETE' ? 'border-emerald-500' : 'border-zinc-200 dark:border-[#27272a]'} rounded-xl p-5 shadow-xs transition-colors flex flex-col justify-between`}>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {t('setup.summary.dimensionPricing') || 'Industrial Pricing'}
                        </span>
                        <Tag size={18} className={pricing?.status === 'COMPLETE' ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-500'} />
                    </div>
                    <div className="text-base font-bold text-zinc-900 dark:text-white mb-1">
                        {pricing?.status === 'COMPLETE' ? (t('setup.summary.ratesConfigured') || 'Rates & Books Ready') : (t('setup.summary.ratesPending') || 'Rates Not Configured')}
                    </div>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 flex items-center justify-between">
                    <span>{t('setup.summary.status')}</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${pricing?.status === 'COMPLETE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'}`}>
                        {pricing?.status || 'NOT_STARTED'}
                    </span>
                </div>
            </div>

            {/* 4. Overall Marketplace Review Status */}
            <div className={`${isCoreComplete ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-500' : 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-[#27272a]'} border rounded-xl p-5 shadow-xs transition-colors flex flex-col justify-between`}>
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {t('setup.summary.dimensionMarketplace') || 'Marketplace Status'}
                        </span>
                        {isCoreComplete ? <CheckCircle size={18} className="text-emerald-500" /> : <Clock size={18} className="text-amber-600 dark:text-amber-500" />}
                    </div>
                    <div className={`text-base font-bold ${isCoreComplete ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'} mb-1`}>
                        {isCoreComplete ? t('setup.summary.complete') : t('setup.summary.incomplete')}
                    </div>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                    {isCoreComplete ? t('setup.summary.readyDesc') : t('setup.summary.incompleteDesc')}
                </div>
            </div>
        </div>
    );
};


