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
  PowerIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
  ServerIcon
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
  getRoutingEconomicOverview,
  getCapacity, 
  getIndustrialTelemetryOverview, 
  getDispatches, 
  rollbackDispatch,
  scoreDispatch
} from "../../lib/adminApi";
import { FederationMap } from '../../components/federation/FederationMap';
import { useAdminQuery } from "../../hooks/useAdminData";
import { getUserRole } from "../../lib/authStore";
import { safeArray, toDisplayText } from '../../lib/display';
import { COLORS } from '../../design-system/tokens';

// --- UTILS ---

const resolveNodeLocation = (node: any) => {
  let lat = node.latitude !== undefined && node.latitude !== null ? node.latitude : node.lat;
  let lng = node.longitude !== undefined && node.longitude !== null ? node.longitude : node.lng;
  
  if (typeof lat === 'string') lat = parseFloat(lat);
  if (typeof lng === 'string') lng = parseFloat(lng);

  const hasValidCoords = typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng);

  if (!hasValidCoords) return null;

  return {
    lat: lat as number,
    lng: lng as number,
    country: node.country || '',
    city: node.city || '',
    region: node.region || null,
    address: node.address_line || node.address || '',
    type: 'GPS'
  };
};

// --- BASE COMPONENTS ---

const TacticalPanel = ({ title, children, icon: Icon, badge, color = 'slate', status = 'success', error = null }: { title: string, children: React.ReactNode, icon?: any, badge?: string, color?: string, status?: string, error?: string | null }) => (
  <div className={`${COLORS.adaptive.surface} border ${COLORS.adaptive.borderPrimary} flex flex-col h-full overflow-hidden rounded-none`}>
    <div className={`px-4 py-2.5 ${COLORS.adaptive.surfaceMuted} border-b ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`w-4 h-4 ${COLORS.adaptive.textMuted}`} />}
        <h3 className={`text-[10px] font-black ${COLORS.adaptive.textSecondary} uppercase tracking-[0.2em]`}>{title}</h3>
      </div>
      {badge && (
        <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tight ${
          color === 'emerald' ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' :
          color === 'red' ? 'bg-[#dc0000]/10 text-[#dc0000] border border-[#dc0000]/20 animate-pulse' :
          color === 'amber' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
          color === 'primary' ? 'bg-[#dc0000]/10 text-[#dc0000] border border-[#dc0000]/20' :
          `${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.textMuted} border ${COLORS.adaptive.borderSubtle}`
        }`}>
          {badge}
        </span>
      )}
    </div>
    <div className="flex-1 overflow-auto p-4 custom-scrollbar relative min-h-[100px]">
      {status === 'loading' ? (
        <div className="flex items-center justify-center h-full min-h-[100px]">
          <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-800 border-t-[#dc0000] rounded-none animate-spin" />
        </div>
      ) : status === 'error' ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <ExclamationTriangleIcon className="w-8 h-8 text-[#dc0000] mb-2 opacity-50" />
          <span className="text-[10px] font-black text-[#dc0000] uppercase">Telemetry Disconnect</span>
          <p className={`text-[8px] ${COLORS.adaptive.textMuted} mt-1 uppercase max-w-xs`}>{error || 'Synchronization timeout'}</p>
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
      <span className={`text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>{label}</span>
      <div className={`w-1.5 h-1.5 rounded-none ${
        status === 'stable' ? 'bg-[#10B981]' :
        status === 'warning' ? 'bg-amber-500' :
        status === 'critical' ? 'bg-[#dc0000] animate-pulse' :
        'bg-zinc-500'
      }`} />
    </div>
    <div className="flex items-baseline gap-2">
      <span className={`text-xl font-black ${COLORS.adaptive.textPrimary} tabular-nums tracking-tight`}>
        {value === undefined || value === null || value === '---' ? '0' : value}
      </span>
      {sub && <span className={`text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>{sub}</span>}
    </div>
  </div>
);

const StatBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className="space-y-1.5">
    <div className={`flex justify-between text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase`}>
      <span>{label}</span>
      <span>{Math.round(value)}%</span>
    </div>
    <div className={`h-1 ${COLORS.adaptive.surfaceMuted} rounded-none overflow-hidden border ${COLORS.adaptive.borderSubtle}`}>
      <div 
        className={`h-full transition-all duration-1000 ${
          color === 'emerald' ? 'bg-[#10B981]' :
          color === 'primary' ? 'bg-[#dc0000]' :
          'bg-amber-500'
        }`}
        style={{ width: `${value}%` }} 
      />
    </div>
  </div>
);

