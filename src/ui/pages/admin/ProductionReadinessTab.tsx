// src/ui/pages/admin/ProductionReadinessTab.tsx
import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    ClipboardDocumentCheckIcon,
    ExclamationCircleIcon,
    ShieldCheckIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon,
    CreditCardIcon,
    ArrowPathIcon
} from "@heroicons/react/24/outline";

// --- Defensive Helpers ---

const getBlockers = (order: any): string[] => Array.isArray(order?.blockers) ? order.blockers : [];

const getPreflightStatus = (order: any): string =>
    order?.preflight?.status || order?.lifecycleData?.preflight || "NOT_STARTED";

const getPaymentStatus = (order: any): string =>
    order?.payment?.status || order?.lifecycleData?.payment || "NOT_STARTED";

const getTotalLabel = (order: any): string => {
    const total = Number(order?.totals?.total || order?.offer?.totalPrice || 0);
    const currency = order?.totals?.currency || order?.offer?.currency || "EUR";
    return `${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

const getCustomerLabel = (order: any): string =>
    order?.customer?.name || order?.customer?.email || "Anonymous";

const getPrinterLabel = (order: any): string =>
    order?.offer?.printerName || order?.printhouse?.assignedPrinthouseId || "Unassigned";

const getSpecSummary = (order: any): string => {
    const specs = order?.specs || {};
    const format = specs.format || specs.book_size || specs.trim_size || "—";
    const copies = specs.copies || specs.quantity || "—";
    const pages = specs.interior_pages || specs.total_pages || specs.page_count || "—";
    const binding = specs.binding_method || specs.binding || "—";
    return `${format} · ${copies} copies · ${pages} pages · ${String(binding).toUpperCase()}`;
};

const isReadyForHandoff = (order: any): boolean => {
    return order?.readiness === "READY" ||
        order?.status === "READY_FOR_HANDOFF" ||
        order?.lifecycleData?.handoff === "READY";
};

export const ProductionReadinessTab: React.FC = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await adminApi.listMarketplaceOrders({});
            setOrders(res.orders || []);
        } catch (err) {
            console.error('Failed to fetch orders for readiness:', err);
        } finally {
            setLoading(false);
        }
    };

    const grouped = {
        missingFiles: orders.filter(o => getBlockers(o).includes('MISSING_FILES')),
        preflightNotReady: orders.filter(o => 
            (["NOT_CONFIGURED", "DISABLED", "NOT_STARTED", "PENDING"].includes(getPreflightStatus(o)) || getBlockers(o).includes('PREFLIGHT_PENDING')) &&
            !getBlockers(o).includes('MISSING_FILES')
        ),
        preflightRequired: orders.filter(o => 
            getPreflightStatus(o) === 'REQUIRED' || getBlockers(o).includes('PREFLIGHT_REQUIRED')
        ),
        paymentPending: orders.filter(o => 
            (["NOT_STARTED", "PENDING", "READY_MANUAL"].includes(getPaymentStatus(o)) || getBlockers(o).includes('PAYMENT_PENDING'))
        ),
        paymentBlocked: orders.filter(o => 
            getPaymentStatus(o) === 'BLOCKED' || getBlockers(o).includes('PAYMENT_BLOCKED')
        ),
        readyForHandoff: orders.filter(o => isReadyForHandoff(o) && getBlockers(o).length === 0),
    };

    const sections = [
        { id: 'missingFiles', label: 'Missing Files', icon: DocumentTextIcon, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/5', orders: grouped.missingFiles },
        { id: 'preflightNotReady', label: 'Preflight Not Ready', icon: ExclamationCircleIcon, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/5', orders: grouped.preflightNotReady },
        { id: 'preflightRequired', label: 'Preflight Required', icon: ExclamationTriangleIcon, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/5', orders: grouped.preflightRequired },
        { id: 'paymentPending', label: 'Payment Pending', icon: CreditCardIcon, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/5', orders: grouped.paymentPending },
        { id: 'paymentBlocked', label: 'Payment Blocked', icon: CreditCardIcon, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-600/10', orders: grouped.paymentBlocked },
        { id: 'readyForHandoff', label: 'Ready for Handoff', icon: ShieldCheckIcon, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/5', orders: grouped.readyForHandoff },
    ];

    if (loading) {
        return (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
                <ArrowPathIcon className="w-8 h-8 text-primary animate-spin" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading readiness...</p>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div className="p-16 text-center border-2 border-dashed border-slate-100 dark:border-white/5 space-y-3">
                <ClipboardDocumentCheckIcon className="w-12 h-12 text-slate-200 dark:text-white/10 mx-auto" />
                <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No marketplace orders found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-slide-fade">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 uppercase">
                        <ClipboardDocumentCheckIcon className="w-5 h-5 text-primary" />
                        Production Readiness Aggregator
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Cross-session blocker analysis and handoff prioritization.</p>
                </div>
                <button
                    type="button"
                    onClick={fetchOrders}
                    className="p-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10"
                >
                    <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {sections.map((section) => (
                    <div key={section.id} className="bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-none overflow-hidden">
                        <div className={`p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between ${section.bg}`}>
                            <div className="flex items-center gap-3">
                                <section.icon className={`w-5 h-5 ${section.color}`} />
                                <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">{section.label}</span>
                            </div>
                            <span className="bg-white dark:bg-black/20 px-2 py-1 text-[10px] font-black text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10">
                                {section.orders.length} Orders
                            </span>
                        </div>
                        <div className="divide-y divide-slate-50 dark:divide-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {section.orders.length === 0 ? (
                                <div className="p-8 text-center text-slate-300 dark:text-white/10 text-[10px] font-bold uppercase tracking-[0.2em]">Zero orders in this state</div>
                            ) : section.orders.map((order: any) => (
                                <div key={order.orderIntentId} className="p-4 flex flex-col justify-between hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group gap-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="text-xs font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors">{order.publicRef}</div>
                                            <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{getCustomerLabel(order)} • {getPrinterLabel(order)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black text-slate-900 dark:text-white">{getTotalLabel(order)}</div>
                                            <div className="text-[9px] text-slate-400 font-medium uppercase mt-0.5">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '—'}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="text-[9px] text-slate-500 font-medium uppercase tracking-tight">
                                        {getSpecSummary(order)}
                                    </div>

                                    {getBlockers(order).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {getBlockers(order).map((b: string) => (
                                                <span key={b} className="bg-red-50 dark:bg-red-500/5 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest">
                                                    {b.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
