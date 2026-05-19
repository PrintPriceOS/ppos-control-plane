import React, { useState, useEffect } from "react";
import * as adminApi from "../lib/adminApi";
import { EmptyState } from "../components/EmptyState";
import {
    BuildingStorefrontIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    ShieldCheckIcon,
    ExclamationCircleIcon,
    DocumentTextIcon,
    UserIcon,
    XMarkIcon,
    BoltIcon,
    CreditCardIcon,
    CommandLineIcon,
    ClockIcon,
    DocumentDuplicateIcon
} from "@heroicons/react/24/outline";

export const MarketplaceOrdersPage: React.FC = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await adminApi.listMarketplaceOrders({ search });
            if (res && res.orders) {
                setOrders(res.orders);
            } else {
                setOrders([]);
            }
        } catch (err: any) {
            console.error("Failed to fetch marketplace orders:", err);
            setError(err.message || "Failed to load orders from ControlPlane.");
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case "OFFER_SELECTED":
                return "bg-blue-950/60 text-blue-400 border border-blue-900/60";
            case "FILES_REQUIRED":
                return "bg-amber-950/65 text-amber-400 border border-amber-900/60";
            case "PREFLIGHT_REQUIRED":
                return "bg-cyan-950/65 text-cyan-400 border border-cyan-900/60";
            case "CUSTOMER_ACTION_PENDING":
                return "bg-red-950/70 text-red-400 border border-red-900/60";
            case "MANUAL_REVIEW_PENDING":
                return "bg-purple-950/70 text-purple-400 border border-purple-900/60";
            case "READY_FOR_PAYMENT":
                return "bg-emerald-950/70 text-emerald-400 border border-emerald-900/60";
            case "PAYMENT_BLOCKED":
                return "bg-rose-950/80 text-rose-400 border border-rose-900/60";
            case "MES_HANDOFF_PENDING":
                return "bg-orange-950/70 text-orange-400 border border-orange-900/60";
            case "DISPATCHED":
                return "bg-lime-950/70 text-lime-400 border border-lime-900/60";
            case "COMPLETED":
                return "bg-teal-950/60 text-teal-400 border border-teal-900/60";
            case "DRAFT":
                return "bg-zinc-800 text-zinc-400 border border-zinc-700";
            default:
                return "bg-zinc-900 text-zinc-500 border border-zinc-850";
        }
    };

    return (
        <div className="space-y-6 p-6 min-h-full bg-zinc-950 font-inter text-zinc-100">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-zinc-800 pb-5 gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-black uppercase tracking-wider text-white font-mono">
                        Marketplace Orders
                    </h1>
                    <p className="text-xs text-zinc-500 font-medium">
                        Monolith intake registry for Phase 36.1 Marketplace Order files, Preflight Governance, and Printhouse Handoff.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchOrders}
                        className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer"
                        title="Reload Registry"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {/* Filter / Search Bar */}
            <div className="flex flex-col md:flex-row gap-3 p-4 bg-zinc-900/50 border border-zinc-850/80">
                <div className="relative flex-1 group">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search by Order ID, Tenant, or Status..."
                        className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-850 text-xs font-bold uppercase tracking-wider outline-none text-white focus:border-zinc-700 transition-colors"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && fetchOrders()}
                    />
                </div>
                <button
                    onClick={fetchOrders}
                    className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-black uppercase tracking-widest text-zinc-200 transition-colors cursor-pointer"
                >
                    Apply Filter
                </button>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="p-4 bg-red-950/30 border border-red-900/50 text-red-400 text-xs flex items-center gap-2">
                    <ExclamationCircleIcon className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Core Dense Orders Table or Empty State */}
            {loading ? (
                <div className="border border-zinc-900 bg-zinc-950 p-12 text-center text-zinc-500 text-xs uppercase tracking-widest font-mono">
                    <ArrowPathIcon className="w-8 h-8 animate-spin mx-auto mb-4 text-zinc-650" />
                    Querying Industrial Order Indexes...
                </div>
            ) : orders.length === 0 ? (
                <EmptyState
                    title="Intake Ledger Empty"
                    description="No marketplace orders match the active telemetry index. All systems green."
                    icon={<BuildingStorefrontIcon className="w-12 h-12 text-zinc-800" />}
                />
            ) : (
                <div className="border border-zinc-900 bg-zinc-950 overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1000px] text-xs font-mono">
                        <thead>
                            <tr className="bg-zinc-900/70 border-b border-zinc-850 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                <th className="px-4 py-3">Order ID</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Customer / Tenant</th>
                                <th className="px-4 py-3">Selected Offer</th>
                                <th className="px-4 py-3">Printhouse ID</th>
                                <th className="px-4 py-3 text-right">Price</th>
                                <th className="px-4 py-3 text-center">Files</th>
                                <th className="px-4 py-3 text-center">Preflight</th>
                                <th className="px-4 py-3">Readiness</th>
                                <th className="px-4 py-3">Created At</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                            {orders.map((o) => {
                                const customerInfo = o.customer_json || {};
                                const specInfo = o.book_spec_json || {};
                                const readiness = o.readiness_json || { ready: false, blockers: ["PENDING"] };
                                
                                return (
                                    <tr key={o.order_id} className="hover:bg-zinc-900/40 transition-colors">
                                        <td className="px-4 py-3 font-bold text-white uppercase tracking-tight">{o.order_id}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getStatusBadgeClass(o.status)}`}>
                                                {o.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 max-w-[180px] truncate">
                                            <div className="font-bold text-zinc-300">{customerInfo.name || o.customer_id || "Anonymous"}</div>
                                            <div className="text-[10px] text-zinc-500">{o.tenant_id || "No Tenant"}</div>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-400 font-mono text-[10px] uppercase truncate max-w-[120px]">
                                            {o.selected_offer_id || "None"}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-400 uppercase">{o.printhouse_id || "Unassigned"}</td>
                                        <td className="px-4 py-3 text-right font-bold text-white">
                                            {o.estimated_price !== null && o.estimated_price !== undefined 
                                                ? `${Number(o.estimated_price).toFixed(2)} ${o.currency || "EUR"}` 
                                                : "—"
                                            }
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-zinc-400">
                                            {o.files_count || 0} Slots
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                                                o.preflight_passed_count > 0 
                                                    ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/60" 
                                                    : "bg-zinc-800 text-zinc-500"
                                            }`}>
                                                {o.preflight_passed_count || 0} OK
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                                                readiness.ready 
                                                    ? "bg-emerald-950 text-emerald-400 border border-emerald-900" 
                                                    : "bg-red-950/80 text-red-400 border border-red-900"
                                            }`}>
                                                {readiness.ready ? "READY" : "BLOCKED"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-[10px]">
                                            {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => setSelectedOrderId(o.order_id)}
                                                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:text-white cursor-pointer"
                                            >
                                                Inspect
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Detail Drawer */}
            {selectedOrderId && (
                <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setSelectedOrderId(null)}
                    />
                    <div className="relative w-full max-w-4xl bg-zinc-950 border-l border-zinc-850 h-full flex flex-col shadow-2xl animate-slide-in-right">
                        <OrderDetailDrawer
                            orderId={selectedOrderId}
                            onClose={() => setSelectedOrderId(null)}
                            onRefresh={fetchOrders}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

interface OrderDetailDrawerProps {
    orderId: string;
    onClose: () => void;
    onRefresh: () => void;
}

const OrderDetailDrawer: React.FC<OrderDetailDrawerProps> = ({ orderId, onClose, onRefresh }) => {
    const [detail, setDetail] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [recomputing, setRecomputing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadDetail();
    }, [orderId]);

    const loadDetail = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await adminApi.getMarketplaceOrder(orderId);
            if (res && res.ok) {
                setDetail(res);
            } else {
                setError("Failed to retrieve order metadata details.");
            }
        } catch (err: any) {
            console.error("Error loading order detail:", err);
            setError(err.message || "Failed to load order metadata.");
        } finally {
            setLoading(false);
        }
    };

    const handleRecompute = async () => {
        setRecomputing(true);
        try {
            const res = await adminApi.recomputeMarketplaceOrderReadiness(orderId);
            if (res && res.ok) {
                await loadDetail();
                onRefresh();
            } else {
                alert("Readiness recomputation failed.");
            }
        } catch (err: any) {
            console.error(err);
            alert(err.message || "Error during recomputations.");
        } finally {
            setRecomputing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-zinc-500 font-mono text-xs uppercase tracking-widest">
                <ArrowPathIcon className="w-10 h-10 animate-spin text-zinc-700 mb-4" />
                Querying Order Registry Artifacts...
            </div>
        );
    }

    if (error || !detail || !detail.order) {
        return (
            <div className="flex-1 p-6 text-center space-y-4 text-xs font-mono uppercase text-red-400">
                <ExclamationCircleIcon className="w-12 h-12 mx-auto text-red-500" />
                <div>{error || "Order context missing."}</div>
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
                >
                    Close Drawer
                </button>
            </div>
        );
    }

    const { order, files, preflightBindings, events, readiness } = detail;
    const customer = order.book_spec_json || {};
    const selectedOffer = order.selected_offer_json || {};
    const bookSpec = order.book_spec_json || {};

    return (
        <div className="flex flex-col h-full text-zinc-200 font-mono text-xs overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-zinc-900 bg-zinc-900/30 flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-black text-white uppercase tracking-tight">{order.order_id}</h2>
                        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            order.status === "OFFER_SELECTED" ? "bg-blue-900/40 text-blue-400" : "bg-zinc-800 text-zinc-400"
                        }`}>
                            {order.status}
                        </span>
                        <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                            readiness?.ready 
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-900" 
                                : "bg-red-950/80 text-red-400 border border-red-900"
                        }`}>
                            {readiness?.ready ? "READY" : "BLOCKED"}
                        </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                        Tenant ID: {order.tenant_id || "None"} • Customer ID: {order.customer_id || "None"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRecompute}
                        disabled={recomputing}
                        className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:text-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${recomputing ? "animate-spin" : ""}`} />
                        Recompute Readiness
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Manual Review Override Alert */}
                {order.metadata?.manualReviewOverride && (
                    <div className="p-4 bg-purple-950/40 border border-purple-900/60 text-purple-300 text-xs flex flex-col gap-1.5 rounded-sm">
                        <div className="flex items-center gap-2 font-black uppercase tracking-wider">
                            <ShieldCheckIcon className="w-4 h-4 text-purple-400" /> Manual Operator Override Active
                        </div>
                        <div className="text-[11px] text-purple-400/90 font-mono">
                            Preflight validation checklist was manually bypassed by operator: <strong>{order.metadata.manualReviewOverrideBy || "Operator"}</strong> at {order.metadata.manualReviewOverrideAt ? new Date(order.metadata.manualReviewOverrideAt).toLocaleString() : "N/A"}.
                        </div>
                    </div>
                )}

                {/* 1. Readiness Reasons Check */}
                <section className="space-y-3 bg-zinc-900/30 border border-zinc-900 p-4">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheckIcon className="w-4 h-4 text-zinc-400" /> Readiness Interceptor Telemetry
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                            <span className="text-zinc-400">Selected Offer Configured:</span>
                            <span className={`font-bold ${order.selected_offer_id ? "text-emerald-400" : "text-red-400"}`}>
                                {order.selected_offer_id ? "PASSED" : "FAILED"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                            <span className="text-zinc-400">Customer Identity Verified:</span>
                            <span className={`font-bold ${order.customer_id ? "text-emerald-400" : "text-red-400"}`}>
                                {order.customer_id ? "PASSED" : "FAILED"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                            <span className="text-zinc-400">Required Slots Created:</span>
                            <span className={`font-bold ${files && files.length > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {files && files.length > 0 ? "PASSED" : "FAILED"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                            <span className="text-zinc-400">All PDF Roles Completed:</span>
                            <span className={`font-bold ${readiness?.blockers && !readiness.blockers.includes("FILES_PENDING") ? "text-emerald-400" : "text-red-400"}`}>
                                {readiness?.blockers && !readiness.blockers.includes("FILES_PENDING") ? "PASSED" : "FAILED"}
                            </span>
                        </div>
                    </div>

                    {/* Blockers ledger */}
                    {readiness?.blockers && readiness.blockers.length > 0 && (
                        <div className="mt-3 p-3 bg-red-950/20 border border-red-900/30 space-y-1">
                            <div className="text-[10px] font-black text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                                <ExclamationCircleIcon className="w-3.5 h-3.5" /> Blockers Enforced by Engine:
                            </div>
                            <ul className="list-disc pl-4 space-y-1 text-zinc-400 text-[11px] pt-1">
                                {readiness.blockers.map((b: string, i: number) => (
                                    <li key={i} className="uppercase tracking-wide font-bold">{b.replace(/_/g, " ")}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>

                {/* 2. Order Metadata & Book Spec Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="space-y-3">
                        <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            Order Telemetry Summary
                        </h3>
                        <div className="border border-zinc-900 bg-zinc-900/10 p-4 space-y-2">
                            <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                                <span className="text-zinc-500">Order ID:</span>
                                <span className="font-bold text-white">{order.order_id}</span>
                            </div>
                            <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                                <span className="text-zinc-500">Pricing Session ID:</span>
                                <span className="font-bold text-zinc-300 truncate max-w-[180px]">{order.pricing_session_id || "None"}</span>
                            </div>
                            <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                                <span className="text-zinc-500">Tenant Namespace:</span>
                                <span className="font-bold text-zinc-300">{order.tenant_id || "Global"}</span>
                            </div>
                            <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                                <span className="text-zinc-500">Estimated Price:</span>
                                <span className="font-bold text-emerald-400">{order.estimated_price ? `${Number(order.estimated_price).toFixed(2)} ${order.currency}` : "N/A"}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Created:</span>
                                <span className="font-bold text-zinc-400">{order.created_at ? new Date(order.created_at).toLocaleString() : "—"}</span>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            Book Spec Manifest
                        </h3>
                        <div className="border border-zinc-900 bg-zinc-900/10 p-4 space-y-2">
                            {Object.keys(bookSpec).length > 0 ? (
                                Object.entries(bookSpec).map(([key, val]: any) => (
                                    <div key={key} className="flex justify-between border-b border-zinc-900 pb-1.5 last:border-0 last:pb-0">
                                        <span className="text-zinc-500 uppercase text-[9px]">{key.replace(/_/g, " ")}:</span>
                                        <span className="font-bold text-white uppercase">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-zinc-600 text-center py-4 uppercase">No Specs Seeded</div>
                            )}
                        </div>
                    </section>
                </div>

                {/* 3. File Slots Grid */}
                <section className="space-y-3">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <DocumentTextIcon className="w-4 h-4 text-zinc-400" /> Allocated File Role Slots
                    </h3>
                    <div className="border border-zinc-900 bg-zinc-950 divide-y divide-zinc-900">
                        {files && files.length > 0 ? (
                            files.map((file: any) => (
                                <div key={file.fileId || file.file_id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 last:border-b-0">
                                    <div className="space-y-1 overflow-hidden w-full">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-zinc-900 text-white border border-zinc-800 text-[9px] font-black uppercase tracking-wider">
                                                {file.role}
                                            </span>
                                            <span className="text-zinc-500 font-mono text-[9px]">ID: {file.fileId || file.file_id}</span>
                                        </div>
                                        <div className="text-xs font-black text-zinc-300 truncate max-w-[400px]">
                                            {file.originalName || file.original_name || "PENDING UPLOAD..."}
                                        </div>
                                        {(file.sizeBytes || file.size_bytes) > 0 && (
                                            <div className="text-[10px] text-zinc-500 font-mono">
                                                Size: {((file.sizeBytes || file.size_bytes) / 1024 / 1024).toFixed(2)} MB • Format: {file.mimeType || file.mime_type || "N/A"}
                                            </div>
                                        )}
                                        
                                        {/* Linked Preflight Job metadata binding details */}
                                        {(file.preflightJobId || file.preflight_job_id) && (
                                            <div className="mt-2 p-2.5 bg-zinc-900/50 border border-zinc-800/80 text-[10px] space-y-1 rounded-sm">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-zinc-400">Preflight Job: <strong className="text-zinc-300 font-mono">{file.preflightJobId || file.preflight_job_id}</strong></span>
                                                    <span className={`px-1.5 py-0.2 text-[8px] font-black uppercase tracking-widest ${
                                                        (file.preflightOutcomeCategory || file.preflight_outcome_category) === "PASS"
                                                            ? "bg-emerald-950 text-emerald-400 border border-emerald-900/40"
                                                            : "bg-red-950 text-red-400 border border-red-900/40"
                                                    }`}>
                                                        {file.preflightOutcomeCategory || file.preflight_outcome_category || "UNKNOWN"}
                                                    </span>
                                                </div>
                                                <div className="text-zinc-500 font-mono">
                                                    Status: <strong className="text-zinc-300">{file.preflightStatus || file.preflight_status}</strong> • Issues: <strong className="text-zinc-300">{file.findingsCount || file.findings_count || 0}</strong>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                            file.status === "UPLOADED" 
                                                ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/60" 
                                                : "bg-red-950/40 text-red-400 border border-red-900/60"
                                        }`}>
                                            {file.status}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-zinc-600 uppercase">No File Slots Assigned</div>
                        )}
                    </div>
                </section>

                {/* 4. Preflight Bindings */}
                <section className="space-y-3">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <ShieldCheckIcon className="w-4 h-4 text-zinc-400" /> Active Preflight Registry Bindings
                    </h3>
                    <div className="border border-zinc-900 bg-zinc-950 divide-y divide-zinc-900">
                        {preflightBindings && preflightBindings.length > 0 ? (
                            preflightBindings.map((bind: any, idx: number) => (
                                <div key={idx} className="p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-zinc-900 text-zinc-300 text-[9px] font-black uppercase">
                                                Role: {bind.role}
                                            </span>
                                            <span className="text-[9px] text-zinc-500 font-mono">Job: {bind.preflightJobId || bind.preflight_job_id}</span>
                                        </div>
                                        <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                                            (bind.outcomeCategory || bind.outcome_category) === "PASS" 
                                                ? "bg-emerald-950 text-emerald-400 border border-emerald-900/40" 
                                                : "bg-red-950 text-red-400 border border-red-900/40"
                                        }`}>
                                            {bind.outcomeCategory || bind.outcome_category || "UNKNOWN"}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-[10px] text-zinc-400 pt-1 font-mono">
                                        <div>Findings Count: <strong className="text-white">{bind.findingsCount || bind.findings_count || 0} Issues</strong></div>
                                        <div>Binding Status: <strong className="text-white">{bind.status}</strong></div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-zinc-600 uppercase">No Preflight Bindings Linked</div>
                        )}
                    </div>
                </section>

                {/* 5. Selected Offer JSON Summary */}
                <section className="space-y-3">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <CommandLineIcon className="w-4 h-4 text-zinc-400" /> Selected Offer Data Overlay
                    </h3>
                    <div className="border border-zinc-900 bg-zinc-900/10 p-4">
                        {Object.keys(selectedOffer).length > 0 ? (
                            <pre className="text-[11px] font-mono text-zinc-400 overflow-x-auto p-2 bg-zinc-950 border border-zinc-900 leading-relaxed scrollbar-hide max-h-48 overflow-y-auto">
                                {JSON.stringify(selectedOffer, null, 2)}
                            </pre>
                        ) : (
                            <div className="text-zinc-650 text-center py-2 uppercase">No Offer Payload Attached</div>
                        )}
                    </div>
                </section>

                {/* 6. Immutable Ledger Events Timeline */}
                <section className="space-y-3">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <BoltIcon className="w-4 h-4 text-zinc-400" /> Audited Lifecycle Events Ledger
                    </h3>
                    <div className="relative pl-6 space-y-6 before:absolute before:inset-y-1 before:left-[11px] before:w-0.5 before:bg-zinc-900">
                        {events && events.length > 0 ? (
                            events.map((ev: any) => (
                                <div key={ev.event_id} className="relative group">
                                    {/* timeline marker */}
                                    <div className="absolute -left-[20px] top-1.5 w-3 h-3 bg-zinc-950 border-2 border-zinc-800 flex items-center justify-center">
                                        <div className="w-1 h-1 bg-zinc-600" />
                                    </div>
                                    <div className="bg-zinc-950 border border-zinc-900 p-3 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-white uppercase text-[10px] tracking-wide">
                                                {ev.type.replace(/_/g, " ")}
                                            </span>
                                            <span className="text-[9px] text-zinc-500">
                                                {ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : ""}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-zinc-450">
                                            Actor: <strong className="text-zinc-300">{ev.actor_type}</strong> ({ev.actor_id || "System"})
                                        </div>
                                        {ev.payload_json && (
                                            <pre className="text-[9px] font-mono text-zinc-500 bg-zinc-900/50 p-1.5 border border-zinc-900 overflow-x-auto truncate max-w-full">
                                                {typeof ev.payload_json === "object" ? JSON.stringify(ev.payload_json) : String(ev.payload_json)}
                                            </pre>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-4 text-center text-zinc-600 uppercase pl-0">No Events Logged in Ledger</div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};
