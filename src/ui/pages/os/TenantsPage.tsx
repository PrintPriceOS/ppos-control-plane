import React from "react";
import { getTenants } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { GlobeAltIcon, CircleStackIcon, ClockIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { DataTable } from "../../components/DataTable";
import { TenantDetailDrawer } from "../../components/TenantDetailDrawer";

export const TenantsPage: React.FC = () => {
  const [selectedTenant, setSelectedTenant] = React.useState<any | null>(null);
  const q = useAdminQuery("tenants:global", () => getTenants("24h"), 30000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Tenants & Subscriptions</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Lifecycle management, rate limits, and isolation status.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 bg-white dark:bg-zinc-950 p-5 rounded-none border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 shadow-none">
            <div className="p-3 rounded-none bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300">
                <GlobeAltIcon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-xl font-black text-zinc-900 dark:text-zinc-100">{q.data?.length || 0}</p>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Active Ingestion Sources</p>
            </div>
        </div>
      </div>

      <DataTable 
        isLoading={q.status === 'loading'}
        data={q.data || []}
        onRowClick={(t) => setSelectedTenant(t)}
        columns={[
          { 
            header: 'Tenant ID', 
            accessor: (t) => (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-none bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                  <GlobeAltIcon className="w-3 h-3 text-zinc-400" />
                </div>
                <span className="font-mono text-zinc-900 dark:text-zinc-100 font-bold">{t.tenant_id}</span>
              </div>
            )
          },
          { 
            header: 'Total Jobs', 
            accessor: (t) => (
              <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100">
                <CircleStackIcon className="w-4 h-4 text-zinc-400" />
                {t.totalJobs.toLocaleString()}
              </div>
            ) 
          },
          { 
            header: 'Success', 
            accessor: (t) => (
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 bg-zinc-100 dark:bg-zinc-900 rounded-none overflow-hidden">
                  <div className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-none" style={{ width: `${Math.min(100, t.successRate)}%` }} />
                </div>
                <span className="text-[10px] font-bold text-zinc-400">{Number(t.successRate || 0).toFixed(1)}%</span>
              </div>
            )
          },
          { 
            header: 'Latency', 
            accessor: (t) => (
              <span className="px-2 py-0.5 rounded-none bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 font-bold text-[10px] uppercase tracking-widest">
                {t.avgLatencyMs}ms
              </span>
            )
          },
          { 
             header: 'Last Activity', 
             accessor: (t) => (
               <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-medium text-xs">
                 <ClockIcon className="w-3.5 h-3.5" />
                 {new Date(t.lastActivity).toLocaleTimeString()}
               </div>
             ),
             className: 'text-right'
          },
          {
            header: '',
            accessor: () => (
              <button className="p-2 rounded-none text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </button>
            ),
            className: 'w-10'
          }
        ]}
      />

      <TenantDetailDrawer 
        tenant={selectedTenant}
        isOpen={!!selectedTenant}
        onClose={() => setSelectedTenant(null)}
      />
    </div>
  );
};
