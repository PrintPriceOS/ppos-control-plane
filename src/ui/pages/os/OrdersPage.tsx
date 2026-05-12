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
    pending:       'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700/40',
    reviewing:     'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700/40',
    in_production: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-700/40',
    shipped:       'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-700/40',
    delivered:     'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700/40',
    cancelled:     'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700/40',
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
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Orders</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                        All print orders across the platform.
                        {q.data && (
                            <span className="ml-2 font-bold text-slate-700 dark:text-slate-300">{q.data.total} total</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => q.refetch?.()}
                    className="p-2 rounded-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
                    title="Refresh"
                >
                    <ArrowPathIcon className={`w-5 h-5 ${q.status === 'loading' ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Filters */}
            <div className="glass p-4 rounded-none border border-white dark:border-slate-700/30 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-48 relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by ref, user, or print house..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-none pl-10 pr-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <FunnelIcon className="w-4 h-4 text-slate-400" />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as OrderStatus | '')}
                        className="bg-slate-50 dark:bg-slate-800 border-none rounded-none px-3 py-2 text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-wide focus:ring-2 focus:ring-primary/20"
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
                            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{o.order_ref}</span>
                        ),
                    },
                    {
                        header: 'User',
                        accessor: (o: Order) => (
                            <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{o.user_id}</span>
                        ),
                    },
                    {
                        header: 'Status',
                        accessor: (o: Order) => (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-none text-[10px] font-black uppercase tracking-wider border ${STATUS_STYLES[o.status]}`}>
                                {o.status.replace('_', ' ')}
                            </span>
                        ),
                    },
                    {
                        header: 'Print House',
                        accessor: (o: Order) => (
                            <span className="text-sm text-slate-700 dark:text-slate-300">{o.offer_print_house}</span>
                        ),
                    },
                    {
                        header: 'Price',
                        accessor: (o: Order) => (
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                                €{Number(o.offer_price || 0).toFixed(2)}
                            </span>
                        ),
                    },
                    {
                        header: 'Created',
                        accessor: (o: Order) => (
                            <span className="text-xs text-slate-400 dark:text-slate-500">
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
                        className="bg-white dark:bg-slate-900 rounded-none shadow-2xl border border-transparent dark:border-slate-700 w-full max-w-lg p-6 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-none flex items-center justify-center">
                                    <ClipboardDocumentListIcon className="w-5 h-5 text-slate-600" />
                                </div>
                                <div>
                                    <p className="font-black text-slate-900 dark:text-white font-mono">{selectedOrder.order_ref}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">Order #{selectedOrder.id}</p>
                                </div>
                            </div>
                            <span className={`px-2.5 py-1 rounded-none text-[10px] font-black uppercase tracking-wider border ${STATUS_STYLES[selectedOrder.status]}`}>
                                {selectedOrder.status.replace('_', ' ')}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-none p-3">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">User</p>
                                <p className="font-bold text-slate-700 dark:text-slate-300 truncate">{selectedOrder.user_id}</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-none p-3">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Price</p>
                                <p className="font-bold text-slate-700 dark:text-slate-300">€{Number(selectedOrder.offer_price || 0).toFixed(2)}</p>
                            </div>
                            <div className="bg-slate-50 rounded-none p-3 col-span-2">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Print House</p>
                                <p className="font-bold text-slate-700 dark:text-slate-300">{selectedOrder.offer_print_house}</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-none p-3">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Created</p>
                                <p className="font-bold text-slate-700 dark:text-slate-300">{new Date(selectedOrder.created_at).toLocaleString('es-ES')}</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 rounded-none p-3">
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Updated</p>
                                <p className="font-bold text-slate-700 dark:text-slate-300">{new Date(selectedOrder.updated_at).toLocaleString('es-ES')}</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-none p-3">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Specs</p>
                            <pre className="text-xs text-slate-600 dark:text-slate-400 overflow-auto max-h-40 whitespace-pre-wrap">
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
                            className="w-full py-2.5 rounded-none bg-slate-900 text-white text-sm font-black hover:bg-slate-800 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
