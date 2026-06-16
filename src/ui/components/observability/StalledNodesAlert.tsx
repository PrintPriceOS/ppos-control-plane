import React, { useState } from 'react';
import { AlertTriangle, Clock, Send, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';

interface StalledTenant {
    id: string;
    name: string;
    status: string;
    daysStalled: number;
    lastActivity: string;
}

interface StalledNodesAlertProps {
    data?: StalledTenant[];
    isLoading?: boolean;
    onRemind?: () => void;
}

export const StalledNodesAlert: React.FC<StalledNodesAlertProps> = ({ data, isLoading, onRemind }) => {
    // Normalize null/undefined to empty array to avoid .length crashes during loading
    const nodes = data ?? [];
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    
    const [sendingId, setSendingId] = useState<string | null>(null);
    const [successId, setSuccessId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleRemind = async (id: string) => {
        setSendingId(id);
        setErrorMsg(null);
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('ppos_token');
            const res = await fetch(`/api/admin/observability/stalled/${id}/remind`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to send reminder');
            
            setSuccessId(id);
            setTimeout(() => {
                setSuccessId(null);
                onRemind?.();
            }, 2000);
        } catch (err: any) {
            setErrorMsg(err.message || 'Error');
        } finally {
            setSendingId(null);
        }
    };

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <ShieldAlert size={20} color="#f59e0b" />
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: isDark ? '#fff' : '#0f172a' }}>Triage: Stalled Nodes</h3>
                {isLoading && <Loader2 size={16} className="animate-spin text-amber-500 ml-2" />}
            </div>
            
            <p style={{ fontSize: '13px', color: isDark ? '#a1a1aa' : '#64748b', marginBottom: '16px' }}>
                Tenants that have not made any onboarding progress in the last 24 hours.
            </p>

            {errorMsg && (
                <div style={{ padding: '8px 12px', background: 'rgba(220,0,0,0.1)', color: '#dc0000', borderRadius: '4px', fontSize: '13px', marginBottom: '16px' }}>
                    {errorMsg}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {isLoading && nodes.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Loading stalled nodes...</div>
                ) : nodes.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No stalled nodes found. Excellent!</div>
                ) : nodes.map(node => (
                    <div key={node.id} style={{
                        padding: '16px',
                        background: isDark ? 'rgba(245, 158, 11, 0.05)' : 'rgba(245, 158, 11, 0.1)',
                        border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.2)'}`,
                        borderRadius: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#fff' : '#0f172a' }}>{node.id}</span>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#e4e4e7' : '#334155' }}>{node.name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: isDark ? '#a1a1aa' : '#64748b' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {node.status}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 600 }}>
                                    <Clock size={12} /> {node.daysStalled}d
                                </span>
                            </div>
                        </div>

                        <button 
                            onClick={() => handleRemind(node.id)}
                            disabled={sendingId === node.id || successId === node.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: successId === node.id ? 'rgba(16,185,129,0.1)' : (isDark ? '#27272a' : '#ffffff'),
                                color: successId === node.id ? '#10b981' : (isDark ? '#e4e4e7' : '#0f172a'),
                                border: `1px solid ${successId === node.id ? '#10b981' : (isDark ? '#3f3f46' : '#cbd5e1')}`,
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: sendingId === node.id ? 'wait' : 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            {sendingId === node.id ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : successId === node.id ? (
                                <CheckCircle2 size={14} />
                            ) : (
                                <Send size={14} />
                            )}
                            {sendingId === node.id ? 'Sending...' : successId === node.id ? 'Sent' : 'Send Reminder'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
