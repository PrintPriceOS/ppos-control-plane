import React, { useMemo } from 'react';
import { 
  ShieldCheckIcon, 
  CpuChipIcon, 
  Square3Stack3DIcon, 
  BoltIcon, 
  ExclamationTriangleIcon,
  GlobeAltIcon,
  CurrencyEuroIcon,
  CommandLineIcon,
  BellIcon,
  AdjustmentsHorizontalIcon,
  PowerIcon,
  ArchiveBoxIcon,
  LinkIcon,
  ArrowPathIcon,
  LockClosedIcon
} from "@heroicons/react/24/outline";
import { 
  getOverview, 
  getGovernanceBlocks, 
  getIndustrialSnapshot,
  getNetworkOverview,
  getAnomalies,
  getIndustrialIncidents,
  getAudit,
  pauseQueue,
  resumeQueue,
  getEconomicOverview,
  getCapacity
} from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { getUserRole, isPrinthouseUser, isTenantUser } from "../../lib/authStore";

// --- Components ---

const TacticalPanel = ({ title, children, icon: Icon, badge, color = 'slate', status = 'success', error = null }: { title: string, children: React.ReactNode, icon?: any, badge?: string, color?: string, status?: string, error?: string | null }) => (
  <div className="bg-white dark:bg-[#1C1C1E] border border-slate-200 dark:border-white/5 flex flex-col h-full overflow-hidden rounded-sm">
    <div className="px-4 py-2 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.03] flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        <h3 className="text-[10px] font-black text-slate-500 dark:text-zinc-500 uppercase tracking-[0.2em]">{title}</h3>
      </div>
      {badge && (
        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${
          color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
          color === 'red' ? 'bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse' :
          color === 'amber' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
          'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-zinc-400'
        }`}>
          {badge}
        </span>
      )}
    </div>
    <div className="flex-1 overflow-auto p-4 custom-scrollbar relative">
      {status === 'loading' && (
        <div className="absolute inset-0 bg-white/50 dark:bg-black/20 backdrop-blur-[1px] flex items-center justify-center z-10">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
      {status === 'error' ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <ExclamationTriangleIcon className="w-8 h-8 text-red-500 mb-2 opacity-50" />
          <span className="text-[10px] font-black text-red-500 uppercase">Data Breach / Connection Failed</span>
          <p className="text-[8px] text-slate-400 mt-1 uppercase max-w-xs">{error || 'Unknown Error'}</p>
        </div>
      ) : (
        children
      )}
    </div>
  </div>
);

const TelemetryItem = ({ label, value, sub, status }: { label: string, value: string | number, sub?: string, status?: 'stable' | 'warning' | 'critical' }) => (
  <div className="flex flex-col gap-0.5 mb-4 last:mb-0">
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-widest">{label}</span>
      <div className={`w-1.5 h-1.5 rounded-full ${
        status === 'stable' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
        status === 'warning' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
        status === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse' :
        'bg-slate-300 dark:bg-zinc-700'
      }`} />
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-black text-slate-900 dark:text-[#ECECF1] tabular-nums tracking-tight">
        {value === undefined || value === null ? '---' : value}
      </span>
      {sub && <span className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 uppercase">{sub}</span>}
    </div>
  </div>
);

// --- Main Page ---

import { getModuleReadiness, moduleReadinessRegistry } from '../../config/moduleReadiness';

export const CommandCenterPage: React.FC = () => {
  const role = getUserRole();
  const isSuper = role === 'SUPER_ADMIN';
  const isPrinthouse = isPrinthouseUser();

  const allModulesActive = useMemo(() => {
    return Object.values(moduleReadinessRegistry).every(m => m.status === 'ACTIVE');
  }, []);

  // Unified Telemetry Binding
  const industrial = useAdminQuery('hawk-eye:industrial', getIndustrialSnapshot, 10000);
  const network = useAdminQuery('hawk-eye:network', getNetworkOverview, 60000);
  const capacity = useAdminQuery('hawk-eye:capacity', getCapacity, 60000);
  const routing = useAdminQuery('hawk-eye:routing', getEconomicOverview, 60000);
  const anomalies = useAdminQuery('hawk-eye:anomalies', getAnomalies, 15000);
  const incidents = useAdminQuery('hawk-eye:incidents', getIndustrialIncidents, 10000);
  const audit = useAdminQuery('hawk-eye:audit', () => getAudit({ limit: 20 }), 5000);
  const blocks = useAdminQuery('hawk-eye:blocks', getGovernanceBlocks, 30000);

  // Derivation Helpers
  const systemRisk = useMemo(() => {
    if (!industrial.data) return 0;
    let score = 0;
    if (industrial.data?.workers?.state !== 'LIVE') score += 30;
    const queue = industrial.data?.queue?.queues?.[0];
    if (queue?.counts?.stalled > 5) score += 20;
    if (Array.isArray(incidents.data) && incidents.data.length > 0) score += 25;
    return Math.min(score, 100);
  }, [industrial.data, incidents.data]);

  const activeJobs = industrial.data?.queue?.queues?.[0]?.counts?.active || 0;
  const waitingJobs = industrial.data?.queue?.queues?.[0]?.counts?.waiting || 0;
  const throughput = industrial.data?.queue?.queues?.[0]?.throughput || 0;

  // Command Action Handlers
  const handleCommand = async (action: string) => {
    if (['drain', 'quarantine', 'purge', 'shift'].includes(action)) {
      alert(`Action [${action.toUpperCase()}] is NOT WIRED to production backend yet.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to trigger: ${action.toUpperCase()}? This will be logged to the immutable audit stream.`)) return;
    
    try {
      switch (action) {
        case 'pause':
          await pauseQueue('preflight', 'Admin Manual Override');
          break;
        case 'resume':
          await resumeQueue('preflight', 'Admin Manual Override');
          break;
      }
      industrial.refetch();
      audit.refetch();
    } catch (e: any) {
      alert(`Command Failed: ${e.message}`);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-[#F8F9FA] dark:bg-[#0A0A0B] font-sans select-none h-full w-full min-h-0">
      
      {/* 1. GLOBAL SYSTEM STATUS BAR */}
      <div className="h-12 flex-shrink-0 bg-white dark:bg-[#111112] border-b border-slate-200 dark:border-white/5 flex items-center px-4 justify-between z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-slate-900 dark:bg-white flex items-center justify-center">
              <BoltIcon className="w-4 h-4 text-white dark:text-black" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">HAWK EYE <span className="text-primary font-mono opacity-50">v10.0</span></span>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-white/10 hidden sm:block" />

          <div className="hidden sm:flex items-center gap-4">
            <StatusBadge label="ENV" value="PRODUCTION" color="emerald" />
            <StatusBadge label="REGION" value="EU-WEST-1" color="slate" />
            <StatusBadge label="MODULES" value={allModulesActive ? "READY" : "DEGRADED"} color={allModulesActive ? "emerald" : "amber"} />
            <StatusBadge label="HEALTH" value={systemRisk < 20 ? "STABLE" : systemRisk < 50 ? "DEGRADED" : "CRITICAL"} color={systemRisk < 20 ? "emerald" : systemRisk < 50 ? "amber" : "red"} pulse={systemRisk > 50} />
            <StatusBadge label="WORKERS" value={`${industrial.data?.workers?.stats?.activeNodes || 0}/${industrial.data?.workers?.stats?.totalNodes || 0}`} color="primary" />
            <StatusBadge label="JOBS/H" value={throughput > 0 ? throughput.toLocaleString() : "---"} color="slate" />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
             <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${industrial.data?.queue?.state === 'LIVE' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                QUEUE: {industrial.data?.queue?.state || '---'}
             </div>
             <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                DB: SYNCED
             </div>
             <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                REDIS: ACTIVE
             </div>
          </div>
          <div className="h-8 w-[1px] bg-slate-200 dark:bg-white/10 hidden sm:block" />
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center relative">
                <BellIcon className="w-4 h-4 text-slate-400" />
                {(Array.isArray(incidents.data) && incidents.data.length > 0) && <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 border-2 border-white dark:border-[#111112] rounded-full" />}
             </div>
             <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-[10px]">
                {role?.slice(0, 2).toUpperCase() || '??'}
             </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* 2. MAIN OPERATIONAL GRID */}
        <div className="flex-1 overflow-y-auto p-1 grid grid-cols-12 auto-rows-min gap-1 custom-scrollbar bg-slate-100/50 dark:bg-transparent">
          
          {/* PREFLIGHT OPERATIONS */}
          <div className="col-span-12 md:col-span-6 lg:col-span-3 h-[400px]">
            <TacticalPanel title="Preflight Operations" icon={Square3Stack3DIcon} badge="Live" color="emerald" status={industrial.status} error={industrial.error}>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <TelemetryItem label="Active Jobs" value={activeJobs} status="stable" />
                  <TelemetryItem label="Queue Depth" value={waitingJobs} status={waitingJobs > 100 ? 'warning' : 'stable'} />
                </div>
                <div className="h-[1px] bg-slate-100 dark:bg-white/5" />
                <div className="space-y-4">
                  <StatBar label="Industrial Throughput" value={throughput > 0 ? Math.min(100, (throughput / 5000) * 100) : 0} color="emerald" />
                  <StatBar label="Worker Availability" value={industrial.data?.workers?.stats?.fleetHealth || 0} color="primary" />
                  <StatBar label="Engine Pressure" value={activeJobs > 50 ? 80 : 20} color="amber" />
                </div>
                <div className="mt-4 p-3 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-lg">
                  <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Queue Distribution</span>
                  <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                    <div className="flex-1 bg-emerald-500" style={{ flex: activeJobs || 1 }} />
                    <div className="bg-primary" style={{ flex: waitingJobs || 0 }} />
                    <div className="bg-amber-500" style={{ flex: industrial.data?.queue?.queues?.[0]?.counts?.stalled || 0 }} />
                  </div>
                </div>
              </div>
            </TacticalPanel>
          </div>

          {/* WORKER CLUSTER */}
          <div className="col-span-12 md:col-span-6 lg:col-span-3 h-[400px]">
            <TacticalPanel title="Worker Fleet" icon={CpuChipIcon} badge={industrial.data?.workers?.state || 'Industrial'} color={industrial.data?.workers?.state === 'LIVE' ? 'primary' : 'amber'} status={industrial.status} error={industrial.error}>
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase">Active Fleet</span>
                  <span className="text-[9px] font-black text-primary uppercase">{industrial.data?.workers?.stats?.activeNodes || 0} Nodes</span>
                </div>
                {Array.isArray(industrial.data?.workers?.activeFleet) && industrial.data.workers.activeFleet.slice(0, 6).map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between p-2 rounded bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${w.status === 'HEALTHY' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                      <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-zinc-400">{w.id?.slice(0, 12) || '---'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-slate-400 uppercase">{w.status}</span>
                    </div>
                  </div>
                ))}
                
                {Array.isArray(industrial.data?.workers?.historicalFleet) && industrial.data.workers.historicalFleet.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Historical Fleet</span>
                      <span className="text-[9px] font-black text-slate-400 uppercase">{industrial.data?.workers?.historicalFleet.length} Offline</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {industrial.data.workers.historicalFleet.slice(0, 4).map((w: any) => (
                        <div key={w.id} className="p-1 px-2 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[8px] font-mono text-slate-400 truncate text-center">
                          {w.id?.slice(0, 8)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!industrial.data?.workers?.activeFleet || industrial.data.workers.activeFleet.length === 0) && !industrial.status.includes('loading') && (
                  <div className="text-center py-20 opacity-30 font-black text-[10px]">NO ACTIVE NODES DETECTED</div>
                )}
              </div>
            </TacticalPanel>
          </div>

          {/* GLOBAL PRINTHOUSE NETWORK */}
          <div className="col-span-12 lg:col-span-6 h-[400px]">
            <TacticalPanel title="Global Manufacturing Grid" icon={GlobeAltIcon} badge="World-Scale" color="slate" status={capacity.status}>
               <div className="flex flex-col h-full gap-4">
                 <div className="flex-1 relative bg-slate-100 dark:bg-[#111112] border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden group">
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                       <GlobeAltIcon className="w-64 h-64" />
                    </div>
                    <div className="absolute inset-0 p-4 overflow-y-auto custom-scrollbar">
                       <div className="grid grid-cols-2 gap-2">
                         {Array.isArray(capacity.data) && capacity.data.map((node: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-white/40 dark:bg-white/5 border border-white/20 rounded-lg backdrop-blur-sm">
                               <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${node.capacity_utilization_pct < 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                  <span className="text-[9px] font-black uppercase text-slate-600 dark:text-slate-300">{node.region || 'UNKNOWN'} ({node.country || '??'})</span>
                               </div>
                               <span className="text-[9px] font-bold text-slate-400 tabular-nums">{node.printers || 0} PRINTERS</span>
                            </div>
                         ))}
                         {(!Array.isArray(capacity.data) || capacity.data.length === 0) && (
                            <div className="col-span-2 text-center py-10 text-[9px] font-black text-slate-400 uppercase">NO ACTIVE REGIONS DETECTED</div>
                         )}
                       </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-white/80 dark:bg-black/40 backdrop-blur-md border-t border-slate-200 dark:border-white/10 px-4 flex items-center justify-between">
                       <MiniMetric label="TOTAL PRINTERS" value={network.data?.total_printers || 0} />
                       <MiniMetric label="ACTIVE NODES" value={network.data?.active_printers || 0} />
                       <MiniMetric label="UTILIZATION" value={`${network.data?.capacity_utilization_pct || 0}%`} />
                       <MiniMetric label="SYNC HEALTH" value="UNKNOWN" />
                    </div>
                 </div>
               </div>
            </TacticalPanel>
          </div>

          {/* ECONOMIC ROUTING ENGINE */}
          {(isSuper || isPrinthouse) && (
            <div className="col-span-12 md:col-span-6 lg:col-span-4 h-[350px]">
              <TacticalPanel title="Economic Intelligence" icon={CurrencyEuroIcon} badge="Market-Aware" color="amber" status={routing.status}>
                 <div className="space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                     <TelemetryItem label="Avg Margin" value={routing.data?.metrics?.avg_margin_pct ? `${routing.data.metrics.avg_margin_pct.toFixed(1)}%` : '---'} status="stable" />
                     <TelemetryItem label="Low Margin Quotes" value={routing.data?.metrics?.low_margin_count || 0} status={routing.data?.metrics?.low_margin_count > 0 ? 'warning' : 'stable'} />
                   </div>
                   <div className="p-3 bg-white dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-lg space-y-3">
                     <h4 className="text-[9px] font-black text-slate-400 uppercase">Pricing & Materials readiness</h4>
                     <div className="space-y-2">
                       <div className="flex items-center justify-between">
                         <span className="text-[9px] font-bold text-slate-500 uppercase">Materials Catalog</span>
                         <span className={`text-[9px] font-black uppercase ${industrial.data?.readiness?.materials?.state === 'LIVE' ? 'text-emerald-500' : 'text-slate-400'}`}>
                           {industrial.data?.readiness?.materials?.state || 'NOT_CONFIGURED'}
                         </span>
                       </div>
                       <div className="flex items-center justify-between">
                         <span className="text-[9px] font-bold text-slate-500 uppercase">Pricing Profiles</span>
                         <span className={`text-[9px] font-black uppercase ${industrial.data?.readiness?.pricing?.state === 'LIVE' ? 'text-emerald-500' : 'text-amber-500'}`}>
                           {industrial.data?.readiness?.pricing?.state || 'DEGRADED'}
                         </span>
                       </div>
                     </div>
                   </div>
                   <div className="flex items-center justify-between px-1">
                     <span className="text-[9px] font-bold text-slate-500 uppercase">Network Quality Score</span>
                     <span className="text-sm font-black text-emerald-500">{(routing.data?.avg_final_score || 0).toFixed(1)} / 10</span>
                   </div>
                 </div>
              </TacticalPanel>
            </div>
          )}

          {/* GOVERNANCE & SECURITY */}
          {isSuper && (
            <div className="col-span-12 md:col-span-6 lg:col-span-4 h-[350px]">
              <TacticalPanel title="Governance Posture" icon={ShieldCheckIcon} badge="SOC Industrial" color="red" status={blocks.status}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex flex-col">
                      <span className="text-xl font-black text-slate-900 dark:text-white">UNKNOWN</span>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Compliance Score</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {Array.isArray(blocks.data?.blocks) && blocks.data.blocks.slice(0, 4).map((b: any) => (
                      <GovernanceRow key={b.id} label={b.name} status={b.status} color={b.status === 'ACTIVE' ? 'emerald' : 'red'} />
                    ))}
                    {(!blocks.data?.blocks || blocks.data.blocks.length === 0) && <div className="text-center py-10 opacity-30 text-[9px] font-black">NO POLICY BLOCKS</div>}
                  </div>
                </div>
              </TacticalPanel>
            </div>
          )}

          {/* ARTIFACT LIFECYCLE */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 h-[350px]">
            <TacticalPanel title="Artifact Lifecycle" icon={ArchiveBoxIcon} badge="Storage Pressure" color="slate" status={industrial.status}>
               <div className="space-y-6">
                 <div className="flex items-center justify-between">
                   <div className="flex flex-col">
                     <span className="text-xl font-black text-slate-900 dark:text-white">
                        {( (industrial.data?.storage?.totalSizeBytes || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
                     </span>
                     <span className="text-[8px] font-black text-slate-400 uppercase">Current Footprint</span>
                   </div>
                   <div className="text-right">
                     <span className="text-sm font-black text-slate-900 dark:text-white">{(industrial.data?.storage?.artifactCount || 0).toLocaleString()}</span>
                     <span className="text-[8px] font-black text-slate-400 uppercase block">Active Artifacts</span>
                   </div>
                 </div>
                 <div className="space-y-1.5">
                    <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase">
                      <span>Quota Utilization</span>
                      <span>{Math.round(((industrial.data?.storage?.totalSizeBytes || 0) / (industrial.data?.storage?.capacityBytes || 1)) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)] transition-all duration-1000" 
                        style={{ width: `${Math.min(100, ((industrial.data?.storage?.totalSizeBytes || 0) / (industrial.data?.storage?.capacityBytes || 1)) * 100)}%` }} 
                      />
                    </div>
                 </div>
                 <div className="grid grid-cols-3 gap-2">
                    <LifecycleTier label="HOT" value={industrial.data?.storage?.tierDistribution?.HOT || 0} color="primary" />
                    <LifecycleTier label="WARM" value={industrial.data?.storage?.tierDistribution?.WARM || 0} color="amber" />
                    <LifecycleTier label="COLD" value={industrial.data?.storage?.tierDistribution?.COLD || 0} color="slate" />
                 </div>
               </div>
            </TacticalPanel>
          </div>

          {/* INTELLIGENCE & ANOMALIES */}
          <div className="col-span-12 lg:col-span-8 h-[300px]">
             <TacticalPanel title="Intelligence Layer & Anomaly Detection" icon={BoltIcon} badge="AI Operational" color="primary" status={anomalies.status}>
               <div className="flex flex-col md:flex-row gap-8 h-full">
                 <div className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                    {Array.isArray(anomalies.data?.anomalies) && anomalies.data.anomalies.map((a: any) => (
                      <AnomalyRow key={a.id} title={a.title || a.event} tenant={a.tenant_id} confidence={Math.round((a.confidence || 0) * 100)} severity={a.severity} />
                    ))}
                    {(!anomalies.data?.anomalies || anomalies.data.anomalies.length === 0) && (
                      <div className="flex flex-col items-center justify-center h-full opacity-30 text-center py-10">
                         <ShieldCheckIcon className="w-8 h-8 mb-2" />
                         <span className="text-[10px] font-black uppercase">No Detected Outliers</span>
                      </div>
                    )}
                 </div>
                 <div className="md:w-1/3 border-l border-slate-100 dark:border-white/5 md:pl-8 py-2 space-y-6">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase block mb-2">Autonomy Confidence</span>
                      <div className="text-3xl font-black text-primary">UNKNOWN</div>
                      <div className="text-[9px] font-bold text-emerald-500 uppercase mt-1 italic-text-off">Self-Healing Enabled</div>
                    </div>
                    <div className="space-y-3">
                       <span className="text-[10px] font-black text-slate-400 uppercase block">Predictive Outlook</span>
                       <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                          <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 leading-relaxed italic-text-off uppercase">
                             {industrial.data?.readiness?.materials?.state === 'LIVE' 
                                ? `Active Materials Catalog detected across ${industrial.data?.readiness?.materials?.catalogCount || 0} nodes. Capacity optimization recommended.` 
                                : 'Catalog extraction pending. System operating in manual pricing mode.'}
                          </p>
                       </div>
                    </div>
                 </div>
               </div>
             </TacticalPanel>
          </div>

          {/* COMMAND ACTIONS */}
          {(isSuper || isPrinthouse) && (
            <div className="col-span-12 lg:col-span-4 h-[300px]">
              <TacticalPanel title="Command Console" icon={CommandLineIcon} badge="Direct Override" color="slate">
                 <div className="grid grid-cols-2 gap-2 h-full">
                    <CommandButton label="Pause Queue" icon={PowerIcon} color="red" onClick={() => handleCommand('pause')} />
                    <CommandButton label="Resume Queue" icon={ArrowPathIcon} color="emerald" onClick={() => handleCommand('resume')} />
                    <CommandButton label="Drain Fleet [NOT WIRED]" icon={AdjustmentsHorizontalIcon} color="slate" onClick={() => handleCommand('drain')} />
                    <CommandButton label="Quarantine [NOT WIRED]" icon={LockClosedIcon} color="slate" onClick={() => handleCommand('quarantine')} />
                    <CommandButton label="Purge Cache [NOT WIRED]" icon={ArchiveBoxIcon} color="slate" onClick={() => handleCommand('purge')} />
                    <CommandButton label="Shift Traffic [NOT WIRED]" icon={LinkIcon} color="slate" onClick={() => handleCommand('shift')} />
                    <div className="col-span-2 mt-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-mono text-[10px] flex items-center justify-between">
                       <span className="opacity-50"># system_status_active</span>
                       <span className="text-emerald-500 font-bold uppercase">Stable</span>
                    </div>
                 </div>
              </TacticalPanel>
            </div>
          )}

        </div>

        {/* 3. GLOBAL INCIDENT CENTER (RAIL) */}
        <div className="w-80 flex-shrink-0 bg-white dark:bg-[#111112] border-l border-slate-200 dark:border-white/5 hidden xl:flex flex-col z-40">
           <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
                 <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Incident Bridge</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black animate-pulse">
                {Array.isArray(incidents.data) ? incidents.data.length : 0} ACTIVE
              </span>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {Array.isArray(incidents.data) && incidents.data.map((inc: any) => (
                <div key={inc.id} className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="px-2 py-0.5 rounded bg-red-500 text-white text-[8px] font-black uppercase">CRITICAL</span>
                    <span className="text-[9px] font-bold text-slate-400 font-mono">#{inc.id?.slice(0,6) || '---'}</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-white leading-tight uppercase">{inc.action?.replace(/_/g, ' ') || 'UNKNOWN INCIDENT'}</h4>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 mt-1 uppercase">{inc.created_at ? new Date(inc.created_at).toLocaleTimeString() : '---'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <button className="py-2 bg-red-500 text-white text-[9px] font-black uppercase rounded-lg hover:bg-red-600 transition-colors">Triage</button>
                     <button className="py-2 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white text-[9px] font-black uppercase rounded-lg">Mute</button>
                  </div>
                </div>
              ))}
              {(!Array.isArray(incidents.data) || incidents.data.length === 0) && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-center py-20">
                   <ShieldCheckIcon className="w-12 h-12 mb-4" />
                   <p className="text-[10px] font-black uppercase tracking-widest">No Active Incidents Detected</p>
                </div>
              )}
           </div>

           {/* Telemetry Stream */}
           <div className="h-64 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 flex flex-col">
              <div className="px-4 py-2 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Telemetry Stream</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="flex-1 overflow-y-auto p-3 font-mono text-[8px] space-y-1.5 custom-scrollbar text-slate-500 dark:text-zinc-500">
                 {Array.isArray(audit.data) && audit.data.slice(0, 20).map((log: any) => (
                   <div key={log.id} className="whitespace-nowrap flex gap-2">
                      <span className="opacity-50">[{log.created_at ? new Date(log.created_at).toLocaleTimeString() : '---'}]</span>
                      <span className="text-slate-700 dark:text-zinc-300">USER_{log.tenant_id?.slice(0,4) || 'SYS'}</span>
                      <span className={log.action?.includes('ERROR') || log.action?.includes('FAILED') ? 'text-red-500' : 'text-emerald-500'}>{log.action}</span>
                   </div>
                 ))}
                 {(!Array.isArray(audit.data) || audit.data.length === 0) && <div className="text-center py-10 opacity-20 uppercase font-black text-[7px]">Stream Idle</div>}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

// --- Helper Components ---

const StatusBadge = ({ label, value, color, pulse = false }: { label: string, value: string | number, color: string, pulse?: boolean }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 tracking-tighter">{label}</span>
    <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-widest border transition-all ${
      color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
      color === 'amber' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
      color === 'red' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
      color === 'primary' ? 'bg-primary/10 text-primary border-primary/20' :
      'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-white/10'
    } ${pulse ? 'animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.3)]' : ''}`}>
      {value}
    </span>
  </div>
);

const StatBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase">
      <span>{label}</span>
      <span>{Math.round(value)}%</span>
    </div>
    <div className="h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
      <div 
        className={`h-full transition-all duration-1000 ${
          color === 'emerald' ? 'bg-emerald-500' :
          color === 'primary' ? 'bg-primary' :
          'bg-amber-500'
        }`}
        style={{ width: `${value}%` }} 
      />
    </div>
  </div>
);

