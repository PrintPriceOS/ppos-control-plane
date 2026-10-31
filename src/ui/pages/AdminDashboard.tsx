// pages/AdminDashboard.tsx
import React, { useMemo, useState } from "react";
import { t, LocaleProvider, useLocale } from "../i18n";
import { getAdminKey, setAdminKey, clearAdminKey } from "../lib/adminApi";
import { isSuperAdmin } from "../lib/authStore";
import { OverviewTab } from "./admin/OverviewTab";
import { PricingIntelligenceTab } from "./admin/PricingIntelligenceTab";
import { OffersTab } from "./admin/OffersTab";
import { MarketplacePage } from "./admin/MarketplacePage";
import { CommercialCommitmentsTab } from "./admin/CommercialCommitmentsTab";
import { AutonomousOpsTab } from "./admin/AutonomousOpsTab";
import { RoutingDecisionTab } from "./admin/RoutingDecisionTab";
import { ProductionDispatchTab } from "./admin/ProductionDispatchTab";
import { IndustrialLiveTab } from "./admin/IndustrialLiveTab";

import { FinancialOpsTab } from "./admin/FinancialOpsTab";
import TenantManagement from "./admin/TenantManagement";
import { SuccessWorkspace } from "./admin/SuccessWorkspace";
import { JobsTab } from "./admin/JobsTab";
import { ErrorsTab } from "./admin/ErrorsTab";
import { AuditTab } from "./admin/AuditTab";
import { ControlsTab } from "./admin/ControlsTab";
import { NotificationsTab } from "./admin/NotificationsTab";
import { EngagementSignalsTab } from "./admin/EngagementSignalsTab";
import { NetworkOpsTab } from "./admin/NetworkOpsTab";
import { FederatedNodesNetworkPanel } from "../components/FederatedNodesNetworkPanel";
import { ProductionNodeRegistryTab } from "./admin/ProductionNodeRegistryTab";
import { PrinthouseOnboardingPage } from "./printhouse/PrinthouseOnboardingPage";
import {
    ChartBarIcon,
    UsersIcon,
    QueueListIcon,
    ExclamationTriangleIcon,
    ShieldCheckIcon,
    WrenchScrewdriverIcon,
    ArrowPathIcon,
    ClockIcon,
    XMarkIcon,
    BookOpenIcon,
    HeartIcon,
    BanknotesIcon,
    BellIcon,
    BoltIcon,
    BuildingOfficeIcon,
    BuildingStorefrontIcon,
    CurrencyEuroIcon,
    DocumentCheckIcon,
    CpuChipIcon,
    ArrowsRightLeftIcon,
    AdjustmentsHorizontalIcon,
    TruckIcon
} from "@heroicons/react/24/outline";

type Tab = "overview" | "success" | "tenants" | "printhouses" | "onboarding" | "network" | "pricing" | "offers" | "marketplace" | "negotiations" | "routing" | "dispatch" | "execution" | "commitments" | "autonomy" | "finance" | "notifications" | "jobs" | "errors" | "audit" | "controls" | "engagement";


type Range = "24h" | "7d" | "30d";

