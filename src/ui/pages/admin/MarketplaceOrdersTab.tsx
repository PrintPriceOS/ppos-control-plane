import React, { useState, useEffect } from "react";
import * as adminApi from "../../lib/adminApi";
import {
    InboxStackIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    ShieldCheckIcon,
    ExclamationCircleIcon,
    CheckCircleIcon,
    DocumentTextIcon,
    UserIcon,
    TruckIcon,
    ChatBubbleLeftRightIcon,
    EyeIcon,
    EllipsisVerticalIcon
} from "@heroicons/react/24/outline";
import { short, safeText, safeTime, safeDate } from "../../lib/formatters";

export const MarketplaceOrdersTab: React.FC = () => {
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

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'ACKNOWLEDGED': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'DECLARED': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'ERROR': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <InboxStackIcon className="w-6 h-6 text-indigo-600" />
                        Marketplace Order Intake
                    </h2>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Process public marketplace intents into operational production jobs.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Search orders..." 
                            className="pl-9 pr-4 py-2 border border-slate-200 rounded-none text-xs font-bold uppercase tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none w-64"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchOrders()}
                        />
                    </div>
                    <button onClick={fetchOrders} className="p-2 bg-white border border-slate-200 rounded-none hover:bg-slate-50 transition-colors shadow-none">
                        <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Intake', value: counts.total || 0, icon: InboxStackIcon, color: 'text-indigo-600' },
                    { label: 'Files Uploaded', value: counts.filesUploaded || 0, icon: DocumentTextIcon, color: 'text-blue-600' },
                    { label: 'Preflight Pending', value: counts.preflightPending || 0, icon: ExclamationCircleIcon, color: 'text-amber-600' },
                    { label: 'Payment Pending', value: counts.paymentPending || 0, icon: ShieldCheckIcon, color: 'text-emerald-600' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white border border-slate-200 p-4 rounded-none">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
                            <stat.icon className={`w-4 h-4 ${stat.color}`} />
                        </div>
                        <div className="mt-1 text-2xl font-black text-slate-900">{stat.value}</div>
                    </div>
                ))}
            </div>

            {/* Orders Table */}
            <div className="bg-white border border-slate-200 rounded-none overflow-hidden shadow-none">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Ref</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Readiness</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Created</th>
                            <th className="px-4 py-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={7} className="px-4 py-6 bg-slate-50/50"></td>
                                </tr>
                            ))
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center">
                                    <InboxStackIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No marketplace orders found</p>
                                </td>
                            </tr>
                        ) : orders.map((order) => (
                            <tr key={order.orderIntentId} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="px-4 py-4">
                                    <div className="font-black text-slate-900 text-sm tracking-tight">{order.publicRef}</div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">ID: {short(order.orderIntentId, 8)}</div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="font-bold text-slate-900 text-xs">{order.customer.name}</div>
                                    <div className="text-[10px] text-slate-400 font-medium">{order.customer.email}</div>
                                </td>
                                <td className="px-4 py-4">
                                    <span className={`px-2 py-0.5 rounded-none text-[9px] font-black uppercase tracking-wider border ${getStatusStyle(order.status)}`}>
                                        {order.status}
                                    </span>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${order.readiness === 'READY' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight">{order.readiness}</span>
                                    </div>
                                    {order.blockers.length > 0 && (
                                        <div className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{order.blockers.join(' \u2022 ')}</div>
                                    )}
                                </td>
                                <td className="px-4 py-4">
                                    <div className="text-[10px] font-bold text-slate-900 truncate max-w-[120px] uppercase">
                                        {order.lastAuditEvent?.event_type?.replace(/_/g, ' ') || 'NO EVENTS'}
                                    </div>
                                    <div className="flex items-center gap-1 mt-1">
                                        {order.lastAuditEvent?.status === 'FAILURE' && <ExclamationCircleIcon className="w-3 h-3 text-red-500" />}
                                        {order.lastAuditEvent?.status === 'WARNING' && <ExclamationCircleIcon className="w-3 h-3 text-amber-500" />}
                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                                            {order.lastAuditEvent ? safeTime(order.lastAuditEvent.created_at) : '---'}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="font-black text-slate-900 text-xs">{order.totals.total.toLocaleString()} {order.totals.currency}</div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{order.offer.printerName}</div>
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <div className="text-xs font-bold text-slate-900">{safeDate(order.createdAt)}</div>
                                    <div className="text-[10px] text-slate-400 font-medium">{safeTime(order.createdAt)}</div>
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <button 
                                        onClick={() => setSelectedOrderId(order.orderIntentId)}
                                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                    >
                                        <EyeIcon className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Detail Drawer */}
            {selectedOrderId && (
                <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedOrderId(null)} />
                    <div className="relative w-full max-w-2xl bg-white shadow-2xl h-full flex flex-col animate-slide-in-right">
                        <OrderDetailView id={selectedOrderId} onClose={() => setSelectedOrderId(null)} onRefresh={fetchOrders} />
                    </div>
                </div>
            )}
        </div>
    );
};

