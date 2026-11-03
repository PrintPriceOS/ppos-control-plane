import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Factory,
  Package,
  Zap,
  FileCode2,
  ShieldCheck,
  FileText,
  Truck,
} from 'lucide-react';
import { getPrinthouseDashboardOrders } from '../../lib/adminApi';
import { useLocale } from '../../i18n';

type OrderStatus =
  | 'PENDING_ROUTING'
  | 'PRODUCTION'
  | 'SHIPPED'
  | 'ACKNOWLEDGED'
  | 'MACHINE_ASSIGNED'
  | 'IN_PRODUCTION';

export interface LiveOrder {
  id: string;
  productName?: string;
  isbn?: string;
  copies?: number;
  productionStage?: string;
  machineId?: string;
  escrowStatus?: string;
  invoiceNumber?: string;
  netPrinthousePayoutEur?: number;
  value: number;
  currency?: string;
  status: OrderStatus;
  timestamp: number;
  isUrgent: boolean;
}

const FALLBACK_PRODUCTION_ORDERS: LiveOrder[] = [
  {
    id: 'PUB-ORD-2026-101',
    productName: 'Atlas de Arquitectura Industrial Europea (3ª Ed.) · 1,500 uds',
    isbn: '978-84-9032-441-1',
    copies: 1500,
    status: 'IN_PRODUCTION',
    productionStage: 'STAGE_02_ON_PRESS',
    machineId: 'HEIDELBERG-XL106-8P',
    escrowStatus: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
    invoiceNumber: 'FE-2026-00101',
    value: 24850.0,
    netPrinthousePayoutEur: 21868.0,
    currency: 'EUR',
    timestamp: Date.now() - 3600 * 1000,
    isUrgent: true,
  },
  {
    id: 'PUB-ORD-2026-102',
    productName: 'Crónicas del Diseño Tipográfico Suizo · 1,000 uds',
    isbn: '978-3-03778-654-3',
    copies: 1000,
    status: 'IN_PRODUCTION',
    productionStage: 'STAGE_03_BINDING',
    machineId: 'MULLER-MARTINI-ALEGRO',
    escrowStatus: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
    invoiceNumber: 'FE-2026-00102',
    value: 16200.0,
    netPrinthousePayoutEur: 14256.0,
    currency: 'EUR',
    timestamp: Date.now() - 7200 * 1000,
    isUrgent: false,
  },
  {
    id: 'PUB-ORD-2026-105',
    productName: 'Monografía Bauhaus & Ulm 1919-1968 · 2,000 uds',
    isbn: '978-3-8365-9102-7',
    copies: 2000,
    status: 'MACHINE_ASSIGNED',
    productionStage: 'STAGE_04_PALLETIZATION',
    machineId: 'KOMORI-LITHRONE-G29',
    escrowStatus: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
    invoiceNumber: 'FE-2026-00105',
    value: 11420.0,
    netPrinthousePayoutEur: 10049.6,
    currency: 'EUR',
    timestamp: Date.now() - 10800 * 1000,
    isUrgent: true,
  },
  {
    id: 'PUB-ORD-2026-104',
    productName: 'Manual de Ingeniería Fotónica Aplicada · 1,200 uds',
    isbn: '978-3-030-98112-9',
    copies: 1200,
    status: 'ACKNOWLEDGED',
    productionStage: 'STAGE_01_PREFLIGHT',
    machineId: 'HP-INDIGO-12000HD',
    escrowStatus: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
    invoiceNumber: 'FE-2026-00104',
    value: 6840.0,
    netPrinthousePayoutEur: 6019.2,
    currency: 'EUR',
    timestamp: Date.now() - 14400 * 1000,
    isUrgent: false,
  },
  {
    id: 'PUB-ORD-2026-103',
    productName: 'Catálogo Técnico Feria del Libro de Frankfurt 2026 · 800 uds',
    isbn: '978-3-95829-741-8',
    copies: 800,
    status: 'SHIPPED',
    productionStage: 'STAGE_05_DELIVERED_POD',
    machineId: 'HEIDELBERG-XL106-8P',
    escrowStatus: 'RELEASED_ON_SIGNED_POD',
    invoiceNumber: 'FE-2026-00103',
    value: 4900.0,
    netPrinthousePayoutEur: 4312.0,
    currency: 'EUR',
    timestamp: Date.now() - 28800 * 1000,
    isUrgent: false,
  },
];

