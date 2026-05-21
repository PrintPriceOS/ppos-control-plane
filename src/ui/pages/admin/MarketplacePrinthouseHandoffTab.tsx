// src/ui/pages/admin/MarketplacePrinthouseHandoffTab.tsx
import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    ArrowPathIcon,
    DocumentTextIcon,
    ShieldCheckIcon,
    XCircleIcon,
    CheckCircleIcon,
    QuestionMarkCircleIcon,
    ArchiveBoxIcon,
    ClockIcon,
    DocumentCheckIcon
} from "@heroicons/react/24/outline";

export const MarketplacePrinthouseHandoffTab: React.FC = () => {
    const [packages, setPackages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [detail, setDetail] = useState<any | null>(null);
    const [timeline, setTimeline] = useState<any[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const [actionState, setActionState] = useState<{ type: 'ACCEPT' | 'REJECT' | 'CLARIFY' | null, reason: string }>({ type: null, reason: '' });

    useEffect(() => {
        fetchPackages();
    }, []);

    const fetchPackages = async () => {
        setLoading(true);
        try {
            const res = await adminApi.listPrinthouseHandoffPackages();
            if (res.ok && res.packages) {
                setPackages(res.packages);
            } else {
                setPackages([]);
            }
        } catch (err) {
            console.error('Failed to fetch handoff packages:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadDetail = async (orderId: string) => {
        setSelectedOrderId(orderId);
        setDetailLoading(true);
        setActionState({ type: null, reason: '' });
        try {
            const [pkgRes, timelineRes] = await Promise.all([
                adminApi.getPrinthouseHandoffPackage(orderId),
                adminApi.getPrinthouseHandoffTimeline(orderId)
            ]);
            setDetail(pkgRes.ok ? pkgRes : null);
            setTimeline(timelineRes.ok ? timelineRes.timeline : []);
        } catch (err) {
            console.error('Failed to fetch package details', err);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleAction = async () => {
        if (!selectedOrderId || !actionState.type) return;

        try {
            let res;
            if (actionState.type === 'ACCEPT') {
                res = await adminApi.acceptPrinthouseHandoff(selectedOrderId, { note: actionState.reason });
            } else if (actionState.type === 'REJECT') {
                if (!actionState.reason) return alert('Reason is required');
                res = await adminApi.rejectPrinthouseHandoff(selectedOrderId, { reason: actionState.reason });
            } else if (actionState.type === 'CLARIFY') {
                if (!actionState.reason) return alert('Message is required');
                res = await adminApi.requestHandoffClarification(selectedOrderId, { message: actionState.reason });
            }

            if (res?.ok) {
                setActionState({ type: null, reason: '' });
                await loadDetail(selectedOrderId);
                await fetchPackages();
            } else {
                alert(`Action failed: ${res?.error || 'Unknown error'}`);
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PRINTHOUSE_ACCEPTED': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
            case 'PRINTHOUSE_REJECTED': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
            case 'CLARIFICATION_REQUESTED': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
            case 'PRINTHOUSE_HANDOFF_READY':
            case 'DISPATCH_PACKAGE_CREATED': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20';
            default: return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10';
        }
    };

    const formatDate = (isoStr?: string) => {
        if (!isoStr) return '—';
        return new Date(isoStr).toLocaleString();
    };

    return (
        <div className="flex flex-col lg:flex-row h-full min-h-[600px] border border-slate-200 dark:border-white/10 animate-slide-fade">
            {/* Left Panel: Dense Table */}
            <div className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-[#131314] ${selectedOrderId ? 'hidden lg:flex lg:w-1/2 xl:w-2/3 border-r border-slate-200 dark:border-white/10' : ''}`}>
                <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                        <ArchiveBoxIcon className="w-5 h-5 text-primary" />
                        <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Handoff Packages</h2>
                    </div>
                    <button onClick={fetchPackages} className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 transition-colors">
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    {loading ? (
                        <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Loading packages...</div>
                    ) : packages.length === 0 ? (
                        <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No handoff packages found</div>
                    ) : (
                        <table className="w-full text-left text-[11px] whitespace-nowrap">
                            <thead className="bg-slate-50 dark:bg-white/5 sticky top-0 uppercase font-black text-slate-500 dark:text-slate-400 tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Status</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Package ID</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Order ID</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Printhouse</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Files</th>
                                    <th className="px-4 py-3 border-b border-slate-200 dark:border-white/10">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-700 dark:text-slate-300">
                                {packages.map(pkg => (
                                    <tr 
                                        key={pkg.packageId} 
                                        onClick={() => loadDetail(pkg.orderId)}
                                        className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${selectedOrderId === pkg.orderId ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                                    >
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border ${getStatusColor(pkg.dispatchStatus)}`}>
                                                {pkg.dispatchStatus?.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 font-mono text-[10px]">{pkg.packageId}</td>
                                        <td className="px-4 py-2 font-mono text-[10px]">{pkg.orderId}</td>
                                        <td className="px-4 py-2 uppercase truncate max-w-[150px]">{pkg.printhouse?.name || pkg.printhouse?.id || '—'}</td>
                                        <td className="px-4 py-2">{pkg.files?.length || 0}</td>
                                        <td className="px-4 py-2 text-slate-500">{formatDate(pkg.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Right Panel: Forensic Drawer */}
            {selectedOrderId && (
                <div className="flex-1 lg:w-1/2 xl:w-1/3 flex flex-col bg-white dark:bg-[#131314] min-w-0">
                    <div className="p-4 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-white/5">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest truncate mr-4">
                            Package Detail
                        </h3>
                        <button onClick={() => setSelectedOrderId(null)} className="text-slate-400 hover:text-slate-600 lg:hidden">
                            <XCircleIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-6">
                        {detailLoading ? (
                            <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mt-10">Loading detail...</div>
                        ) : !detail ? (
                            <div className="text-center text-xs font-bold text-slate-400 uppercase tracking-widest mt-10">Failed to load package</div>
                        ) : (
                            <>
                                {/* Header Summary */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Order ID</div>
                                            <div className="font-mono text-xs text-slate-900 dark:text-white">{detail.orderId}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Package ID</div>
                                            <div className="font-mono text-xs text-slate-900 dark:text-white">{detail.packageId}</div>
                                        </div>
                                    </div>
                                    <span className={`inline-block px-2 py-1 text-[10px] font-black uppercase tracking-widest border ${getStatusColor(detail.status)}`}>
                                        {detail.status?.replace(/_/g, ' ')}
                                    </span>
                                </div>

                                {/* Printhouse & Operations */}
                                <div className="border border-slate-200 dark:border-white/10 p-3 bg-slate-50 dark:bg-white/5 space-y-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-white/10 pb-1 mb-2">Printhouse Assignment</h4>
                                    <div className="text-xs font-medium text-slate-900 dark:text-white">{detail.manifest?.printhouse?.name || detail.manifest?.printhouse?.id}</div>
                                </div>

                                {/* Files */}
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                        <DocumentCheckIcon className="w-3.5 h-3.5" /> Production Files
                                    </h4>
                                    <div className="space-y-2">
                                        {detail.manifest?.files?.map((f: any, i: number) => (
                                            <div key={i} className="border border-slate-200 dark:border-white/10 p-2 flex flex-col gap-1 text-[11px]">
                                                <div className="flex justify-between">
                                                    <span className="font-black text-slate-900 dark:text-white uppercase">{f.role}</span>
                                                    <span className="text-slate-500 font-mono">{f.checksum?.substring(0,8) || '—'}</span>
                                                </div>
                                                <div className="text-slate-600 dark:text-slate-400 truncate">{f.originalName}</div>
                                                {f.storagePath && (
                                                    <div className="text-primary font-mono truncate text-[9px] mt-1 bg-primary/5 p-1">
                                                        {f.storagePath}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] uppercase font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-1">
                                                        {f.preflightStatus}
                                                    </span>
                                                    {f.findingsCount > 0 && <span className="text-[9px] uppercase font-bold text-amber-600">Findings: {f.findingsCount}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Timeline */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                        <ClockIcon className="w-3.5 h-3.5" /> Operational Timeline
                                    </h4>
                                    <div className="pl-3 border-l-2 border-slate-200 dark:border-white/10 space-y-4">
                                        {timeline.map((ev, i) => (
                                            <div key={i} className="relative">
                                                <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                                                <div className="text-[10px] text-slate-400 font-mono">{formatDate(ev.created_at)}</div>
                                                <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5">{ev.event_type}</div>
                                                {ev.source === 'metadata_fallback' && (
                                                    <div className="text-[9px] text-amber-600 uppercase font-bold mt-0.5">Synthetic Fallback</div>
                                                )}
                                                {ev.payload?.reason && <div className="text-[10px] text-red-500 mt-1">Reason: {ev.payload.reason}</div>}
                                                {ev.payload?.message && <div className="text-[10px] text-amber-500 mt-1">Msg: {ev.payload.message}</div>}
                                            </div>
                                        ))}
                                        {timeline.length === 0 && <div className="text-xs text-slate-400">No events found</div>}
                                    </div>
                                </div>

                            </>
                        )}
                    </div>

                    {/* Action Footer */}
                    {detail && detail.status !== 'PRINTHOUSE_ACCEPTED' && (
                        <div className="p-4 bg-slate-50 dark:bg-white/5 border-t border-slate-200 dark:border-white/10">
                            {actionState.type ? (
                                <div className="space-y-3 animate-slide-fade">
                                    <div className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 flex items-center justify-between">
                                        <span>Confirm {actionState.type}</span>
                                        <button onClick={() => setActionState({ type: null, reason: '' })} className="text-slate-400 hover:text-slate-600"><XCircleIcon className="w-4 h-4"/></button>
                                    </div>
                                    {actionState.type !== 'ACCEPT' && (
                                        <textarea 
                                            value={actionState.reason} 
                                            onChange={e => setActionState({ ...actionState, reason: e.target.value })}
                                            placeholder={`Enter ${actionState.type.toLowerCase()} reason/message...`}
                                            className="w-full text-xs p-2 bg-white dark:bg-black border border-slate-200 dark:border-white/20 text-slate-900 dark:text-white"
                                            rows={2}
                                        />
                                    )}
                                    <button 
                                        onClick={handleAction}
                                        className={`w-full py-2 text-xs font-black uppercase tracking-widest text-white transition-colors ${
                                            actionState.type === 'ACCEPT' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                            actionState.type === 'REJECT' ? 'bg-red-600 hover:bg-red-700' :
                                            'bg-amber-600 hover:bg-amber-700'
                                        }`}
                                    >
                                        Execute {actionState.type}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setActionState({ type: 'ACCEPT', reason: '' })}
                                        className="flex-1 flex justify-center items-center gap-1 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 dark:hover:bg-emerald-500/20 text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" /> Accept
                                    </button>
                                    <button 
                                        onClick={() => setActionState({ type: 'CLARIFY', reason: '' })}
                                        className="flex-1 flex justify-center items-center gap-1 py-2 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 dark:hover:bg-amber-500/20 text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        <QuestionMarkCircleIcon className="w-4 h-4" /> Clarify
                                    </button>
                                    <button 
                                        onClick={() => setActionState({ type: 'REJECT', reason: '' })}
                                        className="flex-1 flex justify-center items-center gap-1 py-2 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 dark:hover:bg-red-500/20 text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        <XCircleIcon className="w-4 h-4" /> Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
