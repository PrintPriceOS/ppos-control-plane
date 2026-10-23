import React, { useState, useEffect, useRef } from 'react';
import {
    PrinterIcon,
    ArrowDownTrayIcon,
    DocumentTextIcon,
    TruckIcon,
    ExclamationTriangleIcon,
    ArrowPathIcon,
    BuildingOfficeIcon,
    ScaleIcon,
    CubeIcon,
    CurrencyEuroIcon
} from '@heroicons/react/24/outline';
import { AccessibleModal } from '../AccessibleModal';
import { useLocale } from '../../i18n';

export interface ProcurementDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: string | null;
    initialDocType?: 'po' | 'packing_slip';
    fetchDocFn: (orderId: string, type: 'po' | 'packing_slip') => Promise<{ ok: boolean; data?: any; error?: string | { code?: string; message?: string; validationErrors?: string[] } }>;
}

export const ProcurementDocumentModal: React.FC<ProcurementDocumentModalProps> = ({
    isOpen,
    onClose,
    orderId,
    initialDocType = 'po',
    fetchDocFn
}) => {
    const { t } = useLocale();
    const [docType, setDocType] = useState<'po' | 'packing_slip'>(initialDocType);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [docData, setDocData] = useState<any | null>(null);
    const [viewMode, setViewMode] = useState<'preview' | 'summary'>('preview');

    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Sync initial doc type when modal opens or initialDocType changes
    useEffect(() => {
        if (isOpen) {
            setDocType(initialDocType);
        }
    }, [isOpen, initialDocType]);

    // Fetch document when orderId or docType changes
    useEffect(() => {
        if (!isOpen || !orderId) {
            setDocData(null);
            setError(null);
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError(null);

        fetchDocFn(orderId, docType)
            .then((res) => {
                if (!isMounted) return;
                if (res.ok && res.data) {
                    setDocData(res.data);
                } else {
                    const errMsg = typeof res.error === 'string' ? res.error : (res.error?.message || t('procurement.document.error'));
                    setError(errMsg);
                }
            })
            .catch((err) => {
                if (!isMounted) return;
                setError(err.message || t('procurement.document.error'));
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isOpen, orderId, docType, fetchDocFn]);

    const handlePrint = () => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.focus();
            iframeRef.current.contentWindow.print();
        } else if (docData?.printableHtml) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(docData.printableHtml);
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
            }
        }
    };

    const handleDownloadHtml = () => {
        if (!docData?.printableHtml) return;
        const blob = new Blob([docData.printableHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${docData.documentCode || 'procurement-document'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const modalTitle = docType === 'po'
        ? t('procurement.document.titlePo')
        : t('procurement.document.titleSlip');

    const modalBadge = docType === 'po' ? 'PURCHASE ORDER' : 'PACKING SLIP';

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title={modalTitle}
            subtitle={t('procurement.document.subtitle')}
            badge={modalBadge}
            maxWidth="max-w-5xl"
            footer={
                <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setViewMode(viewMode === 'preview' ? 'summary' : 'preview')}
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                            {viewMode === 'preview' ? 'Ver Ficha de Datos' : 'Ver Formato Imprimible'}
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleDownloadHtml}
                            disabled={!docData || loading}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer disabled:opacity-50"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            <span>{t('procurement.document.btnDownloadHtml')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handlePrint}
                            disabled={!docData || loading}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-2xs cursor-pointer disabled:opacity-50"
                        >
                            <PrinterIcon className="w-4 h-4" />
                            <span>{t('procurement.document.btnPrint')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                            {t('procurement.document.btnClose')}
                        </button>
                    </div>
                </div>
            }
        >
            <div className="space-y-4">
                {/* Document Type Switcher Tabs */}
                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setDocType('po')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                docType === 'po'
                                    ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <DocumentTextIcon className="w-4 h-4" />
                            <span>{t('procurement.document.tabPo')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setDocType('packing_slip')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                docType === 'packing_slip'
                                    ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <TruckIcon className="w-4 h-4" />
                            <span>{t('procurement.document.tabSlip')}</span>
                        </button>
                    </div>

                    {docData && (
                        <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold">
                                {docData.documentCode}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                                {docData.status}
                            </span>
                        </div>
                    )}
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                        <ArrowPathIcon className="w-8 h-8 animate-spin text-red-600 mb-3" />
                        <p className="text-sm font-semibold">{t('procurement.document.loading')}</p>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 flex items-start gap-3">
                        <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-xs">
                            <strong className="block font-bold mb-0.5">{t('procurement.document.error')}</strong>
                            <p>{error}</p>
                        </div>
                    </div>
                )}

                {/* Loaded Document View */}
                {docData && !loading && (
                    <>
                        {viewMode === 'preview' ? (
                            /* Printable IFrame View */
                            <div className="relative w-full rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white shadow-inner">
                                <div className="bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>Vista previa de impresión A4 (800 × 1130 px simulado)</span>
                                    <span>{docData.documentTitle}</span>
                                </div>
                                <iframe
                                    ref={iframeRef}
                                    srcDoc={docData.printableHtml}
                                    title={docData.documentTitle}
                                    className="w-full h-[580px] border-0 bg-white"
                                />
                            </div>
                        ) : (
                            /* Structured Summary View */
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Buyer Card */}
                                    <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                                            <BuildingOfficeIcon className="w-4 h-4 text-red-600" />
                                            <span>{t('procurement.document.buyerInfo')}</span>
                                        </div>
                                        <div className="text-sm font-black text-slate-900 dark:text-white">
                                            {docData.buyer?.name}
                                        </div>
                                        <div className="text-xs text-zinc-500 space-y-1">
                                            <div><strong>Centro:</strong> {docData.buyer?.deliverySiteName}</div>
                                            <div><strong>Dirección:</strong> {docData.buyer?.deliveryAddress}</div>
                                            {docData.buyer?.buyerNotes && (
                                                <div className="text-amber-600 dark:text-amber-400">
                                                    <strong>Notas:</strong> {docData.buyer.buyerNotes}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Supplier Card */}
                                    <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                                            <CubeIcon className="w-4 h-4 text-indigo-600" />
                                            <span>{t('procurement.document.supplierInfo')}</span>
                                        </div>
                                        <div className="text-sm font-black text-slate-900 dark:text-white">
                                            {docData.supplier?.companyName}
                                        </div>
                                        <div className="text-xs text-zinc-500 space-y-1">
                                            <div><strong>SKU Proveedor:</strong> {docData.supplier?.supplierSku}</div>
                                            <div><strong>Pedido:</strong> {docData.orderNumber} ({docData.orderType})</div>
                                            <div><strong>Emisión:</strong> {docData.issueDate}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Material & Quantities Table */}
                                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 text-left">
                                            <tr>
                                                <th className="py-2.5 px-4 font-bold">{t('procurement.document.materialSpec')}</th>
                                                <th className="py-2.5 px-4 font-bold">Gramaje / Formato</th>
                                                <th className="py-2.5 px-4 font-bold">{t('procurement.document.orderedQuantity')}</th>
                                                <th className="py-2.5 px-4 font-bold">{t('procurement.document.totalSheets')}</th>
                                                {docType === 'packing_slip' ? (
                                                    <>
                                                        <th className="py-2.5 px-4 font-bold text-emerald-600">{t('procurement.document.receivedSheets')}</th>
                                                        <th className="py-2.5 px-4 font-bold">{t('procurement.document.remainingSheets')}</th>
                                                    </>
                                                ) : (
                                                    <th className="py-2.5 px-4 font-bold text-right">{t('procurement.document.financialTotal')}</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                                            <tr>
                                                <td className="py-3 px-4 font-sans">
                                                    <strong className="block text-slate-900 dark:text-white font-bold">
                                                        {docData.material?.productName}
                                                    </strong>
                                                    <span className="text-[11px] text-zinc-400">
                                                        {docData.material?.brand} · {docData.material?.category} · Fibra: {docData.material?.grainDirection}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {docData.material?.gsm} g/m² · {docData.material?.dimensions}
                                                </td>
                                                <td className="py-3 px-4 font-bold">
                                                    {docData.quantities?.orderedQuantity} {docData.quantities?.orderedQuantityBasis}
                                                </td>
                                                <td className="py-3 px-4 font-bold">
                                                    {Number(docData.quantities?.totalSheets || 0).toLocaleString()} sh
                                                </td>
                                                {docType === 'packing_slip' ? (
                                                    <>
                                                        <td className="py-3 px-4 font-bold text-emerald-600">
                                                            {Number(docData.quantities?.receivedSheets || 0).toLocaleString()} sh
                                                        </td>
                                                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-zinc-200">
                                                            {Number(docData.quantities?.remainingBalanceSheets || 0).toLocaleString()} sh
                                                        </td>
                                                    </>
                                                ) : (
                                                    <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                                                        {Number(docData.financials?.grandTotal || 0).toFixed(2)} {docData.financials?.currency}
                                                    </td>
                                                )}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </AccessibleModal>
    );
};
