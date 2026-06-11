import React from 'react';
import { ProductionTimelineEvent } from '../../types/productionMonitoring';
import { COLORS } from '../../design-system/tokens';

interface Props {
    events: ProductionTimelineEvent[];
    orderId: string | null;
}

export const ProductionTimelinePanel: React.FC<Props> = ({ events, orderId }) => {
    
    const getBadgeStyle = (status: string) => {
        switch (status) {
            case 'BLOCKER': return 'bg-red-600 text-white';
            case 'WARNING': return 'bg-amber-500 text-white';
            case 'RESOLVED': return 'bg-emerald-500 text-white';
            default: return 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300';
        }
    };

    return (
        <div className={`border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} p-6`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-6 ${COLORS.adaptive.textSecondary}`}>
                Production Event Timeline {orderId ? `— Order ${orderId}` : ''}
            </h3>

            {!orderId ? (
                <div className="py-8 text-center text-xs font-semibold text-zinc-500">
                    Select a monitored item from the list to view its audit timeline.
                </div>
            ) : events.length === 0 ? (
                <div className="py-8 text-center text-xs font-semibold text-zinc-500">
                    No timeline events recorded for this order.
                </div>
            ) : (
                <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800 ml-3 pl-6 space-y-6">
                    {events.map((event) => (
                        <div key={event.id} className="relative">
                            {/* Dot indicator */}
                            <div className={`absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full border-4 border-white dark:border-zinc-950 flex items-center justify-center ${
                                event.event_status === 'BLOCKER' ? 'bg-red-600' :
                                event.event_status === 'WARNING' ? 'bg-amber-500' :
                                event.event_status === 'RESOLVED' ? 'bg-emerald-500' : 'bg-zinc-400'
                            }`} />
                            
                            <div>
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-[10px] font-mono text-zinc-500">
                                        {new Date(event.created_at).toLocaleTimeString()}
                                    </span>
                                    <span className={`text-[8px] font-black px-1 uppercase tracking-widest ${getBadgeStyle(event.event_status)}`}>
                                        {event.event_type}
                                    </span>
                                </div>
                                <p className={`text-xs font-semibold ${COLORS.adaptive.textPrimary}`}>
                                    {event.message}
                                </p>
                                <span className="text-[9px] text-zinc-500 font-mono">
                                    Actor: {event.actor_user_id || 'system'} ({event.actor_role || 'SYSTEM_ADMIN'})
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
export default ProductionTimelinePanel;
