import React, { useEffect, useState } from 'react';
import { 
  XMarkIcon, 
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
        header: headerData,
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

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex justify-end transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      
      {/* Drawer Panel */}
      <div className="relative w-full max-w-2xl bg-black border-l border-white/10 h-full flex flex-col text-white shadow-[20px_0_40px_rgba(0,0,0,1)] overflow-hidden">
        
        {/* Header Control */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-950">
           <div className="flex items-center gap-3">
             <div className="w-2 h-2 rounded-none bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Machine Intelligence Layer</span>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-white/5 transition-colors group">
             <XMarkIcon className="w-5 h-5 text-zinc-500 group-hover:text-white" />
           </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <BoltIcon className="w-8 h-8 text-red-600 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Syncing Industrial Data...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center p-12 text-center">
             <div className="space-y-4">
                <ExclamationCircleIcon className="w-12 h-12 text-red-600 mx-auto" />
                <h3 className="text-lg font-black uppercase italic">Telemetry Failure</h3>
                <p className="text-zinc-500 text-sm max-w-xs">{toDisplayText(error)}</p>
                <button onClick={fetchAllData} className="px-6 py-2 border border-red-600 text-red-600 text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-all">Retry Synchronization</button>
             </div>
          </div>
        )}

        {data && !loading && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            
            {/* 1. MACHINE HEADER */}
            <section className="p-8 border-b border-white/5">
               <div className="flex items-start justify-between mb-6">
                  <div>
                    <h1 className="text-3xl font-black uppercase leading-none mb-2 tracking-tighter">{toDisplayText(data.header?.name)}</h1>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                       <span>{toDisplayText(data.header?.manufacturer)} / {toDisplayText(data.header?.model)}</span>
                       <span className="w-1 h-1 bg-zinc-800 rounded-none" />
                       <span>{toDisplayText(data.header?.region)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`px-4 py-1 border text-[12px] font-black italic uppercase ${
                      data.header.status === 'ONLINE' ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/5' :
                      data.header.status === 'OFFLINE' ? 'border-red-600/40 text-red-600 bg-red-600/5' :
                      'border-amber-500/40 text-amber-500 bg-amber-500/5'
                    }`}>
                      {data.header.status}
                    </div>
                    <div className="text-[8px] font-black text-zinc-600 mt-2 uppercase tracking-tighter">Heartbeat: {data.header.heartbeat_age_sec || '---'}s ago</div>
                  </div>
               </div>

               <div className="grid grid-cols-4 gap-4">
                  <StatItem label="Uptime" value={`${data.header.uptime_pct}%`} color="zinc" />
                  <StatItem label="Region" value={data.header.region} color="zinc" />
                  <StatItem label="Mode" value={data.header.mode} color="zinc" />
                  <StatItem label="Federation" value="CONNECTED" color="emerald" />
               </div>
            </section>

            {/* 2. INDUSTRIAL CAPABILITIES */}
            <section className="p-8 border-b border-white/5 bg-zinc-950/30">
               <SectionHeader icon={CpuChipIcon} title="Industrial Capabilities" />
               <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                  <CapabilityGroup label="Media / GSM" items={(data.capacity?.capabilities?.paper_types || []).concat(data.capacity?.capabilities?.gsm_ranges || [])} />
                  <CapabilityGroup label="Formats / Max Size" items={(data.capacity?.capabilities?.trim_formats || []).concat([data.capacity?.capabilities?.max_sheet_size || 'N/A'])} />
                  <div className="col-span-2 grid grid-cols-4 gap-2 mt-2">
                     <CapabilityBadge label="UV" active={data.capacity.capabilities.uv_support} />
                     <CapabilityBadge label="Varnish" active={data.capacity.capabilities.varnish_support} />
                     <CapabilityBadge label="Foil" active={data.capacity.capabilities.foil_support} />
                     <CapabilityBadge label="Hardcover" active={data.capacity.capabilities.hardcover_support} />
                     <CapabilityBadge label="Sewn" active={data.capacity.capabilities.sewn_binding_support} />
                     <CapabilityBadge label="Coating" active={data.capacity.capabilities.coating_support} />
                     <CapabilityBadge label="Lamination" active={data.capacity.capabilities.lamination_support} />
                  </div>
               </div>
            </section>

            {/* 3. LIVE TELEMETRY */}
            <section className="p-8 border-b border-white/5">
               <SectionHeader icon={BoltIcon} title="Live Telemetry" />
               <div className="grid grid-cols-3 gap-6">
                  <MetricCard label="Jobs Running" value={data.telemetry.jobs_running} subValue="Real-time Active" />
                  <MetricCard label="Jobs Queued" value={data.telemetry.jobs_queued} subValue="Backlog Pressure" />
                  <MetricCard label="Jobs Failed (24h)" value={data.telemetry.jobs_failed_24h} subValue="Non-recoverable" color="red" />
                  <MetricCard label="Throughput/h" value={data.telemetry.throughput_h} subValue="Completed Units" />
                  <MetricCard label="Utilization %" value={`${data.telemetry.utilization_pct}%`} subValue="Capacity Used" />
                  <MetricCard label="Avg Turnaround" value={`${data.telemetry.avg_turnaround}m`} subValue="Lifecycle Average" />
               </div>
            </section>

            {/* 4. QUEUE PRESSURE */}
            <section className="p-8 border-b border-white/5 bg-zinc-950/30">
               <SectionHeader icon={QueueListIcon} title="Queue Pressure" />
               <div className="space-y-6">
                  <div className="space-y-2">
                     <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black uppercase text-zinc-500">Saturation Visualization</span>
                        <span className="text-sm font-black text-white">{data.capacity.pressure.pressure_bar_pct}%</span>
                     </div>
                     <div className="h-2 bg-zinc-900 border border-white/5 flex">
                        <div 
                          className="h-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)] transition-all duration-1000" 
                          style={{ width: `${data.capacity.pressure.pressure_bar_pct}%` }} 
                        />
                     </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                     <div className="p-4 bg-zinc-900 border border-white/5">
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">Overload Risk</span>
                        <span className={`text-xs font-black uppercase ${
                          data.capacity.pressure.overload_risk === 'HIGH' ? 'text-red-600' :
                          data.capacity.pressure.overload_risk === 'MEDIUM' ? 'text-amber-500' :
                          'text-emerald-500'
                        }`}>{data.capacity.pressure.overload_risk}</span>
                     </div>
                     <div className="p-4 bg-zinc-900 border border-white/5">
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">Dispatch Contention</span>
                        <span className="text-xs font-black uppercase text-white">{data.capacity.pressure.dispatch_contention} Pending</span>
                     </div>
                     <div className="p-4 bg-zinc-900 border border-white/5">
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">Est. Backlog</span>
                        <span className="text-xs font-black uppercase text-white">{data.capacity.pressure.estimated_backlog_mins}m</span>
                     </div>
                  </div>
               </div>
            </section>

            {/* 5. HISTORICAL THROUGHPUT */}
            <section className="p-8 border-b border-white/5">
               <SectionHeader icon={ChartBarIcon} title="Historical Performance" />
               <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 border border-white/5 space-y-4">
                     <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">24h Window</span>
                     <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">SLA Success Ratio</span>
                           <span className="text-white">{data.history.t24h.sla_avg}%</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">Avg Preflight Score</span>
                           <span className="text-white">{data.history.t24h.preflight_avg}%</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">Jobs Completed</span>
                           <span className="text-white">{data.history.t24h.completed}</span>
                        </div>
                     </div>
                  </div>
                  <div className="p-5 border border-white/5 space-y-4">
                     <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">7d Window</span>
                     <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">Volume</span>
                           <span className="text-white">{data.history.t7d.completed} Units</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className="text-zinc-500 uppercase">Failure Ratio</span>
                           <span className="text-red-600">{((data.history.t7d.failed / (data.history.t7d.completed || 1)) * 100).toFixed(2)}%</span>
                        </div>
                     </div>
                  </div>
               </div>
            </section>

            {/* 6. ROUTING ELIGIBILITY */}
            <section className="p-8 border-b border-white/5 bg-zinc-950/30">
               <SectionHeader icon={ShieldCheckIcon} title="Routing Eligibility" />
               <div className="flex flex-wrap gap-2">
                  {(data.capacity?.pressure?.routing_eligibility || []).map((tag: string) => (
                    <div key={tag} className="px-3 py-1.5 border border-white/10 bg-white/5 text-[10px] font-black uppercase italic tracking-widest">
                       {tag.replace('_', ' ')}
                    </div>
                  ))}
                  {(data.capacity?.pressure?.routing_eligibility || []).length === 0 && (
                    <span className="text-[10px] font-black text-zinc-700 uppercase italic">NO SPECIAL ELIGIBILITY DETECTED</span>
                  )}
               </div>
            </section>

            {/* 7. LIVE INCIDENTS */}
            <section className="p-8 pb-12">
               <SectionHeader icon={ExclamationCircleIcon} title="Recent Incidents" />
               <div className="space-y-2">
                  {(data.history?.incidents || []).map((incident: any) => (
                    <div key={incident?.id || Math.random()} className="p-4 border border-white/5 bg-zinc-900 flex items-start justify-between group">
                       <div className="space-y-1">
                          <div className="flex items-center gap-2">
                             <span className={`w-1.5 h-1.5 rounded-none ${incident?.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-amber-500'}`} />
                             <span className="text-[10px] font-black uppercase text-white tracking-widest">{toDisplayText(incident?.type || 'INCIDENT')}</span>
                          </div>
                          <p className="text-xs text-zinc-400 font-medium">{toDisplayText(incident?.message)}</p>
                       </div>
                       <span className="text-[8px] font-bold text-zinc-600 uppercase whitespace-nowrap">{incident?.created_at ? new Date(incident.created_at).toLocaleTimeString() : ''}</span>
                    </div>
                  ))}
                  {(data.history?.incidents || []).length === 0 && (
                    <div className="py-8 text-center border border-dashed border-white/5 opacity-20 text-[10px] font-black uppercase italic">No active incidents detected.</div>
                  )}
               </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
};

