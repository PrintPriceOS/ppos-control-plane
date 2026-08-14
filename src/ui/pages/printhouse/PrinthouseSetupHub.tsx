/**
 * src/ui/pages/printhouse/PrinthouseSetupHub.tsx
 * 
 * Phase 191C/D / Phase 192 RC19 — Canonical Printhouse Setup Hub Page.
 * 
 * Authenticated workspace landing page for progressive Printhouse onboarding.
 * Displays readiness progress summary and modular cards for Company Profile,
 * Production Sites, Machinery Fleet, Production Capabilities, Materials,
 * Capacity, Lead Times, and Pricing.
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SetupProgressSummary } from '../../components/printhouse/setup/SetupProgressSummary';
import { SetupModuleCard } from '../../components/printhouse/setup/SetupModuleCard';
import { CompanyProfileForm } from '../../components/printhouse/setup/CompanyProfileForm';
import { ProductionSitesPanel } from '../../components/printhouse/setup/ProductionSitesPanel';
import { MachineFleetPanel } from '../../components/printhouse/setup/MachineFleetPanel';
import { CapabilitiesPanel } from '../../components/printhouse/setup/CapabilitiesPanel';
import { MaterialsPanel } from '../../components/printhouse/setup/MaterialsPanel';
import { CapacityPanel } from '../../components/printhouse/setup/CapacityPanel';
import { LeadTimesPanel } from '../../components/printhouse/setup/LeadTimesPanel';
import { PricingPanel } from '../../components/printhouse/setup/PricingPanel';
import { ShippingPanel } from '../../components/printhouse/setup/ShippingPanel';
import { IntegrationsPanel } from '../../components/printhouse/setup/IntegrationsPanel';
import { MarketplaceReadinessPanel } from '../../components/printhouse/setup/MarketplaceReadinessPanel';
import { getAuthToken } from '../../lib/authStore';
import { Building2, Factory, Cog, Shield, RefreshCw, Layers, Activity, Clock, Tag, Truck, Cpu, CheckCircle2, AlertTriangle } from 'lucide-react';

type TabKey = 'OVERVIEW' | 'COMPANY' | 'SITES' | 'MACHINES' | 'CAPABILITIES' | 'MATERIALS' | 'CAPACITY' | 'LEAD_TIMES' | 'PRICING' | 'SHIPPING' | 'INTEGRATIONS' | 'MARKETPLACE';

export const PrinthouseSetupHub: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [onboardingData, setOnboardingData] = useState<any>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const initialTab = (searchParams.get('tab') || 'OVERVIEW').toUpperCase() as TabKey;
    const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

    const handleSelectTab = (tab: TabKey) => {
        setActiveTab(tab);
        setSearchParams(tab === 'OVERVIEW' ? {} : { tab });
    };

    const fetchOnboardingData = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const token = getAuthToken();
            const res = await fetch('/api/printhouse/onboarding', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setOnboardingData(data.data);
            } else {
                setFetchError(data.error?.message || 'Unable to load printhouse readiness data.');
            }
        } catch (err: any) {
            console.error('Error fetching onboarding data:', err);
            setFetchError('Connection error while fetching readiness.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOnboardingData();
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <RefreshCw size={32} className="animate-spin" style={{ color: '#dc0000' }} />
            </div>
        );
    }

    const company = onboardingData?.company;
    const sites = onboardingData?.sites || [];
    const readiness = onboardingData?.readiness;

    const companyStatus = readiness?.accountSetup?.status === 'COMPLETE' ? 'COMPLETE' : company?.companyName ? 'IN_PROGRESS' : 'NOT_STARTED';
    const sitesStatus = sites.some((s: any) => s.city && s.city !== 'Pending Setup') ? 'COMPLETE' : sites.length > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';

    // Phase 191D.1 / Phase 191E: Derive statuses from operational readiness
    const opsReadiness = readiness?.operationalReadiness || {};
    const opsConfig = readiness?.operationalConfiguration || {};

    const machineCount = opsConfig.machineCount !== undefined ? opsConfig.machineCount : (opsReadiness.machineCount || 0);
    const capabilityCount = opsConfig.capabilityCount !== undefined ? opsConfig.capabilityCount : (opsReadiness.capabilityCount || 0);
    const materialCount = opsConfig.materialCount !== undefined ? opsConfig.materialCount : (opsReadiness.materialCount || 0);
    const capacityCount = opsConfig.capacityCount !== undefined ? opsConfig.capacityCount : (opsReadiness.capacityCount || 0);
    const leadTimesCount = opsConfig.leadTimesCount !== undefined ? opsConfig.leadTimesCount : (opsReadiness.leadTimesCount || 0);

    const machinesStatus = machineCount > 0 ? 'COMPLETE' : 'NOT_STARTED';
    const capabilitiesStatus = capabilityCount > 0 ? 'COMPLETE' : 'NOT_STARTED';
    const materialsStatus = materialCount > 0 ? 'COMPLETE' : 'NOT_STARTED';
    const capacityStatus = capacityCount > 0 ? 'COMPLETE' : 'NOT_STARTED';
    const leadTimesStatus = leadTimesCount > 0 ? 'COMPLETE' : 'NOT_STARTED';
    const pricingStatus = readiness?.pricingReadiness?.status === 'COMPLETE'
        ? 'COMPLETE'
        : readiness?.pricingReadiness?.status === 'IN_PROGRESS'
            ? 'IN_PROGRESS'
            : 'NOT_STARTED';

    // Map sites for child panels
    const siteOptions = sites.map((s: any) => ({ siteId: s.siteId, siteName: s.siteName || s.siteId }));
    const hasSites = sites.length > 0;
    const hasMachines = machineCount > 0;

    // Missing requirements filtering from backend blocking issues & advisories
    const accountBlockers = (readiness?.accountSetup?.blockingIssues || []).concat(readiness?.accountSetup?.advisories || []);
    const opsBlockers = (opsConfig.blockingIssues || []).concat(opsConfig.advisories || []);

    const companyMissing = accountBlockers
        .filter((b: any) => b.module === 'COMPANY_PROFILE')
        .map((b: any) => b.message || b.code);

    const sitesMissing = accountBlockers
        .filter((b: any) => b.module === 'PRODUCTION_SITES')
        .map((b: any) => b.message || b.code);

    const machinesMissing = opsBlockers
        .filter((b: any) => b.module === 'MACHINES')
        .map((b: any) => b.message || b.code);

    const capabilitiesMissing = opsBlockers
        .filter((b: any) => b.module === 'CAPABILITIES')
        .map((b: any) => b.message || b.code);

    const materialsMissing = opsBlockers
        .filter((b: any) => b.module === 'MATERIALS')
        .map((b: any) => b.message || b.code);

    const capacityMissing = opsBlockers
        .filter((b: any) => b.module === 'CAPACITY')
        .map((b: any) => b.message || b.code);

    const leadTimesMissing = opsBlockers
        .filter((b: any) => b.module === 'LEAD_TIMES')
        .map((b: any) => b.message || b.code);

    const pricingBlockers = (readiness?.pricingReadiness?.blockingIssues || []).concat(readiness?.pricingReadiness?.advisories || []);
    const pricingMissing = readiness?.pricingReadiness?.status !== 'COMPLETE'
        ? (pricingBlockers.length > 0 
            ? pricingBlockers.map((b: any) => b.message || b.code) 
            : ['Configure and save industrial manufacturing rates'])
        : [];

    const tabDefs: { key: TabKey; label: string; icon: React.ReactNode; enabled: boolean }[] = [
        { key: 'OVERVIEW', label: 'Setup Overview', icon: null, enabled: true },
        { key: 'COMPANY', label: 'Company Profile', icon: <Building2 size={16} />, enabled: true },
        { key: 'SITES', label: 'Production Sites', icon: <Factory size={16} />, enabled: true },
        { key: 'MACHINES', label: 'Machinery Fleet', icon: <Cog size={16} />, enabled: hasSites },
        { key: 'CAPABILITIES', label: 'Capabilities', icon: <Shield size={16} />, enabled: hasSites && hasMachines },
        { key: 'MATERIALS', label: 'Materials', icon: <Layers size={16} />, enabled: hasSites },
        { key: 'CAPACITY', label: 'Capacity', icon: <Activity size={16} />, enabled: hasSites },
        { key: 'LEAD_TIMES', label: 'Lead Times', icon: <Clock size={16} />, enabled: hasSites },
        { key: 'PRICING', label: 'Pricing', icon: <Tag size={16} />, enabled: hasSites },
        { key: 'SHIPPING', label: 'Shipping', icon: <Truck size={16} />, enabled: hasSites },
        { key: 'INTEGRATIONS', label: 'Integrations', icon: <Cpu size={16} />, enabled: true },
        { key: 'MARKETPLACE', label: 'Marketplace Review', icon: <CheckCircle2 size={16} />, enabled: true },
    ];

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', color: '#18181b' }}>
            {/* Header Banner */}
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#09090b', margin: '0 0 8px 0' }}>
                    Welcome to Your Printhouse Workspace
                </h1>
                <p style={{ fontSize: '14px', color: '#52525b', margin: 0, maxWidth: '720px', lineHeight: '1.6' }}>
                    Configure your production environment at your own pace. Complete the 8 operational modules below so PrintPrice OS can accurately route jobs, verify preflight specifications, and enable automated marketplace dispatch.
                </p>
            </div>

            {fetchError && (
                <div style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={18} color="#dc2626" />
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{fetchError}</span>
                    </div>
                    <button
                        onClick={fetchOnboardingData}
                        style={{
                            background: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600
                        }}
                    >
                        Retry Loading
                    </button>
                </div>
            )}

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e4e4e7', paddingBottom: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
                {tabDefs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => tab.enabled && handleSelectTab(tab.key)}
                        style={{
                            background: activeTab === tab.key ? '#dc0000' : '#f4f4f5',
                            color: activeTab === tab.key ? '#ffffff' : tab.enabled ? '#18181b' : '#a1a1aa',
                            border: '1px solid ' + (activeTab === tab.key ? '#dc0000' : '#e4e4e7'),
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: tab.enabled ? 'pointer' : 'not-allowed',
                            opacity: tab.enabled ? 1 : 0.6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Readiness Summary (Top 3 Aggregate Dimensions + Overall Core Status) */}
            <SetupProgressSummary readiness={readiness} />

            {/* Tab Contents */}
            {activeTab === 'OVERVIEW' && (
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#09090b', marginBottom: '16px' }}>
                        Guided Setup Tasks (8 Modules)
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                        {/* 1. Company Profile */}
                        <SetupModuleCard
                            title="1. Company Profile"
                            description="Legal company identity, primary country, tax/VAT identifier, and administrative contact."
                            status={companyStatus}
                            isActionable={true}
                            missingRequirements={companyMissing}
                            onAction={() => handleSelectTab('COMPANY')}
                        />

                        {/* 2. Production Sites */}
                        <SetupModuleCard
                            title="2. Production Sites"
                            description="Physical printing plants, operating addresses, city location, and facility timezone."
                            status={sitesStatus}
                            isActionable={true}
                            missingRequirements={sitesMissing}
                            onAction={() => handleSelectTab('SITES')}
                        />

                        {/* 3. Machinery Fleet */}
                        <SetupModuleCard
                            title="3. Machinery Fleet"
                            description="Offset presses, digital devices, cutting tables, binders, and finishing equipment."
                            status={machinesStatus}
                            isActionable={hasSites}
                            dependencyHint="Requires at least 1 Production Site"
                            missingRequirements={machinesMissing}
                            onAction={() => hasSites ? handleSelectTab('MACHINES') : handleSelectTab('SITES')}
                        />

                        {/* 4. Production Capabilities */}
                        <SetupModuleCard
                            title="4. Machine Capabilities"
                            description="Color management (CMYK, Spot UV, White Ink), maximum sheet dimensions, and PDF/X specs."
                            status={capabilitiesStatus}
                            isActionable={hasSites && hasMachines}
                            dependencyHint="Requires at least 1 Machine"
                            missingRequirements={capabilitiesMissing}
                            onAction={() => (hasSites && hasMachines) ? handleSelectTab('CAPABILITIES') : handleSelectTab('MACHINES')}
                        />

                        {/* 5. Materials & Substrates */}
                        <SetupModuleCard
                            title="5. Materials & Substrates"
                            description="Substrate catalog, paper grammages, sheet sizes, and finishing compatibility."
                            status={materialsStatus}
                            isActionable={hasSites}
                            dependencyHint="Requires at least 1 Production Site"
                            missingRequirements={materialsMissing}
                            onAction={() => hasSites ? handleSelectTab('MATERIALS') : handleSelectTab('SITES')}
                        />

                        {/* 6. Production Capacity */}
                        <SetupModuleCard
                            title="6. Production Capacity"
                            description="Daily throughput constraints, shift schedules, working calendar, and job allocations."
                            status={capacityStatus}
                            isActionable={hasSites}
                            dependencyHint="Requires at least 1 Production Site"
                            missingRequirements={capacityMissing}
                            onAction={() => hasSites ? handleSelectTab('CAPACITY') : handleSelectTab('SITES')}
                        />

                        {/* 7. Lead Times */}
                        <SetupModuleCard
                            title="7. Lead Times"
                            description="Site-level daily cut-off times, timezone cut-offs, turnaround SLAs, and completion schedules."
                            status={leadTimesStatus}
                            isActionable={hasSites}
                            dependencyHint="Requires at least 1 Production Site"
                            missingRequirements={leadTimesMissing}
                            onAction={() => hasSites ? handleSelectTab('LEAD_TIMES') : handleSelectTab('SITES')}
                        />

                        {/* 8. Pricing & Price Books */}
                        <SetupModuleCard
                            title="8. Pricing & Price Books"
                            description="Base machine run costs, quantity volume tiers, margins, and published price books."
                            status={pricingStatus}
                            isActionable={hasSites}
                            dependencyHint="Requires at least 1 Production Site"
                            missingRequirements={pricingMissing}
                            onAction={() => hasSites ? handleSelectTab('PRICING') : handleSelectTab('SITES')}
                        />
                    </div>
                </div>
            )}

            {activeTab === 'COMPANY' && (
                <CompanyProfileForm companyData={company} onSaved={fetchOnboardingData} />
            )}

            {activeTab === 'SITES' && (
                <ProductionSitesPanel sites={sites} onSaved={fetchOnboardingData} />
            )}

            {activeTab === 'MACHINES' && (
                <MachineFleetPanel sites={siteOptions} onSaved={fetchOnboardingData} />
            )}

            {activeTab === 'CAPABILITIES' && (
                <CapabilitiesPanel sites={siteOptions} />
            )}

            {activeTab === 'MATERIALS' && (
                <MaterialsPanel sites={siteOptions} onSaved={fetchOnboardingData} />
            )}

            {activeTab === 'CAPACITY' && (
                <CapacityPanel sites={siteOptions} onSaved={fetchOnboardingData} />
            )}

            {activeTab === 'LEAD_TIMES' && (
                <LeadTimesPanel sites={siteOptions} onSaved={fetchOnboardingData} />
            )}

            {activeTab === 'PRICING' && (
                <PricingPanel sites={siteOptions} onSaved={fetchOnboardingData} />
            )}

            {activeTab === 'SHIPPING' && (
                <ShippingPanel siteId={siteOptions[0]?.siteId} onSaveSuccess={fetchOnboardingData} />
            )}

            {activeTab === 'INTEGRATIONS' && (
                <IntegrationsPanel siteId={siteOptions[0]?.siteId} onSaveSuccess={fetchOnboardingData} />
            )}

            {activeTab === 'MARKETPLACE' && (
                <MarketplaceReadinessPanel onSaved={fetchOnboardingData} />
            )}
        </div>
    );
};

