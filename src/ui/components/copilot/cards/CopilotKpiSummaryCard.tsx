import React from 'react';
import { KpiSummaryCardPayload } from '../types';
import { TrendingUp, CheckCircle, Clock, Euro, ArrowUpRight } from 'lucide-react';
import { useLocale } from '../../../i18n';

export const CopilotKpiSummaryCard: React.FC<{ payload: KpiSummaryCardPayload }> = ({ payload }) => {
    const { locale, t } = useLocale();

    const periodText = (() => {
        if (!payload.periodLabel || payload.periodLabel === 'Esta semana' || payload.periodLabel === 'This week' || payload.periodLabel === 'Diese Woche') {
            return t('copilot.kpi.periodThisWeek') || 'This week';
        }
        if (payload.periodLabel === 'Este mes' || payload.periodLabel === 'This month' || payload.periodLabel === 'Diesen Monat') {
            return t('copilot.kpi.periodThisMonth') || 'This month';
        }
        if (payload.periodLabel === 'Últimos 30 días' || payload.periodLabel === 'Last 30 days' || payload.periodLabel === 'Letzte 30 Tage') {
            return t('copilot.kpi.periodLast30Days') || 'Last 30 days';
        }
        return payload.periodLabel;
    })();

    const numLocale = locale === 'es' ? 'es-ES' : locale === 'de' ? 'de-DE' : 'en-US';

    return (
        <div className="my-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] p-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <TrendingUp size={15} />
                    </div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {t('copilot.kpi.title') || 'Reporte Ejecutivo de Ventas'}
                    </span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {periodText}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-3">
                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/50">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                        {t('copilot.kpi.revenue') || 'Facturación'}
                    </span>
                    <span className="text-base font-extrabold text-zinc-900 dark:text-white mt-0.5 block">
                        {payload.revenue.toLocaleString(numLocale)} €
                    </span>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/50">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                        {t('copilot.kpi.quotes') || 'Presupuestos'}
                    </span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                        {t('copilot.kpi.quotesAccepted', { count: payload.acceptedQuotes }) || `${payload.acceptedQuotes} aceptados`}
                    </span>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/50">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                        {t('copilot.kpi.inProduction') || 'En Producción'}
                    </span>
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 flex items-center gap-1.5">
                        <Clock size={13} className="text-amber-500" />
                        {t('copilot.kpi.jobsActive', { count: payload.pendingOrders }) || `${payload.pendingOrders} activos`}
                    </span>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/50">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                        {t('copilot.kpi.avgTicket') || 'Ticket Medio'}
                    </span>
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 flex items-center gap-1">
                        <Euro size={13} className="text-zinc-400" />
                        {t('copilot.kpi.perOrder', { amount: payload.avgTicket }) || `${payload.avgTicket} € / pedido`}
                    </span>
                </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
                <span>{t('copilot.kpi.escrowProtection') || 'Fondos protegidos en Escrow (POD)'}</span>
                <a
                    href="#/orders"
                    className="inline-flex items-center gap-1 text-[#dc0000] hover:underline font-bold"
                >
                    {t('copilot.kpi.viewOrders') || 'Ver pedidos'} <ArrowUpRight size={12} />
                </a>
            </div>
        </div>
    );
};
