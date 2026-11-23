import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { canonicalizeToEngineBookSpec, formatCanonicalizerErrors } from '../src/ui/lib/bookSpecCanonicalizer';
import { CalculationComparisonView } from '../src/ui/components/printhouse/onboarding/CalculationComparisonView';
import { VariantSpecTable } from '../src/ui/components/printhouse/onboarding/VariantSpecTable';
import { GuidedStepReview } from '../src/ui/components/printhouse/onboarding/GuidedStepReview';
import { GuidedStepProducts } from '../src/ui/components/printhouse/onboarding/GuidedStepProducts';

describe('Onboarding Step 3 & Step 4 UX Fixes (Trilingual DE / EN / ES)', () => {
    const offerMissingLamination = {
        family: 'HARDCOVER' as const,
        interiorPages: 128,
        formatWidthMm: 170,
        formatHeightMm: 240,
        interiorColors: '4/4',
        coverColors: '4/0',
        interiorPaper: 'Offset',
        interiorWeightGsm: 90,
        coverPaper: 'Artboard',
        coverWeightGsm: 300,
        bindingMethod: 'hardcover',
        deliveryCountry: 'DE',
        lamination: undefined,
        runs: [{ id: 'r1', quantity: 1000, manufacturingPrice: 1850, unitPrice: 1.85 }]
    };

    it('1. Detects missing lamination in missingFields and localizes errors cleanly in DE, EN, and ES', () => {
        const res = canonicalizeToEngineBookSpec(offerMissingLamination as any, offerMissingLamination.runs[0] as any);
        expect(res.valid).toBe(false);
        expect(res.missingFields).toContain('lamination');

        const deErr = formatCanonicalizerErrors(res.errors, 'de');
        expect(deErr).toContain('Laminierung');
        expect(deErr).not.toContain('Especificación');
        expect(deErr).not.toContain('must be explicitly specified');

        const enErr = formatCanonicalizerErrors(res.errors, 'en');
        expect(enErr).toContain('Cover lamination');
        expect(enErr).not.toContain('Especificación');

        const esErr = formatCanonicalizerErrors(res.errors, 'es');
        expect(esErr).toContain('laminado');
        expect(esErr).not.toContain('must be explicitly specified');
    });

    it('2. CalculationComparisonView renders inline lamination quick-fix in DE and triggers Apply & Recalculate', () => {
        window.localStorage.setItem('ppos_locale', 'de');
        const onQuickFixSpec = vi.fn();
        const onBackToReview = vi.fn();

        render(
            <LocaleProvider>
                <CalculationComparisonView
                    spec={offerMissingLamination}
                    originalPrice={1850}
                    enginePrice={null}
                    isCalculated={false}
                    calculationError="Unvollständige Spezifikation: Laminierung muss ausdrücklich gewählt werden."
                    missingFields={['lamination']}
                    onQuickFixSpec={onQuickFixSpec}
                    onBackToReview={onBackToReview}
                />
            </LocaleProvider>
        );

        expect(screen.getByTestId('calculation-inline-quickfix')).toBeInTheDocument();
        expect(screen.getByText('Fehlende Pflichtangaben direkt hier ergänzen')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('quickfix-lamination-matt'));
        fireEvent.click(screen.getByTestId('quickfix-apply-recalculate-btn'));
        expect(onQuickFixSpec).toHaveBeenCalledWith({ lamination: 'matt' });

        fireEvent.click(screen.getByTestId('quickfix-back-to-review-btn'));
        expect(onBackToReview).toHaveBeenCalledTimes(1);
    });

    it('3. VariantSpecTable highlights missing lamination in Step 2 (Prüfung) with 1-click options', () => {
        window.localStorage.setItem('ppos_locale', 'de');
        const onUpdateSpec = vi.fn();

        render(
            <LocaleProvider>
                <VariantSpecTable
                    spec={offerMissingLamination as any}
                    onUpdateSpec={onUpdateSpec}
                />
            </LocaleProvider>
        );

        expect(screen.getByTestId('review-lamination-resolver')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('review-lamination-opt-none'));
        expect(onUpdateSpec).toHaveBeenCalledWith({ lamination: 'none' });
    });

    it('4. GuidedStepReview displays assisted base-rates completion and partial calibrated launch when >= 1 family is calibrated', () => {
        window.localStorage.setItem('ppos_locale', 'de');
        const onAutoCompleteBaseRatesFromCalibrated = vi.fn().mockResolvedValue({ ok: true });
        const onActivateCalibratedOnly = vi.fn();

        const families: any = {
            HARDCOVER: { id: 'HARDCOVER', titleKey: 'family.hardcover', status: 'QUOTE_ADDED', quoteCount: 1 },
            SOFTCOVER: { id: 'SOFTCOVER', titleKey: 'family.softcover', status: 'DATA_VALIDATED', quoteCount: 1 },
            WIRE_O: { id: 'WIRE_O', titleKey: 'family.wireO', status: 'NOT_STARTED', quoteCount: 0 },
            SADDLE_STITCH: { id: 'SADDLE_STITCH', titleKey: 'family.saddleStitch', status: 'NOT_STARTED', quoteCount: 0 }
        };

        render(
            <LocaleProvider>
                <GuidedStepReview
                    company={{ legalName: 'dardedze', tradingName: 'dardedze Sia', country: 'LV', city: 'Riga', taxId: 'LV40003270251', contactName: 'sfva', phone: '', siteName: 'Riga Plant', siteTimezone: 'Europe/Riga' }}
                    families={families}
                    enabledFamilies={{ HARDCOVER: true, SOFTCOVER: true, WIRE_O: true, SADDLE_STITCH: true }}
                    pricingContinuity={{ SOFTCOVER: { pricingMethod: 'ASSISTANT', calibrationAccepted: true } as any }}
                    readinessData={{
                        accountSetup: { status: 'COMPLETE', blockingIssues: [] },
                        operationalConfiguration: { status: 'COMPLETE', blockingIssues: [] },
                        pricingReadiness: { status: 'INCOMPLETE', blockingIssues: [] }
                    }}
                    onBackToPricing={vi.fn()}
                    onOpenFullSetup={vi.fn()}
                    onAutoCompleteBaseRatesFromCalibrated={onAutoCompleteBaseRatesFromCalibrated}
                    onActivateCalibratedOnly={onActivateCalibratedOnly}
                />
            </LocaleProvider>
        );

        expect(screen.getByTestId('assisted-calibrated-launch-card')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('auto-complete-base-rates-btn'));
        expect(onAutoCompleteBaseRatesFromCalibrated).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByTestId('activate-calibrated-only-btn'));
        expect(onActivateCalibratedOnly).toHaveBeenCalledTimes(1);
    });

    it('5. GuidedStepProducts renders direct PDF upload per active family card and uploads on file selection', () => {
        const onUploadFamilyQuote = vi.fn();
        const families: any = {
            HARDCOVER: { id: 'HARDCOVER', titleKey: 'family.hardcover', status: 'NOT_STARTED', quoteCount: 0 },
            SOFTCOVER: { id: 'SOFTCOVER', titleKey: 'family.softcover', status: 'NOT_STARTED', quoteCount: 0 },
            WIRE_O: { id: 'WIRE_O', titleKey: 'family.wireO', status: 'NOT_STARTED', quoteCount: 0 },
            SADDLE_STITCH: { id: 'SADDLE_STITCH', titleKey: 'family.saddleStitch', status: 'NOT_STARTED', quoteCount: 0 }
        };

        render(
            <LocaleProvider>
                <GuidedStepProducts
                    families={families}
                    enabledFamilies={{ HARDCOVER: true, SOFTCOVER: false, WIRE_O: false, SADDLE_STITCH: false }}
                    selectedFamilyId="HARDCOVER"
                    onUploadFamilyQuote={onUploadFamilyQuote}
                    onToggleFamily={vi.fn()}
                    onSelectActiveFamily={vi.fn()}
                    onContinueToPricing={vi.fn()}
                    onBackToCompany={vi.fn()}
                />
            </LocaleProvider>
        );

        expect(screen.getByTestId('product-card-upload-HARDCOVER')).toBeInTheDocument();
        expect(screen.queryByTestId('product-card-upload-SOFTCOVER')).not.toBeInTheDocument();

        const file = new File(['%PDF-1.4 test'], 'hardcover-offer.pdf', { type: 'application/pdf' });
        const input = screen.getByTestId('product-card-file-input-HARDCOVER') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });

        expect(onUploadFamilyQuote).toHaveBeenCalledWith('HARDCOVER', file);
    });

    it('6. VariantSpecTable 1-click all-in buttons confirm all 4 inclusions (and optional no-lamination) in a single click', () => {
        const onUpdateInclusions = vi.fn();
        const onUpdateSpec = vi.fn();

        render(
            <LocaleProvider>
                <VariantSpecTable
                    spec={{
                        family: 'HARDCOVER',
                        productTitle: 'All-in Book',
                        lamination: undefined,
                        includesPaper: null,
                        includesBinding: null,
                        includesFinishing: null,
                        includesPackaging: null,
                        runs: [{ id: 'r1', quantity: 1000, manufacturingPrice: 2400, transportPrice: 120, quotedTotalPrice: 2520 }]
                    }}
                    onUpdateInclusions={onUpdateInclusions}
                    onUpdateSpec={onUpdateSpec}
                />
            </LocaleProvider>
        );

        expect(screen.getByTestId('confirm-all-inclusions-btn')).toBeInTheDocument();
        expect(screen.getByTestId('confirm-all-inclusions-no-lamination-btn')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('confirm-all-inclusions-no-lamination-btn'));
        expect(onUpdateInclusions).toHaveBeenCalledWith({
            includesPaper: true,
            includesBinding: true,
            includesFinishing: true,
            includesPackaging: true
        });
        expect(onUpdateSpec).toHaveBeenCalledWith({ lamination: 'none' });
    });
});
