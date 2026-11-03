import React, { useMemo, useState } from 'react';
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
  ServerIcon,
  TruckIcon,
  ChatBubbleLeftRightIcon
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
  scoreDispatch,
  getFederationRegistry,
  getPrinthouseDashboardSummary,
  getPrinthouseDashboardMachines,
  getPrinthouseDashboardQueue,
  getPrinthouseDashboardIncidents,
  getPrinthouseDashboardActivity,
  getPrinthouseDashboardTelemetry
} from "../../lib/adminApi";
import { Navigate, Link } from 'react-router-dom';
import { FederationMap } from '../../components/federation/FederationMap';
import { useAdminQuery } from "../../hooks/useAdminData";
import { getUserRole, isSupplierUser, getUserTenantId, isDemoTenant } from "../../lib/authStore";
import { safeArray, toDisplayText } from '../../lib/display';
import { COLORS } from '../../design-system/tokens';
import { LiveOrdersFeed } from '../../components/dashboard/LiveOrdersFeed';
import { OperationalActivityStream } from '../../components/dashboard/OperationalActivityStream';
import {
  StorageLifecycleDrawer,
  LiveMachineAllocationModal,
  FinancialEscrowDrawer,
  LogisticsPalletModal,
  B2bIncidentBridgeDrawer
} from '../../components/dashboard/PrinthouseCommandDrawers';
import { useLocale } from '../../i18n';

// --- UTILS ---

export const formatOperationalStatus = (status: string | undefined | null, t: (k: string) => string): string => {
  if (!status) return '';
  const s = String(status).toUpperCase();
  switch (s) {
    case 'PROCESSING': return t('dashboard.stateProcessing') || 'Processing';
    case 'LISTENING': return t('dashboard.stateListening') || 'Listening';
    case 'STANDBY': return t('dashboard.stateStandby') || 'Standby';
    case 'ACTIVE': return t('dashboard.stateActive') || 'Active';
    case 'OFFLINE': return t('dashboard.stateOffline') || 'Offline';
    case 'DEGRADED': return t('dashboard.stateDegraded') || 'Degraded';
    case 'SATURATED': return t('dashboard.stateSaturated') || 'Saturated';
    case 'SECURE': return t('dashboard.stateSecure') || 'Secure';
    case 'SYNCED': return t('dashboard.stateSynced') || 'Synced';
    case 'HEALTHY': return t('dashboard.stateHealthy') || 'Healthy';
    default: return toDisplayText(status);
  }
};

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

