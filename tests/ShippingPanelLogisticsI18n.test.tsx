import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../src/ui/i18n';
import { ShippingPanel } from '../src/ui/components/printhouse/setup/ShippingPanel';

describe('Phase 198B & 198C (LOGISTICS-UI-01 & LOGISTICS-05) — ShippingPanel EN/DE/ES i18n, 3D PalletDiagramPreview & Dispatch PDF Actions', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, ok: true, regions: [] }),
            blob: async () => new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' })
        }));
    });

    it('renders English (EN) logistics matrix labels, form fields, 3D Euro-Pallet diagram, and LOGISTICS-05 PDF action buttons by default', () => {
        render(
            <LocaleProvider initialLocale="en">
                <ShippingPanel siteId="site-test-en" />
            </LocaleProvider>
        );

        expect(
            screen.getByText('3D Cubing & Logistics Cost Matrix (EPAL / Book Warehouses)')
        ).toBeTruthy();
        expect(
            screen.getByText('Adopt Platform Standard (1-Click)')
        ).toBeTruthy();

        // Open custom freight & pallet form
        fireEvent.click(screen.getByTestId('toggle-custom-freight-matrix-btn'));

        expect(screen.getByText('Primary Carrier')).toBeTruthy();
        expect(screen.getByText('Euro-Pallet EPAL (€/unit)')).toBeTruthy();
        expect(screen.getByText('Standard Carton FEFCO (€/unit)')).toBeTruthy();
        expect(screen.getByText('Stretch Wrap / Strapping (€/pallet)')).toBeTruthy();
        expect(screen.getByText('1 Pallet Rate (€)')).toBeTruthy();
        expect(screen.getByText('2 Pallets Rate (€/pallet)')).toBeTruthy();
        expect(screen.getByText('3–5 Pallets Rate (€/pallet)')).toBeTruthy();
        expect(screen.getByText('Fuel Surcharge (%)')).toBeTruthy();
        expect(screen.getByText('Save Pallet & Freight Rates')).toBeTruthy();

        // Verify 3D Isometric Euro-Pallet Diagram & KPI indicators
        expect(screen.getByTestId('pallet-diagram-preview')).toBeTruthy();
        expect(screen.getByText('Standard EPAL Footprint')).toBeTruthy();
        expect(screen.getByText('Interlocked Tiling Pattern')).toBeTruthy();
        expect(screen.getByText('Max Height Limit (1,200mm / 1,300mm)')).toBeTruthy();
        expect(screen.getByText('Edge Margin: 30mm')).toBeTruthy();

        // Verify LOGISTICS-05 Dispatch PDF controls in EN
        expect(screen.getByTestId('logistics-dispatch-documents-card')).toBeTruthy();
        expect(screen.getByText('Download Carrier Protocol (PDF)')).toBeTruthy();
        expect(screen.getByText('Download Delivery Note (PDF)')).toBeTruthy();
        expect(screen.getByText('Print SSCC Labels (A6 Thermal / A4 4-UP)')).toBeTruthy();
    });

    it('renders German (DE) logistics matrix labels, form fields, 3D Euro-Pallet diagram, and LOGISTICS-05 PDF action buttons when locale is DE', () => {
        render(
            <LocaleProvider initialLocale="de">
                <ShippingPanel siteId="site-test-de" />
            </LocaleProvider>
        );

        expect(
            screen.getByText('3D-Palettierung & Logistikkosten-Matrix (EPAL / Verlagsauslieferungen)')
        ).toBeTruthy();
        expect(
            screen.getByText('Plattform-Standard übernehmen (1-Klick)')
        ).toBeTruthy();

        // Open custom freight & pallet form
        fireEvent.click(screen.getByTestId('toggle-custom-freight-matrix-btn'));

        expect(screen.getByText('Hauptspedition')).toBeTruthy();
        expect(screen.getByText('EPAL-Europalette (€/Stk)')).toBeTruthy();
        expect(screen.getByText('Standardkarton FEFCO (€/Stk)')).toBeTruthy();
        expect(screen.getByText('Stretchfolie / Umreifung (€/Palette)')).toBeTruthy();
        expect(screen.getByText('1-Paletten-Tarif (€)')).toBeTruthy();
        expect(screen.getByText('2-Paletten-Tarif (€/Palette)')).toBeTruthy();
        expect(screen.getByText('3–5-Paletten-Tarif (€/Palette)')).toBeTruthy();
        expect(screen.getByText('Treibstoffzuschlag (%)')).toBeTruthy();
        expect(screen.getByText('Paletten- & Frachttarife speichern')).toBeTruthy();

        // Verify 3D Isometric Euro-Pallet Diagram in DE
        expect(screen.getByTestId('pallet-diagram-preview')).toBeTruthy();
        expect(screen.getByText('Buchkartons im Kreuzverband')).toBeTruthy();

        // Verify LOGISTICS-05 Dispatch PDF controls in DE
        expect(screen.getByText('Transportprotokoll herunterladen (PDF)')).toBeTruthy();
        expect(screen.getByText('Lieferschein herunterladen (PDF)')).toBeTruthy();
        expect(screen.getByText('SSCC-Etiketten drucken (A6 Thermo / A4 4-UP)')).toBeTruthy();
    });

    it('renders Spanish (ES) LOGISTICS-05 dispatch action buttons and invokes Carrier Protocol, Delivery Note & SSCC PDF endpoints on click', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, ok: true, regions: [] }),
            blob: async () => new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' })
        });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <LocaleProvider initialLocale="es">
                <ShippingPanel siteId="site-test-es" />
            </LocaleProvider>
        );

        const protoBtn = screen.getByTestId('download-carrier-protocol-pdf-btn');
        const dnBtn = screen.getByTestId('download-delivery-note-pdf-btn');
        const ssccBtn = screen.getByTestId('print-sscc-labels-pdf-btn');

        expect(protoBtn.textContent).toContain('Descargar Protocolo de Transporte (PDF)');
        expect(dnBtn.textContent).toContain('Descargar Albarán de Entrega (PDF)');
        expect(ssccBtn.textContent).toContain('Imprimir Etiquetas SSCC (A6 Térmica / A4 4-UP)');

        fireEvent.click(protoBtn);
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/logistics/carrier-protocol/pdf',
                expect.objectContaining({ method: 'GET' })
            );
        });

        fireEvent.click(dnBtn);
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/api/logistics/shipments/SHP-2026-0001/delivery-note/pdf'),
                expect.objectContaining({ method: 'GET' })
            );
        });

        fireEvent.click(ssccBtn);
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/api/logistics/shipments/SHP-2026-0001/labels/sscc-pdf?format=A6'),
                expect.objectContaining({ method: 'POST' })
            );
        });
    });
});
