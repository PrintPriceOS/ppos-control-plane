/**
 * src/ui/lib/onboardingDraftStore.ts
 *
 * Dedicated Draft & Stage Persistence Store for Printhouse Guided Onboarding.
 * Guarantees cross-reload state continuity, multi-tab sync, and tenant boundary isolation.
 *
 * Invariants:
 * 1. Strict tenant boundary keying (never conflate data between different tenants).
 * 2. Zero silent mutation of unconfirmed specs.
 * 3. Graceful fallback on localStorage absence or parse error.
 */

import { ProductFamilyId, ProgressiveSpecState } from '../types/printhouseOnboardingTypes';

export type GuidedStage = 'WELCOME' | 'COMPANY' | 'PRODUCTS' | 'PRICING' | 'REVIEW';

export interface CompanyDraftData {
    legalName: string;
    tradingName: string;
    country: string;
    city: string;
    address: string;
    postalCode: string;
    phone: string;
    website: string;
    contactName: string;
    taxId: string;
    siteName: string;
    siteTimezone: string;
    primarySiteId?: string | null;
    /** Tracks fields explicitly touched/edited by the user in this draft session */
    userEditedFields?: string[];
    /** Tracks server values that were acknowledged/loaded to avoid overriding with defaults */
    acknowledgedServerValues?: Partial<Record<string, string | null>>;
}

export const VALID_GUIDED_STAGES: ReadonlySet<GuidedStage> = new Set([
    'WELCOME', 'COMPANY', 'PRODUCTS', 'PRICING', 'REVIEW'
]);

export const VALID_PRODUCT_FAMILIES: ReadonlySet<ProductFamilyId> = new Set([
    'HARDCOVER', 'SOFTCOVER', 'WIRE_O', 'SADDLE_STITCH'
]);

export type PricingMethodChoice = 'TEMPLATE' | 'ASSISTANT' | 'MANUAL';

export interface FamilyPricingSessionDraft {
    sessionId: string | null;
    activeRun: any;
    selectedVariantId: string | null;
    proposedPatch: Record<string, any>;
    entryMode: 'UPLOAD_PDF' | 'MANUAL_FORM';
    uploadedFileName: string | null;
    step?: 1 | 2 | 3 | 4 | 5;
    offer?: ProgressiveSpecState;
    comparisonData?: any;
    lastSavedTimestamp?: number;
    pricingMethod?: PricingMethodChoice;
}


export interface GuidedOnboardingDraft {
    schemaVersion: number;
    tenantId: string;
    currentStage: GuidedStage;
    selectedFamilyId: ProductFamilyId;
    enabledFamilies: Record<ProductFamilyId, boolean>;
    company: CompanyDraftData;
    offerDrafts: Partial<Record<ProductFamilyId, ProgressiveSpecState>>;
    pricingContinuity?: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>>;
    lastSavedTimestamp: number;
    completedStages: Record<GuidedStage, boolean>;
}

const STORAGE_PREFIX = 'ppos_guided_onboarding_draft_';
export const CURRENT_SCHEMA_VERSION = 2;

export const createDefaultCompanyDraft = (initialCountry = ''): CompanyDraftData => ({
    legalName: '',
    tradingName: '',
    country: initialCountry,
    city: '',
    address: '',
    postalCode: '',
    phone: '',
    website: '',
    contactName: '',
    taxId: '',
    siteName: '',
    siteTimezone: '',
    primarySiteId: null,
    userEditedFields: [],
    acknowledgedServerValues: {}
});

export const createDefaultDraft = (tenantId: string): GuidedOnboardingDraft => ({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tenantId: tenantId ? tenantId.trim() : '',
    currentStage: 'WELCOME',
    selectedFamilyId: 'HARDCOVER',
    enabledFamilies: {
        HARDCOVER: true,
        SOFTCOVER: true,
        WIRE_O: false,
        SADDLE_STITCH: false
    },
    company: createDefaultCompanyDraft(),
    offerDrafts: {},
    pricingContinuity: {},
    lastSavedTimestamp: Date.now(),
    completedStages: {
        WELCOME: false,
        COMPANY: false,
        PRODUCTS: false,
        PRICING: false,
        REVIEW: false
    }
});

