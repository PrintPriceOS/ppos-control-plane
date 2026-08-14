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
                background: '#ffffff',
                border: `1px solid ${account?.status === 'COMPLETE' ? '#10b981' : '#e4e4e7'}`,
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#71717a' }}>1. Account & Sites</span>
                    <ShieldCheck size={18} style={{ color: account?.status === 'COMPLETE' ? '#10b981' : '#d97706' }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#09090b', marginBottom: '4px' }}>
                    {account ? `${account.completedRequirements} / ${account.totalRequirements || 6}` : '0 / 6'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Status: <strong style={{ color: account?.status === 'COMPLETE' ? '#059669' : '#d97706' }}>{account?.status || 'IN_PROGRESS'}</strong>
                </div>
            </div>

            {/* 2. Operational Configuration Card */}
            <div style={{
                background: '#ffffff',
                border: `1px solid ${config?.status === 'COMPLETE' ? '#10b981' : '#e4e4e7'}`,
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#71717a' }}>2. Production Readiness</span>
                    <Clock size={18} style={{ color: config?.status === 'COMPLETE' ? '#10b981' : '#d97706' }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#09090b', marginBottom: '4px' }}>
                    {config ? `${config.completedRequirements} / ${config.totalRequirements || 5}` : '0 / 5'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Status: <strong style={{ color: config?.status === 'COMPLETE' ? '#059669' : '#d97706' }}>{config?.status || 'IN_PROGRESS'}</strong>
                </div>
            </div>

            {/* 3. Pricing Readiness Card */}
            <div style={{
                background: '#ffffff',
                border: `1px solid ${pricing?.status === 'COMPLETE' ? '#10b981' : '#e4e4e7'}`,
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#71717a' }}>3. Industrial Pricing</span>
                    <Tag size={18} style={{ color: pricing?.status === 'COMPLETE' ? '#10b981' : '#d97706' }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#09090b', marginBottom: '4px' }}>
                    {pricing?.status === 'COMPLETE' ? 'Configured' : pricing?.status === 'IN_PROGRESS' ? 'In Progress' : 'Not Started'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Status: <strong style={{ color: pricing?.status === 'COMPLETE' ? '#059669' : '#d97706' }}>{pricing?.status || 'NOT_STARTED'}</strong>
                </div>
            </div>

            {/* 4. Overall Core Status */}
            <div style={{
                background: isCoreComplete ? 'rgba(16, 185, 129, 0.08)' : '#fafafa',
                border: `1px solid ${isCoreComplete ? '#10b981' : '#e4e4e7'}`,
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#71717a' }}>Core Setup Status</span>
                    {isCoreComplete ? <CheckCircle size={18} color="#10b981" /> : <Clock size={18} color="#d97706" />}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: isCoreComplete ? '#059669' : '#d97706', marginBottom: '4px' }}>
                    {isCoreComplete ? 'SETUP COMPLETE' : 'SETUP INCOMPLETE'}
                </div>
                <div style={{ fontSize: '11px', color: '#71717a' }}>
                    {isCoreComplete ? 'Ready for dashboard & marketplace review' : 'Complete 8 modules below'}
                </div>
            </div>
        </div>
    );
};


