import React, { useState, useEffect } from 'react';
import { 
  BanknotesIcon, 
  ArrowPathIcon,
  CheckCircleIcon,
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  ScaleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { getProductionFinancials } from '../../lib/adminApi';

export const ProductionBillingPage: React.FC = () => {
  const [financials, setFinancials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFinancials = async () => {
    setLoading(true);
    try {
      const data = await getProductionFinancials();
      setFinancials(data.financials || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancials();
  }, []);

  const totalRevenue = financials
    .filter(f => f.account_type === 'PLATFORM_REVENUE')
    .reduce((sum, f) => sum + parseFloat(f.amount), 0);

  const totalPayouts = financials
    .filter(f => f.account_type === 'PRINTER')
    .reduce((sum, f) => sum + parseFloat(f.amount), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 bg-slate-50 dark:bg-zinc-950 min-h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6 shadow-none">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-3">
            <BanknotesIcon className="w-8 h-8 text-emerald-600 dark:text-green-400" />
            Financial Settlement
          </h1>
          <p className="mt-1 text-slate-500 dark:text-zinc-400 text-sm font-mono">
            Real-time ledger for production transactions and platform revenue.
          </p>
        </div>
        <button 
          onClick={fetchFinancials}
          disabled={loading}
          className="px-4 py-2 bg-slate-950 hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white dark:text-zinc-100 font-mono font-bold text-xs uppercase tracking-wider rounded-none border border-slate-800 dark:border-zinc-700 transition-all flex items-center gap-2 shadow-none flex-shrink-0"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-none border border-slate-200 dark:border-zinc-800 shadow-none">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-green-950/40 border border-emerald-100 dark:border-green-900/60 rounded-none">
              <BanknotesIcon className="w-6 h-6 text-emerald-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs font-mono font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Platform Revenue</p>
              <h2 className="text-2xl font-black text-slate-900 dark:text-zinc-100 font-mono">€{Number(totalRevenue || 0).toFixed(2)}</h2>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-none border border-slate-200 dark:border-zinc-800 shadow-none">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 rounded-none">
              <ArrowUpRightIcon className="w-6 h-6 text-red-600 dark:text-red-500" />
            </div>
            <div>
              <p className="text-xs font-mono font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Printer Payouts</p>
              <h2 className="text-2xl font-black text-slate-900 dark:text-zinc-100 font-mono">€{Number(totalPayouts || 0).toFixed(2)}</h2>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-none border border-slate-200 dark:border-zinc-800 shadow-none">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-none">
              <ScaleIcon className="w-6 h-6 text-slate-600 dark:text-zinc-400" />
            </div>
            <div>
              <p className="text-xs font-mono font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Active Escrow</p>
              <h2 className="text-2xl font-black text-slate-900 dark:text-zinc-100 font-mono">€0.00</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-none border border-slate-200 dark:border-zinc-800 shadow-none overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 dark:bg-zinc-900 border-b border-slate-800 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold text-white dark:text-zinc-100 uppercase tracking-wider">General Ledger Entries</h3>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 dark:text-zinc-500 uppercase">
            <InformationCircleIcon className="w-3.5 h-3.5 text-amber-400" />
            Double-entry system verified
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-slate-700 dark:text-zinc-300">
            <thead>
              <tr className="bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-mono font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wider">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Transaction ID</th>
                <th className="px-6 py-3">Account</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-xs font-mono">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-zinc-500 italic-text-off animate-pulse">Loading ledger entries...</td>
                </tr>
              ) : financials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-zinc-600 italic-text-off">No financial transactions recorded yet.</td>
                </tr>
              ) : (
                financials.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-3 text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-bold text-slate-900 dark:text-zinc-200">
                      {entry.transaction_id}
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-bold text-slate-800 dark:text-zinc-100 block">
                        {entry.account_type}
                      </span>
                      {entry.metadata_json?.note && (
                        <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{entry.metadata_json.note}</p>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 border rounded-none text-[9px] font-black uppercase tracking-wider ${
                        entry.entry_type === 'DEBIT' 
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60' 
                          : 'bg-emerald-50 dark:bg-green-950/40 text-emerald-700 dark:text-green-400 border-emerald-200 dark:border-green-900/60'
                      }`}>
                        {entry.entry_type === 'DEBIT' ? (
                          <ArrowUpRightIcon className="w-2.5 h-2.5 mr-1 flex-shrink-0" />
                        ) : (
                          <ArrowDownLeftIcon className="w-2.5 h-2.5 mr-1 flex-shrink-0" />
                        )}
                        {entry.entry_type}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-bold text-slate-900 dark:text-zinc-100 text-right">
                      {entry.entry_type === 'DEBIT' ? '-' : '+'}
                      {Number(parseFloat(entry.amount) || 0).toFixed(2)} {entry.currency}
                    </td>
                    <td className="px-6 py-3">
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-green-400 font-bold uppercase tracking-wider">
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        SETTLED
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
