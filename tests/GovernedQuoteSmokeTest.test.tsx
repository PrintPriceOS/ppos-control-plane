import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GovernedQuoteSmokeTest } from '../src/ui/components/printhouse/pricing/quick-calibration/GovernedQuoteSmokeTest';
import { QuickCalibrationPanel } from '../src/ui/components/printhouse/pricing/quick-calibration/QuickCalibrationPanel';
import { printhouseCalibrationApi, computeBookSpecChecksum } from '../src/ui/lib/printhouseCalibrationApi';

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

        expect(screen.getByText(/SIMPLIFIED_INTERIOR_APPROXIMATION/i)).toBeInTheDocument();
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
});
