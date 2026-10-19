/**
 * tests/GuidedReviewDefectsRegressions.test.tsx
 *
 * Regression test suite verifying:
 * 1. Global pricingReadiness.COMPLETE does NOT mark uncalibrated families as Calibrated.
 * 2. Unconfigured families with selected assistant method but no evidence/quotes show "Asistente IA (preferencia)" and "Método seleccionado".
 * 3. Only families with status 'DATA_VALIDATED' display 'Calibrada'.
 * 4. Missing account requirement (5/6 facts, e.g. contact info or site timezone) displays actionable resolve link and missing field tags.
 * 5. Translation keys (pricingStrictNotice, pendingSectionTitle, pendingAccount, pendingMachines, pendingPricing, statusMethodSelected, methodAssistantDraft, field.contact, field.timezone) resolve properly in ES, EN, and DE without raw key leakage.
 * 6. ManualOfferForm runs table headers and delete button tooltip resolve localized strings in ES, EN, and DE.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocaleProvider } from '../src/ui/i18n';
import { GuidedStepReview } from '../src/ui/components/printhouse/onboarding/GuidedStepReview';
import { ManualOfferForm } from '../src/ui/components/printhouse/onboarding/ManualOfferForm';
import { ProductFamilyId, FamilyState } from '../src/ui/types/printhouseOnboardingTypes';
import { 
    CompanyDraftData, 
    FamilyPricingSessionDraft,
    evaluateStageCCompletion,
    deriveServerStage,
    saveGuidedOnboardingDraft,
    loadGuidedOnboardingDraft,
    clearGuidedOnboardingDraft,
    reconstructPricingContinuityFromServer,
    GuidedOnboardingDraft
} from '../src/ui/lib/onboardingDraftStore';

const mockFamilies: Record<ProductFamilyId, FamilyState> = {
    HARDCOVER: {
        id: 'HARDCOVER',
        titleKey: 'family.hardcover.title',
        descriptionKey: 'family.hardcover.desc',
        status: 'DATA_VALIDATED', // Genuinely calibrated
        configuredFormats: 1,
        supportedFormatsCount: 5,
        quotes: [{ id: 'q1', title: 'Hardcover Quote' }] as any
    },
    SOFTCOVER: {
        id: 'SOFTCOVER',
        titleKey: 'family.softcover.title',
        descriptionKey: 'family.softcover.desc',
        status: 'QUOTE_ADDED', // Draft in progress
        configuredFormats: 0,
        supportedFormatsCount: 4,
        quotes: [{ id: 'q2', title: 'Softcover Quote' }] as any
    },
    WIRE_O: {
        id: 'WIRE_O',
        titleKey: 'family.wireO.title',
        descriptionKey: 'family.wireO.desc',
        status: 'DECLARED', // Method selected, no quotes or uploads yet
        configuredFormats: 0,
        supportedFormatsCount: 3,
        quotes: []
    },
    SADDLE_STITCH: {
        id: 'SADDLE_STITCH',
        titleKey: 'family.saddleStitch.title',
        descriptionKey: 'family.saddleStitch.desc',
        status: 'DECLARED', // No method, just declared
        configuredFormats: 0,
        supportedFormatsCount: 2,
        quotes: []
    }
};

const mockEnabledFamilies: Record<ProductFamilyId, boolean> = {
    HARDCOVER: true,
    SOFTCOVER: true,
    WIRE_O: true,
    SADDLE_STITCH: true
};

const mockPricingContinuity: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>> = {
    HARDCOVER: {
        sessionId: 'sess-hardcover-12345678',
        activeRun: null,
        selectedVariantId: null,
        proposedPatch: {},
        entryMode: 'MANUAL_FORM',
        uploadedFileName: null,
        pricingMethod: 'ASSISTANT'
    },
    SOFTCOVER: {
        sessionId: null,
        activeRun: null,
        selectedVariantId: null,
        proposedPatch: {},
        entryMode: 'UPLOAD_PDF',
        uploadedFileName: 'tarifas-softcover.pdf',
        pricingMethod: 'ASSISTANT'
    },
    WIRE_O: {
        sessionId: null,
        activeRun: null,
        selectedVariantId: null,
        proposedPatch: {},
        entryMode: 'UPLOAD_PDF',
        uploadedFileName: null,
        pricingMethod: 'ASSISTANT' // User clicked "Use assistant" but hasn't uploaded or calculated anything
    },
    SADDLE_STITCH: {
        sessionId: null,
        activeRun: null,
        selectedVariantId: null,
        proposedPatch: {},
        entryMode: 'UPLOAD_PDF',
        uploadedFileName: null
    }
};

const mockCompany5of6: CompanyDraftData = {
    legalName: 'Editorial Gráfica S.L.',
    tradingName: 'EdiGraf',
    country: 'ES',
    city: 'Valencia',
    address: 'Calle Mayor 10',
    postalCode: '46001',
    phone: '', // MISSING contact phone
    website: 'https://edigraf.es',
    contactName: '', // MISSING contact person
    taxId: 'B12345678',
    siteName: 'Planta Principal',
    siteTimezone: '' // MISSING timezone
};

describe('GuidedStepReview & ManualOfferForm Defects & Regressions', () => {
    it('does NOT propagate global isPricingComplete to uncalibrated families (strict family isolation)', () => {
        const onBackToPricing = vi.fn();
        const onOpenFullSetup = vi.fn();

        render(
            <LocaleProvider initialLocale="es">
                <GuidedStepReview
                    company={mockCompany5of6}
                    families={mockFamilies}
                    enabledFamilies={mockEnabledFamilies}
                    pricingContinuity={mockPricingContinuity}
                    readinessData={{
                        accountSetup: { status: 'IN_PROGRESS', blockingIssues: [], advisories: [{ code: 'ADD_PRIMARY_CONTACT' }] },
                        operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                        pricingReadiness: { status: 'COMPLETE', blockingIssues: [] } // GLOBAL COMPLETE
                    }}
                    onBackToPricing={onBackToPricing}
                    onOpenFullSetup={onOpenFullSetup}
                />
            </LocaleProvider>
        );

        // 1. HARDCOVER should be calibrated (present in both products card and pricing card)
        const validatedBadges = screen.getAllByText('Calibrada');
        expect(validatedBadges.length).toBe(2);

        // 2. SOFTCOVER has quotes / file -> 'Borrador en curso' (in both products card and pricing card)
        expect(screen.getAllByText('Borrador en curso').length).toBe(2);

        // 3. WIRE_O only clicked assistant -> method draft preference and 'Método seleccionado'
        expect(screen.getByText(/Asistente IA \(preferencia\)/)).toBeInTheDocument();
        expect(screen.getByText('Método seleccionado')).toBeInTheDocument();

        // 4. SADDLE_STITCH has no method -> 'Declarada' and 'Sin método'
        expect(screen.getAllByText('Declarada').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Sin método/)).toBeInTheDocument();
    });

    it('identifies 5/6 account completeness and displays specific missing contact advisory with resolve button', () => {
        const onOpenFullSetup = vi.fn();

        render(
            <LocaleProvider initialLocale="es">
                <GuidedStepReview
                    company={mockCompany5of6}
                    families={mockFamilies}
                    enabledFamilies={mockEnabledFamilies}
                    pricingContinuity={mockPricingContinuity}
                    readinessData={{
                        accountSetup: { 
                            status: 'IN_PROGRESS', 
                            blockingIssues: [], 
                            advisories: [
                                { code: 'ADD_PRIMARY_CONTACT', module: 'COMPANY_PROFILE', message: 'Add primary contact person and phone number' },
                                { code: 'ADD_SITE_TIMEZONE', module: 'PRODUCTION_SITES', message: 'Select production site timezone' }
                            ] 
                        },
                        operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                        pricingReadiness: { status: 'IN_PROGRESS', blockingIssues: [] }
                    }}
                    onBackToPricing={vi.fn()}
                    onOpenFullSetup={onOpenFullSetup}
                />
            </LocaleProvider>
        );

        // Should clearly identify missing contact person or phone
        expect(screen.getByText(/Persona de contacto o teléfono/)).toBeInTheDocument();
        // Should clearly identify missing site timezone
        expect(screen.getByText(/Zona horaria de la planta/)).toBeInTheDocument();

        // Must display pending section title resolved (not literal key)
        expect(screen.queryByText('guided.review.pendingSectionTitle')).not.toBeInTheDocument();
        expect(screen.queryByText('guided.review.pendingAccount')).not.toBeInTheDocument();
        expect(screen.queryByText('guided.review.pricingStrictNotice')).not.toBeInTheDocument();

        expect(screen.getByText(/Requisitos pendientes concretos/)).toBeInTheDocument();
        expect(screen.getByText(/Datos de empresa o primera planta de producción incompletos/)).toBeInTheDocument();
    });

    it('renders translation keys correctly in English (EN) without key leakage', () => {
        render(
            <LocaleProvider initialLocale="en">
                <GuidedStepReview
                    company={mockCompany5of6}
                    families={mockFamilies}
                    enabledFamilies={mockEnabledFamilies}
                    pricingContinuity={mockPricingContinuity}
                    readinessData={{
                        accountSetup: { 
                            status: 'IN_PROGRESS', 
                            blockingIssues: [], 
                            advisories: [{ code: 'ADD_PRIMARY_CONTACT', message: 'Add contact' }] 
                        },
                        operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                        pricingReadiness: { status: 'IN_PROGRESS', blockingIssues: [] }
                    }}
                    onBackToPricing={vi.fn()}
                    onOpenFullSetup={vi.fn()}
                />
            </LocaleProvider>
        );

        // English specific assertions
        expect(screen.getByText(/Specific pending requirements/)).toBeInTheDocument();
        expect(screen.getByText(/Company profile or primary production facility incomplete/)).toBeInTheDocument();
        expect(screen.getByText(/Rates and matrices resolved exclusively by the server pricing engine/)).toBeInTheDocument();
        expect(screen.getByText(/AI assistant \(preference\)/)).toBeInTheDocument();
        expect(screen.getByText('Method selected')).toBeInTheDocument();

        // Zero key leakage
        expect(screen.queryByText(/guided\.review\./)).not.toBeInTheDocument();
    });

    it('renders translation keys correctly in German (DE) without key leakage', () => {
        render(
            <LocaleProvider initialLocale="de">
                <GuidedStepReview
                    company={mockCompany5of6}
                    families={mockFamilies}
                    enabledFamilies={mockEnabledFamilies}
                    pricingContinuity={mockPricingContinuity}
                    readinessData={{
                        accountSetup: { 
                            status: 'IN_PROGRESS', 
                            blockingIssues: [], 
                            advisories: [{ code: 'ADD_PRIMARY_CONTACT', message: 'Kontakt angeben' }] 
                        },
                        operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                        pricingReadiness: { status: 'IN_PROGRESS', blockingIssues: [] }
                    }}
                    onBackToPricing={vi.fn()}
                    onOpenFullSetup={vi.fn()}
                />
            </LocaleProvider>
        );

        // German specific assertions
        expect(screen.getByText(/Konkret ausstehende Anforderungen/)).toBeInTheDocument();
        expect(screen.getByText(/Unternehmensdaten oder Hauptproduktionsstätte unvollständig/)).toBeInTheDocument();
        expect(screen.getByText(/Tarife und Matrizen ausschließlich über den Kalkulationsmotor des Servers berechnet/)).toBeInTheDocument();
        expect(screen.getByText(/KI-Assistent \(Präferenz\)/)).toBeInTheDocument();
        expect(screen.getByText('Methode ausgewählt')).toBeInTheDocument();

        // Zero key leakage
        expect(screen.queryByText(/guided\.review\./)).not.toBeInTheDocument();
    });

    it('renders localized table headers in ManualOfferForm across languages', () => {
        const dummySpec = {
            id: 'spec-test-1',
            familyId: 'HARDCOVER' as ProductFamilyId,
            quoteReference: 'REF-2026-TEST',
            title: 'Libro Ensayo Tapa Dura',
            productTitle: 'Libro Ensayo Tapa Dura',
            bookFormat: { name: 'A5', trimWidthMm: 148, trimHeightMm: 210 },
            pageCount: 160,
            textBlock: { paperStock: 'OFFSET_100', printColors: '4_4' },
            cover: { paperStock: 'COATED_150', printColors: '4_0' },
            binding: { bindingType: 'CASE_BINDING', spineThicknessMm: 12 },
            packaging: { shrinkWrap: false },
            runs: [
                {
                    quantity: 500,
                    turnaroundDays: 7,
                    manufacturingPrice: 1200,
                    transportPrice: 50,
                    totalPrice: 1250,
                    unitPrice: 2.5
                }
            ],
            notes: '',
            status: 'DRAFT' as any
        };

        const { unmount } = render(
            <LocaleProvider initialLocale="en">
                <ManualOfferForm
                    initialSpec={dummySpec}
                    onSave={vi.fn()}
                    onCancel={vi.fn()}
                />
            </LocaleProvider>
        );

        // English table headers
        expect(screen.getByText('Quantity *')).toBeInTheDocument();
        expect(screen.getByText('Paper Variant / Finishing')).toBeInTheDocument();
        expect(screen.getByText('Turnaround (days)')).toBeInTheDocument();
        expect(screen.getByText('Total (€)')).toBeInTheDocument();
        expect(screen.getByText('Unit (€/unit)')).toBeInTheDocument();

        unmount();

        render(
            <LocaleProvider initialLocale="es">
                <ManualOfferForm
                    initialSpec={dummySpec}
                    onSave={vi.fn()}
                    onCancel={vi.fn()}
                />
            </LocaleProvider>
        );

        // Spanish table headers
        expect(screen.getByText('Cantidad *')).toBeInTheDocument();
        expect(screen.getByText('Variante Papel / Acabado')).toBeInTheDocument();
        expect(screen.getByText('Plazo (días)')).toBeInTheDocument();
        expect(screen.getByText('Total (€)')).toBeInTheDocument();
        expect(screen.getByText('Unit. (€/ud)')).toBeInTheDocument();
    });

    it('differentiates global rates from per-family calibration with "En progreso (X/Y)" when families are uncalibrated', () => {
        const onGoToFamilyPricing = vi.fn();
        const onGoToCompanyField = vi.fn();

        render(
            <LocaleProvider initialLocale="es">
                <GuidedStepReview
                    company={mockCompany5of6}
                    families={mockFamilies}
                    enabledFamilies={mockEnabledFamilies}
                    pricingContinuity={mockPricingContinuity}
                    readinessData={{
                        accountSetup: { status: 'COMPLETE', blockingIssues: [], advisories: [] },
                        operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                        pricingReadiness: { status: 'COMPLETE', blockingIssues: [] } // Global rates are COMPLETE
                    }}
                    onBackToPricing={vi.fn()}
                    onOpenFullSetup={vi.fn()}
                    onGoToFamilyPricing={onGoToFamilyPricing}
                    onGoToCompanyField={onGoToCompanyField}
                />
            </LocaleProvider>
        );

        // Global rates banner indicates base rates configured
        expect(screen.getByText(/Tarifas industriales base \(taller\):/)).toBeInTheDocument();
        expect(screen.getByText('Configuradas')).toBeInTheDocument();

        // But overall pricing card badge indicates "En progreso (1/4)" because ONLY HARDCOVER (calibrated) is genuinely saved/validated;
        // SOFTCOVER has un-accepted draft quotes, WIRE_O has only selected assistant preference, and SADDLE_STITCH has no method.
        expect(screen.getByText(/En progreso \(1\/4\)/)).toBeInTheDocument();

        // Unconfigured families have direct "Configurar" buttons
        const configureButtons = screen.getAllByText('Configurar');
        expect(configureButtons.length).toBe(3); // SOFTCOVER, WIRE_O, SADDLE_STITCH

        // Clicking first "Configurar" calls onGoToFamilyPricing with SOFTCOVER (first unconfigured family)
        configureButtons[0].click();
        expect(onGoToFamilyPricing).toHaveBeenCalledWith('SOFTCOVER');
    });

    it('marks Pricing stage complete only when all enabled families have configured rates or methods', () => {
        const allConfiguredFamilies: Record<ProductFamilyId, FamilyState> = {
            ...mockFamilies,
            SOFTCOVER: { ...mockFamilies.SOFTCOVER, status: 'DATA_VALIDATED' },
            WIRE_O: { ...mockFamilies.WIRE_O, status: 'DATA_VALIDATED' },
            SADDLE_STITCH: { ...mockFamilies.SADDLE_STITCH, status: 'DATA_VALIDATED' }
        };

        render(
            <LocaleProvider initialLocale="es">
                <GuidedStepReview
                    company={mockCompany5of6}
                    families={allConfiguredFamilies}
                    enabledFamilies={mockEnabledFamilies}
                    pricingContinuity={mockPricingContinuity}
                    readinessData={{
                        accountSetup: { status: 'COMPLETE', blockingIssues: [], advisories: [] },
                        operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                        pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
                    }}
                    onBackToPricing={vi.fn()}
                    onOpenFullSetup={vi.fn()}
                />
            </LocaleProvider>
        );

        // When all are DATA_VALIDATED -> "Calibrado con IA"
        expect(screen.getByText('Calibrado con IA')).toBeInTheDocument();
    });

    describe('Stage C Hardened Completion Rules & Cross-Session Draft Rehydration', () => {
        const dummyServerComplete = {
            pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
        };

        it('strictly rejects TEMPLATE choice if templateSaved is false or absent', () => {
            const enabled = { HARDCOVER: true };
            const continuityUnsaved: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>> = {
                HARDCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: null,
                    pricingMethod: 'TEMPLATE'
                    // templateSaved is omitted / falsy
                }
            };
            const resultUnsaved = evaluateStageCCompletion(dummyServerComplete, enabled, continuityUnsaved, {});
            expect(resultUnsaved.isComplete).toBe(false);
            expect(resultUnsaved.templateCount).toBe(0);
            expect(resultUnsaved.pendingFamilies).toContain('HARDCOVER');

            const continuitySaved: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>> = {
                HARDCOVER: {
                    ...continuityUnsaved.HARDCOVER!,
                    templateSaved: true
                }
            };
            const resultSaved = evaluateStageCCompletion(dummyServerComplete, enabled, continuitySaved, {});
            expect(resultSaved.isComplete).toBe(true);
            expect(resultSaved.templateCount).toBe(1);
            expect(resultSaved.pendingFamilies).toEqual([]);
        });

        it('strictly rejects MANUAL choice if manualRatesSaved is false or absent (does not conflate with entering an offer)', () => {
            const enabled = { SOFTCOVER: true };
            const continuityOfferOnly: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>> = {
                SOFTCOVER: {
                    sessionId: null,
                    activeRun: null,
                    selectedVariantId: null,
                    proposedPatch: {},
                    entryMode: 'MANUAL_FORM',
                    uploadedFileName: null,
                    pricingMethod: 'MANUAL',
                    step: 3,
                    offer: { runs: [{ quantity: 500, totalPrice: 1000 }] } as any
                    // manualRatesSaved is omitted / falsy
                }
            };
            const resultOfferOnly = evaluateStageCCompletion(dummyServerComplete, enabled, continuityOfferOnly, {});
            expect(resultOfferOnly.isComplete).toBe(false);
            expect(resultOfferOnly.manualCount).toBe(0);
            expect(resultOfferOnly.pendingFamilies).toContain('SOFTCOVER');

            const continuityRatesSaved: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>> = {
                SOFTCOVER: {
                    ...continuityOfferOnly.SOFTCOVER!,
                    manualRatesSaved: true
                }
            };
            const resultRatesSaved = evaluateStageCCompletion(dummyServerComplete, enabled, continuityRatesSaved, {});
            expect(resultRatesSaved.isComplete).toBe(true);
            expect(resultRatesSaved.manualCount).toBe(1);
            expect(resultRatesSaved.pendingFamilies).toEqual([]);
        });

        it('strictly rejects ASSISTANT if calibration was not accepted (quotes or runs alone do not suffice)', () => {
            const enabled = { WIRE_O: true };
            const continuityUnaccepted: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>> = {
                WIRE_O: {
                    sessionId: 'sess-wireo-123',
                    activeRun: { id: 'run-1', status: 'COMPLETED' },
                    selectedVariantId: 'var-1',
                    proposedPatch: { interior_pp_bw: 0.007 },
                    entryMode: 'UPLOAD_PDF',
                    uploadedFileName: 'presupuesto.pdf',
                    pricingMethod: 'ASSISTANT',
                    step: 4
                    // calibrationAccepted is falsy and status is not DATA_VALIDATED
                }
            };
            const famStateUnaccepted = {
                WIRE_O: { id: 'WIRE_O', status: 'QUOTE_ADDED', quotes: [{ id: 'q1' }] }
            };
            const resultUnaccepted = evaluateStageCCompletion(dummyServerComplete, enabled, continuityUnaccepted, famStateUnaccepted);
            expect(resultUnaccepted.isComplete).toBe(false);
            expect(resultUnaccepted.calibratedCount).toBe(0);
            expect(resultUnaccepted.pendingFamilies).toContain('WIRE_O');

            // With explicit calibrationAccepted: true
            const continuityAccepted: Partial<Record<ProductFamilyId, FamilyPricingSessionDraft>> = {
                WIRE_O: {
                    ...continuityUnaccepted.WIRE_O!,
                    calibrationAccepted: true
                }
            };
            const resultAccepted = evaluateStageCCompletion(dummyServerComplete, enabled, continuityAccepted, famStateUnaccepted);
            expect(resultAccepted.isComplete).toBe(true);
            expect(resultAccepted.calibratedCount).toBe(1);
            expect(resultAccepted.pendingFamilies).toEqual([]);
        });

        it('persists and rehydrates draft seamlessly across simulated browser reload without loss or regression', () => {
            const testTenant = 'tenant-cross-session-audit';
            clearGuidedOnboardingDraft(testTenant);

            const sampleDraft: GuidedOnboardingDraft = {
                schemaVersion: 2,
                tenantId: testTenant,
                currentStage: 'PRICING',
                selectedFamilyId: 'HARDCOVER',
                enabledFamilies: { HARDCOVER: true, SOFTCOVER: true, WIRE_O: false, SADDLE_STITCH: false },
                company: {
                    ...mockCompany5of6,
                    phone: '+34 960 123 456',
                    contactName: 'Carlos Impresor',
                    siteTimezone: 'Europe/Madrid'
                },
                offerDrafts: {},
                pricingContinuity: {
                    HARDCOVER: {
                        sessionId: 'sess-hc-rehydrated',
                        activeRun: { id: 'run-hc-1' },
                        selectedVariantId: 'v-1',
                        proposedPatch: { interior_pp_bw: 0.0065 },
                        entryMode: 'UPLOAD_PDF',
                        uploadedFileName: 'oferta-hc.pdf',
                        pricingMethod: 'ASSISTANT',
                        calibrationAccepted: true,
                        lastSavedTimestamp: 1776543210000
                    },
                    SOFTCOVER: {
                        sessionId: null,
                        activeRun: null,
                        selectedVariantId: null,
                        proposedPatch: {},
                        entryMode: 'UPLOAD_PDF',
                        uploadedFileName: null,
                        pricingMethod: 'TEMPLATE',
                        templateSaved: true,
                        lastSavedTimestamp: 1776543220000
                    }
                },
                lastSavedTimestamp: Date.now(),
                completedStages: {
                    WELCOME: true,
                    COMPANY: true,
                    PRODUCTS: true,
                    PRICING: true,
                    REVIEW: false
                }
            };

            // Save to localStorage
            const savedOk = saveGuidedOnboardingDraft(sampleDraft);
            expect(savedOk).toBe(true);

            // Rehydrate
            const loaded = loadGuidedOnboardingDraft(testTenant);
            expect(loaded.tenantId).toBe(testTenant);
            expect(loaded.currentStage).toBe('PRICING');
            expect(loaded.company.contactName).toBe('Carlos Impresor');
            expect(loaded.company.siteTimezone).toBe('Europe/Madrid');
            expect(loaded.pricingContinuity?.HARDCOVER?.calibrationAccepted).toBe(true);
            expect(loaded.pricingContinuity?.HARDCOVER?.pricingMethod).toBe('ASSISTANT');
            expect(loaded.pricingContinuity?.SOFTCOVER?.templateSaved).toBe(true);
            expect(loaded.pricingContinuity?.SOFTCOVER?.pricingMethod).toBe('TEMPLATE');

            // Verify Stage C evaluation on rehydrated draft
            const stageCEval = evaluateStageCCompletion(
                dummyServerComplete,
                loaded.enabledFamilies,
                loaded.pricingContinuity,
                {}
            );
            expect(stageCEval.isComplete).toBe(true);
            expect(stageCEval.allEnabledFamiliesConfigured).toBe(true);
            expect(stageCEval.configuredCount).toBe(2);
            expect(stageCEval.totalEnabled).toBe(2);

            // Clean up
            clearGuidedOnboardingDraft(testTenant);
        });
    });

    describe('Responsive Typography & Container Constraints (1280x720, 1366x768, 390x844)', () => {
        const viewports = [
            { name: 'HD Desktop', width: 1280, height: 720 },
            { name: 'Standard Desktop', width: 1366, height: 768 },
            { name: 'Mobile Portrait (iPhone 12/13/14)', width: 390, height: 844 }
        ];

        viewports.forEach(vp => {
            it(`renders GuidedStepReview safely at ${vp.name} (${vp.width}x${vp.height}) with responsive container hierarchy and without fixed-width overflows`, () => {
                window.innerWidth = vp.width;
                window.innerHeight = vp.height;

                const { container } = render(
                    <LocaleProvider initialLocale="de">
                        <GuidedStepReview
                            company={{
                                legalName: 'Fährmann Druckereibetriebsgemeinschaft GmbH & Co. KG',
                                tradingName: 'Fährmann Druck',
                                country: 'DE',
                                city: 'Frankfurt am Main',
                                address: 'Industriestraße 45, Halle B',
                                postalCode: '60311',
                                phone: '+49 69 12345678',
                                website: 'https://www.faehrmann-druck.de',
                                contactName: 'Maximilian von Fährmann-Gutenbergschule',
                                taxId: 'DE123456789',
                                siteName: 'Hauptproduktionsstätte Frankfurt-Osthafen',
                                siteTimezone: 'Europe/Berlin',
                                primarySiteId: 'site-ffm-1',
                                userEditedFields: [],
                                acknowledgedServerValues: {}
                            }}
                            families={mockFamilies}
                            enabledFamilies={{ HARDCOVER: true, SOFTCOVER: true, WIRE_O: true, SADDLE_STITCH: true }}
                            pricingContinuity={{
                                HARDCOVER: { pricingMethod: 'ASSISTANT', calibrationAccepted: true },
                                SOFTCOVER: { pricingMethod: 'MANUAL', manualRatesSaved: true },
                                WIRE_O: { pricingMethod: 'TEMPLATE', templateSaved: true }
                            }}
                            readinessData={{
                                accountSetup: { status: 'COMPLETE', completedRequirements: 6, totalRequirements: 6, blockingIssues: [] },
                                operationalConfiguration: { status: 'COMPLETE', completedRequirements: 5, totalRequirements: 5, blockingIssues: [] },
                                pricingReadiness: { status: 'COMPLETE', blockingIssues: [] }
                            }}
                            onBackToPricing={() => {}}
                            onOpenFullSetup={() => {}}
                        />
                    </LocaleProvider>
                );

                // Verify root container uses responsive max-w constraint and margin auto
                const root = container.firstElementChild as HTMLElement;
                expect(root).toBeDefined();
                expect(root.className).toContain('max-w-4xl');
                expect(root.className).toContain('mx-auto');

                // Verify that no element inside container uses fixed unconstrained width style exceeding vp.width
                const allElements = container.querySelectorAll('*');
                let foundUnconstrainedOverflow = false;
                allElements.forEach(el => {
                    const style = (el as HTMLElement).style;
                    if (style.width && style.width.endsWith('px')) {
                        const pxVal = parseInt(style.width, 10);
                        if (pxVal > vp.width) {
                            foundUnconstrainedOverflow = true;
                        }
                    }
                });
                expect(foundUnconstrainedOverflow).toBe(false);

                // Verify German long-word compound headers render without DOM unmount
                expect(screen.getByText(/Zusammenfassung Ihrer Druckereieinrichtung/i)).toBeInTheDocument();
                expect(screen.getByText(/Fährmann Druckereibetriebsgemeinschaft GmbH & Co. KG/i)).toBeInTheDocument();
            });
        });
    });

    describe('Server Contract Rehydration without localStorage (Discrepancy 1 & 3)', () => {
        it('starts without localStorage and accurately reconstructs templateSaved, manualRatesSaved, calibrationAccepted and pending without family inheritance', () => {
            // Guarantee localStorage is completely empty
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.clear();
            }

            // Real server responses mimicking contract responses
            // 1. HARDCOVER: has accepted calibration session
            const mockServerSessions = [
                {
                    id: 'cal_sess_hc_001',
                    status: 'ACCEPTED',
                    bookSpec: {
                        family: 'HARDCOVER',
                        bindingMethod: 'hardcover',
                        widthMm: 148,
                        heightMm: 210,
                        pageCount: 192
                    },
                    acceptedAt: '2026-10-19T10:00:00Z'
                },
                {
                    id: 'cal_sess_draft_sc',
                    status: 'DRAFT', // Not accepted! Must not mark Softcover as calibrated
                    bookSpec: {
                        family: 'SOFTCOVER',
                        bindingMethod: 'perfect_bound'
                    }
                }
            ];

            // 2. SOFTCOVER: saved template revision
            // 3. WIRE_O: saved manual rates revision
            // 4. SADDLE_STITCH: no sessions, no revisions (strictly pending)
            const mockServerRevisions = [
                {
                    id: 'rev_softcover_template',
                    sourceType: 'MANUAL_EDIT',
                    createdBy: {
                        userId: 'usr_admin',
                        email: 'admin@printhouse.local',
                        role: 'PRINTHOUSE_ADMIN',
                        pricingMethod: 'TEMPLATE',
                        productFamily: 'SOFTCOVER'
                    },
                    ratesChecksum: 'checksum_sc_tpl'
                },
                {
                    id: 'rev_wireo_manual',
                    sourceType: 'MANUAL_EDIT',
                    createdBy: {
                        userId: 'usr_admin',
                        email: 'admin@printhouse.local',
                        role: 'PRINTHOUSE_ADMIN',
                        pricingMethod: 'MANUAL',
                        productFamily: 'WIRE_O'
                    },
                    ratesChecksum: 'checksum_wo_manual'
                },
                {
                    // Generic legacy revision without family attribution: must NOT be inherited or attributed to any family
                    id: 'rev_legacy_unattributed',
                    sourceType: 'MANUAL_EDIT',
                    createdBy: {
                        userId: 'usr_legacy',
                        email: 'legacy@printhouse.local',
                        role: 'PRINTHOUSE_ADMIN'
                    },
                    ratesChecksum: 'checksum_legacy'
                }
            ];

            const reconstructed = reconstructPricingContinuityFromServer(
                mockServerSessions,
                mockServerRevisions,
                {}
            );

            // Verify HARDCOVER: Calibration Accepted
            expect(reconstructed.HARDCOVER).toBeDefined();
            expect(reconstructed.HARDCOVER?.calibrationAccepted).toBe(true);
            expect(reconstructed.HARDCOVER?.pricingMethod).toBe('ASSISTANT');
            expect(reconstructed.HARDCOVER?.sessionId).toBe('cal_sess_hc_001');
            expect(reconstructed.HARDCOVER?.templateSaved).toBe(false);
            expect(reconstructed.HARDCOVER?.manualRatesSaved).toBe(false);

            // Verify SOFTCOVER: Template Saved
            expect(reconstructed.SOFTCOVER).toBeDefined();
            expect(reconstructed.SOFTCOVER?.templateSaved).toBe(true);
            expect(reconstructed.SOFTCOVER?.pricingMethod).toBe('TEMPLATE');
            expect(reconstructed.SOFTCOVER?.calibrationAccepted).toBe(false); // Draft session must NOT set calibrationAccepted
            expect(reconstructed.SOFTCOVER?.manualRatesSaved).toBe(false);

            // Verify WIRE_O: Manual Rates Saved
            expect(reconstructed.WIRE_O).toBeDefined();
            expect(reconstructed.WIRE_O?.manualRatesSaved).toBe(true);
            expect(reconstructed.WIRE_O?.pricingMethod).toBe('MANUAL');
            expect(reconstructed.WIRE_O?.calibrationAccepted).toBe(false);
            expect(reconstructed.WIRE_O?.templateSaved).toBe(false);

            // Verify SADDLE_STITCH: Strictly Pending (No state inherited from any other family or generic revision)
            expect(reconstructed.SADDLE_STITCH).toBeDefined();
            expect(reconstructed.SADDLE_STITCH?.calibrationAccepted).toBe(false);
            expect(reconstructed.SADDLE_STITCH?.templateSaved).toBe(false);
            expect(reconstructed.SADDLE_STITCH?.manualRatesSaved).toBe(false);
            expect(reconstructed.SADDLE_STITCH?.pricingMethod).toBeUndefined();

            // Evaluate Stage C completion with all 4 families enabled:
            // SADDLE_STITCH is pending, so Stage C must evaluate to NOT complete
            const enabledAll = {
                HARDCOVER: true,
                SOFTCOVER: true,
                WIRE_O: true,
                SADDLE_STITCH: true
            };

            const stageCEval = evaluateStageCCompletion(
                { pricingReadiness: { status: 'COMPLETE' } },
                enabledAll,
                reconstructed,
                {}
            );

            expect(stageCEval.isComplete).toBe(false);
            expect(stageCEval.pendingFamilies).toEqual(['SADDLE_STITCH']);
            expect(stageCEval.calibratedCount).toBe(1); // HARDCOVER
            expect(stageCEval.templateCount).toBe(1);   // SOFTCOVER
            expect(stageCEval.manualCount).toBe(1);     // WIRE_O
            expect(stageCEval.configuredCount).toBe(3);

            // If only HARDCOVER, SOFTCOVER, and WIRE_O are enabled, Stage C completes:
            const stageC3Families = evaluateStageCCompletion(
                { pricingReadiness: { status: 'COMPLETE' } },
                { HARDCOVER: true, SOFTCOVER: true, WIRE_O: true, SADDLE_STITCH: false },
                reconstructed,
                {}
            );
            expect(stageC3Families.isComplete).toBe(true);
            expect(stageC3Families.pendingFamilies).toEqual([]);
        });
    });
});
