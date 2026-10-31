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
import { SharedModuleProps, HeaderActionGroup } from "../../components/common";

type MarketplaceSubTab = "intake" | "sessions" | "readiness" | "handoff" | "capacity_auctions" | "audit";

export const MarketplacePage: React.FC<SharedModuleProps> = ({
    mode = 'workspace',
    onNextStep
}) => {
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
        <div className="flex min-h-full flex-col space-y-6" data-testid="marketplace-workspace" data-mode={mode}>
            <HeaderActionGroup
                title={t('marketplace.title') || 'Marketplace Order Intake'}
                subtitle={
                    isSuperAdmin
                        ? (t('marketplace.subtitleSuperadmin') || "Operational intake for Budget marketplace orders, production files, pricing sessions, preflight readiness, and handoff preparation.")
                        : (t('marketplace.subtitlePrinthouse') || "Orders assigned to your printhouse from the PrintPrice marketplace, production files, preflight readiness, and handoff preparation.")
                }
                mode={mode}
                tabs={visibleTabs.map(tab => ({ id: tab.id, label: tab.label }))}
                activeTabId={effectiveTab}
                onTabChange={(id) => setActiveTab(id as MarketplaceSubTab)}
            />

            <div className="min-h-0 flex-1">
                {effectiveTab === "intake" && <OrderIntakeTab />}
                {effectiveTab === "sessions" && isSuperAdmin && <PricingSessionsTab />}
                {effectiveTab === "readiness" && <ProductionReadinessTab />}
                {effectiveTab === "handoff" && <MarketplacePrinthouseHandoffTab />}
                {effectiveTab === "capacity_auctions" && isSuperAdmin && <AutonomousMarketplaceTab />}
                {effectiveTab === "audit" && isSuperAdmin && <MarketplaceAuditTab />}
            </div>

            {mode === 'onboarding' && (
                <div data-testid="marketplace-onboarding-footer" className="flex justify-end pt-2">
                    <button
                        type="button"
                        onClick={onNextStep}
                        className="px-5 py-2 rounded-full bg-[#dc2626] hover:bg-[#e11d48] text-white text-xs font-black uppercase tracking-wider cursor-pointer"
                    >
                        Save & Continue
                    </button>
                </div>
            )}
        </div>
    );
};
