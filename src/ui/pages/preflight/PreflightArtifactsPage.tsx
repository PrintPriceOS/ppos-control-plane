import React, { useState } from 'react';
import { 
  CircleStackIcon, 
  MagnifyingGlassIcon, 
  DocumentArrowDownIcon, 
  CommandLineIcon, 
  TicketIcon,
  ArchiveBoxIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import { getPreflightArtifacts, getGlobalArtifacts } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";
import { short } from "../../lib/formatters";


export const PreflightArtifactsPage: React.FC = () => {
  const [searchJobId, setSearchJobId] = useState('');
  
  const artifactsQ = useAdminQuery(
    `preflight:artifacts:list:${searchJobId}`, 
    () => searchJobId ? getPreflightArtifacts(searchJobId) : getGlobalArtifacts(),
    15000
  );

  const handleDownload = (id: string) => {
    const token = localStorage.getItem('admin_token');
    window.open(`/api/admin/preflight/artifacts/${id}/download?token=${token}`, '_blank');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this artifact? This action is reversible by an admin but will hide it from the UI.')) return;
    try {
      await deletePreflightArtifact(id);
      artifactsQ.refetch();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Preflight Artifacts</h1>
        <p className="text-sm text-slate-500 font-medium">Registry of generated PDFs and JSON reports.</p>
      </div>

      <div className="glass p-4 rounded-none border border-white dark:border-white/[0.08] italic-text-off max-w-xl">
          <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
              <input 
                  type="text" 
                  placeholder="Enter Job ID to view artifacts..." 
                  value={searchJobId}
                  onChange={(e) => setSearchJobId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#131314]/[0.03] border-none rounded-none pl-10 pr-4 py-2 text-sm font-bold text-slate-700 dark:text-[#ECECF1] placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20"
              />
          </div>
      </div>

      <DataTable 
        isLoading={artifactsQ.status === 'loading'}
        data={artifactsQ.data || []}
        columns={[
          {
            header: 'Artifact Name',
            accessor: (a) => (
              <div className="flex items-center gap-3">
                {a.mime_type?.includes('pdf') ? (
                  <DocumentArrowDownIcon className="w-4 h-4 text-primary" />
                ) : (
                  <CommandLineIcon className="w-4 h-4 text-slate-400" />
                )}
                <div className="flex flex-col">
                  <span className="font-bold truncate max-w-xs">{a.filename}</span>
                  <span className="text-[10px] font-mono text-slate-400">ID: {short(a.id, 8)} • Job: {short(a.job_id, 8)}</span>

                </div>
              </div>
            )
          },
          {
            header: 'Tenant',
            accessor: (a) => <span className="font-bold text-primary">{a.tenant_id}</span>
          },
          {
            header: 'Type',
            accessor: (a) => (
              <span className="px-2 py-0.5 rounded-none bg-slate-100 dark:bg-[#131314]/[0.06] text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">
                {a.type}
              </span>
            )
          },
          {
            header: 'Size',
            accessor: (a) => <span className="font-mono text-xs text-slate-500">{formatSize(a.size_bytes)}</span>
          },
          {
            header: 'Created',
            accessor: (a) => <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
          },
          {
            header: '',
            accessor: (a) => (
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => handleDownload(a.id)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary font-black text-[10px] uppercase tracking-widest rounded-none hover:bg-primary/20 transition-colors"
                >
                  <DocumentArrowDownIcon className="w-3.5 h-3.5" />
                  Download
                </button>
                <button 
                  onClick={() => handleDelete(a.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-none transition-all"
                  title="Delete Artifact"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ),
            className: 'text-right'
          }
        ]}
      />
    </div>
  );
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat(Number((bytes || 0) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
