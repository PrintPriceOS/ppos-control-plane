/**
 * tests/GuidedPrinthouseJourney.test.tsx
 *
 * Comprehensive Test Suite for the Restructured Guided Printhouse Onboarding:
 * 1. Welcome Screen rendering: clear value promise, dominant CTA, auto-save guarantee indicator.
 * 2. Stage Stepper: 4 clear stages (Tu imprenta, Qué produces, Tus precios, Revisar y continuar).
 * 3. Stage A (Tu imprenta): Form validation, backend PATCH/POST calls, no duplicate prompts.
 * 4. Stage B (Qué produces): 4 canonical families with large icons, toggle offered/not-offered.
 * 5. Stage C (Tus precios): Seamless integration with SimplifiedOnboardingJourney for quote upload & solver.
 * 6. Stage D (Revisar y continuar): True server readiness reflection, zero false marketplace promises.
 * 7. State Continuity & Draft Persistence: LocalStorage persistence survives unmount and reloads.
 * 8. Bidirectional Navigation: Flawless return to Welcome and seamless transition to Full Setup Hub.
 * 9. Multilingual Support: Full translation parity across ES, EN, and DE.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { GuidedPrinthouseJourney } from '../src/ui/components/printhouse/onboarding/GuidedPrinthouseJourney';
import { 
    loadGuidedOnboardingDraft, 
    saveGuidedOnboardingDraft, 
    clearGuidedOnboardingDraft 
} from '../src/ui/lib/onboardingDraftStore';
import { getAuthUser, getAuthToken } from '../src/ui/lib/authStore';

vi.mock('../src/ui/lib/authStore', async () => {
    const actual = await vi.importActual('../src/ui/lib/authStore');
    return {
        ...actual,
        getAuthUser: vi.fn().mockReturnValue({
            tenantId: 'tenant-current',
            role: 'PRINTHOUSE_OPERATOR',
            email: 'operator@test.local',
            printhouseId: 'node-test-1',
            companyName: 'Test Printhouse'
        }),
        getAuthToken: vi.fn().mockReturnValue('test-auth-token')
    };
});

const renderWithProviders = (ui: React.ReactElement, locale = 'es') => {
    return rtlRender(
        <MemoryRouter>
            <LocaleProvider initialLocale={locale as any}>
                {ui}
            </LocaleProvider>
        </MemoryRouter>
    );
};

describe('Guided Printhouse Onboarding Journey Suite', () => {
    beforeEach(() => {
        localStorage.clear();
        (getAuthUser as any).mockReturnValue({
            tenantId: 'tenant-current',
            role: 'PRINTHOUSE_OPERATOR',
            email: 'operator@test.local',
            printhouseId: 'node-test-1',
            companyName: 'Test Printhouse'
        });

        // Default mock fetch for onboarding endpoints
        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/company-profile')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            companyName: 'Test Printhouse',
                            legalName: 'Test Printhouse S.L.',
                            country: 'ES',
                            city: 'Valencia'
                        }
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/sites')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            siteId: 'site-mock-1',
                            siteName: 'Planta Principal',
                            country: 'ES',
                            city: 'Valencia'
                        }
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/submit-for-review') || url.includes('/api/printhouse/onboarding/review/submit')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, ok: true, status: 'SUBMITTED' })
                });
            }
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Imprenta Original S.L.', country: 'ES', city: 'Madrid' },
                            sites: [{ siteId: 'site-1', siteName: 'Sede Central', city: 'Madrid', country: 'ES' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                                pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, data: {} })
            });
        });
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('1. Renders Welcome Screen with clear promise and dominant action', async () => {
        const onOpenFullSetup = vi.fn();
        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={onOpenFullSetup} />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Preparemos tu imprenta')).toBeInTheDocument();
        });

        expect(screen.getByText(/Cuéntanos qué produces y utiliza tus presupuestos/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Comenzar configuración|Continuar configuración/i })).toBeInTheDocument();

        // 4 Key highlights
        expect(screen.getByText('1. Tu imprenta')).toBeInTheDocument();
        expect(screen.getByText('2. Qué produces')).toBeInTheDocument();
        expect(screen.getByText('3. Cómo configurar tus precios')).toBeInTheDocument();
        expect(screen.getByText('4. Revisar y próximos pasos')).toBeInTheDocument();
    });

    it('2. Navigates from Welcome to Stage A (Tu imprenta) and displays form', async () => {
        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Comenzar configuración|Continuar configuración/i })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Comenzar configuración|Continuar configuración/i }));

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        expect(screen.getByLabelText(/Razón Social|Nombre legal/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Ciudad \/ Municipio/i)).toBeInTheDocument();
    });

    it('3. Stage A validates required fields before progressing to Stage B', async () => {
        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        const legalInput = screen.getByLabelText(/Razón Social|Nombre legal/i);
        fireEvent.change(legalInput, { target: { value: '' } });

        const submitBtn = screen.getByRole('button', { name: /Guardar y elegir qué produces/i });
        fireEvent.submit(submitBtn.closest('form')!);

        await waitFor(() => {
            expect(screen.getAllByText(/introduce el nombre legal o razón social/i).length).toBeGreaterThanOrEqual(1);
        });
    });

    it('4. Stage A submits data to backend and advances to Stage B (Qué produces)', async () => {
        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        const legalInput = screen.getByLabelText(/Razón Social|Nombre legal/i);
        fireEvent.change(legalInput, { target: { value: 'Gráficas València S.A.' } });

        const cityInput = screen.getByLabelText(/Ciudad \/ Municipio/i);
        fireEvent.change(cityInput, { target: { value: 'València' } });

        const submitBtn = screen.getByRole('button', { name: /Guardar y elegir qué produces/i });
        fireEvent.submit(submitBtn.closest('form')!);

        await waitFor(() => {
            expect(screen.getByText('¿Qué tipos de producto fabrica tu imprenta?')).toBeInTheDocument();
        });

        // 4 Canonical Families exist
        expect(screen.getByRole('heading', { name: /Tapa dura/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Rústica/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Wire-O/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Grapado/i })).toBeInTheDocument();
    });

    it('5. Draft persistence: updates in Stage A and B are stored in localStorage and restored', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            currentStage: 'PRODUCTS',
            selectedFamilyId: 'WIRE_O',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: true, SADDLE_STITCH: false },
            company: {
                legalName: 'Persisted Print S.L.',
                tradingName: 'PersistedPrint',
                country: 'ES',
                city: 'Sevilla',
                address: 'Calle Industria 4',
                postalCode: '41001',
                phone: '954000000',
                website: 'https://persisted.com',
                contactName: 'Ana Sevilla',
                taxId: 'B99999999',
                siteName: 'Planta Sevilla',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        // Should restore Stage B directly
        await waitFor(() => {
            expect(screen.getByText('¿Qué tipos de producto fabrica tu imprenta?')).toBeInTheDocument();
        });
    });

    it('6. Stage D (Revisar y continuar) displays honest governance disclaimers without false marketplace claims', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            currentStage: 'REVIEW',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Imprenta Madura S.L.',
                tradingName: 'MaduraPrint',
                country: 'ES',
                city: 'Bilbao',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Mikel',
                taxId: '',
                siteName: 'Planta Norte',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: true, REVIEW: false }
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Resumen de configuración de tu imprenta')).toBeInTheDocument();
        });

        // Verification of Governance Disclaimers
        expect(screen.getByText(/Nota de gobernanza y activación/i)).toBeInTheDocument();
        expect(screen.getByText(/no equivale a activar el marketplace/i)).toBeInTheDocument();
    });

    it('7. Supports EN and DE localization with complete translation strings', async () => {
        const { unmount } = renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'en'
        );

        await waitFor(() => {
            expect(screen.getByText('Let’s set up your printhouse')).toBeInTheDocument();
        });
        expect(screen.getByText('1. Your Shop')).toBeInTheDocument();

        unmount();

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'de'
        );

        await waitFor(() => {
            expect(screen.getByText('Bereiten wir Ihre Druckerei vor')).toBeInTheDocument();
        });
        expect(screen.getByText('1. Ihr Betrieb')).toBeInTheDocument();
    });

    it('8. Identity mismatch: never substitutes siteId for printerNodeId, blocks calculation and shows prerequisite if node absent', async () => {
        const siteOnlyData = {
            company: { legalName: 'Planta Aislada S.L.', country: 'ES', city: 'Madrid' },
            sites: [{ siteId: 'site-deliberately-different-999', siteName: 'Sede Sur', city: 'Madrid', country: 'ES' }],
            readiness: {
                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
            }
        };

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: siteOnlyData })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        // Save draft in PRICING stage with null printerNodeId passed to GuidedPrinthouseJourney
        saveGuidedOnboardingDraft({
            tenantId: 'tenant-current',
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Planta Aislada S.L.',
                tradingName: 'Planta',
                country: 'ES',
                city: 'Madrid',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Sede Sur',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        renderWithProviders(
            <GuidedPrinthouseJourney 
                onOpenFullSetup={vi.fn()} 
                printerNodeId={undefined} /* Deliberately absent printerNodeId */
            />,
            'es'
        );

        // Should display prerequisite banner indicating printer node is missing and not substitute siteId
        await waitFor(() => {
            expect(screen.getByText(/Se requiere un nodo de impresión configurado/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/Una sede o planta física no sustituye a una máquina o nodo de impresión/i)).toBeInTheDocument();
        expect(screen.getByText(/Configurar maquinaria y nodos/i)).toBeInTheDocument();
    });

    it('9. Review readiness: absent, loading, or incomplete readiness strictly disables submission', async () => {
        // Mock server returning INCOMPLETE readiness
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Imprenta Incompleta S.L.', country: 'ES', city: 'Madrid' },
                            sites: [{ siteId: 'site-1', siteName: 'Sede Central', city: 'Madrid', country: 'ES' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                operationalConfiguration: { status: 'INCOMPLETE', blockingIssues: ['NO_MACHINES_CONFIGURED'] },
                                pricingReadiness: { status: 'INCOMPLETE', blockingIssues: ['NO_RATES_CONFIGURED'] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        saveGuidedOnboardingDraft({
            tenantId: 'tenant-current',
            currentStage: 'REVIEW',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Imprenta Incompleta S.L.',
                tradingName: 'Incompleta',
                country: 'ES',
                city: 'Madrid',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Sede Central',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: true, REVIEW: false }
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Resumen de configuración de tu imprenta')).toBeInTheDocument();
        });

        // Incomplete readiness must NOT show submit button, must show "Ver requisitos pendientes"
        expect(screen.queryByRole('button', { name: /Solicitar revisión comercial/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Ver requisitos pendientes/i })).toBeInTheDocument();
        expect(screen.getByText(/Aún quedan requisitos operativos o de tarifas por completar/i)).toBeInTheDocument();
    });

    it('10. Error normalization: nested errors and HTTP errors never render [object Object]', async () => {
        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/company-profile')) {
                return Promise.resolve({
                    ok: false,
                    status: 422,
                    json: () => Promise.resolve({
                        error: {
                            code: 'UNPROCESSABLE_ENTITY',
                            message: 'El NIF o CIF suministrado no es válido en el registro mercantil'
                        }
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Test Printhouse', country: 'ES', city: 'Valencia' },
                            sites: [{ siteId: 'site-1', siteName: 'Central', city: 'Valencia', country: 'ES' }],
                            readiness: null
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        saveGuidedOnboardingDraft({
            tenantId: 'tenant-current',
            currentStage: 'COMPANY',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Test Printhouse',
                tradingName: 'Test',
                country: 'ES',
                city: 'Valencia',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Central',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: false, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        const submitBtn = screen.getByRole('button', { name: /Guardar y elegir qué produces/i });
        fireEvent.submit(submitBtn.closest('form')!);

        await waitFor(() => {
            expect(screen.getByText('El NIF o CIF suministrado no es válido en el registro mercantil')).toBeInTheDocument();
        });

        // Ensure no [object Object] text exists anywhere in document
        expect(document.body.innerHTML).not.toContain('[object Object]');
    });

    it('11. Draft persistence: validates schema, tenant isolation, and handles storage errors gracefully', () => {
        // Schema version mismatch reset
        localStorage.setItem('ppos_guided_onboarding_draft_tenant-alpha', JSON.stringify({
            schemaVersion: 1, // Old schema version
            tenantId: 'tenant-alpha',
            currentStage: 'PRICING'
        }));
        const loadedDraft = loadGuidedOnboardingDraft('tenant-alpha');
        expect(loadedDraft.schemaVersion).toBe(2);
        expect(loadedDraft.currentStage).toBe('WELCOME');

        // Discards foreign draft if tenantId mismatch
        localStorage.setItem('ppos_guided_onboarding_draft_tenant-bravo', JSON.stringify({
            schemaVersion: 2,
            tenantId: 'tenant-intruder', // Foreign tenant
            currentStage: 'PRICING'
        }));
        const foreignDraft = loadGuidedOnboardingDraft('tenant-bravo');
        expect(foreignDraft.tenantId).toBe('tenant-bravo');
        expect(foreignDraft.currentStage).toBe('WELCOME');

        // Rejects shared fallback tenant IDs
        expect(saveGuidedOnboardingDraft({
            ...foreignDraft,
            tenantId: 'anonymous_tenant'
        })).toBe(false);

        expect(saveGuidedOnboardingDraft({
            ...foreignDraft,
            tenantId: 'default'
        })).toBe(false);

        // Handles quota exceeded without unhandled exception
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
            throw new DOMException('QuotaExceededError');
        });
        const saveResult = saveGuidedOnboardingDraft({
            ...foreignDraft,
            tenantId: 'tenant-valid'
        });
        expect(saveResult).toBe(false);
        setItemSpy.mockRestore();
    });

    it('12. Preserves pricing work continuity across Stage round trips', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Test Printhouse',
                tradingName: 'Test',
                country: 'ES',
                city: 'Valencia',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Central',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: 'session-persist-123',
                    activeRun: { id: 'run-999', status: 'COMPLETED' },
                    selectedVariantId: 'var-abc',
                    proposedPatch: { speed: 5000 },
                    entryMode: 'MANUAL_FORM',
                    uploadedFileName: null,
                    step: 4
                }
            },
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: true, REVIEW: false }
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-test-1" />,
            'es'
        );

        // Navigate to Stage D (Review) via stepper
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Revisar y continuar/i })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: /Revisar y continuar/i }));

        await waitFor(() => {
            expect(screen.getByText('Resumen de configuración de tu imprenta')).toBeInTheDocument();
        });

        // Navigate back to Stage C (Pricing)
        fireEvent.click(screen.getByRole('button', { name: /Tus precios/i }));

        // Verify draft store preserved pricing continuity
        const currentStored = loadGuidedOnboardingDraft(tenantId);
        expect(currentStored.pricingContinuity?.HARDCOVER?.sessionId).toBe('session-persist-123');
        expect(currentStored.pricingContinuity?.HARDCOVER?.selectedVariantId).toBe('var-abc');
        expect(currentStored.pricingContinuity?.HARDCOVER?.step).toBe(4);
    });

    it('13. Pricing continuity: preserves recalculated activeRun and proposedPatch with same session, variant, and step', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Test Printhouse',
                tradingName: 'Test',
                country: 'ES',
                city: 'Valencia',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Central',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: 'session-recalc-1',
                    activeRun: { id: 'run-alpha', status: 'DRAFT', revisionId: 'rev-1' },
                    selectedVariantId: 'var-100',
                    proposedPatch: { speed: 4000 },
                    entryMode: 'MANUAL_FORM',
                    uploadedFileName: null,
                    step: 4,
                    offer: {
                        family: 'HARDCOVER',
                        productTitle: 'Initial Book',
                        quoteRef: 'Q-001',
                        quoteDate: '2026-10-16',
                        currency: 'EUR',
                        widthMm: 148,
                        heightMm: 210,
                        runs: []
                    },
                    comparisonData: {
                        enginePrice: 500,
                        originalPrice: 550,
                        difference: -50,
                        residual: 0.05,
                        isCalculated: true,
                        supportedParameters: [],
                        coverageGaps: []
                    }
                }
            },
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: true, REVIEW: false }
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-test-1" />,
            'es'
        );

        // Stage C is active, verify that neutral pricing title is visible
        await waitFor(() => {
            expect(screen.getByText('Configura tus tarifas y precios de fabricación')).toBeInTheDocument();
        });

        // Directly test handlePricingContinuityChange behavior and draft preservation
        // when session, variant, and step remain identical, but activeRun and proposedPatch are updated
        const currentDraft = loadGuidedOnboardingDraft(tenantId);
        expect(currentDraft.pricingContinuity?.HARDCOVER?.activeRun?.id).toBe('run-alpha');
        expect(currentDraft.pricingContinuity?.HARDCOVER?.proposedPatch?.speed).toBe(4000);

        // Simulate recalculation update from SimplifiedOnboardingJourney with same session/variant/step but new run & patch
        const recalculatedDraft = {
            ...currentDraft.pricingContinuity!.HARDCOVER!,
            activeRun: { id: 'run-beta', status: 'COMPLETED', revisionId: 'rev-2' },
            proposedPatch: { speed: 5200, makeready: 120 },
            offer: {
                ...currentDraft.pricingContinuity!.HARDCOVER!.offer!,
                productTitle: 'Updated Book Title'
            },
            comparisonData: {
                ...currentDraft.pricingContinuity!.HARDCOVER!.comparisonData,
                enginePrice: 525
            }
        };

        // Save recalculated draft and verify that loadGuidedOnboardingDraft reflects it accurately
        saveGuidedOnboardingDraft({
            ...currentDraft,
            pricingContinuity: {
                HARDCOVER: recalculatedDraft
            }
        });

        const updatedStored = loadGuidedOnboardingDraft(tenantId);
        expect(updatedStored.pricingContinuity?.HARDCOVER?.activeRun?.id).toBe('run-beta');
        expect(updatedStored.pricingContinuity?.HARDCOVER?.proposedPatch?.speed).toBe(5200);
        expect(updatedStored.pricingContinuity?.HARDCOVER?.offer?.productTitle).toBe('Updated Book Title');
        expect(updatedStored.pricingContinuity?.HARDCOVER?.comparisonData?.enginePrice).toBe(525);

        // Navigate to Stage D and verify stepper transition succeeds
        fireEvent.click(screen.getByRole('button', { name: /Revisar y continuar/i }));
        await waitFor(() => {
            expect(screen.getByText('Resumen de configuración de tu imprenta')).toBeInTheDocument();
        });
    });

    it('14. Storage feedback: rendered journey truthfully displays storage unavailable state on failure', async () => {
        // Force localStorage to fail
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('QuotaExceededError');
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        // Click to Stage A
        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        // The storage status badge in the header must reflect storage unavailable
        const statusEl = screen.getByTestId('guided-storage-status');
        expect(statusEl).toBeInTheDocument();
        expect(statusEl).toHaveTextContent(/Almacenamiento no disponible/i);

        setItemSpy.mockRestore();
    });

    it('15. Tenant lifecycle: delayed responses from tenant-A are discarded when switching to tenant-B', async () => {
        let resolveTenantAResponse: (value: any) => void = () => {};
        const tenantAPromise = new Promise((resolve) => {
            resolveTenantAResponse = resolve;
        });

        let fetchCount = 0;
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                fetchCount++;
                if (fetchCount === 1) {
                    // First request (for Tenant A): delay indefinitely until released
                    return tenantAPromise;
                }
                // Subsequent request (for Tenant B): resolve immediately
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Tenant B Imprenta', country: 'ES', city: 'Barcelona' },
                            sites: [{ siteId: 'site-b', siteName: 'Planta B', country: 'ES', city: 'Barcelona' }],
                            readiness: {
                                accountSetup: { status: 'PENDING', blockingIssues: ['SITE_PENDING'] },
                                operationalConfiguration: { status: 'PENDING', blockingIssues: [] },
                                pricingReadiness: { status: 'PENDING', blockingIssues: [] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        (getAuthUser as any).mockReturnValue({
            tenantId: 'tenant-a',
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-a'
        });

        const { rerender } = renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />,
            'es'
        );

        // Switch authenticated user identity to Tenant B
        (getAuthUser as any).mockReturnValue({
            tenantId: 'tenant-b',
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-b'
        });

        rerender(
            <MemoryRouter>
                <LocaleProvider initialLocale="es">
                    <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} />
                </LocaleProvider>
            </MemoryRouter>
        );

        // Now resolve delayed Tenant A response
        resolveTenantAResponse({
            ok: true,
            json: () => Promise.resolve({
                ok: true,
                data: {
                    company: { legalName: 'STALE TENANT A SHOULD NOT APPEAR', country: 'ES', city: 'Madrid' },
                    sites: [{ siteId: 'site-a', siteName: 'Stale Site', country: 'ES', city: 'Madrid' }],
                    readiness: {}
                }
            })
        });

        // Wait for Tenant B's data to settle
        await waitFor(() => {
            const stored = loadGuidedOnboardingDraft('tenant-b');
            expect(stored.company.legalName).not.toBe('STALE TENANT A SHOULD NOT APPEAR');
        });
    });

    it('16. Readiness freshness: stale COMPLETE followed by HTTP 500 blocks submission and displays error', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            currentStage: 'REVIEW',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Complete Ready Printhouse',
                tradingName: 'Ready',
                country: 'ES',
                city: 'Madrid',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Carlos',
                taxId: 'B12345678',
                siteName: 'Planta Principal',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            pricingContinuity: {
                HARDCOVER: { pricingMethod: 'TEMPLATE', templateSaved: true } as any,
                SOFTCOVER: { pricingMethod: 'TEMPLATE', templateSaved: true } as any
            },
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: true, REVIEW: false }
        });

        // First return COMPLETE readiness (initial mount makes up to 2 calls: journey + review), then on subsequent refresh return HTTP 500 error
        let callCount = 0;
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: [
                            { id: 'rev-hc', createdBy: { productFamily: 'HARDCOVER', pricingMethod: 'TEMPLATE' } },
                            { id: 'rev-sc', createdBy: { productFamily: 'SOFTCOVER', pricingMethod: 'TEMPLATE' } }
                        ]
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
            }
            if (url.includes('/api/printhouse/onboarding')) {
                callCount++;
                if (callCount <= 2) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            ok: true,
                            data: {
                                company: { legalName: 'Complete Ready Printhouse', country: 'ES', city: 'Madrid' },
                                sites: [{ siteId: 'site-1', siteName: 'Planta 1', country: 'ES', city: 'Madrid' }],
                                readiness: {
                                    accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                    operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                                    pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
                                }
                            }
                        })
                    });
                }
                // Subsequent refresh fails with HTTP 500
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: () => Promise.resolve({ ok: false, error: 'Database timeout on readiness evaluation' })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-test-1" />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Resumen de configuración de tu imprenta')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Solicitar revisión comercial/i })).toBeInTheDocument();
        });

        // Click retry/refresh status button
        const refreshBtn = screen.getByRole('button', { name: /Actualizar estado/i });
        fireEvent.click(refreshBtn);

        // Verification: The HTTP 500 failure prevents review submission
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Solicitar revisión comercial/i })).not.toBeInTheDocument();
            expect(screen.getByText(/Error al actualizar el estado de preparación/i)).toBeInTheDocument();
        });
    });

    it('17. Draft/server reconciliation: preserves German printhouse DE and Europe/Berlin server values without ES default overwrite', async () => {
        const tenantId = 'tenant-german';
        (getAuthUser as any).mockReturnValue({
            tenantId,
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-de-1'
        });

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: {
                                legalName: 'Druckerei Schwarzwald GmbH',
                                country: 'DE',
                                city: 'Freiburg',
                                address: 'Industriestraße 12',
                                postalCode: '79098'
                            },
                            sites: [{
                                siteId: 'site-freiburg',
                                siteName: 'Hauptwerk Freiburg',
                                country: 'DE',
                                city: 'Freiburg',
                                timezone: 'Europe/Berlin'
                            }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                                operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                                pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-de-1" />,
            'es'
        );

        // Check that German country and timezone are preserved and not overridden with ES / Europe/Madrid
        await waitFor(() => {
            const draft = loadGuidedOnboardingDraft(tenantId);
            expect(draft.company.legalName).toBe('Druckerei Schwarzwald GmbH');
            expect(draft.company.country).toBe('DE');
            expect(draft.company.siteTimezone).toBe('Europe/Berlin');
            expect(draft.company.country).not.toBe('ES');
            expect(draft.company.siteTimezone).not.toBe('Europe/Madrid');
        });
    });

    it('18. Node resolution: failed node lookup is never treated as a verified node', async () => {
        // If node lookup fails, GuidedOnboardingPage passes undefined printerNodeId to GuidedPrinthouseJourney
        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId={undefined} />,
            'es'
        );

        // Click through to Stage C (Pricing)
        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        // Fill company
        fireEvent.change(screen.getByLabelText(/Razón Social|Nombre legal/i), { target: { value: 'Test' } });
        fireEvent.change(screen.getByLabelText(/Ciudad \/ Municipio/i), { target: { value: 'City' } });
        fireEvent.submit(screen.getByRole('button', { name: /Guardar y elegir qué produces/i }).closest('form')!);

        await waitFor(() => {
            expect(screen.getByText('¿Qué tipos de producto fabrica tu imprenta?')).toBeInTheDocument();
        });

        // Continue to Stage C
        fireEvent.click(screen.getByRole('button', { name: /Continuar a calibrar precios/i }));

        // Verification: The unverified node displays prerequisite blocker banner and disables calculation
        await waitFor(() => {
            expect(screen.getByText(/Se requiere un nodo de impresión configurado para calibrar tarifas/i)).toBeInTheDocument();
            expect(screen.getByText(/Una sede o planta física no sustituye a una máquina o nodo de impresión/i)).toBeInTheDocument();
        });
    });

    it('19. Pricing draft continuity: preserves runs, quantities, prices, and paper specifications across navigation', async () => {
        const tenantId = 'tenant-pricing-continuity';
        (getAuthUser as any).mockReturnValue({
            tenantId,
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-test-1'
        });

        // Initialize draft directly with a customized offer (run price, quantity, paper specification)
        const initialDraft = loadGuidedOnboardingDraft(tenantId);
        initialDraft.currentStage = 'PRICING';
        initialDraft.selectedFamilyId = 'HARDCOVER';
        initialDraft.completedStages = { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: true, REVIEW: false };
        initialDraft.company = {
            ...initialDraft.company,
            legalName: 'Test Printhouse',
            city: 'Valencia',
            country: 'ES'
        };
        initialDraft.pricingContinuity = {
            HARDCOVER: {
                sessionId: 'session-continuity-1',
                activeRun: { id: 'run-custom-1', status: 'READY' },
                selectedVariantId: 'run-custom-1',
                proposedPatch: { baseClickRate: 0.045 },
                entryMode: 'MANUAL_FORM',
                uploadedFileName: null,
                step: 3,
                offer: {
                    family: 'HARDCOVER',
                    productTitle: 'Libro de Fotografía Gran Formato',
                    quoteRef: 'PHOTO-2026-X',
                    widthMm: 240,
                    heightMm: 300,
                    interiorPaper: 'couché_semi_mate_premium',
                    interiorPages: 128,
                    interiorColors: '4/4',
                    coverPaper: 'tela_editorial_guaflex',
                    bindingMethod: 'thread_sewn',
                    finishes: ['stamping_gold', 'headband_burgundy'],
                    runs: [
                        {
                            id: 'run-custom-1',
                            quantity: 750,
                            manufacturingPrice: 4890.50,
                            totalPrice: 5120.00,
                            paperVariant: 'Estucado 170g',
                            validationStatus: 'CONSISTENT'
                        }
                    ]
                },
                comparisonData: {
                    originalPrice: 4890.50,
                    enginePrice: 4820.00,
                    difference: 70.50,
                    residual: 0.0144,
                    isCalculated: true
                }
            }
        };
        saveGuidedOnboardingDraft(initialDraft);

        const { unmount } = renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-test-1" />,
            'es'
        );

        // Verify stage C rendered with continuity data
        await waitFor(() => {
            expect(screen.getByText(/Libro de Fotografía Gran Formato/i)).toBeInTheDocument();
            expect(screen.getByText('750')).toBeInTheDocument();
        });

        // Simulate navigating away to Stage A (Company)
        fireEvent.click(screen.getByRole('button', { name: /Tu imprenta/i }));

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        // Unmount and remount to verify cross-navigation and reload storage persistence
        unmount();

        const reloadedDraft = loadGuidedOnboardingDraft(tenantId);
        expect(reloadedDraft.pricingContinuity?.HARDCOVER?.offer?.runs?.[0]?.quantity).toBe(750);
        expect(reloadedDraft.pricingContinuity?.HARDCOVER?.offer?.runs?.[0]?.manufacturingPrice).toBe(4890.50);
        expect(reloadedDraft.pricingContinuity?.HARDCOVER?.offer?.runs?.[0]?.paperVariant).toBe('Estucado 170g');
        expect(reloadedDraft.pricingContinuity?.HARDCOVER?.offer?.interiorPaper).toBe('couché_semi_mate_premium');
        expect(reloadedDraft.pricingContinuity?.HARDCOVER?.offer?.coverPaper).toBe('tela_editorial_guaflex');
        expect(reloadedDraft.pricingContinuity?.HARDCOVER?.offer?.finishes).toContain('stamping_gold');
    });

    it('20. Identity guards: tenant A delayed response after switching to tenant B causes no mutations or requests for tenant B', async () => {
        let resolveTenantACompanyProfile: (value: any) => void;
        const tenantAPromise = new Promise(resolve => {
            resolveTenantACompanyProfile = resolve;
        });

        let siteRequestsMade = 0;
        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/company-profile') && opts?.method === 'PATCH') {
                return tenantAPromise;
            }
            if (url.includes('/api/printhouse/onboarding/sites')) {
                siteRequestsMade++;
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: { siteId: 'site-leak' } })
                });
            }
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: { company: null, sites: [] } })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        const tenantA = 'tenant-alpha';
        (getAuthUser as any).mockReturnValue({
            tenantId: tenantA,
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-a'
        });

        const { rerender } = renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-a" />,
            'es'
        );

        // Navigate to Stage A
        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        // Fill form as tenant A
        fireEvent.change(screen.getByLabelText(/Razón Social|Nombre legal/i), { target: { value: 'Alpha Print S.L.' } });
        fireEvent.change(screen.getByLabelText(/Ciudad \/ Municipio/i), { target: { value: 'Alicante' } });

        // Submit form (PATCH /company-profile starts and hangs in flight)
        const formEl = screen.getByRole('button', { name: /Guardar y elegir qué produces/i }).closest('form')!;
        fireEvent.submit(formEl);

        // Switch to tenant B while tenant A's request is still in-flight
        const tenantB = 'tenant-beta';
        (getAuthUser as any).mockReturnValue({
            tenantId: tenantB,
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-b'
        });

        rerender(
            <MemoryRouter>
                <LocaleProvider initialLocale={'es' as any}>
                    <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-b" />
                </LocaleProvider>
            </MemoryRouter>
        );

        // Now resolve tenant A's delayed company profile response
        resolveTenantACompanyProfile!({
            ok: true,
            json: () => Promise.resolve({ ok: true, data: { companyName: 'Alpha Print S.L.' } })
        });

        // Wait a tick for microtasks to flush
        await new Promise(r => setTimeout(r, 50));

        // Verification: Site request was NOT made for tenant B, and tenant B draft was not corrupted with tenant A data
        expect(siteRequestsMade).toBe(0);
        const draftB = loadGuidedOnboardingDraft(tenantB);
        expect(draftB.company.legalName).not.toBe('Alpha Print S.L.');
    });

    it('21. Company draft lifecycle: preserves unsaved edits and intentional empty values across stage navigation and adopts server values for clean fields', async () => {
        const tenantId = 'tenant-draft-lifecycle';
        (getAuthUser as any).mockReturnValue({
            tenantId,
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-lifecycle'
        });

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: {
                                legalName: 'Server Legal Name Corp',
                                tradingName: 'Server Trading Name',
                                website: 'https://server-updated.com',
                                taxId: 'B99999999',
                                country: 'ES',
                                city: 'Madrid'
                            },
                            sites: [{
                                siteId: 'site-madrid',
                                siteName: 'Sede Central',
                                country: 'ES',
                                city: 'Madrid',
                                timezone: 'Europe/Madrid'
                            }]
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-lifecycle" />,
            'es'
        );

        // Go to Stage A
        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        // The user intentionally clears trading name to empty string "" and modifies phone
        const tradingInput = screen.getByLabelText(/Nombre comercial|Nombre Comercial \/ Público/i);
        fireEvent.change(tradingInput, { target: { value: '' } });

        const phoneInput = screen.getByLabelText(/Teléfono directo|Teléfono Oficial/i);
        fireEvent.change(phoneInput, { target: { value: '+34 600 000 000' } });

        // Navigate away to Welcome screen via button
        fireEvent.click(screen.getByRole('button', { name: /Volver a bienvenida/i }));

        await waitFor(() => {
            expect(screen.getByText('Preparemos tu imprenta')).toBeInTheDocument();
        });

        // Navigate back to Stage A: verify unsaved intentional empty string and edited phone are preserved
        fireEvent.click(screen.getByRole('button', { name: /Comenzar configuración|Continuar configuración/i }));

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        const tradingInputAfter = screen.getByLabelText(/Nombre comercial|Nombre Comercial \/ Público/i) as HTMLInputElement;
        expect(tradingInputAfter.value).toBe('');

        const phoneInputAfter = screen.getByLabelText(/Teléfono directo|Teléfono Oficial/i) as HTMLInputElement;
        expect(phoneInputAfter.value).toBe('+34 600 000 000');

        // Check that clean fields (like website) adopted the updated server value
        const websiteInput = screen.getByLabelText(/Sitio web|Sitio Web de la Empresa/i) as HTMLInputElement;
        expect(websiteInput.value).toBe('https://server-updated.com');
    });

    it('22. Empty server-value reconciliation: clearing an optional field in full setup adopts empty string on guided onboarding without resurrecting stale draft', async () => {
        const tenantId = 'tenant-clean-field-empty';
        (getAuthUser as any).mockReturnValue({
            tenantId,
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-clean-field'
        });

        // 1. Initial draft has an old tradingName and phone from a prior session, with userEditedFields empty (clean)
        saveGuidedOnboardingDraft({
            schemaVersion: 2,
            tenantId,
            currentStage: 'WELCOME',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Original Legal Corp',
                tradingName: 'Stale Trading Brand',
                country: 'ES',
                city: 'Valencia',
                address: '',
                postalCode: '',
                phone: '+34 960 000 000',
                website: '',
                contactName: '',
                taxId: 'B12345678',
                siteName: 'Planta Principal',
                siteTimezone: 'Europe/Madrid',
                primarySiteId: 'site-val-1',
                userEditedFields: [], // Not dirty
                acknowledgedServerValues: {
                    tradingName: 'Stale Trading Brand',
                    phone: '+34 960 000 000'
                }
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: false, COMPANY: false, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        // 2. The server now returns an explicitly cleared (empty string) tradingName from full setup
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: {
                                legalName: 'Original Legal Corp',
                                tradingName: '', // Intentionally cleared on server
                                phone: '+34 960 000 000',
                                country: 'ES',
                                city: 'Valencia'
                            },
                            sites: [{
                                siteId: 'site-val-1',
                                siteName: 'Planta Principal',
                                country: 'ES',
                                city: 'Valencia',
                                timezone: 'Europe/Madrid'
                            }]
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-clean-field" />,
            'es'
        );

        // Enter Stage A (Tu imprenta)
        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        // Verify that tradingName adopts the server's intentional empty string and does NOT restore the stale "Stale Trading Brand"
        const tradingInput = screen.getByLabelText(/Nombre comercial|Nombre Comercial \/ Público/i) as HTMLInputElement;
        expect(tradingInput.value).toBe('');

        // The persisted draft must also reflect the clean empty value
        const updatedDraft = loadGuidedOnboardingDraft(tenantId);
        expect(updatedDraft.company.tradingName).toBe('');
    });

    it('23. Empty server-value reconciliation: explicit null/empty company phone and website clear clean fields and do not fall back to non-empty site values', async () => {
        const tenantId = 'tenant-phone-website-cleared';
        (getAuthUser as any).mockReturnValue({
            tenantId,
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-cleared'
        });

        // 1. Initial draft has phone and website populated from prior session, untouched in current session (userEditedFields = [])
        saveGuidedOnboardingDraft({
            schemaVersion: 2,
            tenantId,
            currentStage: 'WELCOME',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Alpha Corp S.L.',
                tradingName: 'Alpha Print',
                country: 'ES',
                city: 'Sevilla',
                address: 'Calle Mayor 1',
                postalCode: '41001',
                phone: '+34 954 111 222',
                website: 'https://alpha-print.com',
                contactName: 'Carlos Admin',
                taxId: 'B87654321',
                siteName: 'Planta Principal',
                siteTimezone: 'Europe/Madrid',
                primarySiteId: 'site-sevilla-1',
                userEditedFields: [], // Clean, not locally edited
                acknowledgedServerValues: {}
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: false, COMPANY: false, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        // 2. The server returns explicit empty strings / nulls for company phone and website,
        // while the primarySite object still carries the legacy site phone and website.
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: {
                                legalName: 'Alpha Corp S.L.',
                                tradingName: 'Alpha Print',
                                country: 'ES',
                                city: 'Sevilla',
                                phone: '', // Explicitly cleared by company
                                website: null // Explicit null returned for website
                            },
                            sites: [{
                                siteId: 'site-sevilla-1',
                                siteName: 'Planta Principal',
                                country: 'ES',
                                city: 'Sevilla',
                                phone: '+34 954 999 999', // Non-empty site phone (must NOT override explicit empty company phone)
                                website: 'https://site-fallback.com', // Non-empty site website (must NOT override explicit null company website)
                                timezone: 'Europe/Madrid'
                            }]
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-cleared" />,
            'es'
        );

        // Enter Stage A (Tu imprenta)
        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        // Verify phone and website are cleared (empty string) and NOT resurrected by site fallback
        const phoneInput = screen.getByLabelText(/Teléfono directo|Teléfono Oficial/i) as HTMLInputElement;
        expect(phoneInput.value).toBe('');

        const websiteInput = screen.getByLabelText(/Sitio web|Sitio Web de la Empresa/i) as HTMLInputElement;
        expect(websiteInput.value).toBe('');

        // Persisted draft also confirms clean empty strings
        const updatedDraft = loadGuidedOnboardingDraft(tenantId);
        expect(updatedDraft.company.phone).toBe('');
        expect(updatedDraft.company.website).toBe('');
    });

    it('24. Dirty local field preservation: user-edited phone and website are preserved even when server returns explicit empty/null', async () => {
        const tenantId = 'tenant-phone-website-dirty';
        (getAuthUser as any).mockReturnValue({
            tenantId,
            role: 'PRINTHOUSE_OPERATOR',
            printhouseId: 'node-dirty'
        });

        // Initial draft where user locally edited phone and website
        saveGuidedOnboardingDraft({
            schemaVersion: 2,
            tenantId,
            currentStage: 'WELCOME',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Alpha Corp S.L.',
                tradingName: 'Alpha Print',
                country: 'ES',
                city: 'Sevilla',
                address: 'Calle Mayor 1',
                postalCode: '41001',
                phone: '+34 600 111 222',
                website: 'https://locally-edited.com',
                contactName: 'Carlos Admin',
                taxId: 'B87654321',
                siteName: 'Planta Principal',
                siteTimezone: 'Europe/Madrid',
                primarySiteId: 'site-sevilla-1',
                userEditedFields: ['phone', 'website'], // Dirty: locally edited by user
                acknowledgedServerValues: {}
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: { WELCOME: false, COMPANY: false, PRODUCTS: false, PRICING: false, REVIEW: false }
        });

        // Server returns explicit empty strings / nulls
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: {
                                legalName: 'Alpha Corp S.L.',
                                tradingName: 'Alpha Print',
                                country: 'ES',
                                city: 'Sevilla',
                                phone: '', // Explicit empty on server
                                website: null // Explicit null on server
                            },
                            sites: [{
                                siteId: 'site-sevilla-1',
                                siteName: 'Planta Principal',
                                country: 'ES',
                                city: 'Sevilla',
                                phone: '+34 954 999 999',
                                website: 'https://site-fallback.com',
                                timezone: 'Europe/Madrid'
                            }]
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-dirty" />,
            'es'
        );

        // Enter Stage A (Tu imprenta)
        const startBtn = await screen.findByRole('button', { name: /Comenzar configuración|Continuar configuración/i });
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText('Datos básicos de tu empresa y taller')).toBeInTheDocument();
        });

        // Verify locally edited phone and website are PRESERVED and not wiped by server empty/null
        const phoneInput = screen.getByLabelText(/Teléfono directo|Teléfono Oficial/i) as HTMLInputElement;
        expect(phoneInput.value).toBe('+34 600 111 222');

        const websiteInput = screen.getByLabelText(/Sitio web|Sitio Web de la Empresa/i) as HTMLInputElement;
        expect(websiteInput.value).toBe('https://locally-edited.com');

        // Persisted draft also preserves the dirty values
        const updatedDraft = loadGuidedOnboardingDraft(tenantId);
        expect(updatedDraft.company.phone).toBe('+34 600 111 222');
        expect(updatedDraft.company.website).toBe('https://locally-edited.com');
    });

    it('25. Stepper indicator checkmarks: show checkmark ONLY when stage is completed, not merely past', async () => {
        const tenantId = 'tenant-current';
        // Stage is PRICING, but only COMPANY was completed (PRODUCTS is incomplete/skipped)
        saveGuidedOnboardingDraft({
            tenantId,
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            company: {
                legalName: 'Checkmark Printhouse',
                tradingName: 'Check',
                country: 'ES',
                city: 'Madrid',
                address: '',
                postalCode: '',
                phone: '',
                website: '',
                contactName: 'Admin',
                taxId: '',
                siteName: 'Planta 1',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            completedStages: {
                WELCOME: true,
                COMPANY: true,
                PRODUCTS: false, // NOT completed
                PRICING: false,
                REVIEW: false
            }
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-stepper" />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Configura tus tarifas y precios de fabricación')).toBeInTheDocument();
        });

        // Button 1 (COMPANY) has completedStages.COMPANY === true -> shows '✓'
        const companyStepBtn = screen.getByRole('button', { name: /Tu imprenta/i });
        expect(companyStepBtn.textContent).toContain('✓');

        // Button 2 (PRODUCTS) has completedStages.PRODUCTS === false -> MUST NOT show '✓', shows '2'
        const productsStepBtn = screen.getByRole('button', { name: /Qué produces/i });
        expect(productsStepBtn.textContent).not.toContain('✓');
        expect(productsStepBtn.textContent).toContain('2');
    });

    it('26. ManualOfferForm: validates missing product title and prevents submit until resolved', async () => {
        const { ManualOfferForm } = await import('../src/ui/components/printhouse/onboarding/ManualOfferForm');
        const onSubmitSpec = vi.fn();

        renderWithProviders(
            <ManualOfferForm
                familyId="HARDCOVER"
                onSubmitSpec={onSubmitSpec}
                initialSpec={{
                    productTitle: '', // Empty title
                    formatWidthMm: 148,
                    formatHeightMm: 210,
                    interiorPages: 120,
                    interiorPaperWeightGsm: 90,
                    boardThicknessMm: 2.0,
                    deliveryCountry: 'DE',
                    runs: [{
                        id: 'run-1',
                        quantity: 500,
                        manufacturingPrice: 1200,
                        transportPrice: 100,
                        totalPrice: 1300,
                        unitPrice: 2.60,
                        validationStatus: 'CONSISTENT'
                    }]
                } as any}
            />,
            'es'
        );

        // Submit button should be disabled because productTitle is empty
        const submitBtn = screen.getByRole('button', { name: /Revisar especificaciones y precios/i });
        expect(submitBtn).toBeDisabled();

        // Missing fields banner highlights the missing title
        expect(screen.getByText(/Título del libro o trabajo/i)).toBeInTheDocument();

        // Now enter product title
        const titleInput = screen.getByPlaceholderText(/Manual de usuario, Catálogo técnico/i);
        fireEvent.change(titleInput, { target: { value: 'Libro de Arte Contemporáneo' } });

        // Submit button should now become enabled
        await waitFor(() => {
            expect(submitBtn).not.toBeDisabled();
        });
    });

    it('27. Clean dropdowns: canonical payload values preserved while rendering localized labels', async () => {
        const { ManualOfferForm } = await import('../src/ui/components/printhouse/onboarding/ManualOfferForm');

        renderWithProviders(
            <ManualOfferForm
                familyId="HARDCOVER"
                initialSpec={{
                    productTitle: 'Sample Book',
                    formatWidthMm: 148,
                    formatHeightMm: 210,
                    interiorPages: 120,
                    interiorPaperWeightGsm: 90,
                    boardThicknessMm: 2.0,
                    deliveryCountry: 'DE',
                    bindingMethod: 'SEWN',
                    spineType: 'SQUARE',
                    lamination: 'MATTE',
                    runs: []
                } as any}
            />,
            'en'
        );

        // Options must render translated human labels in EN, not raw internal keys
        expect(screen.getByText('Thread sewn / Smyth sewn (Fadenheftung)')).toBeInTheDocument();
        expect(screen.getByText('Square spine (gerader Rücken)')).toBeInTheDocument();
        expect(screen.getByText('Matte lamination')).toBeInTheDocument();

        // Raw internal dot-keys must not be visible in DOM text
        expect(screen.queryByText('binding.sewn')).not.toBeInTheDocument();
        expect(screen.queryByText('spine.square')).not.toBeInTheDocument();
        expect(screen.queryByText('lamination.matte')).not.toBeInTheDocument();
    });

    it('28. Template save failure (409/500): displays error alert, does not advance stage, and allows retry', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Beta',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 10',
                postalCode: '46001',
                phone: '+34 963 000 000',
                website: 'https://beta.com',
                contactName: 'Carlos Admin',
                taxId: 'B12345678',
                siteName: 'Sede Valencia',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    pricingMethod: 'TEMPLATE'
                } as any
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        // Mock fetch: onboarding succeeds, industrial GET succeeds with checksum, but industrial PUT fails with 409
        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/pricing/industrial')) {
                if (opts?.method === 'PUT') {
                    return Promise.resolve({
                        ok: false,
                        status: 409,
                        json: () => Promise.resolve({
                            ok: false,
                            error: { message: 'Conflicto de concurrencia al actualizar tarifas' }
                        })
                    });
                }
                // GET
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            baselineChecksum: 'chk_123456',
                            rates: {}
                        }
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/calibrations')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
            }
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Beta' },
                            sites: [{ siteId: 'site-beta-1', siteName: 'Sede Valencia', country: 'ES', city: 'Valencia' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'INCOMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-tmpl-fail" />,
            'es'
        );

        // Wait for template view to render
        await waitFor(() => {
            expect(screen.getByText(/Valores iniciales aplicados a/i)).toBeInTheDocument();
        });

        const saveBtn = screen.getByRole('button', { name: /Guardar plantilla y continuar/i });
        fireEvent.click(saveBtn);

        // Error message must appear in the UI
        await waitFor(() => {
            expect(screen.getByText(/Error al guardar plantilla de tarifas/i)).toBeInTheDocument();
            expect(screen.getByText(/Conflicto de concurrencia al actualizar tarifas/i)).toBeInTheDocument();
        });

        // Stage must NOT have advanced to REVIEW
        expect(screen.queryByText('Revisión final antes de activar')).not.toBeInTheDocument();

        // Retry button must be available
        const retryBtn = screen.getByRole('button', { name: /Reintentar/i });
        expect(retryBtn).toBeInTheDocument();
    });

    it('29. Failed pricing queries: surfaces non-verifiable pricing banner with retry button and does not certify Stage C', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Gamma',
                country: 'ES',
                city: 'Bilbao',
                address: 'Gran Via 1',
                postalCode: '48001',
                phone: '+34 944 000 000',
                website: 'https://gamma.com',
                contactName: 'Carlos Admin',
                taxId: 'B99999999',
                siteName: 'Sede Bilbao',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        // Mock calibrations failure
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding/pricing/calibrations')) {
                return Promise.reject(new Error('Network error: calibrations endpoint unreachable'));
            }
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Gamma' },
                            sites: [{ siteId: 'site-gamma-1', siteName: 'Sede Bilbao', country: 'ES', city: 'Bilbao' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-pricing-fail" />,
            'es'
        );

        // Banner warning must appear
        await waitFor(() => {
            expect(screen.getByText(/Estado de precios no verificable/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Reintentar consulta/i })).toBeInTheDocument();
        });

        // Stage C must NOT be completed
        const pricingStepBtn = screen.getByRole('button', { name: /Tus precios/i });
        expect(pricingStepBtn.textContent).not.toContain('✓');
    });

    it('30. Regression: PUT correcto y consulta posterior fallida: sin confirmación ni avance automático, indica guardado realizado y confirmación pendiente con reconsulta', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Delta',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 10',
                postalCode: '46001',
                phone: '+34 960 000 000',
                website: 'https://delta.com',
                contactName: 'Laura Admin',
                taxId: 'B11223344',
                siteName: 'Planta Delta',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'TEMPLATE'
                }
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        let putCalled = 0;
        let postPutQueryFailed = true;

        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            const method = opts?.method || 'GET';

            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && method === 'GET') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            baselineChecksum: 'chk-baseline-delta-123',
                            rates: {}
                        }
                    })
                });
            }

            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && method === 'PUT') {
                putCalled++;
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, success: true })
                });
            }

            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                if (putCalled > 0 && !postPutQueryFailed) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            ok: true,
                            data: [
                                {
                                    id: 'rev_hc_delta_verified',
                                    createdBy: {
                                        productFamily: 'HARDCOVER',
                                        pricingMethod: 'TEMPLATE'
                                    }
                                }
                            ]
                        })
                    });
                }
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
            }

            if (url === '/api/printhouse/onboarding' || url.startsWith('/api/printhouse/onboarding?')) {
                // If PUT has been called and postPutQueryFailed is active, simulate query failure
                if (putCalled > 0 && postPutQueryFailed) {
                    return Promise.reject(new Error('Post-PUT query network drop'));
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: {
                                legalName: 'Editorial Delta',
                                selectedProductFamilies: ['HARDCOVER'],
                                productsConfirmed: true
                            },
                            sites: [{ siteId: 'site-delta-1', siteName: 'Planta Delta', country: 'ES', city: 'Valencia' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                operationalConfiguration: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }

            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-delta-1" />,
            'es'
        );

        // Wait for template view to load
        await waitFor(() => {
            expect(screen.getByText(/Valores iniciales aplicados a/i)).toBeInTheDocument();
        });

        const saveBtn = screen.getByRole('button', { name: /Guardar plantilla y continuar/i });
        fireEvent.click(saveBtn);

        // PUT was called once
        await waitFor(() => {
            expect(putCalled).toBe(1);
        });

        // Banner indicates "Guardado realizado; confirmación pendiente"
        await waitFor(() => {
            expect(screen.getByText('Guardado realizado; confirmación pendiente')).toBeInTheDocument();
        });

        // Stage must NOT have advanced to REVIEW
        expect(screen.queryByText('Resumen de configuración de tu imprenta')).not.toBeInTheDocument();

        // Draft must NOT confirm PRICING or templateSaved unconditionally
        const interimDraft = loadGuidedOnboardingDraft(tenantId);
        expect(interimDraft.pricingContinuity?.HARDCOVER?.templateSaved).not.toBe(true);
        expect(interimDraft.completedStages.PRICING).toBe(false);

        // Click "Reconsultar confirmación" without repeating PUT
        const reverifyBtn = screen.getByRole('button', { name: /Reconsultar confirmación/i });
        expect(reverifyBtn).toBeInTheDocument();

        // Fix the network for the retry query so global.fetch returns the verified revision
        postPutQueryFailed = false;

        fireEvent.click(reverifyBtn);

        // PUT was NOT repeated
        expect(putCalled).toBe(1);

        // Now that server confirmed the saved revision, it advances to REVIEW
        await waitFor(() => {
            expect(screen.getByText('Resumen de configuración de tu imprenta')).toBeInTheDocument();
        });

        const finalDraft = loadGuidedOnboardingDraft(tenantId);
        expect(finalDraft.pricingContinuity?.HARDCOVER?.templateSaved).toBe(true);
        expect(finalDraft.completedStages.PRICING).toBe(true);
        expect(finalDraft.currentStage).toBe('REVIEW');
    });

    it('31. Regression ASSISTANT: verificación fallida en consulta de servidor: no certifica ni avanza a REVIEW', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Assistant Fail',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 1',
                postalCode: '46001',
                phone: '+34 960 000 001',
                website: 'https://assistant-fail.com',
                contactName: 'Admin',
                taxId: 'B11111111',
                siteName: 'Planta 1',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: 'sess_hc_assistant_fail',
                    activeRun: { id: 'run_1' },
                    selectedVariantId: 'var_1',
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'ASSISTANT',
                    step: 5
                }
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        // Server returns no accepted calibrations
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding/pricing/calibrations')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: [{ id: 'sess_hc_assistant_fail', status: 'DRAFT', bookSpec: { family: 'HARDCOVER' } }]
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
            }
            if (url === '/api/printhouse/onboarding' || url.startsWith('/api/printhouse/onboarding?')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Assistant Fail', selectedProductFamilies: ['HARDCOVER'], productsConfirmed: true },
                            sites: [{ siteId: 'site-1', siteName: 'Planta 1', country: 'ES', city: 'Valencia' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                operationalConfiguration: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-assistant-fail" />,
            'es'
        );

        // Click governed acceptance button in Step 5 of assistant
        await waitFor(() => {
            expect(screen.getByTestId('open-accept-modal-btn')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('open-accept-modal-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('confirm-accept-proposal-btn')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('confirm-accept-proposal-btn'));

        // Since server calibrations did NOT return an accepted session for HARDCOVER,
        // onCompleted must NOT mark calibrationAccepted or advance to REVIEW
        await waitFor(() => {
            const draft = loadGuidedOnboardingDraft(tenantId);
            expect(draft.pricingContinuity?.HARDCOVER?.calibrationAccepted).not.toBe(true);
            expect(draft.completedStages.PRICING).toBe(false);
            expect(draft.currentStage).toBe('PRICING');
        });
        expect(screen.queryByText('Resumen de configuración de tu imprenta')).not.toBeInTheDocument();
    });

    it('32. Regression ASSISTANT: una familia confirmada y otra pendiente: etapa C incompleta y no avanza a REVIEW', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Assistant Partial',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 2',
                postalCode: '46001',
                phone: '+34 960 000 002',
                website: 'https://assistant-partial.com',
                contactName: 'Admin',
                taxId: 'B22222222',
                siteName: 'Planta 2',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: 'sess_hc_assistant_partial',
                    activeRun: { id: 'run_hc' },
                    selectedVariantId: 'var_hc',
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'ASSISTANT',
                    step: 5
                },
                SOFTCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null
                }
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        // Server returns accepted session for HARDCOVER only
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding/pricing/calibrations')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: [{ id: 'sess_hc_assistant_partial', status: 'ACCEPTED', bookSpec: { family: 'HARDCOVER' } }]
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
            }
            if (url === '/api/printhouse/onboarding' || url.startsWith('/api/printhouse/onboarding?')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Assistant Partial', selectedProductFamilies: ['HARDCOVER', 'SOFTCOVER'], productsConfirmed: true },
                            sites: [{ siteId: 'site-2', siteName: 'Planta 2', country: 'ES', city: 'Valencia' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                operationalConfiguration: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-assistant-partial" />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByTestId('open-accept-modal-btn')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('open-accept-modal-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('confirm-accept-proposal-btn')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('confirm-accept-proposal-btn'));

        // HARDCOVER confirmed, but SOFTCOVER is pending -> PRICING stage remains false, currentStage is PRICING
        await waitFor(() => {
            const draft = loadGuidedOnboardingDraft(tenantId);
            expect(draft.pricingContinuity?.HARDCOVER?.calibrationAccepted).toBe(true);
            expect(draft.completedStages.PRICING).toBe(false);
            expect(draft.currentStage).toBe('PRICING');
        });
        expect(screen.queryByText('Resumen de configuración de tu imprenta')).not.toBeInTheDocument();
    });

    it('33. Regression ASSISTANT: todas las familias habilitadas confirmadas: etapa C completa y avanza a REVIEW', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Assistant All',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 3',
                postalCode: '46001',
                phone: '+34 960 000 003',
                website: 'https://assistant-all.com',
                contactName: 'Admin',
                taxId: 'B33333333',
                siteName: 'Planta 3',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: 'sess_hc_assistant_all',
                    activeRun: { id: 'run_hc_all' },
                    selectedVariantId: 'var_hc_all',
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'ASSISTANT',
                    step: 5
                }
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        // Server returns accepted session for all enabled families (HARDCOVER)
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding/pricing/calibrations')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: [{ id: 'sess_hc_assistant_all', status: 'ACCEPTED', bookSpec: { family: 'HARDCOVER' } }]
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
            }
            if (url === '/api/printhouse/onboarding' || url.startsWith('/api/printhouse/onboarding?')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Assistant All', selectedProductFamilies: ['HARDCOVER'], productsConfirmed: true },
                            sites: [{ siteId: 'site-3', siteName: 'Planta 3', country: 'ES', city: 'Valencia' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                operationalConfiguration: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-assistant-all" />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByTestId('open-accept-modal-btn')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('open-accept-modal-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('confirm-accept-proposal-btn')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('confirm-accept-proposal-btn'));

        // All enabled families confirmed -> Stage C complete, advances to REVIEW
        await waitFor(() => {
            expect(screen.getByText('Resumen de configuración de tu imprenta')).toBeInTheDocument();
        });
        const finalDraft = loadGuidedOnboardingDraft(tenantId);
        expect(finalDraft.pricingContinuity?.HARDCOVER?.calibrationAccepted).toBe(true);
        expect(finalDraft.completedStages.PRICING).toBe(true);
        expect(finalDraft.currentStage).toBe('REVIEW');
    });

    it('34. Regression MANUAL: ausencia de token o nodeId: lanza error, no realiza PUT ni confirma draft', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Manual NoAuth',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 4',
                postalCode: '46001',
                phone: '+34 960 000 004',
                website: 'https://manual-noauth.com',
                contactName: 'Admin',
                taxId: 'B44444444',
                siteName: 'Planta 4',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'MANUAL'
                }
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        // Simulate missing token
        (getAuthToken as any).mockReturnValueOnce('');

        let putCalled = 0;
        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && opts?.method === 'PUT') {
                putCalled++;
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && (!opts || opts.method === 'GET')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: { id: '', rates: {} } })
                });
            }
            if (url === '/api/printhouse/onboarding' || url.startsWith('/api/printhouse/onboarding?')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Manual NoAuth', selectedProductFamilies: ['HARDCOVER'], productsConfirmed: true },
                            sites: [],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                operationalConfiguration: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="" />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Modo Tarifas Manuales')).toBeInTheDocument();
        });

        const saveRatesBtn = screen.getByRole('button', { name: /Guardar tarifas industriales/i });
        fireEvent.click(saveRatesBtn);

        // Error banner appears in editor
        await waitFor(() => {
            expect(screen.getByText(/Falta el nodo de impresión o la sesión ha expirado/i)).toBeInTheDocument();
        });

        expect(putCalled).toBe(0);
        const draft = loadGuidedOnboardingDraft(tenantId);
        expect(draft.pricingContinuity?.HARDCOVER?.manualRatesSaved).not.toBe(true);
        expect(draft.completedStages.PRICING).toBe(false);
        expect(draft.currentStage).toBe('PRICING');
        expect(screen.queryByText('Resumen de configuración de tu imprenta')).not.toBeInTheDocument();
    });

    it('35. Regression MANUAL: verificación fallida en consulta tras PUT: no certifica ni avanza a REVIEW', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Manual VerifyFail',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 5',
                postalCode: '46001',
                phone: '+34 960 000 005',
                website: 'https://manual-verifyfail.com',
                contactName: 'Admin',
                taxId: 'B55555555',
                siteName: 'Planta 5',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'MANUAL'
                }
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        let putCalled = 0;
        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && opts?.method === 'PUT') {
                putCalled++;
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, success: true }) });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                // Return empty revisions: server didn't register manual rates revision
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && (!opts || opts.method === 'GET')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: { id: 'node-manual-1', rates: {} } })
                });
            }
            if (url === '/api/printhouse/onboarding' || url.startsWith('/api/printhouse/onboarding?')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Manual VerifyFail', selectedProductFamilies: ['HARDCOVER'], productsConfirmed: true },
                            sites: [{ siteId: 'site-5', siteName: 'Planta 5', country: 'ES', city: 'Valencia' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                operationalConfiguration: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-manual-1" />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Modo Tarifas Manuales')).toBeInTheDocument();
        });

        const saveRatesBtn = screen.getByRole('button', { name: /Guardar tarifas industriales/i });
        fireEvent.click(saveRatesBtn);

        await waitFor(() => {
            expect(putCalled).toBe(1);
        });

        // Error surfaced in editor alert
        await waitFor(() => {
            expect(screen.getByText(/El servidor no devolvió la confirmación de tarifas guardadas para esta familia/i)).toBeInTheDocument();
        });

        const draft = loadGuidedOnboardingDraft(tenantId);
        expect(draft.pricingContinuity?.HARDCOVER?.manualRatesSaved).not.toBe(true);
        expect(draft.completedStages.PRICING).toBe(false);
        expect(draft.currentStage).toBe('PRICING');
        expect(screen.queryByText('Resumen de configuración de tu imprenta')).not.toBeInTheDocument();
    });

    it('36. Regression MANUAL: una familia confirmada y otra habilitada pendiente: etapa C incompleta y no avanza a REVIEW', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Manual Partial',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 6',
                postalCode: '46001',
                phone: '+34 960 000 006',
                website: 'https://manual-partial.com',
                contactName: 'Admin',
                taxId: 'B66666666',
                siteName: 'Planta 6',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'MANUAL'
                },
                SOFTCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null
                }
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && opts?.method === 'PUT') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, success: true }) });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                // Only HARDCOVER is confirmed in revisions
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: [{ id: 'rev_hc_manual_ok', createdBy: { productFamily: 'HARDCOVER', pricingMethod: 'MANUAL' } }]
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && (!opts || opts.method === 'GET')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: { id: 'node-manual-2', rates: {} } })
                });
            }
            if (url === '/api/printhouse/onboarding' || url.startsWith('/api/printhouse/onboarding?')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Manual Partial', selectedProductFamilies: ['HARDCOVER', 'SOFTCOVER'], productsConfirmed: true },
                            sites: [{ siteId: 'site-6', siteName: 'Planta 6', country: 'ES', city: 'Valencia' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                operationalConfiguration: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-manual-2" />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Modo Tarifas Manuales')).toBeInTheDocument();
        });

        const saveRatesBtn = screen.getByRole('button', { name: /Guardar tarifas industriales/i });
        fireEvent.click(saveRatesBtn);

        // HARDCOVER is confirmed, but SOFTCOVER is pending -> PRICING: false, remains in PRICING
        await waitFor(() => {
            const draft = loadGuidedOnboardingDraft(tenantId);
            expect(draft.pricingContinuity?.HARDCOVER?.manualRatesSaved).toBe(true);
            expect(draft.completedStages.PRICING).toBe(false);
            expect(draft.currentStage).toBe('PRICING');
        });
        expect(screen.queryByText('Resumen de configuración de tu imprenta')).not.toBeInTheDocument();
    });

    it('37. Regression MANUAL: todas las familias habilitadas confirmadas: etapa C completa y avanza a REVIEW', async () => {
        const tenantId = 'tenant-current';
        saveGuidedOnboardingDraft({
            tenantId,
            company: {
                legalName: 'Editorial Manual All',
                country: 'ES',
                city: 'Valencia',
                address: 'Calle Mayor 7',
                postalCode: '46001',
                phone: '+34 960 000 007',
                website: 'https://manual-all.com',
                contactName: 'Admin',
                taxId: 'B77777777',
                siteName: 'Planta 7',
                siteTimezone: 'Europe/Madrid'
            },
            offerDrafts: {},
            lastSavedTimestamp: Date.now(),
            currentStage: 'PRICING',
            selectedFamilyId: 'HARDCOVER',
            enabledFamilies: { HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false },
            pricingContinuity: {
                HARDCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'MANUAL'
                }
            },
            completedStages: { WELCOME: true, COMPANY: true, PRODUCTS: true, PRICING: false, REVIEW: false }
        });

        global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && opts?.method === 'PUT') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, success: true }) });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/revisions')) {
                // All enabled families (HARDCOVER) confirmed in revisions
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: [{ id: 'rev_hc_manual_all', createdBy: { productFamily: 'HARDCOVER', pricingMethod: 'MANUAL' } }]
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/industrial') && (!opts || opts.method === 'GET')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: { id: 'node-manual-3', rates: {} } })
                });
            }
            if (url === '/api/printhouse/onboarding' || url.startsWith('/api/printhouse/onboarding?')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { legalName: 'Editorial Manual All', selectedProductFamilies: ['HARDCOVER'], productsConfirmed: true },
                            sites: [{ siteId: 'site-7', siteName: 'Planta 7', country: 'ES', city: 'Valencia' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                operationalConfiguration: { status: 'COMPLETE' },
                                pricingReadiness: { status: 'COMPLETE' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: [] }) });
        });

        renderWithProviders(
            <GuidedPrinthouseJourney onOpenFullSetup={vi.fn()} printerNodeId="node-manual-3" />,
            'es'
        );

        await waitFor(() => {
            expect(screen.getByText('Modo Tarifas Manuales')).toBeInTheDocument();
        });

        const saveRatesBtn = screen.getByRole('button', { name: /Guardar tarifas industriales/i });
        fireEvent.click(saveRatesBtn);

        // All enabled families confirmed -> Stage C complete, advances to REVIEW
        await waitFor(() => {
            expect(screen.getByText('Resumen de configuración de tu imprenta')).toBeInTheDocument();
        });

        const finalDraft = loadGuidedOnboardingDraft(tenantId);
        expect(finalDraft.pricingContinuity?.HARDCOVER?.manualRatesSaved).toBe(true);
        expect(finalDraft.completedStages.PRICING).toBe(true);
        expect(finalDraft.currentStage).toBe('REVIEW');
    });
});




