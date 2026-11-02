/**
 * src/ui/components/preflight/PreflightUploadModal.tsx
 *
 * PrintPrice OS — Industrial 2 GB Streaming Preflight Ingestion & Asset Purge Modal
 *
 * Two-column CAD/Budget-homologated layout:
 * - Left Column (60%): Large rounded-2xl dashed dropzone (`MAX 2 GB`), slot selector
 *   (`INTERIOR / TRIPA` vs `COVER / CUBIERTA`), technical iconography, and storage retention
 *   policy toggle (`[X] AUTO-PURGE ORIGINAL PDF AFTER INSPECTION`).
 * - Right Column (40%): "Workflow & Specs" panel with `MAGIC FIX` vs `DIAGNOSTIC MODE`
 *   switcher, book parameters (Job ID, ISBN-13, Title, Binding, Pages, GSM, Bulk, Bleed),
 *   and real-time parametric spine calculation preview.
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from '../../i18n';
import {
    SparklesIcon,
    DocumentArrowUpIcon,
    TrashIcon,
    ShieldCheckIcon,
    WrenchScrewdriverIcon,
    MagnifyingGlassCircleIcon
} from '@heroicons/react/24/outline';

export interface PreflightUploadModalSubmitPayload {
    jobId: string;
    title: string;
    isbn: string;
    role: 'INTERIOR_PDF' | 'COVER_PDF';
    workflowMode: 'MAGIC_FIX' | 'DIAGNOSTIC';
    purgeAsset: boolean;
    pdfFile: File | null;
    pageCount: number;
    bindingType: 'SOFTCOVER_PUR' | 'HARDCOVER';
    paperGrammage: number;
    paperBulk: number;
    declaredSpineMm: number;
    innerBleedMm: number;
}

export interface PreflightUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payload: PreflightUploadModalSubmitPayload) => Promise<void> | void;
    labels: Record<string, string>;
    initialJobId?: string;
}

export interface PreflightSubstrateOption {
    id: string;
    name: string;
    gsm: number;
    bulk: number;
    materialType: string;
}

const DEFAULT_PREFLIGHT_SUBSTRATES: PreflightSubstrateOption[] = [
    { id: 'MAT-OFFSET-CORAL-90', name: 'Coral Book White 90g (Bulk 1.25)', gsm: 90, bulk: 1.25, materialType: 'SHEETFED_PAPER' },
    { id: 'MAT-MUNKEN-PRINT-WHITE-90', name: 'Munken Print White 1.5 90g (Bulk 1.50)', gsm: 90, bulk: 1.50, materialType: 'SHEETFED_PAPER' },
    { id: 'MAT-CORAL-BOOK-IVORY-80', name: 'Coral Book Ivory Ahuesado 80g (Bulk 1.65)', gsm: 80, bulk: 1.65, materialType: 'SHEETFED_PAPER' },
    { id: 'REEL-CREAM-80-BULK2', name: 'Stora Enso BookCream Reel 80g (Bulk 1.95)', gsm: 80, bulk: 1.95, materialType: 'REEL_PAPER' },
    { id: 'MAT-SAPPI-MAGNO-SATIN-135', name: 'Magno Satin Estucado Mate 135g (Bulk 0.92)', gsm: 135, bulk: 0.92, materialType: 'SHEETFED_PAPER' },
    { id: 'BOARD-FEDRIGONI-SYMBOL-300', name: 'Fedrigoni Symbol Card Cubierta 300g (Bulk 1.20)', gsm: 300, bulk: 1.20, materialType: 'BOARD_CARTON' }
];

export const PreflightUploadModal: React.FC<PreflightUploadModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    labels: L,
    initialJobId = 'PF-2026-089'
}) => {
    const { locale } = useLocale();
    const [formJobId, setFormJobId] = useState(initialJobId);
    const [formTitle, setFormTitle] = useState(
        locale === 'de'
            ? 'Handbuch für industriellen Offset- und Digitaldruck'
            : locale === 'es'
              ? 'Tratado de Impresión Offset Digital'
              : 'Treatise on Industrial Offset & Digital Printing'
    );
    const [formIsbn, setFormIsbn] = useState('978-84-9032-441-1');
    const [formRole, setFormRole] = useState<'INTERIOR_PDF' | 'COVER_PDF'>('INTERIOR_PDF');
    const [workflowMode, setWorkflowMode] = useState<'MAGIC_FIX' | 'DIAGNOSTIC'>('MAGIC_FIX');
    const [autoPurgeAsset, setAutoPurgeAsset] = useState<boolean>(true);
    const [formPdfFile, setFormPdfFile] = useState<File | null>(null);
    const [formPages, setFormPages] = useState(280);
    const [formBinding, setFormBinding] = useState<'SOFTCOVER_PUR' | 'HARDCOVER'>('SOFTCOVER_PUR');
    const [substrateOptions, setSubstrateOptions] = useState<PreflightSubstrateOption[]>(DEFAULT_PREFLIGHT_SUBSTRATES);
    const [selectedSubstrateId, setSelectedSubstrateId] = useState<string>('CUSTOM');
    const [formGrammage, setFormGrammage] = useState(90);
    const [formBulk, setFormBulk] = useState(1.3);
    const [formDeclaredSpine, setFormDeclaredSpine] = useState(14.0);
    const [formInnerBleed, setFormInnerBleed] = useState(1.5);
    const [isDragging, setIsDragging] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [sizeError, setSizeError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        fetch('/api/pricing/materials', {
            headers: { 'x-user-role': 'PRINTHOUSE_ADMIN' }
        })
            .then((r) => (r && r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || !data) return;
                const list = Array.isArray(data.industrialCatalog)
                    ? data.industrialCatalog
                    : Array.isArray(data.materials)
                      ? data.materials
                      : [];
                if (list.length > 0) {
                    const mapped: PreflightSubstrateOption[] = list.map((m: any) => ({
                        id: String(m.id || m.paperId),
                        name: `${m.materialName || m.name} · ${m.basis_weight_gsm || m.gsm || 90}g (Bulk ${Number(m.bulk_volume || m.bulkFactor || 1.25).toFixed(2)})`,
                        gsm: Number(m.basis_weight_gsm || m.gsm || 90),
                        bulk: Number(m.bulk_volume || m.bulkFactor || 1.25),
                        materialType: String(m.material_type || 'SHEETFED_PAPER')
                    }));
                    setSubstrateOptions(mapped);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

    // Real-time dynamic parametric spine calculation
    const rawBlockMm = (Number(formPages || 0) / 2) * (Number(formGrammage || 0) / 1000) * Number(formBulk || 0);
    const calculatedSpineMm =
        formBinding === 'HARDCOVER'
            ? Math.round((rawBlockMm + 4.0 + 3.0) * 100) / 100
            : Math.round((rawBlockMm + 0.5) * 100) / 100;
    const spineDeltaMm = Math.round(Math.abs(calculatedSpineMm - Number(formDeclaredSpine || 0)) * 100) / 100;
    const isSpineMismatch = spineDeltaMm > 1.0;

    const formatFileSize = (bytes: number): string => {
        if (bytes >= 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
        if (bytes >= 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }
        return `${(bytes / 1024).toFixed(1)} KB`;
    };

    const handleFileSelect = (file: File | null) => {
        setSizeError(null);
        if (file && file.size > MAX_BYTES) {
            setSizeError('PAYLOAD_TOO_LARGE: Maximum file size is 2 GB (2048 MB).');
            return;
        }
        setFormPdfFile(file);
        if (file && (!formTitle || formTitle === 'Tratado de Impresión Offset Digital')) {
            setFormTitle(file.name.replace(/\.pdf$/i, ''));
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (sizeError) return;
        setSubmitting(true);
        try {
            await onSubmit({
                jobId: formJobId,
                title: formTitle,
                isbn: formIsbn,
                role: formRole,
                workflowMode,
                purgeAsset: autoPurgeAsset,
                pdfFile: formPdfFile,
                pageCount: Number(formPages),
                bindingType: formBinding,
                paperGrammage: Number(formGrammage),
                paperBulk: Number(formBulk),
                declaredSpineMm: Number(formDeclaredSpine),
                innerBleedMm: Number(formInnerBleed)
            });
        } finally {
            setSubmitting(false);
        }
    };

    const modalContent = (
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
        >
            <form
                onSubmit={handleFormSubmit}
                data-testid="run-preflight-modal"
                className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-[#121418] border border-zinc-800 shadow-2xl overflow-hidden text-white my-auto"
            >
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 bg-[#0B0C0E] px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#dc0000]/15 border border-[#dc0000]/40 text-[#dc0000]">
                            <WrenchScrewdriverIcon className="w-4 h-4" />
                        </span>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-white">
                                {L.modalTitle || 'Run Automated Preflight & Spine Inspection'}
                            </h3>
                            <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                                INDUSTRIAL MULTIPART STREAMING INGESTION · MAX 2 GB PER ARCHIVE · ZERO RAM BUFFERING
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close modal"
                        className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
                    >
                        ✕
                    </button>
                </div>

                {/* Two-Column Body: 60% Left (Dropzone & Purge Policy) | 40% Right (Workflow & Specs) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
                    {/* LEFT COLUMN (60% -> 7 cols on 12-col grid) */}
                    <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
                        {/* Slot Selector: INTERIOR / TRIPA vs COVER / CUBIERTA */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">
                                    01 // SELECT PDF ASSET SLOT
                                </span>
                                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                                    STREAMING MULTIPART CHUNKED
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {(['INTERIOR_PDF', 'COVER_PDF'] as const).map((slot) => {
                                    const active = formRole === slot;
                                    return (
                                        <button
                                            key={slot}
                                            type="button"
                                            data-testid={`slot-selector-${slot}`}
                                            onClick={() => setFormRole(slot)}
                                            className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                                                active
                                                    ? 'bg-[#dc0000]/10 border-[#dc0000] text-white shadow-sm'
                                                    : 'bg-[#0B0C0E] border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-xs font-black uppercase tracking-wider">
                                                    {slot === 'INTERIOR_PDF'
                                                        ? locale === 'de'
                                                            ? 'INNENTEIL / BUCHBLOCK'
                                                            : locale === 'es'
                                                              ? 'INTERIOR / TRIPA'
                                                              : 'INTERIOR / BOOK BLOCK'
                                                        : locale === 'de'
                                                          ? 'UMSCHLAG / COVER'
                                                          : locale === 'es'
                                                            ? 'COVER / CUBIERTA'
                                                            : 'COVER / SPREAD'}
                                                </span>
                                                <span
                                                    className={`w-2 h-2 rounded-full ${
                                                        active ? 'bg-[#dc0000]' : 'bg-zinc-700'
                                                    }`}
                                                />
                                            </div>
                                            <span className="text-[10px] font-mono text-zinc-400 mt-1">
                                                {slot === 'INTERIOR_PDF'
                                                    ? 'Book Block · 3.0 mm Inner Bleed · 300+ DPI'
                                                    : 'Cover Spread & Spine · Hinge & Wrap Check'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Heavy 2 GB Dropzone */}
                        <label
                            data-testid="preflight-pdf-dropzone"
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                const dropped = e.dataTransfer?.files?.[0] || null;
                                if (dropped) handleFileSelect(dropped);
                            }}
                            className={`flex-1 min-h-[210px] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-all ${
                                isDragging || formPdfFile
                                    ? 'border-[#dc0000] bg-[#dc0000]/5'
                                    : 'border-zinc-700/80 hover:border-[#dc0000] bg-[#0B0C0E]'
                            }`}
                        >
                            <input
                                type="file"
                                accept=".pdf,application/pdf"
                                data-testid="preflight-pdf-file-input"
                                onChange={(e) => {
                                    const f = e.target.files?.[0] || null;
                                    handleFileSelect(f);
                                }}
                                className="hidden"
                            />
                            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-[#dc0000]">
                                <DocumentArrowUpIcon className="w-6 h-6" />
                            </div>
                            <div className="text-xs font-mono font-black uppercase tracking-wider text-white">
                                DRAG &amp; DROP YOUR PDF HERE OR BROWSE · MAX 2 GB
                            </div>
                            <div className="text-[11px] font-mono text-zinc-400 mt-1.5">
                                {formPdfFile ? (
                                    <span className="text-emerald-400 font-bold">
                                        READY TO STREAM: {formPdfFile.name} ({formatFileSize(formPdfFile.size)})
                                    </span>
                                ) : (
                                    'High-resolution illustrated books, 300+ DPI photography & CMYK plates (PDF/X-4)'
                                )}
                            </div>
                            {sizeError && (
                                <div className="mt-2 text-[11px] font-mono font-bold text-rose-400">
                                    {sizeError}
                                </div>
                            )}
                        </label>

                        {/* Mandatory Storage Retention & Auto-Purge Toggle */}
                        <div
                            data-testid="auto-purge-policy-box"
                            className="rounded-xl bg-[#0B0C0E] border border-zinc-800 p-4 flex items-start gap-3"
                        >
                            <input
                                id="auto-purge-checkbox"
                                data-testid="auto-purge-checkbox"
                                type="checkbox"
                                checked={autoPurgeAsset}
                                onChange={(e) => setAutoPurgeAsset(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-zinc-700 accent-[#dc0000] cursor-pointer"
                            />
                            <label htmlFor="auto-purge-checkbox" className="flex-1 cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono font-black uppercase tracking-wider text-white">
                                        AUTO-PURGE ORIGINAL PDF AFTER INSPECTION
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-mono font-bold text-emerald-400 uppercase">
                                        DISK SAFEGUARD ACTIVE
                                    </span>
                                </div>
                                <p className="text-[11px] font-mono text-zinc-400 mt-1">
                                    (Retain only forensic report &amp; metadata to save disk storage) — Automatically unlinks the temporary multi-gigabyte PDF from `/tmp/ppos-preflight-temp` immediately after 6-axis telemetry extraction.
                                </p>
                            </label>
                        </div>
                    </div>

                    {/* RIGHT COLUMN (40% -> 5 cols on 12-col grid): Workflow & Specs */}
                    <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-[#0B0C0E] border border-zinc-800 p-5 space-y-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-zinc-400">
                                    02 // WORKFLOW &amp; SPECS
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400">ISO 12647-2</span>
                            </div>

                            {/* Visual Switcher: MAGIC FIX vs DIAGNOSTIC MODE */}
                            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#121418] border border-zinc-800">
                                <button
                                    type="button"
                                    data-testid="workflow-mode-magic-fix"
                                    onClick={() => setWorkflowMode('MAGIC_FIX')}
                                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        workflowMode === 'MAGIC_FIX'
                                            ? 'bg-[#dc0000] text-white shadow'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <SparklesIcon className="w-3.5 h-3.5" />
                                    MAGIC FIX
                                </button>
                                <button
                                    type="button"
                                    data-testid="workflow-mode-diagnostic"
                                    onClick={() => setWorkflowMode('DIAGNOSTIC')}
                                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        workflowMode === 'DIAGNOSTIC'
                                            ? 'bg-zinc-800 text-white border border-zinc-700'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <MagnifyingGlassCircleIcon className="w-3.5 h-3.5" />
                                    DIAGNOSTIC MODE
                                </button>
                            </div>

                            {/* Book Spec Fields */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblJobId || 'Job ID'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formJobId}
                                        onChange={(e) => setFormJobId(e.target.value)}
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblIsbn || 'ISBN-13'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formIsbn}
                                        onChange={(e) => setFormIsbn(e.target.value)}
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblTitle || 'Title / Work'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formTitle}
                                        onChange={(e) => setFormTitle(e.target.value)}
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblBinding || 'Binding Type'}
                                    </label>
                                    <select
                                        value={formBinding}
                                        onChange={(e) =>
                                            setFormBinding(e.target.value as 'SOFTCOVER_PUR' | 'HARDCOVER')
                                        }
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    >
                                        <option value="SOFTCOVER_PUR">SOFTCOVER_PUR</option>
                                        <option value="HARDCOVER">HARDCOVER</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblPages || 'Page Count'}
                                    </label>
                                    <input
                                        type="number"
                                        value={formPages}
                                        onChange={(e) => setFormPages(Number(e.target.value))}
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                                        {L.lblCatalogSubstrate ||
                                            (locale === 'de'
                                                ? 'Substrat / Papier aus Katalog (MySQL-synchronisiert)'
                                                : locale === 'es'
                                                  ? 'Sustrato / Papel del Catálogo (Sincronizado MySQL)'
                                                  : 'Catalog Substrate / Paper (MySQL Synced)')}
                                    </label>
                                    <select
                                        data-testid="preflight-substrate-catalog-select"
                                        value={selectedSubstrateId}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedSubstrateId(val);
                                            const found = substrateOptions.find((s) => s.id === val);
                                            if (found) {
                                                setFormGrammage(found.gsm);
                                                setFormBulk(found.bulk);
                                            }
                                        }}
                                        className="w-full rounded-lg bg-[#121418] border border-emerald-500/40 px-3 py-1.5 text-xs font-mono text-white"
                                    >
                                        <option value="CUSTOM">
                                            {locale === 'de'
                                                ? '— Manuelle Parameter (Benutzerdefiniertes GSM / Volumen) —'
                                                : locale === 'es'
                                                  ? '— Parámetros Manuales (GSM / Bulk personalizados) —'
                                                  : '— Custom Manual Parameters (Custom GSM / Bulk) —'}
                                        </option>
                                        {substrateOptions.map((sub) => (
                                            <option key={sub.id} value={sub.id}>
                                                {sub.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblGrammage || 'Grammage (g/m²)'}
                                    </label>
                                    <input
                                        type="number"
                                        value={formGrammage}
                                        onChange={(e) => setFormGrammage(Number(e.target.value))}
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblBulk || 'Bulk (cm³/g)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.05"
                                        value={formBulk}
                                        onChange={(e) => setFormBulk(Number(e.target.value))}
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblDeclaredSpine || 'Declared Spine (mm)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formDeclaredSpine}
                                        onChange={(e) => setFormDeclaredSpine(Number(e.target.value))}
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                                        {L.lblInnerBleed || 'Inner Bleed (mm)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={formInnerBleed}
                                        onChange={(e) => setFormInnerBleed(Number(e.target.value))}
                                        className="w-full rounded-lg bg-[#121418] border border-zinc-800 px-3 py-1.5 text-xs font-mono text-white"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Live Parametric Spine Preview Card */}
                        <div
                            data-testid="live-spine-calculator-card"
                            className="rounded-xl bg-[#121418] border border-zinc-800 p-3.5 flex items-center justify-between"
                        >
                            <div>
                                <div className="text-[10px] font-mono uppercase text-zinc-400">
                                    CALCULATED PARAMETRIC SPINE
                                </div>
                                <div className="text-base font-mono font-black text-white mt-0.5">
                                    {calculatedSpineMm.toFixed(2)} mm
                                </div>
                            </div>
                            <div className="text-right font-mono">
                                <div className="text-[10px] uppercase text-zinc-400">
                                    PDF DELTA (Δ)
                                </div>
                                <div
                                    className={`text-xs font-bold mt-0.5 ${
                                        isSpineMismatch ? 'text-rose-400' : 'text-emerald-400'
                                    }`}
                                >
                                    {spineDeltaMm.toFixed(2)} mm {isSpineMismatch ? '(MISMATCH)' : '(OK)'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="shrink-0 flex items-center justify-between border-t border-zinc-800 bg-[#0B0C0E] px-6 py-4">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                        <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                        <span>
                            {autoPurgeAsset
                                ? 'Mode: Ephemeral Disk Stream (Auto-Purge PDF after telemetry)'
                                : 'Mode: Retain PDF on Printhouse Storage'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer"
                        >
                            {L.lblCancel || 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || Boolean(sizeError)}
                            data-testid="submit-preflight-inspect-btn"
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#dc0000] hover:bg-[#e11d48] text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                        >
                            <SparklesIcon className="w-4 h-4" />
                            {submitting ? 'STREAMING...' : L.lblSubmitInspect || 'Execute Inspection'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );

    if (typeof document !== 'undefined' && document.body) {
        return createPortal(modalContent, document.body);
    }
    return modalContent;
};

export default PreflightUploadModal;

