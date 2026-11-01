/**
 * src/ui/components/pricing/PricingKpiSummaryBar.tsx
 *
 * PrintPrice OS — Phase 14: Dynamic KPI Summary Bar for Pricing Intelligence Engine
 *
 * Renders the 4 canonical Dark Industrial Telemetry KPI cards connected to real data:
 * 1. ACTIVE PROFILES (count of profiles across Offset B1, Offset B2, Digital Toner, Web Rotary)
 * 2. ACTIVE NODES / MACHINES (machines with assigned hourly rate and target margin)
 * 3. AVG TARGET MARKUP (weighted average configured target margin %)
 * 4. ECONOMIC HEALTH (viability score derived from waste variance and OEE)
 */
import React from 'react';
import {
    ArchiveBoxIcon,
    CalculatorIcon,
    TagIcon,
    ChartPieIcon
} from '@heroicons/react/24/outline';
import { TopSummaryKpiBar } from '../common';

export interface PricingKpiSummary {
    activeProfilesCount: number;
    totalProfilesCount: number;
    activeMachinesCount: number;
    avgTargetMarginPct: number;
    avgHourlyRateEur: number;
    economicHealthPct: number;
    technologyBreakdown?: {
        OFFSET_B1?: number;
        OFFSET_B2?: number;
        DIGITAL_TONER?: number;
        WEB_ROTARY?: number;
    };
}

export interface PricingKpiSummaryBarProps {
    summary: PricingKpiSummary;
    labels?: {
        kpiProfiles?: string;
        kpiNodes?: string;
        kpiMarkup?: string;
        kpiHealth?: string;
    };
}

export const PricingKpiSummaryBar: React.FC<PricingKpiSummaryBarProps> = ({
    summary,
    labels
}) => {
    const tech = summary.technologyBreakdown || {};
    const breakdownSub = `B1:${tech.OFFSET_B1 ?? 0} · B2:${tech.OFFSET_B2 ?? 0} · DIG:${tech.DIGITAL_TONER ?? 0} · ROT:${tech.WEB_ROTARY ?? 0}`;

    return (
        <div data-testid="pricing-kpi-summary-bar">
            <TopSummaryKpiBar
                items={[
                    {
                        id: 'active-profiles',
                        label: labels?.kpiProfiles || 'ACTIVE PROFILES',
                        value: summary.activeProfilesCount,
                        subvalue: breakdownSub,
                        icon: ArchiveBoxIcon,
                        accent: 'blue'
                    },
                    {
                        id: 'active-nodes',
                        label: labels?.kpiNodes || 'ACTIVE NODES / MACHINES',
                        value: summary.activeMachinesCount,
                        subvalue: `Avg €${summary.avgHourlyRateEur}/h`,
                        icon: CalculatorIcon,
                        accent: 'emerald'
                    },
                    {
                        id: 'avg-markup',
                        label: labels?.kpiMarkup || 'AVG TARGET MARKUP',
                        value: `${summary.avgTargetMarginPct}%`,
                        subvalue: 'Target Industrial Margin',
                        icon: TagIcon,
                        accent: 'amber'
                    },
                    {
                        id: 'economic-health',
                        label: labels?.kpiHealth || 'ECONOMIC HEALTH',
                        value: `${summary.economicHealthPct}%`,
                        subvalue: 'OEE & Waste Viability',
                        icon: ChartPieIcon,
                        accent: 'rose'
                    }
                ]}
            />
        </div>
    );
};

