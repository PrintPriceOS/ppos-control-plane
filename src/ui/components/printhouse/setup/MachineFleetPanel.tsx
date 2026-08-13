/**
 * src/ui/components/printhouse/setup/MachineFleetPanel.tsx
 *
 * Phase 191D.1 / Phase 192 RC16 — Machine Fleet Management Panel
 *
 * Lists machines for a selected site, allows creation with explicit capabilities,
 * editing, and archiving. Follows the same UX patterns as ProductionSitesPanel.
 */
import React, { useState, useEffect } from 'react';
import { Cog, Plus, Edit2, Trash2, CheckCircle, AlertCircle, Zap, RefreshCw, Sliders, CheckSquare, Square } from 'lucide-react';
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
    min_sheet_width_mm?: number;
    min_sheet_height_mm?: number;
    max_print_width_mm?: number;
    max_print_height_mm?: number;
    supported_color_modes_json?: string[];
    supported_print_methods_json?: string[];
    supported_sides_json?: string[];
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

const COLOR_MODE_OPTIONS = [
    { value: 'CMYK', label: 'CMYK Standard' },
    { value: 'CMYK+SPOT', label: 'CMYK + Spot Colors' },
    { value: 'CMYK+WHITE', label: 'CMYK + White Ink' },
    { value: 'RGB', label: 'RGB Extended' },
    { value: 'GRAYSCALE', label: 'Grayscale' },
    { value: 'MONOCHROME', label: 'Monochrome (1/0)' },
    { value: 'SPOT_ONLY', label: 'Spot Color Only' }
];

const PRINT_METHOD_OPTIONS = [
    { value: 'SHEETFED_OFFSET', label: 'Sheetfed Offset' },
    { value: 'DIGITAL_TONER', label: 'Digital Toner (Electroink)' },
    { value: 'DIGITAL_INKJET', label: 'Digital High-Speed Inkjet' },
    { value: 'WIDE_FORMAT_INKJET', label: 'Wide Format UV/Solvent Inkjet' },
    { value: 'WEB_OFFSET', label: 'Web Offset' },
    { value: 'FLEXO', label: 'Flexographic' },
    { value: 'SCREEN_PRINTING', label: 'Screen Printing' }
];

const SIDES_OPTIONS = [
    { value: 'SIMPLEX', label: 'Simplex (Single-sided)' },
    { value: 'DUPLEX', label: 'Duplex (Auto-perfecting)' }
];

