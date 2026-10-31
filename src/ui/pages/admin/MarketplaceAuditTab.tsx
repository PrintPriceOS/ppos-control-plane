// src/ui/pages/admin/MarketplaceAuditTab.tsx
import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    ShieldCheckIcon,
    MagnifyingGlassIcon,
    ClockIcon,
    FingerPrintIcon,
    BoltIcon,
    ArrowPathIcon,
    CubeIcon
} from "@heroicons/react/24/outline";
import { safeDate, safeText, short } from "../../lib/formatters";

// --- Defensive Helpers ---

const getPayloadSummary = (payload: any): string => {
    if (!payload) return "No details provided";
    if (typeof payload === 'string') return payload;

    // Direct string extraction for common operational fields
    if (payload.message) return String(payload.message);
    if (payload.noteText) return String(payload.noteText);
    if (payload.action) return String(payload.action);
    if (payload.error) {
        return typeof payload.error === 'object' 
            ? (payload.error.message || JSON.stringify(payload.error)) 
            : String(payload.error);
    }
    if (payload.reason) return String(payload.reason);

    // Fallback stringification with safe truncation
    try {
        const str = JSON.stringify(payload);
        return str.length > 100 ? str.substring(0, 97) + "..." : str;
    } catch (e) {
        return "[Complex Data Structure]";
    }
};

const formatPayloadTitle = (payload: any): string => {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    try {
        return JSON.stringify(payload, null, 2);
    } catch (e) {
        return "Invalid/Malformed Payload JSON";
    }
};

const getEventColor = (type: string) => {
    const t = String(type || "").toUpperCase();
    if (t.includes('ERROR') || t.includes('FAIL') || t.includes('REJECTED')) return 'text-red-500';
    if (t.includes('REQUIRED') || t.includes('ACTION') || t.includes('PENDING')) return 'text-amber-500';
    if (t.includes('PRINTHOUSE') || t.includes('ASSIGN')) return 'text-blue-500';
    if (t.includes('ACKNOWLEDGED') || t.includes('DECLARED') || t.includes('CREATED') || t.includes('SUCCESS')) return 'text-emerald-500';
    return 'text-primary';
};

export const MarketplaceAuditTab: React.FC = () => {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [eventType, setEventType] = useState("");

    useEffect(() => {
        fetchEvents();
    }, [eventType]);

    const buildAuditFilters = () => {
        const q = search.trim();
        const filters: any = {};
        if (eventType) filters.eventType = eventType;
        if (q.startsWith("PPOS-OI")) {
            filters.publicRef = q;
        } else if (q.startsWith("oi_")) {
            filters.orderIntentId = q;
        }
        return filters;
    };

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const filters = buildAuditFilters();
            const res = await adminApi.listMarketplaceAuditEvents(filters);
            setEvents(res.events || []);
        } catch (err) {
            console.error('Failed to fetch marketplace audit events:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const showSearchHint = search.trim() !== "" && !search.trim().startsWith("PPOS-OI") && !search.trim().startsWith("oi_");

    return (
        <div className="space-y-6 animate-slide-fade">
            <div className="flex flex-col lg:flex-row gap-4 p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="flex-1 relative group">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <input
                        className="w-full bg-white dark:bg-[#0e0e0f] border border-slate-200 dark:border-white/10 rounded-none pl-10 pr-4 py-2.5 text-xs font-bold uppercase tracking-tight outline-none focus:border-primary transition-all dark:text-white"
                        placeholder="Search by Order Ref (PPOS-OI...) or Intent ID (oi_...)"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchEvents()}
                    />
                    {showSearchHint && (
                        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-tight mt-1">
                            Search supports Public Ref or Order Intent ID.
                        </p>
                    )}
                </div>
                <div className="flex gap-4 items-start">
                    <select
                        className="bg-white dark:bg-[#0e0e0f] border border-slate-200 dark:border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none dark:text-white focus:border-primary transition-colors"
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value)}
                    >
                        <option value="">All Event Types</option>
                        <option value="INTENT_CREATED">Intent Created</option>
                        <option value="UPLOAD_SUCCESS">Upload Success</option>
                        <option value="ORDER_ACKNOWLEDGED">Order Acknowledged</option>
                        <option value="PRINTHOUSE_ASSIGNED">Printhouse Assigned</option>
                        <option value="PREFLIGHT_REQUIRED">Preflight Required</option>
                        <option value="CUSTOMER_ACTION_REQUESTED">Action Requested</option>
                        <option value="NOTE_ADDED">Note Added</option>
                        <option value="ORDER_DECLARED">Order Declared (Legacy)</option>
                        <option value="PAYMENT_RECEIVED">Payment Received</option>
                    </select>
                    <button 
                        type="button"
                        onClick={fetchEvents} 
                        className="p-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                    >
                        <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 overflow-hidden shadow-none">
                <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-50/50 dark:bg-white/5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-white/10 sticky top-0 z-10">
                            <tr>
                                <th className="py-4 px-6 bg-inherit">Timestamp</th>
                                <th className="py-4 px-6 bg-inherit">Event Type</th>
                                <th className="py-4 px-6 bg-inherit">Reference</th>
                                <th className="py-4 px-6 bg-inherit">Actor</th>
                                <th className="py-4 px-6 bg-inherit">Detail / Payload</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {loading && events.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-24 text-center">
                                        <ArrowPathIcon className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hydrating audit stream...</p>
                                    </td>
                                </tr>
                            ) : events.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-24 text-center">
                                        <ShieldCheckIcon className="w-12 h-12 text-slate-100 dark:text-white/5 mx-auto mb-4" />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No audit events discovered</p>
                                    </td>
                                </tr>
                            ) : events.map((e) => (
                                <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                                    <td className="py-4 px-6 whitespace-nowrap">
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2 text-slate-900 dark:text-white text-[10px] font-black tracking-tight">
                                                <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
                                                {safeDate(e.createdAt)}
                                            </div>
                                            <div className="text-[9px] text-slate-400 font-bold ml-5 uppercase">
                                                {formatTime(e.createdAt)}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-2">
                                            <BoltIcon className={`w-3.5 h-3.5 ${getEventColor(e.eventType)}`} />
                                            <span className={`font-black text-[10px] tracking-widest uppercase ${getEventColor(e.eventType)}`}>
                                                {String(e.eventType || "UNKNOWN_EVENT").replace(/_/g, " ")}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-2">
                                            <CubeIcon className="w-3.5 h-3.5 text-slate-400 opacity-40" />
                                            <div className="font-mono text-[10px] font-black text-slate-600 dark:text-slate-400 group-hover:text-primary transition-colors">
                                                {safeText(e.entityRef || e.publicRef || short(e.entityId, 12))}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tight text-slate-700 dark:text-slate-300">
                                            <FingerPrintIcon className="w-3.5 h-3.5 opacity-40 text-primary" />
                                            {e.actorId === 'bpe-system-user' ? 'SYSTEM' : (e.actorId || 'ANONYMOUS')}
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div 
                                            className="text-[10px] text-slate-500 dark:text-slate-400 font-medium max-w-sm xl:max-w-md truncate cursor-help group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors" 
                                            title={formatPayloadTitle(e.payload)}
                                        >
                                            {getPayloadSummary(e.payload)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
