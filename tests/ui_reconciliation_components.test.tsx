/**
 * tests/ui_reconciliation_components.test.tsx
 *
 * Verification suite for Dark Industrial Telemetry UI Design System & Dual-Mode Reconciliation:
 * - TopSummaryKpiBar (4 condensed KPI cards with uppercase tracking-wider labels & monospace values)
 * - IndustrialTable (Surface #14161a, border #1f2228, hover #181b20, centered NO [ENTITIES] DEFINED empty state)
 * - HeaderActionGroup (H1 title, contextual tabs, white primary action button with black text)
 * - StatusBadge (ACTIVE, INACTIVE, OFFLINE, QUEUED, HEALTHY telemetry pills)
 * - Dual-mode reconciliation ('onboarding' vs 'workspace') across PricingIntelligenceTab, MachinesPage, and Sidebar active red rounded-full pill.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import {
    TopSummaryKpiBar,
    IndustrialTable,
    HeaderActionGroup,
    StatusBadge,
    INDUSTRIAL_TELEMETRY_TOKENS
} from '../src/ui/components/common';
import { PricingIntelligenceTab } from '../src/ui/pages/admin/PricingIntelligenceTab';
import { MarketplacePage } from '../src/ui/pages/admin/MarketplacePage';
import { PreflightJobsPage } from '../src/ui/pages/preflight/PreflightJobsPage';
import { ManufacturingQueuePage } from '../src/ui/pages/manufacturing/ManufacturingQueuePage';
import { PublisherHubPage } from '../src/ui/pages/publisher/PublisherHubPage';
import { FinancialOpsTab } from '../src/ui/pages/admin/FinancialOpsTab';
import { MachinesPage } from '../src/ui/pages/os/MachinesPage';
import { GlobalSettingsPage } from '../src/ui/pages/os/GlobalSettingsPage';
import { ProductionDashboard } from '../src/ui/pages/production/ProductionDashboard';
import { Sidebar } from '../src/ui/layout/Sidebar';
import * as adminApi from '../src/ui/lib/adminApi';
import { setAuthUser } from '../src/ui/lib/authStore';

const renderWithProviders = (
    ui: React.ReactElement,
    { locale = 'en' as 'en' | 'es' | 'de', route = '/ops/pricing' } = {}
) => {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>
        </MemoryRouter>
    );
};

describe('Dark Industrial Telemetry UI — Canonical Components & Dual-Mode Reconciliation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        setAuthUser({
            email: 'admin@printhouse.local',
            role: 'PRINTHOUSE_ADMIN',
            tenantId: 'tenant-demo-local',
            printhouseId: 'node-329a3bc4'
        });
        vi.spyOn(adminApi, 'getPricingProfiles').mockResolvedValue([]);
        vi.spyOn(adminApi, 'getEconomicRoutingHistory').mockResolvedValue([]);
        vi.spyOn(adminApi, 'getEconomicRoutingConflicts').mockResolvedValue([]);
        vi.spyOn(adminApi, 'listMarketplaceOrders').mockResolvedValue({ orders: [], counts: { filesUploaded: 0 } });
    });

    it('1. Exports canonical Dark Industrial Telemetry tokens and renders StatusBadge states', () => {
        expect(INDUSTRIAL_TELEMETRY_TOKENS.bgPrimary).toBe('#0a0b0d');
        expect(INDUSTRIAL_TELEMETRY_TOKENS.surfaceCard).toBe('#14161a');
        expect(INDUSTRIAL_TELEMETRY_TOKENS.borderCard).toBe('#1f2228');
        expect(INDUSTRIAL_TELEMETRY_TOKENS.activeNavPillRed).toBe('#dc2626');

        render(
            <div>
                <StatusBadge status="ACTIVE" />
                <StatusBadge status="HEALTHY" />
                <StatusBadge status="QUEUED" />
                <StatusBadge status="OFFLINE" />
                <StatusBadge status="INACTIVE" />
            </div>
        );

        expect(screen.getByTestId('status-badge-active')).toHaveTextContent('ACTIVE');
        expect(screen.getByTestId('status-badge-healthy')).toHaveTextContent('HEALTHY');
        expect(screen.getByTestId('status-badge-queued')).toHaveTextContent('QUEUED');
        expect(screen.getByTestId('status-badge-offline')).toHaveTextContent('OFFLINE');
        expect(screen.getByTestId('status-badge-inactive')).toHaveTextContent('INACTIVE');
    });

    it('2. Renders TopSummaryKpiBar, HeaderActionGroup, and IndustrialTable with canonical empty state', () => {
        const onPrimary = vi.fn();
        const onTab = vi.fn();

        render(
            <div>
                <HeaderActionGroup
                    title="Pricing Intelligence Engine"
                    subtitle="Model production economics and manage margins."
                    tabs={[
                        { id: 'profiles', label: 'PROFILES' },
                        { id: 'routing', label: 'ROUTING DECISIONS' }
                    ]}
                    activeTabId="profiles"
                    onTabChange={onTab}
                    primaryActionLabel="NEW PROFILE"
                    onPrimaryAction={onPrimary}
                />
                <TopSummaryKpiBar
                    items={[
                        { label: 'PRICING PROFILES', value: 0, accent: 'blue' },
                        { label: 'ACTIVE NODES', value: 0, accent: 'emerald' },
                        { label: 'AVG MARKUP', value: '35%', accent: 'amber' },
                        { label: 'ECONOMIC HEALTH', value: '92%', accent: 'rose' }
                    ]}
                />
                <IndustrialTable
                    title="ACTIVE ECONOMIC PROFILES"
                    data={[]}
                    emptyEntityName="PRICING PROFILES"
                    columns={[
                        { key: 'printer', header: 'PRINTER / MACHINE' },
                        { key: 'scope', header: 'SCOPE' }
                    ]}
                />
            </div>
        );

        expect(screen.getByText('Pricing Intelligence Engine')).toBeInTheDocument();
        expect(screen.getByTestId('industrial-table-empty')).toHaveTextContent('NO PRICING PROFILES DEFINED');

        fireEvent.click(screen.getByTestId('header-primary-action-btn'));
        expect(onPrimary).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('tab', { name: 'ROUTING DECISIONS' }));
        expect(onTab).toHaveBeenCalledWith('routing');
    });

    it('3. Supports Dual-Mode (onboarding vs workspace) in PricingIntelligenceTab and rounded-full active red pill in Sidebar', async () => {
        const onNextStep = vi.fn();

        // Render in 'onboarding' mode
        const { unmount } = renderWithProviders(
            <PricingIntelligenceTab mode="onboarding" onNextStep={onNextStep} />,
            { locale: 'es', route: '/printhouse/setup?tab=PRICING' }
        );

        expect(screen.getByTestId('pricing-intelligence-engine')).toHaveAttribute('data-mode', 'onboarding');
        const saveContinueBtn = screen.getByTestId('onboarding-save-continue-btn');
        expect(saveContinueBtn).toHaveTextContent('Guardar y Continuar');
        fireEvent.click(saveContinueBtn);
        expect(onNextStep).toHaveBeenCalledTimes(1);

        unmount();

        // Render in 'workspace' mode with Sidebar
        renderWithProviders(
            <div>
                <Sidebar isOpen={true} isCollapsed={false} />
                <PricingIntelligenceTab mode="workspace" />
            </div>,
            { locale: 'en', route: '/ops/pricing' }
        );

        expect(screen.getByTestId('pricing-intelligence-engine')).toHaveAttribute('data-mode', 'workspace');
        expect(screen.queryByTestId('onboarding-save-continue-btn')).not.toBeInTheDocument();

        const pricingNavLink = document.getElementById('nav-pricing');
        expect(pricingNavLink).toBeInTheDocument();
        expect(pricingNavLink?.className).toContain('rounded-full');
        expect(pricingNavLink?.className).toContain('bg-[#dc2626]');
    });

    it('4. Applies Dark Industrial Telemetry UI across /ops/marketplace and its sub-tabs', async () => {
        renderWithProviders(<MarketplacePage mode="workspace" />, {
            locale: 'en',
            route: '/ops/marketplace'
        });

        expect(screen.getByTestId('marketplace-workspace')).toHaveAttribute('data-mode', 'workspace');
        expect(screen.getByTestId('top-summary-kpi-bar')).toBeInTheDocument();
        const emptyState = await screen.findByTestId('industrial-table-empty');
        expect(emptyState).toHaveTextContent('NO MARKETPLACE ORDERS DEFINED');
    });

    it('5. Renders PHASE-11A Preflight & Geometry Intelligence UI with trilingual support, KPIs, and AUTO-FIX', async () => {
        renderWithProviders(<PreflightJobsPage mode="workspace" />, {
            locale: 'de',
            route: '/preflight/jobs'
        });

        expect(screen.getByTestId('preflight-intelligence-workspace')).toHaveAttribute('data-mode', 'workspace');
        expect(screen.getByText('Preflight & Geometry Intelligence')).toBeInTheDocument();
        expect(
            screen.getByText('Automatische Beschnittzugabe-Synthese, TAC-Analyse und Buchrücken-Kalibrierung')
        ).toBeInTheDocument();
        expect(screen.getByText('INSPECTED FILES')).toBeInTheDocument();
        expect(screen.getByText('CRITICAL ERRORS')).toBeInTheDocument();
        expect(screen.getByText('AVG. TAC LEVEL')).toBeInTheDocument();
        expect(screen.getByText('AUTO-FIX RATIO')).toBeInTheDocument();

        const autoFixBtn = screen.getByTestId('auto-fix-btn-PF-2026-081');
        expect(autoFixBtn).toBeInTheDocument();
        fireEvent.click(autoFixBtn);
    });

    it('6. Renders PHASE-11B Dynamic Imposition & Production Queue UI with KPIs and signature table', async () => {
        renderWithProviders(<ManufacturingQueuePage mode="workspace" />, {
            locale: 'es',
            route: '/production/queue'
        });

        expect(screen.getByTestId('manufacturing-queue-workspace')).toHaveAttribute('data-mode', 'workspace');
        expect(screen.getByText('Dynamic Imposition & Production Queue')).toBeInTheDocument();
        expect(screen.getByText('TOTAL SIGNATURES')).toBeInTheDocument();
        expect(screen.getByText('PLATE CONSUMPTION')).toBeInTheDocument();
        expect(screen.getByText('AVG. PAPER EFFICIENCY %')).toBeInTheDocument();
        expect(screen.getByText('TOTAL SETUP WASTE')).toBeInTheDocument();
        expect(screen.getByTestId('header-primary-action-btn')).toHaveTextContent('COMPOSE SIGNATURES');
        expect(screen.getAllByText(/978-3-8365-9102-7/).length).toBeGreaterThan(0);
    });

    it('7. Renders PHASE-11C Publisher Operations Hub UI with 3D Soft-Proofing Viewer, 6-stage timeline, and APPROVE FOR PRESS', async () => {
        renderWithProviders(<PublisherHubPage mode="workspace" />, {
            locale: 'es',
            route: '/publisher/hub'
        });

        expect(screen.getByTestId('publisher-hub-workspace')).toHaveAttribute('data-mode', 'workspace');
        expect(screen.getByText('Publisher Operations Hub')).toBeInTheDocument();
        expect(screen.getByText('ACTIVE TITLES')).toBeInTheDocument();
        expect(screen.getByText('AWAITING APPROVAL')).toBeInTheDocument();
        expect(screen.getByText('COPIES IN PRESS')).toBeInTheDocument();
        expect(screen.getByText('ON-TIME DELIVERY %')).toBeInTheDocument();

        // 3D Soft-Proofing Viewer & 6-stage Manufacturing Timeline
        expect(screen.getByTestId('soft-proofing-viewer-3d')).toBeInTheDocument();
        expect(screen.getByTestId('parametric-3d-book-mesh')).toBeInTheDocument();
        expect(screen.getByTestId('timeline-step-PREFLIGHT_VALIDATED')).toBeInTheDocument();
        expect(screen.getByTestId('timeline-step-DISPATCHED_AND_DELIVERED')).toBeInTheDocument();

        // Self-service Document Center links
        expect(screen.getByTestId('download-signed-pod-btn')).toHaveAttribute(
            'href',
            '/api/logistics/shipments/SHP-2026-9901/delivery-note/pdf'
        );

        // Telematic formal sign-off ("APPROVE FOR PRESS")
        const approveBtn = screen.getByTestId('btn-approve-for-press');
        expect(approveBtn).toBeInTheDocument();
        fireEvent.click(approveBtn);
        expect(await screen.findByTestId('soft-proof-approved-banner')).toBeInTheDocument();
    });

    it('8. Renders PHASE-12A Financial Escrow & Split-Payout Engine UI and settles on signed POD', async () => {
        renderWithProviders(<FinancialOpsTab mode="workspace" />, {
            locale: 'es',
            route: '/admin/financials'
        });

        expect(screen.getByTestId('financial-escrow-workspace')).toHaveAttribute('data-mode', 'workspace');
        expect(screen.getByText('Commercial Escrow & Split-Payout Ledger')).toBeInTheDocument();
        expect(screen.getByText('ESCROW LOCKED EUR')).toBeInTheDocument();
        expect(screen.getByText('PENDING POD SETTLEMENT')).toBeInTheDocument();
        expect(screen.getByText('RELEASED TO PRINTHOUSES')).toBeInTheDocument();
        expect(screen.getByText('EPAL / CLAIM DEDUCTIONS')).toBeInTheDocument();

        const settleBtn = screen.getByTestId('settle-pod-btn-PUB-ORD-2026-101');
        expect(settleBtn).toBeInTheDocument();
        fireEvent.click(settleBtn);
        await screen.findByText(/€16[.,]200/);
        expect(screen.queryByTestId('settle-pod-btn-PUB-ORD-2026-101')).not.toBeInTheDocument();
    });

    it('9. Renders PHASE-12B JDF 1.7 XML Export in ManufacturingQueuePage and PHASE-12C Predictive Maintenance in MachinesPage', async () => {
        renderWithProviders(<ManufacturingQueuePage mode="workspace" />, {
            locale: 'es',
            route: '/production/queue'
        });

        const jdfBtn = screen.getByTestId('export-jdf-btn-PF-2026-082-SIG-01');
        expect(jdfBtn).toBeInTheDocument();
        fireEvent.click(jdfBtn);
        expect(await screen.findByTestId('jdf-xml-preview-modal')).toBeInTheDocument();
        expect(screen.getByTestId('jdf-xml-code-block')).toHaveTextContent('http://www.cip4.org/JDFSchema_1_1');

        const simJmfBtn = screen.getByTestId('simulate-jmf-btn-PF-2026-084-SIG-01');
        expect(simJmfBtn).toBeInTheDocument();
        fireEvent.click(simJmfBtn);
        expect(await screen.findByTestId('jmf-telemetry-burst-banner')).toBeInTheDocument();

        vi.spyOn(adminApi, 'getMachines').mockResolvedValue({
            ok: true,
            total: 1,
            machines: [],
            status: 'ONLINE',
            timestamp: new Date().toISOString()
        });

        renderWithProviders(<MachinesPage mode="workspace" />, {
            locale: 'es',
            route: '/ops/machines'
        });

        expect(screen.getByTestId('predictive-maintenance-panel')).toBeInTheDocument();
        expect(screen.getByTestId('routing-status-MACH-KOMORI-G29-B2')).toHaveTextContent(
            'ROUTING_BLOCKED_MAINTENANCE_REQUIRED'
        );

        const resetBtn = screen.getByTestId('reset-maintenance-btn-MACH-KOMORI-G29-B2');
        fireEvent.click(resetBtn);
        await screen.findByText(/0\.0% WEAR/i);
        expect(screen.getByTestId('routing-status-MACH-KOMORI-G29-B2')).toHaveTextContent('ROUTING_ENABLED');
    });

    it('10. Renders PHASE-13A Executive Profitability Dashboard and PHASE-13B EN 16931 Facturae 3.2.2 / XRechnung 3.0 XML Preview', async () => {
        renderWithProviders(<ProductionDashboard mode="workspace" />, {
            locale: 'es',
            route: '/production'
        });

        expect(screen.getByTestId('executive-profitability-dashboard')).toHaveAttribute('data-mode', 'workspace');
        expect(screen.getByText('Executive Plant Profitability & JMF Yield')).toBeInTheDocument();
        expect(screen.getByText('NET MFG REVENUE EUR')).toBeInTheDocument();
        expect(screen.getByText('REAL NET MARGIN EUR')).toBeInTheDocument();
        expect(screen.getByText('AVG. INDUSTRIAL MARGIN %')).toBeInTheDocument();
        expect(screen.getByText('JMF CLOSED-LOOP SAVINGS')).toBeInTheDocument();

        const xrechnungBtn = screen.getByTestId('einvoice-xrechnung-btn-PUB-ORD-2026-103');
        fireEvent.click(xrechnungBtn);
        expect(await screen.findByTestId('einvoice-xml-modal')).toBeInTheDocument();
        expect(screen.getByTestId('einvoice-xml-code')).toHaveTextContent('xrechnung_3.0');
    });

    it('11. Renders PHASE-14 Decoupled Pricing Intelligence Engine (PricingKpiSummaryBar, EconomicProfilesTable, LivePriceCalibratorModal, RoutingRulesTab)', async () => {
        renderWithProviders(<PricingIntelligenceTab mode="workspace" />, {
            locale: 'es',
            route: '/ops/pricing'
        });

        // Verify KPI bar shows real seeded profiles (> 0)
        expect(screen.getByTestId('pricing-kpi-summary-bar')).toBeInTheDocument();
        expect(screen.getByTestId('economic-profiles-table')).toBeInTheDocument();
        expect(screen.getByText('Heidelberg Speedmaster XL 106-8P')).toBeInTheDocument();
        expect(screen.getByText('HP Indigo 12000 HD Digital Press')).toBeInTheDocument();

        // Open Live Price Calibrator Modal from the Heidelberg row
        const calibrateBtn = screen.getByTestId('calibrate-profile-btn-prof-offset-b1-xl106');
        fireEvent.click(calibrateBtn);

        expect(await screen.findByTestId('live-price-calibrator')).toBeInTheDocument();
        const initialTotal = screen.getByTestId('calibrator-total-selling-price').textContent;

        // Adjust Target Margin slider from 28% to 45% and verify real-time price recalculation
        const marginSlider = screen.getByTestId('slider-target-margin');
        fireEvent.change(marginSlider, { target: { value: '45' } });
        expect(screen.getByTestId('slider-target-margin-value')).toHaveTextContent('45%');

        const updatedTotal = screen.getByTestId('calibrator-total-selling-price').textContent;
        expect(updatedTotal).not.toEqual(initialTotal);

        // Verify Product Family & Machine hierarchy synchronization inside LivePriceCalibratorModal
        const familySelect = screen.getByTestId('calibrator-family-select') as HTMLSelectElement;
        expect(familySelect).toBeInTheDocument();
        fireEvent.change(familySelect, { target: { value: 'HARDCOVER' } });
        expect((screen.getByTestId('calibrator-binding-select') as HTMLSelectElement).value).toBe('HARDCOVER');

        fireEvent.change(familySelect, { target: { value: 'WIRE_O' } });
        expect((screen.getByTestId('calibrator-binding-select') as HTMLSelectElement).value).toBe('WIRE_O');

        // Verify quick-add substrate to materials_catalog inline form
        fireEvent.click(screen.getByTestId('calibrator-add-paper-btn'));
        expect(screen.getByTestId('calibrator-quick-add-paper-form')).toBeInTheDocument();
        fireEvent.change(screen.getByTestId('new-paper-name-input'), { target: { value: 'Amber Graphic 100g' } });
        fireEvent.click(screen.getByTestId('save-new-paper-btn'));

        // Close calibrator modal via ESC / CLOSE button
        fireEvent.click(screen.getByTestId('close-calibrator-btn'));
        expect(screen.queryByTestId('live-price-calibrator')).not.toBeInTheDocument();

        // Duplicate a profile and then delete the duplicated profile
        const duplicateBtn = screen.getByTestId('duplicate-profile-btn-prof-digital-sra3-indigo');
        fireEvent.click(duplicateBtn);
        expect(await screen.findByText(/HP Indigo 12000 HD Digital Press \(Copy\)/)).toBeInTheDocument();

        const deleteBtns = screen.getAllByText('DELETE');
        expect(deleteBtns.length).toBeGreaterThan(0);
        fireEvent.click(deleteBtns[0]);
        expect(screen.queryByText(/HP Indigo 12000 HD Digital Press \(Copy\)/)).not.toBeInTheDocument();

        // Switch to Routing Decisions & Crossover tab
        fireEvent.click(screen.getByRole('tab', { name: 'ROUTING DECISIONS' }));

        expect(await screen.findByTestId('routing-rules-tab')).toBeInTheDocument();
        expect(screen.getByTestId('crossover-analyzer-card')).toBeInTheDocument();
        expect(screen.getByTestId('crossover-copies-badge')).toHaveTextContent(/410 copies/);
    });

    it('12. Renders PHASE-15B Payouts & Banking tab in GlobalSettingsPage with Stripe Connect, MOD-97 IBAN validation, and Dual Settlement Modality', async () => {
        vi.spyOn(adminApi, 'adminFetch').mockImplementation(async (url: string) => {
            if (url.includes('/api/settings/payments/stripe/test-connection')) {
                return {
                    ok: true,
                    status: 'OK',
                    chargesEnabled: true,
                    stripeAccountId: 'acct_1P9xYzPrintHouse2026'
                };
            }
            if (url.includes('/api/settings/payments')) {
                return {
                    ok: true,
                    settings: {
                        stripeAccountId: 'acct_1P9xYzPrintHouse2026',
                        stripePublishableKey: 'pk_test_51P9xYz',
                        stripeRestrictedKeyMasked: 'rk_test_••••••••9xYz',
                        stripeMode: 'TEST',
                        bankAccountHolder: 'Gráficas Industriales S.A.',
                        bankIbanFormatted: 'ES91 2100 0418 4502 0005 1332',
                        bankBicSwift: 'CAIXESBBXXX',
                        legalEntityName: 'Gráficas Industriales S.A.',
                        vatTaxId: 'ESA12345678',
                        fiscalAddress: 'Barcelona Industrial Park',
                        defaultSettlementModality: 'MODALITY_A_ESCROW_MOR',
                        status: 'VERIFIED'
                    }
                };
            }
            return { ok: true, data: [] };
        });

        renderWithProviders(<GlobalSettingsPage mode="workspace" />, {
            locale: 'en',
            route: '/settings'
        });

        // Switch to Payouts & Banking tab
        const paymentsNavBtn = document.getElementById('settings-tab-payments');
        expect(paymentsNavBtn).toBeInTheDocument();
        fireEvent.click(paymentsNavBtn!);

        expect(await screen.findByTestId('settings-payments-panel')).toBeInTheDocument();
        expect(screen.getByText('1. STRIPE CONNECT & GATEWAY CREDENTIALS')).toBeInTheDocument();
        expect(screen.getByText('2. BANK SETTLEMENT ACCOUNT (SEPA / B2B WIRE)')).toBeInTheDocument();
        expect(screen.getByText('3. COMMERCIAL SETTLEMENT & TAX PROFILE')).toBeInTheDocument();

        // Enter a valid Spanish IBAN and verify live MOD-97 validation badge & canonical h-11 / text-sm styling
        const ibanInput = screen.getByTestId('input-bank-iban');
        expect(ibanInput.className).toContain('h-11');
        expect(ibanInput.className).toContain('text-sm');
        expect(ibanInput.className).toContain('font-mono');
        expect(screen.getByTestId('input-stripe-account-id').className).toContain('h-11');
        expect(screen.getByTestId('input-legal-entity').className).toContain('h-11');
        expect(screen.getByTestId('btn-test-stripe-connection').className).toContain('h-11');
        expect(screen.getByTestId('btn-save-payment-settings').className).toContain('h-11');

        fireEvent.change(ibanInput, { target: { value: 'ES9121000418450200051332' } });
        expect(screen.getByTestId('iban-validation-badge')).toHaveTextContent('MOD-97 VALID');

        // Switch settlement modality to Modality B (Direct Commission)
        fireEvent.click(screen.getByTestId('select-modality-b-btn'));
        expect(screen.getByTestId('payment-config-status-banner')).toHaveTextContent('MODALITY B: DIRECT');

        // Trigger Stripe Connection Test
        fireEvent.click(screen.getByTestId('btn-test-stripe-connection'));
        expect(await screen.findByTestId('stripe-connection-telemetry-badge')).toHaveTextContent(
            'CONNECTED (Charges Enabled)'
        );
    });
});

