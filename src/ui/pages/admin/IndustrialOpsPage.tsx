// pages/admin/IndustrialOpsPage.tsx
import React, { useState } from "react";
import { 
    CircleStackIcon, 
    CpuChipIcon, 
    ShieldCheckIcon,
    BoltIcon,
    ExclamationTriangleIcon,
    ClockIcon,
    AcademicCapIcon,
    BanknotesIcon
} from "@heroicons/react/24/outline";
import { ArtifactRegistryTab } from "./ArtifactRegistryTab";
import { WorkerFleetTab } from "./WorkerFleetTab";
import { LargeDocumentTab } from "./LargeDocumentTab";
import { TenantStorageTab } from "./TenantStorageTab";
import { OrchestrationTab } from "./OrchestrationTab";
import { IncidentRegistryTab } from "./IncidentRegistryTab";
import { LifecyclePolicyTab } from "./LifecyclePolicyTab";
import { ProductionNodeRegistryTab } from "./ProductionNodeRegistryTab";
import { IndustrialLiveTab } from "./IndustrialLiveTab";
import { IndustrialIntelligenceTab } from "./IndustrialIntelligenceTab";
import { IndustrialEconomicTab } from "./IndustrialEconomicTab";
import { IndustrialGovernanceTab } from "./IndustrialGovernanceTab";
import { IndustrialTemporalTab } from "./IndustrialTemporalTab";
import { IndustrialSimulationTab } from "./IndustrialSimulationTab";
import { IndustrialMapTab } from "./IndustrialMapTab";
import { MapIcon } from "@heroicons/react/24/outline";

export const IndustrialOpsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'artifacts' | 'workers' | 'nodes' | 'live' | 'intelligence' | 'economics' | 'governance' | 'temporal' | 'simulation' | 'large-docs' | 'storage' | 'orchestration' | 'incidents' | 'lifecycle' | 'map'>('map');

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-black text-[var(--ppos-text)] tracking-tight">Industrial Operations</h1>
                    <p className="text-sm text-[var(--ppos-text-muted)] font-medium tracking-tight">High-fidelity orchestration and governance for distributed infrastructure.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-none shrink-0">
                    <div className="w-2 h-2 rounded-none bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">System Operational</span>
                </div>
            </div>

            {/* Categorized Industrial Navigation with Canonical Theme Tokens */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--ppos-surface-muted)] p-2 border border-[var(--ppos-border)] shadow-none">
                {/* Operational Group */}
                <div className="space-y-2">
                    <h3 className="px-3 text-[10px] font-black text-[var(--ppos-text-muted)] uppercase tracking-widest flex items-center gap-2">
                        <BoltIcon className="w-3 h-3" />
                        Operational
                    </h3>
                    <div className="flex flex-wrap gap-1">
                        <TabButton active={activeTab === 'live'} onClick={() => setActiveTab('live')} icon={BoltIcon} label="Live Loop" />
                        <TabButton active={activeTab === 'workers'} onClick={() => setActiveTab('workers')} icon={CpuChipIcon} label="Fleet" />
                        <TabButton active={activeTab === 'nodes'} onClick={() => setActiveTab('nodes')} icon={ShieldCheckIcon} label="Nodes" />
                        <TabButton active={activeTab === 'orchestration'} onClick={() => setActiveTab('orchestration')} icon={BoltIcon} label="Dispatch" />
                    </div>
                </div>

                {/* Intelligence Group */}
                <div className="space-y-2 border-t md:border-t-0 md:border-l border-[var(--ppos-border)] pt-2 md:pt-0 md:pl-4">
                    <h3 className="px-3 text-[10px] font-black text-[var(--ppos-text-muted)] uppercase tracking-widest flex items-center gap-2">
                        <AcademicCapIcon className="w-3 h-3" />
                        Intelligence
                    </h3>
                    <div className="flex flex-wrap gap-1">
                        <TabButton active={activeTab === 'intelligence'} onClick={() => setActiveTab('intelligence')} icon={AcademicCapIcon} label="Metrics" />
                        <TabButton active={activeTab === 'economics'} onClick={() => setActiveTab('economics')} icon={BanknotesIcon} label="Economics" />
                        <TabButton active={activeTab === 'temporal'} onClick={() => setActiveTab('temporal')} icon={ClockIcon} label="Temporal" />
                        <TabButton active={activeTab === 'simulation'} onClick={() => setActiveTab('simulation')} icon={CpuChipIcon} label="Sim" />
                        <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} icon={MapIcon} label="Live Map" />
                    </div>
                </div>

                {/* Governance Group */}
                <div className="space-y-2 border-t md:border-t-0 md:border-l border-[var(--ppos-border)] pt-2 md:pt-0 md:pl-4">
                    <h3 className="px-3 text-[10px] font-black text-[var(--ppos-text-muted)] uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheckIcon className="w-3 h-3" />
                        Governance
                    </h3>
                    <div className="flex flex-wrap gap-1">
                        <TabButton active={activeTab === 'governance'} onClick={() => setActiveTab('governance')} icon={ShieldCheckIcon} label="Policies" />
                        <TabButton active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')} icon={ExclamationTriangleIcon} label="Incidents" />
                        <TabButton active={activeTab === 'lifecycle'} onClick={() => setActiveTab('lifecycle')} icon={ClockIcon} label="Lifecycle" />
                        <TabButton active={activeTab === 'storage'} onClick={() => setActiveTab('storage')} icon={CircleStackIcon} label="Storage" />
                    </div>
                </div>
            </div>

            {/* Tab Content */}
            <div className="min-h-[500px]">
                {activeTab === 'artifacts' && <ArtifactRegistryTab />}
                {activeTab === 'large-docs' && <LargeDocumentTab />}
                {activeTab === 'workers' && <WorkerFleetTab />}
                {activeTab === 'nodes' && <ProductionNodeRegistryTab />}
                {activeTab === 'live' && <IndustrialLiveTab />}
                {activeTab === 'intelligence' && <IndustrialIntelligenceTab />}
                {activeTab === 'economics' && <IndustrialEconomicTab />}
                {activeTab === 'governance' && <IndustrialGovernanceTab />}
                {activeTab === 'temporal' && <IndustrialTemporalTab />}
                {activeTab === 'simulation' && <IndustrialSimulationTab />}
                {activeTab === 'storage' && <TenantStorageTab />}
                {activeTab === 'orchestration' && <OrchestrationTab />}
                {activeTab === 'incidents' && <IncidentRegistryTab />}
                {activeTab === 'lifecycle' && <LifecyclePolicyTab />}
                {activeTab === 'map' && <IndustrialMapTab />}
            </div>
        </div>
    );
};

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-3 py-1.5 transition-all border ${
            active 
            ? 'bg-[var(--ppos-surface)] text-[var(--ppos-text)] border-[var(--ppos-border)] font-black shadow-sm' 
            : 'text-[var(--ppos-text-muted)] border-transparent hover:text-[var(--ppos-text)] font-bold hover:bg-white/5 dark:hover:bg-white/[0.02]'
        }`}
    >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-primary dark:text-red-500' : 'text-[var(--ppos-text-muted)]'}`} />
        <span className="text-[11px] uppercase tracking-tight">{label}</span>
    </button>
);
