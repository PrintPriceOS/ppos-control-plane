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
    HelpCircle, Sliders, FileText, ChevronRight, Check, AlertTriangle,
    Sun, Moon, Wrench, FileSpreadsheet, Bot
} from 'lucide-react';
import { useLocale } from '../../../i18n';
import { getAuthToken, getAuthUser } from '../../../lib/authStore';
import { getTheme, setTheme, subscribeTheme, Theme } from '../../../lib/themeStore';
import { 
    GuidedStage, 
    CompanyDraftData, 
    GuidedOnboardingDraft, 
    FamilyPricingSessionDraft,
    PricingMethodChoice,
    StageDerivationContext,
    loadGuidedOnboardingDraft, 
    saveGuidedOnboardingDraft,
    clearGuidedOnboardingDraft,
    createDefaultDraft,
    deriveServerStage
} from '../../../lib/onboardingDraftStore';
import { ProductFamilyId, FamilyState } from '../../../types/printhouseOnboardingTypes';
import { normalizeUiError } from '../../../utils/errorUtils';
import { BindingIcon } from './BindingFamilyIcons';
import { GuidedStepCompany } from './GuidedStepCompany';
import { GuidedStepProducts } from './GuidedStepProducts';
import { GuidedStepReview } from './GuidedStepReview';
import { SimplifiedOnboardingJourney } from './SimplifiedOnboardingJourney';
import { CanonicalIndustrialPricingEditor } from '../pricing/CanonicalIndustrialPricingEditor';
import { SUGGESTED_RATES_METADATA } from '../pricing/printhouseSuggestedRates';


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

    const [theme, setLocalTheme] = useState<Theme>(() => getTheme());

    useEffect(() => {
        const unsubscribe = subscribeTheme((t) => setLocalTheme(t));
        return () => unsubscribe();
    }, []);

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
    // Track whether initial mount stage reconciliation has executed
    const hasReconciledStageRef = useRef<boolean>(false);
    // Track if user explicitly navigated stages during the session
    const hasUserNavigatedRef = useRef<boolean>(false);

    // Initial server fetch on mount
    useEffect(() => {
        fetchServerState(tenantId, true);
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
        hasReconciledStageRef.current = false;
        hasUserNavigatedRef.current = false;
        const freshDraft = loadGuidedOnboardingDraft(tenantId);
        setDraft(freshDraft);
        setStorageStatus('saved');
        fetchServerState(tenantId, true);
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
    const fetchServerState = async (targetTenantId = tenantId, isMountReconcile = false) => {
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
                    // For company phone & website: an authoritative field explicitly set to '' or null must clear the clean field.
                    // Fallback to primarySite values ONLY when the company field is truly absent (undefined).
                    let serverPhone: string | undefined = undefined;
                    if (serverCompany && 'phone' in serverCompany) {
                        serverPhone = serverCompany.phone !== undefined && serverCompany.phone !== null ? String(serverCompany.phone) : '';
                    } else if (primarySite?.phone !== undefined && primarySite?.phone !== null) {
                        serverPhone = String(primarySite.phone);
                    }

                    let serverWebsite: string | undefined = undefined;
                    if (serverCompany && 'website' in serverCompany) {
                        serverWebsite = serverCompany.website !== undefined && serverCompany.website !== null ? String(serverCompany.website) : '';
                    } else if (primarySite?.website !== undefined && primarySite?.website !== null) {
                        serverWebsite = String(primarySite.website);
                    }
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

                    const updatedCompanyDraft = {
                        ...prev,
                        company: reconciledCompany
                    };

                    // Runtime Reconciliation of First Pending Guided Stage:
                    // Only reconcile stage on initial mount when user hasn't explicitly navigated,
                    // or if current stage is unstarted/out-of-sync with authoritative server facts.
                    const hasPricingContinuity = Boolean(
                        prev.pricingContinuity && 
                        Object.values(prev.pricingContinuity).some((p: any) => p && (p.sessionId || p.offer || p.uploadedFileName || p.pricingMethod))
                    );

                    const derivationCtx: StageDerivationContext = {
                        draftStage: prev.currentStage,
                        completedStages: prev.completedStages,
                        enabledFamilies: prev.enabledFamilies,
                        hasPricingContinuity
                    };

                    const serverDerivedStage = deriveServerStage(data.data?.readiness, derivationCtx);

                    const isAccountComplete = data.data?.readiness?.accountSetup?.status === 'COMPLETE';
                    let reconciledStage = prev.currentStage;
                    // If this is initial mount or resuming a pending session, and user has not manually navigated:
                    if (isMountReconcile && !hasUserNavigatedRef.current && !hasReconciledStageRef.current) {
                        hasReconciledStageRef.current = true;
                        if (prev.currentStage === 'WELCOME') {
                            // Keep WELCOME screen so novel/returning users see welcoming overview
                            reconciledStage = 'WELCOME';
                        } else if (prev.currentStage === 'COMPANY') {
                            // If user was on COMPANY, but server shows accountSetup is COMPLETE, advance to first pending stage
                            reconciledStage = serverDerivedStage;
                        } else if (prev.currentStage === 'PRODUCTS' && prev.completedStages?.PRODUCTS) {
                            // If user completed PRODUCTS, advance to first pending stage (PRICING)
                            reconciledStage = serverDerivedStage;
                        } else if (!isAccountComplete) {
                            // If draft says PRODUCTS/PRICING/REVIEW but server says account setup is incomplete, pull back to COMPANY
                            reconciledStage = 'COMPANY';
                        } else {
                            // User already has an in-progress stage (PRODUCTS, PRICING, or REVIEW) with complete accountSetup
                            reconciledStage = prev.currentStage;
                        }
                    }

                    const updated: GuidedOnboardingDraft = {
                        ...updatedCompanyDraft,
                        currentStage: reconciledStage
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
        hasUserNavigatedRef.current = true;
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

                    {/* Theme Switcher */}
                    <button
                        type="button"
                        onClick={() => {
                            const nextTheme = theme === 'dark' ? 'light' : 'dark';
                            setTheme(nextTheme);
                        }}
                        aria-label={`Switch theme (current: ${theme})`}
                        className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 flex items-center justify-center"
                        title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                    >
                        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                    </button>

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

                        {/* 4 Core Stages Overview */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left max-w-4xl mx-auto">
                            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2">
                                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#dc0000] w-fit">
                                    <Building2 size={18} />
                                </div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {t('guided.welcome.point1Title') || '1. Tu taller'}
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('guided.welcome.point1Desc') || 'Datos esenciales de identidad y primera planta sin formularios interminables.'}
                                </p>
                            </div>

                            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2">
                                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#dc0000] w-fit">
                                    <Layers size={18} />
                                </div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {t('guided.welcome.point2Title') || '2. Qué produces'}
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('guided.welcome.point2Desc') || 'Declara tus familias reales: Tapa dura, Rústica, Wire-O o Grapado.'}
                                </p>
                            </div>

                            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2">
                                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#dc0000] w-fit">
                                    <Tag size={18} />
                                </div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {t('guided.welcome.point3Title') || '3. Tus precios'}
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('guided.welcome.point3Desc') || 'Elige entre plantilla base, asistente de calibración IA o tarifas manuales.'}
                                </p>
                            </div>

                            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2">
                                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#dc0000] w-fit">
                                    <CheckCircle2 size={18} />
                                </div>
                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {t('guided.welcome.point4Title') || '4. Revisión y pasos'}
                                </h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('guided.welcome.point4Desc') || 'Revisa el estado de cada familia y gestiona la activación comercial.'}
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
                                    {draft.completedStages.COMPANY || serverData?.readiness?.accountSetup?.status === 'COMPLETE'
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
                        onContinueToPricing={() => {
                            updateDraft(prev => ({
                                ...prev,
                                completedStages: {
                                    ...prev.completedStages,
                                    PRODUCTS: true
                                },
                                currentStage: 'PRICING'
                            }));
                        }}
                        onBackToCompany={() => setStage('COMPANY')}
                        onOpenFullSetup={() => onOpenFullSetup('CAPABILITIES')}
                    />
                )}

                {/* ── STAGE C: Tus precios ── */}
                {draft.currentStage === 'PRICING' && (() => {
                    const enabledFamilyIds = (['HARDCOVER', 'SOFTCOVER', 'WIRE_O', 'SADDLE_STITCH'] as ProductFamilyId[])
                        .filter(fid => draft.enabledFamilies[fid]);
                    const effectiveActiveFamilyId = enabledFamilyIds.includes(draft.selectedFamilyId)
                        ? draft.selectedFamilyId
                        : (enabledFamilyIds[0] || 'HARDCOVER');

                    const currentFamilyDraft = draft.pricingContinuity?.[effectiveActiveFamilyId];
                    const activeMethod: PricingMethodChoice | undefined = currentFamilyDraft?.pricingMethod || (
                        (currentFamilyDraft?.sessionId || currentFamilyDraft?.offer || currentFamilyDraft?.uploadedFileName)
                            ? 'ASSISTANT'
                            : undefined
                    );

                    const handleSelectMethod = (method: PricingMethodChoice) => {

                        updateDraft(prev => ({
                            ...prev,
                            selectedFamilyId: effectiveActiveFamilyId,
                            pricingContinuity: {
                                ...prev.pricingContinuity,
                                [effectiveActiveFamilyId]: {
                                    ...(prev.pricingContinuity?.[effectiveActiveFamilyId] || {
                                        sessionId: null,
                                        activeRun: null,
                                        selectedVariantId: null,
                                        proposedPatch: {},
                                        entryMode: 'UPLOAD_PDF',
                                        uploadedFileName: null,
                                        step: 2
                                    }),
                                    pricingMethod: method,
                                    lastSavedTimestamp: Date.now()
                                }
                            }
                        }));
                    };

                    const handleClearMethod = () => {
                        updateDraft(prev => ({
                            ...prev,
                            pricingContinuity: {
                                ...prev.pricingContinuity,
                                [effectiveActiveFamilyId]: {
                                    ...(prev.pricingContinuity?.[effectiveActiveFamilyId] as any),
                                    pricingMethod: undefined,
                                    lastSavedTimestamp: Date.now()
                                }
                            }
                        }));
                    };

                    return (
                        <div className="space-y-6">
                            {/* Stage C Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 gap-3">
                                <div>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-[#dc0000]">
                                        {t('guided.stageC.badge') || 'Etapa 3 de 4 · Tus precios'}
                                    </span>
                                    <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                                        {t('guided.stageC.title') || 'Calibra tus tarifas con un presupuesto real'}
                                    </h2>
                                    {activeMethod && (
                                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mt-0.5">
                                            {t(families[effectiveActiveFamilyId]?.titleKey || 'family.hardcover.title')} · {
                                                activeMethod === 'TEMPLATE'
                                                    ? 'Plantilla de referencia'
                                                    : activeMethod === 'ASSISTANT'
                                                        ? 'Asistente de calibración IA'
                                                        : 'Configuración manual de tarifas'
                                            }
                                        </p>
                                    )}

                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {activeMethod && (
                                        <button
                                            type="button"
                                            onClick={handleClearMethod}
                                            className="px-3.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold transition-colors cursor-pointer text-zinc-700 dark:text-zinc-300"
                                        >
                                            {t('guided.pricing.changeMethod') || 'Cambiar método'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setStage('REVIEW')}
                                        className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <span>{t('guided.action.skipToReview') || 'Ir a resumen final'}</span>
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Enabled Families Selector (Strictly restricted to enabledFamilies) */}
                            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-zinc-500 mr-1">
                                        Familia:
                                    </span>
                                    {enabledFamilyIds.map(fid => {
                                        const fam = families[fid];
                                        const isSelected = fid === effectiveActiveFamilyId;
                                        const famMethod = draft.pricingContinuity?.[fid]?.pricingMethod;
                                        return (
                                            <button
                                                key={fid}
                                                type="button"
                                                onClick={() => handleSelectActiveFamily(fid)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-300 dark:border-zinc-600'
                                                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                                                }`}
                                            >
                                                <BindingIcon family={fid} size={15} />
                                                <span>{t(fam?.titleKey || fid)}</span>
                                                {famMethod && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                                                        {famMethod === 'TEMPLATE' ? 'Plantilla' : famMethod === 'ASSISTANT' ? 'IA' : 'Manual'}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setStage('PRODUCTS')}
                                    className="text-xs font-bold text-[#dc0000] hover:text-[#b50000] underline underline-offset-4 cursor-pointer"
                                >
                                    {t('guided.pricing.changeProducts') || 'Cambiar productos'}
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
                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shrink-0 transition-colors cursor-pointer"
                                    >
                                        {t('guided.pricing.prerequisiteNodeLink') || 'Configurar maquinaria y nodos'}
                                    </button>
                                </div>
                            )}

                            {/* ── 3-Method Cards Chooser (Shown BEFORE opening any tool) ── */}
                            {!activeMethod ? (
                                <div className="space-y-6">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {t('guided.pricing.methodsSubtitle') || 'Selecciona el método que mejor se adapte a tu taller. Puedes aplicar métodos distintos a familias distintas sin perder el trabajo previo.'}
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        {/* Method 1: Plantilla */}
                                        <div className="p-6 rounded-3xl bg-white dark:bg-[#18181b] border-2 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between shadow-2xs space-y-4">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                                                        <FileSpreadsheet size={24} />
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                                        {t('guided.pricing.methodTemplateBadge') || 'Configuración rápida'}
                                                    </span>
                                                </div>

                                                <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                                                    {t('guided.pricing.methodTemplateTitle') || '1. Partir de una plantilla'}
                                                </h3>

                                                <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué es:</strong> Cuadros de tarifas industriales prellenados con medias de mercado de referencia.
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Para quién:</strong> Imprentas que arrancan sin presupuesto a mano y quieren empezar a cotizar de inmediato.
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué inicializa:</strong> Puestas en máquina fijas, costes de tirada y recargos base.
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué debes revisar:</strong> Márgenes comerciales, compra real de papel y portes.
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleSelectMethod('TEMPLATE')}
                                                className="w-full py-3 px-4 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                                            >
                                                <span>{t('guided.pricing.methodTemplateBtn') || 'Usar plantilla base'}</span>
                                                <ArrowRight size={14} />
                                            </button>
                                        </div>

                                        {/* Method 2: Asistente IA (Recomendado) */}
                                        <div className="p-6 rounded-3xl bg-white dark:bg-[#18181b] border-2 border-[#dc0000] ring-4 ring-[#dc0000]/10 transition-all flex flex-col justify-between shadow-xs space-y-4 relative">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 text-[#dc0000]">
                                                        <Bot size={24} />
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-[#dc0000]">
                                                        {t('guided.pricing.methodAiBadge') || 'Recomendado'}
                                                    </span>
                                                </div>

                                                <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                                                    {t('guided.pricing.methodAiTitle') || '2. Asistente IA de calibración'}
                                                </h3>

                                                <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué es:</strong> Ingesta inteligente que lee presupuestos reales en PDF para calibrar las fórmulas de tus máquinas.
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué aportas:</strong> Un PDF con cantidades, páginas, papel y portes desglosados (o entrada manual línea a línea).
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué extrae:</strong> Especificaciones, escalados de tirada y costes de fabricación.
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué revisas:</strong> Comparas el cálculo del motor con tu oferta original y confirmas la calibración.
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleSelectMethod('ASSISTANT')}
                                                className="w-full py-3 px-4 rounded-2xl bg-[#dc0000] hover:bg-[#b50000] text-white font-bold text-xs shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
                                            >
                                                <span>{t('guided.pricing.methodAiBtn') || 'Usar asistente de calibración'}</span>
                                                <ArrowRight size={14} />
                                            </button>
                                        </div>

                                        {/* Method 3: Configuración manual de tarifas */}
                                        <div className="p-6 rounded-3xl bg-white dark:bg-[#18181b] border-2 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between shadow-2xs space-y-4">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                                                        <Wrench size={24} />
                                                    </div>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                                        {t('guided.pricing.methodManualBadge') || 'Control técnico total'}
                                                    </span>
                                                </div>

                                                <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">
                                                    {t('guided.pricing.methodManualTitle') || '3. Tarifas manuales'}
                                                </h3>

                                                <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué es:</strong> Edición directa de las matrices industriales: clic, pliego, encuadernación y coste/kg.
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Para quién:</strong> Presupuestadores y jefes de taller con matrices de costes ya calculadas.
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Qué información requiere:</strong> Plancha, puesta a punto, tiro por millar y mermas.
                                                    </p>
                                                    <p>
                                                        <strong className="text-zinc-800 dark:text-zinc-200">Diferencia clave:</strong> Introducir tarifas directamente no requiere ningún presupuesto de referencia.
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleSelectMethod('MANUAL')}
                                                className="w-full py-3 px-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-zinc-200 dark:border-zinc-700"
                                            >
                                                <span>{t('guided.pricing.methodManualBtn') || 'Configurar tarifas manualmente'}</span>
                                                <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : activeMethod === 'ASSISTANT' ? (
                                /* Assistant Flow: SimplifiedOnboardingJourney (with PDF and manual quote entry) */
                                <SimplifiedOnboardingJourney
                                    printerNodeId={printerNodeId}
                                    printerNodeName={printerNodeName}
                                    initialStep={2}
                                    isGuidedMode={true}
                                    targetFamilyId={effectiveActiveFamilyId}
                                    initialPricingDrafts={draft.pricingContinuity}
                                    onPricingContinuityChange={handlePricingContinuityChange}
                                    onCompleted={() => {
                                        updateDraft(prev => ({
                                            ...prev,
                                            completedStages: {
                                                ...prev.completedStages,
                                                PRICING: true
                                            },
                                            currentStage: 'REVIEW'
                                        }));
                                    }}
                                    onOpenAdvanced={() => onOpenFullSetup('PRICING')}
                                    onFamiliesStateChange={handleFamiliesStateChange}
                                />
                            ) : activeMethod === 'TEMPLATE' ? (
                                /* Template Flow: Direct baseline application */
                                <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 space-y-6">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold">
                                            <FileSpreadsheet size={14} />
                                            <span>Plantilla Base Editorial</span>
                                        </div>
                                        <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100">
                                            Valores iniciales aplicados a {t(families[effectiveActiveFamilyId]?.titleKey || effectiveActiveFamilyId)}
                                        </h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xl">
                                            Hemos preparado las tarifas estándar basadas en medias de mercado para esta familia. Puedes revisarlas en la consola de tarifas o confirmar para continuar a la revisión final.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                                        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1">
                                            <div className="text-zinc-500 font-semibold">Impresión interior B/N</div>
                                            <div className="text-base font-black text-zinc-900 dark:text-zinc-100">
                                                {SUGGESTED_RATES_METADATA.interior_pp_bw?.value || 0.00635} €/pág
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1">
                                            <div className="text-zinc-500 font-semibold">Impresión interior Color</div>
                                            <div className="text-base font-black text-zinc-900 dark:text-zinc-100">
                                                {SUGGESTED_RATES_METADATA.interior_pp_color?.value || 0.01878} €/pág
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1">
                                            <div className="text-zinc-500 font-semibold">Puesta en máquina</div>
                                            <div className="text-base font-black text-zinc-900 dark:text-zinc-100">
                                                {SUGGESTED_RATES_METADATA.interior_11_fixed?.value || 80.31} € fijo
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                        <button
                                            type="button"
                                            onClick={handleClearMethod}
                                            className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                        >
                                            {t('guided.pricing.changeMethod') || 'Cambiar método'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                updateDraft(prev => ({
                                                    ...prev,
                                                    completedStages: {
                                                        ...prev.completedStages,
                                                        PRICING: true
                                                    },
                                                    currentStage: 'REVIEW'
                                                }));
                                            }}
                                            className="px-6 py-2.5 rounded-xl bg-[#dc0000] hover:bg-[#b50000] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                                        >
                                            <span>Guardar plantilla y continuar</span>
                                            <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Manual Rates Flow: Direct matrix editor */
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800">
                                        <div>
                                            <div className="text-xs font-bold text-[#dc0000]">Modo Tarifas Manuales</div>
                                            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                                Editando matriz para {t(families[effectiveActiveFamilyId]?.titleKey || effectiveActiveFamilyId)}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleClearMethod}
                                            className="px-3.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold transition-colors cursor-pointer text-zinc-700 dark:text-zinc-300"
                                        >
                                            {t('guided.pricing.changeMethod') || 'Cambiar método'}
                                        </button>
                                    </div>

                                    <CanonicalIndustrialPricingEditor
                                        mode="ONBOARDING"
                                        initialNodeData={printerNodeId ? { id: printerNodeId, name: printerNodeName } : undefined}
                                        onSave={async () => {
                                            updateDraft(prev => ({
                                                ...prev,
                                                completedStages: {
                                                    ...prev.completedStages,
                                                    PRICING: true
                                                },
                                                currentStage: 'REVIEW'
                                            }));
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })()}


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
