import React, { useEffect, useState } from 'react';
import { 
  BoltIcon, 
  CpuChipIcon, 
  QueueListIcon, 
  ChartBarIcon, 
  ShieldCheckIcon,
  ExclamationCircleIcon,
  MapPinIcon
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
import { useLocale } from '../i18n';
import { useTheme } from '../hooks/useTheme';

export interface MachineDetailDrawerProps {
  machineId: string | null;
  nodeContext?: any;
  isOpen: boolean;
  onClose: () => void;
}

export const MachineDetailDrawer: React.FC<MachineDetailDrawerProps> = ({ 
  machineId, 
  nodeContext, 
  isOpen, 
  onClose 
}) => {
  const { t } = useLocale();
  const theme = useTheme();
  const isLight = theme === 'light';

  const [data, setData] = useState<{
    federation: any;
    telemetry: any;
    history: any;
    capacity: any;
  }>({
    federation: null,
    telemetry: null,
    history: null,
    capacity: null
  });
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

      const fedVal = fedRes.status === 'fulfilled' ? fedRes.value : null;
      const telVal = telRes.status === 'fulfilled' ? telRes.value : null;
      const disVal = disRes.status === 'fulfilled' ? disRes.value : null;
      const capVal = capRes.status === 'fulfilled' ? capRes.value : null;

      // Discard polymorphic empty array fallbacks from offline backend
      const hasRealFed = Boolean(fedVal?.ok && fedVal?.data && !Array.isArray(fedVal.data));
      const hasRealTel = Boolean(telVal?.ok && telVal?.data && !Array.isArray(telVal.data));
      const hasRealDis = Boolean(disVal?.ok && disVal?.data && !Array.isArray(disVal.data));
      const hasRealCap = Boolean(capVal?.ok && capVal?.data && !Array.isArray(capVal.data));

      setData({
        federation: hasRealFed ? fedVal.data : null,
        telemetry: hasRealTel ? telVal.data : null,
        history: hasRealDis ? disVal.data : null,
        capacity: hasRealCap ? capVal.data : null
      });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 1. Resolve Node Identity (strictly preserved from nodeContext or machineId)
  const resolvedNodeId = nodeContext?.id || (machineId && !machineId.startsWith('machine_') ? machineId : (data.federation?.id || 'N/A'));
  const resolvedNodeName = nodeContext?.company_name || nodeContext?.name || data.federation?.company_name || data.federation?.name || (resolvedNodeId !== 'N/A' ? `${t('drawer.node') || 'Nodo'} ${resolvedNodeId}` : (t('common.noData') || 'Sin datos'));
  const resolvedRegion = nodeContext?.region || nodeContext?.country || data.federation?.region || data.federation?.country || (t('common.noData') || 'Sin datos');
  const resolvedStatus = toDisplayText(nodeContext?.status || (nodeContext?.is_active ? 'ONLINE' : (data.federation?.status || 'OFFLINE')));
  const trustTier = nodeContext?.trustLevel || nodeContext?.trust_level || data.federation?.trustLevel || data.federation?.trust_level || 'STANDARD';
  const nodeMode = nodeContext?.mode || data.federation?.mode || 'FEDERATED';

  // Coordinates
  const lat = nodeContext?.lat ?? nodeContext?.latitude ?? data.federation?.lat;
  const lng = nodeContext?.lng ?? nodeContext?.longitude ?? data.federation?.lng;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

  // 2. Resolve Machine Identity vs Node (do NOT invent synthetic machine if unassigned)
  const hasAssociatedMachine = Boolean(
    nodeContext?.machine || 
    nodeContext?.machineId || 
    (Array.isArray(nodeContext?.machines) && nodeContext.machines.length > 0) ||
    (data.federation?.isMachine || data.federation?.machineId)
  );
  const machineObj = nodeContext?.machine || (Array.isArray(nodeContext?.machines) ? nodeContext.machines[0] : null) || (hasAssociatedMachine ? data.federation : null);

  // 3. Resolve Telemetry & Metrics (Strictly "Sin datos" if missing, NO fake 100% defaults)
  const tel = data.telemetry;
  const cap = data.capacity;
  const hist = data.history;

  const uptimeVal = data.federation?.uptime_pct ?? data.federation?.uptimePct ?? nodeContext?.uptime_pct;
  const uptimeDisplay = (typeof uptimeVal === 'number') ? `${uptimeVal}%` : (t('common.noData') || 'Sin datos');

  const jobsRunning = tel ? (tel.jobs_running ?? tel.jobsRunning ?? (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');
  const jobsQueued = tel ? (tel.jobs_queued ?? tel.jobsQueued ?? (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');
  const jobsFailed = tel ? (tel.jobs_failed_24h ?? tel.jobsFailed24h ?? (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');
  const throughput = tel ? (tel.throughput_h ?? tel.throughputH ?? (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');
  const utilization = tel ? ((tel.utilization_pct ?? tel.utilizationPct) != null ? `${tel.utilization_pct ?? tel.utilizationPct}%` : (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');
  const avgTurnaround = tel ? ((tel.avg_turnaround ?? tel.avgTurnaround) != null ? `${tel.avg_turnaround ?? tel.avgTurnaround}m` : (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');

  // Queue Pressure
  const pressureObj = cap?.pressure;
  const pressureBarPct = pressureObj ? (pressureObj.pressure_bar_pct ?? pressureObj.pressureBarPct ?? 0) : (typeof nodeContext?.queuePressure === 'number' ? nodeContext.queuePressure : 0);
  const overloadRisk = pressureObj ? (pressureObj.overload_risk ?? pressureObj.overloadRisk ?? (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');
  const dispatchContention = pressureObj ? (pressureObj.dispatch_contention ?? pressureObj.dispatchContention != null ? `${pressureObj.dispatch_contention ?? pressureObj.dispatchContention}` : (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');
  const estimatedBacklogMins = pressureObj ? (pressureObj.estimated_backlog_mins ?? pressureObj.estimatedBacklogMins != null ? `${pressureObj.estimated_backlog_mins ?? pressureObj.estimatedBacklogMins}m` : (t('common.noData') || 'Sin datos')) : (t('common.noData') || 'Sin datos');

  // Historical
  const t24h = hist?.t24h;
  const t7d = hist?.t7d;
  const slaAvg = t24h?.sla_avg != null ? `${t24h.sla_avg}%` : (t('common.noData') || 'Sin datos');
  const preflightAvg = t24h?.preflight_avg != null ? `${t24h.preflight_avg}%` : (t('common.noData') || 'Sin datos');
  const completed24h = t24h?.completed != null ? `${t24h.completed}` : (t('common.noData') || 'Sin datos');
  const volume7d = t7d?.completed != null ? `${t7d.completed}` : (t('common.noData') || 'Sin datos');
  const failureRatio = (t7d?.failed != null && t7d?.completed != null && t7d.completed > 0) ? `${((t7d.failed / t7d.completed) * 100).toFixed(1)}%` : (t('common.noData') || 'Sin datos');

  // Capabilities
  const capabilities = safeArray(data.federation?.capabilities || nodeContext?.capabilities || cap?.capabilities?.paper_types || []);

  const drawerTitle = resolvedNodeId !== 'N/A' 
    ? `${t('drawer.node') || 'Nodo'}: ${resolvedNodeId}` 
    : (t('drawer.title') || 'Detalle Operativo');

  return (
    <Drawer 
      isOpen={isOpen} 
      onClose={onClose} 
      title={drawerTitle}
      maxWidth="max-w-2xl"
    >
      <div className={`p-6 h-full overflow-y-auto italic-text-off transition-colors ${
        isLight ? 'bg-white text-slate-900' : 'bg-zinc-950 text-zinc-100'
      }`}>
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <BoltIcon className="w-8 h-8 text-[#dc0000] animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                {t('drawer.syncing') || 'Sincronizando datos industriales...'}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center p-12 text-center">
             <div className="space-y-4">
                <ExclamationCircleIcon className="w-12 h-12 text-[#dc0000] mx-auto" />
                <h3 className={`text-lg font-black uppercase ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {t('drawer.telemetryFailure') || 'Fallo de Telemetría'}
                </h3>
                <p className="text-sm max-w-xs text-zinc-500">{toDisplayText(error)}</p>
                <button 
                  onClick={fetchAllData} 
                  className="px-6 py-2 border border-[#dc0000] text-[#dc0000] text-[10px] font-black uppercase hover:bg-[#dc0000] hover:text-white transition-all"
                >
                  {t('drawer.retrySync') || 'Reintentar Sincronización'}
                </button>
             </div>
          </div>
        )}

        {!loading && (
          <div className="space-y-6">
            {/* 1. NODE IDENTITY HEADER */}
            <section className={`p-5 rounded-none border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-zinc-900/40 border-zinc-800 text-zinc-100'
            }`}>
               <div className="flex items-start justify-between mb-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-[#dc0000] uppercase tracking-wider font-mono">
                      ID: {resolvedNodeId}
                    </span>
                    <h1 className={`text-xl font-black uppercase leading-tight tracking-tight ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}>
                      {resolvedNodeName}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                       <span>{t('drawer.region') || 'Región'}: {resolvedRegion}</span>
                       {hasCoords && (
                         <>
                           <span className="w-1 h-1 bg-zinc-400 rounded-full" />
                           <span className="flex items-center gap-1 font-mono text-emerald-500">
                             <MapPinIcon className="w-3 h-3" />
                             {lat.toFixed(2)}, {lng.toFixed(2)}
                           </span>
                         </>
                       )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-3 py-1 border text-[11px] font-black uppercase font-mono block ${
                      resolvedStatus === 'ONLINE' || resolvedStatus === 'HEALTHY' 
                        ? 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10 animate-pulse' 
                        : resolvedStatus === 'DEGRADED' 
                          ? 'border-amber-500/40 text-amber-500 bg-amber-500/10' 
                          : 'border-zinc-500/40 text-zinc-400 bg-zinc-500/10'
                    }`}>
                      {resolvedStatus}
                    </span>
                    <span className="text-[8px] font-bold text-zinc-400 mt-1.5 uppercase tracking-tight font-mono block">
                      {t('drawer.heartbeat') || 'Latido'}: {data.federation?.heartbeat_age_sec != null ? `${data.federation.heartbeat_age_sec}s` : (t('common.noData') || 'Sin datos')}
                    </span>
                  </div>
               </div>

               <div className="grid grid-cols-4 gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs">
                  <StatItem label={t('drawer.uptime') || 'Disponibilidad'} value={uptimeDisplay} isLight={isLight} />
                  <StatItem label={t('drawer.region') || 'Región'} value={resolvedRegion} isLight={isLight} />
                  <StatItem label={t('drawer.mode') || 'Modo'} value={nodeMode} isLight={isLight} />
                  <StatItem label={t('drawer.trustTier') || 'Confianza'} value={trustTier} color="emerald" isLight={isLight} />
               </div>
            </section>

            {/* 2. EQUIPMENT / PHYSICAL MACHINE SECTION (Distinct from Node) */}
            <section className={`p-5 rounded-none border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-zinc-900/40 border-zinc-800 text-zinc-100'
            }`}>
               <SectionHeader icon={CpuChipIcon} title={t('drawer.equipment') || 'Equipamiento Industrial'} isLight={isLight} />
               {hasAssociatedMachine && machineObj ? (
                 <div className="space-y-2">
                   <div className="flex items-center justify-between text-xs">
                     <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                       {toDisplayText(machineObj.name || machineObj.model || t('drawer.machine') || 'Máquina')}
                     </span>
                     <span className="font-mono text-[10px] text-zinc-500 uppercase">
                       {toDisplayText(machineObj.status || 'READY')}
                     </span>
                   </div>
                   <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                     {toDisplayText(machineObj.manufacturer || '---')} / {toDisplayText(machineObj.model || '---')}
                   </div>
                 </div>
               ) : (
                 <div className={`p-4 border rounded-none text-center ${
                   isLight ? 'bg-white border-dashed border-slate-300 text-zinc-500' : 'bg-zinc-950/40 border-dashed border-zinc-800 text-zinc-400'
                 }`}>
                   <CpuChipIcon className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
                   <span className={`text-xs font-bold block ${isLight ? 'text-slate-800' : 'text-zinc-200'}`}>
                     {t('drawer.noMachineAssociated') || 'Sin máquina física asociada al nodo'}
                   </span>
                   <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 block font-mono">
                     {t('drawer.unassignedEquipment') || 'Equipo no asignado (Solo infraestructura de nodo)'}
                   </span>
                 </div>
               )}
            </section>

            {/* 3. CAPABILITIES */}
            <section className={`p-5 rounded-none border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-zinc-900/40 border-zinc-800 text-zinc-100'
            }`}>
               <SectionHeader icon={CpuChipIcon} title={t('drawer.capabilities') || 'Matriz de Capacidades'} isLight={isLight} />
               <div className="flex flex-wrap gap-2">
                 {capabilities.map((cap: string, idx: number) => (
                     <span 
                       key={idx} 
                       className={`px-2 py-0.5 font-mono text-[10px] font-bold uppercase border tracking-wider ${
                         isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                       }`}
                     >
                         {cap}
                     </span>
                 ))}
                 {capabilities.length === 0 && (
                     <span className="text-[11px] font-mono text-zinc-400 italic">
                       {t('drawer.noCapabilities') || 'Sin capacidades registradas'}
                     </span>
                 )}
               </div>
            </section>

            {/* 4. LIVE TELEMETRY */}
            <section className={`p-5 rounded-none border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-zinc-900/40 border-zinc-800 text-zinc-100'
            }`}>
               <SectionHeader icon={BoltIcon} title={t('drawer.liveTelemetry') || 'Telemetría en Vivo'} isLight={isLight} />
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                   <MetricCardItem label={t('drawer.jobsRunning') || 'Trabajos Activos'} value={jobsRunning} subValue={t('drawer.subRealtime') || 'Tiempo real'} isLight={isLight} />
                   <MetricCardItem label={t('drawer.jobsQueued') || 'Trabajos en Cola'} value={jobsQueued} subValue={t('drawer.subBacklog') || 'En cola'} isLight={isLight} />
                   <MetricCardItem label={t('drawer.jobsFailed24h') || 'Fallidos (24h)'} value={jobsFailed} subValue={t('drawer.subNonRecoverable') || 'No recuperable'} color="red" isLight={isLight} />
                   <MetricCardItem label={t('drawer.throughputH') || 'Rendimiento/h'} value={throughput} subValue={t('drawer.subCompleted') || 'Completado'} isLight={isLight} />
                   <MetricCardItem label={t('drawer.utilization') || 'Utilización'} value={utilization} subValue={t('drawer.subCapacity') || 'Capacidad'} isLight={isLight} />
                   <MetricCardItem label={t('drawer.avgTurnaround') || 'Entrega Media'} value={avgTurnaround} subValue={t('drawer.subAverage') || 'Promedio'} isLight={isLight} />
               </div>
               {!tel && (
                 <p className="text-[10px] text-zinc-400 italic mt-3 font-mono">
                   {t('drawer.noTelemetry') || 'Sin datos de telemetría en vivo disponibles para este nodo'}
                 </p>
               )}
            </section>

            {/* 5. QUEUE PRESSURE */}
            <section className={`p-5 rounded-none border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-zinc-900/40 border-zinc-800 text-zinc-100'
            }`}>
               <SectionHeader icon={QueueListIcon} title={t('drawer.queuePressure') || 'Presión de Cola'} isLight={isLight} />
               <div className="space-y-4">
                  <div className="space-y-1.5">
                     <div className="flex justify-between items-end text-xs font-mono">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">{t('drawer.saturation') || 'Saturación'}</span>
                        <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {pressureBarPct > 0 ? `${pressureBarPct}%` : (t('common.noData') || 'Sin datos')}
                        </span>
                     </div>
                     <div className={`h-2 border overflow-hidden ${isLight ? 'bg-slate-200 border-slate-300' : 'bg-zinc-900 border-zinc-800'}`}>
                        <div 
                          className="h-full bg-[#dc0000] transition-all duration-500" 
                          style={{ width: `${Math.min(pressureBarPct, 100)}%` }} 
                        />
                     </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                     <div className={`p-3 border ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-950/60 border-zinc-800'}`}>
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">
                          {t('drawer.overloadRisk') || 'Riesgo Sobrecarga'}
                        </span>
                        <span className={`text-xs font-black uppercase font-mono ${
                          overloadRisk === 'HIGH' ? 'text-[#dc0000]' :
                          overloadRisk === 'MEDIUM' ? 'text-amber-500' :
                          overloadRisk === 'LOW' ? 'text-emerald-500' : 'text-zinc-400'
                        }`}>{overloadRisk}</span>
                     </div>
                     <div className={`p-3 border ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-950/60 border-zinc-800'}`}>
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">
                          {t('drawer.dispatchContention') || 'Contención'}
                        </span>
                        <span className={`text-xs font-black uppercase font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {dispatchContention}
                        </span>
                     </div>
                     <div className={`p-3 border ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-950/60 border-zinc-800'}`}>
                        <span className="text-[8px] font-black text-zinc-500 uppercase block mb-1">
                          {t('drawer.estBacklog') || 'Cola Est.'}
                        </span>
                        <span className={`text-xs font-black uppercase font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {estimatedBacklogMins}
                        </span>
                     </div>
                  </div>
               </div>
            </section>

            {/* 6. HISTORICAL PERFORMANCE */}
            <section className={`p-5 rounded-none border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-zinc-900/40 border-zinc-800 text-zinc-100'
            }`}>
               <SectionHeader icon={ChartBarIcon} title={t('drawer.historicalPerformance') || 'Rendimiento Histórico'} isLight={isLight} />
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={`p-4 border space-y-3 ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-950/40 border-zinc-800'}`}>
                     <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">
                       {t('drawer.window24h') || 'Ventana 24h'}
                     </span>
                     <div className="space-y-1.5 font-mono text-[11px]">
                        <div className="flex justify-between">
                           <span className="text-zinc-500 uppercase">{t('drawer.slaSuccess') || 'SLA'}:</span>
                           <span className={isLight ? 'text-slate-800 font-bold' : 'text-white font-bold'}>{slaAvg}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-zinc-500 uppercase">{t('drawer.preflightScore') || 'Preflight'}:</span>
                           <span className={isLight ? 'text-slate-800 font-bold' : 'text-white font-bold'}>{preflightAvg}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-zinc-500 uppercase">{t('drawer.completed') || 'Completados'}:</span>
                           <span className={isLight ? 'text-slate-800 font-bold' : 'text-white font-bold'}>{completed24h}</span>
                        </div>
                     </div>
                  </div>
                  <div className={`p-4 border space-y-3 ${isLight ? 'bg-white border-slate-200' : 'bg-zinc-950/40 border-zinc-800'}`}>
                     <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">
                       {t('drawer.window7d') || 'Ventana 7d'}
                     </span>
                     <div className="space-y-1.5 font-mono text-[11px]">
                        <div className="flex justify-between">
                           <span className="text-zinc-500 uppercase">{t('drawer.volume') || 'Volumen'}:</span>
                           <span className={isLight ? 'text-slate-800 font-bold' : 'text-white font-bold'}>{volume7d}</span>
                        </div>
                        <div className="flex justify-between">
                           <span className="text-zinc-500 uppercase">{t('drawer.failureRatio') || 'Fallo Ratio'}:</span>
                           <span className="text-[#dc0000] font-bold">{failureRatio}</span>
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

const StatItem = ({ label, value, color, isLight }: { label: string, value: any, color?: string, isLight?: boolean }) => (
  <div className="space-y-1">
    <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">{label}</span>
    <span className={`text-sm font-black font-mono uppercase ${
      color === 'emerald' ? 'text-emerald-500' :
      color === 'red' ? 'text-red-500' :
      isLight ? 'text-slate-900' : 'text-zinc-100'
    }`}>
      {value || '---'}
    </span>
  </div>
);

const SectionHeader = ({ icon: Icon, title, isLight }: { icon: any, title: string, isLight?: boolean }) => (
  <div className="flex items-center gap-2.5 mb-3 border-l-2 border-[#dc0000] pl-2.5">
    <Icon className="w-4 h-4 text-[#dc0000] shrink-0" />
    <h3 className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-zinc-100'}`}>{title}</h3>
  </div>
);

const MetricCardItem = ({ label, value, subValue, color, isLight }: { label: string, value: any, subValue: string, color?: string, isLight?: boolean }) => (
  <div className={`p-3 border space-y-1.5 transition-colors ${
    isLight ? 'bg-white border-slate-200' : 'bg-zinc-950/60 border-zinc-800'
  }`}>
    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider block">{label}</span>
    <div className="flex flex-col">
       <span className={`font-mono font-black text-lg tracking-tight ${
         color === 'red' ? 'text-red-500' : isLight ? 'text-slate-900' : 'text-white'
       }`}>
         {value}
       </span>
       <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tight">{subValue}</span>
    </div>
  </div>
);
