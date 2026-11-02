import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Factory, Package, Zap, FileCode2, ShieldCheck } from 'lucide-react';
import { getPrinthouseDashboardOrders } from '../../lib/adminApi';
import { useLocale } from '../../i18n';

type OrderStatus = 'PENDING_ROUTING' | 'PRODUCTION' | 'SHIPPED' | 'ACKNOWLEDGED' | 'MACHINE_ASSIGNED' | 'IN_PRODUCTION';

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
        value: 24850.00,
        netPrinthousePayoutEur: 21868.00,
        currency: 'EUR',
        timestamp: Date.now() - 3600 * 1000,
        isUrgent: true
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
        value: 16200.00,
        netPrinthousePayoutEur: 14256.00,
        currency: 'EUR',
        timestamp: Date.now() - 7200 * 1000,
        isUrgent: false
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
        value: 11420.00,
        netPrinthousePayoutEur: 10049.60,
        currency: 'EUR',
        timestamp: Date.now() - 10800 * 1000,
        isUrgent: true
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
        value: 6840.00,
        netPrinthousePayoutEur: 6019.20,
        currency: 'EUR',
        timestamp: Date.now() - 14400 * 1000,
        isUrgent: false
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
        value: 4900.00,
        netPrinthousePayoutEur: 4312.00,
        currency: 'EUR',
        timestamp: Date.now() - 28800 * 1000,
        isUrgent: false
    }
];

