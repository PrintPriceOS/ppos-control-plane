import React from 'react';
import { TicketIcon, ShieldCheckIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import { getPreflightJobs } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";
import { useNavigate } from "react-router-dom";
import { short } from "../../lib/formatters";

export const PreflightCertificatesPage: React.FC = () => {
  const navigate = useNavigate();
  // Fetch jobs with type CERTIFY or completed jobs in general
  const q = useAdminQuery("preflight:certificates", () => getPreflightJobs({ status: 'COMPLETED', limit: 50 }), 30000);

  // Filter for jobs that are either explicitly CERTIFY or resulted in a no-op (meaning pure certification)
  const certJobs = q.data?.jobs.filter(j => j.type === 'CERTIFY' || j.noopFix) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Certification Ledger</h1>
        <p className="text-sm text-slate-500 font-medium">History of industrial compliance certificates issued.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 italic-text-off">
         <div className="glass p-6 rounded-3xl border border-white dark:border-white/[0.08] flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center shadow-sm">
               <CheckBadgeIcon className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Certified</p>
               <h3 className="text-xl font-black text-slate-900 dark:text-[#ECECF1] leading-none">{certJobs.length}</h3>
            </div>
         </div>
         <div className="glass p-6 rounded-3xl border border-white dark:border-white/[0.08] flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center shadow-sm">
               <ShieldCheckIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Policy Adherence</p>
               <h3 className="text-xl font-black text-slate-900 dark:text-[#ECECF1] leading-none">100%</h3>
            </div>
         </div>
      </div>

      <DataTable 
        isLoading={q.status === 'loading'}
        data={certJobs}
        onRowClick={(j) => navigate(`/preflight/jobs/${j.jobId}`)}
        columns={[
          {
            header: 'Certificate ID',
            accessor: (j) => <span className="font-mono text-xs font-bold text-slate-400 uppercase">CERT-{short(j.jobId, 8)}</span>

          },
          {
            header: 'Tenant',
            accessor: (j) => <span className="font-bold text-slate-700 dark:text-[#ECECF1]">{j.tenantId}</span>
          },
          {
            header: 'Document',
            accessor: (j) => <span className="font-medium text-slate-600 dark:text-zinc-400 truncate max-w-[200px] block">{j.filename}</span>
          },
          {
            header: 'Policy',
            accessor: (j) => (
              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-[9px] font-black uppercase text-slate-500 tracking-wider">
                {j.policy || 'STANDARD'}
              </span>
            )
          },
          {
            header: 'Issued At',
            accessor: (j) => <span className="text-xs text-slate-400">{new Date(j.completedAt || j.createdAt).toLocaleString()}</span>
          },
          {
            header: '',
            accessor: () => <TicketIcon className="w-4 h-4 text-primary" />,
            className: 'w-8'
          }
        ]}
      />
      
      {certJobs.length === 0 && q.status === 'success' && (
        <div className="p-20 text-center border-2 border-dashed border-slate-100 dark:border-white/[0.05] rounded-3xl">
           <TicketIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
           <p className="text-slate-400 font-bold italic">No certification records found in the current ledger.</p>
        </div>
      )}
    </div>
  );
};
