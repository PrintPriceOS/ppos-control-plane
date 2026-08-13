/**
 * src/ui/pages/printhouse/PrinthouseSetupHub.tsx
 * 
 * Phase 191C/D — Printhouse Setup Hub Page.
 * 
 * Authenticated workspace landing page for progressive Printhouse onboarding.
 * Displays readiness progress summary and modular cards for Company Profile,
 * Production Sites, Machinery Fleet, and Production Capabilities.
 */
import React, { useState, useEffect } from 'react';
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
import { Building2, Factory, Cog, Shield, RefreshCw, Layers, Activity, Clock, Tag, Truck, Cpu, CheckCircle2 } from 'lucide-react';

type TabKey = 'OVERVIEW' | 'COMPANY' | 'SITES' | 'MACHINES' | 'CAPABILITIES' | 'MATERIALS' | 'CAPACITY' | 'LEAD_TIMES' | 'PRICING' | 'SHIPPING' | 'INTEGRATIONS' | 'MARKETPLACE';

export const PrinthouseSetupHub: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [onboardingData, setOnboardingData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('OVERVIEW');

    const fetchOnboardingData = async () => {
        setLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch('/api/printhouse/onboarding', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setOnboardingData(data.data);
            }
        } catch (err) {
            console.error('Error fetching onboarding data:', err);
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
    const machinesStatus = opsReadiness.machineCount > 0
        ? (opsReadiness.status === 'READY' || opsReadiness.machineCount > 0 ? 'COMPLETE' : 'IN_PROGRESS')
        : 'NOT_STARTED';
    const capabilitiesStatus = opsReadiness.capabilityCount > 0
        ? 'COMPLETE'
        : 'NOT_STARTED';
    const materialsStatus = opsReadiness.materialCount > 0
        ? 'COMPLETE'
        : 'NOT_STARTED';
    const capacityStatus = opsReadiness.capacityCount > 0
        ? 'COMPLETE'
        : 'NOT_STARTED';
    const leadTimesStatus = opsReadiness.leadTimesCount > 0
        ? 'COMPLETE'
        : 'NOT_STARTED';

    // Map sites for child panels
    const siteOptions = sites.map((s: any) => ({ siteId: s.siteId, siteName: s.siteName || s.siteId }));

    // Whether machines/capabilities tabs are actionable (requires at least 1 site)
    const hasSites = sites.length > 0;

    const tabDefs: { key: TabKey; label: string; icon: React.ReactNode; enabled: boolean }[] = [
        { key: 'OVERVIEW', label: 'Setup Overview', icon: null, enabled: true },
        { key: 'COMPANY', label: 'Company Profile', icon: <Building2 size={16} />, enabled: true },
        { key: 'SITES', label: 'Production Sites', icon: <Factory size={16} />, enabled: true },
        { key: 'MACHINES', label: 'Machinery Fleet', icon: <Cog size={16} />, enabled: hasSites },
        { key: 'CAPABILITIES', label: 'Capabilities', icon: <Shield size={16} />, enabled: hasSites },
        { key: 'MATERIALS', label: 'Materials', icon: <Layers size={16} />, enabled: hasSites },
        { key: 'CAPACITY', label: 'Capacity', icon: <Activity size={16} />, enabled: hasSites },
        { key: 'LEAD_TIMES', label: 'Lead Times', icon: <Clock size={16} />, enabled: hasSites },
        { key: 'PRICING', label: 'Pricing', icon: <Tag size={16} />, enabled: hasSites },
        { key: 'SHIPPING', label: 'Shipping', icon: <Truck size={16} />, enabled: hasSites },
        { key: 'INTEGRATIONS', label: 'Integrations', icon: <Cpu size={16} />, enabled: true },
        { key: 'MARKETPLACE', label: 'Marketplace Review', icon: <CheckCircle2 size={16} />, enabled: true },
    ];

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', color: '#f4f4f5' }}>
            {/* Header Banner */}
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', margin: '0 0 8px 0' }}>
                    Welcome to Your Printhouse Workspace
                </h1>
                <p style={{ fontSize: '14px', color: '#a1a1aa', margin: 0, maxWidth: '720px', lineHeight: '1.6' }}>
                    Configure your production environment at your own pace. You can explore the platform while completing your setup. Production dispatch and marketplace publishing will activate as requirements are completed.
                </p>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #27272a', paddingBottom: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
                {tabDefs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => tab.enabled && setActiveTab(tab.key)}
                        style={{
                            background: activeTab === tab.key ? '#dc0000' : '#18181b',
                            color: tab.enabled ? '#ffffff' : '#52525b',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '8px',
                            fontSize: '14px',
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

            {/* Readiness Summary */}
            <SetupProgressSummary readiness={readiness} />

            {/* Tab Contents */}
            {activeTab === 'OVERVIEW' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                    <SetupModuleCard
                        title="Company Profile"
                        description="Legal company identity, country, city, primary contact information, and business details."
                        status={companyStatus}
                        isActionable={true}
                        onAction={() => setActiveTab('COMPANY')}
                    />
                    <SetupModuleCard
                        title="Production Sites"
                        description="Physical printing plants, facility locations, timezones, and node configuration."
                        status={sitesStatus}
                        isActionable={true}
                        onAction={() => setActiveTab('SITES')}
                    />
                    <SetupModuleCard
                        title="Machinery Fleet"
                        description="Offset presses, digital devices, binders, and finishing equipment limits."
                        status={machinesStatus}
                        isActionable={hasSites}
                        onAction={() => hasSites && setActiveTab('MACHINES')}
                    />
                    <SetupModuleCard
                        title="Production Capabilities"
                        description="Color management, spot UV, white ink, quality assurance, and ISO certifications."
                        status={capabilitiesStatus}
                        isActionable={hasSites}
                        onAction={() => hasSites && setActiveTab('CAPABILITIES')}
                    />
                    <SetupModuleCard
                        title="Materials & Substrates"
                        description="Paper stocks, grammages, media formats, and substrate catalog."
                        status={materialsStatus}
                        isActionable={hasSites}
                        onAction={() => hasSites && setActiveTab('MATERIALS')}
                    />
                    <SetupModuleCard
                        title="Production Capacity"
                        description="Daily throughput constraints, shift rules, and machine capacity allocations."
                        status={capacityStatus}
                        isActionable={hasSites}
                        onAction={() => hasSites && setActiveTab('CAPACITY')}
                    />
                    <SetupModuleCard
                        title="Lead Times"
                        description="Site-level cut-off rules, timezone definitions, working calendar, and completion times."
                        status={leadTimesStatus}
                        isActionable={hasSites}
                        onAction={() => hasSites && setActiveTab('LEAD_TIMES')}
                    />
                    <SetupModuleCard
                        title="Pricing & Escalations"
                        description="Base costs, quantity tiers, margin rules, and commercial pricing models."
                        status={
                            readiness?.pricingReadiness?.status === 'COMPLETE'
                                ? 'COMPLETE'
                                : readiness?.pricingReadiness?.status === 'IN_PROGRESS'
                                    ? 'IN_PROGRESS'
                                    : 'NOT_STARTED'
                        }
                        isActionable={hasSites}
                        onAction={() => hasSites && setActiveTab('PRICING')}
                    />
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
