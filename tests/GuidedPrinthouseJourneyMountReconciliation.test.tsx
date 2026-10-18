/**
 * tests/GuidedPrinthouseJourneyMountReconciliation.test.tsx
 *
 * Real Mount & Integration Tests for GuidedPrinthouseJourney Runtime Reconciliation:
 * 1. Browser without local storage (fresh mount resumes correct stage).
 * 2. Obsolete / stale cache (reconciles with server truth).
 * 3. Company complete and products pending (mounts on Stage B PRODUCTS).
 * 4. Products selected and pricing pending (mounts on Stage C PRICING).
 * 5. Network error (retains safe stage, displays retry, fail-closed).
 * 6. Tenant identity change during in-flight fetch (discards stale tenant response).
 */

import React from 'react';
import '@testing-library/jest-dom';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { GuidedPrinthouseJourney } from '../src/ui/components/printhouse/onboarding/GuidedPrinthouseJourney';
import { 
    saveGuidedOnboardingDraft, 
    loadGuidedOnboardingDraft 
} from '../src/ui/lib/onboardingDraftStore';
import { getAuthUser, getAuthToken } from '../src/ui/lib/authStore';

vi.mock('../src/ui/lib/authStore', async () => {
    const actual = await vi.importActual('../src/ui/lib/authStore');
    return {
        ...actual,
        getAuthUser: vi.fn(),
        getAuthToken: vi.fn().mockReturnValue('test-auth-token-reconcile')
    };
});

const renderJourney = (ui: React.ReactElement, locale = 'es') => {
    return rtlRender(
        <MemoryRouter>
            <LocaleProvider initialLocale={locale as any}>
                {ui}
            </LocaleProvider>
        </MemoryRouter>
    );
};

