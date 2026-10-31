import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocaleProvider } from '../src/ui/i18n';
import { ShippingPanel } from '../src/ui/components/printhouse/setup/ShippingPanel';

describe('Phase 198B (LOGISTICS-UI-01) — ShippingPanel EN/DE i18n & 3D PalletDiagramPreview', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, ok: true, regions: [] })
        }));
    });

    it('renders English (EN) logistics matrix labels, form fields, and 3D Euro-Pallet diagram by default', () => {
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
    });

    it('renders German (DE) logistics matrix labels, form fields, and 3D Euro-Pallet diagram when locale is DE', () => {
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
    });
});

