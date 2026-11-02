import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { PrinthousesPage, EMPTY_RATES } from '../src/ui/pages/os/PrinthousesPage';
import { PrinthouseDetailPage } from '../src/ui/pages/os/PrinthouseDetailPage';

const mockPrinthouses = [
    {
        _id: 'node-329a3bc4',
        id: 'node-329a3bc4',
        name: 'philologica.ai Printhouse',
        country: 'ES',
        city: 'Madrid',
        status: 'Active',
        signatures: [32, 24, 16, 12, 8, 4],
        delivery_time: '5-7 days',
        production_lead_days: 5,
        limits: { min_copies: 50, max_pages: 960 },
        region: 'EU-SOUTH (Iberia)',
        latitude: 40.416775,
        longitude: -3.70379,
        timezone: 'Europe/Madrid',
        address_line: 'Polígono Industrial Cobo Calleja, 28947 Fuenlabrada, Madrid, ES',
        last_heartbeat_at: new Date().toISOString(),
        machinesCount: 3,
        weeklySheetsCapacity: 250000,
        rates: {
            ...EMPTY_RATES,
            interior_full_colour_fixed: { '32p': 420, '24p': 380, '16p': 320, '12p': 290, '8p': 240, '4p': 180 },
            interior_full_colour_var: { '32p': 48, '24p': 42, '16p': 38, '12p': 34, '8p': 28, '4p': 22 },
            cover_fixed_by_colours: { '1': 140, '2': 160, '3': 190, '4': 220, '5': 260 },
            cover_var_per_1000_by_colours: { '1': 25, '2': 32, '3': 38, '4': 45, '5': 52 },
            binding_pb_fixed_by_sections: { '1': 180, '2': 200, '3': 220, '4': 240 },
            binding_pb_var_per_1000_by_sections: { '1': 45, '2': 52, '3': 58, '4': 65 },
            paper_price_interior_by_kilo: { offset: 1.32, mc: 1.38, lux: 1.48, munken: 1.65, other: 1.40 },
            paper_price_cover_by_kilo: { mc: 1.45, artboard: 1.55, offset: 1.35, wfmc: 1.50, other: 1.45 },
            technical_costs_for_transport: true,
            transport_costs: { belgium: 120, netherlands: 130, finland: 190, hungary: 140, poland: 135 }
        },
        pricingGovernance: {
            activeRevisionId: 'rev_node-329a3bc4_canonical',
            activeRevisionChecksum: 'sha256:88f12c9a00b31',
            latestRevisionId: 'rev_node-329a3bc4_canonical',
            lastCalibrationAt: new Date().toISOString(),
            lastAcceptedRunId: 'cal_run_101',
            lastAcceptanceId: 'acc_101',
            lastVerifiedManufacturingPrice: 2890.00,
            lastVerifiedManufacturingPriceAt: new Date().toISOString()
        },
        basicProfile: {
            legalName: 'philologica.ai Printhouse Industrial Graphics S.L.',
            taxId: 'ESB85942108',
            eInvoiceProfile: 'FACTURAE_3_2_2 / PEPPOL BIS 3.0 (EN 16931)',
            prepressContact: 'prepress@philologica.printprice.pro',
            supportedBindings: ['SOFTCOVER_PUR', 'HARDCOVER_CASE', 'THREAD_SEWN'],
            nativeSheetFormats: ['700×1000 mm (B1)', '530×750 mm (B2)'],
            gsmRange: { minGsm: 60, maxGsm: 400 },
            activeShifts: '3 Turnos (24/5)'
        },
        geospatial: {
            latitude: 40.416775,
            longitude: -3.70379,
            region: 'EU-SOUTH (Iberia)',
            timezone: 'Europe/Madrid',
            address_line: 'Polígono Industrial Cobo Calleja, 28947 Fuenlabrada, Madrid, ES',
            dispatchRadiusKm: 1500
        },
        materialsCatalog: [
            { code: 'OFFSET_90_B1', name: 'Offset Blanco Industrial 90 g/m²', category: 'INTERIOR', gsm: 90, bulk: 1.30, sheetFormat: '700×1000 mm (B1)', pricePerKg: 1.32 }
        ]
    }
];

vi.mock('../src/ui/lib/adminApi', () => ({
    getPrinthouses: vi.fn(async () => mockPrinthouses),
    getDispatches: vi.fn(async () => ({ ok: true, dispatches: [] })),
    getIndustrialTelemetryOverview: vi.fn(async () => ({ ok: true, telemetry: {} })),
    createPrinthouse: vi.fn(async () => ({ ok: true, id: 'new-node' })),
    updatePrinthouse: vi.fn(async () => ({ ok: true })),
    deletePrinthouse: vi.fn(async () => ({ ok: true })),
    publishPrinthouseRatesRevision: vi.fn(async () => ({
        ok: true,
        revisionId: 'rev_99f812abc',
        checksum: 'sha256:99f812abc0011223344556677',
        publishedAt: new Date().toISOString()
    }))
}));

