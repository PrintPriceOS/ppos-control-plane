import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    BuildingStorefrontIcon,
    ArrowPathIcon,
    TableCellsIcon,
    ShieldCheckIcon,
    AdjustmentsHorizontalIcon,
    BoltIcon,
    ExclamationTriangleIcon
} from "@heroicons/react/24/outline";
import { short, safeText, safeTime, safeDate } from "../../lib/formatters";
import { normalizeMarketplaceSession } from "../../lib/mappers";


export const MarketplaceTab: React.FC = () => {
    const [sessions, setSessions] = useState<any[]>([]);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const data = await adminApi.getMarketplaceSessions();
            // Handle both array (legacy) and object { ok, sessions } responses
            const rawList = Array.isArray(data) ? data : (data as any)?.sessions || [];
            const normalized = rawList.map(normalizeMarketplaceSession);
            setSessions(normalized);
        } catch (err) {
            console.error('Failed to fetch marketplace sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSessionDetail = async (id: string) => {
        setDetailLoading(true);
        try {
            const data = await adminApi.getMarketplaceSessionDetail(id);
            const rawSession = data?.session || data; 
            const normalized = normalizeMarketplaceSession(rawSession);
            setSelectedSession(normalized);
        } catch (err) {
            console.error('Failed to fetch session detail:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleSelectOffer = async (offerId: string) => {
        if (!selectedSession) return;
        try {
            const res = await adminApi.selectMarketplaceOffer(selectedSession.id, offerId);
            if (res) {
                fetchSessionDetail(selectedSession.id);
                fetchSessions();
            }
        } catch (err) {
            console.error('Selection failed:', err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <BuildingStorefrontIcon className="w-6 h-6 text-blue-600" />
                        Marketplace Interaction
                    </h2>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Manage multi-offer sessions and competitive routing overrides.</p>
                </div>
                <button onClick={fetchSessions} className="p-2 bg-white border border-slate-200 rounded-none hover:bg-slate-50 transition-colors shadow-none">
                    <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sessions List */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white rounded-none border border-slate-200 overflow-hidden shadow-none">
                        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Sessions</span>
                            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-none text-[9px] font-black uppercase tracking-wider">
                                {sessions.filter(s => s.sessionStatus === 'OPEN').length} Open
                            </span>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                            {sessions.length === 0 && !loading && (
                                <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No active sessions</div>
                            )}
                            {sessions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => fetchSessionDetail(s.id)}
                                    className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selectedSession?.id === s.id ? 'bg-blue-50/50' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-bold text-slate-900 truncate pr-4">{s.jobName}</div>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-none border uppercase tracking-wider ${s.sessionStatus === 'SELECTED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            s.sessionStatus === 'OPEN' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-200'
                                            }`}>
                                            {s.sessionStatus}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                        <TableCellsIcon className="w-3 h-3" /> {s.offerCount} Proposals
                                        <span>•</span>
                                        {safeTime(s.createdAt)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Offer Comparison View */}
                <div className="lg:col-span-2">
                    {detailLoading ? (
                        <div className="h-full min-h-[400px] bg-white rounded-none border border-slate-200 flex flex-col items-center justify-center space-y-4">
                            <ArrowPathIcon className="w-8 h-8 text-blue-600 animate-spin" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fetching Session Detail...</p>
                        </div>
                    ) : selectedSession ? (
                        <div className="space-y-6">
                            <div className="bg-white rounded-none border border-slate-200 p-6 shadow-none">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 tracking-tight">{selectedSession.jobName}</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: {short(selectedSession.id, 12)}</p>
                                            <span className="text-slate-200">|</span>
                                            <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest">Ref: {selectedSession.sourceRef}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className={`px-3 py-1 rounded-none text-[10px] font-black tracking-widest uppercase border ${selectedSession.selectionMode === 'ADMIN_OVERRIDE' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                                            }`}>
                                            Mode: {selectedSession.selectionMode}
                                        </span>
                                    </div>
                                </div>

                                {/* Comparison Grid - Dense Multi-column */}
                                {selectedSession.offers.length === 0 ? (
                                    <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-none">
                                        <ExclamationTriangleIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No offers returned for this session</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedSession.offers.map((o: any, i: number) => (
                                            <div key={i} className={`p-4 rounded-none border transition-all ${o.offerSelected ? 'bg-emerald-50/50 border-emerald-200 ring-2 ring-emerald-500/10' : 'bg-white border-slate-100 hover:border-slate-300 shadow-none'
                                                }`}>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-slate-900 text-white rounded-none flex items-center justify-center font-black text-xs shadow-none">
                                                            #{i + 1}
                                                        </div>
                                                        <div>
                                                            <div className="font-black text-slate-900 text-sm tracking-tight">{o.printerName}</div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                {i === 0 && <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-none uppercase tracking-tighter flex items-center gap-1 shadow-none"><ShieldCheckIcon className="w-2.5 h-2.5" /> Best Choice</span>}
                                                                {o.offerSelected && <span className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-none uppercase tracking-tighter flex items-center gap-1 shadow-none"><BoltIcon className="w-2.5 h-2.5" /> Active</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-lg font-black text-slate-900 leading-none">{o.suggestedPrice} €</div>
                                                        <div className="text-[9px] text-emerald-600 font-black mt-1 uppercase tracking-tighter">+{o.marginPct}% Margin</div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 mb-4">
                                                    <div className="bg-slate-50 p-2 rounded-none border border-slate-100">
                                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Lead Time</div>
                                                        <div className="font-black text-slate-900 text-xs">{safeText(o.leadTimeDays, '—')} Work Days</div>
                                                    </div>
                                                    <div className="bg-slate-50 p-2 rounded-none border border-slate-100">
                                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Market Score</div>
                                                        <div className="font-black text-slate-900 text-xs">{Math.round(o.offerPriorityScore)} / 100</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-2 border-t border-slate-100/50">
                                                    <div className="text-[10px] text-slate-400 font-medium">Node ID: {short(o.printerId, 8)}</div>

                                                    {!o.offerSelected && selectedSession.sessionStatus === 'OPEN' && (
                                                        <button
                                                            onClick={() => handleSelectOffer(o.id)}
                                                            className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-none hover:bg-blue-600 transition-all shadow-none active:scale-95"
                                                        >
                                                            Select Offer
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Session Timeline */}
                            <div className="bg-white rounded-none border border-slate-200 p-6 shadow-none">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Marketplace Event Log</h4>
                                {selectedSession.events.length === 0 ? (
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest py-4">No events recorded</p>
                                ) : (
                                    <div className="space-y-4">
                                        {selectedSession.events.map((e: any, i: number) => (
                                            <div key={i} className="flex gap-4 items-start pl-2 border-l-2 border-slate-100 pb-4 last:pb-0">
                                                <div className="mt-1 w-2 h-2 rounded-none bg-slate-300 ring-4 ring-white" />
                                                <div>
                                                    <div className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                                        {safeText(e.event_type || e.eventType).replace(/_/g, ' ')}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-medium">
                                                        {safeDate(e.created_at || e.createdAt)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] bg-slate-50/50 rounded-none border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-3">
                            <AdjustmentsHorizontalIcon className="w-12 h-12 opacity-20" />
                            <p className="font-black uppercase text-xs tracking-widest opacity-40">Select a session to compare offers</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
