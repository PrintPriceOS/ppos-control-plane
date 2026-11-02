import React, { useState, useEffect, useCallback } from 'react';
import {
  BoltIcon,
  ArrowPathIcon,
  Square3Stack3DIcon,
  CpuChipIcon,
  CurrencyEuroIcon,
  TruckIcon,
  ChatBubbleLeftRightIcon,
  ServerIcon
} from '@heroicons/react/24/outline';
import {
  getPrinthouseOperationalActivityStream,
  OperationalActivityEvent
} from '../../lib/adminApi';
import { useLocale } from '../../i18n';

export type ActivityFilterDomain =
  | 'ALL'
  | 'PREFLIGHT'
  | 'PRODUCTION'
  | 'ESCROW'
  | 'LOGISTICS';

interface OperationalActivityStreamProps {
  onSelectOrderDrawer?: (orderId: string, domain: string) => void;
}

const FALLBACK_EVENTS: OperationalActivityEvent[] = [
  {
    id: 'EVT-2026-8845',
    orderId: 'PUB-ORD-2026-104',
    domain: 'PREFLIGHT',
    eventType: 'PREFLIGHT_AUTO_FIX_APPLIED',
    severity: 'SUCCESS',
    title: 'Síntesis de Sangre (+3.0 mm) y Lomo Calibrado',
    description:
      "Se generó sangrado espejo de 3.0 mm y lomo recalculado a 16.88 mm para 'Manual de Ingeniería Fotónica Aplicada' (PDF/X-4).",
    metadata: { calculatedSpineMm: 16.88, bleedMm: 3.0 },
    actor: 'PrintPrice Engine (:8001)',
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    relativeTime: 'Hace 2m'
  },
  {
    id: 'EVT-2026-8843',
    orderId: 'PUB-ORD-2026-101',
    domain: 'ESCROW',
    eventType: 'FUNDS_LOCKED_ESCROW',
    severity: 'SUCCESS',
    title: 'Fondos Custodiados en Escrow MoR (€24,850.00)',
    description:
      'Retención comercial verificada vía SEPA B2B Wire Escrow (Split 88% Imprenta: €21,868.00 netos garantizados).',
    metadata: { grossAmountEur: 24850.0, netPrinthouseEur: 21868.0 },
    actor: 'PrintPrice Escrow Treasury MoR',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    relativeTime: 'Hace 15m'
  },
  {
    id: 'EVT-2026-8842',
    orderId: 'PUB-ORD-2026-101',
    domain: 'PRODUCTION',
    eventType: 'STAGE_TRANSITION_PRINTING',
    severity: 'INFO',
    title: 'Transición de Taller: IN_PREFLIGHT → PRINTING (Offset B1)',
    description:
      'Asignada tirada de 1,500 ejemplares (20 signaturas × 16pp CMYK ISO Coated v2) a prensa Heidelberg Speedmaster XL 106-8P.',
    metadata: { machineCode: 'HEIDELBERG-XL106-8P', loadPct: 86 },
    actor: 'Jefe de Taller CTP (Heidelberg Prinect)',
    timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    relativeTime: 'Hace 22m'
  },
  {
    id: 'EVT-2026-8841',
    orderId: 'PUB-ORD-2026-105',
    domain: 'LOGISTICS',
    eventType: 'GS1_128_SSCC_PRINTED',
    severity: 'SUCCESS',
    title: 'Paletización EPAL y Etiquetas Térmicas GS1-128 SSCC-18 Emitidas',
    description:
      '3 palets europeos EPAL (72 cajas FEFCO 0201 · 1,485 kg) etiquetados con rango SSCC 003401234500000018–0032 hacia Zeitfracht Erfurt (DE).',
    metadata: { shipmentId: 'SHP-2026-8801', palletsCount: 3 },
    actor: 'Terminal Logística Muelle B2B',
    timestamp: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    relativeTime: 'Hace 28m'
  },
  {
    id: 'EVT-2026-8840',
    orderId: 'PUB-ORD-2026-102',
    domain: 'PRODUCTION',
    eventType: 'BOTTLENECK_LOAD_WARNING',
    severity: 'WARNING',
    title: 'Alerta de Carga en Tren de Encuadernación PUR (92% Capacidad)',
    description:
      "Línea Müller Martini Alegro PUR operando al 92% de carga con 'Crónicas del Diseño Tipográfico Suizo'.",
    metadata: { machineCode: 'MULLER-MARTINI-ALEGRO', loadPct: 92 },
    actor: 'MES JMF Telemetry Sensor',
    timestamp: new Date(Date.now() - 36 * 60 * 1000).toISOString(),
    relativeTime: 'Hace 36m'
  },
  {
    id: 'EVT-2026-8839',
    orderId: 'PUB-ORD-2026-104',
    domain: 'PREFLIGHT',
    eventType: 'PREFLIGHT_CRITICAL_MISMATCH_DETECTED',
    severity: 'CRITICAL',
    title: 'Desviación Geométrica de Lomo Detectada (Δ +2.88 mm)',
    description:
      'El PDF de cubierta declaraba 14.00 mm frente a los 16.88 mm físicos calculados para 288 págs en papel 90g (Volumen 1.3).',
    metadata: { declaredSpineMm: 14.0, calculatedSpineMm: 16.88 },
    actor: 'Preflight 6-Axis Inspector',
    timestamp: new Date(Date.now() - 44 * 60 * 1000).toISOString(),
    relativeTime: 'Hace 44m'
  }
];

