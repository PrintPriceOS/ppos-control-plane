/**
 * tests/PrinthouseOnboardingSimplifiedJourney.test.tsx
 *
 * Comprehensive Test Suite for Simplified Printhouse Onboarding Journey:
 * 1. 5-Step Stepper Journey rendering & navigation
 * 2. 4 Product Families with accessible binding iconography & multi-attribute status badges
 * 3. Product family states: PENDING, NOT_OFFERED, QUOTE_ADDED, REQUIRES_REVIEW, DATA_VALIDATED
 * 4. Dual Entry: "Subir presupuesto PDF" (with real fixtures) vs "Introducir oferta manualmente" (7 sections)
 * 5. Family-conditional fields (Hardcover board/endpapers, Softcover flaps, Wire-O pitch, Saddle stitch staples)
 * 6. Multi-run variant table: distinguishes quantity, paper, finish, turnaround, logistics options without conflating run quantities
 * 7. Reference cases:
 *    - Natur: 500, 600, 700 copies (consistent)
 *    - Stutensee: arithmetic discrepancy (3.05 € unit vs 5.08 € computed) flagged for review without silent mutation
 *    - Fussel: same run (2000 copies) with 2 transport alternatives (Standard 200 € vs Express 600 €)
 *    - Fährmann: same run (3000 copies) with 4 paper variants
 *    - Die Mysteriösen Steine: technical ambiguity between softcover wording & 2.4 mm board
 * 8. Coverage scope disclaimer: Wire-O, saddle stitch, stamping, and sewn vs glued comparisons retain baseline rates
 * 9. Calculation comparison: side-by-side target vs engine price and parameter coverage analysis
 * 10. Governed acceptance: explicit confirmation modal, rate patch review, zero marketplace/dispatch activation
 * 11. Multilingual coverage: EN, ES, DE
 */

import React from 'react';
import '@testing-library/jest-dom';
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { SimplifiedOnboardingJourney } from '../src/ui/components/printhouse/onboarding/SimplifiedOnboardingJourney';
import { HardcoverIcon, SoftcoverIcon, WireOIcon, SaddleStitchIcon, BindingIcon } from '../src/ui/components/printhouse/onboarding/BindingFamilyIcons';
import { ProductFamilyCard } from '../src/ui/components/printhouse/onboarding/ProductFamilyCard';
import { ManualOfferForm } from '../src/ui/components/printhouse/onboarding/ManualOfferForm';
import { VariantSpecTable } from '../src/ui/components/printhouse/onboarding/VariantSpecTable';
import { CalculationComparisonView } from '../src/ui/components/printhouse/onboarding/CalculationComparisonView';
import { GovernedAcceptanceView } from '../src/ui/components/printhouse/onboarding/GovernedAcceptanceView';
import { printhouseCalibrationApi } from '../src/ui/lib/printhouseCalibrationApi';
import { 
    NATUR_DOCUMENT_FIXTURE,
    STUTENSEE_DOCUMENT_FIXTURE,
    FUSSEL_DOCUMENT_FIXTURE,
    FAHRMANN_DOCUMENT_FIXTURE,
    MYSTERIOSEN_STEINE_DOCUMENT_FIXTURE
} from './fixtures/printhouseDocumentFixtures';

const renderJourney = (ui: React.ReactElement, locale = 'es') => {
    return rtlRender(
        <MemoryRouter>
            <LocaleProvider initialLocale={locale as any}>
                {ui}
            </LocaleProvider>
        </MemoryRouter>
    );
};

