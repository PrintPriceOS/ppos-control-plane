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
  getRoutingEconomicOverview,
  getCapacity, 
  getPreflightMetrics, 
  getIndustrialTelemetryOverview, 
  getDispatches, 
  rollbackDispatch,
  scoreDispatch,
  createDispatch,
  getRoutingHeatmap,
  getRoutingMap,
  drainNode,
  lockNode,
  purgeNode,
  shiftNode
} from "../../lib/adminApi";
import { FederationMap } from '../../components/federation/FederationMap';
import { useAdminQuery } from "../../hooks/useAdminData";
import { getUserRole, isPrinthouseUser } from "../../lib/authStore";
import { moduleReadinessRegistry } from '../../config/moduleReadiness';

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

const deriveOperationalRegion = (country: string, timezone?: string) => {
  const c = (country || '').toUpperCase();
  const euWest = ['ES', 'FR', 'GB', 'IE', 'PT', 'BE', 'NL', 'LU'];
  const euCentral = ['DE', 'IT', 'CH', 'AT', 'CZ', 'PL', 'SK', 'HU'];
  const euNorth = ['SE', 'NO', 'FI', 'DK', 'IS', 'EE', 'LV', 'LT'];
  const euSouth = ['GR', 'TR', 'CY', 'MT', 'AL', 'BA', 'HR', 'ME', 'MK', 'RS', 'SI'];
  
  if (euWest.includes(c)) return 'EU-WEST';
  if (euCentral.includes(c)) return 'EU-CENTRAL';
  if (euNorth.includes(c)) return 'EU-NORTH';
  if (euSouth.includes(c)) return 'EU-SOUTH';
  
  if (['US', 'CA', 'MX'].includes(c)) {
    const tz = (timezone || '');
    if (tz.includes('Eastern')) return 'NA-EAST';
    if (tz.includes('Central')) return 'NA-CENTRAL';
    if (tz.includes('Mountain')) return 'NA-MOUNTAIN';
    if (tz.includes('Pacific')) return 'NA-WEST';
    return 'NA-NORTH';
  }
  
  return 'GLOBAL-OTHER';
};

// --- BASE COMPONENTS ---

