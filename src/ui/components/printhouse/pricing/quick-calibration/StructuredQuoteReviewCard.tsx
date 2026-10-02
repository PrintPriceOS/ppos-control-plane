/**
 * src/ui/components/printhouse/pricing/quick-calibration/StructuredQuoteReviewCard.tsx
 *
 * Phase 194F — Structured Quote Evidence Review Card Component
 *
 * Displays:
 * 1. Document Metadata (filename, detected language, page count).
 * 2. Product Metadata (title, format, pages, binding, finishing).
 * 3. Materials Metadata (interior, cover, endpapers, colors).
 * 4. Offers & Pricing Points Table (manufacturing, transport, total, quoted unit price, computed unit price, validation status).
 * 5. Expandable Original / Translated / Normalized Views.
 * 6. Operator Correction UX (preserves sourceValue, calculatedValue, operatorCorrection).
 * 7. Action Buttons ([Review], [Edit], [Mark valid offers ready for calibration], [Ignore]).
 */
import React, { useState } from 'react';
import { 
    FileText, Globe, Layers, AlertTriangle, CheckCircle2, 
    ChevronDown, ChevronUp, Edit3, Check, X, ArrowRight, ShieldCheck 
} from 'lucide-react';
import { printhouseCalibrationApi, QuoteStatus } from '../../../../lib/printhouseCalibrationApi';
import { useLocale } from '../../../../i18n';

interface OfferPoint {
    quantity: number;
    manufacturingPrice: number;
    transportPrice: number;
    quotedTotalPrice: number;
    quotedUnitPrice: number;
    computedUnitPrice?: number;
    validationStatus: 'CONSISTENT' | 'INCONSISTENT_UNIT_PRICE' | 'INCONSISTENT_TOTAL' | string;
    variantName?: string;
    sourceText?: string;
}

interface StructuredQuoteReviewCardProps {
    evidenceId: string;
    filename: string;
    documentLanguage: string;
    pageCount?: number;
    printhouseName?: string;
    format?: string;
    binding?: string;
    finishing?: string;
    offers: OfferPoint[];
    normalizedTerms?: Array<{ original: string; translated: string; normalized: string }>;
    rawExtractedText?: string;
    translatedText?: string;
    validationStatus?: string;
    isValidCommercialQuote?: boolean;
    quoteStatus?: QuoteStatus;
    uncalibratedRates?: string[];
    onReadyForCalibration?: (evidenceId: string) => void;
    onIgnoreDocument?: (evidenceId: string) => void;
    onSelectVariant?: (offer: any, variantId: string) => void;
}