function localizeDemoProductName(order: LiveOrder, locale: string): string {
  const id = String(order.id || '');
  const map: Record<string, { en: string; de: string; es: string }> = {
    'PUB-ORD-2026-101': {
      en: 'European Industrial Architecture Atlas (3rd Ed.) · 1,500 copies',
      de: 'Atlas der Europäischen Industriearchitektur (3. Aufl.) · 1.500 Ex.',
      es: 'Atlas de Arquitectura Industrial Europea (3ª Ed.) · 1,500 uds',
    },
    'PUB-ORD-2026-102': {
      en: 'Chronicles of Swiss Typographic Design · 1,000 copies',
      de: 'Chroniken des Schweizer Typografie-Designs · 1.000 Ex.',
      es: 'Crónicas del Diseño Tipográfico Suizo · 1,000 uds',
    },
    'PUB-ORD-2026-103': {
      en: 'Frankfurt Book Fair 2026 Technical Catalog · 800 copies',
      de: 'Technischer Katalog Frankfurter Buchmesse 2026 · 800 Ex.',
      es: 'Catálogo Técnico Feria del Libro de Frankfurt 2026 · 800 uds',
    },
    'PUB-ORD-2026-104': {
      en: 'Applied Photonic Engineering Manual · 1,200 copies',
      de: 'Handbuch für Angewandte Photonik-Ingenieurtechnik · 1.200 Ex.',
      es: 'Manual de Ingeniería Fotónica Aplicada · 1,200 uds',
    },
    'PUB-ORD-2026-105': {
      en: 'Bauhaus & Ulm Monograph 1919-1968 · 2,000 copies',
      de: 'Monografie Bauhaus & Ulm 1919-1968 · 2.000 Ex.',
      es: 'Monografía Bauhaus & Ulm 1919-1968 · 2,000 uds',
    },
  };
  const entry = map[id];
  if (entry) {
    return locale === 'de' ? entry.de : locale === 'es' ? entry.es : entry.en;
  }
  return (
    order.productName ||
    (locale === 'de'
      ? 'Zugewiesener Fertigungsauftrag'
      : locale === 'es'
      ? 'Orden de Producción Asignada'
      : 'Assigned Production Order')
  );
}

