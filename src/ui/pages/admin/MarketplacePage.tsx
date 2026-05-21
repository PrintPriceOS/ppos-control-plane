// src/ui/pages/admin/MarketplacePage.tsx
import React, { useState } from "react";
import {
    InboxStackIcon,
    BuildingStorefrontIcon,
    ClipboardDocumentCheckIcon,
    ShieldCheckIcon
} from "@heroicons/react/24/outline";
import { OrderIntakeTab } from "./OrderIntakeTab";
import { PricingSessionsTab } from "./PricingSessionsTab";
import { ProductionReadinessTab } from "./ProductionReadinessTab";
import { MarketplacePrinthouseHandoffTab } from "./MarketplacePrinthouseHandoffTab";
import { MarketplaceAuditTab } from "./MarketplaceAuditTab";

type MarketplaceSubTab = "intake" | "sessions" | "readiness" | "handoff" | "audit";

export const MarketplacePage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<MarketplaceSubTab>("intake");

    const tabs: Array<{ id: MarketplaceSubTab; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }> = [
        { id: "intake", label: "Order Intake", icon: InboxStackIcon },
        { id: "sessions", label: "Pricing Sessions", icon: BuildingStorefrontIcon },
        { id: "readiness", label: "Production Readiness", icon: ClipboardDocumentCheckIcon },
        { id: "handoff", label: "Printhouse Handoff", icon: ClipboardDocumentCheckIcon },
        { id: "audit", label: "Audit / Events", icon: ShieldCheckIcon },
    ];

    return (
        <div className="flex min-h-full flex-col space-y-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase">
                    Marketplace Order Intake
                </h1>
                <p className="text-sm text-slate-500 font-medium tracking-tight mt-1">
                    Operational intake for Budget marketplace orders, production files, preflight readiness and handoff preparation.
                </p>
            </div>

            <div className="flex border-b border-slate-200 dark:border-white/10 gap-1 overflow-x-auto">
                {tabs.map((tab) => {
                    const Icon = tab.icon;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                                activeTab === tab.id
                                    ? "border-primary text-primary bg-primary/5"
                                    : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5"
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="min-h-0 flex-1">
                {activeTab === "intake" && <OrderIntakeTab />}
                {activeTab === "sessions" && <PricingSessionsTab />}
                {activeTab === "readiness" && <ProductionReadinessTab />}
                {activeTab === "handoff" && <MarketplacePrinthouseHandoffTab />}
                {activeTab === "audit" && <MarketplaceAuditTab />}
            </div>
        </div>
    );
};
