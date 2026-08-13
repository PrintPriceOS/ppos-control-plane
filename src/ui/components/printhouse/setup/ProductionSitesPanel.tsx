/**
 * src/ui/components/printhouse/setup/ProductionSitesPanel.tsx
 * 
 * Manages listing, creating, and completing canonical production sites (`printer_nodes`).
 * Completes placeholder DRAFT sites without duplicating nodes.
 */
import React, { useState } from 'react';
import { FieldGuidance } from './FieldGuidance';
import { Factory, Plus, Edit2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

interface SiteData {
    siteId: string;
    siteName: string;
    siteCode?: string;
    country: string;
    city: string;
    phone?: string;
    website?: string;
    timezone?: string;
    isPrimary?: boolean;
    status: string;
}

export const ProductionSitesPanel: React.FC<{ sites?: SiteData[]; onSaved?: () => void }> = ({ sites = [], onSaved }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<SiteData>>({
        siteName: '',
        country: 'ES',
        city: '',
        phone: '',
        timezone: 'Europe/Madrid'
    });

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const openCreateForm = () => {
        setEditingSiteId(null);
        setForm({ siteName: '', country: 'ES', city: '', phone: '', timezone: 'Europe/Madrid' });
        setIsEditing(true);
    };

    const openEditForm = (site: SiteData) => {
        setEditingSiteId(site.siteId);
        setForm({
            siteName: site.siteName,
            country: site.country === 'Pending Setup' ? 'ES' : site.country,
            city: site.city === 'Pending Setup' ? '' : site.city,
            phone: site.phone || '',
            timezone: site.timezone || 'Europe/Madrid'
        });
        setIsEditing(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg(null);

        try {
            const token = getAuthToken();
            const url = editingSiteId 
                ? `/api/printhouse/onboarding/sites/${editingSiteId}`
                : '/api/printhouse/onboarding/sites';

            const method = editingSiteId ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(form)
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                setIsEditing(false);
                if (onSaved) onSaved();
            } else {
                setErrorMsg(data.error || 'Failed to save production site.');
            }
        } catch (err) {
            setErrorMsg('Network error while saving production site.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>Production Sites</h2>
                    <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '4px 0 0 0' }}>
                        Manage your physical printing facilities and production nodes.
                    </p>
                </div>
                {!isEditing && (
                    <button
                        onClick={openCreateForm}
                        style={{
                            background: '#dc0000',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Plus size={16} /> Add Production Site
                    </button>
                )}
            </div>

            {errorMsg && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#fca5a5', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <AlertCircle size={16} /> {errorMsg}
                </div>
            )}

            {isEditing ? (
                <form onSubmit={handleSubmit} style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', marginTop: 0, marginBottom: '16px' }}>
                        {editingSiteId ? 'Edit Production Site' : 'Configure Primary Site'}
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                                Facility / Site Name
                                <FieldGuidance title="Facility Name" description="Unique name for this printing plant (e.g. Madrid Main Plant)." />
                            </label>
                            <input
                                type="text"
                                required
                                value={form.siteName || ''}
                                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                                placeholder="e.g. Central Production Plant"
                                style={{ width: '100%', background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                                Country
                            </label>
                            <input
                                type="text"
                                required
                                value={form.country || ''}
                                onChange={(e) => setForm({ ...form, country: e.target.value })}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                                City / Location
                            </label>
                            <input
                                type="text"
                                required
                                value={form.city || ''}
                                onChange={(e) => setForm({ ...form, city: e.target.value })}
                                placeholder="e.g. Madrid"
                                style={{ width: '100%', background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#a1a1aa', marginBottom: '6px' }}>
                                Timezone
                                <FieldGuidance title="Site Timezone" description="Used to compute SLA deadlines and scheduling cut-off times." />
                            </label>
                            <select
                                value={form.timezone || 'Europe/Madrid'}
                                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                                style={{ width: '100%', background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                            >
                                <option value="Europe/Madrid">Europe/Madrid (CET)</option>
                                <option value="Europe/London">Europe/London (GMT)</option>
                                <option value="Europe/Paris">Europe/Paris (CET)</option>
                                <option value="America/New_York">America/New_York (EST)</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{ background: '#dc0000', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                        >
                            {loading ? 'Saving...' : 'Save Production Site'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            style={{ background: '#27272a', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : null}

            {/* Sites List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sites.map((site) => (
                    <div key={site.siteId} style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '8px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <Factory size={24} style={{ color: site.status === 'CONFIGURING' || site.status === 'active' ? '#10b981' : '#eab308' }} />
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: 0 }}>{site.siteName}</h4>
                                    {site.isPrimary && <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>Primary Plant</span>}
                                    <span style={{ background: '#27272a', color: '#a1a1aa', fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>{site.status}</span>
                                </div>
                                <p style={{ fontSize: '12px', color: '#a1a1aa', margin: '4px 0 0 0' }}>
                                    {site.city || 'Pending City'}, {site.country || 'Pending Country'} ({site.timezone || 'CET'})
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => openEditForm(site)}
                            style={{ background: '#27272a', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Edit2 size={14} /> Configure Site
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