export const LiveOrdersFeed: React.FC<{
    onSelectOrder?: (orderId?: string) => void;
}> = ({ onSelectOrder }) => {
    const { t } = useLocale();
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const [orders, setOrders] = useState<LiveOrder[]>(FALLBACK_PRODUCTION_ORDERS);
    const [revenue, setRevenue] = useState<number>(64210.00);
    const [filter, setFilter] = useState<'ALL' | 'HIGH_PROFIT' | 'URGENT'>('ALL');
    const [loading, setLoading] = useState<boolean>(true);

    const fetchOrders = async () => {
        try {
            const res = await getPrinthouseDashboardOrders();
            if (res && res.ok && res.data && Array.isArray(res.data.orders) && res.data.orders.length > 0) {
                setOrders(res.data.orders);
                setRevenue(res.data.expectedRevenueEUR || 64210.00);
            }
        } catch (e) {
            console.error(e);
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
            case 'PENDING_ROUTING': return <Clock size={16} color="#eab308" />;
            case 'PRODUCTION':
            case 'MACHINE_ASSIGNED':
            case 'IN_PRODUCTION':
                return <Factory size={16} color="#3b82f6" />;
            case 'SHIPPED': return <Package size={16} color="#10b981" />;
            default: return <Clock size={16} color="#a1a1aa" />;
        }
    };

    const filteredOrders = orders.filter(o => {
        if (filter === 'HIGH_PROFIT') return o.value > 15000;
        if (filter === 'URGENT') return o.isUrgent;
        return true;
    });

    return (
        <div
            data-testid="live-orders-feed"
            style={{
                background: isDark ? 'rgba(19,19,20,0.92)' : 'rgba(255,255,255,0.95)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: isDark ? '0 16px 32px rgba(0,0,0,0.4)' : '0 16px 32px rgba(0,0,0,0.05)',
                width: '100%',
                overflow: 'hidden'
            }}
        >
            {/* Header & Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
                <div
                    onClick={() => onSelectOrder && onSelectOrder()}
                    style={{ cursor: onSelectOrder ? 'pointer' : 'default' }}
                >
                    <h2 style={{ fontSize: '16px', fontWeight: 800, color: isDark ? '#fff' : '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Zap size={18} color="#dc0000" /> {t('dashboard.orders.expectedRevenue') || 'Expected Printhouse Revenue & Escrow Ledger'}
                    </h2>
                    <p style={{ fontSize: '13px', fontFamily: 'monospace', color: isDark ? '#10b981' : '#059669', fontWeight: 700, marginTop: '4px' }}>
                        {loading ? 'Hydrating orders...' : `Expected Gross Revenue: €${revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })} · Net Printhouse (88%): €${(revenue * 0.88).toLocaleString('en-US', { minimumFractionDigits: 2 })} · Click any order for Facturae/XRechnung XML`}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {onSelectOrder && (
                        <button
                            data-testid="btn-open-escrow-ledger"
                            onClick={() => onSelectOrder()}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(220,0,0,0.4)',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: 'rgba(220,0,0,0.12)',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <FileCode2 size={14} color="#dc0000" /> EN 16931 XML / ESCROW SETTLEMENTS
                        </button>
                    )}
                    {(['ALL', 'HIGH_PROFIT', 'URGENT'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                background: filter === f 
                                    ? (isDark ? '#27272a' : '#e2e8f0') 
                                    : 'transparent',
                                color: filter === f 
                                    ? (isDark ? '#fff' : '#0f172a') 
                                    : (isDark ? '#a1a1aa' : '#64748b'),
                                transition: 'all 0.2s'
                            }}
                        >
                            {f === 'HIGH_PROFIT' 
                                ? (t('dashboard.orders.filterHighProfit') || 'High Profit') 
                                : f === 'URGENT' 
                                    ? (t('dashboard.orders.filterUrgent') || 'Urgent') 
                                    : (t('dashboard.orders.filterAll') || 'All Orders')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table Header */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1.1fr 2.2fr 1.2fr 1.2fr 1fr', 
                padding: '12px 16px',
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                fontSize: '11px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: isDark ? '#a1a1aa' : '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                <div>Order ID</div>
                <div>Title / Production Spec</div>
                <div>Press / Stage</div>
                <div>Escrow &amp; E-Invoice</div>
                <div style={{ textAlign: 'right' }}>Gross / Net (88%)</div>
            </div>

            {/* Table Body with Animations */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <AnimatePresence initial={false}>
                    {filteredOrders.map(order => (
                        <motion.div
                            key={order.id}
                            onClick={() => onSelectOrder && onSelectOrder(order.id)}
                            initial={{ opacity: 0, height: 0, backgroundColor: 'rgba(220, 0, 0, 0)' }}
                            animate={{ 
                                opacity: 1, 
                                height: '60px', 
                                backgroundColor: isDark 
                                    ? ['rgba(220, 0, 0, 0.25)', 'rgba(220, 0, 0, 0)'] 
                                    : ['rgba(220, 0, 0, 0.15)', 'rgba(220, 0, 0, 0)']
                            }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ 
                                duration: 0.6,
                                backgroundColor: { duration: 1.4, ease: 'easeOut' },
                                height: { duration: 0.3 }
                            }}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1.1fr 2.2fr 1.2fr 1.2fr 1fr',
                                alignItems: 'center',
                                padding: '0 16px',
                                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                                fontSize: '13px',
                                color: isDark ? '#e4e4e7' : '#1e293b',
                                cursor: onSelectOrder ? 'pointer' : 'default'
                            }}
                        >
                            <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{order.id}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '12px' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {order.productName || 'Assigned Production Order'}
                                </span>
                                {order.isUrgent && (
                                    <span style={{ 
                                        fontSize: '10px', 
                                        padding: '2px 6px', 
                                        background: 'rgba(220,0,0,0.15)', 
                                        color: '#dc0000', 
                                        borderRadius: '4px',
                                        fontWeight: 700,
                                        fontFamily: 'monospace'
                                    }}>URGENT</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'monospace' }}>
                                {getStatusIcon(order.status)}
                                <span style={{ color: isDark ? '#d4d4d8' : '#475569' }}>
                                    {order.machineId || order.status.replace('_', ' ')}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'monospace' }}>
                                <ShieldCheck size={14} color={order.escrowStatus === 'RELEASED_ON_SIGNED_POD' ? '#10b981' : '#f59e0b'} />
                                <span style={{ color: order.escrowStatus === 'RELEASED_ON_SIGNED_POD' ? '#10b981' : '#f59e0b' }}>
                                    {order.invoiceNumber || 'FE-2026'} · XML
                                </span>
                            </div>
                            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                <div style={{ fontWeight: 700, color: '#10b981' }}>
                                    {order.currency === 'USD' ? '$' : '€'}{order.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                                <div style={{ fontSize: '10px', color: '#a1a1aa' }}>
                                    Net: €{(order.netPrinthousePayoutEur || order.value * 0.88).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            
            {filteredOrders.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: isDark ? '#a1a1aa' : '#64748b' }}>
                    {t('dashboard.orders.noOrders') || 'No orders matching the current filter.'}
                </div>
            )}
        </div>
    );
};
