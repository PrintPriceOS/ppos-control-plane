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
    InformationCircleIcon,
    TrashIcon,
    ArchiveBoxIcon,
    ArrowPathIcon,
    ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch, SupplierApiError } from '../../lib/paperSupplierApi';
import { getUserRole, getAuthUser, getAuthToken } from '../../lib/authStore';
import { TechnicalImportModal } from '../../components/supplier/TechnicalImportModal';
import { AccessibleModal } from '../../components/AccessibleModal';
import { StatusBadge } from '../../components/StatusBadge';
import { useLocale } from '../../i18n';

export const SupplierCatalogOffersPage: React.FC = () => {
    const { t } = useLocale();
    const role = getUserRole();
    const user = getAuthUser();
    const isReadOnly = role === 'SUPPLIER_VIEWER';
    const isAdmin = role === 'SUPPLIER_ADMIN';

    const [activeTab, setActiveTab] = useState<'CATALOG' | 'OFFERS'>('CATALOG');
    const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

    // Catalog state
    const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
    const [catalogPage, setCatalogPage] = useState<number>(1);
    const [catalogTotalPages, setCatalogTotalPages] = useState<number>(1);
    const [catalogSearch, setCatalogSearch] = useState<string>('');
    const [catalogCategory, setCatalogCategory] = useState<string>('');
    const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);
    const [catalogTotalCount, setCatalogTotalCount] = useState<number>(0);
    const [selectedCatalogVariantIds, setSelectedCatalogVariantIds] = useState<Set<string>>(new Set());
    const [isAllMatchingCatalogSelected, setIsAllMatchingCatalogSelected] = useState<boolean>(false);
    const [catalogActionPreview, setCatalogActionPreview] = useState<any>(null);
    const [isCatalogPreviewModalOpen, setIsCatalogPreviewModalOpen] = useState<boolean>(false);
    const [pendingCatalogAction, setPendingCatalogAction] = useState<'ARCHIVE' | 'RESTORE' | 'WITHDRAW' | 'DELETE' | null>(null);
    const [executingCatalogAction, setExecutingCatalogAction] = useState<boolean>(false);

    // Offers state
    const [offers, setOffers] = useState<any[]>([]);
    const [offersPage, setOffersPage] = useState<number>(1);
    const [offersTotalPages, setOffersTotalPages] = useState<number>(1);
    const [offersSearch, setOffersSearch] = useState<string>('');
    const [offersStatusFilter, setOffersStatusFilter] = useState<string>('');
    const [loadingOffers, setLoadingOffers] = useState<boolean>(false);
    const [offersTotalCount, setOffersTotalCount] = useState<number>(0);
    const [offersCounts, setOffersCounts] = useState<{ total: number; active: number; inactive: number; archived: number }>({
        total: 0,
        active: 0,
        inactive: 0,
        archived: 0
    });

    // Selection engine state
    const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(new Set());
    const [isAllMatchingSelected, setIsAllMatchingSelected] = useState<boolean>(false);

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

    // Batch History Modal
    const [isBatchHistoryModalOpen, setIsBatchHistoryModalOpen] = useState<boolean>(false);
    const [importBatches, setImportBatches] = useState<any[]>([]);
    const [loadingBatches, setLoadingBatches] = useState<boolean>(false);

    // Edit Variant Modal
    const [isEditVariantModalOpen, setIsEditVariantModalOpen] = useState<boolean>(false);
    const [editingVariant, setEditingVariant] = useState<any>(null);
    const [variantForm, setVariantForm] = useState({
        gsm: '',
        widthMm: '',
        heightMm: '',
        finish: '',
        grainDirection: 'LONG_GRAIN',
        caliperUm: ''
    });
    const [savingVariant, setSavingVariant] = useState<boolean>(false);
    const [variantError, setVariantError] = useState<string | null>(null);

    // Confirmation Modal
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        warning: string;
        actionLabel: string;
        isDanger: boolean;
        onConfirm: () => Promise<void>;
    } | null>(null);

    // Operation Report Modal
    const [reportModal, setReportModal] = useState<{
        title: string;
        totalProcessed: number;
        succeededCount: number;
        failedCount: number;
        results: any[];
    } | null>(null);

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
                setCatalogProducts(res.data.products || res.data.items || []);
                setCatalogPage(res.data.page || 1);
                setCatalogTotalPages(res.data.totalPages || 1);
                setCatalogTotalCount(res.data.total || 0);
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
                setOffersTotalCount(res.data.total || 0);
                if (res.data.counts) {
                    setOffersCounts(res.data.counts);
                }
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error fetching supplier commercial offers.');
        } finally {
            setLoadingOffers(false);
        }
    };

    useEffect(() => {
        setSelectedOfferIds(new Set());
        setIsAllMatchingSelected(false);
        if (activeTab === 'CATALOG') {
            fetchCatalog(1, catalogSearch, catalogCategory);
        } else {
            fetchOffers(1, offersSearch, offersStatusFilter);
        }
    }, [activeTab]);

    // Handle single row selection
    const handleToggleSelectOffer = (id: string) => {
        setIsAllMatchingSelected(false);
        setSelectedOfferIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Handle select all visible on page
    const isPageSelected = offers.length > 0 && offers.every((o) => selectedOfferIds.has(o.id));
    const handleToggleSelectPage = () => {
        setIsAllMatchingSelected(false);
        if (isPageSelected) {
            // Deselect all on current page
            setSelectedOfferIds((prev) => {
                const next = new Set(prev);
                offers.forEach((o) => next.delete(o.id));
                return next;
            });
        } else {
            // Select all on current page
            setSelectedOfferIds((prev) => {
                const next = new Set(prev);
                offers.forEach((o) => next.add(o.id));
                return next;
            });
        }
    };

    // Select all matching filter results across pagination
    const handleSelectAllMatching = () => {
        setIsAllMatchingSelected(true);
        setSelectedOfferIds(new Set(offers.map((o) => o.id)));
    };

    const handleClearSelection = () => {
        setSelectedOfferIds(new Set());
        setIsAllMatchingSelected(false);
    };

    // Catalog variant selection helpers
    const allVisibleCatalogVariantIds = catalogProducts.flatMap((p: any) =>
        p.variants ? p.variants.filter((v: any) => v.isCatalogAssociated !== false && v.supplierCatalogStatus !== 'UNASSOCIATED').map((v: any) => v.id) : []
    );

    const isCatalogPageSelected = allVisibleCatalogVariantIds.length > 0 &&
        allVisibleCatalogVariantIds.every((id: string) => selectedCatalogVariantIds.has(id));

    const handleToggleSelectVariant = (id: string) => {
        setIsAllMatchingCatalogSelected(false);
        setSelectedCatalogVariantIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleToggleSelectProduct = (product: any) => {
        setIsAllMatchingCatalogSelected(false);
        const prodVariantIds = product.variants ? product.variants.filter((v: any) => v.isCatalogAssociated !== false && v.supplierCatalogStatus !== 'UNASSOCIATED').map((v: any) => v.id) : [];
        if (prodVariantIds.length === 0) return;

        const allSelected = prodVariantIds.every((id: string) => selectedCatalogVariantIds.has(id));
        setSelectedCatalogVariantIds((prev) => {
            const next = new Set(prev);
            if (allSelected) {
                prodVariantIds.forEach((id: string) => next.delete(id));
            } else {
                prodVariantIds.forEach((id: string) => next.add(id));
            }
            return next;
        });
    };

    const handleToggleSelectCatalogPage = () => {
        setIsAllMatchingCatalogSelected(false);
        if (isCatalogPageSelected) {
            setSelectedCatalogVariantIds((prev) => {
                const next = new Set(prev);
                allVisibleCatalogVariantIds.forEach((id: string) => next.delete(id));
                return next;
            });
        } else {
            setSelectedCatalogVariantIds((prev) => {
                const next = new Set(prev);
                allVisibleCatalogVariantIds.forEach((id: string) => next.add(id));
                return next;
            });
        }
    };

    const handleSelectAllMatchingCatalog = () => {
        setIsAllMatchingCatalogSelected(true);
        setSelectedCatalogVariantIds(new Set(allVisibleCatalogVariantIds));
    };

    const handleClearCatalogSelection = () => {
        setSelectedCatalogVariantIds(new Set());
        setIsAllMatchingCatalogSelected(false);
    };

    // Explicitly incorporate a global variant into supplier's own catalog
    const handleIncorporateVariant = async (variantId: string) => {
        try {
            setErrorNotice(null);
            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/variants/${variantId}/incorporate`, {
                method: 'POST'
            });
            if (res && res.ok) {
                setGeneralNotice(t('supplier.hub.incorporateSuccess'));
                fetchCatalog();
            } else {
                setErrorNotice(res?.error?.message || t('supplier.hub.incorporateFailed'));
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error de comunicación.');
        }
    };

    // Open catalog action preview modal
    const handleOpenCatalogAction = async (action: 'ARCHIVE' | 'RESTORE' | 'WITHDRAW' | 'DELETE', singleVariantId?: string) => {
        try {
            setErrorNotice(null);
            const targetIds = singleVariantId ? [singleVariantId] : Array.from(selectedCatalogVariantIds);
            if (singleVariantId) {
                setSelectedCatalogVariantIds(new Set([singleVariantId]));
                setIsAllMatchingCatalogSelected(false);
            }

            const res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/catalog/variants/preview-action', {
                method: 'POST',
                body: JSON.stringify({
                    action,
                    variantIds: targetIds,
                    scope: isAllMatchingCatalogSelected && !singleVariantId ? 'ALL_MATCHING' : 'SELECTED',
                    filters: { search: catalogSearch, category: catalogCategory }
                })
            });

            if (res && res.ok && res.data) {
                setCatalogActionPreview(res.data);
                setPendingCatalogAction(action);
                setIsCatalogPreviewModalOpen(true);
            } else {
                setErrorNotice('No se pudo generar la previsualización de la acción de catálogo.');
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error al preparar la acción de catálogo.');
        }
    };

    // Execute confirmed catalog action
    const handleConfirmCatalogAction = async () => {
        if (!pendingCatalogAction) return;
        setExecutingCatalogAction(true);
        setErrorNotice(null);

        try {
            const targetIds = Array.from(selectedCatalogVariantIds);
            const scope = isAllMatchingCatalogSelected ? 'ALL_MATCHING' : 'SELECTED';
            const filters = { search: catalogSearch, category: catalogCategory };

            let res: any;
            if (pendingCatalogAction === 'ARCHIVE' || pendingCatalogAction === 'RESTORE') {
                res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/catalog/variants/bulk-status', {
                    method: 'PATCH',
                    body: JSON.stringify({
                        status: pendingCatalogAction === 'ARCHIVE' ? 'ARCHIVED' : 'ACTIVE',
                        variantIds: targetIds,
                        scope,
                        filters
                    })
                });
            } else if (pendingCatalogAction === 'WITHDRAW') {
                res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/catalog/variants/bulk-withdraw', {
                    method: 'POST',
                    body: JSON.stringify({
                        variantIds: targetIds,
                        scope,
                        filters
                    })
                });
            } else if (pendingCatalogAction === 'DELETE') {
                res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/catalog/variants/bulk-delete', {
                    method: 'POST',
                    body: JSON.stringify({
                        variantIds: targetIds,
                        scope,
                        filters
                    })
                });
            }

            if (res && res.ok && res.data) {
                setIsCatalogPreviewModalOpen(false);
                setSelectedCatalogVariantIds(new Set());
                setIsAllMatchingCatalogSelected(false);

                setReportModal({
                    title: `Reporte de Operación: ${pendingCatalogAction}`,
                    totalProcessed: res.data.totalProcessed || 0,
                    succeededCount: res.data.succeededCount || 0,
                    failedCount: res.data.failedCount || 0,
                    results: res.data.results || []
                });

                setGeneralNotice(`Acción ${pendingCatalogAction} completada: ${res.data.succeededCount} procesadas correctamente.`);
                fetchCatalog();
                fetchOffers();
            } else {
                setErrorNotice(res?.error?.message || 'Error al ejecutar la acción.');
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error de comunicación.');
        } finally {
            setExecutingCatalogAction(false);
        }
    };

    // Bulk execute status change
    const handleExecuteBulkStatus = async (action: 'ACTIVATE' | 'DEACTIVATE' | 'ARCHIVE' | 'RESTORE') => {
        try {
            setErrorNotice(null);
            const scope = isAllMatchingSelected ? 'ALL_MATCHING' : 'SELECTED';
            const payload: any = {
                action,
                scope,
                offerIds: Array.from(selectedOfferIds),
                filters: {
                    status: offersStatusFilter || undefined,
                    search: offersSearch.trim() || undefined
                },
                reason: `Bulk ${action} executed from supplier operations table`
            };

            const res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/offers/bulk-status', {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });

            if (res && res.ok && res.data) {
                const report = res.data;
                handleClearSelection();
                fetchOffers(offersPage, offersSearch, offersStatusFilter);

                if (report.failedCount > 0) {
                    setReportModal({
                        title: t('supplier.hub.operationReportTitle'),
                        totalProcessed: report.totalProcessed,
                        succeededCount: report.succeededCount,
                        failedCount: report.failedCount,
                        results: report.results
                    });
                } else {
                    setGeneralNotice(`Operación ${action} completada con éxito en ${report.succeededCount} ofertas.`);
                }
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error executing bulk action.');
        }
    };

    // Bulk execute delete
    const handleOpenBulkDeleteConfirm = () => {
        const count = isAllMatchingSelected ? offersTotalCount : selectedOfferIds.size;
        setConfirmModal({
            isOpen: true,
            title: t('supplier.hub.deleteConfirmTitle'),
            warning: `${t('supplier.hub.deleteConfirmWarning')} (${count} ofertas seleccionadas).`,
            actionLabel: t('supplier.hub.delete'),
            isDanger: true,
            onConfirm: async () => {
                const scope = isAllMatchingSelected ? 'ALL_MATCHING' : 'SELECTED';
                const payload: any = {
                    scope,
                    offerIds: Array.from(selectedOfferIds),
                    filters: {
                        status: offersStatusFilter || undefined,
                        search: offersSearch.trim() || undefined
                    },
                    reason: 'Bulk hard deletion executed by SUPPLIER_ADMIN'
                };

                const res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/offers/bulk-delete', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                if (res && res.ok && res.data) {
                    const report = res.data;
                    handleClearSelection();
                    fetchOffers(offersPage, offersSearch, offersStatusFilter);

                    if (report.failedCount > 0) {
                        setReportModal({
                            title: t('supplier.hub.operationReportTitle'),
                            totalProcessed: report.totalProcessed,
                            succeededCount: report.succeededCount,
                            failedCount: report.failedCount,
                            results: report.results
                        });
                    } else {
                        setGeneralNotice(t('supplier.hub.deleteOfferSuccess'));
                    }
                }
            }
        });
    };

    // Individual offer delete
    const handleOpenSingleDeleteConfirm = (offer: any) => {
        setConfirmModal({
            isOpen: true,
            title: t('supplier.hub.deleteConfirmTitle'),
            warning: `${t('supplier.hub.deleteConfirmWarning')} Oferta: ${offer.supplierSku}.`,
            actionLabel: t('supplier.hub.delete'),
            isDanger: true,
            onConfirm: async () => {
                const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/offers/${offer.id}`, {
                    method: 'DELETE'
                });
                if (res && res.ok) {
                    setGeneralNotice(t('supplier.hub.deleteOfferSuccess'));
                    fetchOffers(offersPage, offersSearch, offersStatusFilter);
                }
            }
        });
    };

    // Technical Variant Detail
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

    // Delete Variant
    const handleOpenDeleteVariantConfirm = (variant: any) => {
        setConfirmModal({
            isOpen: true,
            title: t('supplier.hub.deleteVariantConfirmTitle'),
            warning: `${t('supplier.hub.deleteVariantWarning')} (${variant.gsm} gsm ${variant.widthMm}x${variant.heightMm} mm).`,
            actionLabel: t('supplier.hub.delete'),
            isDanger: true,
            onConfirm: async () => {
                const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/variants/${variant.id}`, {
                    method: 'DELETE'
                });
                if (res && res.ok) {
                    setGeneralNotice(t('supplier.hub.deleteVariantSuccess'));
                    fetchCatalog(catalogPage, catalogSearch, catalogCategory);
                }
            }
        });
    };

    // Open Edit Variant Modal
    const handleOpenEditVariant = (variant: any, productName: string) => {
        setEditingVariant({ ...variant, productName });
        setVariantForm({
            gsm: String(variant.gsm || ''),
            widthMm: String(variant.widthMm || ''),
            heightMm: String(variant.heightMm || ''),
            finish: variant.finish || '',
            grainDirection: variant.grainDirection || 'LONG_GRAIN',
            caliperUm: String(variant.caliperUm || '')
        });
        setVariantError(null);
        setIsEditVariantModalOpen(true);
    };

    const handleSaveVariantSpecs = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingVariant(true);
        setVariantError(null);
        try {
            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/variants/${editingVariant.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    gsm: Number(variantForm.gsm),
                    widthMm: Number(variantForm.widthMm),
                    heightMm: Number(variantForm.heightMm),
                    finish: variantForm.finish.trim(),
                    grainDirection: variantForm.grainDirection,
                    caliperUm: variantForm.caliperUm ? Number(variantForm.caliperUm) : null
                })
            });

            if (res && res.ok) {
                setGeneralNotice('Especificaciones de la variante modificadas y fingerprint actualizado.');
                setIsEditVariantModalOpen(false);
                fetchCatalog(catalogPage, catalogSearch, catalogCategory);
            }
        } catch (err: any) {
            setVariantError(err.message || 'Error al actualizar especificaciones.');
        } finally {
            setSavingVariant(false);
        }
    };

    // Batch History
    const handleOpenBatchHistory = async () => {
        setIsBatchHistoryModalOpen(true);
        setLoadingBatches(true);
        try {
            const res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/catalog/imports');
            if (res && res.ok && res.data) {
                setImportBatches(res.data.batches || []);
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error al cargar historial de lotes.');
        } finally {
            setLoadingBatches(false);
        }
    };

    const handleRetractBatch = (batch: any) => {
        setConfirmModal({
            isOpen: true,
            title: t('supplier.hub.retractBatch'),
            warning: `${t('supplier.hub.retractConfirmWarning')} Lote: ${batch.original_filename || batch.id}.`,
            actionLabel: t('supplier.hub.retractBatch'),
            isDanger: true,
            onConfirm: async () => {
                const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/imports/${batch.id}/retract`, {
                    method: 'POST'
                });
                if (res && res.ok) {
                    setGeneralNotice(`Lote retirado. Se eliminaron ${res.data.retractedVariantsCount} variantes exclusivas.`);
                    setIsBatchHistoryModalOpen(false);
                    fetchCatalog(1, catalogSearch, catalogCategory);
                }
            }
        });
    };

    const handleDownloadTemplate = async () => {
        try {
            const res = await fetch('/api/v1/paper-suppliers/catalog/template', {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`
                }
            });
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'paper_catalog_template.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setErrorNotice(err.message || 'Error downloading template');
        }
    };

    const handleDownloadBatchIssues = async (batchId: string) => {
        try {
            const res = await fetch(`/api/v1/paper-suppliers/catalog/imports/${batchId}/export-issues`, {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`
                }
            });
            if (!res.ok) throw new Error('Download issues failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `import_issues_${batchId}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setErrorNotice(err.message || 'Error downloading issues CSV');
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
                .map((z) => z.trim().toUpperCase())
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
                setGeneralNotice(`Estado de la oferta cambiado a ${nextStatus}.`);
                fetchOffers(offersPage, offersSearch, offersStatusFilter);
            } else {
                setErrorNotice('Error al actualizar estado.');
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error updating status.');
        }
    };

    const handleArchiveOrRestoreSingleOffer = async (offerId: string, currentStatus: string) => {
        const nextStatus = currentStatus === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
        try {
            const res = await paperSupplierFetch(`/api/v1/paper-suppliers/offers/${offerId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus, reason: `Individual ${nextStatus} action` })
            });
            if (res && res.ok) {
                setGeneralNotice(nextStatus === 'ARCHIVED' ? 'Oferta archivada.' : 'Oferta restaurada y activada.');
                fetchOffers(offersPage, offersSearch, offersStatusFilter);
            }
        } catch (err: any) {
            setErrorNotice(err.message || 'Error updating archive state.');
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
                            Operational Hub
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {t('supplier.hub.title')}
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        {t('supplier.hub.subtitle')}
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-bold uppercase tracking-wider text-[11px] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                        title={t('supplier.hub.downloadTemplate')}
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        <span>{t('supplier.hub.downloadTemplate')}</span>
                    </button>

                    <button
                        onClick={handleOpenBatchHistory}
                        className="flex items-center gap-2 px-3 py-2 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-bold uppercase tracking-wider text-[11px] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                        <ClockIcon className="w-4 h-4" />
                        <span>{t('supplier.hub.batchHistory')}</span>
                    </button>

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
                                className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-bold"
                            >
                                <option value="">{t('supplier.hub.filterAllCategories')}</option>
                                <option value="COATED">Coated</option>
                                <option value="UNCOATED">Uncoated</option>
                                <option value="CARTON">Carton</option>
                                <option value="OFFSET">Offset</option>
                                <option value="DESIGN">Design</option>
                                <option value="DIGITAL">Digital</option>
                                <option value="SPECIALTY">Specialty</option>
                                <option value="KRAFT">Kraft</option>
                                <option value="BOARD">Board</option>
                                <option value="OTHER">Other</option>
                            </select>

                            <button
                                onClick={() => fetchCatalog(1, catalogSearch, catalogCategory)}
                                className="px-3.5 py-1.5 bg-slate-200 dark:bg-zinc-800 font-bold uppercase text-[10px] hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                            >
                                {t('supplier.hub.filterButton')}
                            </button>
                        </div>
                    </div>

                    {/* Catalog Multi-Row Sticky Action Bar */}
                    {selectedCatalogVariantIds.size > 0 && !isReadOnly && (
                        <div className="sticky top-0 z-20 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-900 text-white shadow-xl border-l-4 border-red-600">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold">
                                    {isAllMatchingCatalogSelected
                                        ? t('supplier.hub.allMatchingVariantsSelected', { total: catalogTotalCount })
                                        : t('supplier.hub.selectedVariantsCount', { count: selectedCatalogVariantIds.size })}
                                </span>
                                <button
                                    onClick={handleClearCatalogSelection}
                                    className="text-[11px] underline text-zinc-300 hover:text-white cursor-pointer"
                                >
                                    {t('supplier.hub.clearSelection')}
                                </button>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => handleOpenCatalogAction('ARCHIVE')}
                                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase cursor-pointer"
                                >
                                    {t('supplier.hub.bulkArchive')}
                                </button>
                                <button
                                    onClick={() => handleOpenCatalogAction('RESTORE')}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase cursor-pointer"
                                >
                                    {t('supplier.hub.bulkRestore')}
                                </button>
                                <button
                                    onClick={() => handleOpenCatalogAction('WITHDRAW')}
                                    className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-bold uppercase cursor-pointer"
                                    title={t('supplier.hub.withdrawConfirmWarning')}
                                >
                                    {t('supplier.hub.bulkWithdraw')}
                                </button>
                                {isAdmin && (
                                    <button
                                        onClick={() => handleOpenCatalogAction('DELETE')}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase cursor-pointer"
                                    >
                                        {t('supplier.hub.bulkDelete')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Catalog Page select-all banner with prompt to select all matching across pagination */}
                    {isCatalogPageSelected && catalogTotalCount > allVisibleCatalogVariantIds.length && !isAllMatchingCatalogSelected && (
                        <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-between">
                            <span>{t('supplier.hub.selectedVariantsCount', { count: allVisibleCatalogVariantIds.length })} (página actual).</span>
                            <button
                                onClick={handleSelectAllMatchingCatalog}
                                className="underline font-bold text-xs hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                            >
                                {t('supplier.hub.selectAllMatchingVariants', { total: catalogTotalCount })}
                            </button>
                        </div>
                    )}

                    {/* Technical Products & Variants Table */}
                    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    {!isReadOnly && (
                                        <th className="p-3 w-8">
                                            <input
                                                type="checkbox"
                                                checked={isCatalogPageSelected}
                                                onChange={handleToggleSelectCatalogPage}
                                                className="cursor-pointer"
                                                title={t('supplier.hub.selectAllVisible')}
                                            />
                                        </th>
                                    )}
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
                                        <td colSpan={isReadOnly ? 6 : 7} className="p-8 text-center text-zinc-400">{t('supplier.hub.loadingCatalog')}</td>
                                    </tr>
                                ) : catalogProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={isReadOnly ? 6 : 7} className="p-8 text-center text-zinc-400">
                                            {t('supplier.hub.noVariants')}
                                        </td>
                                    </tr>
                                ) : (
                                    catalogProducts.map((prod) => {
                                        const prodVariantIds = prod.variants ? prod.variants.map((v: any) => v.id) : [];
                                        const selectedInProd = prodVariantIds.filter((id: string) => selectedCatalogVariantIds.has(id)).length;
                                        const allProdSelected = prodVariantIds.length > 0 && selectedInProd === prodVariantIds.length;
                                        const someProdSelected = selectedInProd > 0 && !allProdSelected;

                                        return (
                                            <React.Fragment key={prod.id}>
                                                <tr className="bg-slate-50/50 dark:bg-zinc-900/30 font-bold">
                                                    {!isReadOnly && (
                                                        <td className="p-3 w-8">
                                                            <input
                                                                type="checkbox"
                                                                checked={allProdSelected}
                                                                ref={(el) => {
                                                                    if (el) el.indeterminate = someProdSelected;
                                                                }}
                                                                onChange={() => handleToggleSelectProduct(prod)}
                                                                className="cursor-pointer"
                                                                title={`Seleccionar todas las variantes de ${prod.name}`}
                                                            />
                                                        </td>
                                                    )}
                                                    <td className="p-3 text-slate-900 dark:text-white">
                                                        <div className="flex items-center gap-2">
                                                            <span>{prod.name}</span>
                                                            {selectedInProd > 0 && (
                                                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                                                                    {t('supplier.hub.selectedInProduct', { selected: selectedInProd, total: prodVariantIds.length })}
                                                                </span>
                                                            )}
                                                        </div>
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
                                                {prod.variants && prod.variants.map((v: any) => {
                                                    const isVariantSelected = selectedCatalogVariantIds.has(v.id);
                                                    const isWithdrawn = Boolean(v.isWithdrawn);
                                                    const isArchived = v.supplierCatalogStatus === 'ARCHIVED';
                                                    const isUnassociated = v.supplierCatalogStatus === 'UNASSOCIATED' || v.isCatalogAssociated === false;

                                                    return (
                                                        <tr key={v.id} className={`hover:bg-slate-50 dark:hover:bg-zinc-900/60 pl-4 ${isVariantSelected ? 'bg-red-50/40 dark:bg-red-950/20' : ''}`}>
                                                            {!isReadOnly && (
                                                                <td className="p-3 w-8">
                                                                    {isUnassociated ? (
                                                                        <span className="inline-block w-4 h-4 text-center text-zinc-300 dark:text-zinc-600 text-xs select-none" title={t('supplier.hub.statusUnassociated')}>—</span>
                                                                    ) : (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isVariantSelected}
                                                                            onChange={() => handleToggleSelectVariant(v.id)}
                                                                            className="cursor-pointer"
                                                                        />
                                                                    )}
                                                                </td>
                                                            )}
                                                            <td className="p-3 pl-8 text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${isUnassociated ? 'bg-zinc-400 dark:bg-zinc-600' : isWithdrawn ? 'bg-zinc-400' : isArchived ? 'bg-amber-500' : 'bg-red-600'}`} />
                                                                <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">
                                                                    {v.widthMm} x {v.heightMm} mm
                                                                </span>
                                                                {isUnassociated && (
                                                                    <span className="px-1.5 py-0.2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 text-[9px] font-bold uppercase">
                                                                        {t('supplier.hub.statusUnassociated')}
                                                                    </span>
                                                                )}
                                                                {isWithdrawn && !isUnassociated && (
                                                                    <span className="px-1.5 py-0.2 bg-zinc-200 dark:bg-zinc-800 text-zinc-500 text-[9px] font-bold uppercase">
                                                                        {t('supplier.hub.statusWithdrawn')}
                                                                    </span>
                                                                )}
                                                                {isArchived && !isWithdrawn && !isUnassociated && (
                                                                    <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 text-[9px] font-bold uppercase">
                                                                        {t('supplier.hub.statusArchived')}
                                                                    </span>
                                                                )}
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
                                                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                                    <button
                                                                        onClick={() => handleViewVariantDetail(v.id)}
                                                                        className="px-2 py-1 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold uppercase text-[10px] transition-colors cursor-pointer"
                                                                        title={t('supplier.hub.viewVariantDetails')}
                                                                    >
                                                                        {t('supplier.hub.viewVariantDetails')}
                                                                    </button>
                                                                    {!isReadOnly && (
                                                                        <>
                                                                            {isUnassociated ? (
                                                                                <button
                                                                                    onClick={() => handleIncorporateVariant(v.id)}
                                                                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase text-[10px] transition-colors cursor-pointer"
                                                                                    title={t('supplier.hub.incorporateVariant')}
                                                                                >
                                                                                    {t('supplier.hub.incorporateVariant')}
                                                                                </button>
                                                                            ) : (
                                                                                <>
                                                                                    <button
                                                                                        onClick={() => handleOpenEditVariant(v, prod.name)}
                                                                                        className="p-1 text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                                                                        title={t('supplier.hub.editVariantSpecs')}
                                                                                    >
                                                                                        <PencilSquareIcon className="w-4 h-4" />
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleOpenCreateOffer({ ...v, productName: prod.name, finish: prod.finish })}
                                                                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-[10px] transition-colors cursor-pointer"
                                                                                    >
                                                                                        {t('supplier.hub.createOffer')}
                                                                                    </button>
                                                                                    {isArchived ? (
                                                                                        <button
                                                                                            onClick={() => handleOpenCatalogAction('RESTORE', v.id)}
                                                                                            className="p-1 text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                                                                                            title={t('supplier.hub.restore')}
                                                                                        >
                                                                                            <ArrowPathIcon className="w-4 h-4" />
                                                                                        </button>
                                                                                    ) : (
                                                                                        <button
                                                                                            onClick={() => handleOpenCatalogAction('ARCHIVE', v.id)}
                                                                                            className="p-1 text-amber-600 hover:text-amber-700 transition-colors cursor-pointer"
                                                                                            title={t('supplier.hub.archive')}
                                                                                        >
                                                                                            <ArchiveBoxIcon className="w-4 h-4" />
                                                                                        </button>
                                                                                    )}
                                                                                    {!isWithdrawn && (
                                                                                        <button
                                                                                            onClick={() => handleOpenCatalogAction('WITHDRAW', v.id)}
                                                                                            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[10px] font-bold uppercase cursor-pointer"
                                                                                            title={t('supplier.hub.withdrawConfirmWarning')}
                                                                                        >
                                                                                            {t('supplier.hub.withdraw')}
                                                                                        </button>
                                                                                    )}
                                                                                    {isAdmin && (
                                                                                        <button
                                                                                            onClick={() => handleOpenDeleteVariantConfirm(v)}
                                                                                            className="p-1 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                                                                                            title={t('supplier.hub.deleteVariantConfirmTitle')}
                                                                                        >
                                                                                            <TrashIcon className="w-4 h-4" />
                                                                                        </button>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })
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
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40 cursor-pointer"
                            >
                                {t('supplier.hub.prev')}
                            </button>
                            <button
                                disabled={catalogPage >= catalogTotalPages}
                                onClick={() => fetchCatalog(catalogPage + 1, catalogSearch, catalogCategory)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40 cursor-pointer"
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
                    {/* Status Breakdown Filter Pills */}
                    <div className="flex items-center gap-2 flex-wrap pb-1">
                        <button
                            onClick={() => {
                                setOffersStatusFilter('');
                                fetchOffers(1, offersSearch, '');
                            }}
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                                offersStatusFilter === ''
                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-sm'
                                    : 'border-slate-200 dark:border-zinc-800 text-zinc-500 hover:border-slate-400'
                            }`}
                        >
                            {t('supplier.hub.statusAll')} ({offersCounts.total})
                        </button>
                        <button
                            onClick={() => {
                                setOffersStatusFilter('ACTIVE');
                                fetchOffers(1, offersSearch, 'ACTIVE');
                            }}
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                                offersStatusFilter === 'ACTIVE'
                                    ? 'bg-emerald-600 text-white border-transparent shadow-sm'
                                    : 'border-slate-200 dark:border-zinc-800 text-emerald-600 dark:text-emerald-400 hover:border-emerald-500'
                            }`}
                        >
                            {t('supplier.hub.statusActive')} ({offersCounts.active})
                        </button>
                        <button
                            onClick={() => {
                                setOffersStatusFilter('INACTIVE');
                                fetchOffers(1, offersSearch, 'INACTIVE');
                            }}
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                                offersStatusFilter === 'INACTIVE'
                                    ? 'bg-zinc-600 text-white border-transparent shadow-sm'
                                    : 'border-slate-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-400'
                            }`}
                        >
                            {t('supplier.hub.statusInactive')} ({offersCounts.inactive})
                        </button>
                        <button
                            onClick={() => {
                                setOffersStatusFilter('ARCHIVED');
                                fetchOffers(1, offersSearch, 'ARCHIVED');
                            }}
                            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                                offersStatusFilter === 'ARCHIVED'
                                    ? 'bg-amber-600 text-white border-transparent shadow-sm'
                                    : 'border-slate-200 dark:border-zinc-800 text-amber-600 dark:text-amber-400 hover:border-amber-500'
                            }`}
                        >
                            {t('supplier.hub.statusArchived')} ({offersCounts.archived})
                        </button>
                    </div>

                    {/* Search & Actions Bar */}
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
                            <button
                                onClick={() => fetchOffers(1, offersSearch, offersStatusFilter)}
                                className="px-3.5 py-1.5 bg-slate-200 dark:bg-zinc-800 font-bold uppercase text-[10px] hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                            >
                                {t('supplier.hub.filterButton')}
                            </button>
                        </div>
                    </div>

                    {/* Multi-Row Sticky Action Bar */}
                    {selectedOfferIds.size > 0 && !isReadOnly && (
                        <div className="sticky top-0 z-20 flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-900 text-white shadow-xl border-l-4 border-red-600">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold">
                                    {isAllMatchingSelected
                                        ? t('supplier.hub.allMatchingSelected', { total: offersTotalCount })
                                        : t('supplier.hub.selectedCount', { count: selectedOfferIds.size })}
                                </span>
                                <button
                                    onClick={handleClearSelection}
                                    className="text-[11px] underline text-zinc-300 hover:text-white cursor-pointer"
                                >
                                    {t('supplier.hub.clearSelection')}
                                </button>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => handleExecuteBulkStatus('ACTIVATE')}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase cursor-pointer"
                                >
                                    {t('supplier.hub.bulkActivate')}
                                </button>
                                <button
                                    onClick={() => handleExecuteBulkStatus('DEACTIVATE')}
                                    className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-bold uppercase cursor-pointer"
                                >
                                    {t('supplier.hub.bulkDeactivate')}
                                </button>
                                {offersStatusFilter === 'ARCHIVED' ? (
                                    <button
                                        onClick={() => handleExecuteBulkStatus('RESTORE')}
                                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase cursor-pointer"
                                    >
                                        {t('supplier.hub.bulkRestore')}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleExecuteBulkStatus('ARCHIVE')}
                                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold uppercase cursor-pointer"
                                    >
                                        {t('supplier.hub.bulkArchive')}
                                    </button>
                                )}
                                {isAdmin && (
                                    <button
                                        onClick={handleOpenBulkDeleteConfirm}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase cursor-pointer"
                                    >
                                        {t('supplier.hub.bulkDelete')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Page select-all banner with prompt to select all matching across pagination */}
                    {isPageSelected && offersTotalCount > offers.length && !isAllMatchingSelected && (
                        <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-between">
                            <span>{t('supplier.hub.selectedCount', { count: offers.length })} (página actual).</span>
                            <button
                                onClick={handleSelectAllMatching}
                                className="underline font-bold text-xs hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                            >
                                {t('supplier.hub.selectAllMatching', { total: offersTotalCount })}
                            </button>
                        </div>
                    )}

                    {/* Offers Table */}
                    <div className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                    {!isReadOnly && (
                                        <th className="p-3 w-8">
                                            <input
                                                type="checkbox"
                                                checked={isPageSelected}
                                                onChange={handleToggleSelectPage}
                                                className="cursor-pointer"
                                                title={t('supplier.hub.selectAllVisible')}
                                            />
                                        </th>
                                    )}
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
                                        <td colSpan={isReadOnly ? 8 : 9} className="p-8 text-center text-zinc-400">{t('supplier.hub.loadingOffers')}</td>
                                    </tr>
                                ) : offers.length === 0 ? (
                                    <tr>
                                        <td colSpan={isReadOnly ? 8 : 9} className="p-8 text-center text-zinc-400">
                                            {t('supplier.hub.noOffers')}
                                        </td>
                                    </tr>
                                ) : (
                                    offers.map((off) => {
                                        const isSelected = selectedOfferIds.has(off.id);
                                        const productName = off.variantDetails?.productName || off.productName || 'Variante no disponible';
                                        const gsm = off.variantDetails?.gsm || off.gsm;
                                        const widthMm = off.variantDetails?.widthMm || off.widthMm;
                                        const heightMm = off.variantDetails?.heightMm || off.heightMm;
                                        const finish = off.variantDetails?.finish || off.finish || 'Estándar';

                                        return (
                                            <tr key={off.id} className={`hover:bg-slate-50 dark:hover:bg-zinc-900/50 ${isSelected ? 'bg-red-50/40 dark:bg-red-950/20' : ''}`}>
                                                {!isReadOnly && (
                                                    <td className="p-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleToggleSelectOffer(off.id)}
                                                            className="cursor-pointer"
                                                        />
                                                    </td>
                                                )}
                                                <td className="p-3 font-mono font-bold text-slate-800 dark:text-zinc-200">
                                                    {off.supplierSku}
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-bold text-slate-900 dark:text-white">{productName}</div>
                                                    <div className="text-[10px] text-zinc-400 font-mono">
                                                        {gsm ? `${gsm} gsm` : 'GSM no declarado'} · {widthMm && heightMm ? `${widthMm}x${heightMm} mm` : 'Dimensiones no declaradas'} · {finish}
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
                                                            {off.status !== 'ARCHIVED' && (
                                                                <button
                                                                    onClick={() => handleToggleOfferStatus(off.id, off.status)}
                                                                    className={`px-2 py-0.5 text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                                                                        off.status === 'ACTIVE'
                                                                            ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300'
                                                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                                    }`}
                                                                >
                                                                    {off.status === 'ACTIVE' ? t('supplier.hub.deactivate') : t('supplier.hub.activate')}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleArchiveOrRestoreSingleOffer(off.id, off.status)}
                                                                className="px-2 py-0.5 text-[10px] font-bold uppercase border border-slate-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                                                title={off.status === 'ARCHIVED' ? t('supplier.hub.restore') : t('supplier.hub.archive')}
                                                            >
                                                                {off.status === 'ARCHIVED' ? t('supplier.hub.restore') : t('supplier.hub.archive')}
                                                            </button>
                                                            {isAdmin && (
                                                                <button
                                                                    onClick={() => handleOpenSingleDeleteConfirm(off)}
                                                                    className="p-1 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
                                                                    title={t('supplier.hub.delete')}
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
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
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40 cursor-pointer"
                            >
                                {t('supplier.hub.prev')}
                            </button>
                            <button
                                disabled={offersPage >= offersTotalPages}
                                onClick={() => fetchOffers(offersPage + 1, offersSearch, offersStatusFilter)}
                                className="px-3 py-1 border border-slate-200 dark:border-zinc-800 disabled:opacity-40 cursor-pointer"
                            >
                                {t('supplier.hub.next')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE / EDIT OFFER MODAL */}
            <AccessibleModal
                isOpen={isOfferModalOpen}
                onClose={() => setIsOfferModalOpen(false)}
                title={editingOffer ? `${t('supplier.hub.editOffer')}: ${editingOffer.supplierSku}` : t('supplier.hub.linkOfferTitle')}
                badge={editingOffer ? t('supplier.hub.offerRevisionTitle') : t('supplier.hub.newOfferTitle')}
                maxWidth="max-w-2xl"
            >
                <div className="space-y-4">
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
                                className="px-4 py-2 border border-slate-300 dark:border-zinc-700 font-bold uppercase text-[10px] cursor-pointer"
                            >
                                {t('supplier.hub.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={formSubmitting}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold uppercase text-[11px] transition-colors cursor-pointer"
                            >
                                {formSubmitting ? t('supplier.hub.saving') : editingOffer ? t('supplier.hub.recordRevision') : t('supplier.hub.publishOffer')}
                            </button>
                        </div>
                    </form>
                </div>
            </AccessibleModal>

            {/* REVISIONS HISTORY MODAL */}
            <AccessibleModal
                isOpen={isRevisionsModalOpen && Boolean(revisionOffer)}
                onClose={() => setIsRevisionsModalOpen(false)}
                title={revisionOffer?.offer ? `${t('supplier.hub.revisionsLedger')}: ${revisionOffer.offer.supplierSku}` : t('supplier.hub.revisionsLedger')}
                badge="Audit Ledger"
                maxWidth="max-w-2xl"
                footer={
                    <button
                        onClick={() => setIsRevisionsModalOpen(false)}
                        className="px-4 py-2 bg-slate-800 text-white font-bold uppercase text-[10px] cursor-pointer"
                    >
                        {t('supplier.hub.close')}
                    </button>
                }
            >
                <div className="space-y-3">
                    {revisionOffer?.revisions && revisionOffer.revisions.map((rev: any) => (
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
            </AccessibleModal>

            {/* TECHNICAL VARIANT SPECS MODAL */}
            <AccessibleModal
                isOpen={variantDetailModalOpen}
                onClose={() => setVariantDetailModalOpen(false)}
                title={loadingVariantDetail ? 'Loading specifications...' : (viewingVariant?.variant?.productName || t('supplier.hub.variantSpecsTitle'))}
                badge={t('supplier.hub.viewVariantDetails')}
                maxWidth="max-w-2xl"
                footer={
                    <div className="flex justify-between items-center w-full">
                        <button
                            onClick={() => setVariantDetailModalOpen(false)}
                            className="px-4 py-2 border border-slate-300 dark:border-zinc-700 font-bold uppercase text-[10px] cursor-pointer"
                        >
                            {t('supplier.hub.close')}
                        </button>
                        {!isReadOnly && viewingVariant?.variant && (
                            <button
                                onClick={() => {
                                    setVariantDetailModalOpen(false);
                                    handleOpenCreateOffer(viewingVariant.variant);
                                }}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-[10px] cursor-pointer"
                            >
                                {t('supplier.hub.createOffer')}
                            </button>
                        )}
                    </div>
                }
            >
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
                    </div>
                ) : null}
            </AccessibleModal>

            {/* EDIT TECHNICAL VARIANT SPECS MODAL */}
            <AccessibleModal
                isOpen={isEditVariantModalOpen && Boolean(editingVariant)}
                onClose={() => setIsEditVariantModalOpen(false)}
                title={t('supplier.hub.editVariantTitle')}
                subtitle={t('supplier.hub.editVariantWarning')}
                badge="Technical Edit"
                maxWidth="max-w-md"
            >
                {editingVariant && (
                    <form onSubmit={handleSaveVariantSpecs} className="space-y-4 text-xs">
                        <div className="p-2.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                            <p className="font-bold text-slate-900 dark:text-white">{editingVariant.productName}</p>
                            <p className="text-[10px] font-mono text-zinc-400">ID: {editingVariant.id}</p>
                        </div>

                        {variantError && (
                            <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                                <span>{variantError}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">GSM *</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={variantForm.gsm}
                                    onChange={(e) => setVariantForm({ ...variantForm, gsm: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Caliper (µm)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={variantForm.caliperUm}
                                    onChange={(e) => setVariantForm({ ...variantForm, caliperUm: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Width (mm) *</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={variantForm.widthMm}
                                    onChange={(e) => setVariantForm({ ...variantForm, widthMm: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Height (mm) *</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={variantForm.heightMm}
                                    onChange={(e) => setVariantForm({ ...variantForm, heightMm: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono font-bold"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Finish</label>
                                <input
                                    type="text"
                                    value={variantForm.finish}
                                    onChange={(e) => setVariantForm({ ...variantForm, finish: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-500 mb-1">Grain Direction</label>
                                <select
                                    value={variantForm.grainDirection}
                                    onChange={(e) => setVariantForm({ ...variantForm, grainDirection: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-bold"
                                >
                                    <option value="LONG_GRAIN">LONG_GRAIN</option>
                                    <option value="SHORT_GRAIN">SHORT_GRAIN</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setIsEditVariantModalOpen(false)}
                                className="px-4 py-2 border border-slate-300 dark:border-zinc-700 font-bold uppercase text-[10px] cursor-pointer"
                            >
                                {t('supplier.hub.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={savingVariant}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold uppercase text-[11px] transition-colors cursor-pointer"
                            >
                                {savingVariant ? t('supplier.hub.saving') : t('supplier.hub.save')}
                            </button>
                        </div>
                    </form>
                )}
            </AccessibleModal>

            {/* BATCH HISTORY MODAL */}
            <AccessibleModal
                isOpen={isBatchHistoryModalOpen}
                onClose={() => setIsBatchHistoryModalOpen(false)}
                title={t('supplier.hub.batchHistoryTitle')}
                badge="Import History"
                maxWidth="max-w-4xl"
                footer={
                    <button
                        onClick={() => setIsBatchHistoryModalOpen(false)}
                        className="px-4 py-2 border border-slate-300 dark:border-zinc-700 font-bold uppercase text-[10px] cursor-pointer"
                    >
                        {t('supplier.hub.close')}
                    </button>
                }
            >
                <div className="space-y-3">
                    {loadingBatches ? (
                        <p className="p-8 text-center text-zinc-400">Cargando lotes de importación...</p>
                    ) : importBatches.length === 0 ? (
                        <p className="p-8 text-center text-zinc-400">No se registran lotes importados para este proveedor.</p>
                    ) : (
                        <div className="border border-slate-200 dark:border-zinc-800 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                        <th className="p-2.5">Fecha</th>
                                        <th className="p-2.5">Archivo</th>
                                        <th className="p-2.5">Estado</th>
                                        <th className="p-2.5">Filas</th>
                                        <th className="p-2.5 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-zinc-900">
                                    {importBatches.map((b) => (
                                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                                            <td className="p-2.5 font-mono text-[11px] text-zinc-500">
                                                {new Date(b.created_at).toLocaleString()}
                                            </td>
                                            <td className="p-2.5 font-bold text-slate-800 dark:text-zinc-200">
                                                {b.original_filename || b.id.slice(0, 8)}
                                            </td>
                                            <td className="p-2.5">
                                                <StatusBadge status={b.status} />
                                            </td>
                                            <td className="p-2.5 font-mono text-[11px]">
                                                Tot: {b.total_rows} · Vál: {b.valid_rows} · Pend: {b.pending_rows}
                                            </td>
                                            <td className="p-2.5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleDownloadBatchIssues(b.id)}
                                                        className="px-2 py-1 border border-slate-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 font-bold uppercase text-[9px] cursor-pointer"
                                                        title={t('supplier.hub.exportIssuesCsv')}
                                                    >
                                                        {t('supplier.hub.exportIssuesCsv')}
                                                    </button>
                                                    {b.status === 'CONFIRMED' && !isReadOnly && (
                                                        <button
                                                            onClick={() => handleRetractBatch(b)}
                                                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-[9px] cursor-pointer"
                                                        >
                                                            {t('supplier.hub.retractBatch')}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </AccessibleModal>

            {/* CONFIRMATION MODAL */}
            <AccessibleModal
                isOpen={Boolean(confirmModal)}
                onClose={() => setConfirmModal(null)}
                title={confirmModal?.title || t('supplier.hub.confirmAction')}
                badge="Action Confirmation"
                maxWidth="max-w-md"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <button
                            onClick={() => setConfirmModal(null)}
                            className="px-4 py-2 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[10px] cursor-pointer"
                        >
                            {t('supplier.hub.cancel')}
                        </button>
                        <button
                            onClick={async () => {
                                if (confirmModal?.onConfirm) {
                                    await confirmModal.onConfirm();
                                }
                                setConfirmModal(null);
                            }}
                            className={`px-4 py-2 font-bold uppercase text-[10px] text-white cursor-pointer ${
                                confirmModal?.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                            }`}
                        >
                            {confirmModal?.actionLabel || t('supplier.hub.confirmAction')}
                        </button>
                    </div>
                }
            >
                {confirmModal && (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-700 dark:text-zinc-300">
                            {confirmModal.warning}
                        </p>
                    </div>
                )}
            </AccessibleModal>

            {/* OPERATION REPORT MODAL */}
            <AccessibleModal
                isOpen={Boolean(reportModal)}
                onClose={() => setReportModal(null)}
                title={reportModal?.title || t('supplier.hub.operationReportTitle')}
                badge="Batch Execution"
                maxWidth="max-w-xl"
                footer={
                    <button
                        onClick={() => setReportModal(null)}
                        className="px-4 py-2 bg-slate-900 text-white font-bold uppercase text-[10px] cursor-pointer"
                    >
                        {t('supplier.hub.close')}
                    </button>
                }
            >
                {reportModal && (
                    <div className="space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                <p className="text-[10px] uppercase font-bold tracking-wider">{t('supplier.hub.succeeded')}</p>
                                <p className="text-2xl font-black">{reportModal.succeededCount}</p>
                            </div>
                            <div className={`p-3 border ${
                                reportModal.failedCount > 0 
                                    ? 'bg-red-500/10 border-red-500/30 text-red-500' 
                                    : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-zinc-400'
                            }`}>
                                <p className="text-[10px] uppercase font-bold tracking-wider">{t('supplier.hub.failed')}</p>
                                <p className="text-2xl font-black">{reportModal.failedCount}</p>
                            </div>
                        </div>

                        {reportModal.results?.some((r: any) => !r.success) && (
                            <div className="space-y-2">
                                <p className="font-bold text-slate-900 dark:text-white">Detalle de bloqueos o errores:</p>
                                <div className="border border-slate-200 dark:border-zinc-800 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-900 font-mono text-[11px]">
                                    {reportModal.results.filter((r: any) => !r.success).map((r: any, idx: number) => (
                                        <div key={idx} className="p-2.5 bg-red-50/50 dark:bg-red-950/20">
                                            <div className="flex items-center justify-between text-red-600 dark:text-red-400 font-bold">
                                                <span>{r.sku || r.id}</span>
                                                <span className="text-[10px] px-1 bg-red-200 dark:bg-red-900/50">{r.code}</span>
                                            </div>
                                            <p className="text-zinc-600 dark:text-zinc-400 text-[10px] mt-0.5">{r.message}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </AccessibleModal>

            {/* CATALOG ACTION PREVIEW MODAL */}
            <AccessibleModal
                isOpen={isCatalogPreviewModalOpen}
                onClose={() => setIsCatalogPreviewModalOpen(false)}
                title={`${t('supplier.hub.catalogPreviewTitle')}: ${pendingCatalogAction || ''}`}
                badge="Impact Analysis"
                maxWidth="max-w-3xl"
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <button
                            type="button"
                            onClick={() => setIsCatalogPreviewModalOpen(false)}
                            className="px-4 py-2 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[10px] cursor-pointer"
                        >
                            {t('supplier.hub.cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={executingCatalogAction || (catalogActionPreview?.blockedCount > 0 && catalogActionPreview?.targetCount === catalogActionPreview?.blockedCount)}
                            onClick={handleConfirmCatalogAction}
                            className={`px-5 py-2 font-bold uppercase text-[11px] text-white transition-colors cursor-pointer disabled:opacity-50 ${
                                pendingCatalogAction === 'DELETE'
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : pendingCatalogAction === 'ARCHIVE'
                                    ? 'bg-amber-600 hover:bg-amber-700'
                                    : pendingCatalogAction === 'WITHDRAW'
                                    ? 'bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600'
                                    : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                        >
                            {executingCatalogAction ? t('supplier.hub.executingBulkAction') : t('supplier.hub.catalogPreviewExecute')}
                        </button>
                    </div>
                }
            >
                {catalogActionPreview && (
                    <div className="space-y-4 text-xs">
                        {/* Summary Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                                <p className="text-[10px] uppercase font-bold text-zinc-500">{t('supplier.hub.catalogPreviewAffectedCount')}</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">{catalogActionPreview.targetCount}</p>
                            </div>
                            <div className="p-3 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                                <p className="text-[10px] uppercase font-bold text-zinc-500">{t('supplier.hub.catalogPreviewAffectedProducts')}</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">{catalogActionPreview.affectedProducts}</p>
                            </div>
                            <div className="p-3 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                                <p className="text-[10px] uppercase font-bold text-zinc-500">{t('supplier.hub.catalogPreviewActiveOffers')}</p>
                                <p className="text-xl font-black text-amber-600 dark:text-amber-400">{catalogActionPreview.activeOffersCount}</p>
                            </div>
                            <div className={`p-3 border ${
                                catalogActionPreview.blockedCount > 0
                                    ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                                    : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-zinc-400'
                            }`}>
                                <p className="text-[10px] uppercase font-bold">{t('supplier.hub.catalogPreviewBlockedCount')}</p>
                                <p className="text-xl font-black">{catalogActionPreview.blockedCount}</p>
                            </div>
                        </div>

                        {/* Warnings banner */}
                        {catalogActionPreview.warnings && catalogActionPreview.warnings.length > 0 && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 space-y-1">
                                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                                    <ExclamationTriangleIcon className="w-4 h-4" />
                                    <span>Advertencias de Dependencias y Preservación:</span>
                                </div>
                                <ul className="list-disc pl-5 text-amber-700 dark:text-amber-400 space-y-0.5 text-[11px]">
                                    {catalogActionPreview.warnings.map((w: string, idx: number) => (
                                        <li key={idx}>{w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Breakdown per variant */}
                        <div className="space-y-2">
                            <p className="font-bold text-slate-900 dark:text-white">
                                {t('supplier.hub.catalogPreviewActionImpact')}:
                            </p>
                            <div className="border border-slate-200 dark:border-zinc-800 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-900">
                                {catalogActionPreview.items && catalogActionPreview.items.map((item: any) => (
                                    <div key={item.variantId} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-800 dark:text-zinc-200">{item.productName}</span>
                                                <span className="font-mono text-zinc-500 text-[11px]">{item.dimensions} · {item.gsm} gsm</span>
                                                {item.sharedWithOtherSuppliers && (
                                                    <span className="px-1.5 py-0.2 bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[9px] font-bold">
                                                        Ficha Compartida
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{item.actionImpact}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {item.isBlocked ? (
                                                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-[10px] font-bold">
                                                    Bloqueado: {item.blockReason}
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                                    Elegible
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </AccessibleModal>

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
