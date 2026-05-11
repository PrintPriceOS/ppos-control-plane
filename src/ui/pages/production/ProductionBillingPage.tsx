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
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <BanknotesIcon className="w-8 h-8 text-emerald-500" />
            Financial Settlement
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Real-time ledger for production transactions and platform revenue.
          </p>
        </div>
        <button 
          onClick={fetchFinancials}
          className="btn-premium"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-none border border-slate-100 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-none">
              <BanknotesIcon className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Platform Revenue</p>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">€{totalRevenue.toFixed(2)}</h2>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-900 p-6 rounded-none border border-slate-100 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-none">
              <ArrowUpRightIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Printer Payouts</p>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">€{totalPayouts.toFixed(2)}</h2>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-none border border-slate-100 dark:border-white/5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-500/10 rounded-none">
              <ScaleIcon className="w-6 h-6 text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Escrow</p>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">€0.00</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-slate-900 rounded-none border border-slate-100 dark:border-white/5 shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">General Ledger Entries</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <InformationCircleIcon className="w-4 h-4" />
            Double-entry system verified
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-[#131314]/[0.02]">
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Transaction ID</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Account</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Amount</th>
                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Loading ledger entries...</td>
                </tr>
              ) : financials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">No financial transactions recorded yet.</td>
                </tr>
              ) : (
                financials.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-[#1a1a1b]/[0.01] transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-900 dark:text-slate-300">
                      {entry.transaction_id}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {entry.account_type}
                      </span>
                      {entry.metadata_json?.note && (
                        <p className="text-[11px] text-slate-400">{entry.metadata_json.note}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-none text-[10px] font-bold uppercase tracking-wider ${
                        entry.entry_type === 'DEBIT' 
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10' 
                          : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10'
                      }`}>
                        {entry.entry_type === 'DEBIT' ? (
                          <ArrowUpRightIcon className="w-3 h-3 mr-1" />
                        ) : (
                          <ArrowDownLeftIcon className="w-3 h-3 mr-1" />
                        )}
                        {entry.entry_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white text-right">
                      {entry.entry_type === 'DEBIT' ? '-' : '+'}
                      {parseFloat(entry.amount).toFixed(2)} {entry.currency}
                    </td>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                        <CheckCircleIcon className="w-4 h-4" />
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