const MiniMetric = ({ label, value }: { label: string, value: string | number }) => (
  <div className="flex flex-col">
    <span className={`text-[7px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-tighter`}>{label}</span>
    <span className={`text-xs font-black ${COLORS.adaptive.textPrimary} tabular-nums`}>{value}</span>
  </div>
);

const GovernanceRow = ({ label, status, color = 'emerald' }: { label: string, status: string, color?: string }) => (
  <div className={`flex items-center justify-between p-2.5 rounded-none ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
    <span className={`text-[9px] font-bold ${COLORS.adaptive.textSecondary} uppercase truncate pr-4`}>{label}</span>
    <span className={`text-[8px] font-black uppercase ${color === 'emerald' ? 'text-[#10B981]' : 'text-[#dc0000]'}`}>{status}</span>
  </div>
);

const LifecycleTier = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className={`p-2 rounded-none ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} text-center`}>
    <span className={`text-[7px] font-black ${COLORS.adaptive.textMuted} uppercase block mb-1`}>{label}</span>
    <span className={`text-xs font-black ${
      color === 'primary' ? 'text-[#dc0000]' :
      color === 'amber' ? 'text-amber-500' :
      COLORS.adaptive.textSecondary
    }`}>{value}%</span>
  </div>
);

const CommandButton = ({ label, icon: Icon, color, onClick, badge, disabled }: { label: string, icon: any, color: string, onClick?: () => void, badge?: string, disabled?: boolean }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2.5 p-3 rounded-none border transition-all text-left relative ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
    } ${
      color === 'red' && !disabled ? 'bg-[#dc0000]/5 border-[#dc0000]/20 text-[#dc0000] hover:bg-[#dc0000]/10' :
      color === 'emerald' && !disabled ? 'bg-[#10B981]/5 border-[#10B981]/20 text-[#10B981] hover:bg-[#10B981]/10' :
      color === 'amber' && !disabled ? 'bg-amber-500/5 border-amber-500/20 text-amber-500 hover:bg-amber-500/10' :
      color === 'primary' && !disabled ? 'bg-[#dc0000]/5 border-[#dc0000]/20 text-[#dc0000] hover:bg-[#dc0000]/10' :
      `${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.textSecondary} ${COLORS.adaptive.hoverSurface}`
    }`}
  >
    <Icon className="w-4 h-4 flex-shrink-0" />
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] font-black uppercase tracking-widest leading-tight truncate">{label}</span>
      {badge && <span className={`text-[7px] font-black uppercase ${COLORS.adaptive.textMuted} mt-0.5`}>{badge}</span>}
    </div>
  </button>
);

const UnlocatedCapacityStrip = ({ data }: { data: any[] }) => {
  const safeData = useMemo(() => safeArray(data), [data]);
  const unlocated = useMemo(() => safeData.filter(n => !resolveNodeLocation(n)), [safeData]);
  if (unlocated.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center justify-between px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-none">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="w-3 h-3 text-amber-500 opacity-80" />
          <span className="text-[9px] font-black text-amber-500 uppercase tracking-tight">
            Location Metadata Incomplete: {unlocated.reduce((acc, curr) => acc + (curr.printers || 0), 0)} Printers
          </span>
        </div>
        <span className="text-[8px] font-bold text-amber-500 uppercase">{unlocated.length} Nodes</span>
      </div>
    </div>
  );
};

// --- TACTICAL SUB-COMPONENTS ---

const IncidentBridge = () => {
  const incidents = useAdminQuery('hawk-eye:incidents', getIndustrialIncidents, 10000);
  return (
    <TacticalPanel title="Incident Bridge" icon={ExclamationTriangleIcon} badge="Real-time" color="red" status={incidents.status}>
      <div className="space-y-2">
        {safeArray(incidents.data).slice(0, 5).map((inc: any) => (
          <div key={inc.id} className="p-2.5 border border-[#dc0000]/20 bg-[#dc0000]/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-[#dc0000] animate-pulse" />
              <span className={`text-[9px] font-black ${COLORS.adaptive.textPrimary} uppercase truncate max-w-[120px]`}>{inc.title || inc.type}</span>
            </div>
            <span className="text-[8px] font-black text-[#dc0000] uppercase">{inc.severity}</span>
          </div>
        ))}
        {safeArray(incidents.data).length === 0 && (
          <div className={`text-center py-6 text-[9px] font-black uppercase ${COLORS.adaptive.textMuted}`}>Clear Sector</div>
        )}
      </div>
    </TacticalPanel>
  );
};

