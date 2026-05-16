// src/ui/pages/admin/OrderIntakeTab.tsx
import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    InboxStackIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    ShieldCheckIcon,
    ExclamationCircleIcon,
    DocumentTextIcon,
    UserIcon,
    XMarkIcon,
    ExclamationTriangleIcon,
    BoltIcon,
    CreditCardIcon,
    BuildingStorefrontIcon
} from "@heroicons/react/24/outline";
import { safeTime, safeDate } from "../../lib/formatters";

// --- Defensive Helpers ---

const getSpecSummary = (order: any) => {
    if (!order?.specs) return "—";
    const s = order.specs;
    const format = s.format || s.book_size || s.trim_size || "—";
    const copies = s.copies || s.quantity || "—";
    const pages = s.interior_pages || s.total_pages || s.page_count || "—";
    const binding = (s.binding_method || s.binding || "—").toUpperCase();
    return `${format} / ${copies} copies / ${pages} pages / ${binding}`;
};

const getFileState = (order: any) => {
    const files = order?.productionFiles || [];
    if (files.length === 0) return { label: "Missing", color: "bg-red-100 text-red-700" };

    const hasInterior = files.some((f: any) => f.kind?.includes("INTERIOR"));
    const hasCover = files.some((f: any) => f.kind?.includes("COVER"));

    if (hasInterior && hasCover) return { label: "Interior + Cover", color: "bg-emerald-100 text-emerald-700" };
    if (hasInterior) return { label: "Interior Only", color: "bg-amber-100 text-amber-700" };
    if (hasCover) return { label: "Cover Only", color: "bg-amber-100 text-amber-700" };

    return { label: `${files.length} Files`, color: "bg-blue-100 text-blue-700" };
};

