/**
 * src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel.tsx
 *
 * Phase 193F — Quick Pricing Calibration Master Workflow Orchestrator
 *
 * Coordinates:
 * 1. Session state management (193B DRAFT -> READY).
 * 2. Conversational assistant integration (193E assistant/chat -> Zero-write proposal).
 * 3. Structured specification review & explicit Apply.
 * 4. Deterministic inverse solver calculation (193C calculate).
 * 5. Rate comparison & AI run explanation (193E explain-run).
 * 6. Governed acceptance & revision recording (193D accept).
 *
 * Security & Governance Invariants:
 * - Zero client-side pricing mathematics or patch generation.
 * - Zero auto-persistence on chat messages.
 * - Zero activation grant mutation.
 * - Uses canonical getAuthToken().
 */
import React, { useState, useEffect } from 'react';
import { printhouseCalibrationApi } from '../../../../lib/printhouseCalibrationApi';
import { CalibrationConversation } from './CalibrationConversation';
import { CalibrationStructuredSummary } from './CalibrationStructuredSummary';
import { CalibrationCommercialDeclaration } from './CalibrationCommercialDeclaration';
import { CalibrationRunSummary } from './CalibrationRunSummary';
import { CalibrationRateComparison } from './CalibrationRateComparison';
import { CalibrationWarnings } from './CalibrationWarnings';
import { CalibrationAcceptanceModal } from './CalibrationAcceptanceModal';
import { PricingRevisionHistoryModal } from './PricingRevisionHistoryModal';
import { 
    Sparkles, RefreshCw, Calculator, ShieldCheck, CheckCircle2, 
    AlertTriangle, History, ArrowRight, X, Layers, CheckCircle 
} from 'lucide-react';

interface QuickCalibrationPanelProps {
    printerNodeId?: string;
    printerNodeName?: string;
    onAccepted?: () => void;
}

