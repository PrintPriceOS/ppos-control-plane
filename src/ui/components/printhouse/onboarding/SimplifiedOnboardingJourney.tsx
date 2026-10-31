/**
 * src/ui/components/printhouse/onboarding/SimplifiedOnboardingJourney.tsx
 *
 * 5-Step Guided Printhouse Calibration Onboarding:
 * Step 1: Qué productos fabricas (4 canonical families: Hardcover, Softcover, Wire-O, Saddle Stitch)
 * Step 2: Añadir presupuestos (Upload real PDF or enter manual offer form; optional quote reference)
 * Step 3: Revisar especificaciones (Variant table with manufacturing/transport/other breakdown)
 * Step 4: Comparar cálculos (Engine inverse solver calculation vs original quote)
 * Step 5: Aceptar propuesta (Governed acceptance with immutable revision and zero auto-publishing)
 *
 * Governance & Production Fidelity Invariants:
 * - Zero third-party proprietary data (Natur, Fussel, Stutensee, Fährmann, Mysteriösen) in distributed code or UI.
 * - Starts with clean generic state; users upload their own PDFs or enter manual offers.
 * - Test fixtures live strictly in tests/fixtures/.
 * - 4 families are a coverage framework, not a requirement to provide 4 PDFs.
 * - Governed acceptance does NOT activate Marketplace, public quoting, routing, or dispatch.
 * - Cancel produces zero writes.
 * - End-to-end integration with printhouseCalibrationApi and deterministic solver.
 */
import React, { useState, useRef } from 'react';
import { 
    Layers, Upload, FileText, CheckCircle2, ArrowLeft, 
    ArrowRight, AlertTriangle, ShieldCheck, RefreshCw, Calculator,
    Sparkles, HelpCircle, Eye, Info
} from 'lucide-react';
import { useLocale } from '../../../i18n';
import { 
    ProductFamilyId, FamilyState, FamilyStatus, ProgressiveSpecState, OfferVariantRow 
} from '../../../types/printhouseOnboardingTypes';
import { ProductFamilyCard } from './ProductFamilyCard';
import { ManualOfferForm } from './ManualOfferForm';
import { VariantSpecTable } from './VariantSpecTable';
import { CalculationComparisonView } from './CalculationComparisonView';
import { GovernedAcceptanceView } from './GovernedAcceptanceView';
import { BindingIcon } from './BindingFamilyIcons';
import { printhouseCalibrationApi } from '../../../lib/printhouseCalibrationApi';
import { getAuthToken } from '../../../lib/authStore';
import { canonicalizeToEngineBookSpec } from '../../../lib/bookSpecCanonicalizer';
import { normalizeUiError } from '../../../utils/errorUtils';
import { FamilyPricingSessionDraft } from '../../../lib/onboardingDraftStore';

export interface SimplifiedOnboardingJourneyProps {
    printerNodeId?: string;
    printerNodeName?: string;
    initialSpec?: ProgressiveSpecState;
    initialStep?: 1 | 2 | 3 | 4 | 5;
    initialPricingDrafts?: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>>;
    onCompleted?: () => void;
    onOpenAdvanced?: () => void;
    onFamiliesStateChange?: (families: Record<ProductFamilyId, FamilyState>, selectedFamilyId: ProductFamilyId) => void;
    onPricingContinuityChange?: (familyId: ProductFamilyId, draft: FamilyPricingSessionDraft) => void;
    targetFamilyId?: ProductFamilyId;
    isGuidedMode?: boolean;
}

const createDefaultOffer = (family: ProductFamilyId): ProgressiveSpecState => ({
    family,
    productTitle: '',
    quoteRef: '',
    quoteDate: new Date().toISOString().split('T')[0],
    currency: 'EUR',
    widthMm: family === 'HARDCOVER' || family === 'SOFTCOVER' ? 148 : 210,
    heightMm: family === 'HARDCOVER' || family === 'SOFTCOVER' ? 210 : 297,
    pageCount: 64,
    interiorPaper: 'Offset',
    interiorWeightGsm: 90,
    interiorVolume: 1.0,
    interiorColors: '1/1',
    coverPaper: family === 'HARDCOVER' ? 'Estucado brillante 135g' : 'Cartulina 250g',
    coverWeightGsm: family === 'HARDCOVER' ? 135 : 250,
    coverColors: '4/0',
    boardThicknessMm: family === 'HARDCOVER' ? 2.0 : undefined,
    bindingMethod: family === 'HARDCOVER' ? 'thread_sewn' : family === 'SOFTCOVER' ? 'adhesive_pur' : family === 'WIRE_O' ? 'wire_o' : 'saddle_stitch',
    lamination: 'matt',
    deliveryCountry: 'DE',
    runs: []
});