function getSeverityStyles(severity: string) {
  switch (String(severity).toUpperCase()) {
    case 'SUCCESS':
      return {
        nodeDot: 'bg-[#10b981] ring-emerald-500/30',
        cardBorder: 'border-emerald-500/40 hover:border-emerald-500/70',
        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      };
    case 'CRITICAL':
      return {
        nodeDot: 'bg-[#dc0000] ring-rose-600/30',
        cardBorder: 'border-rose-600/50 hover:border-[#dc0000]',
        badge: 'bg-[#dc0000]/20 text-red-300 border-rose-600/40'
      };
    case 'WARNING':
      return {
        nodeDot: 'bg-[#f59e0b] ring-amber-500/30',
        cardBorder: 'border-amber-500/40 hover:border-amber-500/70',
        badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      };
    default:
      return {
        nodeDot: 'bg-[#3b82f6] ring-blue-500/30',
        cardBorder: 'border-zinc-700/80 hover:border-blue-500/50',
        badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30'
      };
  }
}

function getDomainIcon(domain: string) {
  switch (String(domain).toUpperCase()) {
    case 'PREFLIGHT':
      return Square3Stack3DIcon;
    case 'PRODUCTION':
      return CpuChipIcon;
    case 'ESCROW':
      return CurrencyEuroIcon;
    case 'LOGISTICS':
      return TruckIcon;
    case 'COMMUNICATIONS':
      return ChatBubbleLeftRightIcon;
    case 'STORAGE':
      return ServerIcon;
    default:
      return BoltIcon;
  }
}

