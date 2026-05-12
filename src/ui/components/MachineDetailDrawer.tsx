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

  return (
    <Drawer 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`Machine: ${data?.header?.name ? toDisplayText(data.header.name) : (machineId || 'Details')}`}
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col h-full italic-text-off">
        {loading && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <BoltIcon className="w-8 h-8 text-[#dc0000] animate-pulse" />
              <span className={`text-[10px] font-black uppercase tracking-widest ${COLORS.adaptive.textMuted}`}>Syncing Industrial Data...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center p-12 text-center">
             <div className="space-y-4">
                <ExclamationCircleIcon className="w-12 h-12 text-[#dc0000] mx-auto" />
                <h3 className={`text-lg font-black uppercase ${COLORS.adaptive.textPrimary}`}>Telemetry Failure</h3>
                <p className={`text-sm max-w-xs ${COLORS.adaptive.textSecondary}`}>{toDisplayText(error)}</p>
                <button onClick={fetchAllData} className="px-6 py-2 border border-[#dc0000] text-[#dc0000] text-[10px] font-black uppercase hover:bg-[#dc0000] hover:text-white transition-all">Retry Synchronization</button>
             </div>
          </div>
        )}

        {data && !loading && (
          <div className="flex-1 space-y-8">
            {/* 1. MACHINE HEADER */}
            <section className={`p-6 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
               <div className="flex items-start justify-between mb-6">
                  <div>
                    <h1 className={`text-2xl font-black uppercase leading-none mb-2 tracking-tight ${COLORS.adaptive.textPrimary}`}>{toDisplayText(data.header?.name)}</h1>
                    <div className={`flex items-center gap-4 text-[10px] font-bold ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>
                       <span>{toDisplayText(data.header?.manufacturer)} / {toDisplayText(data.header?.model)}</span>
                       <span className="w-1 h-1 bg-zinc-500 rounded-none" />
                       <span>{toDisplayText(data.header?.region)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`px-4 py-1 border text-[12px] font-black uppercase ${
                      data.header.status === 'ONLINE' ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-500 bg-emerald-500/5' :
                      data.header.status === 'OFFLINE' ? 'border-red-600/40 text-[#dc0000] bg-red-600/5' :
                      'border-amber-500/40 text-amber-600 dark:text-amber-500 bg-amber-500/5'
                    }`}>
                      {data.header.status}
                    </div>
                    <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} mt-2 uppercase tracking-tight`}>Heartbeat: {data.header.heartbeat_age_sec || '---'}s ago</div>
                  </div>
               </div>

               <div className="grid grid-cols-4 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                  <StatItem label="Uptime" value={`${data.header.uptime_pct}%`} color="zinc" />
                  <StatItem label="Region" value={data.header.region} color="zinc" />
                  <StatItem label="Mode" value={data.header.mode} color="zinc" />
                  <StatItem label="Federation" value="CONNECTED" color="emerald" />
               </div>
            </section>

            {/* 2. INDUSTRIAL CAPABILITIES */}
            <section className={`p-6 rounded-none border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.surfaceMuted}`}>
               <SectionHeader icon={CpuChipIcon} title="Industrial Capabilities" />
               <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                  <CapabilityGroup label="Media / GSM" items={safeArray(data.capacity?.capabilities?.paper_types).concat(safeArray(data.capacity?.capabilities?.gsm_ranges))} />
                  <CapabilityGroup label="Formats / Max Size" items={safeArray(data.capacity?.capabilities?.trim_formats).concat([data.capacity?.capabilities?.max_sheet_size || 'N/A'])} />
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
            <section className={`p-6 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
               <SectionHeader icon={BoltIcon} title="Live Telemetry" />
               <div className="grid grid-cols-3 gap-6">
                  <MetricCardItem label="Jobs Running" value={data.telemetry.jobs_running} subValue="Real-time Active" />
                  <MetricCardItem label="Jobs Queued" value={data.telemetry.jobs_queued} subValue="Backlog Pressure" />
                  <MetricCardItem label="Jobs Failed (24h)" value={data.telemetry.jobs_failed_24h} subValue="Non-recoverable" color="red" />
                  <MetricCardItem label="Throughput/h" value={data.telemetry.throughput_h} subValue="Completed Units" />
                  <MetricCardItem label="Utilization %" value={`${data.telemetry.utilization_pct}%`} subValue="Capacity Used" />
                  <MetricCardItem label="Avg Turnaround" value={`${data.telemetry.avg_turnaround}m`} subValue="Lifecycle Average" />
               </div>
            </section>

            {/* 4. QUEUE PRESSURE */}
            <section className={`p-6 rounded-none border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.surfaceMuted}`}>
               <SectionHeader icon={QueueListIcon} title="Queue Pressure" />
               <div className="space-y-6">
                  <div className="space-y-2">
                     <div className="flex justify-between items-end">
                        <span className={`text-[10px] font-black uppercase ${COLORS.adaptive.textMuted}`}>Saturation Visualization</span>
                        <span className={`text-sm font-black ${COLORS.adaptive.textPrimary}`}>{data.capacity.pressure.pressure_bar_pct}%</span>
                     </div>
                     <div className="h-2 bg-zinc-200 dark:bg-zinc-800 flex">
                        <div 
                          className="h-full bg-[#dc0000] transition-all duration-1000" 
                          style={{ width: `${data.capacity.pressure.pressure_bar_pct}%` }} 
                        />
                     </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                     <div className={`p-4 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
                        <span className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase block mb-1`}>Overload Risk</span>
                        <span className={`text-xs font-black uppercase ${
                          data.capacity.pressure.overload_risk === 'HIGH' ? 'text-[#dc0000]' :
                          data.capacity.pressure.overload_risk === 'MEDIUM' ? 'text-amber-500' :
                          'text-emerald-500'
                        }`}>{data.capacity.pressure.overload_risk}</span>
                     </div>
                     <div className={`p-4 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
                        <span className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase block mb-1`}>Dispatch Contention</span>
                        <span className={`text-xs font-black uppercase ${COLORS.adaptive.textPrimary}`}>{data.capacity.pressure.dispatch_contention} Pending</span>
                     </div>
                     <div className={`p-4 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
                        <span className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase block mb-1`}>Est. Backlog</span>
                        <span className={`text-xs font-black uppercase ${COLORS.adaptive.textPrimary}`}>{data.capacity.pressure.estimated_backlog_mins}m</span>
                     </div>
                  </div>
               </div>
            </section>

            {/* 5. HISTORICAL THROUGHPUT */}
            <section className={`p-6 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
               <SectionHeader icon={ChartBarIcon} title="Historical Performance" />
               <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 border ${COLORS.adaptive.borderSubtle} space-y-4`}>
                     <span className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>24h Window</span>
                     <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className={`${COLORS.adaptive.textMuted} uppercase`}>SLA Success Ratio</span>
                           <span className={COLORS.adaptive.textPrimary}>{data.history.t24h.sla_avg}%</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className={`${COLORS.adaptive.textMuted} uppercase`}>Avg Preflight Score</span>
                           <span className={COLORS.adaptive.textPrimary}>{data.history.t24h.preflight_avg}%</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className={`${COLORS.adaptive.textMuted} uppercase`}>Jobs Completed</span>
                           <span className={COLORS.adaptive.textPrimary}>{data.history.t24h.completed}</span>
                        </div>
                     </div>
                  </div>
                  <div className={`p-4 border ${COLORS.adaptive.borderSubtle} space-y-4`}>
                     <span className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>7d Window</span>
                     <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className={`${COLORS.adaptive.textMuted} uppercase`}>Volume</span>
                           <span className={COLORS.adaptive.textPrimary}>{data.history.t7d.completed} Units</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold">
                           <span className={`${COLORS.adaptive.textMuted} uppercase`}>Failure Ratio</span>
                           <span className="text-[#dc0000]">{Number(((data.history.t7d.failed || 0) / (data.history.t7d.completed || 1)) * 100).toFixed(2)}%</span>
                        </div>
                     </div>
                  </div>
               </div>
            </section>

            {/* 6. ROUTING ELIGIBILITY */}
            <section className={`p-6 rounded-none border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.surfaceMuted}`}>
               <SectionHeader icon={ShieldCheckIcon} title="Routing Eligibility" />
               <div className="flex flex-wrap gap-2">
                  {safeArray(data.capacity?.pressure?.routing_eligibility).map((tag: string) => (
                    <div key={tag} className={`px-3 py-1.5 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} text-[10px] font-black uppercase tracking-widest ${COLORS.adaptive.textPrimary}`}>
                       {tag.replace('_', ' ')}
                    </div>
                  ))}
                  {safeArray(data.capacity?.pressure?.routing_eligibility).length === 0 && (
                    <span className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase`}>NO SPECIAL ELIGIBILITY DETECTED</span>
                  )}
               </div>
            </section>

            {/* 7. LIVE INCIDENTS */}
            <section className="pt-2">
               <SectionHeader icon={ExclamationCircleIcon} title="Recent Incidents" />
               <div className="space-y-2 mt-4">
                  {safeArray(data.history?.incidents).map((incident: any) => (
                    <div key={incident?.id || Math.random()} className={`p-4 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} flex items-start justify-between group`}>
                       <div className="space-y-1">
                          <div className="flex items-center gap-2">
                             <span className={`w-1.5 h-1.5 rounded-none ${incident?.severity === 'CRITICAL' ? 'bg-[#dc0000]' : 'bg-amber-500'}`} />
                             <span className={`text-[10px] font-black uppercase ${COLORS.adaptive.textPrimary} tracking-widest`}>{toDisplayText(incident?.type || 'INCIDENT')}</span>
                          </div>
                          <p className={`text-xs ${COLORS.adaptive.textSecondary} font-medium`}>{toDisplayText(incident?.message)}</p>
                       </div>
                       <span className={`text-[8px] font-bold ${COLORS.adaptive.textMuted} uppercase whitespace-nowrap`}>{incident?.created_at ? new Date(incident.created_at).toLocaleTimeString() : ''}</span>
                    </div>
                  ))}
                  {safeArray(data.history?.incidents).length === 0 && (
                    <div className={`py-8 text-center border border-dashed ${COLORS.adaptive.borderSubtle} text-[10px] font-black uppercase ${COLORS.adaptive.textMuted}`}>No active incidents detected.</div>
                  )}
               </div>
            </section>
          </div>
        )}
      </div>
    </Drawer>
  );
};

const StatItem = ({ label, value, color }: { label: string, value: any, color: string }) => (
  <div className="space-y-1">
    <span className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest block`}>{label}</span>
    <span className={`text-sm font-black uppercase ${color === 'emerald' ? 'text-emerald-600 dark:text-emerald-500' : COLORS.adaptive.textPrimary}`}>{value || '---'}</span>
  </div>
);

