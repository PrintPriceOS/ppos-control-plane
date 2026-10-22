import React, { useEffect, useState, useTransition } from 'react';
import { 
    RectangleStackIcon, 
    DocumentTextIcon, 
    ArrowUpTrayIcon, 
    PlusIcon, 
    MagnifyingGlassIcon,
    FunnelIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    EyeIcon,
    PencilSquareIcon,
    ShieldCheckIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import { adminFetch } from '../../lib/adminApi';
import { getUserRole, getAuthUser } from '../../lib/authStore';
import { TechnicalImportModal } from '../../components/supplier/TechnicalImportModal';
import { StatusBadge } from '../../components/StatusBadge';

export const SupplierCatalogOffersPage: React.FC = () => {
    const role = getUserRole();
    const user = getAuthUser();
    const isReadOnly = role === 'SUPPLIER_VIEWER';

    const [activeTab, setActiveTab] = useState<'CATALOG' | 'OFFERS'>('CATALOG');
    const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

    // Catalog state
    const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
    const [catalogPage, setCatalogPage] = useState<number>(1);
    const [catalogTotalPages, setCatalogTotalPages] = useState<number>(1);
    const [catalogSearch, setCatalogSearch] = useState<string>('');
    const [catalogCategory, setCatalogCategory] = useState<string>('');
    const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);

    // Offers state
    const [offers, setOffers] = useState<any[]>([]);
    const [offersPage, setOffersPage] = useState<number>(1);
    const [offersTotalPages, setOffersTotalPages] = useState<number>(1);
    const [offersSearch, setOffersSearch] = useState<string>('');
    const [offersStatusFilter, setOffersStatusFilter] = useState<string>('');
    const [loadingOffers, setLoadingOffers] = useState<boolean>(false);

    // Offer Creation / Edition Modal State
    const [isOfferModalOpen, setIsOfferModalOpen] = useState<boolean>(false);
    const [selectedVariant, setSelectedVariant] = useState<any>(null);
    const [editingOffer, setEditingOffer] = useState<any>(null);
    const [offerForm, setOfferForm] = useState({
        supplierSku: '',
        priceAmount: '',
        currency: 'EUR',
        priceBasis: 'KG',
        sheetsPerPack: '',
        moq: '1',
        orderMultiple: '1',
        validFrom: '',
        validUntil: '',
        deliveryZones: 'ES, PT, FR',
        visibility: 'APPROVED_CUSTOMERS',
        changeReason: ''
    });
    const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Revision History Modal
    const [revisionOffer, setRevisionOffer] = useState<any>(null);
    const [isRevisionsModalOpen, setIsRevisionsModalOpen] = useState<boolean>(false);

    const [generalNotice, setGeneralNotice] = useState<string | null>(null);
    const [errorNotice, setErrorNotice] = useState<string | null>(null);

    // Load Catalog
    const fetchCatalog = async (p = catalogPage, q = catalogSearch, cat = catalogCategory) => {
        setLoadingCatalog(true);
        try {
            const params = new URLSearchParams({
                page: String(p),
                limit: '15'
            });
            if (q) params.set('search', q);
            if (cat) params.set('category', cat);

            const res: any = await adminFetch(`/api/v1/paper-suppliers/catalog/products?${params.toString()}`);
            if (res && res.ok) {
                setCatalogProducts(res.data.products || []);
                setCatalogPage(res.data.page || 1);
                setCatalogTotalPages(res.data.totalPages || 1);
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error fetching technical catalog.');
        } finally {
            setLoadingCatalog(false);
        }
    };

    // Load Offers
    const fetchOffers = async (p = offersPage, q = offersSearch, status = offersStatusFilter) => {
        setLoadingOffers(true);
        try {
            const params = new URLSearchParams({
                page: String(p),
                limit: '15'
            });
            if (q) params.set('search', q);
            if (status) params.set('status', status);

            const res: any = await adminFetch(`/api/v1/paper-suppliers/offers?${params.toString()}`);
            if (res && res.ok) {
                setOffers(res.data.offers || []);
                setOffersPage(res.data.page || 1);
                setOffersTotalPages(res.data.totalPages || 1);
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error fetching supplier commercial offers.');
        } finally {
            setLoadingOffers(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'CATALOG') {
            fetchCatalog(1, catalogSearch, catalogCategory);
        } else {
            fetchOffers(1, offersSearch, offersStatusFilter);
        }
    }, [activeTab]);

    const handleOpenCreateOffer = (variant: any) => {
        setSelectedVariant(variant);
        setEditingOffer(null);
        setOfferForm({
            supplierSku: `SKU-${variant.id.slice(0, 8).toUpperCase()}`,
            priceAmount: '',
            currency: 'EUR',
            priceBasis: 'KG',
            sheetsPerPack: '',
            moq: '100',
            orderMultiple: '50',
            validFrom: new Date().toISOString().split('T')[0],
            validUntil: '',
            deliveryZones: 'ES, PT, FR',
            visibility: 'APPROVED_CUSTOMERS',
            changeReason: 'Initial commercial listing'
        });
        setFormError(null);
        setIsOfferModalOpen(true);
    };

    const handleOpenEditOffer = (offer: any) => {
        setEditingOffer(offer);
        setSelectedVariant({
            id: offer.variantId,
            productName: offer.productName,
            finish: offer.finish,
            gsm: offer.gsm,
            widthMm: offer.widthMm,
            heightMm: offer.heightMm
        });
        setOfferForm({
            supplierSku: offer.supplierSku || '',
            priceAmount: String(offer.priceAmount || ''),
            currency: offer.currency || 'EUR',
            priceBasis: offer.priceBasis || 'KG',
            sheetsPerPack: String(offer.sheetsPerPack || ''),
            moq: String(offer.moq || '1'),
            orderMultiple: String(offer.orderMultiple || '1'),
            validFrom: offer.validFrom ? offer.validFrom.split('T')[0] : '',
            validUntil: offer.validUntil ? offer.validUntil.split('T')[0] : '',
            deliveryZones: Array.isArray(offer.deliveryZones) ? offer.deliveryZones.join(', ') : 'ES',
            visibility: offer.visibility || 'APPROVED_CUSTOMERS',
            changeReason: ''
        });
        setFormError(null);
        setIsOfferModalOpen(true);
    };

    const handleSubmitOfferForm = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormSubmitting(true);
        setFormError(null);

        try {
            const zones = offerForm.deliveryZones
                .split(',')
                .map(z => z.trim().toUpperCase())
                .filter(Boolean);

            const payload: any = {
                supplierSku: offerForm.supplierSku.trim(),
                priceAmount: Number(offerForm.priceAmount),
                currency: offerForm.currency,
                priceBasis: offerForm.priceBasis,
                sheetsPerPack: offerForm.priceBasis === 'PACK' ? Number(offerForm.sheetsPerPack) : null,
                moq: Number(offerForm.moq),
                orderMultiple: Number(offerForm.orderMultiple),
                validFrom: offerForm.validFrom || null,
                validUntil: offerForm.validUntil || null,
                deliveryZones: zones,
                visibility: offerForm.visibility,
                changeReason: offerForm.changeReason || 'Commercial conditions updated'
            };

            let res: any;
            if (editingOffer) {
                res = await adminFetch(`/api/v1/paper-suppliers/offers/${editingOffer.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
            } else {
                payload.variantId = selectedVariant.id;
                res = await adminFetch('/api/v1/paper-suppliers/offers', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
            }

            if (res && res.ok) {
                setGeneralNotice(editingOffer ? 'Commercial offer revision created successfully.' : 'New commercial offer published.');
                setIsOfferModalOpen(false);
                if (activeTab === 'OFFERS') {
                    fetchOffers();
                } else {
                    fetchCatalog();
                }
            } else {
                setFormError(res?.error?.message || 'Failed to submit commercial offer.');
            }
        } catch (err: any) {
            setFormError(err.message || 'Operation failed.');
        } finally {
            setFormSubmitting(false);
        }
    };

    const handleToggleOfferStatus = async (offerId: string, currentStatus: string) => {
        const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        try {
            const res: any = await adminFetch(`/api/v1/paper-suppliers/offers/${offerId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus })
            });
            if (res && res.ok) {
                setGeneralNotice(`Offer status set to ${nextStatus}.`);
                fetchOffers();
            } else {
                setErrorNotice(res?.error?.message || 'Failed to update offer status.');
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error updating status.');
        }
    };

    const handleViewRevisions = async (offerId: string) => {
        try {
            const res: any = await adminFetch(`/api/v1/paper-suppliers/offers/${offerId}`);
            if (res && res.ok) {
                setRevisionOffer(res.data);
                setIsRevisionsModalOpen(true);
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Failed to load offer revisions ledger.');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b ppos-border pb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-red-600 text-white">
                            Paper Supplier Hub
                        </span>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                            Phase I3
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        Technical Catalog & Commercial Offers
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        Manage confirmed technical paper variants, link pricing matrices, and configure buyer visibility.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {!isReadOnly && (
                        <button
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold uppercase tracking-wider text-[11px] hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <ArrowUpTrayIcon className="w-4 h-4" />
                            <span>Import Technical Catalog</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Notifications */}
            {generalNotice && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircleIcon className="w-4 h-4 shrink-0" />
                        <span>{generalNotice}</span>
                    </div>
                    <button onClick={() => setGeneralNotice(null)}><XMarkIcon className="w-4 h-4" /></button>
                </div>
            )}

            {errorNotice && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                        <span>{errorNotice}</span>
                    </div>
                    <button onClick={() => setErrorNotice(null)}><XMarkIcon className="w-4 h-4" /></button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-zinc-800 gap-6">
                <button
                    onClick={() => setActiveTab('CATALOG')}
                    className={`pb-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer ${
                        activeTab === 'CATALOG'
                            ? 'border-b-2 border-red-600 text-red-600'
                            : 'text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                    }`}
                >
                    <RectangleStackIcon className="w-4 h-4" />
                    Technical Paper Articles & Variants
                </button>
                <button
                    onClick={() => setActiveTab('OFFERS')}
                    className={`pb-3 text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer ${
                        activeTab === 'OFFERS'
                            ? 'border-b-2 border-red-600 text-red-600'
                            : 'text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                    }`}
                >
                    <DocumentTextIcon className="w-4 h-4" />
                    Commercial Offers & Rates
                </button>
            </div>

            {/* TAB 1: TECHNICAL CATALOG */}
            {activeTab === 'CATALOG' && (
                <div className="space-y-4">
                    {/* Filter & Search Bar */}
                    <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                        <div className="flex items-center gap-2 w-full sm:w-80">
                            <div className="relative w-full">
                                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                                <input
                                    type="text"
                                    placeholder="Search article, brand, finish..."
                                    value={catalogSearch}
                                    onChange={(e) => setCatalogSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchCatalog(1, catalogSearch, catalogCategory)}
                                    className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <select
                                value={catalogCategory}
                                onChange={(e) => {
                                    setCatalogCategory(e.target.value);
                                    fetchCatalog(1, catalogSearch, e.target.value);
                                }}
                                className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                            >
                                <option value="">All Categories</option>
                                <option value="COATED">Coated</option>
                                <option value="UNCOATED">Uncoated</option>
                                <option value="SPECIALTY">Specialty</option>
                                <option value="KRAFT">Kraft</option>
                                <option value="BOARD">Board</option>
                            </select>

                            <button
                                onClick={() => fetchCatalog(1, catalogSearch, catalogCategory)}
                                className="px-3.5 py-1.5 bg-slate-200 dark:bg-zinc-800 font-bold uppercase text-[10px] hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors"
                            >
                                Filter
                            </button>
                        </div>
                    </div>

                    {/* Technical Products & Variants Table */}
                    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    <th className="p-3">Paper Product & Brand</th>
                                    <th className="p-3">Category</th>
                                    <th className="p-3">Finish</th>
                                    <th className="p-3">Certified Variants</th>
                                    <th className="p-3">Dimensions & GSM Specs</th>
                                    <th className="p-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {loadingCatalog ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-zinc-400">Loading technical catalog...</td>
                                    </tr>
                                ) : catalogProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-zinc-400">
                                            No confirmed technical products found. Click "Import Technical Catalog" to stage a supplier data sheet.
                                        </td>
                                    </tr>
                                ) : (
                                    catalogProducts.map((prod) => (
                                        <React.Fragment key={prod.id}>
                                            <tr className="bg-slate-50/50 dark:bg-zinc-900/30 font-bold">
                                                <td className="p-3 text-slate-900 dark:text-white">
                                                    <div>{prod.name}</div>
                                                    <span className="text-[10px] font-mono text-zinc-400">{prod.brand || 'No brand specified'}</span>
                                                </td>
                                                <td className="p-3">
                                                    <span className="px-2 py-0.5 text-[9px] font-bold bg-slate-200 dark:bg-zinc-800">
                                                        {prod.category}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-zinc-500">{prod.finish || '—'}</td>
                                                <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400">
                                                    {prod.variants?.length || 0} variants
                                                </td>
                                                <td colSpan={2} className="p-3 text-right text-zinc-400 text-[10px] uppercase font-mono">
                                                    Product ID: {prod.id.slice(0, 8)}
                                                </td>
                                            </tr>

                                            {/* Sub-rows for Variants */}
                                            {prod.variants && prod.variants.map((v: any) => (
                                                <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/60 pl-4">
                                                    <td className="p-3 pl-8 text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 bg-red-600 rounded-full" />
                                                        <span className="font-mono">{v.widthMm} x {v.heightMm} mm</span>
                                                    </td>
                                                    <td className="p-3 font-mono font-bold text-slate-800 dark:text-zinc-200">
                                                        {v.gsm} gsm
                                                    </td>
                                                    <td className="p-3 font-mono text-zinc-500">
                                                        Caliper: {v.caliperMicrons ? `${v.caliperMicrons} µm` : '—'}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className="text-[10px] font-mono text-zinc-400">
                                                            Grain: {v.grainDirection || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 font-mono text-[10px] text-zinc-400">
                                                        {v.id.slice(0, 8)}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        {!isReadOnly && (
                                                            <button
                                                                onClick={() => handleOpenCreateOffer({ ...v, productName: prod.name, finish: prod.finish })}
                                                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-[10px] transition-colors cursor-pointer"
                                                            >
                                                                + Create Offer
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between text-xs text-zinc-500 pt-2">
                        <span>Page {catalogPage} of {catalogTotalPages}</span>
                        <div className="flex items-center gap-1">
                            <button
                                disabled={catalogPage <= 1}
                                onClick={() => fetchCatalog(catalogPage - 1, catalogSearch, catalogCategory)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40"
                            >
                                Prev
                            </button>
                            <button
                                disabled={catalogPage >= catalogTotalPages}
                                onClick={() => fetchCatalog(catalogPage + 1, catalogSearch, catalogCategory)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: COMMERCIAL OFFERS */}
            {activeTab === 'OFFERS' && (
                <div className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                        <div className="flex items-center gap-2 w-full sm:w-80">
                            <div className="relative w-full">
                                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                                <input
                                    type="text"
                                    placeholder="Search offer by SKU, product name..."
                                    value={offersSearch}
                                    onChange={(e) => setOffersSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchOffers(1, offersSearch, offersStatusFilter)}
                                    className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <select
                                value={offersStatusFilter}
                                onChange={(e) => {
                                    setOffersStatusFilter(e.target.value);
                                    fetchOffers(1, offersSearch, e.target.value);
                                }}
                                className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                            >
                                <option value="">All Statuses</option>
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                                <option value="ARCHIVED">Archived</option>
                            </select>

                            <button
                                onClick={() => fetchOffers(1, offersSearch, offersStatusFilter)}
                                className="px-3.5 py-1.5 bg-slate-200 dark:bg-zinc-800 font-bold uppercase text-[10px] hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors"
                            >
                                Filter
                            </button>
                        </div>
                    </div>

                    {/* Offers Table */}
                    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    <th className="p-3">Supplier SKU</th>
                                    <th className="p-3">Paper Variant</th>
                                    <th className="p-3">Rate & Basis</th>
                                    <th className="p-3">MOQ / Multiple</th>
                                    <th className="p-3">Visibility</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Rev #</th>
                                    <th className="p-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {loadingOffers ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-zinc-400">Loading commercial offers...</td>
                                    </tr>
                                ) : offers.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-zinc-400">
                                            No commercial offers configured. Go to the "Technical Paper Articles" tab and select a variant to publish rates.
                                        </td>
                                    </tr>
                                ) : (
                                    offers.map((off) => (
                                        <tr key={off.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                                            <td className="p-3 font-mono font-bold text-slate-800 dark:text-zinc-200">
                                                {off.supplierSku}
                                            </td>
                                            <td className="p-3">
                                                <div className="font-bold text-slate-900 dark:text-white">{off.productName || 'Paper Product'}</div>
                                                <div className="text-[10px] text-zinc-400 font-mono">
                                                    {off.gsm} gsm · {off.widthMm}x{off.heightMm} mm · {off.finish || 'Standard'}
                                                </div>
                                            </td>
                                            <td className="p-3 font-mono">
                                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                                    {Number(off.priceAmount).toFixed(2)} {off.currency}
                                                </span>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">
                                                    / {off.priceBasis}
                                                    {off.priceBasis === 'PACK' && off.sheetsPerPack ? ` (${off.sheetsPerPack} sh)` : ''}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono text-[11px]">
                                                <span>Min: {off.moq}</span>
                                                <span className="text-zinc-400 ml-1">· Step: {off.orderMultiple}</span>
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                                    off.visibility === 'MARKETPLACE'
                                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                        : off.visibility === 'APPROVED_CUSTOMERS'
                                                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                                        : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20'
                                                }`}>
                                                    {off.visibility}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <StatusBadge status={off.status} />
                                            </td>
                                            <td className="p-3 font-mono">
                                                <button
                                                    onClick={() => handleViewRevisions(off.id)}
                                                    className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                                                >
                                                    <ClockIcon className="w-3.5 h-3.5" />
                                                    v{off.revisionNumber || 1}
                                                </button>
                                            </td>
                                            <td className="p-3 text-right">
                                                {!isReadOnly && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleOpenEditOffer(off)}
                                                            className="p-1 text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                                            title="Edit Commercial Conditions"
                                                        >
                                                            <PencilSquareIcon className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleOfferStatus(off.id, off.status)}
                                                            className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                                                                off.status === 'ACTIVE'
                                                                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-red-600 hover:text-white'
                                                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                            }`}
                                                        >
                                                            {off.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between text-xs text-zinc-500 pt-2">
                        <span>Page {offersPage} of {offersTotalPages}</span>
                        <div className="flex items-center gap-1">
                            <button
                                disabled={offersPage <= 1}
                                onClick={() => fetchOffers(offersPage - 1, offersSearch, offersStatusFilter)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40"
                            >
                                Prev
                            </button>
                            <button
                                disabled={offersPage >= offersTotalPages}
                                onClick={() => fetchOffers(offersPage + 1, offersSearch, offersStatusFilter)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE / EDIT OFFER MODAL */}
            {isOfferModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 w-full max-w-xl shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
                            <div>
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-red-600 text-white">
                                    {editingOffer ? 'Commercial Revision' : 'New Commercial Offer'}
                                </span>
                                <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                                    {editingOffer ? `Edit Offer: ${editingOffer.supplierSku}` : 'Link Commercial Offer to Variant'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsOfferModalOpen(false)}
                                className="p-1 text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Variant Summary */}
                        {selectedVariant && (
                            <div className="p-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs">
                                <p className="font-bold text-slate-900 dark:text-white">{selectedVariant.productName}</p>
                                <p className="text-zinc-500 font-mono text-[11px] mt-0.5">
                                    {selectedVariant.gsm} gsm · {selectedVariant.widthMm} x {selectedVariant.heightMm} mm · {selectedVariant.finish || 'Standard'}
                                </p>
                            </div>
                        )}

                        {formError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                                <span>{formError}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmitOfferForm} className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Supplier SKU *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={offerForm.supplierSku}
                                        onChange={(e) => setOfferForm({ ...offerForm, supplierSku: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Currency *
                                    </label>
                                    <select
                                        value={offerForm.currency}
                                        onChange={(e) => setOfferForm({ ...offerForm, currency: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-bold"
                                    >
                                        <option value="EUR">EUR (€)</option>
                                        <option value="USD">USD ($)</option>
                                        <option value="GBP">GBP (£)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Unit Price Amount *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        min="0.0001"
                                        required
                                        placeholder="e.g. 1.4500"
                                        value={offerForm.priceAmount}
                                        onChange={(e) => setOfferForm({ ...offerForm, priceAmount: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono font-bold"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Price Basis *
                                    </label>
                                    <select
                                        value={offerForm.priceBasis}
                                        onChange={(e) => setOfferForm({ ...offerForm, priceBasis: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-bold"
                                    >
                                        <option value="KG">KG (per Kilogram)</option>
                                        <option value="TONNE">TONNE (per Metric Tonne)</option>
                                        <option value="SHEET">SHEET (per Individual Sheet)</option>
                                        <option value="THOUSAND_SHEETS">THOUSAND_SHEETS (per 1,000 Sheets)</option>
                                        <option value="PACK">PACK (per Sealed Ream / Pack)</option>
                                    </select>
                                </div>
                            </div>

                            {/* PACK specific requirement */}
                            {offerForm.priceBasis === 'PACK' && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 space-y-1">
                                    <label className="block text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                                        Sheets per Pack * (Mandatory for PACK basis)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        placeholder="e.g. 500"
                                        value={offerForm.sheetsPerPack}
                                        onChange={(e) => setOfferForm({ ...offerForm, sheetsPerPack: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-amber-500/40 font-mono font-bold"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Minimum Order Quantity (MOQ) *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        value={offerForm.moq}
                                        onChange={(e) => setOfferForm({ ...offerForm, moq: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Order Multiple *
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        value={offerForm.orderMultiple}
                                        onChange={(e) => setOfferForm({ ...offerForm, orderMultiple: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Valid From
                                    </label>
                                    <input
                                        type="date"
                                        value={offerForm.validFrom}
                                        onChange={(e) => setOfferForm({ ...offerForm, validFrom: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Valid Until
                                    </label>
                                    <input
                                        type="date"
                                        value={offerForm.validUntil}
                                        onChange={(e) => setOfferForm({ ...offerForm, validUntil: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Delivery Coverage Zones (CSV)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="ES, PT, FR"
                                        value={offerForm.deliveryZones}
                                        onChange={(e) => setOfferForm({ ...offerForm, deliveryZones: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono uppercase"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Visibility Matrix *
                                    </label>
                                    <select
                                        value={offerForm.visibility}
                                        onChange={(e) => setOfferForm({ ...offerForm, visibility: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-bold"
                                    >
                                        <option value="APPROVED_CUSTOMERS">Approved Customers Only</option>
                                        <option value="MARKETPLACE">Public Marketplace</option>
                                        <option value="PRIVATE">Private (Restricted)</option>
                                    </select>
                                </div>
                            </div>

                            {editingOffer && (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        Reason for Commercial Change *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Q4 Raw pulp index adjustment"
                                        value={offerForm.changeReason}
                                        onChange={(e) => setOfferForm({ ...offerForm, changeReason: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
                                    />
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
                                <button
                                    type="button"
                                    onClick={() => setIsOfferModalOpen(false)}
                                    className="px-4 py-2 border border-slate-300 dark:border-zinc-700 font-bold uppercase text-[10px]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={formSubmitting}
                                    className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold uppercase text-[11px] transition-colors"
                                >
                                    {formSubmitting ? 'Saving...' : editingOffer ? 'Record Revision' : 'Publish Offer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* REVISIONS HISTORY MODAL */}
            {isRevisionsModalOpen && revisionOffer && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 w-full max-w-2xl shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
                            <div>
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-red-600 text-white">
                                    Audit Ledger
                                </span>
                                <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                                    Price & Terms Revision History: {revisionOffer.offer?.supplierSku}
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsRevisionsModalOpen(false)}
                                className="p-1 text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                            {revisionOffer.revisions && revisionOffer.revisions.map((rev: any) => (
                                <div key={rev.id} className="p-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="px-1.5 py-0.2 bg-red-600 text-white text-[10px] font-mono">
                                                v{rev.revisionNumber}
                                            </span>
                                            <span>{rev.priceAmount} {rev.currency} / {rev.priceBasis}</span>
                                        </span>
                                        <span className="text-[10px] font-mono text-zinc-400">
                                            {new Date(rev.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-zinc-500">
                                        <span>MOQ: {rev.moq}</span>
                                        <span className="ml-2">· Step: {rev.orderMultiple}</span>
                                        <span className="ml-2">· Visibility: {rev.visibility}</span>
                                    </div>
                                    <div className="text-[10px] italic text-zinc-400">
                                        Reason: "{rev.changeReason || 'No reason specified'}"
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-zinc-800">
                            <button
                                onClick={() => setIsRevisionsModalOpen(false)}
                                className="px-4 py-2 bg-slate-800 text-white font-bold uppercase text-[10px]"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Technical Import Modal */}
            <TechnicalImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImportConfirmed={() => {
                    fetchCatalog(1, catalogSearch, catalogCategory);
                    setGeneralNotice('Technical catalog import processed and updated.');
                }}
            />
        </div>
    );
};
