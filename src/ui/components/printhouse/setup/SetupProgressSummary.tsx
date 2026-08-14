/**
 * src/ui/components/printhouse/setup/SetupProgressSummary.tsx
 * 
 * Displays readiness status indicators for Account Setup, Operational Readiness, and Pricing Readiness.
 */
import React from 'react';
import { ShieldCheck, Clock, Tag, CheckCircle } from 'lucide-react';

interface ReadinessData {
    accountSetup?: {
        status: string;
        completedRequirements: number;
        totalRequirements: number;
    };
    operationalConfiguration?: {
        status: string;
        completedRequirements: number;
        totalRequirements: number;
    };
    pricingReadiness?: {
        status: string;
        priceBookCount?: number;
        hasPublished?: boolean;
    };
    marketplaceReadiness?: {
        status: string;
        available: boolean;
        message?: string;
    };
}

export const SetupProgressSummary: React.FC<{ readiness?: ReadinessData }> = ({ readiness }) => {
    const account = readiness?.accountSetup;
    const config = readiness?.operationalConfiguration;
    const pricing = readiness?.pricingReadiness;

    const isCoreComplete = account?.status === 'COMPLETE' && config?.status === 'COMPLETE' && pricing?.status === 'COMPLETE';

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px',
            marginBottom: '28px'
        }}>
            {/* 1. Account Setup Card */}
            <div style={{
                background: '#18181b',
                border: `1px solid ${account?.status === 'COMPLETE' ? '#10b981' : '#27272a'}`,
                borderRadius: '12px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>1. Account & Sites</span>
                    <ShieldCheck size={18} style={{ color: account?.status === 'COMPLETE' ? '#10b981' : '#eab308' }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                    {account ? `${account.completedRequirements} / ${account.totalRequirements || 6}` : '0 / 6'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Status: <strong style={{ color: account?.status === 'COMPLETE' ? '#10b981' : '#eab308' }}>{account?.status || 'IN_PROGRESS'}</strong>
                </div>
            </div>

            {/* 2. Operational Configuration Card */}
            <div style={{
                background: '#18181b',
                border: `1px solid ${config?.status === 'COMPLETE' ? '#10b981' : '#27272a'}`,
                borderRadius: '12px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>2. Production Readiness</span>
                    <Clock size={18} style={{ color: config?.status === 'COMPLETE' ? '#10b981' : '#eab308' }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                    {config ? `${config.completedRequirements} / ${config.totalRequirements || 5}` : '0 / 5'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Status: <strong style={{ color: config?.status === 'COMPLETE' ? '#10b981' : '#eab308' }}>{config?.status || 'IN_PROGRESS'}</strong>
                </div>
            </div>

            {/* 3. Pricing Readiness Card */}
            <div style={{
                background: '#18181b',
                border: `1px solid ${pricing?.status === 'COMPLETE' ? '#10b981' : '#27272a'}`,
                borderRadius: '12px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>3. Commercial Pricing</span>
                    <Tag size={18} style={{ color: pricing?.status === 'COMPLETE' ? '#10b981' : '#eab308' }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                    {pricing?.status === 'COMPLETE' ? 'Configured' : 'Missing Price Book'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Status: <strong style={{ color: pricing?.status === 'COMPLETE' ? '#10b981' : '#eab308' }}>{pricing?.status || 'NOT_STARTED'}</strong>
                </div>
            </div>

            {/* 4. Overall Core Status */}
            <div style={{
                background: isCoreComplete ? 'rgba(16, 185, 129, 0.1)' : '#18181b',
                border: `1px solid ${isCoreComplete ? '#10b981' : '#27272a'}`,
                borderRadius: '12px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>Core Setup Status</span>
                    {isCoreComplete ? <CheckCircle size={18} color="#10b981" /> : <Clock size={18} color="#eab308" />}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: isCoreComplete ? '#10b981' : '#eab308', marginBottom: '4px' }}>
                    {isCoreComplete ? 'SETUP COMPLETE' : 'SETUP INCOMPLETE'}
                </div>
                <div style={{ fontSize: '11px', color: '#a1a1aa' }}>
                    {isCoreComplete ? 'Ready for dashboard & marketplace review' : 'Complete 8 modules below'}
                </div>
            </div>
        </div>
    );
};

