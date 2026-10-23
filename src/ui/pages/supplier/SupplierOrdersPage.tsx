import React from 'react';
import { 
    InboxIcon, 
    ClockIcon, 
    ArrowPathIcon,
    ShieldCheckIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import { useLocale } from '../../i18n';

export const SupplierOrdersPage: React.FC = () => {
    const { t } = useLocale();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 pb-5">
                <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-0.5 text-xs font-semibold rounded-full bg-red-600 text-white shadow-xs">
                        {t('supplier.orders.badge') || 'Paper Supplier Hub'}
                    </span>
                    <span className="px-3 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                        {t('supplier.orders.phaseTag') || 'Phase I4 Planned'}
                    </span>
                </div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {t('supplier.orders.title') || 'Procurement Orders & Fulfillment'}
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                    {t('supplier.orders.subtitle') || 'Incoming purchase orders and procurement dispatch fulfillment from print houses.'}
                </p>
            </div>

            {/* Structured Placeholder / Planned Scope Card */}
            <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs text-center max-w-2xl mx-auto space-y-4 my-8">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center text-zinc-400">
                    <InboxIcon className="w-7 h-7" />
                </div>
                <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {t('supplier.orders.emptyTitle') || 'Procurement Orders Module Pending (Phase I4 / R2)'}
                    </h2>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto mt-2 leading-relaxed">
                        {t('supplier.orders.emptyDesc') || 'Order reception, automated PO acknowledgment, and warehouse dispatch fulfillment will become available once the RFQ and Printhouse Procurement lifecycle is activated in Phase I4.'}
                    </p>
                </div>

                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left text-xs">
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-start gap-3">
                        <ClockIcon className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-slate-800 dark:text-zinc-200">
                                {t('supplier.orders.rfqFlow') || 'Bidirectional RFQ'}
                            </p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                                {t('supplier.orders.rfqFlowDesc') || 'Printhouse RFQs and customized volume quote proposals.'}
                            </p>
                        </div>
                    </div>
                    <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-start gap-3">
                        <ShieldCheckIcon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-slate-800 dark:text-zinc-200">
                                {t('supplier.orders.dispatchFlow') || 'Idempotent Restock'}
                            </p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                                {t('supplier.orders.dispatchFlowDesc') || 'Atomic delivery verification and warehouse intake ledger integration.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
