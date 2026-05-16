// src/ui/pages/admin/PricingSessionsTab.tsx
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

// Feature flag for internal testing
const MARKETPLACE_INTERNAL_OFFER_SELECTION_ENABLED = false;

export const PricingSessionsTab: React.FC = () => {
    const [sessions, setSessions] = useState<any[]>([]);
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);

    // Defensive formatting helpers
    const safeMoney = (value: any, fallback = '—') => {
        const n = Number(value);
        return Number.isFinite(n) ? `${n.toLocaleString('es-ES', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })} €` : fallback;
    };

    const safePercent = (value: any, fallback = '—') => {
        const n = Number(value);
        return Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toLocaleString('es-ES', {
            maximumFractionDigits: 2
        })}%` : fallback;
    };

    const safeScore = (value: any, fallback = '—') => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.round(n) : fallback;
    };

    const safeLeadTime = (value: any, fallback = '—') => {
        const n = Number(value);
        return Number.isFinite(n) ? `${Math.ceil(n)} Work Days` : fallback;
    };

    // Safe array derivations
    const selectedOffers = Array.isArray(selectedSession?.offers) ? selectedSession.offers : [];
    const selectedEvents = Array.isArray(selectedSession?.events) ? selectedSession.events : [];

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const data = await adminApi.getMarketplaceSessions();
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

    const handleSelectOffer = async (offerId: string, printerName?: string) => {
        if (!MARKETPLACE_INTERNAL_OFFER_SELECTION_ENABLED) return;
        if (!selectedSession) return;

        const ok = window.confirm(
            `Select ${printerName || 'this offer'} for this marketplace session?\n\nThis will mark competing offers as rejected and write OFFER_SELECTED to the event log.`
        );
        if (!ok) return;

        try {
            const res = await adminApi.selectMarketplaceOffer(selectedSession.id, offerId);
            if (res) {
                await fetchSessionDetail(selectedSession.id);
                await fetchSessions();
            }
        } catch (err) {
            console.error('Selection failed:', err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 uppercase">
                        <BuildingStorefrontIcon className="w-5 h-5 text-primary" />
                        Pricing Sessions Browser
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Forensic visibility into BPE proposals, active sessions and routing events.</p>
                </div>
                <button onClick={fetchSessions} className="p-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-none">
                    <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sessions List */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white dark:bg-[#131314] rounded-none border border-slate-200 dark:border-white/10 overflow-hidden shadow-none">
                        <div className="p-4 bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Active Sessions</span>
                            <span className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-none text-[9px] font-black uppercase tracking-wider">
                                {sessions.filter(s => s.sessionStatus === 'OPEN').length} Open
                            </span>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[600px] overflow-y-auto custom-scrollbar">
                            {sessions.length === 0 && !loading && (
                                <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No active sessions</div>
                            )}
                            {sessions.map((s, i) => (
                                <button
                                    key={s.id || i}
                                    onClick={() => fetchSessionDetail(s.id)}
                                    className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${selectedSession?.id === s.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-bold text-slate-900 dark:text-white truncate pr-4 text-xs">{s.jobName}</div>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-none border uppercase tracking-wider ${s.sessionStatus === 'SELECTED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            s.sessionStatus === 'OPEN' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                            s.sessionStatus === 'FAILED' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-500 border-slate-200'
                                            }`}>
                                            {s.sessionStatus}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-tight">
                                        <span className="text-blue-600/60">{s.source}</span>
                                        <span>•</span>
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
                        <div className="h-full min-h-[400px] bg-white dark:bg-[#131314] rounded-none border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center space-y-4">
                            <ArrowPathIcon className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fetching Session Detail...</p>
                        </div>
                    ) : selectedSession ? (
                        <div className="space-y-6 animate-slide-fade">
                            {selectedSession.sessionStatus === 'FAILED' && (
                                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4 rounded-none flex items-center gap-3">
                                    <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
                                    <div>
                                        <div className="text-[10px] font-black text-red-600 uppercase tracking-widest">Session Failed</div>
                                        <div className="text-xs font-bold text-red-800 dark:text-red-400">{safeText(selectedSession.errorJson?.message || selectedSession.errorJson)}</div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-white dark:bg-[#131314] rounded-none border border-slate-200 dark:border-white/10 p-6 shadow-none">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{selectedSession.jobName}</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: {short(selectedSession.id, 12)}</p>
                                            <span className="text-slate-200 dark:text-white/10">|</span>
                                            <p className="text-[10px] text-primary font-black uppercase tracking-widest">Ref: {selectedSession.sourceRef}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className={`px-3 py-1 rounded-none text-[10px] font-black tracking-widest uppercase border ${selectedSession.selectionMode === 'ADMIN_OVERRIDE' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                                            }`}>
                                            Mode: {selectedSession.selectionMode}
                                        </span>
                                    </div>
                                </div>

                                {/* Comparison Grid */}
                                {selectedOffers.length === 0 ? (
                                    <div className="p-12 text-center border-2 border-dashed border-slate-100 dark:border-white/5 rounded-none">
                                        <ExclamationTriangleIcon className="w-10 h-10 text-slate-200 dark:text-white/10 mx-auto mb-3" />
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No offers returned for this session</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedOffers.map((o: any, i: number) => {
                                            const rank = Number(o.offerRank);
                                            const score = Number(o.offerPriorityScore);
                                            const isRecommended = rank === 1 || (!Number.isFinite(rank) && score === 100);
                                            const isSelected = Boolean(o.offerSelected || selectedSession.selectedOfferId === o.id);
                                            const isOverride = isSelected && selectedSession.selectionMode === 'ADMIN_OVERRIDE';
                                            const offerId = (o.id || o.offerId) ? String(o.id || o.offerId) : null;

                                            return (
                                                <div key={o.id || `${o.printerId}-${i}`} className={`p-4 rounded-none border transition-all ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' : 
                                                    isRecommended && selectedSession.sessionStatus === 'OPEN' ? 'bg-blue-50/20 dark:bg-primary/5 border-blue-100 dark:border-primary/20' : 'bg-white dark:bg-white/5 border-slate-100 dark:border-white/10 hover:border-slate-300 shadow-none'
                                                    }`}>
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-none flex items-center justify-center font-black text-xs shadow-none ${
                                                                isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-900 dark:bg-white/10 text-white'
                                                            }`}>
                                                                {o.offerRank ? `#${o.offerRank}` : `--`}
                                                            </div>
                                                            <div>
                                                                <div className="font-black text-slate-900 dark:text-white text-sm tracking-tight">{safeText(o.printerName, 'Unknown printer')}</div>
                                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                                    {isSelected && <span className="bg-emerald-600 text-white text-[7px] font-black px-1 py-0.5 rounded-none uppercase tracking-tighter flex items-center gap-0.5 shadow-none"><BoltIcon className="w-2.5 h-2.5" /> Customer Selected</span>}
                                                                    {isRecommended && !isSelected && <span className="bg-blue-600 text-white text-[7px] font-black px-1 py-0.5 rounded-none uppercase tracking-tighter flex items-center gap-0.5 shadow-none"><ShieldCheckIcon className="w-2.5 h-2.5" /> BPE Recommendation</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-lg font-black text-slate-900 dark:text-white leading-none">{safeMoney(o.suggestedPrice)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 mb-2">
                                                        <div className="bg-slate-50 dark:bg-white/5 p-2 rounded-none border border-slate-100 dark:border-white/10 text-center">
                                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Lead Time</div>
                                                            <div className="font-black text-slate-900 dark:text-white text-xs">{safeLeadTime(o.leadTimeDays)}</div>
                                                        </div>
                                                        <div className="bg-slate-50 dark:bg-white/5 p-2 rounded-none border border-slate-100 dark:border-white/10 text-center">
                                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Score</div>
                                                            <div className="font-black text-slate-900 dark:text-white text-xs">{safeScore(o.offerPriorityScore)}</div>
                                                        </div>
                                                    </div>

                                                    {MARKETPLACE_INTERNAL_OFFER_SELECTION_ENABLED && !isSelected && offerId && selectedSession.sessionStatus === 'OPEN' && (
                                                        <button
                                                            onClick={() => handleSelectOffer(offerId, o.printerName)}
                                                            className="w-full mt-2 px-4 py-2 bg-slate-900 dark:bg-white/10 text-white text-[9px] font-black uppercase tracking-widest rounded-none hover:bg-primary transition-all shadow-none"
                                                        >
                                                            Internal Selection (Testing)
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Session Timeline */}
                            <div className="bg-white dark:bg-[#131314] rounded-none border border-slate-200 dark:border-white/10 p-6 shadow-none">
                                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Pricing Pipeline Event Log</h4>
                                {selectedEvents.length === 0 ? (
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest py-4">No events recorded</p>
                                ) : (
                                    <div className="space-y-4">
                                        {selectedEvents.map((e: any, i: number) => (
                                            <div key={e.id || i} className="flex gap-4 items-start pl-2 border-l-2 border-slate-100 dark:border-white/5 pb-4 last:pb-0">
                                                <div className="mt-1 w-2 h-2 rounded-none bg-slate-300 dark:bg-white/10 ring-4 ring-white dark:ring-[#131314]" />
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                                                            {String(safeText(e.event_type || e.eventType)).replace(/_/g, ' ')}
                                                        </div>
                                                        <div className="text-[9px] text-slate-400 font-medium">
                                                            {safeDate(e.created_at || e.createdAt)}
                                                        </div>
                                                    </div>
                                                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                                                        {e.message || JSON.stringify(e.payload)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] bg-slate-50/50 dark:bg-white/5 rounded-none border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center text-slate-400 space-y-3">
                            <AdjustmentsHorizontalIcon className="w-12 h-12 opacity-20" />
                            <p className="font-black uppercase text-xs tracking-widest opacity-40">Select a session to inspect proposals</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