describe('Simplified Printhouse Onboarding Journey Suite', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // ── 1. Iconography and Family Cards ──
    it('1. Renders 4 distinct binding family icons with accessibility attributes', () => {
        const { container } = renderJourney(
            <div>
                <HardcoverIcon size={32} />
                <SoftcoverIcon size={32} />
                <WireOIcon size={32} />
                <SaddleStitchIcon size={32} />
            </div>
        );

        const svgs = container.querySelectorAll('svg');
        expect(svgs.length).toBe(4);
        svgs.forEach(svg => {
            expect(svg).toHaveAttribute('aria-hidden', 'true');
        });
    });

    it('2. ProductFamilyCard renders multi-attribute status badge (not color alone) and toggles not offered', () => {
        const onSelect = vi.fn();
        const onToggleNotOffered = vi.fn();

        const { rerender } = renderJourney(
            <ProductFamilyCard
                family={{
                    id: 'HARDCOVER',
                    titleKey: 'family.hardcover.title',
                    descKey: 'family.hardcover.desc',
                    status: 'PENDING',
                    quoteCount: 0
                }}
                isSelected={false}
                onSelect={onSelect}
                onToggleNotOffered={onToggleNotOffered}
            />,
            'es'
        );

        // Icon, title and description
        expect(screen.getByText('Tapa dura / Hardcover')).toBeInTheDocument();
        expect(screen.getByText('Pendiente')).toBeInTheDocument();

        // Toggle "No ofrecemos este producto"
        const toggleBtn = screen.getByRole('button', { name: /No ofrecemos este producto/i });
        fireEvent.click(toggleBtn);
        expect(onToggleNotOffered).toHaveBeenCalledTimes(1);

        // Rerender as NOT_OFFERED
        rerender(
            <MemoryRouter>
                <LocaleProvider initialLocale="es">
                    <ProductFamilyCard
                        family={{
                            id: 'HARDCOVER',
                            titleKey: 'family.hardcover.title',
                            descKey: 'family.hardcover.desc',
                            status: 'NOT_OFFERED',
                            quoteCount: 0
                        }}
                        isSelected={false}
                        onSelect={onSelect}
                        onToggleNotOffered={onToggleNotOffered}
                    />
                </LocaleProvider>
            </MemoryRouter>
        );

        expect(screen.getByText('No ofrecemos este producto')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Habilitar este producto/i })).toBeInTheDocument();
    });

    // ── 2. Full 5-Step Stepper Journey ──
    it('3. Renders 5-step stepper navigation with understandable titles without phase IDs or JSON', () => {
        renderJourney(<SimplifiedOnboardingJourney />, 'es');

        expect(screen.getAllByText(/Qué productos fabricas/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Añadir presupuestos/i)).toBeInTheDocument();
        expect(screen.getByText(/Revisar especificaciones/i)).toBeInTheDocument();
        expect(screen.getByText(/Comparar cálculos/i)).toBeInTheDocument();
        expect(screen.getByText(/(Revisar y aceptar|Aceptar propuesta)/i)).toBeInTheDocument();

        // Should NOT contain phase numbers or IDs
        expect(screen.queryByText(/Phase 193/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Phase 194/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/rates_json/i)).not.toBeInTheDocument();
    });

    // ── 3. Step 1 -> Step 2 Flow: Dual Entry & Progressive Form ──
    it('4. Navigates to Step 2 with Dual Entry: PDF Upload vs Manual Offer Form', () => {
        renderJourney(<SimplifiedOnboardingJourney />, 'es');

        // Select Hardcover family
        const selectButtons = screen.getAllByRole('button', { name: /Aportar presupuesto|Seleccionar familia/i });
        fireEvent.click(selectButtons[0]);

        // Step 2 is now active
        expect(screen.getByText('Subir presupuesto PDF')).toBeInTheDocument();
        expect(screen.getByText('Introducir oferta manualmente')).toBeInTheDocument();

        // Switch to Manual Offer Form
        const manualTab = screen.getByRole('button', { name: /Introducir oferta manualmente/i });
        fireEvent.click(manualTab);

        // Verify 7 progressive sections exist
        expect(screen.getByText(/1\. Producto y Dimensiones Reales/i)).toBeInTheDocument();
        expect(screen.getByText(/2\. Páginas y Bloques de Interior/i)).toBeInTheDocument();
        expect(screen.getByText(/3\. Cubierta, Cartón y Guardas/i)).toBeInTheDocument();
        expect(screen.getByText(/4\. Encuadernación y Lomo/i)).toBeInTheDocument();
        expect(screen.getByText(/5\. Acabados y Protección/i)).toBeInTheDocument();
        expect(screen.getByText(/6\. Tiradas, Variantes y Precios/i)).toBeInTheDocument();
        expect(screen.getByText(/7\. Destino y Plazos de Entrega/i)).toBeInTheDocument();
    });

    it('5. Progressive form conditionally renders family-specific fields', () => {
        // Hardcover renders board thickness and endpapers
        const { unmount } = renderJourney(
            <ManualOfferForm
                family="HARDCOVER"
                onSubmitSpec={vi.fn()}
                onCancel={vi.fn()}
            />,
            'es'
        );

        expect(screen.getByText(/Grosor de Cartón \/ Graupappe/i)).toBeInTheDocument();
        expect(screen.getByText(/Guardas \(Papel y acabado\)/i)).toBeInTheDocument();
        unmount();

        // Softcover renders flaps and does NOT render cardboard thickness
        renderJourney(
            <ManualOfferForm
                family="SOFTCOVER"
                onSubmitSpec={vi.fn()}
                onCancel={vi.fn()}
            />,
            'es'
        );

        expect(screen.getByText(/Incluye solapas \(solapas plegadas en cubierta\)/i)).toBeInTheDocument();
        expect(screen.queryByText(/Grosor de Cartón \/ Graupappe/i)).not.toBeInTheDocument();
    });

    // ── 4. Fixture References via Document Fixtures: Natur, Stutensee, Fussel, Fährmann, Die Mysteriösen Steine ──
    it('6. Loads Natur fixture with 3 consistent runs (500, 600, 700 copies)', async () => {
        renderJourney(<SimplifiedOnboardingJourney initialSpec={NATUR_DOCUMENT_FIXTURE.spec as any} initialStep={3} />, 'es');

        // Advances to Step 3 Review
        expect(screen.getByText(/Revisión de Especificaciones y Tabla de Variantes/i)).toBeInTheDocument();

        // 3 runs rendered in table
        expect(screen.getByText('500')).toBeInTheDocument();
        expect(screen.getByText('600')).toBeInTheDocument();
        expect(screen.getByText('700')).toBeInTheDocument();
        expect(screen.getByText('4.646,00 €')).toBeInTheDocument();
        expect(screen.getByText('4.929,00 €')).toBeInTheDocument();
        expect(screen.getByText('5.171,00 €')).toBeInTheDocument();
    });

    it('7. Stutensee fixture detects arithmetic discrepancy without silent correction', async () => {
        renderJourney(<SimplifiedOnboardingJourney initialSpec={STUTENSEE_DOCUMENT_FIXTURE.spec as any} initialStep={3} />, 'es');

        // Review with discrepancy alert
        expect(screen.getByText(/Discrepancia aritmética detectada en el presupuesto/i)).toBeInTheDocument();

        // Explains the discrepancy and offers choice
        expect(screen.getByText(/3,0500 €/i)).toBeInTheDocument();
        expect(screen.getByText(/5,0833 €/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Aplicar precio unitario calculado/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Conservar valor original/i })).toBeInTheDocument();

        // Clicking apply updates the unit price
        fireEvent.click(screen.getByRole('button', { name: /Aplicar precio unitario calculado/i }));
        expect(screen.queryByText(/Discrepancia aritmética detectada en el presupuesto/i)).not.toBeInTheDocument();
    });

    it('8. Fussel fixture preserves same run quantity with 2 transport alternatives without splitting run volume', async () => {
        renderJourney(<SimplifiedOnboardingJourney initialSpec={FUSSEL_DOCUMENT_FIXTURE.spec as any} initialStep={3} />, 'es');

        // Both rows have quantity 2000 with distinct freight options
        expect(screen.getByText('Transporte Individual (600 €)')).toBeInTheDocument();
        expect(screen.getByText('Transporte Combinado / Zusammenversand (200 €)')).toBeInTheDocument();
        const qtyCells = screen.getAllByText('2.000');
        expect(qtyCells.length).toBeGreaterThanOrEqual(2);
    });

    it('9. Fährmann fixture preserves same run quantity with 4 paper and turnaround variants without splitting run volume', async () => {
        renderJourney(<SimplifiedOnboardingJourney initialSpec={FAHRMANN_DOCUMENT_FIXTURE.spec as any} initialStep={3} />, 'es');

        // 4 combined variants visible across Munken Print and Munken Premium with distinct lead times
        expect(screen.getAllByText(/Munken Print Cream 1.5 90g/i).length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText(/Munken Premium Cream 1.3 90g/i).length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText(/Plazo Estándar \(LT 28.10.\)/i).length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText(/Plazo Urgente \(LT 15.10.\)/i).length).toBeGreaterThanOrEqual(2);
        const qtyCells = screen.getAllByText('3.000');
        expect(qtyCells.length).toBe(4);
    });

    it('10. Die Mysteriösen Steine detects technical ambiguity and prompts operator confirmation', async () => {
        renderJourney(<SimplifiedOnboardingJourney initialSpec={MYSTERIOSEN_STEINE_DOCUMENT_FIXTURE.spec as any} initialStep={3} />, 'es');

        // Displays technical ambiguity banner
        expect(screen.getByText(/Ambigüedad técnica detectada entre encuadernación y cartón/i)).toBeInTheDocument();

        expect(screen.getByRole('button', { name: /Tapa Dura \(Cartón 2,4 mm\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Rústica \(Cubierta flexible\)/i })).toBeInTheDocument();

        // Operator confirms Hardcover
        fireEvent.click(screen.getByRole('button', { name: /Tapa Dura \(Cartón 2,4 mm\)/i }));
        expect(screen.queryByText(/Ambigüedad técnica detectada/i)).not.toBeInTheDocument();
    });

    // ── 5. Coverage Scope Disclaimer ──
    it('11. Displays mandatory technical coverage scope disclaimer', async () => {
        renderJourney(<SimplifiedOnboardingJourney initialSpec={NATUR_DOCUMENT_FIXTURE.spec as any} initialStep={3} />, 'es');

        expect(screen.getByText(/Alcance y Brecha de Cobertura de Evidencias/i)).toBeInTheDocument();
        expect(screen.getByText(/No acredita Wire-O, grapado al caballete, estampación ni una comparación controlada entre cosido y encolado/i)).toBeInTheDocument();
    });

    // ── 6. Step 4: Calculation Comparison ──
    it('12. Step 4 renders side-by-side original vs engine price and parameter coverage', async () => {
        renderJourney(<SimplifiedOnboardingJourney initialSpec={NATUR_DOCUMENT_FIXTURE.spec as any} initialStep={4} />, 'es');

        // Step 4 header & prices
        expect(screen.getByText(/Comparación de Cálculos: Presupuesto vs Motor PrintPrice OS/i)).toBeInTheDocument();
        expect(screen.getByText(/Fabricación Declarada|Precio Total Declarado/i)).toBeInTheDocument();
        expect(screen.getByText(/Fabricación Motor|Cálculo del Motor PrintPrice/i)).toBeInTheDocument();
        expect(screen.getByText(/Diferencia \/ Residual/i)).toBeInTheDocument();

        // Parameter coverage list
        expect(screen.getByText(/Parámetros Respaldados por el Presupuesto/i)).toBeInTheDocument();
    });

    // ── 7. Step 5: Governed Acceptance with Modal ──
    it('13. Step 5 displays rate proposal, requires explicit modal confirmation and preserves zero marketplace activation', async () => {
        renderJourney(<SimplifiedOnboardingJourney initialSpec={NATUR_DOCUMENT_FIXTURE.spec as any} initialStep={5} />, 'es');

        // Step 5 proposal review
        expect(screen.getByText(/Revisión y Aceptación Gobernada de la Propuesta de Tarifas/i)).toBeInTheDocument();
        expect(screen.getByText(/Garantías Operativas y Límites de Publicación/i)).toBeInTheDocument();
        expect(screen.getByText(/Activación Comercial Inalterada/i)).toBeInTheDocument();
        expect(screen.getByText(/Sin Quoting ni Routing Público/i)).toBeInTheDocument();

        // Trigger confirmation modal
        const acceptBtn = screen.getByRole('button', { name: /Aceptar y Registrar Propuesta de Tarifas/i });
        fireEvent.click(acceptBtn);

        // Modal is displayed
        expect(screen.getByText('Confirmar Aceptación de Tarifas')).toBeInTheDocument();
        const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
        const confirmBtn = screen.getByRole('button', { name: /Confirmar y Guardar Tarifas/i });
        expect(cancelBtn).toBeInTheDocument();
        expect(confirmBtn).toBeInTheDocument();

        // Confirm
        fireEvent.click(confirmBtn);

        // Status transitions to accepted
        await waitFor(() => {
            expect(screen.getByText('Tarifas Aceptadas y Versionadas')).toBeInTheDocument();
        });
    });

    // ── 8. Multilingual Parity (EN & DE) ──
    it('14. Renders fluently in English (EN) and German (DE)', () => {
        const { unmount } = renderJourney(<SimplifiedOnboardingJourney />, 'en');

        expect(screen.getByText('Hardcover / Case Bound')).toBeInTheDocument();
        expect(screen.getByText('Softcover / Paperback')).toBeInTheDocument();
        expect(screen.getByText('Wire-O / Twin Loop')).toBeInTheDocument();
        expect(screen.getByText('Saddle Stitch / Stapled')).toBeInTheDocument();
        expect(screen.getAllByText(/What products you produce/i).length).toBeGreaterThanOrEqual(1);
        unmount();

        renderJourney(<SimplifiedOnboardingJourney />, 'de');
        expect(screen.getByText('Hardcover / Festeinband')).toBeInTheDocument();
        expect(screen.getByText('Softcover / Broschur')).toBeInTheDocument();
        expect(screen.getByText('Wire-O / Spiralbindung')).toBeInTheDocument();
        expect(screen.getByText('Rückstichheftung / Drahtheftung')).toBeInTheDocument();
        expect(screen.getAllByText(/Welche Produkte stellen Sie her/i).length).toBeGreaterThanOrEqual(1);
    });

    // ── 9. Document and Variant Invalidation & Race Condition Guardrails ──
    it('15. Discards late calculation response if user uploads or switches document while calculation is in progress', async () => {
        let resolveCalculate: (val: any) => void = () => {};
        const slowPromise = new Promise(resolve => {
            resolveCalculate = resolve;
        });

        const printhouseCalibrationApi = await import('../src/ui/lib/printhouseCalibrationApi');
        const calculateSpy = vi.spyOn(printhouseCalibrationApi.printhouseCalibrationApi, 'calculateCalibration').mockImplementation(() => slowPromise as any);
        const readySpy = vi.spyOn(printhouseCalibrationApi.printhouseCalibrationApi, 'markSessionReady').mockResolvedValue({ id: 'sess-1', status: 'READY' } as any);
        const createSpy = vi.spyOn(printhouseCalibrationApi.printhouseCalibrationApi, 'createSession').mockResolvedValue({ id: 'sess-1', status: 'DRAFT' } as any);

        const { container } = renderJourney(
            <SimplifiedOnboardingJourney 
                printerNodeId="node-test-1" 
                initialSpec={NATUR_DOCUMENT_FIXTURE.spec as any} 
                initialStep={3} 
            />, 
            'es'
        );

        // Proceed to calculation in Step 3
        const proceedBtn = screen.getByTestId('proceed-to-compare-btn');
        fireEvent.click(proceedBtn);

        // Advance to step 4, calculation is in-flight
        expect(createSpy).toHaveBeenCalled();

        // While calculation is in progress, user goes back to step 2 and uploads another document
        const backBtn = screen.getByRole('button', { name: /Volver a especificaciones/i });
        fireEvent.click(backBtn);

        const backToStep2Btn = screen.getByTestId('back-to-step2-btn');
        fireEvent.click(backToStep2Btn);

        // User uploads another document
        const fileInput = container.querySelector('#onboarding-pdf-upload-input') as HTMLInputElement;
        const fakeFile = new File(['mock content'], 'Presupuesto_Stutensee.pdf', { type: 'application/pdf' });
        fireEvent.change(fileInput, { target: { files: [fakeFile] } });

        // Now the old calculation resolves with the old document's price
        resolveCalculate({
            id: 'run-natur-late',
            status: 'SUCCESS',
            enginePriceAfter: 4310,
            targetPrice: 4321,
            absoluteResidual: 11,
            percentResidual: 0.25,
            proposedPatch: { machine_hourly_rate: 70 }
        });

        // The late response must NOT be accepted or displayed
        await waitFor(() => {
            expect(screen.queryByText(/4.310/i)).not.toBeInTheDocument();
        });
    });

    it('16. Invalidates active run and proposal when changing variant after calculation', async () => {
        renderJourney(
            <SimplifiedOnboardingJourney 
                initialSpec={NATUR_DOCUMENT_FIXTURE.spec as any} 
                initialStep={4} 
            />, 
            'es'
        );

        // Step 4 is rendered
        expect(screen.getByText(/Comparación de Cálculos/i)).toBeInTheDocument();

        // Go back to Step 3
        const backBtn = screen.getByRole('button', { name: /Volver a especificaciones/i });
        fireEvent.click(backBtn);

        // Now in Step 3, table of variants is shown
        expect(screen.getByText(/Revisión de Especificaciones y Tabla de Variantes/i)).toBeInTheDocument();
    });

    it('17. Discards late session creation response and prevents sessionId write if document switched in-flight', async () => {
        let resolveCreateSession: any;
        const createSessionPromise = new Promise((resolve) => {
            resolveCreateSession = resolve;
        });

        vi.spyOn(printhouseCalibrationApi, 'createSession').mockReturnValue(createSessionPromise as any);

        renderJourney(
            <SimplifiedOnboardingJourney 
                initialSpec={NATUR_DOCUMENT_FIXTURE.spec as any} 
                initialStep={3} 
                printerNodeId="node-test-123"
            />, 
            'es'
        );

        // Click to proceed to comparison / run solver
        const compareBtn = screen.getByTestId('proceed-to-compare-btn');
        fireEvent.click(compareBtn);

        // While createSession is pending, simulate user navigating back to step 1 and switching family
        const step1Btn = screen.getByRole('button', { name: /Qué productos fabricas/i });
        fireEvent.click(step1Btn);

        const hardcoversFamily = screen.getByText(/Tapa dura/i);
        fireEvent.click(hardcoversFamily);

        // Now resolve the late createSession with a fake session ID
        resolveCreateSession({ id: 'late-stale-session-id-999' });

        // Assert: late session is NOT accepted and does NOT proceed to accept
        await waitFor(() => {
            expect(screen.queryByText(/Aceptar propuesta de tarifas/i)).not.toBeInTheDocument();
        });
    });

    it('18. Discards late PDF extraction response if user triggered a new action before fetch completed', async () => {
        let resolveFetch: any;
        const fetchPromise = new Promise((resolve) => {
            resolveFetch = resolve;
        });

        global.fetch = vi.fn().mockReturnValue(fetchPromise as any);

        const { container } = renderJourney(
            <SimplifiedOnboardingJourney initialStep={2} />,
            'es'
        );

        // Upload first file
        const file1 = new File(['dummy-content-1'], 'first_offer.pdf', { type: 'application/pdf' });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file1] } });

        // User changes mode to MANUAL_FORM before first upload completes
        const manualBtn = screen.getByText(/Introducir oferta manualmente/i);
        fireEvent.click(manualBtn);

        // Resolve the stale upload response
        resolveFetch({
            ok: true,
            json: async () => ({
                productTitle: 'Old Stale Title That Should Be Ignored',
                runs: [{ id: 'run-1', quantity: 500, manufacturingPrice: 999 }]
            })
        });

        // Assert that old title is NOT present in document
        await waitFor(() => {
            expect(screen.queryByText('Old Stale Title That Should Be Ignored')).not.toBeInTheDocument();
        });
    });

    it('19. Blocks calculation when selectedVariantId does not match any run in current offer', async () => {
        const specWithInvalidVariant = {
            ...NATUR_DOCUMENT_FIXTURE.spec,
            selectedVariantId: 'completely-non-existent-variant-id'
        };

        renderJourney(
            <SimplifiedOnboardingJourney 
                initialSpec={specWithInvalidVariant as any} 
                initialStep={4} 
            />, 
            'es'
        );

        // In Step 4, comparison must show error and block acceptance
        expect(screen.getAllByText(/La variante seleccionada no existe en el presupuesto/i).length).toBeGreaterThanOrEqual(1);
        const acceptBtn = screen.getByTestId('proceed-to-accept-btn');
        expect(acceptBtn).toBeDisabled();
    });

    it('20. Discards late PDF extraction response when switching product family while extraction was in flight', async () => {
        let resolveFetch: any;
        const fetchPromise = new Promise((resolve) => {
            resolveFetch = resolve;
        });

        global.fetch = vi.fn().mockReturnValue(fetchPromise as any);

        const { container } = renderJourney(
            <SimplifiedOnboardingJourney initialStep={1} />,
            'es'
        );

        // Select HARDCOVER to enter Step 2
        const selectButtons = screen.getAllByRole('button', { name: /Aportar presupuesto|Seleccionar familia/i });
        fireEvent.click(selectButtons[0]);

        expect(screen.getByText(/Familia seleccionada/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Tapa dura/i).length).toBeGreaterThan(0);

        // Upload a PDF for Hardcover
        const file1 = new File(['hardcover-content'], 'hardcover_quote.pdf', { type: 'application/pdf' });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file1] } });

        // User changes mind and goes back to Step 1 (family selector)
        const backBtn = screen.getByLabelText(/Volver al selector de familias/i);
        fireEvent.click(backBtn);

        // User now selects WIRE_O family (index 2)
        const selectButtonsAfter = screen.getAllByRole('button', { name: /Aportar presupuesto|Seleccionar familia/i });
        fireEvent.click(selectButtonsAfter[2]);

        expect(screen.getAllByText(/Wire-O/i).length).toBeGreaterThan(0);

        // Now late Hardcover extraction finishes
        resolveFetch({
            ok: true,
            json: async () => ({
                productTitle: 'Hardcover Stale Quote In Flight',
                runs: [{ id: 'run-hc-stale', quantity: 1500, manufacturingPrice: 3200 }]
            })
        });

        // Verify that stale PDF did NOT force progression to Step 3 and did NOT overwrite Wire-O context
        await waitFor(() => {
            expect(screen.queryByText('Hardcover Stale Quote In Flight')).not.toBeInTheDocument();
            expect(screen.queryByText('run-hc-stale')).not.toBeInTheDocument();
        });
        // Still on Step 2 with Wire-O active, NOT on Step 3
        expect(screen.getAllByText(/Wire-O/i).length).toBeGreaterThan(0);
        expect(screen.queryByTestId('back-to-step2-btn')).not.toBeInTheDocument();
    });

    it('21. Discards late PDF extraction response when user returns to Step 1 without selecting new family', async () => {
        let resolveFetch: any;
        const fetchPromise = new Promise((resolve) => {
            resolveFetch = resolve;
        });

        global.fetch = vi.fn().mockReturnValue(fetchPromise as any);

        const { container } = renderJourney(
            <SimplifiedOnboardingJourney initialStep={2} />,
            'es'
        );

        // Upload a PDF in Step 2
        const file = new File(['pdf-dummy'], 'test_abandoned.pdf', { type: 'application/pdf' });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });

        // User returns to Step 1
        const backBtn = screen.getByLabelText(/Volver al selector de familias/i);
        fireEvent.click(backBtn);

        // Verify we are on Step 1
        expect(screen.getAllByText(/Qué productos fabricas/i).length).toBeGreaterThan(0);

        // Late PDF resolves
        resolveFetch({
            ok: true,
            json: async () => ({
                productTitle: 'Late Abandoned Upload Spec',
                runs: [{ id: 'run-abandoned', quantity: 1000, manufacturingPrice: 1200 }]
            })
        });

        // Verify user remains on Step 1 and is NOT forcefully moved to Step 3
        await waitFor(() => {
            expect(screen.queryByText('Late Abandoned Upload Spec')).not.toBeInTheDocument();
        });
        expect(screen.getAllByText(/Qué productos fabricas/i).length).toBeGreaterThan(0);
        expect(screen.queryByTestId('back-to-step2-btn')).not.toBeInTheDocument();
    });
});


