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
        draftSpec.paper_type_cover &&
        draftSpec.paper_weight_cover && draftSpec.paper_weight_cover > 0 &&
        draftSpec.binding_method
    );

    const isStep2Complete = Boolean(
        isStep1Complete && isReviewValid
    );

    const isStep3Complete = Boolean(
        isStep1Complete &&
        isStep2Complete &&
        draftCommercials.targetManufacturingPrice &&
        Number(draftCommercials.targetManufacturingPrice) > 0 &&
        draftCommercials.includesPaper !== null &&
        draftCommercials.includesBinding !== null
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
        if (targetStep === 2) return isStep1Complete;
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
                            disabled={!isStep1Complete}
                            className="px-5 py-2.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white dark:text-zinc-900 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm disabled:cursor-not-allowed"
                        >
                            <span>Continue to Review</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: We understood this (Review Card) */}
            {step === 2 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">Step 2 of 5</span>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-1">
                            We understood this specification
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                            Review what PrintPriceOS extracted from your description. If anything is missing or incorrect, you can edit it directly.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl text-xs">
                        <div>
                            <span className="text-zinc-500 block text-[11px]">Quantity</span>
                            <strong className="text-zinc-900 dark:text-white text-sm">
                                {draftSpec.copies ? `${draftSpec.copies.toLocaleString()} copies` : 'Missing'}
                            </strong>
                        </div>
                        <div>
                            <span className="text-zinc-500 block text-[11px]">Trim Dimensions</span>
                            <strong className="text-zinc-900 dark:text-white text-sm">
                                {draftSpec.book_width_mm && draftSpec.book_height_mm ? `${draftSpec.book_width_mm} × ${draftSpec.book_height_mm} mm` : 'Missing'}
                            </strong>
                        </div>
                        <div>
                            <span className="text-zinc-500 block text-[11px]">Interior Pages</span>
                            <strong className="text-zinc-900 dark:text-white text-sm">
                                {draftSpec.interior_pages ? `${draftSpec.interior_pages} pages (${draftSpec.interior_print || '4/4'})` : 'Missing'}
                            </strong>
                        </div>
                        <div>
                            <span className="text-zinc-500 block text-[11px]">Interior Paper</span>
                            <strong className="text-zinc-900 dark:text-white text-sm">
                                {draftSpec.paper_weight_interior ? `${draftSpec.paper_weight_interior}gsm ${draftSpec.paper_type_interior || 'offset'}` : 'Missing'}
                            </strong>
                        </div>
                        <div>
                            <span className="text-zinc-500 block text-[11px]">Cover Specification</span>
                            <strong className="text-zinc-900 dark:text-white text-sm">
                                {draftSpec.paper_weight_cover ? `${draftSpec.paper_weight_cover}gsm ${draftSpec.paper_type_cover || 'mc'} (${draftSpec.cover_print || '4/0'})` : 'Missing'}
                            </strong>
                        </div>
                        <div>
                            <span className="text-zinc-500 block text-[11px]">Binding Method</span>
                            <strong className="text-zinc-900 dark:text-white text-sm capitalize">
                                {draftSpec.binding_method || 'Missing'}
                            </strong>
                        </div>
                        <div>
                            <span className="text-zinc-500 block text-[11px]">Finishing / Lamination</span>
                            <strong className="text-zinc-900 dark:text-white text-sm capitalize">
                                {draftSpec.lamination ? `${draftSpec.lamination} lamination` : 'None'}
                            </strong>
                        </div>
                        <div>
                            <span className="text-zinc-500 block text-[11px]">Destination Region</span>
                            <strong className="text-zinc-900 dark:text-white text-sm">
                                {draftSpec.delivery_country || 'ES'}
                            </strong>
                        </div>
                    </div>

                    {!isStep1Complete && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                            <span className="font-semibold">Complete the missing job details before continuing to manufacturing cost.</span>
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="font-bold text-[#dc0000] hover:underline ml-2"
                            >
                                Edit Description
                            </button>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 text-xs font-semibold flex items-center gap-1.5"
                        >
                            <ArrowLeft size={14} />
                            <span>Edit Description</span>
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
                            <span>Looks Right — Continue</span>
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
                            disabled={!isCostComplete}
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
                                    {isCalculated ? 'Calibration Converged Successfully' : 'Ready to Run Calibration'}
                                </span>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                    Target Price: <strong className="text-zinc-800 dark:text-zinc-200">€ {draftCommercials.targetManufacturingPrice}</strong> for {draftSpec.copies?.toLocaleString()} copies.
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                {!isCalculated && (
                                    <button
                                        type="button"
                                        onClick={onCalculate}
                                        disabled={calculating}
                                        className="px-5 py-2.5 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <Calculator size={15} />
                                        <span>{calculating ? 'Running Calibration...' : 'Run Pricing Calibration'}</span>
                                    </button>
                                )}

                                {isCalculated && !isAccepted && (
                                    <button
                                        type="button"
                                        onClick={onAccept}
                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <ShieldCheck size={16} />
                                        <span>Accept Calibrated Pricing</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {activeRun && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-700/60 text-xs">
                                <div>
                                    <span className="text-zinc-500 text-[11px]">Target Price</span>
                                    <div className="font-bold text-zinc-900 dark:text-white">€ {activeRun.target_price}</div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">Predicted Cost</span>
                                    <div className="font-bold text-emerald-600 dark:text-emerald-400">€ {activeRun.predicted_manufacturing_price}</div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">Residual</span>
                                    <div className="font-bold text-zinc-900 dark:text-white">€ {activeRun.absolute_residual}</div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">Status</span>
                                    <div className="font-bold text-emerald-600 dark:text-emerald-400">CONVERGED</div>
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
                                <span>Test My Pricing</span>
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
                                    Your manufacturing rates are calibrated. Use the tool below to verify what PrintPriceOS will quote.
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
