import React from 'react';
import { ProductionTimelineEvent } from '../../types/productionMonitoring';

interface Props {
    events: ProductionTimelineEvent[];
    orderId: string | null;
}

export const ProductionTimelinePanel: React.FC<Props> = ({ events, orderId }) => {
    const getDotColor = (status: string) => {
        if (status === 'BLOCKER') return 'bg-[#dc0000] dark:bg-red-500';
        if (status === 'WARNING') return 'bg-amber-500';
        if (status === 'RESOLVED') return 'bg-emerald-500';
        return 'bg-slate-400 dark:bg-zinc-500';
    };

    const getTypeBadge = (status: string) => {
        if (status === 'BLOCKER') return 'bg-[#dc0000] dark:bg-red-650 text-white';
        if (status === 'WARNING') return 'bg-amber-500 text-white';
        if (status === 'RESOLVED') return 'bg-emerald-600 text-white';
        return 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700';
    };

    return (
        <div className="glass border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm p-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400 mb-6 border-l-2 border-[#dc0000] pl-3">
                Production Event Timeline {orderId ? `— Order ${orderId}` : ''}
            </h3>

            {!orderId ? (
                <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500">
                    Select a monitored item from the list to view its audit timeline.
                </div>
            ) : !Array.isArray(events) || events.length === 0 ? (
                <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500">
                    No timeline events recorded for this order.
                </div>
            ) : (
                <div className="relative border-l-2 border-slate-200 dark:border-zinc-800 ml-3 pl-6 space-y-6">
                    {events.map((event) => (
                        <div key={event.id} className="relative">
                            <div className={`absolute -left-[31px] top-1.5 w-4 h-4 border-2 border-white dark:border-zinc-950 ${getDotColor(event.event_status)}`} />
                            <div>
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-[9px] font-mono text-slate-500 dark:text-zinc-450">
                                        {new Date(event.created_at).toLocaleTimeString()}
                                    </span>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 uppercase tracking-widest ${getTypeBadge(event.event_status)}`}>
                                        {event.event_type}
                                    </span>
                                </div>
                                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                                    {event.message}
                                </p>
                                <span className="text-[9px] text-slate-500 dark:text-zinc-500 font-mono">
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
