import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GovernedQuoteSmokeTest } from '../src/ui/components/printhouse/pricing/quick-calibration/GovernedQuoteSmokeTest';
import { printhouseCalibrationApi } from '../src/ui/lib/printhouseCalibrationApi';

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
});
