import React from 'react';
import { COLORS } from '../../design-system/tokens';

interface Props {
    stats: {
        total_jobs: number;
        queued_jobs: number;
        active_jobs: number;
        blocked_jobs: number;
        on_track_jobs: number;
        at_risk_jobs: number;
        breached_jobs: number;
    };
}

export const ProductionQueueOverview: React.FC<Props> = ({ stats }) => {
    const cards = [
        { label: 'Total Jobs', value: stats.total_jobs, color: 'text-zinc-900 dark:text-zinc-100', bg: 'bg-zinc-100/50 dark:bg-zinc-800/20' },
        { label: 'Active', value: stats.active_jobs, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Queued', value: stats.queued_jobs, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
        { label: 'Blocked', value: stats.blocked_jobs, color: 'text-red-600 dark:text-red-500', bg: 'bg-red-500/10' },
        { label: 'On Track', value: stats.on_track_jobs, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
        { label: 'At Risk', value: stats.at_risk_jobs, color: 'text-amber-600 dark:text-amber-500', bg: 'bg-amber-500/10' },
        { label: 'Breached', value: stats.breached_jobs, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-600/20' }
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {cards.map((card, idx) => (
                <div 
                    key={idx} 
                    className={`p-4 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} ${COLORS.adaptive.hoverLift} transition-all duration-300 relative overflow-hidden`}
                >
                    <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1">
                        {card.label}
                    </div>
                    <div className={`text-2xl font-black ${card.color}`}>
                        {card.value}
                    </div>
                    <div className={`absolute right-0 bottom-0 w-8 h-8 rounded-tl-full opacity-10 ${card.bg}`} />
                </div>
            ))}
        </div>
    );
};
export default ProductionQueueOverview;
