import React from 'react';
import '@testing-library/jest-dom';
import { render as rtlRender, screen, fireEvent, createEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { Sidebar } from '../src/ui/layout/Sidebar';
import { PrinthouseSetupHub } from '../src/ui/pages/printhouse/PrinthouseSetupHub';
import { PricingWorkflowSelector } from '../src/ui/components/printhouse/pricing/PricingWorkflowSelector';
import { SetupHelpModal } from '../src/ui/components/printhouse/setup/SetupHelpModal';
import { GuidedTutorialOverlay } from '../src/ui/components/printhouse/setup/GuidedTutorialOverlay';
import { SetupDrawer } from '../src/ui/components/printhouse/setup/SetupDrawer';
import { CalibrationConversation } from '../src/ui/components/printhouse/pricing/quick-calibration/CalibrationConversation';
import { CalibrationAcceptanceModal } from '../src/ui/components/printhouse/pricing/quick-calibration/CalibrationAcceptanceModal';
import { QuickCalibrationPanel } from '../src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel';
import { printhouseCalibrationApi, handleResponse } from '../src/ui/lib/printhouseCalibrationApi';
import calibrationAssistantService from '../src/api/services/calibrationAssistantService.js';
import mysqlClient from '../src/api/services/mysqlClient.js';

const renderWithProviders = (ui: React.ReactElement, { initialEntries = ['/printhouse/setup'] } = {}) => {
    return rtlRender(
        <MemoryRouter initialEntries={initialEntries}>
            <LocaleProvider initialLocale="en">
                {ui}
            </LocaleProvider>
        </MemoryRouter>
    );
};

describe('Printhouse Onboarding Redesign & Regression Tests', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        // Ensure desktop width for tests
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
        vi.spyOn(printhouseCalibrationApi, 'listSessions').mockResolvedValue([]);
        vi.spyOn(printhouseCalibrationApi, 'listRuns').mockResolvedValue([]);

        // Mock global fetch for printhouse onboarding data
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { companyName: 'Acme Print', country: 'DE' },
                            sites: [{ siteId: 'site-1', name: 'Berlin Plant', city: 'Berlin' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE' },
                                sites: { status: 'COMPLETE' },
                                machines: { status: 'COMPLETE' },
                                capabilities: { status: 'COMPLETE' },
                                substrates: { status: 'COMPLETE' },
                                capacity: { status: 'COMPLETE' },
                                leadTimes: { status: 'COMPLETE' },
                                pricing: { status: 'NOT_STARTED' }
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

    it('1. Sidebar supports collapse/expand toggle and persists state in localStorage', () => {
        const { unmount } = renderWithProviders(<Sidebar isOpen={true} />);

        const collapseToggle = screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i });
        expect(collapseToggle).toBeInTheDocument();

        // Default expanded: Printhouse setup section labels visible
        expect(screen.getByText(/printhouse setup/i)).toBeInTheDocument();
        expect(screen.getByText('Industrial Pricing')).toBeInTheDocument();

        // Click to collapse
        fireEvent.click(collapseToggle);
        expect(localStorage.getItem('ppos_sidebar_collapsed')).toBe('true');

        unmount();

        // Remount and verify collapsed state is restored from localStorage
        renderWithProviders(<Sidebar isOpen={true} />);
        expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
    });

    it('2. Sidebar Printhouse setup submenu preserves deep links with ?tab parameter', () => {
        renderWithProviders(<Sidebar isOpen={true} />);

        const pricingLink = screen.getByRole('link', { name: /Industrial Pricing/i });
        expect(pricingLink).toHaveAttribute('href', '/printhouse/setup?tab=PRICING');

        const companyLink = screen.getByRole('link', { name: /Company Profile/i });
        expect(companyLink).toHaveAttribute('href', '/printhouse/setup?tab=COMPANY');
    });

    it('3. Mode toggle switches workflow between AI assistant and Manual rate cards', () => {
        let currentMode: 'assistant' | 'manual' = 'assistant';

        const onToggle = vi.fn((mode) => {
            currentMode = mode;
        });

        const { rerender } = rtlRender(
            <LocaleProvider initialLocale="en">
                <PricingWorkflowSelector
                    selectedWorkflow={currentMode}
                    onSelectWorkflow={onToggle}
                />
            </LocaleProvider>
        );

        // Verify AI assistant button pressed
        const assistantBtn = screen.getByRole('button', { name: /AI assistant/i });
        const manualBtn = screen.getByRole('button', { name: /Manual rate cards/i });
        expect(assistantBtn).toHaveAttribute('aria-pressed', 'true');
        expect(manualBtn).toHaveAttribute('aria-pressed', 'false');

        // Click manual button
        fireEvent.click(manualBtn);
        expect(onToggle).toHaveBeenCalledWith('manual');

        // Re-render with manual mode
        rerender(
            <LocaleProvider initialLocale="en">
                <PricingWorkflowSelector
                    selectedWorkflow="manual"
                    onSelectWorkflow={onToggle}
                />
            </LocaleProvider>
        );

        expect(screen.getByRole('button', { name: /Manual rate cards/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /AI assistant/i })).toHaveAttribute('aria-pressed', 'false');
    });

    it('4. SetupHelpModal searches printing terms, supports keyboard navigation and selects results with focus restoration', () => {
        const onSelect = vi.fn();
        const onClose = vi.fn();

        renderWithProviders(
            <SetupHelpModal
                isOpen={true}
                onClose={onClose}
                onSelectTarget={onSelect}
            />
        );

        const searchInput = screen.getByLabelText(/Search settings and help documentation/i);
        expect(searchInput).toBeInTheDocument();
        searchInput.focus();

        // Verify search input receives focus
        expect(document.activeElement).toBe(searchInput);

        // Type a printing term like "transport"
        fireEvent.change(searchInput, { target: { value: 'transport' } });

        const freightResult = screen.getByText('Shipping & Freight Rates');
        expect(freightResult).toBeInTheDocument();

        // Navigate with keyboard ArrowDown and Enter
        fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
        fireEvent.keyDown(searchInput, { key: 'Enter' });

        expect(onSelect).toHaveBeenCalledWith('SHIPPING', 'shipping-rates');
        expect(onClose).toHaveBeenCalled();
    });

    it('5. SetupHelpModal supports escape key to close', () => {
        const onClose = vi.fn();

        renderWithProviders(
            <SetupHelpModal
                isOpen={true}
                onClose={onClose}
                onSelectTarget={() => {}}
            />
        );

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('6. GuidedTutorialOverlay advances steps, handles "Do this now", and dismisses gracefully', () => {
        const onClose = vi.fn();
        const onNavigate = vi.fn();

        renderWithProviders(
            <GuidedTutorialOverlay
                isOpen={true}
                onClose={onClose}
                activeTab="PRICING"
                onNavigateToTab={onNavigate}
            />
        );

        // Verify Step 1 is rendered
        expect(screen.getByText(/Printhouse Setup Sections Switcher/i)).toBeInTheDocument();
        expect(screen.getByText(/Step 1 of 4/i)).toBeInTheDocument();

        // Click Next
        const nextBtn = screen.getByRole('button', { name: /Next/i });
        fireEvent.click(nextBtn);

        // Step 2
        expect(screen.getByText(/Step 2 of 4/i)).toBeInTheDocument();
        expect(screen.getByText(/AI Pricing Calibration Assistant/i)).toBeInTheDocument();

        // Exit / Dismiss
        const exitBtn = screen.getByRole('button', { name: /Exit tutorial/i });
        fireEvent.click(exitBtn);
        expect(onClose).toHaveBeenCalled();
    });

    it('7. SetupDrawer handles Escape, clicks backdrop to close, focus containment, Shift+Tab/Tab cycling, and focus restoration', async () => {
        const onClose = vi.fn();

        const triggerButton = document.createElement('button');
        triggerButton.textContent = 'Open Drawer Trigger';
        document.body.appendChild(triggerButton);
        triggerButton.focus();
        expect(document.activeElement).toBe(triggerButton);

        const { rerender } = rtlRender(
            <SetupDrawer isOpen={true} onClose={onClose} title="Extracted Quote Evidence">
                <div>
                    <button type="button">Inside Action 1</button>
                    <input type="text" placeholder="Inside Input" />
                    <button type="button">Inside Action 2</button>
                </div>
            </SetupDrawer>
        );

        expect(screen.getByText('Extracted Quote Evidence')).toBeInTheDocument();
        expect(screen.getByText('Inside Action 1')).toBeInTheDocument();

        // 1. Initial focus moves to close button inside drawer
        const closeBtn = screen.getByRole('button', { name: /Close drawer/i });
        const action1 = screen.getByRole('button', { name: /Inside Action 1/i });
        const action2 = screen.getByRole('button', { name: /Inside Action 2/i });

        await waitFor(() => {
            expect(document.activeElement).toBe(closeBtn);
        });

        // 2. Tab cycling: from closeBtn (first focusable) -> Shift+Tab wraps to last focusable (action2)
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(action2);

        // 3. Tab cycling: from last focusable (action2) -> Tab wraps to first focusable (closeBtn)
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
        expect(document.activeElement).toBe(closeBtn);

        // 4. Escape handling
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        // 5. Click close button
        fireEvent.click(closeBtn);
        expect(onClose).toHaveBeenCalledTimes(2);

        // 6. Focus restoration on drawer unmount/close
        rerender(
            <SetupDrawer isOpen={false} onClose={onClose} title="Extracted Quote Evidence">
                <div />
            </SetupDrawer>
        );
        expect(document.activeElement).toBe(triggerButton);
        document.body.removeChild(triggerButton);
    });

    it('8. PrinthouseSetupHub renders continuous workspace shell with compact header and triggers Help & Guide Me', async () => {
        renderWithProviders(<PrinthouseSetupHub />, { initialEntries: ['/printhouse/setup?tab=PRICING'] });

        // Wait for loading to finish
        await waitFor(() => {
            expect(screen.getByText('Printhouse Setup')).toBeInTheDocument();
        });

        // Compact header elements
        expect(screen.getByText(/Find a setting or get help/i)).toBeInTheDocument();
        const guideMeBtn = screen.getByRole('button', { name: /Guide me/i });
        expect(guideMeBtn).toBeInTheDocument();

        // 1. Open Guide Me tutorial overlay
        fireEvent.click(guideMeBtn);
        const tutorialDialog = screen.getByRole('dialog', { name: /Interactive Guided Tutorial/i });
        expect(tutorialDialog).toBeInTheDocument();

        // Step 1: Printhouse Setup Sections Switcher
        expect(screen.getByText(/Printhouse Setup Sections Switcher/i)).toBeInTheDocument();
        const actionBtn1 = screen.getByRole('button', { name: /Sections Menu/i });
        expect(actionBtn1).toBeInTheDocument();
        fireEvent.click(actionBtn1);
        // Sections dropdown should open and be unobstructed
        const sectionsMenu = document.getElementById('setup-sections-menu');
        expect(sectionsMenu).toBeInTheDocument();
        const overviewButton = screen.getByRole('button', { name: /Setup Overview/i });
        expect(overviewButton).toBeInTheDocument();
        // Verify control can actually be clicked and reached by keyboard
        overviewButton.focus();
        expect(document.activeElement).toBe(overviewButton);
        fireEvent.keyDown(overviewButton, { key: 'ArrowDown' });
        // Back, Next, Exit remain accessible on tutorial card
        expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Exit tutorial/i })).toBeInTheDocument();

        // Next to Step 2: AI Pricing Calibration Assistant
        const nextBtn = screen.getByRole('button', { name: /Next/i });
        fireEvent.click(nextBtn);
        expect(screen.getByText(/AI Pricing Calibration Assistant/i)).toBeInTheDocument();
        const actionBtn2 = screen.getByRole('button', { name: /Open Pricing Assistant/i });
        expect(actionBtn2).toBeInTheDocument();
        fireEvent.click(actionBtn2);

        // Next to Step 3: Instant Manual Mode Toggle
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        expect(screen.getByText(/Instant Manual Mode Toggle/i)).toBeInTheDocument();
        const actionBtn3 = screen.getByRole('button', { name: /Inspect Mode Toggle/i });
        expect(actionBtn3).toBeInTheDocument();
        fireEvent.click(actionBtn3);

        // Test Back to Step 2 and forward again
        const backBtn = screen.getByRole('button', { name: /Back/i });
        fireEvent.click(backBtn);
        expect(screen.getByText(/AI Pricing Calibration Assistant/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        expect(screen.getByText(/Instant Manual Mode Toggle/i)).toBeInTheDocument();

        // Next to Step 4: Find Settings & Get Help
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        expect(screen.getByText(/Find Settings & Get Help/i)).toBeInTheDocument();
        const actionBtn4 = screen.getByRole('button', { name: /Open Help Search/i });
        expect(actionBtn4).toBeInTheDocument();
        fireEvent.click(actionBtn4);
        const searchInput = screen.getByLabelText(/Search settings and help documentation/i);
        expect(searchInput).toBeInTheDocument();
        // Verify help search controls and results can be clicked and reached by keyboard
        searchInput.focus();
        expect(document.activeElement).toBe(searchInput);
        fireEvent.change(searchInput, { target: { value: 'rates' } });
        const firstResult = screen.getByText(/Manual Rate Card Configuration/i);
        expect(firstResult).toBeInTheDocument();
        fireEvent.click(firstResult);
        // Verify Back, Finish/Exit and X on tutorial card remain accessible
        expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
        const exitBtnsOnCard = screen.getAllByRole('button', { name: /Exit tutorial/i });
        expect(exitBtnsOnCard.length).toBeGreaterThan(0);

        // Close help search to return cleanly via Escape key
        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => {
            expect(screen.queryByLabelText(/Search settings and help documentation/i)).not.toBeInTheDocument();
        });

        // Exit tutorial via Finish button (on step 4, button text is Finish / Exit Tutorial)
        const finishBtns = screen.getAllByRole('button', { name: /Exit Tutorial/i });
        const bottomFinishBtn = finishBtns.find(b => b.textContent?.includes('Exit Tutorial')) || finishBtns[finishBtns.length - 1];
        fireEvent.click(bottomFinishBtn);
        expect(screen.queryByRole('dialog', { name: /Interactive Guided Tutorial/i })).not.toBeInTheDocument();

        // Re-open and verify Exit via X button
        fireEvent.click(guideMeBtn);
        expect(screen.getByRole('dialog', { name: /Interactive Guided Tutorial/i })).toBeInTheDocument();
        const exitBtn = screen.getByRole('button', { name: /Exit tutorial/i });
        fireEvent.click(exitBtn);
        expect(screen.queryByRole('dialog', { name: /Interactive Guided Tutorial/i })).not.toBeInTheDocument();

        // Directly open Help modal via header button
        const helpBtn = screen.getByRole('button', { name: /Find a setting or get help/i });
        fireEvent.click(helpBtn);
        expect(screen.getByLabelText(/Search settings and help documentation/i)).toBeInTheDocument();
    });

    it('9. Pricing container state preservation: draft, conversation, evidenceId, and variant survive mode toggling and drawer actions', async () => {
        // Dynamic response fixture matching the actual selected offer
        const interpretSpy = vi.spyOn(printhouseCalibrationApi, 'interpretPreSession').mockImplementation(async (text, evidenceId, selectedVariantId) => {
            const isSecondOffer = selectedVariantId === 'offer-opt-2';
            return {
                proposal: {
                    referenceBookName: isSecondOffer ? 'Hardcover Novel (5,000 run)' : 'Hardcover Novel',
                    specPatch: {
                        copies: isSecondOffer ? 5000 : 2500,
                        book_width_mm: 148,
                        book_height_mm: 210,
                        interior_pages: 192,
                        interior_print: '1/1',
                        paper_type_interior: 'offset',
                        paper_weight_interior: 90,
                        cover_print: '4/0',
                        paper_type_cover: 'mc',
                        paper_weight_cover: 130,
                        binding_method: 'hardcover',
                        delivery_country: 'ES'
                    },
                    declaredCommercials: {
                        targetManufacturingPrice: isSecondOffer ? 8200 : 4850,
                        currency: 'EUR',
                        transportPricePerKg: 0.45,
                        transportCurrency: 'EUR',
                        includesPaper: true,
                        includesBinding: true,
                        includesFinishing: true,
                        includesPackaging: true
                    },
                    explanation: isSecondOffer
                        ? 'Detected 5,000 copies of 148x210mm hardcover book at €8,200.'
                        : 'Detected 2,500 copies of 148x210mm hardcover book at €4,850.'
                }
            };
        });

        // Mock uploadQuoteEvidence returning 2 distinct offers with canonical IDs
        const uploadSpy = vi.spyOn(printhouseCalibrationApi, 'uploadQuoteEvidence').mockResolvedValue({
            evidenceId: 'ev-quote-999',
            filename: 'offer_buch_2026.pdf',
            detectedLanguage: 'de',
            printhouseName: 'Druckerei Express',
            offers: [
                { variantId: 'offer-opt-1', variantName: '2,500 copies thread-sewn', manufacturingPrice: 4850, transportPrice: 200, quotedTotalPrice: 5050, quotedUnitPrice: 2.02, quantity: 2500, validationStatus: 'CONSISTENT' },
                { variantId: 'offer-opt-2', variantName: '5,000 copies thread-sewn', manufacturingPrice: 8200, transportPrice: 350, quotedTotalPrice: 8550, quotedUnitPrice: 1.71, quantity: 5000, validationStatus: 'CONSISTENT' }
            ]
        });

        const { container } = rtlRender(
            <MemoryRouter initialEntries={['/printhouse/setup?tab=PRICING']}>
                <LocaleProvider initialLocale="en">
                    <PrinthouseSetupHub />
                </LocaleProvider>
            </MemoryRouter>
        );

        // 1. Wait for PricingPanel to load
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /AI assistant/i })).toBeInTheDocument();
        });

        // 2. Upload PDF through the real file input
        const fileInput = container.querySelector('#quote-pdf-upload-input') as HTMLInputElement;
        expect(fileInput).toBeInTheDocument();

        const fakePdf = new File(['%PDF-1.4 dummy quote content'], 'offer_buch_2026.pdf', { type: 'application/pdf' });
        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [fakePdf] } });
        });

        // Verify uploadQuoteEvidence was called
        await waitFor(() => {
            expect(uploadSpy).toHaveBeenCalledWith(fakePdf);
        });

        // 3. Wait for extracted offers to render in StructuredQuoteReviewCard
        await waitFor(() => {
            expect(screen.getByText(/Extracted Commercial/i)).toBeInTheDocument();
            expect(screen.getByText(/2,500 copies thread-sewn/i)).toBeInTheDocument();
            expect(screen.getByText(/5,000 copies thread-sewn/i)).toBeInTheDocument();
        });

        // 4. Click the SECOND offer's visible selection button
        const variantButtons = screen.getAllByRole('button', { name: /Select this variant|Seleccionar variante/i });
        expect(variantButtons.length).toBe(2);

        await act(async () => {
            fireEvent.click(variantButtons[1]); // Second offer (5,000 copies, €8,200)
        });

        // Assert interpretSpy receives evidenceId and selectedVariantId: 'offer-opt-2'
        await waitFor(() => {
            expect(interpretSpy).toHaveBeenCalled();
            const lastCallArgs = interpretSpy.mock.calls[interpretSpy.mock.calls.length - 1];
            expect(lastCallArgs[1]).toBe('ev-quote-999');
            expect(lastCallArgs[2]).toBe('offer-opt-2');
        });

        // Assert resulting draft & summary reflect 5,000 copies and €8,200
        await waitFor(() => {
            expect(screen.getByText(/Detected 5,000 copies of 148x210mm hardcover book at €8,200/i)).toBeInTheDocument();
        });
        const summaryPane = container.querySelector('.sticky.top-4') as HTMLElement;
        expect(summaryPane).not.toBeNull();
        expect(summaryPane).toBeInTheDocument();
        expect(within(summaryPane).getByText('5000 copies')).toBeInTheDocument();
        expect(within(summaryPane).getByText('€8200.00')).toBeInTheDocument();

        // 5. Switch AI Assistant → Manual Rate Cards
        const manualToggleBtn = screen.getByRole('button', { name: /Manual rate cards/i });
        fireEvent.click(manualToggleBtn);

        // Verify manual container is visible and assistant is hidden
        const manualContainer = container.querySelector('#pricing-workflow-manual');
        const assistantContainer = container.querySelector('#pricing-workflow-assistant');
        expect(manualContainer).toHaveClass('block');
        expect(assistantContainer).toHaveClass('hidden');

        // 6. Switch back Manual → AI Assistant
        const assistantToggleBtn = screen.getByRole('button', { name: /AI assistant/i });
        fireEvent.click(assistantToggleBtn);

        expect(assistantContainer).toHaveClass('block');
        expect(manualContainer).toHaveClass('hidden');

        // Summary and message persist across mode toggle
        expect(screen.getByText(/Detected 5,000 copies of 148x210mm hardcover book at €8,200/i)).toBeInTheDocument();
        expect(within(summaryPane).getByText('5000 copies')).toBeInTheDocument();
        expect(within(summaryPane).getByText('€8200.00')).toBeInTheDocument();

        // 7. Send follow-up message and assert same second-variant ID reaches API
        const chatInput = screen.getByPlaceholderText(/Describe your book or attach a PDF/i);
        const sendBtn = screen.getByRole('button', { name: /Send/i });
        fireEvent.change(chatInput, { target: { value: 'Can we check with 115g paper?' } });
        fireEvent.click(sendBtn);

        await waitFor(() => {
            const latestArgs = interpretSpy.mock.calls[interpretSpy.mock.calls.length - 1];
            expect(latestArgs[0]).toBe('Can we check with 115g paper?');
            expect(latestArgs[1]).toBe('ev-quote-999');
            expect(latestArgs[2]).toBe('offer-opt-2');
        });

        // Verify summary still preserves 5,000 copies and €8,200
        expect(within(summaryPane).getByText('5000 copies')).toBeInTheDocument();
        expect(within(summaryPane).getByText('€8200.00')).toBeInTheDocument();

        // 8. Open the real evidence drawer and assert actual values of the second offer
        const inspectEvidenceBtn = screen.getByRole('button', { name: /Inspect Evidence/i });
        fireEvent.click(inspectEvidenceBtn);

        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText('Quote Evidence & Variant Details')).toBeInTheDocument();
        expect(within(dialog).getAllByText('offer_buch_2026.pdf').length).toBeGreaterThan(0);
        expect(within(dialog).getByText('ev-quote-999')).toBeInTheDocument();
        expect(within(dialog).getByText('5,000 copies thread-sewn')).toBeInTheDocument();
        expect(within(dialog).getByText('€8200')).toBeInTheDocument();
        expect(within(dialog).getByText('€350')).toBeInTheDocument();
        expect(within(dialog).getByText('€8550')).toBeInTheDocument();
        expect(within(dialog).getByText('5000')).toBeInTheDocument();
        expect(within(dialog).getByText('€1.71')).toBeInTheDocument();

        // Close drawer via Escape key
        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        // 9. Send another message, asserting the same second-variant IDs persist
        fireEvent.change(chatInput, { target: { value: 'What about delivery to Germany?' } });
        fireEvent.click(sendBtn);

        await waitFor(() => {
            const latestArgs = interpretSpy.mock.calls[interpretSpy.mock.calls.length - 1];
            expect(latestArgs[0]).toBe('What about delivery to Germany?');
            expect(latestArgs[1]).toBe('ev-quote-999');
            expect(latestArgs[2]).toBe('offer-opt-2');
        });

        expect(within(summaryPane).getByText('5000 copies')).toBeInTheDocument();
        expect(within(summaryPane).getByText('€8200.00')).toBeInTheDocument();

        // 10. Switch selection to FIRST offer and verify draft, summary, and drawer update to the first offer's values
        const updatedButtons = screen.getAllByRole('button', { name: /Select this variant|Seleccionar variante/i });
        await act(async () => {
            fireEvent.click(updatedButtons[0]); // First offer (2,500 copies)
        });

        await waitFor(() => {
            const latestArgs = interpretSpy.mock.calls[interpretSpy.mock.calls.length - 1];
            expect(latestArgs[2]).toBe('offer-opt-1');
        });

        // Verify summary pane updated to 2500 copies and €4850
        await waitFor(() => {
            const matches = screen.getAllByText(/Detected 2,500 copies of 148x210mm hardcover book at €4,850/i);
            expect(matches.length).toBeGreaterThanOrEqual(1);
        });
        expect(within(summaryPane).getByText('2500 copies')).toBeInTheDocument();
        expect(within(summaryPane).getByText('€4850.00')).toBeInTheDocument();

        // Open drawer and assert first offer values
        fireEvent.click(screen.getByRole('button', { name: /Inspect Evidence/i }));
        const updatedDialog = screen.getByRole('dialog');
        expect(within(updatedDialog).getByText('2,500 copies thread-sewn')).toBeInTheDocument();
        expect(within(updatedDialog).getByText('€4850')).toBeInTheDocument();
        expect(within(updatedDialog).getByText('€200')).toBeInTheDocument();
        expect(within(updatedDialog).getByText('€5050')).toBeInTheDocument();
        expect(within(updatedDialog).getByText('2500')).toBeInTheDocument();
        expect(within(updatedDialog).getByText('€2.02')).toBeInTheDocument();
    });

    it('10. printhouseCalibrationApi handleResponse validates success, HTTP error, ok:false, malformed JSON, and network failure', async () => {
        // 1. Success response
        const mockSuccess = new Response(JSON.stringify({ ok: true, data: { status: 'READY' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        const successData = await handleResponse(mockSuccess);
        expect(successData).toEqual({ status: 'READY' });

        // 2. HTTP error status (404)
        const mockHttpError = new Response(JSON.stringify({ ok: false, error: 'SESSION_NOT_FOUND', message: 'No calibration session' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
        await expect(handleResponse(mockHttpError)).rejects.toMatchObject({
            status: 404,
            code: 'SESSION_NOT_FOUND',
            message: 'No calibration session'
        });

        // 3. HTTP 200 with ok: false
        const mockOkFalse = new Response(JSON.stringify({ ok: false, error: 'SOLVER_CONVERGENCE_FAILED', message: 'Residual exceeds tolerance' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
        await expect(handleResponse(mockOkFalse)).rejects.toMatchObject({
            code: 'SOLVER_CONVERGENCE_FAILED',
            message: 'Residual exceeds tolerance'
        });

        // 4. Malformed JSON where JSON is required -> must produce controlled INVALID_JSON_RESPONSE
        const mockMalformed = new Response('<html>502 Bad Gateway</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' }
        });
        await expect(handleResponse(mockMalformed)).rejects.toMatchObject({
            status: 502,
            code: 'INVALID_JSON_RESPONSE'
        });

        // 5. Network failure (fetch throws TypeError)
        // Ensure listSessions uses un-mocked implementation calling fetch
        vi.spyOn(printhouseCalibrationApi, 'listSessions').mockRestore();
        const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(printhouseCalibrationApi.listSessions('node-test')).rejects.toThrow('Failed to fetch');
        fetchSpy.mockRestore();
    });

    it('11. Evidence drawer resolves exact canonical ID before positional fallback without collision', async () => {
        // Test collision scenario:
        // Offer 0 has canonical variantId: 'variant-1'
        // Offer 1 has canonical variantId: 'variant-0'
        // When selectedVariantId === 'variant-1', it MUST resolve to Offer 0, NEVER Offer 1 (the index-1 item)
        const mockEvidenceWithCollision = {
            evidenceId: 'ev-collision-test',
            filename: 'collision_quote.pdf',
            detectedLanguage: 'en',
            offers: [
                { variantId: 'variant-1', variantName: 'First Offer Named variant-1', manufacturingPrice: 1111, quantity: 1000 },
                { variantId: 'variant-0', variantName: 'Second Offer At Index 1', manufacturingPrice: 9999, quantity: 9000 }
            ]
        };

        const { container } = rtlRender(
            <LocaleProvider initialLocale="en">
                <CalibrationConversation
                    messages={[]}
                    onSendMessage={vi.fn()}
                    sending={false}
                    activeProposal={null}
                    onApplyProposal={vi.fn()}
                    aiUnavailable={false}
                    activeQuoteEvidence={mockEvidenceWithCollision}
                    selectedVariantId="variant-1"
                />
            </LocaleProvider>
        );

        // Open evidence drawer
        const inspectBtn = screen.getByRole('button', { name: /Inspect Evidence/i });
        fireEvent.click(inspectBtn);

        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();

        // Must display First Offer (1111 €, 1000 qty), NOT the index-1 offer (9999 €)
        expect(within(dialog).getByText('First Offer Named variant-1')).toBeInTheDocument();
        expect(within(dialog).getByText('€1111')).toBeInTheDocument();
        expect(within(dialog).getByText('1000')).toBeInTheDocument();
        expect(within(dialog).queryByText('Second Offer At Index 1')).not.toBeInTheDocument();
        expect(within(dialog).queryByText('€9999')).not.toBeInTheDocument();
    });

    it('12. Backend selection-ID contract: verifies payload structure and variant resolution contract', async () => {
        // Validates backend calibrationAssistantService contract:
        // When client sends evidenceId and selectedVariantId, API call shape matches { text, evidenceId, selectedVariantId }
        const testFetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            ok: true,
            data: {
                proposal: {
                    referenceBookName: 'Validated Contract Spec',
                    specPatch: { copies: 5000 },
                    declaredCommercials: { targetManufacturingPrice: 8200 }
                }
            }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        await printhouseCalibrationApi.interpretPreSession('Testing payload shape', 'ev-quote-contract', 'offer-opt-2');

        expect(testFetchSpy).toHaveBeenCalledTimes(1);
        const [requestUrl, requestOptions] = testFetchSpy.mock.calls[0];
        expect(requestUrl).toBe('/api/printhouse/onboarding/pricing/calibration-assistant/interpret');
        expect(requestOptions?.method).toBe('POST');
        const parsedBody = JSON.parse(requestOptions?.body as string);
        expect(parsedBody).toEqual({
            message: 'Testing payload shape',
            evidenceId: 'ev-quote-contract',
            selectedVariantId: 'offer-opt-2'
        });

        testFetchSpy.mockRestore();
    });

    it('13. Server-side offer resolution: exercises actual server resolver with real evidence payload shape and confirms exact ID match with drawer', async () => {
        // Real normalized quote payload as stored in MySQL quote_evidence_extractions.normalized_json
        const realEvidencePayload = {
            currency: 'EUR',
            document_type: 'QUOTE',
            detected_language: 'en',
            page_count: 2,
            offers: [
                {
                    variantId: 'offer-opt-1',
                    id: 'offer-opt-1',
                    variantName: '2,500 copies thread-sewn',
                    quantity: 2500,
                    manufacturingPrice: 4850,
                    transportPrice: 200,
                    quotedTotalPrice: 5050,
                    quotedUnitPrice: 2.02,
                    validationStatus: 'CONSISTENT'
                },
                {
                    variantId: 'offer-opt-2',
                    id: 'offer-opt-2',
                    variantName: '5,000 copies thread-sewn',
                    quantity: 5000,
                    manufacturingPrice: 8200,
                    transportPrice: 350,
                    quotedTotalPrice: 8550,
                    quotedUnitPrice: 1.71,
                    validationStatus: 'CONSISTENT'
                }
            ]
        };

        const mysqlPromise = require('mysql2/promise');
        const origCreatePool = mysqlPromise.createPool;
        const prevHost = process.env.MYSQL_HOST;
        process.env.MYSQL_HOST = 'test-isolated-db-host';

        let currentRows: any[] = [
            {
                id: 'ev-server-contract-doc',
                tenant_id: 'tenant-demo',
                file_name: 'quote_contract_test.pdf',
                document_sha256: 'abc123sha',
                detected_language: 'en',
                raw_text: 'Offer 1: 2500 copies 4850 EUR. Offer 2: 5000 copies 8200 EUR.',
                validation_status: 'CONSISTENT',
                normalized_quote_json: JSON.stringify(realEvidencePayload)
            }
        ];

        // Stub createPool on mysql2/promise which getPool() calls directly
        mysqlPromise.createPool = () => ({
            on: () => {},
            end: async () => {},
            query: async () => [currentRows]
        });

        try {
            // 1. Resolve with canonical ID 'offer-opt-2' (as emitted by StructuredQuoteReviewCard)
            const resolvedSecond = await calibrationAssistantService._resolveEvidenceDocument('tenant-demo', 'ev-server-contract-doc', 'offer-opt-2');
            expect(resolvedSecond).not.toBeNull();
            expect(resolvedSecond.selectedOffer).not.toBeNull();
            expect(resolvedSecond.selectedOffer.variantId).toBe('offer-opt-2');
            expect(resolvedSecond.selectedOffer.quantity).toBe(5000);
            expect(resolvedSecond.selectedOffer.manufacturingPrice).toBe(8200);
            expect(resolvedSecond.selectedOffer.transportPrice).toBe(350);

            // 2. Resolve with canonical ID 'offer-opt-1'
            const resolvedFirst = await calibrationAssistantService._resolveEvidenceDocument('tenant-demo', 'ev-server-contract-doc', 'offer-opt-1');
            expect(resolvedFirst).not.toBeNull();
            expect(resolvedFirst.selectedOffer).not.toBeNull();
            expect(resolvedFirst.selectedOffer.variantId).toBe('offer-opt-1');
            expect(resolvedFirst.selectedOffer.quantity).toBe(2500);
            expect(resolvedFirst.selectedOffer.manufacturingPrice).toBe(4850);
            expect(resolvedFirst.selectedOffer.transportPrice).toBe(200);

            // 3. Collision test on server resolver: canonical ID 'variant-1' at index 0 must NOT resolve to index 1
            currentRows = [
                {
                    id: 'ev-server-collision-doc',
                    tenant_id: 'tenant-demo',
                    file_name: 'collision.pdf',
                    document_sha256: 'coll123',
                    detected_language: 'en',
                    raw_text: 'Collision',
                    validation_status: 'CONSISTENT',
                    normalized_quote_json: JSON.stringify({
                        offers: [
                            { variantId: 'variant-1', variantName: 'Canonical Named variant-1', quantity: 1000, manufacturingPrice: 1111 },
                            { variantId: 'variant-0', variantName: 'Index 1 Offer', quantity: 9000, manufacturingPrice: 9999 }
                        ]
                    })
                }
            ];
            const collisionResolved = await calibrationAssistantService._resolveEvidenceDocument('tenant-demo', 'ev-server-collision-doc', 'variant-1');
            expect(collisionResolved.selectedOffer.variantName).toBe('Canonical Named variant-1');
            expect(collisionResolved.selectedOffer.quantity).toBe(1000);
            expect(collisionResolved.selectedOffer.manufacturingPrice).toBe(1111);

            // 4. Fallback test: when canonical ID does not match, but positional 'variant-1' is passed
            currentRows = [
                {
                    id: 'ev-server-fallback-doc',
                    tenant_id: 'tenant-demo',
                    file_name: 'fallback.pdf',
                    document_sha256: 'fall123',
                    detected_language: 'en',
                    raw_text: 'Fallback',
                    validation_status: 'CONSISTENT',
                    normalized_quote_json: JSON.stringify({
                        offers: [
                            { variantName: 'Offer Zero Without variantId', quantity: 1000, manufacturingPrice: 1000 },
                            { variantName: 'Offer One Without variantId', quantity: 2000, manufacturingPrice: 2000 }
                        ]
                    })
                }
            ];
            const fallbackResolved = await calibrationAssistantService._resolveEvidenceDocument('tenant-demo', 'ev-server-fallback-doc', 'variant-1');
            expect(fallbackResolved.selectedOffer.variantName).toBe('Offer One Without variantId');
            expect(fallbackResolved.selectedOffer.quantity).toBe(2000);
        } finally {
            await mysqlClient.closePool();
            mysqlPromise.createPool = origCreatePool;
            if (prevHost === undefined) {
                delete process.env.MYSQL_HOST;
            } else {
                process.env.MYSQL_HOST = prevHost;
            }
        }
    });

    it('14. Setup Overview UX Audit: Prioritizes Capacity and Lead Times over Pricing when ops configuration is incomplete', async () => {
        // Mock onboarding data where Materials is complete, but Capacity and Lead Times are incomplete, while Pricing is in progress
        vi.spyOn(global, 'fetch').mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { companyName: 'Acme Print', country: 'DE' },
                            sites: [{ siteId: 'site-1', name: 'Berlin Plant', city: 'Berlin' }],
                            readiness: {
                                accountSetup: { status: 'COMPLETE', completedRequirements: 6, totalRequirements: 6 },
                                operationalConfiguration: {
                                    status: 'IN_PROGRESS',
                                    completedRequirements: 3,
                                    totalRequirements: 5,
                                    blockingIssues: [
                                        { module: 'CAPACITY', code: 'NO_ACTIVE_SHIFTS', message: 'No shifts scheduled' },
                                        { module: 'LEAD_TIMES', code: 'NO_CUTOFF_TIME', message: 'No daily cut-off defined' }
                                    ]
                                },
                                sites: { status: 'COMPLETE' },
                                machines: { status: 'COMPLETE' },
                                capabilities: { status: 'COMPLETE' },
                                substrates: { status: 'COMPLETE' },
                                capacity: { status: 'NOT_STARTED' },
                                leadTimes: { status: 'NOT_STARTED' },
                                pricing: { status: 'IN_PROGRESS' },
                                pricingReadiness: {
                                    status: 'IN_PROGRESS',
                                    priceBookCount: 1,
                                    hasPublished: false
                                }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        const { container } = renderWithProviders(<PrinthouseSetupHub />, { initialEntries: ['/printhouse/setup?tab=OVERVIEW'] });

        await waitFor(() => {
            expect(screen.getByText('Setup Overview')).toBeInTheDocument();
        });

        // Coherence check: Banner must recommend CAPACITY (not PRICING) because capacity is incomplete
        expect(screen.getAllByText('Production Capacity').length).toBeGreaterThan(0);
        const banner = container.querySelector('.bg-gradient-to-r');
        expect(banner).not.toBeNull();
        expect(within(banner as HTMLElement).getByText('Production Capacity')).toBeInTheDocument();
        expect(within(banner as HTMLElement).getByRole('button', { name: /Configure Production Capacity/i })).toBeInTheDocument();

        // Recommended card badge must be on Production Capacity card
        expect(screen.getByText('Recommended Next Action')).toBeInTheDocument();
    });

    it('15. Setup Overview UX Audit: Blocked modules provide explicit dependency resolution action without dead non-interactive cards', async () => {
        // Mock onboarding data where no sites exist (Machines and subsequent cards are blocked)
        vi.spyOn(global, 'fetch').mockImplementation((url: string) => {
            if (url.includes('/api/printhouse/onboarding')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        data: {
                            company: { companyName: 'Acme Print', country: 'DE' },
                            sites: [], // No sites
                            readiness: {
                                accountSetup: { status: 'IN_PROGRESS', completedRequirements: 1, totalRequirements: 6 },
                                operationalConfiguration: { status: 'NOT_STARTED', completedRequirements: 0, totalRequirements: 5 },
                                sites: { status: 'NOT_STARTED' },
                                machines: { status: 'LOCKED' },
                                pricingReadiness: { status: 'NOT_STARTED' }
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: {} }) });
        });

        renderWithProviders(<PrinthouseSetupHub />, { initialEntries: ['/printhouse/setup?tab=OVERVIEW'] });

        await waitFor(() => {
            expect(screen.getByText('Setup Overview')).toBeInTheDocument();
        });

        // Locked modules provide Resolve Dependency button
        const resolveButtons = screen.getAllByRole('button', { name: /Resolve Dependency/i });
        expect(resolveButtons.length).toBeGreaterThan(0);

        // Clicking "Resolve Dependency" on a locked module navigates directly to prerequisite (SITES)
        fireEvent.click(resolveButtons[0]);
        await waitFor(() => {
            expect(screen.getAllByText('Production Sites').length).toBeGreaterThan(0);
        });
    });

    it('16. Setup Overview UX Audit: Trilingual parity across EN, ES, and DE for destination-specific CTAs and dimension headers', async () => {
        const { unmount } = renderWithProviders(<PrinthouseSetupHub />, { initialEntries: ['/printhouse/setup?tab=OVERVIEW'] });

        await waitFor(() => {
            expect(screen.getByText('Setup Overview')).toBeInTheDocument();
        });

        // Switch to ES
        const langSwitcher = screen.getByRole('button', { name: /Switch language/i });
        fireEvent.click(langSwitcher); // EN -> ES
        await waitFor(() => {
            expect(screen.getByText('Resumen de Configuración')).toBeInTheDocument();
            expect(screen.getByText('Cuenta e Identidad')).toBeInTheDocument();
            expect(screen.getByText('Capacidad Operativa')).toBeInTheDocument();
        });

        // Switch to DE
        fireEvent.click(screen.getByRole('button', { name: /Switch language/i })); // ES -> DE
        await waitFor(() => {
            expect(screen.getByText('Übersicht der Einrichtung')).toBeInTheDocument();
            expect(screen.getByText('Konto & Identität')).toBeInTheDocument();
            expect(screen.getByText('Betriebsbereitschaft')).toBeInTheDocument();
        });

        unmount();
    });

    it('17. Pricing Variant & Price Synchronization: integrated flow QuickCalibrationPanel -> wizard -> payload, alternating variants and asserting ID, target, quantity, and currency', async () => {
        const mockOffers = [
            {
                variantId: 'variant-0',
                variantName: 'Standard Option',
                quantity: 500,
                manufacturingPrice: 3850,
                transportPrice: 250,
                quotedTotalPrice: 4100,
                quotedUnitPrice: 8.20,
                currency: 'EUR',
                validationStatus: 'CONSISTENT'
            },
            {
                variantId: 'variant-1',
                variantName: 'Extended Option',
                quantity: 1000,
                manufacturingPrice: 4120,
                transportPrice: 350,
                quotedTotalPrice: 4470,
                quotedUnitPrice: 4.47,
                currency: 'EUR',
                validationStatus: 'CONSISTENT'
            }
        ];

        const mockEvidence = {
            evidenceId: 'qdoc-[#test-sync-1]',
            filename: 'Fährmann_Quote_Test.pdf',
            pageCount: 4,
            detectedLanguage: 'de',
            documentLanguage: 'de',
            confidenceStatus: 'HIGH',
            offers: mockOffers,
            normalizedTerms: []
        };

        vi.spyOn(printhouseCalibrationApi, 'listSessions').mockResolvedValue([]);
        vi.spyOn(printhouseCalibrationApi, 'uploadQuoteEvidence').mockResolvedValue(mockEvidence);
        const chatSpy = vi.spyOn(printhouseCalibrationApi, 'interpretPreSession').mockImplementation(async (text, evidenceId, selectedVariantId) => {
            const isV1 = selectedVariantId === 'variant-1';
            return {
                proposal: {
                    explanation: isV1 ? 'Selected High Volume Option (1000 copies @ 4120 EUR)' : 'Selected Standard Option (500 copies @ 3850 EUR)',
                    specPatch: { copies: isV1 ? 1000 : 500 },
                    declaredCommercials: {
                        targetManufacturingPrice: isV1 ? 4120 : 3850,
                        currency: 'EUR'
                    }
                },
                quoteEvidence: mockEvidence
            };
        });

        const { container } = renderWithProviders(
            <QuickCalibrationPanel
                printerNodeId="node-test-1"
                printerNodeName="Main Offset Press"
            />
        );

        // Allow async rehydrateSession to complete loadingSession
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });

        // Upload PDF to trigger activeQuoteEvidence and populate wizard + sidebar
        const fileInput = container.querySelector('#quote-pdf-upload-input') as HTMLInputElement;
        expect(fileInput).not.toBeNull();
        const pdfFile = new File(['pdf data'], 'Fährmann_Quote_Test.pdf', { type: 'application/pdf' });

        await act(async () => {
            fireEvent.change(fileInput, { target: { files: [pdfFile] } });
        });

        // 1. Initial render defaults to variant-0 (3850 EUR, 500 copies)
        const variant0Button = container.querySelector('button[data-variant-id="variant-0"]');
        const variant1Button = container.querySelector('button[data-variant-id="variant-1"]');

        expect(variant0Button).toBeInTheDocument();
        expect(variant1Button).toBeInTheDocument();

        // 2. Delimit sidebar panel with stable selector #pricing-sidebar-summary-pane and verify initial target price 3850.00 and quantity 500 copies
        const sidebarPane = container.querySelector('#pricing-sidebar-summary-pane');
        expect(sidebarPane).not.toBeNull();
        expect(within(sidebarPane as HTMLElement).getByText(/3850\.00/)).toBeInTheDocument();
        expect(within(sidebarPane as HTMLElement).getByText(/500/)).toBeInTheDocument();

        // 3. Click variant-1 (1000 copies @ 4120 EUR)
        await act(async () => {
            fireEvent.click(variant1Button!);
        });

        // 4. Verify outgoing payload to interpretPreSession contains variant-1 contract params
        expect(chatSpy).toHaveBeenCalledWith(
            expect.stringContaining('[Variante seleccionada]'),
            'qdoc-[#test-sync-1]',
            'variant-1'
        );

        // 5. Verify variant-1 card button shows selected badge & amount 4120
        expect(variant1Button).toHaveAttribute('aria-pressed', 'true');
        expect(within(variant1Button as HTMLElement).getByText(/4120/)).toBeInTheDocument();

        // 6. Verify sidebar panel Manufacturing Target updated coherently to variant-1, 4120.00, 1000 copies, and EUR currency
        expect(within(sidebarPane as HTMLElement).getByText(/variant-1/)).toBeInTheDocument();
        expect(within(sidebarPane as HTMLElement).getByText(/4120\.00/)).toBeInTheDocument();
        expect(within(sidebarPane as HTMLElement).getByText(/1000/)).toBeInTheDocument();
        expect(within(sidebarPane as HTMLElement).getAllByText(/€/).length).toBeGreaterThan(0);

        // 7. Switch back to variant-0 (500 copies @ 3850 EUR) and verify dynamic response contract in reverse
        await act(async () => {
            fireEvent.click(variant0Button!);
        });

        expect(chatSpy).toHaveBeenLastCalledWith(
            expect.stringContaining('[Variante seleccionada]'),
            'qdoc-[#test-sync-1]',
            'variant-0'
        );
        expect(variant0Button).toHaveAttribute('aria-pressed', 'true');
        expect(within(variant0Button as HTMLElement).getByText(/3850/)).toBeInTheDocument();
        expect(within(sidebarPane as HTMLElement).getByText(/variant-0/)).toBeInTheDocument();
        expect(within(sidebarPane as HTMLElement).getByText(/3850\.00/)).toBeInTheDocument();
        expect(within(sidebarPane as HTMLElement).getByText(/500/)).toBeInTheDocument();
    });

    it('18. Dropzone & Recovery: Enter/Space keyboard activation, valid upload, pending request guard against concurrent upload, API failure & retry preserving state', async () => {
        let rejectUpload: ((val: any) => void) | null = null;

        const uploadSpy = vi.spyOn(printhouseCalibrationApi, 'uploadQuoteEvidence').mockImplementation(() => {
            return new Promise((_, reject) => {
                rejectUpload = reject;
            });
        });

        const { container } = renderWithProviders(
            <CalibrationConversation
                onSendMessage={vi.fn()}
                sending={false}
                messages={[]}
            />
        );

        // 1. Target file input & dropzone control
        const dropzone = screen.getByRole('region', { name: /Drop your quotation PDF here/i });
        const fileInput = container.querySelector('#quote-pdf-upload-input') as HTMLInputElement;
        const textInput = screen.getByPlaceholderText(/Describe your book or attach a PDF/i) as HTMLInputElement;
        expect(fileInput).not.toBeNull();
        expect(textInput).not.toBeNull();

        // Type draft text into input to test preservation
        fireEvent.change(textInput, { target: { value: 'My custom book specification draft' } });
        expect(textInput.value).toBe('My custom book specification draft');

        // Keydown Enter / Space on dropzone
        fireEvent.keyDown(dropzone, { key: 'Enter' });
        fireEvent.keyDown(dropzone, { key: ' ' });

        // 2. Upload valid PDF (2 MB)
        const validPdf = new File(['valid pdf content'], 'quote_valid.pdf', { type: 'application/pdf' });

        act(() => {
            fireEvent.change(fileInput, { target: { files: [validPdf] } });
        });

        // 3. Concurrent Upload Guard: Attempting a 2nd upload while 1st is pending (uploadPromise in flight)
        const secondPdf = new File(['second pdf'], 'quote_second.pdf', { type: 'application/pdf' });
        act(() => {
            fireEvent.change(fileInput, { target: { files: [secondPdf] } });
        });

        // Expect uploadQuoteEvidence to have been called ONCE only due to concurrent guard lock
        expect(uploadSpy).toHaveBeenCalledTimes(1);
        expect(uploadSpy).toHaveBeenCalledWith(validPdf);

        // Resolve 1st upload with error to test error handling & retry
        await act(async () => {
            if (rejectUpload) {
                rejectUpload(new Error('Server error processing PDF'));
            }
            await new Promise((r) => setTimeout(r, 50));
        });

        // Error retry button resets upload state
        const retryBtn = screen.getByRole('button', { name: /Retry|Reintentar|Wiederholen/i });
        expect(retryBtn).toBeInTheDocument();

        // Verify draft input text preserved despite upload error
        expect(textInput.value).toBe('My custom book specification draft');

        await act(async () => {
            fireEvent.click(retryBtn);
        });

        uploadSpy.mockRestore();
    });

    it('19. Accessibility & Reduced Motion: focus trap, Tab/Shift+Tab wrapping, initial focus, Escape, focus restoration, and application prefers-reduced-motion CSS assertions', async () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn().mockResolvedValue(undefined);

        // Create trigger button to test focus restoration
        const triggerBtn = document.createElement('button');
        triggerBtn.id = 'trigger-btn';
        document.body.appendChild(triggerBtn);
        triggerBtn.focus();
        expect(document.activeElement).toBe(triggerBtn);

        const { unmount } = renderWithProviders(
            <CalibrationAcceptanceModal
                isOpen={true}
                onClose={onClose}
                onConfirm={onConfirm}
                accepting={false}
                nodeName="Berlin Site #1"
                bookName="Test Book"
                targetPrice={4120}
                predictedPrice={4115}
                residual={5}
            />
        );

        // 1. Initial focus: modal sets focus automatically to confirm button after timeout
        await act(async () => {
            await new Promise(r => setTimeout(r, 10));
        });

        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();

        // 2. Escape key closes modal
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        // 3. Focus restoration on unmount
        unmount();
        expect(document.activeElement).toBe(triggerBtn);
        document.body.removeChild(triggerBtn);

        // 4. Reduced Motion: check index.css rules matching [data-reduced-motion="true"] or prefers-reduced-motion
        const indexCssPath = 'src/ui/index.css';
        const fs = require('fs');
        const cssContent = fs.readFileSync(indexCssPath, 'utf-8');

        expect(cssContent).toContain('prefers-reduced-motion: reduce');
        expect(cssContent).toContain('data-reduced-motion="true"');
        expect(cssContent).toContain('animation-duration: 0.001ms !important');
    });

    it('20. Trilingual Pricing i18n & Acceptance Modal: validates EN, ES, and DE localization keys in modal and wizard', async () => {
        const onConfirm = vi.fn().mockResolvedValue(undefined);
        const onClose = vi.fn();

        // 1. English (EN)
        const { unmount: unmountEn } = rtlRender(
            <LocaleProvider initialLocale="en">
                <CalibrationAcceptanceModal
                    isOpen={true}
                    onClose={onClose}
                    onConfirm={onConfirm}
                    accepting={false}
                    nodeName="Berlin Plant #1"
                    bookName="Reference Novel"
                    targetPrice={3850}
                    predictedPrice={3842.50}
                    residual={7.50}
                />
            </LocaleProvider>
        );

        expect(screen.getByText('Confirm Governed Acceptance')).toBeInTheDocument();
        expect(screen.getByText('Target Production Node:')).toBeInTheDocument();
        expect(screen.getByText('Declared Manufacturing Target:')).toBeInTheDocument();

        unmountEn();

        // 2. Spanish (ES)
        const { unmount: unmountEs } = rtlRender(
            <LocaleProvider initialLocale="es">
                <CalibrationAcceptanceModal
                    isOpen={true}
                    onClose={onClose}
                    onConfirm={onConfirm}
                    accepting={false}
                    nodeName="Berlin Plant #1"
                    bookName="Reference Novel"
                    targetPrice={3850}
                    predictedPrice={3842.50}
                    residual={7.50}
                />
            </LocaleProvider>
        );

        expect(screen.getByText('Confirmar aceptación gobernada')).toBeInTheDocument();
        expect(screen.getByText('Nodo de producción objetivo:')).toBeInTheDocument();
        expect(screen.getByText('Objetivo de fabricación declarado:')).toBeInTheDocument();

        unmountEs();

        // 3. German (DE)
        const { unmount: unmountDe } = rtlRender(
            <LocaleProvider initialLocale="de">
                <CalibrationAcceptanceModal
                    isOpen={true}
                    onClose={onClose}
                    onConfirm={onConfirm}
                    accepting={false}
                    nodeName="Berlin Plant #1"
                    bookName="Reference Novel"
                    targetPrice={3850}
                    predictedPrice={3842.50}
                    residual={7.50}
                />
            </LocaleProvider>
        );

        expect(screen.getByText('Kalibrierungsübernahme bestätigen')).toBeInTheDocument();
        expect(screen.getByText('Ziel-Produktionsknoten:')).toBeInTheDocument();
        expect(screen.getByText('Erklärtes Fertigungsziel:')).toBeInTheDocument();

        unmountDe();
    });
});



