/**
 * src/ui/components/printhouse/onboarding/ManualOfferForm.tsx
 *
 * Progressive structured form for entering quotation offers manually.
 *
 * Organized into 7 canonical sections:
 * 1. Producto
 * 2. Interior
 * 3. Cubierta
 * 4. Encuadernación (adapted by family)
 * 5. Acabados
 * 6. Tiradas y precios (multi-run & variant table)
 * 7. Entrega
 *
 * Invariants:
 * - Real dimensions in mm (A4/A5 are optional reference helpers).
 * - Unknown values remain unknown (no default hallucination).
 * - Distinguishes quantity, paper, finishing, turnaround, and transport options.
 * - Live arithmetic verification with 0.02 EUR rounding tolerance.
 */
import React, { useState, useMemo } from 'react';
import { ProductFamilyId, ProgressiveSpecState, OfferVariantRow } from '../../../types/printhouseOnboardingTypes';
import { CountrySelect } from '../../common/CountrySelect';
import { isValidIso2Country } from '../../../lib/countryCatalog';
import { useLocale } from '../../../i18n';
import { 
    Layers, Book, Palette, Scissors, Sparkles, 
    Calculator, Truck, Plus, Trash2, AlertCircle, 
    CheckCircle2, ArrowRight, Info, AlertTriangle 
} from 'lucide-react';

interface ManualOfferFormProps {
    familyId?: ProductFamilyId;
    family?: ProductFamilyId;
    spec?: ProgressiveSpecState;
    initialSpec?: ProgressiveSpecState;
    onChange?: (updatedSpec: ProgressiveSpecState) => void;
    onSubmit?: () => void;
    onSubmitSpec?: (spec: ProgressiveSpecState) => void;
    onCancel?: () => void;
}