export const LiveOrdersFeed: React.FC<{
  onSelectOrder?: (orderId?: string) => void;
  onOpenProof?: (orderId: string) => void;
  onOpenCmr?: (orderId: string) => void;
}> = ({ onSelectOrder, onOpenProof, onOpenCmr }) => {
  const { t, locale } = useLocale();
  const [orders, setOrders] = useState<LiveOrder[]>(FALLBACK_PRODUCTION_ORDERS);
  const [revenue, setRevenue] = useState<number>(64210.0);
  const [filter, setFilter] = useState<'ALL' | 'HIGH_PROFIT' | 'URGENT'>('ALL');
  const [loading, setLoading] = useState<boolean>(true);

  const fetchOrders = async () => {
    try {
      const res = await getPrinthouseDashboardOrders();
      if (res && res.ok && res.data && Array.isArray(res.data.orders) && res.data.orders.length > 0) {
        setOrders(res.data.orders);
        setRevenue(res.data.expectedRevenueEUR || 64210.0);
      }
    } catch (e) {
      // Fallback orders stay active
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'PENDING_ROUTING':
        return <Clock className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'PRODUCTION':
      case 'MACHINE_ASSIGNED':
      case 'IN_PRODUCTION':
        return <Factory className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'SHIPPED':
        return <Package className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Clock className="w-4 h-4 text-zinc-400 shrink-0" />;
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (filter === 'HIGH_PROFIT') return o.value > 15000;
    if (filter === 'URGENT') return o.isUrgent;
    return true;
  });

  return (
    <div
      data-testid="live-orders-feed"
      className="bg-white dark:bg-[#0e0e11] border border-zinc-200 dark:border-[#27272a] rounded-2xl p-6 shadow-sm w-full overflow-hidden"
    >
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-[#27272a]">
        <div
          onClick={() => onSelectOrder && onSelectOrder()}
          className={onSelectOrder ? 'cursor-pointer' : ''}
        >
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20">
              <Zap className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-zinc-900 dark:text-[#f4f4f5] tracking-tight">
                {t('dashboard.hub.ordersTableTitle')}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#a1a1aa] mt-0.5">
                {loading
                  ? t('orders.demo.hydratingOrders')
                  : t('dashboard.360.expectedRevenueSubtitle', {
                      gross: revenue.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                      net: (revenue * 0.88).toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSelectOrder && (
            <button
              type="button"
              data-testid="btn-open-escrow-ledger"
              onClick={() => onSelectOrder()}
              className="px-3.5 py-2 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/10 hover:bg-[#ef4444] text-[#ef4444] hover:text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileCode2 className="w-4 h-4" />
              <span>{t('dashboard.360.btnOpenEscrowLedger')}</span>
            </button>
          )}
          {(['ALL', 'HIGH_PROFIT', 'URGENT'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                filter === f
                  ? 'bg-zinc-900 dark:bg-[#1f1f24] text-white border-zinc-700 dark:border-[#3f3f46]'
                  : 'bg-zinc-100 dark:bg-[#141418] text-zinc-600 dark:text-[#a1a1aa] border-zinc-200 dark:border-[#27272a] hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {f === 'HIGH_PROFIT'
                ? t('dashboard.orders.filterHighProfit') || 'High Profit'
                : f === 'URGENT'
                ? t('dashboard.orders.filterUrgent') || 'Urgent'
                : t('dashboard.orders.filterAll') || 'All Orders'}
            </button>
          ))}
        </div>
      </div>

      {/* Responsive Table Wrapper */}
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 py-3.5 px-4 border-b border-zinc-200 dark:border-[#27272a] text-sm font-bold text-zinc-700 dark:text-zinc-100">
            <div className="col-span-2">{t('orders.demo.orderIdLabel')}</div>
            <div className="col-span-4">{t('dashboard.360.colTitleSpec')}</div>
            <div className="col-span-2">{t('dashboard.360.colPressStage')}</div>
            <div className="col-span-2">{t('dashboard.hub.colActions')}</div>
            <div className="col-span-2 text-right">{t('dashboard.360.colGrossNet')}</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-zinc-200/70 dark:divide-[#1f1f24]">
            <AnimatePresence initial={false}>
              {filteredOrders.map((order) => {
                const netAmount = (order.netPrinthousePayoutEur || order.value * 0.88).toLocaleString(
                  'en-US',
                  { minimumFractionDigits: 2 }
                );
                const grossAmount = order.value.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                });
                const copiesCount = (order.copies || 1500).toLocaleString('en-US');

                return (
                  <motion.div
                    key={order.id}
                    onClick={() => onSelectOrder && onSelectOrder(order.id)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-12 gap-4 items-center py-4 px-4 hover:bg-zinc-50 dark:hover:bg-[#141418] transition-colors cursor-pointer"
                  >
                    {/* Order ID + Urgent Pill */}
                    <div className="col-span-2 flex flex-col gap-1">
                      <span className="font-mono font-bold text-xs sm:text-sm text-zinc-900 dark:text-[#f4f4f5]">
                        {order.id}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-100 dark:bg-[#18181c] text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-[#27272a]">
                          {t('dashboard.hub.copiesPill', { copies: copiesCount })}
                        </span>
                        {order.isUrgent && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/30">
                            {t('orders.demo.urgentBadge')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Book Title + ISBN */}
                    <div className="col-span-4 min-w-0 pr-2">
                      <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {localizeDemoProductName(order, locale)}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-[#a1a1aa] font-mono mt-0.5">
                        ISBN {order.isbn || '978-3-03778-654-3'} · {order.invoiceNumber || 'FE-2026-00101'}
                      </div>
                    </div>

                    {/* Assigned Press Line */}
                    <div className="col-span-2">
                      <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-[#141418] border border-zinc-200 dark:border-[#27272a]">
                        {getStatusIcon(order.status)}
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]">
                          {order.machineId || order.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Actionable Document Buttons: PDF Proof, Signed CMR, E-Invoice XML */}
                    <div
                      className="col-span-2 flex flex-wrap items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        data-testid={`order-action-proof-${order.id}`}
                        onClick={() => (onOpenProof ? onOpenProof(order.id) : onSelectOrder?.(order.id))}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-zinc-100 dark:bg-[#18181c] hover:bg-zinc-200 dark:hover:bg-[#27272a] text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-[#27272a] transition-colors cursor-pointer"
                        title={t('dashboard.hub.actionPdfProof')}
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span>{t('dashboard.hub.actionPdfProof')}</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`order-action-cmr-${order.id}`}
                        onClick={() => (onOpenCmr ? onOpenCmr(order.id) : onSelectOrder?.(order.id))}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-zinc-100 dark:bg-[#18181c] hover:bg-zinc-200 dark:hover:bg-[#27272a] text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-[#27272a] transition-colors cursor-pointer"
                        title={t('dashboard.hub.actionCmrNote')}
                      >
                        <Truck className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('dashboard.hub.actionCmrNote')}</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`order-action-einvoice-${order.id}`}
                        onClick={() => onSelectOrder?.(order.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer"
                        title={t('dashboard.hub.actionEInvoice')}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{t('dashboard.hub.actionEInvoice')}</span>
                      </button>
                    </div>

                    {/* Green Highlighted Net Revenue + Gross */}
                    <div className="col-span-2 text-right">
                      <div className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-[#10b981] font-extrabold text-sm tabular-nums">
                        {t('dashboard.hub.netHighlight', { net: netAmount })}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-[#a1a1aa] font-mono mt-1 tabular-nums">
                        {t('dashboard.hub.grossSub', { gross: grossAmount })}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {filteredOrders.length === 0 && (
        <div className="py-10 text-center text-sm text-zinc-500 dark:text-[#a1a1aa]">
          {t('dashboard.orders.noOrders') || 'No orders matching the current filter.'}
        </div>
      )}
    </div>
  );
};