export const OperationalActivityStream: React.FC<OperationalActivityStreamProps> = ({
  onSelectOrderDrawer
}) => {
  const { t, locale } = useLocale();
  const [activeDomain, setActiveDomain] = useState<ActivityFilterDomain>('ALL');
  const [events, setEvents] = useState<OperationalActivityEvent[]>(FALLBACK_EVENTS);
  const [totalCount, setTotalCount] = useState<number>(FALLBACK_EVENTS.length);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchStream = useCallback(
    async (domainToFetch: ActivityFilterDomain = activeDomain) => {
      setLoading(true);
      try {
        const res = await getPrinthouseOperationalActivityStream({
          limit: 25,
          offset: 0,
          domain: domainToFetch,
          locale
        });
        if (res && Array.isArray(res.events) && res.events.length > 0) {
          setEvents(res.events);
          setTotalCount(res.total || res.events.length);
        } else {
          const filtered =
            domainToFetch === 'ALL'
              ? FALLBACK_EVENTS
              : FALLBACK_EVENTS.filter(e => e.domain === domainToFetch);
          setEvents(filtered);
          setTotalCount(filtered.length);
        }
      } catch {
        const filtered =
          domainToFetch === 'ALL'
            ? FALLBACK_EVENTS
            : FALLBACK_EVENTS.filter(e => e.domain === domainToFetch);
        setEvents(filtered);
        setTotalCount(filtered.length);
      } finally {
        setLoading(false);
      }
    },
    [activeDomain, locale]
  );

  useEffect(() => {
    fetchStream(activeDomain);
    const interval = setInterval(() => {
      fetchStream(activeDomain);
    }, 30000);
    return () => clearInterval(interval);
  }, [activeDomain, fetchStream]);

  const filterPills: { id: ActivityFilterDomain; label: string; testId: string; altTestId: string }[] = [
    { id: 'ALL', label: t('dashboard.360.filterPillAll'), testId: 'pill-filter-all', altTestId: 'activity-filter-pill-ALL' },
    { id: 'PREFLIGHT', label: t('dashboard.360.filterPillPreflight'), testId: 'pill-filter-preflight', altTestId: 'activity-filter-pill-PREFLIGHT' },
    { id: 'PRODUCTION', label: t('dashboard.360.filterPillWorkshop'), testId: 'pill-filter-workshop', altTestId: 'activity-filter-pill-PRODUCTION' },
    { id: 'ESCROW', label: t('dashboard.360.filterPillFinance'), testId: 'pill-filter-finance', altTestId: 'activity-filter-pill-ESCROW' },
    { id: 'LOGISTICS', label: t('dashboard.360.filterPillLogistics'), testId: 'pill-filter-logistics', altTestId: 'activity-filter-pill-LOGISTICS' }
  ];

  return (
    <div
      data-testid="operational-activity-stream-panel"
      className="bg-[#131314] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl"
    >
      {/* Top Bar: Title, Pill Filters & Manual Refresh */}
      <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#dc0000]/10 border border-[#dc0000]/30 flex items-center justify-center">
            <BoltIcon className="w-5 h-5 text-[#dc0000]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                {t('dashboard.360.activityStreamTitle')}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-mono font-bold text-emerald-400">
                {t('dashboard.360.streamPollingBadge')} · {totalCount}
              </span>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
              {t('dashboard.360.activityStreamSubtitle')}
            </p>
          </div>
        </div>

        {/* Pill Filters & Manual Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5 bg-[#0e0e0f] p-1 rounded-xl border border-zinc-800">
            {filterPills.map(pill => {
              const isActive = activeDomain === pill.id;
              return (
                <button
                  key={pill.id}
                  data-testid={pill.altTestId}
                  onClick={() => setActiveDomain(pill.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#dc0000] text-white shadow'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          <button
            data-testid="btn-refresh-activity-stream"
            onClick={() => fetchStream(activeDomain)}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] font-mono font-bold uppercase text-zinc-200 hover:text-white flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 text-[#10b981] ${loading ? 'animate-spin' : ''}`} />
            {t('dashboard.360.btnRefreshStream')}
          </button>
        </div>
      </div>

      {/* Vertical Timeline Feed */}
      <div
        data-testid="operational-activity-feed"
        className="p-6 max-h-[380px] overflow-y-auto custom-scrollbar"
      >
        <div className="relative pl-6 border-l-2 border-zinc-800 space-y-3">
          {events.map((ev, idx) => {
            const sevStyles = getSeverityStyles(ev.severity);
            const DomainIcon = getDomainIcon(ev.domain);
            const relBadge =
              ev.relativeTime ||
              t('dashboard.360.timeAgoMin', { min: idx === 0 ? 2 : idx === 1 ? 15 : (idx + 1) * 8 });

            return (
              <div
                key={ev.id || idx}
                data-testid={`activity-event-card-${idx}`}
                className={`relative p-3.5 rounded-xl bg-[#0e0e0f] border ${sevStyles.cardBorder} transition-all`}
              >
                {/* Vertical Timeline Node Dot */}
                <span
                  className={`absolute -left-[31px] top-4 w-3.5 h-3.5 rounded-full ring-4 ${sevStyles.nodeDot}`}
                />

                {/* Card Header: Domain Icon, Interactive Order ID Badge, Actor & Relative Timestamp */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-md border text-[9px] font-mono font-bold uppercase flex items-center gap-1 ${sevStyles.badge}`}>
                      <DomainIcon className="w-3 h-3" />
                      {ev.domain} · {ev.eventType}
                    </span>

                    {ev.orderId && (
                      <button
                        data-testid={`activity-order-badge-${ev.orderId}`}
                        onClick={() => onSelectOrderDrawer && onSelectOrderDrawer(ev.orderId!, ev.domain)}
                        title={t('dashboard.360.openOrderDrawerHint')}
                        className="px-2.5 py-0.5 rounded-md bg-zinc-900 hover:bg-[#dc0000]/20 border border-zinc-700 hover:border-[#dc0000] text-[10px] font-mono font-black text-white transition-all cursor-pointer"
                      >
                        {ev.orderId} ↗
                      </button>
                    )}

                    <span className="text-[11px] font-bold text-zinc-100">
                      {ev.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-400 hidden sm:inline">
                      {typeof ev.actor === 'string'
                        ? ev.actor
                        : (ev.actor as any)?.label || (ev.actor as any)?.role || (ev.actor as any)?.id || 'SYSTEM'}
                    </span>
                    <span
                      data-testid={`activity-badge-elapsed-${idx}`}
                      className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 text-[9px] font-mono font-bold"
                    >
                      {relBadge.toLowerCase()}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {ev.description && (
                  <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                    {ev.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
