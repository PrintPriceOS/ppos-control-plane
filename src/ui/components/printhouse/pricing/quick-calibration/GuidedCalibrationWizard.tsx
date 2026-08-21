/**
 * src/ui/components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard.tsx
 *
 * Phase 193H — Guided Pricing Calibration 5-Step Stepper Wizard.
 *
 * Step 1: Tell us about a real job (Natural language AI input).
 * Step 2: We understood this (Human-readable plain review card).
 * Step 3: What did this job cost you? (Manufacturing cost € & inclusions checklist).
 * Step 4: Calibrate (Deterministic solver execution & governed acceptance).
 * Step 5: Test your pricing (Capability-aware Governed Quote Smoke Test).
 */
import React, { useState } from 'react';
import { 
    Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Calculator, 
    ShieldCheck, Edit3, ChevronDown, ChevronUp, AlertCircle, RefreshCw 
} from 'lucide-react';
import { CalibrationConversation } from './CalibrationConversation';
import { GovernedQuoteSmokeTest } from './GovernedQuoteSmokeTest';
import { CountrySelect } from '../../../common/CountrySelect';
import { getCountryDisplayName, isValidIso2Country } from '../../../../lib/countryCatalog';

interface GuidedCalibrationWizardProps {
    printerNodeId?: string;
    printerNodeName?: string;
    draftSpec: any;
    setDraftSpec: React.Dispatch<React.SetStateAction<any>>;
    draftCommercials: any;
    setDraftCommercials: React.Dispatch<React.SetStateAction<any>>;
    messages: any[];
    onSendMessage: (text: string) => Promise<void>;
    sendingChat: boolean;
    activeProposal: any;
    aiUnavailable: boolean;
    onApplyProposal: (proposal: any) => Promise<void>;
    onApplyClarifications?: (answers: Record<string, string>) => void;
    session: any;
    activeRun: any;
    isReady: boolean;
    isCalculated: boolean;
    isAccepted: boolean;
    canAccept?: boolean;
    isRunAcceptanceEligible?: boolean;
    onMarkReady: () => Promise<void>;
    onCalculate: () => Promise<void>;
    onAccept: () => void;
    calculating: boolean;
    error: string | null;
}

