import React from 'react';
import { ProductionMonitoringSnapshot } from '../../types/productionMonitoring';
import { COLORS } from '../../design-system/tokens';

interface Props {
    snapshot: ProductionMonitoringSnapshot | null;
}

export const ProductionBlockersPanel: React.FC<Props> = ({ snapshot }) => {
    if (!snapshot) {
        return (
            <div className={`border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} p-6`}>
                <h3 className={`text-xs font-black uppercase tracking-widest mb-4 ${COLORS.adaptive.textSecondary}`}>
                    Governance Blockers
                </h3>
                <div className="py-2 text-center text-xs text-zinc-500 font-semibold">
                    Select an item to view active blockers.
                </div>
            </div>
        );
    }

    const blockers = snapshot.blocking_reasons_json || [];
    const domains = snapshot.governance_snapshot_json || {};

    return (
        <div className={`border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} p-6`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-6 ${COLORS.adaptive.textSecondary}`}>
                Governance Blockers & Limits
            </h3>

            {blockers.length === 0 ? (
                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-4">
                    ✓ All pre-queue governance gates passed. SLA timer active.
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 p-4">
                        ⚠ Item blocked. Progress frozen until all blockers are resolved.
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {Object.entries({
                            'Artifact Trust': domains.artifact_trust,
                            'Preflight Rules': domains.policy_profile,
                            'Machine Compat': domains.machine_compatibility,
                            'Proof Approval': domains.proof,
                            'Payment Gate': domains.payment,
                            'Quota/Plan': domains.quota
                        }).map(([name, state]) => {
                            const isBlocked = state === 'BLOCKED';
                            return (
                                <div key={name} className={`p-2 border text-center ${
                                    isBlocked ? 'border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400' : 'border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500'
                                }`}>
                                    <div className="text-[8px] font-black uppercase tracking-widest">{name}</div>
                                    <div className="text-[10px] font-black uppercase mt-1">
                                        {isBlocked ? 'Blocked' : state || 'Passed'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t border-zinc-200 dark:border-zinc-800/50 pt-4">
                        <div className="text-[9px] font-black uppercase text-zinc-400 tracking-widest mb-2">
                            Active Blocking Reasons
                        </div>
                        <ul className="space-y-1.5 pl-3 list-disc">
                            {blockers.map((reason, idx) => (
                                <li key={idx} className="text-xs font-mono text-zinc-950 dark:text-zinc-50">
                                    {reason}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};
export default ProductionBlockersPanel;