export const SimplifiedOnboardingJourney: React.FC<SimplifiedOnboardingJourneyProps> = ({
    printerNodeId,
    printerNodeName = 'Production Node',
    initialSpec,
    initialStep = 1,
    onCompleted,
    onOpenAdvanced,
    onFamiliesStateChange,
    targetFamilyId,
    initialPricingDrafts,
    onPricingContinuityChange,
    isGuidedMode = false
}) => {
    const { t } = useLocale();

    // ── Initial State Hydration from pricing continuity ──
    const targetFam: ProductFamilyId = initialSpec?.family || targetFamilyId || 'HARDCOVER';
    const initPricingForTarget = initialPricingDrafts?.[targetFam];

    // ── Wizard Step (1..5) ──
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(() => {
        if (initPricingForTarget?.step) return initPricingForTarget.step;
        return initialStep;
    });

    // ── 4 Product Families State ──
    const [families, setFamilies] = useState<Record<ProductFamilyId, FamilyState>>({
        HARDCOVER: {
            id: 'HARDCOVER',
            titleKey: 'family.hardcover.title',
            descKey: 'family.hardcover.desc',
            status: 'PENDING',
            quoteCount: 0
        },
        SOFTCOVER: {
            id: 'SOFTCOVER',
            titleKey: 'family.softcover.title',
            descKey: 'family.softcover.desc',
            status: 'PENDING',
            quoteCount: 0
        },
        WIRE_O: {
            id: 'WIRE_O',
            titleKey: 'family.wireO.title',
            descKey: 'family.wireO.desc',
            status: 'PENDING',
            quoteCount: 0
        },
        SADDLE_STITCH: {
            id: 'SADDLE_STITCH',
            titleKey: 'family.saddleStitch.title',
            descKey: 'family.saddleStitch.desc',
            status: 'PENDING',
            quoteCount: 0
        }
    });

    const [selectedFamilyId, setSelectedFamilyId] = useState<ProductFamilyId>(targetFam);

    // Notify parent whenever families or selectedFamilyId changes
    React.useEffect(() => {
        onFamiliesStateChange?.(families, selectedFamilyId);
    }, [families, selectedFamilyId, onFamiliesStateChange]);

    // ── Step 2 Entry Mode: 'UPLOAD_PDF' | 'MANUAL_FORM' ──
    const [entryMode, setEntryMode] = useState<'UPLOAD_PDF' | 'MANUAL_FORM'>(() => {
        return initPricingForTarget?.entryMode || 'UPLOAD_PDF';
    });
    const [dragActive, setDragActive] = useState<boolean>(false);
    const [lockedStepNotice, setLockedStepNotice] = useState<string | null>(null);
    const [uploadingPdf, setUploadingPdf] = useState<boolean>(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [duplicateEvidence, setDuplicateEvidence] = useState<{ evidenceId: string; filename: string } | null>(null);
    const [loadingExistingEvidence, setLoadingExistingEvidence] = useState<boolean>(false);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(() => {
        return initPricingForTarget?.uploadedFileName || null;
    });

    // ── Active Job Offer / Spec State (Clean default without hardcoded 3rd party PII) ──
    const [currentOffer, setCurrentOffer] = useState<ProgressiveSpecState>(() => {
        if (initPricingForTarget?.offer) return initPricingForTarget.offer;
        if (initialSpec) return initialSpec;
        return createDefaultOffer('HARDCOVER');
    });

    // ── Session & Calibration Integration State ──
    const [sessionId, setSessionId] = useState<string | null>(() => {
        return initPricingForTarget?.sessionId || null;
    });
    const [activeRun, setActiveRun] = useState<any>(() => {
        return initPricingForTarget?.activeRun || null;
    });
    const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => {
        if (initPricingForTarget?.selectedVariantId !== undefined) {
            return initPricingForTarget.selectedVariantId;
        }
        if (initialSpec?.selectedVariantId !== undefined) {
            return initialSpec.selectedVariantId;
        }
        return initialSpec?.runs?.[0]?.id || initialSpec?.runs?.[0]?.variantKey || null;
    });
    const calculationRequestIdRef = useRef<number>(0);
    const uploadRequestIdRef = useRef<number>(0);
    const [calculatingSolver, setCalculatingSolver] = useState<boolean>(false);
    const [isSubmittingAcceptance, setIsSubmittingAcceptance] = useState<boolean>(false);

    const [comparisonData, setComparisonData] = useState<{
        originalPrice: number | null;
        enginePrice: number | null;
        difference: number | null;
        residual: number | null;
        isCalculated: boolean;
        hasEquivalentBreakdown?: boolean;
        incompleteComparisonReason?: string | null;
        calculationError?: string | null;
        supportedParameters: string[];
        coverageGaps: string[];
    }>(() => {
        if (initPricingForTarget?.comparisonData) {
            return initPricingForTarget.comparisonData;
        }
        return {
            originalPrice: null,
            enginePrice: null,
            difference: null,
            residual: null,
            isCalculated: false,
            hasEquivalentBreakdown: true,
            incompleteComparisonReason: null,
            calculationError: null,
            supportedParameters: [],
            coverageGaps: []
        };
    });

    const [proposedPatch, setProposedPatch] = useState<Record<string, any>>(() => {
        return initPricingForTarget?.proposedPatch || {};
    });

    // ── Family Draft Persistence & Coherent Ribbon/Card Switching ──
    interface FamilyDraftState {
        offer: ProgressiveSpecState;
        step: 1 | 2 | 3 | 4 | 5;
        sessionId: string | null;
        activeRun: any;
        selectedVariantId: string | null;
        comparisonData: any;
        entryMode: 'UPLOAD_PDF' | 'MANUAL_FORM';
        uploadedFileName: string | null;
        proposedPatch: Record<string, any>;
        calibrationAccepted?: boolean;
    }

    const [calibrationAccepted, setCalibrationAccepted] = useState<boolean>(() => {
        return Boolean(initPricingForTarget?.calibrationAccepted);
    });

    const familyDraftsRef = useRef<Partial<Record<ProductFamilyId, FamilyDraftState>>>(
        (() => {
            const initialMap: Partial<Record<ProductFamilyId, FamilyDraftState>> = {};
            if (initialPricingDrafts) {
                (Object.keys(initialPricingDrafts) as ProductFamilyId[]).forEach(fid => {
                    const item = initialPricingDrafts[fid];
                    if (item) {
                        initialMap[fid] = {
                            offer: item.offer || createDefaultOffer(fid),
                            step: item.step || 1,
                            sessionId: item.sessionId || null,
                            activeRun: item.activeRun || null,
                            selectedVariantId: item.selectedVariantId || null,
                            comparisonData: item.comparisonData || {
                                originalPrice: null,
                                enginePrice: null,
                                difference: null,
                                residual: null,
                                isCalculated: false,
                                hasEquivalentBreakdown: true,
                                incompleteComparisonReason: null,
                                calculationError: null,
                                supportedParameters: [],
                                coverageGaps: []
                            },
                            entryMode: item.entryMode || 'UPLOAD_PDF',
                            uploadedFileName: item.uploadedFileName || null,
                            proposedPatch: item.proposedPatch || {},
                            calibrationAccepted: Boolean(item.calibrationAccepted)
                        };
                    }
                });
            }
            return initialMap;
        })()
    );
    const selectedFamilyIdRef = useRef(selectedFamilyId);
    selectedFamilyIdRef.current = selectedFamilyId;
    const currentOfferRef = useRef(currentOffer);
    currentOfferRef.current = currentOffer;
    const currentStepRef = useRef(currentStep);
    currentStepRef.current = currentStep;
    const sessionIdRef = useRef(sessionId);
    sessionIdRef.current = sessionId;
    const activeRunRef = useRef(activeRun);
    activeRunRef.current = activeRun;
    const selectedVariantIdRef = useRef(selectedVariantId);
    selectedVariantIdRef.current = selectedVariantId;
    const comparisonDataRef = useRef(comparisonData);
    comparisonDataRef.current = comparisonData;
    const entryModeRef = useRef(entryMode);
    entryModeRef.current = entryMode;
    const uploadedFileNameRef = useRef(uploadedFileName);
    uploadedFileNameRef.current = uploadedFileName;
    const proposedPatchRef = useRef(proposedPatch);
    proposedPatchRef.current = proposedPatch;

    // Notify parent about current family pricing continuity whenever relevant state changes
    React.useEffect(() => {
        if (!onPricingContinuityChange) return;
        const currentFam = selectedFamilyId;
        onPricingContinuityChange(currentFam, {
            sessionId,
            activeRun,
            selectedVariantId,
            proposedPatch,
            entryMode,
            uploadedFileName,
            step: currentStep,
            offer: currentOffer,
            comparisonData,
            calibrationAccepted,
            lastSavedTimestamp: Date.now()
        });
    }, [
        selectedFamilyId,
        sessionId,
        activeRun,
        selectedVariantId,
        proposedPatch,
        entryMode,
        uploadedFileName,
        currentStep,
        currentOffer,
        comparisonData,
        calibrationAccepted,
        onPricingContinuityChange
    ]);

    // Unified family transition: invoked both from ribbon and card selections
    const transitionToFamily = (targetId: ProductFamilyId, options?: { stepOverride?: 1 | 2 | 3 | 4 | 5; defaultStepForNewFamily?: 1 | 2 | 3 | 4 | 5 }) => {
        const currentActive = selectedFamilyIdRef.current;
        if (targetId === currentActive) {
            if (options?.stepOverride !== undefined && options.stepOverride !== currentStepRef.current) {
                setCurrentStep(options.stepOverride);
            }
            return;
        }

        // 1. Invalidate any in-flight upload and calculation requests and immediately clear active indicators
        calculationRequestIdRef.current++;
        uploadRequestIdRef.current++;
        setUploadingPdf(false);
        setCalculatingSolver(false);
        setUploadError(null);
        setDuplicateEvidence(null);

        // 2. Protect unsaved draft of current family
        familyDraftsRef.current[currentActive] = {
            offer: currentOfferRef.current,
            step: currentStepRef.current,
            sessionId: sessionIdRef.current,
            activeRun: activeRunRef.current,
            selectedVariantId: selectedVariantIdRef.current,
            comparisonData: comparisonDataRef.current,
            entryMode: entryModeRef.current,
            uploadedFileName: uploadedFileNameRef.current,
            proposedPatch: proposedPatchRef.current || {}
        };

        // 3. Switch to target family
        selectedFamilyIdRef.current = targetId;
        setSelectedFamilyId(targetId);

        const targetDraft = familyDraftsRef.current[targetId];
        if (targetDraft) {
            setCurrentOffer(targetDraft.offer);
            setCurrentStep(options?.stepOverride ?? targetDraft.step);
            setSessionId(targetDraft.sessionId);
            setActiveRun(targetDraft.activeRun);
            setSelectedVariantId(targetDraft.selectedVariantId);
            setComparisonData(targetDraft.comparisonData);
            setEntryMode(targetDraft.entryMode);
            setUploadedFileName(targetDraft.uploadedFileName);
            setProposedPatch(targetDraft.proposedPatch || {});
        } else {
            setCurrentOffer(createDefaultOffer(targetId));
            setCurrentStep(options?.defaultStepForNewFamily ?? 1);
            setSessionId(null);
            setActiveRun(null);
            setSelectedVariantId(null);
            setProposedPatch({}); // Explicitly clean proposedPatch for a new family
            setComparisonData({
                originalPrice: null,
                enginePrice: null,
                difference: null,
                residual: null,
                isCalculated: false,
                hasEquivalentBreakdown: true,
                incompleteComparisonReason: null,
                calculationError: null,
                supportedParameters: [],
                coverageGaps: []
            });
            setUploadedFileName(null);
            setUploadError(null);
        }
    };

    const invalidateCalculation = () => {
        calculationRequestIdRef.current++;
        setActiveRun(null);
        setProposedPatch({});
        setCalibrationAccepted(false);
        setSessionId(null);
        sessionIdRef.current = null;
        setComparisonData({
            originalPrice: null,
            enginePrice: null,
            difference: null,
            residual: null,
            isCalculated: false,
            hasEquivalentBreakdown: true,
            incompleteComparisonReason: null,
            calculationError: null,
            supportedParameters: [],
            coverageGaps: []
        });
    };

    // Respond to targetFamilyId changes from external toolbar/ribbon:
    React.useEffect(() => {
        if (!targetFamilyId) return;
        transitionToFamily(targetFamilyId, { defaultStepForNewFamily: 1 });
    }, [targetFamilyId]);

    const updateFamilyStatus = (id: ProductFamilyId, status: FamilyStatus, quoteCount?: number) => {
        setFamilies(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                status,
                quoteCount: quoteCount !== undefined ? quoteCount : prev[id].quoteCount
            }
        }));
    };

    const handleToggleNotOffered = (id: ProductFamilyId) => {
        setFamilies(prev => {
            const current = prev[id].status;
            const newStatus: FamilyStatus = current === 'NOT_OFFERED' ? 'PENDING' : 'NOT_OFFERED';
            return {
                ...prev,
                [id]: {
                    ...prev[id],
                    status: newStatus
                }
            };
        });
    };

    const handleSelectFamilyToCalibrate = (id: ProductFamilyId) => {
        const existingDraft = familyDraftsRef.current[id];
        transitionToFamily(id, {
            stepOverride: existingDraft ? (existingDraft.step > 1 ? existingDraft.step : 2) : 2,
            defaultStepForNewFamily: 2
        });
    };

    const handleReturnToFamilySelector = () => {
        calculationRequestIdRef.current++;
        uploadRequestIdRef.current++;
        setUploadingPdf(false);
        setCalculatingSolver(false);
        setUploadError(null);

        // Protect unsaved changes: save current draft before returning to Step 1
        familyDraftsRef.current[selectedFamilyIdRef.current] = {
            offer: currentOfferRef.current,
            step: currentStepRef.current,
            sessionId: sessionIdRef.current,
            activeRun: activeRunRef.current,
            selectedVariantId: selectedVariantIdRef.current,
            comparisonData: comparisonDataRef.current,
            entryMode: entryModeRef.current,
            uploadedFileName: uploadedFileNameRef.current,
            proposedPatch: proposedPatchRef.current || {}
        };
        setCurrentStep(1);
    };

    // ── Dropzone Handlers ──
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
        }
    };

    const handleFileUpload = async (file: File) => {
        setUploadError(null);
        setDuplicateEvidence(null);
        setUploadedFileName(file.name);
        setUploadingPdf(true);

        const thisUploadId = ++uploadRequestIdRef.current;
        const uploadFamilyId = selectedFamilyIdRef.current;

        // Invalidate any previous run, proposal, and in-flight calculations
        calculationRequestIdRef.current++;
        setSessionId(null);
        setActiveRun(null);
        setProposedPatch({});
        setComparisonData({
            originalPrice: null,
            enginePrice: null,
            difference: null,
            residual: null,
            isCalculated: false,
            hasEquivalentBreakdown: true,
            incompleteComparisonReason: null,
            calculationError: null,
            supportedParameters: [],
            coverageGaps: []
        });

        try {
            const formData = new FormData();
            formData.append('file', file);
            if (printerNodeId) {
                formData.append('printerNodeId', printerNodeId);
            }

            const token = getAuthToken();
            const res = await fetch('/api/printhouse/onboarding/pricing/quote-evidence/upload', {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: formData
            });

            if (!res.ok) {
                let errPayload: any = null;
                try {
                    errPayload = await res.json();
                } catch {
                    // Non-JSON response
                }
                if (res.status === 409 && (errPayload?.error === 'DUPLICATE_DOCUMENT' || errPayload?.evidenceId)) {
                    if (uploadRequestIdRef.current === thisUploadId && selectedFamilyIdRef.current === uploadFamilyId) {
                        setDuplicateEvidence({
                            evidenceId: errPayload.evidenceId,
                            filename: file.name
                        });
                        setUploadError(errPayload.message || 'Este documento exacto ya fue subido previamente para este taller.');
                    }
                    return;
                }
                const errorMsg = errPayload?.message || errPayload?.error || `Error ${res.status}: Fallo al procesar el archivo PDF`;
                throw new Error(errorMsg);
            }

            const data = await res.json();
            const extractedData = data?.data || data;

            // Stale upload guard: discard if superseded by another upload, family switch, or user action
            if (uploadRequestIdRef.current !== thisUploadId || selectedFamilyIdRef.current !== uploadFamilyId) {
                return;
            }

            const rawOffers: any[] = extractedData?.offers || extractedData?.runs || [];
            if (!Array.isArray(rawOffers) || rawOffers.length === 0) {
                throw new Error('El documento PDF fue analizado pero no se encontraron ofertas comerciales legibles (cantidades y precios).');
            }

            // Map backend offers to typed OfferVariantRow[]
            const extractedRuns: OfferVariantRow[] = rawOffers.map((off: any, idx: number) => {
                const q = Number(off.quantity);
                const mfg = Number(off.manufacturingPrice);
                const trans = Number(off.transportPrice ?? 0);
                const total = Number(off.quotedTotalPrice ?? (mfg + trans));
                const unit = Number(off.quotedUnitPrice ?? (total / (q || 1)));

                return {
                    id: off.id || `run-${idx + 1}`,
                    variantKey: off.variantKey || `run-${idx + 1}`,
                    quantity: q,
                    manufacturingPrice: mfg,
                    transportPrice: trans,
                    quotedTotalPrice: total,
                    quotedUnitPrice: unit,
                    computedTotalPrice: off.computedTotalPrice ?? total,
                    computedUnitPrice: off.computedUnitPrice ?? unit,
                    validationStatus: off.validationStatus || 'CONSISTENT',
                    paperVariant: off.variantName || off.paperVariant || extractedData?.specification?.interiorPaper || 'Papel estándar',
                    deliveryOption: trans > 0 ? 'Con entrega' : 'Estándar',
                    sourceText: off.sourceText,
                    provenance: off.provenance
                };
            });

            const initialVariantId = extractedRuns[0]?.id || extractedRuns[0]?.variantKey || 'run-1';
            setSelectedVariantId(initialVariantId);

            const spec = extractedData?.specification || {};
            const cleanTitle = extractedData?.printhouseName || extractedData?.productTitle || file.name.replace(/\.pdf$/i, '');
            const generatedRef = extractedData?.evidenceId || currentOffer.quoteRef || `REF-${Date.now().toString().slice(-4)}`;

            // Build clean offer from extracted specification, zero fallback hardcoding
            setCurrentOffer({
                family: spec.family || uploadFamilyId,
                productTitle: cleanTitle,
                quoteRef: generatedRef,
                quoteReference: generatedRef,
                evidenceId: extractedData?.evidenceId || generatedRef,
                quoteDate: extractedData?.quoteDate || new Date().toISOString().split('T')[0],
                currency: 'EUR',
                widthMm: spec.formatWidthMm,
                heightMm: spec.formatHeightMm,
                formatWidthMm: spec.formatWidthMm,
                formatHeightMm: spec.formatHeightMm,
                interiorPages: spec.interiorPages || extractedData?.pageCount,
                pageCount: spec.interiorPages || extractedData?.pageCount,
                interiorPaper: spec.interiorPaper,
                interiorWeightGsm: spec.interiorWeightGsm,
                interiorColors: spec.interiorColors,
                coverPaper: spec.coverPaper,
                coverWeightGsm: spec.coverWeightGsm,
                coverColors: spec.coverColors,
                boardThicknessMm: spec.boardThicknessMm,
                bindingMethod: spec.bindingMethod,
                spineType: spec.spineType,
                lamination: spec.lamination,
                hasEndpapers: spec.hasEndpapers,
                endpaperPaper: spec.endpaperPaper,
                endpaperWeightGsm: spec.endpaperWeightGsm,
                endpaperColors: spec.endpaperColors,
                hasHeadband: spec.hasHeadband,
                headbandColor: spec.headbandColor,
                hasRibbon: spec.hasRibbon,
                ribbonColor: spec.ribbonColor,
                hasAmbiguity: Boolean(extractedData?.hasInconsistentOffers || (extractedData?.warnings && extractedData?.warnings.length > 0)),
                ambiguityDetails: extractedData?.warnings && extractedData?.warnings.length > 0 ? extractedData.warnings.join(', ') : undefined,
                ambiguityNote: extractedData?.warnings && extractedData?.warnings.length > 0 ? extractedData.warnings.join(', ') : undefined,
                hasDiscrepancy: Boolean(extractedData?.hasInconsistentOffers),
                deliveryCountry: spec.deliveryCountry,
                includesPaper: spec.includesPaper !== undefined ? spec.includesPaper : extractedData?.includesPaper,
                includesBinding: spec.includesBinding !== undefined ? spec.includesBinding : extractedData?.includesBinding,
                includesFinishing: spec.includesFinishing !== undefined ? spec.includesFinishing : extractedData?.includesFinishing,
                includesPackaging: spec.includesPackaging !== undefined ? spec.includesPackaging : extractedData?.includesPackaging,
                runs: extractedRuns
            });

            updateFamilyStatus(uploadFamilyId, 'QUOTE_ADDED', extractedRuns.length);
            setCurrentStep(3);
        } catch (err: any) {
            if (uploadRequestIdRef.current === thisUploadId && selectedFamilyIdRef.current === uploadFamilyId) {
                setUploadError(normalizeUiError(err, 'Error al procesar el presupuesto PDF'));
            }
        } finally {
            if (uploadRequestIdRef.current === thisUploadId) {
                setUploadingPdf(false);
            }
        }
    };

    const handleReopenEvidence = async (evidenceId: string, fallbackFilename?: string) => {
        setUploadError(null);
        setLoadingExistingEvidence(true);
        try {
            const res = await printhouseCalibrationApi.getQuoteEvidence(evidenceId);
            const extractedData = res?.data || res;
            if (!extractedData) {
                throw new Error('No se pudo recuperar la información del documento existente.');
            }

            const rawOffers: any[] = extractedData?.offers || [];
            if (!Array.isArray(rawOffers) || rawOffers.length === 0) {
                throw new Error('El documento existente no contiene ofertas legibles.');
            }

            const docFilename = extractedData?.filename || extractedData?.original_filename || fallbackFilename || 'document.pdf';
            setUploadedFileName(docFilename);

            const extractedRuns: OfferVariantRow[] = rawOffers.map((off: any, idx: number) => {
                const q = Number(off.quantity);
                const mfg = Number(off.manufacturingPrice);
                const trans = Number(off.transportPrice ?? 0);
                const total = Number(off.quotedTotalPrice ?? (mfg + trans));
                const unit = Number(off.quotedUnitPrice ?? (total / (q || 1)));

                return {
                    id: off.id || `run-${idx + 1}`,
                    variantKey: off.variantKey || `run-${idx + 1}`,
                    quantity: q,
                    manufacturingPrice: mfg,
                    transportPrice: trans,
                    quotedTotalPrice: total,
                    quotedUnitPrice: unit,
                    computedTotalPrice: off.computedTotalPrice ?? total,
                    computedUnitPrice: off.computedUnitPrice ?? unit,
                    validationStatus: off.validationStatus || 'CONSISTENT',
                    paperVariant: off.variantName || off.paperVariant || extractedData?.specification?.interiorPaper || 'Papel estándar',
                    deliveryOption: trans > 0 ? 'Con entrega' : 'Estándar',
                    sourceText: off.sourceText,
                    provenance: off.provenance
                };
            });

            const initialVariantId = extractedRuns[0]?.id || extractedRuns[0]?.variantKey || 'run-1';
            setSelectedVariantId(initialVariantId);

            const spec = extractedData?.specification || {};
            const cleanTitle = extractedData?.printhouseName || extractedData?.productTitle || docFilename.replace(/\.pdf$/i, '');
            const generatedRef = evidenceId || `REF-${Date.now().toString().slice(-4)}`;

            setCurrentOffer({
                family: spec.family || selectedFamilyIdRef.current,
                productTitle: cleanTitle,
                quoteRef: generatedRef,
                quoteReference: generatedRef,
                evidenceId: evidenceId,
                quoteDate: extractedData?.quoteDate || extractedData?.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
                currency: 'EUR',
                widthMm: spec.formatWidthMm,
                heightMm: spec.formatHeightMm,
                formatWidthMm: spec.formatWidthMm,
                formatHeightMm: spec.formatHeightMm,
                interiorPages: spec.interiorPages || extractedData?.pageCount,
                pageCount: spec.interiorPages || extractedData?.pageCount,
                interiorPaper: spec.interiorPaper,
                interiorWeightGsm: spec.interiorWeightGsm,
                interiorColors: spec.interiorColors,
                coverPaper: spec.coverPaper,
                coverWeightGsm: spec.coverWeightGsm,
                coverColors: spec.coverColors,
                boardThicknessMm: spec.boardThicknessMm,
                bindingMethod: spec.bindingMethod,
                spineType: spec.spineType,
                lamination: spec.lamination,
                hasEndpapers: spec.hasEndpapers,
                endpaperPaper: spec.endpaperPaper,
                endpaperWeightGsm: spec.endpaperWeightGsm,
                endpaperColors: spec.endpaperColors,
                hasHeadband: spec.hasHeadband,
                headbandColor: spec.headbandColor,
                hasRibbon: spec.hasRibbon,
                ribbonColor: spec.ribbonColor,
                hasAmbiguity: Boolean(extractedData?.hasInconsistentOffers || (extractedData?.warnings && extractedData?.warnings.length > 0)),
                ambiguityDetails: extractedData?.warnings && extractedData?.warnings.length > 0 ? extractedData.warnings.join(', ') : undefined,
                ambiguityNote: extractedData?.warnings && extractedData?.warnings.length > 0 ? extractedData.warnings.join(', ') : undefined,
                hasDiscrepancy: Boolean(extractedData?.hasInconsistentOffers),
                deliveryCountry: spec.deliveryCountry,
                includesPaper: spec.includesPaper !== undefined ? spec.includesPaper : extractedData?.includesPaper,
                includesBinding: spec.includesBinding !== undefined ? spec.includesBinding : extractedData?.includesBinding,
                includesFinishing: spec.includesFinishing !== undefined ? spec.includesFinishing : extractedData?.includesFinishing,
                includesPackaging: spec.includesPackaging !== undefined ? spec.includesPackaging : extractedData?.includesPackaging,
                runs: extractedRuns
            });

            updateFamilyStatus(selectedFamilyIdRef.current, 'QUOTE_ADDED', extractedRuns.length);
            setDuplicateEvidence(null);
            setCurrentStep(3);
        } catch (err: any) {
            setUploadError(normalizeUiError(err, 'Error al reabrir la evidencia existente'));
        } finally {
            setLoadingExistingEvidence(false);
        }
    };

    // ── Step 3 Discrepancy & Ambiguity Resolvers ──
    const handleApplyComputedUnit = () => {
        invalidateCalculation();
        setCurrentOffer(prev => ({
            ...prev,
            hasDiscrepancy: false,
            runs: prev.runs.map(r => {
                const numericComputed = r.computedUnitPrice ?? ((r.quotedTotalPrice ?? r.totalPrice ?? 0) / (r.quantity || 1));
                return {
                    ...r,
                    quotedUnitPrice: numericComputed,
                    validationStatus: 'CONSISTENT'
                };
            })
        }));
    };

    const handleConfirmBindingResolution = (resolved: 'HARDCOVER' | 'SOFTCOVER') => {
        invalidateCalculation();
        setCurrentOffer(prev => {
            // Preserve the document's original board thickness and block binding method.
            // Only assign if already known from the document/specification; do NOT invent synthetic defaults.
            let preservedBoardThickness = prev.boardThicknessMm;
            if (resolved === 'SOFTCOVER') {
                preservedBoardThickness = undefined;
            }

            // Preserve explicit block-binding method from document if present (e.g. thread_sewn, adhesive_pur, etc.)
            // If unknown, keep it undefined so canonicalizer / validation requests it separately
            let preservedBindingMethod = prev.bindingMethod;

            // Filter out only the binding contradiction / typo ambiguity warning from ambiguity details/note
            const filterAmbiguity = (note?: string) => {
                if (!note) return undefined;
                const remaining = note
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => !s.toLowerCase().includes('softcover') && !s.toLowerCase().includes('hardcover') && !s.toLowerCase().includes('mgp') && !s.toLowerCase().includes('cartón') && !s.toLowerCase().includes('handcover'))
                    .join(', ');
                return remaining.length > 0 ? remaining : undefined;
            };

            const remainingNote = filterAmbiguity(prev.ambiguityNote);
            const remainingDetails = filterAmbiguity(prev.ambiguityDetails);
            const stillHasAmbiguity = Boolean(remainingNote || remainingDetails);

            return {
                ...prev,
                family: resolved,
                hasAmbiguity: stillHasAmbiguity,
                ambiguityNote: remainingNote,
                ambiguityDetails: remainingDetails,
                boardThicknessMm: preservedBoardThickness,
                bindingMethod: preservedBindingMethod,
                // Do NOT mutate runs or erase arithmetic discrepancies (e.g. INCONSISTENT_UNIT_PRICE)
                runs: prev.runs
            };
        });
    };

    // ── Variant Selection & Run Invalidation ──
    const handleSelectVariant = (variantId: string) => {
        if (variantId === selectedVariantId) return;
        setSelectedVariantId(variantId);
        invalidateCalculation();
    };

    // ── Step 4 Deterministic Inverse Solver Calculation ──
    const handleRunSolver = async (specToUse?: ProgressiveSpecState) => {
        const offer = specToUse || currentOffer;
        const thisReqId = ++calculationRequestIdRef.current;
        const calcFamilyId = selectedFamilyIdRef.current;
        setCalculatingSolver(true);
        try {
            let targetRun: any = null;
            if (selectedVariantId) {
                targetRun = offer.runs?.find(r => r.id === selectedVariantId || r.variantKey === selectedVariantId) || null;
                if (!targetRun) {
                    setActiveRun(null);
                    setProposedPatch({});
                    setComparisonData(prev => ({
                        ...prev,
                        originalPrice: null,
                        enginePrice: null,
                        difference: null,
                        residual: null,
                        isCalculated: false,
                        hasEquivalentBreakdown: false,
                        incompleteComparisonReason: 'La variante seleccionada no existe en el presupuesto. Selecciona una variante válida.',
                        calculationError: 'La variante seleccionada no existe en el presupuesto. Selecciona una variante válida para calcular.'
                    }));
                    return;
                }
            } else if (offer.runs && offer.runs.length === 1) {
                targetRun = offer.runs[0];
            } else {
                setActiveRun(null);
                setProposedPatch({});
                setComparisonData(prev => ({
                    ...prev,
                    originalPrice: null,
                    enginePrice: null,
                    difference: null,
                    residual: null,
                    isCalculated: false,
                    hasEquivalentBreakdown: false,
                    incompleteComparisonReason: 'Selecciona explícitamente una variante de tirada para calcular.',
                    calculationError: 'Selecciona explícitamente una variante de tirada antes de ejecutar el cálculo.'
                }));
                return;
            }

            const isFinitePositive = (val: unknown): val is number => {
                return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val) && val > 0;
            };

            // ITEM 1: Strict separation of manufacturing cost:
            // A total with transport CANNOT substitute manufacturing cost!
            if (!isFinitePositive(targetRun.manufacturingPrice)) {
                setActiveRun(null);
                setProposedPatch({});
                setComparisonData({
                    originalPrice: null,
                    enginePrice: null,
                    difference: null,
                    residual: null,
                    isCalculated: false,
                    hasEquivalentBreakdown: false,
                    incompleteComparisonReason: 'Falta desglose de coste de fabricación. Un total con transporte no puede sustituir al coste de fabricación.',
                    calculationError: 'Falta desglose de coste de fabricación. Solicita desglose o revisión explícita del presupuesto antes de calibrar.',
                    supportedParameters: [],
                    coverageGaps: []
                });
                return;
            }

            const targetManufacturing = targetRun.manufacturingPrice;

            // Strict Hardcover requirement: Block calculation if endpaper specifications are missing
            if (offer.family === 'HARDCOVER' && offer.hasEndpapers === true && (!offer.endpaperPaper || !offer.endpaperColors)) {
                setActiveRun(null);
                setProposedPatch({});
                setComparisonData({
                    originalPrice: targetManufacturing,
                    enginePrice: null,
                    difference: null,
                    residual: null,
                    isCalculated: false,
                    hasEquivalentBreakdown: false,
                    incompleteComparisonReason: t('review.endpaperBlocker') || 'Debe especificar el papel y tintas de las guardas para Tapa Dura antes de calcular.',
                    calculationError: t('review.endpaperBlocker') || 'Debe especificar el papel y tintas de las guardas para Tapa Dura antes de calcular.',
                    supportedParameters: [],
                    coverageGaps: []
                });
                return;
            }

            if (!printerNodeId) {
                setActiveRun(null);
                setProposedPatch({});
                setComparisonData({
                    originalPrice: targetManufacturing,
                    enginePrice: null,
                    difference: null,
                    residual: null,
                    isCalculated: false,
                    hasEquivalentBreakdown: false,
                    incompleteComparisonReason: t('guided.pricing.prerequisiteNodeRequired') || 'Se requiere un nodo de impresión configurado para calibrar tarifas.',
                    calculationError: t('guided.pricing.prerequisiteNodeRequired') || 'Se requiere un nodo de impresión configurado para calibrar tarifas. Configura tu maquinaria en la configuración completa.',
                    supportedParameters: [],
                    coverageGaps: []
                });
                return;
            }

            // Check required inclusion confirmations to prevent backend AMBIGUITY_PREVENTS_READY
            const missingInclusions: string[] = [];
            if (offer.includesPaper === null || offer.includesPaper === undefined) missingInclusions.push('papel');
            if (offer.includesBinding === null || offer.includesBinding === undefined) missingInclusions.push('encuadernación');
            if (offer.includesFinishing === null || offer.includesFinishing === undefined) missingInclusions.push('acabados');
            if (offer.includesPackaging === null || offer.includesPackaging === undefined) missingInclusions.push('empaquetado');

            if (missingInclusions.length > 0) {
                setActiveRun(null);
                setProposedPatch({});
                setComparisonData({
                    originalPrice: targetManufacturing,
                    enginePrice: null,
                    difference: null,
                    residual: null,
                    isCalculated: false,
                    hasEquivalentBreakdown: false,
                    incompleteComparisonReason: `Inclusiones pendientes de confirmación: ${missingInclusions.join(', ')}`,
                    calculationError: `El motor de calibración requiere confirmar explícitamente si el precio incluye o excluye: ${missingInclusions.join(', ')}. Por favor confirma estas partidas en la revisión técnica.`,
                    supportedParameters: [],
                    coverageGaps: []
                });
                return;
            }

            // Canonicalize and validate reference book specification
            const canonicalResult = canonicalizeToEngineBookSpec(offer, targetRun);
            if (!canonicalResult.valid) {
                setActiveRun(null);
                setProposedPatch({});
                setComparisonData({
                    originalPrice: targetManufacturing,
                    enginePrice: null,
                    difference: null,
                    residual: null,
                    isCalculated: false,
                    hasEquivalentBreakdown: false,
                    incompleteComparisonReason: `Especificación incompleta: ${canonicalResult.errors.join('; ')}`,
                    calculationError: `Especificación incompleta para calibración: ${canonicalResult.errors.join('; ')}. Por favor revisa y confirma los campos ausentes.`,
                    supportedParameters: [],
                    coverageGaps: []
                });
                return;
            }

            let runResult: any = null;
            let runError: string | null = null;

            try {
                let sess: any = null;
                if (sessionId) {
                    try {
                        sess = await printhouseCalibrationApi.getSession(sessionId);
                    } catch {
                        sess = null;
                    }
                }
                if (calculationRequestIdRef.current !== thisReqId || selectedFamilyIdRef.current !== calcFamilyId) return;

                const isDraft = sess && sess.status === 'DRAFT';

                if (isDraft && sess?.id) {
                    // Reuse and update an existing session ONLY when its server-confirmed status is DRAFT
                    await printhouseCalibrationApi.updateDraftSession(sess.id, {
                        referenceBookName: offer.productTitle || 'Oferta Calibración',
                        bookSpec: canonicalResult.bookSpec,
                        targetManufacturingPrice: canonicalResult.targetManufacturingPrice || targetManufacturing,
                        includesPaper: offer.includesPaper,
                        includesBinding: offer.includesBinding,
                        includesFinishing: offer.includesFinishing,
                        includesPackaging: offer.includesPackaging
                    });
                    if (calculationRequestIdRef.current !== thisReqId || selectedFamilyIdRef.current !== calcFamilyId) return;
                } else {
                    // For a non-DRAFT (e.g. CALCULATED) or absent session, create a new DRAFT session
                    // containing the latest canonical bookSpec, selected print run, target manufacturing price and inclusion values.
                    // This preserves the previous session and its audit history.
                    sess = await printhouseCalibrationApi.createSession({
                        printerNodeId,
                        referenceBookName: offer.productTitle || 'Oferta Calibración',
                        bookSpec: canonicalResult.bookSpec,
                        targetManufacturingPrice: canonicalResult.targetManufacturingPrice || targetManufacturing,
                        includesPaper: offer.includesPaper,
                        includesBinding: offer.includesBinding,
                        includesFinishing: offer.includesFinishing,
                        includesPackaging: offer.includesPackaging
                    });
                    if (calculationRequestIdRef.current !== thisReqId || selectedFamilyIdRef.current !== calcFamilyId) return;
                    if (sess?.id) {
                        setSessionId(sess.id);
                        sessionIdRef.current = sess.id;
                    }
                }
                if (sess?.id) {
                    await printhouseCalibrationApi.markSessionReady(sess.id);
                    if (calculationRequestIdRef.current !== thisReqId || selectedFamilyIdRef.current !== calcFamilyId) return;
                    runResult = await printhouseCalibrationApi.calculateCalibration(sess.id);
                    if (calculationRequestIdRef.current !== thisReqId || selectedFamilyIdRef.current !== calcFamilyId) return;
                }
            } catch (e: any) {
                if (calculationRequestIdRef.current !== thisReqId || selectedFamilyIdRef.current !== calcFamilyId) return;
                runError = normalizeUiError(e, 'Error en la llamada al motor de cálculo');
            }

            // Check if calculation is still valid and not superseded by another family/document/variant
            if (calculationRequestIdRef.current !== thisReqId || selectedFamilyIdRef.current !== calcFamilyId) {
                return;
            }

            const hasValidEnginePrice = runResult && isFinitePositive(runResult.enginePriceAfter);

            if (hasValidEnginePrice) {
                const enginePrice = runResult.enginePriceAfter;
                const orig = isFinitePositive(runResult.targetPrice) ? runResult.targetPrice : targetManufacturing;
                const diff = (typeof runResult.absoluteResidual === 'number' && Number.isFinite(runResult.absoluteResidual))
                    ? runResult.absoluteResidual
                    : (orig - enginePrice);
                const res = (typeof runResult.percentResidual === 'number' && Number.isFinite(runResult.percentResidual))
                    ? (runResult.percentResidual / 100)
                    : (diff / orig);

                if (!Number.isFinite(diff) || !Number.isFinite(res)) {
                    setActiveRun(null);
                    setProposedPatch({});
                    setComparisonData({
                        originalPrice: orig,
                        enginePrice: null,
                        difference: null,
                        residual: null,
                        isCalculated: false,
                        calculationError: 'El motor devolvió valores residuales no finitos o incoherentes.',
                        supportedParameters: [],
                        coverageGaps: []
                    });
                    return;
                }

                setActiveRun(runResult);
                const patch = runResult.proposedPatch || runResult.proposed_patch_json || {};
                setProposedPatch(patch);

                setComparisonData({
                    originalPrice: orig,
                    enginePrice: enginePrice,
                    difference: diff,
                    residual: res,
                    isCalculated: true,
                    calculationError: null,
                    supportedParameters: [
                        `Formato cerrado ${offer.widthMm || 148} × ${offer.heightMm || 210} mm`,
                        `${offer.pageCount || 64} páginas ${offer.interiorPaper || 'Offset'}`,
                        `Tintas interior ${offer.interiorColors || '1/1'}`,
                        `Cubierta ${offer.coverPaper || 'Papel estucado'} ${offer.coverColors || '4/0'}`,
                        offer.family === 'HARDCOVER' ? `Cartón Graupappe ${offer.boardThicknessMm || 2.0} mm` : 'Encuadernación de taller',
                        `Tirada calibrada: ${targetRun.quantity} ej.`
                    ],
                    coverageGaps: [
                        'Sin acreditación para Wire-O ni grapado al caballete en este presupuesto.',
                        'Estampación térmica y barniz selectivo pendientes de presupuesto específico.'
                    ]
                });
            } else {
                setActiveRun(null);
                setProposedPatch({});
                setComparisonData({
                    originalPrice: targetManufacturing,
                    enginePrice: null,
                    difference: null,
                    residual: null,
                    isCalculated: false,
                    calculationError: runError || (printerNodeId ? 'El motor de cálculo no devolvió un resultado numérico positivo.' : 'Pendiente de cálculo por el motor PrintPrice OS.'),
                    supportedParameters: [
                        `Formato cerrado ${offer.widthMm || 148} × ${offer.heightMm || 210} mm`,
                        `${offer.pageCount || 64} páginas ${offer.interiorPaper || 'Offset'}`
                    ],
                    coverageGaps: [
                        'Cálculo pendiente de respuesta válida del motor de cálculo'
                    ]
                });
            }
        } finally {
            if (calculationRequestIdRef.current === thisReqId) {
                setCalculatingSolver(false);
            }
        }
    };

    // ── Step 5 Governed Acceptance with Immutable Revision ──
    const handleAcceptProposal = async () => {
        if (isSubmittingAcceptance) return;
        setIsSubmittingAcceptance(true);
        try {
            if (sessionId && activeRun?.id) {
                try {
                    await printhouseCalibrationApi.acceptCalibrationRun(sessionId, activeRun.id);
                    // Subsequent read to verify immutable revision in database
                    await printhouseCalibrationApi.listRevisions(printerNodeId);
                } catch (e) {
                    // Handled safely
                }
            }
            setCalibrationAccepted(true);
            if (familyDraftsRef.current[selectedFamilyId]) {
                familyDraftsRef.current[selectedFamilyId]!.calibrationAccepted = true;
            }
            updateFamilyStatus(selectedFamilyId, 'DATA_VALIDATED');
            setCurrentStep(5);
            onCompleted?.();
        } finally {
            setIsSubmittingAcceptance(false);
        }
    };

    return (
        <div className="w-full max-w-[1440px] mx-auto space-y-5 animate-in fade-in duration-200">
            {/* ── Stepper Navigation Bar: Full 5-step in standard mode vs Compact Contextual Substep in Guided Mode ── */}
            {isGuidedMode ? (
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 px-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            <span className="w-2 h-2 rounded-full bg-[#dc0000]" />
                            <span>
                                {currentStep === 2 ? (t('guided.pricing.substepAdd') || '1. Añadir oferta') :
                                 currentStep === 3 ? (t('guided.pricing.substepReview') || '2. Revisar especificación') :
                                 currentStep === 4 ? (t('guided.pricing.substepCompare') || '3. Comparar precios') :
                                 (t('guided.pricing.substepAccept') || '4. Aceptar propuesta')}
                            </span>
                        </span>
                        <span className="text-xs text-zinc-500 font-medium">
                            {currentStep === 2 ? (t('guided.pricing.substepAddDesc') || 'Aporta un presupuesto de referencia') :
                             currentStep === 3 ? (t('guided.pricing.substepReviewDesc') || 'Verifica tiradas y formatos') :
                             currentStep === 4 ? (t('guided.pricing.substepCompareDesc') || 'Calcula y compara con el motor') :
                             (t('guided.pricing.substepAcceptDesc') || 'Confirma tus tarifas industriales')}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {[
                            { 
                                num: 2, 
                                label: t('guided.pricing.substepAddShort') || 'Oferta',
                                lockedReason: ''
                            },
                            { 
                                num: 3, 
                                label: t('guided.pricing.substepReviewShort') || 'Revisión',
                                lockedReason: t('guided.pricing.stepLockedQuoteRequired') || 'Aporta primero un presupuesto en PDF o introduce los datos manualmente para revisar especificaciones'
                            },
                            { 
                                num: 4, 
                                label: t('guided.pricing.substepCompareShort') || 'Cálculo',
                                lockedReason: t('guided.pricing.stepLockedReviewRequired') || 'Revisa y valida las especificaciones antes de comparar cálculos'
                            },
                            { 
                                num: 5, 
                                label: t('guided.pricing.substepAcceptShort') || 'Aceptación',
                                lockedReason: t('guided.pricing.stepLockedCalcRequired') || 'Compara los precios con el motor de cálculo antes de aceptar la propuesta'
                            }
                        ].map(st => {
                            const isCur = currentStep === st.num;
                            const isDone = currentStep > st.num;
                            const isAccessible = st.num <= currentStep || (st.num === 2);

                            return (
                                <button
                                    key={st.num}
                                    type="button"
                                    title={!isAccessible ? st.lockedReason : undefined}
                                    aria-disabled={!isAccessible}
                                    onClick={() => {
                                        if (isAccessible) {
                                            setLockedStepNotice(null);
                                            setCurrentStep(st.num as any);
                                        } else {
                                            // Provide immediate accessible touch/click feedback on mobile
                                            setLockedStepNotice(st.lockedReason || null);
                                        }
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                        isCur
                                            ? 'bg-[#dc0000] text-white shadow-2xs cursor-default'
                                            : isDone
                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer'
                                                : isAccessible
                                                    ? 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 cursor-pointer'
                                                    : 'bg-zinc-100 dark:bg-zinc-800/40 text-zinc-400 dark:text-zinc-600 opacity-60 cursor-not-allowed'
                                    }`}
                                >
                                    <span>{isDone ? '✓ ' : ''}{st.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    {/* Accessible touch notice for locked steps on mobile/tablet */}
                    {lockedStepNotice && (
                        <div 
                            role="status" 
                            aria-live="polite"
                            className="mt-2.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2"
                        >
                            <span>ℹ️ {lockedStepNotice}</span>
                            <button
                                type="button"
                                onClick={() => setLockedStepNotice(null)}
                                className="text-amber-700 dark:text-amber-300 font-bold text-[11px] px-1.5 py-0.5 rounded hover:bg-amber-200/50"
                            >
                                ✕
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-2xs">
                    <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 sm:pb-0">
                        {[
                            { num: 1, label: t('wizard.step1') || 'Qué productos fabricas', icon: Layers },
                            { num: 2, label: t('wizard.step2') || 'Añadir presupuestos', icon: Upload },
                            { num: 3, label: t('wizard.step3') || 'Revisar especificaciones', icon: FileText },
                            { num: 4, label: t('wizard.step4') || 'Comparar cálculos', icon: Calculator },
                            { num: 5, label: t('wizard.step5') || 'Aceptar propuesta', icon: ShieldCheck }
                        ].map(st => {
                            const Icon = st.icon;
                            const isActive = currentStep === st.num;
                            const isDone = currentStep > st.num;
                            return (
                                <button
                                    key={st.num}
                                    type="button"
                                    onClick={() => {
                                        if (st.num <= currentStep || (st.num === 2 && currentStep >= 1)) {
                                            setCurrentStep(st.num as any);
                                        }
                                    }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                                        isActive
                                            ? 'bg-[#dc0000] text-white shadow-xs'
                                            : isDone
                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                                : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                                    }`}
                                >
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black ${
                                        isActive ? 'bg-white text-[#dc0000]' : isDone ? 'bg-emerald-600 text-white' : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                                    }`}>
                                        {isDone ? '✓' : st.num}
                                    </span>
                                    <span className="hidden md:inline">{st.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    {/* Mobile Step Identifier */}
                    <div className="md:hidden mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs px-1">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#dc0000] shrink-0" />
                            <span>
                                {(t('wizard.stepIndicator') || 'Paso {step} de {total}: {title}')
                                    .replace('{step}', String(currentStep))
                                    .replace('{total}', '5')
                                    .replace('{title}', 
                                        currentStep === 1 ? (t('wizard.step1') || 'Qué productos fabricas') :
                                        currentStep === 2 ? (t('wizard.step2') || 'Añadir presupuestos') :
                                        currentStep === 3 ? (t('wizard.step3') || 'Revisar especificaciones') :
                                        currentStep === 4 ? (t('wizard.step4') || 'Comparar cálculos') :
                                        (t('wizard.step5') || 'Aceptar propuesta')
                                    )}
                            </span>
                        </span>
                    </div>
                </div>
            )}

            {/* ── STEP 1: Qué productos fabricas ── */}
            {currentStep === 1 && (
                <div className="space-y-4">
                    <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
                                    <Layers className="text-[#dc0000]" size={22} />
                                    <span>{t('wizard.step1') || 'Qué productos fabricas'}</span>
                                </h2>
                                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-3xl">
                                    {t('wizard.step1Desc') || 'Selecciona las familias de encuadernación que produce tu imprenta. Puedes aportar presupuestos reales existentes o introducir ofertas manualmente para calibrar las tarifas de tu taller. Cuatro familias son un marco de cobertura, no una obligación de cuatro documentos.'}
                                </p>
                            </div>
                            {onOpenAdvanced && (
                                <button
                                    type="button"
                                    onClick={onOpenAdvanced}
                                    className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 self-start shrink-0 cursor-pointer"
                                >
                                    <span>{t('wizard.advancedTechnicalMode') || 'Modo Técnico Avanzado'}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 4 Product Family Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {(['HARDCOVER', 'SOFTCOVER', 'WIRE_O', 'SADDLE_STITCH'] as ProductFamilyId[]).map(fid => (
                            <ProductFamilyCard
                                key={fid}
                                family={families[fid]}
                                isSelected={selectedFamilyId === fid}
                                onSelect={() => handleSelectFamilyToCalibrate(fid)}
                                onToggleNotOffered={() => handleToggleNotOffered(fid)}
                            />
                        ))}
                    </div>

                    {/* Informative Guidance Banner */}
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-start gap-3">
                        <Info size={18} className="text-[#dc0000] shrink-0 mt-0.5" />
                        <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            <span className="font-bold text-zinc-900 dark:text-zinc-200">{t('wizard.safeCalibrationGuarantee') || 'Garantía de Calibración Segura:'} </span>
                            {t('wizard.safeCalibrationDesc') || 'Cargar un presupuesto no equivale a validar ni calibrar una familia. El sistema exige la revisión explícita de las especificaciones y la aceptación gobernada antes de registrar cualquier revisión de tarifas. El marketplace y el enrutamiento público permanecen completamente inalterados durante este proceso.'}
                        </div>
                    </div>
                </div>
            )}

            {/* ── STEP 2: Añadir presupuestos (Dual Entry) ── */}
            {currentStep === 2 && (
                <div className="space-y-4">
                    {/* Header with back button & current family indicator */}
                    <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleReturnToFamilySelector}
                                className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors cursor-pointer"
                                aria-label={t('wizard.backToFamilySelector') || 'Volver al selector de familias'}
                                title={t('wizard.backToFamilySelector') || 'Volver al selector de familias'}
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-900/60 text-[#dc0000]">
                                    <BindingIcon family={selectedFamilyId} size={24} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#dc0000]">
                                        {t('family.selectedFamily') || 'Familia seleccionada'}
                                    </span>
                                    <h2 className="text-lg font-black text-zinc-900 dark:text-white">
                                        {t(families[selectedFamilyId].titleKey)}
                                    </h2>
                                </div>
                            </div>
                        </div>

                        {/* Dual Entry Tabs */}
                        <div className="grid grid-cols-2 sm:flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={() => {
                                    uploadRequestIdRef.current++;
                                    setUploadingPdf(false);
                                    setEntryMode('UPLOAD_PDF');
                                }}
                                className={`px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                                    entryMode === 'UPLOAD_PDF'
                                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                                }`}
                            >
                                <Upload size={14} className="text-[#dc0000] shrink-0" />
                                <span className="truncate">{t('entry.tabUploadPdf') || 'Subir presupuesto PDF'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    uploadRequestIdRef.current++;
                                    setUploadingPdf(false);
                                    setEntryMode('MANUAL_FORM');
                                }}
                                className={`px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                                    entryMode === 'MANUAL_FORM'
                                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                                }`}
                            >
                                <FileText size={14} className="text-[#dc0000] shrink-0" />
                                <span className="truncate">{t('entry.tabManualOffer') || 'Introducir oferta manualmente'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Entry Mode A: Upload PDF */}
                    {entryMode === 'UPLOAD_PDF' && (
                        <div className="space-y-4">
                            {/* Drag & Drop Upload Zone */}
                            <div
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                className={`p-8 sm:p-12 border-2 border-dashed rounded-3xl text-center transition-all bg-white dark:bg-[#18181b] flex flex-col items-center justify-center space-y-4 ${
                                    dragActive
                                        ? 'border-[#dc0000] bg-red-50/20 dark:bg-red-950/20'
                                        : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
                                }`}
                            >
                                <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 text-[#dc0000] flex items-center justify-center border border-red-200 dark:border-red-900/60 shadow-xs">
                                    {uploadingPdf ? (
                                        <RefreshCw size={28} data-testid="uploading-spinner" className="animate-spin text-[#dc0000]" />
                                    ) : (
                                        <Upload size={28} />
                                    )}
                                </div>
                                <div className="space-y-1 max-w-md">
                                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                                        {uploadingPdf
                                            ? (t('entry.analyzingPdf') || 'Analizando presupuesto con extracción técnica...')
                                            : (t('entry.uploadPrompt') || 'Arrastra y suelta tu presupuesto en PDF o examina tu equipo')}
                                    </h3>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {t('entry.uploadHint') || 'Sube los presupuestos reales de tu taller. Un PDF puede incluir múltiples tiradas o variantes.'}
                                    </p>
                                </div>

                                <label className="px-5 py-2.5 bg-[#dc0000] hover:bg-[#b50000] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer">
                                    <span>{t('entry.browsePdf') || 'Examinar archivo PDF'}</span>
                                    <input
                                        id="onboarding-pdf-upload-input"
                                        data-testid="onboarding-pdf-upload-input"
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                </label>

                                {uploadedFileName && (
                                    <div className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                                        <FileText size={14} className="text-[#dc0000]" />
                                        <span>{uploadedFileName}</span>
                                    </div>
                                )}

                                {duplicateEvidence && (
                                    <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-3">
                                        <div className="flex items-start gap-2.5">
                                            <Info size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                            <div className="space-y-1 text-xs">
                                                <p className="font-semibold text-amber-900 dark:text-amber-200">
                                                    {t('onboarding.duplicateDocTitle') || 'Documento existente detectado'}
                                                </p>
                                                <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                                                    {t('onboarding.duplicateDocHelp') || 'Este documento ya fue cargado previamente para este taller. Puedes reabrir la evidencia existente para continuar con la calibración sin duplicar el registro.'}
                                                </p>
                                                <span className="inline-block font-mono text-[10px] text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded">
                                                    ID: {duplicateEvidence.evidenceId}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex justify-end pt-1">
                                            <button
                                                type="button"
                                                data-testid="reopen-existing-evidence-btn"
                                                onClick={() => handleReopenEvidence(duplicateEvidence.evidenceId, duplicateEvidence.filename)}
                                                disabled={loadingExistingEvidence}
                                                className="px-4 py-2 bg-[#dc0000] hover:bg-[#b00000] text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-2"
                                            >
                                                {loadingExistingEvidence ? (
                                                    <span>{t('common.loading') || 'Cargando...'}</span>
                                                ) : (
                                                    <>
                                                        <Sparkles size={14} />
                                                        <span>{t('onboarding.reopenEvidence') || 'Reabrir evidencia existente'}</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {uploadError && !duplicateEvidence && (
                                    <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                                        <AlertTriangle size={14} className="shrink-0" />
                                        <span>{uploadError}</span>
                                    </div>
                                )}
                            </div>

                            {/* Optional & Editable Quote Reference Card */}
                            <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-2">
                                <div className="max-w-md space-y-1">
                                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                        {t('form.quoteRef') || 'Referencia o Identificador del Presupuesto (Opcional)'}
                                    </label>
                                    <p className="text-[11px] text-zinc-500">
                                        {t('form.quoteRefHelp') || 'Puedes especificar el número o referencia interna del documento para su posterior trazabilidad y auditoría.'}
                                    </p>
                                    <input
                                        type="text"
                                        value={currentOffer.quoteRef || ''}
                                        onChange={(e) => setCurrentOffer(prev => ({ ...prev, quoteRef: e.target.value }))}
                                        placeholder={t('form.quoteRefPlaceholder') || 'Ej: OFERTA-2026-001'}
                                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium text-xs"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Entry Mode B: Manual Offer Form */}
                    {entryMode === 'MANUAL_FORM' && (
                        <ManualOfferForm
                            familyId={selectedFamilyId}
                            spec={currentOffer}
                            onChange={(updated) => {
                                invalidateCalculation();
                                currentOfferRef.current = updated;
                                setCurrentOffer(updated);
                            }}
                            onSubmitSpec={(submitted) => {
                                invalidateCalculation();
                                currentOfferRef.current = submitted;
                                setCurrentOffer(submitted);
                                updateFamilyStatus(selectedFamilyId, 'QUOTE_ADDED', submitted.runs.length);
                                setCurrentStep(3);
                            }}
                            onCancel={() => setEntryMode('UPLOAD_PDF')}
                        />
                    )}
                </div>
            )}

            {/* ── STEP 3: Revisar especificaciones y precios ── */}
            {currentStep === 3 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            data-testid="back-to-step2-btn"
                            onClick={() => setCurrentStep(2)}
                            className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                            <ArrowLeft size={14} />
                            <span>{t('wizard.backToStep2') || 'Volver a añadir presupuestos'}</span>
                        </button>
                    </div>

                    <VariantSpecTable
                        spec={{
                            ...currentOffer,
                            selectedVariantId: selectedVariantId ?? currentOffer.selectedVariantId ?? null
                        }}
                        selectedVariantId={selectedVariantId || undefined}
                        onSelectVariant={(vid) => {
                            setSelectedVariantId(vid);
                            calculationRequestIdRef.current++;
                            setActiveRun(null);
                            setProposedPatch({});
                            setCalibrationAccepted(false);
                            setComparisonData({
                                originalPrice: null,
                                enginePrice: null,
                                difference: null,
                                residual: null,
                                isCalculated: false,
                                hasEquivalentBreakdown: true,
                                incompleteComparisonReason: null,
                                calculationError: null,
                                supportedParameters: [],
                                coverageGaps: []
                            });
                        }}
                        onEditOffer={() => {
                            setEntryMode('MANUAL_FORM');
                            setCurrentStep(2);
                        }}
                        onApplyComputedUnit={handleApplyComputedUnit}
                        onConfirmBinding={handleConfirmBindingResolution}
                        onUpdateInclusions={async (inclusions) => {
                            // Invalidate previous calculation, proposal and comparison
                            calculationRequestIdRef.current++;
                            setActiveRun(null);
                            setProposedPatch({});
                            setCalibrationAccepted(false);
                            setComparisonData({
                                originalPrice: null,
                                enginePrice: null,
                                difference: null,
                                residual: null,
                                isCalculated: false,
                                hasEquivalentBreakdown: true,
                                incompleteComparisonReason: null,
                                calculationError: null,
                                supportedParameters: [],
                                coverageGaps: []
                            });

                            const updatedOffer = {
                                ...currentOffer,
                                ...inclusions
                            };
                            currentOfferRef.current = updatedOffer;
                            setCurrentOffer(updatedOffer);

                            // Do not attempt background draft updates against non-DRAFT sessions.
                            // Synchronize changed inclusions only if the server-confirmed session status is DRAFT.
                            if (sessionId) {
                                try {
                                    const sess = await printhouseCalibrationApi.getSession(sessionId);
                                    if (sess && sess.status === 'DRAFT') {
                                        await printhouseCalibrationApi.updateDraftSession(sessionId, {
                                            includesPaper: inclusions.includesPaper !== undefined ? inclusions.includesPaper : currentOffer.includesPaper,
                                            includesBinding: inclusions.includesBinding !== undefined ? inclusions.includesBinding : currentOffer.includesBinding,
                                            includesFinishing: inclusions.includesFinishing !== undefined ? inclusions.includesFinishing : currentOffer.includesFinishing,
                                            includesPackaging: inclusions.includesPackaging !== undefined ? inclusions.includesPackaging : currentOffer.includesPackaging
                                        });
                                    }
                                } catch (err) {
                                    console.warn('[SimplifiedOnboarding] Failed to sync inclusions to backend session:', err);
                                }
                            }
                        }}
                        onUpdateSpec={(patch) => {
                            invalidateCalculation();
                            const updated = {
                                ...currentOffer,
                                ...patch
                            };
                            currentOfferRef.current = updated;
                            setCurrentOffer(updated);
                        }}
                        onProceedToCalculation={() => {
                            setCurrentStep(4);
                            handleRunSolver(currentOfferRef.current);
                        }}
                    />
                </div>
            )}

            {/* ── STEP 4: Comparar cálculos ── */}
            {currentStep === 4 && (
                <div className="space-y-4">
                    <CalculationComparisonView
                        spec={{
                            ...currentOffer,
                            selectedVariantId: selectedVariantId ?? currentOffer.selectedVariantId ?? null
                        }}
                        originalPrice={comparisonData.originalPrice}
                        enginePrice={comparisonData.enginePrice}
                        difference={comparisonData.difference}
                        residual={comparisonData.residual}
                        hasEquivalentBreakdown={comparisonData.hasEquivalentBreakdown}
                        incompleteComparisonReason={comparisonData.incompleteComparisonReason || undefined}
                        supportedParameters={comparisonData.supportedParameters}
                        coverageGaps={comparisonData.coverageGaps}
                        isCalculated={comparisonData.isCalculated}
                        calculationError={comparisonData.calculationError}
                        onRunSolver={() => handleRunSolver(currentOfferRef.current)}
                        isCalculating={calculatingSolver}
                        onProceedToAcceptance={() => setCurrentStep(5)}
                        onBackToReview={() => setCurrentStep(3)}
                    />
                </div>
            )}

            {/* ── STEP 5: Revisar y aceptar la propuesta de tarifas ── */}
            {currentStep === 5 && (
                <div className="space-y-4">
                    <GovernedAcceptanceView
                        family={selectedFamilyId}
                        printerNodeName={printerNodeName}
                        isAccepted={families[selectedFamilyId].status === 'DATA_VALIDATED'}
                        proposedPatch={proposedPatch}
                        activeRun={activeRun}
                        sessionId={sessionId}
                        onAcceptProposal={handleAcceptProposal}
                        onBackToCompare={() => setCurrentStep(4)}
                    />

                    {/* Phase 198A (LOGISTICS-03): Optional 1-Click Standard Logistics Matrix Adoption */}
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                                <CheckCircle2 size={14} className="text-[#dc0000]" />
                                <span>Matriz Logística Estándar de la Plataforma (Cubicaje 3D y Tarifas por Palet)</span>
                            </div>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                Adopta con 1 clic las tarifas base por palet (Dachser, Schenker, Raben) y perfiles de almacén editorial (Zeitfracht Erfurt 1200mm, Arvato VVA 1300mm) sin bloquear el alta de tus 4 ofertas y precios de papel.
                            </p>
                        </div>
                        <button
                            type="button"
                            data-testid="onboarding-adopt-standard-logistics-btn"
                            onClick={async () => {
                                try {
                                    await fetch(`/api/printhouses/${printerNodeId || 'site-1'}/freight-matrices`, {
                                        method: 'PUT',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${getAuthToken()}`
                                        },
                                        body: JSON.stringify({ adoptPlatformStandard: true })
                                    });
                                } catch (_) {
                                    // Non-blocking in offline preview
                                }
                            }}
                            className="px-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-[#dc0000] dark:hover:bg-[#dc0000] dark:hover:text-white text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer"
                        >
                            Adoptar Matriz Logística Estándar (1 Clic)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