export const StructuredQuoteReviewCard: React.FC<StructuredQuoteReviewCardProps> = ({
    evidenceId,
    filename,
    documentLanguage,
    pageCount = 1,
    printhouseName = 'Quotation Document',
    format = 'Custom Format',
    binding,
    finishing = 'Standard Finish',
    offers = [],
    normalizedTerms = [],
    rawExtractedText,
    translatedText,
    validationStatus = 'CONSISTENT',
    isValidCommercialQuote = true,
    quoteStatus = 'VALID_COMMERCIAL_QUOTE',
    uncalibratedRates = [],
    onReadyForCalibration,
    onIgnoreDocument,
    onSelectVariant
}) => {
    const defaultBinding = binding || 'Not Specified';
    const { t } = useLocale();
    const [showDetails, setShowDetails] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [correctedTitle, setCorrectedTitle] = useState(printhouseName);
    const [correctedBinding, setCorrectedBinding] = useState(binding);
    const [savingCorrections, setSavingCorrections] = useState(false);
    const [correctionsSaved, setCorrectionsSaved] = useState(false);
    const [statusState, setStatusState] = useState<'REVIEW_REQUIRED' | 'READY_FOR_CALIBRATION_REVIEW' | 'IGNORED'>('REVIEW_REQUIRED');

    const handleSaveCorrections = async () => {
        setSavingCorrections(true);
        try {
            await printhouseCalibrationApi.saveOperatorCorrections(evidenceId, {
                title: { sourceValue: printhouseName, operatorCorrectedValue: correctedTitle },
                binding: { sourceValue: binding, operatorCorrectedValue: correctedBinding }
            });
            setCorrectionsSaved(true);
            setIsEditing(false);
            setTimeout(() => setCorrectionsSaved(false), 3000);
        } catch (err) {
            console.error('Failed to save operator corrections:', err);
        } finally {
            setSavingCorrections(false);
        }
    };

    const handleMarkReady = () => {
        setStatusState('READY_FOR_CALIBRATION_REVIEW');
        onReadyForCalibration?.(evidenceId);
    };

    const handleIgnore = () => {
        setStatusState('IGNORED');
        onIgnoreDocument?.(evidenceId);
    };

    if (statusState === 'IGNORED') {
        return (
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-xs text-zinc-500 italic flex items-center justify-between">
                <span>Document {filename} ignored.</span>
            </div>
        );
    }

    const hasInconsistency = offers.some(o => o.validationStatus !== 'CONSISTENT') || validationStatus !== 'CONSISTENT';

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm space-y-0 text-xs">
            {/* Header / Document Metadata */}
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FileText size={16} className="text-[#dc0000]" />
                    <div>
                        <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <span>{filename}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                {documentLanguage.toUpperCase()}
                            </span>
                        </div>
                        <span className="text-[11px] text-zinc-500">{pageCount} page{pageCount !== 1 ? 's' : ''} extracted</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {statusState === 'READY_FOR_CALIBRATION_REVIEW' ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            <span>Ready for Calibration Review</span>
                        </span>
                    ) : hasInconsistency ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            <span>Inconsistency Detected</span>
                        </span>
                    ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            <span>Consistent</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Content Body */}
            <div className="p-4 space-y-4">
                {!isValidCommercialQuote && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs space-y-1 text-amber-900 dark:text-amber-200">
                        <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                            <span>{t('partialCalculationTitle')}</span>
                        </div>
                        <p className="m-0 text-[11px] text-amber-800 dark:text-amber-300">
                            {t('reviewCardIncompleteRatesNotice')}
                        </p>
                        {uncalibratedRates.length > 0 && (
                            <ul className="list-disc list-inside text-[11px] font-mono text-amber-900 dark:text-amber-200 font-semibold space-y-0.5 mt-1">
                                {uncalibratedRates.map((r, i) => (
                                    <li key={i}>{r}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
                {/* Product & Specification */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-zinc-50/80 dark:bg-zinc-800/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Product Title</span>
                        {isEditing ? (
                            <input
                                type="text"
                                value={correctedTitle}
                                onChange={e => setCorrectedTitle(e.target.value)}
                                className="w-full mt-1 text-xs px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded"
                            />
                        ) : (
                            <p className="font-semibold text-zinc-900 dark:text-white m-0">{correctedTitle}</p>
                        )}
                    </div>

                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Format & Binding</span>
                        {isEditing ? (
                            <input
                                type="text"
                                value={correctedBinding}
                                onChange={e => setCorrectedBinding(e.target.value)}
                                className="w-full mt-1 text-xs px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded"
                            />
                        ) : (
                            <p className="font-semibold text-zinc-900 dark:text-white m-0">{format} • {correctedBinding}</p>
                        )}
                    </div>
                </div>

                {/* Offers Table */}
                <div className="space-y-2">
                    {(() => {
                        const isAllSameQuantity = offers.length > 1 && offers.every(o => Number(o.quantity) === Number(offers[0].quantity));
                        return (
                            <>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                                    {isAllSameQuantity
                                        ? `Extracted Commercial Offer Variants for ${offers[0]?.quantity} copies (${offers.length} variants)`
                                        : `Extracted Commercial Quantities & Prices (${offers.length})`}
                                </span>

                                <div className="space-y-2">
                                    {offers.map((off, idx) => {
                                        const isOk = off.validationStatus === 'CONSISTENT';
                                        const computedUnit = off.computedUnitPrice || (off.quotedTotalPrice / off.quantity);
                                        const quotedUnit = off.quotedUnitPrice;

                                        return (
                                            <div
                                                key={idx}
                                                className={`p-3 rounded-xl border transition-colors ${
                                                    isOk
                                                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                                                        : 'bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-800/80'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between font-bold mb-1.5">
                                                    <span className="text-zinc-900 dark:text-white text-xs">
                                                        {isAllSameQuantity ? `Opción ${idx + 1}: €${off.manufacturingPrice} (Fabricación)` : `${off.quantity} unidades`} {off.variantName ? `(${off.variantName})` : ''}
                                                    </span>
                                                    <span className={isOk ? 'text-emerald-700 dark:text-emerald-300 font-semibold text-xs' : 'text-red-700 dark:text-red-400 font-bold text-xs'}>
                                                        {isOk ? '✓ Correct' : '⚠ Inconsistency Detected'}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                                                    <div>
                                                        <span>Precio Ofertado Fabricación:</span> <strong className="text-zinc-900 dark:text-white">€{off.manufacturingPrice}</strong>
                                                    </div>
                                                    <div>
                                                        <span>Transporte Separado:</span> <strong className="text-zinc-900 dark:text-white">€{off.transportPrice || 0}</strong>
                                                    </div>
                                                    <div>
                                                        <span>Total Ofertado Proveedor:</span> <strong className="text-zinc-900 dark:text-white">€{off.quotedTotalPrice}</strong>
                                                    </div>
                                                    <div>
                                                        <span>Unitario Ofertado:</span>{' '}
                                                        <strong className={isOk ? 'text-zinc-900 dark:text-white' : 'text-red-600 font-bold'}>
                                                            €{Number(quotedUnit).toFixed(2)}
                                                        </strong>
                                                    </div>
                                                </div>

                                                {onSelectVariant && (
                                                    <div className="mt-2 flex items-center justify-between pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                                                        <span className="text-[10px] text-zinc-500 italic">Precio ofertado por el proveedor • Coste interno se calcula tras calibración</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => onSelectVariant(off, `variant-${idx}`)}
                                                            className="px-2.5 py-1 bg-[#dc0000] hover:bg-[#b00000] text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                                                        >
                                                            {t('selectThisVariant') ? `${t('selectThisVariant')} (€${off.manufacturingPrice})` : `Seleccionar variante (€${off.manufacturingPrice})`}
                                                        </button>
                                                    </div>
                                                )}

                                                {!isOk && (
                                                    <p className="text-[11px] text-red-700 dark:text-red-300 font-medium m-0 mt-1.5">
                                                        Indicated unit price (€{Number(quotedUnit).toFixed(2)}) differs from calculated total divided by quantity (€{Number(computedUnit).toFixed(2)}).
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        );
                    })()}
                </div>

                {/* Expandable Original / Translated / Normalized Toggle */}
                <div className="pt-1">
                    <button
                        type="button"
                        onClick={() => setShowDetails(!showDetails)}
                        className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1"
                    >
                        <span>{showDetails ? 'Hide details' : 'Show original text & normalized canonical terms'}</span>
                        {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {showDetails && (
                        <div className="mt-3 p-3 bg-zinc-900 text-zinc-200 rounded-xl space-y-3 text-[11px] font-mono">
                            <div>
                                <span className="text-zinc-400 uppercase font-bold text-[10px] block mb-1">Normalized Terms:</span>
                                <div className="space-y-1">
                                    {normalizedTerms.length > 0 ? (
                                        normalizedTerms.map((t, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <span className="text-amber-400">"{t.original}"</span>
                                                <ArrowRight size={10} className="text-zinc-500" />
                                                <span className="text-emerald-400">{t.normalized}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <span className="text-zinc-500">None detected</span>
                                    )}
                                </div>
                            </div>

                            {rawExtractedText && (
                                <div>
                                    <span className="text-zinc-400 uppercase font-bold text-[10px] block mb-1">Raw Extracted Text:</span>
                                    <p className="m-0 text-zinc-300 max-h-32 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                        {rawExtractedText.slice(0, 500)}...
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Action Controls */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        {isEditing ? (
                            <button
                                type="button"
                                onClick={handleSaveCorrections}
                                disabled={savingCorrections}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5"
                            >
                                <Check size={12} />
                                <span>{savingCorrections ? 'Saving...' : 'Save Corrections'}</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-lg flex items-center gap-1.5"
                            >
                                <Edit3 size={12} />
                                <span>Edit Interpretation</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleIgnore}
                            className="px-3 py-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-semibold"
                        >
                            Ignore Document
                        </button>
                    </div>

                    {statusState !== 'READY_FOR_CALIBRATION_REVIEW' && (
                        <button
                            type="button"
                            onClick={handleMarkReady}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5"
                        >
                            <ShieldCheck size={14} />
                            <span>Mark Valid Offers Ready for Calibration</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