const getTotalLabel = (order: any) => {
    const total = Number(order?.totals?.total || order?.offer?.totalPrice || 0);
    const currency = order?.totals?.currency || order?.offer?.currency || "EUR";
    return `${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

const getPrinterName = (order: any) => {
    return order?.offer?.printerName || order?.printhouse?.assignedPrinthouseId || "Unassigned";
};

const isOrderAcknowledged = (order: any) => {
    return order?.controlPlane?.acknowledged === true || order?.status === "ACKNOWLEDGED";
};

const getDisplayFiles = (order: any) => {
    const metadata = order?.productionFileMetadata || [];
    if (metadata.length > 0) {
        return metadata.map((m: any) => ({
            filename: m.filename,
            sizeBytes: m.sizeBytes,
            status: m.status,
            createdAt: m.createdAt,
            checksum: m.checksum,
            kind: m.kind
        }));
    }
    const legacy = order?.productionFiles || [];
    return legacy.map((l: any) => ({
        filename: l.filename,
        sizeBytes: 0,
        status: l.status || "UPLOADED",
        createdAt: order.createdAt,
        checksum: null,
        kind: l.kind
    }));
};

const isNewOrder = (order: any) => {
    // A "New Order" is anything not yet acknowledged by ops
    return !isOrderAcknowledged(order);
};

const getStatusStyle = (status: string, order?: any) => {
    if (order?.controlPlane?.acknowledged) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    switch (status) {
        case 'ACKNOWLEDGED': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        case 'FILES_UPLOADED': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
        case 'SIGNED': return 'bg-blue-50 text-blue-700 border-blue-100';
        case 'READY': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
        case 'BLOCKED': return 'bg-red-50 text-red-700 border-red-100';
        default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
};

export const OrderIntakeTab: React.FC = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [counts, setCounts] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await adminApi.listMarketplaceOrders({ search });
            setOrders(res.orders || []);
            setCounts(res.counts || {});
        } catch (err) {
            console.error('Failed to fetch marketplace orders:', err);
        } finally {
            setLoading(false);
        }
    };

    const kpis = [
        { label: 'New Orders', value: orders.filter(o => isNewOrder(o)).length, icon: InboxStackIcon, color: 'text-blue-600' },
        { label: 'Files Uploaded', value: counts.filesUploaded || 0, icon: DocumentTextIcon, color: 'text-indigo-600' },
        { label: 'Preflight Required', value: orders.filter(o => o.preflight?.status === 'REQUIRED').length, icon: ExclamationTriangleIcon, color: 'text-amber-600' },
        { label: 'Payment Blocked', value: orders.filter(o => o.payment?.status === 'BLOCKED').length, icon: CreditCardIcon, color: 'text-red-600' },
        { label: 'Ready for Handoff', value: orders.filter(o => o.readiness === 'READY').length, icon: ShieldCheckIcon, color: 'text-emerald-600' },
        { label: 'Blocked Orders', value: orders.filter(o => o.readiness === 'BLOCKED').length, icon: ExclamationCircleIcon, color: 'text-red-500' },
    ];

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {kpis.map((kpi, i) => (
                    <div key={i} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-none shadow-none">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">{kpi.label}</span>
                            <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                        </div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">{kpi.value}</div>
                    </div>
                ))}
            </div>

            {/* Filter / Search Bar */}
            <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="relative flex-1 max-w-md group">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Filter by Order Ref, Email or ID..."
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#0e0e0f] border border-slate-200 dark:border-white/10 rounded-none text-xs font-bold uppercase tracking-widest focus:border-primary outline-none dark:text-white"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
                    />
                </div>
                <button onClick={fetchOrders} className="p-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors shadow-none">
                    <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Orders Table */}
            <div className="bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-none overflow-hidden shadow-none overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                    <thead>
                        <tr className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            <th className="px-4 py-4">Public Ref</th>
                            <th className="px-4 py-4">Created</th>
                            <th className="px-4 py-4">Customer / Session</th>
                            <th className="px-4 py-4">Specs</th>
                            <th className="px-4 py-4">Printer / Printhouse</th>
                            <th className="px-4 py-4">Files</th>
                            <th className="px-4 py-4">Preflight</th>
                            <th className="px-4 py-4">Payment</th>
                            <th className="px-4 py-4">Total</th>
                            <th className="px-4 py-4">Operational Status</th>
                            <th className="px-4 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={11} className="px-4 py-8 bg-slate-50/20 dark:bg-white/5"></td>
                                </tr>
                            ))
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={11} className="px-4 py-20 text-center">
                                    <InboxStackIcon className="w-12 h-12 text-slate-200 dark:text-white/10 mx-auto mb-3" />
                                    <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No marketplace orders found</p>
                                </td>
                            </tr>
                        ) : orders.map((order) => {
                            const fileState = getFileState(order);
                            return (
                                <tr key={order.orderIntentId} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group text-xs">
                                    <td className="px-4 py-5 font-black text-slate-900 dark:text-white tracking-tight">
                                        {order.publicRef}
                                    </td>
                                    <td className="px-4 py-5 whitespace-nowrap text-slate-500 dark:text-slate-400 font-medium">
                                        {safeDate(order.createdAt)}
                                    </td>
                                    <td className="px-4 py-5">
                                        <div className="font-bold text-slate-900 dark:text-white">{order.customer?.name || 'Anonymous'}</div>
                                        <div className="text-[10px] text-slate-400 font-medium lowercase truncate max-w-[150px]">{order.customer?.email || 'N/A'}</div>
                                    </td>
                                    <td className="px-4 py-5 font-medium text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                                        {getSpecSummary(order)}
                                    </td>
                                    <td className="px-4 py-5">
                                        <div className="font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight">{getPrinterName(order)}</div>
                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">PH-ID: {order.offer?.printerId || 'N/A'}</div>
                                    </td>
                                    <td className="px-4 py-5">
                                        <span className={`px-2 py-0.5 font-black text-[9px] uppercase tracking-widest ${fileState.color}`}>
                                            {fileState.label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-5">
                                        <span className={`px-2 py-0.5 font-black text-[9px] uppercase tracking-widest ${order.preflight?.status === 'PASSED' ? 'bg-emerald-100 text-emerald-700' :
                                                order.preflight?.status === 'REQUIRED' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-slate-100 text-slate-400'
                                            }`}>
                                            {order.preflight?.status?.replace(/_/g, ' ') || 'NOT STARTED'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-5">
                                        <span className={`px-2 py-0.5 font-black text-[9px] uppercase tracking-widest ${order.payment?.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                                                order.payment?.status === 'BLOCKED' ? 'bg-red-100 text-red-700' :
                                                    'bg-slate-100 text-slate-400'
                                            }`}>
                                            {order.payment?.status?.replace(/_/g, ' ') || 'NOT STARTED'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-5 font-black text-slate-900 dark:text-white">
                                        {getTotalLabel(order)}
                                    </td>
                                    <td className="px-4 py-5 space-y-1">
                                        <div className={`px-2 py-0.5 rounded-none text-[9px] font-black uppercase tracking-wider border inline-block ${getStatusStyle(order.status, order)}`}>
                                            {order.status}
                                        </div>
                                        <div className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter block">
                                            Stage: {order.lifecycle || 'UNKNOWN'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-5 text-right">
                                        <button
                                            onClick={() => setSelectedOrderId(order.orderIntentId)}
                                            className="px-3 py-1.5 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-primary transition-all shadow-sm"
                                        >
                                            View Order
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Detail Drawer */}
            {selectedOrderId && (
                <div className="fixed inset-0 z-[60] overflow-hidden flex justify-end">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedOrderId(null)} />
                    <div className="relative w-full max-w-3xl bg-white dark:bg-[#0e0e0f] shadow-2xl h-full flex flex-col animate-slide-in-right">
                        <OrderDetailDrawer id={selectedOrderId} onClose={() => setSelectedOrderId(null)} onRefresh={fetchOrders} />
                    </div>
                </div>
            )}
        </div>
    );
};

const OrderDetailDrawer: React.FC<{ id: string, onClose: () => void, onRefresh: () => void }> = ({ id, onClose, onRefresh }) => {
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState("");
    const [printhouseId, setPrinthouseId] = useState("");
    const [actionType, setActionType] = useState("FILE_REUPLOAD");
    const [actionMessage, setActionMessage] = useState("");

    useEffect(() => {
        fetchDetail();
    }, [id]);

    const fetchDetail = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getMarketplaceOrderDetail(id);
            if (res.ok) {
                setOrder(res.order);
                setPrinthouseId(res.order.printhouse?.assignedPrinthouseId || "");
            }
        } catch (err) {
            console.error('Failed to fetch order detail:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAcknowledge = async () => {
        if (!confirm('Acknowledge this order for production?')) return;
        try {
            const res = await adminApi.acknowledgeMarketplaceOrder(id);
            if (res.ok) { fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handleAssign = async () => {
        if (!printhouseId) return;
        try {
            const res = await adminApi.assignPrinthouseToMarketplaceOrder(id, printhouseId);
            if (res.ok) { fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handleRunPreflight = async () => {
        try {
            const res = await adminApi.runMarketplaceOrderPreflight(id);
            if (res.ok) { fetchDetail(); onRefresh(); }
            else { alert((res as any).error || 'Failed to run preflight'); }
        } catch (err: any) { console.error(err); alert(err.message || 'Error running preflight'); }
    };

    const handleMarkPreflightRequired = async () => {
        try {
            const res = await adminApi.markMarketplaceOrderPreflightRequired(id);
            if (res.ok) { fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handleMarkPreflightPassed = async () => {
        const issues = prompt("Enter any comments/issues for passing (optional):");
        if (issues === null) return;
        try {
            const res = await adminApi.markMarketplaceOrderPreflightPassed(id, {
                result: 'MANUAL_PASS',
                issues: issues ? [issues] : [],
                riskLevel: 'LOW'
            });
            if (res.ok) { fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handleMarkPreflightFailed = async () => {
        const issue = prompt("Enter failure reasons (optional):", "Manual preflight check failed by operator");
        if (issue === null) return;
        try {
            const res = await adminApi.markMarketplaceOrderPreflightFailed(id, {
                result: 'WARNINGS_FOUND',
                issues: [issue],
                riskLevel: 'HIGH'
            });
            if (res.ok) { fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handleMarkPaymentReady = async () => {
        if (!confirm('Mark this payment as verified and manually approved?')) return;
        try {
            const res = await adminApi.markMarketplaceOrderPaymentReady(id);
            if (res.ok) { fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handleMarkPaymentBlocked = async () => {
        const reason = prompt("Enter payment blocking reason:", "Payment verification pending");
        if (reason === null) return;
        try {
            const res = await adminApi.markMarketplaceOrderPaymentBlocked(id, reason);
            if (res.ok) { fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handlePrepareHandoff = async () => {
        try {
            const res = await adminApi.prepareMarketplaceOrderHandoff(id);
            if (res.ok) { fetchDetail(); onRefresh(); alert('Handoff package compiled successfully!'); }
        } catch (err) { console.error(err); }
    };

    const handleMarkHandoffReady = async () => {
        if (!confirm('Mark order as fully ready for printhouse handoff?')) return;
        try {
            const res = await adminApi.markMarketplaceOrderHandoffReady(id);
            if (res.ok) { fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handleRequestAction = async () => {
        if (!actionMessage.trim()) return;
        try {
            const res = await adminApi.requestMarketplaceOrderCustomerAction(id, actionType, actionMessage);
            if (res.ok) { setActionMessage(""); fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    const handleAddNote = async () => {
        if (!note.trim()) return;
        try {
            const res = await adminApi.addNoteToMarketplaceOrder(id, note);
            if (res.ok) { setNote(""); fetchDetail(); onRefresh(); }
        } catch (err) { console.error(err); }
    };

    if (loading) return (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <ArrowPathIcon className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Retrieving Order Forensics...</p>
        </div>
    );

    if (!order) return <div className="p-10 text-center">Order not found.</div>;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
                <div>
                    <div className="flex items-center gap-3">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{order.publicRef}</h3>
                        <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border ${getStatusStyle(order.status, order)}`}>
                            {order.status}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border ${order.readiness === 'READY' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                            {order.readiness}
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Order Identity: {id}</p>
                </div>
                <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
                {/* Readiness Blockers */}
                {order.blockers?.length > 0 && (
                    <section className="bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                            <ExclamationCircleIcon className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Production Blockers Detected</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {order.blockers.map((b: string) => (
                                <span key={b} className="bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border border-red-200 dark:border-red-500/30">
                                    {b.replace(/_/g, ' ')}
                                </span>
                            ))}
                        </div>
                    </section>
                )}

                {/* Identity & Session */}
                <section className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <UserIcon className="w-3.5 h-3.5" /> Customer / Session Context
                    </h4>
                    <div className="grid grid-cols-2 gap-6 bg-slate-50 dark:bg-white/5 p-5 border border-slate-200 dark:border-white/10">
                        <div className="space-y-1">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Customer Name</div>
                            <div className="text-sm font-black text-slate-900 dark:text-white">{order.customer?.name || 'Anonymous'}</div>
                            <div className="text-xs font-medium text-slate-500">{order.customer?.email || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Session Timing</div>
                            <div className="text-sm font-black text-slate-900 dark:text-white">{safeDate(order.createdAt)}</div>
                            <div className="text-xs font-medium text-slate-500">{safeTime(order.createdAt)}</div>
                        </div>
                    </div>
                </section>

                {/* Specs & Totals */}
                <div className="grid grid-cols-2 gap-8">
                    <section className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Book Specifications</h4>
                        <div className="space-y-3">
                            {Object.entries(order.specs || {}).map(([k, v]) => (
                                <div key={k} className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{k.replace(/_/g, ' ')}</span>
                                    <span className="text-xs font-black text-slate-900 dark:text-white">{String(v)}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Quotation Totals</h4>
                        <div className="bg-slate-900 text-white p-5 space-y-4 shadow-lg">
                            <div className="flex justify-between items-end border-b border-white/10 pb-3">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Final Amount</div>
                                <div className="text-2xl font-black">{getTotalLabel(order)}</div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span className="text-slate-400 uppercase">Subtotal</span>
                                    <span>{order.totals?.subtotal || 0}</span>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span className="text-slate-400 uppercase">Tax</span>
                                    <span>{order.totals?.tax || 0}</span>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span className="text-slate-400 uppercase">Shipping</span>
                                    <span>{order.totals?.shipping || 0}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Offer & Printer */}
                <section className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <BuildingStorefrontIcon className="w-3.5 h-3.5" /> Selected Marketplace Offer
                    </h4>
                    <div className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20 p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-600 flex items-center justify-center text-white font-black text-xl uppercase">
                                {String(getPrinterName(order) || "P").charAt(0)}
                            </div>
                            <div>
                                <div className="text-sm font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-tight">{getPrinterName(order)}</div>
                                <div className="text-[10px] text-emerald-600/60 font-bold uppercase tracking-widest">PH-ID: {order.offer?.printerId || 'N/A'}</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Lead Time</div>
                            <div className="text-sm font-black text-emerald-900 dark:text-emerald-400">{order.offer?.leadTimeDays || 0} Work Days</div>
                        </div>
                    </div>
                </section>

                {/* Production File Assets */}
                <section className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <DocumentTextIcon className="w-3.5 h-3.5" /> Production File Assets
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                        {getDisplayFiles(order).length > 0 ? (
                            getDisplayFiles(order).map((file: any, i: number) => (
                                <div key={i} className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3 flex items-center justify-between group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="p-2 bg-white dark:bg-white/10 text-slate-400">
                                            <DocumentTextIcon className="w-4 h-4" />
                                        </div>
                                        <div className="truncate">
                                            <div className="text-[10px] font-black text-slate-900 dark:text-white uppercase truncate">{file.filename}</div>
                                            <div className="flex items-center gap-2 text-[8px] text-slate-400 font-bold uppercase tracking-tight">
                                                <span>{file.kind}</span>
                                                {file.sizeBytes > 0 && <span>• {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>}
                                                {file.checksum && <span className="truncate max-w-[100px]"> • {file.checksum}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase tracking-widest">
                                            {file.status}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="bg-red-50 border border-red-100 p-8 text-center space-y-2">
                                <ExclamationTriangleIcon className="w-6 h-6 mx-auto text-red-400" />
                                <div className="text-[10px] font-black text-red-700 uppercase tracking-widest">No production files found</div>
                                <div className="text-[8px] text-red-400 font-bold uppercase tracking-tight">Customer has not uploaded interior/cover yet</div>
                            </div>
                        )}
                    </div>
                </section>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Preflight Readiness</h4>
                        <div className={`p-4 border text-center space-y-2 ${order.preflight?.status === 'PASSED' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                            <ShieldCheckIcon className="w-6 h-6 mx-auto opacity-50" />
                            <div className="text-[10px] font-black uppercase tracking-widest">{order.preflight?.status || 'NOT STARTED'}</div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Payment Readiness</h4>
                        <div className={`p-4 border text-center space-y-2 ${order.payment?.status === 'PAID' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                            <CreditCardIcon className="w-6 h-6 mx-auto opacity-50" />
                            <div className="text-[10px] font-black uppercase tracking-widest">{order.payment?.status || 'NOT STARTED'}</div>
                        </div>
                    </div>
                </div>

                {/* Actions & Notes */}
                <section className="pt-8 border-t border-slate-100 dark:border-white/10 grid grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational Actions</h4>
                        <div className="space-y-3">
                            {!isOrderAcknowledged(order) && (
                                <button onClick={handleAcknowledge} className="w-full py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all">Acknowledge Order</button>
                            )}

                            {/* Preflight Management Block */}
                            <div className="border border-slate-200 dark:border-white/10 p-3 space-y-3 bg-slate-50/50 dark:bg-white/5">
                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">1. Preflight Gates</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={handleRunPreflight}
                                        className="py-2 bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Run Preflight
                                    </button>
                                    <button 
                                        onClick={handleMarkPreflightRequired} 
                                        className="py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/10 transition-all"
                                    >
                                        Require Preflight
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={handleMarkPreflightPassed}
                                        className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Force Pass
                                    </button>
                                    <button 
                                        onClick={handleMarkPreflightFailed}
                                        className="py-2 bg-red-600 hover:bg-red-700 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Force Fail
                                    </button>
                                </div>
                            </div>

                            {/* Payment Management Block */}
                            <div className="border border-slate-200 dark:border-white/10 p-3 space-y-3 bg-slate-50/50 dark:bg-white/5">
                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">2. Payment Gates</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={handleMarkPaymentReady}
                                        className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Verify & Approve
                                    </button>
                                    <button 
                                        onClick={handleMarkPaymentBlocked}
                                        className="py-2 bg-red-600 hover:bg-red-700 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Block Payment
                                    </button>
                                </div>
                            </div>

                            {/* Printhouse & Handoff Management Block */}
                            <div className="border border-slate-200 dark:border-white/10 p-3 space-y-3 bg-slate-50/50 dark:bg-white/5">
                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">3. Printhouse Handoff</div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 text-[10px] font-bold uppercase outline-none focus:border-primary"
                                        placeholder="PH-ID-2026..."
                                        value={printhouseId}
                                        onChange={(e) => setPrinthouseId(e.target.value)}
                                    />
                                    <button onClick={handleAssign} className="px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">Assign PH</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={handlePrepareHandoff}
                                        className="py-2 bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Prepare Package
                                    </button>
                                    <button 
                                        onClick={handleMarkHandoffReady}
                                        className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Mark Ready
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-white/5">
                                <select
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-2 text-[10px] font-bold uppercase outline-none"
                                    value={actionType}
                                    onChange={(e) => setActionType(e.target.value)}
                                >
                                    <option value="FILE_REUPLOAD">Request File Re-upload</option>
                                    <option value="PAYMENT_VERIFICATION">Request Payment Proof</option>
                                    <option value="SPEC_CLARIFICATION">Request Spec Clarity</option>
                                </select>
                                <textarea
                                    className="w-full p-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-medium outline-none focus:border-primary h-20"
                                    placeholder="Message to customer..."
                                    value={actionMessage}
                                    onChange={(e) => setActionMessage(e.target.value)}
                                />
                                <button onClick={handleRequestAction} className="w-full py-3 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all">Request Customer Action</button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Internal Ledger Notes</h4>
                        <div className="space-y-4">
                            <div className="max-h-60 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                {order.controlPlane?.notes?.length === 0 ? (
                                    <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest text-center py-8 border-2 border-dashed border-slate-100">No notes found</div>
                                ) : order.controlPlane?.notes?.map((n: any, i: number) => (
                                    <div key={i} className="bg-slate-50 dark:bg-white/5 p-3 border-l-2 border-primary">
                                        <div className="text-[10px] font-black text-slate-900 dark:text-white mb-1">{n.text}</div>
                                        <div className="flex justify-between text-[8px] text-slate-400 font-bold uppercase tracking-tighter">
                                            <span>{n.authorId}</span>
                                            <span>{safeDate(n.createdAt)} {safeTime(n.createdAt)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="pt-2">
                                <textarea
                                    className="w-full p-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-medium outline-none focus:border-primary h-24 shadow-inner"
                                    placeholder="Add internal operational note..."
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                                <button onClick={handleAddNote} className="w-full py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all mt-2 shadow-xl active:scale-95">Add Internal Note</button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Audit Timeline */}
                <section className="space-y-4 pt-10 border-t border-slate-100 dark:border-white/10">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <BoltIcon className="w-3.5 h-3.5" /> Immutable Audit Timeline
                    </h4>
                    <div className="space-y-6 relative before:absolute before:inset-0 before:left-2 before:w-0.5 before:bg-slate-100 dark:before:bg-white/5">
                        {(!order.audit || order.audit.length === 0) ? (
                            <p className="pl-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest">No audit events found yet.</p>
                        ) : order.audit.map((ev: any, i: number) => (
                            <div key={ev.id || i} className="relative pl-8">
                                <div className="absolute left-0 top-1 w-4 h-4 bg-white dark:bg-[#0e0e0f] border-2 border-slate-200 dark:border-white/10 flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 bg-slate-400" />
                                </div>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">{ev.eventType.replace(/_/g, ' ')}</div>
                                        <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{ev.actorId}</div>
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-medium">{safeDate(ev.createdAt)} {safeTime(ev.createdAt)}</div>
                                </div>
                                {ev.payload?.message && <p className="mt-2 text-[10px] text-slate-600 dark:text-slate-400 font-medium bg-slate-50 dark:bg-white/5 p-2 border border-slate-100 dark:border-white/10">{ev.payload.message}</p>}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};