export const GuidedCalibrationWizard: React.FC<GuidedCalibrationWizardProps> = ({
    printerNodeId,
    printerNodeName,
    draftSpec,
    setDraftSpec,
    draftCommercials,
    setDraftCommercials,
    messages,
    onSendMessage,
    sendingChat,
    activeProposal,
    aiUnavailable,
    onApplyProposal,
    onApplyClarifications,
    session,
    activeRun,
    isReady,
    isCalculated,
    isAccepted,
    canAccept = false,
    isRunAcceptanceEligible = false,
    onMarkReady,
    onCalculate,
    onAccept,
    calculating,
    error
}) => {
    // Current Wizard Step: 1 -> 2 -> 3 -> 4 -> 5
    const [step, setStep] = useState<number>(() => {
        if (isAccepted) return 5;
        if (isCalculated) return 4;
        if (isReady) return 4;
        if (draftSpec.copies && draftCommercials.targetManufacturingPrice) return 3;
        if (draftSpec.copies) return 2;
        return 1;
    });

    // ── Phase 193H.6 Canonical Step Completion Predicates ──
    const [reviewConfirmed, setReviewConfirmed] = useState<boolean>(false);
    const [lastConfirmedSpecSnapshot, setLastConfirmedSpecSnapshot] = useState<string>('');

    // Invalidate review confirmation if physical spec changes after confirmation
    const currentSpecSnapshot = JSON.stringify(draftSpec);
    const isReviewValid = reviewConfirmed && (lastConfirmedSpecSnapshot === currentSpecSnapshot);

    const isStep1Complete = Boolean(
        draftSpec.copies && draftSpec.copies > 0 &&
        draftSpec.book_width_mm && draftSpec.book_width_mm > 0 &&
        draftSpec.book_height_mm && draftSpec.book_height_mm > 0 &&
        draftSpec.interior_pages && draftSpec.interior_pages > 0 &&
        draftSpec.interior_print &&
        draftSpec.paper_type_interior &&
        draftSpec.paper_weight_interior && draftSpec.paper_weight_interior > 0 &&
        draftSpec.cover_print &&
        draftSpec.paper_type_cover &&
        draftSpec.paper_weight_cover && draftSpec.paper_weight_cover > 0 &&
        draftSpec.binding_method &&
        draftSpec.delivery_country &&
        isValidIso2Country(draftSpec.delivery_country)
    );

    const isStep2Complete = Boolean(
        isStep1Complete && isReviewValid
    );

    const isStep3Complete = Boolean(
        isStep1Complete &&
        isStep2Complete &&
        draftCommercials.targetManufacturingPrice &&
        Number(draftCommercials.targetManufacturingPrice) > 0 &&
        draftCommercials.includesPaper !== null && draftCommercials.includesPaper !== undefined &&
        draftCommercials.includesBinding !== null && draftCommercials.includesBinding !== undefined &&
        draftCommercials.includesFinishing !== null && draftCommercials.includesFinishing !== undefined &&
        draftCommercials.includesPackaging !== null && draftCommercials.includesPackaging !== undefined
    );

    const isStep4Complete = Boolean(
        isStep1Complete &&
        isStep2Complete &&
        isStep3Complete &&
        (isAccepted || isCalculated)
    );

    const isStep5Complete = Boolean(
        isStep1Complete &&
        isStep2Complete &&
        isStep3Complete &&
        isStep4Complete &&
        isAccepted
    );

    // Predicate map for 1..5
    const isStepComplete = (stepNum: number): boolean => {
        switch (stepNum) {
            case 1: return isStep1Complete;
            case 2: return isStep2Complete;
            case 3: return isStep3Complete;
            case 4: return isStep4Complete;
            case 5: return isStep5Complete;
            default: return false;
        }
    };

    // Forward dependency chain: Step N+1 is navigable only if all predecessors 1..N are complete
    const canNavigateToStep = (targetStep: number): boolean => {
        if (targetStep === 1) return true;
        if (targetStep <= step) return true; // Backward navigation to already reached step allowed
        if (targetStep === 2) return Boolean(draftSpec.copies) || isStep1Complete;
        if (targetStep === 3) return isStep1Complete && isStep2Complete;
        if (targetStep === 4) return isStep1Complete && isStep2Complete && isStep3Complete;
        if (targetStep === 5) return isStep1Complete && isStep2Complete && isStep3Complete && isStep4Complete;
        return false;
    };

    return (
        <div className="space-y-6">
            {/* Stepper Indicator (Phase 193H.6 Visited vs Completed Gate) */}
            <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                <div className="flex items-center justify-between max-w-2xl mx-auto text-xs font-semibold">
                    {[
                        { num: 1, label: 'Describe Job' },
                        { num: 2, label: 'Review' },
                        { num: 3, label: 'Manufacturing Cost' },
                        { num: 4, label: 'Calibrate' },
                        { num: 5, label: 'Test Pricing' }
                    ].map((s, idx) => {
                        const isCurrent = step === s.num;
                        const isCompleted = isStepComplete(s.num);
                        const isNavigable = canNavigateToStep(s.num);

                        return (
                            <React.Fragment key={s.num}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isNavigable) setStep(s.num);
                                    }}
                                    disabled={!isNavigable}
                                    className={`flex items-center gap-2 transition-colors ${
                                        isCurrent
                                            ? 'text-[#dc0000] font-bold'
                                            : isCompleted
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : isNavigable
                                            ? 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                            : 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed opacity-60'
                                    }`}
                                >
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                                        isCurrent
                                            ? 'bg-[#dc0000] text-white shadow-2xs'
                                            : isCompleted
                                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                            : isNavigable
                                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600'
                                    }`}>
                                        {isCompleted ? '✓' : isCurrent ? '●' : s.num}
                                    </span>
                                    <span className="hidden sm:inline">{s.label}</span>
                                </button>
                                {idx < 4 && (
                                    <div className={`flex-1 h-0.5 mx-2 ${
                                        isCompleted ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'
                                    }`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* STEP 1: Tell us about a real job */}
            {step === 1 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">Step 1 of 5</span>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-1">
                            Tell us about a real job you have already produced
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                            Describe the job in plain language or paste a previous job ticket. The assistant will extract the specifications for your review.
                        </p>
                    </div>

                    <CalibrationConversation
                        messages={messages}
                        onSendMessage={onSendMessage}
                        sending={sendingChat}
                        activeProposal={activeProposal}
                        onApplyProposal={async (proposal) => {
                            await onApplyProposal(proposal);
                            setStep(2);
                        }}
                        onApplyClarifications={onApplyClarifications}
                        aiUnavailable={aiUnavailable}
                    />

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            disabled={!draftSpec.copies}
                            className="px-5 py-2.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white dark:text-zinc-900 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm disabled:cursor-not-allowed"
                        >
                            <span>Continue to Review</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: We understood this (Editable Structured Review) */}
            {step === 2 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">Step 2 of 5</span>
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
                                Review & Edit Specification
                            </h3>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                PrintPriceOS extracted these specifications. You can adjust any field directly below without calling the assistant again.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                        {/* Quantity */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                Quantity (Copies) *
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={draftSpec.copies || ''}
                                onChange={e => {
                                    const val = parseInt(e.target.value, 10);
                                    setDraftSpec((p: any) => ({ ...p, copies: isNaN(val) ? undefined : val }));
                                }}
                                placeholder="e.g. 500"
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            />
                        </div>

                        {/* Trim Dimensions */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                Trim Dimensions (W × H mm) *
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="50"
                                    max="500"
                                    value={draftSpec.book_width_mm || ''}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        setDraftSpec((p: any) => ({ ...p, book_width_mm: isNaN(val) ? undefined : val }));
                                    }}
                                    placeholder="Width"
                                    className="w-1/2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                />
                                <span className="text-zinc-400 font-bold">×</span>
                                <input
                                    type="number"
                                    min="50"
                                    max="700"
                                    value={draftSpec.book_height_mm || ''}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        setDraftSpec((p: any) => ({ ...p, book_height_mm: isNaN(val) ? undefined : val }));
                                    }}
                                    placeholder="Height"
                                    className="w-1/2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                />
                            </div>
                        </div>

                        {/* Interior Pages & Print */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                Interior Pages & Print *
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="1"
                                    value={draftSpec.interior_pages || ''}
                                    onChange={e => {
                                        const val = parseInt(e.target.value, 10);
                                        setDraftSpec((p: any) => ({ ...p, interior_pages: isNaN(val) ? undefined : val }));
                                    }}
                                    placeholder="Pages"
                                    className="w-1/2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                />
                                <select
                                    value={draftSpec.interior_print || '4/4'}
                                    onChange={e => setDraftSpec((p: any) => ({ ...p, interior_print: e.target.value }))}
                                    className="w-1/2 px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                >
                                    <option value="4/4">4/4 Full Colour</option>
                                    <option value="1/1">1/1 Black</option>
                                    <option value="2/2">2/2 Two Colour</option>
                                </select>
                            </div>
                        </div>

                        {/* Interior Paper */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                Interior Paper *
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="40"
                                    max="400"
                                    value={draftSpec.paper_weight_interior || ''}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        setDraftSpec((p: any) => ({ ...p, paper_weight_interior: isNaN(val) ? undefined : val }));
                                    }}
                                    placeholder="Weight (gsm)"
                                    className="w-1/2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                />
                                <select
                                    value={draftSpec.paper_type_interior || ''}
                                    onChange={e => setDraftSpec((p: any) => ({ ...p, paper_type_interior: e.target.value || undefined }))}
                                    className="w-1/2 px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                >
                                    <option value="">Select Paper</option>
                                    <option value="offset">Offset</option>
                                    <option value="mc">Coated (MC)</option>
                                    <option value="lux">Lux Paper</option>
                                    <option value="munken">Munken</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>

                        {/* Cover Specification */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                Cover Weight & Paper *
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="100"
                                    max="600"
                                    value={draftSpec.paper_weight_cover || ''}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        setDraftSpec((p: any) => ({ ...p, paper_weight_cover: isNaN(val) ? undefined : val }));
                                    }}
                                    placeholder="Weight (gsm)"
                                    className="w-1/2 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                />
                                <select
                                    value={draftSpec.paper_type_cover || ''}
                                    onChange={e => setDraftSpec((p: any) => ({ ...p, paper_type_cover: e.target.value || undefined }))}
                                    className="w-1/2 px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                >
                                    <option value="">Select Cover Paper</option>
                                    <option value="mc">Coated (MC)</option>
                                    <option value="artboard">Artboard</option>
                                    <option value="offset">Offset</option>
                                    <option value="wfmc">WFMC</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>

                        {/* Cover Print & Lamination */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                Cover Print & Finishing
                            </label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={draftSpec.cover_print || ''}
                                    onChange={e => setDraftSpec((p: any) => ({ ...p, cover_print: e.target.value || undefined }))}
                                    className="w-1/2 px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                >
                                    <option value="">Select Cover Print *</option>
                                    <option value="4/0">4/0 Front Only</option>
                                    <option value="4/4">4/4 Both Sides</option>
                                    <option value="1/0">1/0 Front Black</option>
                                    <option value="1/1">1/1 Black Both</option>
                                </select>
                                <select
                                    value={draftSpec.lamination || ''}
                                    onChange={e => setDraftSpec((p: any) => ({ ...p, lamination: e.target.value || null }))}
                                    className="w-1/2 px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                >
                                    <option value="">No Lamination</option>
                                    <option value="matt">Matt Lam</option>
                                    <option value="gloss">Gloss Lam</option>
                                    <option value="varnish">Varnish</option>
                                </select>
                            </div>
                        </div>

                        {/* Binding Method */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                Binding Method *
                            </label>
                            <select
                                value={draftSpec.binding_method || 'perfect bound'}
                                onChange={e => setDraftSpec((p: any) => ({ ...p, binding_method: e.target.value }))}
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            >
                                <option value="perfect bound">Perfect Bound (Paperback)</option>
                                <option value="saddle stitch">Saddle Stitch (Booklet)</option>
                                <option value="thread sewn">Thread Sewn</option>
                                <option value="hardcover">Hardcover (Case Bound)</option>
                                <option value="wire-o">Wire-O</option>
                                <option value="spiral">Spiral</option>
                            </select>
                        </div>

                        {/* Destination Country */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                Destination Region / Country
                            </label>
                            <CountrySelect
                                value={draftSpec.delivery_country || ''}
                                onChange={(code) => setDraftSpec((p: any) => ({ ...p, delivery_country: code || undefined }))}
                                placeholder="Select destination (e.g. Poland, Japan)..."
                            />
                        </div>
                    </div>

                    {!isStep1Complete && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                            <span className="font-semibold">Fill in the required fields marked with (*) above to continue.</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 text-xs font-semibold flex items-center gap-1.5"
                        >
                            <ArrowLeft size={14} />
                            <span>Redo AI Description</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (isStep1Complete) {
                                    setReviewConfirmed(true);
                                    setLastConfirmedSpecSnapshot(JSON.stringify(draftSpec));
                                    setStep(3);
                                }
                            }}
                            disabled={!isStep1Complete}
                            className="px-5 py-2.5 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm disabled:cursor-not-allowed"
                        >
                            <span>Confirm Specification & Continue</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: What did this job cost you? */}
            {step === 3 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">Step 3 of 5</span>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-1">
                            What did this job cost you to manufacture?
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                            Provide your known internal production cost and verify which components were covered.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Manufacturing Cost Input */}
                        <div className="p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1.5">
                                    Known Manufacturing Cost (€)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-2.5 text-zinc-400 font-bold">€</span>
                                    <input
                                        type="number"
                                        min="1"
                                        step="0.01"
                                        placeholder="2450.00"
                                        value={draftCommercials.targetManufacturingPrice || ''}
                                        onChange={e => setDraftCommercials((prev: any) => ({
                                            ...prev,
                                            targetManufacturingPrice: parseFloat(e.target.value) || 0
                                        }))}
                                        className="w-full pl-8 pr-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-base font-bold text-zinc-900 dark:text-white focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                    />
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-1.5">
                                    Total net internal cost to produce the {draftSpec.copies?.toLocaleString() || 1000} copies.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1.5">
                                    Transport Cost Reference (€ / kg) — Optional
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-2.5 text-zinc-400 font-bold">€</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0.95"
                                        value={draftCommercials.transportPricePerKg || ''}
                                        onChange={e => setDraftCommercials((prev: any) => ({
                                            ...prev,
                                            transportPricePerKg: parseFloat(e.target.value) || null
                                        }))}
                                        className="w-full pl-8 pr-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-900 dark:text-white focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                    />
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-1">
                                    External reference only. Transport is not mixed into manufacturing rates.
                                </p>
                            </div>
                        </div>

                        {/* Inclusions Checklist */}
                        <div className="p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-3">
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                                What was included in this € amount?
                            </span>

                            {[
                                { key: 'includesPaper', label: 'Paper Stock / Substrates' },
                                { key: 'includesBinding', label: 'Binding & Stitching Operations' },
                                { key: 'includesFinishing', label: 'Lamination / Surface Finishing' },
                                { key: 'includesPackaging', label: 'Boxes & Pallet Packaging' }
                            ].map(item => (
                                <label key={item.key} className="flex items-center gap-3 p-2.5 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(draftCommercials[item.key])}
                                        onChange={e => setDraftCommercials((prev: any) => ({
                                            ...prev,
                                            [item.key]: e.target.checked
                                        }))}
                                        className="w-4 h-4 text-[#dc0000] rounded focus:ring-[#dc0000]"
                                    />
                                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{item.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 text-xs font-semibold flex items-center gap-1.5"
                        >
                            <ArrowLeft size={14} />
                            <span>Back</span>
                        </button>

                        <button
                            type="button"
                            onClick={async () => {
                                await onApplyProposal({ specPatch: draftSpec, declaredCommercials: draftCommercials });
                                setStep(4);
                            }}
                            disabled={!isStep3Complete}
                            className="px-6 py-2.5 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                        >
                            <span>Use this job to calibrate my pricing</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 4: Calibrate Pricing */}
            {step === 4 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">Step 4 of 5</span>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-1">
                            Calibrate & Apply Starting Pricing
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                            Align your base printing, paper, and binding rates to match this reference job.
                        </p>
                    </div>

                    <div className="p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                    {isAccepted 
                                        ? 'Pricing Calibrated & Active'
                                        : activeRun?.status === 'ACCEPTABLE_CANDIDATE'
                                        ? 'Calibration Candidate Within Governed Tolerance'
                                        : isCalculated && isRunAcceptanceEligible
                                        ? 'Calibration Calculated — Awaiting Acceptance' 
                                        : isCalculated && (!activeRun || !isRunAcceptanceEligible)
                                        ? 'Calibration State Inconsistent'
                                        : (activeRun && !isRunAcceptanceEligible)
                                        ? 'Calibration Did Not Converge'
                                        : 'Ready to Run Calibration'}
                                </span>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                    Target Price: <strong className="text-zinc-800 dark:text-zinc-200">€ {draftCommercials.targetManufacturingPrice}</strong> for {draftSpec.copies?.toLocaleString()} copies.
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                {isReady && !isCalculated && !isAccepted && (
                                    <button
                                        type="button"
                                        onClick={onCalculate}
                                        disabled={calculating}
                                        className="px-5 py-2.5 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <Calculator size={15} />
                                        <span>{calculating ? 'Running Calibration...' : (activeRun && !isRunAcceptanceEligible) ? 'Re-run Pricing Calibration' : 'Run Pricing Calibration'}</span>
                                    </button>
                                )}

                                {canAccept && !isAccepted && (
                                    <button
                                        type="button"
                                        onClick={onAccept}
                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <ShieldCheck size={16} />
                                        <span>Accept Pricing Revision</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Candidate Diagnostics / Informational Note */}
                        {activeRun?.status === 'ACCEPTABLE_CANDIDATE' && isCalculated && !isAccepted && (
                            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-900 dark:text-blue-200 font-medium">
                                The optimizer did not reach its strict numerical convergence threshold, but the best deterministic candidate is within the governed publishing tolerance and can be reviewed for acceptance.
                            </div>
                        )}

                        {/* Diagnostics & Outcome Message */}
                        {activeRun && !isRunAcceptanceEligible && (
                            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium">
                                Calibration could not produce an acceptance-eligible solution within governed tolerances. You can adjust the reference job specifications or inspect rates.
                            </div>
                        )}

                        {activeRun && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-700/60 text-xs">
                                <div>
                                    <span className="text-zinc-500 text-[11px]">Target Price</span>
                                    <div className="font-bold text-zinc-900 dark:text-white">
                                        € {Number(activeRun.targetPrice ?? activeRun.target_price ?? draftCommercials.targetManufacturingPrice ?? 0).toFixed(2)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">Predicted Cost</span>
                                    <div className={`font-bold ${!isRunAcceptanceEligible ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                        € {Number(activeRun.enginePriceAfter ?? activeRun.predicted_manufacturing_price ?? 0).toFixed(2)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">Residual</span>
                                    <div className="font-bold text-zinc-900 dark:text-white">
                                        € {Number(activeRun.absoluteResidual ?? activeRun.absolute_residual ?? 0).toFixed(2)} ({Number(activeRun.percentResidual ?? activeRun.percent_residual ?? 0).toFixed(2)}%)
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">Status</span>
                                    <div className={`font-bold ${!isRunAcceptanceEligible ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                        {activeRun.status ? activeRun.status : 'UNKNOWN_STATUS'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(3)}
                            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 text-xs font-semibold flex items-center gap-1.5"
                        >
                            <ArrowLeft size={14} />
                            <span>Back</span>
                        </button>

                        {isAccepted && (
                            <button
                                type="button"
                                onClick={() => setStep(5)}
                                className="px-5 py-2.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                            >
                                <span>Verify Pricing</span>
                                <ArrowRight size={14} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* STEP 5: Test your pricing (Governed Quote Smoke Test) */}
            {step === 5 && (
                <div className="space-y-6">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                            <div>
                                <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                                    Pricing Calibrated & Active
                                </h4>
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                    Your manufacturing rates are calibrated and active. Use the tool below to verify what PrintPriceOS will quote.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold rounded-lg hover:bg-emerald-50 transition-colors"
                        >
                            Calibrate Another Book
                        </button>
                    </div>

                    <GovernedQuoteSmokeTest
                        printerNodeId={printerNodeId}
                        printerNodeName={printerNodeName}
                        initialSpec={draftSpec}
                    />
                </div>
            )}
        </div>
    );
};
