import React, { useEffect, useState } from 'react';
import { 
  BoltIcon, 
  CpuChipIcon, 
  QueueListIcon, 
  ChartBarIcon, 
  ShieldCheckIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { 
  getMachineFederationDetails, 
  getMachineTelemetry, 
  getMachineDispatchHistory, 
  getMachineCapacityAnalysis 
} from '../lib/adminApi';
import { toDisplayText } from '../lib/formatters';
import { safeArray } from '../lib/display';
import { Drawer } from './Drawer';
import { COLORS } from '../design-system/tokens';

interface MachineDetailDrawerProps {
  machineId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const MachineDetailDrawer: React.FC<MachineDetailDrawerProps> = ({ machineId, isOpen, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && machineId) {
      fetchAllData();
    }
  }, [isOpen, machineId]);

  const fetchAllData = async () => {
    if (!machineId) return;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        getMachineFederationDetails(machineId),
        getMachineTelemetry(machineId),
        getMachineDispatchHistory(machineId),
        getMachineCapacityAnalysis(machineId)
      ]);

      const fedRes = results[0];
      const telRes = results[1];
      const disRes = results[2];
      const capRes = results[3];

      const fed = fedRes.status === 'fulfilled' ? fedRes.value : { ok: false, data: null };
      const tel = telRes.status === 'fulfilled' ? telRes.value : { ok: false, data: null };
      const dis = disRes.status === 'fulfilled' ? disRes.value : { ok: false, data: null };
      const cap = capRes.status === 'fulfilled' ? capRes.value : { ok: false, data: null };

      const headerData = fed?.ok && fed.data ? fed.data : {
        id: machineId,
        name: `Primary Machine (${machineId.replace('machine_', '').replace('_primary', '')})`,
        manufacturer: 'SYNTHETIC_FEDERATION_NODE',
        model: 'UNREGISTERED_PROFILE',
        region: 'GLOBAL',
        status: 'OFFLINE',
        mode: 'ISOLATED',
        heartbeat_age_sec: null,
        uptime_pct: 0
      };

      const telemetryData = tel?.ok && tel.data ? tel.data : {
        jobs_running: 0,
        jobs_queued: 0,
        jobs_failed_24h: 0,
        throughput_h: 0,
        utilization_pct: 0,
        avg_turnaround: 0,
        avg_lead_time: 0,
        dispatch_latency: 0,
        saturation: 0,
        current_load: 0
      };

      const historyData = dis?.ok && dis.data ? dis.data : {
        t24h: { completed: 0, failed: 0, sla_avg: 0, preflight_avg: 0 },
        t7d: { completed: 0, failed: 0 },
        incidents: []
      };

      const capacityData = cap?.ok && cap.data ? cap.data : {
        pressure: {
          pressure_bar_pct: 0,
          overload_risk: 'LOW',
          dispatch_contention: 0,
          estimated_backlog_mins: 0,
          routing_eligibility: ['CARBON_OPTIMIZED']
        },
        capabilities: {
          paper_types: ['COATED', 'UNCOATED'],
          gsm_ranges: ['80-350'],
          trim_formats: ['A4', 'US-LETTER'],
          max_sheet_size: 'B2',
          uv_support: false,
          varnish_support: false,
          foil_support: false,
          hardcover_support: false,
          sewn_binding_support: false,
          coating_support: false,
          lamination_support: false
        }
      };

      setData({
        federation: headerData,
        telemetry: telemetryData,
        history: historyData,
        capacity: capacityData
      });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const node = data?.federation;
  const instanceId = data?.federation?.instanceId ?? data?.federation?.instance_id ?? data?.federation?.id ?? 'N/A';
  const currentStatus = data?.federation?.status ?? 'UNKNOWN';
  const tier = data?.federation?.serviceTier ?? data?.federation?.service_tier ?? 'STANDARD';
  const trust = data?.federation?.trustLevel ?? data?.federation?.trust_level ?? 'MEDIUM';
  const regionName = data?.federation?.region ?? 'global';
  const endpointUrl = data?.federation?.endpoint ?? 'N/A';

  // Defensive array guards — eliminates TypeError: .map is not a function at runtime
  const capabilitiesArray = Array.isArray(data?.federation?.capabilities)
    ? data!.federation!.capabilities
    : Array.isArray(data?.capacity?.pressure?.routing_eligibility)
    ? data!.capacity!.pressure!.routing_eligibility
    : [];
  const dispatchArray = Array.isArray(data?.history?.incidents)
    ? data!.history!.incidents
    : [];

  // Pre-normalized scalars — eliminates direct property access crashes on null payloads
  const tel = data?.telemetry ?? {};
  const jobsRunning   = tel.jobs_running    ?? tel.jobsRunning    ?? 0;
  const jobsQueued    = tel.jobs_queued     ?? tel.jobsQueued     ?? 0;
  const jobsFailed    = tel.jobs_failed_24h ?? tel.jobsFailed24h  ?? 0;
  const throughput    = tel.throughput_h    ?? tel.throughputH    ?? 0;
  const utilization   = tel.utilization_pct ?? tel.utilizationPct ?? 0;
  const avgTurnaround = tel.avg_turnaround  ?? tel.avgTurnaround  ?? 0;

  const hist = data?.history ?? {};
  const t24h = hist.t24h ?? { completed: 0, failed: 0, sla_avg: 0, preflight_avg: 0 };
  const t7d  = hist.t7d  ?? { completed: 0, failed: 0 };

  const pressure      = data?.capacity?.pressure ?? {};
  const pressureBarPct       = pressure.pressure_bar_pct     ?? pressure.pressureBarPct     ?? 0;
  const overloadRisk         = pressure.overload_risk        ?? pressure.overloadRisk        ?? 'LOW';
  const dispatchContention   = pressure.dispatch_contention  ?? pressure.dispatchContention  ?? 0;
  const estimatedBacklogMins = pressure.estimated_backlog_mins ?? pressure.estimatedBacklogMins ?? 0;

  return (
    <Drawer 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`Node: ${instanceId}`}
      maxWidth="max-w-2xl"
    >
      <div className="glass border-l border-zinc-800 bg-zinc-950/85 backdrop-blur-md text-[#ECECF1] p-6 h-full shadow-2xl overflow-y-auto italic-text-off">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <BoltIcon className="w-8 h-8 text-[#dc0000] animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Syncing Industrial Data...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center p-12 text-center">
             <div className="space-y-4">
                <ExclamationCircleIcon className="w-12 h-12 text-[#dc0000] mx-auto" />
                <h3 className="text-lg font-black uppercase text-white">Telemetry Failure</h3>
                <p className="text-sm max-w-xs text-zinc-400">{toDisplayText(error)}</p>
                <button onClick={fetchAllData} className="px-6 py-2 border border-[#dc0000] text-[#dc0000] text-[10px] font-black uppercase hover:bg-[#dc0000] hover:text-white transition-all">Retry Synchronization</button>
             </div>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-8">
            {/* 1. MACHINE HEADER */}
            <section className="p-6 rounded-none border border-zinc-800 bg-zinc-950/40 text-[#ECECF1]">
               <div className="flex items-start justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-black uppercase leading-none mb-2 tracking-tight text-white">{toDisplayText(node?.name || `Node ${instanceId}`)}</h1>
                    <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                       <span>{toDisplayText(node?.manufacturer || 'SYNTHETIC_PEER')} / {toDisplayText(node?.model || 'EDGE_PROFILE')}</span>
                       <span className="w-1 h-1 bg-zinc-700 rounded-none" />
                       <span>{regionName}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`px-4 py-1 border text-[12px] font-black uppercase font-mono ${
                      currentStatus === 'ONLINE' || currentStatus === 'HEALTHY' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5 animate-pulse' :
                      currentStatus === 'DEGRADED' ? 'border-amber-500/40 text-amber-500 bg-amber-500/5' :
                      'border-red-600/40 text-[#dc0000] bg-red-600/5'
                    }`}>
                      {currentStatus}
                    </div>
                    <div className="text-[8px] font-black text-zinc-500 mt-2 uppercase tracking-tight font-mono">Heartbeat: {node?.heartbeat_age_sec ?? node?.heartbeatAgeSec ?? '---'}s ago</div>
                  </div>
               </div>

               <div className="grid grid-cols-4 gap-4 pt-4 border-t border-zinc-850">
                  <StatItem label="Uptime" value={`${node?.uptime_pct ?? node?.uptimePct ?? 100}%`} color="zinc" className="font-mono font-black text-xl tracking-tight text-white" />
                  <StatItem label="Region" value={regionName} color="zinc" />
                  <StatItem label="Mode" value={node?.mode ?? 'FEDERATED'} color="zinc" />
                  <StatItem label="Trust Tier" value={trust} color="emerald" />
               </div>
               
               <div className="mt-4 pt-4 border-t border-zinc-850 text-xs font-mono text-zinc-400 break-all">
                  <span className="text-zinc-500 uppercase mr-2 font-bold">Endpoint:</span>
                  {endpointUrl}
               </div>
            </section>

            {/* 2. INDUSTRIAL CAPABILITIES */}
            <section className="p-6 rounded-none border border-zinc-800 bg-zinc-950/40 text-[#ECECF1]">
               <SectionHeader icon={CpuChipIcon} title="Capabilities Matrix" />
               <div className="flex flex-wrap gap-2">
                 {capabilitiesArray.map((cap: string) => (
                     <span key={cap} className="px-2 py-0.5 font-mono text-[10px] font-black uppercase bg-zinc-900 border border-zinc-800 text-zinc-400 tracking-wider">
                         {cap}
                     </span>
                 ))}
                 {capabilitiesArray.length === 0 && (
                     <span className="text-[10px] font-mono font-black text-zinc-500 uppercase">No Capabilities Registered</span>
                 )}
               </div>
            </section>

            {/* 3. LIVE TELEMETRY */}
            <section className="p-6 rounded-none border border-zinc-800 bg-zinc-950/40 text-[#ECECF1]">
               <SectionHeader icon={BoltIcon} title="Live Telemetry" />
               <div className="grid grid-cols-3 gap-6">
                   <MetricCardItem label="Jobs Running" value={jobsRunning} subValue="Real-time Active" />
                   <MetricCardItem label="Jobs Queued" value={jobsQueued} subValue="Backlog Pressure" />
                   <MetricCardItem label="Jobs Failed (24h)" value={jobsFailed} subValue="Non-recoverable" color="red" />
                   <MetricCardItem label="Throughput/h" value={throughput} subValue="Completed Units" />
                   <MetricCardItem label="Utilization %" value={`${utilization}%`} subValue="Capacity Used" />
                   <MetricCardItem label="Avg Turnaround" value={`${avgTurnaround}m`} subValue="Lifecycle Average" />
               </div>
            </section>

            {/* 4. QUEUE PRESSURE */}
            <section className="p-6 rounded-none border border-zinc-800 bg-zinc-950/40 text-[#ECECF1]">
               <SectionHeader icon={QueueListIcon} title="Queue Pressure" />
               <div className="space-y-6">
                  <div className="space-y-2">
                     <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black uppercase text-zinc-500">Saturation Visualization</span>
                        <span className="text-sm font-black text-white font-mono">{pressureBarPct}%</span>
                     </div>
                     <div className="h-2 bg-zinc-900 flex border border-zinc-800">
                        <div 
                          className="h-full bg-[#dc0000] transition-all duration-1000" 
                          style={{ width: `${pressureBarPct}%` }} 
                        />
                     </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                     <div className="p-4 border border-zinc-800 bg-zinc-950/40 text-zinc-300">
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">Overload Risk</span>
                        <span className={`text-xs font-black uppercase ${
                          overloadRisk === 'HIGH' ? 'text-[#dc0000]' :
                          overloadRisk === 'MEDIUM' ? 'text-amber-500' :
                          'text-emerald-500'
                        }`}>{overloadRisk}</span>
                     </div>
                     <div className="p-4 border border-zinc-800 bg-zinc-950/40 text-zinc-300">
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">Dispatch Contention</span>
                        <span className="text-xs font-black uppercase text-white font-mono">{dispatchContention} Pending</span>
                     </div>
                     <div className="p-4 border border-zinc-800 bg-zinc-950/40 text-zinc-300">
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">Est. Backlog</span>
                        <span className="text-xs font-black uppercase text-white font-mono">{estimatedBacklogMins}m</span>
                     </div>
                  </div>
               </div>
            </section>

            {/* 5. HISTORICAL THROUGHPUT */}
            <section className="p-6 rounded-none border border-zinc-800 bg-zinc-950/40 text-[#ECECF1]">
               <SectionHeader icon={ChartBarIcon} title="Historical Performance" />
               <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-zinc-800 bg-zinc-950/20 space-y-4">
                     <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">24h Window</span>
                     <div className="space-y-2 font-mono">
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">SLA Success</span>
                           <span className="text-white">{t24h.sla_avg ?? 0}%</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">Preflight Score</span>
                           <span className="text-white">{t24h.preflight_avg ?? 0}%</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">Completed</span>
                           <span className="text-white">{t24h.completed ?? 0}</span>
                        </div>
                     </div>
                  </div>
                  <div className="p-4 border border-zinc-800 bg-zinc-950/20 space-y-4">
                     <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">7d Window</span>
                     <div className="space-y-2 font-mono">
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">Volume</span>
                           <span className="text-white">{t7d.completed ?? 0} Units</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">Failure Ratio</span>
                           <span className="text-[#dc0000]">{Number(((t7d.failed ?? 0) / (t7d.completed || 1)) * 100).toFixed(2)}%</span>
                        </div>
                     </div>
                  </div>
               </div>
            </section>
          </div>
        )}
      </div>
    </Drawer>
  );
};

const StatItem = ({ label, value, color, className }: { label: string, value: any, color: string, className?: string }) => (
  <div className="space-y-1">
    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">{label}</span>
    <span className={className || `text-sm font-black uppercase ${color === 'emerald' ? 'text-emerald-500' : 'text-[#ECECF1]'}`}>{value || '---'}</span>
  </div>
);

const SectionHeader = ({ icon: Icon, title }: { icon: any, title: string }) => (
  <div className="flex items-center gap-3 mb-4 border-l-2 border-[#dc0000] pl-3">
    <Icon className="w-4 h-4 text-[#dc0000]" />
    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#ECECF1]">{title}</h2>
  </div>
);

const MetricCardItem = ({ label, value, subValue, color }: { label: string, value: any, subValue: string, color?: string }) => (
  <div className="space-y-2 border-l border-zinc-850 pl-4 py-2 hover:border-[#dc0000] transition-colors">
    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{label}</span>
    <div className="flex flex-col">
       <span className={`font-mono font-black text-xl tracking-tight text-white ${color === 'red' ? 'text-[#dc0000]' : ''}`}>{value}</span>
       <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tight">{subValue}</span>
    </div>
  </div>
);
