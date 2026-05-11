import { getStorageSummary } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";

export const PreflightQuotasPage: React.FC = () => {
  const q = useAdminQuery("preflight:storage:all", () => getStorageSummary(), 30000);

  const formatSize = (bytes: number) => {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const tenants = q.data?.tenants || [];

  return (
    <div className="space-y-6 italic-text-off">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Storage Quotas</h1>
          <p className="text-sm text-slate-500 font-medium">Multi-tenant storage usage and 2GB hard-limit enforcement.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <QuotaCard
          label="Global Utilization"
          value={formatSize(q.data?.totalBytes || 0)}
          limit={formatSize(tenants.length * 2147483648)}
          progress={((q.data?.totalBytes || 0) / (tenants.length * 2147483648 || 1)) * 100}
        />
      </div>

      <DataTable
        isLoading={q.status === 'loading'}
        data={tenants}
        columns={[
          {
            header: 'Tenant ID',
            accessor: (t) => <span className="font-bold text-primary">{t.tenantId}</span>
          },
          {
            header: 'Used Storage',
            accessor: (t) => (
              <div className="flex flex-col gap-1 w-48">
                <div className="h-2 bg-slate-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
                  <div className={`h-full ${t.usedBytes / t.quotaBytes > 0.9 ? 'bg-red-500' : 'bg-primary'}`}
                    style={{ width: `${(t.usedBytes / t.quotaBytes) * 100}%` }} />
                </div>
                <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <span>{formatSize(t.usedBytes)}</span>
                  <span>Limit: {formatSize(t.quotaBytes)}</span>
                </div>
              </div>
            )
          },
          {
            header: 'Remaining',
            accessor: (t) => <span className="text-xs font-mono text-slate-500">{formatSize(t.remainingBytes)}</span>
          },
          {
            header: 'Capacity',
            accessor: (t) => (
              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${t.usedBytes >= t.quotaBytes ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                {((t.usedBytes / t.quotaBytes) * 100).toFixed(1)}% Full
              </span>
            )
          },
          {
            header: 'Files',
            accessor: (t) => <span className="text-xs font-bold text-slate-700 dark:text-[#ECECF1]">{t.fileCount} items</span>
          }
        ]}
      />

    </div>
  );
};

const QuotaCard = ({ label, value, limit, progress }: any) => (
  <div className="glass p-6 rounded-3xl border border-white dark:border-white/[0.08] space-y-4">
    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">{value}</span>
      <span className="text-xs font-bold text-slate-400">/ {limit}</span>
    </div>
    <div className="space-y-1.5">
      <div className="h-2 bg-slate-100 dark:bg-white/[0.05] rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
        <span>Utilization</span>
        <span>{progress.toFixed(1)}%</span>
      </div>
    </div>
  </div>
);
