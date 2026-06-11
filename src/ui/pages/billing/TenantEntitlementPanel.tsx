import React from 'react';
import { TenantEntitlement } from '../../types/billingUsage';
import { COLORS } from '../../design-system/tokens';
import {
    ShieldCheckIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface Props {
    entitlement: TenantEntitlement;
}

export const TenantEntitlementPanel: React.FC<Props> = ({ entitlement }) => {
    const isMuted = entitlement.billing_status === 'BLOCKED' || entitlement.billing_status === 'PAST_DUE';
    
    return (
        <div className={`p-6 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-4 ${COLORS.adaptive.textSecondary}`}>
                Commercial Entitlement Status
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                        Active Billing Tier
                    </div>
                    <div className={`text-xl font-black ${COLORS.adaptive.textPrimary}`}>
                        {entitlement.plan_code}
                    </div>
                    <div className="text-[10px] font-bold text-zinc-400 mt-1 uppercase">
                        Status: {entitlement.entitlement_status}
                    </div>
                </div>

                <div>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                        Billing Status
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-black px-2 py-0.5 border uppercase tracking-wider ${
                            entitlement.billing_status === 'ACTIVE' || entitlement.billing_status === 'NOT_REQUIRED'
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50'
                                : 'bg-red-50 text-red-600 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50'
                        }`}>
                            {entitlement.billing_status}
                        </span>
                    </div>
                </div>

                <div>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                        Entitled Features
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {entitlement.features.allow_large_uploads && (
                            <span className="text-[9px] font-black border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">
                                Large Uploads
                            </span>
                        )}
                        {entitlement.features.allow_api_access && (
                            <span className="text-[9px] font-black border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">
                                API Access
                            </span>
                        )}
                        {entitlement.features.allow_audit_bundle_export && (
                            <span className="text-[9px] font-black border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">
                                Audit Export
                            </span>
                        )}
                        {entitlement.features.allow_commercial_handoff && (
                            <span className="text-[9px] font-black border border-[#10B981]/20 bg-[#10B981]/5 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                                Handoff
                            </span>
                        )}
                        {entitlement.commercial_live_enabled ? (
                            <span className="text-[9px] font-black border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                                Commercial Live
                            </span>
                        ) : (
                            <span className="text-[9px] font-black border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 text-amber-700 dark:text-amber-400 uppercase tracking-widest">
                                Pilot Mode Only
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Blockers or Warnings */}
            {entitlement.blocking_reasons.length > 0 && (
                <div className="mt-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-xs font-black text-red-600 uppercase tracking-wider">
                            Billing Enforcement Block Active
                        </h4>
                        <p className="text-[11px] text-red-500 font-medium mt-1">
                            Operational mutations are locked due to: {entitlement.blocking_reasons.join(', ')}
                        </p>
                    </div>
                </div>
            )}

            {entitlement.warnings.length > 0 && entitlement.blocking_reasons.length === 0 && (
                <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-xs font-black text-amber-600 uppercase tracking-wider">
                            Entitlement Alerts
                        </h4>
                        <ul className="text-[11px] text-amber-500 font-medium list-disc list-inside mt-1">
                            {entitlement.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};
