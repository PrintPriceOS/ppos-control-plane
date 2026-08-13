/**
 * src/ui/components/printhouse/setup/CapabilitiesPanel.tsx
 *
 * Phase 191D.1 — Production Capabilities Panel
 *
 * Displays derived capabilities for a selected site.
 * Capabilities are computed from machine configuration (provenance model).
 */
import React, { useState, useEffect } from 'react';
import { Shield, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

interface Capability {
    type: string;
    label: string;
    module: string;
    active: boolean;
    source_machine_ids: string[];
}

interface SiteOption {
    siteId: string;
    siteName: string;
}

const MODULE_COLORS: Record<string, string> = {
    PRINT: '#3b82f6',
    FINISHING: '#f59e0b',
    QUALITY: '#22c55e',
    FORMAT: '#a855f7',
    UNKNOWN: '#71717a'
};

export const CapabilitiesPanel: React.FC<{ sites?: SiteOption[] }> = ({ sites = [] }) => {
    const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.siteId || '');
    const [capabilities, setCapabilities] = useState<Capability[]>([]);
    const [machineCount, setMachineCount] = useState(0);
    const [loading, setLoading] = useState(false);

    const fetchCapabilities = async (siteId: string) => {
        if (!siteId) return;
        setLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`/api/printhouse/onboarding/sites/${siteId}/capabilities`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setCapabilities(data.capabilities || []);
                setMachineCount(data.machine_count || 0);
            }
        } catch (err) {
            console.error('Error fetching capabilities:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedSiteId) fetchCapabilities(selectedSiteId);
    }, [selectedSiteId]);

    useEffect(() => {
        if (sites.length > 0 && !selectedSiteId) {
            setSelectedSiteId(sites[0].siteId);
        }
    }, [sites]);

    const groupedByModule = capabilities.reduce<Record<string, Capability[]>>((acc, cap) => {
        const mod = cap.module || 'UNKNOWN';
        if (!acc[mod]) acc[mod] = [];
        acc[mod].push(cap);
        return acc;
    }, {});

    const inputStyle: React.CSSProperties = {
        width: '100%', background: '#18181b', border: '1px solid #3f3f46',
        borderRadius: '8px', padding: '10px 14px', color: '#f4f4f5', fontSize: '14px',
        outline: 'none'
    };

    return (
        <div>
            {/* Site Selector */}
            {sites.length > 1 && (
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '13px', color: '#a1a1aa', display: 'block', marginBottom: '6px' }}>
                        Production Site
                    </label>
                    <select
                        value={selectedSiteId}
                        onChange={e => setSelectedSiteId(e.target.value)}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                        {sites.map(s => (
                            <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={20} style={{ color: '#dc0000' }} />
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff' }}>
                        Production Capabilities
                    </h3>
                </div>
                <button
                    onClick={() => fetchCapabilities(selectedSiteId)}
                    style={{
                        background: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px',
                        padding: '8px 12px', color: '#a1a1aa', cursor: 'pointer'
                    }}
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Summary Bar */}
            <div style={{
                background: '#18181b', border: '1px solid #27272a', borderRadius: '12px',
                padding: '16px 20px', marginBottom: '20px',
                display: 'flex', gap: '32px'
            }}>
                <div>
                    <span style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>{capabilities.length}</span>
                    <span style={{ fontSize: '13px', color: '#71717a', marginLeft: '6px' }}>capabilities</span>
                </div>
                <div>
                    <span style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>{machineCount}</span>
                    <span style={{ fontSize: '13px', color: '#71717a', marginLeft: '6px' }}>active machines</span>
                </div>
                <div>
                    <span style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>{Object.keys(groupedByModule).length}</span>
                    <span style={{ fontSize: '13px', color: '#71717a', marginLeft: '6px' }}>modules</span>
                </div>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                    <RefreshCw size={24} className="animate-spin" />
                </div>
            )}

            {/* Capability Groups */}
            {!loading && Object.entries(groupedByModule).map(([module, caps]) => (
                <div key={module} style={{ marginBottom: '20px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #27272a'
                    }}>
                        <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: MODULE_COLORS[module] || '#71717a'
                        }} />
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#d4d4d8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {module}
                        </h4>
                        <span style={{ fontSize: '12px', color: '#71717a' }}>({caps.length})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                        {caps.map(cap => (
                            <div
                                key={cap.type}
                                style={{
                                    background: '#18181b', border: '1px solid #27272a', borderRadius: '8px',
                                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px'
                                }}
                            >
                                {cap.active
                                    ? <CheckCircle2 size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                                    : <XCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                                }
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>{cap.label}</div>
                                    <div style={{ fontSize: '11px', color: '#71717a' }}>
                                        {cap.source_machine_ids.length} machine{cap.source_machine_ids.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Empty State */}
            {!loading && capabilities.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '40px', color: '#71717a',
                    background: '#18181b', borderRadius: '12px', border: '1px solid #27272a'
                }}>
                    <Shield size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p style={{ margin: '0 0 6px 0', fontWeight: 600 }}>No capabilities detected</p>
                    <p style={{ margin: 0, fontSize: '13px' }}>
                        Add machines and configure their features to automatically derive production capabilities.
                    </p>
                </div>
            )}

            {/* Provenance Notice */}
            {capabilities.length > 0 && (
                <div style={{
                    marginTop: '16px', padding: '12px 16px',
                    background: '#1a1a2e', border: '1px solid #312e81', borderRadius: '8px',
                    fontSize: '12px', color: '#818cf8'
                }}>
                    💡 Capabilities are automatically derived from your machine configuration.
                    Update machine features to modify your capability profile.
                </div>
            )}
        </div>
    );
};
