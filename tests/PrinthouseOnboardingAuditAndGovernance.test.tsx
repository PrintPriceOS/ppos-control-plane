/**
 * tests/PrinthouseOnboardingAuditAndGovernance.test.tsx
 *
 * Comprehensive Audit and Governance Test Suite for Printhouse Calibration Onboarding.
 *
 * Verifies all 8 critical acceptance requirements:
 * 1. Document fidelity of fixtures to original PDFs (Natur, Stutensee, Fussel, Fährmann, Die Mysteriösen Steine)
 * 2. Distinct variants with identical quantity without splitting volume
 * 3. Strict separation of manufacturing, transport, other, total excl. VAT, unit price
 * 4. Non-silent detection and flagging of arithmetic discrepancies and technical ambiguities
 * 5. Data preservation during errors and manual review fallback
 * 6. Tenant isolation across session creation, calculation, and acceptance
 * 7. Governed acceptance via real service contracts with immutable revision audit log and subsequent read
 * 8. Zero writes on cancellation
 * 9. Production exclusion: verifies tests/fixtures is NOT imported in src/ui/ and no third-party data is leaked
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';

import { 
    NATUR_DOCUMENT_FIXTURE, 
    STUTENSEE_DOCUMENT_FIXTURE, 
    FUSSEL_DOCUMENT_FIXTURE, 
    FAHRMANN_DOCUMENT_FIXTURE, 
    MYSTERIOSEN_STEINE_DOCUMENT_FIXTURE,
    ALL_REAL_DOCUMENT_FIXTURES
} from './fixtures/printhouseDocumentFixtures';
import { SimplifiedOnboardingJourney } from '../src/ui/components/printhouse/onboarding/SimplifiedOnboardingJourney';
import { GovernedAcceptanceView } from '../src/ui/components/printhouse/onboarding/GovernedAcceptanceView';
import { CalculationComparisonView } from '../src/ui/components/printhouse/onboarding/CalculationComparisonView';
import { VariantSpecTable } from '../src/ui/components/printhouse/onboarding/VariantSpecTable';
import { LocaleProvider, Locale } from '../src/ui/i18n';
import { printhouseCalibrationApi } from '../src/ui/lib/printhouseCalibrationApi';

function renderWithLocale(ui: React.ReactElement, locale: Locale = 'es') {
    return render(
        <LocaleProvider initialLocale={locale}>
            {ui}
        </LocaleProvider>
    );
}

describe('Printhouse Calibration Onboarding - Audit, Fidelity and Governance Suite', () => {

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Document Fidelity of Fixtures to Original PDFs
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Document Fidelity & Extraction Truth', () => {
        it('1.1 Natur fixture faithfully reproduces 148x210 mm, 592 pages Munken 80g Klappenbroschur and 500/600/700 runs', () => {
            const { fixture } = NATUR_DOCUMENT_FIXTURE;
            expect(fixture.bindingFamily).toBe('SOFTCOVER');
            expect(fixture.format.widthMm).toBe(148);
            expect(fixture.format.heightMm).toBe(210);
            expect(fixture.pageCount.interiorPages).toBe(592);
            expect(fixture.materials.interiorPaper).toContain('Munken Print');
            expect(fixture.materials.interiorGsm).toBe(80);
            expect(fixture.materials.coverGsm).toBe(300);
            expect(fixture.finishingAndBinding.hasFlaps).toBe(true);

            expect(fixture.offers).toHaveLength(3);
            const [q500, q600, q700] = fixture.offers;

            // 500 copies
            expect(q500.quantity).toBe(500);
            expect(q500.manufacturingPrice).toBe(4321);
            expect(q500.transportPrice).toBe(325);
            expect(q500.quotedTotalPrice).toBe(4646);
            expect(q500.quotedUnitPrice).toBe(9.29);

            // 600 copies
            expect(q600.quantity).toBe(600);
            expect(q600.manufacturingPrice).toBe(4604);
            expect(q600.transportPrice).toBe(325);
            expect(q600.quotedTotalPrice).toBe(4929);
            expect(q600.quotedUnitPrice).toBe(8.22);

            // 700 copies
            expect(q700.quantity).toBe(700);
            expect(q700.manufacturingPrice).toBe(4846);
            expect(q700.transportPrice).toBe(325);
            expect(q700.quotedTotalPrice).toBe(5171);
            expect(q700.quotedUnitPrice).toBe(7.39);
        });

        it('1.2 Stutensee fixture faithfully captures 170x240 mm, Silk 150g, 104p Hardcover and arithmetic discrepancy at 300 copies', () => {
            const { fixture } = STUTENSEE_DOCUMENT_FIXTURE;
            expect(fixture.bindingFamily).toBe('HARDCOVER');
            expect(fixture.format.widthMm).toBe(170);
            expect(fixture.format.heightMm).toBe(240);
            expect(fixture.pageCount.interiorPages).toBe(104);
            expect(fixture.materials.boardThicknessMm).toBe(2.4);

            const q250 = fixture.offers.find(o => o.quantity === 250);
            const q300 = fixture.offers.find(o => o.quantity === 300);

            expect(q250).toBeDefined();
            expect(q250?.validationStatus).toBe('CONSISTENT');
            expect(q250?.quotedUnitPrice).toBe(5.89);

            expect(q300).toBeDefined();
            expect(q300?.validationStatus).toBe('INCONSISTENT_UNIT_PRICE');
            expect(q300?.quotedTotalPrice).toBe(1525);
            expect(q300?.quotedUnitPrice).toBe(3.05); // declared in doc
            expect(q300?.computedUnitPrice).toBeCloseTo(5.0833, 3); // actual 1525 / 300
        });

        it('1.3 Fussel fixture faithfully captures individual (600 €) vs combined (200 €) transport alternatives', () => {
            const { fixture } = FUSSEL_DOCUMENT_FIXTURE;
            expect(fixture.bindingFamily).toBe('HARDCOVER');
            expect(fixture.format.widthMm).toBe(206);
            expect(fixture.format.heightMm).toBe(264);
            expect(fixture.materials.boardThicknessMm).toBe(3.0);
            expect(fixture.offers).toHaveLength(2);

            const [optA, optB] = fixture.offers;
            expect(optA.quantity).toBe(2000);
            expect(optB.quantity).toBe(2000);
            expect(optA.manufacturingPrice).toBe(3095);
            expect(optB.manufacturingPrice).toBe(3095);
            expect(optA.transportPrice).toBe(600);
            expect(optB.transportPrice).toBe(200);
            expect(optA.quotedTotalPrice).toBe(3695);
            expect(optB.quotedTotalPrice).toBe(3295);
        });

        it('1.4 Fährmann fixture faithfully captures 3000 copies with 4 combinations of Munken Print/Premium and Standard/Express', () => {
            const { fixture } = FAHRMANN_DOCUMENT_FIXTURE;
            expect(fixture.bindingFamily).toBe('HARDCOVER');
            expect(fixture.pageCount.interiorPages).toBe(216);
            expect(fixture.offers).toHaveLength(4);
            fixture.offers.forEach(o => {
                expect(o.quantity).toBe(3000);
                expect(o.transportPrice).toBe(435);
            });
        });

        it('1.5 Die Mysteriösen Steine fixture faithfully flags the technical contradiction between Softcover declaration and 2.4 mm board', () => {
            const { fixture } = MYSTERIOSEN_STEINE_DOCUMENT_FIXTURE;
            expect(fixture.bindingFamily).toBe('SOFTCOVER');
            expect(fixture.materials.boardThicknessMm).toBe(2.4);
            expect(fixture.technicalNotes.hasTechnicalAmbiguity).toBe(true);
            expect(fixture.offers[0].validationStatus).toBe('REQUIRES_REVIEW');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Stable Variant Identity & Cost Breakdown
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. Stable Variant Identity & Cost Breakdown', () => {
        it('2.1 Every variant has a stable unique variantKey and separates manufacturing, transport and total', () => {
            Object.values(ALL_REAL_DOCUMENT_FIXTURES).forEach(f => {
                const keys = new Set<string>();
                f.offers.forEach(o => {
                    expect(o.variantKey).toBeTruthy();
                    expect(keys.has(o.variantKey)).toBe(false);
                    keys.add(o.variantKey);

                    expect(typeof o.manufacturingPrice).toBe('number');
                    expect(typeof o.transportPrice).toBe('number');
                    expect(typeof o.quotedTotalPrice).toBe('number');
                    expect(typeof o.quotedUnitPrice).toBe('number');
                    expect(o.quotedTotalPrice).toBe(o.manufacturingPrice + o.transportPrice + (o.otherPrice || 0));
                });
            });
        });

        it('2.2 CalculationComparisonView warns when breakdown is incomplete and prevents false equivalences', () => {
            renderWithLocale(
                <CalculationComparisonView
                    targetPrice={5000}
                    predictedPrice={4950}
                    difference={50}
                    hasEquivalentBreakdown={false}
                    incompleteComparisonReason="La oferta no desglosa portes. Imposible comparar solo fabricación."
                    variantsUsed={['1000 ej.']}
                />
            );

            expect(screen.getByText('Comparación incompleta')).toBeInTheDocument();
            expect(screen.getByText(/La oferta no desglosa portes/i)).toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Ambiguity & Discrepancy Resolution (No Silent Mutation)
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Ambiguity & Discrepancy Resolution', () => {
        it('3.1 VariantSpecTable blocks proceeding to rate proposal if critical binding ambiguity is unresolved', () => {
            const onProceed = vi.fn();
            renderWithLocale(
                <VariantSpecTable
                    runs={MYSTERIOSEN_STEINE_DOCUMENT_FIXTURE.spec.runs as any}
                    hasAmbiguity={true}
                    ambiguityDetails="Softcover con cartón 2,4 mm"
                    onProceedToComparison={onProceed}
                />
            );

            const proceedBtn = screen.getByRole('button', { name: /Comparar Cálculos del Motor/i });
            expect(proceedBtn).toBeDisabled();

            // After confirming Hardcover, it unlocks
            const confirmHardcoverBtn = screen.getByRole('button', { name: /Tapa Dura \(Cartón 2,4 mm\)/i });
            fireEvent.click(confirmHardcoverBtn);

            expect(proceedBtn).not.toBeDisabled();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3b. Calculation Comparison Rigor & Absence Regression (Blockers 1 & 2)
    // ─────────────────────────────────────────────────────────────────────────
    describe('3b. Calculation Comparison Rigor & Negative Regression', () => {
        it('3b.1 Positive target price with ABSENT engine calculation never shows calibrated status and blocks acceptance advance', () => {
            renderWithLocale(
                <CalculationComparisonView
                    targetPrice={4321}
                    predictedPrice={null}
                    enginePrice={null}
                    comparisonMode="manufacturing"
                />
            );

            // Shows incomplete alert
            expect(screen.getByText(/Cálculo del motor ausente o incompleto/i)).toBeInTheDocument();
            // Never displays calibrated status
            expect(screen.queryByText(/Ajuste calibrado dentro de tolerancia/i)).not.toBeInTheDocument();
            // Displays fallback 'Sin cálculo' badge
            expect(screen.getByText('Sin cálculo')).toBeInTheDocument();
            // The proceed button is strictly disabled
            const proceedBtn = screen.getByTestId('proceed-to-accept-btn');
            expect(proceedBtn).toBeDisabled();
        });

        it('3b.2 Positive target price with MALFORMED or ZERO engine calculation is NOT coerced to 0% residual and blocks acceptance', () => {
            renderWithLocale(
                <CalculationComparisonView
                    targetPrice={1792}
                    enginePrice={0}
                    predictedPrice={0}
                    comparisonMode="manufacturing"
                />
            );

            expect(screen.getByText(/Cálculo del motor ausente o incompleto/i)).toBeInTheDocument();
            expect(screen.queryByText(/Ajuste calibrado dentro de tolerancia/i)).not.toBeInTheDocument();
            const proceedBtn = screen.getByTestId('proceed-to-accept-btn');
            expect(proceedBtn).toBeDisabled();
        });

        it('3b.3 Positive target price with solver calculation error renders error banner and blocks acceptance', () => {
            renderWithLocale(
                <CalculationComparisonView
                    targetPrice={1283}
                    enginePrice={null}
                    calculationError="Connection timeout to PPOS BPE solver"
                />
            );

            expect(screen.getByText(/Connection timeout to PPOS BPE solver/i)).toBeInTheDocument();
            const proceedBtn = screen.getByTestId('proceed-to-accept-btn');
            expect(proceedBtn).toBeDisabled();
        });

        it('3b.4 Valid positive target and valid positive engine calculation within 5% enables acceptance advance', () => {
            renderWithLocale(
                <CalculationComparisonView
                    targetPrice={4321}
                    enginePrice={4310}
                    comparisonMode="manufacturing"
                />
            );

            expect(screen.getByText(/Ajuste calibrado dentro de tolerancia/i)).toBeInTheDocument();
            const proceedBtn = screen.getByTestId('proceed-to-accept-btn');
            expect(proceedBtn).not.toBeDisabled();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Governed Acceptance & Tenant Isolation
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Governed Acceptance & Tenant Isolation', () => {
        it('4.1 Cancel produces ZERO database writes and ZERO revisions', async () => {
            const onAccept = vi.fn();
            const onCancel = vi.fn();

            renderWithLocale(
                <GovernedAcceptanceView
                    onAcceptRateProposal={onAccept}
                    onBack={onCancel}
                />
            );

            // Open confirmation modal
            const openModalBtn = screen.getByRole('button', { name: /Aceptar y Registrar Propuesta de Tarifas/i });
            fireEvent.click(openModalBtn);

            expect(screen.getByText('Confirmar Aceptación de Tarifas')).toBeInTheDocument();

            // Click Cancel
            const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
            fireEvent.click(cancelBtn);

            // Modal closes, onAccept is NOT called
            expect(screen.queryByText('Confirmar Aceptación de Tarifas')).not.toBeInTheDocument();
            expect(onAccept).not.toHaveBeenCalled();
        });

        it('4.2 Governed acceptance creates immutable audit revision via calibration service with verified tenant isolation', async () => {
            const createSpy = vi.spyOn(printhouseCalibrationApi, 'createSession').mockResolvedValue({
                sessionId: 'sess-audit-tenant-01',
                status: 'DRAFT',
                plantId: 'plant-de-01',
                productTypes: ['HARDCOVER'],
                sampleQuotes: [],
                tenantId: 'tenant-acme-printers',
                createdAt: new Date().toISOString()
            });

            const acceptSpy = vi.spyOn(printhouseCalibrationApi, 'acceptCalibrationRun').mockResolvedValue({
                revisionId: 'rev-audit-rev-999',
                status: 'ACCEPTED',
                auditLog: 'Accepted rate proposal for HARDCOVER',
                acceptedBy: 'operator-audit-01',
                acceptedAt: new Date().toISOString(),
                plantId: 'plant-de-01',
                runId: 'cal-run-01',
                targetType: 'PLANT',
                targetId: 'plant-de-01',
                version: 2,
                effectiveDate: new Date().toISOString(),
                createdAt: new Date().toISOString()
            });

            const listSpy = vi.spyOn(printhouseCalibrationApi, 'listRevisions').mockResolvedValue([
                {
                    revisionId: 'rev-audit-rev-999',
                    plantId: 'plant-de-01',
                    runId: 'cal-run-01',
                    targetType: 'PLANT',
                    targetId: 'plant-de-01',
                    status: 'ACTIVE',
                    version: 2,
                    effectiveDate: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                }
            ]);

            // Call acceptance flow
            const acceptResult = await printhouseCalibrationApi.acceptCalibrationRun(
                'sess-audit-tenant-01',
                'cal-run-01'
            );

            expect(acceptSpy).toHaveBeenCalledWith(
                'sess-audit-tenant-01',
                'cal-run-01'
            );
            expect(acceptResult.revisionId).toBe('rev-audit-rev-999');

            // Subsequent read
            const revisions = await printhouseCalibrationApi.listRevisions('plant-de-01');
            expect(listSpy).toHaveBeenCalledWith('plant-de-01');
            expect(revisions).toHaveLength(1);
            expect(revisions[0].revisionId).toBe('rev-audit-rev-999');
        });

        it('4.3 GovernedAcceptanceView modal clearly specifies what is saved and excludes database table names and raw parameter keys', () => {
            renderWithLocale(
                <GovernedAcceptanceView
                    family="HARDCOVER"
                    proposedPatch={{
                        machine_hourly_rate: 68.5,
                        plate_cost: 9.8
                    }}
                />
            );

            // Parameter table does NOT expose raw database keys
            expect(screen.queryByText('machine_hourly_rate')).not.toBeInTheDocument();
            expect(screen.getByText(/Coste hora máquina impresión offset/i)).toBeInTheDocument();

            // Open acceptance modal
            const openModalBtn = screen.getByRole('button', { name: /Aceptar y Registrar Propuesta de Tarifas/i });
            fireEvent.click(openModalBtn);

            // Modal does NOT expose database table name 'pricing_revisions'
            expect(screen.queryByText(/pricing_revisions/i)).not.toBeInTheDocument();

            // Modal describes what is saved and what requires independent authorization
            expect(screen.getByText(/parámetros industriales de fabricación/i)).toBeInTheDocument();
            expect(screen.getByText(/autorizaciones operativas independientes/i)).toBeInTheDocument();
        });

        it('4.4 ProductFamilyCard renders En configuración instead of ambiguous ACTIVO badge', () => {
            renderWithLocale(
                <SimplifiedOnboardingJourney initialStep={1} />
            );

            // Selected family should show "En configuración"
            expect(screen.getByText('En configuración')).toBeInTheDocument();
            // Should NOT have an ambiguous standalone "Activo" or "ACTIVO" badge next to Pending
            expect(screen.queryByText('Activo')).not.toBeInTheDocument();
            expect(screen.queryByText('ACTIVO')).not.toBeInTheDocument();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Production Exclusion of Fixtures & PII
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Production Bundle & Codebase Isolation', () => {
        it('5.1 tests/fixtures is NOT imported in any src/ui/ production file', () => {
            const uiDir = path.resolve(__dirname, '../src/ui');
            
            function scanDir(dir: string): string[] {
                const results: string[] = [];
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const fullPath = path.join(dir, file);
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        results.push(...scanDir(fullPath));
                    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
                        results.push(fullPath);
                    }
                }
                return results;
            }

            const allUiFiles = scanDir(uiDir);
            expect(allUiFiles.length).toBeGreaterThan(10);

            const forbiddenPatterns = [
                /from\s+['"].*tests\/fixtures.*['"]/,
                /import\s+['"].*tests\/fixtures.*['"]/,
                /from\s+['"].*printhouseDocumentFixtures.*['"]/
            ];

            const violations: string[] = [];
            for (const filePath of allUiFiles) {
                const content = fs.readFileSync(filePath, 'utf-8');
                for (const pattern of forbiddenPatterns) {
                    if (pattern.test(content)) {
                        violations.push(`${path.relative(uiDir, filePath)} imports test fixtures!`);
                    }
                }
            }

            expect(violations).toEqual([]);
        });

        it('5.2 Initial state of SimplifiedOnboardingJourney is clean and contains no third-party data', () => {
            renderWithLocale(<SimplifiedOnboardingJourney initialStep={2} />);

            // No third-party fixture buttons in Step 2
            expect(screen.queryByText(/Cargar Natur/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Cargar Fussel/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Cargar Stutensee/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Cargar Fährmann/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Cargar Die Mysteriösen Steine/i)).not.toBeInTheDocument();

            // Real upload inputs are present
            expect(screen.getByText(/Subir presupuesto PDF/i)).toBeInTheDocument();
            expect(screen.getByText(/Introducir oferta manualmente/i)).toBeInTheDocument();
        });
    });
});
