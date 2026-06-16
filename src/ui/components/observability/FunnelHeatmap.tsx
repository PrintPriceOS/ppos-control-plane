import React from 'react';
import { motion } from 'framer-motion';
import { Users, Filter } from 'lucide-react';

interface FunnelData {
  stage: string;
  count: number;
  total: number;
  dropoff: number;
}

const mockFunnel: FunnelData[] = [
  { stage: '1. Registered (Node Provisioned)', count: 156, total: 156, dropoff: 0 },
  { stage: '2. Webhooks Configured', count: 98, total: 156, dropoff: 58 },
  { stage: '3. Verified (Sandbox OK)', count: 64, total: 156, dropoff: 34 },
];

export const FunnelHeatmap: React.FC = () => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    return (
        <div style={{
            background: isDark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: isDark ? '0 16px 32px rgba(0,0,0,0.4)' : '0 16px 32px rgba(0,0,0,0.05)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                <Filter size={20} color="#dc0000" />
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: isDark ? '#fff' : '#0f172a' }}>Activation Funnel Heatmap</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {mockFunnel.map((step, index) => {
                    const percentage = (step.count / mockFunnel[0].total) * 100;
                    
                    return (
                        <div key={step.stage} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <span style={{ fontSize: '14px', fontWeight: 500, color: isDark ? '#e4e4e7' : '#1e293b' }}>
                                    {step.stage}
                                </span>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '16px', fontWeight: 700, color: isDark ? '#fff' : '#0f172a' }}>
                                        {step.count}
                                    </span>
                                    <span style={{ fontSize: '12px', color: isDark ? '#a1a1aa' : '#64748b', marginLeft: '6px' }}>
                                        ({percentage.toFixed(1)}%)
                                    </span>
                                </div>
                            </div>

                            {/* Progress Bar Container */}
                            <div style={{ 
                                width: '100%', 
                                height: '24px', 
                                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                position: 'relative'
                            }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 1, delay: index * 0.2, ease: "easeOut" }}
                                    style={{
                                        height: '100%',
                                        background: index === 0 ? '#3b82f6' : index === 1 ? '#eab308' : '#10b981',
                                        borderRadius: '4px',
                                        position: 'absolute',
                                        left: 0,
                                        top: 0
                                    }}
                                />
                            </div>

                            {/* Dropoff Warning */}
                            {step.dropoff > 0 && (
                                <div style={{ fontSize: '12px', color: '#dc0000', textAlign: 'right', fontWeight: 500 }}>
                                    ↓ {step.dropoff} users dropped off
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            
            <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: isDark ? '#a1a1aa' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={14} /> Total Conversion Rate
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#10b981' }}>
                        {((mockFunnel[2].count / mockFunnel[0].total) * 100).toFixed(1)}%
                    </span>
                </div>
            </div>
        </div>
    );
};