const TacticalPanel = ({ title, children, icon: Icon, badge, color = 'slate', status = 'success', error = null }: { title: string, children: React.ReactNode, icon?: any, badge?: string, color?: string, status?: string, error?: string | null }) => (
  <div className="bg-white dark:bg-[#131314] border border-white/10 flex flex-col h-full overflow-hidden">
    <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        <h3 className="text-[10px] font-black text-slate-500 dark:text-zinc-500 uppercase tracking-[0.2em]">{title}</h3>
      </div>
      {badge && (
        <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-tighter ${
          color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
          color === 'red' ? 'bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse' :
          color === 'amber' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
          color === 'primary' ? 'bg-primary/10 text-primary border border-primary/20' :
          'bg-slate-200 dark:bg-[#131314]/10 text-slate-600 dark:text-zinc-400'
        }`}>
          {badge}
        </span>
      )}
    </div>
    <div className="flex-1 overflow-auto p-3 custom-scrollbar relative min-h-[100px]">
      {status === 'loading' && (
        <div className="absolute inset-0 bg-white/50 dark:bg-[#131314] dark:bg-[#131314]/20 backdrop-blur-[1px] flex items-center justify-center z-10">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-none animate-spin" />
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
      <div className={`w-1.5 h-1.5 rounded-none ${
        status === 'stable' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
        status === 'warning' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
        status === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse' :
        'bg-slate-300 dark:bg-zinc-700'
      }`} />
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-black text-white tabular-nums tracking-tight">
        {value === undefined || value === null || value === '---' ? '0.0%' : value}
      </span>
      {sub && <span className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 uppercase">{sub}</span>}
    </div>
  </div>
);

const StatBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase">
      <span>{label}</span>
      <span>{Math.round(value)}%</span>
    </div>
    <div className="h-1 bg-slate-100 dark:bg-[#131314]/5 rounded-none overflow-hidden">
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
  <div className="flex items-center justify-between p-2 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/[0.02]">
    <span className="text-[9px] font-bold text-slate-600 dark:text-zinc-400 uppercase truncate pr-4">{label}</span>
    <span className={`text-[8px] font-black uppercase ${color === 'emerald' ? 'text-emerald-500' : 'text-red-500'}`}>{status}</span>
  </div>
);

const LifecycleTier = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className="p-2 rounded-none bg-slate-50 dark:bg-[#131314]/[0.02] border border-slate-100 dark:border-white/5 text-center">
    <span className="text-[7px] font-black text-slate-400 uppercase block mb-1">{label}</span>
    <span className={`text-sm font-black ${
      color === 'primary' ? 'text-primary' :
      color === 'amber' ? 'text-amber-500' :
      'text-slate-500'
    }`}>{value}%</span>
  </div>
);

const CommandButton = ({ label, icon: Icon, color, onClick, badge, disabled }: { label: string, icon: any, color: string, onClick?: () => void, badge?: string, disabled?: boolean }) => (
  <button 
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2.5 p-2.5 rounded-none border transition-all text-left relative ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
    } ${
      color === 'red' && !disabled ? 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500/10' :
      color === 'emerald' && !disabled ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10' :
      color === 'amber' && !disabled ? 'bg-amber-500/5 border-amber-500/10 text-amber-500 hover:bg-amber-500/10' :
      color === 'primary' && !disabled ? 'bg-primary/5 border-primary/10 text-primary hover:bg-primary/10' :
      'bg-slate-100 dark:bg-[#131314]/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-[#1a1a1b]/10'
    }`}
  >
    <Icon className="w-4 h-4 flex-shrink-0" />
    <div className="flex flex-col min-w-0">
      <span className="text-[9px] font-black uppercase tracking-widest leading-tight truncate">{label}</span>
      {badge && <span className="text-[7px] font-black uppercase text-slate-400 mt-0.5">{badge}</span>}
    </div>
  </button>
);

const UnlocatedCapacityStrip = ({ data }: { data: any[] }) => {
  const unlocated = useMemo(() => data.filter(n => !resolveNodeLocation(n)), [data]);
  if (unlocated.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 py-1.5 bg-amber-500/5 border border-amber-500/10 rounded-none">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="w-3 h-3 text-amber-500 opacity-60" />
          <span className="text-[9px] font-black text-amber-600/80 uppercase tracking-tight">
            Location Metadata Incomplete: {unlocated.reduce((acc, curr) => acc + (curr.printers || 0), 0)} Printers
          </span>
        </div>
        <span className="text-[8px] font-bold text-amber-500/50 uppercase">{unlocated.length} Nodes</span>
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
        {Array.isArray(incidents.data) && incidents.data.slice(0, 5).map((inc: any) => (
          <div key={inc.id} className="p-2 border border-red-500/20 bg-red-500/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-red-500 animate-pulse" />
              <span className="text-[9px] font-black text-white uppercase truncate max-w-[120px]">{inc.title || inc.type}</span>
            </div>
            <span className="text-[8px] font-bold text-red-400 uppercase">{inc.severity}</span>
          </div>
        ))}
        {(!incidents.data || incidents.data.length === 0) && (
          <div className="text-center py-6 opacity-20 text-[9px] font-black uppercase">Clear Sector</div>
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
        {Array.isArray(anomalies.data) && anomalies.data.slice(0, 4).map((anom: any) => (
          <div key={anom.id} className="p-2 border border-primary/20 bg-primary/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-primary" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-white uppercase truncate">{anom.title}</span>
                <span className="text-[7px] text-slate-400 uppercase">{anom.severity} Risk</span>
              </div>
            </div>
            <span className="text-[10px] font-black text-primary">{anom.confidence}%</span>
          </div>
        ))}
        {(!anomalies.data || anomalies.data.length === 0) && (
          <div className="text-center py-6 opacity-20 text-[9px] font-black uppercase">No Anomalies</div>
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
      case 'ONLINE': return <div className="w-2 h-2 rounded-none bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />;
      case 'DEGRADED': return <div className="w-2 h-2 rounded-none bg-amber-500 animate-pulse" />;
      case 'SATURATED': return <div className="w-2 h-2 rounded-none bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />;
      case 'OFFLINE': return <div className="w-2 h-2 rounded-none bg-slate-400" />;
      default: return <div className="w-2 h-2 rounded-none bg-slate-200" />;
    }
  };

  return (
    <TacticalPanel title="Heartbeat Matrix" icon={BoltIcon} badge="Industrial" color="emerald" status={telemetry.status}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="p-2 bg-white/5 border border-white/5">
          <span className="text-[7px] font-bold text-slate-500 uppercase block">Active</span>
          <div className="text-sm font-black text-white">{stats.active}</div>
        </div>
        <div className="p-2 bg-white/5 border border-white/5">
          <span className="text-[7px] font-bold text-slate-500 uppercase block">Load</span>
          <div className="text-sm font-black text-primary">{stats.avg_load || 0}%</div>
        </div>
        <div className="p-2 bg-white/5 border border-white/5">
          <span className="text-[7px] font-bold text-slate-500 uppercase block">Risks</span>
          <div className="text-sm font-black text-amber-500">{stats.degraded + stats.saturated}</div>
        </div>
        <div className="p-2 bg-white/5 border border-white/5">
          <span className="text-[7px] font-bold text-slate-500 uppercase block">Sync</span>
          <div className="text-sm font-black text-emerald-500">{stats.freshness_pct}%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
        {Array.isArray(nodes.data) && nodes.data.map((node: any) => (
          <div key={node.id} className="p-1.5 bg-white/5 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {getStatusIcon(node.status)}
              <span className="text-[8px] font-black text-white uppercase truncate">{node.company_name || 'UNK'}</span>
            </div>
            <span className="text-[7px] text-slate-500">{node.capacity_utilization_pct || 0}%</span>
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
        {Array.isArray(dispatches.data?.dispatches) && dispatches.data.dispatches.map((d: any) => (
          <div key={d.id} className="p-2 bg-white/5 border border-white/5 flex items-center justify-between group">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-white uppercase">DISPATCH #{d.id?.slice(0, 8)}</span>
              <span className="text-[7px] text-slate-500 uppercase">{d.status}</span>
            </div>
            <button onClick={() => handleRollback(d.id)} className="opacity-0 group-hover:opacity-100 text-[8px] font-black text-red-500 uppercase">Rollback</button>
          </div>
        ))}
        {(!dispatches.data?.dispatches || dispatches.data.dispatches.length === 0) && (
          <div className="text-center py-6 opacity-20 uppercase font-black text-[9px]">Idle</div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={input.destination_country} onChange={e => setInput({...input, destination_country: e.target.value})} className="bg-white/5 border border-white/5 p-2 text-[10px] text-white" placeholder="Country" />
            <input type="text" value={input.destination_city} onChange={e => setInput({...input, destination_city: e.target.value})} className="bg-white/5 border border-white/5 p-2 text-[10px] text-white" placeholder="City" />
          </div>
          <button onClick={runSimulation} disabled={loading} className="w-full py-2 bg-primary text-white text-[10px] font-black uppercase">Execute Simulation</button>
        </div>
        <div className="border-l border-white/5 pl-4 max-h-[200px] overflow-y-auto custom-scrollbar">
          {result?.candidates?.map((c: any) => (
            <div key={c.node_id} className="p-2 border-b border-white/5 flex justify-between">
              <span className="text-[9px] font-black text-white uppercase">{c.display_name}</span>
              <span className="text-[10px] font-black text-primary">{c.score_total}%</span>
            </div>
          ))}
          {!result && <div className="h-full flex items-center justify-center opacity-20 text-[9px] font-black uppercase">Awaiting Data</div>}
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h1 className="text-xl font-black text-white uppercase">Control Plane</h1>
          <p className="text-[9px] font-bold text-zinc-500 uppercase">Operational Intelligence</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 ${industrial.data?.queue?.state === 'LIVE' ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-[9px] font-black text-slate-400 uppercase">System: {industrial.data?.queue?.state || 'OFFLINE'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ROW 1 */}
        <div className="lg:col-span-4">
          <TacticalPanel title="Preflight" icon={Square3Stack3DIcon} badge="Live" color="emerald" status={industrial.status}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <TelemetryItem label="Active Jobs" value={activeJobs} status="stable" />
                <TelemetryItem label="Queue Depth" value={waitingJobs} status={waitingJobs > 100 ? 'warning' : 'stable'} />
              </div>
              <StatBar label="Throughput" value={throughput > 0 ? Math.min(100, (throughput / 5000) * 100) : 0} color="emerald" />
            </div>
          </TacticalPanel>
        </div>

        <div className="lg:col-span-4">
          <TacticalPanel title="Fleet" icon={CpuChipIcon} badge={industrial.data?.workers?.state || 'IDLE'} color="primary" status={industrial.status}>
            <div className="space-y-2">
              {industrial.data?.workers?.activeFleet?.slice(0, 4).map((w: any) => (
                <div key={w.id} className="p-2 bg-white/5 border border-white/5 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-zinc-400 truncate">{w.id}</span>
                  <span className="text-[8px] font-black text-slate-400 uppercase">{w.status}</span>
                </div>
              ))}
            </div>
          </TacticalPanel>
        </div>

        <div className="lg:col-span-4">
          <TacticalPanel title="Economy" icon={CurrencyEuroIcon} badge="Intelligence" color="amber" status={routing.status}>
            <div className="space-y-4">
              <TelemetryItem label="Avg Margin" value={routing.data?.metrics?.avg_margin_pct ? `${routing.data.metrics.avg_margin_pct.toFixed(1)}%` : '---'} status="stable" />
              <div className="flex justify-between border-t border-white/5 pt-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase">Quality</span>
                <span className="text-sm font-black text-emerald-500">{(routing.data?.avg_final_score || 0).toFixed(1)}</span>
              </div>
            </div>
          </TacticalPanel>
        </div>

        {/* ROW 2 */}
        <div className="lg:col-span-4">
          <TacticalPanel title="Governance" icon={ShieldCheckIcon} badge="Policy" color="red" status={blocks.status}>
            <div className="space-y-2">
              {blocks.data?.blocks?.slice(0, 3).map((b: any) => (
                <GovernanceRow key={b.id} label={b.name} status={b.status} color={b.status === 'ACTIVE' ? 'emerald' : 'red'} />
              ))}
            </div>
          </TacticalPanel>
        </div>

        <div className="lg:col-span-4">
          <TacticalPanel title="Storage" icon={ArchiveBoxIcon} badge="Tiering" color="slate" status={industrial.status}>
             <div className="flex justify-between items-end mb-2">
               <span className="text-lg font-black text-white">{((industrial.data?.storage?.totalSizeBytes || 0) / (1024**3)).toFixed(1)} GB</span>
               <span className="text-[9px] text-slate-500">{industrial.data?.storage?.artifactCount || 0} Artifacts</span>
             </div>
             <div className="grid grid-cols-3 gap-1">
                <LifecycleTier label="HOT" value={industrial.data?.storage?.tierDistribution?.HOT || 0} color="primary" />
                <LifecycleTier label="WARM" value={industrial.data?.storage?.tierDistribution?.WARM || 0} color="amber" />
                <LifecycleTier label="COLD" value={industrial.data?.storage?.tierDistribution?.COLD || 0} color="slate" />
             </div>
          </TacticalPanel>
        </div>

        <div className="lg:col-span-4">
          <TacticalPanel title="Console" icon={CommandLineIcon} color="slate">
            <div className="grid grid-cols-2 gap-2">
              <CommandButton label="Pause" icon={PowerIcon} color="red" onClick={() => handleCommand('pause')} />
              <CommandButton label="Resume" icon={ArrowPathIcon} color="emerald" onClick={() => handleCommand('resume')} />
            </div>
          </TacticalPanel>
        </div>

        {/* ROW 3 */}
        <div className="lg:col-span-4">
          <IncidentBridge />
        </div>
        <div className="lg:col-span-4">
          <IntelligenceAnomalies />
        </div>
        <div className="lg:col-span-4">
          <IndustrialHeartbeatMatrix />
        </div>

        {/* MAP */}
        <div className="lg:col-span-12">
          <TacticalPanel title="Manufacturing Heatmap" icon={GlobeAltIcon} badge="Global Topology" color="emerald" status={capacity.status}>
            <div className="h-[400px] bg-black/20 border border-white/5 relative overflow-hidden">
               <FederationMap />
               <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 flex justify-around">
                 <MiniMetric label="TOTAL NODES" value={capacity.data?.length || 0} />
                 <MiniMetric label="LOAD" value={`${network.data?.capacity_utilization_pct || 0}%`} />
               </div>
            </div>
            <UnlocatedCapacityStrip data={capacity.data || []} />
          </TacticalPanel>
        </div>

        {/* AUDIT */}
        <div className="lg:col-span-12">
          <TacticalPanel title="Operational Audit Stream" icon={BoltIcon} badge="Immutable" color="slate" status={audit.status}>
            <div className="h-[120px] overflow-y-auto font-mono text-[7px] space-y-1">
              {audit.data?.slice(0, 10).map((log: any) => (
                <div key={log.id} className="flex gap-2">
                  <span className="text-zinc-600">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                  <span className="text-emerald-500">{log.action}</span>
                  <span className="text-zinc-500">{log.entity_id}</span>
                </div>
              ))}
            </div>
          </TacticalPanel>
        </div>

        {/* DISPATCH & SIMULATION */}
        <div className="lg:col-span-12">
           <ManufacturingDispatchConsole />
        </div>
        <div className="lg:col-span-12">
           <RoutingSimulationPanel />
        </div>
      </div>

    </div>
  );
};