const StatItem = ({ label, value, color }: { label: string, value: any, color: string }) => (
  <div className="space-y-1">
    <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest block">{label}</span>
    <span className={`text-sm font-black uppercase ${color === 'emerald' ? 'text-emerald-500' : 'text-white'}`}>{value || '---'}</span>
  </div>
);

const SectionHeader = ({ icon: Icon, title }: { icon: any, title: string }) => (
  <div className="flex items-center gap-3 mb-6 border-l-2 border-primary pl-4">
    <Icon className="w-5 h-5 text-primary" />
    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400">{title}</h2>
  </div>
);

const CapabilityGroup = ({ label, items }: { label: string, items: string[] }) => (
  <div className="space-y-3">
    <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{label}</span>
    <div className="flex flex-wrap gap-1.5">
       {items.map((it, i) => (
         <span key={i} className="text-[10px] font-bold text-zinc-300 bg-zinc-900 px-2 py-0.5 border border-white/5 uppercase">{it}</span>
       ))}
    </div>
  </div>
);

const CapabilityBadge = ({ label, active }: { label: string, active: boolean }) => (
  <div className={`py-2 px-1 border text-center transition-all ${
    active ? 'border-white/20 bg-white/5 text-white' : 'border-white/5 text-zinc-800'
  }`}>
    <span className="text-[8px] font-black uppercase tracking-tighter">{label}</span>
  </div>
);

const MetricCard = ({ label, value, subValue, color }: { label: string, value: any, subValue: string, color?: string }) => (
  <div className="space-y-2 border-l border-white/10 pl-4 py-2 hover:border-red-600 transition-colors">
    <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{label}</span>
    <div className="flex flex-col">
       <span className={`text-2xl font-black italic tracking-tighter ${color === 'red' ? 'text-red-600' : 'text-white'}`}>{value}</span>
       <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-tight">{subValue}</span>
    </div>
  </div>
);
