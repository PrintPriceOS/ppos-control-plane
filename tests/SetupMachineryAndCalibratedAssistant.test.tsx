/**
 * tests/SetupMachineryAndCalibratedAssistant.test.tsx
 *
 * Verifies:
 * 1. Trilingual localization (ES, EN, DE) for the machinery fleet form and technical capabilities.
 * 2. Form container scrollability: permits vertical scroll without horizontal overflow.
 * 3. Trilingual localization for GuidedCalibrationWizard when printhouse is calibrated (Step 4 & Step 5).
 * 4. Error normalization: visible error states display clean string messages and do not render raw backend error objects.
 * 5. Light and Dark theme compatibility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { MachineFleetPanel } from '../src/ui/components/printhouse/setup/MachineFleetPanel';
import { CapacityPanel } from '../src/ui/components/printhouse/setup/CapacityPanel';
import { MaterialsPanel } from '../src/ui/components/printhouse/setup/MaterialsPanel';
import { GuidedCalibrationWizard } from '../src/ui/components/printhouse/pricing/quick-calibration/GuidedCalibrationWizard';
import { GovernedQuoteSmokeTest } from '../src/ui/components/printhouse/pricing/quick-calibration/GovernedQuoteSmokeTest';
import { LocaleProvider, Locale } from '../src/ui/i18n';

describe('Machinery Form & Calibrated Assistant Localization & Error Handling Suite', () => {

    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    const mockSites = [{ siteId: 'site-1', siteName: 'Planta Principal' }];

    describe('1. MachineFleetPanel Form Trilingual Localization & Layout', () => {
        const locales: Locale[] = ['es', 'en', 'de'];

        it.each(locales)('renders create/edit form in %s with correct section headings and buttons', async (loc) => {
            // Mock empty fetch for machines
            vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
                if (typeof url === 'string' && url.includes('/machines')) {
                    return {
                        ok: true,
                        json: async () => ({ ok: true, data: [] })
                    } as any;
                }
                return { ok: true, json: async () => ({ ok: true, data: [] }) } as any;
            });

            const { container } = render(
                <LocaleProvider initialLocale={loc}>
                    <MachineFleetPanel sites={mockSites} />
                </LocaleProvider>
            );

            // Wait for initial fetch to finish
            await waitFor(() => {
                expect(container.querySelector('.animate-spin')).toBeNull();
            });

            // Click Add Machine button
            const addBtn = screen.getByRole('button', { name: /(Añadir máquina|Add Machine|Maschine hinzufügen)/i });
            fireEvent.click(addBtn);

            // Form container must allow vertical scroll without horizontal overflow
            const formContainer = container.querySelector('.overflow-y-auto');
            expect(formContainer).not.toBeNull();
            expect(formContainer?.className).toContain('max-h-[80vh]');
            expect(formContainer?.className).toContain('overflow-x-hidden');

            // Verify section headings and fields exist based on locale
            if (loc === 'es') {
                expect(screen.getByText('1. Identificación de la máquina')).toBeInTheDocument();
                expect(screen.getByText('2. Dimensiones de pliego e impresión (mm)')).toBeInTheDocument();
                expect(screen.getByText('3. Modos de color compatibles')).toBeInTheDocument();
                expect(screen.getByText('4. Métodos de impresión y caras')).toBeInTheDocument();
                expect(screen.getByText('5. Capacidades técnicas y acabados')).toBeInTheDocument();
                expect(screen.getByText('Guardar máquina')).toBeInTheDocument();
            } else if (loc === 'en') {
                expect(screen.getByText('1. Machine Identification')).toBeInTheDocument();
                expect(screen.getByText('2. Sheet & Print Dimensions (mm)')).toBeInTheDocument();
                expect(screen.getByText('3. Supported Color Modes')).toBeInTheDocument();
                expect(screen.getByText('4. Print Methods & Printing Sides')).toBeInTheDocument();
                expect(screen.getByText('5. Technical Capabilities & Features')).toBeInTheDocument();
                expect(screen.getByText('Save Machine')).toBeInTheDocument();
            } else if (loc === 'de') {
                expect(screen.getByText('1. Maschinenidentifikation')).toBeInTheDocument();
                expect(screen.getByText('2. Bogen- und Druckabmessungen (mm)')).toBeInTheDocument();
                expect(screen.getByText('3. Unterstützte Farbmodi')).toBeInTheDocument();
                expect(screen.getByText('4. Druckverfahren & Druckseiten')).toBeInTheDocument();
                expect(screen.getByText('5. Technische Fähigkeiten & Veredelungen')).toBeInTheDocument();
                expect(screen.getByText('Maschine speichern')).toBeInTheDocument();
            }
        });

        it('normalizes backend error objects to readable string without throwing React child error', async () => {
            vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
                if (typeof url === 'string' && url.includes('/machines')) {
                    return {
                        ok: false,
                        json: async () => ({ error: { message: 'DB constraint violation: unique name required' } })
                    } as any;
                }
                return { ok: true, json: async () => ({ ok: true, data: [] }) } as any;
            });

            const { container } = render(
                <LocaleProvider initialLocale="es">
                    <MachineFleetPanel sites={mockSites} />
                </LocaleProvider>
            );

            // Wait for initial fetch to finish
            await waitFor(() => {
                expect(container.querySelector('.animate-spin')).toBeNull();
            });

            // Open create form
            const addBtn = screen.getByRole('button', { name: /Añadir máquina/i });
            fireEvent.click(addBtn);

            // Type machine name
            const nameInput = screen.getByPlaceholderText(/HP Indigo/i);
            fireEvent.change(nameInput, { target: { value: 'Test Press' } });

            // Submit
            const saveBtn = screen.getByText('Guardar máquina');
            fireEvent.click(saveBtn);

            await waitFor(() => {
                expect(screen.getByText(/DB constraint violation/i)).toBeInTheDocument();
            });
        });
    });

    describe('2. GuidedCalibrationWizard Calibrated State Trilingual Localization', () => {
        const defaultDraftSpec = {
            copies: 1000,
            book_width_mm: 170,
            book_height_mm: 240,
            interior_pages: 128,
            interior_print: '4/4',
            paper_type_interior: 'offset',
            paper_weight_interior: 80,
            cover_print: '4/0',
            paper_type_cover: 'mc',
            paper_weight_cover: 300,
            lamination: 'matt',
            binding_method: 'perfect bound'
        };

        const defaultCommercials = {
            targetManufacturingPrice: 2450.00,
            transportPricePerKg: 1.25,
            includesPaper: true,
            includesBinding: true
        };

        it('renders calibrated state in Spanish (Step 5)', () => {
            render(
                <LocaleProvider initialLocale="es">
                    <GuidedCalibrationWizard
                        printerNodeId="node-1"
                        printerNodeName="Planta Sur"
                        draftSpec={defaultDraftSpec}
                        setDraftSpec={vi.fn()}
                        draftCommercials={defaultCommercials}
                        setDraftCommercials={vi.fn()}
                        messages={[]}
                        onSendMessage={vi.fn()}
                        sendingChat={false}
                        activeProposal={null}
                        aiUnavailable={false}
                        onApplyProposal={vi.fn()}
                        session={{ status: 'ACCEPTED' }}
                        activeRun={{ id: 'run-1', status: 'ACCEPTED' }}
                        isReady={true}
                        isCalculated={true}
                        isAccepted={true}
                        onMarkReady={vi.fn()}
                        onCalculate={vi.fn()}
                        onAccept={vi.fn()}
                        calculating={false}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('Tarifas calibradas y activas')).toBeInTheDocument();
            expect(screen.getByText(/Las tarifas de fabricación están calibradas y confirmadas en el servidor/i)).toBeInTheDocument();
            expect(screen.getByText('Calibrar otro libro')).toBeInTheDocument();
        });

        it('renders calibrated state in English (Step 5)', () => {
            render(
                <LocaleProvider initialLocale="en">
                    <GuidedCalibrationWizard
                        printerNodeId="node-1"
                        printerNodeName="Planta Sur"
                        draftSpec={defaultDraftSpec}
                        setDraftSpec={vi.fn()}
                        draftCommercials={defaultCommercials}
                        setDraftCommercials={vi.fn()}
                        messages={[]}
                        onSendMessage={vi.fn()}
                        sendingChat={false}
                        activeProposal={null}
                        aiUnavailable={false}
                        onApplyProposal={vi.fn()}
                        session={{ status: 'ACCEPTED' }}
                        activeRun={{ id: 'run-1', status: 'ACCEPTED' }}
                        isReady={true}
                        isCalculated={true}
                        isAccepted={true}
                        onMarkReady={vi.fn()}
                        onCalculate={vi.fn()}
                        onAccept={vi.fn()}
                        calculating={false}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('Pricing Calibrated & Active')).toBeInTheDocument();
            expect(screen.getByText(/Your manufacturing rates are calibrated and confirmed active by server verification/i)).toBeInTheDocument();
            expect(screen.getByText('Calibrate Another Book')).toBeInTheDocument();
        });

        it('renders calibrated state in German (Step 5)', () => {
            render(
                <LocaleProvider initialLocale="de">
                    <GuidedCalibrationWizard
                        printerNodeId="node-1"
                        printerNodeName="Planta Sur"
                        draftSpec={defaultDraftSpec}
                        setDraftSpec={vi.fn()}
                        draftCommercials={defaultCommercials}
                        setDraftCommercials={vi.fn()}
                        messages={[]}
                        onSendMessage={vi.fn()}
                        sendingChat={false}
                        activeProposal={null}
                        aiUnavailable={false}
                        onApplyProposal={vi.fn()}
                        session={{ status: 'ACCEPTED' }}
                        activeRun={{ id: 'run-1', status: 'ACCEPTED' }}
                        isReady={true}
                        isCalculated={true}
                        isAccepted={true}
                        onMarkReady={vi.fn()}
                        onCalculate={vi.fn()}
                        onAccept={vi.fn()}
                        calculating={false}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('Preise kalibriert & aktiv')).toBeInTheDocument();
            expect(screen.getByText(/Ihre Fertigungstarife sind kalibriert und durch Server-Verifizierung aktiv bestätigt/i)).toBeInTheDocument();
            expect(screen.getByText('Anderes Buch kalibrieren')).toBeInTheDocument();
        });
    });

    describe('3. CapacityPanel & MaterialsPanel Error Normalization', () => {
        it('CapacityPanel normalizes object errors safely', async () => {
            vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
                return {
                    ok: false,
                    json: async () => ({ error: { message: 'Invalid throughput units' } })
                } as any;
            });

            render(
                <LocaleProvider initialLocale="es">
                    <CapacityPanel sites={mockSites} />
                </LocaleProvider>
            );

            const saveBtn = screen.getByRole('button', { name: /Guardar.*capacidad/i });
            fireEvent.click(saveBtn);

            await waitFor(() => {
                expect(screen.getByText('Invalid throughput units')).toBeInTheDocument();
            });
        });

        it('MaterialsPanel normalizes object errors safely', async () => {
            vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
                return {
                    ok: false,
                    json: async () => ({ error: { message: 'Substrate code conflict' } })
                } as any;
            });

            render(
                <LocaleProvider initialLocale="es">
                    <MaterialsPanel sites={mockSites} />
                </LocaleProvider>
            );

            const nameInput = screen.getByPlaceholderText(/Silk Matt/i);
            fireEvent.change(nameInput, { target: { value: 'Munken 120g' } });

            const createBtn = screen.getByRole('button', { name: /Guardar material/i });
            fireEvent.click(createBtn);

            await waitFor(() => {
                expect(screen.getByText('Substrate code conflict')).toBeInTheDocument();
            });
        });

        it('LeadTimesPanel normalizes nested object errors and empty bodies with localized fallbacks', async () => {
            const { LeadTimesPanel } = await import('../src/ui/components/printhouse/setup/LeadTimesPanel');
            
            // Mock failure with nested object message
            vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
                if (typeof url === 'string' && url.includes('/leadtimes/estimate')) {
                    return {
                        ok: false,
                        json: async () => ({ error: { message: { complex: 'DATA_UNAVAILABLE' } } })
                    } as any;
                }
                return {
                    ok: false,
                    json: async () => ({ message: { raw_exception: 'timeout' } })
                } as any;
            });

            render(
                <LocaleProvider initialLocale="es">
                    <LeadTimesPanel sites={mockSites} />
                </LocaleProvider>
            );

            // Wait for initial fetch error to display normalized fallback
            await waitFor(() => {
                expect(screen.getByText('Error al cargar la configuración de plazos de entrega')).toBeInTheDocument();
            });

            // Trigger simulate completion with nested object error
            const calcBtn = screen.getByRole('button', { name: /Calcular fecha de finalización/i });
            fireEvent.click(calcBtn);

            await waitFor(() => {
                expect(screen.getByText('Error al calcular la estimación de finalización de producción')).toBeInTheDocument();
            });
        });
    });

    describe('4. Theme Compatibility (Light & Dark)', () => {
        it('renders cleanly in dark mode class', async () => {
            vi.spyOn(global, 'fetch').mockImplementation(async () => {
                return { ok: true, json: async () => ({ ok: true, data: [] }) } as any;
            });
            document.documentElement.classList.add('dark');
            const { container } = render(
                <LocaleProvider initialLocale="es">
                    <MachineFleetPanel sites={mockSites} />
                </LocaleProvider>
            );
            expect(container.querySelector('.dark\\:bg-\\[\\#18181b\\]')).not.toBeNull();
            document.documentElement.classList.remove('dark');
        });

        it('renders cleanly in light mode', async () => {
            vi.spyOn(global, 'fetch').mockImplementation(async () => {
                return { ok: true, json: async () => ({ ok: true, data: [] }) } as any;
            });
            document.documentElement.classList.remove('dark');
            const { container } = render(
                <LocaleProvider initialLocale="es">
                    <MachineFleetPanel sites={mockSites} />
                </LocaleProvider>
            );
            expect(container.querySelector('.bg-white')).not.toBeNull();
        });
    });
});