const IntelligenceAnomalies = () => {
  const anomalies = useAdminQuery('hawk-eye:anomalies', getAnomalies, 15000);
  return (
    <TacticalPanel title="Intelligence Layer" icon={BoltIcon} badge="Pattern Analysis" color="primary" status={anomalies.status}>
      <div className="space-y-2">
        {safeArray(anomalies.data).slice(0, 4).map((anom: any) => (
          <div key={anom.id} className={`p-2.5 border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.surfaceMuted} flex items-center justify-between`}>
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-5 bg-[#dc0000]" />
              <div className="flex flex-col">
                <span className={`text-[9px] font-black ${COLORS.adaptive.textPrimary} uppercase truncate`}>{anom.title}</span>
                <span className={`text-[7px] ${COLORS.adaptive.textMuted} uppercase`}>{anom.severity} Risk</span>
              </div>
            </div>
            <span className="text-[10px] font-black text-[#dc0000]">{anom.confidence}%</span>
          </div>
        ))}
        {safeArray(anomalies.data).length === 0 && (
          <div className={`text-center py-6 text-[9px] font-black uppercase ${COLORS.adaptive.textMuted}`}>No Anomalies</div>
        )}
      </div>
    </TacticalPanel>
  );
};

const IndustrialHeartbeatMatrix = () => {
  const telemetry = useAdminQuery('hawk-eye:industrial-telemetry', getIndustrialTelemetryOverview, 5000);
  const nodes = useAdminQuery('hawk-eye:nodes', () => getCapacity(), 10000);
  const stats = telemetry.data?.telemetry || { active: 0, degraded: 0, offline: 0, saturated: 0, freshness_pct: 0 };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ONLINE': return <div className="w-2 h-2 rounded-none bg-[#10B981]" />;
      case 'DEGRADED': return <div className="w-2 h-2 rounded-none bg-amber-500 animate-pulse" />;
      case 'SATURATED': return <div className="w-2 h-2 rounded-none bg-[#dc0000]" />;
      case 'OFFLINE': return <div className="w-2 h-2 rounded-none bg-zinc-600" />;
      default: return <div className="w-2 h-2 rounded-none bg-zinc-700" />;
    }
  };

  return (
    <TacticalPanel title="Heartbeat Matrix" icon={BoltIcon} badge="Industrial" color="emerald" status={telemetry.status}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className={`p-2.5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
          <span className={`text-[7px] font-bold ${COLORS.adaptive.textMuted} uppercase block`}>Active</span>
          <div className={`text-sm font-black ${COLORS.adaptive.textPrimary}`}>{stats.active}</div>
        </div>
        <div className={`p-2.5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
          <span className={`text-[7px] font-bold ${COLORS.adaptive.textMuted} uppercase block`}>Load</span>
          <div className="text-sm font-black text-[#dc0000]">{stats.avg_load || 0}%</div>
        </div>
        <div className={`p-2.5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
          <span className={`text-[7px] font-bold ${COLORS.adaptive.textMuted} uppercase block`}>Risks</span>
          <div className="text-sm font-black text-amber-500">{stats.degraded + stats.saturated}</div>
        </div>
        <div className={`p-2.5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
          <span className={`text-[7px] font-bold ${COLORS.adaptive.textMuted} uppercase block`}>Sync</span>
          <div className="text-sm font-black text-[#10B981]">{stats.freshness_pct}%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto custom-scrollbar">
        {Array.isArray(nodes.data) && nodes.data.map((node: any) => (
          <div key={node.id} className={`p-2 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
            <div className="flex items-center gap-2 min-w-0">
              {getStatusIcon(node.status)}
              <span className={`text-[8px] font-black ${COLORS.adaptive.textPrimary} uppercase truncate`}>{node.company_name || 'UNK'}</span>
            </div>
            <span className={`text-[7px] ${COLORS.adaptive.textMuted}`}>{node.capacity_utilization_pct || 0}%</span>
          </div>
        ))}
      </div>
    </TacticalPanel>
  );
};

const ManufacturingDispatchConsole = () => {
  const dispatches = useAdminQuery('hawk-eye:dispatches', getDispatches, 10000);
  const handleRollback = async (id: string) => {
    const reason = window.prompt('Enter rollback reason:');
    if (!reason) return;
    try {
      const res = await rollbackDispatch(id, reason);
      if (res.ok) {
        alert('DISPATCH ROLLED BACK.');
        dispatches.refetch();
      }
    } catch (e: any) { alert(`Failed: ${e.message}`); }
  };

  return (
    <TacticalPanel title="Dispatch Console" icon={ArchiveBoxIcon} badge="Orchestration" color="slate" status={dispatches.status}>
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {safeArray(dispatches.data?.dispatches).map((d: any) => (
          <div key={d?.id || Math.random()} className={`p-3 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-between group`}>
            <div className="flex flex-col">
              <span className={`text-[9px] font-black ${COLORS.adaptive.textPrimary} uppercase`}>DISPATCH #{String(d?.id || '').slice(0, 8)}</span>
              <span className={`text-[7px] ${COLORS.adaptive.textMuted} uppercase`}>{toDisplayText(d?.status)}</span>
            </div>
            <button onClick={() => handleRollback(d?.id)} className="opacity-0 group-hover:opacity-100 text-[8px] font-black text-[#dc0000] uppercase transition-opacity">Rollback</button>
          </div>
        ))}
        {(!dispatches.data?.dispatches || dispatches.data.dispatches.length === 0) && (
          <div className={`text-center py-6 uppercase font-black text-[9px] ${COLORS.adaptive.textMuted}`}>Idle</div>
        )}
      </div>
    </TacticalPanel>
  );
};

const RoutingSimulationPanel = () => {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [input, setInput] = React.useState({ destination_country: 'IE', destination_city: 'Dublin', required_delivery_days: 10, product_type: 'SOFTCOVER_BOOK' });

  const runSimulation = async () => {
    setLoading(true);
    try { const res = await scoreDispatch(input); setResult(res); } 
    catch (e: any) { alert(`Failed: ${e.message}`); } 
    finally { setLoading(false); }
  };

  return (
    <TacticalPanel title="Routing Simulation" icon={BoltIcon} badge="Decision Layer" color="primary">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={input.destination_country} onChange={e => setInput({...input, destination_country: e.target.value})} className={`w-full ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderPrimary} p-2.5 text-[10px] ${COLORS.adaptive.textPrimary} focus:outline-none focus:border-[#dc0000]`} placeholder="Country" />
            <input type="text" value={input.destination_city} onChange={e => setInput({...input, destination_city: e.target.value})} className={`w-full ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderPrimary} p-2.5 text-[10px] ${COLORS.adaptive.textPrimary} focus:outline-none focus:border-[#dc0000]`} placeholder="City" />
          </div>
          <button onClick={runSimulation} disabled={loading} className="w-full py-3 bg-[#dc0000] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#dc0000]/90 transition-colors">Execute Simulation</button>
        </div>
        <div className={`border-l ${COLORS.adaptive.borderSubtle} pl-6 max-h-[200px] overflow-y-auto custom-scrollbar`}>
          {result?.candidates?.map((c: any) => (
            <div key={c.node_id} className={`p-2.5 border-b ${COLORS.adaptive.borderSubtle} flex justify-between`}>
              <span className={`text-[9px] font-black ${COLORS.adaptive.textPrimary} uppercase`}>{c.display_name}</span>
              <span className="text-[10px] font-black text-[#dc0000]">{c.score_total}%</span>
            </div>
          ))}
          {!result && <div className={`h-full flex items-center justify-center text-[9px] font-black uppercase ${COLORS.adaptive.textMuted}`}>Awaiting Data</div>}
        </div>
      </div>
    </TacticalPanel>
  );
};

// --- MAIN PAGE ---

export const CommandCenterPage: React.FC = () => {
  const role = getUserRole();
  const industrial = useAdminQuery('hawk-eye:industrial', getIndustrialSnapshot, 10000);
  const network = useAdminQuery('hawk-eye:network', getNetworkOverview, 60000);
  const capacity = useAdminQuery('hawk-eye:capacity', getCapacity, 60000);
  const routing = useAdminQuery('hawk-eye:routing', getRoutingEconomicOverview, 60000);
  const audit = useAdminQuery('hawk-eye:audit', () => getAudit({ limit: 20 }), 5000);
  const blocks = useAdminQuery('hawk-eye:blocks', getGovernanceBlocks, 30000);

  const handleCommand = async (action: string) => {
    if (!window.confirm(`Trigger ${action.toUpperCase()}?`)) return;
    try {
      if (action === 'pause') await pauseQueue('preflight', 'Admin Override');
      if (action === 'resume') await resumeQueue('preflight', 'Admin Override');
      industrial.refetch();
    } catch (e: any) { alert(e.message); }
  };

  const activeJobs = industrial.data?.queue?.queues?.[0]?.counts?.active || 0;
  const waitingJobs = industrial.data?.queue?.queues?.[0]?.counts?.waiting || 0;
  const throughput = industrial.data?.queue?.queues?.[0]?.throughput || 0;

  return (
    <div className="space-y-6 italic-text-off">
      {/* Header */}
      <div className={`flex items-center justify-between border-b ${COLORS.adaptive.borderSubtle} pb-4`}>
        <div>
          <h1 className={`text-2xl font-black ${COLORS.adaptive.textPrimary} tracking-tight`}>Control Plane</h1>
          <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>Operational Intelligence</p>
        </div>
        <div className="flex gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 ${COLORS.adaptive.surface} border ${COLORS.adaptive.borderPrimary}`}>
            <div className={`w-2 h-2 ${industrial.data?.queue?.state === 'LIVE' ? 'bg-[#10B981]' : 'bg-[#dc0000]'}`} />
            <span className={`text-[9px] font-black ${COLORS.adaptive.textSecondary} uppercase tracking-wider`}>System: {industrial.data?.queue?.state || 'OFFLINE'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMN 1: INDUSTRIAL CORE */}
        <div className="space-y-6">
          <TacticalPanel title="Preflight" icon={Square3Stack3DIcon} badge="Live" color="emerald" status={industrial.status}>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <TelemetryItem label="Active Jobs" value={activeJobs} status="stable" />
                <TelemetryItem label="Queue Depth" value={waitingJobs} status={waitingJobs > 100 ? 'warning' : 'stable'} />
              </div>
              <StatBar label="Throughput" value={throughput > 0 ? Math.min(100, (throughput / 5000) * 100) : 0} color="emerald" />
            </div>
          </TacticalPanel>

          <TacticalPanel title="Fleet" icon={CpuChipIcon} badge={toDisplayText(industrial.data?.workers?.state, 'IDLE')} color="primary" status={industrial.status}>
            <div className="space-y-2">
              {safeArray(industrial.data?.workers?.activeFleet).slice(0, 4).map((w: any) => (
                <div key={w?.id || Math.random()} className={`p-2.5 ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
                  <span className={`text-[9px] font-mono ${COLORS.adaptive.textSecondary} truncate`}>{toDisplayText(w?.id)}</span>
                  <span className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase`}>{toDisplayText(w?.status)}</span>
                </div>
              ))}
            </div>
          </TacticalPanel>
          
          <TacticalPanel title="Storage" icon={ArchiveBoxIcon} badge="Tiering" color="slate" status={industrial.status}>
             <div className="flex justify-between items-end mb-3">
               <span className={`text-xl font-black ${COLORS.adaptive.textPrimary}`}>{((industrial.data?.storage?.totalSizeBytes || 0) / (1024**3)).toFixed(1)} GB</span>
               <span className={`text-[9px] ${COLORS.adaptive.textMuted}`}>{industrial.data?.storage?.artifactCount || 0} Artifacts</span>
             </div>
             <div className="grid grid-cols-3 gap-2">
                <LifecycleTier label="HOT" value={industrial.data?.storage?.tierDistribution?.HOT || 0} color="primary" />
                <LifecycleTier label="WARM" value={industrial.data?.storage?.tierDistribution?.WARM || 0} color="amber" />
                <LifecycleTier label="COLD" value={industrial.data?.storage?.tierDistribution?.COLD || 0} color="slate" />
             </div>
          </TacticalPanel>
        </div>

        {/* COLUMN 2: GOVERNANCE & SECURITY */}
        <div className="space-y-6">
          <TacticalPanel title="Governance" icon={ShieldCheckIcon} badge="Policy" color="red" status={blocks.status}>
            <div className="space-y-2">
              {safeArray(blocks.data?.blocks).slice(0, 3).map((b: any) => (
                <GovernanceRow key={b?.id || Math.random()} label={toDisplayText(b?.name)} status={toDisplayText(b?.status)} color={b?.status === 'ACTIVE' ? 'emerald' : 'red'} />
              ))}
            </div>
          </TacticalPanel>

          <IncidentBridge />
          <IntelligenceAnomalies />
        </div>

        {/* COLUMN 3: ECONOMY & LOGISTICS */}
        <div className="space-y-6">
          <TacticalPanel title="Economy" icon={CurrencyEuroIcon} badge="Intelligence" color="amber" status={routing.status}>
            <div className="space-y-4">
              <TelemetryItem label="Avg Margin" value={routing.data?.metrics?.avg_margin_pct ? `${Number(routing.data.metrics.avg_margin_pct).toFixed(1)}%` : '---'} status="stable" />
              <div className={`flex justify-between border-t ${COLORS.adaptive.borderSubtle} pt-3`}>
                <span className={`text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>Quality</span>
                <span className="text-sm font-black text-[#10B981]">{Number(routing.data?.avg_final_score || 0).toFixed(1)}</span>
              </div>
            </div>
          </TacticalPanel>

          <IndustrialHeartbeatMatrix />

          <TacticalPanel title="System Registry" icon={ServerIcon} badge="Sync" color="slate">
             <div className="space-y-2">
                 <div className={`flex justify-between text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>
                    <span>DB Clusters</span>
                    <span className="text-[#10B981]">SYNCED [4ms]</span>
                 </div>
                 <div className={`flex justify-between text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>
                    <span>Redis Feed</span>
                    <span className="text-[#10B981]">ACTIVE [8ms]</span>
                 </div>
             </div>
          </TacticalPanel>
        </div>

        {/* MAP */}
        <div className="lg:col-span-3">
          <TacticalPanel title="Manufacturing Heatmap" icon={GlobeAltIcon} badge="Global Topology" color="emerald" status={capacity.status}>
            <div className={`h-[400px] ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderPrimary} relative overflow-hidden`}>
               <FederationMap />
               <div className={`absolute bottom-0 left-0 right-0 ${COLORS.adaptive.surface} bg-opacity-90 p-3 border-t ${COLORS.adaptive.borderPrimary} flex justify-around`}>
                 <MiniMetric label="TOTAL NODES" value={capacity.data?.length || 0} />
                 <MiniMetric label="LOAD" value={`${network.data?.capacity_utilization_pct || 0}%`} />
               </div>
            </div>
            <UnlocatedCapacityStrip data={capacity.data || []} />
          </TacticalPanel>
        </div>

        {/* AUDIT */}
        <div className="lg:col-span-3">
          <TacticalPanel title="Operational Audit Stream" icon={BoltIcon} badge="Immutable" color="slate" status={audit.status}>
            <div className="h-[120px] overflow-y-auto font-mono text-[9px] space-y-1.5 custom-scrollbar">
              {safeArray(audit.data).slice(0, 10).map((log: any) => (
                <div key={log.id} className="flex gap-2.5">
                  <span className={COLORS.adaptive.textMuted}>[{new Date(log.created_at).toLocaleTimeString()}]</span>
                  <span className="text-[#10B981] font-bold">{log.action}</span>
                  <span className={COLORS.adaptive.textSecondary}>{log.entity_id}</span>
                </div>
              ))}
            </div>
          </TacticalPanel>
        </div>

        {/* DISPATCH & SIMULATION */}
        <div className="lg:col-span-3">
           <ManufacturingDispatchConsole />
        </div>
        <div className="lg:col-span-3">
           <RoutingSimulationPanel />
        </div>

        {/* SYSTEM COMMAND CONSOLE */}
        <div className="lg:col-span-3">
          <TacticalPanel title="Console" icon={CommandLineIcon} color="slate">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CommandButton label="Pause Queue Orchestration" badge="Emergency Global Stop" icon={PowerIcon} color="red" onClick={() => handleCommand('pause')} />
              <CommandButton label="Resume Queue Orchestration" badge="Re-engage Worker Hubs" icon={ArrowPathIcon} color="emerald" onClick={() => handleCommand('resume')} />
            </div>
          </TacticalPanel>
        </div>
      </div>

    </div>
  );
};
