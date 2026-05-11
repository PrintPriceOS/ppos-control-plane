// pages/admin/IndustrialOpsPage.tsx
import React, { useState } from "react";
import { 
    CircleStackIcon, 
    CpuChipIcon, 
    DocumentDuplicateIcon, 
    ShieldCheckIcon,
    BoltIcon,
    ExclamationTriangleIcon,
    ClockIcon,
    AcademicCapIcon,
    BanknotesIcon,
    ShieldCheckIcon,
    CpuChipIcon
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

export const IndustrialOpsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'artifacts' | 'workers' | 'nodes' | 'live' | 'intelligence' | 'economics' | 'governance' | 'temporal' | 'simulation' | 'large-docs' | 'storage' | 'orchestration' | 'incidents' | 'lifecycle'>('live');

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Industrial Operations</h1>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">High-fidelity orchestration and governance for distributed infrastructure.</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">System Operational</span>
                </div>
            </div>

            {/* High-Fidelity Scrollable Tab Navigation */}
            <div className="relative group">
                <div className="overflow-x-auto scrollbar-hide pb-2 -mx-2 px-2">
                    <div className="flex items-center gap-1 bg-slate-100/50 p-1.5 rounded-2xl w-max border border-slate-200">
                        <TabButton 
                            active={activeTab === 'artifacts'} 
                            onClick={() => setActiveTab('artifacts')}
                            icon={CircleStackIcon}
                            label="Artifacts"
                        />
                        <TabButton 
                            active={activeTab === 'workers'} 
                            onClick={() => setActiveTab('workers')}
                            icon={CpuChipIcon}
                            label="Fleet"
                        />
                        <TabButton 
                            active={activeTab === 'nodes'} 
                            onClick={() => setActiveTab('nodes')}
                            icon={ShieldCheckIcon}
                            label="Nodes"
                        />
                        <TabButton 
                            active={activeTab === 'live'} 
                            onClick={() => setActiveTab('live')}
                            icon={BoltIcon}
                            label="Live Orchestration"
                        />
                        <TabButton 
                            active={activeTab === 'intelligence'} 
                            onClick={() => setActiveTab('intelligence')}
                            icon={AcademicCapIcon}
                            label="Intelligence"
                        />
                        <TabButton 
                            active={activeTab === 'economics'} 
                            onClick={() => setActiveTab('economics')}
                            icon={BanknotesIcon}
                            label="Economics"
                        />
                        <TabButton 
                            active={activeTab === 'governance'} 
                            onClick={() => setActiveTab('governance')}
                            icon={ShieldCheckIcon}
                            label="Governance"
                        />
                        <TabButton 
                            active={activeTab === 'temporal'} 
                            onClick={() => setActiveTab('temporal')}
                            icon={ClockIcon}
                            label="Temporal"
                        />
                        <TabButton 
                            active={activeTab === 'simulation'} 
                            onClick={() => setActiveTab('simulation')}
                            icon={CpuChipIcon}
                            label="Simulation"
                        />
                        <TabButton 
                            active={activeTab === 'orchestration'} 
                            onClick={() => setActiveTab('orchestration')}
                            icon={BoltIcon}
                            label="Orchestration"
                        />
                        <TabButton 
                            active={activeTab === 'incidents'} 
                            onClick={() => setActiveTab('incidents')}
                            icon={ExclamationTriangleIcon}
                            label="Incidents"
                        />
                        <TabButton 
                            active={activeTab === 'lifecycle'} 
                            onClick={() => setActiveTab('lifecycle')}
                            icon={ClockIcon}
                            label="Lifecycle"
                        />
                        <TabButton 
                            active={activeTab === 'large-docs'} 
                            onClick={() => setActiveTab('large-docs')}
                            icon={DocumentDuplicateIcon}
                            label="Heavy Loads"
                        />
                        <TabButton 
                            active={activeTab === 'storage'} 
                            onClick={() => setActiveTab('storage')}
                            icon={ShieldCheckIcon}
                            label="Storage"
                        />
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
            </div>
        </div>
    );
};

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            active 
            ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-black' 
            : 'text-slate-500 hover:text-slate-700 font-bold hover:bg-white/50'
        }`}
    >
        <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
        <span className="text-xs uppercase tracking-tight">{label}</span>
    </button>
);
