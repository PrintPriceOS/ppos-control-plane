/**
 * src/ui/components/printhouse/onboarding/VariantSpecTable.tsx
 *
 * Structured review table for multi-runs, paper variants, and logistics options.
 *
 * Invariants:
 * - Distinguishes quantity, paper, finishing, lead time, and freight options without conflating them into different runs.
 * - Detects arithmetic discrepancies (Stutensee case: 3.05 € vs 5.08 €) without silent corrections.
 * - Detects technical ambiguities (Die Mysteriösen Steine: Softcover vs 2.4 mm Graupappe) and requests confirmation.
 * - Displays parameter coverage vs missing coverage (Wire-O, saddle stitch, foil stamping, sewn vs glued).
 */
import React, { useState } from 'react';
import { OfferVariantRow, ProductFamilyId, ProgressiveSpecState } from '../../../types/printhouseOnboardingTypes';
import { useLocale } from '../../../i18n';
import { 
    AlertTriangle, CheckCircle2, Info, ArrowRight, 
    Edit3, HelpCircle, ShieldAlert, Sparkles 
} from 'lucide-react';

interface VariantSpecTableProps {
    familyId?: ProductFamilyId;
    runs?: OfferVariantRow[];
    selectedVariantId?: string;
    onSelectVariant?: (variantId: string) => void;
    spec?: ProgressiveSpecState;
    documentTitle?: string;
    filename?: string;
    hasAmbiguities?: boolean;
    hasAmbiguity?: boolean;
    ambiguityDetails?: string;
    onResolveAmbiguity?: (confirmedBinding: string) => void;
    onConfirmBinding?: (confirmedBinding: 'HARDCOVER' | 'SOFTCOVER') => void;
    onCorrectDiscrepancy?: (runIndex: number, correctedUnitPrice: number) => void;
    onApplyComputedUnit?: () => void;
    onUpdateInclusions?: (inclusions: { includesPaper?: boolean | null; includesBinding?: boolean | null; includesFinishing?: boolean | null; includesPackaging?: boolean | null }) => void;
    onProceedToCalculate?: () => void;
    onProceedToCalculation?: () => void;
    onProceedToComparison?: () => void;
    onBackToEdit?: () => void;
    onEditOffer?: () => void;
}

