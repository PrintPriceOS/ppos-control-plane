import React, { useState, useEffect } from 'react';
import { 
    CloudArrowDownIcon, 
    ShieldCheckIcon, 
    DocumentCheckIcon, 
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    FolderIcon
} from '@heroicons/react/24/outline';
import * as adminApi from '../lib/adminApi';
import { StatusBadge } from './StatusBadge';

interface MarketplaceIntakeSectionProps {
    order: adminApi.Order;
    onRefreshOrder?: () => void;
}

export const MarketplaceIntakeSection: React.FC<MarketplaceIntakeSectionProps> = ({ order, onRefreshOrder }) => {
    const [files, setFiles] = useState<any[]>([]);
    const [repository, setRepository] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const orderRef = order.order_ref;

    const fetchFiles = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getProductionFiles(orderRef);
            if (res.ok) {
                setFiles(res.files || []);
                setRepository(res.repository || null);
            }
        } catch (err) {
            console.error('Failed to fetch production files:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, [orderRef]);

    const handleFetch = async () => {
        setActionLoading('fetch');
        try {
            await adminApi.triggerProductionFileFetch(orderRef);
            await fetchFiles();
        } catch (err) {
            alert('Fetch failed: ' + (err as any).message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleValidate = async () => {
        setActionLoading('validate');
        try {
            const res = await adminApi.triggerProductionFileValidation(orderRef);
            if (res.ok) {
                await fetchFiles();
                if (onRefreshOrder) onRefreshOrder();
            } else {
                alert('Validation failed: ' + (res as any).message || 'One or more files rejected');
                await fetchFiles();
            }
        } catch (err) {
            alert('Validation failed: ' + (err as any).message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleInvoice = async () => {
        setActionLoading('invoice');
        try {
            const res = await adminApi.generateOrderInvoice(orderRef);
            if (res.ok) {
                if (onRefreshOrder) onRefreshOrder();
            } else {
                alert('Invoice failed: ' + (res as any).error || 'Generation blocked');
            }
        } catch (err) {
            alert('Invoice failed: ' + (err as any).message);
        } finally {
            setActionLoading(null);
        }
    };

    const copyRepoPath = () => {
        if (repository?.storage_root) {
            navigator.clipboard.writeText(repository.storage_root);
            alert('Repository path copied to clipboard');
        }
    };

    const invoicePayment = typeof order.invoice_payment === 'string' 
        ? JSON.parse(order.invoice_payment || '{}') 
        : (order.invoice_payment || {});

    const productionFilesMeta = typeof order.production_files === 'string'
        ? JSON.parse(order.production_files || '{}')
        : (order.production_files || {});

    const isHardened = productionFilesMeta.required === true;

    if (!isHardened) {
        return (
            <div className="bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 p-4 rounded-none">
                <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Marketplace Intake</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">This is a legacy order without hardened production intake contracts.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheckIcon className="w-4 h-4 text-[#dc0000]" />
                    Industrial Intake Gating
                </h3>
                <button 
                    onClick={fetchFiles}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                    <ArrowPathIcon className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Financial Gate */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 p-3">
                    <p className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight mb-2">Invoice Status</p>
                    <div className="flex items-center justify-between">
                        <StatusBadge status={invoicePayment.invoice_status || 'PENDING'} />
                        {invoicePayment.invoice_status === 'READY_TO_GENERATE' && (
                            <button 
                                onClick={handleInvoice}
                                disabled={!!actionLoading}
                                className="text-[9px] font-black text-[#dc0000] hover:underline uppercase tracking-widest disabled:opacity-30"
                            >
                                {actionLoading === 'invoice' ? 'Generating...' : 'Generate Now'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 p-3">
                    <p className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight mb-2">Payment Status</p>
                    <StatusBadge status={invoicePayment.payment_status || 'PENDING'} />
                </div>
            </div>

            {/* Assets Table */}
            <div className="border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <table className="w-full text-[11px] text-left">
                    <thead className="bg-zinc-50 dark:bg-zinc-950 text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <th className="px-3 py-2">Asset Kind</th>
                            <th className="px-3 py-2">Source</th>
                            <th className="px-3 py-2">Ingestion</th>
                            <th className="px-3 py-2">Validation</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {['INTERIOR_PDF', 'COVER_SPINE_BACK_PDF'].map(kind => {
                            const file = files.find(f => f.kind === kind);
                            return (
                                <tr key={kind} className="bg-white dark:bg-zinc-950">
                                    <td className="px-3 py-2 font-bold text-zinc-700 dark:text-zinc-300">
                                        {kind === 'INTERIOR_PDF' ? 'Interior' : 'Cover'}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className="text-[9px] font-mono bg-zinc-100 dark:bg-zinc-900 px-1 py-0.5 text-zinc-500">
                                            {file?.source_type || 'DECLARED'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                            {file?.ingestion_status === 'FETCHED' || file?.ingestion_status === 'UPLOADED' ? (
                                                <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                                            ) : file?.ingestion_status === 'FAILED' ? (
                                                <ExclamationCircleIcon className="w-3.5 h-3.5 text-red-500" />
                                            ) : (
                                                <ArrowPathIcon className="w-3.5 h-3.5 text-zinc-300" />
                                            )}
                                            <span className="font-bold text-zinc-600 dark:text-zinc-400">
                                                {file?.ingestion_status || 'PENDING'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <StatusBadge status={file?.validation_status || 'IDLE'} className="text-[9px]" />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Operator Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
                {files.some(f => f.source_type === 'DOWNLOAD_URL' && f.ingestion_status !== 'FETCHED') && (
                    <button 
                        onClick={handleFetch}
                        disabled={!!actionLoading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#dc0000] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#b00000] transition-colors disabled:opacity-30 shadow-none"
                    >
                        <CloudArrowDownIcon className="w-3.5 h-3.5" />
                        {actionLoading === 'fetch' ? 'Fetching...' : 'Trigger Fetch'}
                    </button>
                )}
                
                {files.length >= 2 && files.every(f => ['FETCHED', 'UPLOADED'].includes(f.ingestion_status)) && order.status === 'FILES_PENDING' && (
                    <button 
                        onClick={handleValidate}
                        disabled={!!actionLoading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-30 shadow-none"
                    >
                        <DocumentCheckIcon className="w-3.5 h-3.5" />
                        {actionLoading === 'validate' ? 'Validating...' : 'Validate Assets'}
                    </button>
                )}

                <button 
                    onClick={copyRepoPath}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shadow-none"
                >
                    <FolderIcon className="w-3.5 h-3.5" />
                    Repo Path
                </button>
            </div>

            {/* Ingestion Errors */}
            {files.some(f => f.error_message) && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 p-3 space-y-1">
                    <p className="text-[9px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest">Intake Errors Detected</p>
                    {files.filter(f => f.error_message).map((f, i) => (
                        <p key={i} className="text-[10px] font-medium text-red-800 dark:text-red-300 leading-tight">
                            {f.kind}: {f.error_message}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
};
