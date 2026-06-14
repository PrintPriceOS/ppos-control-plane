import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    BanknotesIcon,
    DocumentTextIcon,
    BoltIcon,
    IdentificationIcon,
    CurrencyEuroIcon,
    CheckCircleIcon
} from "@heroicons/react/24/outline";
import { short } from "../../lib/formatters";

export const FinancialOpsTab: React.FC = () => {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [selectedTx, setSelectedTx] = useState<any | null>(null);
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [tData, mData] = await Promise.all([
                adminApi.getFinanceTransactions(),
                adminApi.getFinanceMetrics()
            ]);
            setTransactions(Array.isArray(tData) ? tData : []);
            setMetrics(mData);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch finance data:', err);
        }
    };

    const fetchDetail = async (id: string) => {
        try {
            const data = await adminApi.getFinanceTransactionDetail(id);
            setSelectedTx(data);
        } catch (err) {
            console.error('Failed to fetch transaction detail:', err);
        }
    };

    // Pre-normalize metrics contract
    const totalGross = metrics?.total_gross ?? metrics?.totalGross ?? 0;
    const totalFees = metrics?.total_fees ?? metrics?.totalFees ?? 0;
    const settledCount = metrics?.settled_count ?? metrics?.settledCount ?? 0;
    const totalCount = metrics?.total_count ?? metrics?.totalCount ?? 0;

    return (
        <div className="space-y-6 font-manrope">
            {/* Topbar Banner */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black tracking-tight flex items-center gap-2 text-slate-900 dark:text-white">
                        <BanknotesIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-450" />
                        Financial Operations
                    </h2>
                    <p className="text-sm font-medium tracking-tight text-slate-500 dark:text-zinc-400">
                        Immutable settlement ledger &amp; global remittance tracking.
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-none border text-[10px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900">
                        <BoltIcon className="w-3 h-3" /> Ledger Active
                    </div>
                </div>
            </div>

            {/* Financial Metrics Cards */}
            {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-5 rounded-none border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm transition-all">
                        <div className="text-[10px] font-black uppercase tracking-widest mb-1 text-slate-500 dark:text-zinc-400">Total Gross Volume</div>
                        <div className="font-mono font-black tracking-tight text-slate-900 dark:text-white text-2xl">
                            {totalGross.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) || '0 €'}
                        </div>
                    </div>
                    <div className="p-5 rounded-none border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm transition-all">
                        <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Platform Revenue</div>
                        <div className="font-mono font-black tracking-tight text-emerald-600 dark:text-emerald-400 text-2xl">
                            {totalFees.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) || '0 €'}
                        </div>
                    </div>
                    <div className="p-5 rounded-none border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm transition-all">
                        <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">Settled Trans.</div>
                        <div className="font-mono font-black tracking-tight text-slate-900 dark:text-white text-2xl">
                            {settledCount}
                        </div>
                    </div>
                    <div className="p-5 rounded-none border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm transition-all">
                        <div className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-1">Settlement Rate</div>
                        <div className="font-mono font-black tracking-tight text-slate-900 dark:text-white text-2xl">
                            {(totalCount > 0 ? (settledCount / totalCount) * 100 : 0).toFixed(1)}%
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Transactions Table Container */}
                <div className="lg:col-span-2">
                    <div className="rounded-none border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm overflow-hidden transition-all">
                        <table className="w-full text-left">
                            <thead className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40">
                                <tr>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Reference</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Job</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-right text-slate-500 dark:text-zinc-400">Gross</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-right text-slate-500 dark:text-zinc-400">Fee</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/60">
                                {!Array.isArray(transactions) || transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                                            No ledger transactions registered.
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.map((tx, i) => {
                                        const isSelected = selectedTx?.id === tx.id;
                                        // Normalize row contract
                                        const grossAmount = tx.gross_amount ?? tx.grossAmount ?? 0;
                                        const platformFee = tx.platform_fee ?? tx.platformFee ?? 0;
                                        const currency = tx.currency ?? 'EUR';
                                        const txStatus = tx.transaction_status ?? tx.transactionStatus ?? 'PENDING';

                                        return (
                                            <tr
                                                key={i}
                                                onClick={() => fetchDetail(tx.id)}
                                                className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-zinc-900/50 ${
                                                    isSelected ? 'bg-slate-100 dark:bg-zinc-800/80 border-l-2 border-indigo-500' : ''
                                                }`}
                                            >
                                                <td className="px-4 py-4">
                                                    <div className="text-[11px] font-black text-slate-900 dark:text-zinc-200">{tx.transaction_reference}</div>
                                                    <div className="text-[9px] text-slate-500 dark:text-zinc-400 font-mono font-bold uppercase tracking-tighter">{short(tx.id, 8)}...</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="text-[11px] font-bold truncate max-w-[150px] text-slate-700 dark:text-zinc-350">{tx.job_name || 'N/A'}</div>
                                                </td>
                                                <td className="px-4 py-4 text-right font-mono font-black text-slate-900 dark:text-white text-xs">
                                                    {Number(grossAmount).toFixed(2)} {currency}
                                                </td>
                                                <td className="px-4 py-4 text-right font-mono font-black text-emerald-650 dark:text-emerald-450 text-xs">
                                                    {Number(platformFee).toFixed(2)} {currency}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-none border uppercase tracking-widest ${
                                                        txStatus === 'SETTLED'
                                                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900'
                                                            : txStatus === 'FAILED'
                                                            ? 'bg-red-50 dark:bg-red-950/40 text-red-650 dark:text-red-400 border-red-100 dark:border-red-900'
                                                            : txStatus === 'CREATED'
                                                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-650 dark:text-blue-400 border-blue-100 dark:border-blue-900'
                                                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-650 dark:text-amber-500 border-amber-100 dark:border-amber-900'
                                                    }`}>
                                                        {txStatus}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Ledger Inspector Container */}
                <div className="lg:col-span-1">
                    {selectedTx ? (
                        <div className="space-y-4">
                            <div className="rounded-none border border-slate-200 dark:border-zinc-800 p-5 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm transition-all">
                                <h3 className="text-sm font-black tracking-tight flex items-center gap-2 mb-4 text-slate-900 dark:text-zinc-200">
                                    <IdentificationIcon className="w-4 h-4 text-indigo-500" />
                                    Ledger Inspector
                                </h3>
                                <div className="space-y-3">
                                    {Array.isArray(selectedTx.ledger) && selectedTx.ledger.map((entry: any, i: number) => {
                                        const isDebit = entry.entry_type === 'DEBIT';
                                        return (
                                            <div key={i} className={`p-3 rounded-none border flex justify-between items-center ${
                                                isDebit
                                                    ? 'bg-red-50/30 dark:bg-red-950/30 border-red-100 dark:border-red-900/40'
                                                    : 'bg-emerald-50/30 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40'
                                            }`}>
                                                <div>
                                                    <div className="text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">{entry.account_type}</div>
                                                    <div className="text-[10px] font-black text-slate-900 dark:text-zinc-250">{entry.entry_type}</div>
                                                </div>
                                                <div className={`font-mono font-black text-xs ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                    {Number(entry.amount || 0).toFixed(2)} {entry.currency}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-zinc-800">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 text-slate-500 dark:text-zinc-400">Documents &amp; Audit</h4>
                                    <div className="space-y-2">
                                        {Array.isArray(selectedTx.invoices) && selectedTx.invoices.map((inv: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded-none bg-slate-50 dark:bg-zinc-950">
                                                <div className="flex items-center gap-2">
                                                    <DocumentTextIcon className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                                                    <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-350">{inv.invoice_number}</span>
                                                </div>
                                                <span className="text-[8px] font-black text-indigo-500 uppercase">{inv.invoice_type}</span>
                                            </div>
                                        ))}
                                        {Array.isArray(selectedTx.payouts) && selectedTx.payouts.map((p: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded-none border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100/50 dark:border-emerald-900/30">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircleIcon className="w-3 h-3 text-emerald-500" />
                                                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{p.payout_status}</span>
                                                </div>
                                                <span className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase">{p.external_reference || 'TBD'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] rounded-none border-2 border-dashed flex flex-col items-center justify-center space-y-3 bg-slate-50/50 dark:bg-zinc-950/40 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                            <CurrencyEuroIcon className="w-12 h-12 opacity-20" />
                            <p className="font-black uppercase text-[10px] tracking-widest opacity-40">Select transaction to inspect ledger</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
export default FinancialOpsTab;