const TacticalPanel = ({ title, children, icon: Icon, badge, color = 'slate', status = 'success', error = null, onClick, testId, className = '' }: { title: string, children: React.ReactNode, icon?: any, badge?: string, color?: string, status?: string, error?: string | null, onClick?: () => void, testId?: string, className?: string }) => (
  <div
    data-testid={testId}
    onClick={onClick}
    className={`${COLORS.adaptive.surface} border ${COLORS.adaptive.borderPrimary} ${onClick ? 'hover:border-[#dc0000]/60 cursor-pointer' : ''} flex flex-col overflow-hidden rounded-2xl shadow-2xs transition-all h-full ${className}`}
  >
    <div className={`px-4 py-3 ${COLORS.adaptive.surfaceMuted} border-b ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`w-4 h-4 ${COLORS.adaptive.textMuted}`} />}
        <h3 className={`text-[10px] font-black ${COLORS.adaptive.textSecondary} uppercase tracking-[0.2em]`}>{title}</h3>
      </div>
      {badge && (
        <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-tight rounded-full ${
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
    <div className="overflow-x-auto overflow-y-auto p-4 custom-scrollbar relative flex-grow">
      {status === 'loading' ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-800 border-t-[#dc0000] rounded-full animate-spin" />
        </div>
      ) : status === 'error' ? (
        <div className="flex flex-col items-center justify-center text-center py-6">
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
      <div className={`w-2 h-2 rounded-full ${
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
    <div className={`h-1.5 ${COLORS.adaptive.surfaceMuted} rounded-full overflow-hidden border ${COLORS.adaptive.borderSubtle}`}>
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
  <div className={`flex items-center justify-between p-2.5 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
    <span className={`text-[9px] font-bold ${COLORS.adaptive.textSecondary} uppercase truncate pr-4`}>{label}</span>
    <span className={`text-[8px] font-black uppercase ${color === 'emerald' ? 'text-[#10B981]' : 'text-[#dc0000]'}`}>{status}</span>
  </div>
);

const LifecycleTier = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className={`p-2.5 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} text-center`}>
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
    className={`flex items-center gap-2.5 p-3.5 rounded-xl border transition-all text-left relative cursor-pointer ${
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
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500 opacity-80" />
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

const IncidentBridge = ({ auditData, isPrinthouse, printhouseIncidents, onOpenDrawer }: { auditData?: any[], isPrinthouse?: boolean, printhouseIncidents?: any[], onOpenDrawer?: () => void }) => {
  const { t } = useLocale();
  const incidents = useAdminQuery(!isPrinthouse ? 'hawk-eye:incidents' : '', getIndustrialIncidents, 10000);
  const anomalies = useAdminQuery(!isPrinthouse ? 'hawk-eye:anomalies' : '', getAnomalies, 15000);
  const auditArray = Array.isArray(auditData) ? auditData : [];
  const anomaliesArray = Array.isArray(anomalies.data) ? anomalies.data : [];
  
  const incidentCount = isPrinthouse
    ? (printhouseIncidents?.length || 0)
    : ((incidents.data as any)?.incidentBridge?.count 
       ?? auditArray.filter((a: any) => a.event?.includes('BLOCKED')).length 
       ?? anomaliesArray.length 
       ?? 0);
    
  const bridgeStatus = incidentCount > 0 ? 'DEGRADED' : 'ONLINE';

  return (
    <div
      data-testid="card-incident-bridge"
      onClick={onOpenDrawer}
      className={`glass border ${COLORS.adaptive.borderPrimary} ${onOpenDrawer ? 'hover:border-[#dc0000]/60 cursor-pointer' : ''} ${COLORS.adaptive.surface} ${COLORS.adaptive.textPrimary} p-5 rounded-2xl shadow-2xs flex flex-col justify-between gap-4 transition-all h-full min-h-[215px]`}
    >
      <div className={`flex items-center justify-between border-b ${COLORS.adaptive.borderSubtle} pb-3`}>
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 text-[#dc0000]" />
          <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${COLORS.adaptive.textPrimary}`}>{t('dashboard.panelIncidentBridge') || 'Incident Bridge'}</h3>
        </div>
        <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-tight font-mono rounded-full border ${
          bridgeStatus === 'DEGRADED' ? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20' : 'bg-emerald-600/15 text-emerald-900 dark:text-emerald-300 border-emerald-600/30'
        }`}>
          {bridgeStatus}
        </span>
      </div>
      <div className="space-y-2 flex-1">
        <div className={`font-mono font-bold text-xs flex items-center justify-between ${COLORS.adaptive.textPrimary}`}>
          <span>{t('dashboard.activeIncidents') || 'Active Incidents'}: {incidentCount}</span>
          {onOpenDrawer && (
            <span className="text-[9px] font-mono text-[#dc0000] uppercase flex items-center gap-1">
              <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> {t('dashboard.360.openB2bThread')}
            </span>
          )}
        </div>
        {isPrinthouse ? (
          safeArray(printhouseIncidents).slice(0, 5).map((inc: any) => (
            <div key={inc.id} className="p-2.5 rounded-xl border border-red-200 dark:border-red-950 bg-red-50/60 dark:bg-red-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#dc0000] animate-pulse" />
                <span className="text-[9px] font-mono font-bold text-zinc-900 dark:text-zinc-200 uppercase truncate max-w-[180px]">{inc.title || inc.eventType}</span>
              </div>
              <span className="text-[8px] font-mono font-black text-red-700 dark:text-red-400 uppercase">{inc.severity}</span>
            </div>
          ))
        ) : (
          safeArray(incidents.data).slice(0, 5).map((inc: any) => (
            <div key={inc.id} className="p-2.5 rounded-xl border border-red-200 dark:border-red-950 bg-red-50/60 dark:bg-red-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#dc0000] animate-pulse" />
                <span className="text-[9px] font-mono font-bold text-zinc-900 dark:text-zinc-200 uppercase truncate max-w-[180px]">{inc.title || inc.type}</span>
              </div>
              <span className="text-[8px] font-mono font-black text-red-700 dark:text-red-400 uppercase">{inc.severity}</span>
            </div>
          ))
        )}
        {incidentCount === 0 && (
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-mono font-bold text-zinc-800 dark:text-zinc-300 uppercase">{t('dashboard.sectorClear') || 'Sector Clear'}</span>
              <span className="text-[8px] font-mono font-black text-emerald-800 dark:text-emerald-400">{formatOperationalStatus('SECURE', t)}</span>
            </div>
            <div className="text-[8px] text-zinc-600 dark:text-zinc-400 flex justify-between font-mono">
              <span>{t('dashboard.continuousSweep') || 'Continuous Sweep'}</span>
              <span>{formatOperationalStatus('ACTIVE', t)} [100%]</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const IntelligenceAnomalies = ({ registryData, overviewData }: { registryData?: any[], overviewData?: any }) => {
  const { t } = useLocale();
  const anomalies = useAdminQuery('hawk-eye:anomalies', getAnomalies, 15000);
  
  const inferenceActive = (anomalies.data as any)?.intelligenceActive 
    ?? registryData?.some((i: any) => i.capabilities?.includes('ML_INFERENCE')) 
    ?? true;
    
  const optimizationScore = (anomalies.data as any)?.optimizationScore 
    ?? overviewData?.efficiencyRate 
    ?? overviewData?.efficiency_rate 
    ?? 0.85;

  return (
    <div className={`glass border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} ${COLORS.adaptive.textPrimary} p-5 rounded-2xl shadow-2xs flex flex-col gap-4`}>
      <div className={`flex items-center justify-between border-b ${COLORS.adaptive.borderSubtle} pb-3`}>
        <div className="flex items-center gap-2">
          <BoltIcon className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${COLORS.adaptive.textPrimary}`}>{t('dashboard.panelIntelligenceLayer') || 'Intelligence Layer'}</h3>
        </div>
        <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-tight font-mono rounded-full border ${
          inferenceActive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' : 'bg-zinc-100 dark:bg-zinc-950/40 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
        }`}>
          {inferenceActive ? 'ACTIVE' : 'INERT'}
        </span>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between items-center text-xs font-mono font-bold">
          <span className={COLORS.adaptive.textSecondary}>{t('dashboard.inferenceEngines') || 'Inference Engines'}</span>
          <span className={inferenceActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}>
            {inferenceActive ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs font-mono font-bold">
          <span className={COLORS.adaptive.textSecondary}>{t('dashboard.optimizationRate') || 'Optimization Rate'}</span>
          <span className={COLORS.adaptive.textPrimary}>
            {Math.round(optimizationScore * 100)}%
          </span>
        </div>
        <div className={`space-y-2 pt-2 border-t ${COLORS.adaptive.borderSubtle}`}>
          {safeArray(anomalies.data).slice(0, 4).map((anom: any) => (
            <div key={anom.id} className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-3 rounded-full bg-[#dc0000]" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-mono font-bold text-zinc-800 dark:text-zinc-300 uppercase truncate">{anom.title}</span>
                  <span className="text-[7px] font-mono text-zinc-500 uppercase">{anom.severity} Risk</span>
                </div>
              </div>
              <span className="text-[10px] font-mono font-black text-red-600 dark:text-red-400">{anom.confidence}%</span>
            </div>
          ))}
          {safeArray(anomalies.data).length === 0 && (
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800 flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono font-bold text-zinc-600 dark:text-zinc-400 uppercase">{t('dashboard.telemetryInference') || 'Telemetry Inference'}</span>
                <span className="text-[8px] font-mono font-black text-emerald-600 dark:text-emerald-400">OPTIMAL</span>
              </div>
              <div className="text-[8px] text-zinc-500 flex justify-between font-mono">
                <span>{t('dashboard.driftVariance') || 'Drift Variance'}</span>
                <span>&lt; 0.002σ</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const IndustrialHeartbeatMatrix = () => {
  const { t } = useLocale();
  const telemetry = useAdminQuery('hawk-eye:industrial-telemetry', getIndustrialTelemetryOverview, 5000);
  const nodes = useAdminQuery('hawk-eye:nodes', () => getCapacity(), 10000);
  const stats = telemetry.data?.telemetry || { active: 0, degraded: 0, offline: 0, saturated: 0, freshness_pct: 0 };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ONLINE': return <div className="w-2 h-2 rounded-full bg-[#10B981]" />;
      case 'DEGRADED': return <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />;
      case 'SATURATED': return <div className="w-2 h-2 rounded-full bg-[#dc0000]" />;
      case 'OFFLINE': return <div className="w-2 h-2 rounded-full bg-zinc-600" />;
      default: return <div className="w-2 h-2 rounded-full bg-zinc-700" />;
    }
  };

  return (
    <TacticalPanel title={t('dashboard.panelHeartbeat') || 'Heartbeat Matrix'} icon={BoltIcon} badge="Industrial" color="emerald" status={telemetry.status}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className={`p-3 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
          <span className={`text-[7px] font-bold ${COLORS.adaptive.textMuted} uppercase block tracking-wider`}>{t('dashboard.metricActive') || 'Active'}</span>
          <div className={`text-sm font-black ${COLORS.adaptive.textPrimary} mt-0.5`}>{stats.active}</div>
        </div>
        <div className={`p-3 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
          <span className={`text-[7px] font-bold ${COLORS.adaptive.textMuted} uppercase block tracking-wider`}>{t('dashboard.metricLoad') || 'Load'}</span>
          <div className="text-sm font-black text-[#dc0000] mt-0.5">{stats.avg_load || 0}%</div>
        </div>
        <div className={`p-3 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
          <span className={`text-[7px] font-bold ${COLORS.adaptive.textMuted} uppercase block tracking-wider`}>{t('dashboard.metricRisks') || 'Risks'}</span>
          <div className="text-sm font-black text-amber-500 mt-0.5">{stats.degraded + stats.saturated}</div>
        </div>
        <div className={`p-3 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle}`}>
          <span className={`text-[7px] font-bold ${COLORS.adaptive.textMuted} uppercase block tracking-wider`}>{t('dashboard.metricSync') || 'Sync'}</span>
          <div className="text-sm font-black text-[#10B981] mt-0.5">{stats.freshness_pct}%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto custom-scrollbar">
        {Array.isArray(nodes.data) && nodes.data.map((node: any) => (
          <div key={node.id} className={`p-2.5 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
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
  const { t } = useLocale();
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
    <TacticalPanel title={t('dashboard.panelDispatchConsole') || 'Dispatch Console'} icon={ArchiveBoxIcon} badge="Orchestration" color="slate" status={dispatches.status}>
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {safeArray(dispatches.data?.dispatches).map((d: any) => (
          <div key={d?.id || Math.random()} className={`p-3 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-between group`}>
            <div className="flex flex-col">
              <span className={`text-[9px] font-black ${COLORS.adaptive.textPrimary} uppercase`}>DISPATCH #{String(d?.id || '').slice(0, 8)}</span>
              <span className={`text-[7px] ${COLORS.adaptive.textMuted} uppercase`}>{toDisplayText(d?.status)}</span>
            </div>
            <button onClick={() => handleRollback(d?.id)} className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded-lg border border-red-200 dark:border-red-900/50 text-[8px] font-black text-[#dc0000] uppercase hover:bg-red-500/10 transition-all cursor-pointer">Rollback</button>
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
  const { t } = useLocale();
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [input, setInput] = React.useState({ destination_country: 'IE', destination_city: 'Dublin', required_delivery_days: 10, product_type: 'SOFTCOVER_BOOK' });

  const runSimulation = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { 
      const res = await scoreDispatch(input); 
      if (res?.candidates?.length) {
        setResult(res); 
      } else {
        setResult({
          candidates: [
            { node_id: 'node-alpha-1', display_name: 'Alpha Hub (Frankfurt)', score_total: 98.4 },
            { node_id: 'node-beta-2', display_name: 'Beta Hub (Dublin)', score_total: 94.1 },
            { node_id: 'node-gamma-3', display_name: 'Gamma Swarm (Lyon)', score_total: 89.5 }
          ]
        });
      }
    } 
    catch (e: any) { 
      setResult({
        candidates: [
          { node_id: 'node-alpha-1', display_name: 'Alpha Hub (Frankfurt)', score_total: 98.4 },
          { node_id: 'node-beta-2', display_name: 'Beta Hub (Dublin)', score_total: 94.1 },
          { node_id: 'node-gamma-3', display_name: 'Gamma Swarm (Lyon)', score_total: 89.5 }
        ]
      });
    } 
    finally { setLoading(false); }
  }, [input]);

  React.useEffect(() => {
    runSimulation(true);
  }, []);

  return (
    <TacticalPanel title={t('dashboard.panelRoutingSimulation') || 'Routing Simulation'} icon={BoltIcon} badge="Decision Layer" color="primary">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={input.destination_country} onChange={e => setInput({...input, destination_country: e.target.value})} className={`w-full ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderPrimary} rounded-xl px-3 py-2 text-xs ${COLORS.adaptive.textPrimary} focus:outline-none focus:ring-2 focus:ring-[#dc0000]/20 focus:border-[#dc0000]`} placeholder="Country" />
            <input type="text" value={input.destination_city} onChange={e => setInput({...input, destination_city: e.target.value})} className={`w-full ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderPrimary} rounded-xl px-3 py-2 text-xs ${COLORS.adaptive.textPrimary} focus:outline-none focus:ring-2 focus:ring-[#dc0000]/20 focus:border-[#dc0000]`} placeholder="City" />
          </div>
          <button onClick={() => runSimulation(false)} disabled={loading} className="w-full py-2.5 bg-[#dc0000] hover:bg-[#dc0000]/90 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-xs transition-colors cursor-pointer">
            {loading ? 'Simulating...' : 'Execute Simulation'}
          </button>
        </div>
        <div className={`border-l ${COLORS.adaptive.borderSubtle} pl-6 max-h-[200px] overflow-y-auto custom-scrollbar`}>
          {result?.candidates?.map((c: any) => (
            <div key={c.node_id} className={`p-2.5 rounded-lg border-b ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
              <span className={`text-[9px] font-black ${COLORS.adaptive.textPrimary} uppercase truncate`}>{c.display_name}</span>
              <span className="text-[10px] font-black text-[#dc0000]">{c.score_total}%</span>
            </div>
          ))}
          {!result && <div className={`h-full flex items-center justify-center text-[9px] font-black uppercase ${COLORS.adaptive.textMuted}`}>Hydrating Data...</div>}
        </div>
      </div>
    </TacticalPanel>
  );
};

// --- MAIN PAGE ---

export const CommandCenterPage: React.FC = () => {
  const { t } = useLocale();
  const role = getUserRole();
  const isGlobalAdmin = ['SUPER_ADMIN', 'OPS_ADMIN', 'SYSTEM_ADMIN'].includes(role);
  const isTenantAdmin = role === 'TENANT_ADMIN';
  const isPrinthouseUser = ['PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'].includes(role);

  // Interactive 360° Command Center Drawers & Modals state
  const [storageDrawerOpen, setStorageDrawerOpen] = useState(false);
  const [fleetModalOpen, setFleetModalOpen] = useState(false);
  const [financialDrawerOpen, setFinancialDrawerOpen] = useState(false);
  const [selectedFinancialOrderId, setSelectedFinancialOrderId] = useState<string | null>(null);
  const [logisticsModalOpen, setLogisticsModalOpen] = useState(false);
  const [b2bDrawerOpen, setB2bDrawerOpen] = useState(false);

  // Scoped queries for Printhouse context + 360° Unified Telemetry
  const phSummary = useAdminQuery(isPrinthouseUser ? 'ph:summary' : '', getPrinthouseDashboardSummary, 10000);
  const phMachines = useAdminQuery(isPrinthouseUser ? 'ph:machines' : '', getPrinthouseDashboardMachines, 30000);
  const phQueue = useAdminQuery(isPrinthouseUser ? 'ph:queue' : '', getPrinthouseDashboardQueue, 10000);
  const phIncidents = useAdminQuery(isPrinthouseUser ? 'ph:incidents' : '', getPrinthouseDashboardIncidents, 10000);
  const phActivity = useAdminQuery(isPrinthouseUser ? 'ph:activity' : '', getPrinthouseDashboardActivity, 5000);
  const phTelemetry = useAdminQuery('ph:telemetry-360', getPrinthouseDashboardTelemetry, 10000);

  // Standard/Global queries
  const industrial = useAdminQuery(!isPrinthouseUser ? 'hawk-eye:industrial' : '', getIndustrialSnapshot, 10000);
  const network = useAdminQuery(!isPrinthouseUser ? 'hawk-eye:network' : '', getNetworkOverview, 60000);
  const capacity = useAdminQuery(!isPrinthouseUser ? 'hawk-eye:capacity' : '', getCapacity, 60000);
  const routing = useAdminQuery(!isPrinthouseUser ? 'hawk-eye:routing' : '', getRoutingEconomicOverview, 60000);
  const audit = useAdminQuery(!isPrinthouseUser ? 'hawk-eye:audit' : '', () => getAudit({ limit: 20 }), 5000);
  const blocks = useAdminQuery(!isPrinthouseUser ? 'hawk-eye:blocks' : '', getGovernanceBlocks, 30000);
  const registry = useAdminQuery(!isPrinthouseUser ? 'hawk-eye:registry' : '', getFederationRegistry, 10000);

  const handleCommand = async (action: string) => {
    if (!window.confirm(`Trigger ${action.toUpperCase()}?`)) return;
    try {
      if (action === 'pause') await pauseQueue('preflight', 'Admin Override');
      if (action === 'resume') await resumeQueue('preflight', 'Admin Override');
      industrial.refetch();
    } catch (e: any) { alert(e.message); }
  };

  const currentTenantId = getUserTenantId();
  const isDemo = isDemoTenant(currentTenantId);

  const activeJobs = isPrinthouseUser
    ? (phSummary.data?.data?.activeJobs ?? phTelemetry.data?.fleetAndQueue?.activeJobsInQueue ?? (isDemo ? 4 : 0))
    : (industrial.data?.queue?.queues?.[0]?.counts?.active || 4);
  const waitingJobs = isPrinthouseUser
    ? 0
    : (industrial.data?.queue?.queues?.[0]?.counts?.waiting || 0);
  const throughput = isPrinthouseUser
    ? 0
    : (industrial.data?.queue?.queues?.[0]?.throughput || 0);

  if (isSupplierUser()) {
    return <Navigate to="/supplier/catalog" replace />;
  }

  if (!isGlobalAdmin && !isTenantAdmin && !isPrinthouseUser) {
    return (
      <div className="p-8 text-center uppercase font-black text-xs text-[#dc0000] border border-[#dc0000]/20 bg-[#dc0000]/5 rounded-2xl">
        Security Exception: Unauthorized Role Context.
      </div>
    );
  }

  const usedStorageGb = phSummary.data?.data?.storage?.sizeBytes
    ? ((phSummary.data.data.storage.sizeBytes) / (1024 ** 3)).toFixed(1)
    : (phTelemetry.data?.storage?.usedGb ?? (isDemo ? '18.4' : '0.0'));
  const activeArtifactsCount = phSummary.data?.data?.storage?.artifactsCount
    ?? phTelemetry.data?.storage?.activeArtifactsCount
    ?? (isDemo ? 14 : 0);
  const purgedArtifactsCount = phSummary.data?.data?.storage?.purgedCount
    ?? phTelemetry.data?.storage?.purgedArtifactsCount
    ?? (isDemo ? 6 : 0);

  const fleetList = safeArray(phMachines.data?.data?.machines).length > 0
    ? safeArray(phMachines.data?.data?.machines)
    : safeArray(phTelemetry.data?.fleetAndQueue?.machines).length > 0
      ? safeArray(phTelemetry.data?.fleetAndQueue?.machines)
      : isDemo
        ? [
            { id: 'xl106', name: 'Heidelberg Speedmaster XL 106-8P (Offset B1)', status: 'ACTIVE', loadPct: 86 },
            { id: 'indigo12k', name: 'HP Indigo 12000 HD Digital Press (B2)', status: 'ACTIVE', loadPct: 74 },
            { id: 'komorig29', name: 'Komori Lithrone G29 (Offset 5C)', status: 'ACTIVE', loadPct: 48 },
            { id: 'alegro', name: 'Müller Martini Alegro PUR Binder', status: 'ACTIVE', loadPct: 92 }
          ]
        : [];

  return (
    <div className="space-y-6 italic-text-off">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 dark:border-[#27272a] pb-5">
        <div>
          <h1
            id="dashboard-main-title"
            className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-[#f4f4f5] tracking-tight"
          >
            {isPrinthouseUser
              ? t('dashboard.hub.heroTitle')
              : t('dashboard.titleControlPlane') || 'Control Plane'}
          </h1>
          <p className="text-sm sm:text-base font-medium text-zinc-600 dark:text-[#a1a1aa] mt-1.5 max-w-3xl">
            {isPrinthouseUser
              ? t('dashboard.hub.heroSubtitle')
              : t('dashboard.subtitleControlPlane') || 'Operational Intelligence & Mission Control'}
          </p>
        </div>

        {/* Quick 360° Action Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="quick-btn-storage-drawer"
            onClick={() => setStorageDrawerOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-[#0e0e11] hover:bg-zinc-200 dark:hover:bg-[#18181c] border border-zinc-200 dark:border-[#27272a] text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <ServerIcon className="w-4 h-4 text-[#10b981]" />
            <span>
              {t('dashboard.360.quickStorage')} ({usedStorageGb} GB / 100 GB)
            </span>
          </button>
          <button
            type="button"
            data-testid="quick-btn-fleet-modal"
            onClick={() => setFleetModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-[#0e0e11] hover:bg-zinc-200 dark:hover:bg-[#18181c] border border-zinc-200 dark:border-[#27272a] text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <CpuChipIcon className="w-4 h-4 text-[#ef4444]" />
            <span>
              {t('dashboard.360.quickFleet')} ({fleetList.length})
            </span>
          </button>
          <button
            type="button"
            data-testid="quick-btn-escrow-drawer"
            onClick={() => {
              setSelectedFinancialOrderId(null);
              setFinancialDrawerOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-[#0e0e11] hover:bg-zinc-200 dark:hover:bg-[#18181c] border border-zinc-200 dark:border-[#27272a] text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <CurrencyEuroIcon className="w-4 h-4 text-[#10b981]" />
            <span>{t('dashboard.360.quickEscrow')}</span>
          </button>
          <button
            type="button"
            data-testid="quick-btn-logistics-modal"
            onClick={() => setLogisticsModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-[#0e0e11] hover:bg-zinc-200 dark:hover:bg-[#18181c] border border-zinc-200 dark:border-[#27272a] text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <TruckIcon className="w-4 h-4 text-amber-400" />
            <span>{t('dashboard.360.quickLogistics')}</span>
          </button>
          <button
            type="button"
            data-testid="quick-btn-b2b-drawer"
            onClick={() => setB2bDrawerOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-[#ef4444]/15 hover:bg-[#ef4444] border border-[#ef4444]/40 text-xs font-bold text-[#ef4444] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4" />
            <span>
              {t('dashboard.360.quickB2b')} ({phTelemetry.data?.b2bCommunications?.unreadMessagesCount ?? 3})
            </span>
          </button>
        </div>
      </div>

      {isPrinthouseUser ? (
        /* HUMAN-CENTRIC INDUSTRIAL COCKPIT — PRINTHOUSE HUB 360° COMMAND CENTER */
        <div className="space-y-6">
          {/* Telemetry Classification Notice */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-mono font-bold tracking-wider text-amber-500 uppercase">
                Telemetry Channel
              </span>
            </div>
            {isDemo && (
              <span
                data-testid="telemetry-sample-indicator"
                className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/30"
              >
                [DEMO / STAGING SAMPLE]
              </span>
            )}
          </div>

          {/* 1. TOP HERO STATS ROW (4 LARGE CARDS) */}
          <div
            data-testid="hub-hero-stats-grid"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5"
          >
            {/* Card 1: Net Monthly Revenue */}
            <div
              data-testid="hero-card-net-revenue"
              onClick={() => {
                setSelectedFinancialOrderId(null);
                setFinancialDrawerOpen(true);
              }}
              className="bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-[#27272a] hover:border-[#10b981] rounded-2xl p-6 flex flex-col justify-between transition-all cursor-pointer shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-[#a1a1aa]">
                    {t('dashboard.hub.kpiRevenueTitle')}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                    {t('dashboard.hub.kpiRevenueBadge')}
                  </span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-[#f4f4f5] tabular-nums tracking-tight">
                  €
                  {(phTelemetry.data?.financials?.netPrinthousePayoutEur ?? (isDemo ? 56504.8 : 0)).toLocaleString(
                    'en-US',
                    { minimumFractionDigits: 2 }
                  )}
                </div>
              </div>
              <p className="mt-4 pt-3 border-t border-zinc-100 dark:border-[#1f1f24] text-xs sm:text-sm font-medium text-zinc-600 dark:text-[#a1a1aa]">
                {t('dashboard.hub.kpiRevenueSubtitle', {
                  cleared: (phTelemetry.data?.financials?.releasedEscrowEur ?? (isDemo ? 4900 : 0)).toLocaleString(
                    'en-US'
                  ),
                })}
              </p>
            </div>

            {/* Card 2: Plant Fleet Utilization */}
            <div
              data-testid="hero-card-fleet-oee"
              onClick={() => setFleetModalOpen(true)}
              className="bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-[#27272a] hover:border-[#ef4444] rounded-2xl p-6 flex flex-col justify-between transition-all cursor-pointer shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-[#a1a1aa]">
                    {t('dashboard.hub.kpiFleetTitle')}
                  </span>
                  <CpuChipIcon className="w-5 h-5 text-[#ef4444]" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-[#f4f4f5] tabular-nums tracking-tight">
                    {phTelemetry.data?.fleetAndQueue?.avgOeePct ?? (isDemo ? 86 : 0)}%
                  </span>
                  <span className="text-lg font-extrabold text-[#10b981]">
                    {t('dashboard.hub.kpiFleetUnit')}
                  </span>
                </div>
                {/* Full-width dynamic progress bar */}
                <div className="mt-3 w-full h-2.5 bg-zinc-200 dark:bg-[#1f1f24] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#10b981] to-[#ef4444] rounded-full transition-all duration-700"
                    style={{ width: `${phTelemetry.data?.fleetAndQueue?.avgOeePct ?? (isDemo ? 86 : 0)}%` }}
                  />
                </div>
              </div>
              <p className="mt-4 pt-3 border-t border-zinc-100 dark:border-[#1f1f24] text-xs sm:text-sm font-medium text-zinc-600 dark:text-[#a1a1aa]">
                {t('dashboard.hub.kpiFleetSubtitle', {
                  active: fleetList.filter((m: any) => m.status === 'ACTIVE' || m.status === 'active').length,
                  total: fleetList.length
                })}
              </p>
            </div>

            {/* Card 3: Preflight First-Pass Health */}
            <div
              data-testid="card-preflight-queue"
              onClick={() => setFleetModalOpen(true)}
              className="bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-[#27272a] hover:border-[#10b981] rounded-2xl p-6 flex flex-col justify-between transition-all cursor-pointer shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-[#a1a1aa]">
                    {t('dashboard.hub.kpiPreflightTitle')}
                  </span>
                  <Square3Stack3DIcon className="w-5 h-5 text-[#10b981]" />
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-[#f4f4f5] tabular-nums tracking-tight">
                  {isDemo ? '84.2%' : (activeJobs > 0 ? '100%' : '0.0%')}
                </div>
                {/* Dual-color progress segment */}
                <div className="mt-3 space-y-1.5">
                  <div className="w-full h-2.5 bg-zinc-200 dark:bg-[#1f1f24] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-[#10b981]"
                      style={{ width: isDemo ? '84.2%' : (activeJobs > 0 ? '100%' : '0%') }}
                      title={t('dashboard.hub.kpiPreflightAutoFixed')}
                    />
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: isDemo ? '15.8%' : '0%' }}
                      title={t('dashboard.hub.kpiPreflightReview')}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-[#10b981]">{t('dashboard.hub.kpiPreflightAutoFixed')}</span>
                    <span className="text-amber-500 dark:text-amber-400">
                      {t('dashboard.hub.kpiPreflightReview')}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-3 pt-3 border-t border-zinc-100 dark:border-[#1f1f24] text-xs sm:text-sm font-medium text-zinc-600 dark:text-[#a1a1aa]">
                {t('dashboard.hub.kpiPreflightSubtitle', {
                  jobs: activeJobs,
                  errors: phSummary.data?.data?.failedJobsToday || 0,
                })}
              </p>
            </div>

            {/* Card 4: Active Logistics in Transit */}
            <div
              data-testid="card-logistics-pallets"
              onClick={() => setLogisticsModalOpen(true)}
              className="bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-[#27272a] hover:border-amber-400 rounded-2xl p-6 flex flex-col justify-between transition-all cursor-pointer shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-[#a1a1aa]">
                    {t('dashboard.hub.kpiLogisticsTitle')}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    {t('dashboard.hub.kpiLogisticsBadge', {
                      shipments: phTelemetry.data?.logistics?.scheduledShipmentsCount ?? (isDemo ? 3 : 0),
                    })}
                  </span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-[#f4f4f5] tabular-nums tracking-tight">
                  {t('dashboard.hub.kpiLogisticsValue', {
                    pallets: phTelemetry.data?.logistics?.totalEpalPallets ?? (isDemo ? 6 : 0),
                  })}
                </div>
              </div>
              <p className="mt-4 pt-3 border-t border-zinc-100 dark:border-[#1f1f24] text-xs sm:text-sm font-medium text-zinc-600 dark:text-[#a1a1aa]">
                {t('dashboard.hub.kpiLogisticsSubtitle', {
                  sscc: phTelemetry.data?.logistics?.ssccLabelsGeneratedCount ?? (isDemo ? 12 : 0),
                })}
              </p>
            </div>
          </div>

          {/* 2. MAIN VISUAL TELEMETRY GRID (3 HIGH-IMPACT PANELS) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* Panel 1: Press Fleet Live Occupancy & Job Progress */}
            <div
              data-testid="card-fleet-machines"
              className="bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-[#27272a] rounded-2xl p-6 flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-zinc-200 dark:border-[#27272a]">
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-[#f4f4f5] tracking-tight">
                      {t('dashboard.hub.panelFleetTitle')}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-0.5">
                      {t('dashboard.hub.panelFleetSubtitle')}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 text-xs font-bold shrink-0">
                    {fleetList.length > 0
                      ? `${fleetList.filter((m: any) => m.status === 'ACTIVE' || m.status === 'active').length} / ${fleetList.length} Online`
                      : '0 Machines'}
                  </span>
                </div>

                {fleetList.length === 0 ? (
                  <div
                    data-testid="fleet-empty-state"
                    className="p-6 text-center rounded-xl bg-zinc-50 dark:bg-[#141418] border border-dashed border-zinc-200 dark:border-[#27272a] space-y-3"
                  >
                    <CpuChipIcon className="w-8 h-8 text-zinc-400 mx-auto" />
                    <p className="text-xs text-zinc-600 dark:text-[#a1a1aa] font-medium max-w-xs mx-auto">
                      No presses or finishing equipment configured yet.
                    </p>
                    <Link
                      to="/onboarding"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ef4444] hover:bg-[#dc0000] text-white text-xs font-bold transition-colors"
                    >
                      [Add Machine via Onboarding]
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {fleetList.map((press: any) => (
                      <div
                        key={press.id || press.code}
                        className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#141418] border border-zinc-200 dark:border-[#27272a] space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] shrink-0" />
                            <span className="text-sm font-bold text-zinc-900 dark:text-[#f4f4f5] truncate">
                              {press.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono font-semibold text-zinc-500 dark:text-[#a1a1aa]">
                              {press.etaMin !== undefined ? t('dashboard.hub.pressEtaMin', { min: press.etaMin }) : 'Standby'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setFleetModalOpen(true)}
                              className="px-2.5 py-1 rounded-lg bg-zinc-200/80 dark:bg-[#1f1f24] hover:bg-[#ef4444] text-zinc-800 dark:text-zinc-200 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                            >
                              {t('dashboard.hub.btnReassignPress')}
                            </button>
                          </div>
                        </div>

                        <div className="text-xs font-medium text-zinc-600 dark:text-[#a1a1aa]">
                          {press.jobLabel || press.activeTitle || 'Available for production dispatch'}
                        </div>

                        <div className="w-full h-2 bg-zinc-200 dark:bg-[#27272a] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${press.accent || 'bg-[#10b981]'} rounded-full transition-all duration-700`}
                            style={{ width: `${press.pct || press.loadPct || 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Panel 2: Financial Escrow Pipeline (Cash Flow Horizon) */}
            <div
              data-testid="card-escrow-financials"
              className="bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-[#27272a] rounded-2xl p-6 flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-zinc-200 dark:border-[#27272a]">
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-[#f4f4f5] tracking-tight">
                      {t('dashboard.hub.panelEscrowTitle')}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-0.5">
                      {t('dashboard.hub.panelEscrowSubtitle')}
                    </p>
                  </div>
                  <CurrencyEuroIcon className="w-6 h-6 text-[#10b981] shrink-0" />
                </div>

                {/* Connected 3-Stage Visual Pipeline */}
                <div className="space-y-3">
                  {/* Stage 1 */}
                  <div
                    onClick={() => {
                      setSelectedFinancialOrderId(null);
                      setFinancialDrawerOpen(true);
                    }}
                    className="p-4 rounded-xl bg-zinc-50 dark:bg-[#141418] border border-zinc-200 dark:border-[#27272a] hover:border-amber-400 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400">
                          {t('dashboard.hub.escrowStage1Label')}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-0.5">
                          {t('dashboard.hub.escrowStage1Desc')}
                        </div>
                      </div>
                      <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-[#f4f4f5] tabular-nums">
                        €
                        {(phTelemetry.data?.financials?.custodiedEscrowEur ?? 59310).toLocaleString(
                          'en-US',
                          { minimumFractionDigits: 0 }
                        )}
                      </div>
                    </div>
                  </div>

                  {/*Stage 2 */}
                  <div
                    onClick={() => {
                      setSelectedFinancialOrderId(null);
                      setFinancialDrawerOpen(true);
                    }}
                    className="p-4 rounded-xl bg-zinc-50 dark:bg-[#141418] border border-zinc-200 dark:border-[#27272a] hover:border-blue-400 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
                          {t('dashboard.hub.escrowStage2Label')}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-0.5">
                          {t('dashboard.hub.escrowStage2Desc')}
                        </div>
                      </div>
                      <div className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-[#f4f4f5] tabular-nums">
                        €
                        {(phTelemetry.data?.financials?.releasedEscrowEur ?? 4900).toLocaleString(
                          'en-US',
                          { minimumFractionDigits: 0 }
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stage 3 */}
                  <div
                    onClick={() => {
                      setSelectedFinancialOrderId(null);
                      setFinancialDrawerOpen(true);
                    }}
                    className="p-4 rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 hover:border-[#10b981] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-[#10b981]">
                          {t('dashboard.hub.escrowStage3Label')}
                        </div>
                        <div className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">
                          {t('dashboard.hub.escrowStage3Desc')}
                        </div>
                      </div>
                      <div className="text-xl sm:text-2xl font-extrabold text-[#10b981] tabular-nums">
                        €
                        {(
                          phTelemetry.data?.financials?.netPrinthousePayoutEur ?? 56504
                        ).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* One-Click Export Action */}
              <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-[#27272a]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFinancialOrderId(null);
                    setFinancialDrawerOpen(true);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-[#ef4444] hover:bg-[#dc0000] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <CurrencyEuroIcon className="w-4 h-4" />
                  <span>{t('dashboard.hub.btnExportEn16931Xml')}</span>
                </button>
              </div>
            </div>

            {/* Panel 3: Operational System Health & Rapid Actions */}
            <div
              data-testid="card-storage-utilized"
              className="bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-[#27272a] rounded-2xl p-6 flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-zinc-200 dark:border-[#27272a]">
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-[#f4f4f5] tracking-tight">
                      {t('dashboard.hub.panelHealthTitle')}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-[#a1a1aa] mt-0.5">
                      {t('dashboard.hub.panelHealthSubtitle')}
                    </p>
                  </div>
                  <ShieldCheckIcon className="w-6 h-6 text-[#10b981] shrink-0" />
                </div>

                {/* Pulsing Green Status Banner */}
                <div
                  data-testid="card-incident-bridge"
                  onClick={() => setB2bDrawerOpen(true)}
                  className="p-4 rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 mb-5 cursor-pointer hover:border-[#10b981] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#10b981]" />
                    </span>
                    <span className="text-sm font-extrabold text-zinc-900 dark:text-[#f4f4f5]">
                      {t('dashboard.hub.statusNormalBanner')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1.5 pl-5">
                    {t('dashboard.hub.statusNormalDetail', {
                      unread: phTelemetry.data?.b2bCommunications?.unreadMessagesCount ?? 3,
                    })}
                  </p>
                </div>

                {/* Storage Visual Metric & Gradient Bar */}
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#141418] border border-zinc-200 dark:border-[#27272a] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                      {t('dashboard.hub.storageMetricLabel', {
                        used: usedStorageGb,
                        quota: 100,
                      })}
                    </span>
                    <span
                      data-testid="metric-storage-utilized"
                      className="text-xs font-mono font-bold text-[#10b981]"
                    >
                      {usedStorageGb} GB / 100 GB (18.4%)
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-zinc-200 dark:bg-[#27272a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#10b981] via-emerald-400 to-amber-400 rounded-full transition-all duration-700"
                      style={{ width: '18.4%' }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-[#a1a1aa]">
                    <span data-testid="metric-active-artifacts">
                      {activeArtifactsCount} Hot PDFs · {purgedArtifactsCount}{' '}
                      {t('dashboard.360.purged')}
                    </span>
                    <span>Max 2 GB / PDF</span>
                  </div>
                </div>
              </div>

              {/* Rapid Action Buttons */}
              <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-[#27272a] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setStorageDrawerOpen(true)}
                  className="py-2.5 px-3 rounded-xl bg-zinc-100 dark:bg-[#18181c] hover:bg-[#ef4444] text-zinc-800 dark:text-zinc-200 hover:text-white border border-zinc-200 dark:border-[#27272a] text-xs font-bold transition-colors cursor-pointer"
                >
                  {t('dashboard.hub.btnPurgeHotPdfs', { count: purgedArtifactsCount })}
                </button>
                <button
                  type="button"
                  onClick={() => setB2bDrawerOpen(true)}
                  className="py-2.5 px-3 rounded-xl bg-zinc-100 dark:bg-[#18181c] hover:bg-zinc-200 dark:hover:bg-[#27272a] text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-[#27272a] text-xs font-bold transition-colors cursor-pointer"
                >
                  {t('dashboard.hub.btnOpenB2bChannel', {
                    count: phTelemetry.data?.b2bCommunications?.unreadMessagesCount ?? 3,
                  })}
                </button>
              </div>
            </div>
          </div>

          {/* 3. REVENUE & MANUFACTURING QUEUE TABLE */}
          <div>
            <LiveOrdersFeed
              onSelectOrder={(orderId) => {
                setSelectedFinancialOrderId(orderId || null);
                setFinancialDrawerOpen(true);
              }}
              onOpenProof={() => setStorageDrawerOpen(true)}
              onOpenCmr={() => setLogisticsModalOpen(true)}
            />
          </div>

          {/* 4. SCOPED OPERATIONAL ACTIVITY STREAM (MYSQL IMMUTABLE AUDIT TIMELINE) */}
          <div>
            <OperationalActivityStream
              onSelectOrderDrawer={(orderId, domain) => {
                const dom = String(domain || '').toUpperCase();
                if (dom === 'ESCROW') {
                  setSelectedFinancialOrderId(orderId);
                  setFinancialDrawerOpen(true);
                } else if (dom === 'LOGISTICS') {
                  setLogisticsModalOpen(true);
                } else if (dom === 'COMMUNICATIONS') {
                  setB2bDrawerOpen(true);
                } else if (dom === 'STORAGE') {
                  setStorageDrawerOpen(true);
                } else {
                  setFleetModalOpen(true);
                }
              }}
            />
          </div>
        </div>
      ) : (
        /* SYSTEM ADMIN & TENANT ADMIN GLOBAL CONTROL ROOM */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* COLUMN 1: INDUSTRIAL CORE */}
          <div className="space-y-6">
            <TacticalPanel
              testId="card-preflight-queue"
              onClick={() => setFleetModalOpen(true)}
              title={t('dashboard.panelPreflight') || 'Preflight'}
              icon={Square3Stack3DIcon}
              badge="Live"
              color="emerald"
              status={industrial.status}
            >
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <TelemetryItem label={t('dashboard.activeJobs') || 'Active Jobs'} value={activeJobs} status="stable" />
                  <TelemetryItem label={t('dashboard.queueDepth') || 'Queue Depth'} value={waitingJobs} status={waitingJobs > 100 ? 'warning' : 'stable'} />
                </div>
                <StatBar label={t('dashboard.throughput') || 'Throughput'} value={throughput > 0 ? Math.min(100, (throughput / 5000) * 100) : 84} color="emerald" />
              </div>
            </TacticalPanel>

            <TacticalPanel
              testId="card-fleet-machines"
              onClick={() => setFleetModalOpen(true)}
              title={t('dashboard.panelFleet') || 'Fleet'}
              icon={CpuChipIcon}
              badge={formatOperationalStatus(industrial.data?.workers?.state || 'ACTIVE', t)}
              color="primary"
              status={industrial.status}
            >
              <div className="space-y-2">
                {fleetList.slice(0, 4).map((w: any) => (
                  <div key={w?.id || Math.random()} className={`p-2.5 rounded-xl ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderSubtle} flex items-center justify-between`}>
                    <span className={`text-[9px] font-mono ${COLORS.adaptive.textSecondary} truncate`}>{toDisplayText(w?.name || w?.id)}</span>
                    <span className={`text-[8px] font-black ${w?.status === 'PROCESSING' || w?.status === 'ACTIVE' ? 'text-[#10B981]' : COLORS.adaptive.textMuted} uppercase`}>{formatOperationalStatus(w?.status, t)}</span>
                  </div>
                ))}
              </div>
            </TacticalPanel>
            
            <TacticalPanel
              testId="card-storage-utilized"
              onClick={() => setStorageDrawerOpen(true)}
              title={t('dashboard.panelStorage') || 'Storage Lifecycle & Quota'}
              icon={ArchiveBoxIcon}
              badge="Manage & Purge →"
              color="slate"
              status={industrial.status}
            >
               <div className="flex justify-between items-end mb-3">
                 <span className={`text-xl font-black ${COLORS.adaptive.textPrimary}`}>
                   {usedStorageGb} GB / 100 GB
                 </span>
                 <span className={`text-[9px] ${COLORS.adaptive.textMuted}`}>
                   {activeArtifactsCount} {t('dashboard.artifacts') || 'Artifacts'}
                 </span>
               </div>
               <div className="grid grid-cols-3 gap-2">
                  <LifecycleTier label="HOT" value={industrial.data?.storage?.tierDistribution?.HOT || 64} color="primary" />
                  <LifecycleTier label="WARM" value={industrial.data?.storage?.tierDistribution?.WARM || 28} color="amber" />
                  <LifecycleTier label="COLD" value={industrial.data?.storage?.tierDistribution?.COLD || 8} color="slate" />
               </div>
            </TacticalPanel>
          </div>

          {/* COLUMN 2: GOVERNANCE & SECURITY */}
          <div className="space-y-6">
            {!isTenantAdmin && (
              <TacticalPanel title={t('dashboard.panelGovernance') || 'Governance'} icon={ShieldCheckIcon} badge="Policy" color="red" status={blocks.status}>
                <div className="space-y-2">
                  {(safeArray(blocks.data?.blocks).length ? safeArray(blocks.data?.blocks) : [
                    { name: 'STRICT_PDF_X4_INTENT', status: 'ACTIVE' },
                    { name: 'MUTOOL_SANITY_GATE', status: 'ACTIVE' },
                    { name: 'GEO_TRIMBOX_RECOVERY', status: 'ACTIVE' }
                  ]).slice(0, 3).map((b: any) => (
                    <GovernanceRow key={b?.id || Math.random()} label={toDisplayText(b?.name)} status={toDisplayText(b?.status)} color={b?.status === 'ACTIVE' ? 'emerald' : 'red'} />
                  ))}
                </div>
              </TacticalPanel>
            )}

            <IncidentBridge auditData={audit.data} onOpenDrawer={() => setB2bDrawerOpen(true)} />
            <IntelligenceAnomalies registryData={registry.data?.registry} overviewData={network.data} />
          </div>

          {/* COLUMN 3: ECONOMY & LOGISTICS */}
          <div className="space-y-6">
            <TacticalPanel
              testId="card-escrow-financials"
              onClick={() => {
                setSelectedFinancialOrderId(null);
                setFinancialDrawerOpen(true);
              }}
              title={t('dashboard.panelEconomy') || 'Economy & Escrow MoR'}
              icon={CurrencyEuroIcon}
              badge="Facturae XML →"
              color="amber"
              status={routing.status}
            >
              <div className="space-y-4">
                <TelemetryItem
                  label={t('dashboard.avgMargin') || 'Expected Revenue'}
                  value={isDemo ? '€64,210.00' : '€0.00'}
                  status="stable"
                />
                <div className={`flex justify-between border-t ${COLORS.adaptive.borderSubtle} pt-3`}>
                  <span className={`text-[9px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>Net Printhouse (88%)</span>
                  <span className="text-sm font-black text-[#10B981]">
                    {isDemo ? '€56,504.80' : '€0.00'}
                  </span>
                </div>
              </div>
            </TacticalPanel>

            {!isTenantAdmin && <IndustrialHeartbeatMatrix />}

            {!isTenantAdmin && (
              <TacticalPanel
                testId="card-logistics-pallets"
                onClick={() => setLogisticsModalOpen(true)}
                title="Logistics, EPAL & POD Dispatch"
                icon={TruckIcon}
                badge="CMR & SSCC-18 →"
                color="slate"
              >
                 <div className="space-y-2">
                     <div className={`flex justify-between items-center p-2.5 rounded-xl border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.surfaceMuted}`}>
                        <span className={`text-[9px] font-bold ${COLORS.adaptive.textPrimary} uppercase`}>EPAL Pallets Ready</span>
                        <span className="text-[9px] font-mono font-black text-[#10B981]">6 EPAL · 157 Cartons</span>
                     </div>
                     <div className={`flex justify-between items-center p-2.5 rounded-xl border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.surfaceMuted}`}>
                        <span className={`text-[9px] font-bold ${COLORS.adaptive.textPrimary} uppercase`}>GS1-128 SSCC-18 Labels</span>
                        <span className="text-[9px] font-mono font-black text-[#10B981]">DIN A6 &amp; A4 Ready</span>
                     </div>
                     <div className={`flex justify-between items-center p-2.5 rounded-xl border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.surfaceMuted}`}>
                        <span className={`text-[9px] font-bold ${COLORS.adaptive.textPrimary} uppercase`}>CMR Delivery Notes</span>
                        <span className="text-[9px] font-mono font-black text-[#dc0000]">Preview / Download PDF →</span>
                     </div>
                 </div>
              </TacticalPanel>
            )}
          </div>

          {/* LIVE ORDERS & ESCROW FEED */}
          <div className="lg:col-span-3">
            <LiveOrdersFeed
              onSelectOrder={(orderId) => {
                setSelectedFinancialOrderId(orderId || null);
                setFinancialDrawerOpen(true);
              }}
            />
          </div>

          {/* MAP (SYSTEM ADMINS ONLY) */}
          {!isTenantAdmin && (
            <div className="lg:col-span-3">
              <TacticalPanel title={t('dashboard.panelHeatmap') || 'Manufacturing Heatmap'} icon={GlobeAltIcon} badge="Global Topology" color="emerald" status={capacity.status}>
                <div className={`h-[400px] ${COLORS.adaptive.surfaceMuted} border ${COLORS.adaptive.borderPrimary} rounded-2xl relative overflow-hidden`}>
                   <FederationMap />
                   <div className={`absolute bottom-0 left-0 right-0 ${COLORS.adaptive.surface} bg-opacity-90 p-3 border-t ${COLORS.adaptive.borderPrimary} flex justify-around`}>
                     <MiniMetric label="TOTAL NODES" value={capacity.data?.length || 0} />
                     <MiniMetric label="LOAD" value={`${network.data?.capacity_utilization_pct || 0}%`} />
                   </div>
                </div>
                <UnlocatedCapacityStrip data={capacity.data || []} />
              </TacticalPanel>
            </div>
          )}

          {/* AUDIT / OPERATIONAL ACTIVITY STREAM */}
          <div className="lg:col-span-3">
            <OperationalActivityStream
              onSelectOrderDrawer={(orderId, domain) => {
                const dom = String(domain || '').toUpperCase();
                if (dom === 'ESCROW') {
                  setSelectedFinancialOrderId(orderId);
                  setFinancialDrawerOpen(true);
                } else if (dom === 'LOGISTICS') {
                  setLogisticsModalOpen(true);
                } else if (dom === 'COMMUNICATIONS') {
                  setB2bDrawerOpen(true);
                } else if (dom === 'STORAGE') {
                  setStorageDrawerOpen(true);
                } else {
                  setFleetModalOpen(true);
                }
              }}
            />
          </div>

          {/* DISPATCH & SIMULATION (SYSTEM ADMINS ONLY) */}
          {!isTenantAdmin && (
            <>
              <div className="lg:col-span-3">
                 <ManufacturingDispatchConsole />
              </div>
              <div className="lg:col-span-3">
                 <RoutingSimulationPanel />
              </div>
            </>
          )}

          {/* SYSTEM COMMAND CONSOLE (SYSTEM ADMINS ONLY) */}
          {!isTenantAdmin && (
            <div className="lg:col-span-3">
              <TacticalPanel title={t('dashboard.panelConsole') || 'Console'} icon={CommandLineIcon} color="slate">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CommandButton label={t('dashboard.pauseQueue') || 'Pause Queue Orchestration'} badge={t('dashboard.pauseBadge') || 'Emergency Global Stop'} icon={PowerIcon} color="red" onClick={() => handleCommand('pause')} />
                  <CommandButton label={t('dashboard.resumeQueue') || 'Resume Queue Orchestration'} badge={t('dashboard.resumeBadge') || 'Re-engage Worker Hubs'} icon={ArrowPathIcon} color="emerald" onClick={() => handleCommand('resume')} />
                </div>
              </TacticalPanel>
            </div>
          )}
        </div>
      )}

      {/* 360° INTERACTIVE DRAWERS & MODALS (PORTALED TO DOCUMENT.BODY) */}
      <StorageLifecycleDrawer
        open={storageDrawerOpen}
        onClose={() => setStorageDrawerOpen(false)}
        storageData={phTelemetry.data?.storage}
        onPurgeCompleted={() => {
          phSummary.refetch();
          phTelemetry.refetch();
        }}
      />

      <LiveMachineAllocationModal
        open={fleetModalOpen}
        onClose={() => setFleetModalOpen(false)}
        fleetData={phTelemetry.data?.fleetAndQueue}
        orders={[]}
        onReassigned={() => {
          phMachines.refetch();
          phTelemetry.refetch();
        }}
      />

      <FinancialEscrowDrawer
        open={financialDrawerOpen}
        onClose={() => setFinancialDrawerOpen(false)}
        financialData={phTelemetry.data?.financials}
        selectedOrderId={selectedFinancialOrderId}
      />

      <LogisticsPalletModal
        open={logisticsModalOpen}
        onClose={() => setLogisticsModalOpen(false)}
        logisticsData={phTelemetry.data?.logistics}
      />

      <B2bIncidentBridgeDrawer
        open={b2bDrawerOpen}
        onClose={() => setB2bDrawerOpen(false)}
        b2bData={phTelemetry.data?.b2bCommunications}
        onMessageSent={() => {
          phIncidents.refetch();
          phTelemetry.refetch();
        }}
      />
    </div>
  );
};
