/**
 * tests/UserDestinationResolutionRegression.test.ts
 *
 * Dedicated Regression Suite for Authentication Destination Resolution,
 * Role Alignment (PRINTHOUSE_ADMIN), Server-Side Onboarding Authority,
 * and Cross-Browser State Continuity.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
    resolveUserDestination, 
    getRedirectPath, 
    isPrinthouseRole, 
    PRINTHOUSE_ROLES 
} from '../src/ui/pages/LoginPage';
import { 
    deriveServerStage, 
    isPrinthouseOnboardingFullyComplete, 
    checkServerOnboardingStatus,
    resumePendingGuidedStage,
    loadGuidedOnboardingDraft,
    saveGuidedOnboardingDraft,
    clearGuidedOnboardingDraft
} from '../src/ui/lib/onboardingDraftStore';

describe('User Destination & Onboarding Authority Regression Suite', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    describe('1. Role Alignment (PRINTHOUSE_ADMIN, PRINTHOUSE_OPERATOR, PRINTHOUSE_USER)', () => {
        it('recognizes PRINTHOUSE_ADMIN as a first-class printhouse role', () => {
            expect(isPrinthouseRole('PRINTHOUSE_ADMIN')).toBe(true);
            expect(isPrinthouseRole('printhouse_admin')).toBe(true);
            expect(PRINTHOUSE_ROLES.has('PRINTHOUSE_ADMIN')).toBe(true);
        });

        it('recognizes other canonical printhouse roles and rejects unrelated roles', () => {
            expect(isPrinthouseRole('PRINTHOUSE_OPERATOR')).toBe(true);
            expect(isPrinthouseRole('PRINTHOUSE_USER')).toBe(true);
            expect(isPrinthouseRole('SUPER_ADMIN')).toBe(false);
            expect(isPrinthouseRole('PLATFORM_ADMIN')).toBe(false);
            expect(isPrinthouseRole('VIEWER')).toBe(false);
            expect(isPrinthouseRole(null)).toBe(false);
            expect(isPrinthouseRole(undefined)).toBe(false);
        });
    });

    describe('2. Open Redirect Prevention and Relative Path Handling', () => {
        it('preserves valid relative redirect targets', () => {
            expect(getRedirectPath('?redirect=%2Fprinthouse%2Fpricing')).toBe('/printhouse/pricing');
            expect(getRedirectPath('?redirect=%2Forders%2F123')).toBe('/orders/123');
        });

        it('blocks external open redirects and falls back safely', () => {
            expect(getRedirectPath('?redirect=https%3A%2F%2Fevil.com', '/fallback')).toBe('/fallback');
            expect(getRedirectPath('?redirect=%2F%2Fevil.com', '/fallback')).toBe('/fallback');
            expect(getRedirectPath('', '/dashboard')).toBe('/dashboard');
        });
    });

    describe('3. Authoritative Destination Resolution based on Server Readiness', () => {
        it('routes activated PRINTHOUSE_ADMIN with pending onboarding to Guided Setup', async () => {
            // Mock server returns incomplete readiness
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    ok: true,
                    data: {
                        readiness: {
                            accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                            operationalConfiguration: { status: 'IN_PROGRESS', blockingIssues: ['NO_MACHINES'] },
                            pricingReadiness: { status: 'NOT_STARTED', blockingIssues: [] }
                        }
                    }
                })
            });

            const user = {
                id: 'usr-1',
                email: 'admin@faehrmann.de',
                role: 'PRINTHOUSE_ADMIN',
                isActivated: true, // Note: isActivated is TRUE but onboarding is incomplete!
                tenantId: 'tenant-faehrmann'
            };

            const destination = await resolveUserDestination(user, null, 'mock-jwt-token');
            expect(destination).toBe('/printhouse/onboarding-guided');
        });

        it('routes activated account that has not started setup to Guided Setup even if user object contains isActivated', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    ok: true,
                    data: {
                        readiness: {
                            accountSetup: { status: 'NOT_STARTED', completedRequirements: 0 },
                            operationalConfiguration: { status: 'NOT_STARTED' },
                            pricingReadiness: { status: 'NOT_STARTED' }
                        }
                    }
                })
            });

            const user = {
                id: 'usr-2',
                email: 'new@printhouse.es',
                role: 'PRINTHOUSE_OPERATOR',
                isActivated: true,
                tenantId: 'tenant-new'
            };

            const destination = await resolveUserDestination(user, null, 'mock-jwt-token');
            expect(destination).toBe('/printhouse/onboarding-guided');
        });

        it('routes Printhouse with genuinely completed onboarding on server to Full Setup Hub', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    ok: true,
                    data: {
                        readiness: {
                            accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                            operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                            pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
                        }
                    }
                })
            });

            const user = {
                id: 'usr-3',
                email: 'complete@printhouse.de',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-complete'
            };

            const destination = await resolveUserDestination(user, null, 'mock-jwt-token');
            expect(destination).toBe('/printhouse/setup');
        });

        it('preserves /dashboard for Platform Administrator and Super Admin', async () => {
            const adminUser = {
                id: 'admin-1',
                email: 'admin@printprice.pro',
                role: 'SUPER_ADMIN',
                tenantId: 'ppos-production'
            };

            const destination = await resolveUserDestination(adminUser, null, 'mock-jwt-token');
            expect(destination).toBe('/dashboard');
        });

        it('preserves explicit relative destination when authorized', async () => {
            const user = {
                id: 'usr-4',
                email: 'op@printhouse.de',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-explicit'
            };

            const destination = await resolveUserDestination(user, '/printhouse/quotes?status=pending', 'token');
            expect(destination).toBe('/printhouse/quotes?status=pending');
        });

        it('fail-closed on server error: routes to Guided Setup and does NOT declare complete', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

            const user = {
                id: 'usr-5',
                email: 'offline@printhouse.de',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-offline'
            };

            const destination = await resolveUserDestination(user, null, 'mock-token');
            expect(destination).toBe('/printhouse/onboarding-guided');
        });
    });

    describe('4. Cross-Browser & Missing LocalStorage Server Step Recovery', () => {
        it('derives pending stage correctly when browser has zero localStorage cache', async () => {
            const tenantId = 'tenant-cross-browser-fresh';
            expect(localStorage.getItem(`ppos_guided_onboarding_draft_${tenantId}`)).toBeNull();

            // Server reports Company (AccountSetup) is COMPLETE, but Operational & Pricing are INCOMPLETE
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    ok: true,
                    data: {
                        readiness: {
                            accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                            operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                            pricingReadiness: { status: 'NOT_STARTED', blockingIssues: ['MISSING_PRICING'] }
                        }
                    }
                })
            });

            const resumedStage = await resumePendingGuidedStage('jwt-token-123', tenantId);
            // Requirement 2: Do NOT skip straight to PRICING exclusively based on machinery or operational readiness.
            // With products unconfirmed and no pricing continuity, the first pending stage is PRODUCTS.
            expect(resumedStage).toBe('PRODUCTS');
        });

        it('derives PRICING stage when products are confirmed and pricing is incomplete', async () => {
            const tenantId = 'tenant-products-confirmed-pricing-pending';
            // Save draft where Stage B (PRODUCTS) was confirmed
            saveGuidedOnboardingDraft({
                schemaVersion: 2,
                tenantId,
                currentStage: 'PRODUCTS',
                selectedFamilyId: 'HARDCOVER',
                enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
                company: {
                    legalName: 'Imprenta Test S.L.',
                    tradingName: 'Test Print',
                    country: 'ES',
                    city: 'Madrid',
                    address: '',
                    postalCode: '',
                    phone: '',
                    website: '',
                    contactName: '',
                    taxId: '',
                    siteName: 'Sede Central',
                    siteTimezone: 'Europe/Madrid',
                    primarySiteId: 'site-1',
                    userEditedFields: [],
                    acknowledgedServerValues: {}
                },
                offerDrafts: {},
                pricingContinuity: {},
                lastSavedTimestamp: Date.now(),
                completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
            });

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    ok: true,
                    data: {
                        readiness: {
                            accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                            operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                            pricingReadiness: { status: 'NOT_STARTED', blockingIssues: ['MISSING_PRICING'] }
                        }
                    }
                })
            });

            const resumedStage = await resumePendingGuidedStage('jwt-token-123', tenantId);
            expect(resumedStage).toBe('PRICING');
        });

        it('derives REVIEW stage when server reports all modules complete', async () => {
            const tenantId = 'tenant-all-ready';

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    ok: true,
                    data: {
                        readiness: {
                            accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                            operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                            pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
                        }
                    }
                })
            });

            const resumedStage = await resumePendingGuidedStage('jwt-token-123', tenantId);
            expect(resumedStage).toBe('REVIEW');
        });

        it('derives COMPANY stage if account setup is incomplete', async () => {
            const tenantId = 'tenant-incomplete-account';

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    ok: true,
                    data: {
                        readiness: {
                            accountSetup: { status: 'IN_PROGRESS', completedRequirements: 2, blockingIssues: ['ADD_COUNTRY'] },
                            operationalConfiguration: { status: 'NOT_STARTED' },
                            pricingReadiness: { status: 'NOT_STARTED' }
                        }
                    }
                })
            });

            const resumedStage = await resumePendingGuidedStage('jwt-token-123', tenantId);
            expect(resumedStage).toBe('COMPANY');
        });
    });
});