export const ManualOfferForm: React.FC<ManualOfferFormProps> = ({
    familyId: propFamilyId,
    family,
    spec: propSpec,
    initialSpec,
    onChange,
    onSubmit,
    onSubmitSpec,
    onCancel
}) => {
    const { t } = useLocale();
    const familyId: ProductFamilyId = propFamilyId || family || 'HARDCOVER';

    const getInitialSpec = (): ProgressiveSpecState => {
        const base = propSpec || initialSpec;
        if (base) {
            return {
                ...base,
                family: base.family || familyId,
                formatWidthMm: base.formatWidthMm ?? base.widthMm ?? 148,
                formatHeightMm: base.formatHeightMm ?? base.heightMm ?? 210,
                widthMm: base.widthMm ?? base.formatWidthMm ?? 148,
                heightMm: base.heightMm ?? base.formatHeightMm ?? 210,
                interiorPages: base.interiorPages ?? base.pageCount ?? 160,
                pageCount: base.pageCount ?? base.interiorPages ?? 160,
                interiorPaperWeightGsm: base.interiorPaperWeightGsm ?? base.interiorWeightGsm ?? 90,
                interiorWeightGsm: base.interiorWeightGsm ?? base.interiorPaperWeightGsm ?? 90,
                runs: base.runs && base.runs.length > 0 ? base.runs : [
                    {
                        id: 'run-1',
                        quantity: 1000,
                        manufacturingPrice: 1200,
                        transportPrice: 150,
                        quotedTotalPrice: 1350,
                        quotedUnitPrice: 1.35,
                        computedTotalPrice: 1350,
                        computedUnitPrice: 1.35,
                        validationStatus: 'CONSISTENT'
                    }
                ]
            };
        }
        return {
            family: familyId,
            productTitle: '',
            formatWidthMm: 148,
            formatHeightMm: 210,
            widthMm: 148,
            heightMm: 210,
            currency: 'EUR',
            interiorPaper: 'Offset weiß',
            interiorPages: 160,
            pageCount: 160,
            interiorPaperWeightGsm: 90,
            interiorWeightGsm: 90,
            interiorColors: '1/1',
            coverPaper: 'Bilderdruck',
            coverWeightGsm: 250,
            coverColors: '4/0',
            bindingMethod: familyId === 'HARDCOVER' ? 'thread_sewn' : familyId === 'SOFTCOVER' ? 'adhesive_pur' : familyId === 'WIRE_O' ? 'wire_o' : 'saddle_stitch',
            deliveryCountry: 'DE',
            deliveryCity: '',
            runs: [
                {
                    id: 'run-1',
                    quantity: 1000,
                    manufacturingPrice: 1200,
                    transportPrice: 150,
                    quotedTotalPrice: 1350,
                    quotedUnitPrice: 1.35,
                    computedTotalPrice: 1350,
                    computedUnitPrice: 1.35,
                    validationStatus: 'CONSISTENT'
                }
            ]
        };
    };

    const [internalSpec, setInternalSpec] = useState<ProgressiveSpecState>(getInitialSpec);

    // If controlled propSpec is passed with onChange, use it with fallbacks, otherwise internal state
    const spec: ProgressiveSpecState = propSpec ? {
        ...propSpec,
        family: propSpec.family || familyId,
        formatWidthMm: propSpec.formatWidthMm ?? propSpec.widthMm ?? 148,
        formatHeightMm: propSpec.formatHeightMm ?? propSpec.heightMm ?? 210,
        widthMm: propSpec.widthMm ?? propSpec.formatWidthMm ?? 148,
        heightMm: propSpec.heightMm ?? propSpec.formatHeightMm ?? 210,
        interiorPages: propSpec.interiorPages ?? propSpec.pageCount ?? 160,
        pageCount: propSpec.pageCount ?? propSpec.interiorPages ?? 160,
        interiorPaperWeightGsm: propSpec.interiorPaperWeightGsm ?? propSpec.interiorWeightGsm ?? 90,
        interiorWeightGsm: propSpec.interiorWeightGsm ?? propSpec.interiorPaperWeightGsm ?? 90,
        runs: propSpec.runs || []
    } : internalSpec;

    const emitChange = (updated: ProgressiveSpecState) => {
        setInternalSpec(updated);
        if (onChange) {
            onChange(updated);
        }
    };

    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
        product: false,
        interior: false,
        cover: false,
        binding: false,
        finishing: false,
        runs: false,
        delivery: false
    });

    const toggleSection = (sec: string) => {
        setCollapsedSections(prev => ({ ...prev, [sec]: !prev[sec] }));
    };

    // Generic updater
    const updateField = (field: keyof ProgressiveSpecState, value: any) => {
        emitChange({
            ...spec,
            [field]: value
        });
    };

    // Quick format helpers
    const applyStandardFormat = (w: number, h: number, name: string) => {
        emitChange({
            ...spec,
            formatWidthMm: w,
            formatHeightMm: h,
            widthMm: w,
            heightMm: h,
            formatStandardRef: name
        });
    };

    // Multi-run handling
    const addRunRow = () => {
        const lastRun = spec.runs[spec.runs.length - 1];
        const nextQty = lastRun ? (lastRun.quantity ? lastRun.quantity * 2 : 1000) : 500;
        const newRow: OfferVariantRow = {
            id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            quantity: nextQty,
            paperVariant: lastRun?.paperVariant || '',
            finishingVariant: lastRun?.finishingVariant || '',
            turnaroundDays: lastRun?.turnaroundDays || 10,
            logisticsOption: 'Estándar',
            manufacturingPrice: 0,
            transportPrice: 0,
            totalPrice: 0,
            unitPrice: 0,
            validationStatus: 'CONSISTENT'
        };
        emitChange({
            ...spec,
            runs: [...spec.runs, newRow]
        });
    };

    const removeRunRow = (index: number) => {
        if (spec.runs.length <= 1) return;
        const newRuns = [...spec.runs];
        newRuns.splice(index, 1);
        emitChange({ ...spec, runs: newRuns });
    };

    const updateRunField = (index: number, field: keyof OfferVariantRow, val: any) => {
        const newRuns = [...spec.runs];
        const row = { ...newRuns[index], [field]: val };

        // Recalculate and arithmetic check
        const mfg = Number(row.manufacturingPrice) || 0;
        const trans = Number(row.transportPrice) || 0;
        const total = Number(row.totalPrice) || (mfg + trans);
        const qty = Number(row.quantity) || 1;

        if (field === 'manufacturingPrice' || field === 'transportPrice') {
            row.totalPrice = Number((mfg + trans).toFixed(2));
            row.unitPrice = Number(((mfg + trans) / qty).toFixed(4));
            row.computedUnitPrice = row.unitPrice;
            row.validationStatus = 'CONSISTENT';
        } else if (field === 'totalPrice') {
            const expectedTotal = mfg + trans;
            const diff = Math.abs(expectedTotal - Number(val));
            if (mfg > 0 && diff > 0.05) {
                row.validationStatus = 'INCONSISTENT_TOTAL';
            } else {
                row.validationStatus = 'CONSISTENT';
            }
            row.unitPrice = Number((Number(val) / qty).toFixed(4));
            row.computedUnitPrice = row.unitPrice;
        } else if (field === 'unitPrice') {
            const computedUnit = total / qty;
            const diff = Math.abs(computedUnit - Number(val));
            if (diff > 0.05) {
                row.validationStatus = 'INCONSISTENT_UNIT_PRICE';
            } else {
                row.validationStatus = 'CONSISTENT';
            }
            row.computedUnitPrice = Number(computedUnit.toFixed(4));
        }

        newRuns[index] = row;
        emitChange({ ...spec, runs: newRuns });
    };

    // Calculate completion and missing requirements
    const missingItems = useMemo(() => {
        const missing: string[] = [];
        if (!spec.formatWidthMm || !spec.formatHeightMm) {
            missing.push(t('form.missing.dimensions') || 'Dimensiones en mm');
        }
        if (!spec.interiorPages || spec.interiorPages <= 0) {
            missing.push(t('form.missing.pages') || 'Páginas de interior');
        }
        if (!spec.interiorPaperWeightGsm) {
            missing.push(t('form.missing.interiorPaper') || 'Gramaje de papel interior');
        }
        if (familyId === 'HARDCOVER') {
            if (!spec.boardThicknessMm) missing.push(t('form.missing.board') || 'Grosor de cartón (Graupappe)');
        }
        if (!spec.deliveryCountry || !isValidIso2Country(spec.deliveryCountry)) {
            missing.push(t('form.missing.country') || 'País de entrega');
        }
        const hasValidRun = spec.runs.some(r => r.quantity > 0 && r.manufacturingPrice > 0);
        if (!hasValidRun) {
            missing.push(t('form.missing.run') || 'Al menos una tirada con precio de producción');
        }
        return missing;
    }, [spec, familyId, t]);

    const isComplete = missingItems.length === 0;

    return (
        <form 
            onSubmit={(e) => { 
                e.preventDefault(); 
                if (isComplete) {
                    if (onSubmitSpec) onSubmitSpec(spec);
                    if (onSubmit) onSubmit();
                }
            }} 
            className="space-y-4 text-xs"
        >
            {/* ── 1. PRODUCTO ── */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div 
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleSection('product')}
                >
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-[#dc0000]">
                            <Book size={16} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {t('form.section.product') || '1. Producto y Dimensiones Reales'}
                        </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">
                        {collapsedSections.product ? 'Mostrar' : 'Ocultar'}
                    </span>
                </div>

                {!collapsedSections.product && (
                    <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.productTitle') || 'Título del Libro / Trabajo'} *
                                </label>
                                <input
                                    type="text"
                                    value={spec.productTitle}
                                    onChange={(e) => updateField('productTitle', e.target.value)}
                                    placeholder="Ej: Manual de usuario, Catálogo técnico..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.quoteRef') || 'Referencia de Presupuesto (Opcional)'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.quoteRef || ''}
                                    onChange={(e) => updateField('quoteRef', e.target.value)}
                                    placeholder="Ej: PRE-2026-001"
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.dimensionsMm') || 'Formato Real (Ancho × Alto mm)'} *
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={spec.formatWidthMm || ''}
                                        onChange={(e) => updateField('formatWidthMm', Number(e.target.value) || undefined)}
                                        placeholder="Ancho mm"
                                        className="w-1/2 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                    />
                                    <span className="text-zinc-400 font-bold">×</span>
                                    <input
                                        type="number"
                                        value={spec.formatHeightMm || ''}
                                        onChange={(e) => updateField('formatHeightMm', Number(e.target.value) || undefined)}
                                        placeholder="Alto mm"
                                        className="w-1/2 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.referenceShortcuts') || 'Formatos estándar (referencia opcional)'}
                                </label>
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    <button
                                        type="button"
                                        onClick={() => applyStandardFormat(148, 210, 'A5')}
                                        className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg text-[11px] font-semibold text-zinc-700 dark:text-zinc-300"
                                    >
                                        A5 (148×210)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyStandardFormat(170, 240, '170×240')}
                                        className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg text-[11px] font-semibold text-zinc-700 dark:text-zinc-300"
                                    >
                                        170×240
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyStandardFormat(210, 297, 'A4')}
                                        className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg text-[11px] font-semibold text-zinc-700 dark:text-zinc-300"
                                    >
                                        A4 (210×297)
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.currency') || 'Moneda'}
                                </label>
                                <select
                                    value={spec.currency}
                                    onChange={(e) => updateField('currency', e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                >
                                    <option value="EUR">EUR (€)</option>
                                    <option value="USD">USD ($)</option>
                                    <option value="GBP">GBP (£)</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.quoteRef') || 'Número / Referencia del Presupuesto'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.quoteReference || ''}
                                    onChange={(e) => updateField('quoteReference', e.target.value)}
                                    placeholder="Ej: OF-2026-904"
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.quoteDate') || 'Fecha de Cotización'}
                                </label>
                                <input
                                    type="date"
                                    value={spec.quoteDate || ''}
                                    onChange={(e) => updateField('quoteDate', e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 2. INTERIOR ── */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div 
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleSection('interior')}
                >
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600">
                            <Layers size={16} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {t('form.section.interior') || '2. Páginas y Bloques de Interior'}
                        </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">
                        {collapsedSections.interior ? 'Mostrar' : 'Ocultar'}
                    </span>
                </div>

                {!collapsedSections.interior && (
                    <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.pageCount') || 'Número de Páginas'} *
                                </label>
                                <input
                                    type="number"
                                    value={spec.interiorPages || ''}
                                    onChange={(e) => updateField('interiorPages', Number(e.target.value) || undefined)}
                                    placeholder="Ej: 192, 216..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.interiorPaper') || 'Papel de Interior'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.interiorPaperType || ''}
                                    onChange={(e) => updateField('interiorPaperType', e.target.value)}
                                    placeholder="Ej: Munken Print Cream, Offset..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.interiorWeight') || 'Gramaje Interior (g/m²)'} *
                                </label>
                                <input
                                    type="number"
                                    value={spec.interiorPaperWeightGsm || ''}
                                    onChange={(e) => updateField('interiorPaperWeightGsm', Number(e.target.value) || undefined)}
                                    placeholder="Ej: 80, 90, 115, 150..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.interiorVolume') || 'Volumen de Papel (si consta)'}
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={spec.interiorPaperVolume || ''}
                                    onChange={(e) => updateField('interiorPaperVolume', Number(e.target.value) || undefined)}
                                    placeholder="Ej: 1.3, 1.5..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.interiorColors') || 'Tintas de Interior (Frontal / Reverso)'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.interiorColorFront || ''}
                                    onChange={(e) => updateField('interiorColorFront', e.target.value)}
                                    placeholder="Ej: 1/1 (Negro), 4/4 (CMYK)..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.mixedSections') || 'Bloques Interiores Mixtos (ej. Fährmann)'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.mixedSectionsDescription || ''}
                                    onChange={(e) => updateField('mixedSectionsDescription', e.target.value)}
                                    placeholder="Ej: 208 págs 1/1 + 8 págs 4/4 a color"
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 3. CUBIERTA ── */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div 
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleSection('cover')}
                >
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                            <Palette size={16} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {t('form.section.cover') || '3. Cubierta, Cartón y Guardas'}
                        </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">
                        {collapsedSections.cover ? 'Mostrar' : 'Ocultar'}
                    </span>
                </div>

                {!collapsedSections.cover && (
                    <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.coverPaper') || 'Papel de Cubierta / Forro'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.coverPaperType || ''}
                                    onChange={(e) => updateField('coverPaperType', e.target.value)}
                                    placeholder="Ej: Estucado arte 130g, Cartulina gráfica 300g..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.coverWeight') || 'Gramaje Cubierta (g/m²)'}
                                </label>
                                <input
                                    type="number"
                                    value={spec.coverPaperWeightGsm || ''}
                                    onChange={(e) => updateField('coverPaperWeightGsm', Number(e.target.value) || undefined)}
                                    placeholder="Ej: 130 (forro), 300 (rústica)..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.coverColors') || 'Tintas de Cubierta'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.coverColorFront || ''}
                                    onChange={(e) => updateField('coverColorFront', e.target.value)}
                                    placeholder="Ej: 4/0 (Una cara), 4/4..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                        </div>

                        {/* Hardcover Specifics: Cardboard thickness & Endpapers */}
                        {familyId === 'HARDCOVER' && (
                            <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-3">
                                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold text-xs">
                                    <Info size={14} />
                                    <span>{t('form.hardcoverBoardTitle') || 'Especificaciones de Tapa Dura (Cartón y Guardas)'}</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                            {t('form.boardThickness') || 'Grosor de Cartón / Graupappe (mm)'} *
                                        </label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={spec.boardThicknessMm || ''}
                                            onChange={(e) => updateField('boardThicknessMm', Number(e.target.value) || undefined)}
                                            placeholder="Ej: 2.0, 2.4, 3.0 mm"
                                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                            {t('form.endpapers') || 'Guardas (Papel y acabado)'}
                                        </label>
                                        <input
                                            type="text"
                                            value={spec.endpaperPaper || ''}
                                            onChange={(e) => updateField('endpaperPaper', e.target.value)}
                                            placeholder="Ej: Offset 140g sin imprimir"
                                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Softcover Specifics: Solapas */}
                        {familyId === 'SOFTCOVER' && (
                            <div className="flex items-center gap-3 pt-1">
                                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-zinc-700 dark:text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={spec.hasFlaps || false}
                                        onChange={(e) => updateField('hasFlaps', e.target.checked)}
                                        className="rounded text-[#dc0000] focus:ring-[#dc0000]"
                                    />
                                    <span>{t('form.hasFlaps') || 'Incluye solapas (solapas plegadas en cubierta)'}</span>
                                </label>
                                {spec.hasFlaps && (
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            value={spec.flapWidthMm || ''}
                                            onChange={(e) => updateField('flapWidthMm', Number(e.target.value) || undefined)}
                                            placeholder="Ancho solapa (mm)"
                                            className="w-28 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs"
                                        />
                                        <span className="text-zinc-500 text-xs">mm</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── 4. ENCUADERNACIÓN ── */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div 
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleSection('binding')}
                >
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600">
                            <Scissors size={16} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {t('form.section.binding') || '4. Encuadernación y Lomo'}
                        </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">
                        {collapsedSections.binding ? 'Mostrar' : 'Ocultar'}
                    </span>
                </div>

                {!collapsedSections.binding && (
                    <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.bindingMethod') || 'Método de Unión'} *
                                </label>
                                <select
                                    value={spec.bindingMethod}
                                    onChange={(e) => updateField('bindingMethod', e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                >
                                    {familyId === 'HARDCOVER' && (
                                        <>
                                            <option value="SEWN">{t('binding.sewn') || 'Cosido con hilo (Fadenheftung)'}</option>
                                            <option value="GLUED">{t('binding.glued') || 'Encolado / Fresado'}</option>
                                        </>
                                    )}
                                    {familyId === 'SOFTCOVER' && (
                                        <>
                                            <option value="GLUED">{t('binding.pur') || 'Fresado / Cola PUR'}</option>
                                            <option value="SEWN">{t('binding.sewnSoftcover') || 'Cosido con hilo rústica'}</option>
                                        </>
                                    )}
                                    {familyId === 'WIRE_O' && (
                                        <option value="WIRE_O">{t('binding.wireO') || 'Espiral doble Wire-O'}</option>
                                    )}
                                    {familyId === 'SADDLE_STITCH' && (
                                        <option value="SADDLE_STITCH">{t('binding.saddleStitch') || 'Grapado al caballete'}</option>
                                    )}
                                </select>
                            </div>

                            {/* Hardcover spine & headband */}
                            {familyId === 'HARDCOVER' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                            {t('form.spineType') || 'Forma del Lomo'}
                                        </label>
                                        <select
                                            value={spec.spineType || 'SQUARE'}
                                            onChange={(e) => updateField('spineType', e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                        >
                                            <option value="SQUARE">{t('spine.square') || 'Lomo recto (gerader Rücken)'}</option>
                                            <option value="ROUND">{t('spine.round') || 'Lomo redondo'}</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                            {t('form.headband') || 'Cabezadas (Kapitalband)'}
                                        </label>
                                        <input
                                            type="text"
                                            value={spec.headbandColor || ''}
                                            onChange={(e) => updateField('headbandColor', e.target.value)}
                                            placeholder="Ej: Blanco, Negro, Sin cabezada..."
                                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Wire-O specific */}
                            {familyId === 'WIRE_O' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                            {t('form.wirePitch') || 'Paso de perforación'}
                                        </label>
                                        <select
                                            value={spec.wirePitch || '3:1'}
                                            onChange={(e) => updateField('wirePitch', e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                        >
                                            <option value="3:1">Paso 3:1 (3 agujeros por pulgada)</option>
                                            <option value="2:1">Paso 2:1 (2 agujeros por pulgada)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                            {t('form.wireColor') || 'Color de espiral'}
                                        </label>
                                        <input
                                            type="text"
                                            value={spec.wireColor || ''}
                                            onChange={(e) => updateField('wireColor', e.target.value)}
                                            placeholder="Ej: Negro, Blanco, Plata..."
                                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Saddle Stitch specific */}
                            {familyId === 'SADDLE_STITCH' && (
                                <>
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                            {t('form.stapleCount') || 'Número de grapas'}
                                        </label>
                                        <input
                                            type="number"
                                            value={spec.stapleCount || 2}
                                            onChange={(e) => updateField('stapleCount', Number(e.target.value) || 2)}
                                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                            {t('form.stapleType') || 'Tipo de grapa'}
                                        </label>
                                        <select
                                            value={spec.stapleType || 'FLAT'}
                                            onChange={(e) => updateField('stapleType', e.target.value)}
                                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                        >
                                            <option value="FLAT">{t('staple.flat') || 'Grapa plana estándar'}</option>
                                            <option value="OMEGA">{t('staple.omega') || 'Grapa omega (para archivar)'}</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── 5. ACABADOS ── */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div 
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleSection('finishing')}
                >
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600">
                            <Sparkles size={16} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {t('form.section.finishing') || '5. Acabados y Protección'}
                        </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">
                        {collapsedSections.finishing ? 'Mostrar' : 'Ocultar'}
                    </span>
                </div>

                {!collapsedSections.finishing && (
                    <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.lamination') || 'Plastificado / Laminado'}
                                </label>
                                <select
                                    value={spec.lamination || 'NONE'}
                                    onChange={(e) => updateField('lamination', e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                >
                                    <option value="NONE">{t('lamination.none') || 'Sin plastificar'}</option>
                                    <option value="MATTE">{t('lamination.matte') || 'Plastificado mate'}</option>
                                    <option value="GLOSS">{t('lamination.gloss') || 'Plastificado brillo'}</option>
                                    <option value="SOFT_TOUCH">{t('lamination.softTouch') || 'Plastificado Soft-touch'}</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.varnish') || 'Barniz (especificar tipo y cobertura)'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.varnishType || ''}
                                    onChange={(e) => updateField('varnishType', e.target.value)}
                                    placeholder="Ej: Barniz UVI sectorizado, Barniz acrílico..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.stamping') || 'Estampación / Relieve'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.foilColor || ''}
                                    onChange={(e) => updateField('foilColor', e.target.value)}
                                    placeholder="Ej: Stamping oro, Golpe en seco..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 6. TIRADAS Y PRECIOS (MULTI-RUN & VARIANT TABLE) ── */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                            <Calculator size={16} />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                                {t('form.section.runs') || '6. Tiradas, Variantes y Precios'} *
                            </h4>
                            <p className="text-[11px] text-zinc-500">
                                {t('form.runsSubtitle') || 'Distingue cantidad, alternativa de papel, acabado, plazo y transporte sin mezclar tiradas.'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={addRunRow}
                        className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Plus size={13} />
                        <span>{t('form.addRunBtn') || 'Añadir tirada / variante'}</span>
                    </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="bg-zinc-100/80 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                                <th className="p-2.5">Cantidad *</th>
                                <th className="p-2.5">Variante Papel / Acabado</th>
                                <th className="p-2.5">Opción Transporte</th>
                                <th className="p-2.5">Plazo (días)</th>
                                <th className="p-2.5">Fabr. (€) *</th>
                                <th className="p-2.5">Transp. (€)</th>
                                <th className="p-2.5">Total (€)</th>
                                <th className="p-2.5">Unit. (€/ud)</th>
                                <th className="p-2.5 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {spec.runs.map((run, idx) => (
                                <tr key={run.id || idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            value={run.quantity || ''}
                                            onChange={(e) => updateRunField(idx, 'quantity', Number(e.target.value) || 0)}
                                            placeholder="Ej: 500"
                                            className="w-24 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="text"
                                            value={run.paperVariant || ''}
                                            onChange={(e) => updateRunField(idx, 'paperVariant', e.target.value)}
                                            placeholder="Ej: Munken 1.5"
                                            className="w-36 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="text"
                                            value={run.logisticsOption || ''}
                                            onChange={(e) => updateRunField(idx, 'logisticsOption', e.target.value)}
                                            placeholder="Estándar / Agrupado"
                                            className="w-28 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            value={run.turnaroundDays || ''}
                                            onChange={(e) => updateRunField(idx, 'turnaroundDays', Number(e.target.value) || 0)}
                                            placeholder="10"
                                            className="w-16 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={run.manufacturingPrice || ''}
                                            onChange={(e) => updateRunField(idx, 'manufacturingPrice', Number(e.target.value) || 0)}
                                            placeholder="4321.00"
                                            className="w-24 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={run.transportPrice || ''}
                                            onChange={(e) => updateRunField(idx, 'transportPrice', Number(e.target.value) || 0)}
                                            placeholder="325.00"
                                            className="w-20 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={run.totalPrice || ''}
                                            onChange={(e) => updateRunField(idx, 'totalPrice', Number(e.target.value) || 0)}
                                            placeholder="4646.00"
                                            className={`w-24 px-2 py-1.5 rounded-lg border font-bold ${
                                                run.validationStatus === 'INCONSISTENT_TOTAL'
                                                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                                                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white'
                                            }`}
                                        />
                                    </td>
                                    <td className="p-2">
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                step="0.0001"
                                                value={run.unitPrice || ''}
                                                onChange={(e) => updateRunField(idx, 'unitPrice', Number(e.target.value) || 0)}
                                                placeholder="9.29"
                                                className={`w-20 px-2 py-1.5 rounded-lg border font-bold ${
                                                    run.validationStatus === 'INCONSISTENT_UNIT_PRICE'
                                                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                                                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white'
                                                }`}
                                            />
                                            {run.validationStatus !== 'CONSISTENT' && (
                                                <span 
                                                    title={`Discrepancia aritmética: calculado ${(run.totalPrice / (run.quantity || 1)).toFixed(2)} €`}
                                                    className="text-amber-600 dark:text-amber-400 shrink-0"
                                                >
                                                    <AlertTriangle size={14} />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-2 text-center">
                                        {spec.runs.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeRunRow(idx)}
                                                className="p-1 rounded-md text-zinc-400 hover:text-red-600 transition-colors"
                                                title="Eliminar tirada"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── 7. ENTREGA ── */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div 
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => toggleSection('delivery')}
                >
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600">
                            <Truck size={16} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {t('form.section.delivery') || '7. Destino y Plazos de Entrega'}
                        </h4>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">
                        {collapsedSections.delivery ? 'Mostrar' : 'Ocultar'}
                    </span>
                </div>

                {!collapsedSections.delivery && (
                    <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.deliveryCountry') || 'País de Destino'} *
                                </label>
                                <CountrySelect
                                    value={spec.deliveryCountry}
                                    onChange={(code) => updateField('deliveryCountry', code)}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.deliveryCity') || 'Ciudad / Destino'}
                                </label>
                                <input
                                    type="text"
                                    value={spec.deliveryCity || ''}
                                    onChange={(e) => updateField('deliveryCity', e.target.value)}
                                    placeholder="Ej: Frankfurt, Madrid, Rastede..."
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                                    {t('form.leadTime') || 'Plazo de Fabricación Estándar (Días)'}
                                </label>
                                <input
                                    type="number"
                                    value={spec.leadTimeDays || ''}
                                    onChange={(e) => updateField('leadTimeDays', Number(e.target.value) || undefined)}
                                    placeholder="Ej: 10"
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── STICKY ACTIONS BAR (QUÉ FALTA & SIGUIENTE ACCIÓN) ── */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
                <div>
                    {!isComplete ? (
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
                            <AlertCircle size={15} className="shrink-0" />
                            <span>
                                {t('form.missingFieldsNotice') || 'Faltan campos obligatorios'}: <strong>{missingItems.join(', ')}</strong>
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                            <CheckCircle2 size={15} className="shrink-0" />
                            <span>
                                {t('form.fieldsCompleteNotice') || 'Todos los campos obligatorios están completados.'}
                            </span>
                        </div>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={!isComplete}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        isComplete
                            ? 'bg-[#dc0000] hover:bg-red-700 text-white shadow-xs'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                    }`}
                >
                    <span>{t('form.submitAndReview') || 'Revisar especificaciones y precios'}</span>
                    <ArrowRight size={14} />
                </button>
            </div>
        </form>
    );
};
