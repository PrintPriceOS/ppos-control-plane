import React from 'react';
import { ProductionMonitoringSnapshot } from '../../types/productionMonitoring';
import { COLORS } from '../../design-system/tokens';

interface Props {
    snapshots: ProductionMonitoringSnapshot[];
    selectedOrderId: string | null;
    onSelectOrder: (orderId: string, jobId: string) => void;
}

export const SlaRiskPanel: React.FC<Props> = ({ snapshots, selectedOrderId, onSelectOrder }) => {
    
    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'BREACHED':
                return { bg: 'bg-red-500/10 text-red-600 border-red-500/20' };
            case 'AT_RISK':
                return { bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
            case 'ON_TRACK':
                return { bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
            case 'PAUSED':
                return { bg: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20' };
            case 'BLOCKED':
                return { bg: 'bg-red-500/20 text-red-700 border-red-500/30' };
            default:
                return { bg: 'bg-zinc-100 text-zinc-500 border-zinc-200' };
        }
    };

    return (
        <div className={`border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} p-6`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-6 ${COLORS.adaptive.textSecondary}`}>
                Production SLA Monitored Items
            </h3>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                            <th className="pb-3">Order ID</th>
                            <th className="pb-3">Job ID</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3">SLA Status</th>
                            <th className="pb-3">Remaining Time</th>
                            <th className="pb-3 text-right">Risk Score</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                        {snapshots.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-8 text-center text-xs font-semibold text-zinc-500">
                                    No active jobs in production.
                                </td>
                            </tr>
                        ) : (
                            snapshots.map((snap) => {
                                const isSelected = selectedOrderId === snap.order_id;
                                const statusStyle = getStatusStyles(snap.sla_status);
                                return (
                                    <tr 
                                        key={snap.order_id} 
                                        className={`text-xs font-medium cursor-pointer transition-colors ${COLORS.adaptive.hoverSurface} ${isSelected ? 'bg-zinc-50 dark:bg-zinc-800/30' : ''}`}
                                        onClick={() => onSelectOrder(snap.order_id, snap.job_id || '')}
                                    >
                                        <td className="py-4 font-mono font-bold text-zinc-950 dark:text-zinc-50">
                                            {snap.order_id}
                                        </td>
                                        <td className="py-4 font-mono text-zinc-500">
                                            {snap.job_id || '—'}
                                        </td>
                                        <td className="py-4">
                                            <span className="font-bold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px]">
                                                {snap.production_status}
                                            </span>
                                        </td>
                                        <td className="py-4">
                                            <span className={`px-2 py-0.5 border text-[10px] font-bold ${statusStyle.bg}`}>
                                                {snap.sla_status}
                                            </span>
                                        </td>
                                        <td className="py-4 font-mono">
                                            {snap.remaining_minutes !== null && snap.remaining_minutes !== undefined ? (
                                                snap.remaining_minutes < 0 ? (
                                                    <span className="text-red-500 font-bold">LATE ({Math.abs(snap.remaining_minutes)}m)</span>
                                                ) : (
                                                    `${snap.remaining_minutes} mins`
                                                )
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="py-4 text-right font-black">
                                            <span className={snap.risk_score >= 80 ? 'text-red-500' : snap.risk_score >= 50 ? 'text-amber-500' : 'text-zinc-900 dark:text-zinc-100'}>
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
