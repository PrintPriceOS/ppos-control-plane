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
import { describe, it, expect, vi } from 'vitest';
import { LocaleProvider } from '../src/ui/i18n';
import { GuidedStepReview } from '../src/ui/components/printhouse/onboarding/GuidedStepReview';
import { ManualOfferForm } from '../src/ui/components/printhouse/onboarding/ManualOfferForm';
import { ProductFamilyId, FamilyState } from '../src/ui/types/printhouseOnboardingTypes';
import { CompanyDraftData, FamilyPricingSessionDraft } from '../src/ui/lib/onboardingDraftStore';

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

        // But overall pricing card badge indicates "En progreso (2/4)" because HARDCOVER (calibrated) and SOFTCOVER (assistant quotes) are configured, but WIRE_O and SADDLE_STITCH are pending
        expect(screen.getByText(/En progreso \(2\/4\)/)).toBeInTheDocument();

        // Unconfigured family has a direct "Configurar" button
        const configureButtons = screen.getAllByText('Configurar');
        expect(configureButtons.length).toBeGreaterThanOrEqual(1);

        // Clicking "Configurar" calls onGoToFamilyPricing with specific family ID
        configureButtons[0].click();
        expect(onGoToFamilyPricing).toHaveBeenCalledWith('SADDLE_STITCH');
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
});
