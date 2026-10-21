import React, { useEffect, useState } from 'react';
import { 
    CubeIcon, 
    RectangleStackIcon, 
    InboxIcon, 
    ShieldCheckIcon,
    ArrowUpTrayIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { adminFetch } from '../../lib/adminApi';
import { getUserRole, getAuthUser } from '../../lib/authStore';

export const SupplierDashboardPage: React.FC = () => {
    const role = getUserRole();
    const user = getAuthUser();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        adminFetch('/api/v1/paper-suppliers/me')
            .then((res: any) => {
                if (isMounted) {
                    if (res && res.ok) {
                        setProfile(res.data);
                    } else {
                        setProfile({
                            name: user?.companyName || 'Authorized Paper Supplier',
                            status: 'ACTIVE',
                            role: role,
                            tenantId: user?.tenantId || 'tenant-supplier'
                        });
                    }
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (isMounted) {
                    setError(err.message || 'Failed to load supplier profile');
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [role, user]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b ppos-border pb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-red-600 text-white">
                            Paper Supplier Hub
                        </span>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                            Phase I1 Pilot
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {profile?.name || 'Supplier Operations Console'}
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        Dedicated domain for catalog publication, commercial offers, and procurement dispatch fulfillment.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">Status</p>
                        <p className="text-xs font-black text-emerald-500 uppercase tracking-wider">
                            {profile?.status || 'ACTIVE'}
                        </p>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-200 dark:bg-zinc-800" />
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">Assigned Role</p>
                        <p className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                            {role}
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 ppos-surface border ppos-border flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Published Catalog
                        </span>
                        <RectangleStackIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">0</span>
                        <p className="text-[10px] text-zinc-400 mt-1">Active paper articles</p>
                    </div>
                </div>

                <div className="p-5 ppos-surface border ppos-border flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Commercial Offers
                        </span>
                        <DocumentTextIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">0</span>
                        <p className="text-[10px] text-zinc-400 mt-1">Rates & MOQ brackets</p>
                    </div>
                </div>

                <div className="p-5 ppos-surface border ppos-border flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Open RFQs
                        </span>
                        <InboxIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">0</span>
                        <p className="text-[10px] text-zinc-400 mt-1">Pending printhouse quotes</p>
                    </div>
                </div>

                <div className="p-5 ppos-surface border ppos-border flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Domain Security
                        </span>
                        <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="mt-3">
                        <span className="text-sm font-black text-emerald-500 uppercase tracking-wider">
                            Isolated Scope
                        </span>
                        <p className="text-[10px] text-zinc-400 mt-1">Zero printhouse data leakage</p>
                    </div>
                </div>
            </div>

            {/* Scope & Feature Information */}
            <div className="p-6 ppos-surface border ppos-border space-y-4">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                    <CubeIcon className="w-4 h-4 text-red-500" />
                    Phase I1 Architecture & Capability Scope
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    <div className="p-4 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-2">
                        <p className="font-bold text-slate-800 dark:text-zinc-200 uppercase text-[10px]">
                            Multi-Tenant Identity & RBAC
                        </p>
                        <p>
                            Supplier operators operate strictly under orthogonal roles (<code className="text-red-500 font-mono">SUPPLIER_ADMIN</code>, <code className="text-red-500 font-mono">SUPPLIER_OPERATOR</code>, <code className="text-red-500 font-mono">SUPPLIER_VIEWER</code>). These roles possess 0 inheritance toward printhouse management, preventing unauthorized inspection of machines, private job queues, or customer rates.
                        </p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-2">
                        <p className="font-bold text-slate-800 dark:text-zinc-200 uppercase text-[10px]">
                            Atomic Receipt & Idempotency
                        </p>
                        <p>
                            Restock deliveries are processed via MySQL row-level locked transactions (<code className="text-blue-500 font-mono">SELECT ... FOR UPDATE</code>) with SHA-256 payload validation. Inventory mutations, procurement records, and audit events commit together or revert cleanly.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
