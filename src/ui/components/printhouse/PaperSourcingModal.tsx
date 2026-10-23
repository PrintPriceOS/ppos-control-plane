import React, { useState, useEffect, useCallback } from 'react';
import {
    MagnifyingGlassIcon,
    ShoppingBagIcon,
    TruckIcon,
    ClockIcon,
    CheckCircleIcon,
    XMarkIcon,
    ArrowPathIcon,
    ShieldCheckIcon,
    DocumentTextIcon,
    CurrencyEuroIcon,
    InformationCircleIcon,
    InboxIcon,
    ArrowDownTrayIcon,
    ScaleIcon
} from '@heroicons/react/24/outline';
import { AccessibleModal } from '../AccessibleModal';
import * as adminApi from '../../lib/adminApi';
import { getUserPrinthouseId, getUserTenantId } from '../../lib/authStore';
import { useLocale } from '../../i18n';

interface PaperSourcingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStockUpdated?: () => void;
}

export const PaperSourcingModal: React.FC<PaperSourcingModalProps> = ({
    isOpen,
    onClose,
    onStockUpdated
}) => {
    const { t } = useLocale();
    const printhouseId = getUserPrinthouseId() || 'node_plant_frankfurt';
    const tenantId = getUserTenantId();

    const [activeTab, setActiveTab] = useState<'CATALOG' | 'MY_ORDERS'>('CATALOG');

    // Catalog search state
    const [offers, setOffers] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [gsmFilter, setGsmFilter] = useState('');
    const [loadingOffers, setLoadingOffers] = useState(false);
    const [offersError, setOffersError] = useState<string | null>(null);

    // Selected offer & order placement state
    const [selectedOffer, setSelectedOffer] = useState<any | null>(null);
    const [orderType, setOrderType] = useState<'ORDER' | 'RFQ'>('ORDER');
    const [orderedQuantity, setOrderedQuantity] = useState<string>('1000');
    const [buyerNotes, setBuyerNotes] = useState<string>('');
    const [targetPrice, setTargetPrice] = useState<string>('');
    const [submittingOrder, setSubmittingOrder] = useState(false);
    const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);
    const [orderErrorMsg, setOrderErrorMsg] = useState<string | null>(null);

    // My Procurements state
    const [procurementOrders, setProcurementOrders] = useState<any[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [ordersError, setOrdersError] = useState<string | null>(null);

    // Intake / Receipt Dialog State
    const [receivingOrder, setReceivingOrder] = useState<any | null>(null);
    const [receiveSheets, setReceiveSheets] = useState<string>('');
    const [receiveNotes, setReceiveNotes] = useState<string>('');
    const [submittingReceipt, setSubmittingReceipt] = useState(false);
    const [receiptError, setReceiptError] = useState<string | null>(null);

    // Load available offers
    const fetchOffers = useCallback(async () => {
        setLoadingOffers(true);
        setOffersError(null);
        try {
            const res = await adminApi.searchPaperSourcingOffers({
                query: searchQuery.trim() || undefined,
                gsmMin: gsmFilter ? parseInt(gsmFilter, 10) - 20 : undefined,
                gsmMax: gsmFilter ? parseInt(gsmFilter, 10) + 20 : undefined,
                limit: 50
            });
            if (res?.ok && res?.data?.items) {
                setOffers(res.data.items);
            } else {
                setOffers([]);
            }
        } catch (err: any) {
            setOffers([]);
            setOffersError(err.message || 'Failed to search paper offers');
        } finally {
            setLoadingOffers(false);
        }
    }, [searchQuery, gsmFilter]);

    // Load my printhouse procurement orders
    const fetchProcurementOrders = useCallback(async () => {
        setLoadingOrders(true);
        setOrdersError(null);
        try {
            const res = await adminApi.listPrinthousePaperOrders({ limit: 50 });
            if (res?.ok && res?.data?.items) {
                setProcurementOrders(res.data.items);
            } else {
                setProcurementOrders([]);
            }
        } catch (err: any) {
            setProcurementOrders([]);
            setOrdersError(err.message || 'Failed to load procurement orders');
        } finally {
            setLoadingOrders(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            if (activeTab === 'CATALOG') {
                fetchOffers();
            } else {
                fetchProcurementOrders();
            }
        }
    }, [isOpen, activeTab, fetchOffers, fetchProcurementOrders]);

    // Live calculation of sheets and price
    const calculatedEstimate = React.useMemo(() => {
        if (!selectedOffer) return null;
        const qty = parseFloat(orderedQuantity) || 0;
        const basis = selectedOffer.priceBasis || 'KG';
        const pricePerUnit = parseFloat(selectedOffer.priceAmount) || 0;
        const widthMm = selectedOffer.variant?.widthMm || 700;
        const heightMm = selectedOffer.variant?.heightMm || 1000;
        const gsm = selectedOffer.variant?.gsm || 150;
        const sheetsPerPack = selectedOffer.sheetsPerPack || 500;

        let totalSheets = 0;
        if (basis === 'SHEET') {
            totalSheets = Math.round(qty);
        } else if (basis === 'THOUSAND_SHEETS') {
            totalSheets = Math.round(qty * 1000);
        } else if (basis === 'PACK') {
            totalSheets = Math.round(qty * sheetsPerPack);
        } else if (basis === 'KG' || basis === 'TONNE') {
            const kg = basis === 'TONNE' ? qty * 1000 : qty;
            const sheetAreaSqm = (widthMm * heightMm) / 1_000_000;
            const singleSheetWeightKg = sheetAreaSqm * (gsm / 1000);
            totalSheets = singleSheetWeightKg > 0 ? Math.round(kg / singleSheetWeightKg) : 0;
        }

        const estimatedAmount = qty * pricePerUnit;

        return {
            totalSheets,
            estimatedAmount,
            currency: selectedOffer.currency || 'EUR'
        };
    }, [selectedOffer, orderedQuantity]);

    // Handle submit purchase order or RFQ
    const handleSubmitOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOffer) return;
        setSubmittingOrder(true);
        setOrderErrorMsg(null);
        setOrderSuccessMsg(null);

        try {
            const qty = parseFloat(orderedQuantity);
            if (!qty || qty <= 0) {
                throw new Error('Please enter a valid order quantity');
            }

            const res = await adminApi.placePaperSourcingOrder({
                type: orderType,
                offerId: selectedOffer.id,
                variantId: selectedOffer.variantId || selectedOffer.variant?.id,
                orderedQuantity: qty,
                quantityBasis: selectedOffer.priceBasis || 'KG',
                printhouseId,
                buyerNotes: buyerNotes.trim() || undefined,
                targetPrice: targetPrice ? parseFloat(targetPrice) : undefined
            });

            if (res?.ok) {
                setOrderSuccessMsg(
                    orderType === 'RFQ'
                        ? 'RFQ submitted successfully. The paper supplier will review and transmit a customized quote.'
                        : 'Purchase order placed successfully and transmitted to the supplier fulfillment desk.'
                );
                setSelectedOffer(null);
                setBuyerNotes('');
                // Switch to orders tab to see it
                setTimeout(() => {
                    setActiveTab('MY_ORDERS');
                    fetchProcurementOrders();
                }, 1200);
            } else {
                setOrderErrorMsg((res as any)?.error?.message || 'Failed to place order');
            }
        } catch (err: any) {
            setOrderErrorMsg(err.message || 'Failed to place order');
        } finally {
            setSubmittingOrder(false);
        }
    };

    // Accept Supplier Quote for RFQ
    const handleAcceptQuote = async (orderId: string) => {
        try {
            const res = await adminApi.acceptPaperRfqQuote(orderId);
            if (res?.ok) {
                await fetchProcurementOrders();
            } else {
                alert((res as any)?.error?.message || 'Failed to accept quote');
            }
        } catch (err: any) {
            alert(err.message || 'Failed to accept quote');
        }
    };

    // Warehouse Goods Intake Receipt Submission
    const handleExecuteReceipt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!receivingOrder) return;
        setSubmittingReceipt(true);
        setReceiptError(null);

        try {
            const sheets = parseInt(receiveSheets, 10);
            if (!sheets || sheets <= 0) {
                throw new Error('Please enter a valid count of received sheets');
            }

            const idempotencyKey = `rcpt_${receivingOrder.id}_${Date.now()}`;
            const res = await adminApi.receivePaperProcurementOrder(receivingOrder.id, {
                receivedSheets: sheets,
                idempotencyKey,
                notes: receiveNotes.trim() || undefined
            });

            if (res?.ok) {
                setReceivingOrder(null);
                setReceiveSheets('');
                setReceiveNotes('');
                await fetchProcurementOrders();
                if (onStockUpdated) onStockUpdated();
            } else {
                setReceiptError((res as any)?.error?.message || 'Receipt verification failed');
            }
        } catch (err: any) {
            setReceiptError(err.message || 'Receipt verification failed');
        } finally {
            setSubmittingReceipt(false);
        }
    };

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title={t('materials.sourcing.title') || 'Paper Supplier Sourcing & RFQ Hub'}
            subtitle={t('materials.sourcing.subtitle') || 'Order directly from verified paper suppliers or request volume-discount quotes for your plant.'}
            maxWidth="max-w-5xl"
        >
            <div className="space-y-5">
                {/* Tab switch */}
                <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                    <button
                        onClick={() => setActiveTab('CATALOG')}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            activeTab === 'CATALOG'
                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                    >
                        <ShoppingBagIcon className="w-4 h-4" />
                        <span>{t('materials.sourcing.tabCatalog') || 'Paper Marketplace & Offers'}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('MY_ORDERS')}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            activeTab === 'MY_ORDERS'
                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                    >
                        <TruckIcon className="w-4 h-4" />
                        <span>{t('materials.sourcing.tabMyOrders') || 'Plant Procurements & Intakes'}</span>
                        {procurementOrders.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-600 text-white">
                                {procurementOrders.length}
                            </span>
                        )}
                    </button>
                </div>

                {orderSuccessMsg && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                        <CheckCircleIcon className="w-5 h-5 shrink-0" />
                        <span>{orderSuccessMsg}</span>
                    </div>
                )}

                {/* TAB 1: CATALOG OFFERS */}
                {activeTab === 'CATALOG' && (
                    <div className="space-y-4">
                        {/* Search & Filters */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="relative sm:col-span-2">
                                <MagnifyingGlassIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t('materials.sourcing.searchPlaceholder') || 'Search paper brand, manufacturer, format, SKU...'}
                                    className="w-full pl-9 pr-4 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <input
                                    type="number"
                                    value={gsmFilter}
                                    onChange={(e) => setGsmFilter(e.target.value)}
                                    placeholder="Filter GSM (e.g. 150)"
                                    className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>

                        {offersError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl">
                                {offersError}
                            </div>
                        )}

                        {/* Offers Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                            {loadingOffers ? (
                                <div className="col-span-2 py-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-2">
                                    <ArrowPathIcon className="w-6 h-6 animate-spin text-zinc-400" />
                                    <span className="text-xs">Searching visible paper catalog...</span>
                                </div>
                            ) : offers.length === 0 ? (
                                <div className="col-span-2 py-12 text-center text-zinc-400">
                                    <InboxIcon className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
                                    <p className="text-xs font-semibold">No visible paper offers found matching criteria.</p>
                                </div>
                            ) : (
                                offers.map((offer) => {
                                    const isSelected = selectedOffer?.id === offer.id;
                                    return (
                                        <div
                                            key={offer.id}
                                            onClick={() => setSelectedOffer(offer)}
                                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                                                isSelected
                                                    ? 'bg-red-50/50 dark:bg-red-950/20 border-red-600 shadow-xs'
                                                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                                            }`}
                                        >
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">
                                                        {offer.supplierName || offer.supplier?.name || 'Verified Supplier'}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                                        {offer.supplierSku || offer.variant?.supplierSku || offer.variant?.sku || ''}
                                                    </span>
                                                </div>
                                                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                                                    {offer.productName || offer.variant?.productName || ''}
                                                </h4>
                                                <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-1">
                                                    <span>{offer.variant?.widthMm} × {offer.variant?.heightMm} mm</span>
                                                    <span>•</span>
                                                    <span>{offer.variant?.gsm} gsm</span>
                                                    <span>•</span>
                                                    <span className="capitalize">{offer.variant?.finish?.toLowerCase() || 'Uncoated'}</span>
                                                </div>
                                            </div>

                                            <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-baseline justify-between">
                                                <div>
                                                    <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                                                        {offer.currency} {Number(offer.priceAmount).toFixed(2)}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-400 font-mono ml-1">
                                                        / {offer.priceBasis}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-zinc-400 font-mono">
                                                    MOQ: {offer.moq ?? offer.minOrderQuantity ?? 1} {offer.priceBasis}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Order Placement Form if an offer is selected */}
                        {selectedOffer && (
                            <form onSubmit={handleSubmitOrder} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl space-y-4">
                                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white uppercase">
                                            {orderType === 'ORDER' ? 'Direct Order' : 'RFQ Request'}
                                        </span>
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                                            {selectedOffer.productName || selectedOffer.variant?.productName} ({selectedOffer.supplierSku || selectedOffer.variant?.supplierSku || selectedOffer.variant?.sku || ''})
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedOffer(null)}
                                        className="text-zinc-400 hover:text-zinc-600 text-xs font-semibold cursor-pointer"
                                    >
                                        [Cancel selection]
                                    </button>
                                </div>

                                {orderErrorMsg && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl">
                                        {orderErrorMsg}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                    <div>
                                        <label htmlFor="sourcing-order-type" className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                            Order Type
                                        </label>
                                        <select
                                            id="sourcing-order-type"
                                            value={orderType}
                                            onChange={(e) => setOrderType(e.target.value as any)}
                                            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-medium focus:outline-none"
                                        >
                                            <option value="ORDER">Direct Purchase Order (PO)</option>
                                            <option value="RFQ">Request for Quote (RFQ)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="sourcing-order-quantity" className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                            Order Quantity ({selectedOffer.priceBasis}) *
                                        </label>
                                        <input
                                            id="sourcing-order-quantity"
                                            type="number"
                                            step="any"
                                            value={orderedQuantity}
                                            onChange={(e) => setOrderedQuantity(e.target.value)}
                                            min={selectedOffer.moq || 1}
                                            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="sourcing-target-price" className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                            Target Price ({selectedOffer.currency})
                                        </label>
                                        <input
                                            id="sourcing-target-price"
                                            type="number"
                                            step="0.01"
                                            value={targetPrice}
                                            onChange={(e) => setTargetPrice(e.target.value)}
                                            placeholder="Optional target"
                                            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="sourcing-buyer-notes" className="block text-[11px] font-semibold text-zinc-500 mb-1">
                                        Plant Shipping Instructions & Notes
                                    </label>
                                    <input
                                        id="sourcing-buyer-notes"
                                        type="text"
                                        value={buyerNotes}
                                        onChange={(e) => setBuyerNotes(e.target.value)}
                                        placeholder="e.g. Unloading bay #2, tail lift truck required."
                                        className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs focus:outline-none"
                                    />
                                </div>

                                {/* Summary preview */}
                                {calculatedEstimate && (
                                    <div className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs">
                                        <div className="flex items-center gap-4">
                                            <div>
                                                <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Calculated Sheets</span>
                                                <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{calculatedEstimate.totalSheets.toLocaleString()} sh</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-zinc-400 block font-semibold uppercase">Estimated Amount</span>
                                                <span className="font-mono font-black text-slate-900 dark:text-white">
                                                    {calculatedEstimate.currency} {calculatedEstimate.estimatedAmount.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={submittingOrder}
                                            className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-2xs cursor-pointer disabled:opacity-50"
                                        >
                                            {submittingOrder ? 'Submitting...' : orderType === 'ORDER' ? 'Transmit Purchase Order' : 'Submit RFQ Proposal'}
                                        </button>
                                    </div>
                                )}
                            </form>
                        )}
                    </div>
                )}

                {/* TAB 2: MY PROCUREMENTS & INTAKE */}
                {activeTab === 'MY_ORDERS' && (
                    <div className="space-y-4">
                        {ordersError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl">
                                {ordersError}
                            </div>
                        )}

                        <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden max-h-[420px] overflow-y-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-400 text-[10px] uppercase font-semibold border-b border-zinc-200 dark:border-zinc-800">
                                    <tr>
                                        <th className="py-2.5 px-3">Order / RFQ</th>
                                        <th className="py-2.5 px-3">Supplier</th>
                                        <th className="py-2.5 px-3">Material</th>
                                        <th className="py-2.5 px-3">Volume & Sheets</th>
                                        <th className="py-2.5 px-3">Amount</th>
                                        <th className="py-2.5 px-3">Status</th>
                                        <th className="py-2.5 px-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {loadingOrders ? (
                                        <tr>
                                            <td colSpan={7} className="py-12 text-center text-zinc-400">
                                                <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-1 text-zinc-400" />
                                                <span>Loading procurements...</span>
                                            </td>
                                        </tr>
                                    ) : procurementOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-12 text-center text-zinc-400">
                                                <InboxIcon className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600 mb-1" />
                                                <span>No paper procurements recorded yet.</span>
                                            </td>
                                        </tr>
                                    ) : (
                                        procurementOrders.map((ord) => (
                                            <tr key={ord.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                                                <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-zinc-200">
                                                    <div>{ord.orderNumber}</div>
                                                    <span className="text-[10px] font-sans font-medium text-zinc-400">{ord.type}</span>
                                                </td>
                                                <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-zinc-200">
                                                    {ord.supplierName}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <div className="font-medium text-slate-900 dark:text-white truncate max-w-xs">{ord.snapshotProductName}</div>
                                                    <div className="text-[10px] text-zinc-400">{ord.snapshotGsm} gsm • {ord.snapshotWidthMm}x{ord.snapshotHeightMm}mm</div>
                                                </td>
                                                <td className="py-2.5 px-3 font-mono">
                                                    <div>{ord.orderedQuantity} {ord.quantityBasis}</div>
                                                    <div className="text-[10px] text-zinc-400">({ord.totalSheets?.toLocaleString()} sh)</div>
                                                </td>
                                                <td className="py-2.5 px-3 font-mono font-bold">
                                                    {ord.currency} {Number(ord.quoteTotalAmount || ord.totalAmount).toFixed(2)}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                        ord.status === 'RECEIVED' ? 'bg-emerald-500/10 text-emerald-500' :
                                                        ord.status === 'CONFIRMED' || ord.status === 'DISPATCHED' ? 'bg-blue-500/10 text-blue-500' :
                                                        ord.status === 'QUOTED' ? 'bg-purple-500/10 text-purple-500' :
                                                        'bg-amber-500/10 text-amber-500'
                                                    }`}>
                                                        {ord.status}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    {ord.type === 'RFQ' && ord.status === 'QUOTED' && (
                                                        <button
                                                            onClick={() => handleAcceptQuote(ord.id)}
                                                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-600 hover:bg-purple-700 text-white cursor-pointer shadow-2xs"
                                                        >
                                                            Accept Quote
                                                        </button>
                                                    )}
                                                    {['CONFIRMED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'PARTIALLY_RECEIVED'].includes(ord.status) && (
                                                        <button
                                                            onClick={() => {
                                                                setReceivingOrder(ord);
                                                                setReceiveSheets(String(ord.totalSheets - (ord.receivedSheets || 0)));
                                                            }}
                                                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                                        >
                                                            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                                            <span>Receive</span>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Goods Receipt Intake Dialog */}
                        {receivingOrder && (
                            <form onSubmit={handleExecuteReceipt} className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                                    <h5 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <ArrowDownTrayIcon className="w-4 h-4" />
                                        <span>Warehouse Intake Verification: {receivingOrder.orderNumber}</span>
                                    </h5>
                                    <button
                                        type="button"
                                        onClick={() => setReceivingOrder(null)}
                                        className="text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer"
                                    >
                                        [Cancel]
                                    </button>
                                </div>

                                {receiptError && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl">
                                        {receiptError}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                            Verified Received Sheets Count *
                                        </label>
                                        <input
                                            type="number"
                                            value={receiveSheets}
                                            onChange={(e) => setReceiveSheets(e.target.value)}
                                            max={receivingOrder.totalSheets - (receivingOrder.receivedSheets || 0)}
                                            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono text-xs focus:outline-none"
                                        />
                                        <p className="text-[10px] text-zinc-400 mt-1">
                                            Remaining order balance: {receivingOrder.totalSheets - (receivingOrder.receivedSheets || 0)} sheets
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1">
                                            Intake Delivery Notes
                                        </label>
                                        <input
                                            type="text"
                                            value={receiveNotes}
                                            onChange={(e) => setReceiveNotes(e.target.value)}
                                            placeholder="e.g. Scanned into Bay 3 without damage."
                                            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setReceivingOrder(null)}
                                        className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submittingReceipt || !receiveSheets}
                                        className="px-4 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer disabled:opacity-50"
                                    >
                                        {submittingReceipt ? 'Verifying & Stocking...' : 'Confirm Receipt & Credit Stock'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </AccessibleModal>
    );
};
