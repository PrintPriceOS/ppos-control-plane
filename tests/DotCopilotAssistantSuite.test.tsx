import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { DotCopilotProvider, useDotCopilot } from '../src/ui/components/copilot/DotCopilotProvider';
import { DotCopilotDrawer } from '../src/ui/components/copilot/DotCopilotDrawer';
import { CopilotKpiSummaryCard } from '../src/ui/components/copilot/cards/CopilotKpiSummaryCard';
import { CopilotPreflightAlertCard } from '../src/ui/components/copilot/cards/CopilotPreflightAlertCard';
import { CopilotActionConfirmCard } from '../src/ui/components/copilot/cards/CopilotActionConfirmCard';
import { Topbar } from '../src/ui/layout/Topbar';
import { LocaleProvider, useLocale } from '../src/ui/i18n';

// Backend services import for direct unit testing
const { resolveGeminiModel, clearCache, getRegistryState } = require('../src/api/services/copilot/modelRegistryService');
const { executeCopilotTool, processCopilotChat, buildSystemInstruction } = require('../src/api/services/copilot/dotCopilotService');

describe('DOT Copilot Assistant & Model Registry Suite (Phase 200)', () => {

    beforeEach(() => {
        clearCache();
        delete process.env.GEMINI_MODEL_FAST;
        delete process.env.GEMINI_MODEL_PRO;

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url.includes('/api/copilot/entities')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        ok: true,
                        entities: [
                            { id: 'ORD-1042', type: 'order', label: '@ORD-1042', detail: 'Editorial Mediterrània (1500 uds)' },
                            { id: 'MACH-HD-XL75', type: 'machine', label: '@Offset-Heidelberg-XL75', detail: 'Offset 5 colores B2' }
                        ]
                    })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({})
            });
        });
    });

    afterEach(() => {
        clearCache();
        vi.restoreAllMocks();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 1. ModelRegistryService Unit Tests
    // ──────────────────────────────────────────────────────────────────────────
    describe('1. ModelRegistryService — Dynamic Discovery & Caching', () => {
        it('resolves default stable fallback for fast profile', async () => {
            const model = await resolveGeminiModel('fast');
            expect(model).toBeDefined();
            expect(model).toContain('flash');
        });

        it('resolves default stable fallback for reasoning profile', async () => {
            const model = await resolveGeminiModel('reasoning');
            expect(model).toBeDefined();
            expect(model).toContain('pro');
        });

        it('respects environment overrides when provided', async () => {
            process.env.GEMINI_MODEL_FAST = 'gemini-3.0-flash-custom';
            process.env.GEMINI_MODEL_PRO = 'gemini-3.0-pro-custom';

            const fast = await resolveGeminiModel('fast');
            const pro = await resolveGeminiModel('reasoning');

            expect(fast).toBe('gemini-3.0-flash-custom');
            expect(pro).toBe('gemini-3.0-pro-custom');
        });

        it('maintains in-memory cache and reports valid TTL remaining', async () => {
            await resolveGeminiModel('fast');
            const state = getRegistryState();

            expect(state.lastFetchedAt).toBeGreaterThan(0);
            expect(state.ttlRemainingMs).toBeGreaterThan(0);
            expect(state.ttlRemainingMs).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
        });

        it('clearCache resets registry state cleanly', async () => {
            await resolveGeminiModel('fast');
            expect(getRegistryState().lastFetchedAt).toBeGreaterThan(0);

            clearCache();
            expect(getRegistryState().lastFetchedAt).toBe(0);
            expect(getRegistryState().fast).toBeNull();
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. DotCopilotService Function Calling & Tenant Isolation
    // ──────────────────────────────────────────────────────────────────────────
    describe('2. DotCopilotService — Industrial Tools & Multi-Tenant Isolation', () => {
        it('executes get_onboarding_status and returns completion metrics', async () => {
            const res = await executeCopilotTool('get_onboarding_status', {}, 'node-primary');
            expect(res.printhouseId).toBe('node-primary');
            expect(res.completionPct).toBeGreaterThan(50);
            expect(res.machinesCount).toBeGreaterThan(0);
            expect(res.papersConfiguredCount).toBeGreaterThan(0);
            expect(res.summary).toBeDefined();
        });

        it('executes get_sales_and_orders_report with KPI summary payload', async () => {
            const res = await executeCopilotTool('get_sales_and_orders_report', { period: 'this_week' }, 'node-primary');
            expect(res.totalRevenueEur).toBeGreaterThan(0);
            expect(res.acceptedQuotesCount).toBeGreaterThan(0);
            expect(res.cardPayload).toBeDefined();
            expect(res.cardPayload.type).toBe('KPI_SUMMARY');
            expect(res.cardPayload.revenue).toBe(res.totalRevenueEur);
        });

        it('executes run_technical_calculation for SPINE-01 standard', async () => {
            const res = await executeCopilotTool('run_technical_calculation', {
                calculationType: 'calc_spine',
                params: { pages: 192, caliperUm: 115, binding: 'SEWN', coverType: 'HARDCOVER' }
            }, 'node-primary');

            expect(res.calculationType).toBe('SPINE_01');
            expect(res.roundedSpineMm).toBe(17.5);
            expect(res.totalOpenCoverWidthMm).toBeGreaterThan(340);
        });

        it('executes simulate_price_adjustment with action payload', async () => {
            const res = await executeCopilotTool('simulate_price_adjustment', {
                category: 'SOFTCOVER',
                marginDeltaPercent: 10
            }, 'node-primary');

            expect(res.category).toBe('SOFTCOVER');
            expect(res.deltaPercent).toBe(10);
            expect(res.simulated.setupFee).toBeGreaterThan(res.baseline.setupFee);
            expect(res.actionPayload).toBeDefined();
            expect(res.actionPayload.type).toBe('ACTION_CONFIRM');
        });

        it('isolates tenants: requesting for another printhouse returns that tenant context only', async () => {
            const resA = await executeCopilotTool('get_onboarding_status', {}, 'tenant-valencia-01');
            const resB = await executeCopilotTool('get_onboarding_status', {}, 'tenant-sevilla-02');

            expect(resA.printhouseId).toBe('tenant-valencia-01');
            expect(resB.printhouseId).toBe('tenant-sevilla-02');
            expect(resA.name).toContain('tenant-valencia-01');
            expect(resB.name).toContain('tenant-sevilla-02');
        });

        it('processCopilotChat emits streaming events via fallback engine when offline', async () => {
            const events: Array<{ type: string; data: any }> = [];

            await processCopilotChat({
                messages: [{ role: 'user', content: '¿Cuáles son nuestras ventas y pedidos de esta semana?' }],
                context: { printhouseId: 'node-primary' },
                mode: 'ask',
                onEvent: (type, data) => {
                    events.push({ type, data });
                }
            });

            const eventTypes = events.map(e => e.type);
            expect(eventTypes).toContain('status');
            expect(eventTypes).toContain('tool_start');
            expect(eventTypes).toContain('tool_result');
            expect(eventTypes).toContain('token');
            expect(eventTypes).toContain('done');

            const doneEvent = events.find(e => e.type === 'done');
            expect(doneEvent?.data.cards.length).toBeGreaterThan(0);
            expect(doneEvent?.data.cards[0].type).toBe('KPI_SUMMARY');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. UI Generative Cards Unit Tests
    // ──────────────────────────────────────────────────────────────────────────
    describe('3. Generative UI Cards Component Tests', () => {
        it('renders CopilotKpiSummaryCard with revenue, accepted quotes, and ticket', () => {
            render(
                <LocaleProvider initialLocale="es">
                    <CopilotKpiSummaryCard
                        payload={{
                            type: 'KPI_SUMMARY',
                            periodLabel: 'Esta semana',
                            revenue: 11640,
                            acceptedQuotes: 4,
                            pendingOrders: 2,
                            avgTicket: 2910,
                            currency: 'EUR'
                        }}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('Reporte Ejecutivo de Ventas')).toBeInTheDocument();
            expect(screen.getByText('11.640 €')).toBeInTheDocument();
            expect(screen.getByText('4 aceptados')).toBeInTheDocument();
            expect(screen.getByText(/2 activos/)).toBeInTheDocument();
            expect(screen.getByText(/2910 € \/ pedido/)).toBeInTheDocument();
        });

        it('renders CopilotPreflightAlertCard with issues and Auto-Fix trigger', () => {
            render(
                <LocaleProvider initialLocale="es">
                    <CopilotPreflightAlertCard
                        payload={{
                            type: 'PREFLIGHT_ALERTS',
                            alerts: [{
                                orderId: 'ORD-1043',
                                fileName: 'Interior_Catalogo.pdf',
                                issuesCount: 1,
                                issues: [{
                                    type: 'BLEED_INSUFFICIENT',
                                    desc: 'Sangrado de 1.8mm detectado',
                                    severity: 'CRITICAL',
                                    autoFixable: true
                                }]
                            }]
                        }}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('Auditoría Preflight de 6 Ejes')).toBeInTheDocument();
            expect(screen.getByText('ORD-1043')).toBeInTheDocument();
            expect(screen.getByText(/Sangrado de 1.8mm detectado/)).toBeInTheDocument();

            const autoFixBtn = screen.getByRole('button', { name: /Auto-Fix/i });
            expect(autoFixBtn).toBeInTheDocument();
            fireEvent.click(autoFixBtn);

            expect(screen.getByText(/Reparado/i)).toBeInTheDocument();
        });

        it('renders CopilotActionConfirmCard and responds to Confirm action', () => {
            render(
                <LocaleProvider initialLocale="es">
                    <CopilotActionConfirmCard
                        payload={{
                            type: 'ACTION_CONFIRM',
                            actionId: 'act-001',
                            title: 'Confirmar Calibración +5%',
                            summary: 'Ajuste de margen simulado en Rústica'
                        }}
                    />
                </LocaleProvider>
            );

            expect(screen.getByText('Confirmar Calibración +5%')).toBeInTheDocument();
            expect(screen.getByText('Ajuste de margen simulado en Rústica')).toBeInTheDocument();

            const confirmBtn = screen.getByRole('button', { name: /Confirmar y Aplicar/i });
            fireEvent.click(confirmBtn);

            expect(screen.getByText(/Cambios aplicados correctamente/i)).toBeInTheDocument();
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. DotCopilotProvider & Topbar Integration Tests
    // ──────────────────────────────────────────────────────────────────────────
    describe('4. Drawer Shell, Provider & Topbar Trigger', () => {
        const TestWrapper: React.FC = () => {
            const { openDrawer } = useDotCopilot();
            return (
                <div>
                    <button id="test-open-btn" onClick={openDrawer}>Open Dot</button>
                    <Topbar />
                    <DotCopilotDrawer />
                </div>
            );
        };

        it('renders Topbar Ask Dot pill button with shortcut indicator', () => {
            render(
                <MemoryRouter>
                    <LocaleProvider initialLocale="es">
                        <DotCopilotProvider>
                            <TestWrapper />
                        </DotCopilotProvider>
                    </LocaleProvider>
                </MemoryRouter>
            );

            const askDotBtn = screen.getByRole('button', { name: /asistente DOT Copilot|DOT Copilot assistant/i });
            expect(askDotBtn).toBeInTheDocument();
            expect(askDotBtn).toHaveTextContent('Ask Dot');
            expect(askDotBtn).toHaveTextContent('⌘I');
        });

        it('opens DotCopilotDrawer on Ask Dot click and shows intelligent zero-state with 5 contextual cards', async () => {
            render(
                <MemoryRouter initialEntries={['/']}>
                    <LocaleProvider initialLocale="es">
                        <DotCopilotProvider>
                            <TestWrapper />
                        </DotCopilotProvider>
                    </LocaleProvider>
                </MemoryRouter>
            );

            const askDotBtn = screen.getByRole('button', { name: /asistente DOT Copilot|DOT Copilot assistant/i });
            fireEvent.click(askDotBtn);

            await waitFor(() => {
                expect(screen.getByLabelText('DOT Copilot Sidecar Drawer')).toBeInTheDocument();
            });

            // Zero-state greeting & badge
            expect(screen.getByText(/DOT COPILOT · RESIDENT AI/i)).toBeInTheDocument();
            expect(screen.getByText(/¿Qué configuramos o revisamos hoy\?/i)).toBeInTheDocument();

            // 5 Contextual Quick Actions
            expect(screen.getByText('Configurar mi imprenta')).toBeInTheDocument();
            expect(screen.getByText('Revisar estado de Preflights')).toBeInTheDocument();
            expect(screen.getByText('Reporte de ventas y pedidos')).toBeInTheDocument();
            expect(screen.getByText('Calibrar márgenes y tarifas')).toBeInTheDocument();
            expect(screen.getByText('Auditoría de salud del catálogo')).toBeInTheDocument();
        });

        it('allows toggling between Ask and Act modes in composer', async () => {
            render(
                <MemoryRouter initialEntries={['/']}>
                    <LocaleProvider initialLocale="es">
                        <DotCopilotProvider>
                            <TestWrapper />
                        </DotCopilotProvider>
                    </LocaleProvider>
                </MemoryRouter>
            );

            fireEvent.click(screen.getByRole('button', { name: /asistente DOT Copilot|DOT Copilot assistant/i }));

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /^Act$/i })).toBeInTheDocument();
            });

            const actBtn = screen.getByRole('button', { name: /^Act$/i });
            fireEvent.click(actBtn);

            expect(screen.getByText(/Modo asistido con tarjetas de confirmación/i)).toBeInTheDocument();

            const askBtn = screen.getByRole('button', { name: /^Ask$/i });
            fireEvent.click(askBtn);

            expect(screen.getByText(/Modo consultas y reportes de solo lectura/i)).toBeInTheDocument();
        });

        it('triggers @ mention autocomplete when user types @ in composer', async () => {
            render(
                <MemoryRouter initialEntries={['/']}>
                    <LocaleProvider initialLocale="es">
                        <DotCopilotProvider>
                            <TestWrapper />
                        </DotCopilotProvider>
                    </LocaleProvider>
                </MemoryRouter>
            );

            fireEvent.click(screen.getByRole('button', { name: /asistente DOT Copilot|DOT Copilot assistant/i }));

            const textarea = await screen.findByPlaceholderText(/Escribe @ para etiquetar un pedido/i);
            fireEvent.change(textarea, { target: { value: 'Revisa @' } });

            // Popover should appear
            await waitFor(() => {
                expect(screen.getByText(/Entidades disponibles para etiquetar/i)).toBeInTheDocument();
            });
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Trilingual i18n & Locale Synchronization Tests (Mission Phase 200)
    // ──────────────────────────────────────────────────────────────────────────
    describe('5. Trilingual i18n & Locale Synchronization (EN, ES, DE)', () => {
        const I18nTestContainer: React.FC<{ initialLocale: 'en' | 'es' | 'de' }> = ({ initialLocale }) => {
            const { openDrawer } = useDotCopilot();
            return (
                <div>
                    <button id="open-btn" onClick={openDrawer}>Open</button>
                    <DotCopilotDrawer />
                </div>
            );
        };

        it('renders full drawer UI in English when locale is EN', async () => {
            render(
                <MemoryRouter initialEntries={['/']}>
                    <LocaleProvider initialLocale="en">
                        <DotCopilotProvider>
                            <I18nTestContainer initialLocale="en" />
                        </DotCopilotProvider>
                    </LocaleProvider>
                </MemoryRouter>
            );

            fireEvent.click(screen.getByRole('button', { name: /Open/i }));

            await waitFor(() => {
                expect(screen.getByLabelText('DOT Copilot Sidecar Drawer')).toBeInTheDocument();
            });

            // Zero-state in English
            expect(screen.getByText(/What are we configuring or reviewing today\?/i)).toBeInTheDocument();
            expect(screen.getByText(/Connected to PrintPrice OS production, pricing, imposition, and preflight engines\./i)).toBeInTheDocument();
            expect(screen.getByText(/Contextual quick actions/i)).toBeInTheDocument();

            // English action titles
            expect(screen.getByText('Configure my printhouse')).toBeInTheDocument();
            expect(screen.getByText('Review preflight status')).toBeInTheDocument();
            expect(screen.getByText('Sales & orders report')).toBeInTheDocument();
            expect(screen.getByText('Calibrate margins and rate cards')).toBeInTheDocument();
            expect(screen.getByText('Catalog health audit')).toBeInTheDocument();

            // English placeholder and modes
            expect(screen.getByPlaceholderText(/Type @ to tag an order, press, or rate\.\.\./i)).toBeInTheDocument();
            expect(screen.getByText(/Read-only queries and reports/i)).toBeInTheDocument();
        });

        it('renders full drawer UI in German when locale is DE', async () => {
            render(
                <MemoryRouter initialEntries={['/']}>
                    <LocaleProvider initialLocale="de">
                        <DotCopilotProvider>
                            <I18nTestContainer initialLocale="de" />
                        </DotCopilotProvider>
                    </LocaleProvider>
                </MemoryRouter>
            );

            fireEvent.click(screen.getByRole('button', { name: /Open/i }));

            await waitFor(() => {
                expect(screen.getByLabelText('DOT Copilot Sidecar Drawer')).toBeInTheDocument();
            });

            // Zero-state in German
            expect(screen.getByText(/Was konfigurieren oder prüfen wir heute\?/i)).toBeInTheDocument();
            expect(screen.getByText(/Verbunden mit den Produktions-, Preis-, Ausschieß- und Preflight-Engines/i)).toBeInTheDocument();
            expect(screen.getByText(/Kontextuelle Schnellaktionen/i)).toBeInTheDocument();

            // German action titles
            expect(screen.getByText('Druckerei konfigurieren')).toBeInTheDocument();
            expect(screen.getByText('Preflight-Status prüfen')).toBeInTheDocument();
            expect(screen.getByText('Vertriebs- und Auftragsbericht')).toBeInTheDocument();
            expect(screen.getByText('Margen und Tarife kalibrieren')).toBeInTheDocument();
            expect(screen.getByText('Kataloggesundheitsprüfung')).toBeInTheDocument();

            // German placeholder and modes
            expect(screen.getByPlaceholderText(/Tippe @ um einen Auftrag, eine Maschine oder einen Tarif zu taggen\.\.\./i)).toBeInTheDocument();
            expect(screen.getByText(/Schreibgeschützte Abfragen und Berichte/i)).toBeInTheDocument();
        });

        it('injects dynamic language rule into Gemini system instruction based on context.locale', () => {
            const sysInstEn = buildSystemInstruction({ locale: 'en', printhouseName: 'Test Print UK' });
            expect(sysInstEn).toContain("CRITICAL LANGUAGE RULE:");
            expect(sysInstEn).toContain("You MUST respond strictly in the user's active interface language: 'English' (en)");

            const sysInstEs = buildSystemInstruction({ locale: 'es', printhouseName: 'Gráficas Sol' });
            expect(sysInstEs).toContain("CRITICAL LANGUAGE RULE:");
            expect(sysInstEs).toContain("You MUST respond strictly in the user's active interface language: 'Spanish (Español)' (es)");

            const sysInstDe = buildSystemInstruction({ locale: 'de', printhouseName: 'Druckhaus Berlin' });
            expect(sysInstDe).toContain("CRITICAL LANGUAGE RULE:");
            expect(sysInstDe).toContain("You MUST respond strictly in the user's active interface language: 'German (Deutsch)' (de)");
        });

        it('dispatches deterministic fallback in English when locale is en', async () => {
            const events: Array<{ type: string; data: any }> = [];

            await processCopilotChat({
                messages: [{ role: 'user', content: 'sales and orders report' }],
                context: { printhouseId: 'node-primary', locale: 'en' },
                mode: 'ask',
                onEvent: (type, data) => {
                    events.push({ type, data });
                }
            });

            const doneEvent = events.find(e => e.type === 'done');
            expect(doneEvent).toBeDefined();
            expect(doneEvent?.data.fullText).toContain('I have analyzed the orders and quotes for your plant this week');
            expect(doneEvent?.data.fullText).toContain('Accumulated revenue');
        });

        it('dispatches deterministic fallback in German when locale is de', async () => {
            const events: Array<{ type: string; data: any }> = [];

            await processCopilotChat({
                messages: [{ role: 'user', content: 'auftrag und umsatz' }],
                context: { printhouseId: 'node-primary', locale: 'de' },
                mode: 'ask',
                onEvent: (type, data) => {
                    events.push({ type, data });
                }
            });

            const doneEvent = events.find(e => e.type === 'done');
            expect(doneEvent).toBeDefined();
            expect(doneEvent?.data.fullText).toContain('Ich habe die Aufträge und Angebote Ihres Betriebs für diese Woche analysiert');
            expect(doneEvent?.data.fullText).toContain('Gesamtumsatz');
        });
    });
});
