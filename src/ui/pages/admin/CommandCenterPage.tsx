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
import { MachineDetailDrawer } from '../../components/MachineDetailDrawer';
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
  scoreDispatch,
  createDispatch,
  rollbackDispatch,
  getDispatches,
  getIndustrialTelemetryOverview,
  drainNode,
  lockNode,
  purgeNode,
  shiftNode
} from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { getUserRole, isPrinthouseUser } from "../../lib/authStore";

const resolveNodeLocation = (node: any) => {
  if (!node) return null;

  // 1. Resolve coordinates from direct fields or 'location' JSON
  let lat = node.latitude !== undefined ? node.latitude : node.lat;
  let lng = node.longitude !== undefined ? node.longitude : node.lng;

  if ((lat === undefined || lng === undefined) && node.location) {
    try {
      const loc = typeof node.location === 'string' ? JSON.parse(node.location) : node.location;
      lat = loc.latitude !== undefined ? loc.latitude : loc.lat;
      lng = loc.longitude !== undefined ? loc.longitude : loc.lng;
    } catch (e) {}
  }

  // 2. Normalize to numbers
  if (typeof lat === 'string') lat = parseFloat(lat);
  if (typeof lng === 'string') lng = parseFloat(lng);

  const hasValidCoords = typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng);

  // 3. Return normalized object if coordinates exist, otherwise null
  // (Returning null ensures the node is handled by the UnlocatedCapacityStrip and skipped on the map)
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

const resolveIndustrialNodeIdentity = (node: any) => {
  const loc = resolveNodeLocation(node);
  const country = node.country || 'UNKNOWN';
  const timezone = node.timezone || 'UTC';
  
  const util = node.capacity_utilization_pct || 0;
  let routingState = 'OPTIMAL';
  if (node.status === 'OFFLINE' || node.sync_status === 'OFFLINE') routingState = 'OFFLINE';
  else if (util >= 90) routingState = 'SATURATED';
  else if (util >= 70) routingState = 'DEGRADED';
  else if (node.printers === 0) routingState = 'OFFLINE';

  return {
    canonicalId: node.id || node._id || node.slug || Math.random().toString(36).substr(2, 9),
    displayName: node.name || node.city || node.slug || 'UNKNOWN NODE',
    printhouseId: node.printhouse_id || node.id,
    region: node.region || 'UNK',
    city: node.city || 'UNK',
    country: country,
    coordinates: loc ? [loc.lat, loc.lng] : null,
    operationalRegion: deriveOperationalRegion(country, timezone),
    routingState,
    timezone,
    sourceQuality: loc?.type || 'UNKNOWN',
    utilization: util,
    printers: node.printers || 0
  };
};

const clusterNodes = (nodes: any[], cellSize: number = 45) => {
  const clusters: any[] = [];
  const map: Record<string, any> = {};

  nodes.forEach(node => {
    const loc = resolveNodeLocation(node);
    if (!loc) return;
    const { x, y } = projectCoordinates(loc.lat, loc.lng);
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const key = `${cellX}-${cellY}`;

    if (!map[key]) {
      map[key] = {
        id: `cluster-${key}`,
        x: x,
        y: y,
        nodes: [],
        totalPrinters: 0,
        avgUtilization: 0,
        lat: loc.lat,
        lng: loc.lng,
        routingState: 'OPTIMAL'
      };
      clusters.push(map[key]);
    }

    const identity = resolveIndustrialNodeIdentity(node);
    map[key].nodes.push(identity);
    map[key].totalPrinters += node.printers || 0;
    map[key].avgUtilization += node.capacity_utilization_pct || 0;
    
    map[key].x = (map[key].x * (map[key].nodes.length - 1) + x) / map[key].nodes.length;
    map[key].y = (map[key].y * (map[key].nodes.length - 1) + y) / map[key].nodes.length;
  });

  clusters.forEach(c => {
    c.avgUtilization = Math.round(c.avgUtilization / c.nodes.length);
    const states = c.nodes.map((n: any) => n.routingState);
    if (states.includes('OFFLINE')) c.routingState = 'OFFLINE';
    else if (states.includes('SATURATED')) c.routingState = 'SATURATED';
    else if (states.includes('DEGRADED')) c.routingState = 'DEGRADED';
    else c.routingState = 'OPTIMAL';
  });

  return clusters;
};

