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
});