const OrderDetailView: React.FC<{ id: string, onClose: () => void, onRefresh: () => void }> = ({ id, onClose, onRefresh }) => {
    const [order, setOrder] = useState<any>(null);
    const [timeline, setTimeline] = useState<any[]>([]);
    const [timelineExpanded, setTimelineExpanded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState("");
    const [activeTab, setActiveTab] = useState<'DETAILS' | 'FILES' | 'AUDIT'>('DETAILS');

    useEffect(() => {
        fetchDetail();
    }, [id]);

    const fetchDetail = async () => {
        setLoading(true);
        try {
            const [res, tRes] = await Promise.all([
                adminApi.getMarketplaceOrderDetail(id),
                adminApi.getMarketplaceOrderAuditTimeline(id)
            ]);
            if (res.ok) setOrder(res.order);
            if (tRes.ok) setTimeline(tRes.timeline || []);
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
            if (res.ok) {
                fetchDetail();
                onRefresh();
            }
        } catch (err) { console.error(err); }
    };

    const handleAddNote = async () => {
        if (!note.trim()) return;
        try {
            const res = await adminApi.addNoteToMarketplaceOrder(id, note);
            if (res.ok) {
                setNote("");
                fetchDetail();
            }
        } catch (err) { console.error(err); }
    };

    if (loading) return (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
            <ArrowPathIcon className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Order Intelligence...</p>
        </div>
    );

    if (!order) return <div className="p-8 text-center">Order not found.</div>;

    return (
        <>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">{order.publicRef}</h3>
                        <span className={`px-2 py-0.5 rounded-none text-[10px] font-black uppercase tracking-widest border ${
                            order.status === 'ACKNOWLEDGED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                            {order.status}
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Marketplace Intent Layer</p>
                </div>
                <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                    <EllipsisVerticalIcon className="w-6 h-6 rotate-90" />
                </button>
            </div>

            <div className="flex border-b border-slate-100">
                {(['DETAILS', 'FILES', 'AUDIT'] as const).map(tab => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                            activeTab === tab ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {activeTab === 'DETAILS' && (
                    <>
                        {/* Summary Blocks */}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <UserIcon className="w-3.5 h-3.5" /> Customer Identity
                                </h4>
                                <div className="bg-slate-50 p-4 border border-slate-100 space-y-2">
                                    <div className="text-sm font-black text-slate-900">{order.customer.name}</div>
                                    <div className="text-xs font-medium text-slate-600">{order.customer.email}</div>
                                    <div className="text-xs font-medium text-slate-600">{order.customer.phone}</div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <TruckIcon className="w-3.5 h-3.5" /> Logistic Target
                                </h4>
                                <div className="bg-slate-50 p-4 border border-slate-100">
                                    <div className="text-xs font-medium text-slate-600 leading-relaxed">
                                        {order.customer.shippingAddress.street || 'No address provided'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Order Specs */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Technical Specifications</h4>
                            <div className="grid grid-cols-3 gap-3">
                                {Object.entries(order.specs).map(([k, v]: [string, any]) => (
                                    <div key={k} className="bg-white border border-slate-100 p-3">
                                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mb-1">{k.replace(/_/g, ' ')}</div>
                                        <div className="text-xs font-black text-slate-900 truncate">{String(v)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Commercial Info */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commercial Summary</h4>
                            <div className="bg-indigo-900 text-white p-6 rounded-none flex items-center justify-between shadow-xl">
                                <div>
                                    <div className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">Production Total</div>
                                    <div className="text-3xl font-black">{order.totals.total.toLocaleString()} {order.totals.currency}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">Print Partner</div>
                                    <div className="text-lg font-black">{order.offer.printerName}</div>
                                </div>
                            </div>
                        </div>

                        {/* Preflight & Payment */}
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Preflight Validation</h4>
                                <div className={`p-4 border flex items-center gap-3 ${
                                    order.preflight.status === 'PASSED' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'
                                }`}>
                                    {order.preflight.status === 'PASSED' ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationCircleIcon className="w-5 h-5" />}
                                    <div className="font-black text-xs uppercase tracking-widest">{order.preflight.status}</div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financial Clearance</h4>
                                <div className={`p-4 border flex items-center gap-3 ${
                                    order.payment.status === 'PAID' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-blue-50 border-blue-100 text-blue-700'
                                }`}>
                                    {order.payment.status === 'PAID' ? <CheckCircleIcon className="w-5 h-5" /> : <ArrowPathIcon className="w-5 h-5" />}
                                    <div className="font-black text-xs uppercase tracking-widest">{order.payment.status}</div>
                                </div>
                            </div>
                        </div>

                        {/* Audit Timeline Panel */}
                        <div className="space-y-4 pt-6 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Audit Timeline &mdash; {timeline.length} events {timeline.length > 0 ? `— latest: ${timeline[timeline.length - 1].event_type.replace(/_/g, ' ')}` : ''}
                                </h4>
                                <div className="flex items-center gap-3">
                                    <a href={`/admin/audit?search=${id}`} target="_blank" className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:underline">
                                        Open in global Audit Logs
                                    </a>
                                    <button 
                                        onClick={() => setTimelineExpanded(!timelineExpanded)} 
                                        className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2 py-1 border border-slate-200 hover:bg-slate-50"
                                    >
                                        {timelineExpanded ? 'Collapse' : 'Expand'}
                                    </button>
                                </div>
                            </div>

                            {timelineExpanded && (
                                <div className="bg-slate-50 border border-slate-200 p-4 space-y-4">
                                    {timeline.length === 0 ? (
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center py-4">No audit events found</div>
                                    ) : (
                                        <div className="relative pl-4 space-y-6 before:absolute before:inset-y-0 before:left-[11px] before:w-px before:bg-slate-200">
                                            {timeline.map((ev, i) => (
                                                <div key={ev.id || i} className="relative">
                                                    <div className={`absolute -left-[20px] top-1 w-3 h-3 rounded-full ring-4 ring-slate-50 ${
                                                        ev.severity === 'ERROR' ? 'bg-red-500' :
                                                        ev.severity === 'WARN' ? 'bg-amber-500' : 'bg-emerald-500'
                                                    }`} />
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{ev.event_type.replace(/_/g, ' ')}</div>
                                                        <div className="text-[9px] text-slate-500 font-bold tracking-tighter">{safeDate(ev.created_at)} {safeTime(ev.created_at)}</div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 items-center mb-2">
                                                        <span className="text-[8px] bg-slate-200 text-slate-600 px-1 py-0.5 font-bold uppercase tracking-widest rounded-none">Actor: {ev.actor} ({ev.actor_role})</span>
                                                        {ev.previous_status && ev.next_status && (
                                                            <span className="text-[8px] bg-slate-800 text-slate-200 px-1 py-0.5 font-bold uppercase tracking-widest rounded-none">{ev.previous_status} &rarr; {ev.next_status}</span>
                                                        )}
                                                        {ev.metadata?.machine_id && (
                                                            <span className="text-[8px] bg-indigo-100 text-indigo-700 px-1 py-0.5 font-bold uppercase tracking-widest rounded-none">Machine: {ev.metadata.machine_id}</span>
                                                        )}
                                                    </div>
                                                    {ev.message && <p className="text-[10px] text-slate-600 font-bold mb-1">{ev.message}</p>}
                                                    {ev.blockers?.length > 0 && (
                                                        <div className="bg-red-50 text-red-700 p-2 text-[9px] font-bold uppercase tracking-widest mt-1 border border-red-100">
                                                            Blockers: {ev.blockers.join(', ')}
                                                        </div>
                                                    )}
                                                    {ev.warnings?.length > 0 && (
                                                        <div className="bg-amber-50 text-amber-700 p-2 text-[9px] font-bold uppercase tracking-widest mt-1 border border-amber-100">
                                                            Warnings: {ev.warnings.join(', ')}
                                                        </div>
                                                    )}
                                                    <div className="text-[8px] text-slate-400 font-mono mt-2">Trace: {ev.metadata?.trace_id || '---'}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'FILES' && (
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Production File Repository</h4>
                        <div className="divide-y divide-slate-100 border border-slate-100">
                            {order.productionFileMetadata?.map((f: any) => (
                                <div key={f.id} className="p-4 flex items-center justify-between bg-white hover:bg-slate-50">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-slate-100 flex items-center justify-center">
                                            <DocumentTextIcon className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-black text-slate-900">{f.filename}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] bg-slate-900 text-white px-1.5 py-0.5 font-black uppercase tracking-widest">{f.kind}</span>
                                                <span className="text-[10px] text-slate-400 font-medium">{(f.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{f.status}</div>
                                        <div className="text-[8px] font-mono text-slate-300 mt-1 uppercase">CRC: {f.checksum || '---'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'AUDIT' && (
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Administrative Audit Trail</h4>
                            <div className="space-y-6">
                                {order.audit?.map((ev: any, i: number) => (
                                    <div key={ev.id || i} className="flex gap-4 items-start pl-2 border-l-2 border-slate-100 pb-2">
                                        <div className="mt-1 w-2 h-2 rounded-full bg-slate-300 ring-4 ring-white" />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{ev.eventType}</div>
                                                <div className="text-[9px] text-slate-400 font-medium">{safeDate(ev.createdAt)} {safeTime(ev.createdAt)}</div>
                                            </div>
                                            <div className="mt-1 text-[11px] text-slate-500 font-medium leading-relaxed">
                                                Actor: <span className="font-black text-slate-700">{ev.actorId}</span>
                                                {ev.payload?.noteText && <p className="mt-2 p-3 bg-amber-50 text-amber-900 border border-amber-100 font-bold">{ev.payload.noteText}</p>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-slate-100">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Append Operational Note
                            </h4>
                            <textarea 
                                className="w-full p-4 border border-slate-200 rounded-none text-xs font-bold uppercase tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none h-24 bg-slate-50"
                                placeholder="Add technical note or status update..."
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                            <button 
                                onClick={handleAddNote}
                                className="w-full py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-indigo-600 transition-all disabled:opacity-50"
                                disabled={!note.trim()}
                            >
                                Append Note to Ledger
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                {order.status === 'DECLARED' && (
                    <button 
                        onClick={handleAcknowledge}
                        className="w-full py-4 bg-indigo-600 text-white text-xs font-black uppercase tracking-[0.3em] hover:bg-indigo-700 transition-all shadow-xl active:scale-95"
                    >
                        Acknowledge & Sync to Production
                    </button>
                )}
                {order.status === 'ACKNOWLEDGED' && (
                    <div className="flex items-center justify-center gap-2 text-emerald-600">
                        <ShieldCheckIcon className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Order In Sync with Production Control</span>
                    </div>
                )}
            </div>
        </>
    );
};