const SectionHeader = ({ icon: Icon, title }: { icon: any, title: string }) => (
  <div className="flex items-center gap-3 mb-4 border-l-2 border-[#dc0000] pl-3">
    <Icon className="w-4 h-4 text-[#dc0000]" />
    <h2 className={`text-xs font-black uppercase tracking-[0.2em] ${COLORS.adaptive.textSecondary}`}>{title}</h2>
  </div>
);

const CapabilityGroup = ({ label, items }: { label: string, items: string[] }) => (
  <div className="space-y-3">
    <span className={`text-[9px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>{label}</span>
    <div className="flex flex-wrap gap-1.5">
       {items.map((it, i) => (
         <span key={i} className={`text-[10px] font-bold ${COLORS.adaptive.textPrimary} ${COLORS.adaptive.surface} px-2 py-0.5 border ${COLORS.adaptive.borderPrimary} uppercase`}>{it}</span>
       ))}
    </div>
  </div>
);

const CapabilityBadge = ({ label, active }: { label: string, active: boolean }) => (
  <div className={`py-2 px-1 border text-center transition-all ${
    active ? `border-[#dc0000]/40 bg-[#dc0000]/5 ${COLORS.adaptive.textPrimary}` : `${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.textMuted}`
  }`}>
    <span className="text-[8px] font-black uppercase tracking-tight">{label}</span>
  </div>
);

const MetricCardItem = ({ label, value, subValue, color }: { label: string, value: any, subValue: string, color?: string }) => (
  <div className={`space-y-2 border-l ${COLORS.adaptive.borderSubtle} pl-4 py-2 hover:border-[#dc0000] transition-colors`}>
    <span className={`text-[9px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>{label}</span>
    <div className="flex flex-col">
       <span className={`text-2xl font-black tracking-tight ${color === 'red' ? 'text-[#dc0000]' : COLORS.adaptive.textPrimary}`}>{value}</span>
       <span className={`text-[8px] font-bold ${COLORS.adaptive.textMuted} uppercase tracking-tight`}>{subValue}</span>
    </div>
  </div>
);
