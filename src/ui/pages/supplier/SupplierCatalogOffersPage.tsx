import React, { useEffect, useState } from 'react';
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
    XMarkIcon,
    InformationCircleIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch, SupplierApiError } from '../../lib/paperSupplierApi';
import { getUserRole, getAuthUser } from '../../lib/authStore';
import { TechnicalImportModal } from '../../components/supplier/TechnicalImportModal';
import { StatusBadge } from '../../components/StatusBadge';
import { useLocale } from '../../i18n';

export const SupplierCatalogOffersPage: React.FC = () => {
    const { t } = useLocale();
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

    // Technical Variant Detail Modal State
    const [variantDetailModalOpen, setVariantDetailModalOpen] = useState<boolean>(false);
    const [viewingVariant, setViewingVariant] = useState<any>(null);
    const [loadingVariantDetail, setLoadingVariantDetail] = useState<boolean>(false);

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
        setErrorNotice(null);
        try {
            const params = new URLSearchParams({
                page: String(p),
                limit: '15'
            });
            if (q) params.set('search', q);
            if (cat) params.set('category', cat);

            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/products?${params.toString()}`);
            if (res && res.ok && res.data) {
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
        setErrorNotice(null);
        try {
            const params = new URLSearchParams({
                page: String(p),
                limit: '15'
            });
            if (q) params.set('search', q);
            if (status) params.set('status', status);

            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/offers?${params.toString()}`);
            if (res && res.ok && res.data) {
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

    const handleViewVariantDetail = async (variantId: string) => {
        setLoadingVariantDetail(true);
        setVariantDetailModalOpen(true);
        setErrorNotice(null);
        try {
            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/variants/${variantId}`);
            if (res && res.ok && res.data) {
                setViewingVariant(res.data);
            } else {
                setErrorNotice('Could not load variant technical specifications.');
                setVariantDetailModalOpen(false);
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error loading variant detail.');
            setVariantDetailModalOpen(false);
        } finally {
            setLoadingVariantDetail(false);
        }
    };

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
        const details = offer.variantDetails || {};
        setSelectedVariant({
            id: offer.variantId,
            productName: details.productName || offer.productName,
            finish: details.finish || offer.finish,
            gsm: details.gsm || offer.gsm,
            widthMm: details.widthMm || offer.widthMm,
            heightMm: details.heightMm || offer.heightMm
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
                res = await paperSupplierFetch(`/api/v1/paper-suppliers/offers/${editingOffer.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
            } else {
                payload.variantId = selectedVariant.id;
                res = await paperSupplierFetch('/api/v1/paper-suppliers/offers', {
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
                setFormError('Failed to submit commercial offer.');
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
            const res = await paperSupplierFetch(`/api/v1/paper-suppliers/offers/${offerId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus })
            });
            if (res && res.ok) {
                setGeneralNotice(`Offer status set to ${nextStatus}.`);
                fetchOffers();
            } else {
                setErrorNotice('Failed to update offer status.');
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error updating status.');
        }
    };

    const handleViewRevisions = async (offerId: string) => {
        try {
            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/offers/${offerId}`);
            if (res && res.ok && res.data) {
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
                        {t('supplier.hub.title')}
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        {t('supplier.hub.subtitle')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {!isReadOnly && (
                        <button
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold uppercase tracking-wider text-[11px] hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <ArrowUpTrayIcon className="w-4 h-4" />
                            <span>{t('supplier.hub.importButton')}</span>
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
                    {t('supplier.hub.tabCatalog')}
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
                    {t('supplier.hub.tabOffers')}
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
                                    placeholder={t('supplier.hub.searchCatalog')}
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
                                <option value="">{t('supplier.hub.filterAllCategories')}</option>
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
                                {t('supplier.hub.filterButton')}
                            </button>
                        </div>
                    </div>

                    {/* Technical Products & Variants Table */}
                    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    <th className="p-3">{t('supplier.hub.colProduct')}</th>
                                    <th className="p-3">{t('supplier.hub.colCategory')}</th>
                                    <th className="p-3">{t('supplier.hub.colFinish')}</th>
                                    <th className="p-3">{t('supplier.hub.colVariants')}</th>
                                    <th className="p-3">{t('supplier.hub.colSpecs')}</th>
                                    <th className="p-3 text-right">{t('supplier.hub.colActions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {loadingCatalog ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-zinc-400">{t('supplier.hub.loadingCatalog')}</td>
                                    </tr>
                                ) : catalogProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-zinc-400">
                                            {t('supplier.hub.noVariants')}
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
                                                        Caliper: {v.caliperUm ? `${v.caliperUm} µm` : (v.caliperMicrons ? `${v.caliperMicrons} µm` : '—')}
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
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => handleViewVariantDetail(v.id)}
                                                                className="px-2 py-1 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold uppercase text-[10px] transition-colors cursor-pointer"
                                                                title={t('supplier.hub.viewVariantDetails')}
                                                            >
                                                                {t('supplier.hub.viewVariantDetails')}
                                                            </button>
                                                            {!isReadOnly && (
                                                                <button
                                                                    onClick={() => handleOpenCreateOffer({ ...v, productName: prod.name, finish: prod.finish })}
                                                                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-[10px] transition-colors cursor-pointer"
                                                                >
                                                                    {t('supplier.hub.createOffer')}
                                                                </button>
                                                            )}
                                                        </div>
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
                        <span>{t('supplier.hub.pageOf', { page: catalogPage, total: catalogTotalPages })}</span>
                        <div className="flex items-center gap-1">
                            <button
                                disabled={catalogPage <= 1}
                                onClick={() => fetchCatalog(catalogPage - 1, catalogSearch, catalogCategory)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40"
                            >
                                {t('supplier.hub.prev')}
                            </button>
                            <button
                                disabled={catalogPage >= catalogTotalPages}
                                onClick={() => fetchCatalog(catalogPage + 1, catalogSearch, catalogCategory)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40"
                            >
                                {t('supplier.hub.next')}
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
                                    placeholder={t('supplier.hub.searchOffers')}
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
                                <option value="">{t('supplier.hub.filterAllStatuses')}</option>
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                                <option value="ARCHIVED">Archived</option>
                            </select>

                            <button
                                onClick={() => fetchOffers(1, offersSearch, offersStatusFilter)}
                                className="px-3.5 py-1.5 bg-slate-200 dark:bg-zinc-800 font-bold uppercase text-[10px] hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors"
                            >
                                {t('supplier.hub.filterButton')}
                            </button>
                        </div>
                    </div>

                    {/* Offers Table */}
                    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    <th className="p-3">{t('supplier.hub.colSku')}</th>
                                    <th className="p-3">{t('supplier.hub.colPaperVariant')}</th>
                                    <th className="p-3">{t('supplier.hub.colRateBasis')}</th>
                                    <th className="p-3">{t('supplier.hub.colMoqMultiple')}</th>
                                    <th className="p-3">{t('supplier.hub.colVisibility')}</th>
                                    <th className="p-3">{t('supplier.hub.colStatus')}</th>
                                    <th className="p-3">{t('supplier.hub.colRev')}</th>
                                    <th className="p-3 text-right">{t('supplier.hub.colActions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                {loadingOffers ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-zinc-400">{t('supplier.hub.loadingOffers')}</td>
                                    </tr>
                                ) : offers.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-zinc-400">
                                            {t('supplier.hub.noOffers')}
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
                                                            title={t('supplier.hub.editOffer')}
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
                                                            {off.status === 'ACTIVE' ? t('supplier.hub.deactivate') : t('supplier.hub.activate')}
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
                        <span>{t('supplier.hub.pageOf', { page: offersPage, total: offersTotalPages })}</span>
                        <div className="flex items-center gap-1">
                            <button
                                disabled={offersPage <= 1}
                                onClick={() => fetchOffers(offersPage - 1, offersSearch, offersStatusFilter)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40"
                            >
                                {t('supplier.hub.prev')}
                            </button>
                            <button
                                disabled={offersPage >= offersTotalPages}
                                onClick={() => fetchOffers(offersPage + 1, offersSearch, offersStatusFilter)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40"
                            >
                                {t('supplier.hub.next')}
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
                                    {editingOffer ? t('supplier.hub.offerRevisionTitle') : t('supplier.hub.newOfferTitle')}
                                </span>
                                <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                                    {editingOffer ? `${t('supplier.hub.editOffer')}: ${editingOffer.supplierSku}` : t('supplier.hub.linkOfferTitle')}
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
                                        {t('supplier.hub.supplierSkuLabel')}
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
                                        {t('supplier.hub.currencyLabel')}
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
                                        {t('supplier.hub.priceAmountLabel')}
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
                                        {t('supplier.hub.priceBasisLabel')}
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
                                        {t('supplier.hub.sheetsPerPackLabel')}
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
                                        {t('supplier.hub.moqLabel')}
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
                                        {t('supplier.hub.orderMultipleLabel')}
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
                                        {t('supplier.hub.validFromLabel')}
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
                                        {t('supplier.hub.validUntilLabel')}
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
                                        {t('supplier.hub.deliveryZonesLabel')}
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
                                        {t('supplier.hub.visibilityLabel')}
                                    </label>
                                    <select
                                        value={offerForm.visibility}
                                        onChange={(e) => setOfferForm({ ...offerForm, visibility: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-bold"
                                    >
                                        <option value="APPROVED_CUSTOMERS">{t('supplier.hub.visApproved')}</option>
                                        <option value="MARKETPLACE">{t('supplier.hub.visMarketplace')}</option>
                                        <option value="PRIVATE">{t('supplier.hub.visPrivate')}</option>
                                    </select>
                                </div>
                            </div>

                            {editingOffer && (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                        {t('supplier.hub.changeReasonLabel')}
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
                                    {t('supplier.hub.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={formSubmitting}
                                    className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold uppercase text-[11px] transition-colors"
                                >
                                    {formSubmitting ? t('supplier.hub.saving') : editingOffer ? t('supplier.hub.recordRevision') : t('supplier.hub.publishOffer')}
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
                                {t('supplier.hub.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TECHNICAL VARIANT SPECS MODAL */}
            {variantDetailModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 w-full max-w-xl shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
                            <div>
                                <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-red-600 text-white">
                                    {t('supplier.hub.viewVariantDetails')}
                                </span>
                                <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                                    {loadingVariantDetail ? 'Loading specifications...' : (viewingVariant?.variant?.productName || t('supplier.hub.variantSpecsTitle'))}
                                </h3>
                            </div>
                            <button
                                onClick={() => setVariantDetailModalOpen(false)}
                                className="p-1 text-zinc-400 hover:text-slate-900 dark:hover:text-white"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {loadingVariantDetail ? (
                            <p className="p-6 text-center text-zinc-400 text-xs">Fetching physical variant metrics...</p>
                        ) : viewingVariant?.variant ? (
                            <div className="space-y-4 text-xs">
                                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono">
                                    <div>
                                        <span className="text-[10px] text-zinc-400 uppercase block">Product Name</span>
                                        <span className="font-bold text-slate-900 dark:text-white">{viewingVariant.variant.productName}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-zinc-400 uppercase block">Category / Brand</span>
                                        <span className="font-bold text-slate-900 dark:text-white">{viewingVariant.variant.category} · {viewingVariant.variant.brand || '—'}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-zinc-400 uppercase block">Dimensions</span>
                                        <span className="font-bold text-slate-900 dark:text-white">{viewingVariant.variant.widthMm} × {viewingVariant.variant.heightMm} mm</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-zinc-400 uppercase block">Grammage (GSM)</span>
                                        <span className="font-bold text-slate-900 dark:text-white">{viewingVariant.variant.gsm} g/m²</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-zinc-400 uppercase block">Caliper (Thickness)</span>
                                        <span className="font-bold text-slate-900 dark:text-white">
                                            {viewingVariant.variant.caliperUm ? `${viewingVariant.variant.caliperUm} µm` : '—'}
                                            {viewingVariant.variant.caliperMm ? ` (${viewingVariant.variant.caliperMm} mm)` : ''}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-zinc-400 uppercase block">Grain & Finish</span>
                                        <span className="font-bold text-slate-900 dark:text-white">{viewingVariant.variant.grainDirection || '—'} · {viewingVariant.variant.finish || '—'}</span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-[10px] text-zinc-400 uppercase block">Technical Fingerprint</span>
                                        <span className="font-mono text-[10px] text-zinc-500 break-all">{viewingVariant.variant.fingerprint}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">Active Offers For This Variant ({viewingVariant.offers?.length || 0})</h4>
                                    {viewingVariant.offers && viewingVariant.offers.length > 0 ? (
                                        <div className="space-y-1 max-h-40 overflow-y-auto">
                                            {viewingVariant.offers.map((off: any) => (
                                                <div key={off.id} className="p-2 border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                                                    <div>
                                                        <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">{off.supplierSku}</span>
                                                        <span className="text-[10px] text-zinc-400 ml-2">MOQ: {off.moq}</span>
                                                    </div>
                                                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                                                        {Number(off.priceAmount).toFixed(2)} {off.currency} / {off.priceBasis}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-zinc-400 italic text-[11px]">No active offers currently published by your organization for this physical variant.</p>
                                    )}
                                </div>

                                <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-zinc-800">
                                    <button
                                        onClick={() => setVariantDetailModalOpen(false)}
                                        className="px-4 py-2 border border-slate-300 dark:border-zinc-700 font-bold uppercase text-[10px]"
                                    >
                                        {t('supplier.hub.close')}
                                    </button>
                                    {!isReadOnly && (
                                        <button
                                            onClick={() => {
                                                setVariantDetailModalOpen(false);
                                                handleOpenCreateOffer(viewingVariant.variant);
                                            }}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-[10px]"
                                        >
                                            {t('supplier.hub.createOffer')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : null}
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
