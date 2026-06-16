import React from 'react';
import { FunnelHeatmap } from '../../components/observability/FunnelHeatmap';
import { StalledNodesAlert } from '../../components/observability/StalledNodesAlert';
import { Target, Activity } from 'lucide-react';

export const OnboardingObservability: React.FC = () => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    // Mock KPIs
    const capturedOrders = 8420;
    const reboundedOrders = 315;
    const captureRate = ((capturedOrders / (capturedOrders + reboundedOrders)) * 100).toFixed(1);

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '40px',
            background: isDark
                ? 'radial-gradient(circle at top right, rgba(16,185,129,0.05) 0%, transparent 40%), #0e0e0f'
                : 'radial-gradient(circle at top right, rgba(16,185,129,0.05) 0%, transparent 40%), #f8fafc',
            fontFamily: "'Manrope', system-ui, sans-serif",
            color: isDark ? '#fff' : '#0f172a'
        }}>
            <div style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>Onboarding Observability</h1>
                <p style={{ fontSize: '16px', color: isDark ? '#a1a1aa' : '#64748b' }}>
                    Real-time analysis of the B2B Activation Funnel and Node Conversion.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '24px' }}>
                {/* Radar Performance KPI Panel */}
                <div style={{
                    background: isDark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: isDark ? '0 16px 32px rgba(0,0,0,0.4)' : '0 16px 32px rgba(0,0,0,0.05)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <Target size={20} color="#10b981" />
                        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Radar Performance</h3>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                        <div>
                            <span style={{ fontSize: '12px', color: isDark ? '#a1a1aa' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capture Rate</span>
                            <div style={{ fontSize: '36px', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{captureRate}%</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#e4e4e7' : '#1e293b' }}>
                                {capturedOrders.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 400, color: isDark ? '#a1a1aa' : '#64748b' }}>Captured</span>
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#dc0000' }}>
                                {reboundedOrders.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 400, color: isDark ? '#a1a1aa' : '#64748b' }}>Rebounded</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style={{ fontSize: '12px', color: isDark ? '#a1a1aa' : '#64748b' }}>
                        *Orders rebounded refer to opportunities presented to unverified nodes via the Activation Hub Radar.
                    </div>
                </div>

                {/* Additional KPI if needed */}
                <div style={{
                    background: isDark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: isDark ? '0 16px 32px rgba(0,0,0,0.4)' : '0 16px 32px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <Activity size={20} color="#3b82f6" />
                        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Avg. Activation Time</h3>
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: 800, color: isDark ? '#fff' : '#0f172a', lineHeight: 1, marginBottom: '8px' }}>
                        14<span style={{ fontSize: '20px', color: isDark ? '#a1a1aa' : '#64748b' }}>h</span> 22<span style={{ fontSize: '20px', color: isDark ? '#a1a1aa' : '#64748b' }}>m</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#10b981', fontWeight: 500 }}>
                        ↓ 2.4h vs last week (Radar Gamification impact)
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                <FunnelHeatmap />
                <StalledNodesAlert />
            </div>
        </div>
    );
};
