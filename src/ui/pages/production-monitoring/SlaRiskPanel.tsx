import React from 'react';
import { ProductionMonitoringSnapshot } from '../../types/productionMonitoring';
import { StatusBadge } from '../../components/StatusBadge';

interface Props {
    snapshots: ProductionMonitoringSnapshot[];
    selectedOrderId: string | null;
    onSelectOrder: (orderId: string, jobId: string) => void;
}

export const SlaRiskPanel: React.FC<Props> = ({ snapshots, selectedOrderId, onSelectOrder }) => {
    return (
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-6 border-l-2 border-[#dc0000] pl-3">
                Production SLA Monitored Items
            </h3>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-zinc-800 text-[9px] font-black uppercase text-zinc-500 tracking-wider">
                            <th className="pb-3 pr-4">Order ID</th>
                            <th className="pb-3 pr-4">Job ID</th>
                            <th className="pb-3 pr-4">Status</th>
                            <th className="pb-3 pr-4">SLA Status</th>
                            <th className="pb-3 pr-4">Remaining</th>
                            <th className="pb-3 text-right">Risk Score</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {snapshots.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                                    No active jobs in production monitoring.
                                </td>
                            </tr>
                        ) : (
                            snapshots.map((snap) => {
                                const isSelected = selectedOrderId === snap.order_id;
                                return (
                                    <tr
                                        key={snap.order_id}
                                        className={`text-xs cursor-pointer transition-all hover:bg-zinc-800/30 ${isSelected ? 'bg-zinc-800/20 border-l-2 border-[#dc0000]' : ''}`}
                                        onClick={() => onSelectOrder(snap.order_id, snap.job_id || '')}
                                    >
                                        <td className="py-4 pr-4 font-mono font-bold text-white text-[11px]">
                                            {snap.order_id}
                                        </td>
                                        <td className="py-4 pr-4 font-mono text-zinc-500 text-[10px]">
                                            {snap.job_id || '—'}
                                        </td>
                                        <td className="py-4 pr-4">
                                            <StatusBadge status={snap.production_status} />
                                        </td>
                                        <td className="py-4 pr-4">
                                            <StatusBadge status={snap.sla_status} />
                                        </td>
                                        <td className="py-4 pr-4 font-mono text-[11px]">
                                            {snap.remaining_minutes !== null && snap.remaining_minutes !== undefined ? (
                                                snap.remaining_minutes < 0 ? (
                                                    <span className="text-[#dc0000] font-black">LATE ({Math.abs(snap.remaining_minutes)}m)</span>
                                                ) : (
                                                    <span className="text-zinc-300">{snap.remaining_minutes}m</span>
                                                )
                                            ) : '—'}
                                        </td>
                                        <td className="py-4 text-right font-mono font-black text-[13px]">
                                            <span className={
                                                snap.risk_score >= 80 ? 'text-[#dc0000]' :
                                                snap.risk_score >= 50 ? 'text-amber-400' :
                                                'text-emerald-400'
                                            }>
                                                {snap.risk_score}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
export default SlaRiskPanel;
