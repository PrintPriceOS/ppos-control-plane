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

    const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            {/* Site Selector */}
            {sites.length > 1 && (
                <div className="mb-5">
                    <label className={labelClass}>
                        Production Site
                    </label>
                    <select
                        value={selectedSiteId}
                        onChange={e => setSelectedSiteId(e.target.value)}
                        className={`${inputClass} cursor-pointer`}
                    >
                        {sites.map(s => (
                            <option key={s.siteId} value={s.siteId}>{s.siteName}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Header Row */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <Cog size={20} className="text-[#dc0000]" />
                    <h3 className="m-0 text-lg font-bold text-zinc-900 dark:text-white">
                        Machinery Fleet {machines.length > 0 && <span className="text-zinc-500 font-normal">({machines.length})</span>}
                    </h3>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => fetchMachines(selectedSiteId)}
                        className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 p-2 rounded-lg transition-colors cursor-pointer"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        onClick={() => openCreateForm()}
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                        <Plus size={14} /> Add Machine
                    </button>
                </div>
            </div>

            {/* Template Quick-Start */}
            {!isEditing && machines.length === 0 && templates.length > 0 && (
                <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 mb-5 transition-colors">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 m-0 mb-3 flex items-center">
                        <Zap size={14} className="mr-1 text-amber-500" />
                        Quick start with a verified template:
                    </p>
                    <div className="flex gap-2.5 flex-wrap">
                        {templates.map(t => (
                            <button
                                key={t.template_id}
                                onClick={() => openCreateForm(t.template_id)}
                                className="bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                            >
                                {MACHINE_TYPE_LABELS[t.template_id] || t.template_id}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Machine List */}
            {loading && (
                <div className="text-center py-10 text-zinc-500">
                    <RefreshCw size={24} className="animate-spin inline-block" />
                </div>
            )}

            {!loading && !isEditing && machines.map(m => (
                <div
                    key={m.id}
                    className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:px-5 mb-3 flex items-center justify-between transition-colors"
                >
                    <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2.5 mb-1.5">
                            <span className="font-bold text-sm text-zinc-900 dark:text-white">{m.machine_name}</span>
                            <span
                                className="text-[11px] font-semibold px-2 py-0.5 rounded text-white"
                                style={{ background: STATUS_COLORS[m.status] || '#71717a' }}
                            >
                                {m.status}
                            </span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                            {MACHINE_TYPE_LABELS[m.machine_type] || m.machine_type}
                            {m.manufacturer && ` · ${m.manufacturer}`}
                            {m.model && ` ${m.model}`}
                            {m.max_sheet_width_mm && m.max_sheet_height_mm && (
                                <span className="text-zinc-400 dark:text-zinc-500"> · Max Sheet: {m.max_sheet_width_mm} × {m.max_sheet_height_mm} mm</span>
                            )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {capabilityBadges(m).map(badge => (
                                <span
                                    key={badge}
                                    className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-[11px] px-2 py-0.5 rounded"
                                >
                                    {badge}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button
                            onClick={() => openEditForm(m)}
                            className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 p-2 rounded-lg transition-colors cursor-pointer"
                        >
                            <Edit2 size={14} />
                        </button>
                        {m.status !== 'ARCHIVED' && (
                            <button
                                onClick={() => handleArchive(m.id)}
                                className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 p-2 rounded-lg transition-colors cursor-pointer"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {!loading && !isEditing && machines.length === 0 && (
                <div className="text-center py-10 text-zinc-500 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <Cog size={32} className="mb-3 opacity-40 mx-auto" />
                    <p className="m-0 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        No machines configured yet. Add your first machine to unlock capabilities.
                    </p>
                </div>
            )}

            {/* Create/Edit Form */}
            {isEditing && (
                <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 mt-3 transition-colors">
                    <h4 className="m-0 mb-4 text-base font-bold text-zinc-900 dark:text-white">
                        {editingMachineId ? 'Edit Machine & Capabilities' : 'Add Machine & Capabilities'}
                    </h4>

                    {errorMsg && (
                        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 p-3 rounded-lg text-xs mb-4 flex items-center gap-2">
                            <AlertCircle size={14} /> {errorMsg}
                        </div>
                    )}

                    {/* Section 1: Identification */}
                    <div className="mb-5">
                        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2.5">
                            1. Machine Identification
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>Machine Name *</label>
                                <input
                                    className={inputClass}
                                    value={form.machine_name || ''}
                                    onChange={e => setForm({ ...form, machine_name: e.target.value })}
                                    placeholder="e.g. HP Indigo 100K Digital Press"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Machine Type *</label>
                                <select
                                    className={`${inputClass} cursor-pointer`}
                                    value={form.machine_type || 'DIGITAL_PRESS'}
                                    onChange={e => setForm({ ...form, machine_type: e.target.value })}
                                >
                                    {Object.entries(MACHINE_TYPE_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Manufacturer</label>
                                <input
                                    className={inputClass}
                                    value={form.manufacturer || ''}
                                    onChange={e => setForm({ ...form, manufacturer: e.target.value })}
                                    placeholder="e.g. HP, Heidelberg, Canon, Konica Minolta"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Model</label>
                                <input
                                    className={inputClass}
                                    value={form.model || ''}
                                    onChange={e => setForm({ ...form, model: e.target.value })}
                                    placeholder="e.g. 100K Digital Press"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Dimensions */}
                    <div className="mb-5">
                        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2.5">
                            2. Sheet & Print Dimensions (mm)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className={labelClass}>Max Sheet Width (mm)</label>
                                <input
                                    type="number"
                                    className={inputClass}
                                    value={form.max_sheet_width_mm}
                                    onChange={e => setForm({ ...form, max_sheet_width_mm: e.target.value })}
                                    placeholder="e.g. 750"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Max Sheet Height (mm)</label>
                                <input
                                    type="number"
                                    className={inputClass}
                                    value={form.max_sheet_height_mm}
                                    onChange={e => setForm({ ...form, max_sheet_height_mm: e.target.value })}
                                    placeholder="e.g. 530"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Max Print Width (mm)</label>
                                <input
                                    type="number"
                                    className={inputClass}
                                    value={form.max_print_width_mm}
                                    onChange={e => setForm({ ...form, max_print_width_mm: e.target.value })}
                                    placeholder="e.g. 740"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Min Sheet Width (mm)</label>
                                <input
                                    type="number"
                                    className={inputClass}
                                    value={form.min_sheet_width_mm}
                                    onChange={e => setForm({ ...form, min_sheet_width_mm: e.target.value })}
                                    placeholder="e.g. 297"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Min Sheet Height (mm)</label>
                                <input
                                    type="number"
                                    className={inputClass}
                                    value={form.min_sheet_height_mm}
                                    onChange={e => setForm({ ...form, min_sheet_height_mm: e.target.value })}
                                    placeholder="e.g. 210"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Max Print Height (mm)</label>
                                <input
                                    type="number"
                                    className={inputClass}
                                    value={form.max_print_height_mm}
                                    onChange={e => setForm({ ...form, max_print_height_mm: e.target.value })}
                                    placeholder="e.g. 510"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Color Modes */}
                    <div className="mb-5">
                        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2.5">
                            3. Supported Color Modes
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {COLOR_MODE_OPTIONS.map(opt => {
                                const checked = (form.supported_color_modes_json || []).includes(opt.value);
                                return (
                                    <button
                                        type="button"
                                        key={opt.value}
                                        onClick={() => toggleArrayItem('supported_color_modes_json', opt.value)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors border ${
                                            checked 
                                                ? 'bg-red-50 dark:bg-red-950/40 border-[#dc0000] text-red-900 dark:text-red-200' 
                                                : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {checked ? <CheckSquare size={16} className="text-[#dc0000]" /> : <Square size={16} className="text-zinc-400" />}
                                        <span>{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Section 4: Print Methods & Sides */}
                    <div className="mb-5">
                        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2.5">
                            4. Print Methods & Printing Sides
                        </div>
                        <div className="mb-3">
                            <label className={labelClass}>Print Methods</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {PRINT_METHOD_OPTIONS.map(opt => {
                                    const checked = (form.supported_print_methods_json || []).includes(opt.value);
                                    return (
                                        <button
                                            type="button"
                                            key={opt.value}
                                            onClick={() => toggleArrayItem('supported_print_methods_json', opt.value)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors border ${
                                                checked 
                                                    ? 'bg-red-50 dark:bg-red-950/40 border-[#dc0000] text-red-900 dark:text-red-200' 
                                                    : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            {checked ? <CheckSquare size={16} className="text-[#dc0000]" /> : <Square size={16} className="text-zinc-400" />}
                                            <span>{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Printing Sides</label>
                            <div className="flex gap-2.5 flex-wrap">
                                {SIDES_OPTIONS.map(opt => {
                                    const checked = (form.supported_sides_json || []).includes(opt.value);
                                    return (
                                        <button
                                            type="button"
                                            key={opt.value}
                                            onClick={() => toggleArrayItem('supported_sides_json', opt.value)}
                                            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors border ${
                                                checked 
                                                    ? 'bg-red-50 dark:bg-red-950/40 border-[#dc0000] text-red-900 dark:text-red-200' 
                                                    : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            {checked ? <CheckSquare size={16} className="text-[#dc0000]" /> : <Square size={16} className="text-zinc-400" />}
                                            <span>{opt.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section 5: Technical Capabilities */}
                    <div className="mb-6">
                        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2.5">
                            5. Technical Capabilities & Features
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {CAPABILITY_TOGGLES.map(cap => {
                                const checked = !form[cap.field];
                                return (
                                    <button
                                        type="button"
                                        key={cap.field}
                                        onClick={() => setForm({ ...form, [cap.field]: !checked })}
                                        className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium cursor-pointer transition-colors border text-left ${
                                            checked 
                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200' 
                                                : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {checked ? <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" /> : <Square size={16} className="text-zinc-400 shrink-0" />}
                                        <div>
                                            <div className="font-semibold">{cap.label}</div>
                                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{cap.group}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex gap-2.5 justify-end border-t border-zinc-200 dark:border-zinc-800 pt-4">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="px-5 py-2 bg-[#dc0000] hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                        >
                            {loading ? 'Saving...' : editingMachineId ? 'Update Machine & Capabilities' : 'Create Machine & Capabilities'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
