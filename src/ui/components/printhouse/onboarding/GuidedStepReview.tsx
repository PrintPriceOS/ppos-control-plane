/**
 * src/ui/components/printhouse/onboarding/GuidedStepReview.tsx
 *
 * Stage D: "Revisar y continuar"
 *
 * Responsibilities:
 * - Summary of saved company profile and primary production site.
 * - Summary of selected binding product families and calibrated rates.
 * - Server-derived readiness status and blocking issues.
 * - Next genuine action (e.g. submit for platform review or open full advanced setup).
 * - Clear explanation: "Completing setup does NOT automatically activate live marketplace or routing".
 */

import React, { useState, useEffect } from 'react';
import { 
    CheckCircle2, Clock, AlertTriangle, ArrowLeft, 
    Layers, Building2, Tag, ArrowRight, ShieldCheck, 
    ExternalLink, RefreshCw, Send
} from 'lucide-react';
import { useLocale } from '../../../i18n';
import { ProductFamilyId, FamilyState } from '../../../types/printhouseOnboardingTypes';
import { BindingIcon } from './BindingFamilyIcons';
import { CompanyDraftData, FamilyPricingSessionDraft } from '../../../lib/onboardingDraftStore';
import { getAuthToken } from '../../../lib/authStore';
import { normalizeUiError } from '../../../utils/errorUtils';
import { evaluateStageCCompletion } from '../../../lib/onboardingDraftStore';

interface GuidedStepReviewProps {
    company: CompanyDraftData;
    families: Record<ProductFamilyId, FamilyState>;
    enabledFamilies: Record<ProductFamilyId, boolean>;
    pricingContinuity?: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>>;
    readinessData?: any;
    isRefreshingReadiness?: boolean;
    refreshError?: string | null;
    onBackToPricing: () => void;
    onOpenFullSetup: (targetTab?: string) => void;
    onRefreshReadiness?: () => Promise<void>;
    onGoToFamilyPricing?: (familyId: ProductFamilyId) => void;
    onGoToCompanyField?: (fieldName: string) => void;
}

