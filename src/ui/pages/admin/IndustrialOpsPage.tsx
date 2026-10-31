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
    BanknotesIcon,
    MapIcon
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
import { useLocale } from "../../i18n";
import { useAdminQuery } from "../../hooks/useAdminData";
import { getRoutingMap } from "../../lib/adminApi";
import { safeArray } from "../../lib/display";

export const IndustrialOpsPage: React.FC = () => {
    const { t } = useLocale();
    const [activeTab, setActiveTab] = useState<'artifacts' | 'workers' | 'nodes' | 'live' | 'intelligence' | 'economics' | 'governance' | 'temporal' | 'simulation' | 'large-docs' | 'storage' | 'orchestration' | 'incidents' | 'lifecycle' | 'map'>('map');

    const { data: mapState, status } = useAdminQuery('routing:map', getRoutingMap, 10000);
    const isLoading = status === 'loading';
    const nodes = safeArray(mapState?.nodes);
    const isOperational = nodes.length > 0;

    return (
        <div className="space-y-6 italic-text-off">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {t('industrial.title') || 'Industrial Operations'}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium tracking-tight">
                        {t('industrial.subtitle') || 'High-fidelity orchestration and governance for distributed infrastructure.'}
                    </p>
                </div>

                {/* Dynamically derived status badge */}
                <div className={`flex items-center gap-2 px-3 py-1 border rounded-none shrink-0 self-start sm:self-auto ${
                    isLoading 
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                        : isOperational 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                            : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
                }`}>
                    <div className={`w-2 h-2 rounded-none ${
                        isLoading ? 'bg-amber-500 animate-spin' : isOperational ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'
                    }`} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {isLoading 
                            ? (t('industrial.verifyingStatus') || 'Verificando Estado...')
                            : isOperational 
                                ? (t('industrial.systemOperational') || 'Sistema Operativo')
                                : (t('industrial.telemetryDegraded') || 'Telemetría Parcial')
                        }
                    </span>
                </div>
            </div>

            {/* Categorized Industrial Navigation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ppos-card p-3 border ppos-border">
                {/* Operational Group */}
                <div className="space-y-2">
                    <h3 className="px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <BoltIcon className="w-3.5 h-3.5 text-amber-500" />
                        {t('industrial.operational') || 'Operacional'}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                        <TabButton active={activeTab === 'live'} onClick={() => setActiveTab('live')} icon={BoltIcon} label={t('industrial.tabLive') || 'Bucle en Vivo'} />
                        <TabButton active={activeTab === 'workers'} onClick={() => setActiveTab('workers')} icon={CpuChipIcon} label={t('industrial.tabWorkers') || 'Flota'} />
                        <TabButton active={activeTab === 'nodes'} onClick={() => setActiveTab('nodes')} icon={ShieldCheckIcon} label={t('industrial.tabNodes') || 'Nodos'} />
                        <TabButton active={activeTab === 'orchestration'} onClick={() => setActiveTab('orchestration')} icon={BoltIcon} label={t('industrial.tabDispatch') || 'Despacho'} />
                    </div>
                </div>

                {/* Intelligence Group */}
                <div className="space-y-2 border-t md:border-t-0 md:border-l ppos-border pt-2 md:pt-0 md:pl-4">
                    <h3 className="px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <AcademicCapIcon className="w-3.5 h-3.5 text-blue-500" />
                        {t('industrial.intelligence') || 'Inteligencia'}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                        <TabButton active={activeTab === 'intelligence'} onClick={() => setActiveTab('intelligence')} icon={AcademicCapIcon} label={t('industrial.tabMetrics') || 'Métricas'} />
                        <TabButton active={activeTab === 'economics'} onClick={() => setActiveTab('economics')} icon={BanknotesIcon} label={t('industrial.tabEconomics') || 'Economía'} />
                        <TabButton active={activeTab === 'temporal'} onClick={() => setActiveTab('temporal')} icon={ClockIcon} label={t('industrial.tabTemporal') || 'Temporal'} />
                        <TabButton active={activeTab === 'simulation'} onClick={() => setActiveTab('simulation')} icon={CpuChipIcon} label={t('industrial.tabSim') || 'Simulación'} />
                        <TabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} icon={MapIcon} label={t('industrial.liveMap') || 'Mapa en Vivo'} />
                    </div>
                </div>

                {/* Governance Group */}
                <div className="space-y-2 border-t md:border-t-0 md:border-l ppos-border pt-2 md:pt-0 md:pl-4">
                    <h3 className="px-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                        {t('industrial.governance') || 'Gobernanza'}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                        <TabButton active={activeTab === 'governance'} onClick={() => setActiveTab('governance')} icon={ShieldCheckIcon} label={t('industrial.tabPolicies') || 'Políticas'} />
                        <TabButton active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')} icon={ExclamationTriangleIcon} label={t('industrial.tabIncidents') || 'Incidencias'} />
                        <TabButton active={activeTab === 'lifecycle'} onClick={() => setActiveTab('lifecycle')} icon={ClockIcon} label={t('industrial.tabLifecycle') || 'Ciclo de Vida'} />
                        <TabButton active={activeTab === 'storage'} onClick={() => setActiveTab('storage')} icon={CircleStackIcon} label={t('industrial.tabStorage') || 'Almacenamiento'} />
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
        className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors border rounded-none ${
            active
            ? 'bg-zinc-800/80 border-zinc-600 text-white font-black shadow-xs'
            : 'border-transparent text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 font-bold'
        }`}
    >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#dc0000]' : 'text-zinc-400'}`} />
        <span className="text-[11px] uppercase tracking-tight">{label}</span>
    </button>
);
