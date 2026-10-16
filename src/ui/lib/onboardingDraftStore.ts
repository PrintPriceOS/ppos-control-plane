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

export interface GuidedOnboardingDraft {
    schemaVersion: number;
    tenantId: string;
    currentStage: GuidedStage;
    selectedFamilyId: ProductFamilyId;
    enabledFamilies: Record<ProductFamilyId, boolean>;
    company: CompanyDraftData;
    offerDrafts: Partial<Record<ProductFamilyId, ProgressiveSpecState>>;
    lastSavedTimestamp: number;
    completedStages: Record<GuidedStage, boolean>;
}

const STORAGE_PREFIX = 'ppos_guided_onboarding_draft_';
const CURRENT_SCHEMA_VERSION = 1;

const createDefaultCompanyDraft = (initialCountry = 'ES'): CompanyDraftData => ({
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
    tenantId,
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
    lastSavedTimestamp: Date.now(),
    completedStages: {
        WELCOME: false,
        COMPANY: false,
        PRODUCTS: false,
        PRICING: false,
        REVIEW: false
    }
});

export function getDraftStorageKey(tenantId: string): string {
    const cleanId = (tenantId || 'anonymous_tenant').trim();
    return `${STORAGE_PREFIX}${cleanId}`;
}

export function loadGuidedOnboardingDraft(tenantId: string): GuidedOnboardingDraft {
    if (typeof window === 'undefined') return createDefaultDraft(tenantId);
    try {
        const key = getDraftStorageKey(tenantId);
        const serialized = localStorage.getItem(key);
        if (!serialized) return createDefaultDraft(tenantId);
        const parsed = JSON.parse(serialized);
        if (parsed && typeof parsed === 'object') {
            return {
                ...createDefaultDraft(tenantId),
                ...parsed,
                schemaVersion: CURRENT_SCHEMA_VERSION,
                company: {
                    ...createDefaultCompanyDraft(),
                    ...(parsed.company || {})
                },
                enabledFamilies: {
                    HARDCOVER: true,
                    SOFTCOVER: true,
                    WIRE_O: false,
                    SADDLE_STITCH: false,
                    ...(parsed.enabledFamilies || {})
                },
                completedStages: {
                    WELCOME: false,
                    COMPANY: false,
                    PRODUCTS: false,
                    PRICING: false,
                    REVIEW: false,
                    ...(parsed.completedStages || {})
                }
            };
        }
    } catch (e) {
        console.warn('[OnboardingDraftStore] Failed to load draft or corrupted JSON:', e);
    }
    return createDefaultDraft(tenantId);
}

export function saveGuidedOnboardingDraft(draft: GuidedOnboardingDraft): boolean {
    if (typeof window === 'undefined' || !draft?.tenantId) return false;
    try {
        const key = getDraftStorageKey(draft.tenantId);
        const payload: GuidedOnboardingDraft = {
            ...draft,
            schemaVersion: CURRENT_SCHEMA_VERSION,
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
    if (typeof window === 'undefined') return;
    try {
        const key = getDraftStorageKey(tenantId);
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('[OnboardingDraftStore] Failed to clear draft:', e);
    }
}