const projectCoordinates = (lat: number, lng: number) => {
  const x = ((lng + 180) / 360) * 1000;
  const y = ((90 - lat) / 180) * 420;
  return { x, y };
};

// --- Components ---

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
    <div className="flex-1 overflow-auto p-3 custom-scrollbar relative">
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

const ManufacturingWorldMap = ({ data }: { data: any[] }) => {
  const clusters = useMemo(() => clusterNodes(data), [data]);

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'OPTIMAL': return '#10b981';
      case 'DEGRADED': return '#f59e0b';
      case 'SATURATED': return '#f43f5e';
      case 'OFFLINE': return '#64748b';
      default: return '#94a3b8';
    }
  };

  return (
    <svg viewBox="0 0 1000 420" className="w-full h-full">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Projection Grid */}
      <g className="stroke-slate-200 dark:stroke-white/[0.03] stroke-[0.5]">
        {[...Array(10)].map((_, i) => (
          <line key={`h-${i}`} x1="0" y1={i * 42} x2="1000" y2={i * 42} />
        ))}
        {[...Array(20)].map((_, i) => (
          <line key={`v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="420" />
        ))}
      </g>

      {/* Industrial Clusters */}
      <g>
        {clusters.map((cluster, idx) => {
          const color = getStatusColor(cluster.routingState);
          const size = Math.min(15, 6 + (cluster.nodes.length * 2));
          const isOverloaded = cluster.avgUtilization > 85;
          const isDense = cluster.nodes.length > 1;
          
          return (
            <g key={cluster.id} className="cursor-crosshair group">
              {/* Density Glow */}
              {(isOverloaded || isDense) && (
                <circle 
                  cx={cluster.x} cy={cluster.y} r={size + 15} 
                  fill={color}
                  className={`opacity-10 transition-opacity ${isOverloaded ? 'animate-pulse' : ''}`}
                />
              )}
              
              <circle 
                cx={cluster.x} cy={cluster.y} r={size + 4} 
                className="fill-current opacity-0 group-hover:opacity-20 transition-opacity"
                style={{ color }}
              />
              <circle 
                cx={cluster.x} cy={cluster.y} r={size} 
                fill={color}
                className="shadow-none"
                filter="url(#glow)"
              />
              
              {isDense && (
                <text 
                  x={cluster.x} y={cluster.y + 2} 
                  textAnchor="middle"
                  className="text-[8px] font-black fill-white pointer-events-none"
                >
                  {cluster.nodes.length}
                </text>
              )}

              {/* Enhanced Operational Tooltip Placeholder (Visual only) */}
              <foreignObject x={cluster.x + size + 10} y={cluster.y - 40} width="160" height="120" className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none overflow-visible">
                <div className="bg-white dark:bg-[#131314] border border-white/10 p-2 space-y-1">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-1 mb-1">
                    <span className="text-[8px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-tighter">
                      {isDense ? `CLUSTER (${cluster.nodes.length} NODES)` : cluster.nodes[0].displayName}
                    </span>
                    <span className={`text-[7px] font-black px-1 rounded-none uppercase ${
                      cluster.routingState === 'OPTIMAL' ? 'bg-emerald-500/10 text-emerald-500' :
                      cluster.routingState === 'SATURATED' ? 'bg-red-500/10 text-red-500' :
                      'bg-slate-500/10 text-slate-500'
                    }`}>
                      {cluster.routingState}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <div className="flex flex-col">
                      <span className="text-[6px] font-bold text-slate-400 uppercase">Capacity</span>
                      <span className="text-[9px] font-black text-slate-700 dark:text-zinc-300">{cluster.totalPrinters} P</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[6px] font-bold text-slate-400 uppercase">Load</span>
                      <span className="text-[9px] font-black text-slate-700 dark:text-zinc-300">{cluster.avgUtilization}%</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[6px] font-bold text-slate-400 uppercase">Region</span>
                      <span className="text-[8px] font-black text-slate-700 dark:text-zinc-300 truncate">{cluster.nodes[0].operationalRegion}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[6px] font-bold text-slate-400 uppercase">Source</span>
                      <span className="text-[8px] font-black text-slate-500 dark:text-zinc-500">{cluster.nodes[0].sourceQuality}</span>
                    </div>
                  </div>

                  <div className="pt-1 mt-1 border-t border-slate-100 dark:border-white/5">
                    <div className="flex items-center justify-between text-[6px] font-black text-slate-400 uppercase">
                      <span>Routing Engine</span>
                      <span className="text-emerald-500">Ready</span>
                    </div>
                  </div>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

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
      <div className="px-2 text-[7px] font-black text-slate-400 uppercase tracking-widest text-right">
        Action: Update Printhouse profile to enable routing intelligence.
      </div>
    </div>
  );
};

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
  const routing = useAdminQuery('hawk-eye:routing', getRoutingEconomicOverview, 60000);
  const anomalies = useAdminQuery('hawk-eye:anomalies', getAnomalies, 15000);
  const incidents = useAdminQuery('hawk-eye:incidents', getIndustrialIncidents, 10000);
  const audit = useAdminQuery('hawk-eye:audit', () => getAudit({ limit: 20 }), 5000);
  const blocks = useAdminQuery('hawk-eye:blocks', getGovernanceBlocks, 30000);
  const industrialTelemetry = useAdminQuery('hawk-eye:industrial-telemetry', getIndustrialTelemetryOverview, 5000);

  const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  const openMachine = (id: string) => {
    setSelectedMachineId(id);
    setIsDrawerOpen(true);
  };

  React.useEffect(() => {
    (window as any).openMachine = openMachine;
    return () => {
      delete (window as any).openMachine;
    };
  }, []);

  // Derivation Helpers
  const complianceScore = useMemo(() => {
    const healthyStatuses = ['ACTIVE', 'ENFORCED', 'OPERATIONAL', 'LIVE'];
    if (!blocks.data?.blocks || blocks.data.blocks.length === 0) return 'No governance telemetry';
    const active = blocks.data.blocks.filter((b: any) => healthyStatuses.includes(b.status)).length;
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
    
    // For demo/tactical purposes, we target the first active worker node if one exists
    const targetNode = industrial.data?.workers?.activeFleet?.[0];
    const nodeId = targetNode?.id;

    try {
      switch (action) {
        case 'pause':
          await pauseQueue('preflight', 'Admin Manual Override');
          break;
        case 'resume':
          await resumeQueue('preflight', 'Admin Manual Override');
          break;
        case 'drain':
          if (!nodeId) throw new Error('No active node target identified for drain.');
          await drainNode(nodeId, 'Admin Manual Drain');
          break;
        case 'lock':
          if (!nodeId) throw new Error('No active node target identified for lock.');
          await lockNode(nodeId, 'Admin Security Lockout');
          break;
        case 'purge':
          if (!nodeId) throw new Error('No active node target identified for purge.');
          await purgeNode(nodeId, 'Admin Data Purge');
          break;
        case 'shift':
          if (!nodeId) throw new Error('No active node target identified for shift.');
          // Simple demo: prompt for target or use a second node if available
          const secondNode = industrial.data?.workers?.activeFleet?.[1];
          const targetId = window.prompt('Enter target Node ID for shift:', secondNode?.id || '');
          if (!targetId) return;
          await shiftNode(nodeId, targetId, 'Admin Capacity Rebalancing');
          break;
      }
      industrial.refetch();
      audit.refetch();
    } catch (e: any) {
      alert(`Command Failed: ${e.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dashboard Title Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200 dark:border-white/5 pb-3">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">PrintPrice OS</h1>
          <p className="text-[9px] font-bold text-zinc-500 uppercase">
            Operational Intelligence & Industrial Telemetry
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-none ${industrial.data?.queue?.state === 'LIVE' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`} />
            <span className="text-[9px] font-black uppercase text-slate-400">Queue: {industrial.data?.queue?.state || 'OFFLINE'}</span>
          </div>
          <div className="w-[1px] h-2 bg-slate-200 dark:bg-[#131314]/10" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-none bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <span className="text-[9px] font-black uppercase text-slate-400">Health: Stable</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        
        {/* 2. MAIN OPERATIONAL GRID */}
        <div className="col-span-12 xl:col-span-9 grid grid-cols-12 auto-rows-min gap-3 h-fit">
          
          <div className="col-span-12 md:col-span-6 lg:col-span-3 min-h-[220px]">
            <TacticalPanel title="Preflight" icon={Square3Stack3DIcon} badge="Live" color="emerald" status={industrial.status} error={industrial.error}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <TelemetryItem label="Active Jobs" value={activeJobs} status="stable" />
                  <TelemetryItem label="Queue Depth" value={waitingJobs} status={waitingJobs > 100 ? 'warning' : 'stable'} />
                </div>
                <div className="h-[1px] bg-slate-100 dark:bg-[#131314]/5" />
                <div className="space-y-3">
                  <StatBar label="Throughput" value={throughput > 0 ? Math.min(100, (throughput / 5000) * 100) : 0} color="emerald" />
                  <StatBar label="Nodes" value={industrial.data?.workers?.stats?.fleetHealth || 0} color="primary" />
                  <StatBar label="Pressure" value={activeJobs > 50 ? 80 : 20} color="amber" />
                </div>
              </div>
            </TacticalPanel>
          </div>

          <div className="col-span-12 md:col-span-6 lg:col-span-3 min-h-[220px]">
            <TacticalPanel title="Fleet" icon={CpuChipIcon} badge={industrial.data?.workers?.state || 'IDLE'} color={industrial.data?.workers?.state === 'LIVE' ? 'primary' : 'amber'} status={industrial.status} error={industrial.error}>
              <div className="space-y-2">
                {Array.isArray(industrial.data?.workers?.activeFleet) && industrial.data.workers.activeFleet.slice(0, 4).map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between p-1.5 bg-emerald-500/10 border border-emerald-500/20 overflow-hidden">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-none shrink-0 ${w.status === 'HEALTHY' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-zinc-400 truncate">{w.id || '---'}</span>
                    </div>
                    <span className="text-[8px] font-black text-slate-400 uppercase shrink-0">{w.status}</span>
                  </div>
                ))}
                
                {(!industrial.data?.workers?.activeFleet || industrial.data.workers.activeFleet.length === 0) && industrial.status !== 'loading' && (
                  <div className="text-center py-10 opacity-30 font-black text-[9px]">NO ACTIVE NODES</div>
                )}
              </div>
            </TacticalPanel>
          </div>

          <div className="col-span-12 lg:col-span-6 min-h-[220px]">
            <TacticalPanel title="Manufacturing Grid" icon={GlobeAltIcon} badge="Global" color="slate" status={capacity.status}>
               <div className="flex flex-col h-full">
                 <div className="flex-1 relative bg-slate-100 dark:bg-[#111112] border border-slate-200 dark:border-white/5 rounded-none overflow-hidden min-h-[160px]">
                    <ManufacturingWorldMap data={capacity.data || []} />
                    
                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-white/90 dark:bg-[#131314] dark:bg-[#131314]/60 backdrop-blur-md border-t border-slate-200 dark:border-white/10 px-3 flex items-center justify-between">
                       <MiniMetric label="TOTAL" value={network.data?.total_printers || 0} />
                       <MiniMetric label="LOAD" value={`${network.data?.capacity_utilization_pct || 0}%`} />
                       <MiniMetric label="SYNC" value={syncHealth} />
                    </div>
                 </div>
                 <UnlocatedCapacityStrip data={capacity.data || []} />
               </div>
            </TacticalPanel>
          </div>

          {(isSuper || isPrinthouse) && (
            <div className="col-span-12 md:col-span-6 lg:col-span-4 min-h-[160px]">
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
            <div className="col-span-12 md:col-span-6 lg:col-span-4 min-h-[160px]">
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
                   <span className="text-lg font-black text-slate-900 dark:text-slate-900 dark:text-white">
                      {( (industrial.data?.storage?.totalSizeBytes || 0) / (1024 * 1024 * 1024)).toFixed(1)} GB
                   </span>
                   <span className="text-sm font-black text-slate-400 tabular-nums">{(industrial.data?.storage?.artifactCount || 0).toLocaleString()}</span>
                 </div>
                 <div className="space-y-1">
                    <div className="h-1 bg-slate-100 dark:bg-[#131314]/5 rounded-none overflow-hidden">
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

          <div className="col-span-12 lg:col-span-8 min-h-[180px]">
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
                    <div className="p-2 bg-primary/5 border border-primary/10 rounded-none">
                       <p className="text-[9px] font-bold text-slate-500 dark:text-zinc-500 leading-tight uppercase">
                          The neural network is identifying emerging routing patterns in EU-WEST.
                       </p>
                    </div>
                 </div>
               </div>

               {/* Phase 24 Future-Ready Orchestration Hooks */}
               <div className="mt-6 pt-6 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Route Simulation</span>
                    <div className="h-1 bg-slate-200 dark:bg-[#131314]/10 rounded-none" />
                    <p className="text-[6px] font-bold text-slate-500 uppercase">Predicting latency spikes</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Dispatch Balancing</span>
                    <div className="h-1 bg-slate-200 dark:bg-[#131314]/10 rounded-none" />
                    <p className="text-[6px] font-bold text-slate-500 uppercase">Load optimization active</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">SLA Estimation</span>
                    <div className="h-1 bg-slate-200 dark:bg-[#131314]/10 rounded-none" />
                    <p className="text-[6px] font-bold text-slate-500 uppercase">Real-time transit audit</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Node Failover</span>
                    <div className="h-1 bg-slate-200 dark:bg-[#131314]/10 rounded-none" />
                    <p className="text-[6px] font-bold text-slate-500 uppercase">Auto-routing standby</p>
                  </div>
               </div>
             </TacticalPanel>
          </div>

          {(isSuper || isPrinthouse) && (
            <div className="col-span-12 lg:col-span-4 min-h-[180px]">
              <TacticalPanel title="Console" icon={CommandLineIcon} badge="Override" color="slate">
                 <div className="grid grid-cols-2 gap-2 h-full">
                    <CommandButton label="Pause" icon={PowerIcon} color="red" onClick={() => handleCommand('pause')} />
                    <CommandButton label="Resume" icon={ArrowPathIcon} color="emerald" onClick={() => handleCommand('resume')} />
                    <CommandButton label="Drain" icon={AdjustmentsHorizontalIcon} color="slate" onClick={() => handleCommand('drain')} />
                    <CommandButton label="Lock" icon={LockClosedIcon} color="slate" onClick={() => handleCommand('lock')} />
                    <CommandButton label="Purge" icon={ArchiveBoxIcon} color="slate" onClick={() => handleCommand('purge')} />
                    <CommandButton label="Shift" icon={LinkIcon} color="slate" onClick={() => handleCommand('shift')} />
                 </div>
              </TacticalPanel>
            </div>
          )}

          <div className="col-span-12 min-h-[200px]">
             <IndustrialHeartbeatMatrix />
          </div>

          <div className="col-span-12 min-h-[260px]">
             <ManufacturingDispatchConsole />
          </div>

          <div className="col-span-12 min-h-[300px]">
             <RoutingSimulationPanel />
          </div>

        </div>

        {/* 3. GLOBAL INCIDENT CENTER (STICKY) */}
        <div className="col-span-12 xl:col-span-3 flex flex-col gap-4 sticky top-6 self-start max-h-[calc(100vh-140px)]">
           <div className="bg-white dark:bg-[#111112] border border-slate-200 dark:border-white/5 flex flex-col rounded-none overflow-hidden h-fit max-h-[180px]">
              <div className="p-3 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#131314]/[0.02]">
                 <div className="flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                    <h2 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Incident Bridge</h2>
                 </div>
                 <span className="px-1.5 py-0.5 rounded-none bg-red-500 text-white text-[8px] font-black animate-pulse">
                   {Array.isArray(incidents.data) ? incidents.data.length : 0}
                 </span>
              </div>
              
              <div className="overflow-y-auto p-3 space-y-2 custom-scrollbar">
                 {Array.isArray(incidents.data) && incidents.data.map((inc: any) => (
                   <div key={inc.id} className="p-3 rounded-none bg-red-500/5 border border-red-500/10 space-y-2">
                     <div className="flex items-start justify-between">
                       <span className="text-[8px] font-black text-red-500 uppercase">CRITICAL</span>
                       <span className="text-[8px] font-bold text-slate-400 font-mono">#{inc.id?.slice(0,4)}</span>
                     </div>
                     <h4 className="text-[10px] font-black text-slate-900 dark:text-white leading-tight uppercase truncate">{inc.action?.replace(/_/g, ' ') || 'INCIDENT'}</h4>
                     <div className="grid grid-cols-2 gap-1.5">
                        <button className="py-1 bg-red-500 text-white text-[8px] font-black uppercase rounded-none hover:bg-red-600">Triage</button>
                        <button className="py-1 bg-slate-100 dark:bg-[#131314]/5 text-slate-600 dark:text-white text-[8px] font-black uppercase rounded-none">Mute</button>
                     </div>
                   </div>
                 ))}
                 {(!Array.isArray(incidents.data) || incidents.data.length === 0) && (
                   <div className="py-5 text-center opacity-20">
                      <ShieldCheckIcon className="w-6 h-6 mx-auto mb-1" />
                      <p className="text-[8px] font-black uppercase">Clear</p>
                   </div>
                 )}
              </div>
           </div>

           {/* Telemetry Stream */}
           <div className="bg-white dark:bg-[#111112] border border-slate-200 dark:border-white/5 flex flex-col rounded-none overflow-hidden h-[300px]">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#131314]/[0.02]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Live Stream</span>
                <div className="w-1 h-1 rounded-none bg-emerald-500 animate-pulse" />
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
      <MachineDetailDrawer 
        isOpen={isDrawerOpen} 
        machineId={selectedMachineId} 
        onClose={() => setIsDrawerOpen(false)} 
      />
    </div>
  );
};



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

const AnomalyRow = ({ title, tenant, confidence, severity, job }: { title: string, tenant?: string, confidence: number, severity: string, job?: string }) => (
  <div className="p-3 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/5 flex items-center justify-between group hover:border-primary/30 transition-all">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-1 h-8 rounded-none flex-shrink-0 ${
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
    className={`flex items-center gap-2.5 p-2.5 rounded-none border transition-all text-left relative ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
    } ${
      color === 'red' && !disabled ? 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500/10' :
      color === 'emerald' && !disabled ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10' :
      color === 'amber' && !disabled ? 'bg-amber-500/5 border-amber-500/10 text-amber-500 hover:bg-amber-500/10' :
      color === 'primary' && !disabled ? 'bg-primary/5 border-primary/10 text-primary hover:bg-primary/10' :
      disabled ? 'bg-slate-100 dark:bg-[#131314]/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-zinc-500' :
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

const RoutingSimulationPanel = () => {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [input, setInput] = React.useState({
    destination_country: 'IE',
    destination_city: 'Dublin',
    destination_region: 'EU-WEST',
    required_delivery_days: 10,
    product_type: 'SOFTCOVER_BOOK'
  });

  const runSimulation = async () => {
    setLoading(true);
    try {
      const res = await scoreDispatch(input);
      setResult(res);
    } catch (e: any) {
      alert(`Simulation Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (candidate: any) => {
    if (!window.confirm(`EXECUTE DISPATCH? This will lock manufacturing capacity at ${candidate.display_name}.`)) return;
    
    setLoading(true);
    try {
      const res = await createDispatch(input, candidate);
      if (res.ok) {
        alert('DISPATCH EXECUTED. Capacity reserved and record created.');
        setResult(null); // Clear simulation results to show it's done
      }
    } catch (e: any) {
      alert(`Execution Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TacticalPanel title="Autonomous Routing Simulation" icon={BoltIcon} badge="Decision Layer" color="primary">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
           <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase">Destination Country</label>
                <input 
                  type="text" 
                  value={input.destination_country} 
                  onChange={(e) => setInput({...input, destination_country: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-[#131314]/[0.02] border border-slate-200 dark:border-white/5 rounded-none px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase">Destination City</label>
                <input 
                  type="text" 
                  value={input.destination_city} 
                  onChange={(e) => setInput({...input, destination_city: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-[#131314]/[0.02] border border-slate-200 dark:border-white/5 rounded-none px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase">Required Days</label>
                <input 
                  type="number" 
                  value={input.required_delivery_days} 
                  onChange={(e) => setInput({...input, required_delivery_days: parseInt(e.target.value)})}
                  className="w-full bg-slate-50 dark:bg-[#131314]/[0.02] border border-slate-200 dark:border-white/5 rounded-none px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase">Product</label>
                <select 
                  value={input.product_type} 
                  onChange={(e) => setInput({...input, product_type: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-[#131314]/[0.02] border border-slate-200 dark:border-white/5 rounded-none px-2 py-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-900 dark:text-white"
                >
                  <option value="SOFTCOVER_BOOK">Softcover Book</option>
                  <option value="HARDCOVER_BOOK">Hardcover Book</option>
                  <option value="DIGITAL_PRINT">Digital Print</option>
                </select>
              </div>
           </div>
           <button 
             onClick={runSimulation}
             disabled={loading}
             className="w-full py-2 bg-primary text-white text-[10px] font-black uppercase rounded-none shadow-none shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 transition-all"
           >
             {loading ? 'Simulating Decision...' : 'Execute Deterministic Scoring'}
           </button>
        </div>

        <div className="flex-[2] border-l border-slate-100 dark:border-white/5 pl-6 min-h-[200px]">
           {!result && (
             <div className="h-full flex flex-col items-center justify-center opacity-20 text-center">
                <ArrowPathIcon className="w-8 h-8 mb-2" />
                <span className="text-[10px] font-black uppercase">Awaiting Parameters</span>
             </div>
           )}
           {result && (
             <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                   <span className="text-[10px] font-black text-slate-400 uppercase">Ranked Candidates</span>
                   <span className="text-[8px] font-bold text-emerald-500 uppercase">{result.candidates?.length || 0} Eligible</span>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                   {result.candidates?.map((c: any) => (
                     <div key={c.node_id} className="p-3 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/5 flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                           <div className="w-6 h-6 rounded-none bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary">
                             {c.rank}
                           </div>
                           <div>
                              <div className="text-[10px] font-black text-slate-900 dark:text-white uppercase leading-tight">{c.display_name}</div>
                              <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{c.operational_region} / {c.routing_state}</div>
                           </div>
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="text-right">
                              <div className="text-[12px] font-black text-primary">{c.score_total}%</div>
                              <div className="text-[7px] font-black text-slate-400 uppercase">Score</div>
                           </div>
                           <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <button 
                                onClick={() => handleExecute(c)}
                                className="px-3 py-1 bg-emerald-500 text-white text-[8px] font-black uppercase rounded-none hover:bg-emerald-600 shadow-none shadow-emerald-500/20"
                              >
                                Execute
                              </button>
                           </div>
                        </div>
                     </div>
                   ))}
                   {result.rejected?.map((r: any) => (
                     <div key={r.node_id} className="p-2 rounded-none bg-red-500/5 border border-red-500/10 flex items-center justify-between opacity-60">
                        <div className="flex items-center gap-3">
                           <div className="w-5 h-5 rounded-none bg-red-500/10 flex items-center justify-center text-[8px] font-black text-red-500">X</div>
                           <div className="text-[9px] font-black text-slate-400 uppercase">{r.display_name}</div>
                        </div>
                        <span className="text-[8px] font-black text-red-500/60 uppercase">{r.reason}</span>
                     </div>
                   ))}
                </div>
             </div>
           )}
        </div>
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
        alert('DISPATCH ROLLED BACK. Capacity released.');
        dispatches.refetch();
      }
    } catch (e: any) {
      alert(`Rollback Failed: ${e.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RESERVED': return 'bg-amber-500/10 text-amber-500';
      case 'IN_PRODUCTION': return 'bg-emerald-500/10 text-emerald-500';
      case 'ROLLED_BACK': return 'bg-slate-500/10 text-slate-500';
      case 'FAILED': return 'bg-red-500/10 text-red-500';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <TacticalPanel title="Manufacturing Dispatch Console" icon={ArchiveBoxIcon} badge="Orchestration" color="slate" status={dispatches.status}>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {Array.isArray(dispatches.data?.dispatches) && dispatches.data.dispatches.map((d: any) => (
          <div key={d.id} className="p-3 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/5 flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase leading-tight">DISPATCH #{d.id?.slice(0, 8)}</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">NODE: {d.print_node_id?.slice(0, 8)}</span>
              </div>
              <div className={`px-2 py-0.5 rounded-none text-[8px] font-black uppercase ${getStatusColor(d.status)}`}>
                {d.status}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                 <div className="text-[9px] font-black text-slate-700 dark:text-zinc-300">
                    {new Date(d.created_at).toLocaleTimeString()}
                 </div>
                 <div className="text-[7px] font-black text-slate-400 uppercase">Timestamp</div>
              </div>
              {d.status !== 'ROLLED_BACK' && (
                <button 
                  onClick={() => handleRollback(d.id)}
                  className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-black uppercase rounded-none hover:bg-red-500/20 transition-all"
                >
                  Rollback
                </button>
              )}
            </div>
          </div>
        ))}
        {(!dispatches.data?.dispatches || dispatches.data.dispatches.length === 0) && (
          <div className="text-center py-10 opacity-20 uppercase font-black text-[9px]">NO ACTIVE DISPATCHES</div>
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
    <TacticalPanel title="Industrial Heartbeat Matrix" icon={BoltIcon} badge="Live Synchronization" color="primary" status={telemetry.status}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="p-3 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/5">
          <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Active Nodes</span>
          <div className="text-xl font-black text-slate-900 dark:text-slate-900 dark:text-white">{stats.active}</div>
        </div>
        <div className="p-3 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/5">
          <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Health Risks</span>
          <div className="text-xl font-black text-amber-500">{stats.degraded + stats.saturated}</div>
        </div>
        <div className="p-3 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/5">
          <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Global Load</span>
          <div className="text-xl font-black text-primary">{stats.avg_load || 0}%</div>
        </div>
        <div className="p-3 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/5">
          <span className="text-[8px] font-black text-slate-400 uppercase block mb-1">Sync Freshness</span>
          <div className="text-xl font-black text-emerald-500">{stats.freshness_pct}%</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {Array.isArray(nodes.data) && nodes.data.map((node: any) => (
          <div 
            key={node.id} 
            onClick={() => (window as any).openMachine?.(node.id || node.node_id || node.print_node_id)}
            className="p-2 rounded-none bg-slate-50 dark:bg-[#131314]/[0.01] border border-slate-100 dark:border-white/5 flex items-center justify-between group hover:border-primary/40 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              {getStatusIcon(node.status)}
              <div className="flex flex-col min-w-0">
                <span className="text-[8px] font-black text-slate-900 dark:text-white uppercase truncate leading-tight">{node.company_name || String(node.id || node.node_id || node.print_node_id || 'UNKNOWN').slice(0, 8)}</span>
                <span className="text-[6px] font-bold text-slate-400 uppercase truncate tracking-tighter">{node.region || 'UNK'} / {node.capacity_utilization_pct || 0}% LOAD</span>
              </div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[6px] font-black text-slate-400 uppercase">
                {node.last_heartbeat_at ? new Date(node.last_heartbeat_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'NEVER'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </TacticalPanel>
  );
};
