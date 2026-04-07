import React, { useState } from 'react';
import {
    ClipboardDocumentListIcon,
    FunnelIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { getOrders, Order, OrderStatus } from '../../lib/adminApi';
import { useAdminQuery } from '../../hooks/useAdminData';
import { DataTable } from '../../components/DataTable';

const STATUS_OPTIONS: { value: OrderStatus | ''; label: string }[] = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'reviewing', label: 'Reviewing' },
    { value: 'in_production', label: 'In Production' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_STYLES: Record<OrderStatus, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    reviewing: 'bg-blue-50 text-blue-700 border-blue-200',
    in_production: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    shipped: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    delivered: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export const OrdersPage: React.FC = () => {
    const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
    const [search, setSearch] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    const q = useAdminQuery(
        `orders:${statusFilter}`,
        () => getOrders({ status: statusFilter || undefined, limit: 100 }),
        15000
    );

    const orders = (q.data?.orders ?? []).filter(o => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (
            o.order_ref.toLowerCase().includes(s) ||
            o.user_id.toLowerCase().includes(s) ||
            o.offer_print_house.toLowerCase().includes(s)
        );
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Orders</h1>
                    <p className="text-sm text-slate-500 font-medium">
                        All print orders across the platform.
                        {q.data && (
                            <span className="ml-2 font-bold text-slate-700">{q.data.total} total</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => q.refetch?.()}
                    className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500"
                    title="Refresh"
                >
                    <ArrowPathIcon className={`w-5 h-5 ${q.status === 'loading' ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Filters */}
            <div className="glass p-4 rounded-2xl border border-white flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-48 relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by ref, user, or print house..."
                        className="w-full bg-slate-50 border-none rounded-xl pl-10 pr-4 py-2 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <FunnelIcon className="w-4 h-4 text-slate-400" />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as OrderStatus | '')}
                        className="bg-slate-50 border-none rounded-xl px-3 py-2 text-xs font-black text-slate-600 uppercase tracking-wide focus:ring-2 focus:ring-primary/20"
                    >
                        {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <DataTable
                isLoading={q.status === 'loading'}
                data={orders}
                onRowClick={o => setSelectedOrder(o)}
                columns={[
                    {
                        header: 'Order Ref',
                        accessor: (o: Order) => (
                            <span className="font-mono text-xs font-bold text-slate-800">{o.order_ref}</span>
                        ),
                    },
                    {
                        header: 'User',
                        accessor: (o: Order) => (
                            <span className="text-sm font-semibold text-slate-600">{o.user_id}</span>
                        ),
                    },
                    {
                        header: 'Status',
                        accessor: (o: Order) => (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${STATUS_STYLES[o.status]}`}>
                                {o.status.replace('_', ' ')}
                            </span>
                        ),
                    },
                    {
                        header: 'Print House',
                        accessor: (o: Order) => (
                            <span className="text-sm text-slate-700">{o.offer_print_house}</span>
                        ),
                    },
                    {
                        header: 'Price',
                        accessor: (o: Order) => (
                            <span className="font-bold text-slate-900">
                                €{Number(o.offer_price).toFixed(2)}
                            </span>
                        ),
                    },
                    {
                        header: 'Created',
                        accessor: (o: Order) => (
                            <span className="text-xs text-slate-400">
                                {new Date(o.created_at).toLocaleDateString('es-ES', {
                                    day: '2-digit', month: 'short', year: 'numeric'
                                })}
                            </span>
                        ),
                    },
                ]}
                emptyMessage="No orders found."
            />

            {/* Detail panel */}
            {selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setSelectedOrder(null)}>
                    <div
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                                    <ClipboardDocumentListIcon className="w-5 h-5 text-slate-600" />
                                </div>
                                <div>
                                    <p className="font-black text-slate-900 font-mono">{selectedOrder.order_ref}</p>
                                    <p className="text-xs text-slate-400">Order #{selectedOrder.id}</p>
                                </div>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${STATUS_STYLES[selectedOrder.status]}`}>
                                {selectedOrder.status.replace('_', ' ')}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">User</p>
                                <p className="font-bold text-slate-700 truncate">{selectedOrder.user_id}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Price</p>
                                <p className="font-bold text-slate-700">€{Number(selectedOrder.offer_price).toFixed(2)}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Print House</p>
                                <p className="font-bold text-slate-700">{selectedOrder.offer_print_house}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Created</p>
                                <p className="font-bold text-slate-700">{new Date(selectedOrder.created_at).toLocaleString('es-ES')}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Updated</p>
                                <p className="font-bold text-slate-700">{new Date(selectedOrder.updated_at).toLocaleString('es-ES')}</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Specs</p>
                            <pre className="text-xs text-slate-600 overflow-auto max-h-40 whitespace-pre-wrap">
                                {JSON.stringify(
                                    typeof selectedOrder.specs === 'string'
                                        ? JSON.parse(selectedOrder.specs)
                                        : selectedOrder.specs,
                                    null, 2
                                )}
                            </pre>
                        </div>

                        <button
                            onClick={() => setSelectedOrder(null)}
                            className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
