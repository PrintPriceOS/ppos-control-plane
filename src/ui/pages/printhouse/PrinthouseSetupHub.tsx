/**
 * src/ui/pages/printhouse/PrinthouseSetupHub.tsx
 * 
 * Phase 191C/D / Phase 192 RC19 / Redesign — Canonical Printhouse Setup Hub Page.
 * 
 * Compact, continuous workspace for progressive Printhouse onboarding:
 * - Collapsible navigation with active section indicator & persistent state.
 * - Compact setup header with current section, progress and Help search.
 * - AI Pricing Calibration Assistant as primary pricing experience, with 1-click manual toggle.
 * - Drawers for secondary details and quote evidence review.
 * - Searchable contextual help modal and interactive spotlight tutorial.
 * - Preserves every existing deep link (?tab=PRICING) and backend contract.
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
import { SetupHelpModal } from '../../components/printhouse/setup/SetupHelpModal';
import { GuidedTutorialOverlay } from '../../components/printhouse/setup/GuidedTutorialOverlay';
import { getAuthToken } from '../../lib/authStore';
import { useLocale } from '../../i18n';
import {
    Building2, Factory, Cog, Shield, RefreshCw, Layers, Activity,
    Clock, Tag, Truck, Cpu, CheckCircle2, AlertTriangle, Search,
    Compass, ArrowRight, HelpCircle, ChevronRight, Sliders, ChevronDown
} from 'lucide-react';

export type TabKey = 'OVERVIEW' | 'COMPANY' | 'SITES' | 'MACHINES' | 'CAPABILITIES' | 'MATERIALS' | 'CAPACITY' | 'LEAD_TIMES' | 'PRICING' | 'SHIPPING' | 'INTEGRATIONS' | 'MARKETPLACE';

export const PrinthouseSetupHub: React.FC = () => {
    const { t, locale, setLocale } = useLocale();
    const [searchParams, setSearchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [onboardingData, setOnboardingData] = useState<any>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Deep link synchronization
    const initialTab = (searchParams.get('tab') || 'OVERVIEW').toUpperCase() as TabKey;
    const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

    // Help Search & Tutorial Modals
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isTutorialOpen, setIsTutorialOpen] = useState(false);

    // Mobile/collapsed menu switcher state
    const [sectionsDropdownOpen, setSectionsDropdownOpen] = useState(false);

    // Listen to query param changes (browser back/forward)
    useEffect(() => {
        const queryTab = (searchParams.get('tab') || 'OVERVIEW').toUpperCase() as TabKey;
        if (queryTab !== activeTab) {
            setActiveTab(queryTab);
        }
    }, [searchParams]);

    const handleSelectTab = (tab: TabKey) => {
        setActiveTab(tab);
        setSearchParams(tab === 'OVERVIEW' ? {} : { tab });
        setSectionsDropdownOpen(false);
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
                // [TEMPORARY_DEV_BYPASS]: Fallback only in Vite development on localhost
                if (import.meta.env?.DEV && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                    setOnboardingData({
                        company: { companyName: 'Imprenta Demo Local', country: 'ES', city: 'Madrid' },
                        sites: [{ siteId: 'site-demo-1', name: 'Planta Principal', city: 'Madrid' }],
                        readiness: {
                            accountSetup: { status: 'COMPLETE' },
                            operationalReadiness: { machineCount: 2, capabilityCount: 5, materialCount: 8, capacityCount: 1, leadTimesCount: 1 },
                            pricingReadiness: { status: 'NOT_STARTED' }
                        }
                    });
                } else {
                    setFetchError(data.error?.message || 'Unable to load printhouse readiness data.');
                }
            }
        } catch (err: any) {
            console.error('Error fetching onboarding data:', err);
            // [TEMPORARY_DEV_BYPASS]: Fallback only in Vite development on localhost
            if (import.meta.env?.DEV && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                setOnboardingData({
                    company: { companyName: 'Imprenta Demo Local', country: 'ES', city: 'Madrid' },
                    sites: [{ siteId: 'site-demo-1', name: 'Planta Principal', city: 'Madrid' }],
                    readiness: {
                        accountSetup: { status: 'COMPLETE', completedRequirements: 6, totalRequirements: 6 },
                        operationalConfiguration: { status: 'IN_PROGRESS', completedRequirements: 3, totalRequirements: 5, machineCount: 2, capabilityCount: 5, materialCount: 8, capacityCount: 0, leadTimesCount: 0 },
                        operationalReadiness: { machineCount: 2, capabilityCount: 5, materialCount: 8, capacityCount: 0, leadTimesCount: 0 },
                        pricingReadiness: { status: 'NOT_STARTED' }
                    }
                });
            } else {
                setFetchError('Connection error while fetching readiness.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOnboardingData();
    }, []);

    // Open Help search with target tab and field
    const handleSelectHelpTarget = (tab: string, fieldId?: string) => {
        handleSelectTab(tab as TabKey);
        if (fieldId) {
            setTimeout(() => {
                const el = document.getElementById(fieldId) || document.querySelector(`[data-target-id="${fieldId}"]`);
                if (el) {
                    if (typeof el.scrollIntoView === 'function') {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    if (typeof (el as HTMLElement).focus === 'function') {
                        (el as HTMLElement).focus();
                    }
                    el.classList.add('ring-2', 'ring-[#dc0000]', 'ring-offset-2');
                    setTimeout(() => {
                        el.classList.remove('ring-2', 'ring-[#dc0000]', 'ring-offset-2');
                    }, 2500);
                }
            }, 300);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <RefreshCw size={32} className="animate-spin text-[#dc0000]" />
                    <span className="text-xs font-semibold text-zinc-500">Loading Printhouse Setup Workspace…</span>
                </div>
            </div>
        );
    }

    const company = onboardingData?.company;
    const sites = onboardingData?.sites || [];
    const readiness = onboardingData?.readiness;

    const companyStatus = readiness?.accountSetup?.status === 'COMPLETE' ? 'COMPLETE' : company?.companyName ? 'IN_PROGRESS' : 'NOT_STARTED';
    const sitesStatus = sites.some((s: any) => s.city && s.city !== 'Pending Setup') ? 'COMPLETE' : sites.length > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';

    const opsReadiness = readiness?.operationalReadiness || {};
    const opsConfig = readiness?.operationalConfiguration || {};

    const machineCount = opsConfig.machineCount !== undefined ? opsConfig.machineCount : (opsReadiness.machineCount || 0);
    const capabilityCount = opsConfig.capabilityCount !== undefined ? opsConfig.capabilityCount : (opsReadiness.capabilityCount || 0);
    const materialCount = opsConfig.materialCount !== undefined ? opsConfig.materialCount : (opsReadiness.materialCount || 0);
    const capacityCount = opsConfig.capacityCount !== undefined ? opsConfig.capacityCount : (opsReadiness.capacityCount || 0);
    const leadTimesCount = opsConfig.leadTimesCount !== undefined ? opsConfig.leadTimesCount : (opsReadiness.leadTimesCount || 0);

    const machinesStatus = (readiness?.machines?.status) || (machineCount > 0 ? 'COMPLETE' : 'NOT_STARTED');
    const capabilitiesStatus = (readiness?.capabilities?.status) || (capabilityCount > 0 ? 'COMPLETE' : 'NOT_STARTED');
    const materialsStatus = (readiness?.substrates?.status) || (readiness?.materials?.status) || (materialCount > 0 ? 'COMPLETE' : 'NOT_STARTED');
    const capacityStatus = (readiness?.capacity?.status) || (capacityCount > 0 ? 'COMPLETE' : 'NOT_STARTED');
    const leadTimesStatus = (readiness?.leadTimes?.status) || (leadTimesCount > 0 ? 'COMPLETE' : 'NOT_STARTED');
    const pricingStatus = readiness?.pricingReadiness?.status === 'COMPLETE' || readiness?.pricing?.status === 'COMPLETE'
        ? 'COMPLETE'
        : readiness?.pricingReadiness?.status === 'IN_PROGRESS' || readiness?.pricing?.status === 'IN_PROGRESS'
            ? 'IN_PROGRESS'
            : 'NOT_STARTED';

    // Map sites for child panels
    const siteOptions = sites.map((s: any) => ({ siteId: s.siteId, siteName: s.siteName || s.siteId }));
    const hasSites = sites.length > 0;
    const hasMachines = machineCount > 0;

    // Missing requirements filtering from backend blocking issues & advisories
    const accountBlockers = (readiness?.accountSetup?.blockingIssues || []).concat(readiness?.accountSetup?.advisories || []);
    const opsBlockers = (opsConfig.blockingIssues || []).concat(opsConfig.advisories || []);

    const extractBlockers = (directBlockers: any, generalBlockers: any[], moduleName?: string) => {
        const direct = Array.isArray(directBlockers) 
            ? directBlockers.map((b: any) => typeof b === 'string' ? b : (b.message || b.code))
            : [];
        const general = moduleName
            ? generalBlockers
                .filter((b: any) => b.module === moduleName)
                .map((b: any) => b.message || b.code)
            : [];
        return direct.concat(general).filter(Boolean);
    };

    const companyMissing = extractBlockers(readiness?.company?.blockers, accountBlockers, 'COMPANY_PROFILE');
    const sitesMissing = extractBlockers(readiness?.sites?.blockers, accountBlockers, 'PRODUCTION_SITES');
    const machinesMissing = extractBlockers(readiness?.machines?.blockers, opsBlockers, 'MACHINES');
    const capabilitiesMissing = extractBlockers(readiness?.capabilities?.blockers, opsBlockers, 'CAPABILITIES');
    const materialsMissing = extractBlockers(readiness?.materials?.blockers || readiness?.substrates?.blockers, opsBlockers, 'MATERIALS');
    const capacityMissing = extractBlockers(readiness?.capacity?.blockers, opsBlockers, 'CAPACITY');
    const leadTimesMissing = extractBlockers(readiness?.leadTimes?.blockers, opsBlockers, 'LEAD_TIMES');

    const pricingBlockers = (readiness?.pricingReadiness?.blockingIssues || []).concat(readiness?.pricingReadiness?.advisories || []);
    const pricingDirect = extractBlockers(readiness?.pricing?.blockers, pricingBlockers);
    const pricingMissing = readiness?.pricingReadiness?.status !== 'COMPLETE' && readiness?.pricing?.status !== 'COMPLETE'
        ? (pricingDirect.length > 0 
            ? pricingDirect 
            : ['Configure and save industrial manufacturing rates'])
        : [];

    const tabDefs: { key: TabKey; label: string; icon: React.ReactNode; enabled: boolean; status: string }[] = [
        { key: 'OVERVIEW', label: t('setup.tabs.overview'), icon: null, enabled: true, status: 'INFO' },
        { key: 'COMPANY', label: t('setup.tabs.company'), icon: <Building2 size={16} />, enabled: true, status: companyStatus },
        { key: 'SITES', label: t('setup.tabs.sites'), icon: <Factory size={16} />, enabled: true, status: sitesStatus },
        { key: 'MACHINES', label: t('setup.tabs.machines'), icon: <Cog size={16} />, enabled: hasSites, status: machinesStatus },
        { key: 'CAPABILITIES', label: t('setup.tabs.capabilities'), icon: <Shield size={16} />, enabled: hasSites && hasMachines, status: capabilitiesStatus },
        { key: 'MATERIALS', label: t('setup.tabs.materials'), icon: <Layers size={16} />, enabled: hasSites, status: materialsStatus },
        { key: 'CAPACITY', label: t('setup.tabs.capacity'), icon: <Activity size={16} />, enabled: hasSites, status: capacityStatus },
        { key: 'LEAD_TIMES', label: t('setup.tabs.leadTimes'), icon: <Clock size={16} />, enabled: hasSites, status: leadTimesStatus },
        { key: 'PRICING', label: t('setup.tabs.pricing'), icon: <Tag size={16} />, enabled: hasSites, status: pricingStatus },
        { key: 'SHIPPING', label: t('setup.tabs.shipping'), icon: <Truck size={16} />, enabled: hasSites, status: 'INFO' },
        { key: 'INTEGRATIONS', label: t('setup.tabs.integrations'), icon: <Cpu size={16} />, enabled: true, status: 'INFO' },
        { key: 'MARKETPLACE', label: t('setup.tabs.marketplace'), icon: <CheckCircle2 size={16} />, enabled: true, status: 'INFO' },
    ];

    // Next incomplete step calculation - canonical single source of truth for banner, CTA and card highlight
    const getNextRecommendedStep = (): { tab: TabKey; label: string; actionLabel: string; reason: string } => {
        if (companyStatus !== 'COMPLETE') {
            return {
                tab: 'COMPANY',
                label: t('setup.tabs.company'),
                actionLabel: t('setup.cta.configureCompany') || 'Configure Company Profile',
                reason: t('setup.nextStep.company')
            };
        }
        if (sitesStatus !== 'COMPLETE') {
            return {
                tab: 'SITES',
                label: t('setup.tabs.sites'),
                actionLabel: t('setup.cta.addSite') || 'Add Production Site',
                reason: t('setup.nextStep.sites')
            };
        }
        if (machinesStatus !== 'COMPLETE') {
            return {
                tab: 'MACHINES',
                label: t('setup.tabs.machines'),
                actionLabel: t('setup.cta.configureMachines') || 'Configure Machinery Fleet',
                reason: t('setup.nextStep.machines')
            };
        }
        if (capabilitiesStatus !== 'COMPLETE') {
            return {
                tab: 'CAPABILITIES',
                label: t('setup.tabs.capabilities'),
                actionLabel: t('setup.cta.configureCapabilities') || 'Set Machine Capabilities',
                reason: t('setup.nextStep.capabilities')
            };
        }
        if (materialsStatus !== 'COMPLETE') {
            return {
                tab: 'MATERIALS',
                label: t('setup.tabs.materials'),
                actionLabel: t('setup.cta.configureMaterials') || 'Add Materials to Catalog',
                reason: t('setup.nextStep.materials')
            };
        }
        if (capacityStatus !== 'COMPLETE') {
            return {
                tab: 'CAPACITY',
                label: t('setup.tabs.capacity'),
                actionLabel: t('setup.cta.configureCapacity') || 'Configure Production Capacity',
                reason: t('setup.nextStep.capacity') || 'Shift schedules, working calendar and daily throughput limits required'
            };
        }
        if (leadTimesStatus !== 'COMPLETE') {
            return {
                tab: 'LEAD_TIMES',
                label: t('setup.tabs.leadTimes'),
                actionLabel: t('setup.cta.configureLeadTimes') || 'Set Lead Times & SLAs',
                reason: t('setup.nextStep.leadTimes') || 'Daily order cut-off times and turnaround SLAs required for scheduling'
            };
        }
        if (pricingStatus !== 'COMPLETE') {
            return {
                tab: 'PRICING',
                label: t('setup.tabs.pricing'),
                actionLabel: t('setup.cta.configurePricing') || 'Configure Industrial Rates',
                reason: t('setup.nextStep.pricing')
            };
        }
        return {
            tab: 'MARKETPLACE',
            label: t('setup.tabs.marketplace'),
            actionLabel: t('setup.cta.reviewMarketplace') || 'Review Marketplace Readiness',
            reason: t('setup.nextStep.marketplace')
        };
    };

    const nextStep = getNextRecommendedStep();
    const activeDef = tabDefs.find(t => t.key === activeTab) || tabDefs[0];

    return (
        <div className="w-full max-w-[1440px] mx-auto py-2 px-3 sm:px-5 text-zinc-900 dark:text-zinc-100 transition-colors space-y-2">
            {/* 1. Setup Toolbar (One Compact Toolbar) */}
            <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 shadow-2xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#dc0000] dark:text-red-400 shrink-0">
                        {t('onboarding.title') || 'Setup'}
                    </span>
                    <ChevronRight size={13} className="text-zinc-400 shrink-0" />
                    <h1 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white leading-tight break-words m-0">
                        {activeDef.label}
                    </h1>
                    {activeDef.status === 'COMPLETE' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1 shrink-0">
                            <CheckCircle2 size={11} /> {t('setup.tabs.completeBadge')}
                        </span>
                    )}
                </div>

                {/* Header Action Controls */}
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                    {/* Setup Sections Switcher for Mobile & Collapsed Sidebar */}
                    <div className="relative">
                        <button
                            id="setup-module-switcher"
                            type="button"
                            onClick={() => setSectionsDropdownOpen(!sectionsDropdownOpen)}
                            className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                            <span>{t('onboarding.sections') || 'Setup Sections'}</span>
                            <ChevronDown size={14} className={sectionsDropdownOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>

                        {sectionsDropdownOpen && (
                            <div id="setup-sections-menu" className="absolute right-0 top-full mt-1.5 w-60 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-[65] p-1 space-y-0.5 animate-in zoom-in-95 duration-100">
                                {tabDefs.map(tab => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => handleSelectTab(tab.key)}
                                        disabled={!tab.enabled}
                                        className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg flex items-center justify-between transition-colors ${
                                            activeTab === tab.key
                                                ? 'bg-[#dc0000] text-white'
                                                : tab.enabled
                                                ? 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                : 'text-zinc-400 opacity-50 cursor-not-allowed'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {tab.icon}
                                            <span>{tab.label}</span>
                                        </div>
                                        {tab.status === 'COMPLETE' && <CheckCircle2 size={12} className={activeTab === tab.key ? 'text-white' : 'text-emerald-500'} />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Find Setting / Contextual Help */}
                    <button
                        id="setup-help-search-btn"
                        type="button"
                        onClick={() => setIsHelpOpen(true)}
                        className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                        <Search size={14} className="text-[#dc0000]" />
                        <span>{t('onboarding.findSettingOrHelp') || 'Find a setting / Help'}</span>
                    </button>

                    {/* Optional Guided Tutorial */}
                    <button
                        id="setup-guide-me-btn"
                        type="button"
                        onClick={() => setIsTutorialOpen(true)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-[#dc0000] dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <Compass size={14} />
                        <span>{t('onboarding.guideMe') || 'Guide Me'}</span>
                    </button>

                    {/* Language Switcher (EN -> ES -> DE) */}
                    <button
                        id="setup-lang-switcher"
                        type="button"
                        onClick={() => {
                            const nextLoc = locale === 'en' ? 'es' : locale === 'es' ? 'de' : 'en';
                            setLocale(nextLoc);
                        }}
                        aria-label={`Switch language (current: ${locale.toUpperCase()})`}
                        title={t('topbar.toggleLanguage', { lang: locale.toUpperCase() }) || `Switch language (current: ${locale.toUpperCase()})`}
                        className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                    >
                        {locale.toUpperCase()}
                    </button>
                </div>
            </div>

            {/* Contextual Action Banner (Next Incomplete Task) */}
            {activeTab === 'OVERVIEW' && nextStep && (
                <div className="bg-gradient-to-r from-red-50/70 via-white to-zinc-50 dark:from-red-950/30 dark:via-[#18181b] dark:to-zinc-900/40 border border-red-200 dark:border-red-900/50 rounded-xl px-3 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#dc0000] dark:text-red-400 bg-red-100 dark:bg-red-950 px-2 py-0.5 rounded border border-red-200 dark:border-red-800 shrink-0">
                            {t('onboarding.nextAction') || 'Recommended Action'}
                        </span>
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white m-0 shrink-0">
                            {nextStep.label}
                        </h4>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 m-0 truncate">
                            {nextStep.reason}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => handleSelectTab(nextStep.tab)}
                        className="px-3.5 py-1.5 bg-[#dc0000] hover:bg-red-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                    >
                        <span>{nextStep.actionLabel || t('onboarding.continueSetup') || 'Continue Setup'}</span>
                        <ArrowRight size={13} />
                    </button>
                </div>
            )}

            {/* Error Notification */}
            {fetchError && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 p-2.5 sm:px-3 rounded-xl flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
                        <span className="text-xs font-medium">{fetchError}</span>
                    </div>
                    <button
                        onClick={fetchOnboardingData}
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-2.5 py-1 rounded-lg text-xs transition-colors shrink-0 shadow-xs cursor-pointer"
                    >
                        {t('setup.error.retryLoading')}
                    </button>
                </div>
            )}

            {/* Readiness Summary in Overview */}
            {activeTab === 'OVERVIEW' && (
                <SetupProgressSummary readiness={readiness} />
            )}

            {/* Active Workspace View: Mounted cleanly without vertical stacking */}
            <main className="min-w-0" id="onboarding-main-content">
                {activeTab === 'OVERVIEW' && (
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                            {t('setup.overview.modulesHeading')}
                        </h2>
                        <div data-testid="setup-modules-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
                            <SetupModuleCard
                                moduleNumber={1}
                                title={t('setup.overview.module1.title')}
                                icon={<Building2 size={32} className="w-8 h-8 shrink-0" />}
                                description={t('setup.overview.module1.desc')}
                                status={companyStatus}
                                isActionable={true}
                                isRecommended={nextStep.tab === 'COMPANY'}
                                missingRequirements={companyMissing}
                                onAction={() => handleSelectTab('COMPANY')}
                            />

                            <SetupModuleCard
                                moduleNumber={2}
                                title={t('setup.overview.module2.title')}
                                icon={<Factory size={32} className="w-8 h-8 shrink-0" />}
                                description={t('setup.overview.module2.desc')}
                                status={sitesStatus}
                                isActionable={true}
                                isRecommended={nextStep.tab === 'SITES'}
                                missingRequirements={sitesMissing}
                                onAction={() => handleSelectTab('SITES')}
                            />

                            <SetupModuleCard
                                moduleNumber={3}
                                title={t('setup.overview.module3.title')}
                                icon={<Cog size={32} className="w-8 h-8 shrink-0" />}
                                description={t('setup.overview.module3.desc')}
                                status={machinesStatus}
                                isActionable={hasSites}
                                isRecommended={nextStep.tab === 'MACHINES'}
                                dependencyHint={t('setup.module.requiresSites')}
                                missingRequirements={machinesMissing}
                                onAction={() => handleSelectTab('MACHINES')}
                                onResolveDependency={() => handleSelectTab('SITES')}
                            />

                            <SetupModuleCard
                                moduleNumber={4}
                                title={t('setup.overview.module4.title')}
                                icon={<Shield size={32} className="w-8 h-8 shrink-0" />}
                                description={t('setup.overview.module4.desc')}
                                status={capabilitiesStatus}
                                isActionable={hasSites && hasMachines}
                                isRecommended={nextStep.tab === 'CAPABILITIES'}
                                dependencyHint={!hasSites ? t('setup.module.requiresSites') : t('setup.module.requiresMachines')}
                                missingRequirements={capabilitiesMissing}
                                onAction={() => handleSelectTab('CAPABILITIES')}
                                onResolveDependency={() => !hasSites ? handleSelectTab('SITES') : handleSelectTab('MACHINES')}
                            />

                            <SetupModuleCard
                                moduleNumber={5}
                                title={t('setup.overview.module5.title')}
                                icon={<Layers size={32} className="w-8 h-8 shrink-0" />}
                                description={t('setup.overview.module5.desc')}
                                status={materialsStatus}
                                isActionable={hasSites}
                                isRecommended={nextStep.tab === 'MATERIALS'}
                                dependencyHint={t('setup.module.requiresSites')}
                                missingRequirements={materialsMissing}
                                onAction={() => handleSelectTab('MATERIALS')}
                                onResolveDependency={() => handleSelectTab('SITES')}
                            />

                            <SetupModuleCard
                                moduleNumber={6}
                                title={t('setup.overview.module6.title')}
                                icon={<Activity size={32} className="w-8 h-8 shrink-0" />}
                                description={t('setup.overview.module6.desc')}
                                status={capacityStatus}
                                isActionable={hasSites}
                                isRecommended={nextStep.tab === 'CAPACITY'}
                                dependencyHint={t('setup.module.requiresSites')}
                                missingRequirements={capacityMissing}
                                onAction={() => handleSelectTab('CAPACITY')}
                                onResolveDependency={() => handleSelectTab('SITES')}
                            />

                            <SetupModuleCard
                                moduleNumber={7}
                                title={t('setup.overview.module7.title')}
                                icon={<Clock size={32} className="w-8 h-8 shrink-0" />}
                                description={t('setup.overview.module7.desc')}
                                status={leadTimesStatus}
                                isActionable={hasSites}
                                isRecommended={nextStep.tab === 'LEAD_TIMES'}
                                dependencyHint={t('setup.module.requiresSites')}
                                missingRequirements={leadTimesMissing}
                                onAction={() => handleSelectTab('LEAD_TIMES')}
                                onResolveDependency={() => handleSelectTab('SITES')}
                            />

                            <SetupModuleCard
                                moduleNumber={8}
                                title={t('setup.overview.module8.title')}
                                icon={<Tag size={32} className="w-8 h-8 shrink-0" />}
                                description={t('setup.overview.module8.desc')}
                                status={pricingStatus}
                                isActionable={hasSites}
                                isRecommended={nextStep.tab === 'PRICING'}
                                dependencyHint={t('setup.module.requiresSites')}
                                missingRequirements={pricingMissing}
                                onAction={() => handleSelectTab('PRICING')}
                                onResolveDependency={() => handleSelectTab('SITES')}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'COMPANY' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.company') || 'Company Profile'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.companyDesc') || 'Legal company identity, primary country, tax/VAT identifier, and administrative contact.'}
                            </p>
                        </div>
                        <CompanyProfileForm companyData={company} onSaved={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'SITES' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.sites') || 'Production Sites'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.sitesDesc') || 'Physical printing plants, operating addresses, city location, and facility timezone.'}
                            </p>
                        </div>
                        <ProductionSitesPanel sites={sites} onSaved={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'MACHINES' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.machines') || 'Machinery Fleet'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.machinesDesc') || 'Offset presses, digital devices, cutting tables, binders, and finishing equipment.'}
                            </p>
                        </div>
                        <MachineFleetPanel sites={siteOptions} onSaved={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'CAPABILITIES' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.capabilities') || 'Machine Capabilities'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.capabilitiesDesc') || 'Color management (CMYK, Spot UV, White Ink), maximum sheet dimensions, and PDF/X specs.'}
                            </p>
                        </div>
                        <CapabilitiesPanel sites={siteOptions} />
                    </div>
                )}

                {activeTab === 'MATERIALS' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.materials') || 'Materials & Paper'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.materialsDesc') || 'Substrate catalog, paper grammages, sheet sizes, and finishing compatibility.'}
                            </p>
                        </div>
                        <MaterialsPanel sites={siteOptions} onSaved={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'CAPACITY' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.capacity') || 'Production Capacity'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.capacityDesc') || 'Daily throughput constraints, shift schedules, working calendar, and job allocations.'}
                            </p>
                        </div>
                        <CapacityPanel sites={siteOptions} onSaved={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'LEAD_TIMES' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.leadTimes') || 'Lead Times & SLAs'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.leadTimesDesc') || 'Site-level daily cut-off times, timezone cut-offs, turnaround SLAs, and completion schedules.'}
                            </p>
                        </div>
                        <LeadTimesPanel sites={siteOptions} onSaved={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'PRICING' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.pricing') || 'Industrial Pricing & Rates'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.pricingDesc') || 'Base manufacturing rates, paper kg costs, binding operations, and transport rates.'}
                            </p>
                        </div>
                        <PricingPanel sites={siteOptions} onSaved={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'SHIPPING' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.shipping') || 'Shipping & Logistics'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.shippingDesc') || 'Carriers, packaging options, freight rate calculation tables, and delivery tracking.'}
                            </p>
                        </div>
                        <ShippingPanel siteId={siteOptions[0]?.siteId} onSaveSuccess={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'INTEGRATIONS' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.integrations') || 'Integrations & Webhooks'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.integrationsDesc') || 'Industrial MIS/ERP bridges, JDF/JMF shopfloor automation and outward webhooks.'}
                            </p>
                        </div>
                        <IntegrationsPanel siteId={siteOptions[0]?.siteId} onSaveSuccess={fetchOnboardingData} />
                    </div>
                )}

                {activeTab === 'MARKETPLACE' && (
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5">
                            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                                {t('setup.section.marketplace') || 'Marketplace Readiness'}
                            </h2>
                            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                                {t('setup.section.marketplaceDesc') || 'Review qualification criteria, publish capacity to the budget network, and start receiving orders.'}
                            </p>
                        </div>
                        <MarketplaceReadinessPanel onSaved={fetchOnboardingData} />
                    </div>
                )}
            </main>

            {/* Contextual Help & Setting Search Modal */}
            <SetupHelpModal
                isOpen={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
                onSelectTarget={handleSelectHelpTarget}
            />

            {/* Interactive Spotlight Tutorial Overlay */}
            <GuidedTutorialOverlay
                isOpen={isTutorialOpen}
                onClose={() => setIsTutorialOpen(false)}
                activeTab={activeTab}
                onNavigateToTab={(tab) => handleSelectTab(tab as TabKey)}
                onOpenSectionsMenu={() => setSectionsDropdownOpen(true)}
                onActivateAssistant={() => {
                    handleSelectTab('PRICING');
                    const btn = document.querySelector<HTMLElement>('#pricing-mode-assistant-btn');
                    btn?.click();
                }}
                onSwitchToManual={() => {
                    handleSelectTab('PRICING');
                    const btn = document.querySelector<HTMLElement>('#pricing-mode-manual-btn');
                    btn?.click();
                }}
                onOpenHelpSearch={() => setIsHelpOpen(true)}
            />
        </div>
    );
};
