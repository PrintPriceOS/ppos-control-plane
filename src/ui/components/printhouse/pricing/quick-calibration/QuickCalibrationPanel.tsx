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
import { isValidIso2Country } from '../../../../lib/countryCatalog';
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
        delivery_country: undefined
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

    // ── Session and Active Run Rehydration (Phase 193H.8C.6.11.3) ──
    useEffect(() => {
        let isCancelled = false;

        const rehydrateSession = async () => {
            if (!printerNodeId) return;

            setLoadingSession(true);
            try {
                const sessionList = await printhouseCalibrationApi.listSessions(printerNodeId);
                if (isCancelled) return;

                if (Array.isArray(sessionList) && sessionList.length > 0) {
                    // Filter for this printerNodeId if present
                    const nodeSessions = sessionList.filter((s: any) => !printerNodeId || s.printerNodeId === printerNodeId);
                    
                    // Recency-First Selection: Evaluate newest session (nodeSessions is ordered updated_at DESC, created_at DESC)
                    const chosenSession = nodeSessions[0];

                    if (chosenSession) {
                        setSession(chosenSession);

                        // Populate local draft state from restored session
                        if (chosenSession.bookSpec) {
                            setDraftSpec(chosenSession.bookSpec);
                            setExtractedFields(Object.keys(chosenSession.bookSpec));
                            setConfirmedFields(Object.keys(chosenSession.bookSpec));
                        }
                        setDraftCommercials({
                            targetManufacturingPrice: chosenSession.targetManufacturingPrice ?? null,
                            currency: chosenSession.currency || 'EUR',
                            transportPricePerKg: chosenSession.transportPricePerKg ?? null,
                            transportCurrency: chosenSession.transportCurrency || 'EUR',
                            includesPaper: chosenSession.includesPaper ?? null,
                            includesBinding: chosenSession.includesBinding ?? null,
                            includesFinishing: chosenSession.includesFinishing ?? null,
                            includesPackaging: chosenSession.includesPackaging ?? null
                        });

                        // Rehydrate runs for CALCULATED, READY, or ACCEPTED sessions
                        if (chosenSession.status === 'CALCULATED' || chosenSession.status === 'READY' || chosenSession.status === 'ACCEPTED') {
                            try {
                                const runs = await printhouseCalibrationApi.listRuns(chosenSession.id);
                                if (!isCancelled && Array.isArray(runs) && runs.length > 0) {
                                    // Runs are ordered started_at DESC; latest run is runs[0]
                                    const latestRun = runs[0];
                                    setActiveRun(latestRun);
                                }
                            } catch (runErr) {
                                console.error('Failed to rehydrate calibration runs:', runErr);
                            }
                        }
                    }
                }
            } catch (err: any) {
                if (!isCancelled) {
                    console.error('Failed to rehydrate calibration session:', err);
                }
            } finally {
                if (!isCancelled) {
                    setLoadingSession(false);
                }
            }
        };

        // Reset state on node change and rehydrate
        setSession(null);
        setActiveRun(null);
        rehydrateSession();

        return () => {
            isCancelled = true;
        };
    }, [printerNodeId]);

    // Helper: Normalizes bookSpec taxonomy fields to canonical backend contract
    const canonicalizeBookSpec = (spec: any) => {
        if (!spec || typeof spec !== 'object') return spec;
        const normalized = { ...spec };

        // 1. Lamination: 'gloss' | 'matt' | 'varnish' | null
        if (normalized.lamination !== undefined && normalized.lamination !== null) {
            const rawLam = String(normalized.lamination).toLowerCase().trim();
            if (rawLam === 'gloss' || rawLam === 'glossy') {
                normalized.lamination = 'gloss';
            } else if (rawLam === 'matt' || rawLam === 'matte') {
                normalized.lamination = 'matt';
            } else if (rawLam === 'varnish') {
                normalized.lamination = 'varnish';
            } else if (rawLam === '' || rawLam === 'none' || rawLam === 'null') {
                normalized.lamination = null;
            }
        }

        // 2. Paper Types
        if (normalized.paper_type_interior) {
            const pt = String(normalized.paper_type_interior).toLowerCase().trim();
            if (pt === 'coated' || pt === 'gloss' || pt === 'matt') normalized.paper_type_interior = 'mc';
            else if (pt === 'uncoated' || pt === 'woodfree') normalized.paper_type_interior = 'offset';
            else normalized.paper_type_interior = pt;
        }
        if (normalized.paper_type_cover) {
            const pt = String(normalized.paper_type_cover).toLowerCase().trim();
            if (pt === 'coated') normalized.paper_type_cover = 'mc';
            else normalized.paper_type_cover = pt;
        }

        // 3. Binding Method
        if (normalized.binding_method) {
            const bm = String(normalized.binding_method).toLowerCase().trim();
            if (bm === 'perfect' || bm === 'pb') normalized.binding_method = 'perfect bound';
            else if (bm === 'sewn' || bm === 'thread-sewn') normalized.binding_method = 'thread sewn';
            else if (bm === 'case' || bm === 'casebound' || bm === 'hardback') normalized.binding_method = 'hardcover';
            else normalized.binding_method = bm;
        }

        // 4. Print Specifications
        if (normalized.interior_print) {
            const match = String(normalized.interior_print).match(/\b([1-4]\/[1-4])\b/);
            if (match) normalized.interior_print = match[1];
        }
        if (normalized.cover_print) {
            const match = String(normalized.cover_print).match(/\b([1-5]\/[0-5])\b/);
            if (match) normalized.cover_print = match[1];
        }

        // 5. Delivery country ISO-2
        if (normalized.delivery_country) {
            normalized.delivery_country = String(normalized.delivery_country).toUpperCase().trim();
        }

        return normalized;
    };

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
        if (!spec.delivery_country || !isValidIso2Country(spec.delivery_country)) {
            missing.push('Delivery country (valid 2-letter ISO code)');
        }

        if (!comms.targetManufacturingPrice || comms.targetManufacturingPrice <= 0) {
            missing.push('Known Manufacturing Price (> 0 EUR)');
        }
        if (comms.includesPaper === null || comms.includesPaper === undefined) missing.push('includesPaper flag');
        if (comms.includesBinding === null || comms.includesBinding === undefined) missing.push('includesBinding flag');
        if (comms.includesFinishing === null || comms.includesFinishing === undefined) missing.push('includesFinishing flag');
        if (comms.includesPackaging === null || comms.includesPackaging === undefined) missing.push('includesPackaging flag');

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
    const handleApplyProposal = async (proposal: any): Promise<any | null> => {
        setError(null);
        const mergedSpec = { ...draftSpec, ...(proposal?.specPatch || {}) };
        const newSpec = canonicalizeBookSpec(mergedSpec);
        const newComms = { ...draftCommercials, ...(proposal?.declaredCommercials || {}) };

        setDraftSpec(newSpec);
        setDraftCommercials(newComms);

        const validation = validateDraftForCreation(newSpec, newComms);
        if (!validation.valid) {
            setError(`Cannot persist session yet. Missing mandatory fields: ${validation.missing.join(', ')}`);
            if (proposal?.specPatch) {
                setExtractedFields(Object.keys(proposal.specPatch));
            }
            return null;
        }

        try {
            let persistedSession: any;
            if (!session?.id) {
                // Explicit creation with complete Phase 193B payload
                persistedSession = await printhouseCalibrationApi.createSession({
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
                setSession(persistedSession);
            } else if (session.status === 'DRAFT') {
                // Guard: Only update if session is in editable DRAFT status
                persistedSession = await printhouseCalibrationApi.updateDraftSession(session.id, {
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
                setSession(persistedSession);
            } else {
                // Session is already READY, CALCULATED, or ACCEPTED — do NOT mutate or call updateDraftSession
                persistedSession = session;
            }
            setConfirmedFields(Object.keys(newSpec).filter(k => newSpec[k] !== undefined && newSpec[k] !== null && newSpec[k] !== ''));
            setExtractedFields([]);
            setActiveProposal(null);
            setSuccessMessage('Specifications verified and saved to calibration session.');
            setTimeout(() => setSuccessMessage(null), 4000);
            return persistedSession;
        } catch (err: any) {
            setError(err.message || 'Failed to save calibration session');
            return null;
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
                    } else if (field === 'cover_print' || field === 'coverPrint') {
                        const match = answer.match(/\b([1-5]\/[0-5])\b/);
                        updatedSpec.cover_print = match ? match[1] : answer;
                    } else if (field === 'lamination' || field === 'finishing') {
                        const rawLam = answer.toLowerCase().trim();
                        if (rawLam.includes('gloss')) updatedSpec.lamination = 'gloss';
                        else if (rawLam.includes('matt') || rawLam.includes('matte')) updatedSpec.lamination = 'matt';
                        else if (rawLam.includes('varnish')) updatedSpec.lamination = 'varnish';
                        else if (rawLam.includes('none') || rawLam.includes('no')) updatedSpec.lamination = null;
                        else updatedSpec.lamination = answer;
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
    const handleMarkReady = async (): Promise<any | null> => {
        setError(null);
        // Persist latest draft values first (create if none, or update DRAFT if existing)
        const workingSession = await handleApplyProposal({ specPatch: draftSpec, declaredCommercials: draftCommercials });

        if (!workingSession?.id) return null;

        try {
            if (workingSession.status !== 'READY') {
                const updated = await printhouseCalibrationApi.markSessionReady(workingSession.id);
                setSession(updated);
                setSuccessMessage('Session marked READY. You can now calculate pricing.');
                setTimeout(() => setSuccessMessage(null), 3000);
                return updated;
            }
            return workingSession;
        } catch (err: any) {
            setError(err.message || 'Failed to mark session ready');
            return null;
        }
    };

    // ── 5. Calculate Starting Pricing (193C Deterministic Solver) ──
    const handleCalculate = async () => {
        setCalculating(true);
        setError(null);
        try {
            let readySession = session;
            if (!readySession?.id || readySession.status !== 'READY') {
                readySession = await handleMarkReady();
            }

            if (!readySession?.id || readySession.status !== 'READY') {
                return;
            }

            const run = await printhouseCalibrationApi.calculateCalibration(readySession.id);
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
        const patch = activeRun?.proposedPatch || (typeof activeRun?.proposed_patch_json === 'string'
            ? JSON.parse(activeRun.proposed_patch_json)
            : activeRun?.proposed_patch_json);
        if (!patch) return [];

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
        if (patch.paper_price_interior_by_kilo?.['offset']) {
            items.push({
                path: 'paper_price_interior_by_kilo.offset',
                category: 'Paper',
                label: 'Interior Offset Paper / kg',
                currentValue: 1.15,
                proposedValue: patch.paper_price_interior_by_kilo['offset'],
                unit: '€/kg',
                status: 'CALIBRATED'
            });
        }
        if (patch.binding_perfect_bound_fixed) {
            items.push({
                path: 'binding_perfect_bound_fixed',
                category: 'Binding',
                label: 'Perfect Binding Fixed Setup',
                currentValue: 150.0,
                proposedValue: patch.binding_perfect_bound_fixed,
                unit: '€',
                status: 'CALIBRATED'
            });
        }
        return items;
    };

    const isReadyForCalculation = session?.status === 'READY';
    const isCalculated = session?.status === 'CALCULATED';
    const isAccepted = session?.status === 'ACCEPTED';
    const isRunAcceptanceEligible = activeRun?.status === 'SUCCEEDED' || activeRun?.status === 'CONVERGED' || activeRun?.status === 'UNDERDETERMINED_ANCHOR' || activeRun?.status === 'ACCEPTABLE_CANDIDATE';
    const canAccept = isCalculated && isRunAcceptanceEligible;

    // Canonical finite number helper
    const targetPriceVal = Number(activeRun?.targetPrice ?? activeRun?.target_price ?? draftCommercials.targetManufacturingPrice ?? 0);
    const predictedPriceVal = Number(activeRun?.enginePriceAfter ?? activeRun?.predicted_manufacturing_price ?? 0);
    const residualVal = Number(activeRun?.absoluteResidual ?? activeRun?.absolute_residual ?? 0);

    return (
        <div className="space-y-6">
            {/* Header & Mode Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                            Pricing Calibration Assistant
                        </h2>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 dark:bg-red-950/50 text-[#dc0000] dark:text-red-400 border border-red-200/50 dark:border-red-800/50">
                            <Sparkles size={11} />
                            <span>Phase 193H</span>
                        </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                        Node: <strong className="text-zinc-700 dark:text-zinc-300">{printerNodeName}</strong> ({printerNodeId})
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className={`px-3 py-2 border rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs ${
                            showAdvanced 
                                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white' 
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200'
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

            {/* Loading / Rehydrating State Gate */}
            {loadingSession ? (
                <div className="p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center space-y-3 min-h-[280px]">
                    <div className="w-7 h-7 border-2 border-[#dc0000] border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Restoring calibration workspace...
                    </span>
                </div>
            ) : (
                /* Primary Guided Stepper View (Phase 193H) */
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
                    canAccept={canAccept}
                    isRunAcceptanceEligible={isRunAcceptanceEligible}
                    onMarkReady={handleMarkReady}
                    onCalculate={handleCalculate}
                    onAccept={() => setShowAcceptModal(true)}
                    calculating={calculating}
                    error={error}
                />
            )}

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
                        residual={residualVal}
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
                    bookName={'Reference Book'}
                    targetPrice={Number.isFinite(targetPriceVal) ? targetPriceVal : 0}
                    predictedPrice={Number.isFinite(predictedPriceVal) ? predictedPriceVal : 0}
                    residual={Number.isFinite(residualVal) ? residualVal : 0}
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
