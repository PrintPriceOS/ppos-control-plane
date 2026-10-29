import React, { useEffect, useState } from 'react';
import {
    ShieldCheckIcon,
    DocumentTextIcon,
    BeakerIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    ClockIcon,
    MagnifyingGlassIcon,
    ArrowUpTrayIcon,
    XMarkIcon,
    LockClosedIcon,
    EyeIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch } from '../../lib/paperSupplierApi';
import { getAuthUser, getUserRole } from '../../lib/authStore';
import { AccessibleModal } from '../AccessibleModal';
import { useLocale } from '../../i18n';

interface TechnicalAccreditationPanelProps {
    onNotify?: (msg: string) => void;
    onError?: (msg: string) => void;
}

export const TechnicalAccreditationPanel: React.FC<TechnicalAccreditationPanelProps> = ({
    onNotify,
    onError
}) => {
    const { t } = useLocale();
    const role = getUserRole();
    const user = getAuthUser();
    const isReadOnly = role === 'SUPPLIER_VIEWER';
    const isTechnologistOrAdmin = role === 'SUPPLIER_ADMIN' || role === 'SUPER_ADMIN' || role === 'ADMIN';

    const [items, setItems] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>({
        totalCatalogVariants: 1524,
        withCaliperCount: 1272,
        missingCaliperTotal: 252,
        physicalMicrometerTrackCount: 145,
        supplierDatasheetTrackCount: 102,
        conflictHoldTrackCount: 5,
        pendingClassificationTotal: 337
    });
    const [loading, setLoading] = useState<boolean>(false);
    const [page, setPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [totalFiltered, setTotalFiltered] = useState<number>(252);

    // Filters
    const [search, setSearch] = useState<string>('');
    const [supplierFilter, setSupplierFilter] = useState<string>('');
    const [priorityFilter, setPriorityFilter] = useState<string>('');
    const [trackFilter, setTrackFilter] = useState<string>('');
    const [familyFilter, setFamilyFilter] = useState<string>('');

    // Selected Variant & Modals
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [activeModal, setActiveModal] = useState<'DATASHEET' | 'MICROMETER' | 'REVIEW' | 'HISTORY' | null>(null);
    const [variantHistoryData, setVariantHistoryData] = useState<any>(null);
    const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [modalError, setModalError] = useState<string | null>(null);

    // Datasheet Form
    const [datasheetForm, setDatasheetForm] = useState({
        proposedCaliperUm: '',
        caliperToleranceUm: '5',
        sourceKind: 'MANUFACTURER_DATASHEET',
        documentTitle: '',
        documentUrl: '',
        documentRevision: '',
        documentPage: 'p. 1',
        notes: '',
        fileBase64: '',
        fileName: ''
    });

    // ISO 534 Physical Micrometer Form (10 readings)
    const [micrometerForm, setMicrometerForm] = useState({
        readings: ['', '', '', '', '', '', '', '', '', ''],
        measuredBatchNumber: '',
        micrometerSerial: 'MITUTOYO-ISO534-01',
        calibrationCertValidUntil: '2027-12-31',
        conditioningTempC: '23.0',
        conditioningHumidityPct: '50.0',
        notes: ''
    });

    // Technologist Review Form
    const [reviewForm, setReviewForm] = useState({
        evidenceId: '',
        decision: 'APPROVE',
        reason: '',
        acknowledgeContradiction: false
    });

    const fetchMissingMaterials = async (
        p = page,
        q = search,
        sup = supplierFilter,
        prio = priorityFilter,
        trk = trackFilter,
        fam = familyFilter
    ) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(p),
                limit: '20'
            });
            if (q) params.set('search', q);
            if (sup) params.set('supplier', sup);
            if (prio) params.set('priorityTier', prio);
            if (trk) params.set('track', trk);
            if (fam) params.set('family', fam);

            const res = await paperSupplierFetch<any>(
                `/api/v1/paper-suppliers/accreditation/missing-materials?${params.toString()}`
            );
            if (res && res.ok && res.data) {
                setItems(res.data.items || []);
                setPage(res.data.page || 1);
                setTotalPages(res.data.totalPages || 1);
                setTotalFiltered(res.data.total || 0);
                if (res.data.summary) {
                    setSummary(res.data.summary);
                }
            }
        } catch (err: any) {
            if (onError) onError(err.message || 'Error loading technical accreditation inventory.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMissingMaterials(1, search, supplierFilter, priorityFilter, trackFilter, familyFilter);
    }, []);

    const loadVariantDetailAndOpen = async (item: any, mode: 'DATASHEET' | 'MICROMETER' | 'REVIEW' | 'HISTORY') => {
        setSelectedItem(item);
        setModalError(null);
        setActiveModal(mode);

        if (mode === 'DATASHEET') {
            setDatasheetForm({
                proposedCaliperUm: '',
                caliperToleranceUm: '5',
                sourceKind: 'MANUFACTURER_DATASHEET',
                documentTitle: `${item.manufacturer && item.manufacturer !== 'UNKNOWN_MANUFACTURER' ? item.manufacturer : item.supplier} — ${item.family} ${item.gsm} g/m² Technical Datasheet`,
                documentUrl: '',
                documentRevision: '2026-Q4',
                documentPage: 'p. 1',
                notes: item.requestId ? `Linked to Supplier Request ${item.requestId}` : '',
                fileBase64: '',
                fileName: ''
            });
        } else if (mode === 'MICROMETER') {
            setMicrometerForm({
                readings: ['', '', '', '', '', '', '', '', '', ''],
                measuredBatchNumber: `LOT-${item.odsCode || item.variantId.slice(0, 8)}`,
                micrometerSerial: 'MITUTOYO-ISO534-01',
                calibrationCertValidUntil: '2027-12-31',
                conditioningTempC: '23.0',
                conditioningHumidityPct: '50.0',
                notes: `ISO 534 10-point measurement (${item.industrialApplication})`
            });
        }

        if (mode === 'REVIEW' || mode === 'HISTORY') {
            setLoadingHistory(true);
            try {
                const res = await paperSupplierFetch<any>(
                    `/api/v1/paper-suppliers/accreditation/variants/${item.variantId}/evidences`
                );
                if (res && res.ok && res.data) {
                    setVariantHistoryData(res.data);
                    const latestEv = res.data.caliperEvidences?.[0];
                    if (latestEv) {
                        setReviewForm({
                            evidenceId: latestEv.id,
                            decision: 'APPROVE',
                            reason: '',
                            acknowledgeContradiction: false
                        });
                    }
                }
            } catch (err: any) {
                setModalError(err.message || 'Failed to load variant evidence details.');
            } finally {
                setLoadingHistory(false);
            }
        }
    };

    const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            setModalError('PDF exceeds maximum allowed size of 10 MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const resultStr = String(reader.result || '');
            const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
            setDatasheetForm((prev) => ({
                ...prev,
                fileBase64: base64,
                fileName: file.name
            }));
            setModalError(null);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmitDatasheet = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        setSubmitting(true);
        setModalError(null);

        try {
            const res = await paperSupplierFetch<any>(
                '/api/v1/paper-suppliers/accreditation/evidences/documentary',
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': `doc-${selectedItem.variantId}-${datasheetForm.proposedCaliperUm}-${Date.now()}`
                    },
                    body: JSON.stringify({
                        variantId: selectedItem.variantId,
                        proposedCaliperUm: Number(datasheetForm.proposedCaliperUm),
                        caliperToleranceUm: datasheetForm.caliperToleranceUm ? Number(datasheetForm.caliperToleranceUm) : null,
                        sourceKind: datasheetForm.sourceKind,
                        documentTitle: datasheetForm.documentTitle,
                        documentUrl: datasheetForm.documentUrl || null,
                        documentRevision: datasheetForm.documentRevision || null,
                        documentPage: datasheetForm.documentPage || null,
                        notes: datasheetForm.notes || null,
                        fileBase64: datasheetForm.fileBase64 || null,
                        fileName: datasheetForm.fileName || null,
                        submitForReview: true
                    })
                }
            );

            if (res && res.ok) {
                if (onNotify) {
                    onNotify(
                        `Documentary evidence registered (${res.data.evidenceId}). Productive caliper remains untouched (productiveCaliperModified = false).`
                    );
                }
                setActiveModal(null);
                fetchMissingMaterials(page, search, supplierFilter, priorityFilter, trackFilter, familyFilter);
            }
        } catch (err: any) {
            setModalError(err.message || 'Failed to register documentary evidence.');
        } finally {
            setSubmitting(false);
        }
    };

    // Live ISO 534 statistics preview
    const numericReadings = micrometerForm.readings
        .map((r) => Number(r))
        .filter((n) => Number.isFinite(n) && n > 0);
    const liveMean =
        numericReadings.length > 0
            ? Math.round((numericReadings.reduce((a, b) => a + b, 0) / numericReadings.length) * 100) / 100
            : 0;
    const liveVariance =
        numericReadings.length > 1
            ? numericReadings.reduce((acc, v) => acc + Math.pow(v - liveMean, 2), 0) / (numericReadings.length - 1)
            : 0;
    const liveSd = Math.round(Math.sqrt(liveVariance) * 100) / 100;
    const liveCv = liveMean > 0 ? Math.round(((liveSd / liveMean) * 100) * 100) / 100 : 0;

    const handleSubmitMicrometer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        setSubmitting(true);
        setModalError(null);

        try {
            const parsedReadings = micrometerForm.readings.map((r) => Number(r));
            const res = await paperSupplierFetch<any>(
                '/api/v1/paper-suppliers/accreditation/evidences/micrometer',
                {
                    method: 'POST',
                    headers: {
                        'Idempotency-Key': `mic-${selectedItem.variantId}-${micrometerForm.measuredBatchNumber}-${Date.now()}`
                    },
                    body: JSON.stringify({
                        variantId: selectedItem.variantId,
                        readingsUm: parsedReadings,
                        measuredBatchNumber: micrometerForm.measuredBatchNumber,
                        micrometerSerial: micrometerForm.micrometerSerial,
                        calibrationCertValidUntil: micrometerForm.calibrationCertValidUntil,
                        conditioningTempC: Number(micrometerForm.conditioningTempC),
                        conditioningHumidityPct: Number(micrometerForm.conditioningHumidityPct),
                        notes: micrometerForm.notes || null,
                        submitForReview: true
                    })
                }
            );

            if (res && res.ok) {
                if (onNotify) {
                    onNotify(
                        `ISO 534 physical measurement registered (${res.data.evidenceId}: mean ${res.data.proposedCaliperUm} µm, CV ${res.data.measuredCvPct}%). Productive caliper untouched.`
                    );
                }
                setActiveModal(null);
                fetchMissingMaterials(page, search, supplierFilter, priorityFilter, trackFilter, familyFilter);
            }
        } catch (err: any) {
            setModalError(err.message || 'Failed to register ISO 534 physical micrometer measurement.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reviewForm.evidenceId) return;
        setSubmitting(true);
        setModalError(null);

        try {
            const res = await paperSupplierFetch<any>(
                `/api/v1/paper-suppliers/accreditation/evidences/${reviewForm.evidenceId}/review`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        decision: reviewForm.decision,
                        reason: reviewForm.reason,
                        acknowledgeContradiction: reviewForm.acknowledgeContradiction
                    })
                }
            );

            if (res && res.ok) {
                if (onNotify) {
                    onNotify(
                        `Evidence ${reviewForm.evidenceId} reviewed (${res.data.newStatus}). Productive paper_variants.caliper_um modified: ${String(res.data.productiveCaliperModified)}.`
                    );
                }
                setActiveModal(null);
                fetchMissingMaterials(page, search, supplierFilter, priorityFilter, trackFilter, familyFilter);
            }
        } catch (err: any) {
            setModalError(err.message || 'Failed to review evidence.');
        } finally {
            setSubmitting(false);
        }
    };

    const renderTrackBadge = (track: string) => {
        if (track === 'PHYSICAL_MICROMETER_TRACK') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono">
                    <BeakerIcon className="w-3.5 h-3.5" />
                    {t('supplier.accreditation.trackPhysical')}
                </span>
            );
        }
        if (track === 'SUPPLIER_DATASHEET_TRACK') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 font-mono">
                    <DocumentTextIcon className="w-3.5 h-3.5" />
                    {t('supplier.accreditation.trackDatasheet')}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 font-mono">
                <LockClosedIcon className="w-3.5 h-3.5" />
                {t('supplier.accreditation.trackConflict')}
            </span>
        );
    };

    const renderEvidenceStatusBadge = (status: string | null) => {
        if (!status) {
            return (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    {t('supplier.accreditation.noEvidenceYet')}
                </span>
            );
        }
        if (status === 'CERTIFIED_MEASURED' || status === 'APPROVED_FOR_TECHNICAL_USE') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-mono">
                    {status}
                </span>
            );
        }
        if (status === 'PENDING_TECH_REVIEW') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono">
                    {status}
                </span>
            );
        }
        if (status === 'REJECTED') {
            return (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-mono">
                    {status}
                </span>
            );
        }
        return (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                {status}
            </span>
        );
    };

    return (
        <div className="space-y-5" data-testid="technical-accreditation-panel">
            {/* Industrial Lock & Non-Mutation Governance Banner */}
            <div className="p-4 rounded-2xl bg-slate-900 dark:bg-zinc-900 text-white border-l-4 border-red-600 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <LockClosedIcon className="w-4 h-4 text-red-500 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider text-red-400">
                            {t('supplier.accreditation.lockBannerTitle')}
                        </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                        {t('supplier.accreditation.lockBannerDesc')}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200">
                        canReleaseToManufacturing: <strong className="text-red-400">false</strong>
                    </span>
                </div>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-500 font-medium">{t('supplier.accreditation.kpiCaliperPresent')}</div>
                    <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
                        {summary.withCaliperCount} <span className="text-xs font-normal text-zinc-400">/ {summary.totalCatalogVariants}</span>
                    </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-500 font-medium">{t('supplier.accreditation.kpiMissingCaliper')}</div>
                    <div className="text-lg font-black font-mono text-red-600 dark:text-red-400 mt-1">
                        {summary.missingCaliperTotal} <span className="text-xs font-normal text-zinc-400">(16.54%)</span>
                    </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-500 font-medium">{t('supplier.accreditation.kpiPhysicalTrack')}</div>
                    <div className="text-lg font-black font-mono text-amber-600 dark:text-amber-400 mt-1">
                        {summary.physicalMicrometerTrackCount}
                    </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-[11px] text-zinc-500 font-medium">{t('supplier.accreditation.kpiDatasheetTrack')}</div>
                    <div className="text-lg font-black font-mono text-blue-600 dark:text-blue-400 mt-1">
                        {summary.supplierDatasheetTrackCount}
                    </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 col-span-2 sm:col-span-1">
                    <div className="text-[11px] text-zinc-500 font-medium">{t('supplier.accreditation.kpiPendingClass')}</div>
                    <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
                        {summary.pendingClassificationTotal}
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="relative flex-1 min-w-[220px]">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                    <input
                        type="text"
                        placeholder={t('supplier.accreditation.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) =>
                            e.key === 'Enter' &&
                            fetchMissingMaterials(1, search, supplierFilter, priorityFilter, trackFilter, familyFilter)
                        }
                        className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <select
                        aria-label="Filter by supplier"
                        value={supplierFilter}
                        onChange={(e) => {
                            setSupplierFilter(e.target.value);
                            fetchMissingMaterials(1, search, e.target.value, priorityFilter, trackFilter, familyFilter);
                        }}
                        className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                        <option value="">{t('supplier.accreditation.filterAllSuppliers')}</option>
                        <option value="Antalis">Antalis (182)</option>
                        <option value="Papyrus">Papyrus (54)</option>
                        <option value="Polap">Polap (9)</option>
                        <option value="Dardedze">Dardedze (5)</option>
                        <option value="Oldi">Oldi (2)</option>
                    </select>

                    <select
                        aria-label="Filter by priority tier"
                        value={priorityFilter}
                        onChange={(e) => {
                            setPriorityFilter(e.target.value);
                            fetchMissingMaterials(1, search, supplierFilter, e.target.value, trackFilter, familyFilter);
                        }}
                        className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                        <option value="">{t('supplier.accreditation.filterAllPriorities')}</option>
                        <option value="P1">P1 — Immediate Book Spine / Cover</option>
                        <option value="P2">P2 — Packaging & Graphic Board</option>
                        <option value="P3">P3 — Specialty / Self-Adhesive / Conflict</option>
                    </select>

                    <select
                        aria-label="Filter by accreditation track"
                        value={trackFilter}
                        onChange={(e) => {
                            setTrackFilter(e.target.value);
                            fetchMissingMaterials(1, search, supplierFilter, priorityFilter, e.target.value, familyFilter);
                        }}
                        className="px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                        <option value="">{t('supplier.accreditation.filterAllTracks')}</option>
                        <option value="PHYSICAL_MICROMETER_TRACK">{t('supplier.accreditation.trackPhysical')} (145)</option>
                        <option value="SUPPLIER_DATASHEET_TRACK">{t('supplier.accreditation.trackDatasheet')} (102)</option>
                        <option value="CONFLICT_HOLD_TRACK">{t('supplier.accreditation.trackConflict')} (5)</option>
                    </select>

                    <button
                        onClick={() => fetchMissingMaterials(1, search, supplierFilter, priorityFilter, trackFilter, familyFilter)}
                        className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                        {t('supplier.hub.filterButton')}
                    </button>
                </div>
            </div>

            {/* Table of 252 Missing-Caliper Variants */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                <th className="py-3 px-4">{t('supplier.accreditation.colVariant')}</th>
                                <th className="py-3 px-4">{t('supplier.accreditation.colSupplier')}</th>
                                <th className="py-3 px-4">{t('supplier.accreditation.colTrack')}</th>
                                <th className="py-3 px-4">{t('supplier.accreditation.colDocStatus')}</th>
                                <th className="py-3 px-4">{t('supplier.accreditation.colEvidenceStatus')}</th>
                                <th className="py-3 px-4 text-right">{t('supplier.accreditation.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="py-10 text-center text-zinc-400">
                                        Loading technical accreditation inventory...
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-10 text-center text-zinc-400">
                                        No missing-caliper variants match the current filter criteria.
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr
                                        key={item.variantId}
                                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                                    >
                                        <td className="py-3 px-4">
                                            <div className="font-bold text-slate-900 dark:text-white">
                                                {item.displayName}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-[11px] text-zinc-500">
                                                <span>SKU: {item.odsCode || 'N/A'}</span>
                                                <span>·</span>
                                                <span>{item.gsm} g/m²</span>
                                                <span>·</span>
                                                <span>{item.widthMm}×{item.heightMm} mm</span>
                                                <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold">
                                                    {item.priorityTier}
                                                </span>
                                            </div>
                                        </td>

                                        <td className="py-3 px-4">
                                            <div className="font-semibold text-slate-800 dark:text-zinc-200">
                                                {item.supplier}
                                            </div>
                                            <div className="text-[11px] text-zinc-500">
                                                {item.manufacturer !== 'UNKNOWN_MANUFACTURER' ? item.manufacturer : item.family}
                                            </div>
                                        </td>

                                        <td className="py-3 px-4">
                                            <div>{renderTrackBadge(item.accreditationTrack)}</div>
                                            <div className="text-[11px] text-zinc-500 mt-1">
                                                {item.industrialApplication}
                                            </div>
                                        </td>

                                        <td className="py-3 px-4 font-mono text-[11px]">
                                            {item.requestId ? (
                                                <div>
                                                    <span className="font-bold text-slate-800 dark:text-zinc-200">
                                                        {item.requestId}
                                                    </span>
                                                    <div className="text-zinc-500">{item.requestStatus}</div>
                                                </div>
                                            ) : (
                                                <span className="text-zinc-400">INTERNAL_LAB_METROLOGY</span>
                                            )}
                                        </td>

                                        <td className="py-3 px-4">
                                            <div className="flex flex-col gap-1 items-start">
                                                {renderEvidenceStatusBadge(item.evidenceStatus)}
                                                {item.latestProposedCaliperUm && (
                                                    <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300">
                                                        Proposed: <strong>{item.latestProposedCaliperUm} µm</strong> (prod: NULL)
                                                    </span>
                                                )}
                                                {item.hasSourceContradiction && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                                                        <ExclamationTriangleIcon className="w-3 h-3" />
                                                        {t('supplier.accreditation.contradictionBadge')}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        <td className="py-3 px-4 text-right">
                                            <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                                                {!isReadOnly && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => loadVariantDetailAndOpen(item, 'DATASHEET')}
                                                            className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-semibold text-[11px] cursor-pointer"
                                                        >
                                                            {t('supplier.accreditation.btnDatasheet')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => loadVariantDetailAndOpen(item, 'MICROMETER')}
                                                            className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold text-[11px] cursor-pointer"
                                                        >
                                                            {t('supplier.accreditation.btnMicrometer')}
                                                        </button>
                                                    </>
                                                )}
                                                {isTechnologistOrAdmin && item.evidenceCount > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => loadVariantDetailAndOpen(item, 'REVIEW')}
                                                        className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-[11px] cursor-pointer"
                                                    >
                                                        {t('supplier.accreditation.btnReview')}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => loadVariantDetailAndOpen(item, 'HISTORY')}
                                                    className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold text-[11px] cursor-pointer"
                                                >
                                                    {t('supplier.accreditation.btnHistory')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                    <div>
                        Showing page <strong className="font-mono">{page}</strong> of{' '}
                        <strong className="font-mono">{totalPages}</strong> ({totalFiltered} variants)
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() =>
                                fetchMissingMaterials(page - 1, search, supplierFilter, priorityFilter, trackFilter, familyFilter)
                            }
                            className="px-3 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 cursor-pointer"
                        >
                            Prev
                        </button>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() =>
                                fetchMissingMaterials(page + 1, search, supplierFilter, priorityFilter, trackFilter, familyFilter)
                            }
                            className="px-3 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 cursor-pointer"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* MODAL 1: REGISTER PDF DATASHEET / DOCUMENTARY EVIDENCE */}
            <AccessibleModal
                isOpen={activeModal === 'DATASHEET' && Boolean(selectedItem)}
                onClose={() => setActiveModal(null)}
                title={t('supplier.accreditation.modalDatasheetTitle')}
                maxWidthClass="max-w-xl"
            >
                {selectedItem && (
                    <form onSubmit={handleSubmitDatasheet} className="space-y-4 text-xs">
                        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                            <div className="font-bold text-slate-900 dark:text-white">{selectedItem.displayName}</div>
                            <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                                ID: {selectedItem.variantId} · SKU: {selectedItem.odsCode} · Track: {selectedItem.accreditationTrack}
                            </div>
                        </div>

                        {modalError && (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
                                {modalError}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldProposedCaliper')} *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="20"
                                    max="2500"
                                    required
                                    value={datasheetForm.proposedCaliperUm}
                                    onChange={(e) => setDatasheetForm({ ...datasheetForm, proposedCaliperUm: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldTolerance')}</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="200"
                                    value={datasheetForm.caliperToleranceUm}
                                    onChange={(e) => setDatasheetForm({ ...datasheetForm, caliperToleranceUm: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldSourceKind')}</label>
                                <select
                                    value={datasheetForm.sourceKind}
                                    onChange={(e) => setDatasheetForm({ ...datasheetForm, sourceKind: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                                >
                                    <option value="MANUFACTURER_DATASHEET">MANUFACTURER_DATASHEET</option>
                                    <option value="SUPPLIER_TECHNICAL_DECLARATION">SUPPLIER_TECHNICAL_DECLARATION</option>
                                </select>
                            </div>
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldDocRev')}</label>
                                <input
                                    type="text"
                                    value={datasheetForm.documentRevision}
                                    onChange={(e) => setDatasheetForm({ ...datasheetForm, documentRevision: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldDocTitle')} *</label>
                            <input
                                type="text"
                                required
                                value={datasheetForm.documentTitle}
                                onChange={(e) => setDatasheetForm({ ...datasheetForm, documentTitle: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldDocUrl')}</label>
                                <input
                                    type="url"
                                    placeholder="https://..."
                                    value={datasheetForm.documentUrl}
                                    onChange={(e) => setDatasheetForm({ ...datasheetForm, documentUrl: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldDocPage')}</label>
                                <input
                                    type="text"
                                    value={datasheetForm.documentPage}
                                    onChange={(e) => setDatasheetForm({ ...datasheetForm, documentPage: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldPdfFile')}</label>
                            <input
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={handlePdfFileChange}
                                className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-200 dark:file:bg-zinc-800 file:font-semibold"
                            />
                            {datasheetForm.fileName && (
                                <div className="text-[11px] font-mono text-emerald-600 mt-1">
                                    Ready: {datasheetForm.fileName}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldNotes')}</label>
                            <textarea
                                rows={2}
                                value={datasheetForm.notes}
                                onChange={(e) => setDatasheetForm({ ...datasheetForm, notes: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                            />
                        </div>

                        <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-300">
                            {t('supplier.accreditation.nonMutationNotice')}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setActiveModal(null)}
                                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                            >
                                {submitting ? 'Saving...' : t('supplier.accreditation.btnSubmitEvidence')}
                            </button>
                        </div>
                    </form>
                )}
            </AccessibleModal>

            {/* MODAL 2: REGISTER ISO 534 PHYSICAL MICROMETER MEASUREMENT */}
            <AccessibleModal
                isOpen={activeModal === 'MICROMETER' && Boolean(selectedItem)}
                onClose={() => setActiveModal(null)}
                title={t('supplier.accreditation.modalMicrometerTitle')}
                maxWidthClass="max-w-2xl"
            >
                {selectedItem && (
                    <form onSubmit={handleSubmitMicrometer} className="space-y-4 text-xs">
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white">{selectedItem.displayName}</div>
                                <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                                    ISO 534:2011 · Platen 200 mm² (Ø 16.0 mm) · Pressure 50 ± 1 kPa
                                </div>
                            </div>
                            <div className="text-right font-mono">
                                <div className="text-sm font-black text-amber-700 dark:text-amber-300">
                                    Mean: {liveMean > 0 ? `${liveMean} µm` : '—'}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                    SD: {liveSd} µm · CV: {liveCv}%
                                </div>
                            </div>
                        </div>

                        {modalError && (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
                                {modalError}
                            </div>
                        )}

                        <div>
                            <label className="block font-semibold mb-1.5">{t('supplier.accreditation.fieldReadings')} *</label>
                            <div className="grid grid-cols-5 gap-2">
                                {micrometerForm.readings.map((val, idx) => (
                                    <input
                                        key={idx}
                                        type="number"
                                        step="0.1"
                                        min="20"
                                        max="2500"
                                        required
                                        placeholder={`#${idx + 1} µm`}
                                        value={val}
                                        onChange={(e) => {
                                            const next = [...micrometerForm.readings];
                                            next[idx] = e.target.value;
                                            setMicrometerForm({ ...micrometerForm, readings: next });
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-center"
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldBatchNumber')} *</label>
                                <input
                                    type="text"
                                    required
                                    value={micrometerForm.measuredBatchNumber}
                                    onChange={(e) => setMicrometerForm({ ...micrometerForm, measuredBatchNumber: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldSerial')} *</label>
                                <input
                                    type="text"
                                    required
                                    value={micrometerForm.micrometerSerial}
                                    onChange={(e) => setMicrometerForm({ ...micrometerForm, micrometerSerial: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldCalibExpiry')} *</label>
                                <input
                                    type="date"
                                    required
                                    value={micrometerForm.calibrationCertValidUntil}
                                    onChange={(e) => setMicrometerForm({ ...micrometerForm, calibrationCertValidUntil: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldTemp')} *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    required
                                    value={micrometerForm.conditioningTempC}
                                    onChange={(e) => setMicrometerForm({ ...micrometerForm, conditioningTempC: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldHumidity')} *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    required
                                    value={micrometerForm.conditioningHumidityPct}
                                    onChange={(e) => setMicrometerForm({ ...micrometerForm, conditioningHumidityPct: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldNotes')}</label>
                            <textarea
                                rows={2}
                                value={micrometerForm.notes}
                                onChange={(e) => setMicrometerForm({ ...micrometerForm, notes: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setActiveModal(null)}
                                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                            >
                                {submitting ? 'Saving...' : t('supplier.accreditation.btnSubmitEvidence')}
                            </button>
                        </div>
                    </form>
                )}
            </AccessibleModal>

            {/* MODAL 3: TECHNOLOGIST REVIEW & APPROVAL (SEGREGATION OF DUTIES) */}
            <AccessibleModal
                isOpen={activeModal === 'REVIEW' && Boolean(selectedItem)}
                onClose={() => setActiveModal(null)}
                title={t('supplier.accreditation.modalReviewTitle')}
                maxWidthClass="max-w-xl"
            >
                {selectedItem && (
                    <form onSubmit={handleSubmitReview} className="space-y-4 text-xs">
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-slate-800 dark:text-zinc-200">
                            <div className="font-bold">{t('supplier.accreditation.sodNotice')}</div>
                            <div className="mt-1 text-[11px] font-mono text-zinc-500">
                                Active Reviewer: {user?.id || user?.email || 'Authenticated Admin'}
                            </div>
                        </div>

                        {modalError && (
                            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-400 font-semibold">
                                {modalError}
                            </div>
                        )}

                        {loadingHistory ? (
                            <div className="py-6 text-center text-zinc-400">Loading candidate evidences...</div>
                        ) : (
                            <>
                                <div>
                                    <label className="block font-semibold mb-1">Select Candidate Evidence Record</label>
                                    <select
                                        value={reviewForm.evidenceId}
                                        onChange={(e) => setReviewForm({ ...reviewForm, evidenceId: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
                                    >
                                        {(variantHistoryData?.caliperEvidences || []).map((ev: any) => (
                                            <option key={ev.id} value={ev.id}>
                                                {ev.id} · {ev.source_kind} · {ev.proposed_caliper_um} µm · {ev.status} (by {ev.submitted_by})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setReviewForm({ ...reviewForm, decision: 'APPROVE' })}
                                        className={`py-2.5 px-3 rounded-xl font-bold border cursor-pointer ${
                                            reviewForm.decision === 'APPROVE'
                                                ? 'bg-emerald-600 text-white border-emerald-600'
                                                : 'border-zinc-300 dark:border-zinc-700'
                                        }`}
                                    >
                                        {t('supplier.accreditation.btnApprove')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setReviewForm({ ...reviewForm, decision: 'REJECT' })}
                                        className={`py-2.5 px-3 rounded-xl font-bold border cursor-pointer ${
                                            reviewForm.decision === 'REJECT'
                                                ? 'bg-red-600 text-white border-red-600'
                                                : 'border-zinc-300 dark:border-zinc-700'
                                        }`}
                                    >
                                        {t('supplier.accreditation.btnReject')}
                                    </button>
                                </div>

                                <label className="flex items-start gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={reviewForm.acknowledgeContradiction}
                                        onChange={(e) =>
                                            setReviewForm({ ...reviewForm, acknowledgeContradiction: e.target.checked })
                                        }
                                        className="mt-0.5"
                                    />
                                    <span>{t('supplier.accreditation.ackContradictionLabel')}</span>
                                </label>

                                <div>
                                    <label className="block font-semibold mb-1">{t('supplier.accreditation.fieldNotes')} *</label>
                                    <textarea
                                        rows={3}
                                        required
                                        placeholder="Minimum 5 characters explaining metrological or documentary verification..."
                                        value={reviewForm.reason}
                                        onChange={(e) => setReviewForm({ ...reviewForm, reason: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                                    />
                                </div>

                                <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-300">
                                    {t('supplier.accreditation.nonMutationNotice')}
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveModal(null)}
                                        className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting || !reviewForm.evidenceId}
                                        className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold cursor-pointer disabled:opacity-50"
                                    >
                                        {submitting ? 'Processing...' : 'Confirm Governed Decision'}
                                    </button>
                                </div>
                            </>
                        )}
                    </form>
                )}
            </AccessibleModal>

            {/* MODAL 4: IMMUTABLE EVIDENCE & AUDIT HISTORY */}
            <AccessibleModal
                isOpen={activeModal === 'HISTORY' && Boolean(selectedItem)}
                onClose={() => setActiveModal(null)}
                title={t('supplier.accreditation.modalHistoryTitle')}
                maxWidthClass="max-w-2xl"
            >
                {selectedItem && (
                    <div className="space-y-4 text-xs">
                        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                            <div className="font-bold text-slate-900 dark:text-white">{selectedItem.displayName}</div>
                            <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                                Variant ID: {selectedItem.variantId} · Productive Caliper:{' '}
                                {variantHistoryData?.variant?.productiveCaliperUm ?? 'NULL (Untouched)'}
                            </div>
                            {variantHistoryData?.spineProvenance && (
                                <div className="font-mono text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                    Spine Provenance Tier: {variantHistoryData.spineProvenance.evidenceTier} · canPromoteProfileToProductionCertified:{' '}
                                    {String(variantHistoryData.spineProvenance.canPromoteProfileToProductionCertified)}
                                </div>
                            )}
                        </div>

                        {loadingHistory ? (
                            <div className="py-6 text-center text-zinc-400">Loading audit log...</div>
                        ) : (
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                <div className="font-bold uppercase tracking-wider text-[11px] text-zinc-500">
                                    Registered Evidences ({(variantHistoryData?.caliperEvidences || []).length})
                                </div>
                                {(variantHistoryData?.caliperEvidences || []).length === 0 ? (
                                    <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-400">
                                        No caliper evidence records registered yet for this variant.
                                    </div>
                                ) : (
                                    (variantHistoryData?.caliperEvidences || []).map((ev: any) => (
                                        <div
                                            key={ev.id}
                                            className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-1 font-mono text-[11px]"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-slate-900 dark:text-white">
                                                    {ev.id} ({ev.source_kind})
                                                </span>
                                                {renderEvidenceStatusBadge(ev.status)}
                                            </div>
                                            <div>
                                                Proposed: <strong>{ev.proposed_caliper_um} µm</strong> · Submitted by: {ev.submitted_by}
                                                {ev.approved_by_technologist ? ` · Approved by: ${ev.approved_by_technologist}` : ''}
                                            </div>
                                            {ev.document_sha256 && (
                                                <div className="text-zinc-500 truncate">SHA-256: {ev.document_sha256}</div>
                                            )}
                                            {Boolean(ev.has_source_contradiction) && (
                                                <div className="text-red-500 font-bold">
                                                    Contradiction Alert: {ev.contradiction_details}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}

                                <div className="font-bold uppercase tracking-wider text-[11px] text-zinc-500 pt-2">
                                    Immutable Audit Log ({(variantHistoryData?.auditHistory || []).length})
                                </div>
                                {(variantHistoryData?.auditHistory || []).map((log: any) => (
                                    <div
                                        key={log.id}
                                        className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 font-mono text-[11px]"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-red-600 dark:text-red-400">{log.action}</span>
                                            <span className="text-zinc-400">{log.created_at}</span>
                                        </div>
                                        <div className="text-zinc-600 dark:text-zinc-300 mt-0.5">
                                            Actor: {log.actor_id} ({log.actor_role}) · {log.previous_status || 'NONE'} → {log.new_status || 'NONE'}
                                        </div>
                                        {log.reason && <div className="text-zinc-500 mt-0.5">Reason: {log.reason}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </AccessibleModal>
        </div>
    );
};

