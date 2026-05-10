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
  AdjustmentsHorizontalIcon,
  PowerIcon,
  ArchiveBoxIcon,
  LinkIcon,
  ArrowPathIcon,
  LockClosedIcon
} from "@heroicons/react/24/outline";
import { 
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
import { getUserRole, isPrinthouseUser } from "../../lib/authStore";

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
          color === 'primary' ? 'bg-primary/10 text-primary border border-primary/20' :
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

import { moduleReadinessRegistry } from '../../config/moduleReadiness';

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
  const complianceScore = useMemo(() => {
    if (!blocks.data?.blocks || blocks.data.blocks.length === 0) return 'No governance telemetry';
    const active = blocks.data.blocks.filter((b: any) => b.status === 'ACTIVE').length;
    return `${Math.round((active / blocks.data.blocks.length) * 100)}%`;
  }, [blocks.data]);

  const syncHealth = useMemo(() => {
    if (capacity.status === 'error' || network.status === 'error') return 'DEGRADED';
    if (!capacity.data || !network.data) return 'NO DATA';
    return 'SYNCED';
  }, [capacity.status, network.status, capacity.data, network.data]);

  const autonomyConfidence = useMemo(() => {
    if (!industrial.data || !industrial.data.workers) return 'NO DATA';
    const isQueueLive = industrial.data.queue?.state === 'LIVE';
    const hasWorkers = (industrial.data.workers?.stats?.activeNodes || 0) > 0;
    const hasIncidents = Array.isArray(incidents.data) && incidents.data.length > 0;
    
    if (isQueueLive && hasWorkers && !hasIncidents) return 'HIGH';
    if (isQueueLive && hasWorkers) return 'MEDIUM';
    return 'LOW';
  }, [industrial.data, incidents.data]);

  const activeJobs = industrial.data?.queue?.queues?.[0]?.counts?.active || 0;
  const waitingJobs = industrial.data?.queue?.queues?.[0]?.counts?.waiting || 0;
  const throughput = industrial.data?.queue?.queues?.[0]?.throughput || 0;

  // Command Action Handlers
  const handleCommand = async (action: string) => {
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
    <div className="space-y-6">
      {/* Dashboard Title Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200 dark:border-white/5 pb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Control Plane</h1>
          <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-500 uppercase">
            Operational Intelligence & Industrial Telemetry
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 py-1.5 rounded-md">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${industrial.data?.queue?.state === 'LIVE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`} />
            <span className="text-[9px] font-black uppercase text-slate-400">Queue: {industrial.data?.queue?.state || 'OFFLINE'}</span>
          </div>
          <div className="w-[1px] h-2 bg-slate-200 dark:bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <span className="text-[9px] font-black uppercase text-slate-400">Health: Stable</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        
        {/* 2. MAIN OPERATIONAL GRID */}
        <div className="col-span-12 xl:col-span-9 grid grid-cols-12 auto-rows-min gap-4 h-fit">
          
          <div className="col-span-12 md:col-span-6 lg:col-span-3 min-h-[260px]">
            <TacticalPanel title="Preflight" icon={Square3Stack3DIcon} badge="Live" color="emerald" status={industrial.status} error={industrial.error}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <TelemetryItem label="Active Jobs" value={activeJobs} status="stable" />
                  <TelemetryItem label="Queue Depth" value={waitingJobs} status={waitingJobs > 100 ? 'warning' : 'stable'} />
                </div>
                <div className="h-[1px] bg-slate-100 dark:bg-white/5" />
                <div className="space-y-3">
                  <StatBar label="Throughput" value={throughput > 0 ? Math.min(100, (throughput / 5000) * 100) : 0} color="emerald" />
                  <StatBar label="Nodes" value={industrial.data?.workers?.stats?.fleetHealth || 0} color="primary" />
                  <StatBar label="Pressure" value={activeJobs > 50 ? 80 : 20} color="amber" />
                </div>
              </div>
            </TacticalPanel>
          </div>

          <div className="col-span-12 md:col-span-6 lg:col-span-3 min-h-[260px]">
            <TacticalPanel title="Fleet" icon={CpuChipIcon} badge={industrial.data?.workers?.state || 'IDLE'} color={industrial.data?.workers?.state === 'LIVE' ? 'primary' : 'amber'} status={industrial.status} error={industrial.error}>
              <div className="space-y-2">
                {Array.isArray(industrial.data?.workers?.activeFleet) && industrial.data.workers.activeFleet.slice(0, 4).map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between p-1.5 rounded bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${w.status === 'HEALTHY' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-zinc-400">{w.id?.slice(0, 8) || '---'}</span>
                    </div>
                    <span className="text-[8px] font-black text-slate-400 uppercase">{w.status}</span>
                  </div>
                ))}
                
                {(!industrial.data?.workers?.activeFleet || industrial.data.workers.activeFleet.length === 0) && industrial.status !== 'loading' && (
                  <div className="text-center py-10 opacity-30 font-black text-[9px]">NO ACTIVE NODES</div>
                )}
              </div>
            </TacticalPanel>
          </div>

          <div className="col-span-12 lg:col-span-6 min-h-[260px]">
            <TacticalPanel title="Manufacturing Grid" icon={GlobeAltIcon} badge="Global" color="slate" status={capacity.status}>
               <div className="flex flex-col h-full gap-3">
                 <div className="flex-1 relative bg-slate-100 dark:bg-[#111112] border border-slate-200 dark:border-white/5 rounded-md overflow-hidden min-h-[140px]">
                    <div className="absolute inset-0 p-3 overflow-y-auto custom-scrollbar">
                       <div className="grid grid-cols-2 gap-2">
                         {Array.isArray(capacity.data) && capacity.data.slice(0, 10).map((node: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-1.5 bg-white/40 dark:bg-white/5 border border-white/10 rounded backdrop-blur-sm">
                               <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${node.capacity_utilization_pct < 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                  <span className="text-[8px] font-black uppercase text-slate-500 dark:text-slate-400">{node.region || 'UNK'}</span>
                               </div>
                               <span className="text-[8px] font-bold text-slate-400 tabular-nums">{node.printers || 0} P</span>
                            </div>
                         ))}
                       </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-white/90 dark:bg-black/60 backdrop-blur-md border-t border-slate-200 dark:border-white/10 px-3 flex items-center justify-between">
                       <MiniMetric label="TOTAL" value={network.data?.total_printers || 0} />
                       <MiniMetric label="LOAD" value={`${network.data?.capacity_utilization_pct || 0}%`} />
                       <MiniMetric label="SYNC" value={syncHealth} />
                    </div>
                 </div>
               </div>
            </TacticalPanel>
          </div>

          {(isSuper || isPrinthouse) && (
            <div className="col-span-12 md:col-span-6 lg:col-span-4 min-h-[220px]">
              <TacticalPanel title="Economy" icon={CurrencyEuroIcon} badge="Intelligence" color="amber" status={routing.status}>
                 <div className="space-y-3">
                   <div className="grid grid-cols-2 gap-4">
                     <TelemetryItem label="Avg Margin" value={routing.data?.metrics?.avg_margin_pct ? `${routing.data.metrics.avg_margin_pct.toFixed(1)}%` : '---'} status="stable" />
                     <TelemetryItem label="Low Margin" value={routing.data?.metrics?.low_margin_count || 0} status={routing.data?.metrics?.low_margin_count > 0 ? 'warning' : 'stable'} />
                   </div>
                   <div className="flex items-center justify-between px-1">
                     <span className="text-[9px] font-bold text-slate-500 uppercase">Quality Score</span>
                     <span className="text-sm font-black text-emerald-500">{(routing.data?.avg_final_score || 0).toFixed(1)}</span>
                   </div>
                 </div>
              </TacticalPanel>
            </div>
          )}

          {isSuper && (
            <div className="col-span-12 md:col-span-6 lg:col-span-4 min-h-[220px]">
              <TacticalPanel title="Governance" icon={ShieldCheckIcon} badge="SOC Industrial" color="red" status={blocks.status}>
                <div className="space-y-3">
                  <div className="flex flex-col mb-2">
                    <span className="text-lg font-black text-slate-900 dark:text-white uppercase leading-none">{complianceScore}</span>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Compliance</span>
                  </div>
                  <div className="space-y-1">
                    {Array.isArray(blocks.data?.blocks) && blocks.data.blocks.slice(0, 3).map((b: any) => (
                      <GovernanceRow key={b.id} label={b.name} status={b.status} color={b.status === 'ACTIVE' ? 'emerald' : 'red'} />
                    ))}
                    {(!blocks.data?.blocks || blocks.data.blocks.length === 0) && <div className="text-center py-4 opacity-30 text-[9px] font-black">NO POLICY FLOW</div>}
                  </div>
                </div>
              </TacticalPanel>
            </div>
          )}

          <div className="col-span-12 md:col-span-6 lg:col-span-4 min-h-[220px]">
            <TacticalPanel title="Storage" icon={ArchiveBoxIcon} badge="Pressure" color="slate" status={industrial.status}>
               <div className="space-y-4">
                 <div className="flex items-center justify-between">
                   <span className="text-lg font-black text-slate-900 dark:text-white">
                      {( (industrial.data?.storage?.totalSizeBytes || 0) / (1024 * 1024 * 1024)).toFixed(1)} GB
                   </span>
                   <span className="text-sm font-black text-slate-400 tabular-nums">{(industrial.data?.storage?.artifactCount || 0).toLocaleString()}</span>
                 </div>
                 <div className="space-y-1">
                    <div className="h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${Math.min(100, ((industrial.data?.storage?.totalSizeBytes || 0) / (industrial.data?.storage?.capacityBytes || 1)) * 100)}%` }} 
                      />
                    </div>
                 </div>
                 <div className="grid grid-cols-3 gap-1.5">
                    <LifecycleTier label="HOT" value={industrial.data?.storage?.tierDistribution?.HOT || 0} color="primary" />
                    <LifecycleTier label="WARM" value={industrial.data?.storage?.tierDistribution?.WARM || 0} color="amber" />
                    <LifecycleTier label="COLD" value={industrial.data?.storage?.tierDistribution?.COLD || 0} color="slate" />
                 </div>
               </div>
            </TacticalPanel>
          </div>

          <div className="col-span-12 lg:col-span-8 min-h-[220px]">
             <TacticalPanel title="Intelligence & Anomalies" icon={BoltIcon} badge="AI Active" color="primary" status={anomalies.status}>
               <div className="flex flex-col md:flex-row gap-6 h-full">
                 <div className="flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar min-h-[100px]">
                    {Array.isArray(anomalies.data?.anomalies) && anomalies.data.anomalies.slice(0, 5).map((a: any) => (
                      <AnomalyRow key={a.id} title={a.title || a.event} tenant={a.tenant_id} confidence={Math.round((a.confidence || 0) * 100)} severity={a.severity} />
                    ))}
                    {(!anomalies.data?.anomalies || anomalies.data.anomalies.length === 0) && (
                      <div className="flex flex-col items-center justify-center py-6 opacity-20 text-center">
                         <ShieldCheckIcon className="w-6 h-6 mb-1" />
                         <span className="text-[8px] font-black uppercase">Grid Secure</span>
                      </div>
                    )}
                 </div>
                 <div className="md:w-1/3 border-l border-slate-100 dark:border-white/5 md:pl-6 space-y-4">
                    <div>
                      <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Confidence</span>
                      <div className="text-2xl font-black text-primary">{autonomyConfidence}</div>
                    </div>
                    <div className="p-2 bg-primary/5 border border-primary/10 rounded-md">
                       <p className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 leading-tight uppercase">
                          {industrial.data?.readiness?.materials?.state === 'LIVE' 
                             ? 'Self-healing active. Optimization recommended.' 
                             : 'Manual intervention mode enabled.'}
                       </p>
                    </div>
                 </div>
               </div>
             </TacticalPanel>
          </div>

          {(isSuper || isPrinthouse) && (
            <div className="col-span-12 lg:col-span-4 min-h-[220px]">
              <TacticalPanel title="Console" icon={CommandLineIcon} badge="Override" color="slate">
                 <div className="grid grid-cols-2 gap-2 h-full">
                    <CommandButton label="Pause" icon={PowerIcon} color="red" onClick={() => handleCommand('pause')} />
                    <CommandButton label="Resume" icon={ArrowPathIcon} color="emerald" onClick={() => handleCommand('resume')} />
                    <CommandButton label="Drain" icon={AdjustmentsHorizontalIcon} color="slate" badge="Soon" disabled />
                    <CommandButton label="Lock" icon={LockClosedIcon} color="slate" badge="Soon" disabled />
                    <CommandButton label="Purge" icon={ArchiveBoxIcon} color="slate" badge="Soon" disabled />
                    <CommandButton label="Shift" icon={LinkIcon} color="slate" badge="Soon" disabled />
                 </div>
              </TacticalPanel>
            </div>
          )}

        </div>

        {/* 3. GLOBAL INCIDENT CENTER (STICKY) */}
        <div className="col-span-12 xl:col-span-3 flex flex-col gap-4 sticky top-6 self-start max-h-[calc(100vh-140px)]">
           <div className="bg-white dark:bg-[#111112] border border-slate-200 dark:border-white/5 flex flex-col rounded-sm overflow-hidden h-fit">
              <div className="p-3 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
                 <div className="flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                    <h2 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Incident Bridge</h2>
                 </div>
                 <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[8px] font-black animate-pulse">
                   {Array.isArray(incidents.data) ? incidents.data.length : 0}
                 </span>
              </div>
              
              <div className="max-h-[300px] overflow-y-auto p-3 space-y-2 custom-scrollbar">
                 {Array.isArray(incidents.data) && incidents.data.map((inc: any) => (
                   <div key={inc.id} className="p-3 rounded-md bg-red-500/5 border border-red-500/10 space-y-2">
                     <div className="flex items-start justify-between">
                       <span className="text-[8px] font-black text-red-500 uppercase">CRITICAL</span>
                       <span className="text-[8px] font-bold text-slate-400 font-mono">#{inc.id?.slice(0,4)}</span>
                     </div>
                     <h4 className="text-[10px] font-black text-slate-900 dark:text-white leading-tight uppercase truncate">{inc.action?.replace(/_/g, ' ') || 'INCIDENT'}</h4>
                     <div className="grid grid-cols-2 gap-1.5">
                        <button className="py-1 bg-red-500 text-white text-[8px] font-black uppercase rounded hover:bg-red-600">Triage</button>
                        <button className="py-1 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-white text-[8px] font-black uppercase rounded">Mute</button>
                     </div>
                   </div>
                 ))}
                 {(!Array.isArray(incidents.data) || incidents.data.length === 0) && (
                   <div className="py-8 text-center opacity-20">
                      <ShieldCheckIcon className="w-6 h-6 mx-auto mb-1" />
                      <p className="text-[8px] font-black uppercase">Clear</p>
                   </div>
                 )}
              </div>
           </div>

           {/* Telemetry Stream */}
           <div className="bg-white dark:bg-[#111112] border border-slate-200 dark:border-white/5 flex flex-col rounded-sm overflow-hidden h-[300px]">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Live Stream</span>
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="flex-1 overflow-y-auto p-3 font-mono text-[7px] space-y-1.5 custom-scrollbar text-slate-500 dark:text-zinc-500 leading-tight">
                 {Array.isArray(audit.data) && audit.data.slice(0, 15).map((log: any) => (
                   <div key={log.id} className="whitespace-nowrap flex gap-1.5">
                      <span className="opacity-40">[{log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '---'}]</span>
                      <span className={log.action?.includes('ERROR') || log.action?.includes('FAILED') ? 'text-red-500' : 'text-emerald-500'}>{log.action}</span>
                   </div>
                 ))}
                 {(!Array.isArray(audit.data) || audit.data.length === 0) && <div className="text-center py-10 opacity-20 uppercase font-black text-[7px]">Idle</div>}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

// --- Helper Components ---


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

  const CommandButton = ({ label, icon: Icon, color, onClick, badge, disabled }: { label: string, icon: any, color: string, onClick?: () => void, badge?: string, disabled?: boolean }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    aria-disabled={disabled}
    className={`flex items-center gap-2.5 p-2.5 rounded-md border transition-all text-left relative ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
    } ${
      color === 'red' && !disabled ? 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500/10' :
      color === 'emerald' && !disabled ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10' :
      color === 'amber' && !disabled ? 'bg-amber-500/5 border-amber-500/10 text-amber-500 hover:bg-amber-500/10' :
      color === 'primary' && !disabled ? 'bg-primary/5 border-primary/10 text-primary hover:bg-primary/10' :
      disabled ? 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-zinc-500' :
      'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-white/10'
    }`}
  >
    <Icon className="w-4 h-4 flex-shrink-0" />
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] font-black uppercase tracking-widest leading-tight truncate">{label}</span>
      {badge && <span className="text-[7px] font-black uppercase text-slate-400 mt-0.5">{badge}</span>}
    </div>
  </button>
);