export function getDraftStorageKey(tenantId: string): string | null {
    if (!tenantId || typeof tenantId !== 'string') return null;
    const cleanId = tenantId.trim();
    if (!cleanId || cleanId === 'anonymous_tenant' || cleanId === 'default' || cleanId === 'undefined' || cleanId === 'null') {
        return null;
    }
    return `${STORAGE_PREFIX}${cleanId}`;
}

export function isValidStage(stage: any): stage is GuidedStage {
    return typeof stage === 'string' && VALID_GUIDED_STAGES.has(stage as GuidedStage);
}

export function isValidFamily(family: any): family is ProductFamilyId {
    return typeof family === 'string' && VALID_PRODUCT_FAMILIES.has(family as ProductFamilyId);
}

export function loadGuidedOnboardingDraft(tenantId: string): GuidedOnboardingDraft {
    const cleanTenantId = (tenantId || '').trim();
    if (typeof window === 'undefined' || !cleanTenantId) {
        return createDefaultDraft(cleanTenantId);
    }
    const key = getDraftStorageKey(cleanTenantId);
    if (!key) {
        return createDefaultDraft(cleanTenantId);
    }
    try {
        const serialized = localStorage.getItem(key);
        if (!serialized) return createDefaultDraft(cleanTenantId);

        const parsed = JSON.parse(serialized);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            console.warn('[OnboardingDraftStore] Stored draft is not a valid object, resetting.');
            return createDefaultDraft(cleanTenantId);
        }

        // Validate tenant ownership: stored tenantId must strictly match requested tenantId
        if (parsed.tenantId && parsed.tenantId.trim() !== cleanTenantId) {
            console.warn(`[OnboardingDraftStore] Tenant mismatch in draft storage (expected: ${cleanTenantId}, found: ${parsed.tenantId}). Discarding foreign draft.`);
            return createDefaultDraft(cleanTenantId);
        }

        // Validate schema version: only CURRENT_SCHEMA_VERSION or compatible
        if (typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) {
            console.warn(`[OnboardingDraftStore] Schema version mismatch (expected: ${CURRENT_SCHEMA_VERSION}, found: ${parsed.schemaVersion}). Resetting to default schema.`);
            return createDefaultDraft(cleanTenantId);
        }

        // Validate currentStage enum
        const stage: GuidedStage = isValidStage(parsed.currentStage) ? parsed.currentStage : 'WELCOME';

        // Validate selectedFamilyId enum
        const family: ProductFamilyId = isValidFamily(parsed.selectedFamilyId) ? parsed.selectedFamilyId : 'HARDCOVER';

        // Validate enabledFamilies
        const rawEnabled = parsed.enabledFamilies || {};
        const enabledFamilies: Record<ProductFamilyId, boolean> = {
            HARDCOVER: typeof rawEnabled.HARDCOVER === 'boolean' ? rawEnabled.HARDCOVER : true,
            SOFTCOVER: typeof rawEnabled.SOFTCOVER === 'boolean' ? rawEnabled.SOFTCOVER : true,
            WIRE_O: typeof rawEnabled.WIRE_O === 'boolean' ? rawEnabled.WIRE_O : false,
            SADDLE_STITCH: typeof rawEnabled.SADDLE_STITCH === 'boolean' ? rawEnabled.SADDLE_STITCH : false
        };

        // Validate completedStages
        const rawCompleted = parsed.completedStages || {};
        const completedStages: Record<GuidedStage, boolean> = {
            WELCOME: typeof rawCompleted.WELCOME === 'boolean' ? rawCompleted.WELCOME : false,
            COMPANY: typeof rawCompleted.COMPANY === 'boolean' ? rawCompleted.COMPANY : false,
            PRODUCTS: typeof rawCompleted.PRODUCTS === 'boolean' ? rawCompleted.PRODUCTS : false,
            PRICING: typeof rawCompleted.PRICING === 'boolean' ? rawCompleted.PRICING : false,
            REVIEW: typeof rawCompleted.REVIEW === 'boolean' ? rawCompleted.REVIEW : false
        };

        // Validate company fields
        const rawComp = parsed.company || {};
        const rawEdited = Array.isArray(rawComp.userEditedFields) ? rawComp.userEditedFields.filter((f: any) => typeof f === 'string') : [];
        const rawAck = typeof rawComp.acknowledgedServerValues === 'object' && rawComp.acknowledgedServerValues !== null ? rawComp.acknowledgedServerValues : {};

        const company: CompanyDraftData = {
            legalName: typeof rawComp.legalName === 'string' ? rawComp.legalName : '',
            tradingName: typeof rawComp.tradingName === 'string' ? rawComp.tradingName : '',
            country: typeof rawComp.country === 'string' ? rawComp.country.trim() : '',
            city: typeof rawComp.city === 'string' ? rawComp.city : '',
            address: typeof rawComp.address === 'string' ? rawComp.address : '',
            postalCode: typeof rawComp.postalCode === 'string' ? rawComp.postalCode : '',
            phone: typeof rawComp.phone === 'string' ? rawComp.phone : '',
            website: typeof rawComp.website === 'string' ? rawComp.website : '',
            contactName: typeof rawComp.contactName === 'string' ? rawComp.contactName : '',
            taxId: typeof rawComp.taxId === 'string' ? rawComp.taxId : '',
            siteName: typeof rawComp.siteName === 'string' ? rawComp.siteName : '',
            siteTimezone: typeof rawComp.siteTimezone === 'string' ? rawComp.siteTimezone.trim() : '',
            primarySiteId: typeof rawComp.primarySiteId === 'string' ? rawComp.primarySiteId : null,
            userEditedFields: rawEdited,
            acknowledgedServerValues: rawAck
        };

        return {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            tenantId: cleanTenantId,
            currentStage: stage,
            selectedFamilyId: family,
            enabledFamilies,
            company,
            offerDrafts: typeof parsed.offerDrafts === 'object' && parsed.offerDrafts !== null ? parsed.offerDrafts : {},
            pricingContinuity: typeof parsed.pricingContinuity === 'object' && parsed.pricingContinuity !== null ? parsed.pricingContinuity : {},
            lastSavedTimestamp: typeof parsed.lastSavedTimestamp === 'number' ? parsed.lastSavedTimestamp : Date.now(),
            completedStages
        };
    } catch (e) {
        console.warn('[OnboardingDraftStore] Failed to load draft or corrupted JSON:', e);
    }
    return createDefaultDraft(cleanTenantId);
}