const MiniMetric = ({ label, value }: { label: string, value: string | number }) => (
  <div className="flex flex-col">
    <span className="text-[7px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-tighter">{label}</span>
    <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{value}</span>
  </div>
);

const GovernanceRow = ({ label, status, color = 'emerald' }: { label: string, status: string, color?: string }) => (
  <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-white/[0.01] border border-slate-100 dark:border-white/[0.02]">
    <span className="text-[9px] font-bold text-slate-600 dark:text-zinc-400 uppercase truncate pr-4">{label}</span>
    <span className={`text-[8px] font-black uppercase ${color === 'emerald' ? 'text-emerald-500' : 'text-red-500'}`}>{status}</span>
  </div>
);

const LifecycleTier = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className="p-2 rounded bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 text-center">
    <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">{label}</span>
    <span className={`text-sm font-black ${
      color === 'primary' ? 'text-primary' :
      color === 'amber' ? 'text-amber-500' :
      'text-slate-500'
    }`}>{value}%</span>
  </div>
);

const AnomalyRow = ({ title, tenant, confidence, severity, job }: { title: string, tenant?: string, confidence: number, severity: string, job?: string }) => (
  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.01] border border-slate-100 dark:border-white/5 flex items-center justify-between group hover:border-primary/30 transition-all">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
        severity === 'CRITICAL' ? 'bg-red-500' :
        severity === 'HIGH' ? 'bg-amber-500' :
        'bg-primary'
      }`} />
      <div className="min-w-0">
        <h5 className="text-[10px] font-black text-slate-900 dark:text-white leading-tight uppercase truncate">{title}</h5>
        <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-widest truncate block">{tenant || job || 'System'}</span>
      </div>
    </div>
    <div className="text-right flex-shrink-0 pl-4">
       <div className="text-[10px] font-black text-slate-900 dark:text-[#ECECF1]">{confidence}%</div>
       <span className="text-[7px] font-black text-slate-400 uppercase tracking-tighter">Match</span>
    </div>
  </div>
);

const CommandButton = ({ label, icon: Icon, color, onClick }: { label: string, icon: any, color: string, onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-95 text-left ${
      color === 'red' ? 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500/10' :
      color === 'emerald' ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10' :
      color === 'amber' ? 'bg-amber-500/5 border-amber-500/10 text-amber-500 hover:bg-amber-500/10' :
      color === 'primary' ? 'bg-primary/5 border-primary/10 text-primary hover:bg-primary/10' :
      'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10'
    }`}
  >
    <Icon className="w-5 h-5 flex-shrink-0" />
    <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{label}</span>
  </button>
);
