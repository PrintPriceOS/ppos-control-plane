import React from 'react';
import { ProductionMonitoringSnapshot } from '../../types/productionMonitoring';

interface Props {
    snapshots: ProductionMonitoringSnapshot[];
    selectedOrderId: string | null;
}

export const OperationalAlertsPanel: React.FC<Props> = ({ snapshots, selectedOrderId }) => {
    // Aggregate warnings and alerts across all active snapshots
    const alerts: Array<{ orderId: string; type: 'WARNING' | 'RISK' | 'BREACH'; message: string; action: string }> = [];

    snapshots.forEach(s => {
        if (s.warning_reasons_json && s.warning_reasons_json.length > 0) {
            s.warning_reasons_json.forEach(w => {
                alerts.push({
                    orderId: s.order_id,
                    type: 'WARNING',
                    message: `[Warning] Order ${s.order_id}: ${w}`,
                    action: 'Inspect preflight logs and warnings.'
                });
            });
        }
        if (s.sla_status === 'AT_RISK') {
            alerts.push({
                orderId: s.order_id,
                type: 'RISK',
                message: `[At Risk] Order ${s.order_id} has less than 2 hours remaining in SLA timer.`,
                action: 'Verify machine status and prioritize queue routing.'
            });
        } else if (s.sla_status === 'BREACHED') {
            alerts.push({
                orderId: s.order_id,
                type: 'BREACH',
                message: `[SLA Breached] Order ${s.order_id} has breached SLA timeline cutoff!`,
                action: 'Contact client and update delivery options.'
            });
        }
    });

    return (
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-6 border-l-2 border-[#dc0000] pl-3">
                Operational Alerts &amp; Recommendations
            </h3>

            {alerts.length === 0 ? (
                <div className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    No active warnings or alerts. All queue parameters nominal.
                </div>
            ) : (
                <div className="space-y-3">
                    {alerts.map((alert, idx) => {
                        const isSelected = selectedOrderId === alert.orderId;
                        const cardStyles =
                            alert.type === 'BREACH'  ? 'border-red-600/30 bg-red-950/15 text-[#dc0000]' :
                            alert.type === 'RISK'    ? 'border-amber-500/30 bg-amber-950/15 text-amber-400' :
                            'border-zinc-700 bg-zinc-900/20 text-zinc-300';

                        return (
                            <div
                                key={idx}
                                className={`border p-4 transition-all ${cardStyles} ${isSelected ? 'ring-1 ring-[#dc0000]' : ''}`}
                            >
                                <div className="text-[10px] font-black mb-1">
                                    {alert.message}
                                </div>
                                <div className="text-[9px] text-zinc-500 font-mono">
                                    <strong className="text-zinc-400">Recommendation:</strong> {alert.action}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
export default OperationalAlertsPanel;
