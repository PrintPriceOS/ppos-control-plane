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
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Tenants & Subscriptions</h1>
          <p className="text-sm text-slate-500 font-medium">Lifecycle management, rate limits, and isolation status.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 glass p-5 rounded-2xl border border-white flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <GlobeAltIcon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-xl font-black text-slate-900">{q.data?.length || 0}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Ingestion Sources</p>
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
                <div className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center">
                  <GlobeAltIcon className="w-3 h-3 text-slate-400" />
                </div>
                <span className="font-mono">{t.tenant_id}</span>
              </div>
            )
          },
          { 
            header: 'Total Jobs', 
            accessor: (t) => (
              <div className="flex items-center gap-1.5 font-bold">
                <CircleStackIcon className="w-4 h-4 text-slate-300" />
                {t.totalJobs.toLocaleString()}
              </div>
            ) 
          },
          { 
            header: 'Success', 
            accessor: (t) => (
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, t.successRate)}%` }} />
                </div>
                <span className="text-[10px] font-black text-slate-400">{t.successRate.toFixed(1)}%</span>
              </div>
            )
          },
          { 
            header: 'Latency', 
            accessor: (t) => (
              <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-bold text-[10px] uppercase tracking-widest">
                {t.avgLatencyMs}ms
              </span>
            )
          },
          { 
             header: 'Last Activity', 
             accessor: (t) => (
               <div className="flex items-center gap-2 text-slate-400 font-medium text-xs">
                 <ClockIcon className="w-3.5 h-3.5" />
                 {new Date(t.lastActivity).toLocaleTimeString()}
               </div>
             ),
             className: 'text-right'
          },
          {
            header: '',
            accessor: () => (
              <button className="p-2 rounded-lg text-slate-300 hover:text-primary transition-colors">
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
