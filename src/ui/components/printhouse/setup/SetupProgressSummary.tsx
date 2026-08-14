/**
 * src/ui/components/printhouse/setup/SetupProgressSummary.tsx
 * 
 * Displays readiness status indicators for Account Setup, Operational Readiness, and Pricing Readiness.
 */
import React from 'react';
import { ShieldCheck, Clock, Tag, CheckCircle } from 'lucide-react';

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
    const account = readiness?.accountSetup;
    const config = readiness?.operationalConfiguration;
    const pricing = readiness?.pricingReadiness;

    const isCoreComplete = account?.status === 'COMPLETE' && config?.status === 'COMPLETE' && pricing?.status === 'COMPLETE';

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
            {/* 1. Account Setup Card */}
            <div className={`bg-white dark:bg-[#18181b] border ${account?.status === 'COMPLETE' ? 'border-emerald-500' : 'border-zinc-200 dark:border-[#27272a]'} rounded-xl p-5 shadow-xs transition-colors`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">1. Account & Sites</span>
                    <ShieldCheck size={18} className={account?.status === 'COMPLETE' ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-500'} />
                </div>
                <div className="text-xl font-bold text-zinc-900 dark:text-white mb-1">
                    {account ? `${account.completedRequirements} / ${account.totalRequirements || 6}` : '0 / 6'}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Status: <strong className={account?.status === 'COMPLETE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{account?.status || 'IN_PROGRESS'}</strong>
                </div>
            </div>

            {/* 2. Operational Configuration Card */}
            <div className={`bg-white dark:bg-[#18181b] border ${config?.status === 'COMPLETE' ? 'border-emerald-500' : 'border-zinc-200 dark:border-[#27272a]'} rounded-xl p-5 shadow-xs transition-colors`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">2. Production Readiness</span>
                    <Clock size={18} className={config?.status === 'COMPLETE' ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-500'} />
                </div>
                <div className="text-xl font-bold text-zinc-900 dark:text-white mb-1">
                    {config ? `${config.completedRequirements} / ${config.totalRequirements || 5}` : '0 / 5'}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Status: <strong className={config?.status === 'COMPLETE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{config?.status || 'IN_PROGRESS'}</strong>
                </div>
            </div>

            {/* 3. Pricing Readiness Card */}
            <div className={`bg-white dark:bg-[#18181b] border ${pricing?.status === 'COMPLETE' ? 'border-emerald-500' : 'border-zinc-200 dark:border-[#27272a]'} rounded-xl p-5 shadow-xs transition-colors`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">3. Industrial Pricing</span>
                    <Tag size={18} className={pricing?.status === 'COMPLETE' ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-500'} />
                </div>
                <div className="text-xl font-bold text-zinc-900 dark:text-white mb-1">
                    {pricing?.status === 'COMPLETE' ? 'Configured' : pricing?.status === 'IN_PROGRESS' ? 'In Progress' : 'Not Started'}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Status: <strong className={pricing?.status === 'COMPLETE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{pricing?.status || 'NOT_STARTED'}</strong>
                </div>
            </div>

            {/* 4. Overall Core Status */}
            <div className={`${isCoreComplete ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500' : 'bg-white dark:bg-[#18181b] border-zinc-200 dark:border-[#27272a]'} border rounded-xl p-5 shadow-xs transition-colors`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Core Setup Status</span>
                    {isCoreComplete ? <CheckCircle size={18} className="text-emerald-500" /> : <Clock size={18} className="text-amber-600 dark:text-amber-500" />}
                </div>
                <div className={`text-lg font-bold ${isCoreComplete ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} mb-1`}>
                    {isCoreComplete ? 'SETUP COMPLETE' : 'SETUP INCOMPLETE'}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {isCoreComplete ? 'Ready for dashboard & marketplace review' : 'Complete 8 modules below'}
                </div>
            </div>
        </div>
    );
};


