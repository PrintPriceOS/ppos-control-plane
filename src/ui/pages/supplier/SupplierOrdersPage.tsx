import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    InboxIcon, 
    MagnifyingGlassIcon, 
    FunnelIcon, 
    ArrowPathIcon, 
    CheckCircleIcon, 
    XCircleIcon, 
    TruckIcon, 
    ClockIcon, 
    DocumentCheckIcon, 
    ExclamationTriangleIcon, 
    EyeIcon, 
    PaperAirplaneIcon, 
    ShieldCheckIcon, 
    ChevronLeftIcon, 
    ChevronRightIcon, 
    BuildingOfficeIcon, 
    MapPinIcon, 
    CurrencyEuroIcon, 
    ScaleIcon,
    CalendarIcon,
    ArrowDownTrayIcon,
    InformationCircleIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch, SupplierApiError, getSupplierOrderDocument } from '../../lib/paperSupplierApi';
import { getUserRole, getAuthUser } from '../../lib/authStore';
import { AccessibleModal } from '../../components/AccessibleModal';
import { ProcurementDocumentModal } from '../../components/printhouse/ProcurementDocumentModal';
import { useLocale } from '../../i18n';

export interface SupplierOrderSummary {
    id: string;
    orderNumber: string;
    type: 'ORDER' | 'RFQ';
    status: string;
    totalSheets: number;
    receivedSheets: number;
    orderedQuantity: number;
    quantityBasis: string;
    printhouseName: string;
    deliveryCenterName?: string;
    snapshotProductName: string;
    snapshotGsm: number;
    snapshotWidthMm: number;
    snapshotHeightMm: number;
    snapshotFinish?: string;
    currency: string;
    totalAmount: number;
    quoteTotalAmount?: number;
    quotePricePerBasis?: number;
    quoteValidUntil?: string;
    createdAt: string;
    updatedAt: string;
}

export interface SupplierOrderDetail extends SupplierOrderSummary {
    printhouseId: string;
    deliveryAddress: string;
    buyerNotes?: string;
    supplierNotes?: string;
    snapshotCaliperMicrons?: number;
    snapshotGrainDirection?: string;
    snapshotPricePerBasis?: number;
    snapshotPriceBasis?: string;
    snapshotPricingFormula?: string;
    carrierName?: string;
    trackingNumber?: string;
    confirmedAt?: string;
    dispatchedAt?: string;
    deliveredAt?: string;
    receipts: Array<{
        id: string;
        receiptNumber: string;
        receivedQuantity: number;
        receivedSheets: number;
        operatorId: string;
        notes?: string;
        createdAt: string;
    }>;
}

