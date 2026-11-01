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
});

