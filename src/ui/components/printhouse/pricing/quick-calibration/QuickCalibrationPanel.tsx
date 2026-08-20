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
import { GuidedCalibrationWizard } from './GuidedCalibrationWizard';
import { GovernedQuoteSmokeTest } from './GovernedQuoteSmokeTest';
import { CalibrationStructuredSummary } from './CalibrationStructuredSummary';
import { CalibrationCommercialDeclaration } from './CalibrationCommercialDeclaration';
import { CalibrationRunSummary } from './CalibrationRunSummary';
import { CalibrationRateComparison } from './CalibrationRateComparison';
import { CalibrationWarnings } from './CalibrationWarnings';
import { CalibrationAcceptanceModal } from './CalibrationAcceptanceModal';
import { PricingRevisionHistoryModal } from './PricingRevisionHistoryModal';
import { 
    Sparkles, RefreshCw, Calculator, ShieldCheck, CheckCircle2, 
    AlertTriangle, History, ArrowRight, X, Layers, CheckCircle, 
    Sliders, ChevronDown, ChevronUp 
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

    // ── Advanced / Power User View Toggle ──
    const [showAdvanced, setShowAdvanced] = useState(false);

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
        lamination: undefined,
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
            let result: any;
            if (session?.id) {
                result = await printhouseCalibrationApi.assistantChat(session.id, text);
            } else {
                result = await printhouseCalibrationApi.interpretPreSession(text);
            }

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
                    const extracted = Object.keys(result.proposal.specPatch);
                    setExtractedFields(extracted);
                    // Update in-memory draft with extracted fields immediately for review
                    setDraftSpec((prev: any) => ({ ...prev, ...result.proposal.specPatch }));
                }
                if (result.proposal.declaredCommercials) {
                    setDraftCommercials((prev: any) => ({ ...prev, ...result.proposal.declaredCommercials }));
                }
            }
        } catch (err: any) {
            if (err.code === 'AI_PROVIDER_UNAVAILABLE' || err.code === 'AI_PROVIDER_TIMEOUT' || err.code === 'AI_RATE_LIMITED' || err.status === 503 || err.status === 504 || err.status === 429) {
                setAiUnavailable(true);
                const systemMsg = {
                    role: 'assistant' as const,
                    text: 'The AI assistant is temporarily busy. Your setup is completely safe and nothing has been saved. You can try sending again in a moment, or continue entering your job details in Step 2.',
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

    // ── 3. Clarification Answer & Apply (Phase 193H.4 Merge Preservation) ──
    const handleApplyClarifications = (answers: Record<string, string>) => {
        const readableSummaryParts: string[] = [];

        setDraftSpec((prevSpec: any) => {
            const updatedSpec = { ...prevSpec };

            setDraftCommercials((prevComms: any) => {
                const updatedComms = { ...prevComms };

                Object.entries(answers).forEach(([field, answer]) => {
                    if (!answer || !answer.trim()) return;

                    readableSummaryParts.push(answer);

                    if (field.startsWith('includes')) {
                        const val = answer.toLowerCase().includes('yes') || answer.toLowerCase().includes('included') || answer.toLowerCase().includes('net') || answer.toLowerCase().includes('excluding');
                        updatedComms[field] = val;
                    } else if (field === 'cover_structure' || field === 'cover_type') {
                        if (answer.toLowerCase().includes('self-cover') || answer.toLowerCase().includes('self cover')) {
                            updatedSpec.paper_weight_cover = updatedSpec.paper_weight_interior || 130;
                            updatedSpec.paper_type_cover = updatedSpec.paper_type_interior || 'mc';
                            updatedSpec.cover_print = updatedSpec.interior_print || '4/4';
                        } else if (answer.toLowerCase().includes('separate') || answer.toLowerCase().includes('300')) {
                            updatedSpec.paper_weight_cover = 300;
                            updatedSpec.paper_type_cover = 'mc';
                            updatedSpec.cover_print = '4/0';
                        }
                    } else if (field === 'price_vat' || field === 'tax_inclusion') {
                        const isNet = answer.toLowerCase().includes('net') || answer.toLowerCase().includes('excluding');
                        updatedComms.isNetPrice = isNet;
                    } else if (field === 'delivery_country' || field === 'destination') {
                        const match = answer.match(/\b([A-Z]{2})\b/i);
                        updatedSpec.delivery_country = match ? match[1].toUpperCase() : answer;
                    } else {
                        updatedSpec[field] = answer;
                    }
                });

                return updatedComms;
            });

            return updatedSpec;
        });

        // Add human-readable user message trace to conversation
        if (readableSummaryParts.length > 0) {
            const userMsg = {
                role: 'user' as const,
                text: readableSummaryParts.join('; '),
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, userMsg]);
        }

        // Dismiss answered clarification questions from active proposal
        setActiveProposal((prev: any) => {
            if (!prev) return null;
            return {
                ...prev,
                clarificationQuestions: []
            };
        });
    };

    // ── 4. Mark Ready (193B Transition) ──
    const handleMarkReady = async () => {
        setError(null);
        const validation = validateDraftForCreation(draftSpec, draftCommercials);
        if (!validation.valid) {
            setError(`Please complete all required fields: ${validation.missing.join(', ')}`);
            return;
        }

        try {
            if (!session?.id) {
                await handleApplyProposal({ specPatch: draftSpec, declaredCommercials: draftCommercials });
            }
            if (session?.id) {
                const updated = await printhouseCalibrationApi.markSessionReady(session.id);
                setSession(updated);
                setSuccessMessage('Session marked READY. You can now calculate pricing.');
                setTimeout(() => setSuccessMessage(null), 3000);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to mark session ready');
        }
    };

    // ── 5. Calculate Starting Pricing (193C Deterministic Solver) ──
    const handleCalculate = async () => {
        if (!session?.id) {
            await handleMarkReady();
        }
        if (!session?.id) return;

        setCalculating(true);
        setError(null);
        try {
            const run = await printhouseCalibrationApi.calculateCalibration(session.id);
            setActiveRun(run);
            setSuccessMessage(`Calibration completed with residual of ${run.absolute_residual} EUR.`);
            setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err: any) {
            setError(err.message || 'Pricing calibration calculation failed.');
        } finally {
            setCalculating(false);
        }
    };

    // ── 6. Governed Acceptance (193D Revision Creation) ──
    const handleAcceptanceConfirm = async () => {
        if (!session?.id || !activeRun?.id) return;
        setAccepting(true);
        setError(null);
        try {
            const accepted = await printhouseCalibrationApi.acceptCalibrationRun(session.id, activeRun.id);
            setSession(accepted);
            setShowAcceptModal(false);
            setSuccessMessage(`Calibration run accepted! Immutable revision created.`);
            setTimeout(() => setSuccessMessage(null), 5000);
            onAccepted?.();
        } catch (err: any) {
            let userMsg = err.message || 'Failed to accept calibration run';
            if (err.code === 'BASELINE_DRIFT_DETECTED') {
                userMsg = 'Underlying rates have changed since this calibration run was calculated. Please re-run calibration.';
            } else if (err.code === 'CALIBRATION_ACCEPTANCE_TOLERANCE_EXCEEDED') {
                userMsg = 'Proposal residual exceeds permitted acceptance tolerance.';
            }
            setError(userMsg);
        } finally {
            setAccepting(false);
        }
    };

    // ── Rate Comparison Mapper ──
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

    const isCalculated = Boolean(activeRun);
    const isAccepted = session?.status === 'ACCEPTED';
    const isReadyForCalculation = session?.status === 'READY';

    return (
        <div className="space-y-6">
            {/* Header / Node Context Card */}
            <div className="p-5 bg-gradient-to-r from-red-950/10 via-zinc-50 to-white dark:from-red-950/30 dark:via-[#18181b] dark:to-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <Sparkles className="text-[#dc0000] w-5 h-5" />
                        <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                            Guided Pricing Setup
                        </h3>
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                            {isAccepted ? 'PRICING CALIBRATED' : isCalculated ? 'READY FOR ACCEPTANCE' : session?.status || 'LOCAL_DRAFT'}
                        </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                        Calibrating node: <span className="font-bold text-zinc-800 dark:text-zinc-200">{printerNodeName}</span> ({printerNodeId})
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className={`px-3 py-2 border rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs ${
                            showAdvanced 
                                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900' 
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50'
                        }`}
                    >
                        <Sliders size={14} />
                        <span>{showAdvanced ? 'Hide Advanced' : 'Advanced Details'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowHistoryModal(true)}
                        className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                        <History size={14} className="text-zinc-500" />
                        <span>Revisions</span>
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

            {/* Primary Guided Stepper View (Phase 193H) */}
            <GuidedCalibrationWizard
                printerNodeId={printerNodeId}
                printerNodeName={printerNodeName}
                draftSpec={draftSpec}
                setDraftSpec={setDraftSpec}
                draftCommercials={draftCommercials}
                setDraftCommercials={setDraftCommercials}
                messages={messages}
                onSendMessage={handleSendMessage}
                sendingChat={sendingChat}
                activeProposal={activeProposal}
                aiUnavailable={aiUnavailable}
                onApplyProposal={handleApplyProposal}
                onApplyClarifications={handleApplyClarifications}
                session={session}
                activeRun={activeRun}
                isReady={isReadyForCalculation}
                isCalculated={isCalculated}
                isAccepted={isAccepted}
                onMarkReady={handleMarkReady}
                onCalculate={handleCalculate}
                onAccept={() => setShowAcceptModal(true)}
                calculating={calculating}
                error={error}
            />

            {/* Advanced / Power User Drawer (Progressive Disclosure) */}
            {showAdvanced && (
                <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-6 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                                Advanced Physical Specification & Provenance Matrix
                            </h4>
                            <p className="text-xs text-zinc-500">
                                Low-level parameter mapping and inverse solver calibration telemetry.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

                    <CalibrationWarnings
                        warnings={session?.warnings_json ? JSON.parse(session.warnings_json) : []}
                        residual={activeRun?.absolute_residual}
                        isCalculated={isCalculated}
                    />

                    {activeRun && (
                        <div className="space-y-6">
                            <CalibrationRunSummary
                                run={activeRun}
                                transportPricePerKg={draftCommercials.transportPricePerKg}
                                onExplain={async () => {}}
                                explaining={explaining}
                            />

                            <CalibrationRateComparison
                                items={getRateComparisonItems()}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Governed Acceptance Confirmation Modal */}
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

            {/* Read-Only Revision History Drawer */}
            <PricingRevisionHistoryModal
                isOpen={showHistoryModal}
                onClose={() => setShowHistoryModal(false)}
                printerNodeId={printerNodeId}
            />
        </div>
    );
};
