import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const generateMockOrder = (id: number) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 140; // Start near the edge
    return {
        id: `mock-${id}`,
        label: `#${Math.floor(1000 + Math.random() * 9000)} | Profit: $${Math.floor(50 + Math.random() * 200)}`,
        startX: Math.cos(angle) * radius,
        startY: Math.sin(angle) * radius,
        // Bounce point just outside the center node (radius 12)
        endX: Math.cos(angle) * 18,
        endY: Math.sin(angle) * 18,
        delay: Math.random() * 1.5
    };
};

export const OrdersRadar: React.FC = () => {
    const [orders, setOrders] = useState<ReturnType<typeof generateMockOrder>[]>([]);
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    useEffect(() => {
        // Initial batch
        setOrders(Array.from({ length: 5 }).map((_, i) => generateMockOrder(i)));
        
        // Continuous flow of incoming orders
        const interval = setInterval(() => {
            setOrders(prev => {
                // Keep the array small to avoid DOM bloat, older dots fade out based on animation duration
                const next = [...prev, generateMockOrder(Date.now())];
                if (next.length > 12) return next.slice(next.length - 12);
                return next;
            });
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '340px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {/* Background Radar Rings */}
            <svg viewBox="-160 -160 320 320" style={{ position: 'absolute', width: '100%', height: '100%', maxWidth: '320px', maxHeight: '320px' }}>
                <circle cx="0" cy="0" r="140" fill="none" stroke={isDark ? "rgba(220,0,0,0.15)" : "rgba(220,0,0,0.1)"} strokeWidth="1" strokeDasharray="4 4" />
                <circle cx="0" cy="0" r="90" fill="none" stroke={isDark ? "rgba(220,0,0,0.25)" : "rgba(220,0,0,0.2)"} strokeWidth="1" />
                <circle cx="0" cy="0" r="40" fill="none" stroke={isDark ? "rgba(220,0,0,0.4)" : "rgba(220,0,0,0.3)"} strokeWidth="1" />
                
                {/* Central Node (Print House) */}
                <circle cx="0" cy="0" r="12" fill="#dc0000" />
                
                {/* Scanning line animation */}
                <motion.g
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                    style={{ transformOrigin: "0 0", transformBox: "view-box" }}
                >
                    <line 
                        x1="0" y1="0" x2="0" y2="-140" 
                        stroke="rgba(220,0,0,0.5)" 
                        strokeWidth="2"
                    />
                </motion.g>
            </svg>

            {/* Orders (Dots) Container */}
            <div style={{ position: 'absolute', width: 0, height: 0 }}>
                <AnimatePresence>
                    {orders.map((order) => (
                        <motion.div
                            key={order.id}
                            initial={{ x: order.startX, y: order.startY, scale: 0, opacity: 0 }}
                            animate={{ 
                                // Phase 1: Move to center. Phase 2: Bounce back. Phase 3: Hold and fade.
                                x: [order.startX, order.endX, order.endX * 2.5, order.endX * 2], 
                                y: [order.startY, order.endY, order.endY * 2.5, order.endY * 2],
                                scale: [0, 1, 1.2, 0],
                                opacity: [0, 1, 0.8, 0]
                            }}
                            transition={{ 
                                duration: 5, 
                                times: [0, 0.4, 0.5, 1], // Hits the wall at 40%, bounces to 50%, fades out till 100%
                                delay: order.delay,
                                ease: "easeInOut"
                            }}
                            style={{
                                position: 'absolute',
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: '#10b981', // Green dot for lucrative order
                                cursor: 'pointer',
                                marginLeft: '-5px',
                                marginTop: '-5px',
                                boxShadow: '0 0 12px rgba(16,185,129,0.8)'
                            }}
                            whileHover={{ scale: 1.8, zIndex: 10, transition: { duration: 0.2 } }}
                        >
                            <motion.div 
                                className="radar-tooltip"
                                initial={{ opacity: 0 }}
                                whileHover={{ opacity: 1 }}
                                style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    marginBottom: '6px',
                                    background: isDark ? '#27272a' : '#ffffff',
                                    color: isDark ? '#ffffff' : '#0f172a',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                    border: `1px solid ${isDark ? '#3f3f46' : '#e2e8f0'}`,
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
                                }}
                            >
                                {order.label}
                            </motion.div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
            
            {/* Overlay label */}
            <div style={{ position: 'absolute', bottom: '16px', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#dc0000', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Marketplace Activity</div>
                <div style={{ fontSize: '12px', color: isDark ? '#a1a1aa' : '#64748b' }}>Awaiting API configuration to route orders</div>
            </div>
        </div>
    );
};
