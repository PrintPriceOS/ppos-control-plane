import React, { useState, useEffect } from "react";
import {
    ShieldCheckIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    EyeIcon,
    FunnelIcon,
    DocumentMagnifyingGlassIcon,
    ClockIcon,
    ServerStackIcon,
    UserIcon,
    ExclamationCircleIcon,
    InformationCircleIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";

export const AuditExplorerPage: React.FC = () => {
    const [events, setEvents] = useState<adminApi.AuditExplorerEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState<adminApi.AuditExplorerEvent | null>(null);

    // Filters
    const [entityType, setEntityType] = useState("");
    const [actor, setActor] = useState("");
    const [tenant, setTenant] = useState("");
    const [dispatchId, setDispatchId] = useState("");
    const [eventType, setEventType] = useState("");
    const [severity, setSeverity] = useState("");
    const [limit, setLimit] = useState(200);

    // Specific entity timeline lookup toggle
    const [lookupMode, setLookupMode] = useState(false);
    const [targetEntityType, setTargetEntityType] = useState("DISPATCH");
    const [targetEntityId, setTargetEntityId] = useState("");
    const [lookupFeedback, setLookupFeedback] = useState<string | null>(null);

    useEffect(() => {
        if (!lookupMode) {
            fetchAudits();
        }
    }, [entityType, severity, limit]);

    const fetchAudits = async () => {
        setLoading(true);
        setLookupFeedback(null);
        try {
            const res = await adminApi.getAuditLogs({
                entity_type: entityType,
                actor: actor.trim(),
                tenant: tenant.trim(),
                dispatch: dispatchId.trim(),
                event_type: eventType.trim(),
                severity,
                limit
            });
            setEvents(Array.isArray(res?.data) ? res.data : []);
        } catch (err: any) {
            console.error("Failed to query audit log datastore:", err);
            setLookupFeedback(`Query error: ${err.message}`);
            setEvents([]);
        } finally {
            setLoading(false);
        }
    };

    const executeEntityLookup = async () => {
        if (!targetEntityId.trim()) return;
        setLoading(true);
        setLookupFeedback(null);
        setSelectedEvent(null);
        try {
            const res = await adminApi.getAuditEntityTimeline(targetEntityType, targetEntityId.trim());
            setEvents(Array.isArray(res?.timeline) ? res.timeline : []);
            setLookupFeedback(`Showing absolute chained timeline for ${targetEntityType} [${targetEntityId}] (${res?.timeline?.length || 0} occurrences)`);
        } catch (err: any) {
            console.error("Failed to fetch entity timeline:", err);
            setLookupFeedback(`Timeline lookup failed: ${err.message}`);
            setEvents([]);
        } finally {
            setLoading(false);
        }
    };

    const handleResetFilters = () => {
        setEntityType("");
        setActor("");
        setTenant("");
        setDispatchId("");
        setEventType("");
        setSeverity("");
        setLookupMode(false);
        setTargetEntityId("");
        setLookupFeedback(null);
        setSelectedEvent(null);
        // fetchAudits will trigger by state change or explicit invocation
        setTimeout(() => fetchAudits(), 50);
    };

    const renderSeverityBadge = (sev: string) => {
        const s = (sev || 'INFO').toUpperCase();
        if (s === 'CRITICAL' || s === 'ERROR' || s === 'FAILURE') {
            return (
                <span className="px-1.5 py-0.5 bg-red-950 text-red-400 border border-red-800 text-[9px] font-mono font-bold tracking-wider rounded-none uppercase flex items-center w-max">
                    <ExclamationCircleIcon className="w-2.5 h-2.5 mr-1 text-red-500" /> {s}
                </span>
            );
        }
        if (s === 'WARN' || s === 'WARNING') {
            return (
                <span className="px-1.5 py-0.5 bg-amber-950 text-amber-400 border border-amber-800 text-[9px] font-mono font-bold tracking-wider rounded-none uppercase flex items-center w-max">
                    <InformationCircleIcon className="w-2.5 h-2.5 mr-1 text-amber-500" /> {s}
                </span>
            );
        }
        return (
            <span className="px-1.5 py-0.5 bg-slate-950 text-slate-300 border border-slate-800 text-[9px] font-mono tracking-wider rounded-none uppercase block w-max">
                {s}
            </span>
        );
    };

    const renderSourceBadge = (src: string) => {
        let colorClass = "bg-slate-950 text-slate-400 border-slate-800";
        if (src === 'MES_ORCHESTRATION') colorClass = "bg-indigo-950/80 text-indigo-300 border-indigo-900";
        if (src === 'EVIDENCE_LEDGER') colorClass = "bg-emerald-950/80 text-emerald-300 border-emerald-900";
        if (src === 'API_GATEWAY') colorClass = "bg-cyan-950/80 text-cyan-300 border-cyan-900";

        return (
            <span className={`px-1.5 py-0.5 text-[9px] font-mono border rounded-none uppercase block w-max ${colorClass}`}>
                {src || 'UNKNOWN'}
            </span>
        );
    };

    return (
        <div className="space-y-6 text-slate-900 dark:text-slate-100 ppos-layout-transition">
            {/* Main Header */}
            <div className="p-4 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-none flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 rounded-none uppercase tracking-widest">
                            FORENSIC AUDIT ENGINE
                        </span>
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">IMMUTABLE TRACEABILITY</span>
                    </div>
                    <h1 className="text-xl font-black font-sans tracking-tight text-slate-900 dark:text-white mt-1 flex items-center uppercase">
                        <ShieldCheckIcon className="w-5 h-5 mr-2 text-amber-600 dark:text-amber-500" />
                        Audit Explorer
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Multi-source event correlation spanning API Gateway accesses, industrial MES dispatches, and immutable blockchain ledger logs.
                    </p>
                </div>

                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => { setLookupMode(false); fetchAudits(); }}
                        disabled={loading}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-[#1a1a1b] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 text-xs font-mono flex items-center space-x-1.5 rounded-none transition-all"
                    >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-500' : ''}`} />
                        <span>Query Datastore</span>
                    </button>
                    <button
                        onClick={handleResetFilters}
                        className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-[#1a1a1b] dark:hover:bg-slate-800 text-slate-500 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-800 text-xs font-mono rounded-none transition-colors"
                        title="Clear all filters and views"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Filter Controls Workspace */}
            <div className="p-4 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-none space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5">
                    <span className="text-xs font-sans font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider flex items-center">
                        <FunnelIcon className="w-3.5 h-3.5 mr-1.5 text-amber-600 dark:text-amber-500" />
                        Forensic Scope Constraints
                    </span>
                    <div className="flex items-center space-x-3 text-xs font-mono">
                        <label className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={lookupMode}
                                onChange={(e) => {
                                    setLookupMode(e.target.checked);
                                    if (!e.target.checked) fetchAudits();
                                }}
                                className="rounded-none bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-amber-600 dark:text-amber-500 focus:ring-0"
                            />
                            <span className={lookupMode ? "text-amber-700 dark:text-amber-400 font-bold" : ""}>Target Entity Timeline Mode</span>
                        </label>
                    </div>
                </div>

                {lookupMode ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                        <div>
                            <label className="block text-[10px] font-mono text-slate-600 dark:text-slate-500 uppercase mb-1">Entity Domain Class</label>
                            <select
                                value={targetEntityType}
                                onChange={(e) => setTargetEntityType(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 p-2 rounded-none focus:outline-none"
                            >
                                <option value="DISPATCH">DISPATCH (Manufacturing Payload)</option>
                                <option value="JOB">JOB (Global Orchestration Job)</option>
                                <option value="API_REQUEST">API_REQUEST (Correlation Context)</option>
                                <option value="SYSTEM">SYSTEM (Global Infrastructure)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-mono text-slate-600 dark:text-slate-500 uppercase mb-1">Exact Entity/Trace ID</label>
                            <input
                                type="text"
                                placeholder="e.g. dispatch-uuid or hash..."
                                value={targetEntityId}
                                onChange={(e) => setTargetEntityId(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white p-2 rounded-none focus:outline-none placeholder-slate-400 dark:placeholder-slate-600"
                            />
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={executeEntityLookup}
                                disabled={!targetEntityId.trim() || loading}
                                className="w-full py-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900 disabled:bg-slate-100 dark:disabled:bg-slate-950 text-amber-800 dark:text-amber-300 disabled:text-slate-400 dark:disabled:text-slate-600 border border-amber-200 dark:border-amber-800 disabled:border-slate-200 dark:disabled:border-slate-800 text-xs font-mono font-bold uppercase tracking-wider rounded-none transition-all flex items-center justify-center space-x-1"
                            >
                                <DocumentMagnifyingGlassIcon className="w-4 h-4" />
                                <span>Reconstruct Chain</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                        <div>
                            <label className="block text-[10px] font-mono text-slate-600 dark:text-slate-500 uppercase mb-1">Entity Type</label>
                            <select
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-300 p-1.5 rounded-none focus:outline-none focus:border-slate-400 dark:focus:border-slate-700"
                            >
                                <option value="">ALL ENTITIES</option>
                                <option value="DISPATCH">DISPATCH</option>
                                <option value="JOB">JOB</option>
                                <option value="SYSTEM">SYSTEM</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-mono text-slate-600 dark:text-slate-500 uppercase mb-1">Event Action</label>
                            <input
                                type="text"
                                placeholder="Filter action..."
                                value={eventType}
                                onChange={(e) => setEventType(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && fetchAudits()}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white p-1.5 rounded-none focus:outline-none focus:border-slate-400 dark:focus:border-slate-700 placeholder-slate-400 dark:placeholder-slate-600"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-mono text-slate-600 dark:text-slate-500 uppercase mb-1">Actor Identity</label>
                            <input
                                type="text"
                                placeholder="Filter user/role..."
                                value={actor}
                                onChange={(e) => setActor(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && fetchAudits()}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white p-1.5 rounded-none focus:outline-none focus:border-slate-400 dark:focus:border-slate-700 placeholder-slate-400 dark:placeholder-slate-600"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-mono text-slate-600 dark:text-slate-500 uppercase mb-1">Tenant Scoping</label>
                            <input
                                type="text"
                                placeholder="Tenant ID..."
                                value={tenant}
                                onChange={(e) => setTenant(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && fetchAudits()}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white p-1.5 rounded-none focus:outline-none focus:border-slate-400 dark:focus:border-slate-700 placeholder-slate-400 dark:placeholder-slate-600"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-mono text-slate-600 dark:text-slate-500 uppercase mb-1">Dispatch/Machine ID</label>
                            <input
                                type="text"
                                placeholder="Exact dispatch..."
                                value={dispatchId}
                                onChange={(e) => setDispatchId(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && fetchAudits()}
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white p-1.5 rounded-none focus:outline-none focus:border-slate-400 dark:focus:border-slate-700 placeholder-slate-400 dark:placeholder-slate-600"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-mono text-slate-600 dark:text-slate-500 uppercase mb-1">Severity / Limit</label>
                            <div className="flex gap-1">
                                <select
                                    value={severity}
                                    onChange={(e) => setSeverity(e.target.value)}
                                    className="w-2/3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-300 p-1.5 rounded-none focus:outline-none"
                                >
                                    <option value="">ANY SEV</option>
                                    <option value="INFO">INFO</option>
                                    <option value="WARN">WARN</option>
                                    <option value="ERROR">ERROR</option>
                                </select>
                                <select
                                    value={limit}
                                    onChange={(e) => setLimit(Number(e.target.value))}
                                    className="w-1/3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-400 p-1.5 rounded-none focus:outline-none px-1"
                                >
                                    <option value={50}>50</option>
                                    <option value={200}>200</option>
                                    <option value={500}>500</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Inline filter application helpers */}
                {!lookupMode && (
                    <div className="flex justify-end pt-1">
                        <button
                            onClick={fetchAudits}
                            className="px-3 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-[11px] font-mono text-amber-800 dark:text-amber-400 border border-slate-200 dark:border-slate-800 rounded-none transition-colors flex items-center space-x-1"
                        >
                            <MagnifyingGlassIcon className="w-3 h-3" />
                            <span>Apply Parameters</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Scope Feedback Indicators */}
            {lookupFeedback && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400 rounded-none flex items-center justify-between">
                    <span className="text-amber-700 dark:text-amber-400 flex items-center">
                        <InformationCircleIcon className="w-4 h-4 mr-1.5 flex-shrink-0" />
                        {lookupFeedback}
                    </span>
                    <button onClick={() => setLookupFeedback(null)} className="text-[10px] underline hover:text-slate-900 dark:hover:text-white uppercase tracking-wider ml-2">
                        Dismiss
                    </button>
                </div>
            )}

            {/* Core Split Screen Setup */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Dense Forensic Dataflow Table (Spans 2 Cols) */}
                <div className="lg:col-span-2 space-y-3">
                    <div className="p-3 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-none flex items-center justify-between">
                        <span className="text-xs font-sans font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider flex items-center">
                            <ServerStackIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400 dark:text-slate-500" />
                            Aggregated Event Datastream ({events.length} logs)
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                            Sorted strictly by operational timestamp descending
                        </span>
                    </div>

                    <div className="bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-none overflow-x-auto">
                        {loading && events.length === 0 ? (
                            <div className="p-16 text-center text-xs font-mono text-slate-500">
                                <ArrowPathIcon className="w-6 h-6 mx-auto animate-spin text-amber-500 mb-2" />
                                Extracting multi-layered forensic traces from database nodes...
                            </div>
                        ) : events.length === 0 ? (
                            <div className="p-16 text-center text-xs font-mono text-slate-400 dark:text-slate-600">
                                No operational timeline log events retrieved matching the active cryptographic context bounds.
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        <th className="p-2.5 w-32">Timestamp</th>
                                        <th className="p-2.5">Entity / Source</th>
                                        <th className="p-2.5">Event Action / Message</th>
                                        <th className="p-2.5 w-24">Actor</th>
                                        <th className="p-2.5 w-20 text-center">Severity</th>
                                        <th className="p-2.5 w-12 text-center">Inspect</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs font-mono">
                                    {events.map((ev) => {
                                        const isSelected = selectedEvent?.id === ev.id;
                                        // Formatted simplified time string
                                        let timeStr = ev.timestamp;
                                        try {
                                            const d = new Date(ev.timestamp);
                                            timeStr = d.toISOString().replace('T', ' ').substring(0, 19);
                                        } catch (e) {}

                                        return (
                                            <tr
                                                key={ev.id}
                                                className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${
                                                    isSelected ? 'bg-slate-50 dark:bg-slate-800/90 border-l-2 border-amber-500' : ''
                                                }`}
                                                onClick={() => setSelectedEvent(ev)}
                                            >
                                                <td className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                    <span className="flex items-center">
                                                        <ClockIcon className="w-2.5 h-2.5 mr-1 text-slate-400 dark:text-slate-600 flex-shrink-0" />
                                                        {timeStr}
                                                    </span>
                                                </td>

                                                <td className="p-2.5">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <span className="font-bold text-slate-900 dark:text-white text-[11px]">
                                                            {ev.entity_type}
                                                        </span>
                                                        {renderSourceBadge(ev.source_service)}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 block truncate max-w-[140px] font-mono" title={ev.entity_id}>
                                                        ID: {ev.entity_id !== 'N/A' ? ev.entity_id : ev.trace_id}
                                                    </span>
                                                </td>

                                                <td className="p-2.5">
                                                    <div className="font-bold text-amber-700 dark:text-amber-400/90 text-[11px] truncate max-w-[220px]" title={ev.event_type}>
                                                        {ev.event_type}
                                                    </div>
                                                    <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate max-w-[250px] mt-0.5" title={ev.message}>
                                                        {ev.message}
                                                    </div>
                                                </td>

                                                <td className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[90px]" title={ev.actor}>
                                                    <span className="flex items-center">
                                                        <UserIcon className="w-2.5 h-2.5 mr-1 text-slate-400 dark:text-slate-600 flex-shrink-0" />
                                                        <span className="truncate">{ev.actor}</span>
                                                    </span>
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    <div className="flex justify-center">
                                                        {renderSeverityBadge(ev.severity)}
                                                    </div>
                                                </td>

                                                <td className="p-2.5 text-center">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedEvent(ev);
                                                        }}
                                                        className={`p-1 rounded-none border transition-colors ${
                                                            isSelected
                                                                ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                                                : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-slate-800'
                                                        }`}
                                                    >
                                                        <EyeIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Metadata Inspection Viewport Sidebar */}
                <div className="space-y-4">
                    <div className="p-4 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-none">
                        <span className="text-xs font-sans font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider block border-b border-slate-200 dark:border-white/10 pb-2.5">
                            Forensic Metadata Drawer
                        </span>

                        {selectedEvent ? (
                            <div className="mt-4 space-y-4 font-mono text-xs animate-fade-in">
                                <div>
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 block uppercase">Cryptographic Entry Handle</span>
                                    <span className="font-bold text-slate-900 dark:text-white text-[11px] block break-all select-all bg-slate-50 dark:bg-slate-950 p-1.5 border border-slate-200 dark:border-slate-800 mt-0.5">
                                        {selectedEvent.id}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-50 dark:bg-slate-950 p-2 border border-slate-200 dark:border-slate-800">
                                        <span className="text-[9px] text-slate-400 dark:text-slate-500 block uppercase">Datastore Origin</span>
                                        <span className="font-bold text-amber-700 dark:text-amber-400 block mt-0.5 text-[10px] break-words">
                                            {selectedEvent.source_service}
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-950 p-2 border border-slate-200 dark:border-slate-800">
                                        <span className="text-[9px] text-slate-400 dark:text-slate-500 block uppercase">Severity Class</span>
                                        <div className="mt-0.5">{renderSeverityBadge(selectedEvent.severity)}</div>
                                    </div>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-200 dark:border-slate-800 space-y-2">
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 block uppercase border-b border-slate-200 dark:border-slate-800 pb-1">
                                        Correlation &amp; Entity Links
                                    </span>
                                    <div>
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Entity Bound ({selectedEvent.entity_type}):</span>
                                        <span className="font-bold text-slate-900 dark:text-white text-[11px] block break-all select-all">
                                            {selectedEvent.entity_id}
                                        </span>
                                    </div>
                                    <div className="border-t border-slate-200 dark:border-slate-900 pt-1.5">
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Global Trace ID / Checksum:</span>
                                        <span className="font-mono text-amber-700 dark:text-amber-400 text-[11px] block break-all select-all">
                                            {selectedEvent.trace_id}
                                        </span>
                                    </div>

                                    {/* Action links to scope view to this entity */}
                                    {selectedEvent.entity_id && selectedEvent.entity_id !== 'N/A' && (
                                        <div className="pt-2">
                                            <button
                                                onClick={() => {
                                                    setLookupMode(true);
                                                    setTargetEntityType(selectedEvent.entity_type || 'DISPATCH');
                                                    setTargetEntityId(selectedEvent.entity_id);
                                                    // Trigger query directly
                                                    setTimeout(() => {
                                                        // Execute lookup
                                                        adminApi.getAuditEntityTimeline(selectedEvent.entity_type || 'DISPATCH', selectedEvent.entity_id)
                                                            .then(res => {
                                                                setEvents(Array.isArray(res?.timeline) ? res.timeline : []);
                                                                setLookupFeedback(`Showing absolute chained timeline for ${selectedEvent.entity_type} [${selectedEvent.entity_id}]`);
                                                            }).catch(() => {});
                                                    }, 50);
                                                }}
                                                className="text-[10px] text-amber-700 dark:text-amber-400 hover:text-slate-900 dark:hover:text-white underline uppercase tracking-wider block"
                                            >
                                                ↳ Pivot view to this Entity Lineage
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-200 dark:border-slate-800">
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 block uppercase mb-1">Execution Action Profile</span>
                                    <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">{selectedEvent.event_type}</div>
                                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                        {selectedEvent.message}
                                    </p>
                                </div>

                                <div>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase mb-1">Immutable Payload / Metadata Context</span>
                                    <pre className="bg-slate-50 dark:bg-slate-950 text-[10px] text-slate-600 dark:text-slate-400 p-2.5 border border-slate-200 dark:border-slate-800 overflow-x-auto max-h-56 rounded-none">
                                        {selectedEvent.metadata_json
                                            ? JSON.stringify(selectedEvent.metadata_json, null, 2)
                                            : '// No structured extra properties provided by logging driver layer.'}
                                    </pre>
                                </div>

                                <div className="pt-2">
                                    <button
                                        onClick={() => setSelectedEvent(null)}
                                        className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider transition-colors rounded-none"
                                    >
                                        Close Context View
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-600 font-mono italic-text-off">
                                Select any entry row in the datastream pane to expand deep forensic transaction metadata matrices and chain validation proofs.
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-none space-y-2">
                        <span className="text-xs font-sans font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider block">
                            Traceability Guarantees
                        </span>
                        <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                            Audit operations ensure tamper-evident persistent validation across all multi-tenant boundaries. Every operation maps deterministic signatures verified by gateway controllers.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
