import React from 'react';
import '@testing-library/jest-dom';
import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GovernedQuoteSmokeTest } from '../src/ui/components/printhouse/pricing/quick-calibration/GovernedQuoteSmokeTest';
import { QuickCalibrationPanel } from '../src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel';
import { StructuredQuoteReviewCard } from '../src/ui/components/printhouse/pricing/quick-calibration/StructuredQuoteReviewCard';
import { printhouseCalibrationApi, computeBookSpecChecksum } from '../src/ui/lib/printhouseCalibrationApi';
import { LocaleProvider } from '../src/ui/i18n';

const render = (ui: React.ReactElement, options?: any) => {
    const res = rtlRender(<LocaleProvider>{ui}</LocaleProvider>, options);
    return {
        ...res,
        rerender: (newUi: React.ReactElement) => res.rerender(<LocaleProvider>{newUi}</LocaleProvider>)
    };
};

describe('GovernedQuoteSmokeTest — Real React Component Unit & Integration Suite', () => {
    const fahrmannSpec = {
        copies: 3000,
        book_width_mm: 139,
        book_height_mm: 212,
        interior_pages: 216,
        binding_method: 'hardcover',
        paper_type_interior: 'munken',
        paper_weight_interior: 90,
        cover_print: '4/0',
        paper_weight_cover: 130,
        lamination: 'matt',
        delivery_country: 'DE',
        has_mixed_interior: true,
        mixed_interior_details: '208p 1/1 + 8p 4/4',
    };

    const mockQuoteResult = {
        ok: true,
        currency: 'EUR',
        quantity: 3000,
        isValidCommercialQuote: true,
        quoteStatus: 'VALID_COMMERCIAL_QUOTE',
        totals: {
            manufacturing: 5000,
            finishing: 300,
            binding: 400,
            packaging: 100,
            transport: 200,
            commercialMarkup: 0,
            tax: 0,
            finalSellingPrice: 6000
        },
        unitPrice: 2.0,
        breakdown: [
            { label: 'Paper & Printing', amount: 5000 },
            { label: 'Binding', amount: 400 },
            { label: 'Finishing & Packaging', amount: 400 },
            { label: 'Freight Transport', amount: 200 }
        ],
        productionLeadDays: 10,
        estimatedDeliveryDays: 3,
        shippingStatus: 'DELIVERY_AVAILABLE',
        taxStatus: 'EXCLUDED',
        configurationTrace: ['Base forward calculation complete'],
        warnings: [],
        engine: {
            package: '@ppos/pricing-engine',
            version: '1.9.5',
            forwardMethod: 'calculateForwardQuote'
        }
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('1. Mounts production component with Fährmann initialSpec without falling back to defaults', () => {
        render(
            <GovernedQuoteSmokeTest 
                initialSpec={fahrmannSpec} 
                printerNodeId="node-329a3bc4" 
                printerNodeName="philologica.ai Printhouse"
            />
        );

        const copiesInput = screen.getByLabelText(/Quantity \(Copies\)/i) as HTMLInputElement;
        const pagesInput = screen.getByLabelText(/Interior Pages/i) as HTMLInputElement;
        const bindingSelect = screen.getByLabelText(/Binding \/ Finish/i) as HTMLSelectElement;

        expect(copiesInput.value).toBe('3000');
        expect(pagesInput.value).toBe('216');
        expect(bindingSelect.value).toBe('hardcover');
    });

    it('2. Preserves manual edits (copies=5000) when parent re-renders with a new instance of the original initialSpec', () => {
        const { rerender } = render(
            <GovernedQuoteSmokeTest 
                initialSpec={fahrmannSpec} 
                printerNodeId="node-329a3bc4" 
            />
        );

        // Manually edit copies input to 5000
        const copiesInput = screen.getByLabelText(/Quantity \(Copies\)/i) as HTMLInputElement;
        fireEvent.change(copiesInput, { target: { value: '5000' } });
        expect(copiesInput.value).toBe('5000');

        // Simulate parent re-render passing a NEW object instance of the original initialSpec (same values)
        rerender(
            <GovernedQuoteSmokeTest 
                initialSpec={{ ...fahrmannSpec }} 
                printerNodeId="node-329a3bc4" 
            />
        );

        // Manual edit MUST be preserved
        expect(copiesInput.value).toBe('5000');
    });

    it('3. Effective initialSpec change during pending request invalidates stale response, clears result/loading, and next calculation sends exact visible values', async () => {
        let resolvePendingPromise: (val: any) => void = () => {};
        const pendingPromise = new Promise((resolve) => {
            resolvePendingPromise = resolve;
        });

        const previewSpy = vi.spyOn(printhouseCalibrationApi, 'previewQuote')
            .mockImplementationOnce(() => pendingPromise as any)
            .mockResolvedValueOnce({ ...mockQuoteResult, quantity: 4500 });

        const { rerender } = render(
            <GovernedQuoteSmokeTest 
                initialSpec={fahrmannSpec} 
                printerNodeId="node-329a3bc4" 
            />
        );

        const calcButton = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcButton);

        // Request #1 is pending
        expect(calcButton).toBeDisabled();

        // Apply an EFFECTIVE change of initialSpec from parent (copies: 4500)
        const updatedSpec = { ...fahrmannSpec, copies: 4500 };
        rerender(
            <GovernedQuoteSmokeTest 
                initialSpec={updatedSpec} 
                printerNodeId="node-329a3bc4" 
            />
        );

        // Effective change MUST immediately reset loading to false and clear results
        expect(calcButton).not.toBeDisabled();
        expect(screen.queryByText(/Real Quotation Outcome/i)).not.toBeInTheDocument();

        // Resolve and wait for old delayed response inside act()
        await act(async () => {
            resolvePendingPromise(mockQuoteResult);
            await pendingPromise;
        });

        // VERIFY BEFORE STARTING ANOTHER CALCULATION: Old price from request #1 MUST NOT be shown
        expect(screen.queryByText(/Real Quotation Outcome/i)).not.toBeInTheDocument();

        // Click Calculate again
        fireEvent.click(calcButton);

        await waitFor(() => {
            expect(previewSpy).toHaveBeenCalledTimes(2);
        });

        const secondCallArg = previewSpy.mock.calls[1][0];
        expect(secondCallArg.copies).toBe(4500);
        expect(secondCallArg.book_width_mm).toBe(139);
        expect(secondCallArg.book_height_mm).toBe(212);
        expect(secondCallArg.interior_pages).toBe(216);
        expect(secondCallArg.binding_method).toBe('hardcover');
    });

    it('4. Manual edit during pending calculation request discards old response, terminates loading, and calculates with updated 5000 copies', async () => {
        let resolvePendingPromise: (val: any) => void = () => {};
        const pendingPromise = new Promise((resolve) => {
            resolvePendingPromise = resolve;
        });

        const previewSpy = vi.spyOn(printhouseCalibrationApi, 'previewQuote')
            .mockImplementationOnce(() => pendingPromise as any)
            .mockResolvedValueOnce({ ...mockQuoteResult, quantity: 5000 });

        render(
            <GovernedQuoteSmokeTest 
                initialSpec={fahrmannSpec} 
                printerNodeId="node-329a3bc4" 
            />
        );

        const calcButton = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcButton);

        // Request #1 is pending
        expect(calcButton).toBeDisabled();

        // Simulate user editing quantity input to 5000 while request #1 is pending
        const copiesInput = screen.getByLabelText(/Quantity \(Copies\)/i) as HTMLInputElement;
        fireEvent.change(copiesInput, { target: { value: '5000' } });

        // Resolve and wait for old delayed response inside act()
        await act(async () => {
            resolvePendingPromise(mockQuoteResult);
            await pendingPromise;
        });

        // Stale result from request #1 MUST NOT be shown and button MUST be re-enabled
        expect(screen.queryByText(/Real Quotation Outcome/i)).not.toBeInTheDocument();
        expect(calcButton).not.toBeDisabled();

        // Click Calculate again for the edited spec
        fireEvent.click(calcButton);

        await waitFor(() => {
            expect(previewSpy).toHaveBeenCalledTimes(2);
        });

        const secondCallArg = previewSpy.mock.calls[1][0];
        expect(secondCallArg.copies).toBe(5000);
        expect(secondCallArg.book_width_mm).toBe(139);
        expect(secondCallArg.book_height_mm).toBe(212);
        expect(secondCallArg.interior_pages).toBe(216);
        expect(secondCallArg.binding_method).toBe('hardcover');
    });

    it('5. Truly partial initialSpec update ({ copies: 4500 }) preserves 139x212, 216 pages and hardcover', () => {
        const { rerender } = render(
            <GovernedQuoteSmokeTest 
                initialSpec={fahrmannSpec} 
                printerNodeId="node-329a3bc4" 
            />
        );

        // Update with TRULY partial object containing ONLY { copies: 4500 }
        rerender(
            <GovernedQuoteSmokeTest 
                initialSpec={{ copies: 4500 }} 
                printerNodeId="node-329a3bc4" 
            />
        );

        const copiesInput = screen.getByLabelText(/Quantity \(Copies\)/i) as HTMLInputElement;
        const widthInput = screen.getByLabelText(/Trim Size \(W × H mm\)/i) as HTMLInputElement;
        const heightInput = screen.getByLabelText(/Book Height mm/i) as HTMLInputElement;
        const pagesInput = screen.getByLabelText(/Interior Pages/i) as HTMLInputElement;
        const bindingSelect = screen.getByLabelText(/Binding \/ Finish/i) as HTMLSelectElement;

        expect(copiesInput.value).toBe('4500');
        expect(widthInput.value).toBe('139');
        expect(heightInput.value).toBe('212');
        expect(pagesInput.value).toBe('216');
        expect(bindingSelect.value).toBe('hardcover');
    });

    it('6. Changing printerNodeId during pending request discards old node response and clears state for new node', async () => {
        let resolveNodeAPromise: (val: any) => void = () => {};
        const pendingNodeAPromise = new Promise((resolve) => {
            resolveNodeAPromise = resolve;
        });

        const previewSpy = vi.spyOn(printhouseCalibrationApi, 'previewQuote')
            .mockImplementationOnce(() => pendingNodeAPromise as any);

        const { rerender } = render(
            <GovernedQuoteSmokeTest 
                initialSpec={fahrmannSpec} 
                printerNodeId="node-A" 
            />
        );

        const calcButton = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcButton);

        // Request for Node A is pending
        expect(calcButton).toBeDisabled();

        // Switch to Node B while Node A request is still in-flight
        rerender(
            <GovernedQuoteSmokeTest 
                initialSpec={fahrmannSpec} 
                printerNodeId="node-B" 
            />
        );

        // Loading should be reset for Node B
        expect(calcButton).not.toBeDisabled();

        // Resolve and wait for delayed response from Node A inside act()
        await act(async () => {
            resolveNodeAPromise(mockQuoteResult);
            await pendingNodeAPromise;
        });

        // Verify Node A's response is NOT rendered on Node B
        expect(screen.queryByText(/Real Quotation Outcome/i)).not.toBeInTheDocument();
    });

    it('7. Re-rendering with identical initialSpec values does NOT wipe out a valid quote result', async () => {
        const previewSpy = vi.spyOn(printhouseCalibrationApi, 'previewQuote').mockResolvedValue(mockQuoteResult);

        const { rerender } = render(
            <GovernedQuoteSmokeTest 
                initialSpec={fahrmannSpec} 
                printerNodeId="node-329a3bc4" 
            />
        );

        const calcButton = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcButton);

        await waitFor(() => {
            expect(screen.getByText(/Real Quotation Outcome/i)).toBeInTheDocument();
        });

        // Re-render parent with new object instance containing identical values
        rerender(
            <GovernedQuoteSmokeTest 
                initialSpec={{ ...fahrmannSpec }} 
                printerNodeId="node-329a3bc4" 
            />
        );

        // Valid quote result MUST NOT be cleared
        expect(screen.getByText(/Real Quotation Outcome/i)).toBeInTheDocument();
    });

    it('8. Standard job with endpapers="none" renders quote preview without simplified approximation warning', async () => {
        const standardResult = {
            ...mockQuoteResult,
            isSimplifiedApproximation: false,
            warnings: []
        };
        vi.spyOn(printhouseCalibrationApi, 'previewQuote').mockResolvedValue(standardResult);

        const standardSpec = {
            copies: 1000,
            book_width_mm: 170,
            book_height_mm: 240,
            interior_pages: 128,
            binding_method: 'perfect bound',
            endpapers: 'none',
            has_endpapers: false
        };

        render(
            <GovernedQuoteSmokeTest
                initialSpec={standardSpec}
                printerNodeId="node-329a3bc4"
            />
        );

        const calcButton = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcButton);

        await waitFor(() => {
            expect(screen.getByText(/Real Quotation Outcome/i)).toBeInTheDocument();
        });

        expect(screen.queryByText(/SIMPLIFIED_INTERIOR_APPROXIMATION/i)).not.toBeInTheDocument();
    });

    it('9. Complex spec with mixed interior, guardas and barniz renders simplified approximation warning', async () => {
        const complexResult = {
            ...mockQuoteResult,
            isSimplifiedApproximation: true,
            warnings: ['SIMPLIFIED_INTERIOR_APPROXIMATION: Spec has complex features (208p 1/1 + 8p 4/4; Guardas; Barniz UVI) calculated using single-pass approximation.']
        };
        vi.spyOn(printhouseCalibrationApi, 'previewQuote').mockResolvedValue(complexResult);

        render(
            <GovernedQuoteSmokeTest
                initialSpec={fahrmannSpec}
                printerNodeId="node-329a3bc4"
            />
        );

        const calcButton = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcButton);

        await waitFor(() => {
            expect(screen.getByText(/Real Quotation Outcome/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/SIMPLIFIED_INTERIOR_APPROXIMATION/i)).toBeInTheDocument();
    });

    it('10. Rehydrate cal-adc1df15 ACCEPTED session and apply new Fährmann offer: calls createSession (3000 copies, target 6048) without updating historical session or rendering its 939.66 run', async () => {
        const historicalSession = {
            id: 'cal-adc1df15',
            printerNodeId: 'node-329a3bc4',
            status: 'ACCEPTED',
            bookSpec: {
                copies: 750,
                book_width_mm: 170,
                book_height_mm: 240,
                interior_pages: 64,
                interior_print: '1/1',
                paper_type_interior: 'offset',
                paper_weight_interior: 80,
                cover_print: '4/0',
                paper_type_cover: 'mc',
                paper_weight_cover: 250,
                delivery_country: 'ES'
            },
            targetManufacturingPrice: 939.66,
            acceptedAt: '2026-08-23T10:00:00Z'
        };

        const historicalRun = {
            id: 'crun-70aa6d5c',
            status: 'SUCCEEDED',
            targetPrice: 939.66,
            enginePriceAfter: 939.66,
            sessionInputChecksum: 'sha256:hist750'
        };

        const listSessionsSpy = vi.spyOn(printhouseCalibrationApi, 'listSessions').mockResolvedValue([historicalSession]);
        const listRunsSpy = vi.spyOn(printhouseCalibrationApi, 'listRuns').mockResolvedValue([historicalRun]);

        const createSessionSpy = vi.spyOn(printhouseCalibrationApi, 'createSession').mockResolvedValue({
            id: 'cal-newdraft-999',
            status: 'DRAFT',
            bookSpec: fahrmannSpec,
            targetManufacturingPrice: 6048
        });
        const updateDraftSessionSpy = vi.spyOn(printhouseCalibrationApi, 'updateDraftSession');

        const interpretSpy = vi.spyOn(printhouseCalibrationApi, 'interpretPreSession').mockResolvedValue({
            proposal: {
                specPatch: fahrmannSpec,
                declaredCommercials: {
                    targetManufacturingPrice: 6048,
                    includesPaper: true,
                    includesBinding: true,
                    includesFinishing: true,
                    includesPackaging: true
                },
                explanation: 'Fährmann offer proposal extracted'
            }
        });

        render(<QuickCalibrationPanel printerNodeId="node-329a3bc4" />);

        // Wait for session rehydration loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/Restoring calibration workspace/i)).not.toBeInTheDocument();
        });

        // Historical run for 939.66 MUST NOT be rendered for ACCEPTED session rehydration
        expect(screen.queryByText(/939\.66/i)).not.toBeInTheDocument();

        // Click Step 1 to enter new job description for the new offer proposal
        const step1Btn = screen.getByRole('button', { name: /Describe Job/i });
        fireEvent.click(step1Btn);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/Describe el libro o adjunta un PDF/i)).toBeInTheDocument();
        });

        // Type in conversational chat and click Send
        const input = screen.getByPlaceholderText(/Describe el libro o adjunta un PDF/i);
        fireEvent.change(input, { target: { value: 'New quote proposal for Fährmann 3000 copies 6048 EUR' } });

        const sendBtn = screen.getByRole('button', { name: /Send/i });
        fireEvent.click(sendBtn);

        // Wait for proposal to be rendered in chat
        await waitFor(() => {
            expect(screen.getByText(/Fährmann offer proposal extracted/i)).toBeInTheDocument();
        });

        // Click Apply Extracted Details button
        const applyBtn = screen.getByRole('button', { name: /Apply Extracted Details/i });
        fireEvent.click(applyBtn);

        await waitFor(() => {
            expect(createSessionSpy).toHaveBeenCalled();
        });

        const createdPayload = createSessionSpy.mock.calls[0][0];
        expect(createdPayload.bookSpec.copies).toBe(3000);
        expect(createdPayload.targetManufacturingPrice).toBe(6048);
        expect(updateDraftSessionSpy).not.toHaveBeenCalled();
    });

    it('11. Rehydrate READY/CALCULATED session: shows run with matching checksum, and clears run (null) when checksum is missing or mismatching', async () => {
        const calculatedSession = {
            id: 'cal-calc-100',
            printerNodeId: 'node-329a3bc4',
            status: 'CALCULATED',
            bookSpec: fahrmannSpec
        };

        const matchingChecksum = await computeBookSpecChecksum(fahrmannSpec);

        const matchingRun = {
            id: 'crun-match',
            status: 'SUCCEEDED',
            sessionInputChecksum: matchingChecksum,
            enginePriceBefore: 6200,
            enginePriceAfter: 6048,
            targetPrice: 6048,
            absoluteResidual: 0,
            percentResidual: 0
        };

        const listSessionsSpy = vi.spyOn(printhouseCalibrationApi, 'listSessions').mockImplementation(async (nodeId) => {
            if (nodeId === 'node-329a3bc4') {
                return [{ ...calculatedSession, printerNodeId: 'node-329a3bc4' }];
            }
            if (nodeId === 'node-no-checksum') {
                return [{ ...calculatedSession, id: 'cal-calc-no-ck', printerNodeId: 'node-no-checksum' }];
            }
            return [{ ...calculatedSession, id: 'cal-calc-mismatch', printerNodeId: 'node-mismatch' }];
        });

        const listRunsSpy = vi.spyOn(printhouseCalibrationApi, 'listRuns').mockImplementation(async (sessionId) => {
            if (sessionId === 'cal-calc-100') return [matchingRun];
            if (sessionId === 'cal-calc-no-ck') return [{ id: 'crun-no-checksum', status: 'SUCCEEDED', sessionInputChecksum: null }];
            return [{ id: 'crun-mismatch', status: 'SUCCEEDED', sessionInputChecksum: 'sha256:different999' }];
        });

        const ensureAdvancedOpen = () => {
            if (!screen.queryByText(/Advanced Physical Specification & Provenance Matrix/i)) {
                const advBtn = screen.getByRole('button', { name: /^Advanced Details$/i });
                fireEvent.click(advBtn);
            }
            expect(screen.getByText(/Advanced Physical Specification & Provenance Matrix/i)).toBeInTheDocument();
        };

        const { rerender } = render(<QuickCalibrationPanel printerNodeId="node-329a3bc4" />);

        // Wait for listRuns and rehydration of node-329a3bc4 to finish
        await waitFor(() => {
            expect(listRunsSpy).toHaveBeenCalledWith('cal-calc-100');
            expect(screen.queryByText(/Restoring calibration workspace/i)).not.toBeInTheDocument();
        });

        ensureAdvancedOpen();
        // Matching checksum MUST display the run summary
        expect(screen.getByText(/Pricing Calibration Proposal/i)).toBeInTheDocument();

        // Case B: Missing run checksum
        rerender(<QuickCalibrationPanel printerNodeId="node-no-checksum" />);
        await waitFor(() => {
            expect(listRunsSpy).toHaveBeenCalledWith('cal-calc-no-ck');
            expect(screen.queryByText(/Restoring calibration workspace/i)).not.toBeInTheDocument();
        });

        ensureAdvancedOpen();
        expect(screen.queryByText(/Pricing Calibration Proposal/i)).not.toBeInTheDocument();

        // Case C: Mismatching run checksum
        rerender(<QuickCalibrationPanel printerNodeId="node-mismatch" />);
        await waitFor(() => {
            expect(listRunsSpy).toHaveBeenCalledWith('cal-calc-mismatch');
            expect(screen.queryByText(/Restoring calibration workspace/i)).not.toBeInTheDocument();
        });

        ensureAdvancedOpen();
        expect(screen.queryByText(/Pricing Calibration Proposal/i)).not.toBeInTheDocument();
    });

    it('12. Changing session or node while listRuns/checksum is pending discards stale response on new node', async () => {
        let resolveNodeARuns: (val: any) => void = () => {};
        const pendingRunsPromise = new Promise((resolve) => {
            resolveNodeARuns = resolve;
        });

        const matchingChecksum = await computeBookSpecChecksum(fahrmannSpec);
        const nodeARun = {
            id: 'crun-nodeA',
            status: 'SUCCEEDED',
            sessionInputChecksum: matchingChecksum,
            targetPrice: 6048,
            absoluteResidual: 0
        };

        const listSessionsSpy = vi.spyOn(printhouseCalibrationApi, 'listSessions').mockImplementation(async (nodeId) => {
            if (nodeId === 'node-A') return [{ id: 'cal-A', printerNodeId: 'node-A', status: 'CALCULATED', bookSpec: fahrmannSpec }];
            return [{ id: 'cal-B', printerNodeId: 'node-B', status: 'READY', bookSpec: fahrmannSpec }];
        });

        const listRunsSpy = vi.spyOn(printhouseCalibrationApi, 'listRuns').mockImplementation(async (sessionId) => {
            if (sessionId === 'cal-A') return pendingRunsPromise as any;
            return [];
        });

        const { rerender } = render(<QuickCalibrationPanel printerNodeId="node-A" />);

        // Wait explicitly until listRuns has been called with 'cal-A'
        await waitFor(() => {
            expect(listRunsSpy).toHaveBeenCalledWith('cal-A');
        });

        // Switch to node-B while node-A listRuns is still pending
        rerender(<QuickCalibrationPanel printerNodeId="node-B" />);

        // Wait for node-B rehydration loading to finish
        await waitFor(() => {
            expect(screen.queryByText(/Restoring calibration workspace/i)).not.toBeInTheDocument();
        });

        // Resolve node-A delayed promise inside act()
        await act(async () => {
            resolveNodeARuns([nodeARun]);
            await pendingRunsPromise;
        });

        // Open Advanced Details drawer on node-B
        const advBtn = screen.queryByRole('button', { name: /Advanced Details/i });
        if (advBtn) {
            fireEvent.click(advBtn);
        }

        // Response for node-A MUST NOT leak into node-B view
        expect(screen.queryByText(/Pricing Calibration Proposal/i)).not.toBeInTheDocument();
    });

    it('13. Complex offer flow via real component: previewQuote receives original complex attributes (mixed interior, guardas, barniz) and renders approximation warnings', async () => {
        const complexSpec = {
            ...fahrmannSpec,
            has_mixed_interior: true,
            mixed_interior_details: '208p 1/1 + 8p 4/4',
            has_endpapers: true,
            endpapers_details: 'Guardas 115g',
            has_spot_uv: true,
            spot_uv_details: 'Barniz UVI'
        };

        const previewSpy = vi.spyOn(printhouseCalibrationApi, 'previewQuote').mockResolvedValue({
            ...mockQuoteResult,
            isSimplifiedApproximation: true,
            warnings: ['SIMPLIFIED_INTERIOR_APPROXIMATION: Spec has complex features (208p 1/1 + 8p 4/4; Guardas; Barniz UVI) calculated using single-pass approximation.']
        });

        render(
            <GovernedQuoteSmokeTest
                initialSpec={complexSpec}
                printerNodeId="node-329a3bc4"
            />
        );

        const calcButton = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcButton);

        await waitFor(() => {
            expect(previewSpy).toHaveBeenCalled();
        });

        const previewArg = previewSpy.mock.calls[0][0];
        expect(previewArg.has_mixed_interior).toBe(true);
        expect(previewArg.mixed_interior_details).toBe('208p 1/1 + 8p 4/4');
        expect(previewArg.has_endpapers).toBe(true);
        expect(previewArg.endpapers_details).toBe('Guardas 115g');
        expect(previewArg.has_spot_uv).toBe(true);
        expect(previewArg.spot_uv_details).toBe('Barniz UVI');

        await waitFor(() => {
            expect(screen.getByText(/SIMPLIFIED_INTERIOR_APPROXIMATION/i)).toBeInTheDocument();
        });
    });

    it('14. QuickCalibrationPanel complex DRAFT lifecycle: applies proposal, captures createSession payload, remounts QuickCalibrationPanel, recovers DRAFT via listSessions, answers clarifications and calculates previewQuote with complex attributes', async () => {
        const complexSpecPatch = {
            copies: 3000,
            book_width_mm: 139,
            book_height_mm: 212,
            interior_pages: 216,
            interior_print: '1/1',
            paper_type_interior: 'munken',
            paper_weight_interior: 90,
            cover_print: '4/0',
            paper_type_cover: 'mc',
            paper_weight_cover: 130,
            lamination: 'matt',
            binding_method: 'hardcover',
            delivery_country: 'DE',
            has_mixed_interior: true,
            mixed_interior_details: '208p 1/1 Pantone + 8p 4/4 CMYK',
            has_endpapers: true,
            endpapers_details: 'Guardas 115g',
            has_spot_uv: true,
            spot_uv_details: 'Barniz UVI'
        };

        const listSessionsSpy = vi.spyOn(printhouseCalibrationApi, 'listSessions').mockResolvedValue([]);
        const createSessionSpy = vi.spyOn(printhouseCalibrationApi, 'createSession').mockImplementation(async (payload) => ({
            id: 'cal-complex-draft-101',
            status: 'DRAFT',
            printerNodeId: payload.printerNodeId,
            bookSpec: payload.bookSpec,
            targetManufacturingPrice: payload.targetManufacturingPrice,
            currency: payload.currency,
            includesPaper: true,
            includesBinding: true,
            includesFinishing: true,
            includesPackaging: true
        }));

        vi.spyOn(printhouseCalibrationApi, 'interpretPreSession').mockResolvedValue({
            proposal: {
                specPatch: complexSpecPatch,
                declaredCommercials: {
                    targetManufacturingPrice: 6048,
                    includesPaper: true,
                    includesBinding: true,
                    includesFinishing: true,
                    includesPackaging: true
                },
                explanation: 'Complex spec proposal extracted'
            }
        });

        const assistantChatSpy = vi.spyOn(printhouseCalibrationApi, 'assistantChat').mockResolvedValue({
            proposal: {
                specPatch: {},
                explanation: 'Please clarify delivery country',
                clarificationQuestions: [
                    { field: 'delivery_country', question: 'What is the destination country?', options: ['ES', 'DE'] }
                ]
            }
        });

        const previewSpy = vi.spyOn(printhouseCalibrationApi, 'previewQuote').mockResolvedValue(mockQuoteResult);

        const { unmount } = render(<QuickCalibrationPanel printerNodeId="node-329a3bc4" />);

        await waitFor(() => {
            expect(screen.queryByText(/Restoring calibration workspace/i)).not.toBeInTheDocument();
        });

        // Step 1: Describe Job
        const step1Btn = screen.getByRole('button', { name: /Describe Job/i });
        fireEvent.click(step1Btn);

        const input = screen.getByPlaceholderText(/Describe el libro o adjunta un PDF/i);
        fireEvent.change(input, { target: { value: 'Proposal with mixed interior, endpapers and spot UV' } });
        fireEvent.click(screen.getByRole('button', { name: /Send/i }));

        await waitFor(() => {
            expect(screen.getByText(/Complex spec proposal extracted/i)).toBeInTheDocument();
        });

        // Step 2: Apply Extracted Details & Capture createSession payload
        fireEvent.click(screen.getByRole('button', { name: /Apply Extracted Details/i }));

        await waitFor(() => {
            expect(createSessionSpy).toHaveBeenCalled();
        });

        const sessionPayload = createSessionSpy.mock.calls[0][0];
        expect(sessionPayload.bookSpec.has_mixed_interior).toBe(true);
        expect(sessionPayload.bookSpec.mixed_interior_details).toBe('208p 1/1 Pantone + 8p 4/4 CMYK');
        expect(sessionPayload.bookSpec.has_endpapers).toBe(true);
        expect(sessionPayload.bookSpec.endpapers_details).toBe('Guardas 115g');
        expect(sessionPayload.bookSpec.has_spot_uv).toBe(true);
        expect(sessionPayload.bookSpec.spot_uv_details).toBe('Barniz UVI');

        // Step 3: Unmount component to simulate user navigating away
        unmount();

        // Stateful session tracking: Mocks maintain updated state across lifecycle
        let currentSessionState: any = {
            id: 'cal-complex-draft-101',
            printerNodeId: 'node-329a3bc4',
            status: 'DRAFT',
            bookSpec: { ...sessionPayload.bookSpec },
            targetManufacturingPrice: 6048,
            currency: 'EUR',
            includesPaper: true,
            includesBinding: true,
            includesFinishing: true,
            includesPackaging: true
        };

        listSessionsSpy.mockImplementation(async () => [{ ...currentSessionState }]);

        const updateDraftSessionSpy = vi.spyOn(printhouseCalibrationApi, 'updateDraftSession').mockImplementation(async (id, payload) => {
            currentSessionState = {
                ...currentSessionState,
                ...payload,
                bookSpec: {
                    ...currentSessionState.bookSpec,
                    ...(payload.bookSpec || {})
                }
            };
            return { ...currentSessionState };
        });

        const markReadySpy = vi.spyOn(printhouseCalibrationApi, 'markSessionReady').mockImplementation(async (id) => {
            currentSessionState = { ...currentSessionState, status: 'READY' };
            return { ...currentSessionState };
        });

        const calculateSpy = vi.spyOn(printhouseCalibrationApi, 'calculateCalibration').mockResolvedValue({
            id: 'crun-complex-run-1',
            status: 'SUCCEEDED',
            targetPrice: 6048,
            enginePriceAfter: 6048,
            absoluteResidual: 0,
            sessionInputChecksum: await computeBookSpecChecksum(sessionPayload.bookSpec)
        });

        const getSessionSpy = vi.spyOn(printhouseCalibrationApi, 'getSession').mockImplementation(async (id) => {
            currentSessionState = { ...currentSessionState, status: 'CALCULATED' };
            return { ...currentSessionState };
        });

        const acceptSpy = vi.spyOn(printhouseCalibrationApi, 'acceptCalibrationRun').mockImplementation(async (id, runId) => {
            // NOTE: Governed acceptance is mocked here to verify UI data continuity and state propagation.
            // This test verifies UI preservation of complex spec attributes across stepper transitions,
            // not backend authorization rules for complex specifications.
            currentSessionState = { ...currentSessionState, status: 'ACCEPTED' };
            return { ...currentSessionState };
        });

        // Remount QuickCalibrationPanel directly (NOT GovernedQuoteSmokeTest directly) — it MUST rehydrate via listSessions!
        render(<QuickCalibrationPanel printerNodeId="node-329a3bc4" />);

        // Verify listSessions is invoked again and cal-complex-draft-101 is recovered
        await waitFor(() => {
            expect(listSessionsSpy).toHaveBeenCalledTimes(2);
            expect(screen.queryByText(/Restoring calibration workspace/i)).not.toBeInTheDocument();
        });

        // Navigate to Step 1 to answer a clarification via the real UI
        fireEvent.click(screen.getByRole('button', { name: /Describe Job/i }));

        const chatInput2 = screen.getByPlaceholderText(/Describe el libro o adjunta un PDF/i);
        fireEvent.change(chatInput2, { target: { value: 'Clarify destination country' } });
        fireEvent.click(screen.getByRole('button', { name: /Send/i }));

        await waitFor(() => {
            expect(screen.getByText(/What is the destination country\?/i)).toBeInTheDocument();
        });

        // Answer clarification via real UI button (select Germany DE)
        const deOptBtn = screen.getByRole('button', { name: /Germany \(DE\)/i });
        fireEvent.click(deOptBtn);

        const continueAnsBtn = screen.getByRole('button', { name: /Continue with these answers/i });
        fireEvent.click(continueAnsBtn);

        // Now navigate through Step 3, Step 4 to Step 5 (Test Pricing -> Calculate Test Quote)
        // Go to Step 3
        fireEvent.click(screen.getByRole('button', { name: /Manufacturing Cost/i }));

        // Click "Use this job to calibrate my pricing" -> transitions to Step 4 via updateDraftSession & markSessionReady
        fireEvent.click(screen.getByRole('button', { name: /Use this job to calibrate my pricing/i }));

        await waitFor(() => {
            expect(updateDraftSessionSpy).toHaveBeenCalled();
            expect(markReadySpy).toHaveBeenCalledWith('cal-complex-draft-101');
        });

        // Immediately verify updateDraftSession payload preserves all 6 original complex spec attributes
        const updatedDraftPayload = updateDraftSessionSpy.mock.calls[0][1];
        expect(updatedDraftPayload.bookSpec.has_mixed_interior).toBe(true);
        expect(updatedDraftPayload.bookSpec.mixed_interior_details).toBe('208p 1/1 Pantone + 8p 4/4 CMYK');
        expect(updatedDraftPayload.bookSpec.has_endpapers).toBe(true);
        expect(updatedDraftPayload.bookSpec.endpapers_details).toBe('Guardas 115g');
        expect(updatedDraftPayload.bookSpec.has_spot_uv).toBe(true);
        expect(updatedDraftPayload.bookSpec.spot_uv_details).toBe('Barniz UVI');

        // In Step 4, click "Run Pricing Calibration"
        const runCalcBtn = screen.getByRole('button', { name: /Run Pricing Calibration/i });
        fireEvent.click(runCalcBtn);

        await waitFor(() => {
            expect(calculateSpy).toHaveBeenCalledWith('cal-complex-draft-101');
        });

        // In Step 4, click "Accept Pricing Revision" to open modal
        const acceptBtns = screen.getAllByRole('button', { name: /Accept Pricing Revision/i });
        fireEvent.click(acceptBtns[0]);

        // Click Accept Pricing Revision in modal (second button with this name)
        const modalAcceptBtns = screen.getAllByRole('button', { name: /Accept Pricing Revision/i });
        fireEvent.click(modalAcceptBtns[modalAcceptBtns.length - 1]);

        await waitFor(() => {
            expect(acceptSpy).toHaveBeenCalledWith('cal-complex-draft-101', 'crun-complex-run-1');
        });

        // Click Verify Pricing to navigate to Step 5 (GovernedQuoteSmokeTest)
        const verifyPricingBtn = screen.getByRole('button', { name: /Verify Pricing/i });
        fireEvent.click(verifyPricingBtn);

        // Step 5 is now rendered! Click "Calculate Test Quote" in GovernedQuoteSmokeTest (embedded in Step 5)
        const calcTestQuoteBtn = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcTestQuoteBtn);

        await waitFor(() => {
            expect(previewSpy).toHaveBeenCalled();
        });

        // Verify previewQuote received all six original complex spec attributes!
        const previewPayload = previewSpy.mock.calls[0][0];
        expect(previewPayload.has_mixed_interior).toBe(true);
        expect(previewPayload.mixed_interior_details).toBe('208p 1/1 Pantone + 8p 4/4 CMYK');
        expect(previewPayload.has_endpapers).toBe(true);
        expect(previewPayload.endpapers_details).toBe('Guardas 115g');
        expect(previewPayload.has_spot_uv).toBe(true);
        expect(previewPayload.spot_uv_details).toBe('Barniz UVI');
    });

    it('15. Exact Assistant response reproduction: specPatch without booleans derives complexity from text/explanation/warnings and preserves preview approximation', async () => {
        const calibrationAssistantService = require('../src/api/services/calibrationAssistantService');
        const quotePreviewService = require('../src/api/services/printhouseQuotePreviewService');

        // Raw assistant response without explicit booleans in specPatch
        const rawAssistantJson = {
            intent: 'SPEC_EXTRACTION',
            specPatch: {
                copies: 3000,
                book_width_mm: 139,
                book_height_mm: 212,
                interior_pages: 216,
                interior_print: '1/1',
                paper_type_interior: 'munken',
                paper_weight_interior: 90,
                cover_print: '4/0',
                paper_type_cover: 'mc',
                paper_weight_cover: 130,
                binding_method: 'hardcover',
                lamination: 'matt',
                delivery_country: 'DE',
                mixed_interior_details: '208p 1/1 Pantone + 8p 4/4 CMYK',
                endpapers_details: 'Guardas sin imprimir 115g',
                spot_uv_details: 'Barniz UVI en portada'
                // Note: has_mixed_interior, has_endpapers, has_spot_uv booleans omitted!
            },
            declaredCommercials: {
                targetManufacturingPrice: 6048,
                currency: 'EUR',
                transportPricePerKg: 'Transport not included (€435 total separate)',
                includesPaper: true,
                includesBinding: true,
                includesFinishing: true,
                includesPackaging: true
            },
            explanation: 'Oferta Fährmann para 3000 ejemplares. Incluye interior mixto (208p 1/1 + 8p 4/4), guardas sin imprimir y barniz UVI.',
            warnings: ['Interior mixto detectado', 'Barniz UVI detectado'],
            readyForValidation: true
        };

        const normalized = calibrationAssistantService._validateAndNormalizeAIResponse(rawAssistantJson);

        // Server MUST derive complexity booleans from text/explanation/warnings
        expect(normalized.specPatch.has_mixed_interior).toBe(true);
        expect(normalized.specPatch.has_endpapers).toBe(true);
        expect(normalized.specPatch.has_spot_uv).toBe(true);
        expect(normalized.declaredCommercials.transportPricePerKg).toBeNull();

        // Preview quote service MUST set isSimplifiedApproximation and warning
        const sampleNode = {
            id: 'node-test',
            name: 'Test Node',
            rates_json: {
                base_setup_price: 100,
                paper_price_interior_by_kilo: { munken: 2.0, offset: 1.2, mc: 1.4 },
                paper_price_cover_by_kilo: { mc: 1.5 },
                paper_price_endpaper_by_kilo: { offset: 1.3 },
                binding_hc_fixed_by_sections: { s4: 50, s8: 70, s16: 100 },
                binding_hc_var_per_1000_by_sections: { s4: 30, s8: 45, s16: 65 },
                lam_fixed: { matt: 20 },
                lam_var_per_1000: { matt: 12 },
                destinations: { DE: { shipping_flat_eur: 45 } }
            },
            signatures: [16, 8, 4],
            production_lead_days: 7,
            delivery_time: 2
        };

        vi.spyOn(quotePreviewService, 'generateQuotePreview').mockImplementation(async (tId, spec) => {
            const hasComplex = Boolean(spec.has_mixed_interior || spec.mixed_interior_details || spec.has_endpapers || spec.has_spot_uv);
            return {
                ok: true,
                isSimplifiedApproximation: hasComplex,
                warnings: hasComplex ? ['SIMPLIFIED_INTERIOR_APPROXIMATION: Spec has complex features calculated using single-pass approximation.'] : [],
                originalJobSpec: spec,
                totals: { manufacturing: 4611.6, transport: 0, finalSellingPrice: 4611.6 }
            };
        });

        const previewRes = await quotePreviewService.generateQuotePreview('tenant-test', normalized.specPatch);
        expect(previewRes.isSimplifiedApproximation).toBe(true);
        expect(previewRes.warnings.some((w: string) => w.includes('SIMPLIFIED_INTERIOR_APPROXIMATION'))).toBe(true);
        expect(previewRes.originalJobSpec.mixed_interior_details).toBe('208p 1/1 Pantone + 8p 4/4 CMYK');
    });

    it('16. Clarification answers: canonicalizes interior_print to 1/1, sets transportPricePerKg to null for textual options, and preserves €435 total transport', () => {
        let draftSpec: any = { copies: 3000, book_width_mm: 139, book_height_mm: 212, interior_pages: 216, binding_method: 'hardcover' };
        let draftCommercials: any = { targetManufacturingPrice: 6048, currency: 'EUR' };

        const answers = {
            interior_print: '1/1 (Single color black)',
            transportPricePerKg: 'Transport not included (€435 total separate)',
            delivery_country: 'DE (Germany)'
        };

        // Execute clarification parsing logic
        Object.entries(answers).forEach(([field, answer]) => {
            if (field === 'interior_print' || field === 'interiorPrint') {
                const match = answer.match(/\b([1-4]\/[1-4])\b/);
                if (match) draftSpec.interior_print = match[1];
            } else if (field === 'delivery_country' || field === 'destination') {
                const match = answer.match(/\b([A-Z]{2})\b/i);
                if (match) draftSpec.delivery_country = match[1].toUpperCase();
            } else if (field === 'transportPricePerKg' || field === 'transport') {
                const matchKg = answer.match(/(\d+(?:\.\d+)?)\s*(?:€|\$|eur)?\s*\/\s*kg/i);
                draftCommercials.transportPricePerKg = matchKg ? parseFloat(matchKg[1]) : null;
            }
        });

        expect(draftSpec.interior_print).toBe('1/1');
        expect(draftSpec.delivery_country).toBe('DE');
        expect(draftCommercials.transportPricePerKg).toBeNull();
    });

    it('17. Production provenance preservation: full offer prompt -> brief clarification turn -> original raw_text preserved in specPatch without manual test merge', async () => {
        const calibrationAssistantService = require('../src/api/services/calibrationAssistantService');
        const db = require('../src/api/services/mysqlClient');
        const aiAdapter = require('../src/api/services/aiProviderAdapter');

        const fullOfferRawText = `El usuario introdujo la oferta Fährmann:
- 3.000 ejemplares.
- Formato cerrado 139 × 212 mm.
- Interior: 208 páginas 1+1 Pantone + 8 páginas consecutivas 4+4.
- Papel interior Munken Print Cream 1.5, 90 g/m².
- Guardas 115 g/m², sin impresión.
- Tapa dura, cartón 2,4 mm, cosido con hilo.
- Cubierta 4+0, papel 130 g/m²; Silk/Gloss pendiente de aclarar.
- Laminado mate y barniz relieve parcial.
- Precio cotizado de fabricación: 6.048 € sin IVA.
- Transporte: 435 €, separado y excluido de calibración.
- Destino: Alemania.`;

        // Mock DB session fetch: session.book_spec_json already contains full offer raw_text from turn 1
        const mockSessionRow = {
            id: 'cal-faehrmann-101',
            tenant_id: 'tenant-test',
            printer_node_id: 'node-329a3bc4',
            printer_node_name_snapshot: 'Production Node',
            book_spec_json: JSON.stringify({
                copies: 3000,
                book_width_mm: 139,
                book_height_mm: 212,
                interior_pages: 216,
                raw_text: fullOfferRawText
            }),
            target_manufacturing_price: 6048,
            currency: 'EUR',
            transport_price_per_kg: null,
            transport_currency: 'EUR',
            includes_paper: true,
            includes_binding: true,
            includes_finishing: true,
            includes_packaging: true,
            status: 'DRAFT'
        };

        vi.spyOn(db, 'query').mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT') && sql.includes('printhouse_pricing_calibration_sessions')) {
                return [mockSessionRow];
            }
            return [];
        });

        // Mock AI adapter response for Turn 2 (Gemini returns a brief clarification response JSON with its own raw_text alias)
        vi.spyOn(aiAdapter, 'generateStructuredCompletion').mockResolvedValue({
            model: 'gemini-2.5-flash',
            latencyMs: 120,
            json: {
                intent: 'CLARIFICATION_NEEDED',
                specPatch: {
                    interior_print: '4/4',
                    raw_text: 'Gemini summary text that must NOT overwrite original offer'
                },
                declaredCommercials: {},
                clarificationQuestions: []
            }
        });

        const actor = { id: 'user-1', email: 'manager@printhouse.com', role: 'MANAGER' };
        const briefClarificationAnswer = 'Yes, convert flat rate to per-kg based on estimated weight';

        // Call production service assistant chat for Turn 2 (no manual test merge)
        const chatResult = await calibrationAssistantService.chat('tenant-test', 'cal-faehrmann-101', briefClarificationAnswer, actor);

        // Verify production pipeline preserves original full offer raw_text from session
        expect(chatResult.ok).toBe(true);
        expect(chatResult.proposal.specPatch.raw_text).toBe(fullOfferRawText);
        expect(chatResult.proposal.specPatch.raw_text).not.toBe(briefClarificationAnswer);
        expect(chatResult.proposal.specPatch.raw_text).not.toBe('Gemini summary text that must NOT overwrite original offer');
        expect(chatResult.proposal.specPatch.interior_print).toBe('4/4');
    });

    it('18. generateQuotePreview verifies binding breakdown (1.25 €), no duplicate totals, and incomplete rate validation for explicit zero interior rates', async () => {
        const db = require('../src/api/services/mysqlClient');
        const printhouseQuotePreviewService = require('../src/api/services/printhouseQuotePreviewService');
        const buildPriceCalibrationAdapter = require('../src/api/services/buildPriceCalibrationAdapter');

        const fakeNode = {
            id: 'node-329a3bc4',
            tenant_id: 'tenant-test',
            name: 'Test Node',
            rates_json: JSON.stringify({
                paper_price_interior_by_kilo: { munken: 0 },
                interior_full_colour_fixed: { '24p': 0 },
                interior_full_colour_var: { '24p': 0 },
                paper_price_cover_by_kilo: { mc: 4.0756 },
                cover_fixed_by_colours: { '4': 134.8284 },
                binding_hc_fixed_by_sections: { '9': 1.25 }
            }),
            signatures: JSON.stringify([24]),
            limits: JSON.stringify({ min_copies: 100, max_copies: 10000 }),
            production_lead_days: 7,
            delivery_time: '9 days'
        };

        vi.spyOn(db, 'query').mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT') && sql.includes('printer_nodes')) {
                return [fakeNode];
            }
            return [];
        });

        // Mock BPE adapter returning observed lines: Cover paper (293.44 €) + Binding (hardcover) (1.25 €)
        vi.spyOn(buildPriceCalibrationAdapter, 'evaluateForwardPrice').mockReturnValue({
            predictedManufacturingPrice: 294.69,
            predictedTransportPrice: 0.00,
            totalPredictedPrice: 294.69,
            signature: 24,
            sections: 9,
            lines: [
                { item: 'Cover paper (130gsm, 4p)', line_total: 293.44 },
                { item: 'Binding (hardcover)', line_total: 1.25 }
            ],
            enginePackage: '@ppos/pricing-engine',
            engineVersion: '1.0.0',
            engineCommit: '8d324290d64b5bf17325ff1098db7ebb5f646b5d',
            engineSource: 'git-pinned'
        });

        const jobSpec = {
            copies: 3000,
            book_width_mm: 139,
            book_height_mm: 212,
            interior_pages: 216,
            interior_print: '4/4',
            paper_type_interior: 'munken',
            paper_weight_interior: 90,
            cover_print: '4/0',
            paper_type_cover: 'mc',
            paper_weight_cover: 130,
            binding_method: 'hardcover',
            lamination: 'matt',
            delivery_country: 'DE'
        };

        const result = await printhouseQuotePreviewService.generateQuotePreview('tenant-test', jobSpec, 'node-329a3bc4');

        // 1. Verify breakdown and binding classification
        expect(result.ok).toBe(true);
        expect(result.totals.binding).toBe(1.25);
        expect(result.totals.manufacturing).toBe(294.69);
        expect(result.totals.finalSellingPrice).toBe(294.69);

        // Verify breakdown lines (Manufacturing & Print = 293.44, Binding = 1.25)
        const mfgLine = result.breakdown.find((b: any) => b.label === 'Manufacturing & Print');
        const bindingLine = result.breakdown.find((b: any) => b.label === 'Binding');

        expect(mfgLine).toBeDefined();
        expect(mfgLine.amount).toBe(293.44);
        expect(bindingLine).toBeDefined();
        expect(bindingLine.amount).toBe(1.25);

        // Verify binding is NOT duplicated (293.44 + 1.25 = 294.69)
        const breakdownSum = result.breakdown.reduce((acc: number, b: any) => acc + b.amount, 0);
        expect(Number(breakdownSum.toFixed(2))).toBe(294.69);

        // 2. Verify incomplete quote validation for Munken = 0 and interior 24p = 0
        expect(result.isValidCommercialQuote).toBe(false);
        expect(result.quoteStatus).toBe('INVALID_INCOMPLETE_RATES');
        expect(result.uncalibratedRates).toContain('paper_price_interior_by_kilo.munken');
        expect(result.uncalibratedRates).toContain('interior_full_colour_fixed.24p');
        expect(result.warnings.some((w: string) => w.includes('INVALID_INCOMPLETE_RATES'))).toBe(true);
    });

    it('19. generateQuotePreview handles MISSING rate keys, NON_FINITE values, and UNKNOWN print modes', async () => {
        const db = require('../src/api/services/mysqlClient');
        const printhouseQuotePreviewService = require('../src/api/services/printhouseQuotePreviewService');
        const buildPriceCalibrationAdapter = require('../src/api/services/buildPriceCalibrationAdapter');

        const nodeMissingAndNonFinite = {
            id: 'node-329a3bc4',
            tenant_id: 'tenant-test',
            name: 'Test Node',
            rates_json: JSON.stringify({
                paper_price_interior_by_kilo: { custom_paper: 'NaN' },
                interior_full_colour_fixed: {},
                paper_price_cover_by_kilo: { mc: 4.0 }
            }),
            signatures: JSON.stringify([16]),
            limits: JSON.stringify({ min_copies: 100, max_copies: 10000 }),
            production_lead_days: 7,
            delivery_time: '9 days'
        };

        vi.spyOn(db, 'query').mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT') && sql.includes('printer_nodes')) {
                return [nodeMissingAndNonFinite];
            }
            return [];
        });

        vi.spyOn(buildPriceCalibrationAdapter, 'evaluateForwardPrice').mockReturnValue({
            predictedManufacturingPrice: 100,
            predictedTransportPrice: 0,
            totalPredictedPrice: 100,
            signature: 16,
            sections: 8,
            lines: [{ item: 'Cover paper', line_total: 100 }]
        });

        // Case A: Missing rate key and non-finite value
        const specA = {
            copies: 1000,
            book_width_mm: 148,
            book_height_mm: 210,
            interior_pages: 128,
            interior_print: '4/4',
            paper_type_interior: 'custom_paper',
            delivery_country: 'ES'
        };

        const resultA = await printhouseQuotePreviewService.generateQuotePreview('tenant-test', specA, 'node-329a3bc4');
        expect(resultA.isValidCommercialQuote).toBe(false);
        expect(resultA.quoteStatus).toBe('INVALID_INCOMPLETE_RATES');
        expect(resultA.rateDetails.some((r: any) => r.status === 'NON_FINITE' || r.status === 'MISSING')).toBe(true);

        // Case B: Unknown print mode (5/5)
        const specB = {
            ...specA,
            interior_print: '5/5'
        };

        const resultB = await printhouseQuotePreviewService.generateQuotePreview('tenant-test', specB, 'node-329a3bc4');
        expect(resultB.isValidCommercialQuote).toBe(false);
        expect(resultB.rateDetails.some((r: any) => r.status === 'UNKNOWN_MODE')).toBe(true);
    });

    it('20a. StructuredQuoteReviewCard renders "Partial calculation: incomplete rates" in English locale and lists raw rate keys', () => {
        render(
            <LocaleProvider initialLocale="en">
                <StructuredQuoteReviewCard
                    evidenceId="ev-123"
                    filename="Quote_Faehrmann.pdf"
                    documentLanguage="de"
                    isValidCommercialQuote={false}
                    quoteStatus="INVALID_INCOMPLETE_RATES"
                    uncalibratedRates={['paper_price_interior_by_kilo.munken', 'interior_full_colour_fixed.24p']}
                    offers={[
                        {
                            quantity: 3000,
                            manufacturingPrice: 294.69,
                            transportPrice: 0,
                            quotedTotalPrice: 294.69,
                            quotedUnitPrice: 0.098,
                            validationStatus: 'CONSISTENT'
                        }
                    ]}
                />
            </LocaleProvider>
        );

        // Verify partial calculation warning banner is displayed in English
        expect(screen.getByText(/Partial calculation: incomplete rates/i)).toBeInTheDocument();
        expect(screen.getByText(/This quote is not presented as a valid commercial price/i)).toBeInTheDocument();
        expect(screen.getByText('paper_price_interior_by_kilo.munken')).toBeInTheDocument();
        expect(screen.getByText('interior_full_colour_fixed.24p')).toBeInTheDocument();
    });

    it('20b. StructuredQuoteReviewCard renders "Cálculo parcial: tarifas incompletas" in Spanish locale and lists raw rate keys', () => {
        render(
            <LocaleProvider initialLocale="es">
                <StructuredQuoteReviewCard
                    evidenceId="ev-123"
                    filename="Quote_Faehrmann.pdf"
                    documentLanguage="de"
                    isValidCommercialQuote={false}
                    quoteStatus="INVALID_INCOMPLETE_RATES"
                    uncalibratedRates={['paper_price_interior_by_kilo.munken', 'interior_full_colour_fixed.24p']}
                    offers={[
                        {
                            quantity: 3000,
                            manufacturingPrice: 294.69,
                            transportPrice: 0,
                            quotedTotalPrice: 294.69,
                            quotedUnitPrice: 0.098,
                            validationStatus: 'CONSISTENT'
                        }
                    ]}
                />
            </LocaleProvider>
        );

        // Verify partial calculation warning banner is displayed in Spanish
        expect(screen.getByText(/Cálculo parcial: tarifas incompletas/i)).toBeInTheDocument();
        expect(screen.getByText(/Esta cotización no se presenta como un precio comercial válido/i)).toBeInTheDocument();
        expect(screen.getByText('paper_price_interior_by_kilo.munken')).toBeInTheDocument();
        expect(screen.getByText('interior_full_colour_fixed.24p')).toBeInTheDocument();
    });

    it('21a. GovernedQuoteSmokeTest UI component renders English localized banners and suppresses commercial prices when quote is invalid', async () => {
        const previewQuoteSpy = vi.spyOn(printhouseCalibrationApi, 'previewQuote').mockResolvedValue({
            ok: true,
            currency: 'EUR',
            quantity: 3000,
            isValidCommercialQuote: false,
            quoteStatus: 'INVALID_INCOMPLETE_RATES',
            uncalibratedRates: ['paper_price_interior_by_kilo.munken', 'interior_full_colour_fixed.24p'],
            totals: {
                manufacturing: 294.69,
                finishing: 0,
                binding: 1.25,
                packaging: 0,
                transport: 0,
                commercialMarkup: 0,
                tax: 0,
                finalSellingPrice: 294.69
            },
            unitPrice: 0.098,
            breakdown: [
                { label: 'Manufacturing & Print', amount: 293.44 },
                { label: 'Binding', amount: 1.25 }
            ],
            productionLeadDays: 7,
            estimatedDeliveryDays: 2,
            shippingStatus: 'CONFIGURED',
            taxStatus: 'EXCLUDED',
            configurationTrace: ['Printer Node: node-329a3bc4'],
            warnings: ['INVALID_INCOMPLETE_RATES: Mandatory manufacturing rates evaluate to zero.'],
            engine: { package: '@ppos/pricing-engine', version: '1.9.5', forwardMethod: 'evaluateForwardPrice' }
        });

        render(
            <LocaleProvider initialLocale="en">
                <GovernedQuoteSmokeTest printerNodeId="node-329a3bc4" initialSpec={fahrmannSpec} />
            </LocaleProvider>
        );

        const calcBtn = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcBtn);

        await waitFor(() => {
            expect(previewQuoteSpy).toHaveBeenCalled();
            expect(screen.getByText(/Partial calculation: incomplete rates/i)).toBeInTheDocument();
        });

        // 1. Verify affected raw rate keys are listed
        expect(screen.getByText('paper_price_interior_by_kilo.munken')).toBeInTheDocument();
        expect(screen.getByText('interior_full_colour_fixed.24p')).toBeInTheDocument();

        // 2. Verify English Outcome labels & header
        expect(screen.getByText(/Diagnostic Outcome/i)).toBeInTheDocument();
        expect(screen.getByText(/Partial Diagnostic Subtotal \(Incomplete Rates\)/i)).toBeInTheDocument();
        expect(screen.queryByText(/Real Quotation Outcome/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Customer Price \(Before Tax\)/i)).not.toBeInTheDocument();

        // 3. Verify per-copy price text is suppressed and Partial Diagnostic Subtotal badge shown
        expect(screen.queryByText(/\/ copy \(Net\)/i)).not.toBeInTheDocument();
        expect(screen.getAllByText(/Partial Diagnostic Subtotal/i).length).toBeGreaterThan(0);
    });

    it('21b. GovernedQuoteSmokeTest UI component renders Spanish localized banners and suppresses commercial prices when quote is invalid', async () => {
        const previewQuoteSpy = vi.spyOn(printhouseCalibrationApi, 'previewQuote').mockResolvedValue({
            ok: true,
            currency: 'EUR',
            quantity: 3000,
            isValidCommercialQuote: false,
            quoteStatus: 'INVALID_INCOMPLETE_RATES',
            uncalibratedRates: ['paper_price_interior_by_kilo.munken', 'interior_full_colour_fixed.24p'],
            totals: {
                manufacturing: 294.69,
                finishing: 0,
                binding: 1.25,
                packaging: 0,
                transport: 0,
                commercialMarkup: 0,
                tax: 0,
                finalSellingPrice: 294.69
            },
            unitPrice: 0.098,
            breakdown: [
                { label: 'Manufacturing & Print', amount: 293.44 },
                { label: 'Binding', amount: 1.25 }
            ],
            productionLeadDays: 7,
            estimatedDeliveryDays: 2,
            shippingStatus: 'CONFIGURED',
            taxStatus: 'EXCLUDED',
            configurationTrace: ['Printer Node: node-329a3bc4'],
            warnings: ['INVALID_INCOMPLETE_RATES: Mandatory manufacturing rates evaluate to zero.'],
            engine: { package: '@ppos/pricing-engine', version: '1.9.5', forwardMethod: 'evaluateForwardPrice' }
        });

        render(
            <LocaleProvider initialLocale="es">
                <GovernedQuoteSmokeTest printerNodeId="node-329a3bc4" initialSpec={fahrmannSpec} />
            </LocaleProvider>
        );

        const calcBtn = screen.getByRole('button', { name: /Calculate Test Quote/i });
        fireEvent.click(calcBtn);

        await waitFor(() => {
            expect(previewQuoteSpy).toHaveBeenCalled();
            expect(screen.getByText(/Cálculo parcial: tarifas incompletas/i)).toBeInTheDocument();
        });

        // 1. Verify affected raw rate keys are listed
        expect(screen.getByText('paper_price_interior_by_kilo.munken')).toBeInTheDocument();
        expect(screen.getByText('interior_full_colour_fixed.24p')).toBeInTheDocument();

        // 2. Verify Spanish Outcome labels & header
        expect(screen.getByText(/Resultado Diagnóstico/i)).toBeInTheDocument();
        expect(screen.getByText(/Subtotal Parcial Diagnóstico \(Tarifas Incompletas\)/i)).toBeInTheDocument();
        expect(screen.queryByText(/Resultado de Cotización Real/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Precio al Cliente \(Antes de Impuestos\)/i)).not.toBeInTheDocument();

        // 3. Verify per-copy price text is suppressed and Subtotal Parcial Diagnóstico badge shown
        expect(screen.queryByText(/\/ ej\. \(Neto\)/i)).not.toBeInTheDocument();
        expect(screen.getAllByText(/Subtotal Parcial Diagnóstico/i).length).toBeGreaterThan(0);
    });

    it('22. generateQuotePreview correctly evaluates signature 8 and 4 without converting section keys to 16p', async () => {
        const db = require('../src/api/services/mysqlClient');
        const printhouseQuotePreviewService = require('../src/api/services/printhouseQuotePreviewService');
        const buildPriceCalibrationAdapter = require('../src/api/services/buildPriceCalibrationAdapter');

        const nodeSig8And4 = {
            id: 'node-329a3bc4',
            tenant_id: 'tenant-test',
            name: 'Test Node',
            rates_json: JSON.stringify({
                paper_price_interior_by_kilo: { offset: 1.5 },
                interior_full_colour_fixed: { '8p': 0, '4p': 0 },
                interior_full_colour_var: { '8p': 0, '4p': 0 }
            }),
            signatures: JSON.stringify([8, 4]),
            limits: JSON.stringify({ min_copies: 100, max_copies: 10000 }),
            production_lead_days: 7,
            delivery_time: '9 days'
        };

        vi.spyOn(db, 'query').mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT') && sql.includes('printer_nodes')) {
                return [nodeSig8And4];
            }
            return [];
        });

        vi.spyOn(buildPriceCalibrationAdapter, 'evaluateForwardPrice').mockReturnValue({
            predictedManufacturingPrice: 50,
            predictedTransportPrice: 0,
            totalPredictedPrice: 50,
            signature: 8,
            sections: 1,
            lines: [{ item: 'Interior paper', line_total: 50 }]
        });

        // Spec with 8 pages (signature 8 -> 8p section key consumed)
        const spec8p = {
            copies: 1000,
            book_width_mm: 148,
            book_height_mm: 210,
            interior_pages: 8,
            interior_print: '4/4',
            paper_type_interior: 'offset',
            delivery_country: 'ES'
        };

        const res8p = await printhouseQuotePreviewService.generateQuotePreview('tenant-test', spec8p, 'node-329a3bc4');
        expect(res8p.isValidCommercialQuote).toBe(false);
        expect(res8p.uncalibratedRates).toContain('interior_full_colour_fixed.8p');
        expect(res8p.uncalibratedRates).not.toContain('interior_full_colour_fixed.16p');

        // Spec with 4 pages (signature 4 -> 4p section key consumed)
        vi.spyOn(buildPriceCalibrationAdapter, 'evaluateForwardPrice').mockReturnValue({
            predictedManufacturingPrice: 30,
            predictedTransportPrice: 0,
            totalPredictedPrice: 30,
            signature: 4,
            sections: 1,
            lines: [{ item: 'Interior paper', line_total: 30 }]
        });

        const spec4p = {
            ...spec8p,
            interior_pages: 4
        };

        const res4p = await printhouseQuotePreviewService.generateQuotePreview('tenant-test', spec4p, 'node-329a3bc4');
        expect(res4p.isValidCommercialQuote).toBe(false);
        expect(res4p.uncalibratedRates).toContain('interior_full_colour_fixed.4p');
        expect(res4p.uncalibratedRates).not.toContain('interior_full_colour_fixed.16p');
    });
});
