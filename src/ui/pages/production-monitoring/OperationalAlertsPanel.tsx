import React from 'react';
import { ProductionMonitoringSnapshot } from '../../types/productionMonitoring';
import { COLORS } from '../../design-system/tokens';

interface Props {
    snapshots: ProductionMonitoringSnapshot[];
    selectedOrderId: string | null;
}

export const OperationalAlertsPanel: React.FC<Props> = ({ snapshots, selectedOrderId }) => {
    
    // Aggregate warnings and alerts across all active snapshots
    const alerts: Array<{ orderId: string; type: 'WARNING' | 'RISK' | 'BREACH'; message: string; action: string }> = [];

    snapshots.forEach(s => {
        // Warning alerts
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

        // SLA status alerts
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
        <div className={`border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} p-6`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-6 ${COLORS.adaptive.textSecondary}`}>
                Operational Alerts & Recommendations
            </h3>

            {alerts.length === 0 ? (
                <div className="py-4 text-center text-xs text-zinc-500 font-semibold">
                    No active warnings or alerts. All queue parameters nominal.
                </div>
            ) : (
                <div className="space-y-4">
                    {alerts.map((alert, idx) => {
                        const isSelected = selectedOrderId === alert.orderId;
                        const cardStyles = 
                            alert.type === 'BREACH' ? 'border-red-500/20 bg-red-500/5 text-red-700' :
                            alert.type === 'RISK' ? 'border-amber-500/20 bg-amber-500/5 text-amber-700' :
                            'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/10 text-zinc-800 dark:text-zinc-300';
                        
                        return (
                            <div 
                                key={idx} 
                                className={`border p-4 ${cardStyles} ${isSelected ? 'ring-1 ring-red-500' : ''}`}
                            >
                                <div className="text-xs font-black mb-1">
                                    {alert.message}
                                </div>
                                <div className="text-[10px] text-zinc-500 font-medium">
                                    <strong>Recommendation:</strong> {alert.action}
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
