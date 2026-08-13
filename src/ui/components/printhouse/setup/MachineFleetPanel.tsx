/**
 * src/ui/components/printhouse/setup/MachineFleetPanel.tsx
 *
 * Phase 191D.1 — Machine Fleet Management Panel
 *
 * Lists machines for a selected site, allows creation from templates,
 * editing, and archiving. Follows the same UX patterns as ProductionSitesPanel.
 */
import React, { useState, useEffect } from 'react';
import { Cog, Plus, Edit2, Trash2, CheckCircle, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

interface MachineData {
    id: string;
    machine_name: string;
    machine_type: string;
    manufacturer?: string;
    model?: string;
    status: string;
    max_sheet_width_mm?: number;
    max_sheet_height_mm?: number;
    supported_color_modes_json?: string[];
    supported_print_methods_json?: string[];
    supports_pdfx?: boolean;
    supports_pdfa?: boolean;
    supports_variable_data?: boolean;
    supports_white_ink?: boolean;
    supports_spot_uv?: boolean;
    supports_lamination?: boolean;
    supports_hardcover?: boolean;
    supports_softcover?: boolean;
    supports_saddle_stitch?: boolean;
    supports_perfect_binding?: boolean;
    supports_case_binding?: boolean;
}

interface TemplateData {
    template_id: string;
    machine_type: string;
    defaults: Record<string, any>;
}

interface SiteOption {
    siteId: string;
    siteName: string;
}

const MACHINE_TYPE_LABELS: Record<string, string> = {
    OFFSET_PRESS: 'Offset Press',
    DIGITAL_PRESS: 'Digital Press',
    LARGE_FORMAT: 'Large Format',
    BINDER: 'Binder',
    FINISHER: 'Finisher',
    CUTTER: 'Cutter',
    FOLDER: 'Folder',
    LAMINATOR: 'Laminator',
    OTHER: 'Other'
};

const STATUS_COLORS: Record<string, string> = {
    ACTIVE: '#22c55e',
    MAINTENANCE: '#f59e0b',
    DECOMMISSIONED: '#ef4444',
    ARCHIVED: '#71717a'
};

export const MachineFleetPanel: React.FC<{ sites?: SiteOption[]; onSaved?: () => void }> = ({ sites = [], onSaved }) => {
    const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.siteId || '');
    const [machines, setMachines] = useState<MachineData[]>([]);
    const [templates, setTemplates] = useState<TemplateData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [form, setForm] = useState<Record<string, any>>({
        machine_name: '',
        machine_type: 'DIGITAL_PRESS',
        manufacturer: '',
        model: '',
        template_id: ''
    });

    const fetchMachines = async (siteId: string) => {
        if (!siteId) return;
        setLoading(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`/api/printhouse/onboarding/sites/${siteId}/machines`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setMachines(data.machines || []);
            }
        } catch (err) {
            console.error('Error fetching machines:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTemplates = async () => {
        try {
            const token = getAuthToken();
            const res = await fetch('/api/printhouse/onboarding/machines/templates', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setTemplates(data.templates || []);
            }
        } catch (err) {
            console.error('Error fetching templates:', err);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    useEffect(() => {
        if (selectedSiteId) fetchMachines(selectedSiteId);
    }, [selectedSiteId]);

    useEffect(() => {
        if (sites.length > 0 && !selectedSiteId) {
            setSelectedSiteId(sites[0].siteId);
        }
    }, [sites]);

    const openCreateForm = (templateId?: string) => {
        setEditingMachineId(null);
        const base: Record<string, any> = {
            machine_name: '',
            machine_type: 'DIGITAL_PRESS',
            manufacturer: '',
            model: '',
            template_id: templateId || ''
        };
        if (templateId) {
            const tmpl = templates.find(t => t.template_id === templateId);
            if (tmpl) {
                base.machine_type = tmpl.defaults.machine_type || base.machine_type;
            }
        }
        setForm(base);
        setIsEditing(true);
        setErrorMsg(null);
    };

    const openEditForm = (machine: MachineData) => {
        setEditingMachineId(machine.id);
        setForm({
            machine_name: machine.machine_name,
            machine_type: machine.machine_type,
            manufacturer: machine.manufacturer || '',
            model: machine.model || ''
        });
        setIsEditing(true);
        setErrorMsg(null);
    };

    const handleSave = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const token = getAuthToken();
            const isNew = !editingMachineId;
            const url = isNew
                ? `/api/printhouse/onboarding/sites/${selectedSiteId}/machines`
                : `/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${editingMachineId}`;
            const method = isNew ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || 'Unknown error');
                return;
            }
            setIsEditing(false);
            await fetchMachines(selectedSiteId);
            onSaved?.();
        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleArchive = async (machineId: string) => {
        if (!confirm('Archive this machine? It will no longer contribute to site capabilities.')) return;
        try {
            const token = getAuthToken();
            await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${machineId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            await fetchMachines(selectedSiteId);
            onSaved?.();
        } catch (err) {
            console.error('Error archiving machine:', err);
        }
    };

    const capabilityBadges = (m: MachineData) => {
        const badges: string[] = [];
        if (m.supports_pdfx) badges.push('PDF/X');
        if (m.supports_pdfa) badges.push('PDF/A');
        if (m.supports_variable_data) badges.push('VDP');
        if (m.supports_white_ink) badges.push('White Ink');
        if (m.supports_spot_uv) badges.push('Spot UV');
        if (m.supports_lamination) badges.push('Lamination');
        if (m.supports_saddle_stitch) badges.push('Saddle');
        if (m.supports_perfect_binding) badges.push('Perfect Bind');
        if (m.supports_case_binding) badges.push('Case Bind');
        return badges;
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', background: '#18181b', border: '1px solid #3f3f46',
        borderRadius: '8px', padding: '10px 14px', color: '#f4f4f5', fontSize: '14px',
        outline: 'none'
    };

    const btnPrimary: React.CSSProperties = {
        background: '#dc0000', color: '#fff', border: 'none', padding: '10px 24px',
        borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer'
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

            {/* Header Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cog size={20} style={{ color: '#dc0000' }} />
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff' }}>
                        Machinery Fleet {machines.length > 0 && <span style={{ color: '#71717a', fontWeight: 400 }}>({machines.length})</span>}
                    </h3>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => fetchMachines(selectedSiteId)} style={{ ...btnPrimary, background: '#27272a', padding: '8px 12px' }}>
                        <RefreshCw size={14} />
                    </button>
                    <button onClick={() => openCreateForm()} style={btnPrimary}>
                        <Plus size={14} style={{ marginRight: '4px' }} /> Add Machine
                    </button>
                </div>
            </div>

            {/* Template Quick-Start */}
            {!isEditing && machines.length === 0 && templates.length > 0 && (
                <div style={{
                    background: '#18181b', border: '1px solid #27272a', borderRadius: '12px',
                    padding: '20px', marginBottom: '20px'
                }}>
                    <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '0 0 12px 0' }}>
                        <Zap size={14} style={{ marginRight: '4px', color: '#f59e0b' }} />
                        Quick start with a template:
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {templates.map(t => (
                            <button
                                key={t.template_id}
                                onClick={() => openCreateForm(t.template_id)}
                                style={{
                                    background: '#27272a', border: '1px solid #3f3f46', borderRadius: '8px',
                                    padding: '8px 16px', color: '#f4f4f5', fontSize: '13px', cursor: 'pointer',
                                    fontWeight: 500
                                }}
                            >
                                {MACHINE_TYPE_LABELS[t.template_id] || t.template_id}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Machine List */}
            {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}><RefreshCw size={24} className="animate-spin" /></div>}

            {!loading && !isEditing && machines.map(m => (
                <div
                    key={m.id}
                    style={{
                        background: '#18181b', border: '1px solid #27272a', borderRadius: '12px',
                        padding: '16px 20px', marginBottom: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>{m.machine_name}</span>
                            <span style={{
                                background: STATUS_COLORS[m.status] || '#71717a',
                                color: '#fff', fontSize: '11px', fontWeight: 600,
                                padding: '2px 8px', borderRadius: '4px'
                            }}>
                                {m.status}
                            </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>
                            {MACHINE_TYPE_LABELS[m.machine_type] || m.machine_type}
                            {m.manufacturer && ` · ${m.manufacturer}`}
                            {m.model && ` ${m.model}`}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {capabilityBadges(m).map(badge => (
                                <span key={badge} style={{
                                    background: '#27272a', color: '#a1a1aa', fontSize: '11px',
                                    padding: '2px 8px', borderRadius: '4px', border: '1px solid #3f3f46'
                                }}>
                                    {badge}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => openEditForm(m)} style={{
                            background: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px',
                            padding: '6px 10px', color: '#a1a1aa', cursor: 'pointer'
                        }}>
                            <Edit2 size={14} />
                        </button>
                        {m.status !== 'ARCHIVED' && (
                            <button onClick={() => handleArchive(m.id)} style={{
                                background: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px',
                                padding: '6px 10px', color: '#ef4444', cursor: 'pointer'
                            }}>
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {!loading && !isEditing && machines.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '40px', color: '#71717a',
                    background: '#18181b', borderRadius: '12px', border: '1px solid #27272a'
                }}>
                    <Cog size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p style={{ margin: 0 }}>No machines configured yet. Add your first machine to unlock capabilities.</p>
                </div>
            )}

            {/* Create/Edit Form */}
            {isEditing && (
                <div style={{
                    background: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px',
                    padding: '24px', marginTop: '12px'
                }}>
                    <h4 style={{ margin: '0 0 16px 0', color: '#fff', fontSize: '16px', fontWeight: 700 }}>
                        {editingMachineId ? 'Edit Machine' : 'Add Machine'}
                    </h4>

                    {errorMsg && (
                        <div style={{
                            background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: '8px',
                            padding: '10px 14px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px',
                            display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                            <AlertCircle size={14} /> {errorMsg}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Machine Name *</label>
                            <input
                                style={inputStyle}
                                value={form.machine_name || ''}
                                onChange={e => setForm({ ...form, machine_name: e.target.value })}
                                placeholder="e.g. Heidelberg XL 106"
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Machine Type *</label>
                            <select
                                style={{ ...inputStyle, cursor: 'pointer' }}
                                value={form.machine_type || 'DIGITAL_PRESS'}
                                onChange={e => setForm({ ...form, machine_type: e.target.value })}
                            >
                                {Object.entries(MACHINE_TYPE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Manufacturer</label>
                            <input
                                style={inputStyle}
                                value={form.manufacturer || ''}
                                onChange={e => setForm({ ...form, manufacturer: e.target.value })}
                                placeholder="e.g. Heidelberg, HP, Konica Minolta"
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Model</label>
                            <input
                                style={inputStyle}
                                value={form.model || ''}
                                onChange={e => setForm({ ...form, model: e.target.value })}
                                placeholder="e.g. Speedmaster XL 106-8P"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => setIsEditing(false)}
                            style={{ ...btnPrimary, background: '#27272a' }}
                        >
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={loading} style={btnPrimary}>
                            {loading ? 'Saving...' : editingMachineId ? 'Update Machine' : 'Create Machine'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
