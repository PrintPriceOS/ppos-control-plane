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
import { useTheme } from "../../hooks/useTheme";

export const FinancialOpsTab: React.FC = () => {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [selectedTx, setSelectedTx] = useState<any | null>(null);
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const theme = useTheme();
    const isLight = theme === 'light';

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

    return (
        <div className="space-y-6 font-manrope">
            {/* Topbar Banner */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={`text-xl font-black tracking-tight flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                        <BanknotesIcon className="w-6 h-6 text-emerald-600" />
                        Financial Operations
                    </h2>
                    <p className={`text-sm font-medium tracking-tight ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        Immutable settlement ledger &amp; global remittance tracking.
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-none border text-[10px] font-black uppercase tracking-widest ${
                        isLight ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    }`}>
                        <BoltIcon className="w-3 h-3" /> Ledger Active
                    </div>
                </div>
            </div>

            {/* Financial Metrics Cards */}
            {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className={`p-5 rounded-none border transition-all ${isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                        <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>Total Gross Volume</div>
                        <div className={`text-2xl font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                            {metrics.total_gross?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) || '0 €'}
                        </div>
                    </div>
                    <div className={`p-5 rounded-none border transition-all ${isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                        <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Platform Revenue</div>
                        <div className={`text-2xl font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                            {metrics.total_fees?.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) || '0 €'}
                        </div>
                    </div>
                    <div className={`p-5 rounded-none border transition-all ${isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                        <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Settled Trans.</div>
                        <div className={`text-2xl font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                            {metrics.settled_count}
                        </div>
                    </div>
                    <div className={`p-5 rounded-none border transition-all ${isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                        <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Settlement Rate</div>
                        <div className={`text-2xl font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                            {((metrics.settled_count / metrics.total_count) * 100 || 0).toFixed(1)}%
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Transactions Table Container */}
                <div className="lg:col-span-2">
                    <div className={`rounded-none border overflow-hidden transition-all ${isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                        <table className="w-full text-left">
                            <thead className={`border-b ${isLight ? 'bg-zinc-50/50 border-zinc-100' : 'bg-zinc-950/40 border-zinc-800'}`}>
                                <tr>
                                    <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>Reference</th>
                                    <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>Job</th>
                                    <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-right ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>Gross</th>
                                    <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-right ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>Fee</th>
                                    <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>Status</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${isLight ? 'divide-zinc-100' : 'divide-zinc-800/60'}`}>
                                {transactions.map((tx, i) => {
                                    const isSelected = selectedTx?.id === tx.id;
                                    return (
                                        <tr
                                            key={i}
                                            onClick={() => fetchDetail(tx.id)}
                                            className={`cursor-pointer transition-colors ${
                                                isLight 
                                                    ? `hover:bg-zinc-50 ${isSelected ? 'bg-indigo-50/30' : ''}` 
                                                    : `hover:bg-zinc-800/40 ${isSelected ? 'bg-zinc-800/80 border-l-2 border-indigo-500' : ''}`
                                            }`}
                                        >
                                            <td className="px-4 py-4">
                                                <div className={`text-[11px] font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>{tx.transaction_reference}</div>
                                                <div className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-tighter">{short(tx.id, 8)}...</div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className={`text-[11px] font-bold truncate max-w-[150px] ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>{tx.job_name || 'N/A'}</div>
                                            </td>
                                            <td className={`px-4 py-4 text-right font-black text-xs ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                                                {Number(tx.gross_amount || 0).toFixed(2)} {tx.currency}
                                            </td>
                                            <td className="px-4 py-4 text-right font-black text-emerald-600 text-xs">
                                                {Number(tx.platform_fee || 0).toFixed(2)} {tx.currency}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-none border uppercase tracking-widest ${
                                                    tx.transaction_status === 'SETTLED' 
                                                        ? (isLight ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-emerald-950 text-emerald-400 border-emerald-800')
                                                        : tx.transaction_status === 'FAILED' 
                                                        ? (isLight ? 'bg-red-50 text-red-600 border-red-100' : 'bg-red-950 text-red-400 border-red-800')
                                                        : tx.transaction_status === 'CREATED' 
                                                        ? (isLight ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-blue-950 text-blue-400 border-blue-800')
                                                        : (isLight ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-amber-950 text-amber-400 border-amber-800')
                                                }`}>
                                                    {tx.transaction_status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Ledger Inspector Container */}
                <div className="lg:col-span-1">
                    {selectedTx ? (
                        <div className="space-y-4">
                            <div className={`rounded-none border p-5 transition-all ${isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'}`}>
                                <h3 className={`text-sm font-black tracking-tight flex items-center gap-2 mb-4 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                                    <IdentificationIcon className="w-4 h-4 text-indigo-500" />
                                    Ledger Inspector
                                </h3>
                                <div className="space-y-3">
                                    {selectedTx.ledger.map((entry: any, i: number) => (
                                        <div key={i} className={`p-3 rounded-none border flex justify-between items-center ${
                                            entry.entry_type === 'DEBIT' 
                                                ? (isLight ? 'bg-red-50/30 border-red-100' : 'bg-red-950/30 border-red-900/40') 
                                                : (isLight ? 'bg-emerald-50/30 border-emerald-100' : 'bg-emerald-950/30 border-emerald-900/40')
                                        }`}>
                                            <div>
                                                <div className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">{entry.account_type}</div>
                                                <div className={`text-[10px] font-black ${isLight ? 'text-zinc-900' : 'text-white'}`}>{entry.entry_type}</div>
                                            </div>
                                            <div className={`text-xs font-black ${entry.entry_type === 'DEBIT' ? 'text-red-500' : 'text-emerald-500'}`}>
                                                {Number(entry.amount || 0).toFixed(2)} {entry.currency}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className={`mt-6 pt-6 border-t ${isLight ? 'border-zinc-100' : 'border-zinc-800'}`}>
                                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}>Documents &amp; Audit</h4>
                                    <div className="space-y-2">
                                        {selectedTx.invoices.map((inv: any, i: number) => (
                                            <div key={i} className={`flex items-center justify-between p-2 rounded-none ${isLight ? 'bg-zinc-50' : 'bg-zinc-950'}`}>
                                                <div className="flex items-center gap-2">
                                                    <DocumentTextIcon className="w-3 h-3 text-zinc-500" />
                                                    <span className={`text-[10px] font-bold ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>{inv.invoice_number}</span>
                                                </div>
                                                <span className="text-[8px] font-black text-indigo-500 uppercase">{inv.invoice_type}</span>
                                            </div>
                                        ))}
                                        {selectedTx.payouts.map((p: any, i: number) => (
                                            <div key={i} className={`flex items-center justify-between p-2 rounded-none border ${
                                                isLight ? 'bg-emerald-50/50 border-emerald-100/50' : 'bg-emerald-950/20 border-emerald-900/30'
                                            }`}>
                                                <div className="flex items-center gap-2">
                                                    <CheckCircleIcon className="w-3 h-3 text-emerald-500" />
                                                    <span className="text-[10px] font-bold text-emerald-600">{p.payout_status}</span>
                                                </div>
                                                <span className="text-[8px] font-black text-emerald-500 uppercase">{p.external_reference || 'TBD'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={`h-full min-h-[400px] rounded-none border-2 border-dashed flex flex-col items-center justify-center space-y-3 ${
                            isLight ? 'bg-zinc-50/50 border-zinc-200 text-zinc-400' : 'bg-zinc-950/40 border-zinc-800 text-zinc-600'
                        }`}>
                            <CurrencyEuroIcon className="w-12 h-12 opacity-20" />
                            <p className="font-black uppercase text-[10px] tracking-widest opacity-40">Select transaction to inspect ledger</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
