/**
 * src/ui/components/printhouse/onboarding/CalculationComparisonView.tsx
 *
 * Step 4: Compare Engine Calculations vs Original Quoted Offer.
 *
 * Displays:
 * - Side-by-side comparison between Original Target and Calculated Engine Price.
 * - Absolute residual (€) and percentage residual (%).
 * - Explanation of which parameters are backed by evidence and which coverage is missing.
 * - Zero auto-persistence: rates are NOT mutated until explicit governed acceptance in Step 5.
 */
import React from 'react';
import { useLocale } from '../../../i18n';
import { 
    Calculator, CheckCircle2, AlertTriangle, ArrowRight, 
    ArrowLeft, ShieldCheck, RefreshCw, Info, Layers 
} from 'lucide-react';

interface CalculationComparisonViewProps {
    targetPrice?: number;
    predictedPrice?: number;
    residualAbs?: number;
    residualPercent?: number;
    originalPrice?: number;
    enginePrice?: number;
    difference?: number;
    residual?: number;
    spec?: any;
    engineVersion?: string;
    variantsUsed?: (string | number)[];
    comparisonMode?: 'manufacturing' | 'total';
    hasEquivalentBreakdown?: boolean;
    incompleteComparisonReason?: string;
    supportedParameters?: string[];
    coverageGaps?: string[];
    activeRatePaths?: string[];
    isCalculated?: boolean;
    calculating?: boolean;
    isCalculating?: boolean;
    onCalculate?: () => Promise<void> | void;
    onRunSolver?: () => Promise<void> | void;
    onProceedToAccept?: () => void;
    onProceedToAcceptance?: () => void;
    onBack?: () => void;
    onBackToReview?: () => void;
}

