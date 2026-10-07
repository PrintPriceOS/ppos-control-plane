import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { PricingPanel } from '../src/ui/components/printhouse/setup/PricingPanel';
import { printhouseCalibrationApi } from '../src/ui/lib/printhouseCalibrationApi';

describe('Pricing Workflow Navigation & State Conservation Regressions', () => {
    let fetchMock: any;

    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        vi.spyOn(printhouseCalibrationApi, 'listSessions').mockResolvedValue([]);
        vi.spyOn(printhouseCalibrationApi, 'listRuns').mockResolvedValue([]);

        fetchMock = vi.fn().mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/pricing/industrial')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            nodeId: 'node-berlin-01',
                            nodeName: 'Fährmann Druckzentrum GmbH',
                            signatures: [16, 24, 32],
                            deliveryTime: '14 days',
                            productionLeadDays: 11,
                            limits: { min_copies: 50, max_pages: 1500 },
                            rates: {
                                min_order: 95.0,
                                setup_fixed: 42.0,
                                lam_fixed: { varnish: 0, gloss: 6.0, matt: 6.0 },
                                lam_var_per_1000: { varnish: 0, gloss: 25.0, matt: 25.0 },
                                transport_costs: { es: 1.25 }
                            },
                            baselineChecksum: 'a'.repeat(64)
                        }
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/price-books')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: [] })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, data: {} })
            });
        });
        global.fetch = fetchMock;
    });

    const renderPricingPanel = () => {
        return render(
            <MemoryRouter>
                <LocaleProvider initialLocale="en">
                    <PricingPanel sites={[{ siteId: 'site-1', siteName: 'Plant 1' }]} />
                </LocaleProvider>
            </MemoryRouter>
        );
    };

    it('1. Navigation sequence: Products → Assistant → Products preserves mounted containers', async () => {
        const { container } = renderPricingPanel();

        // Initially in onboarding workflow
        const onboardingContainer = container.querySelector('#pricing-workflow-onboarding');
        const assistantContainer = container.querySelector('#pricing-workflow-assistant');
        const manualContainer = container.querySelector('#pricing-workflow-manual');

        expect(onboardingContainer).toHaveClass('block');
        expect(assistantContainer).toHaveClass('hidden');
        expect(manualContainer).toHaveClass('hidden');

        // Switch to Assistant via exact button id
        const assistantBtn = container.querySelector('#pricing-mode-assistant-btn') as HTMLButtonElement;
        expect(assistantBtn).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(assistantBtn);
        });

        expect(assistantContainer).toHaveClass('block');
        expect(onboardingContainer).toHaveClass('hidden');
        expect(manualContainer).toHaveClass('hidden');

        // Switch back to Products via top tab button
        const productsBtn = container.querySelector('#pricing-mode-onboarding-btn') as HTMLButtonElement;
        expect(productsBtn).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(productsBtn);
        });

        expect(onboardingContainer).toHaveClass('block');
        expect(assistantContainer).toHaveClass('hidden');
    });

    it('2. Navigation sequence: Products → Manual → Products preserves un-submitted draft edits', async () => {
        const { container } = renderPricingPanel();

        // 1. Switch to Manual Rates via exact button id
        const manualBtn = container.querySelector('#pricing-mode-manual-btn') as HTMLButtonElement;
        expect(manualBtn).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(manualBtn);
        });

        const manualContainer = container.querySelector('#pricing-workflow-manual');
        expect(manualContainer).toHaveClass('block');

        // 2. Edit an input inside manual rates
        await waitFor(() => {
            expect(screen.getByDisplayValue('14 days')).toBeInTheDocument();
        });
        const deliveryInput = screen.getByDisplayValue('14 days');
        await act(async () => {
            fireEvent.change(deliveryInput, { target: { value: '28 days expedited draft' } });
        });
        expect(screen.getByDisplayValue('28 days expedited draft')).toBeInTheDocument();

        // 3. Switch back to Products & Quotes via top tab
        const productsBtn = container.querySelector('#pricing-mode-onboarding-btn') as HTMLButtonElement;
        await act(async () => {
            fireEvent.click(productsBtn);
        });

        const onboardingContainer = container.querySelector('#pricing-workflow-onboarding');
        expect(onboardingContainer).toHaveClass('block');
        expect(manualContainer).toHaveClass('hidden');

        // 4. Switch back to Manual Rates -> Draft must be strictly preserved!
        await act(async () => {
            fireEvent.click(manualBtn);
        });
        expect(manualContainer).toHaveClass('block');
        expect(screen.getByDisplayValue('28 days expedited draft')).toBeInTheDocument();
    });

    it('3. Contextual 4-family ribbon appears in Assistant & Manual and navigates to selected family', async () => {
        const { container } = renderPricingPanel();

        // Switch to Assistant
        const assistantBtn = container.querySelector('#pricing-mode-assistant-btn') as HTMLButtonElement;
        await act(async () => {
            fireEvent.click(assistantBtn);
        });

        // 4-family ribbon is visible with data-testid
        const ribbon = screen.getByTestId('pricing-family-ribbon');
        expect(ribbon).toBeInTheDocument();

        // Click Hardcover button inside ribbon
        const hardcoverBtn = within(ribbon).getByRole('button', { name: /Hardcover/i });
        await act(async () => {
            fireEvent.click(hardcoverBtn);
        });

        // Should return to onboarding view with onboarding container visible
        const onboardingContainer = container.querySelector('#pricing-workflow-onboarding');
        expect(onboardingContainer).toHaveClass('block');
    });

    it('4. Switching tabs maintains mounted views without triggering repeated initial fetch requests', async () => {
        const { container } = renderPricingPanel();

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/api/printhouse/onboarding/pricing/industrial'),
                expect.anything()
            );
        });

        const assistantBtn = container.querySelector('#pricing-mode-assistant-btn') as HTMLButtonElement;
        const manualBtn = container.querySelector('#pricing-mode-manual-btn') as HTMLButtonElement;
        const productsBtn = container.querySelector('#pricing-mode-onboarding-btn') as HTMLButtonElement;

        await act(async () => {
            fireEvent.click(assistantBtn);
        });
        await act(async () => {
            fireEvent.click(manualBtn);
        });
        await act(async () => {
            fireEvent.click(productsBtn);
        });

        // Fetch count should NOT re-trigger initial industrial GET since views remain mounted
        const industrialFetches = fetchMock.mock.calls.filter((c: any) =>
            c[0].includes('/api/printhouse/onboarding/pricing/industrial')
        );
        expect(industrialFetches.length).toBe(1);
    });

    it('5. Real regression: edit Softcover offer -> open Assistant -> click Hardcover in ribbon -> verify family, budget, step and session references', async () => {
        const { container } = renderPricingPanel();

        // 1. In Step 1, select Softcover family to calibrate
        const softcoverCardBtn = screen.getByRole('button', { name: /Select family Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverCardBtn);
        });

        // Verify we are now on Step 2 with Softcover selected
        expect(screen.getByText(/Softcover \/ Paperback/i)).toBeInTheDocument();

        // 2. Edit quote reference on the Softcover offer
        const quoteRefInput = screen.getByPlaceholderText(/(OFERTA-2026-001|QUOTE-2026-001|ANGEBOT-2026-001)/i);
        await act(async () => {
            fireEvent.change(quoteRefInput, { target: { value: 'OFERTA-SOFTCOVER-42' } });
        });
        expect(screen.getByDisplayValue('OFERTA-SOFTCOVER-42')).toBeInTheDocument();

        // 3. Switch to AI Assistant mode
        const assistantBtn = container.querySelector('#pricing-mode-assistant-btn') as HTMLButtonElement;
        await act(async () => {
            fireEvent.click(assistantBtn);
        });

        // 4. In 4-family ribbon, click Hardcover (a different family)
        const ribbon = screen.getByTestId('pricing-family-ribbon');
        const hardcoverBtn = within(ribbon).getByRole('button', { name: /Hardcover/i });
        await act(async () => {
            fireEvent.click(hardcoverBtn);
        });

        // 5. Verification on transition to Hardcover:
        // - Returned to onboarding view
        const onboardingContainer = container.querySelector('#pricing-workflow-onboarding');
        expect(onboardingContainer).toHaveClass('block');
        // - The Softcover budget/offer reference 'OFERTA-SOFTCOVER-42' is NOT leaked into Hardcover
        expect(screen.queryByDisplayValue('OFERTA-SOFTCOVER-42')).not.toBeInTheDocument();
        // - It cleanly returned to Step 1 selector for Hardcover
        expect(screen.getByRole('heading', { name: /What products (you produce|do you manufacture)|Qué productos fabricas/i })).toBeInTheDocument();

        // 6. Now switch to Assistant and click Softcover again in the ribbon
        await act(async () => {
            fireEvent.click(assistantBtn);
        });
        const ribbonReopen = screen.getByTestId('pricing-family-ribbon');
        const softcoverRibbonBtn = within(ribbonReopen).getByRole('button', { name: /Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverRibbonBtn);
        });

        // 7. Verify Softcover draft was protected and restored:
        expect(onboardingContainer).toHaveClass('block');
        expect(screen.getByDisplayValue('OFERTA-SOFTCOVER-42')).toBeInTheDocument();

        // 8. If clicking the same family (Softcover) in ribbon again:
        await act(async () => {
            fireEvent.click(assistantBtn);
        });
        const ribbonSame = screen.getByTestId('pricing-family-ribbon');
        const softcoverSameBtn = within(ribbonSame).getByRole('button', { name: /Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverSameBtn);
        });
        // Preserved intact without reset
        expect(screen.getByDisplayValue('OFERTA-SOFTCOVER-42')).toBeInTheDocument();
    });

    it('6. Pending upload in Softcover -> switch to Hardcover -> late resolution leaves Hardcover intact', async () => {
        let resolveUpload: (val: any) => void = () => {};
        const uploadPromise = new Promise((resolve) => {
            resolveUpload = resolve;
        });

        fetchMock.mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/quote-evidence/upload')) {
                return uploadPromise.then((data) => ({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data })
                }));
            }
            if (url.includes('/api/printhouse/onboarding/pricing/industrial')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            nodeId: 'node-berlin-01',
                            nodeName: 'Fährmann Druckzentrum GmbH',
                            signatures: [16, 24, 32],
                            rates: { min_order: 95.0 }
                        }
                    })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, data: {} })
            });
        });

        const { container } = renderPricingPanel();

        // 1. In Step 1, select Softcover family to calibrate
        const softcoverCardBtn = screen.getByRole('button', { name: /Select family Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverCardBtn);
        });
        expect(screen.getByText(/Softcover \/ Paperback/i)).toBeInTheDocument();

        // 2. Trigger an upload in Softcover with pending promise
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeInTheDocument();
        const dummyFile = new File(['dummy content'], 'pending-softcover.pdf', { type: 'application/pdf' });
        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [dummyFile] } });
        });

        // Verify upload indicator is active
        expect(screen.getByTestId('uploading-spinner')).toBeInTheDocument();

        // 3. Switch family to Hardcover while upload is pending
        const assistantBtn = container.querySelector('#pricing-mode-assistant-btn') as HTMLButtonElement;
        await act(async () => {
            fireEvent.click(assistantBtn);
        });

        const ribbon = screen.getByTestId('pricing-family-ribbon');
        const hardcoverBtn = within(ribbon).getByRole('button', { name: /Hardcover/i });
        await act(async () => {
            fireEvent.click(hardcoverBtn);
        });

        // 4. Hardcover is active, Step 1 selector is shown, and upload indicator is cleared
        expect(screen.queryByTestId('uploading-spinner')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /What products (you produce|do you manufacture)|Qué productos fabricas/i })).toBeInTheDocument();

        // 5. Late resolution of the pending upload with Softcover data
        await act(async () => {
            resolveUpload({
                productTitle: 'LATE SOFTCOVER EVIDENCE BOOK',
                quoteRef: 'REF-LATE-SOFTCOVER-999',
                quantity: 500,
                manufacturingPrice: 850,
                totalPrice: 950,
                runs: [
                    {
                        id: 'run-late-1',
                        variantKey: 'run-late-1',
                        quantity: 500,
                        manufacturingPrice: 850,
                        transportPrice: 100,
                        totalPrice: 950,
                        quotedTotalPrice: 950,
                        quotedUnitPrice: 1.9,
                        validationStatus: 'CONSISTENT'
                    }
                ]
            });
        });

        // 6. Assert Hardcover remains 100% intact:
        expect(screen.queryByText(/LATE SOFTCOVER EVIDENCE BOOK/i)).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue('REF-LATE-SOFTCOVER-999')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /What products (you produce|do you manufacture)|Qué productos fabricas/i })).toBeInTheDocument();
    });

    it('7. Arrive at calculation step, click "Calcular" with pending calculateCalibration -> switch to Hardcover -> late resolution does not inject run, comparison or proposedPatch into Hardcover', async () => {
        vi.spyOn(printhouseCalibrationApi, 'createSession').mockResolvedValue({ id: 'sess-softcover-pending', printerNodeId: 'node-berlin-01' } as any);
        vi.spyOn(printhouseCalibrationApi, 'getSession').mockResolvedValue(null);
        vi.spyOn(printhouseCalibrationApi, 'markSessionReady').mockResolvedValue({ status: 'READY' } as any);

        let resolveCalc: (val: any) => void = () => {};
        const calcPromise = new Promise((resolve) => {
            resolveCalc = resolve;
        });

        let callCount = 0;
        const calcSpy = vi.spyOn(printhouseCalibrationApi, 'calculateCalibration').mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return {
                    id: 'run-initial-baseline',
                    targetPrice: 1250,
                    enginePriceAfter: 1240,
                    absoluteResidual: 10,
                    percentResidual: 0.8,
                    proposedPatch: { min_order: 100 }
                };
            }
            return calcPromise as any;
        });

        fetchMock.mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/quote-evidence/upload')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            productTitle: 'Softcover Catalog 2026',
                            quoteRef: 'REF-SOFT-001',
                            quantity: 1000,
                            manufacturingPrice: 1250,
                            totalPrice: 1400,
                            runs: [{ id: 'run-soft-1', quantity: 1000, manufacturingPrice: 1250, transportPrice: 150, totalPrice: 1400, quotedTotalPrice: 1400, validationStatus: 'CONSISTENT' }]
                        }
                    })
                });
            }
            if (url.includes('/api/printhouse/onboarding/pricing/industrial')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            nodeId: 'node-berlin-01',
                            nodeName: 'Fährmann Druckzentrum GmbH',
                            signatures: [16, 24, 32],
                            rates: { min_order: 95.0 }
                        }
                    })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, data: {} })
            });
        });

        const { container } = renderPricingPanel();

        // 1. Select Softcover to calibrate
        const softcoverCardBtn = screen.getByRole('button', { name: /Select family Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverCardBtn);
        });

        // 2. Upload quote -> automatically reaches Step 3
        const softFileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        const softFile = new File(['softcover content'], 'softcover-quote.pdf', { type: 'application/pdf' });
        await act(async () => {
            fireEvent.change(softFileInput, { target: { files: [softFile] } });
        });

        // 3. Arrive at Step 4 (calculation step)
        const compareBtn = await screen.findByTestId('proceed-to-compare-btn');
        await act(async () => {
            fireEvent.click(compareBtn);
        });

        // In Step 4, find "Calcular" button (data-testid="run-solver-btn")
        const runSolverBtn = await screen.findByTestId('run-solver-btn');
        expect(runSolverBtn).toBeInTheDocument();
        expect(runSolverBtn).not.toBeDisabled();

        // 4. Pulse "Calcular"
        await act(async () => {
            fireEvent.click(runSolverBtn);
        });

        // Comprueba que calculateCalibration fue invocado y queda pendiente
        expect(calcSpy).toHaveBeenCalledTimes(2);
        expect(runSolverBtn).toBeDisabled();
        expect(screen.getByText(/Calculando solver...|Calculando con solver inverso/i)).toBeInTheDocument();

        // 5. Cambia de Softcover a Hardcover
        const assistantBtn = container.querySelector('#pricing-mode-assistant-btn') as HTMLButtonElement;
        await act(async () => {
            fireEvent.click(assistantBtn);
        });
        const ribbon = screen.getByTestId('pricing-family-ribbon');
        const hardcoverRibbonBtn = within(ribbon).getByRole('button', { name: /Hardcover/i });
        await act(async () => {
            fireEvent.click(hardcoverRibbonBtn);
        });

        // Verify Hardcover is active, Step 1 shown, spinners cleared
        expect(screen.queryByTestId('uploading-spinner')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /What products (you produce|do you manufacture)|Qué productos fabricas/i })).toBeInTheDocument();

        // 6. Resuelve la promesa tardía de Softcover
        await act(async () => {
            resolveCalc({
                id: 'run-softcover-stale-999',
                targetPrice: 1250,
                enginePriceAfter: 1240,
                absoluteResidual: 10,
                percentResidual: 0.8,
                proposedPatch: { min_order: 888.88, setup_fixed: 999.99 }
            });
        });

        // 7. Verifica que no se incorporan run, comparación ni proposedPatch de Softcover a Hardcover
        expect(screen.queryByText(/888.88/)).not.toBeInTheDocument();
        expect(screen.queryByText(/999.99/)).not.toBeInTheDocument();
        expect(screen.queryByText(/run-softcover-stale-999/)).not.toBeInTheDocument();
        expect(screen.queryByText(/1240.00/)).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /What products (you produce|do you manufacture)|Qué productos fabricas/i })).toBeInTheDocument();
    });

    it('8. Families with distinct proposed patches and sessions: restored draft strictly preserves correct session ID, run ID, and proposedPatch values', async () => {
        vi.spyOn(printhouseCalibrationApi, 'createSession').mockImplementation(async (payload: any) => {
            if (payload.referenceBookName?.includes('Softcover') || payload.bookSpec?.family === 'SOFTCOVER') {
                return { id: 'session-softcover-101', printerNodeId: payload.printerNodeId };
            }
            return { id: 'session-hardcover-202', printerNodeId: payload.printerNodeId };
        });

        vi.spyOn(printhouseCalibrationApi, 'getSession').mockResolvedValue(null);
        vi.spyOn(printhouseCalibrationApi, 'markSessionReady').mockResolvedValue({ status: 'READY' } as any);

        vi.spyOn(printhouseCalibrationApi, 'calculateCalibration').mockImplementation(async (sessId: string) => {
            if (sessId === 'session-softcover-101') {
                return {
                    id: 'run-soft-1',
                    targetPrice: 1250,
                    enginePriceAfter: 1240,
                    absoluteResidual: 10,
                    percentResidual: 0.8,
                    proposedPatch: { min_order: 120, lam_gloss_rate: 19.5 }
                };
            }
            return {
                id: 'run-hard-2',
                targetPrice: 2800,
                enginePriceAfter: 2790,
                absoluteResidual: 10,
                percentResidual: 0.35,
                proposedPatch: { setup_fixed: 65, board_thickness_cost: 45.0 }
            };
        });

        let currentFamilyForUpload = 'SOFTCOVER';
        fetchMock.mockImplementation((url: string, opts?: any) => {
            if (url.includes('/api/printhouse/onboarding/quote-evidence/upload')) {
                if (currentFamilyForUpload === 'SOFTCOVER') {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            ok: true,
                            data: {
                                productTitle: 'Softcover Catalog 2026',
                                quoteRef: 'REF-SOFT-101',
                                quantity: 1000,
                                manufacturingPrice: 1250,
                                totalPrice: 1400,
                                runs: [{ id: 'run-soft-1', quantity: 1000, manufacturingPrice: 1250, transportPrice: 150, totalPrice: 1400, quotedTotalPrice: 1400, validationStatus: 'CONSISTENT' }]
                            }
                        })
                    });
                } else {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            ok: true,
                            data: {
                                productTitle: 'Hardcover Deluxe 2026',
                                quoteRef: 'REF-HARD-202',
                                quantity: 500,
                                manufacturingPrice: 2800,
                                totalPrice: 3000,
                                runs: [{ id: 'run-hard-2', quantity: 500, manufacturingPrice: 2800, transportPrice: 200, totalPrice: 3000, quotedTotalPrice: 3000, validationStatus: 'CONSISTENT' }]
                            }
                        })
                    });
                }
            }
            if (url.includes('/api/printhouse/onboarding/pricing/industrial')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            nodeId: 'node-berlin-01',
                            nodeName: 'Fährmann Druckzentrum GmbH',
                            signatures: [16, 24, 32],
                            rates: { min_order: 95.0 }
                        }
                    })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true, data: {} })
            });
        });

        const { container } = renderPricingPanel();

        // 1. Select Softcover to calibrate
        const softcoverCardBtn = screen.getByRole('button', { name: /Select family Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverCardBtn);
        });

        // Upload Softcover quote -> advances automatically to Step 3
        const softFileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(softFileInput).toBeInTheDocument();
        const softFile = new File(['softcover quote content'], 'softcover-spec.pdf', { type: 'application/pdf' });
        await act(async () => {
            fireEvent.change(softFileInput, { target: { files: [softFile] } });
        });

        // Step 3 -> Proceed to calculate (Step 4)
        const compareBtn = await screen.findByTestId('proceed-to-compare-btn');
        await act(async () => {
            fireEvent.click(compareBtn);
        });

        // Run solver in Softcover
        const runSolverBtn = screen.getByTestId('run-solver-btn');
        await act(async () => {
            fireEvent.click(runSolverBtn);
        });

        // Advance to Step 5
        const proceedAcceptBtn = await screen.findByTestId('proceed-to-accept-btn');
        await waitFor(() => expect(proceedAcceptBtn).not.toBeDisabled());
        await act(async () => {
            fireEvent.click(proceedAcceptBtn);
        });

        // Verify Step 5 in Softcover displays Softcover proposed patch and IDs
        expect(screen.getByText(/19.50/)).toBeInTheDocument();
        expect(screen.getByText(/120.00/)).toBeInTheDocument();
        const initialSoftView = screen.getByTestId('governed-acceptance-view');
        expect(initialSoftView).toHaveAttribute('data-session-id', 'session-softcover-101');
        expect(initialSoftView).toHaveAttribute('data-run-id', 'run-soft-1');

        // 2. Switch to Hardcover via Assistant ribbon
        const assistantBtn = container.querySelector('#pricing-mode-assistant-btn') as HTMLButtonElement;
        await act(async () => {
            fireEvent.click(assistantBtn);
        });
        const ribbon = screen.getByTestId('pricing-family-ribbon');
        const hardcoverRibbonBtn = within(ribbon).getByRole('button', { name: /Hardcover/i });
        await act(async () => {
            fireEvent.click(hardcoverRibbonBtn);
        });

        // In Hardcover, select family to calibrate -> Step 2
        const hardcoverCardBtn = screen.getByRole('button', { name: /Select family Hardcover/i });
        await act(async () => {
            fireEvent.click(hardcoverCardBtn);
        });

        // Upload Hardcover quote -> advances to Step 3
        currentFamilyForUpload = 'HARDCOVER';
        const hardFileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(hardFileInput).toBeInTheDocument();
        const hardFile = new File(['hardcover quote content'], 'hardcover-spec.pdf', { type: 'application/pdf' });
        await act(async () => {
            fireEvent.change(hardFileInput, { target: { files: [hardFile] } });
        });

        // Step 3 -> Step 4 -> calculate
        const compareHardBtn = await screen.findByTestId('proceed-to-compare-btn');
        await act(async () => {
            fireEvent.click(compareHardBtn);
        });
        const runHardSolverBtn = screen.getByTestId('run-solver-btn');
        await act(async () => {
            fireEvent.click(runHardSolverBtn);
        });

        // Advance Hardcover to Step 5
        const proceedHardAccept = await screen.findByTestId('proceed-to-accept-btn');
        await waitFor(() => expect(proceedHardAccept).not.toBeDisabled());
        await act(async () => {
            fireEvent.click(proceedHardAccept);
        });

        // Verify Hardcover Step 5 displays Hardcover's proposal and IDs, NOT Softcover's
        expect(screen.getByText(/45.00/)).toBeInTheDocument();
        expect(screen.getByText(/65.00/)).toBeInTheDocument();
        expect(screen.queryByText(/19.50/)).not.toBeInTheDocument();
        const hardView = screen.getByTestId('governed-acceptance-view');
        expect(hardView).toHaveAttribute('data-session-id', 'session-hardcover-202');
        expect(hardView).toHaveAttribute('data-run-id', 'run-hard-2');

        // 3. Switch back to Softcover via ribbon -> must restore Softcover's session ID, run ID, and proposedPatch!
        await act(async () => {
            fireEvent.click(assistantBtn);
        });
        const ribbonReopen = screen.getByTestId('pricing-family-ribbon');
        const softcoverRibbonReopen = within(ribbonReopen).getByRole('button', { name: /Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverRibbonReopen);
        });

        // Verify restored proposedPatch values
        expect(screen.getByText(/19.50/)).toBeInTheDocument();
        expect(screen.getByText(/120.00/)).toBeInTheDocument();
        expect(screen.queryByText(/45.00/)).not.toBeInTheDocument();
        expect(screen.queryByText(/65.00/)).not.toBeInTheDocument();

        // Verify restored draft IDs
        const restoredSoftView = screen.getByTestId('governed-acceptance-view');
        expect(restoredSoftView).toHaveAttribute('data-session-id', 'session-softcover-101');
        expect(restoredSoftView).toHaveAttribute('data-run-id', 'run-soft-1');

        // Verify that accepting the restored Softcover proposal dispatches the exact session and run IDs
        const acceptSpy = vi.spyOn(printhouseCalibrationApi, 'acceptCalibrationRun').mockResolvedValue({ status: 'ACCEPTED' } as any);
        const openModalBtn = screen.getByTestId('open-accept-modal-btn');
        await act(async () => {
            fireEvent.click(openModalBtn);
        });
        const confirmAcceptBtn = screen.getByTestId('confirm-accept-proposal-btn');
        await act(async () => {
            fireEvent.click(confirmAcceptBtn);
        });
        expect(acceptSpy).toHaveBeenCalledWith('session-softcover-101', 'run-soft-1');

        // 4. Switch to a brand new family (Wire-O) via ribbon -> proposal and state must be explicitly cleaned
        await act(async () => {
            fireEvent.click(assistantBtn);
        });
        const ribbonWire = screen.getByTestId('pricing-family-ribbon');
        const wireRibbonBtn = within(ribbonWire).getByRole('button', { name: /Wire-O/i });
        await act(async () => {
            fireEvent.click(wireRibbonBtn);
        });

        // Wire-O is a clean new family:
        expect(screen.getByRole('heading', { name: /What products (you produce|do you manufacture)|Qué productos fabricas/i })).toBeInTheDocument();
        expect(screen.queryByText(/19.50/)).not.toBeInTheDocument();
        expect(screen.queryByText(/45.00/)).not.toBeInTheDocument();
        expect(screen.queryByTestId('governed-acceptance-view')).not.toBeInTheDocument();
    });

    it('9. Selecting the same family in ribbon strictly preserves current draft, inputs and step', async () => {
        const { container } = renderPricingPanel();

        // 1. Select Softcover to calibrate
        const softcoverCardBtn = screen.getByRole('button', { name: /Select family Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverCardBtn);
        });

        // Edit quote reference
        const quoteRefInput = screen.getByPlaceholderText(/(OFERTA-2026-001|QUOTE-2026-001|ANGEBOT-2026-001)/i);
        await act(async () => {
            fireEvent.change(quoteRefInput, { target: { value: 'OFERTA-PRESERVED-SAME-FAMILY' } });
        });
        expect(screen.getByDisplayValue('OFERTA-PRESERVED-SAME-FAMILY')).toBeInTheDocument();

        // 2. Open Assistant
        const assistantBtn = container.querySelector('#pricing-mode-assistant-btn') as HTMLButtonElement;
        await act(async () => {
            fireEvent.click(assistantBtn);
        });

        // Click Softcover (same family) in ribbon
        const ribbon = screen.getByTestId('pricing-family-ribbon');
        const softcoverRibbonBtn = within(ribbon).getByRole('button', { name: /Softcover/i });
        await act(async () => {
            fireEvent.click(softcoverRibbonBtn);
        });

        // Verify state is completely preserved at Step 2 with existing input intact
        const onboardingContainer = container.querySelector('#pricing-workflow-onboarding');
        expect(onboardingContainer).toHaveClass('block');
        expect(screen.getByDisplayValue('OFERTA-PRESERVED-SAME-FAMILY')).toBeInTheDocument();
        expect(screen.getByText(/Softcover \/ Paperback/i)).toBeInTheDocument();
    });
});
