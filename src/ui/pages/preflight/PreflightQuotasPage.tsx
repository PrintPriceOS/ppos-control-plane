import React from 'react';
import { ScaleIcon, BoltIcon, ClockIcon } from "@heroicons/react/24/outline";
import { getPreflightQuotas } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";

export const PreflightQuotasPage: React.FC = () => {
  const q = useAdminQuery("preflight:quotas", getPreflightQuotas, 30000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Preflight Quotas</h1>
        <p className="text-sm text-slate-500 font-medium">Tenant-level usage limits and throughput throttling.</p>
      </div>

      <DataTable 
        isLoading={q.status === 'loading'}
        data={q.data || []}
        columns={[
          {
            header: 'Tenant ID',
            accessor: (q) => <span className="font-bold text-primary">{q.tenantId}</span>
          },
          {
            header: 'Daily Usage',
            accessor: (q) => (
              <div className="flex flex-col gap-1 w-32">
                <div className="h-2 bg-slate-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                  <div className={`h-full ${q.usage / q.limit > 0.9 ? 'bg-red-500' : 'bg-primary'}`} 
                       style={{ width: `${(q.usage / q.limit) * 100}%` }} />
                </div>
                <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <span>{q.usage}</span>
                  <span>Limit: {q.limit}</span>
                </div>
              </div>
            )
          },
          {
            header: 'Rate Status',
            accessor: (q) => (
              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                q.usage >= q.limit ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
              }`}>
                {q.usage >= q.limit ? 'Throttled' : 'Nominal'}
              </span>
            )
          },
          {
            header: 'Reset Time',
            accessor: (q) => (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <ClockIcon className="w-3.5 h-3.5" />
                {new Date(q.resetAt).toLocaleTimeString()}
              </div>
            )
          }
        ]}
      />

      {!q.data && q.status !== 'loading' && (
        <div className="p-10 text-center font-bold text-slate-300 italic uppercase tracking-widest border-2 border-dashed border-slate-100 rounded-3xl">
          Endpoint Unavailable: Quota data could not be fetched.
        </div>
      )}
    </div>
  );
};
