import React from 'react';
import { Printhouse } from '../../types/printhouseCapabilities';
import { DataTable } from '../../components/DataTable';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface PrinthouseListProps {
    printhouses: Printhouse[];
    isLoading: boolean;
    onSelectPrinthouse: (ph: Printhouse) => void;
    onRefresh: () => void;
    onCreateNew: () => void;
    isSuperAdmin: boolean;
}

export const PrinthouseList: React.FC<PrinthouseListProps> = ({
    printhouses,
    isLoading,
    onSelectPrinthouse,
    onRefresh,
    onCreateNew,
    isSuperAdmin
}) => {
    return (
        <div className="space-y-4">
            <DataTable<Printhouse>
                title="Printhouse Partners & Capabilities"
                isLoading={isLoading}
                data={printhouses}
                onRowClick={onSelectPrinthouse}
                enableSearch={true}
                searchPlaceholder="Search print partners..."
                enablePagination={true}
                pageSize={15}
                toolbarActions={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onRefresh}
                            className="p-1.5 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Refresh partner list"
                        >
                            <ArrowPathIcon className="w-4 h-4" />
                        </button>
                        {isSuperAdmin && (
                            <button
                                onClick={onCreateNew}
                                className="px-3 py-1.5 bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/95"
                            >
                                Register Printhouse
                            </button>
                        )}
                    </div>
                }
                columns={[
                    {
                        header: 'Onboarding Partner',
                        accessor: (p) => (
                            <div className="flex flex-col">
                                <span className="font-black text-zinc-900 dark:text-zinc-100">{p.name}</span>
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-0.5">{p.legal_name || 'No legal entity configured'}</span>
                            </div>
                        )
                    },
                    {
                        header: 'Location Context',
                        accessor: (p) => (
                            <div className="text-xs text-zinc-600 dark:text-zinc-400">
                                {p.city && p.country ? `${p.city}, ${p.country}` : 'Not configured'}
                            </div>
                        )
                    },
                    {
                        header: 'Tenant Scope',
                        accessor: (p) => (
                            <span className="font-mono text-[11px] font-bold text-zinc-500">{p.tenant_id}</span>
                        )
                    },
                    {
                        header: 'Readiness status',
                        accessor: (p) => (
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 ${
                                    p.onboarding_status === 'READY_FOR_PILOT' 
                                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' 
                                        : p.onboarding_status === 'PROFILE_INCOMPLETE'
                                            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                }`}>
                                    {p.onboarding_status.replace(/_/g, ' ')}
                                </span>
                            </div>
                        )
                    },
                    {
                        header: 'Dispatch Gate',
                        accessor: (p) => (
                            <div className="flex items-center gap-1.5">
                                {p.onboarding_status === 'READY_FOR_PILOT' ? (
                                    <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600">
                                        <CheckCircleIcon className="w-4 h-4 shrink-0" /> PILOT_OK
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-400">
                                        <XCircleIcon className="w-4 h-4 shrink-0" /> BLOCKED
                                    </span>
                                )}
                            </div>
                        )
                    },
                    {
                        header: 'Status',
                        accessor: (p) => (
                            <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 ${
                                p.status === 'ACTIVE' 
                                    ? 'bg-emerald-500 text-white' 
                                    : p.status === 'SUSPENDED' 
                                        ? 'bg-red-500 text-white' 
                                        : 'bg-zinc-500 text-white'
                            }`}>
                                {p.status}
                            </span>
                        )
                    }
                ]}
            />
        </div>
    );
};
