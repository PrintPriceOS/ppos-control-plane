import React, { useState } from 'react';
import { 
    XMarkIcon,
    ArrowUpTrayIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch, SupplierApiError } from '../../lib/paperSupplierApi';
import { StatusBadge } from '../StatusBadge';
import { useLocale } from '../../i18n';
import { AccessibleModal } from '../AccessibleModal';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportConfirmed: () => void;
}

export const TechnicalImportModal: React.FC<ImportModalProps> = ({
    isOpen,
    onClose,
    onImportConfirmed
}) => {
    const { t } = useLocale();
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState<boolean>(false);
    const [previewData, setPreviewData] = useState<any>(null);
    const [batchRows, setBatchRows] = useState<any[]>([]);
    const [loadingRows, setLoadingRows] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<boolean>(false);
    const [savingDecisions, setSavingDecisions] = useState<boolean>(false);
    const [page, setPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [decisions, setDecisions] = useState<Record<string, { decision: string; overrides?: any }>>({});
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);

    if (!isOpen) return null;

    const handleResetImport = () => {
        setFile(null);
        setUploading(false);
        setPreviewData(null);
        setBatchRows([]);
        setLoadingRows(false);
        setError(null);
        setConfirming(false);
        setSavingDecisions(false);
        setBulkActionLoading(false);
        setPage(1);
        setTotalPages(1);
        setFilterStatus('');
        setDecisions({});
        setSuccessMessage(null);
    };

    const handleBulkAction = async (action: string) => {
        if (!previewData?.batchId) return;
        setBulkActionLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/imports/${previewData.batchId}/rows`, {
                method: 'PATCH',
                body: JSON.stringify({ action })
            });
            if (res && res.ok) {
                setSuccessMessage(`${t('supplier.hub.executingBulkAction')} (${res.data?.updatedCount || 0})`);
                setDecisions({});
                await loadBatchRows(previewData.batchId, page, filterStatus);
            } else {
                setError(t('supplier.hub.bulkActionError'));
            }
        } catch (err: any) {
            setError(err.message || t('supplier.hub.bulkActionFailed'));
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
            setSuccessMessage(null);
        }
    };

    const handleUploadPreview = async () => {
        if (!file) return;
        setUploading(true);
        setError(null);
        setSuccessMessage(null);

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const base64 = (reader.result as string).split(',')[1];
                const res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/catalog/imports/preview', {
                    method: 'POST',
                    body: JSON.stringify({
                        fileBase64: base64,
                        fileName: file.name
                    })
                });

                if (res && res.ok && res.data) {
                    setPreviewData(res.data);
                    setDecisions({});
                    await loadBatchRows(res.data.batchId, 1, '');
                } else {
                    setError('Error processing technical import preview.');
                }
            } catch (err: any) {
                if (err instanceof SupplierApiError) {
                    setError(err.message);
                } else {
                    setError(err?.message || 'Failed to upload and parse file.');
                }
            } finally {
                setUploading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    const loadBatchRows = async (batchId: string, pageNum: number, status: string) => {
        setLoadingRows(true);
        try {
            const queryParams = new URLSearchParams({
                page: String(pageNum),
                limit: '20'
            });
            if (status) queryParams.set('status', status);

            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/imports/${batchId}/rows?${queryParams.toString()}`);
            if (res && res.ok && res.data) {
                setBatchRows(res.data.rows || []);
                setPage(res.data.page);
                setTotalPages(res.data.totalPages || 1);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch batch rows.');
        } finally {
            setLoadingRows(false);
        }
    };

    const handleDecisionChange = (rowId: string, decision: string) => {
        setDecisions(prev => ({
            ...prev,
            [rowId]: {
                ...(prev[rowId] || {}),
                decision
            }
        }));
    };

    const handleOverrideChange = (rowId: string, field: string, value: any) => {
        setDecisions(prev => ({
            ...prev,
            [rowId]: {
                ...(prev[rowId] || { decision: 'PENDING' }),
                overrides: {
                    ...(prev[rowId]?.overrides || {}),
                    [field]: value
                }
            }
        }));
    };

    const handleApplyDecisions = async (): Promise<boolean> => {
        if (!previewData?.batchId || Object.keys(decisions).length === 0) return true;
        setSavingDecisions(true);
        setError(null);
        try {
            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/imports/${previewData.batchId}/rows`, {
                method: 'PATCH',
                body: JSON.stringify({ decisions })
            });
            if (res && res.ok) {
                setSuccessMessage(`Saved ${res.data?.updatedCount || Object.keys(decisions).length} row overrides and decisions successfully.`);
                setDecisions({});
                await loadBatchRows(previewData.batchId, page, filterStatus);
                return true;
            } else {
                setError('Failed to apply row decisions.');
                return false;
            }
        } catch (err: any) {
            setError(err.message || 'Failed to submit review decisions.');
            return false;
        } finally {
            setSavingDecisions(false);
        }
    };

    const handleConfirmBatch = async () => {
        if (!previewData?.batchId) return;
        setConfirming(true);
        setError(null);
        setSuccessMessage(null);

        try {
            // If there are unsaved decisions or overrides, save them first via PATCH and check success
            if (Object.keys(decisions).length > 0) {
                const patchOk = await handleApplyDecisions();
                if (!patchOk) {
                    setConfirming(false);
                    return;
                }
            }

            const res = await paperSupplierFetch<any>(`/api/v1/paper-suppliers/catalog/imports/${previewData.batchId}/confirm`, {
                method: 'POST',
                body: JSON.stringify({})
            });

            if (res && res.ok && res.data) {
                setSuccessMessage(`Batch confirmed successfully! Created ${res.data.confirmedProducts} products and ${res.data.confirmedVariants} variants.`);
                setTimeout(() => {
                    onImportConfirmed();
                    onClose();
                }, 1500);
            } else {
                setError('Cannot confirm batch with unresolved pending rows.');
            }
        } catch (err: any) {
            setError(err.message || 'Confirmation failed on server.');
        } finally {
            setConfirming(false);
        }
    };

    const hasUnsavedDecisions = Object.keys(decisions).length > 0;

    const footerContent = previewData ? (
        <div className="flex items-center justify-between w-full">
            <div>
                <button
                    onClick={handleResetImport}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium text-xs rounded-xl transition-colors cursor-pointer"
                    title="Discard current batch and start a fresh import"
                >
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    <span>{t('supplier.hub.startNewImport')}</span>
                </button>
            </div>
            <div className="flex items-center gap-3">
                {hasUnsavedDecisions && (
                    <button
                        onClick={() => handleApplyDecisions()}
                        disabled={savingDecisions}
                        className="px-3.5 py-2 bg-slate-800 text-white font-medium text-xs rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                        {savingDecisions ? t('supplier.hub.saving') : `${t('supplier.hub.saveDecisions')} (${Object.keys(decisions).length})`}
                    </button>
                )}
                <button
                    onClick={handleConfirmBatch}
                    disabled={confirming || savingDecisions}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                    {confirming ? t('supplier.hub.confirmingBatch') : t('supplier.hub.confirmCatalog')}
                </button>
            </div>
        </div>
    ) : undefined;

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title={t('supplier.hub.importerTitle')}
            subtitle="ODS · XLSX · CSV RFC 4180"
            badge="Technical Importer"
            maxWidth="max-w-5xl"
            hasUnsavedChanges={hasUnsavedDecisions}
            unsavedWarningMessage={t('supplier.hub.unsavedDecisionsWarning')}
            footer={footerContent}
        >
            <div className="space-y-6 text-xs">
                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 rounded-xl flex items-start gap-3">
                            <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Import or Review Issue</p>
                                <p className="mt-0.5">{error}</p>
                            </div>
                        </div>
                    )}

                    {successMessage && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-xl flex items-start gap-3">
                            <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Success</p>
                                <p className="mt-0.5">{successMessage}</p>
                            </div>
                        </div>
                    )}

                    {!previewData ? (
                        /* Step 1: Upload File */
                        <div className="space-y-4">
                            <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-3 bg-zinc-50/50 dark:bg-zinc-900/40 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
                                <ArrowUpTrayIcon className="w-10 h-10 text-zinc-400" />
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-zinc-200">
                                        {t('supplier.hub.selectFile')}
                                    </p>
                                    <p className="text-zinc-500 text-[11px] mt-1">
                                        {t('supplier.hub.supportedFormats')}
                                    </p>
                                </div>
                                <input
                                    type="file"
                                    id="paper-catalog-file-upload"
                                    accept=".ods,.xlsx,.csv"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                                <label
                                    htmlFor="paper-catalog-file-upload"
                                    className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-xs rounded-xl cursor-pointer hover:bg-slate-800 dark:hover:bg-zinc-100 transition-colors shadow-2xs"
                                >
                                    {t('supplier.hub.browseFiles')}
                                </label>
                                {file && (
                                    <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold mt-2">
                                        Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end">
                                <button
                                    onClick={handleUploadPreview}
                                    disabled={!file || uploading}
                                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                                >
                                    {uploading ? t('supplier.hub.processingFile') : t('supplier.hub.uploadAnalyze')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Step 2: Staged Review & Confirmation */
                        <div className="space-y-5">
                            {/* Summary Metrics Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                                    <span className="text-[10px] font-bold uppercase text-zinc-500">{t('supplier.hub.totalRows')}</span>
                                    <p className="text-xl font-black font-mono mt-1">{previewData.summary?.totalRows || 0}</p>
                                </div>
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                    <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">{t('supplier.hub.validRows')}</span>
                                    <p className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">{previewData.summary?.validRows || 0}</p>
                                </div>
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                    <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">{t('supplier.hub.pendingReview')}</span>
                                    <p className="text-xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1">{previewData.summary?.pendingRows || 0}</p>
                                </div>
                                <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                                    <span className="text-[10px] font-bold uppercase text-violet-600 dark:text-violet-400">{t('supplier.hub.duplicates')}</span>
                                    <p className="text-xl font-black font-mono text-violet-600 dark:text-violet-400 mt-1">{previewData.summary?.duplicateRows || 0}</p>
                                </div>
                            </div>

                            {/* Warning Banner regarding 1,544 pending rows */}
                            {previewData.summary?.pendingRows > 0 && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl flex items-start gap-2 text-[11px]">
                                    <InformationCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="font-bold">Pending Rows Safeguard:</span> {t('supplier.hub.pendingSafeguard')}
                                    </div>
                                </div>
                            )}

                            {/* Table of Rows */}
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-zinc-500 text-[10px] uppercase">Filter:</span>
                                        <select
                                            value={filterStatus}
                                            onChange={(e) => {
                                                setFilterStatus(e.target.value);
                                                loadBatchRows(previewData.batchId, 1, e.target.value);
                                            }}
                                            className="px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-[11px]"
                                        >
                                            <option value="">All Statuses</option>
                                            <option value="VALID">Valid</option>
                                            <option value="WARNING">Warning</option>
                                            <option value="DUPLICATE">Duplicate</option>
                                            <option value="REJECTED">Rejected</option>
                                        </select>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => handleBulkAction('ACCEPT_ALL_VALID')}
                                            disabled={bulkActionLoading || savingDecisions}
                                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                                            title={t('supplier.hub.acceptAllValidTitle')}
                                        >
                                            {t('supplier.hub.acceptAllValid')}
                                        </button>
                                        <button
                                            onClick={() => handleBulkAction('ACCEPT_SAFE_WARNINGS')}
                                            disabled={bulkActionLoading || savingDecisions}
                                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[10px] rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                                            title={t('supplier.hub.acceptSafeWarningsTitle')}
                                        >
                                            {t('supplier.hub.acceptSafeWarnings')}
                                        </button>
                                        <button
                                            onClick={() => handleBulkAction('REJECT_PENDING_ISSUES')}
                                            disabled={bulkActionLoading || savingDecisions}
                                            className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white font-semibold text-[10px] rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                                            title={t('supplier.hub.rejectAllIssuesTitle')}
                                        >
                                            {t('supplier.hub.rejectAllIssues')}
                                        </button>
                                        {Object.keys(decisions).length > 0 && (
                                            <button
                                                onClick={handleApplyDecisions}
                                                disabled={savingDecisions || bulkActionLoading}
                                                className="px-3 py-1 bg-slate-800 text-white font-semibold text-[10px] rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
                                            >
                                                {t('supplier.hub.saveDecisions')} ({Object.keys(decisions).length})
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                                <th className="p-2.5">Row</th>
                                                <th className="p-2.5">Product Name</th>
                                                <th className="p-2.5">GSM</th>
                                                <th className="p-2.5">Dimensions (mm)</th>
                                                <th className="p-2.5">Finish</th>
                                                <th className="p-2.5">Issues</th>
                                                <th className="p-2.5">Status</th>
                                                <th className="p-2.5">Decision</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                                            {loadingRows ? (
                                                <tr>
                                                    <td colSpan={8} className="p-6 text-center text-zinc-400">Loading batch rows...</td>
                                                </tr>
                                            ) : batchRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="p-6 text-center text-zinc-400">No rows matching filter criteria.</td>
                                                </tr>
                                            ) : (
                                                batchRows.map((r: any) => {
                                                    const rowDecision = decisions[r.id]?.decision || r.decision || 'PENDING';
                                                    const issuesList = r.issues || [];
                                                    const technicalIssues = issuesList.filter((iss: any) => iss.category === 'TECHNICAL' || !iss.category);
                                                    const commercialIssues = issuesList.filter((iss: any) => iss.category === 'COMMERCIAL');
                                                    const currentOverrides = decisions[r.id]?.overrides || {};
                                                    const currentGsm = currentOverrides.gsm !== undefined ? currentOverrides.gsm : (r.normalized?.gsm || '');
                                                    const currentWidth = currentOverrides.width_mm !== undefined ? currentOverrides.width_mm : (r.normalized?.width_mm || '');
                                                    const currentHeight = currentOverrides.height_mm !== undefined ? currentOverrides.height_mm : (r.normalized?.height_mm || '');

                                                    return (
                                                        <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-zinc-900/50">
                                                            <td className="p-2.5 font-mono text-zinc-400">{r.rowNumber}</td>
                                                            <td className="p-2.5 font-bold text-slate-800 dark:text-zinc-200">{r.normalized?.name || '—'}</td>
                                                            <td className="p-2.5 font-mono">
                                                                <input
                                                                    type="number"
                                                                    value={currentGsm}
                                                                    onChange={(e) => handleOverrideChange(r.id, 'gsm', Number(e.target.value))}
                                                                    className="w-16 px-1.5 py-0.5 border border-slate-200 dark:border-zinc-800 bg-transparent text-[11px] font-mono"
                                                                />
                                                            </td>
                                                            <td className="p-2.5 font-mono">
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        type="number"
                                                                        value={currentWidth}
                                                                        onChange={(e) => handleOverrideChange(r.id, 'width_mm', Number(e.target.value))}
                                                                        className="w-14 px-1 py-0.5 border border-slate-200 dark:border-zinc-800 bg-transparent text-[11px] font-mono"
                                                                    />
                                                                    <span>x</span>
                                                                    <input
                                                                        type="number"
                                                                        value={currentHeight}
                                                                        onChange={(e) => handleOverrideChange(r.id, 'height_mm', Number(e.target.value))}
                                                                        className="w-14 px-1 py-0.5 border border-slate-200 dark:border-zinc-800 bg-transparent text-[11px] font-mono"
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td className="p-2.5">
                                                                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-zinc-800 text-[10px] font-bold">
                                                                    {r.normalized?.finish || 'UNKNOWN'}
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 max-w-xs">
                                                                {technicalIssues.length > 0 ? (
                                                                    <div className="space-y-1">
                                                                        {technicalIssues.map((iss: any, idx: number) => (
                                                                            <p key={idx} className="text-[10px] text-amber-600 dark:text-amber-400 truncate" title={iss.message}>
                                                                                • {iss.code}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                ) : r.validationStatus === 'VALID' ? (
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">✓ Technical Valid</span>
                                                                        {commercialIssues.some((c: any) => c.code === 'EMPTY_PRICE') && (
                                                                            <span className="text-zinc-400 text-[9px]">{t('supplier.hub.unpricedTechnical')}</span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-zinc-400 text-[10px]">None</span>
                                                                )}
                                                            </td>
                                                            <td className="p-2.5">
                                                                <StatusBadge status={r.validationStatus} />
                                                            </td>
                                                            <td className="p-2.5">
                                                                <select
                                                                    value={rowDecision}
                                                                    onChange={(e) => handleDecisionChange(r.id, e.target.value)}
                                                                    className="px-2 py-1 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-lg text-[10px] font-bold uppercase cursor-pointer"
                                                                >
                                                                    <option value="PENDING">PENDING</option>
                                                                    <option value="ACCEPTED">ACCEPTED</option>
                                                                    <option value="REJECTED">REJECTED</option>
                                                                </select>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>{t('supplier.hub.pageOf', { page, total: totalPages })}</span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            disabled={page <= 1}
                                            onClick={() => loadBatchRows(previewData.batchId, page - 1, filterStatus)}
                                            className="px-2.5 py-1 border border-zinc-200 dark:border-zinc-800 rounded-lg disabled:opacity-40 cursor-pointer"
                                        >
                                            {t('supplier.hub.prev')}
                                        </button>
                                        <button
                                            disabled={page >= totalPages}
                                            onClick={() => loadBatchRows(previewData.batchId, page + 1, filterStatus)}
                                            className="px-2.5 py-1 border border-zinc-200 dark:border-zinc-800 rounded-lg disabled:opacity-40 cursor-pointer"
                                        >
                                            {t('supplier.hub.next')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
        </AccessibleModal>
    );
};