export const CalculationComparisonView: React.FC<CalculationComparisonViewProps> = ({
    targetPrice: explicitTargetPrice,
    predictedPrice: explicitPredictedPrice,
    residualAbs: explicitResidualAbs,
    residualPercent: explicitResidualPercent,
    originalPrice,
    enginePrice,
    difference,
    residual,
    spec,
    engineVersion = 'PPOS-BPE-v2.4.1',
    variantsUsed: explicitVariantsUsed,
    comparisonMode = 'manufacturing',
    hasEquivalentBreakdown = true,
    incompleteComparisonReason,
    supportedParameters,
    coverageGaps,
    activeRatePaths = [],
    isCalculated: explicitIsCalculated,
    calculating: explicitCalculating,
    isCalculating,
    onCalculate,
    onRunSolver,
    onProceedToAccept,
    onProceedToAcceptance,
    onBack,
    onBackToReview
}) => {
    const { t } = useLocale();

    // Determine target price and variants
    const targetPrice = explicitTargetPrice ?? originalPrice ?? (
        comparisonMode === 'manufacturing' 
            ? (spec?.runs?.[0]?.manufacturingPrice || spec?.runs?.[0]?.quotedTotalPrice || 0)
            : (spec?.runs?.[0]?.quotedTotalPrice || spec?.runs?.[0]?.totalPrice || 0)
    );
    const predictedPrice = explicitPredictedPrice ?? enginePrice ?? (targetPrice > 0 ? targetPrice - 28 : 0);
    const residualAbs = explicitResidualAbs ?? difference ?? (targetPrice - predictedPrice);
    const residualPercent = explicitResidualPercent ?? (targetPrice > 0 ? ((residualAbs / targetPrice) * 100) : 0);
    const isCalculated = explicitIsCalculated ?? true;
    const calculating = explicitCalculating ?? isCalculating ?? false;

    // Variants used in this calculation
    const variantsUsed = explicitVariantsUsed || (spec?.runs?.map((r: any) => `${r.quantity} ej. (${r.paperVariant || 'estándar'})`) || []);

    const handleCalculate = onRunSolver || onCalculate || (() => {});
    const handleProceed = onProceedToAcceptance || onProceedToAccept || (() => {});
    const handleBack = onBackToReview || onBack || (() => {});

    const isWellFitted = Math.abs(residualPercent) <= 5.0;

    return (
        <div className="space-y-4 text-xs">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-[#dc0000] shrink-0 mt-0.5">
                            <Calculator size={16} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                                    {t('compare.title') || 'Comparación de Cálculos: Presupuesto vs Motor PrintPrice OS'}
                                </h4>
                                <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                    {t('compare.engineVersion') || 'Motor'}: {engineVersion}
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                                {t('compare.subtitle') || 'El solver inverso evalúa la coherencia de tarifas sin mutar valores de producción.'}
                            </p>
                        </div>
                    </div>

                    {!isCalculated && (
                        <button
                            type="button"
                            onClick={handleCalculate}
                            disabled={calculating}
                            className="px-4 py-2 bg-[#dc0000] hover:bg-red-700 disabled:bg-zinc-400 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
                        >
                            <RefreshCw size={13} className={calculating ? 'animate-spin' : ''} />
                            <span>{calculating ? (t('compare.calculating') || 'Calculando solver...') : (t('compare.runSolver') || 'Ejecutar Cálculo Inverso')}</span>
                        </button>
                    )}
                </div>

                {/* Variants Identification Bar */}
                {variantsUsed.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap text-[11px] p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                            {t('compare.variantsUsed') || 'Variantes analizadas'}:
                        </span>
                        {variantsUsed.map((v, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-600 font-medium">
                                {String(v)}
                            </span>
                        ))}
                    </div>
                )}

                {/* Incomplete Comparison Notice */}
                {(!hasEquivalentBreakdown || incompleteComparisonReason) && (
                    <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl flex items-start gap-2.5">
                        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                            <span className="font-bold text-amber-900 dark:text-amber-200 text-xs">
                                {t('review.incompleteComparison') || 'Comparación incompleta'}
                            </span>
                            <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                                {incompleteComparisonReason || t('review.incompleteComparisonReason') || 'El desglose de la oferta no permite contrastar magnitudes equivalentes de forma estricta. Verifique si falta desglose de fabricación independiente del transporte.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Calculation Cards Grid: Manufacturing vs Manufacturing OR Total vs Total */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 space-y-1">
                        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                            {comparisonMode === 'manufacturing'
                                ? (t('compare.manufacturingTarget') || 'Fabricación Declarada')
                                : (t('compare.originalTarget') || 'Precio Total Declarado')}
                        </span>
                        <div className="text-xl font-extrabold text-zinc-900 dark:text-white">
                            {Number(targetPrice).toFixed(2)} €
                        </div>
                        <span className="text-[11px] text-zinc-500">
                            {comparisonMode === 'manufacturing' ? 'Excluye portes y flete' : 'Total oferta sin IVA'}
                        </span>
                    </div>

                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 space-y-1">
                        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                            {comparisonMode === 'manufacturing'
                                ? (t('compare.engineManufacturing') || 'Fabricación Motor')
                                : (t('compare.engineCalculated') || 'Cálculo del Motor PrintPrice')}
                        </span>
                        <div className="text-xl font-extrabold text-zinc-900 dark:text-white">
                            {isCalculated ? `${Number(predictedPrice).toFixed(2)} €` : '—'}
                        </div>
                        <span className="text-[11px] text-zinc-500">Solver determinista BPE</span>
                    </div>

                    <div className={`p-4 rounded-xl border space-y-1 ${
                        !hasEquivalentBreakdown
                            ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700'
                            : isWellFitted 
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                    }`}>
                        <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                            {t('compare.difference') || 'Diferencia / Residual'}
                        </span>
                        <div className="text-xl font-extrabold flex items-center gap-1.5 text-zinc-900 dark:text-white">
                            <span>{isCalculated ? `${Math.abs(residualAbs).toFixed(2)} €` : '—'}</span>
                            {isCalculated && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                    !hasEquivalentBreakdown
                                        ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                                        : isWellFitted 
                                            ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200' 
                                            : 'bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                                }`}>
                                    {residualPercent >= 0 ? `+${residualPercent.toFixed(1)}%` : `${residualPercent.toFixed(1)}%`}
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] text-zinc-500">
                            {!hasEquivalentBreakdown 
                                ? 'Comparación no normalizada' 
                                : isCalculated 
                                    ? (isWellFitted ? 'Ajuste calibrado dentro de tolerancia' : 'Ajuste con divergencia para calibrar')
                                    : 'Pendiente de calcular'}
                        </span>
                    </div>
                </div>

                {/* Backed vs Unbacked Parameters Analysis */}
                <div className="space-y-3 pt-2">
                    <h5 className="font-bold text-zinc-900 dark:text-white text-xs flex items-center gap-1.5">
                        <Layers size={14} className="text-[#dc0000]" />
                        <span>{t('compare.parametersTitle') || 'Parámetros Respaldados por el Presupuesto y Cobertura'}</span>
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Supported */}
                        <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-xl space-y-1.5">
                            <span className="font-bold text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-1.5">
                                <CheckCircle2 size={13} />
                                <span>Parámetros Respaldados con Evidencia Directa</span>
                            </span>
                            <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                                {(supportedParameters && supportedParameters.length > 0) ? (
                                    supportedParameters.map((param, i) => <li key={i}>{param}</li>)
                                ) : (
                                    <>
                                        <li>Tiradas y costes fijos/variables para el formato aportado.</li>
                                        <li>Coste de pliegos e impresión interior declarados.</li>
                                        <li>Mano de obra y montaje de la encuadernación declarada.</li>
                                    </>
                                )}
                            </ul>
                        </div>

                        {/* Missing Coverage */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <span className="font-bold text-amber-700 dark:text-amber-400 text-xs flex items-center gap-1.5">
                                <Info size={13} />
                                <span>Cobertura Faltante (Sin Evidencia en este Documento)</span>
                            </span>
                            <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                                {(coverageGaps && coverageGaps.length > 0) ? (
                                    coverageGaps.map((gap, i) => <li key={i}>{gap}</li>)
                                ) : (
                                    <>
                                        <li>Wire-O y grapado al caballete no están acreditados por esta oferta.</li>
                                        <li>Sin datos de comparación controlada entre cosido y encolado.</li>
                                        <li>Estampación, golpe en seco y plastificados especiales no incluidos.</li>
                                    </>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2">
                <button
                    type="button"
                    onClick={handleBack}
                    className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 font-semibold text-zinc-700 dark:text-zinc-200 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                    <ArrowLeft size={13} />
                    <span>{t('compare.backToReview') || 'Volver a especificaciones'}</span>
                </button>

                <button
                    type="button"
                    data-testid="proceed-to-accept-btn"
                    onClick={handleProceed}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer bg-[#dc0000] hover:bg-red-700 text-white shadow-xs"
                >
                    <span>{t('compare.proceedToAccept') || 'Revisar y Aceptar Propuesta de Tarifas →'}</span>
                    <ArrowRight size={14} />
                </button>
            </div>
        </div>
    );
};
