import React from 'react';
import { UsageCounters } from '../../types/billingUsage';
import { COLORS } from '../../design-system/tokens';

interface Props {
    counters: UsageCounters;
    limits: {
        max_file_size_mb: number;
        max_monthly_orders: number;
        max_daily_jobs: number;
        included_storage_gb: number;
    };
    includedJobs: number;
}

export const UsageCountersPanel: React.FC<Props> = ({ counters, limits, includedJobs }) => {
    // Math checks
    const jobsLimit = includedJobs || 999999;
    const jobsPercent = Math.min(100, (counters.preflight_jobs_count / jobsLimit) * 100);

    const storageLimitBytes = (limits.included_storage_gb || 0) * 1024 * 1024 * 1024;
    const storagePercent = storageLimitBytes > 0 
        ? Math.min(100, (counters.stored_bytes / storageLimitBytes) * 100)
        : 0;

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className={`p-6 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-6 ${COLORS.adaptive.textSecondary}`}>
                Monthly Consumption Metering
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Preflight Jobs Usage */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase">
                        <span className={COLORS.adaptive.textPrimary}>Preflight Jobs Run</span>
                        <span className={COLORS.adaptive.textSecondary}>
                            {counters.preflight_jobs_count} / {includedJobs || 'Unlimited'}
                        </span>
                    </div>
                    <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded-none overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-300 ${
                                jobsPercent >= 90 ? 'bg-red-600' : jobsPercent >= 75 ? 'bg-amber-500' : 'bg-primary'
                            }`}
                            style={{ width: `${jobsPercent}%` }}
                        />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-medium">
                        Overage rate of $0.10 per job applies once included quota is exhausted.
                    </div>
                </div>

                {/* Storage Utilization */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase">
                        <span className={COLORS.adaptive.textPrimary}>Storage Utilization</span>
                        <span className={COLORS.adaptive.textSecondary}>
                            {formatBytes(counters.stored_bytes)} / {limits.included_storage_gb ? `${limits.included_storage_gb} GB` : '0 GB'}
                        </span>
                    </div>
                    <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded-none overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-300 ${
                                storagePercent >= 90 ? 'bg-red-600' : storagePercent >= 75 ? 'bg-amber-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${storagePercent}%` }}
                        />
                    </div>
                    <div className="text-[10px] text-zinc-500 font-medium">
                        Overage rate of $0.50 per GB ($0.000488/MB) applies beyond included storage.
                    </div>
                </div>
            </div>

            {/* Other Indicators Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800/50">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/20 border border-transparent">
                    <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Orders Handled</div>
                    <div className={`text-lg font-black mt-1 ${COLORS.adaptive.textPrimary}`}>{counters.orders_count}</div>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/20 border border-transparent">
                    <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Handoffs Dispatched</div>
                    <div className={`text-lg font-black mt-1 ${COLORS.adaptive.textPrimary}`}>{counters.handoff_packages_count}</div>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/20 border border-transparent">
                    <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Unsafe Fix Approvals</div>
                    <div className={`text-lg font-black mt-1 ${COLORS.adaptive.textPrimary}`}>{counters.unsafe_fix_approvals_count} / 5</div>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/20 border border-transparent">
                    <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Failed Jobs</div>
                    <div className={`text-lg font-black mt-1 ${counters.failed_jobs_count > 0 ? 'text-red-500' : COLORS.adaptive.textPrimary}`}>{counters.failed_jobs_count}</div>
                </div>
            </div>
        </div>
    );
};
