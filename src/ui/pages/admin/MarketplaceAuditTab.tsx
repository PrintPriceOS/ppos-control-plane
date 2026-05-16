// src/ui/pages/admin/MarketplaceAuditTab.tsx
import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    ShieldCheckIcon,
    MagnifyingGlassIcon,
    ClockIcon,
    FingerPrintIcon,
    BoltIcon,
    ArrowPathIcon
} from "@heroicons/react/24/outline";
import { safeDate, safeText, short } from "../../lib/formatters";

export const MarketplaceAuditTab: React.FC = () => {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [eventType, setEventType] = useState("");

    useEffect(() => {
        fetchEvents();
    }, [eventType]);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const res = await adminApi.listMarketplaceAuditEvents({ 
                search,
                eventType: eventType || undefined
            });
            setEvents(res.events || []);
        } catch (err) {
            console.error('Failed to fetch marketplace audit events:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:row gap-4 p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-none shadow-none">
                <div className="flex-1 relative group">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        className="w-full bg-white dark:bg-[#0e0e0f] border border-slate-200 dark:border-white/10 rounded-none pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary transition-all dark:text-white"
                        placeholder="Search by Order ID or Ref..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchEvents()}
                    />
                </div>
                <div className="flex gap-4">
                    <select
                        className="bg-white dark:bg-[#0e0e0f] border border-slate-200 dark:border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest outline-none dark:text-white"
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value)}
                    >
                        <option value="">All Event Types</option>
                        <option value="ORDER_DECLARED">Order Declared</option>
                        <option value="ORDER_ACKNOWLEDGED">Order Acknowledged</option>
                        <option value="PRINTHOUSE_ASSIGNED">Printhouse Assigned</option>
                        <option value="PREFLIGHT_REQUIRED">Preflight Required</option>
                        <option value="CUSTOMER_ACTION_REQUESTED">Action Requested</option>
                        <option value="NOTE_ADDED">Note Added</option>
                    </select>
                    <button onClick={fetchEvents} className="p-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10">
                        <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 overflow-hidden shadow-none">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-slate-50/50 dark:bg-white/5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-white/10">
                        <tr>
                            <th className="py-4 px-6">Timestamp</th>
                            <th className="py-4 px-6">Event Type</th>
                            <th className="py-4 px-6">Entity / Ref</th>
                            <th className="py-4 px-6">Actor</th>
                            <th className="py-4 px-6">Detail / Payload</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {loading ? (
                             <tr><td colSpan={5} className="py-20 text-center"><ArrowPathIcon className="w-8 h-8 text-primary animate-spin mx-auto" /></td></tr>
                        ) : events.length === 0 ? (
                            <tr><td colSpan={5} className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest">No audit events found</td></tr>
                        ) : events.map((e) => (
                            <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                <td className="py-4 px-6 whitespace-nowrap">
                                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
                                        <ClockIcon className="w-3.5 h-3.5" />
                                        <span className="font-medium">{safeDate(e.createdAt)} {new Date(e.createdAt).toLocaleTimeString()}</span>
                                    </div>
                                </td>
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-2">
                                        <BoltIcon className="w-3 h-3 text-primary" />
                                        <span className="font-black text-slate-900 dark:text-white text-[10px] tracking-widest uppercase">{e.eventType.replace(/_/g, ' ')}</span>
                                    </div>
                                </td>
                                <td className="py-4 px-6">
                                    <div className="font-mono text-[10px] font-black text-slate-600 dark:text-slate-400">
                                        {short(e.entityId, 8)}
                                    </div>
                                </td>
                                <td className="py-4 px-6">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <FingerPrintIcon className="w-3.5 h-3.5 opacity-40" />
                                        {e.actorId}
                                    </div>
                                </td>
                                <td className="py-4 px-6">
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium max-w-md truncate" title={JSON.stringify(e.payload)}>
                                        {e.payload?.message || e.payload?.noteText || JSON.stringify(e.payload)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