const AdminDashboardInner: React.FC = () => {
    const { locale, setLocale, t: ctxT } = useLocale();
    const [activeTab, setActiveTab] = useState<Tab>("overview");
    const [range, setRange] = useState<Range>("24h");
    const [refresh, setRefresh] = useState<number>(0);
    const [reloadKey, setReloadKey] = useState<number>(0);
    const [isAuthorized, setIsAuthorized] = useState<boolean>(!!getAdminKey());
    const [authKey, setAuthKey] = useState<string>("");

    const handleConnect = () => {
        if (!authKey.trim()) return;
        setAdminKey(authKey.trim());
        setIsAuthorized(true);
        setReloadKey(r => r + 1); // trigger reload of all data
    };

    const handleDisconnect = () => {
        clearAdminKey();
        setIsAuthorized(false);
        setAuthKey("");
    };

    const superAdmin = isSuperAdmin();
    const tabs = useMemo(
        () =>
        ([
            ["overview", t("admin.tabs.overview" as any), ChartBarIcon],
            ["success", "Success Workspace", HeartIcon],
            ["tenants", "Tenants & Subscriptions", UsersIcon],
            ["printhouses", "Printhouses", BuildingOfficeIcon],
            ["onboarding", "Printhouse Onboarding", WrenchScrewdriverIcon],
            ["network", "Network Operations", BuildingOfficeIcon],
            ["pricing", "Pricing Intelligence", CurrencyEuroIcon],
            ["offers", "Production Offers", QueueListIcon],
            ["marketplace", "Marketplace", BuildingStorefrontIcon],
            ["routing", "Autonomous Routing", ArrowsRightLeftIcon],
            superAdmin && ["dispatch", "Production Dispatch", TruckIcon],
            superAdmin && ["execution", "Execution Loop", BoltIcon],
            superAdmin && ["commitments", "Commercial Commitments", DocumentCheckIcon],
            superAdmin && ["autonomy", "Autonomous Operations", CpuChipIcon],
            ["finance", "Financial Operations", BanknotesIcon],
            ["notifications", "Notifications", BellIcon],
            ["jobs", t("admin.tabs.jobs" as any), QueueListIcon],
            ["errors", t("admin.tabs.errors" as any), ExclamationTriangleIcon],
            ["audit", t("admin.tabs.audit" as any), ShieldCheckIcon],
            ["controls", t("admin.tabs.controls" as any), WrenchScrewdriverIcon],
            ["engagement", "Engagement", BoltIcon],
        ].filter(Boolean) as Array<[Tab, string, any]>),
        [locale, superAdmin]
    );

    if (!isAuthorized) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="max-w-3xl w-full bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/20 p-10 shadow-2xl">
                    <div className="flex flex-col items-center text-center gap-6">
                        <div className="w-16 h-16 bg-primary flex items-center justify-center">
                            <ShieldCheckIcon className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Admin Gate</h2>
                            <p className="text-sm text-slate-500 font-medium mt-2">Enter your secure API key to access control systems.</p>
                        </div>
                        <div className="w-full space-y-4">
                            <input
                                type="password"
                                className="w-full bg-slate-50 dark:bg-[#131314]/5 border border-slate-200 dark:border-white/10 px-5 py-3.5 text-center text-lg font-mono tracking-widest outline-none focus:border-primary transition-all dark:text-white"
                                placeholder="••••••••••••"
                                value={authKey}
                                onChange={(e) => setAuthKey(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                            />
                            <button
                                type="button"
                                onClick={handleConnect}
                                className="w-full py-4 bg-primary text-white font-black uppercase hover:bg-primary/90"
                            >
                                Establish Connection
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white dark:bg-[#0e0e0f]">
            <header className="sticky top-0 z-50 bg-white dark:bg-[#0e0e0f] border-b border-slate-200 dark:border-white/10 px-6 py-4 mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary flex items-center justify-center">
                        <ShieldCheckIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">
                            {t("admin.title" as any)}
                        </h1>
                        <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wider">
                            {t("admin.subtitle" as any)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white/5 p-1.5 border border-white/10">
                        <ClockIcon className="w-4 h-4 text-slate-400 ml-1" />
                        <select
                            className="bg-transparent text-sm font-medium text-white outline-none pr-4"
                            value={range}
                            onChange={(e) => setRange(e.target.value as Range)}
                        >
                            <option value="24h" className="bg-black text-white">{t("admin.range.24h" as any)}</option>
                            <option value="7d" className="bg-black text-white">{t("admin.range.7d" as any)}</option>
                            <option value="30d" className="bg-black text-white">{t("admin.range.30d" as any)}</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 bg-white/5 p-1.5 border border-white/10">
                        <ArrowPathIcon className={`w-4 h-4 text-slate-400 ml-1 ${refresh > 0 ? "animate-spin" : ""}`} />
                        <select
                            className="bg-transparent text-sm font-medium text-white outline-none pr-4"
                            value={refresh}
                            onChange={(e) => setRefresh(Number(e.target.value))}
                        >
                            <option value={0} className="bg-black text-white">{ctxT("admin.refresh.off")}</option>
                            <option value={10000} className="bg-black text-white">10s</option>
                            <option value={30000} className="bg-black text-white">30s</option>
                        </select>
                    </div>

                    {/* Language Toggle */}
                    <div className="flex items-center gap-2 bg-white/5 p-1.5 border border-white/10">
                        <span className="text-xs font-bold text-slate-400 ml-1">LA</span>
                        <select
                            className="bg-transparent text-sm font-medium text-white outline-none pr-4"
                            value={locale}
                            onChange={(e) => setLocale(e.target.value as any)}
                        >
                            <option value="en" className="bg-black text-white">EN</option>
                            <option value="es" className="bg-black text-white">ES</option>
                        </select>
                    </div>

                    <a
                        href="/admin/help"
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors border border-blue-500/20 font-black text-xs ml-2 uppercase"
                        title="Operations Knowledge Console"
                    >
                        <BookOpenIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">Help Console</span>
                    </a>

                    <button
                        type="button"
                        onClick={handleDisconnect}
                        className="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors border border-red-500/20 ml-2"
                        title="Disconnect"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <div className="max-w-[1800px] mx-auto px-6 pb-12">
                <div className="overflow-x-auto pb-4 -mb-4 scrollbar-hide">
                    <nav className="flex gap-1 bg-slate-50 dark:bg-[#131314]/5 p-1 mb-8 w-fit border border-slate-200 dark:border-white/10 transition-all duration-300 whitespace-nowrap">
                        {tabs.map(([id, label, Icon]) => (
                            <button
                                key={id}
                                type="button"
                                className={[
                                    activeTab === id
                                        ? "btn-tab btn-tab-active"
                                        : "btn-tab",
                                ].join(" ")}
                                onClick={() => setActiveTab(id)}
                            >
                                <Icon className={`w-4 h-4 ${activeTab === id ? "text-primary" : "text-slate-400"}`} />
                                {label}
                            </button>
                        ))}
                    </nav>
                </div>

                <main className="bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 p-6 relative">
                    <div className="relative z-10">
                        {activeTab === "overview" && <OverviewTab key={`overview-${reloadKey}`} range={range} refreshMs={refresh} />}
                        {activeTab === "success" && <SuccessWorkspace key={`success-${reloadKey}`} />}
                        {activeTab === "tenants" && <TenantManagement key={`tenants-${reloadKey}`} />}
                        {activeTab === "printhouses" && <ProductionNodeRegistryTab key={`printhouses-${reloadKey}`} />}
                        {activeTab === "onboarding" && <PrinthouseOnboardingPage key={`onboarding-${reloadKey}`} />}
                        {activeTab === "network" && (
                            <div className="space-y-6">
                                <FederatedNodesNetworkPanel />
                                <NetworkOpsTab key={`network-${reloadKey}`} />
                            </div>
                        )}
                        {activeTab === "pricing" && <PricingIntelligenceTab key={`pricing-${reloadKey}`} />}
                        {activeTab === "offers" && <OffersTab key={`offers-${reloadKey}`} />}
                        {activeTab === "marketplace" && <MarketplacePage key={`marketplace-${reloadKey}`} />}
                        {activeTab === "commitments" && <CommercialCommitmentsTab key={`commitments-${reloadKey}`} />}
                        {activeTab === "routing" && <RoutingDecisionTab key={`routing-${reloadKey}`} />}
                        {activeTab === "dispatch" && <ProductionDispatchTab key={`dispatch-${reloadKey}`} />}
                        {activeTab === "execution" && <IndustrialLiveTab key={`execution-${reloadKey}`} />}
                        {activeTab === "autonomy" && <AutonomousOpsTab key={`autonomy-${reloadKey}`} />}


                        {activeTab === "finance" && <FinancialOpsTab key={`finance-${reloadKey}`} />}
                        {activeTab === "notifications" && <NotificationsTab key={`notifications-${reloadKey}`} refreshMs={refresh} />}
                        {activeTab === "jobs" && <JobsTab key={`jobs-${reloadKey}`} refreshMs={refresh} />}
                        {activeTab === "errors" && <ErrorsTab key={`errors-${reloadKey}`} range={range} refreshMs={refresh} />}
                        {activeTab === "audit" && <AuditTab key={`audit-${reloadKey}`} refreshMs={refresh} />}
                        {activeTab === "controls" && <ControlsTab key={`controls-${reloadKey}`} refreshMs={refresh} />}
                        {activeTab === "engagement" && <EngagementSignalsTab key={`engagement-${reloadKey}`} />}
                    </div>
                </main>
            </div>
        </div>
    );
};

export const AdminDashboard: React.FC = () => {
    return (
        <LocaleProvider>
            <AdminDashboardInner />
        </LocaleProvider>
    );
};
