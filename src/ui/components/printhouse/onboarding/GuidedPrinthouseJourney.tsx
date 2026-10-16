/**
 * src/ui/components/printhouse/onboarding/GuidedPrinthouseJourney.tsx
 *
 * Core Guided Printhouse Onboarding Journey:
 * Transforms the industrial console into an approachable, trustworthy, 4-stage guided flow:
 * - Welcome: "Preparemos tu imprenta" with clear promise and dominant single action.
 * - Stage A: Tu imprenta (company profile + first production site).
 * - Stage B: Qué produces (4 canonical binding families with large icons).
 * - Stage C: Tus precios (integrated SimplifiedOnboardingJourney with real quote upload/calibration).
 * - Stage D: Revisar y continuar (readiness summary, governed submission, next concrete action).
 *
 * Governance & Architecture Invariants:
 * 1. Server-side price and matrix calculations exclusively (printhouseCalibrationApi).
 * 2. Strict tenant isolation with persisted draft continuity.
 * 3. Coexists with PrinthouseSetupHub without mutating auth or role grants.
 * 4. Zero false claims of "live marketplace" or "order dispatch ready".
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Building2, Layers, Tag, CheckCircle2, ArrowRight, 
    Sparkles, Shield, ArrowLeft, RefreshCw, AlertCircle, 
    HelpCircle, Sliders, FileText, ChevronRight, Check, AlertTriangle
} from 'lucide-react';
import { useLocale } from '../../../i18n';
import { getAuthToken, getAuthUser } from '../../../lib/authStore';
import { 
    GuidedStage, 
    CompanyDraftData, 
    GuidedOnboardingDraft, 
    FamilyPricingSessionDraft,
    loadGuidedOnboardingDraft, 
    saveGuidedOnboardingDraft,
    clearGuidedOnboardingDraft,
    createDefaultDraft
} from '../../../lib/onboardingDraftStore';
import { ProductFamilyId, FamilyState } from '../../../types/printhouseOnboardingTypes';
import { normalizeUiError } from '../../../utils/errorUtils';
import { GuidedStepCompany } from './GuidedStepCompany';
import { GuidedStepProducts } from './GuidedStepProducts';
import { GuidedStepReview } from './GuidedStepReview';
import { SimplifiedOnboardingJourney } from './SimplifiedOnboardingJourney';

interface GuidedPrinthouseJourneyProps {
    printerNodeId?: string;
    printerNodeName?: string;
    onOpenFullSetup: (targetTab?: string) => void;
    onComplete?: () => void;
}

export type DraftStorageStatus = 'saved' | 'saving' | 'unsaved' | 'storage_unavailable';

export const GuidedPrinthouseJourney: React.FC<GuidedPrinthouseJourneyProps> = ({
    printerNodeId,
    printerNodeName = 'Planta de Producción',
    onOpenFullSetup,
    onComplete
}) => {
    const { t, locale, setLocale } = useLocale();
    const user = getAuthUser();
    // Do not fall back to shared 'tenant-current'. Use the authenticated user's tenantId directly.
    const tenantId = (user?.tenantId || '').trim();

    // ── Persistent Draft State ──
    const [draft, setDraft] = useState<GuidedOnboardingDraft>(() => loadGuidedOnboardingDraft(tenantId));
    const [loadingData, setLoadingData] = useState<boolean>(true);
    const [serverData, setServerData] = useState<any>(null);
    const [networkError, setNetworkError] = useState<string | null>(null);
    const [storageStatus, setStorageStatus] = useState<DraftStorageStatus>('saved');

    // ── Readiness Refresh Freshness State ──
    const [isRefreshingReadiness, setIsRefreshingReadiness] = useState<boolean>(false);
    const [readinessError, setReadinessError] = useState<string | null>(null);

    // Track mounted state to safely discard background updates after unmount
    const isMountedRef = useRef<boolean>(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Track active tenant to discard out-of-order / delayed responses from previous identities
    const activeTenantRef = useRef<string>(tenantId);
    activeTenantRef.current = tenantId;
    const prevTenantRef = useRef<string>(tenantId);

    // Initial server fetch on mount
    useEffect(() => {
        fetchServerState(tenantId);
    }, []);

    // Reset all internal state and reload draft whenever the authenticated tenant changes
    useEffect(() => {
        if (prevTenantRef.current === tenantId) {
            return;
        }
        prevTenantRef.current = tenantId;
        setServerData(null);
        setNetworkError(null);
        setReadinessError(null);
        setFamilies({
            HARDCOVER: { id: 'HARDCOVER', titleKey: 'family.hardcover.title', descKey: 'family.hardcover.desc', status: 'PENDING', quoteCount: 0 },
            SOFTCOVER: { id: 'SOFTCOVER', titleKey: 'family.softcover.title', descKey: 'family.softcover.desc', status: 'PENDING', quoteCount: 0 },
            WIRE_O: { id: 'WIRE_O', titleKey: 'family.wireO.title', descKey: 'family.wireO.desc', status: 'PENDING', quoteCount: 0 },
            SADDLE_STITCH: { id: 'SADDLE_STITCH', titleKey: 'family.saddleStitch.title', descKey: 'family.saddleStitch.desc', status: 'PENDING', quoteCount: 0 }
        });
        const freshDraft = loadGuidedOnboardingDraft(tenantId);
        setDraft(freshDraft);
        setStorageStatus('saved');
        fetchServerState(tenantId);
    }, [tenantId]);

    // ── 4 Families State ──
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

    // Helper to persist draft and consume the boolean result from saveGuidedOnboardingDraft
    const persistDraft = useCallback((nextDraft: GuidedOnboardingDraft) => {
        const ok = saveGuidedOnboardingDraft(nextDraft);
        setStorageStatus(ok ? 'saved' : 'storage_unavailable');
        return ok;
    }, []);

    // Sync draft updates to localStorage and state
    const updateDraft = useCallback((updater: (prev: GuidedOnboardingDraft) => GuidedOnboardingDraft) => {
        setDraft(prev => {
            const next = updater(prev);
            persistDraft(next);
            return next;
        });
    }, [persistDraft]);

    // Fetch live onboarding data from server and reconcile with draft
    const fetchServerState = async (targetTenantId = tenantId) => {
        if (!targetTenantId) {
            setLoadingData(false);
            return;
        }
        setLoadingData(true);
        setIsRefreshingReadiness(true);
        setNetworkError(null);
        setReadinessError(null);

        try {
            const token = getAuthToken();
            const res = await fetch('/api/printhouse/onboarding', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            // Discard responses from previous identities if tenant switched while request was in-flight
            if (activeTenantRef.current !== targetTenantId) {
                return;
            }

            if (res.ok && data.ok) {
                setServerData(data.data);
                const serverCompany = data.data?.company;
                const serverSites = data.data?.sites || [];
                const primarySite = serverSites[0];

                // Reconcile draft with server truth:
                // Distinguish untouched defaults vs locally edited fields vs acknowledged values.
                // Defaults such as ES and Europe/Madrid must NEVER override actual server values.
                setDraft(prev => {
                    const editedFields = new Set(prev.company.userEditedFields || []);
                    const ackValues = prev.company.acknowledgedServerValues || {};

                    // Reconcile field: if user locally touched it, keep local draft.
                    // If clean (untouched), adopt server value if the key exists on server (even if '' or null).
                    // Only fallback to prev.company[field] if the server payload completely omitted the key (undefined).
                    const resolveField = (
                        field: keyof CompanyDraftData,
                        serverVal: string | null | undefined,
                        fallbackDefault: string = ''
                    ): string => {
                        if (editedFields.has(field)) {
                            return (prev.company[field] as string) ?? '';
                        }
                        if (serverVal !== undefined && serverVal !== null) {
                            return String(serverVal);
                        }
                        if (serverVal === null) {
                            return '';
                        }
                        return (prev.company[field] as string) || fallbackDefault;
                    };

                    const rawLegal = serverCompany?.legalName !== undefined ? serverCompany?.legalName : serverCompany?.companyName;
                    const serverLegalName = rawLegal !== undefined && rawLegal !== null ? String(rawLegal) : undefined;
                    const serverTrading = serverCompany?.tradingName !== undefined && serverCompany?.tradingName !== null ? String(serverCompany.tradingName) : (serverCompany && 'tradingName' in serverCompany ? '' : undefined);
                    const serverCountry = serverCompany?.country !== undefined && serverCompany?.country !== null ? String(serverCompany.country) : (primarySite?.country !== undefined && primarySite?.country !== null ? String(primarySite.country) : undefined);
                    
                    let serverCity: string | undefined = undefined;
                    if (primarySite?.city !== undefined && primarySite?.city !== null && primarySite.city !== 'Pending Setup') {
                        serverCity = String(primarySite.city);
                    } else if (serverCompany?.city !== undefined && serverCompany?.city !== null) {
                        serverCity = String(serverCompany.city);
                    } else if (serverCompany && 'city' in serverCompany) {
                        serverCity = '';
                    }

                    const serverAddress = serverCompany?.address !== undefined && serverCompany?.address !== null ? String(serverCompany.address) : (serverCompany && 'address' in serverCompany ? '' : undefined);
                    const serverPostalCode = serverCompany?.postalCode !== undefined && serverCompany?.postalCode !== null ? String(serverCompany.postalCode) : (serverCompany && 'postalCode' in serverCompany ? '' : undefined);
                    const serverPhone = serverCompany?.phone !== undefined && serverCompany?.phone !== null ? String(serverCompany.phone) : (primarySite?.phone !== undefined && primarySite?.phone !== null ? String(primarySite.phone) : (serverCompany && 'phone' in serverCompany ? '' : undefined));
                    const serverWebsite = serverCompany?.website !== undefined && serverCompany?.website !== null ? String(serverCompany.website) : (primarySite?.website !== undefined && primarySite?.website !== null ? String(primarySite.website) : (serverCompany && 'website' in serverCompany ? '' : undefined));
                    const serverContact = serverCompany?.contactName !== undefined && serverCompany?.contactName !== null ? String(serverCompany.contactName) : (serverCompany && 'contactName' in serverCompany ? '' : undefined);
                    const serverTaxId = serverCompany?.taxId !== undefined && serverCompany?.taxId !== null ? String(serverCompany.taxId) : (serverCompany && 'taxId' in serverCompany ? '' : undefined);
                    const serverSiteName = primarySite?.siteName !== undefined && primarySite?.siteName !== null ? String(primarySite.siteName) : (primarySite && 'siteName' in primarySite ? '' : undefined);
                    const serverSiteTimezone = primarySite?.timezone !== undefined && primarySite?.timezone !== null ? String(primarySite.timezone) : (primarySite && 'timezone' in primarySite ? '' : undefined);
                    const serverPrimarySiteId = primarySite?.siteId || null;

                    const reconciledCompany: CompanyDraftData = {
                        ...prev.company,
                        legalName: resolveField('legalName', serverLegalName, prev.company.legalName),
                        tradingName: resolveField('tradingName', serverTrading),
                        country: resolveField('country', serverCountry, prev.company.country),
                        city: resolveField('city', serverCity, prev.company.city),
                        address: resolveField('address', serverAddress),
                        postalCode: resolveField('postalCode', serverPostalCode),
                        phone: resolveField('phone', serverPhone),
                        website: resolveField('website', serverWebsite),
                        contactName: resolveField('contactName', serverContact),
                        taxId: resolveField('taxId', serverTaxId),
                        siteName: resolveField('siteName', serverSiteName, prev.company.siteName || 'Planta Principal'),
                        siteTimezone: resolveField('siteTimezone', serverSiteTimezone, prev.company.siteTimezone),
                        primarySiteId: prev.company.primarySiteId || serverPrimarySiteId,
                        acknowledgedServerValues: {
                            ...ackValues,
                            ...(serverLegalName !== undefined ? { legalName: serverLegalName } : {}),
                            ...(serverTrading !== undefined ? { tradingName: serverTrading } : {}),
                            ...(serverCountry !== undefined ? { country: serverCountry } : {}),
                            ...(serverCity !== undefined ? { city: serverCity } : {}),
                            ...(serverAddress !== undefined ? { address: serverAddress } : {}),
                            ...(serverPostalCode !== undefined ? { postalCode: serverPostalCode } : {}),
                            ...(serverPhone !== undefined ? { phone: serverPhone } : {}),
                            ...(serverWebsite !== undefined ? { website: serverWebsite } : {}),
                            ...(serverContact !== undefined ? { contactName: serverContact } : {}),
                            ...(serverTaxId !== undefined ? { taxId: serverTaxId } : {}),
                            ...(serverSiteName !== undefined ? { siteName: serverSiteName } : {}),
                            ...(serverSiteTimezone !== undefined ? { siteTimezone: serverSiteTimezone } : {})
                        }
                    };

                    const updated: GuidedOnboardingDraft = {
                        ...prev,
                        company: reconciledCompany
                    };
                    persistDraft(updated);
                    return updated;
                });
            } else {
                const errMsg = normalizeUiError(data, t('guided.review.refreshError') || 'No se pudieron recuperar los datos de la imprenta.');
                setNetworkError(errMsg);
                setReadinessError(errMsg);
            }
        } catch (err: any) {
            if (activeTenantRef.current === targetTenantId) {
                const errMsg = normalizeUiError(err, t('guided.review.refreshError') || 'Error de red al conectar con el servidor.');
                setNetworkError(errMsg);
                setReadinessError(errMsg);
            }
        } finally {
            if (activeTenantRef.current === targetTenantId) {
                setLoadingData(false);
                setIsRefreshingReadiness(false);
            }
        }
    };

    // Stable continuity and family handlers for SimplifiedOnboardingJourney:
    // Preserves changes to activeRun, proposedPatch, offer, and comparisonData without introducing render loops.
    // Comprehensive comparison ensures every meaningful offer change (runs, prices, quantities, paper, finishes) is preserved.
    const handlePricingContinuityChange = useCallback((famId: ProductFamilyId, famDraft: any) => {
        updateDraft(prev => {
            const existing = prev.pricingContinuity?.[famId];
            if (existing) {
                const sameSession = existing.sessionId === famDraft.sessionId;
                const sameVariant = existing.selectedVariantId === famDraft.selectedVariantId;
                const sameStep = existing.step === famDraft.step;
                const sameEntry = existing.entryMode === famDraft.entryMode;
                const sameFile = existing.uploadedFileName === famDraft.uploadedFileName;
                
                // Compare activeRun by identity and status/revision
                const sameRun = (existing.activeRun === famDraft.activeRun) ||
                    (existing.activeRun?.id === famDraft.activeRun?.id && 
                     existing.activeRun?.status === famDraft.activeRun?.status &&
                     existing.activeRun?.revisionId === famDraft.activeRun?.revisionId &&
                     JSON.stringify(existing.activeRun || null) === JSON.stringify(famDraft.activeRun || null));

                // Compare proposedPatch
                const samePatch = (existing.proposedPatch === famDraft.proposedPatch) ||
                    (JSON.stringify(existing.proposedPatch || {}) === JSON.stringify(famDraft.proposedPatch || {}));

                // Compare comparisonData key fields and deep structure
                const sameComp = (existing.comparisonData === famDraft.comparisonData) ||
                    (existing.comparisonData?.enginePrice === famDraft.comparisonData?.enginePrice &&
                     existing.comparisonData?.originalPrice === famDraft.comparisonData?.originalPrice &&
                     existing.comparisonData?.difference === famDraft.comparisonData?.difference &&
                     existing.comparisonData?.isCalculated === famDraft.comparisonData?.isCalculated &&
                     JSON.stringify(existing.comparisonData || null) === JSON.stringify(famDraft.comparisonData || null));

                // Comprehensive offer comparison: preserve every meaningful offer change including
                // runs, quantities, prices, paper, pages, binding, finishes, and dimensions
                const sameOffer = (existing.offer === famDraft.offer) ||
                    (JSON.stringify(existing.offer || null) === JSON.stringify(famDraft.offer || null));

                if (sameSession && sameVariant && sameStep && sameEntry && sameFile && sameRun && samePatch && sameComp && sameOffer) {
                    return prev;
                }
            }
            return {
                ...prev,
                pricingContinuity: {
                    ...prev.pricingContinuity,
                    [famId]: famDraft
                }
            };
        });
    }, [updateDraft]);

    const handleFamiliesStateChange = useCallback((newFamilies: Record<ProductFamilyId, FamilyState>) => {
        setFamilies(newFamilies);
    }, []);

    // Stage Navigation
    const setStage = (stage: GuidedStage) => {
        updateDraft(prev => ({
            ...prev,
            currentStage: stage
        }));
    };

    // ── STAGE A HANDLER: Guardar datos de empresa y sede ──
    // Guarded against identity changes and unmount across all asynchronous boundaries.
    const handleSaveCompany = async (companyData: CompanyDraftData) => {
        const initiatingTenantId = activeTenantRef.current || tenantId;
        const token = getAuthToken();

        // 1. Update company profile
        const compRes = await fetch('/api/printhouse/onboarding/company-profile', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                companyName: companyData.legalName,
                legalName: companyData.legalName,
                tradingName: companyData.tradingName,
                country: companyData.country,
                city: companyData.city,
                address: companyData.address,
                postalCode: companyData.postalCode,
                phone: companyData.phone,
                website: companyData.website,
                contactName: companyData.contactName,
                taxId: companyData.taxId
            })
        });

        // Async Boundary 1 Check: Verify initiating identity before processing result or issuing next request
        if (!isMountedRef.current || activeTenantRef.current !== initiatingTenantId) {
            return;
        }

        if (!compRes.ok) {
            let errJson: any = null;
            try {
                errJson = await compRes.json();
            } catch (_) {}
            const errorMsg = normalizeUiError(errJson, `Error ${compRes.status}: Error al guardar los datos de empresa.`);
            throw new Error(errorMsg);
        }

        // 2. Ensure primary site exists or is completed (idempotent retry safe)
        const existingSites = serverData?.sites || [];
        const primarySite = existingSites[0];
        const knownSiteId = companyData.primarySiteId || primarySite?.siteId;

        const sitePayload = {
            siteName: companyData.siteName || 'Planta Principal',
            country: companyData.country,
            city: companyData.city,
            phone: companyData.phone,
            timezone: companyData.siteTimezone || (companyData.country === 'DE' ? 'Europe/Berlin' : companyData.country === 'GB' ? 'Europe/London' : 'Europe/Madrid')
        };

        let resolvedSiteId = knownSiteId || null;

        if (knownSiteId) {
            const siteRes = await fetch(`/api/printhouse/onboarding/sites/${knownSiteId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(sitePayload)
            });

            // Async Boundary 2 Check
            if (!isMountedRef.current || activeTenantRef.current !== initiatingTenantId) {
                return;
            }

            if (!siteRes.ok) {
                let errJson: any = null;
                try {
                    errJson = await siteRes.json();
                } catch (_) {}
                const errorMsg = normalizeUiError(errJson, `Error ${siteRes.status}: Error al actualizar la sede de producción.`);
                throw new Error(errorMsg);
            }
        } else {
            const siteRes = await fetch('/api/printhouse/onboarding/sites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(sitePayload)
            });

            // Async Boundary 2 Check
            if (!isMountedRef.current || activeTenantRef.current !== initiatingTenantId) {
                return;
            }

            if (!siteRes.ok) {
                let errJson: any = null;
                try {
                    errJson = await siteRes.json();
                } catch (_) {}
                const errorMsg = normalizeUiError(errJson, `Error ${siteRes.status}: Error al registrar la sede de producción.`);
                throw new Error(errorMsg);
            }
            try {
                const siteData = await siteRes.json();
                resolvedSiteId = siteData?.data?.id || siteData?.data?.siteId || siteData?.siteId || null;
            } catch (_) {}
        }

        // Final verification before updating draft or refreshing server state
        if (!isMountedRef.current || activeTenantRef.current !== initiatingTenantId) {
            return;
        }

        // 3. Update persistent draft and advance to Stage B. Clear dirty fields and set acknowledgedServerValues.
        updateDraft(prev => ({
            ...prev,
            company: {
                ...companyData,
                primarySiteId: resolvedSiteId || prev.company.primarySiteId,
                userEditedFields: [],
                acknowledgedServerValues: {
                    ...(prev.company.acknowledgedServerValues || {}),
                    legalName: companyData.legalName,
                    tradingName: companyData.tradingName,
                    country: companyData.country,
                    city: companyData.city,
                    address: companyData.address,
                    postalCode: companyData.postalCode,
                    phone: companyData.phone,
                    website: companyData.website,
                    contactName: companyData.contactName,
                    taxId: companyData.taxId,
                    siteName: companyData.siteName || 'Planta Principal',
                    siteTimezone: companyData.siteTimezone
                }
            },
            completedStages: {
                ...prev.completedStages,
                COMPANY: true
            },
            currentStage: 'PRODUCTS'
        }));

        await fetchServerState(initiatingTenantId);
    };

    // ── STAGE B HANDLERS: Qué produces ──
    const handleToggleFamily = (familyId: ProductFamilyId) => {
        updateDraft(prev => ({
            ...prev,
            enabledFamilies: {
                ...prev.enabledFamilies,
                [familyId]: !prev.enabledFamilies[familyId]
            }
        }));
    };

    const handleSelectActiveFamily = (familyId: ProductFamilyId) => {
        updateDraft(prev => ({
            ...prev,
            selectedFamilyId: familyId
        }));
    };

    // 4-Stage Stepper Header Info
    const stageItems = [
        { key: 'COMPANY', num: 1, label: t('guided.stage.company') || 'Tu imprenta', icon: Building2 },
        { key: 'PRODUCTS', num: 2, label: t('guided.stage.products') || 'Qué produces', icon: Layers },
        { key: 'PRICING', num: 3, label: t('guided.stage.pricing') || 'Tus precios', icon: Tag },
        { key: 'REVIEW', num: 4, label: t('guided.stage.review') || 'Revisar y continuar', icon: CheckCircle2 }
    ];

    if (loadingData && !serverData) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <RefreshCw size={32} className="animate-spin text-[#dc0000]" />
                    <span className="text-xs font-semibold text-zinc-500">
                        {t('guided.loadingWorkspace') || 'Cargando asistente guiado de imprenta…'}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fafafa] dark:bg-[#0e0e0f] text-zinc-900 dark:text-zinc-100 flex flex-col">
            {/* Top Navigation & Brand Bar */}
            <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#131314]/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#dc0000] text-white flex items-center justify-center font-black text-sm shadow-xs">
                        P
                    </div>
                    <div>
                        <div className="text-sm font-black tracking-tight flex items-center gap-2">
                            <span>PrintPrice Pro</span>
                            <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                                {t('guided.badge') || 'Alta Guiada'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Storage Feedback Indicator */}
                    <div 
                        data-testid="guided-storage-status"
                        className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                            storageStatus === 'saved'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : storageStatus === 'storage_unavailable'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                    : storageStatus === 'saving'
                                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                        }`}
                        title={storageStatus === 'storage_unavailable' ? t('guided.storage.unavailable') || 'Almacenamiento no disponible' : undefined}
                    >
                        {storageStatus === 'saved' && (
                            <>
                                <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                                <span>{t('guided.storage.saved') || 'Borrador guardado'}</span>
                            </>
                        )}
                        {storageStatus === 'saving' && (
                            <>
                                <RefreshCw size={12} className="animate-spin text-blue-600" />
                                <span>{t('guided.storage.saving') || 'Guardando...'}</span>
                            </>
                        )}
                        {storageStatus === 'unsaved' && (
                            <span>{t('guided.storage.unsaved') || 'Cambios sin guardar'}</span>
                        )}
                        {storageStatus === 'storage_unavailable' && (
                            <>
                                <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
                                <span>{t('guided.storage.unavailable') || 'Almacenamiento no disponible'}</span>
                            </>
                        )}
                    </div>

                    {/* Language Switcher */}
                    <button
                        type="button"
                        onClick={() => {
                            const nextLoc = locale === 'en' ? 'es' : locale === 'es' ? 'de' : 'en';
                            setLocale(nextLoc);
                        }}
                        aria-label={`Switch language (current: ${locale.toUpperCase()})`}
                        className="px-2.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700"
                    >
                        {locale.toUpperCase()}
                    </button>

                    {/* Open Advanced Hub */}
                    <button
                        type="button"
                        onClick={() => onOpenFullSetup('OVERVIEW')}
                        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                    >
                        <Sliders size={13} />
                        <span>{t('guided.action.openFullSetup') || 'Abrir configuración completa'}</span>
                    </button>
                </div>
            </header>

            {/* Main Stage Stepper Indicator (Visible during stages A..D) */}
            {draft.currentStage !== 'WELCOME' && (
                <div className="bg-white dark:bg-[#131314] border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-8 py-3">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        {stageItems.map((item, idx) => {
                            const Icon = item.icon;
                            const isActive = draft.currentStage === item.key;
                            const isPast = (
                                (item.key === 'COMPANY' && ['PRODUCTS', 'PRICING', 'REVIEW'].includes(draft.currentStage)) ||
                                (item.key === 'PRODUCTS' && ['PRICING', 'REVIEW'].includes(draft.currentStage)) ||
                                (item.key === 'PRICING' && draft.currentStage === 'REVIEW')
                            );

                            return (
                                <React.Fragment key={item.key}>
                                    <button
                                        type="button"
                                        onClick={() => setStage(item.key as GuidedStage)}
                                        className={`flex items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                                            isActive
                                                ? 'text-[#dc0000]'
                                                : isPast
                                                    ? 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900'
                                                    : 'text-zinc-400 dark:text-zinc-600'
                                        }`}
                                    >
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition-colors ${
                                            isActive
                                                ? 'bg-[#dc0000] text-white shadow-2xs'
                                                : isPast
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                                        }`}>
                                            {isPast ? '✓' : item.num}
                                        </div>
                                        <span className="hidden sm:inline">{item.label}</span>
                                    </button>

                                    {idx < stageItems.length - 1 && (
                                        <div className="flex-1 max-w-[48px] sm:max-w-[72px] h-[2px] mx-2 bg-zinc-200 dark:bg-zinc-800" />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Error Notification if any */}
            {networkError && (
                <div className="max-w-4xl mx-auto px-4 mt-4 w-full">
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs font-medium flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-600 shrink-0" />
                            <span>{networkError}</span>
                        </div>
                        <button
                            type="button"
                            onClick={fetchServerState}
                            className="px-2.5 py-1 bg-amber-600 text-white font-bold rounded-lg text-xs hover:bg-amber-700 transition-colors"
                        >
                            {t('common.retry') || 'Reintentar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Body View Container */}
            <main className="flex-1 px-4 sm:px-8 py-8 sm:py-12 max-w-5xl mx-auto w-full">
                {/* ── WELCOME VIEW ── */}
                {draft.currentStage === 'WELCOME' && (
                    <div className="max-w-3xl mx-auto text-center space-y-8 py-6 sm:py-12">
                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-[#dc0000] text-xs font-bold">
                                <Sparkles size={14} />
                                <span>{t('guided.welcome.badge') || 'Nueva experiencia guiada'}</span>
                            </div>

                            <h1 className="text-3xl sm:text-5xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">
                                {t('guided.welcome.title') || 'Preparemos tu imprenta'}
                            </h1>

                            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed">
                                {t('guided.welcome.subtitle') || 'Cuéntanos qué produces y utiliza tus presupuestos para configurar tus precios sin complicaciones técnicas.'}
                            </p>
                        </div>

                        {/* 3 Core Value Highlights */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
                            <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2">
                                <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#dc0000] w-fit">
                                    <Building2 size={18} />
                                </div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {t('guided.welcome.point1Title') || '1. Tu taller'}
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('guided.welcome.point1Desc') || 'Datos básicos de empresa y sede sin formularios interminables.'}
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2">
                                <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#dc0000] w-fit">
                                    <Layers size={18} />
                                </div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {t('guided.welcome.point2Title') || '2. Tus productos'}
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('guided.welcome.point2Desc') || 'Selecciona fácilmente qué encuadernaciones fabricáis.'}
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2">
                                <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#dc0000] w-fit">
                                    <Tag size={18} />
                                </div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {t('guided.welcome.point3Title') || '3. Tu primer presupuesto'}
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('guided.welcome.point3Desc') || 'Sube un PDF existente para calibrar tus tarifas con precisión.'}
                                </p>
                            </div>
                        </div>

                        {/* Dominant Primary Action & Secondary Links */}
                        <div className="space-y-4 pt-2">
                            <button
                                type="button"
                                onClick={() => setStage('COMPANY')}
                                className="px-8 py-3.5 bg-[#dc0000] hover:bg-[#b50000] text-white text-sm font-black rounded-2xl shadow-xs hover:shadow-md transition-all inline-flex items-center gap-2.5 cursor-pointer"
                            >
                                <span>
                                    {draft.completedStages.COMPANY 
                                        ? (t('guided.welcome.ctaContinue') || 'Continuar configuración') 
                                        : (t('guided.welcome.ctaStart') || 'Comenzar configuración')}
                                </span>
                                <ArrowRight size={16} />
                            </button>

                            <div className="flex items-center justify-center gap-6 text-xs text-zinc-500">
                                <button
                                    type="button"
                                    onClick={() => onOpenFullSetup('OVERVIEW')}
                                    className="hover:text-zinc-800 dark:hover:text-zinc-200 underline underline-offset-4 cursor-pointer"
                                >
                                    {t('guided.action.openFullSetup') || 'Abrir configuración completa'}
                                </button>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                    <Shield size={13} className="text-emerald-600" />
                                    <span>{t('guided.welcome.draftAutoSave') || 'Progreso guardado automáticamente'}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STAGE A: Tu imprenta ── */}
                {draft.currentStage === 'COMPANY' && (
                    <GuidedStepCompany
                        initialCompany={draft.company}
                        onSaveAndContinue={handleSaveCompany}
                        onDraftChange={(nextCompany) => {
                            updateDraft(prev => ({
                                ...prev,
                                company: nextCompany
                            }));
                        }}
                        onBackToWelcome={() => setStage('WELCOME')}
                        onOpenFullSetup={() => onOpenFullSetup('COMPANY')}
                    />
                )}

                {/* ── STAGE B: Qué produces ── */}
                {draft.currentStage === 'PRODUCTS' && (
                    <GuidedStepProducts
                        families={families}
                        enabledFamilies={draft.enabledFamilies}
                        selectedFamilyId={draft.selectedFamilyId}
                        onToggleFamily={handleToggleFamily}
                        onSelectActiveFamily={handleSelectActiveFamily}
                        onContinueToPricing={() => setStage('PRICING')}
                        onBackToCompany={() => setStage('COMPANY')}
                        onOpenFullSetup={() => onOpenFullSetup('CAPABILITIES')}
                    />
                )}

                {/* ── STAGE C: Tus precios ── */}
                {draft.currentStage === 'PRICING' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                            <div>
                                <span className="text-[11px] font-black uppercase tracking-widest text-[#dc0000]">
                                    {t('guided.stageC.badge') || 'Etapa 3 de 4 · Tus precios'}
                                </span>
                                <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                                    {t('guided.stageC.title') || 'Calibra tus tarifas con un presupuesto real'}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStage('REVIEW')}
                                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                <span>{t('guided.action.skipToReview') || 'Ir a resumen final'}</span>
                                <ArrowRight size={14} />
                            </button>
                        </div>

                        {!printerNodeId && (
                            <div role="alert" className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-medium flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5">
                                    <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <div className="font-bold">
                                            {t('guided.pricing.prerequisiteNodeRequired') || 'Se requiere un nodo de impresión configurado para calibrar tarifas.'}
                                        </div>
                                        <p className="text-[11px] text-amber-800 dark:text-amber-300">
                                            Una sede o planta física no sustituye a una máquina o nodo de impresión. Configura tu maquinaria en la consola avanzada para habilitar el cálculo inverso.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onOpenFullSetup('MACHINES')}
                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shrink-0 transition-colors"
                                >
                                    {t('guided.pricing.prerequisiteNodeLink') || 'Configurar maquinaria y nodos'}
                                </button>
                            </div>
                        )}

                        {/* Reused Production Component: SimplifiedOnboardingJourney */}
                        <SimplifiedOnboardingJourney
                            printerNodeId={printerNodeId}
                            printerNodeName={printerNodeName}
                            initialStep={2}
                            isGuidedMode={true}
                            targetFamilyId={draft.selectedFamilyId}
                            initialPricingDrafts={draft.pricingContinuity}
                            onPricingContinuityChange={handlePricingContinuityChange}
                            onCompleted={() => setStage('REVIEW')}
                            onOpenAdvanced={() => onOpenFullSetup('PRICING')}
                            onFamiliesStateChange={handleFamiliesStateChange}
                        />
                    </div>
                )}

                {/* ── STAGE D: Revisar y continuar ── */}
                {draft.currentStage === 'REVIEW' && (
                    <GuidedStepReview
                        company={draft.company}
                        families={families}
                        enabledFamilies={draft.enabledFamilies}
                        readinessData={serverData?.readiness}
                        isRefreshingReadiness={isRefreshingReadiness}
                        refreshError={readinessError}
                        onBackToPricing={() => setStage('PRICING')}
                        onOpenFullSetup={onOpenFullSetup}
                        onRefreshReadiness={() => fetchServerState()}
                    />
                )}
            </main>
        </div>
    );
};