vi.mock('../src/ui/api/printhouseCapabilitiesClient', () => ({
    listMachines: vi.fn(async () => ({
        ok: true,
        machines: [
            {
                id: 'mach_offset_b1',
                printhouse_id: 'node-329a3bc4',
                tenant_id: 'tenant-1',
                machine_name: 'Heidelberg Speedmaster XL 106-8P (Offset B1)',
                machine_type: 'OFFSET',
                manufacturer: 'Heidelberg',
                model: 'Speedmaster XL 106-8P',
                status: 'ACTIVE',
                max_sheet_width_mm: 1060,
                max_sheet_height_mm: 750,
                min_sheet_width_mm: 410,
                min_sheet_height_mm: 340,
                max_print_width_mm: 1050,
                max_print_height_mm: 740,
                max_tac_percent: 300,
                max_file_size_mb: 2048,
                supports_pdfx: true,
                supports_perfect_binding: true,
                supports_hardcover: true,
                metadata_json: {
                    sheetFormatLabel: 'B1 (750×1060 mm)',
                    sheetsPerHour: 18000,
                    currentLoadPct: 48
                }
            },
            {
                id: 'mach_digital_b2',
                printhouse_id: 'node-329a3bc4',
                tenant_id: 'tenant-1',
                machine_name: 'HP Indigo 12000 HD Digital Press (B2)',
                machine_type: 'DIGITAL',
                manufacturer: 'HP',
                model: 'Indigo 12000 HD',
                status: 'ACTIVE',
                max_sheet_width_mm: 750,
                max_sheet_height_mm: 530,
                min_sheet_width_mm: 510,
                min_sheet_height_mm: 330,
                max_print_width_mm: 740,
                max_print_height_mm: 510,
                max_tac_percent: 320,
                max_file_size_mb: 2048,
                supports_pdfx: true,
                metadata_json: {
                    sheetFormatLabel: 'B2 (530×750 mm)',
                    sheetsPerHour: 4600,
                    currentLoadPct: 35
                }
            }
        ]
    })),
    createMachine: vi.fn(async () => ({ ok: true, machine: { id: 'mach_new' } })),
    updateMachine: vi.fn(async () => ({ ok: true, machine: { id: 'mach_offset_b1' } })),
    getMachineTemplates: vi.fn(async () => ({ ok: true, templates: [] }))
}));

describe('Printhouses Industrial Node Consolidation & 360° Detail', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the Printhouses directory with ACTIVE badge, fleet count, and weekly sheet capacity', async () => {
        render(
            <MemoryRouter initialEntries={['/printhouses']}>
                <Routes>
                    <Route path="/printhouses" element={<PrinthousesPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('philologica.ai Printhouse')).toBeDefined();
        });

        expect(screen.getByText('3 Active Machines')).toBeDefined();
        expect(screen.getByText(/250[,.]000 sheets\/week/i)).toBeDefined();
        expect(screen.getByText('ACTIVE')).toBeDefined();
    });

    it('renders Operational Geography with VERIFIED routing readiness, coordinates, and 4 green checks', async () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={['/printhouses/node-329a3bc4?tab=SITES']}>
                    <Routes>
                        <Route path="/printhouses/:id" element={<PrinthouseDetailPage />} />
                    </Routes>
                </MemoryRouter>
            </LocaleProvider>
        );

        await waitFor(() => {
            expect(screen.getAllByText(/ROUTING READINESS: VERIFIED/i).length).toBeGreaterThanOrEqual(1);
        });

        expect(screen.getByText(/Heartbeat: Active \(hace 2m\) · Routing: Eligible/i)).toBeDefined();
        expect(screen.getByText('[✓ GEOSPATIAL ID]')).toBeDefined();
        expect(screen.getByText('[✓ REGIONAL MAPPING]')).toBeDefined();
        expect(screen.getByText('[✓ CAPACITY SYNC]')).toBeDefined();
        expect(screen.getByText('[✓ ECONOMIC READY]')).toBeDefined();
    });

    it('renders Machines tab with active fleet table/cards first and opens + ADD MACHINE slide-over', async () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={['/printhouses/node-329a3bc4?tab=MACHINES']}>
                    <Routes>
                        <Route path="/printhouses/:id" element={<PrinthouseDetailPage />} />
                    </Routes>
                </MemoryRouter>
            </LocaleProvider>
        );

        await waitFor(() => {
            expect(screen.getByText(/Heidelberg Speedmaster XL 106-8P/i)).toBeDefined();
            expect(screen.getByText(/HP Indigo 12000 HD Digital Press/i)).toBeDefined();
        });

        const addBtn = screen.getByRole('button', { name: /\+ ADD MACHINE/i });
        fireEvent.click(addBtn);

        await waitFor(() => {
            expect(screen.getByText(/Onboard New Production Machine/i)).toBeDefined();
        });
    });

    it('allows editing Key Pricing Anchors and publishing a new SHA-256 rate revision in Pricing Hawk-Eye', async () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={['/printhouses/node-329a3bc4']}>
                    <Routes>
                        <Route path="/printhouses/:id" element={<PrinthouseDetailPage />} />
                    </Routes>
                </MemoryRouter>
            </LocaleProvider>
        );

        await waitFor(() => {
            expect(screen.getByText(/Pricing Hawk-Eye/i)).toBeDefined();
        });

        const editAnchorsBtn = screen.getByRole('button', { name: /Edit Key Anchors/i });
        fireEvent.click(editAnchorsBtn);

        await waitFor(() => {
            expect(screen.getByText(/Interactive Key Pricing Anchors & Live BPE Unit-Cost Simulator/i)).toBeDefined();
        });

        const publishBtn = screen.getByRole('button', { name: /PUBLISH NEW RATES REVISION/i });
        fireEvent.click(publishBtn);

        await waitFor(() => {
            expect(screen.getAllByText(/rev_99f812a/i).length).toBeGreaterThanOrEqual(1);
        });
    });
});
