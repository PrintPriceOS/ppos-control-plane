/**
 * src/ui/components/printhouse/setup/SetupProgressSummary.tsx
 * 
 * Displays readiness status indicators for Account Setup, Operational Readiness, and Marketplace Readiness.
 */
import React from 'react';
import { ShieldCheck, Clock, Lock } from 'lucide-react';

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
    operationalReadiness?: {
        status: string;
        available: boolean;
        message?: string;
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
    const operational = readiness?.operationalReadiness;
    const marketplace = readiness?.marketplaceReadiness;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '28px'
        }}>
            {/* Account Setup Card */}
            <div style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '12px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>Account Setup</span>
                    <ShieldCheck size={18} style={{ color: '#10b981' }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                    {account ? `${account.completedRequirements} / ${account.totalRequirements}` : '0 / 6'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Status: <strong style={{ color: account?.status === 'COMPLETE' ? '#10b981' : '#eab308' }}>{account?.status || 'IN_PROGRESS'}</strong>
                </div>
            </div>

            {/* Operational Configuration Card */}
            <div style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '12px',
                padding: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>Operational Configuration</span>
                    <Clock size={18} style={{ color: config?.status === 'COMPLETE' ? '#10b981' : '#eab308' }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                    {config ? `${config.completedRequirements} / ${config.totalRequirements}` : '0 / 5'}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Status: <strong style={{ color: config?.status === 'COMPLETE' ? '#10b981' : '#eab308' }}>{config?.status || 'IN_PROGRESS'}</strong>
                </div>
            </div>

            {/* Operational Readiness Card */}
            <div style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '12px',
                padding: '20px',
                opacity: 0.8
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>Operational Readiness</span>
                    <Clock size={18} style={{ color: '#eab308' }} />
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#eab308', marginBottom: '4px' }}>
                    {operational?.status || 'IN_PROGRESS'}
                </div>
                <div style={{ fontSize: '11px', color: '#71717a' }}>
                    Requires pricing configuration
                </div>
            </div>

            {/* Marketplace Readiness Card */}
            <div style={{
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: '12px',
                padding: '20px',
                opacity: 0.6
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>Marketplace Readiness</span>
                    <Lock size={18} style={{ color: '#71717a' }} />
                </div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#71717a', marginBottom: '4px' }}>
                    Locked
                </div>
                <div style={{ fontSize: '12px', color: '#71717a' }}>
                    Requires pricing & SLA approval
                </div>
            </div>
        </div>
    );
};
