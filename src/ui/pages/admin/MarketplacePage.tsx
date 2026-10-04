// src/ui/pages/admin/MarketplacePage.tsx
import React, { useState } from "react";
import {
    InboxStackIcon,
    BuildingStorefrontIcon,
    ClipboardDocumentCheckIcon,
    ShieldCheckIcon,
    GlobeAltIcon
} from "@heroicons/react/24/outline";
import { OrderIntakeTab } from "./OrderIntakeTab";
import { PricingSessionsTab } from "./PricingSessionsTab";
import { ProductionReadinessTab } from "./ProductionReadinessTab";
import { MarketplacePrinthouseHandoffTab } from "./MarketplacePrinthouseHandoffTab";
import { MarketplaceAuditTab } from "./MarketplaceAuditTab";
import { AutonomousMarketplaceTab } from "./AutonomousMarketplaceTab";
import { getAuthUser } from "../../lib/authStore";
import { useLocale } from "../../i18n";

type MarketplaceSubTab = "intake" | "sessions" | "readiness" | "handoff" | "capacity_auctions" | "audit";

export const MarketplacePage: React.FC = () => {
    const { t } = useLocale();
    const user = getAuthUser();
    const role = String(user?.role || user?.userRole || 'VIEWER').toUpperCase();
    const isSuperAdmin = role === 'SUPER_ADMIN' || user?.email === 'admin@printprice.pro';

    const allTabs: Array<{ id: MarketplaceSubTab; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; superAdminOnly?: boolean }> = [
        { id: "intake", label: t('marketplace.tabIntake') || "Order Intake", icon: InboxStackIcon },
        { id: "sessions", label: t('marketplace.tabSessions') || "Pricing Sessions", icon: BuildingStorefrontIcon, superAdminOnly: true },
        { id: "readiness", label: t('marketplace.tabReadiness') || "Production Readiness", icon: ClipboardDocumentCheckIcon },
        { id: "handoff", label: t('marketplace.tabHandoff') || "Printhouse Handoff", icon: ClipboardDocumentCheckIcon },
        { id: "capacity_auctions", label: t('marketplace.tabAuctions') || "Capacity Auctions", icon: GlobeAltIcon, superAdminOnly: true },
        { id: "audit", label: t('marketplace.tabAudit') || "Audit / Events", icon: ShieldCheckIcon, superAdminOnly: true },
    ];

    const visibleTabs = allTabs.filter(t => !t.superAdminOnly || isSuperAdmin);

    const [activeTab, setActiveTab] = useState<MarketplaceSubTab>("intake");

    // Guard against unauthorized forced tab state
    const effectiveTab: MarketplaceSubTab = visibleTabs.some(t => t.id === activeTab) ? activeTab : "intake";

    return (
        <div className="flex min-h-full flex-col space-y-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {t('marketplace.title') || 'Marketplace Order Intake'}
                </h1>
                <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium tracking-tight mt-1">
                    {isSuperAdmin 
                        ? (t('marketplace.subtitleSuperadmin') || "Operational intake for Budget marketplace orders, production files, pricing sessions, preflight readiness, and handoff preparation.")
                        : (t('marketplace.subtitlePrinthouse') || "Orders assigned to your printhouse from the PrintPrice marketplace, production files, preflight readiness, and handoff preparation.")}
                </p>
            </div>

            <div className="flex border-b border-slate-200 dark:border-zinc-800 gap-1 overflow-x-auto">
                {visibleTabs.map((tab) => {
                    const Icon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                                effectiveTab === tab.id
                                    ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20"
                                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900/30"
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="min-h-0 flex-1">
                {effectiveTab === "intake" && <OrderIntakeTab />}
                {effectiveTab === "sessions" && isSuperAdmin && <PricingSessionsTab />}
                {effectiveTab === "readiness" && <ProductionReadinessTab />}
                {effectiveTab === "handoff" && <MarketplacePrinthouseHandoffTab />}
                {effectiveTab === "capacity_auctions" && isSuperAdmin && <AutonomousMarketplaceTab />}
                {effectiveTab === "audit" && isSuperAdmin && <MarketplaceAuditTab />}
            </div>
        </div>
    );
};
