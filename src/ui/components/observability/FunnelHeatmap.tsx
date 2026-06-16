import React from 'react';
import { motion } from 'framer-motion';
import { Users, Filter } from 'lucide-react';

interface FunnelData {
  stage: string;
  count: number;
  total: number;
    registered: number;
    webhooksConfigured: number;
    verified: number;
}

interface FunnelHeatmapProps {
    data?: FunnelData;
    isLoading?: boolean;
}

export const FunnelHeatmap: React.FC<FunnelHeatmapProps> = ({ data, isLoading }) => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    const total = data?.registered || 1;
    const funnelSteps = [
        { label: 'Registered', count: data?.registered || 0, icon: Users, color: '#3b82f6' },
        { label: 'Webhooks', count: data?.webhooksConfigured || 0, icon: Webhook, color: '#eab308' },
        { label: 'Verified', count: data?.verified || 0, icon: ShieldCheck, color: '#10b981' },
    ];

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
                <Users size={20} color="#3b82f6" />
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: isDark ? '#fff' : '#0f172a' }}>Activation Funnel</h3>
                {isLoading && <Loader2 size={16} className="animate-spin text-blue-500 ml-2" />}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {funnelSteps.map((step, index) => {
                    const percentage = (step.count / total) * 100;
                    const Icon = step.icon;
                    
                    return (
                        <div key={step.label} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500, color: isDark ? '#e4e4e7' : '#1e293b' }}>
                                    <Icon size={16} color={step.color} />
                                    {step.label}
                                </div>
                                <span style={{ fontSize: '16px', fontWeight: 700, color: isDark ? '#fff' : '#0f172a' }}>
                                    {step.count}
                                </span>
                            </div>

                            <div style={{ width: '100%', height: '24px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 1, delay: index * 0.2, ease: "easeOut" }}
                                    style={{
                                        height: '100%',
                                        background: isLoading ? (isDark ? '#3f3f46' : '#cbd5e1') : step.color,
                                        borderRadius: '4px',
                                        position: 'absolute',
                                        left: 0,
                                        top: 0
                                    }}
                                />
                            </div>
                            
                            {/* Dropoff Warning */}
                            {index > 0 && funnelSteps[index - 1].count > step.count && (
                                <div style={{ fontSize: '12px', color: '#dc0000', textAlign: 'right', fontWeight: 500 }}>
                                    ↓ {funnelSteps[index - 1].count - step.count} users dropped off
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
                        {total > 0 ? (((data?.verified || 0) / total) * 100).toFixed(1) : 0}%
                    </span>
                </div>
            </div>
        </div>
    );
};
