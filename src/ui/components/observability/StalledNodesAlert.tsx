import React from 'react';
import { AlertTriangle, Clock, Mail, ExternalLink } from 'lucide-react';

interface StalledNode {
    id: string;
    companyName: string;
    stalledAtStep: string;
    stalledSince: string; // duration like '48h'
    contactEmail: string;
}

const mockStalledNodes: StalledNode[] = [
    { id: 'T-8831', companyName: 'Global Print Solutions Ltd', stalledAtStep: 'Webhooks Config', stalledSince: '42h', contactEmail: 'tech@globalprint.ex' },
    { id: 'T-9920', companyName: 'FastFlyers Inc', stalledAtStep: 'Sandbox Test', stalledSince: '28h', contactEmail: 'api@fastflyers.ex' },
    { id: 'T-1042', companyName: 'Acme Packaging', stalledAtStep: 'Webhooks Config', stalledSince: '25h', contactEmail: 'dev@acmepkg.ex' },
];

export const StalledNodesAlert: React.FC = () => {
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
                <AlertTriangle size={20} color="#f59e0b" />
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: isDark ? '#fff' : '#0f172a' }}>Stalled Onboarding Triage</h3>
            </div>
            
            <p style={{ fontSize: '13px', color: isDark ? '#a1a1aa' : '#64748b', marginBottom: '16px' }}>
                Nodes that have not made progress in the last 24 hours.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {mockStalledNodes.map(node => (
                    <div key={node.id} style={{
                        padding: '16px',
                        background: isDark ? 'rgba(245, 158, 11, 0.05)' : 'rgba(245, 158, 11, 0.1)',
                        border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.3)'}`,
                        borderRadius: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#fff' : '#0f172a' }}>{node.id}</span>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#e4e4e7' : '#334155' }}>{node.companyName}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: isDark ? '#a1a1aa' : '#64748b' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <ExternalLink size={12} /> {node.stalledAtStep}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 600 }}>
                                    <Clock size={12} /> {node.stalledSince}
                                </span>
                            </div>
                        </div>

                        <button style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: isDark ? '#27272a' : '#ffffff',
                            color: isDark ? '#e4e4e7' : '#0f172a',
                            border: `1px solid ${isDark ? '#3f3f46' : '#cbd5e1'}`,
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = isDark ? '#3f3f46' : '#f1f5f9'}
                        onMouseOut={(e) => e.currentTarget.style.background = isDark ? '#27272a' : '#ffffff'}
                        >
                            <Mail size={14} /> Send Reminder
                        </button>
                    </div>
                ))}
            </div>
            
            {mockStalledNodes.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: isDark ? '#a1a1aa' : '#64748b', fontSize: '13px' }}>
                    No stalled nodes detected.
                </div>
            )}
        </div>
    );
};
