import React from 'react';

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
        { label: 'Total Jobs',  value: stats.total_jobs,   accent: 'border-slate-300 dark:border-zinc-750',        num: 'text-slate-900 dark:text-white' },
        { label: 'Active',      value: stats.active_jobs,  accent: 'border-sky-300 dark:border-sky-500/40',       num: 'text-sky-600 dark:text-sky-400' },
        { label: 'Queued',      value: stats.queued_jobs,  accent: 'border-violet-300 dark:border-violet-500/40',    num: 'text-violet-600 dark:text-violet-400' },
        { label: 'Blocked',     value: stats.blocked_jobs, accent: 'border-red-300 dark:border-red-600/40',       num: 'text-red-600 dark:text-red-500' },
        { label: 'On Track',    value: stats.on_track_jobs,accent: 'border-emerald-300 dark:border-emerald-500/40',   num: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'At Risk',     value: stats.at_risk_jobs, accent: 'border-amber-300 dark:border-amber-500/40',     num: 'text-amber-600 dark:text-amber-400' },
        { label: 'Breached',    value: stats.breached_jobs,accent: 'border-red-400/60 dark:border-red-600/60',       num: 'text-red-650 dark:text-red-400 font-bold' },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.isArray(cards) && cards.map((card, idx) => (
                <div
                    key={idx}
                    className={`glass border ${card.accent} bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm p-4 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-all duration-200 relative overflow-hidden`}
                >
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-1">
                        {card.label}
                    </div>
                    <div className={`font-mono font-black text-2xl tracking-tight ${card.num}`}>
                        {card.value}
                    </div>
                </div>
            ))}
        </div>
    );
};
export default ProductionQueueOverview;