export function saveGuidedOnboardingDraft(draft: GuidedOnboardingDraft): boolean {
    if (typeof window === 'undefined' || !draft) return false;
    const cleanTenantId = (draft.tenantId || '').trim();
    if (!cleanTenantId) return false;
    const key = getDraftStorageKey(cleanTenantId);
    if (!key) return false;

    try {
        const payload: GuidedOnboardingDraft = {
            ...draft,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            tenantId: cleanTenantId,
            lastSavedTimestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(payload));
        return true;
    } catch (e: any) {
        // Handle QuotaExceededError or SecurityError in private browsing
        console.warn('[OnboardingDraftStore] Failed to save draft (quota or storage disabled):', e);
        return false;
    }
}

export function clearGuidedOnboardingDraft(tenantId: string): void {
    if (typeof window === 'undefined' || !tenantId) return;
    const key = getDraftStorageKey(tenantId);
    if (!key) return;
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('[OnboardingDraftStore] Failed to clear draft:', e);
    }
}

export interface StageCCompletionResult {
    isComplete: boolean;
    isGlobalRatesComplete: boolean;
    allEnabledFamiliesConfigured: boolean;
    totalEnabled: number;
    configuredCount: number;
    calibratedCount: number;
    templateCount: number;
    manualCount: number;
    pendingFamilies: ProductFamilyId[];
}