const CAPABILITY_TOGGLES: { field: string; label: string; group: string }[] = [
    { field: 'supports_pdfx', label: 'PDF/X Compliant Rendering', group: 'Quality & Preflight' },
    { field: 'supports_pdfa', label: 'PDF/A Archival Rendering', group: 'Quality & Preflight' },
    { field: 'supports_variable_data', label: 'Variable Data Printing (VDP)', group: 'Print Capabilities' },
    { field: 'supports_white_ink', label: 'White Ink Support', group: 'Print Capabilities' },
    { field: 'supports_spot_uv', label: 'Spot UV / Varnish', group: 'Finishing & Embellishment' },
    { field: 'supports_lamination', label: 'Inline Lamination', group: 'Finishing & Embellishment' },
    { field: 'supports_saddle_stitch', label: 'Saddle Stitch Binding', group: 'Binding & Finishing' },
    { field: 'supports_perfect_binding', label: 'Perfect Binding (PUR/EVA)', group: 'Binding & Finishing' },
    { field: 'supports_case_binding', label: 'Case Binding', group: 'Binding & Finishing' },
    { field: 'supports_hardcover', label: 'Hardcover Production', group: 'Binding & Finishing' },
    { field: 'supports_softcover', label: 'Softcover Production', group: 'Binding & Finishing' }
];

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
        max_sheet_width_mm: '',
        max_sheet_height_mm: '',
        min_sheet_width_mm: '',
        min_sheet_height_mm: '',
        max_print_width_mm: '',
        max_print_height_mm: '',
        supported_color_modes_json: [] as string[],
        supported_print_methods_json: [] as string[],
        supported_sides_json: [] as string[],
        supports_pdfx: false,
        supports_pdfa: false,
        supports_variable_data: false,
        supports_white_ink: false,
        supports_spot_uv: false,
        supports_lamination: false,
        supports_hardcover: false,
        supports_softcover: false,
        supports_saddle_stitch: false,
        supports_perfect_binding: false,
        supports_case_binding: false
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
        let base: Record<string, any> = {
            machine_name: '',
            machine_type: 'DIGITAL_PRESS',
            manufacturer: '',
            model: '',
            max_sheet_width_mm: '',
            max_sheet_height_mm: '',
            min_sheet_width_mm: '',
            min_sheet_height_mm: '',
            max_print_width_mm: '',
            max_print_height_mm: '',
            supported_color_modes_json: [],
            supported_print_methods_json: [],
            supported_sides_json: [],
            supports_pdfx: false,
            supports_pdfa: false,
            supports_variable_data: false,
            supports_white_ink: false,
            supports_spot_uv: false,
            supports_lamination: false,
            supports_hardcover: false,
            supports_softcover: false,
            supports_saddle_stitch: false,
            supports_perfect_binding: false,
            supports_case_binding: false
        };
        if (templateId) {
            const tmpl = templates.find(t => t.template_id === templateId);
            if (tmpl && tmpl.defaults) {
                base = {
                    ...base,
                    machine_type: tmpl.defaults.machine_type || base.machine_type,
                    max_sheet_width_mm: tmpl.defaults.max_sheet_width_mm || '',
                    max_sheet_height_mm: tmpl.defaults.max_sheet_height_mm || '',
                    min_sheet_width_mm: tmpl.defaults.min_sheet_width_mm || '',
                    min_sheet_height_mm: tmpl.defaults.min_sheet_height_mm || '',
                    max_print_width_mm: tmpl.defaults.max_print_width_mm || '',
                    max_print_height_mm: tmpl.defaults.max_print_height_mm || '',
                    supported_color_modes_json: Array.isArray(tmpl.defaults.supported_color_modes_json) ? [...tmpl.defaults.supported_color_modes_json] : [],
                    supported_print_methods_json: Array.isArray(tmpl.defaults.supported_print_methods_json) ? [...tmpl.defaults.supported_print_methods_json] : [],
                    supported_sides_json: Array.isArray(tmpl.defaults.supported_sides_json) ? [...tmpl.defaults.supported_sides_json] : [],
                    supports_pdfx: !!tmpl.defaults.supports_pdfx,
                    supports_pdfa: !!tmpl.defaults.supports_pdfa,
                    supports_variable_data: !!tmpl.defaults.supports_variable_data,
                    supports_white_ink: !!tmpl.defaults.supports_white_ink,
                    supports_spot_uv: !!tmpl.defaults.supports_spot_uv,
                    supports_lamination: !!tmpl.defaults.supports_lamination,
                    supports_hardcover: !!tmpl.defaults.supports_hardcover,
                    supports_softcover: !!tmpl.defaults.supports_softcover,
                    supports_saddle_stitch: !!tmpl.defaults.supports_saddle_stitch,
                    supports_perfect_binding: !!tmpl.defaults.supports_perfect_binding,
                    supports_case_binding: !!tmpl.defaults.supports_case_binding
                };
            }
        }
        setForm(base);
        setIsEditing(true);
        setErrorMsg(null);
    };

    const openEditForm = (machine: MachineData) => {
        setEditingMachineId(machine.id);
        setForm({
            machine_name: machine.machine_name || '',
            machine_type: machine.machine_type || 'DIGITAL_PRESS',
            manufacturer: machine.manufacturer || '',
            model: machine.model || '',
            max_sheet_width_mm: machine.max_sheet_width_mm !== undefined && machine.max_sheet_width_mm !== null ? machine.max_sheet_width_mm : '',
            max_sheet_height_mm: machine.max_sheet_height_mm !== undefined && machine.max_sheet_height_mm !== null ? machine.max_sheet_height_mm : '',
            min_sheet_width_mm: machine.min_sheet_width_mm !== undefined && machine.min_sheet_width_mm !== null ? machine.min_sheet_width_mm : '',
            min_sheet_height_mm: machine.min_sheet_height_mm !== undefined && machine.min_sheet_height_mm !== null ? machine.min_sheet_height_mm : '',
            max_print_width_mm: machine.max_print_width_mm !== undefined && machine.max_print_width_mm !== null ? machine.max_print_width_mm : '',
            max_print_height_mm: machine.max_print_height_mm !== undefined && machine.max_print_height_mm !== null ? machine.max_print_height_mm : '',
            supported_color_modes_json: Array.isArray(machine.supported_color_modes_json) ? [...machine.supported_color_modes_json] : [],
            supported_print_methods_json: Array.isArray(machine.supported_print_methods_json) ? [...machine.supported_print_methods_json] : [],
            supported_sides_json: Array.isArray(machine.supported_sides_json) ? [...machine.supported_sides_json] : [],
            supports_pdfx: !!machine.supports_pdfx,
            supports_pdfa: !!machine.supports_pdfa,
            supports_variable_data: !!machine.supports_variable_data,
            supports_white_ink: !!machine.supports_white_ink,
            supports_spot_uv: !!machine.supports_spot_uv,
            supports_lamination: !!machine.supports_lamination,
            supports_hardcover: !!machine.supports_hardcover,
            supports_softcover: !!machine.supports_softcover,
            supports_saddle_stitch: !!machine.supports_saddle_stitch,
            supports_perfect_binding: !!machine.supports_perfect_binding,
            supports_case_binding: !!machine.supports_case_binding
        });
        setIsEditing(true);
        setErrorMsg(null);
    };

    const toggleArrayItem = (key: string, item: string) => {
        const current = Array.isArray(form[key]) ? form[key] : [];
        if (current.includes(item)) {
            setForm({ ...form, [key]: current.filter((x: string) => x !== item) });
        } else {
            setForm({ ...form, [key]: [...current, item] });
        }
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

            const payload: Record<string, any> = {
                machine_name: form.machine_name,
                machine_type: form.machine_type,
                manufacturer: form.manufacturer ? form.manufacturer.trim() : null,
                model: form.model ? form.model.trim() : null,
                max_sheet_width_mm: form.max_sheet_width_mm !== '' && form.max_sheet_width_mm !== null ? Number(form.max_sheet_width_mm) : null,
                max_sheet_height_mm: form.max_sheet_height_mm !== '' && form.max_sheet_height_mm !== null ? Number(form.max_sheet_height_mm) : null,
                min_sheet_width_mm: form.min_sheet_width_mm !== '' && form.min_sheet_width_mm !== null ? Number(form.min_sheet_width_mm) : null,
                min_sheet_height_mm: form.min_sheet_height_mm !== '' && form.min_sheet_height_mm !== null ? Number(form.min_sheet_height_mm) : null,
                max_print_width_mm: form.max_print_width_mm !== '' && form.max_print_width_mm !== null ? Number(form.max_print_width_mm) : null,
                max_print_height_mm: form.max_print_height_mm !== '' && form.max_print_height_mm !== null ? Number(form.max_print_height_mm) : null,
                supported_color_modes_json: form.supported_color_modes_json || [],
                supported_print_methods_json: form.supported_print_methods_json || [],
                supported_sides_json: form.supported_sides_json || [],
                supports_pdfx: !!form.supports_pdfx,
                supports_pdfa: !!form.supports_pdfa,
                supports_variable_data: !!form.supports_variable_data,
                supports_white_ink: !!form.supports_white_ink,
                supports_spot_uv: !!form.supports_spot_uv,
                supports_lamination: !!form.supports_lamination,
                supports_hardcover: !!form.supports_hardcover,
                supports_softcover: !!form.supports_softcover,
                supports_saddle_stitch: !!form.supports_saddle_stitch,
                supports_perfect_binding: !!form.supports_perfect_binding,
                supports_case_binding: !!form.supports_case_binding
            };

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
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
        if (m.supports_hardcover) badges.push('Hardcover');
        if (m.supports_softcover) badges.push('Softcover');
        if (Array.isArray(m.supported_color_modes_json) && m.supported_color_modes_json.length > 0) {
            badges.push(...m.supported_color_modes_json);
        }
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
                        Quick start with a verified template:
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
                            {m.max_sheet_width_mm && m.max_sheet_height_mm && (
                                <span style={{ color: '#71717a' }}> · Max Sheet: {m.max_sheet_width_mm} × {m.max_sheet_height_mm} mm</span>
                            )}
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
                        {editingMachineId ? 'Edit Machine & Capabilities' : 'Add Machine & Capabilities'}
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

                    {/* Section 1: Identification */}
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            1. Machine Identification
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Machine Name *</label>
                                <input
                                    style={inputStyle}
                                    value={form.machine_name || ''}
                                    onChange={e => setForm({ ...form, machine_name: e.target.value })}
                                    placeholder="e.g. HP Indigo 100K Digital Press"
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
                                    placeholder="e.g. HP, Heidelberg, Canon, Konica Minolta"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Model</label>
                                <input
                                    style={inputStyle}
                                    value={form.model || ''}
                                    onChange={e => setForm({ ...form, model: e.target.value })}
                                    placeholder="e.g. 100K Digital Press"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Dimensions */}
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            2. Sheet & Print Dimensions (mm)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Max Sheet Width (mm)</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={form.max_sheet_width_mm}
                                    onChange={e => setForm({ ...form, max_sheet_width_mm: e.target.value })}
                                    placeholder="e.g. 750"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Max Sheet Height (mm)</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={form.max_sheet_height_mm}
                                    onChange={e => setForm({ ...form, max_sheet_height_mm: e.target.value })}
                                    placeholder="e.g. 530"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Max Print Width (mm)</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={form.max_print_width_mm}
                                    onChange={e => setForm({ ...form, max_print_width_mm: e.target.value })}
                                    placeholder="e.g. 740"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Min Sheet Width (mm)</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={form.min_sheet_width_mm}
                                    onChange={e => setForm({ ...form, min_sheet_width_mm: e.target.value })}
                                    placeholder="e.g. 297"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Min Sheet Height (mm)</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={form.min_sheet_height_mm}
                                    onChange={e => setForm({ ...form, min_sheet_height_mm: e.target.value })}
                                    placeholder="e.g. 210"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Max Print Height (mm)</label>
                                <input
                                    type="number"
                                    style={inputStyle}
                                    value={form.max_print_height_mm}
                                    onChange={e => setForm({ ...form, max_print_height_mm: e.target.value })}
                                    placeholder="e.g. 510"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Color Modes */}
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            3. Supported Color Modes
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                            {COLOR_MODE_OPTIONS.map(opt => {
                                const checked = (form.supported_color_modes_json || []).includes(opt.value);
                                return (
                                    <button
                                        type="button"
                                        key={opt.value}
                                        onClick={() => toggleArrayItem('supported_color_modes_json', opt.value)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '8px 12px', borderRadius: '8px',
                                            background: checked ? 'rgba(220, 0, 0, 0.15)' : '#27272a',
                                            border: `1px solid ${checked ? '#dc0000' : '#3f3f46'}`,
                                            color: checked ? '#fff' : '#a1a1aa',
                                            cursor: 'pointer', textAlign: 'left', fontSize: '13px'
                                        }}
                                    >
                                        {checked ? <CheckSquare size={16} color="#dc0000" /> : <Square size={16} color="#71717a" />}
                                        <span>{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Section 4: Print Methods & Sides */}
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            4. Print Methods & Printing Sides
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                            <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '6px' }}>Print Methods</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                                {PRINT_METHOD_OPTIONS.map(opt => {
                                    const checked = (form.supported_print_methods_json || []).includes(opt.value);
                                    return (
                                        <button
                                            type="button"
                                            key={opt.value}
                                            onClick={() => toggleArrayItem('supported_print_methods_json', opt.value)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                padding: '8px 12px', borderRadius: '8px',
                                                background: checked ? 'rgba(220, 0, 0, 0.15)' : '#27272a',
                                                border: `1px solid ${checked ? '#dc0000' : '#3f3f46'}`,
                                                color: checked ? '#fff' : '#a1a1aa',
                                                cursor: 'pointer', textAlign: 'left', fontSize: '13px'
                                            }}
                                        >
                                            {checked ? <CheckSquare size={16} color="#dc0000" /> : <Square size={16} color="#71717a" />}
                                            <span>{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', color: '#a1a1aa', display: 'block', marginBottom: '6px' }}>Printing Sides</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {SIDES_OPTIONS.map(opt => {
                                    const checked = (form.supported_sides_json || []).includes(opt.value);
                                    return (
                                        <button
                                            type="button"
                                            key={opt.value}
                                            onClick={() => toggleArrayItem('supported_sides_json', opt.value)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                padding: '8px 16px', borderRadius: '8px',
                                                background: checked ? 'rgba(220, 0, 0, 0.15)' : '#27272a',
                                                border: `1px solid ${checked ? '#dc0000' : '#3f3f46'}`,
                                                color: checked ? '#fff' : '#a1a1aa',
                                                cursor: 'pointer', fontSize: '13px'
                                            }}
                                        >
                                            {checked ? <CheckSquare size={16} color="#dc0000" /> : <Square size={16} color="#71717a" />}
                                            <span>{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section 5: Technical Capabilities */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f4f4f5', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            5. Technical Capabilities & Features
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                            {CAPABILITY_TOGGLES.map(cap => {
                                const checked = !!form[cap.field];
                                return (
                                    <button
                                        type="button"
                                        key={cap.field}
                                        onClick={() => setForm({ ...form, [cap.field]: !checked })}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '10px 12px', borderRadius: '8px',
                                            background: checked ? 'rgba(34, 197, 94, 0.15)' : '#27272a',
                                            border: `1px solid ${checked ? '#22c55e' : '#3f3f46'}`,
                                            color: checked ? '#fff' : '#a1a1aa',
                                            cursor: 'pointer', textAlign: 'left', fontSize: '13px'
                                        }}
                                    >
                                        {checked ? <CheckCircle size={16} color="#22c55e" /> : <Square size={16} color="#71717a" />}
                                        <div>
                                            <div style={{ fontWeight: checked ? 600 : 400 }}>{cap.label}</div>
                                            <div style={{ fontSize: '11px', color: '#71717a' }}>{cap.group}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #27272a', paddingTop: '16px' }}>
                        <button
                            onClick={() => setIsEditing(false)}
                            style={{ ...btnPrimary, background: '#27272a' }}
                        >
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={loading} style={btnPrimary}>
                            {loading ? 'Saving...' : editingMachineId ? 'Update Machine & Capabilities' : 'Create Machine & Capabilities'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
