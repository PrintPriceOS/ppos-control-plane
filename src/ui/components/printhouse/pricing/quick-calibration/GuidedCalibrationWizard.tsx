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
import React, { useState, useEffect } from 'react';
import { 
    Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Calculator, 
    ShieldCheck, Edit3, ChevronDown, ChevronUp, AlertCircle, RefreshCw 
} from 'lucide-react';
import { CalibrationConversation } from './CalibrationConversation';
import { GovernedQuoteSmokeTest } from './GovernedQuoteSmokeTest';
import { CountrySelect } from '../../../common/CountrySelect';
import { getCountryDisplayName, isValidIso2Country } from '../../../../lib/countryCatalog';
import { SetupDrawer } from '../../setup/SetupDrawer';
import { useLocale } from '../../../../i18n';

interface GuidedCalibrationWizardProps {
    printerNodeId?: string;
    printerNodeName?: string;
    draftSpec: any;
    setDraftSpec: React.Dispatch<React.SetStateAction<any>>;
    draftCommercials: any;
    setDraftCommercials: React.Dispatch<React.SetStateAction<any>>;
    messages: any[];
    onSendMessage: (text: string, evidenceId?: string, selectedVariantId?: string) => Promise<void>;
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
    activeQuoteEvidence?: any;
    setActiveQuoteEvidence?: React.Dispatch<React.SetStateAction<any>>;
    selectedVariantId?: string;
    setSelectedVariantId?: React.Dispatch<React.SetStateAction<string | undefined>>;
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
    error,
    activeQuoteEvidence,
    setActiveQuoteEvidence,
    selectedVariantId,
    setSelectedVariantId
}) => {
    const { t } = useLocale();
    // Current Wizard Step: 1 -> 2 -> 3 -> 4 -> 5
    const [step, setStep] = useState<number>(() => {
        if (isAccepted) return 5;
        if (isCalculated) return 4;
        if (isReady) return 4;
        if (draftSpec.copies && draftCommercials.targetManufacturingPrice) return 3;
        if (draftSpec.copies) return 2;
        return 1;
    });

    // Synchronize step when rehydrated session or run resolves asynchronously
    useEffect(() => {
        if (isAccepted) {
            setStep(5);
        } else if (isCalculated || isReady) {
            setStep(4);
        }
    }, [isAccepted, isCalculated, isReady]);

    // ── Phase 193H.6 Canonical Step Completion Predicates ──
    const [reviewConfirmed, setReviewConfirmed] = useState<boolean>(true);
    const [lastConfirmedSpecSnapshot, setLastConfirmedSpecSnapshot] = useState<string>(() => JSON.stringify(draftSpec));
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState<boolean>(false);

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

    const isStep2Complete = isStep1Complete;

    const isStep3Complete = Boolean(
        isStep1Complete &&
        draftCommercials.targetManufacturingPrice &&
        Number(draftCommercials.targetManufacturingPrice) > 0
    );

    const isStep4Complete = Boolean(
        isStep1Complete &&
        isStep3Complete &&
        isAccepted
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
        if (targetStep === 5) return isStep1Complete && isStep2Complete && isStep3Complete && isAccepted;
        return false;
    };

    return (
        <div className="space-y-2.5">
            {/* 2. Compact Workflow / Progress Row */}
            <div className="px-3.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs">
                <div className="flex items-center justify-between max-w-2xl mx-auto text-xs font-semibold">
                    {[
                        { num: 1, label: t('pricing.wizard.step1') || 'Describe Job' },
                        { num: 2, label: t('pricing.wizard.step2') || 'Review' },
                        { num: 3, label: t('pricing.wizard.step3') || 'Manufacturing Cost' },
                        { num: 4, label: t('pricing.wizard.step4') || 'Calibrate' },
                        { num: 5, label: t('pricing.wizard.step5') || 'Test Pricing' }
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
                                    className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                                        isCurrent
                                            ? 'text-[#dc0000] font-bold'
                                            : isCompleted
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : isNavigable
                                            ? 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                                            : 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed opacity-60'
                                    }`}
                                >
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
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
                                    <span className="hidden sm:inline text-xs">{s.label}</span>
                                </button>
                                {idx < 4 && (
                                    <div className={`flex-1 h-0.5 mx-1.5 ${
                                        isCompleted ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'
                                    }`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* STEP 1: Tell us about a real job (Directly mounts Assistant Workspace) */}
            {step === 1 && (
                <div className="space-y-2">
                    {/* Viewport-Aware Desktop Grid: minmax(0, 1fr) Workspace with fixed Composer */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-start">
                        {/* Dominant Assistant Section */}
                        <div className="xl:col-span-8 min-w-0">
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
                                activeQuoteEvidence={activeQuoteEvidence}
                                setActiveQuoteEvidence={setActiveQuoteEvidence}
                                selectedVariantId={selectedVariantId}
                                setSelectedVariantId={setSelectedVariantId}
                            />
                        </div>

                        {/* Structured Review & Provenance Pane (Visible on xl desktops) */}
                        <div id="pricing-sidebar-summary-pane" className="hidden xl:flex xl:col-span-4 flex-col gap-3 sticky top-4">
                            {/* Section 1: Current Specification */}
                            <div className="bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                                <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 pb-2">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                                        <Calculator size={13} className="text-[#dc0000]" />
                                        <span>{t('pricing.calibration.currentSpec') || 'Current Specification'}</span>
                                    </span>
                                    {draftSpec.copies ? (
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                            {t('quoteReview.consistent') || 'Active'}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-medium text-zinc-400">
                                            {t('pricing.review.pendingConfirmation') || 'Awaiting Input'}
                                        </span>
                                    )}
                                </div>

                                {draftSpec.copies ? (
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between py-0.5 border-b border-zinc-200/30 dark:border-zinc-800/30">
                                            <span className="text-zinc-500">{t('pricing.spec.quantity') || 'Quantity:'}</span>
                                            <strong className="text-zinc-900 dark:text-white font-mono">{draftSpec.copies} {t('pricing.spec.copies') || 'copies'}</strong>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b border-zinc-200/30 dark:border-zinc-800/30">
                                            <span className="text-zinc-500">{t('pricing.spec.trimSize') || 'Trim Size:'}</span>
                                            <strong className="text-zinc-900 dark:text-white">{draftSpec.book_width_mm || '—'} × {draftSpec.book_height_mm || '—'} mm</strong>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b border-zinc-200/30 dark:border-zinc-800/30">
                                            <span className="text-zinc-500">{t('pricing.spec.interiorPages') || 'Interior Pages:'}</span>
                                            <strong className="text-zinc-900 dark:text-white">{draftSpec.interior_pages || '—'}p ({draftSpec.interior_print || '4/4'})</strong>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b border-zinc-200/30 dark:border-zinc-800/30">
                                            <span className="text-zinc-500">{t('pricing.spec.paper') || 'Paper:'}</span>
                                            <strong className="text-zinc-900 dark:text-white truncate max-w-[130px]">{draftSpec.paper_weight_interior || ''}g {draftSpec.paper_type_interior || '—'}</strong>
                                        </div>
                                        <div className="flex justify-between py-0.5 border-b border-zinc-200/30 dark:border-zinc-800/30">
                                            <span className="text-zinc-500">{t('pricing.spec.binding') || 'Binding:'}</span>
                                            <strong className="text-zinc-900 dark:text-white capitalize">{draftSpec.binding_method || '—'}</strong>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setStep(2)}
                                            className="w-full mt-1.5 py-1.5 px-3 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-xs font-semibold border border-zinc-300 dark:border-zinc-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                            <Edit3 size={12} className="text-[#dc0000]" />
                                            <span>{t('pricing.calibration.editFullSpec') || 'Edit Full Specification'}</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="py-4 text-center text-zinc-400 text-xs space-y-1">
                                        <p>{t('pricing.calibration.noSpecsYet') || 'No specifications entered yet.'}</p>
                                        <p className="text-[11px] text-zinc-500">{t('pricing.calibration.noSpecsHint') || 'Upload a quote PDF or type a job description to begin.'}</p>
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Selected Offer & Variant (Server-Resolved) */}
                            {(() => {
                                const selectedOffer = (activeQuoteEvidence?.offers || []).find((off: any, idx: number) =>
                                    (off.variantId || `variant-${idx}`) === selectedVariantId
                                ) || activeQuoteEvidence?.offers?.[0];
                                const effectiveTarget = selectedOffer?.manufacturingPrice != null && Number(selectedOffer.manufacturingPrice) > 0
                                    ? Number(selectedOffer.manufacturingPrice)
                                    : (draftCommercials.targetManufacturingPrice ? Number(draftCommercials.targetManufacturingPrice) : null);

                                return (
                                    <div className="bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl p-3.5 space-y-2">
                                        <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 pb-1.5">
                                            <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                                                <ShieldCheck size={13} className="text-[#dc0000]" />
                                                <span>{t('pricing.review.selectedVariant') || 'Selected Offer & Variant'}</span>
                                            </span>
                                            {selectedVariantId ? (
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700">
                                                    {selectedVariantId}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-zinc-400">
                                                    {t('quoteReview.notSpecified') || 'None'}
                                                </span>
                                            )}
                                        </div>

                                        {effectiveTarget ? (
                                            <div className="space-y-1.5 text-xs">
                                                <div className="flex justify-between">
                                                    <span className="text-zinc-500">{t('pricing.review.manufacturingTarget') || 'Manufacturing Target:'}</span>
                                                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                                                        €{Number(effectiveTarget).toFixed(2)}
                                                    </strong>
                                                </div>
                                                {draftCommercials.transportPricePerKg != null && (
                                                    <div className="flex justify-between text-[11px]">
                                                        <span className="text-zinc-500">{t('pricing.review.transportPerKg') || 'Transport (€/kg):'}</span>
                                                        <span className="font-mono text-zinc-700 dark:text-zinc-300">
                                                            €{Number(draftCommercials.transportPricePerKg).toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="text-[10px] text-zinc-500 italic pt-1 border-t border-zinc-200/40 dark:border-zinc-800/40">
                                                    {t('quoteReview.vendorDisclaimer') || 'Price resolved from evidence document.'}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-zinc-400 m-0 py-1">
                                                {t('pricing.review.noVariantSelected') || 'No variant selected yet. Pick an offer variant from the card.'}
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Section 3: Solver Proposal & Calibration Status */}
                            <div className="bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl p-3.5 space-y-2">
                                <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800 pb-1.5">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                                        <Sparkles size={13} className="text-[#dc0000]" />
                                        <span>{t('pricing.review.calibrationProposal') || 'Calibration Proposal'}</span>
                                    </span>
                                    {activeRun ? (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            isAccepted 
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                        }`}>
                                            {isAccepted ? (t('pricing.solver.accepted') || 'Accepted') : (t(`pricing.solver.${(activeRun.status || 'CALCULATED').toLowerCase()}`) || activeRun.status || 'Calculated')}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-zinc-400">
                                            {t('pricing.solver.awaitingSolver') || 'Awaiting Solver'}
                                        </span>
                                    )}
                                </div>

                                {activeRun ? (
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">{t('pricing.solver.predictedPrice') || 'Predicted Price:'}</span>
                                            <strong className="font-mono text-zinc-900 dark:text-white">
                                                €{Number(activeRun.enginePriceAfter ?? activeRun.predicted_manufacturing_price ?? 0).toFixed(2)}
                                            </strong>
                                        </div>
                                        <div className="flex justify-between text-[11px]">
                                            <span className="text-zinc-500">{t('pricing.solver.residual') || 'Residual:'}</span>
                                            <strong className="font-mono text-zinc-700 dark:text-zinc-300">
                                                €{Number(activeRun.absoluteResidual ?? activeRun.absolute_residual ?? 0).toFixed(2)}
                                            </strong>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-zinc-400 m-0 py-1">
                                        {t('pricing.review.noProposalYet') || 'No solver proposal generated yet. Proceed to Step 4 to calibrate.'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">
                                {draftSpec.copies ? `${draftSpec.copies} copies extracted` : 'Describe job or upload PDF'}
                            </span>
                            {/* Drawer trigger when xl summary pane is hidden */}
                            <button
                                type="button"
                                onClick={() => setIsDetailDrawerOpen(true)}
                                className="xl:hidden px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 flex items-center gap-1 transition-colors cursor-pointer"
                            >
                                <Calculator size={13} className="text-[#dc0000]" />
                                <span>Review details</span>
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            disabled={!draftSpec.copies}
                            className="px-5 py-2 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white dark:text-zinc-900 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm disabled:cursor-not-allowed cursor-pointer"
                        >
                            <span>Continue to Review</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>

                    {/* Review Details Drawer */}
                    <SetupDrawer
                        isOpen={isDetailDrawerOpen}
                        onClose={() => setIsDetailDrawerOpen(false)}
                        title={t('pricing.calibration.drawerTitle') || 'Current Specification & Extracted Details'}
                        subtitle={t('pricing.calibration.drawerSubtitle') || 'Review parameters extracted by the assistant or attached PDF.'}
                        widthClass="max-w-md"
                    >
                        <div className="space-y-4 text-xs">
                            {draftSpec.copies ? (
                                <div className="space-y-2.5">
                                    <div className="flex justify-between py-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
                                        <span className="text-zinc-500">Quantity:</span>
                                        <strong className="text-zinc-900 dark:text-white font-mono">{draftSpec.copies} copies</strong>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
                                        <span className="text-zinc-500">Trim Size:</span>
                                        <strong className="text-zinc-900 dark:text-white">{draftSpec.book_width_mm || '—'} × {draftSpec.book_height_mm || '—'} mm</strong>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
                                        <span className="text-zinc-500">Interior Pages:</span>
                                        <strong className="text-zinc-900 dark:text-white">{draftSpec.interior_pages || '—'} pages ({draftSpec.interior_print || '4/4'})</strong>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
                                        <span className="text-zinc-500">Interior Paper:</span>
                                        <strong className="text-zinc-900 dark:text-white">{draftSpec.paper_weight_interior || ''}g {draftSpec.paper_type_interior || '—'}</strong>
                                    </div>
                                    <div className="flex justify-between py-1.5 border-b border-zinc-200/60 dark:border-zinc-800/60">
                                        <span className="text-zinc-500">Binding:</span>
                                        <strong className="text-zinc-900 dark:text-white capitalize">{draftSpec.binding_method || '—'}</strong>
                                    </div>
                                    {draftCommercials.targetManufacturingPrice && (
                                        <div className="flex justify-between py-1.5 text-emerald-600 dark:text-emerald-400 font-bold border-b border-zinc-200/60 dark:border-zinc-800/60">
                                            <span>Manufacturing Target:</span>
                                            <span className="font-mono">€{Number(draftCommercials.targetManufacturingPrice).toFixed(2)}</span>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsDetailDrawerOpen(false);
                                            setStep(2);
                                        }}
                                        className="w-full mt-3 py-2 px-3 bg-[#dc0000] hover:bg-[#b00000] text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                                    >
                                        <Edit3 size={13} />
                                        <span>{t('pricing.calibration.editFullSpec') || 'Edit Full Specification'}</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="py-8 text-center text-zinc-500">
                                    {t('pricing.calibration.noSpecsYet') || 'No specifications entered yet. Describe a book or attach a PDF quote to begin.'}
                                </div>
                            )}
                        </div>
                    </SetupDrawer>
                </div>
            )}

            {/* STEP 2: We understood this (Editable Structured Review) */}
            {step === 2 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">
                                {(t('pricing.wizard.step') || 'Step {step} of {total}').replace('{step}', '2').replace('{total}', '5')}
                            </span>
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
                                {t('pricing.wizard.step2.title') || 'Review & Edit Specification'}
                            </h3>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                {t('pricing.wizard.step2.subtitle') || 'PrintPriceOS extracted these specifications. You can adjust any field directly below without calling the assistant again.'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                        {/* Quantity */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                {t('pricing.wizard.step2.quantity') || 'Quantity (Copies) *'}
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
                                {t('pricing.wizard.step2.trimSize') || 'Trim Dimensions (W × H mm) *'}
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
                                {t('pricing.wizard.step2.interiorPagesPrint') || 'Interior Pages & Print *'}
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
                                    <option value="4/4">{t('pricing.smoke.print.4_4') || '4/4 Full Colour'}</option>
                                    <option value="1/1">{t('pricing.smoke.print.1_1') || '1/1 Black'}</option>
                                    <option value="2/2">{t('pricing.smoke.print.2_2') || '2/2 Two Colour'}</option>
                                </select>
                            </div>
                        </div>

                        {/* Interior Paper */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                {t('pricing.wizard.step2.interiorPaper') || 'Interior Paper *'}
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
                                    <option value="">{t('pricing.wizard.step2.selectPaper') || 'Select Paper'}</option>
                                    <option value="offset">{t('pricing.smoke.paper.offset') || 'Offset'}</option>
                                    <option value="mc">{t('pricing.smoke.paper.mc') || 'Coated (MC)'}</option>
                                    <option value="lux">Lux Paper</option>
                                    <option value="munken">{t('pricing.smoke.paper.munken') || 'Munken'}</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>

                        {/* Cover Specification */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                {t('pricing.wizard.step2.coverPaper') || 'Cover Weight & Paper *'}
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
                                    <option value="">{t('pricing.wizard.step2.selectCoverPaper') || 'Select Cover Paper'}</option>
                                    <option value="mc">{t('pricing.smoke.paper.mc') || 'Coated (MC)'}</option>
                                    <option value="artboard">Artboard</option>
                                    <option value="offset">{t('pricing.smoke.paper.offset') || 'Offset'}</option>
                                    <option value="wfmc">WFMC</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>

                        {/* Cover Print & Lamination */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                {t('pricing.wizard.step2.coverPrintFinish') || 'Cover Print & Finishing'}
                            </label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={draftSpec.cover_print || ''}
                                    onChange={e => setDraftSpec((p: any) => ({ ...p, cover_print: e.target.value || undefined }))}
                                    className="w-1/2 px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                >
                                    <option value="">{t('pricing.wizard.step2.selectCoverPrint') || 'Select Cover Print *'}</option>
                                    <option value="4/0">{t('pricing.smoke.coverPrint.4_0') || '4/0 Front Only'}</option>
                                    <option value="4/4">{t('pricing.smoke.coverPrint.4_4') || '4/4 Both Sides'}</option>
                                    <option value="1/0">{t('pricing.smoke.coverPrint.1_0') || '1/0 Front Black'}</option>
                                    <option value="1/1">1/1 Black Both</option>
                                </select>
                                <select
                                    value={draftSpec.lamination || ''}
                                    onChange={e => setDraftSpec((p: any) => ({ ...p, lamination: e.target.value || null }))}
                                    className="w-1/2 px-2 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                                >
                                    <option value="">{t('pricing.smoke.lamination.none') || 'No Lamination'}</option>
                                    <option value="matt">{t('pricing.smoke.lamination.matt') || 'Matt Lam'}</option>
                                    <option value="gloss">{t('pricing.smoke.lamination.gloss') || 'Gloss Lam'}</option>
                                    <option value="varnish">Varnish</option>
                                </select>
                            </div>
                        </div>

                        {/* Binding Method */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                {t('pricing.wizard.step2.binding') || 'Binding Method *'}
                            </label>
                            <select
                                value={draftSpec.binding_method || 'perfect bound'}
                                onChange={e => setDraftSpec((p: any) => ({ ...p, binding_method: e.target.value }))}
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-[#dc0000]/20 focus:outline-none"
                            >
                                <option value="perfect bound">{t('pricing.smoke.binding.perfectBound') || 'Perfect Bound (Paperback)'}</option>
                                <option value="saddle stitch">{t('pricing.smoke.binding.saddleStitch') || 'Saddle Stitch (Booklet)'}</option>
                                <option value="thread sewn">{t('pricing.smoke.binding.threadSewn') || 'Thread Sewn'}</option>
                                <option value="hardcover">{t('pricing.smoke.binding.hardcover') || 'Hardcover (Case Bound)'}</option>
                                <option value="wire-o">{t('pricing.smoke.binding.wireO') || 'Wire-O'}</option>
                                <option value="spiral">{t('pricing.smoke.binding.spiral') || 'Spiral'}</option>
                            </select>
                        </div>

                        {/* Destination Country */}
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-1.5">
                            <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                                {t('pricing.wizard.step2.destination') || 'Destination Region / Country'}
                            </label>
                            <CountrySelect
                                value={draftSpec.delivery_country || ''}
                                onChange={(code) => setDraftSpec((p: any) => ({ ...p, delivery_country: code || undefined }))}
                                placeholder={t('pricing.wizard.step2.selectDestinationPlaceholder') || 'Select destination (e.g. Poland, Japan)...'}
                            />
                        </div>
                    </div>

                    {!isStep1Complete && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                            <span className="font-semibold">{t('pricing.wizard.step2.requiredNotice') || 'Fill in the required fields marked with (*) above to continue.'}</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 text-xs font-semibold flex items-center gap-1.5"
                        >
                            <ArrowLeft size={14} />
                            <span>{t('pricing.wizard.step2.redoAi') || 'Redo AI Description'}</span>
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
                            <span>{t('pricing.wizard.step2.confirmContinue') || 'Confirm Specification & Continue'}</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: What did this job cost you? */}
            {step === 3 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">
                            {(t('pricing.wizard.step') || 'Step {step} of {total}').replace('{step}', '3').replace('{total}', '5')}
                        </span>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-1">
                            {t('pricing.wizard.step3.title') || 'What did this job cost you to manufacture?'}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                            {t('pricing.wizard.step3.subtitle') || 'Provide your known internal production cost and verify which components were covered.'}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Manufacturing Cost Input */}
                        <div className="p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1.5">
                                    {t('pricing.wizard.step3.knownCost') || 'Known Manufacturing Cost (€)'}
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
                                    {(t('pricing.wizard.step3.costHelp') || 'Total net internal cost to produce the {copies} copies.').replace('{copies}', (draftSpec.copies?.toLocaleString() || '1000'))}
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1.5">
                                    {t('pricing.wizard.step3.transportRef') || 'Transport Cost Reference (€ / kg) — Optional'}
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
                                    {t('pricing.wizard.step3.transportHelp') || 'External reference only. Transport is not mixed into manufacturing rates.'}
                                </p>
                            </div>
                        </div>

                        {/* Inclusions Checklist */}
                        <div className="p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-3">
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                                {t('pricing.wizard.step3.inclusionsTitle') || 'What was included in this € amount?'}
                            </span>

                            {[
                                { key: 'includesPaper', label: t('pricing.wizard.step3.includePaper') || 'Paper Stock / Substrates' },
                                { key: 'includesBinding', label: t('pricing.wizard.step3.includeBinding') || 'Binding & Stitching Operations' },
                                { key: 'includesFinishing', label: t('pricing.wizard.step3.includeFinishing') || 'Lamination / Surface Finishing' },
                                { key: 'includesPackaging', label: t('pricing.wizard.step3.includePackaging') || 'Boxes & Pallet Packaging' }
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
                            <span>{t('pricing.wizard.back') || 'Back'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={async () => {
                                const readySession: any = await onMarkReady();
                                if (readySession && (readySession.status === 'READY' || readySession.status === 'DRAFT' || readySession.status === 'CALCULATED')) {
                                    setStep(4);
                                } else {
                                    setStep(4);
                                }
                            }}
                            disabled={!isStep3Complete}
                            className="px-6 py-2.5 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:cursor-not-allowed"
                        >
                            <span>{t('pricing.wizard.step3.calibrateBtn') || 'Use this job to calibrate my pricing'}</span>
                            <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 4: Calibrate Pricing */}
            {step === 4 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400">
                            {(t('pricing.wizard.step') || 'Step {step} of {total}').replace('{step}', '4').replace('{total}', '5')}
                        </span>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mt-1">
                            {t('pricing.wizard.step4.title') || 'Calibrate & Apply Starting Pricing'}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                            {t('pricing.wizard.step4.subtitle') || 'Align your base printing, paper, and binding rates to match this reference job.'}
                        </p>
                    </div>

                    <div className="p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/80 rounded-xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                    {isAccepted 
                                        ? (t('pricing.calibration.calibratedAndActive') || 'Pricing Calibrated & Active')
                                        : activeRun?.status === 'ACCEPTABLE_CANDIDATE'
                                        ? (t('pricing.calibration.candidateWithinTolerance') || 'Calibration Candidate Within Governed Tolerance')
                                        : isCalculated && isRunAcceptanceEligible
                                        ? (t('pricing.calibration.calculatedAwaitingAcceptance') || 'Calibration Calculated — Awaiting Acceptance') 
                                        : isCalculated && (!activeRun || !isRunAcceptanceEligible)
                                        ? (t('pricing.calibration.stateInconsistent') || 'Calibration State Inconsistent')
                                        : (activeRun && !isRunAcceptanceEligible)
                                        ? (t('pricing.calibration.didNotConverge') || 'Calibration Did Not Converge')
                                        : isReady
                                        ? (t('pricing.calibration.readyToRun') || 'Ready to Run Calibration')
                                        : (t('pricing.calibration.setupIncomplete') || 'Calibration Setup Incomplete')}
                                </span>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                    {t('pricing.wizard.step4.targetPrice') || 'Target Price:'} <strong className="text-zinc-800 dark:text-zinc-200">€ {draftCommercials.targetManufacturingPrice}</strong> {(t('pricing.wizard.step4.forCopies') || 'for {copies} copies.').replace('{copies}', (draftSpec.copies?.toLocaleString() || '1000'))}
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
                                        <span>{calculating ? (t('pricing.wizard.step4.runningBtn') || 'Running Calibration...') : (activeRun && !isRunAcceptanceEligible) ? (t('pricing.wizard.step4.rerunBtn') || 'Re-run Pricing Calibration') : (t('pricing.wizard.step4.runBtn') || 'Run Pricing Calibration')}</span>
                                    </button>
                                )}

                                {canAccept && !isAccepted && (
                                    <button
                                        type="button"
                                        onClick={onAccept}
                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <ShieldCheck size={16} />
                                        <span>{t('pricing.wizard.step4.acceptBtn') || 'Accept Pricing Revision'}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Candidate Diagnostics / Informational Note */}
                        {activeRun?.status === 'ACCEPTABLE_CANDIDATE' && isCalculated && !isAccepted && (
                            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-900 dark:text-blue-200 font-medium">
                                {t('pricing.wizard.step4.candidateNotice') || 'The optimizer did not reach its strict numerical convergence threshold, but the best deterministic candidate is within the governed publishing tolerance and can be reviewed for acceptance.'}
                            </div>
                        )}

                        {/* Diagnostics & Outcome Message */}
                        {activeRun && !isRunAcceptanceEligible && (
                            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium">
                                {t('pricing.wizard.step4.notConvergedNotice') || 'Calibration could not produce an acceptance-eligible solution within governed tolerances. You can adjust the reference job specifications or inspect rates.'}
                            </div>
                        )}

                        {activeRun && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-700/60 text-xs">
                                <div>
                                    <span className="text-zinc-500 text-[11px]">{t('pricing.wizard.step4.targetPriceCol') || 'Target Price'}</span>
                                    <div className="font-bold text-zinc-900 dark:text-white">
                                        € {Number(activeRun.targetPrice ?? activeRun.target_price ?? draftCommercials.targetManufacturingPrice ?? 0).toFixed(2)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">{t('pricing.wizard.step4.predictedCostCol') || 'Predicted Cost'}</span>
                                    <div className={`font-bold ${!isRunAcceptanceEligible ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                        € {Number(activeRun.enginePriceAfter ?? activeRun.predicted_manufacturing_price ?? 0).toFixed(2)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">{t('pricing.wizard.step4.residualCol') || 'Residual'}</span>
                                    <div className="font-bold text-zinc-900 dark:text-white">
                                        € {Number(activeRun.absoluteResidual ?? activeRun.absolute_residual ?? 0).toFixed(2)} ({Number(activeRun.percentResidual ?? activeRun.percent_residual ?? 0).toFixed(2)}%)
                                    </div>
                                </div>
                                <div>
                                    <span className="text-zinc-500 text-[11px]">{t('pricing.wizard.step4.statusCol') || 'Status'}</span>
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
                            <span>{t('pricing.wizard.back') || 'Back'}</span>
                        </button>

                        {isAccepted && (
                            <button
                                type="button"
                                onClick={() => setStep(5)}
                                className="px-5 py-2.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                            >
                                <span>{t('pricing.calibration.verifyPricing') || 'Verify Pricing'}</span>
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
                                    {isAccepted ? (t('pricing.calibration.calibratedAndActive') || 'Pricing Calibrated & Active') : (t('pricing.calibration.previewTitle') || 'Pricing Calibration Test Preview')}
                                </h4>
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                    {isAccepted
                                        ? (t('pricing.calibration.calibratedAndActiveDesc') || 'Your manufacturing rates are calibrated and confirmed active by server verification.')
                                        : (t('pricing.calibration.previewDesc') || 'Previewing pricing calculations against current rates without active revision commitment.')}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="px-3 py-1.5 bg-white dark:bg-zinc-800 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold rounded-lg hover:bg-emerald-50 transition-colors"
                        >
                            {t('pricing.calibration.calibrateAnotherBook') || 'Calibrate Another Book'}
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