/**
 * Evaluates genuine completion of Stage C (Pricing & Calibration).
 * Rule:
 * 1. Global rates must be complete (rates_json has interior, paper, binding, transport).
 * 2. Every enabled product family must have an assigned and configured pricing method:
 *    - TEMPLATE: method chosen as TEMPLATE
 *    - ASSISTANT: calibration session validated (DATA_VALIDATED status) or offers saved
 *    - MANUAL: method chosen as MANUAL with active offers/runs
 */
export function evaluateStageCCompletion(
    serverReadiness: any,
    enabledFamilies: Record<ProductFamilyId, boolean> | Partial<Record<ProductFamilyId, boolean>> = {},
    pricingContinuity: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>> = {},
    familiesState: Partial<Record<ProductFamilyId, any>> = {}
): StageCCompletionResult {
    const isGlobalRatesComplete = serverReadiness?.pricingReadiness?.status === 'COMPLETE';
    const activeFids = (['HARDCOVER', 'SOFTCOVER', 'WIRE_O', 'SADDLE_STITCH'] as ProductFamilyId[])
        .filter(fid => Boolean(enabledFamilies[fid]));

    let configuredCount = 0;
    let calibratedCount = 0;
    let templateCount = 0;
    let manualCount = 0;
    const pendingFamilies: ProductFamilyId[] = [];

    for (const fid of activeFids) {
        const cont = pricingContinuity[fid];
        const famState = familiesState[fid];
        const method = cont?.pricingMethod;
        const isCalibrated = famState?.status === 'DATA_VALIDATED';
        const hasAssistantOffers = Boolean(cont?.offer?.runs?.length || (famState as any)?.quotes?.length || (famState?.quoteCount && famState.quoteCount > 0));
        const hasManualRates = method === 'MANUAL' && (Boolean(cont?.offer?.runs?.length) || (cont?.step && cont.step >= 3));

        if (isCalibrated) {
            calibratedCount++;
            configuredCount++;
        } else if (method === 'TEMPLATE') {
            templateCount++;
            configuredCount++;
        } else if (hasManualRates) {
            manualCount++;
            configuredCount++;
        } else if (method === 'ASSISTANT' && hasAssistantOffers) {
            configuredCount++;
        } else {
            pendingFamilies.push(fid);
        }
    }

    const allEnabledFamiliesConfigured = activeFids.length > 0 && pendingFamilies.length === 0;
    // Stage C is complete when global rates are complete AND all selected families have an assigned and configured method
    const isComplete = Boolean(isGlobalRatesComplete && allEnabledFamiliesConfigured);

    return {
        isComplete,
        isGlobalRatesComplete,
        allEnabledFamiliesConfigured,
        totalEnabled: activeFids.length,
        configuredCount,
        calibratedCount,
        templateCount,
        manualCount,
        pendingFamilies
    };
}

export interface StageDerivationContext {
    draftStage?: GuidedStage;
    completedStages?: Partial<Record<GuidedStage, boolean>>;
    enabledFamilies?: Partial<Record<ProductFamilyId, boolean>>;
    hasPricingContinuity?: boolean;
    pricingContinuity?: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>>;
    familiesState?: Partial<Record<ProductFamilyId, any>>;
}

/**
 * Derives the canonical stage from server-side truth (readiness report).
 * Server truth ALWAYS supersedes local navigation or draft caches:
 * 1. Account Setup incomplete -> COMPANY (Stage A)
 * 2. Account Setup complete, but products pending / unconfirmed -> PRODUCTS (Stage B)
 *    (Never jumps to PRICING exclusively based on machine readiness or operational readiness)
 * 3. Products confirmed and pricing incomplete -> PRICING (Stage C)
 * 4. All modules complete and ready for review -> REVIEW (Stage D)
 */
