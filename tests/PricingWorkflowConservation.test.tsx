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
        const quoteRefInput = screen.getByPlaceholderText(/OFERTA-2026-001/i);
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
});
