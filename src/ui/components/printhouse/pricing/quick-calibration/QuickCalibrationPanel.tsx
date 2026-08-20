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

    // ── Local Editable Draft Spec & Commercials ──
    const [draftSpec, setDraftSpec] = useState<any>({
        copies: 1000,
        book_width_mm: 170,
        book_height_mm: 240,
        interior_pages: 128,
        interior_print: '4/4',
        paper_type_interior: 'offset',
        paper_weight_interior: 80,
        cover_print: '4/0',
        paper_type_cover: 'mc',
        paper_weight_cover: 300,
        lamination: 'matt',
        binding_method: 'perfect bound',
        delivery_country: 'ES'
    });

    const [draftCommercials, setDraftCommercials] = useState<any>({
        targetManufacturingPrice: 2450.0,
        currency: 'EUR',
        transportPricePerKg: 0.950,
        transportCurrency: 'EUR',
        includesPaper: true,
        includesBinding: true,
        includesFinishing: true,
        includesPackaging: false
    });

    // ── Tracking Metadata ──
    const [extractedFields, setExtractedFields] = useState<string[]>([]);
    const [confirmedFields, setConfirmedFields] = useState<string[]>([]);

    // ── Modals Visibility ──
    const [showAcceptModal, setShowAcceptModal] = useState(false);
    const [accepting, setAccepting] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Initialize or load active calibration session
    useEffect(() => {
        if (printerNodeId) {
            initSession();
        }
    }, [printerNodeId]);

    const initSession = async () => {
        if (!printerNodeId) return;
        setLoadingSession(true);
        setError(null);
        try {
            const newSession = await printhouseCalibrationApi.createSession(
                printerNodeId,
                'Quick Calibration Book'
            );
            setSession(newSession);
            if (newSession.book_spec_json) {
                try {
                    const parsed = typeof newSession.book_spec_json === 'string'
                        ? JSON.parse(newSession.book_spec_json)
                        : newSession.book_spec_json;
                    if (Object.keys(parsed).length > 0) {
                        setDraftSpec(parsed);
                    }
                } catch (e) {}
            }
            if (newSession.target_manufacturing_price) {
                setDraftCommercials((prev: any) => ({
                    ...prev,
                    targetManufacturingPrice: newSession.target_manufacturing_price,
                    includesPaper: newSession.includes_paper,
                    includesBinding: newSession.includes_binding,
                    includesFinishing: newSession.includes_finishing,
                    includesPackaging: newSession.includes_packaging
                }));
            }
        } catch (err: any) {
            setError(err.message || 'Failed to initialize calibration session');
        } finally {
            setLoadingSession(false);
        }
    };

    // ── 1. Conversational Chat (193E Zero-Write) ──
    const handleSendMessage = async (text: string) => {
        if (!session?.id) return;
        setSendingChat(true);
        setError(null);

        // Append user message locally
        const userMsg = { role: 'user' as const, text, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);

        try {
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

                // Track extracted fields in memory
                if (result.proposal.specPatch) {
                    setExtractedFields(Object.keys(result.proposal.specPatch));
                }
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

    // ── 2. Explicit Apply Proposal (193B Session Update) ──
    const handleApplyProposal = async (proposal: any) => {
        if (!session?.id || !proposal) return;
        setError(null);

        const newSpec = { ...draftSpec, ...(proposal.specPatch || {}) };
        const newComms = { ...draftCommercials, ...(proposal.declaredCommercials || {}) };

        setDraftSpec(newSpec);
        setDraftCommercials(newComms);

        try {
            const updated = await printhouseCalibrationApi.updateDraftSession(session.id, {
                bookSpec: newSpec,
                targetManufacturingPrice: newComms.targetManufacturingPrice,
                currency: newComms.currency || 'EUR',
                transportPricePerKg: newComms.transportPricePerKg,
                transportCurrency: newComms.transportCurrency || 'EUR',
                includesPaper: newComms.includesPaper,
                includesBinding: newComms.includesBinding,
                includesFinishing: newComms.includesFinishing,
                includesPackaging: newComms.includesPackaging
            });
            setSession(updated);
            setConfirmedFields(Object.keys(proposal.specPatch || {}));
            setExtractedFields([]);
            setActiveProposal(null);
            setSuccessMessage('Extracted specifications successfully applied to reference book.');
            setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err: any) {
            setError(err.message || 'Failed to update draft session');
        }
    };

    // ── 3. Clarification Answer ──
    const handleClarificationAnswer = (field: string, answer: any) => {
        if (field.startsWith('includes')) {
            const val = typeof answer === 'string' ? answer.toLowerCase().includes('yes') || answer.toLowerCase().includes('included') : Boolean(answer);
            setDraftCommercials((prev: any) => ({ ...prev, [field]: val }));
        } else {
            setDraftSpec((prev: any) => ({ ...prev, [field]: answer }));
        }
    };

    // ── 4. Ready to Calibrate Transition (193B) ──
    const handleMarkReady = async () => {
        if (!session?.id) return;
        setError(null);
        try {
            // First save any unsaved draft fields
            await printhouseCalibrationApi.updateDraftSession(session.id, {
                bookSpec: draftSpec,
                targetManufacturingPrice: draftCommercials.targetManufacturingPrice,
                currency: draftCommercials.currency,
                transportPricePerKg: draftCommercials.transportPricePerKg,
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
                            {session?.status || 'INITIALIZING'}
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
                        onClick={initSession}
                        disabled={loadingSession}
                        className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors shadow-2xs"
                        title="Reset calibration session"
                    >
                        <RefreshCw size={14} className={loadingSession ? 'animate-spin' : ''} />
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
