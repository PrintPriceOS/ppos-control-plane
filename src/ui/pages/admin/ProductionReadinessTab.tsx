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
    ArrowPathIcon,
    ChevronRightIcon
} from "@heroicons/react/24/outline";

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
        missingFiles: orders.filter(o => o.blockers.includes('MISSING_FILES')),
        preflightNotConfigured: orders.filter(o => o.preflight.status === 'NOT_STARTED' && !o.blockers.includes('MISSING_FILES')),
        preflightRequired: orders.filter(o => o.preflight.status === 'REQUIRED'),
        paymentBlocked: orders.filter(o => o.payment.status === 'BLOCKED'),
        readyForHandoff: orders.filter(o => o.readiness === 'READY' && o.status === 'ACKNOWLEDGED'),
    };

    const sections = [
        { id: 'missingFiles', label: 'Missing Files', icon: DocumentTextIcon, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/5', orders: grouped.missingFiles },
        { id: 'preflightNotConfigured', label: 'Preflight Not Configured', icon: ExclamationCircleIcon, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/5', orders: grouped.preflightNotConfigured },
        { id: 'preflightRequired', label: 'Preflight Required', icon: ExclamationTriangleIcon, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/5', orders: grouped.preflightRequired },
        { id: 'paymentBlocked', label: 'Payment Blocked', icon: CreditCardIcon, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-600/10', orders: grouped.paymentBlocked },
        { id: 'readyForHandoff', label: 'Ready for Handoff', icon: ShieldCheckIcon, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/5', orders: grouped.readyForHandoff },
    ];

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
                <button onClick={fetchOrders} className="p-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10">
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
                                <div key={order.orderIntentId} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                                    <div>
                                        <div className="text-xs font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors">{order.publicRef}</div>
                                        <div className="text-[9px] text-slate-400 font-bold uppercase mt-1">{order.customer.name} • {order.offer.printerName}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-black text-slate-900 dark:text-white">{order.totals.total} {order.totals.currency}</div>
                                        <div className="text-[9px] text-slate-400 font-medium uppercase mt-1">{new Date(order.createdAt).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