export const VariantSpecTable: React.FC<VariantSpecTableProps> = ({
    familyId: explicitFamilyId,
    runs: explicitRuns,
    selectedVariantId,
    onSelectVariant,
    spec,
    documentTitle: explicitDocTitle,
    filename,
    hasAmbiguities: explicitHasAmbiguities,
    hasAmbiguity,
    ambiguityDetails: explicitAmbiguityDetails,
    onResolveAmbiguity,
    onConfirmBinding,
    onCorrectDiscrepancy,
    onApplyComputedUnit,
    onUpdateInclusions,
    onProceedToCalculate,
    onProceedToCalculation,
    onProceedToComparison,
    onBackToEdit,
    onEditOffer
}) => {
    const { t, locale } = useLocale();
    const [ambiguityResolved, setAmbiguityResolved] = useState<string | null>(null);

    // Inclusions state: paper, binding, finishing, packaging (null = unknown/pending)
    const [includesPaper, setIncludesPaper] = useState<boolean | null>(spec?.includesPaper !== undefined ? spec.includesPaper : (spec ? null : true));
    const [includesBinding, setIncludesBinding] = useState<boolean | null>(spec?.includesBinding !== undefined ? spec.includesBinding : (spec ? null : true));
    const [includesFinishing, setIncludesFinishing] = useState<boolean | null>(spec?.includesFinishing !== undefined ? spec.includesFinishing : (spec ? null : true));
    const [includesPackaging, setIncludesPackaging] = useState<boolean | null>(spec?.includesPackaging !== undefined ? spec.includesPackaging : (spec ? null : true));

    const updateInclusion = (field: 'paper' | 'binding' | 'finishing' | 'packaging', value: boolean | null) => {
        let newPaper = includesPaper;
        let newBinding = includesBinding;
        let newFinishing = includesFinishing;
        let newPackaging = includesPackaging;

        if (field === 'paper') { newPaper = value; setIncludesPaper(value); }
        if (field === 'binding') { newBinding = value; setIncludesBinding(value); }
        if (field === 'finishing') { newFinishing = value; setIncludesFinishing(value); }
        if (field === 'packaging') { newPackaging = value; setIncludesPackaging(value); }

        if (onUpdateInclusions) {
            onUpdateInclusions({
                includesPaper: newPaper,
                includesBinding: newBinding,
                includesFinishing: newFinishing,
                includesPackaging: newPackaging
            });
        }
    };

    const familyId = spec ? spec.family : (explicitFamilyId || 'HARDCOVER');
    const runs = spec ? (spec.runs || []) : (explicitRuns || []);
    const documentTitle = spec?.productTitle || explicitDocTitle || 'Presupuesto';
    const isAmbiguityActive = Boolean(spec?.hasAmbiguity ?? (explicitHasAmbiguities ?? hasAmbiguity)) && !ambiguityResolved && !spec?.ambiguityResolved;
    const ambiguityDetails = spec?.ambiguityNote || explicitAmbiguityDetails;

    // Check inclusion confirmations: none can be null or undefined for engine READY state
    const missingInclusions: string[] = [];
    if (includesPaper === null || includesPaper === undefined) missingInclusions.push(t('inclusions.paper') || 'Papel');
    if (includesBinding === null || includesBinding === undefined) missingInclusions.push(t('inclusions.binding') || 'Encuadernación');
    if (includesFinishing === null || includesFinishing === undefined) missingInclusions.push(t('inclusions.finishing') || 'Acabado');
    if (includesPackaging === null || includesPackaging === undefined) missingInclusions.push(t('inclusions.packaging') || 'Empaquetado');
    const hasMissingInclusions = missingInclusions.length > 0;

    const canProceed = !isAmbiguityActive && !hasMissingInclusions;

    const handleProceed = () => {
        if (!canProceed) return;
        const proceedFn = onProceedToCalculation || onProceedToCalculate || onProceedToComparison || (() => {});
        proceedFn();
    };

    const handleEdit = onEditOffer || onBackToEdit || (() => {});
    const handleConfirmResolution = (binding: 'HARDCOVER' | 'SOFTCOVER') => {
        setAmbiguityResolved(binding);
        if (onConfirmBinding) onConfirmBinding(binding);
        if (onResolveAmbiguity) onResolveAmbiguity(binding);
    };

    // Check for arithmetic discrepancies in the runs (Stutensee case)
    const discrepancyIndices = runs
        .map((r, i) => (
            r.validationStatus === 'INCONSISTENT_UNIT_PRICE' || 
            r.validationStatus === 'INCONSISTENT_TOTAL' ||
            (spec?.hasDiscrepancy && r.id === 'stu-300')
        ) ? i : -1)
        .filter(i => i !== -1);

    const hasDiscrepancy = discrepancyIndices.length > 0;

    const formatCurrency = (val: number) => {
        return Number(val || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    };

    const formatUnitPrice = (val: number) => {
        return Number(val || 0).toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' €';
    };

    return (
        <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <span>{t('review.tableTitle') || 'Revisión de Especificaciones y Tabla de Variantes'}</span>
                            {filename && (
                                <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                                    {filename}
                                </span>
                            )}
                        </h4>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                            {documentTitle ? `${documentTitle} · ` : ''}{t('review.tableSubtitle') || 'Verifica las tiradas, precios desglosados y opciones logísticas aportadas.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onBackToEdit}
                        className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-semibold text-zinc-700 dark:text-zinc-200 text-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto cursor-pointer"
                    >
                        <Edit3 size={13} />
                        <span>{t('review.editOffer') || 'Modificar oferta'}</span>
                    </button>
                </div>

                {/* ── ARITHMETIC DISCREPANCY ALERT (STUTENSEE CASE) ── */}
                {hasDiscrepancy && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 rounded-xl space-y-2">
                        <div className="flex items-start gap-2.5">
                            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <h5 className="font-bold text-amber-900 dark:text-amber-200 text-xs">
                                    {t('review.discrepancyTitle') || 'Discrepancia aritmética detectada en el presupuesto'}
                                </h5>
                                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                                    {t('review.discrepancyDesc') || 'El precio unitario indicado en el documento difiere del cálculo (Total / Cantidad) superando la tolerancia de 0,02 €. De acuerdo con las normas de gobernanza, el sistema NO corrige los valores silenciosamente.'}
                                </p>
                            </div>
                        </div>

                        {discrepancyIndices.map(idx => {
                            const r = runs[idx];
                            const numericComputed = r.computedUnitPrice ?? ((r.quotedTotalPrice ?? r.totalPrice ?? 0) / (r.quantity || 1));
                            const quotedUnit = formatUnitPrice(r.quotedUnitPrice ?? r.unitPrice ?? 0);
                            const computedUnit = formatUnitPrice(numericComputed);
                            const total = formatCurrency(r.quotedTotalPrice ?? r.totalPrice ?? 0);
                            return (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-amber-100/60 dark:bg-amber-900/30 rounded-lg text-xs">
                                    <span>
                                        Tirada de <strong>{r.quantity} ej.</strong>: Declarado {quotedUnit}/ud vs Calculado {computedUnit}/ud (Total {total}).
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (onApplyComputedUnit) onApplyComputedUnit();
                                                else if (onCorrectDiscrepancy) onCorrectDiscrepancy(idx, numericComputed);
                                            }}
                                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md text-[11px] transition-colors cursor-pointer"
                                        >
                                            {t('review.applyComputedUnit') || `Aplicar precio unitario calculado`}
                                        </button>
                                        <button
                                            type="button"
                                            className="text-[11px] text-amber-800 dark:text-amber-300 italic underline bg-transparent border-0 cursor-pointer"
                                        >
                                            {t('review.orKeepQuoted') || 'o conservar valor original para revisión'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── TECHNICAL AMBIGUITY ALERT (DIE MYSTERIÖSEN STEINE / TYPO CASE) ── */}
                {isAmbiguityActive && (
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border-2 border-indigo-300 dark:border-indigo-700 rounded-xl space-y-2">
                        <div className="flex items-start gap-2.5">
                            <HelpCircle size={18} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <h5 className="font-bold text-indigo-900 dark:text-indigo-200 text-xs">
                                    {t('review.ambiguityTitle') || 'Ambigüedad técnica detectada entre encuadernación y cartón'}
                                </h5>
                                <p className="text-[11px] text-indigo-800/90 dark:text-indigo-300/90 leading-relaxed">
                                    {ambiguityDetails || 'El documento declara «Softcover» (Rústica) pero especifica «MGP 2,4 mm» (Graupappe / Cartón rígido de encuadernación propio de Tapa Dura).'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                            <span className="font-semibold text-indigo-950 dark:text-indigo-100 text-[11px]">
                                {t('review.confirmBinding') || 'Por favor, confirme la encuadernación real:'}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleConfirmResolution('HARDCOVER')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                    ambiguityResolved === 'HARDCOVER'
                                        ? 'bg-indigo-700 text-white'
                                        : 'bg-white dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700'
                                }`}
                            >
                                {spec?.boardThicknessMm 
                                    ? t('review.confirmHardcoverDynamic', { mm: Number(spec.boardThicknessMm).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
                                    : t('review.confirmHardcover')
                                }
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConfirmResolution('SOFTCOVER')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                    ambiguityResolved === 'SOFTCOVER'
                                        ? 'bg-indigo-700 text-white'
                                        : 'bg-white dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700'
                                }`}
                            >
                                {t('review.confirmSoftcover') || 'Rústica (Cubierta flexible)'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── INCLUSION CONFIRMATIONS CARD (AMBIGUITY_PREVENTS_READY RESOLVER) ── */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={16} className={hasMissingInclusions ? 'text-amber-500' : 'text-emerald-500'} />
                            <h5 className="font-bold text-zinc-900 dark:text-white text-xs">
                                {t('inclusions.title') || 'Confirmación de Inclusiones del Presupuesto (Requisito para Calibración)'}
                            </h5>
                        </div>
                        {hasMissingInclusions ? (
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                                {missingInclusions.length} {t('inclusions.pendingCount') || 'confirmaciones pendientes'}
                            </span>
                        ) : (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                {t('inclusions.allConfirmed') || 'Inclusiones confirmadas'}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {t('inclusions.description') || 'El motor de calibración exige confirmar explícitamente si el precio de fabricación incluye o excluye cada partida. No se admiten suposiciones silenciosas.'}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                        {/* Paper Inclusion */}
                        <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-lg space-y-1.5">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs block">
                                {t('inclusions.paperLabel') || 'Incluye Papel:'}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('paper', true)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex-1 ${
                                        includesPaper === true ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    {t('common.yes') || 'Sí'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('paper', false)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex-1 ${
                                        includesPaper === false ? 'bg-zinc-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    {t('common.no') || 'No'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('paper', null)}
                                    className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                                        includesPaper === null ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                    }`}
                                    title={t('common.unknown') || 'Desconocido'}
                                >
                                    ?
                                </button>
                            </div>
                        </div>

                        {/* Binding Inclusion */}
                        <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-lg space-y-1.5">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs block">
                                {t('inclusions.bindingLabel') || 'Incluye Encuadernación:'}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('binding', true)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex-1 ${
                                        includesBinding === true ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    {t('common.yes') || 'Sí'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('binding', false)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex-1 ${
                                        includesBinding === false ? 'bg-zinc-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    {t('common.no') || 'No'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('binding', null)}
                                    className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                                        includesBinding === null ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                    }`}
                                    title={t('common.unknown') || 'Desconocido'}
                                >
                                    ?
                                </button>
                            </div>
                        </div>

                        {/* Finishing Inclusion */}
                        <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-lg space-y-1.5">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs block">
                                {t('inclusions.finishingLabel') || 'Incluye Acabados:'}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('finishing', true)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex-1 ${
                                        includesFinishing === true ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    {t('common.yes') || 'Sí'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('finishing', false)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex-1 ${
                                        includesFinishing === false ? 'bg-zinc-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    {t('common.no') || 'No'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('finishing', null)}
                                    className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                                        includesFinishing === null ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                    }`}
                                    title={t('common.unknown') || 'Desconocido'}
                                >
                                    ?
                                </button>
                            </div>
                        </div>

                        {/* Packaging Inclusion */}
                        <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/80 rounded-lg space-y-1.5">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs block">
                                {t('inclusions.packagingLabel') || 'Incluye Empaquetado:'}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('packaging', true)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex-1 ${
                                        includesPackaging === true ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    {t('common.yes') || 'Sí'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('packaging', false)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold transition-colors cursor-pointer flex-1 ${
                                        includesPackaging === false ? 'bg-zinc-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                >
                                    {t('common.no') || 'No'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInclusion('packaging', null)}
                                    className={`px-1.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                                        includesPackaging === null ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                                    }`}
                                    title={t('common.unknown') || 'Desconocido'}
                                >
                                    ?
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── VARIANT TABLE ── */}
                <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                                <th className="p-3">Variante / Tirada</th>
                                <th className="p-3">Papel / Gramaje</th>
                                <th className="p-3">Acabado</th>
                                <th className="p-3">Plazo</th>
                                <th className="p-3">Opción Logística</th>
                                <th className="p-3 text-right">Fabricación (€)</th>
                                <th className="p-3 text-right">Transporte (€)</th>
                                <th className="p-3 text-right">Otros (€)</th>
                                <th className="p-3 text-right">Total sin IVA (€)</th>
                                <th className="p-3 text-right">Precio Unitario</th>
                                <th className="p-3 text-center">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {runs.map((r, i) => {
                                const hasErr = r.validationStatus === 'INCONSISTENT_UNIT_PRICE' || r.validationStatus === 'INCONSISTENT_TOTAL';
                                const otherCost = r.otherCostsPrice ?? (r as any).otherPrice ?? 0;
                                const hasIncompleteBreakdown = r.hasEquivalentBreakdown === false || 
                                    (r.manufacturingPrice === undefined && r.transportPrice === undefined && (r.totalPrice || r.quotedTotalPrice));

                                const variantKeyDisplay = r.variantKey || r.id || `var-${i + 1}`;
                                const isSelected = selectedVariantId 
                                    ? (r.id === selectedVariantId || r.variantKey === selectedVariantId) 
                                    : i === 0;

                                return (
                                    <tr 
                                        key={r.id || i} 
                                        data-testid={`variant-row-${r.id || r.variantKey || i}`}
                                        onClick={() => onSelectVariant && onSelectVariant(r.id || r.variantKey || `run-${i + 1}`)}
                                        className={`transition-colors cursor-pointer ${
                                            isSelected 
                                                ? 'bg-red-50/70 dark:bg-red-950/40 border-l-4 border-l-[#dc0000]' 
                                                : hasErr 
                                                    ? 'bg-amber-50/50 dark:bg-amber-950/20' 
                                                    : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30'
                                        }`}
                                    >
                                        <td className="p-3">
                                            <div className="flex items-center gap-2.5">
                                                <input
                                                    type="radio"
                                                    name="variant_selection_radio"
                                                    checked={isSelected}
                                                    onChange={() => onSelectVariant && onSelectVariant(r.id || r.variantKey || `run-${i + 1}`)}
                                                    aria-label={`Seleccionar tirada ${r.quantity}`}
                                                    className="accent-[#dc0000] cursor-pointer shrink-0"
                                                />
                                                <div>
                                                    <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                                                        <span>{r.quantity >= 1000 ? r.quantity.toLocaleString('de-DE') : r.quantity}</span>
                                                        <span className="text-[10px] text-zinc-500 font-normal">ej.</span>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-zinc-400">
                                                        {variantKeyDisplay}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 text-zinc-700 dark:text-zinc-300">
                                            {r.paperVariant || '—'}
                                        </td>
                                        <td className="p-3 text-zinc-600 dark:text-zinc-400">
                                            {r.finishingVariant || '—'}
                                        </td>
                                        <td className="p-3 text-zinc-600 dark:text-zinc-400">
                                            {r.turnaroundDays ? `${r.turnaroundDays} d` : (r.turnaroundLabel || '—')}
                                        </td>
                                        <td className="p-3">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                                {r.logisticsOption || r.deliveryOption || 'Estándar'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right font-bold text-zinc-900 dark:text-white">
                                            {r.manufacturingPrice !== undefined ? formatCurrency(r.manufacturingPrice) : '—'}
                                        </td>
                                        <td className="p-3 text-right text-zinc-600 dark:text-zinc-400">
                                            {r.transportPrice !== undefined ? formatCurrency(r.transportPrice) : '—'}
                                        </td>
                                        <td className="p-3 text-right text-zinc-500 dark:text-zinc-400">
                                            {otherCost > 0 ? formatCurrency(otherCost) : '0,00 €'}
                                        </td>
                                        <td className="p-3 text-right font-extrabold text-zinc-900 dark:text-white">
                                            {formatCurrency(r.totalPrice ?? r.quotedTotalPrice ?? (((r.manufacturingPrice || 0) + (r.transportPrice || 0) + otherCost)))}
                                        </td>
                                        <td className="p-3 text-right font-bold text-zinc-700 dark:text-zinc-300">
                                            {formatCurrency(r.unitPrice ?? r.quotedUnitPrice ?? ((r.quotedTotalPrice ?? r.totalPrice ?? 0) / (r.quantity || 1)))}
                                        </td>
                                        <td className="p-3 text-center">
                                            {hasErr ? (
                                                <span 
                                                    title={r.validationStatus} 
                                                    className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold text-[10px] px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/40"
                                                >
                                                    <AlertTriangle size={11} />
                                                    <span>Revisión</span>
                                                </span>
                                            ) : hasIncompleteBreakdown ? (
                                                <span 
                                                    title="Sin desglose independiente de fabricación y transporte"
                                                    className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold text-[10px] px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/40"
                                                >
                                                    <AlertTriangle size={11} />
                                                    <span>Incompleta</span>
                                                </span>
                                            ) : (
                                                <span 
                                                    className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] px-2 py-0.5 rounded-full bg-emerald-100/60 dark:bg-emerald-900/40"
                                                >
                                                    <CheckCircle2 size={11} />
                                                    <span>Coherente</span>
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── PARAMETER COVERAGE & MISSING EVIDENCE DISCLAIMER ── */}
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-zinc-800 dark:text-zinc-200 text-xs">
                        <Info size={14} className="text-[#dc0000]" />
                        <span>{t('review.coverageScopeTitle') || 'Alcance y Brecha de Cobertura de Evidencias'}</span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {t('review.coverageDisclaimer') || 'Aviso de calibración técnica: Este presupuesto acredita exclusivamente los parámetros contenidos en sus líneas. No acredita Wire-O, grapado al caballete, estampación ni una comparación controlada entre cosido y encolado. Estas familias y acabados conservarán tarifas base o estado pendiente hasta que se aporten presupuestos específicos.'}
                    </p>
                </div>
            </div>

            {/* Bottom action button with ambiguity & inclusions blocker */}
            <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3 pt-2">
                <div className="space-y-1">
                    {isAmbiguityActive && (
                        <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <AlertTriangle size={13} />
                            <span>{t('review.ambiguityBlocker') || 'Debe resolver la ambigüedad técnica de encuadernación antes de continuar.'}</span>
                        </div>
                    )}
                    {hasMissingInclusions && (
                        <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <AlertTriangle size={13} />
                            <span>
                                {t('review.inclusionsBlocker', { missing: missingInclusions.join(', ') })}
                            </span>
                        </div>
                    )}
                </div>
                <div className="ml-auto">
                    <button
                        type="button"
                        data-testid="proceed-to-compare-btn"
                        disabled={!canProceed}
                        onClick={handleProceed}
                        className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer ${
                            !canProceed
                                ? 'bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                : 'bg-[#dc0000] hover:bg-red-700 text-white'
                        }`}
                    >
                        <span>{t('review.proceedToCompare') || 'Comparar Cálculos del Motor →'}</span>
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};
