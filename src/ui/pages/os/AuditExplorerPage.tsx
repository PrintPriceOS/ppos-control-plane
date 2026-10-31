import React, { useState } from 'react';
import { 
  FunnelIcon, 
  MagnifyingGlassIcon, 
  DocumentMagnifyingGlassIcon, 
  ClockIcon, 
  FingerPrintIcon,
  ArrowTopRightOnSquareIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline';
import { getAudit } from '../../lib/adminApi';
import { useAdminQuery } from '../../hooks/useAdminData';
import { DataTable } from '../../components/DataTable';
import { AuditDetailDrawer } from '../../components/AuditDetailDrawer';
import { short } from '../../lib/formatters';


export const AuditExplorerPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAudit, setSelectedAudit] = useState<any | null>(null);

    // Initial load: Last 100 logs
    const q = useAdminQuery('audit:default', () => getAudit({ limit: 100 }), 30000);

    // Local filtering
    const filteredData = React.useMemo(() => {
        if (!q.data) return [];
        if (!searchTerm) return q.data;
        const s = searchTerm.toLowerCase();
        return q.data.filter((a: any) => 
            a.id?.toString().toLowerCase().includes(s) || 
            a.request_id?.toLowerCase().includes(s) || 
            a.tenant_id?.toLowerCase().includes(s) ||
            a.job_id?.toLowerCase().includes(s)
        );
    }, [q.data, searchTerm]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Audit Explorer</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Forensic-grade traceability across requests, policies, and actions.</p>
                </div>
                <div className="flex gap-2">
                    <button className="p-2 rounded-none bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                        <ArchiveBoxIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white dark:bg-zinc-950 p-4 rounded-none border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row gap-4 shadow-none">
                <div className="flex-1 relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-zinc-400" />
                    <input 
                        type="text" 
                        placeholder="Search by Request ID, Job ID, or Tenant ID..." 
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-none pl-10 pr-4 py-2 text-sm font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-[#dc0000] transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900 rounded-none border border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">
                        <FunnelIcon className="w-4 h-4" />
                        <span>All Actions</span>
                    </div>
                </div>
            </div>

            <DataTable 
                isLoading={q.status === 'loading'}
                data={filteredData}
                onRowClick={(a) => setSelectedAudit(a)}
                columns={[
                    {
                        header: 'Timestamp',
                        accessor: (a) => (
                            <div className="flex items-center gap-2 text-zinc-400 font-medium text-[11px] font-mono leading-none">
                                <ClockIcon className="w-3.5 h-3.5" />
                                {new Date(a.created_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                <span className="opacity-50">{new Date(a.created_at).toLocaleDateString()}</span>
                            </div>
                        )
                    },
                    {
                        header: 'Action / Policy',
                        accessor: (a) => (
                            <div className="flex flex-col gap-1">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${a.action === 'BLOCKED' ? 'text-[#dc0000] dark:text-red-400' : 'text-emerald-600 dark:text-emerald-500'}`}>
                                    {a.action}
                                </span>
                                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200">{a.policy_slug || 'Standard Access'}</span>
                            </div>
                        )
                    },
                    {
                        header: 'Correlation (Trace)',
                        accessor: (a) => (
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
                                   <FingerPrintIcon className="w-3 h-3" />
                                   {short(a.id, 8)}
                                </div>
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">RequestId: {short(a.request_id, 12)}</span>

                            </div>
                        )
                    },
                    {
                        header: 'Entity Context',
                        accessor: (a) => (
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono tracking-tight underline decoration-zinc-200 dark:decoration-zinc-800 underline-offset-2 decoration-2">{a.tenant_id}</span>
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Origin: {a.ip_address}</span>
                            </div>
                        )
                    },
                    {
                        header: '',
                        accessor: () => (
                            <button className="p-2 rounded-none text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900">
                                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                            </button>
                        ),
                        className: 'w-10'
                    }
                ]}
            />

            <AuditDetailDrawer 
                auditEntry={selectedAudit}
                isOpen={!!selectedAudit}
                onClose={() => setSelectedAudit(null)}
            />
        </div>
    );
};
