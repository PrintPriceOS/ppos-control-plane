import React, { useState } from 'react';
import { CircleStackIcon, MagnifyingGlassIcon, DocumentArrowDownIcon, CommandLineIcon, TicketIcon } from "@heroicons/react/24/outline";
import { getPreflightJobs, getPreflightArtifacts } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";

export const PreflightArtifactsPage: React.FC = () => {
  const [searchJobId, setSearchJobId] = useState('');
  const artifactsQ = useAdminQuery(
    `preflight:artifacts:search:${searchJobId}`, 
    () => searchJobId ? getPreflightArtifacts(searchJobId) : Promise.resolve([]),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-[#ECECF1] tracking-tight">Preflight Artifacts</h1>
        <p className="text-sm text-slate-500 font-medium">Registry of generated PDFs and JSON reports.</p>
      </div>

      <div className="glass p-4 rounded-2xl border border-white dark:border-white/[0.08] italic-text-off max-w-xl">
          <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
              <input 
                  type="text" 
                  placeholder="Enter Job ID to view artifacts..." 
                  value={searchJobId}
                  onChange={(e) => setSearchJobId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-white/[0.03] border-none rounded-xl pl-10 pr-4 py-2 text-sm font-bold text-slate-700 dark:text-[#ECECF1] placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20"
              />
          </div>
      </div>

      {searchJobId ? (
        <DataTable 
          isLoading={artifactsQ.status === 'loading'}
          data={artifactsQ.data || []}
          columns={[
            {
              header: 'Artifact Name',
              accessor: (a) => (
                <div className="flex items-center gap-3">
                  {a.type === 'PDF' ? <DocumentArrowDownIcon className="w-4 h-4 text-primary" /> : <CommandLineIcon className="w-4 h-4 text-slate-400" />}
                  <span className="font-bold">{a.name}</span>
                </div>
              )
            },
            {
              header: 'Type',
              accessor: (a) => (
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-[9px] font-black uppercase text-slate-500 tracking-wider">
                  {a.type}
                </span>
              )
            },
            {
              header: 'Size',
              accessor: (a) => <span className="font-mono text-xs text-slate-500">{a.size ? formatSize(a.size) : '—'}</span>
            },
            {
              header: 'Created',
              accessor: (a) => <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
            },
            {
              header: '',
              accessor: () => (
                <button className="text-primary font-black text-[10px] uppercase tracking-widest hover:underline">Download</button>
              ),
              className: 'text-right'
            }
          ]}
        />
      ) : (
        <div className="p-20 text-center border-2 border-dashed border-slate-100 dark:border-white/[0.05] rounded-3xl">
           <CircleStackIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
           <p className="text-slate-400 font-bold italic">Enter a Job ID above to inspect forensic artifacts.</p>
        </div>
      )}
    </div>
  );
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
