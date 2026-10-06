/**
 * src/ui/components/printhouse/pricing/quick-calibration/GovernedQuoteSmokeTest.tsx
 *
 * Phase 193H — Capability-Aware Governed Quote Smoke Test Component.
 *
 * Calls the canonical backend preview endpoint (POST /pricing/quote-preview)
 * and displays the exact selling price calculated on the backend.
 *
 * Security & Governance Invariants:
 * - ZERO client-side arithmetic or margin math.
 * - ZERO persistent mutations (no orders, no jobs created).
 * - Only displays combinations supported by the printer node.
 */
import React, { useState, useEffect, useRef } from 'react';
import { printhouseCalibrationApi, QuotePreviewResponse } from '../../../../lib/printhouseCalibrationApi';
import { getCountryName } from '../../../../lib/countryCatalog';
import { useLocale } from '../../../../i18n';
import { 
    Calculator, CheckCircle2, AlertTriangle, Info, ChevronDown, 
    ChevronUp, RefreshCw, ShieldCheck, Layers, Package, Truck, Sparkles 
} from 'lucide-react';

interface GovernedQuoteSmokeTestProps {
    printerNodeId?: string;
    printerNodeName?: string;
    initialSpec?: any;
}

export const GovernedQuoteSmokeTest: React.FC<GovernedQuoteSmokeTestProps> = ({
    printerNodeId,
    printerNodeName = 'Production Node',
    initialSpec
}) => {
    const { t } = useLocale();
    const normalizeBinding = (b?: string) => {
        if (!b) return 'perfect bound';
        const s = String(b).toLowerCase().trim();
        if (s === 'hardcover' || s === 'hard_cover' || s === 'case' || s === 'casebound' || s === 'hardback') return 'hardcover';
        if (s === 'thread sewn' || s === 'sewn' || s === 'thread-sewn') return 'thread sewn';
        if (s === 'perfect bound' || s === 'perfect' || s === 'pb') return 'perfect bound';
        if (s === 'saddle stitch' || s === 'saddle' || s === 'st') return 'saddle stitch';
        if (s === 'wire-o' || s === 'wire_o' || s === 'wireo') return 'wire-o';
        if (s === 'spiral') return 'spiral';
        return s;
    };

    const getInitialValue = (key: string, fallback: any) => {
        if (initialSpec && initialSpec[key] !== undefined && initialSpec[key] !== null && initialSpec[key] !== '') {
            return initialSpec[key];
        }
        return fallback;
    };

    // Active async calculation request sequence ID to prevent out-of-order race conditions
    const activeRequestIdRef = useRef(0);

    // Form Inputs (Pre-filled from reference book calibration if provided)
    const [spec, setSpec] = useState({
        copies: getInitialValue('copies', 1000),
        book_width_mm: getInitialValue('book_width_mm', 170),
        book_height_mm: getInitialValue('book_height_mm', 240),
        interior_pages: getInitialValue('interior_pages', 128),
        interior_print: getInitialValue('interior_print', '4/4'),
        paper_type_interior: getInitialValue('paper_type_interior', 'offset'),
        paper_weight_interior: getInitialValue('paper_weight_interior', 80),
        cover_print: getInitialValue('cover_print', '4/0'),
        paper_type_cover: getInitialValue('paper_type_cover', 'mc'),
        paper_weight_cover: getInitialValue('paper_weight_cover', 300),
        lamination: getInitialValue('lamination', 'matt'),
        binding_method: normalizeBinding(getInitialValue('binding_method', 'perfect bound')),
        delivery_country: getInitialValue('delivery_country', '')
    });

    const [userHasEdited, setUserHasEdited] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [quoteResult, setQuoteResult] = useState<QuotePreviewResponse | null>(null);
    const [showTrace, setShowTrace] = useState(false);

    // Helper to update spec field & invalidate previous quote result immediately
    const updateSpecField = (field: string, value: any) => {
        activeRequestIdRef.current++; // Supersede in-flight requests
        setUserHasEdited(true);
        setQuoteResult(null);
        setError(null);
        setLoading(false);
        setSpec(prev => ({ ...prev, [field]: value }));
    };

    // List of active configured destinations for this printhouse node
    const [availableDestinations, setAvailableDestinations] = useState<Array<{ code: string; name: string; regionName?: string }>>([
        { code: 'ES', name: 'Spain', regionName: 'Domestic' },
        { code: 'DE', name: 'Germany', regionName: 'European Union' },
        { code: 'FR', name: 'France', regionName: 'European Union' },
        { code: 'IT', name: 'Italy', regionName: 'European Union' },
        { code: 'PT', name: 'Portugal', regionName: 'European Union' },
        { code: 'GB', name: 'United Kingdom', regionName: 'Europe (Non-EU)' },
        { code: 'TR', name: 'Turkey', regionName: 'Eurasia' }
    ]);

    // Reset quote result and cancel in-flight requests if printerNodeId changes
    useEffect(() => {
        activeRequestIdRef.current++;
        setQuoteResult(null);
        setError(null);
        setLoading(false);
    }, [printerNodeId]);

    // Track previous initialSpec reference to detect effective specification changes versus identical re-renders
    const prevInitialSpecRef = useRef<any>(null);

    const hasEffectiveSpecChange = (prevSpec: any, nextSpec: any) => {
        if (!prevSpec && !nextSpec) return false;
        if (!prevSpec || !nextSpec) return true;
        for (const key of Object.keys(nextSpec)) {
            if (nextSpec[key] !== undefined && nextSpec[key] !== null && nextSpec[key] !== '') {
                if (prevSpec[key] !== nextSpec[key]) {
                    return true;
                }
            }
        }
        return false;
    };

    // Update spec if initialSpec changes (only on effective changes or initial mount, preserving manual edits on identical re-renders)
    useEffect(() => {
        if (!initialSpec || Object.keys(initialSpec).length === 0) {
            return;
        }

        const isFirstMount = prevInitialSpecRef.current === null;
        const isEffectiveChange = !isFirstMount && hasEffectiveSpecChange(prevInitialSpecRef.current, initialSpec);

        prevInitialSpecRef.current = initialSpec;

        if (isEffectiveChange) {
            // Effective specification change from parent: invalidate pending requests, reset result/error/loading and userHasEdited
            activeRequestIdRef.current++;
            setQuoteResult(null);
            setError(null);
            setLoading(false);
            setUserHasEdited(false);

            setSpec(prev => {
                const normalized = { ...prev };
                for (const key of Object.keys(initialSpec)) {
                    if (initialSpec[key] !== undefined && initialSpec[key] !== null && initialSpec[key] !== '') {
                        if (key === 'binding_method') {
                            normalized.binding_method = normalizeBinding(initialSpec.binding_method);
                        } else {
                            (normalized as any)[key] = initialSpec[key];
                        }
                    }
                }
                return normalized;
            });
        } else if (isFirstMount) {
            setSpec(prev => {
                const normalized = { ...prev };
                for (const key of Object.keys(initialSpec)) {
                    if (initialSpec[key] !== undefined && initialSpec[key] !== null && initialSpec[key] !== '') {
                        if (key === 'binding_method') {
                            normalized.binding_method = normalizeBinding(initialSpec.binding_method);
                        } else {
                            (normalized as any)[key] = initialSpec[key];
                        }
                    }
                }
                return normalized;
            });
        }
    }, [initialSpec]);

    const handleCalculate = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const currentReqId = ++activeRequestIdRef.current;
        setLoading(true);
        setError(null);
        setQuoteResult(null);

        try {
            const result = await printhouseCalibrationApi.previewQuote(spec, printerNodeId);
            if (currentReqId === activeRequestIdRef.current) {
                setQuoteResult(result);
            }
        } catch (err: any) {
            if (currentReqId === activeRequestIdRef.current) {
                setError(err.message || 'Failed to calculate quote preview.');
            }
        } finally {
            if (currentReqId === activeRequestIdRef.current) {
                setLoading(false);
            }
        }
    };

    const hasComplexSpec = Boolean(
        initialSpec?.has_mixed_interior || 
        initialSpec?.mixed_interior_details || 
        initialSpec?.has_spot_uv || 
        initialSpec?.has_endpapers || 
        (initialSpec?.unsupported_features && initialSpec.unsupported_features.length > 0)
    );

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
                        <Calculator size={18} />
                    </div>
                    <div>
                        <h4 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            {t('pricing.smoke.title') || 'Test Your Pricing'}
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                                {t('pricing.smoke.engineBadge') || 'Canonical Engine'}
                            </span>
                        </h4>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            {t('pricing.smoke.subtitle') || 'Simulate real job quotations using current active rates for'} <span className="font-semibold text-zinc-700 dark:text-zinc-300">{printerNodeName}</span>.
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => handleCalculate()}
                    disabled={loading}
                    className="px-4 py-2.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {loading ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
                    <span>{loading ? (t('pricing.smoke.calculating') || 'Calculating...') : (t('pricing.smoke.calculateBtn') || 'Calculate Test Quote')}</span>
                </button>
            </div>

            {hasComplexSpec && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-bold">{t('pricing.smoke.complexNoticeTitle') || 'Complex Specification Limitation Notice'}</p>
                        <p className="mt-0.5 leading-relaxed">
                            {t('pricing.smoke.complexNoticeDesc') || `Original reference quotation contains complex features (e.g. Mixed Interior 1+1/4+4, Hardcover Board, Spot UV, or Endpapers). The canonical BPE test pricing preview evaluates standard single-interior configurations (${spec.interior_print}, ${spec.binding_method}). Original extracted specifications are preserved without artificial rate padding.`}
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-bold">{t('pricing.smoke.ratesNoticeTitle') || 'Production Rates Notice'}</p>
                        <p className="mt-0.5">
                            {typeof error === 'string' && (error.includes('MANUFACTURING_RATES_NOT_CONFIGURED') || error.includes('RATES_NOT_CONFIGURED'))
                                ? (t('pricing.smoke.ratesNotConfigured') || 'Active production rates have not yet been accepted and published to this printer node. Complete and accept a calibration run above to activate rates.')
                                : typeof error === 'string' ? error : (error as any)?.message || JSON.stringify(error)}
                        </p>
                    </div>
                </div>
            )}

            {/* Configurator Grid */}
            <form onSubmit={handleCalculate} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
                {/* Quantity */}
                <div>
                    <label htmlFor="input-copies" className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        {t('pricing.smoke.field.quantity') || 'Quantity (Copies)'}
                    </label>
                    <input
                        id="input-copies"
                        type="number"
                        min="1"
                        step="1"
                        value={spec.copies || ''}
                        onChange={e => updateSpecField('copies', parseInt(e.target.value, 10) || 0)}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                    />
                </div>

                {/* Dimensions */}
                <div>
                    <label htmlFor="input-book-width" className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        {t('pricing.smoke.field.trimSize') || 'Trim Size (W × H mm)'}
                    </label>
                    <div className="flex items-center gap-1.5">
                        <input
                            id="input-book-width"
                            type="number"
                            min="50"
                            max="500"
                            value={spec.book_width_mm || ''}
                            onChange={e => updateSpecField('book_width_mm', parseInt(e.target.value, 10) || 0)}
                            className="w-full px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium text-center focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            placeholder="W"
                        />
                        <span className="text-zinc-400">×</span>
                        <input
                            id="input-book-height"
                            aria-label="Book Height mm"
                            type="number"
                            min="50"
                            max="700"
                            value={spec.book_height_mm || ''}
                            onChange={e => updateSpecField('book_height_mm', parseInt(e.target.value, 10) || 0)}
                            className="w-full px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium text-center focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            placeholder="H"
                        />
                    </div>
                </div>

                {/* Pages */}
                <div>
                    <label htmlFor="input-interior-pages" className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        {t('pricing.smoke.field.interiorPages') || 'Interior Pages'}
                    </label>
                    <input
                        id="input-interior-pages"
                        type="number"
                        min="4"
                        step="2"
                        value={spec.interior_pages || ''}
                        onChange={e => updateSpecField('interior_pages', parseInt(e.target.value, 10) || 0)}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                    />
                </div>

                {/* Interior Print Mode */}
                <div>
                    <label htmlFor="select-interior-print" className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        {t('pricing.smoke.field.interiorPrint') || 'Interior Print'}
                    </label>
                    <select
                        id="select-interior-print"
                        value={spec.interior_print || '4/4'}
                        onChange={e => updateSpecField('interior_print', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                    >
                        <option value="4/4">{t('pricing.smoke.print.4_4') || '4/4 Full Colour'}</option>
                        <option value="1/1">{t('pricing.smoke.print.1_1') || '1/1 Black & White'}</option>
                        <option value="2/2">{t('pricing.smoke.print.2_2') || '2/2 Two Colours'}</option>
                    </select>
                </div>

                {/* Interior Paper */}
                <div>
                    <label htmlFor="select-paper-type" className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        {t('pricing.smoke.field.interiorPaper') || 'Interior Paper'}
                    </label>
                    <div className="flex items-center gap-1.5">
                        <select
                            id="select-paper-type"
                            value={spec.paper_type_interior || 'offset'}
                            onChange={e => updateSpecField('paper_type_interior', e.target.value)}
                            className="w-2/3 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                        >
                            <option value="offset">{t('pricing.smoke.paper.offset') || 'Offset'}</option>
                            <option value="mc">{t('pricing.smoke.paper.mc') || 'Coated MC'}</option>
                            <option value="munken">{t('pricing.smoke.paper.munken') || 'Munken'}</option>
                        </select>
                        <input
                            id="input-paper-weight"
                            aria-label="Interior Paper Weight"
                            type="number"
                            min="50"
                            max="300"
                            value={spec.paper_weight_interior || ''}
                            onChange={e => updateSpecField('paper_weight_interior', parseInt(e.target.value, 10) || 0)}
                            className="w-1/3 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium text-center focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            placeholder="gsm"
                        />
                    </div>
                </div>

                {/* Cover Spec */}
                <div>
                    <label htmlFor="select-cover-print" className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        {t('pricing.smoke.field.cover') || 'Cover (Print / GSM)'}
                    </label>
                    <div className="flex items-center gap-1.5">
                        <select
                            id="select-cover-print"
                            value={spec.cover_print || '4/0'}
                            onChange={e => updateSpecField('cover_print', e.target.value)}
                            className="w-1/2 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                        >
                            <option value="4/0">{t('pricing.smoke.coverPrint.4_0') || '4/0 Front'}</option>
                            <option value="4/4">{t('pricing.smoke.coverPrint.4_4') || '4/4 Both'}</option>
                            <option value="1/0">{t('pricing.smoke.coverPrint.1_0') || '1/0 B&W'}</option>
                        </select>
                        <input
                            id="input-cover-weight"
                            aria-label="Cover Paper Weight"
                            type="number"
                            min="150"
                            max="450"
                            value={spec.paper_weight_cover || ''}
                            onChange={e => updateSpecField('paper_weight_cover', parseInt(e.target.value, 10) || 0)}
                            className="w-1/2 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium text-center focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            placeholder="gsm"
                        />
                    </div>
                </div>

                {/* Binding & Lamination */}
                <div>
                    <label htmlFor="select-binding-method" className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        {t('pricing.smoke.field.binding') || 'Binding / Finish'}
                    </label>
                    <div className="flex items-center gap-1.5">
                        <select
                            id="select-binding-method"
                            value={spec.binding_method || 'perfect bound'}
                            onChange={e => updateSpecField('binding_method', e.target.value)}
                            className="w-1/2 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                        >
                            <option value="hardcover">{t('pricing.smoke.binding.hardcover') || 'Hardcover'}</option>
                            <option value="thread sewn">{t('pricing.smoke.binding.threadSewn') || 'Thread Sewn'}</option>
                            <option value="perfect bound">{t('pricing.smoke.binding.perfectBound') || 'Perfect Bound'}</option>
                            <option value="saddle stitch">{t('pricing.smoke.binding.saddleStitch') || 'Saddle Stitch'}</option>
                            <option value="wire-o">{t('pricing.smoke.binding.wireO') || 'Wire-O'}</option>
                            <option value="spiral">{t('pricing.smoke.binding.spiral') || 'Spiral'}</option>
                        </select>
                        <select
                            id="select-lamination"
                            aria-label="Lamination"
                            value={spec.lamination || 'matt'}
                            onChange={e => updateSpecField('lamination', e.target.value)}
                            className="w-1/2 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                        >
                            <option value="matt">{t('pricing.smoke.lamination.matt') || 'Matt'}</option>
                            <option value="gloss">{t('pricing.smoke.lamination.gloss') || 'Gloss'}</option>
                            <option value="">{t('pricing.smoke.lamination.none') || 'None'}</option>
                        </select>
                    </div>
                </div>

                {/* Destination Region & Country */}
                <div>
                    <label htmlFor="select-delivery-country" className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        {t('pricing.smoke.field.destination') || 'Destination'} ({availableDestinations.length})
                    </label>
                    <select
                        id="select-delivery-country"
                        value={spec.delivery_country || ''}
                        onChange={e => updateSpecField('delivery_country', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                    >
                        {!availableDestinations.some(d => d.code === spec.delivery_country) && spec.delivery_country && (
                            <option value={spec.delivery_country}>
                                {getCountryName(spec.delivery_country, 'en')} ({spec.delivery_country}) — {t('pricing.smoke.refDestination') || 'Reference Job Destination'}
                            </option>
                        )}
                        {availableDestinations.map(d => (
                            <option key={d.code} value={d.code}>
                                {d.name} ({d.code}) {d.regionName ? `— ${d.regionName}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </form>

            {/* Results Presentation */}
            {quoteResult && (
                <div className="mt-6 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/80 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
                    {/* Incomplete Rate Warning Banner */}
                    {(quoteResult.isValidCommercialQuote === false || quoteResult.quoteStatus === 'INVALID_INCOMPLETE_RATES') && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded-xl text-xs space-y-1.5 text-amber-900 dark:text-amber-200">
                            <div className="flex items-center gap-2 font-bold text-sm">
                                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                                <span>{t('partialCalculationTitle')}</span>
                            </div>
                            <p className="m-0 text-xs text-amber-800 dark:text-amber-300">
                                {t('governedQuoteIncompleteRatesNotice')}
                            </p>
                            {Array.isArray(quoteResult.uncalibratedRates) && quoteResult.uncalibratedRates.length > 0 && (
                                <ul className="list-disc list-inside text-xs font-mono text-amber-950 dark:text-amber-100 font-bold space-y-0.5 mt-1">
                                    {quoteResult.uncalibratedRates.map((r: string, i: number) => (
                                        <li key={i}>{r}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-700/60 pb-5">
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">
                                {quoteResult.isValidCommercialQuote !== false && quoteResult.quoteStatus !== 'INVALID_INCOMPLETE_RATES' ? t('realQuotationOutcome') : t('diagnosticOutcome')}
                            </span>
                            <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white mt-0.5">
                                {quoteResult.isValidCommercialQuote !== false && quoteResult.quoteStatus !== 'INVALID_INCOMPLETE_RATES' ? t('customerPriceBeforeTax') : t('partialDiagnosticSubtotalTitle')}
                            </h3>
                            <p className="text-xs text-zinc-500 mt-1">
                                {(t('pricing.smoke.forCopies') || 'For {copies} copies ({width}×{height}mm, {pages} pages)')
                                    .replace('{copies}', quoteResult.quantity.toLocaleString())
                                    .replace('{width}', String(spec.book_width_mm))
                                    .replace('{height}', String(spec.book_height_mm))
                                    .replace('{pages}', String(spec.interior_pages))} • {t('pricing.smoke.taxCalculatedAtCheckout') || 'Tax calculated at checkout'}
                            </p>
                        </div>

                        <div className="sm:text-right bg-white dark:bg-zinc-800 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-700 shadow-2xs">
                            <div className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                                € {quoteResult.totals.finalSellingPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {quoteResult.isValidCommercialQuote !== false && quoteResult.quoteStatus !== 'INVALID_INCOMPLETE_RATES' ? (
                                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    {t('perCopyNet', { price: quoteResult.unitPrice.toFixed(2) })}
                                </div>
                            ) : (
                                <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                                    {t('partialDiagnosticSubtotalBadge')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Breakdown Matrix */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {quoteResult.breakdown.map((item: any, idx: number) => (
                            <div key={idx} className="p-3 bg-white dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl flex items-center justify-between">
                                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{item.label}</span>
                                <span className="text-xs font-bold text-zinc-900 dark:text-white">€ {item.amount.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Production & Delivery Estimates */}
                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-800/60 p-3.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                        <div className="flex items-center gap-2">
                            <Layers size={15} className="text-zinc-500" />
                            <span>{t('pricing.smoke.estimatedProduction') || 'Estimated Production:'} <strong className="text-zinc-800 dark:text-zinc-200">{quoteResult.productionLeadDays} {t('pricing.smoke.businessDays') || 'business days'}</strong></span>
                        </div>
                        <div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />
                        <div className="flex items-center gap-2">
                            <Truck size={15} className="text-zinc-500" />
                            <span>{t('pricing.smoke.estimatedTransit') || 'Estimated Transit:'} <strong className="text-zinc-800 dark:text-zinc-200">{quoteResult.estimatedDeliveryDays} {t('pricing.smoke.days') || 'days'} ({quoteResult.shippingStatus})</strong></span>
                        </div>
                    </div>

                    {/* Warnings List */}
                    {quoteResult.warnings && quoteResult.warnings.length > 0 && (
                        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                            {quoteResult.warnings.map((w: string, idx: number) => (
                                <div key={idx} className="font-semibold flex items-center gap-1.5">
                                    <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                                    <span>{w}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Trace Drawer Toggle */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowTrace(!showTrace)}
                            className="text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 transition-colors"
                        >
                            {showTrace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <span>{t('pricing.smoke.howCalculated') || 'How was this price calculated?'}</span>
                        </button>

                        {showTrace && (
                            <div className="mt-3 p-4 bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700 rounded-xl space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                                <p className="font-bold text-zinc-900 dark:text-white mb-2">{t('pricing.smoke.traceTitle') || 'Canonical Configuration Trace:'}</p>
                                <ul className="space-y-1.5">
                                    {quoteResult.configurationTrace.map((line: string, i: number) => (
                                        <li key={i} className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
