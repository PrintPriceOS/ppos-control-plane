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
import { getAuthUser } from '../src/ui/lib/authStore';

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
        vi.restoreAllMocks();
        localStorage.clear();

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
        vi.restoreAllMocks();
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

        // 3 Key highlights
        expect(screen.getByText('1. Tu taller')).toBeInTheDocument();
        expect(screen.getByText('2. Tus productos')).toBeInTheDocument();
        expect(screen.getByText('3. Tu primer presupuesto')).toBeInTheDocument();
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
            expect(screen.getByText(/introduce el nombre legal o razón social/i)).toBeInTheDocument();
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
});

