import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Factory, Package, Zap } from 'lucide-react';
import { getPrinthouseDashboardOrders } from '../../lib/adminApi';

type OrderStatus = 'PENDING_ROUTING' | 'PRODUCTION' | 'SHIPPED' | 'ACKNOWLEDGED' | 'MACHINE_ASSIGNED' | 'IN_PRODUCTION';

interface LiveOrder {
    id: string;
    productName?: string;
    value: number;
    status: OrderStatus;
    timestamp: number;
    isUrgent: boolean;
}

export const LiveOrdersFeed: React.FC = () => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const [orders, setOrders] = useState<LiveOrder[]>([]);
    const [revenue, setRevenue] = useState<number>(0);
    const [filter, setFilter] = useState<'ALL' | 'HIGH_PROFIT' | 'URGENT'>('ALL');
    const [loading, setLoading] = useState<boolean>(true);

    const fetchOrders = async () => {
        try {
            const res = await getPrinthouseDashboardOrders();
            if (res && res.ok && res.data) {
                setOrders(res.data.orders || []);
                setRevenue(res.data.expectedRevenueEUR || 0);
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
        if (filter === 'HIGH_PROFIT') return o.value > 300;
        if (filter === 'URGENT') return o.isUrgent;
        return true;
    });

    return (
        <div style={{
            background: isDark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: isDark ? '0 16px 32px rgba(0,0,0,0.4)' : '0 16px 32px rgba(0,0,0,0.05)',
            width: '100%',
            overflow: 'hidden'
        }}>
            {/* Header & Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: isDark ? '#fff' : '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={20} color="#dc0000" /> Expected Printhouse Revenue
                    </h2>
                    <p style={{ fontSize: '13px', color: isDark ? '#a1a1aa' : '#64748b' }}>
                        {loading ? 'Hydrating orders...' : `Expected Revenue: €${revenue.toFixed(2)}`}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {(['ALL', 'HIGH_PROFIT', 'URGENT'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                fontSize: '12px',
                                fontWeight: 500,
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
                            {f === 'HIGH_PROFIT' ? 'High Profit' : f === 'URGENT' ? 'Urgent' : 'All Orders'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table Header */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 2fr 1fr 1fr', 
                padding: '12px 16px',
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                fontSize: '12px',
                fontWeight: 600,
                color: isDark ? '#a1a1aa' : '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                <div>Order ID</div>
                <div>Product</div>
                <div>Status</div>
                <div style={{ textAlign: 'right' }}>Revenue</div>
            </div>

            {/* Table Body with Animations */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <AnimatePresence initial={false}>
                    {filteredOrders.map(order => (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, height: 0, backgroundColor: 'rgba(220, 0, 0, 0)' }}
                            animate={{ 
                                opacity: 1, 
                                height: '56px', 
                                backgroundColor: isDark 
                                    ? ['rgba(220, 0, 0, 0.25)', 'rgba(220, 0, 0, 0)'] 
                                    : ['rgba(220, 0, 0, 0.15)', 'rgba(220, 0, 0, 0)']
                            }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ 
                                duration: 0.8,
                                backgroundColor: { duration: 1.8, ease: 'easeOut' },
                                height: { duration: 0.4 }
                            }}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 2fr 1fr 1fr',
                                alignItems: 'center',
                                padding: '0 16px',
                                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                                fontSize: '14px',
                                color: isDark ? '#e4e4e7' : '#1e293b'
                            }}
                        >
                            <div style={{ fontWeight: 500 }}>{order.id}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {order.productName || 'Assigned Production Order'}
                                {order.isUrgent && (
                                    <span style={{ 
                                        fontSize: '10px', 
                                        padding: '2px 6px', 
                                        background: 'rgba(220,0,0,0.1)', 
                                        color: '#dc0000', 
                                        borderRadius: '4px',
                                        fontWeight: 600
                                    }}>URGENT</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                                {getStatusIcon(order.status)}
                                <span style={{ color: isDark ? '#a1a1aa' : '#64748b' }}>
                                    {order.status.replace('_', ' ')}
                                </span>
                            </div>
                            <div style={{ textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                {order.currency === 'USD' ? '$' : '€'}{order.value.toFixed(2)}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            
            {filteredOrders.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: isDark ? '#a1a1aa' : '#64748b' }}>
                    No orders matching the current filter.
                </div>
            )}
        </div>
    );
};
