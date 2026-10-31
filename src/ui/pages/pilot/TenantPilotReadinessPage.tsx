/**
 * src/ui/pages/pilot/TenantPilotReadinessPage.tsx
 * 
 * Main administration page for Tenant Pilot & Commercial Readiness Console.
 */

import React, { useState, useEffect } from 'react';
import { 
    CpuChipIcon, 
    ArrowPathIcon, 
    ExclamationTriangleIcon, 
    CheckCircleIcon,
    XCircleIcon,
    LockClosedIcon
} from '@heroicons/react/24/outline';
import { listTenantPilots } from '../../api/tenantPilotClient';
import { TenantPilot } from '../../types/tenantPilot';
import { TenantPilotDetailDrawer } from './TenantPilotDetailDrawer';

export const TenantPilotReadinessPage: React.FC = () => {
    const [pilots, setPilots] = useState<TenantPilot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPilot, setSelectedPilot] = useState<TenantPilot | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const loadPilots = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listTenantPilots();
            if (res.ok) {
                setPilots(res.pilots || []);
            } else {
                setError('Failed to load pilot readiness datasets.');
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred while fetching readiness list.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPilots();
    }, []);

    const handleOpenDrawer = (pilot: TenantPilot) => {
        setSelectedPilot(pilot);
        setIsDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
        setSelectedPilot(null);
        loadPilots(); // reload on change
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'PILOT_ACTIVE':
                return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'PILOT_COMPLETED':
                return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'PILOT_PAUSED':
                return 'bg-amber-500/10 text-amber-400 border-amber-500/20 font-bold';
            case 'BLOCKED':
                return 'bg-red-500/15 text-red-400 border-red-500/30 font-bold animate-pulse';
            case 'CONFIGURED':
                return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
            default:
                return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        }
    };

    return (
        <div className="space-y-6 p-6">
            {/* Header section */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        <CpuChipIcon className="w-6 h-6 text-[#dc0000]" />
                        Commercial Pilot & Partner Readiness Console
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-mono">
                        Phase 77 — Tenant Access Separation, Usage Limits & Pilot Governance
                    </p>
                </div>
                <button
                    onClick={loadPilots}
                    disabled={loading}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-mono text-xs flex items-center gap-2 transition-all disabled:opacity-50"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'SYNCING...' : 'SYNC PILOTS'}
                </button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-3 font-mono text-xs">
                    <XCircleIcon className="w-5 h-5 shrink-0 text-red-500" />
                    <p>{error}</p>
                </div>
            )}

            {/* Main Stats / Overview Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                <div className="bg-[#0f0f11] border border-white/10 p-4 space-y-1">
                    <p className="text-slate-500 uppercase">ACTIVE PILOTS</p>
                    <p className="text-2xl font-bold text-slate-200">
                        {pilots.filter(p => p.pilot_status === 'PILOT_ACTIVE').length}
                    </p>
                </div>
                <div className="bg-[#0f0f11] border border-white/10 p-4 space-y-1">
                    <p className="text-slate-500 uppercase">READY FOR PARTNER</p>
                    <p className="text-2xl font-bold text-emerald-400">
                        {pilots.filter(p => p.ready_for_partner_pilot).length}
                    </p>
                </div>
                <div className="bg-[#0f0f11] border border-white/10 p-4 space-y-1">
                    <p className="text-slate-500 uppercase">LIVE PRODUCTION GATE</p>
                    <div className="flex items-center gap-1.5 text-amber-500 font-bold">
                        <LockClosedIcon className="w-4 h-4" />
                        <span>LOCKED (PILOT_ONLY)</span>
                    </div>
                </div>
            </div>

            {/* High Density Table */}
            <div className="overflow-x-auto border border-white/10 bg-[#0f0f11]">
                <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead className="bg-white/5 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-white/10">
                        <tr>
                            <th className="py-3 px-4">Tenant / Printhouse ID</th>
                            <th className="py-3 px-4">Pilot Status</th>
                            <th className="py-3 px-4">Commercial Gate</th>
                            <th className="py-3 px-4">Partner Workspace</th>
                            <th className="py-3 px-4">Orders Limit</th>
                            <th className="py-3 px-4">Job Limit (Daily)</th>
                            <th className="py-3 px-4">Max Size</th>
                            <th className="py-3 px-4">Readiness Checklist</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {pilots.map((p) => {
                            const isReady = p.ready_for_partner_pilot;
                            return (
                                <tr key={`${p.tenant_id}-${p.printhouse_id}`} className="group hover:bg-white/5 transition-all">
                                    <td className="py-3 px-4">
                                        <div>
                                            <p className="font-bold text-slate-200">Tenant: {p.tenant_id}</p>
                                            <p className="text-[10px] text-slate-500 select-all">PH: {p.printhouse_id}</p>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`px-2 py-0.5 border text-[10px] font-bold ${getStatusStyle(p.pilot_status)}`}>
                                            {p.pilot_status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`px-2 py-0.5 border text-[10px] font-bold ${
                                            p.live_production_enabled 
                                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' 
                                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                        }`}>
                                            {p.live_production_enabled ? 'LIVE ACTIVE' : 'LIVE DISABLED'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-slate-300">
                                        {p.partner_access_enabled ? 'ISOLATED PARTNER' : 'NO ACCESS'}
                                    </td>
                                    <td className="py-3 px-4 text-slate-300 font-bold">
                                        {p.max_pilot_orders} orders
                                    </td>
                                    <td className="py-3 px-4 text-slate-300">
                                        {p.max_pilot_jobs_per_day} / day
                                    </td>
                                    <td className="py-3 px-4 text-slate-400 text-[10px]">
                                        {p.max_pilot_file_size_mb} MB file | {p.max_pilot_storage_gb} GB storage
                                    </td>
                                    <td className="py-3 px-4">
                                        {isReady ? (
                                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                                                <CheckCircleIcon className="w-4 h-4" /> Ready for Pilot
                                            </span>
                                        ) : (
                                            <span className="text-amber-500 font-bold flex items-center gap-1">
                                                <ExclamationTriangleIcon className="w-4 h-4" /> Blocked ({p.blocking_reasons?.length || 0})
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <button
                                            onClick={() => handleOpenDrawer(p)}
                                            className="px-2 py-1 bg-white hover:bg-slate-200 text-black font-bold uppercase text-[9px] transition-all"
                                        >
                                            Evaluate & Manage
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {pilots.length === 0 && !loading && (
                <div className="py-16 text-center border border-dashed border-white/10 bg-[#0f0f11]">
                    <p className="text-slate-400 text-sm">No tenant pilots configured in system database</p>
                </div>
            )}

            {selectedPilot && (
                <TenantPilotDetailDrawer
                    pilot={selectedPilot}
                    isOpen={isDrawerOpen}
                    onClose={handleCloseDrawer}
                />
            )}
        </div>
    );
};
