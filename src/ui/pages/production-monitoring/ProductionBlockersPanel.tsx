import React from 'react';
import { ProductionMonitoringSnapshot } from '../../types/productionMonitoring';

interface Props {
    snapshot: ProductionMonitoringSnapshot | null;
}

export const ProductionBlockersPanel: React.FC<Props> = ({ snapshot }) => {
    if (!snapshot) {
        return (
            <div className="glass border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm p-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400 mb-4 border-l-2 border-[#dc0000] pl-3">
                    Governance Blockers
                </h3>
                <div className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-650">
                    Select an item to view active blockers.
                </div>
            </div>
        );
    }

    const blockers = snapshot.blocking_reasons_json || [];
    const domains = snapshot.governance_snapshot_json || {};

    return (
        <div className="glass border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm p-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400 mb-6 border-l-2 border-[#dc0000] pl-3">
                Governance Blockers &amp; Limits
            </h3>

            {blockers.length === 0 ? (
                <div className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-500/20 p-4">
                    ✓ All pre-queue governance gates passed. SLA timer active.
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="text-[10px] font-black uppercase text-[#dc0000] dark:text-red-400 bg-red-650/10 dark:bg-red-950/20 border border-red-600/20 p-4">
                        ⚠ Item blocked. Progress frozen until all blockers are resolved.
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {Array.isArray(Object.entries(domains)) && Object.entries({
                            'Artifact Trust':  domains.artifact_trust,
                            'Preflight Rules': domains.policy_profile,
                            'Machine Compat':  domains.machine_compatibility,
                            'Proof Approval':  domains.proof,
                            'Payment Gate':    domains.payment,
                            'Quota/Plan':      domains.quota
                        }).map(([name, state]) => {
                            const isBlocked = state === 'BLOCKED';
                            return (
                                <div key={name} className={`p-3 border text-center ${
                                    isBlocked
                                        ? 'border-red-600/30 bg-red-650/10 dark:bg-red-950/20 text-[#dc0000] dark:text-red-400'
                                        : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/20 text-slate-400 dark:text-zinc-500'
                                }`}>
                                    <div className="text-[7px] font-black uppercase tracking-widest mb-1">{name}</div>
                                    <div className="text-[9px] font-black uppercase font-mono">
                                        {isBlocked ? 'BLOCKED' : (state as string) || 'PASSED'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t border-slate-200 dark:border-zinc-800 pt-4">
                        <div className="text-[8px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-widest mb-2">
                            Active Blocking Reasons
                        </div>
                        <ul className="space-y-1.5 pl-3 list-disc">
                            {Array.isArray(blockers) && blockers.map((reason, idx) => (
                                <li key={idx} className="text-xs font-mono text-slate-700 dark:text-zinc-300">
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