export const QuickCalibrationPanel: React.FC<QuickCalibrationPanelProps> = ({
    printerNodeId,
    printerNodeName = 'Production Node',
    onAccepted
}) => {
    // ── Workflow States ──
    const [session, setSession] = useState<any | null>(null);
    const [loadingSession, setLoadingSession] = useState(false);
    const [activeRun, setActiveRun] = useState<any | null>(null);
    const [calculating, setCalculating] = useState(false);
    const [explaining, setExplaining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // ── Conversational & Proposal State (In-Memory) ──
    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant' | 'system'; text: string; timestamp?: string }>>([]);
    const [sendingChat, setSendingChat] = useState(false);
    const [activeProposal, setActiveProposal] = useState<any | null>(null);
    const [aiUnavailable, setAiUnavailable] = useState(false);

    // ── Local Editable Draft Spec & Commercials (Initially Clean / Empty) ──
    const [draftSpec, setDraftSpec] = useState<any>({
        copies: undefined,
        book_width_mm: undefined,
        book_height_mm: undefined,
        interior_pages: undefined,
        interior_print: undefined,
        paper_type_interior: undefined,
        paper_weight_interior: undefined,
        cover_print: undefined,
        paper_type_cover: undefined,
        paper_weight_cover: undefined,
        lamination: null,
        binding_method: undefined,
        delivery_country: 'ES'
    });

    const [draftCommercials, setDraftCommercials] = useState<any>({
        targetManufacturingPrice: null,
        currency: 'EUR',
        transportPricePerKg: null,
        transportCurrency: 'EUR',
        includesPaper: null,
        includesBinding: null,
        includesFinishing: null,
        includesPackaging: null
    });

    // ── Tracking Metadata ──
    const [extractedFields, setExtractedFields] = useState<string[]>([]);
    const [confirmedFields, setConfirmedFields] = useState<string[]>([]);

    // ── Modals Visibility ──
    const [showAcceptModal, setShowAcceptModal] = useState(false);
    const [accepting, setAccepting] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Helper: Validates whether local draft satisfies Phase 193B mandatory contract
    const validateDraftForCreation = (spec: any, comms: any): { valid: boolean; missing: string[] } => {
        const missing: string[] = [];
        if (!spec.copies || spec.copies < 1) missing.push('Copies (positive integer)');
        if (!spec.book_width_mm) missing.push('Width mm');
        if (!spec.book_height_mm) missing.push('Height mm');
        if (!spec.interior_pages || spec.interior_pages < 1) missing.push('Interior pages');
        if (!spec.interior_print) missing.push('Interior print (1/1, 2/2, 4/4)');
        if (!spec.paper_type_interior) missing.push('Interior paper type');
        if (!spec.paper_weight_interior) missing.push('Interior paper weight');
        if (!spec.cover_print) missing.push('Cover print');
        if (!spec.paper_type_cover) missing.push('Cover paper type');
        if (!spec.paper_weight_cover) missing.push('Cover paper weight');
        if (!spec.binding_method) missing.push('Binding method');
        if (!spec.delivery_country) missing.push('Delivery country');

        if (!comms.targetManufacturingPrice || comms.targetManufacturingPrice <= 0) {
            missing.push('Known Manufacturing Price (> 0 EUR)');
        }
        return { valid: missing.length === 0, missing };
    };

    // ── 1. Conversational Chat (193E Zero-Write) ──
    const handleSendMessage = async (text: string) => {
        setSendingChat(true);
        setError(null);

        // Append user message locally
        const userMsg = { role: 'user' as const, text, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);

        try {
            // If session exists on server, call assistant API; otherwise handle in local memory
            if (session?.id) {
                const result = await printhouseCalibrationApi.assistantChat(session.id, text);
                setAiUnavailable(false);

                if (result && result.proposal) {
                    setActiveProposal(result.proposal);

                    const assistantMsg = {
                        role: 'assistant' as const,
                        text: result.proposal.explanation || 'I have extracted the book specifications for your review.',
                        timestamp: new Date().toISOString(),
                        proposal: result.proposal
                    };
                    setMessages(prev => [...prev, assistantMsg]);

                    if (result.proposal.specPatch) {
                        setExtractedFields(Object.keys(result.proposal.specPatch));
                    }
                }
            } else {
                // Pre-session conversational mock/fallback: provide structured template response locally
                const assistantMsg = {
                    role: 'assistant' as const,
                    text: 'I have noted these reference book parameters. Review the structured specification and commercial declaration on the right, then click Apply & Save to create your calibration baseline.',
                    timestamp: new Date().toISOString()
                };
                setMessages(prev => [...prev, assistantMsg]);
            }
        } catch (err: any) {
            if (err.code === 'AI_PROVIDER_UNAVAILABLE' || err.code === 'AI_PROVIDER_TIMEOUT') {
                setAiUnavailable(true);
                const systemMsg = {
                    role: 'assistant' as const,
                    text: 'AI Assistant is offline. You can continue configuring the reference book directly using the structured form on the right.',
                    timestamp: new Date().toISOString()
                };
                setMessages(prev => [...prev, systemMsg]);
            } else {
                setError(err.message || 'Error communicating with assistant');
            }
        } finally {
            setSendingChat(false);
        }
    };

    // ── 2. Explicit Apply / Save (193B Session Creation / Update) ──
    const handleApplyProposal = async (proposal: any) => {
        setError(null);
        const newSpec = { ...draftSpec, ...(proposal?.specPatch || {}) };
        const newComms = { ...draftCommercials, ...(proposal?.declaredCommercials || {}) };

        setDraftSpec(newSpec);
        setDraftCommercials(newComms);

        const validation = validateDraftForCreation(newSpec, newComms);
        if (!validation.valid) {
            setError(`Cannot persist session yet. Missing mandatory fields: ${validation.missing.join(', ')}`);
            if (proposal?.specPatch) {
                setExtractedFields(Object.keys(proposal.specPatch));
            }
            return;
        }

        try {
            if (!session?.id) {
                // Explicit creation with complete Phase 193B payload
                const created = await printhouseCalibrationApi.createSession({
                    printerNodeId,
                    referenceBookName: 'Quick Calibration Book',
                    bookSpec: newSpec,
                    targetManufacturingPrice: Number(newComms.targetManufacturingPrice),
                    currency: newComms.currency || 'EUR',
                    transportPricePerKg: newComms.transportPricePerKg ? Number(newComms.transportPricePerKg) : null,
                    transportCurrency: newComms.transportCurrency || 'EUR',
                    includesPaper: newComms.includesPaper,
                    includesBinding: newComms.includesBinding,
                    includesFinishing: newComms.includesFinishing,
                    includesPackaging: newComms.includesPackaging
                });
                setSession(created);
            } else {
                const updated = await printhouseCalibrationApi.updateDraftSession(session.id, {
                    bookSpec: newSpec,
                    targetManufacturingPrice: Number(newComms.targetManufacturingPrice),
                    currency: newComms.currency || 'EUR',
                    transportPricePerKg: newComms.transportPricePerKg ? Number(newComms.transportPricePerKg) : null,
                    transportCurrency: newComms.transportCurrency || 'EUR',
                    includesPaper: newComms.includesPaper,
                    includesBinding: newComms.includesBinding,
                    includesFinishing: newComms.includesFinishing,
                    includesPackaging: newComms.includesPackaging
                });
                setSession(updated);
            }
            setConfirmedFields(Object.keys(newSpec).filter(k => newSpec[k] !== undefined && newSpec[k] !== null && newSpec[k] !== ''));
            setExtractedFields([]);
            setActiveProposal(null);
            setSuccessMessage('Specifications verified and saved to calibration session.');
            setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err: any) {
            setError(err.message || 'Failed to save calibration session');
        }
    };

    // ── 3. Manual Save Draft Spec ──
    const handleSaveManualDraft = async () => {
        await handleApplyProposal({ specPatch: draftSpec, declaredCommercials: draftCommercials });
    };

    // ── 4. Clarification Answer ──
    const handleClarificationAnswer = (field: string, answer: any) => {
        if (field.startsWith('includes')) {
            const val = typeof answer === 'string' ? answer.toLowerCase().includes('yes') || answer.toLowerCase().includes('included') : Boolean(answer);
            setDraftCommercials((prev: any) => ({ ...prev, [field]: val }));
        } else {
            setDraftSpec((prev: any) => ({ ...prev, [field]: answer }));
        }
    };

    // ── 5. Ready to Calibrate Transition (193B) ──
    const handleMarkReady = async () => {
        setError(null);
        // Ensure session exists
        if (!session?.id) {
            await handleSaveManualDraft();
        }
        if (!session?.id) {
            setError('Please verify all mandatory fields and save before marking ready.');
            return;
        }

        try {
            // First save any unsaved draft fields
            await printhouseCalibrationApi.updateDraftSession(session.id, {
                bookSpec: draftSpec,
                targetManufacturingPrice: Number(draftCommercials.targetManufacturingPrice),
                currency: draftCommercials.currency,
                transportPricePerKg: draftCommercials.transportPricePerKg ? Number(draftCommercials.transportPricePerKg) : null,
                transportCurrency: draftCommercials.transportCurrency,
                includesPaper: draftCommercials.includesPaper,
                includesBinding: draftCommercials.includesBinding,
                includesFinishing: draftCommercials.includesFinishing,
                includesPackaging: draftCommercials.includesPackaging
            });

            const readySession = await printhouseCalibrationApi.markSessionReady(session.id);
            setSession(readySession);
            setSuccessMessage('Specification verified and ready for calibration.');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            setError(err.message || 'Validation failed. Please verify all physical book specifications and inclusions.');
        }
    };

    // ── 5. Run Deterministic Inverse Solver (193C) ──
    const handleCalculate = async () => {
        if (!session?.id) return;
        setCalculating(true);
        setError(null);
        try {
            const run = await printhouseCalibrationApi.calculateCalibration(session.id);
            setActiveRun(run);
            setSuccessMessage(`Pricing calibration converged! Residual: ${Number(run.absolute_residual).toFixed(2)} EUR`);
        } catch (err: any) {
            setError(err.message || 'Deterministic solver could not converge on a valid rate combination.');
        } finally {
            setCalculating(false);
        }
    };

    // ── 6. AI Run Explanation (193E Zero-Write) ──
    const handleExplainRun = async () => {
        if (!session?.id || !activeRun?.id) return;
        setExplaining(true);
        try {
            const result = await printhouseCalibrationApi.explainRun(session.id, activeRun.id);
            if (result && result.explanation) {
                setActiveRun((prev: any) => ({ ...prev, aiExplanation: result.explanation }));
            }
        } catch (err: any) {
            console.warn('Failed to generate AI explanation:', err);
        } finally {
            setExplaining(false);
        }
    };

    // ── 7. Governed Acceptance Confirmation (193D) ──
    const handleAcceptanceConfirm = async () => {
        if (!session?.id || !activeRun?.id) return;
        setAccepting(true);
        setError(null);
        try {
            const acceptanceResult = await printhouseCalibrationApi.acceptCalibrationRun(session.id, activeRun.id);
            setShowAcceptModal(false);
            setSession((prev: any) => ({ ...prev, status: 'ACCEPTED' }));
            setSuccessMessage(`Pricing Revision created successfully! Node rates updated.`);
            onAccepted?.();
        } catch (err: any) {
            let userMsg = err.message || 'Failed to accept calibration proposal';
            if (err.code === 'BASELINE_DRIFT_DETECTED') {
                userMsg = 'Pricing for this node changed after calibration was calculated. Please re-run calibration.';
            } else if (err.code === 'CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED') {
                userMsg = 'Proposal residual exceeds permitted acceptance tolerance.';
            }
            setError(userMsg);
        } finally {
            setAccepting(false);
        }
    };

    // Prepare rate comparison items from server-provided proposed_patch_json
    const getRateComparisonItems = () => {
        if (!activeRun?.proposed_patch_json) return [];
        const patch = typeof activeRun.proposed_patch_json === 'string'
            ? JSON.parse(activeRun.proposed_patch_json)
            : activeRun.proposed_patch_json;

        const items: any[] = [];
        if (patch.interior_full_colour_fixed?.['16p']) {
            items.push({
                path: 'interior_full_colour_fixed.16p',
                category: 'Interior Print',
                label: '16p Signature Fixed Setup',
                currentValue: 120.0,
                proposedValue: patch.interior_full_colour_fixed['16p'],
                unit: '€',
                status: 'CALIBRATED'
            });
        }
        if (patch.cover_fixed_by_colours?.['4']) {
            items.push({
                path: 'cover_fixed_by_colours.4',
                category: 'Cover Print',
                label: '4-Colour Cover Fixed Setup',
                currentValue: 66.0,
                proposedValue: patch.cover_fixed_by_colours['4'],
                unit: '€',
                status: 'CALIBRATED'
            });
        }
        if (patch.paper_price_interior_by_kilo?.['offset']) {
            items.push({
                path: 'paper_price_interior_by_kilo.offset',
                category: 'Paper Stock',
                label: 'Offset Paper Stock per Kilo',
                currentValue: 1.252,
                proposedValue: patch.paper_price_interior_by_kilo['offset'],
                unit: '€/kg',
                status: 'CALIBRATED'
            });
        }
        if (patch.binding_pb_fixed_by_sections?.['16']) {
            items.push({
                path: 'binding_pb_fixed_by_sections.16',
                category: 'Binding',
                label: 'Perfect Bound Setup (16-page Sections)',
                currentValue: 0.164,
                proposedValue: patch.binding_pb_fixed_by_sections['16'],
                unit: '€/book',
                status: 'PRIOR_ANCHORED'
            });
        }
        return items;
    };

    if (!printerNodeId) {
        return (
            <div className="p-6 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center text-xs text-zinc-500">
                Please select a production node first to launch Quick Pricing Calibration.
            </div>
        );
    }

    const isReadyForCalculation = session?.status === 'READY';
    const isCalculated = Boolean(activeRun);
    const isAccepted = session?.status === 'ACCEPTED';

    return (
        <div className="space-y-6">
            {/* Header / Node Context Card (F2.3) */}
            <div className="p-5 bg-gradient-to-r from-red-950/10 via-zinc-50 to-white dark:from-red-950/30 dark:via-[#18181b] dark:to-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <Sparkles className="text-[#dc0000] w-5 h-5" />
                        <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                            Quick Pricing Calibration
                        </h3>
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                            {session?.status || 'LOCAL_DRAFT'}
                        </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                        Calibrating node: <span className="font-bold text-zinc-800 dark:text-zinc-200">{printerNodeName}</span> ({printerNodeId})
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => setShowHistoryModal(true)}
                        className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                        <History size={14} className="text-zinc-500" />
                        <span>Pricing Revisions</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setSession(null);
                            setActiveRun(null);
                            setMessages([]);
                            setExtractedFields([]);
                            setConfirmedFields([]);
                            setSuccessMessage('Local calibration workspace reset.');
                            setTimeout(() => setSuccessMessage(null), 3000);
                        }}
                        className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors shadow-2xs"
                        title="Reset calibration session"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Notifications */}
            {error && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-900 dark:text-red-200 flex items-center gap-2 font-medium">
                    <AlertTriangle size={16} className="text-red-600 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            {successMessage && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2 font-medium">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>{successMessage}</span>
                </div>
            )}

            {/* Main Interactive Split Layout (F2.22 Desktop 50/50) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Conversational Assistant */}
                <div className="space-y-4">
                    <CalibrationConversation
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        sending={sendingChat}
                        activeProposal={activeProposal}
                        onApplyProposal={handleApplyProposal}
                        onClarificationAnswer={handleClarificationAnswer}
                        aiUnavailable={aiUnavailable}
                    />
                </div>

                {/* Right Column: Structured Book Specification & Commercial Declaration */}
                <div className="space-y-4">
                    <CalibrationStructuredSummary
                        spec={draftSpec}
                        onFieldChange={(field, val) => setDraftSpec((prev: any) => ({ ...prev, [field]: val }))}
                        extractedFields={extractedFields}
                        confirmedFields={confirmedFields}
                        readOnly={isAccepted}
                    />

                    <CalibrationCommercialDeclaration
                        commercials={draftCommercials}
                        onChange={(field, val) => setDraftCommercials((prev: any) => ({ ...prev, [field]: val }))}
                        readOnly={isAccepted}
                        missingInclusions={draftCommercials.includesPaper === null || draftCommercials.includesBinding === null}
                    />
                </div>
            </div>

            {/* Warnings & Scope */}
            <CalibrationWarnings
                warnings={session?.warnings_json ? JSON.parse(session.warnings_json) : []}
                residual={activeRun?.absolute_residual}
                isCalculated={isCalculated}
            />

            {/* Execution / Action Bar */}
            <div className="p-5 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                        {isAccepted
                            ? 'Calibration Complete'
                            : isCalculated
                            ? 'Calibration Calculated & Ready for Review'
                            : isReadyForCalculation
                            ? 'Ready to Calibrate Rates'
                            : 'Complete Specification & Mark Ready'}
                    </span>
                    <p className="text-xs text-zinc-500 m-0 mt-0.5">
                        {isAccepted
                            ? 'Rates have been applied to the production node.'
                            : isCalculated
                            ? 'Review the rate comparison below and accept the pricing revision.'
                            : isReadyForCalculation
                            ? 'Click calculate to execute the deterministic inverse pricing solver.'
                            : 'Verify your physical spec and commercial inclusions before solving.'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {!isReadyForCalculation && !isCalculated && !isAccepted && (
                        <button
                            type="button"
                            onClick={handleMarkReady}
                            className="px-4 py-2.5 bg-[#dc0000] hover:bg-[#b00000] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                            <span>Ready to Calibrate</span>
                            <ArrowRight size={14} />
                        </button>
                    )}

                    {isReadyForCalculation && !isCalculated && !isAccepted && (
                        <button
                            type="button"
                            onClick={handleCalculate}
                            disabled={calculating}
                            className="px-5 py-2.5 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
                        >
                            <Calculator size={15} />
                            <span>{calculating ? 'Running Pricing Calibration...' : 'Calculate Starting Pricing'}</span>
                        </button>
                    )}

                    {isCalculated && !isAccepted && (
                        <button
                            type="button"
                            onClick={() => setShowAcceptModal(true)}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
                        >
                            <ShieldCheck size={16} />
                            <span>Review & Accept Pricing Revision</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Calculated Run Summary & Rate Comparison Table (F2.14, F2.15) */}
            {activeRun && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <CalibrationRunSummary
                        run={activeRun}
                        transportPricePerKg={draftCommercials.transportPricePerKg}
                        onExplain={handleExplainRun}
                        explaining={explaining}
                    />

                    <CalibrationRateComparison
                        items={getRateComparisonItems()}
                    />
                </div>
            )}

            {/* Governed Acceptance Confirmation Modal (F2.18) */}
            {activeRun && (
                <CalibrationAcceptanceModal
                    isOpen={showAcceptModal}
                    onClose={() => setShowAcceptModal(false)}
                    onConfirm={handleAcceptanceConfirm}
                    accepting={accepting}
                    nodeName={printerNodeName}
                    bookName={session?.reference_book_name || 'Reference Book'}
                    targetPrice={Number(activeRun.target_price)}
                    predictedPrice={Number(activeRun.predicted_manufacturing_price)}
                    residual={Number(activeRun.absolute_residual)}
                    error={error}
                />
            )}

            {/* Read-Only Revision History Drawer (F2.20) */}
            <PricingRevisionHistoryModal
                isOpen={showHistoryModal}
                onClose={() => setShowHistoryModal(false)}
                printerNodeId={printerNodeId}
            />
        </div>
    );
};
