/**
 * src/ui/components/printhouse/onboarding/GuidedStepProducts.tsx
 *
 * Stage B: "Qué produces"
 *
 * Responsibilities:
 * - Large iconography cards with clean human labels for the 4 canonical families:
 *   Tapa dura, Rústica, Wire-O, Grapado.
 * - Allows selecting only what the printhouse actually manufactures.
 * - Relevant questions per selection without hallucinating technical machinery or materials.
 * - Zero real customer names/jobs as canned templates.
 */

import React, { useRef, useState } from 'react';
import { Layers, ArrowRight, ArrowLeft, Info, Check, ShieldCheck, Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { useLocale } from '../../../i18n';
import { ProductFamilyId, FamilyState } from '../../../types/printhouseOnboardingTypes';
import { BindingIcon } from './BindingFamilyIcons';

interface GuidedStepProductsProps {
    families: Record<ProductFamilyId, FamilyState>;
    enabledFamilies: Record<ProductFamilyId, boolean>;
    selectedFamilyId: ProductFamilyId;
    pricingContinuity?: Partial<Record<ProductFamilyId, { uploadedFileName?: string | null; offer?: any; sessionId?: string | null }>>;
    uploadingByFamily?: Partial<Record<ProductFamilyId, boolean>>;
    uploadErrorsByFamily?: Partial<Record<ProductFamilyId, string | null>>;
    onUploadFamilyQuote?: (familyId: ProductFamilyId, file: File) => void;
    onToggleFamily: (familyId: ProductFamilyId) => void;
    onSelectActiveFamily: (familyId: ProductFamilyId) => void;
    onContinueToPricing: () => void;
    onBackToCompany: () => void;
    onOpenFullSetup?: () => void;
}

const FAMILY_DEFINITIONS: Array<{
    id: ProductFamilyId;
    titleKey: string;
    descKey: string;
    hintKey: string;
}> = [
    {
        id: 'HARDCOVER',
        titleKey: 'family.hardcover.title',
        descKey: 'family.hardcover.desc',
        hintKey: 'family.hardcover.hint'
    },
    {
        id: 'SOFTCOVER',
        titleKey: 'family.softcover.title',
        descKey: 'family.softcover.desc',
        hintKey: 'family.softcover.hint'
    },
    {
        id: 'WIRE_O',
        titleKey: 'family.wireO.title',
        descKey: 'family.wireO.desc',
        hintKey: 'family.wireO.hint'
    },
    {
        id: 'SADDLE_STITCH',
        titleKey: 'family.saddleStitch.title',
        descKey: 'family.saddleStitch.desc',
        hintKey: 'family.saddleStitch.hint'
    }
];

export const GuidedStepProducts: React.FC<GuidedStepProductsProps> = ({
    families,
    enabledFamilies,
    selectedFamilyId,
    pricingContinuity,
    uploadingByFamily,
    uploadErrorsByFamily,
    onUploadFamilyQuote,
    onToggleFamily,
    onSelectActiveFamily,
    onContinueToPricing,
    onBackToCompany,
    onOpenFullSetup
}) => {
    const { t } = useLocale();
    const activeCount = Object.values(enabledFamilies).filter(Boolean).length;
    const fileInputRefs = useRef<Partial<Record<ProductFamilyId, HTMLInputElement | null>>>({});
    const [dragOverFamily, setDragOverFamily] = useState<ProductFamilyId | null>(null);

    const handleFilePicked = (familyId: ProductFamilyId, file?: File | null) => {
        if (!file || !onUploadFamilyQuote) return;
        onSelectActiveFamily(familyId);
        onUploadFamilyQuote(familyId, file);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#dc0000]">
                    {t('guided.stageB.badge') || 'Etapa 2 de 4 · Qué produces'}
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {t('guided.stageB.title') || '¿Qué tipos de producto fabrica tu imprenta?'}
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t('guided.stageB.subtitle') || 'Marca las familias de encuadernación que realizáis en vuestro taller. Puedes empezar con una y añadir más en cualquier momento.'}
                </p>
            </div>

            {/* 4 Large Iconography Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {FAMILY_DEFINITIONS.map(def => {
                    const isEnabled = Boolean(enabledFamilies[def.id]);
                    const isFocus = selectedFamilyId === def.id;

                    return (
                        <div
                            key={def.id}
                            className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between bg-white dark:bg-[#18181b] ${
                                isEnabled
                                    ? isFocus
                                        ? 'border-[#dc0000] ring-2 ring-[#dc0000]/20 shadow-sm'
                                        : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400'
                                    : 'border-dashed border-zinc-200 dark:border-zinc-800 opacity-60 hover:opacity-90'
                            }`}
                        >
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className={`p-3 rounded-2xl border transition-colors ${
                                        isEnabled 
                                            ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] border-red-200 dark:border-red-900/60'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700'
                                    }`}>
                                        <BindingIcon family={def.id} size={32} />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => onToggleFamily(def.id)}
                                        aria-pressed={isEnabled}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            isEnabled
                                                ? 'bg-[#dc0000] text-white shadow-2xs'
                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {isEnabled ? (
                                            <>
                                                <Check size={13} />
                                                <span>{t('guided.products.offered') || 'Fabricamos'}</span>
                                            </>
                                        ) : (
                                            <span>{t('guided.products.notOffered') || 'No fabricamos'}</span>
                                        )}
                                    </button>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                                        {t(def.titleKey)}
                                    </h3>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                                        {t(def.descKey)}
                                    </p>
                                </div>
                            </div>

                            {/* Additional human guidance on capabilities + Direct PDF upload when enabled */}
                            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2.5">
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {t(def.hintKey)}
                                </p>

                                {isEnabled && onUploadFamilyQuote && (() => {
                                    const cont = pricingContinuity?.[def.id];
                                    const isUploading = Boolean(uploadingByFamily?.[def.id]);
                                    const uploadErr = uploadErrorsByFamily?.[def.id];
                                    const uploadedName = cont?.uploadedFileName;
                                    const isDragging = dragOverFamily === def.id;

                                    return (
                                        <div
                                            data-testid={`product-card-upload-${def.id}`}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                setDragOverFamily(def.id);
                                            }}
                                            onDragLeave={() => setDragOverFamily(null)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setDragOverFamily(null);
                                                const dropped = e.dataTransfer?.files?.[0];
                                                if (dropped) handleFilePicked(def.id, dropped);
                                            }}
                                            className={`rounded-xl border border-dashed p-2.5 transition-colors ${
                                                isDragging
                                                    ? 'border-[#dc0000] bg-red-50/70 dark:bg-red-950/30'
                                                    : uploadedName
                                                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20'
                                                        : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-900/50 hover:border-zinc-400 dark:hover:border-zinc-600'
                                            }`}
                                        >
                                            <input
                                                ref={(el) => { fileInputRefs.current[def.id] = el; }}
                                                type="file"
                                                accept=".pdf,application/pdf"
                                                data-testid={`product-card-file-input-${def.id}`}
                                                className="hidden"
                                                onChange={(e) => {
                                                    const f = e.target.files?.[0];
                                                    if (f) handleFilePicked(def.id, f);
                                                    e.target.value = '';
                                                }}
                                            />
                                            {isUploading ? (
                                                <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                                    <Loader2 size={14} className="animate-spin text-[#dc0000]" />
                                                    <span>{t('guided.products.uploadingPdf')}</span>
                                                </div>
                                            ) : uploadedName ? (
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <FileText size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                                        <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 truncate" title={uploadedName}>
                                                            {uploadedName}
                                                        </span>
                                                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded shrink-0">
                                                            {t('guided.products.pdfAttached')}
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => fileInputRefs.current[def.id]?.click()}
                                                        className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300 hover:text-[#dc0000] underline shrink-0 cursor-pointer"
                                                    >
                                                        {t('guided.products.replacePdf')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRefs.current[def.id]?.click()}
                                                    className="w-full flex items-center justify-between gap-2 text-left cursor-pointer group"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Upload size={13} className="text-[#dc0000] shrink-0" />
                                                        <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-950 dark:group-hover:text-white truncate">
                                                            {t('guided.products.uploadPdfOptional')}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-zinc-400 shrink-0 hidden sm:inline">
                                                        PDF
                                                    </span>
                                                </button>
                                            )}
                                            {uploadErr && (
                                                <div className="mt-1.5 flex items-start gap-1 text-[10px] text-red-600 dark:text-red-400">
                                                    <AlertCircle size={12} className="shrink-0 mt-0.5" />
                                                    <span>{uploadErr}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Live Calibration Coverage Indicator (What 4 offers cover in PrintPrice OS) */}
            {(() => {
                const uploadedFamiliesCount = FAMILY_DEFINITIONS.filter(
                    (d) => enabledFamilies[d.id] && Boolean(pricingContinuity?.[d.id]?.uploadedFileName || pricingContinuity?.[d.id]?.offer || families[d.id]?.status === 'DATA_VALIDATED')
                ).length;
                const estimatedCoveragePct = Math.min(80, uploadedFamiliesCount * 20);
                return (
                    <div
                        data-testid="products-calibration-coverage-meter"
                        className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 space-y-2.5"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={16} className="text-[#dc0000] shrink-0" />
                                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                    {t('guided.products.coverageTitle')}
                                </span>
                            </div>
                            <span className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full">
                                {uploadedFamiliesCount}/{activeCount || 4} {t('guided.products.coverageFamiliesCount')} · ~{estimatedCoveragePct}%
                            </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div
                                className="h-full bg-[#dc0000] rounded-full transition-all duration-300"
                                style={{ width: `${Math.max(uploadedFamiliesCount > 0 ? 12 : 0, estimatedCoveragePct)}%` }}
                            />
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {t('guided.products.coverageSubtitle')}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 text-[11px]">
                            <div className="p-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-300">
                                {t('guided.products.coverageCoveredLabel')}
                            </div>
                            <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                                {t('guided.products.coverageSeparateLabel')}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Informative Note: Declaration vs Technical Machine */}
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
                <Info size={18} className="text-[#dc0000] shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    <span className="font-bold text-zinc-900 dark:text-zinc-200">
                        {t('guided.products.truthGuaranteeTitle') || 'Declaración honesta de producto'}:
                    </span>{' '}
                    {t('guided.products.truthGuaranteeDesc') || 'Seleccionar una familia declara las líneas que fabricáis, pero no inventa maquinaria ni capacidades falsas en vuestro taller. Las tarifas y especificaciones se calibran a continuación a partir de un presupuesto real.'}
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-3">
                <button
                    type="button"
                    onClick={onBackToCompany}
                    className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                    <ArrowLeft size={15} />
                    <span>{t('guided.action.backToCompany') || 'Volver a datos de imprenta'}</span>
                </button>

                <div className="flex items-center gap-3">
                    {onOpenFullSetup && (
                        <button
                            type="button"
                            onClick={onOpenFullSetup}
                            className="px-3.5 py-2.5 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
                        >
                            {t('guided.action.openFullSetup') || 'Abrir configuración completa'}
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={activeCount === 0}
                        onClick={onContinueToPricing}
                        className="px-6 py-2.5 rounded-xl bg-[#dc0000] hover:bg-[#b50000] text-white text-xs font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                        <span>{t('guided.action.continueToPricing') || 'Continuar a calibrar precios'}</span>
                        <ArrowRight size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
};
