import React from 'react';
import { ProductionTimelineEvent } from '../../types/productionMonitoring';

interface Props {
    events: ProductionTimelineEvent[];
    orderId: string | null;
}

export const ProductionTimelinePanel: React.FC<Props> = ({ events, orderId }) => {
    const getDotColor = (status: string) => {
        if (status === 'BLOCKER') return 'bg-[#dc0000]';
        if (status === 'WARNING') return 'bg-amber-500';
        if (status === 'RESOLVED') return 'bg-emerald-500';
        return 'bg-zinc-500';
    };

    const getTypeBadge = (status: string) => {
        if (status === 'BLOCKER') return 'bg-[#dc0000] text-white';
        if (status === 'WARNING') return 'bg-amber-500 text-white';
        if (status === 'RESOLVED') return 'bg-emerald-600 text-white';
        return 'bg-zinc-800 text-zinc-400';
    };

    return (
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-6 border-l-2 border-[#dc0000] pl-3">
                Production Event Timeline {orderId ? `— Order ${orderId}` : ''}
            </h3>

            {!orderId ? (
                <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    Select a monitored item from the list to view its audit timeline.
                </div>
            ) : events.length === 0 ? (
                <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    No timeline events recorded for this order.
                </div>
            ) : (
                <div className="relative border-l-2 border-zinc-800 ml-3 pl-6 space-y-6">
                    {events.map((event) => (
                        <div key={event.id} className="relative">
                            <div className={`absolute -left-[31px] top-1.5 w-4 h-4 border-2 border-zinc-950 ${getDotColor(event.event_status)}`} />
                            <div>
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-[9px] font-mono text-zinc-500">
                                        {new Date(event.created_at).toLocaleTimeString()}
                                    </span>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 uppercase tracking-widest ${getTypeBadge(event.event_status)}`}>
                                        {event.event_type}
                                    </span>
                                </div>
                                <p className="text-xs font-semibold text-zinc-300">
                                    {event.message}
                                </p>
                                <span className="text-[9px] text-zinc-600 font-mono">
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