export const GuidedStepReview: React.FC<GuidedStepReviewProps> = ({
    company,
    families,
    enabledFamilies,
    pricingContinuity,
    readinessData,
    isRefreshingReadiness = false,
    refreshError = null,
    onBackToPricing,
    onOpenFullSetup,
    onRefreshReadiness,
    onGoToFamilyPricing,
    onGoToCompanyField
}) => {
    const { t } = useLocale();
    const [submittingReview, setSubmittingReview] = useState(false);
    const [submissionResult, setSubmissionResult] = useState<{ ok: boolean; message: string } | null>(null);

    // Refresh readiness on mount to ensure fresh state
    useEffect(() => {
        if (onRefreshReadiness) {
            onRefreshReadiness().catch(() => {});
        }
    }, []);

    const accountReadiness = readinessData?.accountSetup;
    const opsReadiness = readinessData?.operationalConfiguration || readinessData?.operationalReadiness;
    const pricingReadiness = readinessData?.pricingReadiness;

    const blockingIssues: any[] = [
        ...(accountReadiness?.blockingIssues || []),
        ...(opsReadiness?.blockingIssues || []),
        ...(pricingReadiness?.blockingIssues || [])
    ];

    // Stage C genuine completion evaluation (Global rates + Per-family configuration)
    const stageCEval = evaluateStageCCompletion(
        readinessData,
        enabledFamilies,
        pricingContinuity || {},
        families
    );

    const isGlobalPricingComplete = pricingReadiness?.status === 'COMPLETE';
    const isStageCComplete = stageCEval.isComplete;

    // Explicit readiness freshness check:
    // Stale COMPLETE data must NEVER enable submission while refreshing or if that refresh failed.
    const isReadinessLoaded = Boolean(!isRefreshingReadiness && !refreshError && readinessData && (accountReadiness || opsReadiness || pricingReadiness));
    const isAccountComplete = accountReadiness?.status === 'COMPLETE';
    const isOpsComplete = opsReadiness?.status === 'COMPLETE';
    const canRequestReview = isReadinessLoaded && isAccountComplete && isOpsComplete && isStageCComplete && blockingIssues.length === 0;

    const handleSubmitForReview = async () => {
        if (!canRequestReview || submittingReview) return;
        setSubmittingReview(true);
        setSubmissionResult(null);
        try {
            const token = getAuthToken();
            const res = await fetch('/api/printhouse/onboarding/submit-for-review', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    declaredBy: 'PRINTHOUSE_OPERATOR',
                    notes: 'Submitted via Guided Printhouse Onboarding'
                })
            });
            let data: any = null;
            try {
                data = await res.json();
            } catch (_) {}

            if (res.ok && (data?.success || data?.ok)) {
                setSubmissionResult({
                    ok: true,
                    message: t('guided.review.submittedSuccess') || 'Tu solicitud de revisión comercial ha sido enviada al equipo de PrintPrice Pro.'
                });
                if (onRefreshReadiness) await onRefreshReadiness();
            } else {
                const normErr = normalizeUiError(data, `Error HTTP ${res.status}: Revisa los requisitos pendientes.`);
                setSubmissionResult({
                    ok: false,
                    message: normErr
                });
            }
        } catch (err: any) {
            setSubmissionResult({
                ok: false,
                message: normalizeUiError(err, 'Error de conexión al enviar la revisión.')
            });
        } finally {
            setSubmittingReview(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#dc0000]">
                    {t('guided.stageD.badge') || 'Etapa 4 de 4 · Revisar y continuar'}
                </span>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                            {t('guided.stageD.title') || 'Resumen de configuración de tu imprenta'}
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {t('guided.stageD.subtitle') || 'Comprueba la información guardada, los productos configurados y los siguientes pasos reales de tu cuenta.'}
                        </p>
                    </div>
                    {onRefreshReadiness && (
                        <button
                            type="button"
                            onClick={() => onRefreshReadiness()}
                            disabled={isRefreshingReadiness}
                            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                            <RefreshCw size={13} className={isRefreshingReadiness ? 'animate-spin' : ''} />
                            <span>{t('guided.review.refreshBtn') || 'Actualizar estado'}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Refreshing readiness indicator */}
            {isRefreshingReadiness && (
                <div role="status" className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 flex items-center gap-2.5 text-xs font-semibold">
                    <RefreshCw size={15} className="animate-spin text-blue-600 shrink-0" />
                    <span>{t('guided.review.refreshing') || 'Actualizando estado...'}</span>
                </div>
            )}

            {/* Refresh error alert */}
            {refreshError && (
                <div role="alert" className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 flex items-start justify-between gap-3 text-xs font-medium">
                    <div className="flex items-start gap-2.5">
                        <AlertTriangle size={18} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                            <span className="font-bold">{t('guided.review.refreshError') || 'Error al actualizar el estado de preparación. Comprueba la conexión e inténtalo de nuevo.'}</span>
                            <div className="text-[11px] opacity-80">{refreshError}</div>
                        </div>
                    </div>
                    {onRefreshReadiness && (
                        <button
                            type="button"
                            onClick={() => onRefreshReadiness()}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                        >
                            {t('guided.review.refreshBtn') || 'Actualizar estado'}
                        </button>
                    )}
                </div>
            )}

            {/* Submission alert if triggered */}
            {submissionResult && (
                <div 
                    role="alert" 
                    className={`p-4 rounded-xl border flex items-start gap-3 text-xs font-medium ${
                        submissionResult.ok
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                            : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                    }`}
                >
                    {submissionResult.ok ? (
                        <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                        <AlertTriangle size={18} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div>{submissionResult.message}</div>
                </div>
            )}

            {/* Grid of 3 Main Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Empresa & Sede */}
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-zinc-900 dark:text-zinc-100">
                            <div className="flex items-center gap-2">
                                <Building2 size={16} className="text-[#dc0000]" />
                                <h3 className="text-xs font-bold uppercase tracking-wider">
                                    {t('guided.review.companySection') || 'Tu imprenta'}
                                </h3>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900">
                                {t('common.saved') || 'Guardado'}
                            </span>
                        </div>
                        <div>
                            <div className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100">
                                {company.legalName || 'Imprenta'}
                            </div>
                            {company.tradingName && company.tradingName !== company.legalName && (
                                <div className="text-xs text-zinc-500">
                                    {company.tradingName}
                                </div>
                            )}
                            <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 space-y-0.5">
                                <div>📍 {company.city}, {company.country}</div>
                                {company.contactName && <div>👤 {company.contactName}</div>}
                                {company.taxId && <div>🆔 {company.taxId}</div>}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenFullSetup('COMPANY')}
                        className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-[#dc0000] flex items-center justify-between cursor-pointer"
                    >
                        <span>{t('guided.review.editCompany') || 'Editar en configuración'}</span>
                        <ArrowRight size={13} />
                    </button>
                </div>

                {/* 2. Productos & Familias */}
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-zinc-900 dark:text-zinc-100">
                            <div className="flex items-center gap-2">
                                <Layers size={16} className="text-[#dc0000]" />
                                <h3 className="text-xs font-bold uppercase tracking-wider">
                                    {t('guided.review.productsSection') || 'Familias activas'}
                                </h3>
                            </div>
                            <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                                {Object.values(enabledFamilies).filter(Boolean).length} / 4
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            {(['HARDCOVER', 'SOFTCOVER', 'WIRE_O', 'SADDLE_STITCH'] as ProductFamilyId[]).map(fid => {
                                const isEnabled = enabledFamilies[fid];
                                const familyState = families[fid];
                                return (
                                    <div 
                                        key={fid}
                                        className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition-colors gap-2 ${
                                            isEnabled 
                                                ? 'bg-zinc-50 dark:bg-zinc-900/60 text-zinc-800 dark:text-zinc-200 border border-zinc-100 dark:border-zinc-800' 
                                                : 'text-zinc-400 line-through opacity-60'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="shrink-0">
                                                <BindingIcon family={fid} size={15} />
                                            </div>
                                            <span className="font-semibold break-words">{t(familyState.titleKey)}</span>
                                        </div>
                                        {isEnabled && (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                familyState.status === 'DATA_VALIDATED'
                                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                                                    : familyState.status === 'QUOTE_ADDED' || familyState.status === 'REQUIRES_REVIEW'
                                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                            }`}>
                                                {familyState.status === 'DATA_VALIDATED'
                                                    ? (t('guided.review.statusValidated') || '✓ Calibrada')
                                                    : familyState.status === 'QUOTE_ADDED' || familyState.status === 'REQUIRES_REVIEW'
                                                        ? (t('guided.review.statusDraft') || 'Borrador en curso')
                                                        : (t('guided.review.statusDeclared') || 'Declarada')}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenFullSetup('CAPABILITIES')}
                        className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-[#dc0000] flex items-center justify-between cursor-pointer"
                    >
                        <span>{t('guided.review.editCapabilities') || 'Capacidades de taller'}</span>
                        <ArrowRight size={13} />
                    </button>
                </div>

                {/* 3. Precios y Calibración */}
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-zinc-900 dark:text-zinc-100">
                            <div className="flex items-center gap-2">
                                <Tag size={16} className="text-[#dc0000]" />
                                <h3 className="text-xs font-bold uppercase tracking-wider">
                                    {t('guided.review.pricingSection') || 'Precios y Tarifas'}
                                </h3>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                stageCEval.isComplete
                                    ? (stageCEval.calibratedCount === stageCEval.totalEnabled
                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800')
                                    : isGlobalPricingComplete
                                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                            }`}>
                                {stageCEval.isComplete 
                                    ? (stageCEval.calibratedCount === stageCEval.totalEnabled
                                        ? (t('guided.review.statusCalibrated') || 'Calibrado con IA')
                                        : (t('guided.review.statusRatesConfigured') || 'Tarifas configuradas'))
                                    : isGlobalPricingComplete
                                        ? `${t('guided.review.statusInProgress') || 'En progreso'} (${stageCEval.configuredCount}/${stageCEval.totalEnabled})`
                                        : (t('setup.status.notStarted') || 'Sin configurar')}
                            </span>
                        </div>

                        {/* Global Rates Status banner */}
                        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 text-xs">
                            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                                {t('guided.review.globalRatesStatus') || 'Tarifas industriales base (taller)'}:
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                isGlobalPricingComplete
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                            }`}>
                                {isGlobalPricingComplete ? (t('guided.review.globalRatesConfigured') || 'Configuradas') : (t('guided.review.globalRatesPending') || 'Pendientes')}
                            </span>
                        </div>

                        {/* Per-family pricing status breakdown */}
                        <div className="space-y-2">
                            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                {t('guided.review.perFamilyPricingTitle') || 'Preparación por familia seleccionada'}:
                            </div>
                            <div className="space-y-1.5">
                                {(['HARDCOVER', 'SOFTCOVER', 'WIRE_O', 'SADDLE_STITCH'] as ProductFamilyId[])
                                    .filter(fid => enabledFamilies[fid])
                                    .map(fid => {
                                        const fam = families[fid];
                                        const continuity = pricingContinuity?.[fid];
                                        const quoteCount = (fam?.quoteCount ?? (fam as any)?.quotes?.length ?? 0) + (continuity?.offer?.runs?.length ? 1 : 0);
                                        // Strict isolation: A family is ONLY calibrated if its own status is DATA_VALIDATED.
                                        // Do NOT deduce calibration from global isPricingComplete.
                                        const isFamilyCalibrated = fam?.status === 'DATA_VALIDATED';
                                        const hasActiveDraft = quoteCount > 0 || fam?.status === 'QUOTE_ADDED' || fam?.status === 'REQUIRES_REVIEW' || Boolean(continuity?.sessionId || continuity?.activeRun || continuity?.uploadedFileName);

                                        // Resolve genuine method applied vs preference
                                        const methodChoice = continuity?.pricingMethod;
                                        const hasAssistantEvidence = Boolean(continuity?.uploadedFileName || continuity?.sessionId || quoteCount > 0);
                                        const methodLabel = methodChoice === 'TEMPLATE'
                                            ? (t('guided.review.methodTemplate') || 'Plantilla base')
                                            : methodChoice === 'ASSISTANT'
                                                ? (hasAssistantEvidence 
                                                    ? (t('guided.review.methodAssistant') || 'Asistente IA') 
                                                    : (t('guided.review.methodAssistantDraft') || 'Asistente IA (preferencia)'))
                                                : continuity?.entryMode === 'MANUAL_FORM' || continuity?.uploadedFileName
                                                    ? (t('guided.review.methodAssistant') || 'Asistente IA')
                                                    : methodChoice === 'MANUAL'
                                                        ? (t('guided.review.methodManual') || 'Tarifas manuales')
                                                        : (t('guided.review.methodNotConfigured') || 'Sin método');

                                        const evidenceLabel = continuity?.uploadedFileName 
                                            ? continuity.uploadedFileName 
                                            : continuity?.sessionId 
                                                ? `ID: ${continuity.sessionId.slice(0, 8)}`
                                                : quoteCount > 0
                                                    ? `${quoteCount} ${quoteCount === 1 ? 'oferta' : 'ofertas'}`
                                                    : null;

                                        // Check explicit verification flags
                                        const isTemplateSaved = methodChoice === 'TEMPLATE' && Boolean(continuity?.templateSaved);
                                        const isManualRatesSaved = methodChoice === 'MANUAL' && Boolean(continuity?.manualRatesSaved);
                                        const isAssistantCalibrated = isFamilyCalibrated || Boolean(continuity?.calibrationAccepted);

                                        const isFamilyFullyReady = isAssistantCalibrated || isTemplateSaved || isManualRatesSaved;

                                        return (
                                            <div 
                                                key={fid}
                                                className="flex flex-col p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 text-xs gap-2 min-w-0"
                                            >
                                                {/* Top row: Icon + Family title + Method label */}
                                                <div className="flex items-start gap-2 min-w-0">
                                                    <div className="shrink-0 mt-0.5">
                                                        <BindingIcon family={fid} size={15} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs leading-snug break-words">
                                                            {t(fam?.titleKey || fid)}
                                                        </div>
                                                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal leading-tight mt-0.5">
                                                            {methodLabel}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Evidence attachment (if present) */}
                                                {evidenceLabel && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-400 font-medium pl-6 min-w-0 max-w-full">
                                                        <span className="shrink-0 text-zinc-400">📎</span>
                                                        <span className="truncate max-w-full" title={evidenceLabel}>
                                                            {evidenceLabel}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Bottom row: Status badge + Configurar button */}
                                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-200/50 dark:border-zinc-800/60 pl-6">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                        isFamilyFullyReady
                                                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                                                            : hasActiveDraft
                                                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                                                : methodChoice
                                                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                                    }`}>
                                                        {isAssistantCalibrated
                                                            ? (t('guided.review.statusValidated') || 'Calibrada')
                                                            : isTemplateSaved
                                                                ? (t('guided.review.statusTemplateSaved') || 'Plantilla guardada')
                                                                : isManualRatesSaved
                                                                    ? (t('guided.review.statusManualSaved') || 'Tarifas guardadas')
                                                                    : methodChoice === 'TEMPLATE'
                                                                        ? (t('guided.review.statusTemplatePending') || 'Plantilla sin guardar')
                                                                        : methodChoice === 'MANUAL'
                                                                            ? (t('guided.review.statusManualPending') || 'Tarifas sin guardar')
                                                                            : hasActiveDraft
                                                                                ? (t('guided.review.statusDraft') || 'Borrador en curso')
                                                                                : methodChoice
                                                                                    ? (t('guided.review.statusMethodSelected') || 'Método seleccionado')
                                                                                    : (t('guided.review.statusDeclared') || 'Declarada')}
                                                    </span>
                                                    {!isFamilyFullyReady && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onGoToFamilyPricing ? onGoToFamilyPricing(fid) : onBackToPricing()}
                                                            className="text-[11px] font-bold text-[#dc0000] hover:underline cursor-pointer shrink-0"
                                                        >
                                                            {t('common.configure') || 'Configurar'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-2 pt-1">
                            <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                                <ShieldCheck size={16} className="text-[#dc0000] shrink-0" />
                                <span className="text-[11px] leading-tight">
                                    {t('guided.review.pricingStrictNotice') || 'Tarifas y matrices resueltas exclusivamente por el motor de cálculo del servidor.'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenFullSetup('PRICING')}
                        className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-[#dc0000] flex items-center justify-between cursor-pointer"
                    >
                        <span>{t('guided.review.openPricing') || 'Ver tarifas completas'}</span>
                        <ArrowRight size={13} />
                    </button>
                </div>
            </div>

            {/* Governed Action & Clear Next Steps */}
            <div className="p-5 sm:p-6 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <ShieldCheck size={18} className="text-[#dc0000]" />
                            <span>{t('guided.review.nextActionTitle') || 'Siguiente acción disponible'}</span>
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xl">
                            {canRequestReview
                                ? (t('guided.review.canSubmitDesc') || 'Has completado los requisitos esenciales. Puedes solicitar la revisión de tu cuenta para su posterior activación en la red.')
                                : (t('guided.review.cannotSubmitDesc') || 'Aún quedan requisitos operativos o de tarifas por completar antes de solicitar la revisión comercial formal.')}
                        </p>
                    </div>

                    {canRequestReview ? (
                        <button
                            type="button"
                            disabled={submittingReview}
                            onClick={handleSubmitForReview}
                            className="px-5 py-2.5 bg-[#dc0000] hover:bg-[#b50000] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                        >
                            {submittingReview ? (
                                <>
                                    <RefreshCw size={14} className="animate-spin" />
                                    <span>{t('common.submitting') || 'Enviando...'}</span>
                                </>
                            ) : (
                                <>
                                    <Send size={14} />
                                    <span>{t('guided.review.submitBtn') || 'Solicitar revisión comercial'}</span>
                                </>
                            )}
                        </button>
                    ) : (
                        <div className="flex flex-col sm:items-end gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => onOpenFullSetup('OVERVIEW')}
                                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <span>{t('guided.review.viewPendingBtn') || 'Completar en configuración'}</span>
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Specific Enumeration of Pending Requirements */}
                {!canRequestReview && (
                    <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2">
                        <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
                            <span>{t('guided.review.pendingSectionTitle') || 'Requisitos pendientes concretos'}:</span>
                        </div>
                        <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-2 list-none p-0">
                            {!isAccountComplete && (
                                <li className="space-y-1">
                                    <div className="flex items-center justify-between font-semibold">
                                        <span>{t('guided.review.pendingAccount') || 'Datos de empresa o primera planta de producción incompletos'}:</span>
                                        <div className="flex items-center gap-2">
                                            {onGoToCompanyField && (
                                                <button
                                                    type="button"
                                                    onClick={() => onGoToCompanyField('legalName')}
                                                    className="text-[11px] font-bold text-amber-900 dark:text-amber-100 underline cursor-pointer"
                                                >
                                                    {t('guided.action.editInStep') || 'Editar en asistente'}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => onOpenFullSetup('COMPANY')}
                                                className="text-[11px] font-bold text-amber-900/80 dark:text-amber-200/80 hover:underline cursor-pointer"
                                            >
                                                {t('guided.action.openFullSetup') || 'Configuración completa'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="pl-3 flex flex-wrap gap-1.5 text-[11px]">
                                        {!company?.legalName?.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => onGoToCompanyField ? onGoToCompanyField('legalName') : onOpenFullSetup('COMPANY')}
                                                className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer"
                                            >
                                                {t('guided.review.fieldMissing') || 'Falta'}: {t('guided.review.field.legalName') || 'Razón social'} ↗
                                            </button>
                                        )}
                                        {!company?.country?.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => onGoToCompanyField ? onGoToCompanyField('country') : onOpenFullSetup('COMPANY')}
                                                className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer"
                                            >
                                                {t('guided.review.fieldMissing') || 'Falta'}: {t('guided.review.field.country') || 'País'} ↗
                                            </button>
                                        )}
                                        {!company?.city?.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => onGoToCompanyField ? onGoToCompanyField('city') : onOpenFullSetup('SITES')}
                                                className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer"
                                            >
                                                {t('guided.review.fieldMissing') || 'Falta'}: {t('guided.review.field.city') || 'Ciudad'} ↗
                                            </button>
                                        )}
                                        {!company?.siteName?.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => onGoToCompanyField ? onGoToCompanyField('siteName') : onOpenFullSetup('SITES')}
                                                className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer"
                                            >
                                                {t('guided.review.fieldMissing') || 'Falta'}: {t('guided.review.field.siteName') || 'Nombre de planta'} ↗
                                            </button>
                                        )}
                                        {(!company?.contactName?.trim() && !company?.phone?.trim()) && (
                                            <button
                                                type="button"
                                                onClick={() => onGoToCompanyField ? onGoToCompanyField('contactName') : onOpenFullSetup('COMPANY')}
                                                className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer"
                                            >
                                                {t('guided.review.fieldMissing') || 'Falta'}: {t('guided.review.field.contact') || 'Persona o teléfono de contacto'} ↗
                                            </button>
                                        )}
                                        {(!company?.siteTimezone?.trim() && (accountReadiness?.advisories || []).some((a: any) => a.code === 'ADD_SITE_TIMEZONE')) && (
                                            <button
                                                type="button"
                                                onClick={() => onGoToCompanyField ? onGoToCompanyField('siteTimezone') : onOpenFullSetup('SITES')}
                                                className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer"
                                            >
                                                {t('guided.review.fieldMissing') || 'Falta'}: {t('guided.review.field.timezone') || 'Zona horaria de la planta'} ↗
                                            </button>
                                        )}
                                    </div>
                                </li>
                            )}
                            {!isOpsComplete && (
                                <li className="flex items-center justify-between">
                                    <span>{t('guided.review.pendingMachines') || 'Asignación de maquinaria, capacidades o nodos de impresión pendiente.'}</span>
                                    <button
                                        type="button"
                                        onClick={() => onOpenFullSetup('MACHINES')}
                                        className="text-[11px] font-bold text-amber-900 dark:text-amber-100 underline ml-2 cursor-pointer"
                                    >
                                        {t('common.resolve') || 'Resolver'}
                                    </button>
                                </li>
                            )}
                            {!stageCEval.isComplete && (
                                <li className="space-y-1">
                                    <div className="flex items-center justify-between font-semibold">
                                        <span>
                                            {!isGlobalPricingComplete 
                                                ? (t('guided.review.pendingGlobalPricing') || 'Tarifas industriales base del taller sin configurar')
                                                : `${t('guided.review.pendingFamilyPricing') || 'Familias de producto con tarifas pendientes'} (${stageCEval.pendingFamilies.length})`}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={onBackToPricing}
                                            className="text-[11px] font-bold text-amber-900 dark:text-amber-100 underline ml-2 cursor-pointer"
                                        >
                                            {t('common.goToPricing') || 'Ir a precios'}
                                        </button>
                                    </div>
                                    {stageCEval.pendingFamilies.length > 0 && (
                                        <div className="pl-3 flex flex-wrap gap-1.5 text-[11px]">
                                            {stageCEval.pendingFamilies.map(fid => (
                                                <button
                                                    key={fid}
                                                    type="button"
                                                    onClick={() => onGoToFamilyPricing ? onGoToFamilyPricing(fid) : onBackToPricing()}
                                                    className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer"
                                                >
                                                    {t(families[fid]?.titleKey || fid)}: {t('guided.review.pendingMethodOrRates') || 'Asignar método'} ↗
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            )}
                            {blockingIssues.map((issue, idx) => (
                                <li key={idx} className="flex items-center justify-between">
                                    <span>{typeof issue === 'string' ? issue : (issue.message || issue.description || JSON.stringify(issue))}</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (issue.stage === 'COMPANY' && onGoToCompanyField && issue.targetField) {
                                                onGoToCompanyField(issue.targetField);
                                            } else {
                                                onOpenFullSetup(issue.targetTab || 'OVERVIEW');
                                            }
                                        }}
                                        className="text-[11px] font-bold text-amber-900 dark:text-amber-100 underline ml-2 cursor-pointer"
                                    >
                                        {t('common.resolve') || 'Resolver'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Important Governance Note: NO false marketplace promises */}
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    <span className="font-bold text-zinc-900 dark:text-zinc-200">
                        {t('guided.review.governanceNoteTitle') || 'Nota de gobernanza y activación'}:
                    </span>{' '}
                    {t('guided.review.governanceNoteText') || 'Completar esta configuración inicial no equivale a activar el marketplace, publicar precios al público, ni habilitar la cotización o enrutamiento automático de pedidos en vivo. La activación de producción requiere la revisión y autorización comercial independiente de la plataforma.'}
                </div>
            </div>


            {/* Footer Navigation */}
            <div className="flex items-center justify-between pt-2">
                <button
                    type="button"
                    onClick={onBackToPricing}
                    className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
                >
                    <ArrowLeft size={15} />
                    <span>{t('guided.action.backToPricing') || 'Volver a precios y calibración'}</span>
                </button>

                <button
                    type="button"
                    onClick={() => onOpenFullSetup('OVERVIEW')}
                    className="px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
                >
                    <span>{t('guided.action.openFullSetup') || 'Abrir configuración completa'}</span>
                    <ExternalLink size={14} />
                </button>
            </div>
        </div>
    );
};
