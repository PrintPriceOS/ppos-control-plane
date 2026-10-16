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
}

export const VALID_GUIDED_STAGES: ReadonlySet<GuidedStage> = new Set([
    'WELCOME', 'COMPANY', 'PRODUCTS', 'PRICING', 'REVIEW'
]);

export const VALID_PRODUCT_FAMILIES: ReadonlySet<ProductFamilyId> = new Set([
    'HARDCOVER', 'SOFTCOVER', 'WIRE_O', 'SADDLE_STITCH'
]);

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

export const createDefaultCompanyDraft = (initialCountry = 'ES'): CompanyDraftData => ({
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
    siteTimezone: 'Europe/Madrid',
    primarySiteId: null
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
        const company: CompanyDraftData = {
            legalName: typeof rawComp.legalName === 'string' ? rawComp.legalName : '',
            tradingName: typeof rawComp.tradingName === 'string' ? rawComp.tradingName : '',
            country: typeof rawComp.country === 'string' && rawComp.country.trim() ? rawComp.country.trim() : 'ES',
            city: typeof rawComp.city === 'string' ? rawComp.city : '',
            address: typeof rawComp.address === 'string' ? rawComp.address : '',
            postalCode: typeof rawComp.postalCode === 'string' ? rawComp.postalCode : '',
            phone: typeof rawComp.phone === 'string' ? rawComp.phone : '',
            website: typeof rawComp.website === 'string' ? rawComp.website : '',
            contactName: typeof rawComp.contactName === 'string' ? rawComp.contactName : '',
            taxId: typeof rawComp.taxId === 'string' ? rawComp.taxId : '',
            siteName: typeof rawComp.siteName === 'string' ? rawComp.siteName : '',
            siteTimezone: typeof rawComp.siteTimezone === 'string' && rawComp.siteTimezone.trim() ? rawComp.siteTimezone.trim() : 'Europe/Madrid',
            primarySiteId: typeof rawComp.primarySiteId === 'string' ? rawComp.primarySiteId : null
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

