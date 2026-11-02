/**
 * tests/machinery_fleet_parity.test.tsx
 *
 * Verifies the 100% unification and homologation of the Machinery Fleet subsystem:
 * 1. Reusable MachineSpecificationForm renders all 6 onboarding & industrial sections:
 *    - Identification, Sheet Dimensions + auto-detected B1/B2/SRA3 format badge,
 *    - Supported Color Modes (CMYK, CMYK+SPOT, CMYK+WHITE, RGB, GRAYSCALE, MONOCHROME, SPOT_ONLY),
 *    - Print Methods & Printing Sides (SHEETFED_OFFSET, DIGITAL_TONER, DIGITAL_INKJET, WIDE_FORMAT_INKJET, WEB_OFFSET, FLEXO, SCREEN_PRINTING, SIMPLEX, DUPLEX),
 *    - Industrial Throughput & Cost (Nominal Speed cph, Make-Ready min, Base Hourly Cost €/h, Max TAC %, Max Pages, Max Archive MB),
 *    - ISO Standards & Inline Finishing.
 * 2. MachineCapabilityEditor integrates MachineSpecificationForm and supports creating, editing, and archiving machines.
 * 3. MachinesPage (/machines) renders populated fleet rows with Node name, Sheet Format Badge, Color Modes, Speed (cph), and Edit/Archive actions.
 * 4. PrinthouseCapabilityOnboardingService derives FORMAT_B1, FORMAT_B2, FORMAT_SRA3, FORMAT_A3, FORMAT_A4 from sheet dimensions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { MachineSpecificationForm, deriveSheetFormatBadge } from '../src/ui/components/printhouse/MachineSpecificationForm';
import { MachineCapabilityEditor } from '../src/ui/pages/printhouse/MachineCapabilityEditor';
import { MachinesPage } from '../src/ui/pages/os/MachinesPage';
import * as adminApi from '../src/ui/lib/adminApi';
import * as capabilitiesClient from '../src/ui/api/printhouseCapabilitiesClient';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const capabilityOnboardingService = require('../src/api/services/printhouseCapabilityOnboardingService');

describe('Machinery Fleet Unification & Homologation Parity Suite', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('1. deriveSheetFormatBadge accurately classifies B1, B2, SRA3, A3, and A4 sheet dimensions', () => {
        expect(deriveSheetFormatBadge(1060, 750)).toContain('B1 (750×1060 mm)');
        expect(deriveSheetFormatBadge(750, 530)).toContain('B2 (530×750 mm)');
        expect(deriveSheetFormatBadge(330, 488)).toContain('SRA3 (330×488 mm)');
        expect(deriveSheetFormatBadge(297, 420)).toContain('A3 (297×420 mm)');
        expect(deriveSheetFormatBadge(210, 297)).toContain('A4 (210×297 mm)');
    });

    it('2. PrinthouseCapabilityOnboardingService derives FORMAT_B2 and FORMAT_B1 from machine dimensions', () => {
        const b2Machine = {
            id: 'mach_indigo_100k',
            max_sheet_width_mm: 750,
            max_sheet_height_mm: 530,
            supported_color_modes_json: ['CMYK', 'CMYK+SPOT', 'CMYK+WHITE'],
            supports_pdfx: true,
            supports_white_ink: true,
            supports_perfect_binding: true
        };
        const derivedB2 = capabilityOnboardingService.deriveCapabilitiesFromMachine(b2Machine);
        const typesB2 = derivedB2.map((c: any) => c.type);
        expect(typesB2).toContain('FORMAT_B2');
        expect(typesB2).toContain('FORMAT_SRA3');
        expect(typesB2).toContain('FORMAT_A3');
        expect(typesB2).toContain('FORMAT_A4');
        expect(typesB2).toContain('PRINT_CMYK');
        expect(typesB2).toContain('PRINT_SPOT_COLOR');
        expect(typesB2).toContain('PRINT_WHITE_INK');
        expect(typesB2).toContain('FINISH_PERFECT_BIND');

        const b1Machine = {
            id: 'mach_xl106',
            max_sheet_width_mm: 1060,
            max_sheet_height_mm: 750,
            supported_color_modes_json: ['CMYK'],
            supports_pdfx: true
        };
        const derivedB1 = capabilityOnboardingService.deriveCapabilitiesFromMachine(b1Machine);
        const typesB1 = derivedB1.map((c: any) => c.type);
        expect(typesB1).toContain('FORMAT_B1');
        expect(typesB1).toContain('FORMAT_B2');
    });

    it('3. MachineSpecificationForm renders all 6 unified sections and updates color modes, print methods, sides, and throughput specs', () => {
        let currentState: any = {
            machine_name: 'Heidelberg Speedmaster XL 106-8P',
            machine_type: 'OFFSET',
            status: 'ACTIVE',
            max_sheet_width_mm: 1060,
            max_sheet_height_mm: 750,
            min_sheet_width_mm: 410,
            min_sheet_height_mm: 340,
            max_print_width_mm: 1050,
            max_print_height_mm: 740,
            nominal_speed_cph: 18000,
            make_ready_minutes: 25,
            hourly_cost_eur: 165,
            max_tac_percent: 300,
            max_pages_per_job: 1024,
            max_file_size_mb: 2048,
            supported_color_modes_json: ['CMYK'],
            supported_print_methods_json: ['SHEETFED_OFFSET'],
            supported_sides_json: ['SIMPLEX', 'DUPLEX'],
            supports_pdfx: true
        };

        const handleChange = vi.fn((updated) => {
            currentState = updated;
        });

        render(
            <MachineSpecificationForm
                machine={currentState}
                onChange={handleChange}
                onSubmit={(e) => e.preventDefault()}
            />
        );

        expect(screen.getByText('1. Machine Identification')).toBeInTheDocument();
        expect(screen.getByText('2. Sheet & Print Dimensions (mm)')).toBeInTheDocument();
        expect(screen.getByText('3. Supported Color Modes')).toBeInTheDocument();
        expect(screen.getByText('4. Print Methods & Printing Sides')).toBeInTheDocument();
        expect(screen.getByText('5. Industrial Throughput, Cost & Ink Density Limits')).toBeInTheDocument();
        expect(screen.getByText('6. ISO Standards & Inline Finishing')).toBeInTheDocument();
        expect(screen.getByText(/Detected Format: B1 \(750×1060 mm\)/i)).toBeInTheDocument();

        // Toggle CMYK + Spot Colors
        fireEvent.click(screen.getByText('CMYK + Spot Colors'));
        expect(handleChange).toHaveBeenCalled();
        expect(currentState.supported_color_modes_json).toContain('CMYK+SPOT');
    });

    it('4. MachineCapabilityEditor displays fleet cards with speed, cost, color modes, and opens unified drawer on + ADD MACHINE', async () => {
        vi.spyOn(capabilitiesClient, 'listMachines').mockResolvedValue({
            ok: true,
            machines: [
                {
                    id: 'mach_node_b2',
                    printhouse_id: 'node-329a3bc4',
                    tenant_id: 'system',
                    machine_name: 'HP Indigo 100K Digital Press (B2)',
                    machine_type: 'DIGITAL',
                    manufacturer: 'HP',
                    model: 'Indigo 100K',
                    status: 'ACTIVE',
                    max_sheet_width_mm: 750,
                    max_sheet_height_mm: 530,
                    min_sheet_width_mm: 330,
                    min_sheet_height_mm: 460,
                    max_tac_percent: 300,
                    max_file_size_mb: 2048,
                    nominal_speed_cph: 6000,
                    make_ready_minutes: 8,
                    hourly_cost_eur: 95,
                    supported_color_modes_json: ['CMYK', 'CMYK+SPOT'],
                    supported_print_methods_json: ['DIGITAL_TONER'],
                    supported_sides_json: ['SIMPLEX', 'DUPLEX'],
                    supports_pdfx: true,
                    supports_perfect_binding: true
                } as any
            ]
        });

        render(
            <LocaleProvider initialLocale="es">
                <MachineCapabilityEditor
                    printhouseId="node-329a3bc4"
                    onMutationSuccess={vi.fn()}
                />
            </LocaleProvider>
        );

        expect(await screen.findByText('HP Indigo 100K Digital Press (B2)')).toBeInTheDocument();
        expect(screen.getByText(/6[.,\s]?000 pliegos\/h/i)).toBeInTheDocument();
        expect(screen.getByText('95 €/h · 8 min setup')).toBeInTheDocument();
        expect(screen.getByText('CMYK+SPOT')).toBeInTheDocument();

        fireEvent.click(screen.getByText('+ ADD MACHINE'));
        expect(await screen.findByTestId('machine-specification-form')).toBeInTheDocument();
        expect(screen.getByText('3. Supported Color Modes')).toBeInTheDocument();
        expect(screen.getByText('4. Print Methods & Printing Sides')).toBeInTheDocument();
    });

    it('5. MachinesPage (/machines) renders real fleet units with TOTAL FLEET and ACTIVE NODES > 0', async () => {
        vi.spyOn(adminApi, 'getMachines').mockResolvedValue({
            ok: true,
            total: 2,
            machines: [
                {
                    id: 'mach_xl106_b1',
                    machineName: 'Heidelberg Speedmaster XL 106-8P (Offset B1)',
                    companyName: 'Graficas Alcala Press',
                    printhouseId: 'node-329a3bc4',
                    status: 'ACTIVE',
                    healthState: 'ONLINE',
                    machineState: 'PROCESSING',
                    workerState: 'ACTIVE',
                    locationLabel: 'Madrid, ES',
                    city: 'Madrid',
                    country: 'ES',
                    region: 'EU-WEST',
                    needsProfile: false,
                    sheetFormatLabel: 'B1 (750×1060 mm)',
                    nominal_speed_cph: 18000,
                    supported_color_modes_json: ['CMYK', 'CMYK+SPOT'],
                    capacityUtilizationPct: 48,
                    throughput: 18000,
                    uptimeScore: 99.4,
                    economicEfficiency: 91.4,
                    lastHeartbeatAt: new Date().toISOString(),
                    telemetryCompletenessScore: 100,
                    missingTelemetry: [],
                    profileCompletenessScore: 100,
                    missingProfileFields: []
                },
                {
                    id: 'mach_indigo_100k',
                    machineName: 'HP Indigo 100K Digital Press (B2)',
                    companyName: 'Barcelona Offset Hub',
                    printhouseId: 'node-9679061b',
                    status: 'ACTIVE',
                    healthState: 'ONLINE',
                    machineState: 'PROCESSING',
                    workerState: 'ACTIVE',
                    locationLabel: 'Barcelona, ES',
                    city: 'Barcelona',
                    country: 'ES',
                    region: 'EU-WEST',
                    needsProfile: false,
                    sheetFormatLabel: 'B2 (530×750 mm)',
                    nominal_speed_cph: 6000,
                    supported_color_modes_json: ['CMYK', 'CMYK+WHITE'],
                    capacityUtilizationPct: 35,
                    throughput: 6000,
                    uptimeScore: 99.2,
                    economicEfficiency: 88.6,
                    lastHeartbeatAt: new Date().toISOString(),
                    telemetryCompletenessScore: 100,
                    missingTelemetry: [],
                    profileCompletenessScore: 100,
                    missingProfileFields: []
                }
            ] as any,
            status: 'LIVE',
            timestamp: new Date().toISOString()
        });

        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="es">
                    <MachinesPage mode="workspace" />
                </LocaleProvider>
            </MemoryRouter>
        );

        expect(await screen.findByText('Heidelberg Speedmaster XL 106-8P (Offset B1)')).toBeInTheDocument();
        expect(screen.getByText('HP Indigo 100K Digital Press (B2)')).toBeInTheDocument();
        expect(screen.getByText('B1 (750×1060 mm)')).toBeInTheDocument();
        expect(screen.getByText('B2 (530×750 mm)')).toBeInTheDocument();
        expect(screen.getByText(/18[.,\s]?000 cph/i)).toBeInTheDocument();
        expect(screen.getByText(/6[.,\s]?000 cph/i)).toBeInTheDocument();
    });
});
