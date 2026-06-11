import React from 'react';
import { CommercialPlan } from '../../types/billingUsage';
import { COLORS } from '../../design-system/tokens';

interface Props {
    plans: CommercialPlan[];
    activePlanCode?: string;
}

export const CommercialPlanList: React.FC<Props> = ({ plans, activePlanCode }) => {
    return (
        <div className="space-y-4">
            <h3 className={`text-xs font-black uppercase tracking-widest ${COLORS.adaptive.textSecondary}`}>
                Available Commercial Plans
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((p) => {
                    const isActive = p.plan_code === activePlanCode;
                    return (
                        <div
                            key={p.plan_code}
                            className={`p-5 border transition-all ${
                                isActive
                                    ? 'border-[#dc0000] bg-zinc-50 dark:bg-zinc-800/40 shadow-sm'
                                    : `${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`
                            } relative`}
                        >
                            {isActive && (
                                <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[8px] font-black uppercase bg-[#dc0000] text-white">
                                    Active Plan
                                </span>
                            )}
                            <h4 className={`text-sm font-black tracking-tight ${COLORS.adaptive.textPrimary}`}>
                                {p.plan_name}
                            </h4>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                                {p.plan_code}
                            </p>
                            <div className="mt-4 space-y-2">
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-zinc-500">Base Price:</span>
                                    <span className={`font-bold ${COLORS.adaptive.textPrimary}`}>
                                        {(p.monthly_base_price_cents / 100).toFixed(2)} {p.base_currency}
                                    </span>
                                </div>
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-zinc-500">Included Jobs:</span>
                                    <span className={`font-bold ${COLORS.adaptive.textPrimary}`}>
                                        {p.included_preflight_jobs_monthly || 'Unlimited'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-zinc-500">Max File Size:</span>
                                    <span className={`font-bold ${COLORS.adaptive.textPrimary}`}>
                                        {p.max_file_size_mb} MB
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
