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
import React, { useState, useEffect } from 'react';
import { printhouseCalibrationApi } from '../../../../lib/printhouseCalibrationApi';
import { getCountryName } from '../../../../lib/countryCatalog';
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
    // Form Inputs (Pre-filled from reference book calibration if provided)
    const [spec, setSpec] = useState({
        copies: initialSpec?.copies || 1000,
        book_width_mm: initialSpec?.book_width_mm || 170,
        book_height_mm: initialSpec?.book_height_mm || 240,
        interior_pages: initialSpec?.interior_pages || 128,
        interior_print: initialSpec?.interior_print || '4/4',
        paper_type_interior: initialSpec?.paper_type_interior || 'offset',
        paper_weight_interior: initialSpec?.paper_weight_interior || 80,
        cover_print: initialSpec?.cover_print || '4/0',
        paper_type_cover: initialSpec?.paper_type_cover || 'mc',
        paper_weight_cover: initialSpec?.paper_weight_cover || 300,
        lamination: initialSpec?.lamination || 'matt',
        binding_method: initialSpec?.binding_method || 'perfect bound',
        delivery_country: initialSpec?.delivery_country || 'ES'
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [quoteResult, setQuoteResult] = useState<any | null>(null);
    const [showTrace, setShowTrace] = useState(false);

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

    // Update spec if initialSpec changes (e.g. upon calibration acceptance)
    useEffect(() => {
        if (initialSpec && Object.keys(initialSpec).length > 0) {
            setSpec(prev => ({ ...prev, ...initialSpec }));
        }
    }, [initialSpec]);

    const handleCalculate = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setLoading(true);
        setError(null);
        setQuoteResult(null);

        try {
            const result = await printhouseCalibrationApi.previewQuote(spec, printerNodeId);
            setQuoteResult(result);
        } catch (err: any) {
            setError(err.message || 'Failed to calculate quote preview.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-2xs">
                        <Calculator size={18} />
                    </div>
                    <div>
                        <h4 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            Test Your Pricing
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                                Canonical Engine
                            </span>
                        </h4>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            Simulate real job quotations using current active rates for <span className="font-semibold text-zinc-700 dark:text-zinc-300">{printerNodeName}</span>.
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
                    <span>Calculate Test Quote</span>
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-start gap-3">
                    <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-bold">Quote Calculation Error</p>
                        <p className="mt-0.5">{error}</p>
                    </div>
                </div>
            )}

            {/* Configurator Grid */}
            <form onSubmit={handleCalculate} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
                {/* Quantity */}
                <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        Quantity (Copies)
                    </label>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value={spec.copies || ''}
                        onChange={e => setSpec(prev => ({ ...prev, copies: parseInt(e.target.value, 10) || 0 }))}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                    />
                </div>

                {/* Dimensions */}
                <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        Trim Size (W × H mm)
                    </label>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="number"
                            min="50"
                            max="500"
                            value={spec.book_width_mm || ''}
                            onChange={e => setSpec(prev => ({ ...prev, book_width_mm: parseInt(e.target.value, 10) || 0 }))}
                            className="w-full px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium text-center focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            placeholder="W"
                        />
                        <span className="text-zinc-400">×</span>
                        <input
                            type="number"
                            min="50"
                            max="700"
                            value={spec.book_height_mm || ''}
                            onChange={e => setSpec(prev => ({ ...prev, book_height_mm: parseInt(e.target.value, 10) || 0 }))}
                            className="w-full px-2.5 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium text-center focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            placeholder="H"
                        />
                    </div>
                </div>

                {/* Pages */}
                <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        Interior Pages
                    </label>
                    <input
                        type="number"
                        min="4"
                        step="2"
                        value={spec.interior_pages || ''}
                        onChange={e => setSpec(prev => ({ ...prev, interior_pages: parseInt(e.target.value, 10) || 0 }))}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                    />
                </div>

                {/* Interior Print Mode */}
                <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        Interior Print
                    </label>
                    <select
                        value={spec.interior_print || '4/4'}
                        onChange={e => setSpec(prev => ({ ...prev, interior_print: e.target.value }))}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                    >
                        <option value="4/4">4/4 Full Colour</option>
                        <option value="1/1">1/1 Black & White</option>
                        <option value="2/2">2/2 Two Colours</option>
                    </select>
                </div>

                {/* Interior Paper */}
                <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        Interior Paper
                    </label>
                    <div className="flex items-center gap-1.5">
                        <select
                            value={spec.paper_type_interior || 'offset'}
                            onChange={e => setSpec(prev => ({ ...prev, paper_type_interior: e.target.value }))}
                            className="w-2/3 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                        >
                            <option value="offset">Offset</option>
                            <option value="mc">Coated MC</option>
                            <option value="munken">Munken</option>
                        </select>
                        <input
                            type="number"
                            min="50"
                            max="300"
                            value={spec.paper_weight_interior || ''}
                            onChange={e => setSpec(prev => ({ ...prev, paper_weight_interior: parseInt(e.target.value, 10) || 0 }))}
                            className="w-1/3 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium text-center focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            placeholder="gsm"
                        />
                    </div>
                </div>

                {/* Cover Spec */}
                <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        Cover (Print / GSM)
                    </label>
                    <div className="flex items-center gap-1.5">
                        <select
                            value={spec.cover_print || '4/0'}
                            onChange={e => setSpec(prev => ({ ...prev, cover_print: e.target.value }))}
                            className="w-1/2 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                        >
                            <option value="4/0">4/0 Front</option>
                            <option value="4/4">4/4 Both</option>
                            <option value="1/0">1/0 B&W</option>
                        </select>
                        <input
                            type="number"
                            min="150"
                            max="450"
                            value={spec.paper_weight_cover || ''}
                            onChange={e => setSpec(prev => ({ ...prev, paper_weight_cover: parseInt(e.target.value, 10) || 0 }))}
                            className="w-1/2 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium text-center focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            placeholder="gsm"
                        />
                    </div>
                </div>

                {/* Binding & Lamination */}
                <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        Binding / Finish
                    </label>
                    <div className="flex items-center gap-1.5">
                        <select
                            value={spec.binding_method || 'perfect bound'}
                            onChange={e => setSpec(prev => ({ ...prev, binding_method: e.target.value }))}
                            className="w-1/2 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                        >
                            <option value="perfect bound">Perfect Bound</option>
                            <option value="saddle stitch">Saddle Stitch</option>
                            <option value="thread sewn">Thread Sewn</option>
                        </select>
                        <select
                            value={spec.lamination || 'matt'}
                            onChange={e => setSpec(prev => ({ ...prev, lamination: e.target.value }))}
                            className="w-1/2 px-2 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                        >
                            <option value="matt">Matt</option>
                            <option value="gloss">Gloss</option>
                            <option value="">None</option>
                        </select>
                    </div>
                </div>

                {/* Destination Region & Country */}
                <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                        Destination ({availableDestinations.length} configured)
                    </label>
                    <select
                        value={spec.delivery_country || (availableDestinations[0]?.code || 'ES')}
                        onChange={e => setSpec(prev => ({ ...prev, delivery_country: e.target.value }))}
                        className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                    >
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-700/60 pb-5">
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">
                                Real Quotation Outcome
                            </span>
                            <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white mt-0.5">
                                Customer Price (Before Tax)
                            </h3>
                            <p className="text-xs text-zinc-500 mt-1">
                                For {quoteResult.quantity.toLocaleString()} copies ({spec.book_width_mm}×{spec.book_height_mm}mm, {spec.interior_pages} pages) • Tax calculated at checkout
                            </p>
                        </div>

                        <div className="sm:text-right bg-white dark:bg-zinc-800 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-700 shadow-2xs">
                            <div className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                                € {quoteResult.totals.finalSellingPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                € {quoteResult.unitPrice.toFixed(2)} / copy (Net)
                            </div>
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
                            <span>Estimated Production: <strong className="text-zinc-800 dark:text-zinc-200">{quoteResult.productionLeadDays} business days</strong></span>
                        </div>
                        <div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />
                        <div className="flex items-center gap-2">
                            <Truck size={15} className="text-zinc-500" />
                            <span>Estimated Transit: <strong className="text-zinc-800 dark:text-zinc-200">{quoteResult.estimatedDeliveryDays} days ({quoteResult.shippingStatus})</strong></span>
                        </div>
                    </div>

                    {/* Trace Drawer Toggle */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowTrace(!showTrace)}
                            className="text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1.5 transition-colors"
                        >
                            {showTrace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <span>How was this price calculated?</span>
                        </button>

                        {showTrace && (
                            <div className="mt-3 p-4 bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700 rounded-xl space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                                <p className="font-bold text-zinc-900 dark:text-white mb-2">Canonical Configuration Trace:</p>
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
