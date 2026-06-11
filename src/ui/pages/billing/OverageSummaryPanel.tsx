import React from 'react';
import { BillingPeriodSummary } from '../../types/billingUsage';
import { COLORS } from '../../design-system/tokens';

interface Props {
    summary: BillingPeriodSummary;
}

export const OverageSummaryPanel: React.FC<Props> = ({ summary }) => {
    const formatPrice = (cents: number) => {
        return (cents / 100).toFixed(2) + ' ' + summary.currency;
    };

    return (
        <div className={`p-6 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-6 ${COLORS.adaptive.textSecondary}`}>
                Billing Run Period Summary
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/10 border border-zinc-100 dark:border-zinc-800/30">
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                        Overage Fees Accumulated
                    </div>
                    <div className={`text-2xl font-black ${COLORS.adaptive.textPrimary}`}>
                        {formatPrice(summary.total_overage_cents)}
                    </div>
                    <p className="text-[9px] font-medium text-zinc-400 mt-1 uppercase">
                        Audited usage over plan limits
                    </p>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/10 border border-zinc-100 dark:border-zinc-800/30">
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                        Manual adjustments
                    </div>
                    <div className={`text-2xl font-black ${summary.total_adjustment_cents < 0 ? 'text-emerald-600' : COLORS.adaptive.textPrimary}`}>
                        {formatPrice(summary.total_adjustment_cents)}
                    </div>
                    <p className="text-[9px] font-medium text-zinc-400 mt-1 uppercase">
                        Credits / adjustments applied
                    </p>
                </div>

                <div className="p-4 bg-zinc-900 text-white dark:bg-zinc-800 border border-transparent">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                        Grand Total Recorded
                    </div>
                    <div className="text-2xl font-black">
                        {formatPrice(summary.grand_total_cents)}
                    </div>
                    <p className="text-[9px] font-black text-[#dc0000] mt-1 uppercase tracking-widest">
                        Status: Billing Event Recorded
                    </p>
                </div>
            </div>

            <div className="mt-6 p-4 bg-zinc-50 dark:bg-zinc-800/20 border border-zinc-100 dark:border-zinc-800/30 text-[10px] text-zinc-500 font-bold uppercase tracking-wide">
                ⚠️ INTERNAL RECORDS ONLY: No commercial transaction processing will occur. These items represent internal Control Plane usage logs for pilot verification.
            </div>
        </div>
    );
};