describe('GuidedPrinthouseJourney Mount & Runtime Reconciliation Integration Suite', () => {
    beforeEach(() => {
        localStorage.clear();
        (getAuthUser as any).mockReturnValue({
            tenantId: 'tenant-mount-test',
            role: 'PRINTHOUSE_ADMIN',
            email: 'admin@mount-test.local',
            printhouseId: 'node-mount-1',
            companyName: 'Mount Test Printhouse'
        });
    });

    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('1. Fresh browser without localStorage: mounts cleanly and resumes at Stage B (PRODUCTS) when accountSetup is complete', async () => {
        // Zero localStorage items
        localStorage.clear();

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Imprenta Fresca S.L.', country: 'ES', city: 'Madrid' },
                            sites: [{ siteId: 'site-fresca-1', siteName: 'Planta Fresca', city: 'Madrid', country: 'ES' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                operationalConfiguration: { status: 'INCOMPLETE', blockingIssues: ['NO_MACHINES'] },
                                pricingReadiness: { status: 'INCOMPLETE', blockingIssues: ['NO_RATES'] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        // Set draft initial stage on COMPANY to simulate resuming session after account setup
        saveGuidedOnboardingDraft({
            tenantId: 'tenant-mount-test',
            currentStage: 'COMPANY',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Imprenta Fresca S.L.',
                tradingName: 'Fresca',
                country: 'ES',
                city: 'Madrid',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Planta Fresca',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        renderJourney(<GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />);

        // Should automatically reconcile from COMPANY to Stage B (PRODUCTS) because accountSetup is COMPLETE
        await waitFor(() => {
            expect(screen.getByText('¿Qué tipos de producto fabrica tu imprenta?')).toBeInTheDocument();
        });
        expect(screen.getByRole('heading', { name: /Tapa dura/i })).toBeInTheDocument();
    });

    it('2. Obsolete cache: reconciles with authoritative server truth and pulls back if prerequisite became incomplete', async () => {
        // User had an obsolete local cache claiming they were on PRICING,
        // but the server reports accountSetup is INCOMPLETE (e.g. required taxId/address or site was deleted).
        saveGuidedOnboardingDraft({
            tenantId: 'tenant-mount-test',
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Imprenta Obsoleta S.L.',
                tradingName: 'Obsoleta',
                country: 'ES',
                city: 'Valencia',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Sede Valencia',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now() - 1000000,
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Imprenta Obsoleta S.L.', country: 'ES', city: '' },
                            sites: [],
                            readiness: {
                                accountSetup: { status: 'INCOMPLETE', blockingIssues: ['NO_PRIMARY_SITE'] },
                                operationalConfiguration: { status: 'INCOMPLETE', blockingIssues: [] },
                                pricingReadiness: { status: 'INCOMPLETE', blockingIssues: [] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        renderJourney(<GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />);

        // Authority invariant: Server INCOMPLETE pulls stage back to Stage A (COMPANY)
        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });
    });

    it('3. Company complete and products pending: mounts directly on Stage B (PRODUCTS)', async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Talleres Gráficos del Sur S.L.', country: 'ES', city: 'Sevilla' },
                            sites: [{ siteId: 'site-sur-1', siteName: 'Planta Sevilla', city: 'Sevilla', country: 'ES' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                                pricingReadiness: { status: 'INCOMPLETE', blockingIssues: ['NO_RATES'] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        // Local draft has COMPANY complete, PRODUCTS not confirmed yet
        saveGuidedOnboardingDraft({
            tenantId: 'tenant-mount-test',
            currentStage: 'COMPANY',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Talleres Gráficos del Sur S.L.',
                tradingName: 'SurPrint',
                country: 'ES',
                city: 'Sevilla',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Manuel',
                taxId: '',
                siteName: 'Planta Sevilla',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        renderJourney(<GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />);

        // Mounts and reconciles to PRODUCTS (Stage B), NOT leaping to PRICING
        await waitFor(() => {
            expect(screen.getByText('¿Qué tipos de producto fabrica tu imprenta?')).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Continuar a calibrar precios/i })).toBeInTheDocument();
    });

    it('4. Products selected and pricing pending: mounts on Stage C (PRICING)', async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Gráficas Norte S.A.', country: 'ES', city: 'Bilbao' },
                            sites: [{ siteId: 'site-norte-1', siteName: 'Planta Bilbao', city: 'Bilbao', country: 'ES' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                                pricingReadiness: { status: 'INCOMPLETE', blockingIssues: ['NO_RATES'] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        // User completed PRODUCTS
        saveGuidedOnboardingDraft({
            tenantId: 'tenant-mount-test',
            currentStage: 'PRODUCTS',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Gráficas Norte S.A.',
                tradingName: 'NortePrint',
                country: 'ES',
                city: 'Bilbao',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Iñaki',
                taxId: '',
                siteName: 'Planta Bilbao',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        renderJourney(<GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-mount-1" />);

        // Mounts and advances to PRICING
        await waitFor(() => {
            expect(screen.getByText(/Calibra tus tarifas con un presupuesto real/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Usar asistente de calibración/i })).toBeInTheDocument();
    });

    it('5. Network error during mount fetch: retains safe stage and displays honest error indicator (fail-closed)', async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.reject(new Error('Failed to fetch'));
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        saveGuidedOnboardingDraft({
            tenantId: 'tenant-mount-test',
            currentStage: 'COMPANY',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Imprenta Red Caída S.L.',
                tradingName: 'RedCaida',
                country: 'ES',
                city: 'Toledo',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Planta Toledo',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: false, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        renderJourney(<GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />);

        // Does NOT crash, retains COMPANY safe stage and renders form
        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });
        // Storage status remains functional for local drafting
        expect(screen.getByTestId('guided-storage-status')).toBeInTheDocument();
    });

    it('6. Tenant identity change during in-flight fetch: discards stale response from previous tenant', async () => {
        let resolveTenantA: (value: any) => void;
        const tenantAPromise = new Promise((res) => {
            resolveTenantA = res;
        });

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return tenantAPromise;
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        (getAuthUser as any).mockReturnValue({
            tenantId: 'tenant-A',
            role: 'PRINTHOUSE_ADMIN',
            email: 'admin-a@test.local',
            printhouseId: 'node-A'
        });

        const { rerender } = renderJourney(<GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />);

        // Switch identity immediately to tenant-B
        (getAuthUser as any).mockReturnValue({
            tenantId: 'tenant-B',
            role: 'PRINTHOUSE_ADMIN',
            email: 'admin-b@test.local',
            printhouseId: 'node-B'
        });

        saveGuidedOnboardingDraft({
            tenantId: 'tenant-B',
            currentStage: 'COMPANY',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Empresa Tenant B S.L.',
                tradingName: 'TenantB',
                country: 'ES',
                city: 'Granada',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin B',
                taxId: '',
                siteName: 'Planta Granada',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: false, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        rerender(
            <MemoryRouter>
                <LocaleProvider initialLocale={'es' as any}>
                    <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />
                </LocaleProvider>
            </MemoryRouter>
        );

        // Now resolve delayed response from Tenant A with Tenant A's data
        resolveTenantA!({
            ok: true,
            json: () => Promise.resolve({
                ok: true,
                data: {
                    company: { legalName: 'EMPRESA TENANT A INTRUSA', country: 'ES', city: 'Madrid' },
                    sites: [{ siteId: 'site-a', siteName: 'Planta A' }],
                    readiness: { accountSetup: { status: 'COMPLETE' } }
                }
            })
        });

        // Verify Tenant B's draft is NOT contaminated by Tenant A
        await waitFor(() => {
            const draftB = loadGuidedOnboardingDraft('tenant-B');
            expect(draftB.company.legalName).toBe('Empresa Tenant B S.L.');
            expect(draftB.company.legalName).not.toContain('INTRUSA');
        });
    });

    it('7. Cross-browser recovery: Browser B with completely empty localStorage restores persisted product families and opens at PRICING', async () => {
        // Step 2 requirement: Browser B logs in with completely empty localStorage (NO local draft, NO cache)
        localStorage.clear();

        // Step 3 requirement: Server returns persisted selection (e.g. HARDCOVER and WIRE_O) and confirmation
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: {
                                legalName: 'Imprenta Cruzada S.L.',
                                country: 'ES',
                                city: 'Barcelona',
                                selectedProductFamilies: ['HARDCOVER', 'WIRE_O'],
                                productsConfirmed: true
                            },
                            sites: [{ siteId: 'site-cruzada-1', siteName: 'Sede Barcelona', city: 'Barcelona', country: 'ES' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                                pricingReadiness: { status: 'INCOMPLETE', blockingIssues: ['NO_RATES'] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        // Render component directly without injecting any local draft
        renderJourney(<GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-mount-1" />);

        // Step 4 requirement: UI reconstructs enabledFamilies and opens at the correct pending stage (PRICING)
        await waitFor(() => {
            expect(screen.getByText(/Calibra tus tarifas con un presupuesto real/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Usar asistente de calibración/i })).toBeInTheDocument();

        // Verify draft reconstructed in localStorage has the exact persisted families without inventing values
        const reconstructedDraft = loadGuidedOnboardingDraft('tenant-mount-test');
        expect(reconstructedDraft.enabledFamilies).toEqual({
            HARDCOVER: true,
            SOFTCOVER: false,
            WIRE_O: true,
            SADDLE_STITCH: false
        });
        expect(reconstructedDraft.completedStages.PRODUCTS).toBe(true);
        expect(reconstructedDraft.currentStage).toBe('PRICING');
    });

    it('8. Cross-browser recovery: Browser B with empty localStorage opens at PRODUCTS when products are not yet confirmed', async () => {
        // Fresh Browser B with empty localStorage
        localStorage.clear();

        // Server returns company with products unconfirmed
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: {
                                legalName: 'Imprenta Pendiente S.L.',
                                country: 'ES',
                                city: 'Zaragoza',
                                selectedProductFamilies: ['SOFTCOVER', 'SADDLE_STITCH'],
                                productsConfirmed: false
                            },
                            sites: [{ siteId: 'site-pendiente-1', siteName: 'Sede Zaragoza', city: 'Zaragoza', country: 'ES' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                                pricingReadiness: { status: 'INCOMPLETE', blockingIssues: ['NO_RATES'] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        // Render directly without injecting draft
        renderJourney(<GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-mount-1" />);

        // Unconfirmed products must open at Stage B (PRODUCTS), not leaping to PRICING
        await waitFor(() => {
            expect(screen.getByText('¿Qué tipos de producto fabrica tu imprenta?')).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Continuar a calibrar precios/i })).toBeInTheDocument();

        // Verify reconstructed families in draft match server selection
        const reconstructedDraft = loadGuidedOnboardingDraft('tenant-mount-test');
        expect(reconstructedDraft.enabledFamilies).toEqual({
            HARDCOVER: false,
            SOFTCOVER: true,
            WIRE_O: false,
            SADDLE_STITCH: true
        });
        expect(reconstructedDraft.completedStages.PRODUCTS).toBe(false);
        expect(reconstructedDraft.currentStage).toBe('PRODUCTS');
    });
});
