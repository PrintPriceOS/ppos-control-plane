import React from 'react';
import { BillingEvent } from '../../types/billingUsage';
import { COLORS } from '../../design-system/tokens';

interface Props {
    events: BillingEvent[];
}

export const BillingEventsTimeline: React.FC<Props> = ({ events }) => {
    const formatAmount = (cents: number, currency: string) => {
        if (!cents) return '0.00 ' + currency;
        return (cents / 100).toFixed(2) + ' ' + currency;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className={`border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} overflow-hidden`}>
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800/50">
                <h3 className={`text-xs font-black uppercase tracking-widest ${COLORS.adaptive.textSecondary}`}>
                    Billing Event Logs
                </h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-zinc-50 dark:bg-zinc-800/20 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        <tr>
                            <th className="px-6 py-3">Timestamp</th>
                            <th className="px-6 py-3">Event Type</th>
                            <th className="px-6 py-3">Metric</th>
                            <th className="px-6 py-3 text-right">Adjustments / Fees</th>
                            <th className="px-6 py-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50 text-[11px] font-bold">
                        {events.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 font-bold uppercase tracking-widest">
                                    No billing events recorded in this period.
                                </td>
                            </tr>
                        ) : (
                            events.map((e) => (
                                <tr key={e.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                                    <td className="px-6 py-4 text-zinc-500 font-mono">
                                        {formatDate(e.created_at)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[9px] font-black px-2 py-0.5 border uppercase tracking-wider ${
                                            e.event_type === 'HARD_LIMIT_BLOCK'
                                                ? 'bg-red-50 text-red-600 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50'
                                                : e.event_type === 'LIMIT_WARNING'
                                                ? 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50'
                                                : e.event_type === 'OVERAGE_RECORDED'
                                                ? 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/50'
                                                : e.event_type === 'MANUAL_ADJUSTMENT'
                                                ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50'
                                                : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                                        }`}>
                                            {e.event_type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-300 uppercase">
                                        {e.metric || 'PLAN_LIMIT'}
                                    </td>
                                    <td className={`px-6 py-4 text-right ${
                                        e.amount_cents > 0 ? 'text-indigo-600 dark:text-indigo-400 font-black' : e.amount_cents < 0 ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-zinc-500'
                                    }`}>
                                        {formatAmount(e.amount_cents, e.currency)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
                                            {e.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