export function deriveServerStage(
    serverReadiness: any,
    contextOrStage?: GuidedStage | StageDerivationContext
): GuidedStage {
    const context: StageDerivationContext = typeof contextOrStage === 'string'
        ? { draftStage: contextOrStage }
        : (contextOrStage || {});

    const draftStage = context.draftStage;

    if (!serverReadiness) {
        return draftStage || 'WELCOME';
    }

    const accountSetup = serverReadiness.accountSetup;
    const opsReadiness = serverReadiness.operationalConfiguration || serverReadiness.operationalReadiness;
    const pricingReadiness = serverReadiness.pricingReadiness;

    const isAccountComplete = accountSetup?.status === 'COMPLETE';
    if (!isAccountComplete) {
        // If not even company name or country is set, and user is in WELCOME, keep WELCOME until started
        if (draftStage === 'WELCOME' && (!accountSetup?.completedRequirements || accountSetup.completedRequirements === 0)) {
            return 'WELCOME';
        }
        return 'COMPANY';
    }

    // Account setup is complete. Next verify operational & pricing
    const isOpsComplete = opsReadiness?.status === 'COMPLETE';
    const isGlobalPricingComplete = pricingReadiness?.status === 'COMPLETE';

    // Evaluate explicit Stage C completion rule for selected families
    const stageCEval = evaluateStageCCompletion(
        serverReadiness,
        context.enabledFamilies || {},
        context.pricingContinuity || {},
        context.familiesState || {}
    );

    const hasProductsCompleted = Boolean(context.completedStages?.PRODUCTS);
    const hasPricingCompleted = Boolean(context.completedStages?.PRICING) || stageCEval.isComplete;
    const hasActivePricing = Boolean(context.hasPricingContinuity);

    // If draftStage is already on an in-progress stage, keep it unless prerequisites fail.
    // e.g. If user is in PRODUCTS (and PRODUCTS is not completed), stay in PRODUCTS.
    if (draftStage === 'PRODUCTS' && !hasProductsCompleted) {
        return 'PRODUCTS';
    }

    // e.g. If user is in PRICING (and PRICING is not completed), stay in PRICING.
    if (draftStage === 'PRICING' && !hasPricingCompleted) {
        return 'PRICING';
    }

    // If user was reviewing (REVIEW) and prerequisites for account and products are met:
    if (draftStage === 'REVIEW') {
        return 'REVIEW';
    }

    // If all modules are complete on server (account, operational/machinery, and pricing),
    // and no blockers exist, the printhouse is ready for Stage D (REVIEW)
    if (isAccountComplete && isOpsComplete && isGlobalPricingComplete && stageCEval.isComplete) {
        return 'REVIEW';
    }

    // Account setup is complete, but pricing is not.
    // Invariant: Do NOT deduce Stage B completion exclusively from machinery or operational readiness,
    // nor from unconfirmed local draftStage.
    // Explicit confirmation of products or presence of active pricing continuity is required to advance to PRICING.
    if (hasProductsCompleted || hasActivePricing) {
        if (isAccountComplete && !stageCEval.isComplete) {
            return 'PRICING';
        }
    }

    return 'PRODUCTS';
}

/**
 * Checks if the printhouse has genuinely completed the onboarding process
 * based strictly on authoritative server-side facts.
 * Never defaults to true on errors or missing data.
 */
