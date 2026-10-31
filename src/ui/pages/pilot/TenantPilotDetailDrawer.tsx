/**
 * src/ui/pages/pilot/TenantPilotDetailDrawer.tsx
 * 
 * High-fidelity details and actions drawer for Tenant Pilot readiness management.
 */

import React, { useState } from 'react';
import { Drawer } from '../../components/Drawer';
import { 
    GlobeAltIcon, 
    ShieldCheckIcon, 
    ExclamationTriangleIcon, 
    CheckCircleIcon,
    XCircleIcon,
    LockClosedIcon,
    KeyIcon,
    CommandLineIcon
} from '@heroicons/react/24/outline';
import { 
    enablePilotAccess, 
    disablePilotAccess, 
    enablePartnerAccess, 
    disablePartnerAccess, 
    requestLiveProductionEnablement, 
    blockLiveProductionEnablement 
} from '../../api/tenantPilotClient';
import { TenantPilot } from '../../types/tenantPilot';

interface TenantPilotDetailDrawerProps {
    pilot: TenantPilot;
    isOpen: boolean;
    onClose: () => void;
}

export const TenantPilotDetailDrawer: React.FC<TenantPilotDetailDrawerProps> = ({ pilot: initialPilot, isOpen, onClose }) => {
    const [pilot, setPilot] = useState<TenantPilot>(initialPilot);
    const [loading, setLoading] = useState(false);
    const [reason, setReason] = useState('');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const showFeedback = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback(null), 5000);
    };

    const handleAction = async (actionFn: () => Promise<{ ok: boolean; pilot?: TenantPilot; error?: string; message?: string }>, successMsg: string) => {
        setLoading(true);
        setFeedback(null);
        try {
            const res = await actionFn();
            if (res.ok) {
                if (res.pilot) {
                    setPilot(res.pilot);
                }
                showFeedback('success', successMsg);
                setReason('');
            } else {
                showFeedback('error', res.message || res.error || 'Action failed.');
            }
        } catch (err: any) {
            showFeedback('error', err.message || 'Network or communication failure.');
        } finally {
            setLoading(false);
        }
    };

    const handleEnablePilot = () => handleAction(() => enablePilotAccess(pilot.tenant_id, pilot.printhouse_id), 'Pilot access enabled successfully.');
    const handleDisablePilot = () => {
        if (!reason.trim()) {
            showFeedback('error', 'Please provide a justification reason to disable pilot access.');
            return;
        }
        handleAction(() => disablePilotAccess(pilot.tenant_id, pilot.printhouse_id, reason), 'Pilot access disabled.');
    };

    const handleEnablePartner = () => handleAction(() => enablePartnerAccess(pilot.tenant_id, pilot.printhouse_id), 'Partner workspace isolation activated.');
    const handleDisablePartner = () => {
        if (!reason.trim()) {
            showFeedback('error', 'Please provide a justification reason to disable partner access.');
            return;
        }
        handleAction(() => disablePartnerAccess(pilot.tenant_id, pilot.printhouse_id, reason), 'Partner workspace isolation deactivated.');
    };

    const handleRequestLive = () => handleAction(() => requestLiveProductionEnablement(pilot.tenant_id, pilot.printhouse_id), 'Live production activation requested.');
    const handleBlockLive = () => {
        if (!reason.trim()) {
            showFeedback('error', 'Please provide a justification reason to block live production.');
            return;
        }
        handleAction(() => blockLiveProductionEnablement(pilot.tenant_id, pilot.printhouse_id, reason), 'Live production gate blocked.');
    };

    const getDomainBadge = (status: string) => {
        switch (status) {
            case 'PASSED':
                return <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase text-[9px]">PASSED</span>;
            case 'PENDING':
                return <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase text-[9px]">PENDING</span>;
            case 'FAILED':
                return <span className="px-2 py-0.5 bg-red-500/15 text-red-400 border border-red-500/30 font-bold uppercase text-[9px]">FAILED</span>;
            case 'BLOCKED_BY_DESIGN':
                return <span className="px-2 py-0.5 bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-bold uppercase text-[9px]">BLOCKED BY DESIGN</span>;
            default:
                return <span className="px-2 py-0.5 bg-slate-500/10 text-slate-400 border border-slate-500/20 font-bold uppercase text-[9px]">{status}</span>;
        }
    };

    return (
        <Drawer isOpen={isOpen} onClose={onClose} title={`Pilot Evaluation: ${pilot.tenant_id}`}>
            <div className="space-y-6 text-slate-100 pb-16">
                
                {/* Feedback Notification */}
                {feedback && (
                    <div className={`p-4 border font-mono text-xs font-bold flex items-center gap-3 animate-pulse ${
                        feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                        {feedback.type === 'success' ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : <XCircleIcon className="w-5 h-5 shrink-0" />}
                        <p className="uppercase tracking-wider">{feedback.message}</p>
                    </div>
                )}

                {/* Section: Overview */}
                <div className="bg-[#18181b] border border-white/10 p-4 space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
                        <GlobeAltIcon className="w-4 h-4 text-primary" />
                        Overview Status
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                        <div><p className="text-slate-500">TENANT ID</p><p className="font-bold text-white select-all">{pilot.tenant_id}</p></div>
                        <div><p className="text-slate-500">PRINTHOUSE ID</p><p className="font-bold text-white select-all">{pilot.printhouse_id}</p></div>
                        <div><p className="text-slate-500">PILOT STATUS</p><p className="font-bold text-white">{pilot.pilot_status}</p></div>
                        <div><p className="text-slate-500">COMMERCIAL STATUS</p><p className="font-bold text-white">{pilot.commercial_status}</p></div>
                    </div>
                </div>

                {/* Section: Pilot Readiness Domain Checks */}
                <div className="bg-[#18181b] border border-white/10 p-4 space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">
                        Readiness Domain Verification
                    </h3>
                    {pilot.readiness_domains ? (
                        <div className="space-y-2.5 font-mono text-xs">
                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                                <span className="text-slate-400">Printhouse Onboarding Check</span>
                                {getDomainBadge(pilot.readiness_domains.printhouse)}
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                                <span className="text-slate-400">Capabilities Profiles (Media/SLA/Policy)</span>
                                {getDomainBadge(pilot.readiness_domains.capabilities)}
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                                <span className="text-slate-400">User Scopes & Roles configuration</span>
                                {getDomainBadge(pilot.readiness_domains.users)}
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                                <span className="text-slate-400">Pilot Limits Governance</span>
                                {getDomainBadge(pilot.readiness_domains.limits)}
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                                <span className="text-slate-400">Workspace Isolation Checks</span>
                                {getDomainBadge(pilot.readiness_domains.workspace_isolation)}
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                                <span className="text-slate-400">Audit Logging & Traceability</span>
                                {getDomainBadge(pilot.readiness_domains.auditability)}
                            </div>
                            <div className="flex justify-between items-center pb-1.5">
                                <span className="text-slate-400">Live Production Gate Protection</span>
                                {getDomainBadge(pilot.readiness_domains.live_production)}
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500 italic">No evaluation domains snapshot available</p>
                    )}
                </div>

                {/* Section: Blocking Reasons & Warnings */}
                {((pilot.blocking_reasons && pilot.blocking_reasons.length > 0) || (pilot.warnings && pilot.warnings.length > 0)) && (
                    <div className="bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
                        <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-widest border-b border-amber-500/20 pb-2 flex items-center gap-2">
                            <ExclamationTriangleIcon className="w-4 h-4" />
                            Blockers & Warnings
                        </h3>
                        {pilot.blocking_reasons && pilot.blocking_reasons.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Readiness Blockers</p>
                                <ul className="list-disc pl-5 text-xs text-red-400 font-mono space-y-1">
                                    {pilot.blocking_reasons.map((b, idx) => <li key={idx}>{b}</li>)}
                                </ul>
                            </div>
                        )}
                        {pilot.warnings && pilot.warnings.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">System Warnings</p>
                                <ul className="list-disc pl-5 text-xs text-amber-400 font-mono space-y-1">
                                    {pilot.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Section: Pilot Limits & Usage Governance */}
                <div className="bg-[#18181b] border border-white/10 p-4 space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">
                        Pilot Quota Governance
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                        <div><p className="text-slate-500">MAX PILOT ORDERS</p><p className="font-bold text-white">{pilot.max_pilot_orders}</p></div>
                        <div><p className="text-slate-500">DAILY JOBS LIMIT</p><p className="font-bold text-white">{pilot.max_pilot_jobs_per_day}</p></div>
                        <div><p className="text-slate-500">MAX FILE SIZE (MB)</p><p className="font-bold text-white">{pilot.max_pilot_file_size_mb} MB</p></div>
                        <div><p className="text-slate-500">MAX STORAGE QUOTA</p><p className="font-bold text-white">{pilot.max_pilot_storage_gb} GB</p></div>
                    </div>
                </div>

                {/* Commercial Launch Blocker Panel */}
                <div className="bg-red-500/10 border border-red-500/30 p-4 space-y-3">
                    <h3 className="text-[10px] font-black text-red-400 uppercase tracking-widest border-b border-red-500/20 pb-2 flex items-center gap-2">
                        <LockClosedIcon className="w-4 h-4 text-red-500" />
                        Commercial Launch Gate (LOCKED)
                    </h3>
                    <p className="text-xs text-slate-300 font-mono">
                        LIVE Production remains disabled throughout Phase 77. The expected final state is <span className="text-amber-400 font-bold">PARTNER PILOT READY</span>, not LIVE.
                    </p>
                    <div className="p-3 bg-black/40 border border-white/10 text-xs font-mono">
                        <p className="text-slate-500">LIVE_PRODUCTION_ENABLED: <span className="text-red-400 font-bold">{pilot.live_production_enabled ? 'TRUE' : 'FALSE (BLOCKED BY GOVERNANCE)'}</span></p>
                        <p className="text-slate-500 mt-1">COMMERCIAL_STATUS: <span className="text-red-400 font-bold">{pilot.commercial_status}</span></p>
                    </div>
                </div>

                {/* Section: Operational Controls */}
                <div className="bg-[#18181b] border border-white/10 p-4 space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
                        <CommandLineIcon className="w-4 h-4 text-primary" />
                        Administrative Action Controls
                    </h3>

                    {/* Action reason justification input */}
                    <div className="space-y-1.5 font-mono text-xs">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Justification / Action Reason</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Provide reason for disabling pilot, disabling partner, or blocking live gate..."
                            className="w-full bg-[#0a0a0c] border border-white/10 p-2 text-white font-mono text-xs focus:border-[#dc0000] outline-none h-16"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-2">
                        {/* Pilot Access actions */}
                        <button 
                            onClick={handleEnablePilot} 
                            disabled={loading} 
                            className="py-2 px-3 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-left uppercase tracking-wider disabled:opacity-50"
                        >
                            Enable Pilot Access
                        </button>
                        <button 
                            onClick={handleDisablePilot} 
                            disabled={loading} 
                            className="py-2 px-3 bg-amber-500/25 text-amber-300 hover:bg-amber-500/35 text-left uppercase tracking-wider disabled:opacity-50"
                        >
                            Disable Pilot Access
                        </button>

                        {/* Partner Isolation actions */}
                        <button 
                            onClick={handleEnablePartner} 
                            disabled={loading} 
                            className="py-2 px-3 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 text-left uppercase tracking-wider disabled:opacity-50"
                        >
                            Activate Partner Isolation
                        </button>
                        <button 
                            onClick={handleDisablePartner} 
                            disabled={loading} 
                            className="py-2 px-3 bg-zinc-500/20 text-zinc-300 hover:bg-zinc-500/30 text-left uppercase tracking-wider disabled:opacity-50"
                        >
                            Deactivate Partner Isolation
                        </button>

                        {/* Live Production Gate (Locked actions) */}
                        <button 
                            onClick={handleRequestLive} 
                            disabled={loading} 
                            className="py-2 px-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 text-left uppercase tracking-wider disabled:opacity-50"
                        >
                            Request LIVE Enablement
                        </button>
                        <button 
                            onClick={handleBlockLive} 
                            disabled={loading} 
                            className="py-2 px-3 bg-red-600/20 text-red-300 hover:bg-red-600/30 text-left uppercase tracking-wider disabled:opacity-50"
                        >
                            Block LIVE Production
                        </button>
                    </div>
                </div>

            </div>
        </Drawer>
    );
};