export const SupplierOrdersPage: React.FC = () => {
    const { t } = useLocale();
    const role = getUserRole();
    const user = getAuthUser();
    const isReadOnly = role === 'SUPPLIER_VIEWER';
    const [searchParams, setSearchParams] = useSearchParams();

    // Query state
    const initialStatus = searchParams.get('status') || 'ALL';
    const [selectedTab, setSelectedTab] = useState<string>(initialStatus);
    const [selectedType, setSelectedType] = useState<'ALL' | 'ORDER' | 'RFQ'>('ALL');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [page, setPage] = useState<number>(1);
    const limit = 15;

    // Data state
    const [orders, setOrders] = useState<SupplierOrderSummary[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Detail Modal state
    const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [orderDetail, setOrderDetail] = useState<SupplierOrderDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState<boolean>(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // Operational Action state
    const [activeAction, setActiveAction] = useState<'QUOTE' | 'CONFIRM' | 'DISPATCH' | 'DELIVER' | 'REJECT' | 'CANCEL' | null>(null);
    const [actionSubmitting, setActionSubmitting] = useState<boolean>(false);
    const [actionError, setActionError] = useState<string | null>(null);

    // Action forms
    const [quotePrice, setQuotePrice] = useState<string>('');
    const [quotePriceBasis, setQuotePriceBasis] = useState<string>('KG');
    const [quoteValidUntil, setQuoteValidUntil] = useState<string>('');
    const [carrierName, setCarrierName] = useState<string>('');
    const [trackingNumber, setTrackingNumber] = useState<string>('');
    const [actionNotes, setActionNotes] = useState<string>('');

    // Document Modal state
    const [docModalOpen, setDocModalOpen] = useState<boolean>(false);
    const [selectedDocOrderId, setSelectedDocOrderId] = useState<string | null>(null);
    const [selectedDocType, setSelectedDocType] = useState<'po' | 'packing_slip'>('po');

    // Fetch orders list
    const fetchOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const query = new URLSearchParams();
            if (selectedTab !== 'ALL') {
                query.set('status', selectedTab);
            }
            if (selectedType !== 'ALL') {
                query.set('type', selectedType);
            }
            if (searchTerm.trim()) {
                query.set('search', searchTerm.trim());
            }
            query.set('page', String(page));
            query.set('limit', String(limit));

            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/orders?${query.toString()}`);
            if (res.ok && res.data) {
                setOrders(res.data.items || res.data.orders || []);
                setTotalCount(res.data.total || 0);
                setTotalPages(Math.ceil((res.data.total || 0) / limit) || 1);
                if (res.data.counts) {
                    setStatusCounts(res.data.counts);
                }
            } else {
                setOrders([]);
                setError(res.error?.message || t('supplier.orders.loadError') || 'Failed to load supplier orders');
            }
        } catch (err: any) {
            setOrders([]);
            setError(err.message || t('supplier.orders.loadError') || 'Failed to load supplier orders');
        } finally {
            setLoading(false);
        }
    }, [selectedTab, selectedType, searchTerm, page, limit, t]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // Sync tab with search params
    const handleTabChange = (statusKey: string) => {
        setSelectedTab(statusKey);
        setPage(1);
        const newParams = new URLSearchParams(searchParams);
        if (statusKey === 'ALL') {
            newParams.delete('status');
        } else {
            newParams.set('status', statusKey);
        }
        setSearchParams(newParams);
    };

    // Open detail modal
    const openOrderDetail = async (orderId: string) => {
        setSelectedOrderId(orderId);
        setIsDetailModalOpen(true);
        setDetailLoading(true);
        setDetailError(null);
        setActiveAction(null);
        setActionError(null);
        setActionNotes('');
        setQuotePrice('');
        setQuoteValidUntil('');
        setCarrierName('');
        setTrackingNumber('');

        try {
            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/orders/${orderId}`);
            if (res.ok && res.data) {
                setOrderDetail(res.data);
                if (res.data.quotePricePerBasis) {
                    setQuotePrice(String(res.data.quotePricePerBasis));
                }
                setQuotePriceBasis(res.data.snapshotPriceBasis || res.data.priceBasis || 'KG');
                if (res.data.quoteValidUntil) {
                    setQuoteValidUntil(res.data.quoteValidUntil.slice(0, 10));
                }
            } else {
                setDetailError(res.error?.message || 'Failed to load order details');
            }
        } catch (err: any) {
            setDetailError(err.message || 'Failed to load order details');
        } finally {
            setDetailLoading(false);
        }
    };

    // Execute order status transition
    const handleTransition = async (action: 'QUOTE' | 'CONFIRM' | 'DISPATCH' | 'DELIVER' | 'REJECT' | 'CANCEL') => {
        if (!selectedOrderId) return;
        setActionSubmitting(true);
        setActionError(null);

        try {
            const payload: any = {
                action,
                supplierNotes: actionNotes.trim() || undefined
            };

            if (action === 'QUOTE') {
                if (!quotePrice || isNaN(Number(quotePrice)) || Number(quotePrice) <= 0) {
                    throw new Error(t('supplier.orders.invalidQuotePrice') || 'Valid quote price per unit basis is required');
                }
                payload.pricePerBasis = Number(quotePrice);
                payload.quotePricePerBasis = Number(quotePrice);
                payload.priceBasis = quotePriceBasis || orderDetail?.snapshotPriceBasis || 'KG';
                if (quoteValidUntil) {
                    payload.quoteValidUntil = new Date(quoteValidUntil).toISOString();
                }
            }

            if (action === 'DISPATCH') {
                if (carrierName.trim()) payload.carrierName = carrierName.trim();
                if (trackingNumber.trim()) payload.trackingNumber = trackingNumber.trim();
            }

            const res = await paperSupplierFetch<any>(
                `/api/v1/paper-suppliers/orders/${selectedOrderId}/transition`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );

            if (res.ok) {
                setActiveAction(null);
                // Refresh modal and table
                await openOrderDetail(selectedOrderId);
                await fetchOrders();
            } else {
                setActionError(res.error?.message || 'Transition failed');
            }
        } catch (err: any) {
            setActionError(err.message || 'Transition failed');
        } finally {
            setActionSubmitting(false);
        }
    };

    // Status Badge Component
    const renderStatusBadge = (status: string) => {
        switch (status) {
            case 'SUBMITTED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <ClockIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusSubmitted') || 'Pending Request'}
                    </span>
                );
            case 'QUOTED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        <PaperAirplaneIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusQuoted') || 'Quoted'}
                    </span>
                );
            case 'CONFIRMED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusConfirmed') || 'Confirmed'}
                    </span>
                );
            case 'DISPATCHED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        <TruckIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusDispatched') || 'Dispatched'}
                    </span>
                );
            case 'PARTIALLY_DELIVERED':
            case 'DELIVERED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                        <DocumentCheckIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusDelivered') || 'Delivered'}
                    </span>
                );
            case 'PARTIALLY_RECEIVED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusPartiallyReceived') || 'Partially Received'}
                    </span>
                );
            case 'RECEIVED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <ShieldCheckIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusReceived') || 'Warehouse Stocked'}
                    </span>
                );
            case 'REJECTED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                        <XCircleIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusRejected') || 'Rejected'}
                    </span>
                );
            case 'CANCELLED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-zinc-500/20">
                        <XCircleIcon className="w-3.5 h-3.5" />
                        {t('supplier.orders.statusCancelled') || 'Cancelled'}
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {status}
                    </span>
                );
        }
    };

    // Tab pills configuration
    const tabs = useMemo(() => [
        { key: 'ALL', label: t('supplier.orders.tabAll') || 'All Orders', count: statusCounts.ALL || 0 },
        { key: 'SUBMITTED', label: t('supplier.orders.tabPending') || 'Pending Requests', count: statusCounts.SUBMITTED || 0 },
        { key: 'QUOTED', label: t('supplier.orders.tabQuoted') || 'Quoted Proposals', count: statusCounts.QUOTED || 0 },
        { key: 'CONFIRMED', label: t('supplier.orders.tabConfirmed') || 'Confirmed', count: statusCounts.CONFIRMED || 0 },
        { key: 'DISPATCHED', label: t('supplier.orders.tabDispatched') || 'In Transit', count: statusCounts.DISPATCHED || 0 },
        { key: 'RECEIVED', label: t('supplier.orders.tabReceived') || 'Received', count: (statusCounts.RECEIVED || 0) + (statusCounts.PARTIALLY_RECEIVED || 0) },
        { key: 'REJECTED', label: t('supplier.orders.tabRejected') || 'Rejected / Cancelled', count: (statusCounts.REJECTED || 0) + (statusCounts.CANCELLED || 0) },
    ], [statusCounts, t]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-0.5 text-xs font-semibold rounded-full bg-red-600 text-white shadow-xs">
                            {t('supplier.orders.hubBadge') || 'Paper Supplier Hub'}
                        </span>
                        <span className="px-3 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {t('supplier.orders.operationsTag') || 'Procurement & Fulfillment'}
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {t('supplier.orders.title') || 'Procurement Orders & RFQs'}
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        {t('supplier.orders.subtitle') || 'Review incoming paper purchase orders, reply with custom RFQ price quotes, and manage dispatch logistics.'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchOrders}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span>{t('common.refresh') || 'Refresh'}</span>
                    </button>
                </div>
            </div>

            {/* Status Tabs Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-zinc-200 dark:border-zinc-800 scrollbar-none">
                {tabs.map((tab) => {
                    const isActive = selectedTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => handleTabChange(tab.key)}
                            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                                isActive
                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
                                    : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700'
                            }`}
                        >
                            <span>{tab.label}</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                isActive
                                    ? 'bg-white/20 dark:bg-slate-900/20 text-white dark:text-slate-900'
                                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                            }`}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-zinc-900 p-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs">
                <div className="relative flex-1 w-full">
                    <MagnifyingGlassIcon className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setPage(1);
                        }}
                        placeholder={t('supplier.orders.searchPlaceholder') || 'Search order #, customer name, material, or SKU...'}
                        className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 text-slate-900 dark:text-white placeholder-zinc-400"
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs text-zinc-400 shrink-0 font-medium">
                        {t('supplier.orders.typeFilter') || 'Type:'}
                    </span>
                    <select
                        value={selectedType}
                        onChange={(e) => {
                            setSelectedType(e.target.value as any);
                            setPage(1);
                        }}
                        className="px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-slate-900 dark:text-white font-medium focus:outline-none cursor-pointer"
                    >
                        <option value="ALL">{t('supplier.orders.typeAll') || 'All Types'}</option>
                        <option value="ORDER">{t('supplier.orders.typeOrder') || 'Purchase Orders (PO)'}</option>
                        <option value="RFQ">{t('supplier.orders.typeRfq') || 'RFQ Requests'}</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Orders Table */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                                <th className="py-3 px-4">{t('supplier.orders.colOrder') || 'Order / Type'}</th>
                                <th className="py-3 px-4">{t('supplier.orders.colBuyer') || 'Buyer / Plant'}</th>
                                <th className="py-3 px-4">{t('supplier.orders.colMaterial') || 'Paper Material'}</th>
                                <th className="py-3 px-4">{t('supplier.orders.colQuantity') || 'Quantity & Sheets'}</th>
                                <th className="py-3 px-4">{t('supplier.orders.colAmount') || 'Financial Terms'}</th>
                                <th className="py-3 px-4">{t('supplier.orders.colStatus') || 'Status'}</th>
                                <th className="py-3 px-4 text-right">{t('supplier.orders.colActions') || 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="py-12 text-center text-zinc-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <ArrowPathIcon className="w-6 h-6 animate-spin text-zinc-400" />
                                            <span>{t('common.loading') || 'Loading procurement orders...'}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : orders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-zinc-400">
                                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-2">
                                            <InboxIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
                                            <p className="font-semibold text-slate-800 dark:text-zinc-200 text-sm">
                                                {t('supplier.orders.noOrdersFound') || 'No orders or RFQs found'}
                                            </p>
                                            <p className="text-[11px] text-zinc-400 leading-normal">
                                                {searchTerm
                                                    ? t('supplier.orders.noSearchResults') || 'Try adjusting your search query or filter criteria.'
                                                    : t('supplier.orders.noOrdersYet') || 'Incoming orders and RFQs from authorized printhouses will appear here.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                orders.map((order) => {
                                    const isRfq = order.type === 'RFQ';
                                    const progressPercent = order.totalSheets > 0
                                        ? Math.min(100, Math.round((order.receivedSheets / order.totalSheets) * 100))
                                        : 0;

                                    return (
                                        <tr 
                                            key={order.id} 
                                            className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                                            onClick={() => openOrderDetail(order.id)}
                                        >
                                            {/* Order Number & Type */}
                                            <td className="py-3.5 px-4 font-mono font-medium text-slate-900 dark:text-white">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                                                        isRfq 
                                                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                                    }`}>
                                                        {order.type}
                                                    </span>
                                                    <span className="font-semibold text-slate-900 dark:text-white">
                                                        {order.orderNumber}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-zinc-400 mt-1 font-sans">
                                                    {new Date(order.createdAt).toLocaleDateString()} {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </td>

                                            {/* Buyer & Plant */}
                                            <td className="py-3.5 px-4">
                                                <div className="font-semibold text-slate-800 dark:text-zinc-200">
                                                    {order.printhouseName}
                                                </div>
                                                <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-0.5">
                                                    <MapPinIcon className="w-3 h-3 shrink-0" />
                                                    <span>{order.deliveryCenterName || 'Default Plant Center'}</span>
                                                </div>
                                            </td>

                                            {/* Paper Material & Specs */}
                                            <td className="py-3.5 px-4">
                                                <div className="font-semibold text-slate-900 dark:text-white truncate max-w-xs">
                                                    {order.snapshotProductName}
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                                                    <span>{order.snapshotWidthMm} × {order.snapshotHeightMm} mm</span>
                                                    <span>•</span>
                                                    <span>{order.snapshotGsm} gsm</span>
                                                    {order.snapshotFinish && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="capitalize">{order.snapshotFinish.toLowerCase()}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Quantity & Sheets */}
                                            <td className="py-3.5 px-4 font-mono">
                                                <div className="font-bold text-slate-800 dark:text-zinc-200">
                                                    {order.orderedQuantity.toLocaleString()} {order.quantityBasis}
                                                </div>
                                                <div className="text-[11px] text-zinc-400 mt-0.5">
                                                    ≈ {order.totalSheets.toLocaleString()} {t('common.sheets') || 'sheets'}
                                                </div>
                                                {order.receivedSheets > 0 && (
                                                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                                                        <span>{progressPercent}% received ({order.receivedSheets.toLocaleString()} sh)</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Commercial Pricing */}
                                            <td className="py-3.5 px-4 font-mono">
                                                {isRfq && order.status === 'SUBMITTED' ? (
                                                    <span className="text-amber-500 font-bold text-xs">
                                                        {t('supplier.orders.awaitingQuote') || 'Quote pending'}
                                                    </span>
                                                ) : isRfq && order.quoteTotalAmount ? (
                                                    <div>
                                                        <span className="font-black text-slate-900 dark:text-white">
                                                            {order.currency} {Number(order.quoteTotalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                        {order.quotePricePerBasis && (
                                                            <div className="text-[10px] text-zinc-400 mt-0.5">
                                                                @{order.currency} {order.quotePricePerBasis} / {order.quantityBasis}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <span className="font-black text-slate-900 dark:text-white">
                                                            {order.currency} {Number(order.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Status Badge */}
                                            <td className="py-3.5 px-4">
                                                {renderStatusBadge(order.status)}
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedDocOrderId(order.id);
                                                            setSelectedDocType(order.status === 'RECEIVED' || order.status === 'PARTIALLY_RECEIVED' ? 'packing_slip' : 'po');
                                                            setDocModalOpen(true);
                                                        }}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
                                                        title={t('procurement.document.viewBtn') || 'Documento'}
                                                    >
                                                        <DocumentCheckIcon className="w-3.5 h-3.5 text-zinc-500" />
                                                        <span>{t('procurement.document.viewBtn') || 'Doc'}</span>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openOrderDetail(order.id);
                                                        }}
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
                                                    >
                                                        <EyeIcon className="w-3.5 h-3.5" />
                                                        <span>{t('common.details') || 'Details'}</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 text-xs">
                        <span className="text-zinc-400">
                            {t('common.page') || 'Page'} <strong className="text-slate-900 dark:text-white font-mono">{page}</strong> {t('common.of') || 'of'} <strong className="text-slate-900 dark:text-white font-mono">{totalPages}</strong> ({totalCount} {t('supplier.orders.totalEntries') || 'entries'})
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                            >
                                <ChevronLeftIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                            >
                                <ChevronRightIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ORDER DETAIL & ACTION MODAL */}
            <AccessibleModal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title={orderDetail ? `${orderDetail.type === 'RFQ' ? 'RFQ Request' : 'Purchase Order'}: ${orderDetail.orderNumber}` : 'Order Detail'}
                subtitle={orderDetail ? `${orderDetail.printhouseName} • Created ${new Date(orderDetail.createdAt).toLocaleDateString()}` : undefined}
                maxWidth="max-w-4xl"
            >
                {detailLoading ? (
                    <div className="py-16 text-center text-zinc-400 flex flex-col items-center justify-center gap-3">
                        <ArrowPathIcon className="w-8 h-8 animate-spin text-red-600" />
                        <span className="text-xs">{t('common.loading') || 'Loading order contract and history...'}</span>
                    </div>
                ) : detailError ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                        <span>{detailError}</span>
                    </div>
                ) : orderDetail ? (
                    <div className="space-y-6">
                        {/* Status & Contract Header Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl">
                            <div className="flex items-center gap-3">
                                {renderStatusBadge(orderDetail.status)}
                                <span className="text-xs text-zinc-400 font-mono">
                                    ID: {orderDetail.id}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 text-xs font-semibold">
                                    <span className="text-zinc-400">{t('supplier.orders.deliveryCenter') || 'Plant:'}</span>
                                    <span className="text-slate-900 dark:text-white font-mono bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700">
                                        {orderDetail.deliveryCenterName || orderDetail.printhouseId}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-700 pl-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedDocOrderId(orderDetail.id);
                                            setSelectedDocType('po');
                                            setDocModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer shadow-2xs"
                                        title={t('procurement.document.titlePo')}
                                    >
                                        <DocumentCheckIcon className="w-3.5 h-3.5 text-red-600" />
                                        <span>{t('procurement.document.viewPo') || 'PO'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedDocOrderId(orderDetail.id);
                                            setSelectedDocType('packing_slip');
                                            setDocModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer shadow-2xs"
                                        title={t('procurement.document.titleSlip')}
                                    >
                                        <TruckIcon className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>{t('procurement.document.viewSlip') || 'Albarán'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 4-Grid Specification and Terms Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Card 1: Technical Spec Snapshot */}
                            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                    <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
                                    <span>{t('supplier.orders.techSnapshotTitle') || 'Immutable Technical Snapshot'}</span>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div>
                                        <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.productName') || 'Product Name'}</p>
                                        <p className="font-bold text-slate-800 dark:text-zinc-200">{orderDetail.snapshotProductName}</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 pt-1">
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.dimensions') || 'Dimensions'}</p>
                                            <p className="font-mono font-medium text-slate-800 dark:text-zinc-200">{orderDetail.snapshotWidthMm} × {orderDetail.snapshotHeightMm} mm</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.gsm') || 'Weight'}</p>
                                            <p className="font-mono font-medium text-slate-800 dark:text-zinc-200">{orderDetail.snapshotGsm} g/m²</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.caliper') || 'Caliper'}</p>
                                            <p className="font-mono font-medium text-slate-800 dark:text-zinc-200">{orderDetail.snapshotCaliperMicrons ? `${orderDetail.snapshotCaliperMicrons} µm` : '—'}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.finish') || 'Finish'}</p>
                                            <p className="font-medium text-slate-800 dark:text-zinc-200 capitalize">{orderDetail.snapshotFinish?.toLowerCase() || 'Standard'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.grain') || 'Grain'}</p>
                                            <p className="font-medium text-slate-800 dark:text-zinc-200">{orderDetail.snapshotGrainDirection || 'LONG_GRAIN'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Financial & Commercial Snapshot */}
                            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                    <CurrencyEuroIcon className="w-4 h-4 text-blue-500" />
                                    <span>{t('supplier.orders.financialSnapshotTitle') || 'Commercial Terms'}</span>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.orderedQuantity') || 'Ordered Volume'}</p>
                                            <p className="font-mono font-bold text-slate-800 dark:text-zinc-200 text-sm">{orderDetail.orderedQuantity.toLocaleString()} {orderDetail.quantityBasis}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.calculatedSheets') || 'Sheet Count'}</p>
                                            <p className="font-mono font-bold text-slate-800 dark:text-zinc-200 text-sm">{orderDetail.totalSheets.toLocaleString()} sh</p>
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                        <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.totalPrice') || 'Agreed Order Total'}</p>
                                        <div className="flex items-baseline gap-2 mt-0.5">
                                            <span className="font-mono font-black text-slate-900 dark:text-white text-lg">
                                                {orderDetail.currency} {Number(orderDetail.quoteTotalAmount || orderDetail.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            {orderDetail.snapshotPricePerBasis && (
                                                <span className="text-[11px] text-zinc-400 font-mono">
                                                    (@ {orderDetail.currency} {orderDetail.snapshotPricePerBasis} / {orderDetail.quantityBasis})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {orderDetail.quoteValidUntil && (
                                        <p className="text-[10px] text-amber-500 font-semibold pt-1">
                                            {t('supplier.orders.quoteValidUntil') || 'Quote valid until:'} {new Date(orderDetail.quoteValidUntil).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Card 3: Shipping & Destination */}
                            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                    <MapPinIcon className="w-4 h-4 text-red-600" />
                                    <span>{t('supplier.orders.shippingTitle') || 'Shipping Destination'}</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                    <p className="font-bold text-slate-800 dark:text-zinc-200">{orderDetail.printhouseName}</p>
                                    <p className="text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed text-[11px]">
                                        {orderDetail.deliveryAddress || 'No street address provided.'}
                                    </p>
                                    {orderDetail.buyerNotes && (
                                        <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300">
                                            <p className="font-bold text-[10px] uppercase">{t('supplier.orders.buyerNotes') || 'Buyer Instructions:'}</p>
                                            <p className="mt-0.5">{orderDetail.buyerNotes}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card 4: Logistics & Dispatch Status */}
                            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white border-b border-zinc-100 dark:border-zinc-800 pb-2">
                                    <TruckIcon className="w-4 h-4 text-indigo-500" />
                                    <span>{t('supplier.orders.logisticsTitle') || 'Fulfillment Logistics'}</span>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.carrier') || 'Carrier'}</p>
                                            <p className="font-medium text-slate-800 dark:text-zinc-200">{orderDetail.carrierName || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.tracking') || 'Tracking #'}</p>
                                            <p className="font-mono text-slate-800 dark:text-zinc-200">{orderDetail.trackingNumber || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.dispatchedAt') || 'Dispatched'}</p>
                                            <p className="font-mono text-zinc-500">{orderDetail.dispatchedAt ? new Date(orderDetail.dispatchedAt).toLocaleDateString() : '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-zinc-400 uppercase font-semibold">{t('supplier.orders.deliveredAt') || 'Delivered'}</p>
                                            <p className="font-mono text-zinc-500">{orderDetail.deliveredAt ? new Date(orderDetail.deliveredAt).toLocaleDateString() : '—'}</p>
                                        </div>
                                    </div>
                                    {orderDetail.supplierNotes && (
                                        <div className="mt-1 text-[11px] text-zinc-500 italic">
                                            "{orderDetail.supplierNotes}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Warehouse Receipts Audit History */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                <ArrowDownTrayIcon className="w-4 h-4 text-emerald-500" />
                                <span>{t('supplier.orders.receiptsLedger') || 'Warehouse Goods Intake Ledger'}</span>
                                <span className="font-mono text-[10px] font-normal text-zinc-400">({orderDetail.receipts.length} receipts)</span>
                            </h3>

                            {orderDetail.receipts.length === 0 ? (
                                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center text-xs text-zinc-400">
                                    {t('supplier.orders.noReceiptsYet') || 'No physical intake receipts have been recorded yet by the buyer plant.'}
                                </div>
                            ) : (
                                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-400 text-[10px] uppercase font-semibold border-b border-zinc-200 dark:border-zinc-800">
                                            <tr>
                                                <th className="py-2.5 px-3">{t('supplier.orders.receiptNum') || 'Receipt #'}</th>
                                                <th className="py-2.5 px-3">{t('supplier.orders.receivedSheets') || 'Sheets Verified'}</th>
                                                <th className="py-2.5 px-3">{t('supplier.orders.receivedVolume') || 'Volume'}</th>
                                                <th className="py-2.5 px-3">{t('supplier.orders.receiver') || 'Operator'}</th>
                                                <th className="py-2.5 px-3">{t('supplier.orders.receiptDate') || 'Intake Timestamp'}</th>
                                                <th className="py-2.5 px-3">{t('supplier.orders.receiptNotes') || 'Notes'}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                                            {orderDetail.receipts.map((rcpt) => (
                                                <tr key={rcpt.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                                                    <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-zinc-200">{rcpt.receiptNumber}</td>
                                                    <td className="py-2.5 px-3 text-emerald-600 font-semibold">{rcpt.receivedSheets.toLocaleString()} sh</td>
                                                    <td className="py-2.5 px-3">{rcpt.receivedQuantity} {orderDetail.quantityBasis}</td>
                                                    <td className="py-2.5 px-3 text-zinc-400 font-sans">{rcpt.operatorId}</td>
                                                    <td className="py-2.5 px-3 text-zinc-400 font-sans">{new Date(rcpt.createdAt).toLocaleString()}</td>
                                                    <td className="py-2.5 px-3 text-zinc-400 font-sans">{rcpt.notes || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Interactive Supplier Action Panel */}
                        <div className="p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <TruckIcon className="w-4 h-4 text-red-600" />
                                        <span>{t('supplier.orders.actionPanelTitle') || 'Fulfillment & Contract Actions'}</span>
                                    </h4>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        {t('supplier.orders.actionPanelSubtitle') || 'Execute governance status transitions and quote updates.'}
                                    </p>
                                </div>

                                {isReadOnly && (
                                    <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">
                                        {t('supplier.orders.viewerReadOnly') || 'Viewer Mode (Read-only)'}
                                    </span>
                                )}
                            </div>

                            {actionError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2">
                                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                                    <span>{actionError}</span>
                                </div>
                            )}

                            {/* RFQ Quote Proposal Form */}
                            {activeAction === 'QUOTE' && (
                                <div className="p-4 bg-white dark:bg-zinc-900 border border-purple-500/30 rounded-xl space-y-3">
                                    <h5 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                                        {t('supplier.orders.submitQuoteTitle') || 'Submit Custom Volume Quote'}
                                    </h5>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                        <div>
                                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                                {t('supplier.orders.quotePricePerBasis') || 'Unit Price Amount'} ({orderDetail.currency}) *
                                            </label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                value={quotePrice}
                                                onChange={(e) => setQuotePrice(e.target.value)}
                                                placeholder="e.g. 1.9500"
                                                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl font-mono text-xs focus:ring-2 focus:ring-purple-500/40"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                                Pricing Basis *
                                            </label>
                                            <select
                                                id="supplier-quote-price-basis"
                                                value={quotePriceBasis}
                                                onChange={(e) => setQuotePriceBasis(e.target.value)}
                                                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl font-medium text-xs focus:ring-2 focus:ring-purple-500/40"
                                            >
                                                <option value="KG">EUR / KG</option>
                                                <option value="SHEET">EUR / Hoja (SHEET)</option>
                                                <option value="THOUSAND_SHEETS">EUR / Millar (THOUSAND_SHEETS)</option>
                                                <option value="PACK">EUR / Paquete (PACK)</option>
                                                <option value="TONNE">EUR / Tonelada (TONNE)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                                {t('supplier.orders.quoteValidUntilDate') || 'Quote Validity Expiration Date'}
                                            </label>
                                            <input
                                                type="date"
                                                value={quoteValidUntil}
                                                onChange={(e) => setQuoteValidUntil(e.target.value)}
                                                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/40"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                            {t('supplier.orders.supplierNotesLabel') || 'Proposal Notes & Terms for Printhouse'}
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={actionNotes}
                                            onChange={(e) => setActionNotes(e.target.value)}
                                            placeholder="e.g. Price includes standard road freight delivery to Frankfurt."
                                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/40"
                                        />
                                    </div>
                                    <div className="flex items-center justify-end gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setActiveAction(null)}
                                            disabled={actionSubmitting}
                                            className="px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                                        >
                                            {t('common.cancel') || 'Cancel'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleTransition('QUOTE')}
                                            disabled={actionSubmitting || !quotePrice}
                                            className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-2xs cursor-pointer disabled:opacity-50"
                                        >
                                            {actionSubmitting ? 'Submitting Quote...' : (t('supplier.orders.sendQuoteBtn') || 'Transmit Quote to Buyer')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Dispatch Logistics Form */}
                            {activeAction === 'DISPATCH' && (
                                <div className="p-4 bg-white dark:bg-zinc-900 border border-indigo-500/30 rounded-xl space-y-3">
                                    <h5 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                        {t('supplier.orders.dispatchFormTitle') || 'Logistics & Dispatch Information'}
                                    </h5>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                                {t('supplier.orders.carrierLabel') || 'Logistics Carrier / Freight Operator'}
                                            </label>
                                            <input
                                                type="text"
                                                value={carrierName}
                                                onChange={(e) => setCarrierName(e.target.value)}
                                                placeholder="e.g. DHL Freight, Schenker, Dachser"
                                                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/40"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                                {t('supplier.orders.trackingLabel') || 'Waybill / Tracking Number'}
                                            </label>
                                            <input
                                                type="text"
                                                value={trackingNumber}
                                                onChange={(e) => setTrackingNumber(e.target.value)}
                                                placeholder="e.g. EXP-98234-DE"
                                                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500/40"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                            {t('supplier.orders.dispatchNotesLabel') || 'Dispatch Delivery Notes'}
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={actionNotes}
                                            onChange={(e) => setActionNotes(e.target.value)}
                                            placeholder="e.g. 2 pallets shrink-wrapped with corner protection."
                                            className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/40"
                                        />
                                    </div>
                                    <div className="flex items-center justify-end gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setActiveAction(null)}
                                            disabled={actionSubmitting}
                                            className="px-3 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
                                        >
                                            {t('common.cancel') || 'Cancel'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleTransition('DISPATCH')}
                                            disabled={actionSubmitting}
                                            className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer disabled:opacity-50"
                                        >
                                            {actionSubmitting ? 'Confirming Dispatch...' : (t('supplier.orders.confirmDispatchBtn') || 'Confirm Dispatch & In-Transit')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons Toolbar */}
                            {!isReadOnly && !activeAction && (
                                <div className="flex flex-wrap items-center gap-2.5">
                                    {orderDetail.status === 'SUBMITTED' && orderDetail.type === 'RFQ' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setActiveAction('QUOTE')}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-2xs cursor-pointer"
                                            >
                                                <PaperAirplaneIcon className="w-4 h-4" />
                                                <span>{t('supplier.orders.btnSubmitQuote') || 'Prepare Quote Proposal'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleTransition('REJECT')}
                                                disabled={actionSubmitting}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 cursor-pointer"
                                            >
                                                <XCircleIcon className="w-4 h-4" />
                                                <span>{t('supplier.orders.btnRejectRfq') || 'Decline RFQ'}</span>
                                            </button>
                                        </>
                                    )}

                                    {orderDetail.status === 'SUBMITTED' && orderDetail.type === 'ORDER' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleTransition('CONFIRM')}
                                                disabled={actionSubmitting}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
                                            >
                                                <CheckCircleIcon className="w-4 h-4" />
                                                <span>{t('supplier.orders.btnAcceptOrder') || 'Accept & Confirm Order'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleTransition('REJECT')}
                                                disabled={actionSubmitting}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 cursor-pointer"
                                            >
                                                <XCircleIcon className="w-4 h-4" />
                                                <span>{t('supplier.orders.btnRejectOrder') || 'Reject Order'}</span>
                                            </button>
                                        </>
                                    )}

                                    {orderDetail.status === 'CONFIRMED' && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setActiveAction('DISPATCH')}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer"
                                            >
                                                <TruckIcon className="w-4 h-4" />
                                                <span>{t('supplier.orders.btnDispatch') || 'Dispatch Order'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleTransition('CANCEL')}
                                                disabled={actionSubmitting}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 cursor-pointer"
                                            >
                                                <XCircleIcon className="w-4 h-4" />
                                                <span>{t('supplier.orders.btnCancelOrder') || 'Cancel Order'}</span>
                                            </button>
                                        </>
                                    )}

                                    {(orderDetail.status === 'DISPATCHED' || orderDetail.status === 'PARTIALLY_DELIVERED') && (
                                        <button
                                            type="button"
                                            onClick={() => handleTransition('DELIVER')}
                                            disabled={actionSubmitting}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white shadow-2xs cursor-pointer"
                                        >
                                            <CheckCircleIcon className="w-4 h-4" />
                                            <span>{t('supplier.orders.btnMarkDelivered') || 'Mark Order as Delivered'}</span>
                                        </button>
                                    )}

                                    {['DELIVERED', 'PARTIALLY_RECEIVED'].includes(orderDetail.status) && (
                                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                                            <InformationCircleIcon className="w-4 h-4 text-cyan-500 shrink-0" />
                                            <span>{t('supplier.orders.intakePendingMsg') || 'Awaiting buyer physical warehouse intake verification in MES inventory.'}</span>
                                        </div>
                                    )}

                                    {orderDetail.status === 'RECEIVED' && (
                                        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                            <ShieldCheckIcon className="w-4 h-4 shrink-0" />
                                            <span>{t('supplier.orders.completedAuditMsg') || 'Order completed and stocked into buyer inventory ledger.'}</span>
                                        </div>
                                    )}

                                    {['REJECTED', 'CANCELLED'].includes(orderDetail.status) && (
                                        <div className="flex items-center gap-2 text-xs text-zinc-400 italic">
                                            <XCircleIcon className="w-4 h-4 shrink-0" />
                                            <span>{t('supplier.orders.terminalStatusMsg') || 'This order or RFQ is closed. No further status changes are permitted.'}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </AccessibleModal>

            <ProcurementDocumentModal
                isOpen={docModalOpen}
                onClose={() => setDocModalOpen(false)}
                orderId={selectedDocOrderId}
                initialDocType={selectedDocType}
                fetchDocFn={(orderId, type) => getSupplierOrderDocument(orderId, type)}
            />
        </div>
    );
};