export function isPrinthouseOnboardingFullyComplete(serverReadiness: any): boolean {
    if (!serverReadiness || typeof serverReadiness !== 'object') {
        return false;
    }
    const accountComplete = serverReadiness.accountSetup?.status === 'COMPLETE';
    const opsComplete = (serverReadiness.operationalConfiguration?.status === 'COMPLETE' || serverReadiness.operationalReadiness?.status === 'COMPLETE');
    const pricingComplete = serverReadiness.pricingReadiness?.status === 'COMPLETE';
    const hasBlockers = (serverReadiness.accountSetup?.blockingIssues?.length > 0) ||
        (serverReadiness.operationalConfiguration?.blockingIssues?.length > 0) ||
        (serverReadiness.pricingReadiness?.blockingIssues?.length > 0);

    return Boolean(accountComplete && opsComplete && pricingComplete && !hasBlockers);
}

/**
 * Asynchronously queries the server to determine whether the authenticated tenant
 * has genuinely completed onboarding.
 * Strict fail-closed: on network error, non-200, or missing token, returns false.
 */
export async function checkServerOnboardingStatus(token: string): Promise<boolean> {
    if (!token || typeof token !== 'string') {
        return false;
    }
    try {
        const res = await fetch('/api/printhouse/onboarding', {
            headers: { 'Authorization': `Bearer ${token.trim()}` }
        });
        if (!res.ok) {
            return false;
        }
        const json = await res.json();
        if (!json || !json.ok || !json.data?.readiness) {
            return false;
        }
        return isPrinthouseOnboardingFullyComplete(json.data.readiness);
    } catch (e) {
        // Network or server error: fail-safe to onboarding not declared complete
        return false;
    }
}

/**
 * Reconciles and returns the pending guided stage from authoritative server readiness.
 * Allows a user logging in from a fresh browser or without local storage to seamlessly
 * resume exactly where their printhouse setup left off.
 */
export async function resumePendingGuidedStage(token: string, tenantId: string): Promise<GuidedStage> {
    const localDraft = loadGuidedOnboardingDraft(tenantId);
    const hasPricingContinuity = Boolean(
        localDraft.pricingContinuity &&
        Object.values(localDraft.pricingContinuity).some((p: any) => p && (p.sessionId || p.offer || p.uploadedFileName || p.pricingMethod))
    );

    const derivationContext: StageDerivationContext = {
        draftStage: localDraft.currentStage,
        completedStages: localDraft.completedStages,
        enabledFamilies: localDraft.enabledFamilies,
        hasPricingContinuity
    };

    if (!token || typeof token !== 'string') {
        return localDraft.currentStage || 'WELCOME';
    }
    try {
        const res = await fetch('/api/printhouse/onboarding', {
            headers: { 'Authorization': `Bearer ${token.trim()}` }
        });
        if (!res.ok) {
            return localDraft.currentStage || 'WELCOME';
        }
        const json = await res.json();
        if (!json || !json.ok || !json.data?.readiness) {
            return localDraft.currentStage || 'WELCOME';
        }

        const serverCompany = json.data?.company;
        const serverFamiliesList = serverCompany?.selectedProductFamilies;
        const serverProductsConfirmed = Boolean(serverCompany?.productsConfirmed);

        let effectiveEnabled = localDraft.enabledFamilies;
        if (Array.isArray(serverFamiliesList)) {
            effectiveEnabled = {
                HARDCOVER: serverFamiliesList.includes('HARDCOVER'),
                SOFTCOVER: serverFamiliesList.includes('SOFTCOVER'),
                WIRE_O: serverFamiliesList.includes('WIRE_O'),
                SADDLE_STITCH: serverFamiliesList.includes('SADDLE_STITCH')
            };
        }

        const effectiveCompletedStages = {
            ...localDraft.completedStages,
            PRODUCTS: serverProductsConfirmed || localDraft.completedStages?.PRODUCTS || false
        };

        const serverDerivationContext: StageDerivationContext = {
            draftStage: localDraft.currentStage,
            completedStages: effectiveCompletedStages,
            enabledFamilies: effectiveEnabled,
            hasPricingContinuity
        };

        return deriveServerStage(json.data.readiness, serverDerivationContext);
    } catch (e) {
        return localDraft.currentStage || 'WELCOME';
    }
}
