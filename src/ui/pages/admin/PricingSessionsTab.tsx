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
const MARKETPLACE_INTERNAL_OFFER_SELECTION_ENABLED =
    import.meta.env.VITE_MARKETPLACE_INTERNAL_OFFER_SELECTION_ENABLED === "true";

const getEventMessage = (event: any) => {
    const value =
        event?.message ||
        event?.payload?.message ||
        event?.payload?.reason ||
        event?.payload?.status ||
        event?.payload;

    if (!value) return "—";

    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > 220 ? `${text.slice(0, 220)}…` : text;
};

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
    const safeSessions = Array.isArray(sessions) ? sessions : [];

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
        if (!MARKETPLACE_INTERNAL_OFFER_SELECTION_ENABLED) {
            console.warn("[MARKETPLACE][SESSIONS] Internal offer selection is disabled.");
            return;
        }
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
        <div className="space-y-6 text-white">
            <div className="flex items-center justify-between p-4 bg-[#14161a] border border-[#1f2228] rounded-xl">
                <div>
                    <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-2 uppercase">
                        <BuildingStorefrontIcon className="w-5 h-5 text-[#dc2626]" />
                        Pricing Sessions Browser
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Forensic visibility into BPE proposals, active sessions and routing events.</p>
                </div>
                <button
                    type="button"
                    onClick={fetchSessions}
                    className="p-2 bg-[#0a0b0d] border border-[#1f2228] rounded-lg hover:bg-[#181b20] transition-colors cursor-pointer"
                >
                    <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sessions List */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-[#14161a] rounded-xl border border-[#1f2228] overflow-hidden">
                        <div className="p-4 bg-[#0a0b0d] border-b border-[#1f2228] flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Sessions</span>
                            <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                                {safeSessions.filter(s => s.sessionStatus === 'OPEN').length} Open
                            </span>
                        </div>
                        <div className="divide-y divide-[#1f2228] max-h-[600px] overflow-y-auto custom-scrollbar">
                            {safeSessions.length === 0 && !loading && (
                                <div className="p-8 text-center text-slate-500 text-xs font-black uppercase tracking-widest">NO ACTIVE SESSIONS DEFINED</div>
                            )}
                            {safeSessions.map((s, i) => (
                                <button
                                    key={s.id || i}
                                    type="button"
                                    onClick={() => fetchSessionDetail(s.id)}
                                    className={`w-full text-left p-4 hover:bg-[#181b20] transition-colors cursor-pointer ${selectedSession?.id === s.id ? 'bg-[#181b20] border-l-2 border-[#dc2626]' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-bold text-white truncate pr-4 text-xs">{s.jobName}</div>
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${s.sessionStatus === 'SELECTED' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                                            s.sessionStatus === 'OPEN' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 
                                            s.sessionStatus === 'FAILED' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' : 'bg-[#0a0b0d] text-slate-400 border-[#1f2228]'
                                            }`}>
                                            {s.sessionStatus}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-mono uppercase tracking-tight">
                                        <span className="text-blue-400">{s.source}</span>
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
                        <div className="h-full min-h-[400px] bg-[#14161a] rounded-xl border border-[#1f2228] flex flex-col items-center justify-center space-y-4">
                            <ArrowPathIcon className="w-8 h-8 text-[#dc2626] animate-spin" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fetching Session Detail...</p>
                        </div>
                    ) : selectedSession ? (
                        <div className="space-y-6 animate-slide-fade">
                            {selectedSession.sessionStatus === 'FAILED' && (
                                <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl flex items-center gap-3">
                                    <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
                                    <div>
                                        <div className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Session Failed</div>
                                        <div className="text-xs font-bold text-rose-300">{safeText(selectedSession.errorJson?.message || selectedSession.errorJson)}</div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-[#14161a] rounded-xl border border-[#1f2228] p-6">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h3 className="text-lg font-black text-white tracking-tight">{selectedSession.jobName}</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">ID: {short(selectedSession.id, 12)}</p>
                                            <span className="text-slate-600">|</span>
                                            <p className="text-[10px] text-[#dc2626] font-mono font-black uppercase tracking-widest">Ref: {selectedSession.sourceRef}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${
                                            selectedSession.selectionMode === 'ADMIN_OVERRIDE' 
                                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
                                                : 'bg-[#0a0b0d] text-slate-300 border-[#1f2228]'
                                        }`}>
                                            Mode: {selectedSession.selectionMode}
                                        </span>
                                    </div>
                                </div>

                                {/* Comparison Grid */}
                                {selectedOffers.length === 0 ? (
                                    <div className="p-12 text-center border border-[#1f2228] bg-[#0a0b0d] rounded-xl">
                                        <ExclamationTriangleIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">NO OFFERS RETURNED FOR THIS SESSION</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedOffers.map((o: any, i: number) => {
                                            const rank = Number(o.offerRank);
                                            const score = Number(o.offerPriorityScore);
                                            const isRecommended = rank === 1 || (!Number.isFinite(rank) && score === 100);
                                            const isSelected = Boolean(o.offerSelected || selectedSession.selectedOfferId === o.id);
                                            const offerId = (o.id || o.offerId) ? String(o.id || o.offerId) : null;

                                            return (
                                                <div key={o.id || `${o.printerId}-${i}`} className={`p-4 rounded-xl border transition-all ${
                                                    isSelected ? 'bg-emerald-500/10 border-emerald-500/30' : 
                                                    isRecommended && selectedSession.sessionStatus === 'OPEN' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-[#0a0b0d] border-[#1f2228] hover:border-slate-700'
                                                }`}>
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-black text-xs ${
                                                                isSelected ? 'bg-emerald-600 text-white' : 'bg-[#14161a] border border-[#1f2228] text-white'
                                                            }`}>
                                                                {o.offerRank ? `#${o.offerRank}` : `--`}
                                                            </div>
                                                            <div>
                                                                <div className="font-black text-white text-sm tracking-tight">{safeText(o.printerName, 'Unknown printer')}</div>
                                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                                    {isSelected && <span className="bg-emerald-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-0.5"><BoltIcon className="w-2.5 h-2.5" /> Customer Selected</span>}
                                                                    {isRecommended && !isSelected && <span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-0.5"><ShieldCheckIcon className="w-2.5 h-2.5" /> BPE Recommendation</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-mono tracking-tight font-black text-lg text-white leading-none">{safeMoney(o.suggestedPrice)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 mb-2">
                                                        <div className="bg-[#14161a] p-2 rounded-lg border border-[#1f2228] text-center">
                                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Lead Time</div>
                                                            <div className="font-mono tracking-tight font-black text-white text-xs">{safeLeadTime(o.leadTimeDays)}</div>
                                                        </div>
                                                        <div className="bg-[#14161a] p-2 rounded-lg border border-[#1f2228] text-center">
                                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Score</div>
                                                            <div className="font-mono tracking-tight font-black text-white text-xs">{safeScore(o.offerPriorityScore)}</div>
                                                        </div>
                                                    </div>

                                                    {MARKETPLACE_INTERNAL_OFFER_SELECTION_ENABLED && !isSelected && offerId && selectedSession.sessionStatus === 'OPEN' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSelectOffer(offerId, o.printerName)}
                                                            className="w-full mt-2 px-4 py-2 bg-white text-[#0a0b0d] text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-200 transition-all cursor-pointer"
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
                            <div className="bg-[#14161a] rounded-xl border border-[#1f2228] p-6">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pricing Pipeline Event Log</h4>
                                {selectedEvents.length === 0 ? (
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest py-4">No events recorded</p>
                                ) : (
                                    <div className="space-y-4">
                                        {selectedEvents.map((e: any, i: number) => (
                                            <div key={e.id || i} className="flex gap-4 items-start pl-2 border-l-2 border-[#1f2228] pb-4 last:pb-0">
                                                <div className="mt-1 w-2 h-2 rounded-full bg-slate-500" />
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-xs font-black text-white uppercase tracking-wider">
                                                            {String(safeText(e.event_type || e.eventType, "UNKNOWN_EVENT")).replace(/_/g, ' ')}
                                                        </div>
                                                        <div className="text-[9px] text-slate-400 font-mono">
                                                            {safeDate(e.created_at || e.createdAt)}
                                                        </div>
                                                    </div>
                                                    <div className="mt-1 text-[10px] text-slate-400 font-mono leading-relaxed">
                                                        {getEventMessage(e)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] bg-[#14161a] rounded-xl border border-[#1f2228] flex flex-col items-center justify-center text-slate-500 space-y-3">
                            <AdjustmentsHorizontalIcon className="w-12 h-12 opacity-30" />
                            <p className="font-black uppercase text-xs tracking-widest">SELECT A SESSION TO INSPECT PROPOSALS</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
