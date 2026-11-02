import React from 'react';
import { CheckSquare, Square, CheckCircle } from 'lucide-react';
import { Machine } from '../../types/printhouseCapabilities';

export const CANONICAL_COLOR_MODE_OPTIONS = [
    { value: 'CMYK', label: 'CMYK Standard' },
    { value: 'CMYK+SPOT', label: 'CMYK + Spot Colors' },
    { value: 'CMYK+WHITE', label: 'CMYK + White Ink' },
    { value: 'RGB', label: 'RGB Extended' },
    { value: 'GRAYSCALE', label: 'Grayscale' },
    { value: 'MONOCHROME', label: 'Monochrome (1/0)' },
    { value: 'SPOT_ONLY', label: 'Spot Color Only' }
];

export const CANONICAL_PRINT_METHOD_OPTIONS = [
    { value: 'SHEETFED_OFFSET', label: 'Sheetfed Offset' },
    { value: 'DIGITAL_TONER', label: 'Digital Toner (Electroink)' },
    { value: 'DIGITAL_INKJET', label: 'Digital High-Speed Inkjet' },
    { value: 'WIDE_FORMAT_INKJET', label: 'Wide Format UV/Solvent Inkjet' },
    { value: 'WEB_OFFSET', label: 'Web Offset' },
    { value: 'FLEXO', label: 'Flexographic' },
    { value: 'SCREEN_PRINTING', label: 'Screen Printing' }
];

export const CANONICAL_SIDES_OPTIONS = [
    { value: 'SIMPLEX', label: 'Simplex (Single-sided)' },
    { value: 'DUPLEX', label: 'Duplex (Auto-perfecting)' }
];

export const CANONICAL_ISO_CAPABILITIES = [
    { key: 'supports_pdfx', label: 'PDF/X Compliant Rendering', group: 'Quality & Preflight' },
    { key: 'supports_pdfa', label: 'PDF/A Archival Rendering', group: 'Quality & Preflight' },
    { key: 'supports_variable_data', label: 'Variable Data Printing (VDP)', group: 'Print Capabilities' },
    { key: 'supports_white_ink', label: 'White Ink Support', group: 'Print Capabilities' },
    { key: 'supports_spot_uv', label: 'Spot UV / Varnish', group: 'Finishing & Embellishment' },
    { key: 'supports_lamination', label: 'Inline Lamination', group: 'Finishing & Embellishment' },
    { key: 'supports_saddle_stitch', label: 'Saddle Stitch Binding', group: 'Binding & Finishing' },
    { key: 'supports_perfect_binding', label: 'Perfect Binding (PUR/EVA)', group: 'Binding & Finishing' },
    { key: 'supports_case_binding', label: 'Case Binding', group: 'Binding & Finishing' },
    { key: 'supports_hardcover', label: 'Hardcover Production', group: 'Binding & Finishing' },
    { key: 'supports_softcover', label: 'Softcover Production', group: 'Binding & Finishing' }
];

export function deriveSheetFormatBadge(maxW?: number | string, maxH?: number | string): string {
    const w = Number(maxW || 0);
    const h = Number(maxH || 0);
    const maxDim = Math.max(w, h);
    const minDim = Math.min(w, h);
    if (maxDim >= 1000) return `B1 (${minDim}×${maxDim} mm)`;
    if (maxDim >= 700) return `B2 (${minDim}×${maxDim} mm)`;
    if (maxDim >= 450) return `SRA3 (${minDim}×${maxDim} mm)`;
    if (maxDim >= 420) return `A3 (${minDim}×${maxDim} mm)`;
    if (maxDim > 0) return `A4 (${minDim}×${maxDim} mm)`;
    return 'B1 / Book Block';
}

interface MachineSpecificationFormProps {
    machine: Partial<Machine>;
    onChange: (updated: Partial<Machine>) => void;
    onSubmit?: (e: React.FormEvent) => void;
    onCancel?: () => void;
    loading?: boolean;
    error?: string | null;
    searchQuery?: string;
    onSearchQueryChange?: (q: string) => void;
    templates?: any[];
    searchingTemplates?: boolean;
    showSuggestions?: boolean;
    onShowSuggestionsChange?: (show: boolean) => void;
    onSelectTemplate?: (tpl: any) => void;
}

export const MachineSpecificationForm: React.FC<MachineSpecificationFormProps> = ({
    machine,
    onChange,
    onSubmit,
    onCancel,
    loading = false,
    error = null,
    searchQuery = '',
    onSearchQueryChange,
    templates = [],
    searchingTemplates = false,
    showSuggestions = false,
    onShowSuggestionsChange,
    onSelectTemplate
}) => {
    const colorModes: string[] = Array.isArray(machine.supported_color_modes_json)
        ? machine.supported_color_modes_json
        : [];
    const printMethods: string[] = Array.isArray(machine.supported_print_methods_json)
        ? machine.supported_print_methods_json
        : [];
    const printingSides: string[] = Array.isArray(machine.supported_sides_json)
        ? machine.supported_sides_json
        : [];

    const meta = machine.metadata_json || {};
    const speedVal = machine.nominal_speed_cph ?? meta.nominal_speed_cph ?? meta.sheetsPerHour ?? 18000;
    const setupVal = machine.make_ready_minutes ?? meta.make_ready_minutes ?? meta.setupTimeMin ?? 25;
    const rateVal = machine.hourly_cost_eur ?? meta.hourly_cost_eur ?? meta.hourlyRateEur ?? 165;

    const toggleArrayField = (field: 'supported_color_modes_json' | 'supported_print_methods_json' | 'supported_sides_json', item: string) => {
        const current: string[] = Array.isArray((machine as any)[field]) ? (machine as any)[field] : [];
        const next = current.includes(item)
            ? current.filter((x) => x !== item)
            : [...current, item];
        onChange({ ...machine, [field]: next });
    };

    const detectedFormat = deriveSheetFormatBadge(machine.max_sheet_width_mm, machine.max_sheet_height_mm);

    return (
        <form onSubmit={onSubmit} className="p-6 space-y-5 overflow-y-auto flex-1" data-testid="machine-specification-form">
            {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-bold border border-red-200 dark:border-red-900/50">
                    {error}
                </div>
            )}

            {/* Quick Preset Search */}
            {!machine.id && onSearchQueryChange && (
                <div className="relative border-b border-zinc-200 dark:border-zinc-800 pb-4">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                        Quick Preset Search (Heidelberg, HP Indigo, Komori, Müller Martini...)
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Type manufacturer or model (e.g., Heidelberg, Indigo)..."
                            value={searchQuery}
                            onChange={(e) => onSearchQueryChange(e.target.value)}
                            onFocus={() => onShowSuggestionsChange?.(true)}
                            className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-[#dc0000] text-zinc-900 dark:text-zinc-100 placeholder-zinc-500"
                        />
                        {searchingTemplates && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#dc0000]" />
                            </div>
                        )}
                    </div>

                    {showSuggestions && (searchQuery.length >= 2 || (templates && templates.length > 0)) && (
                        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-zinc-950 border border-zinc-800 shadow-xl rounded-xl">
                            <div className="p-2 border-b border-zinc-800 text-[9px] font-bold text-zinc-400 uppercase tracking-wider flex justify-between items-center">
                                <span>Industrial Presets ({templates ? templates.length : 0})</span>
                                <button
                                    type="button"
                                    onClick={() => onShowSuggestionsChange?.(false)}
                                    className="text-zinc-400 hover:text-white text-[10px]"
                                >
                                    [Close]
                                </button>
                            </div>
                            {!templates || templates.length === 0 ? (
                                <div className="p-3 text-xs font-mono text-zinc-500">
                                    No presets found matching "{searchQuery}"
                                </div>
                            ) : (
                                <ul className="divide-y divide-zinc-900">
                                    {templates.map((tpl) => (
                                        <li key={tpl.id}>
                                            <button
                                                type="button"
                                                onClick={() => onSelectTemplate?.(tpl)}
                                                className="w-full text-left px-3 py-2.5 text-xs font-mono text-zinc-300 hover:text-white hover:bg-[#dc0000]/15 transition-colors flex items-center justify-between"
                                            >
                                                <span>
                                                    <span className="font-bold text-white">{tpl.manufacturer}</span>
                                                    <span className="text-zinc-500 mx-1.5">—</span>
                                                    <span>{tpl.model}</span>
                                                </span>
                                                <span className="text-[10px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 font-bold uppercase">
                                                    {tpl.machine_type}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Section 1: Machine Identification */}
            <div className="space-y-3">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    1. Machine Identification
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Machine Name *</label>
                        <input
                            type="text"
                            required
                            value={machine.machine_name || ''}
                            onChange={(e) => onChange({ ...machine, machine_name: e.target.value })}
                            placeholder="e.g., Heidelberg Speedmaster XL 106-8P (Offset B1)"
                            className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-[#dc0000] text-zinc-900 dark:text-zinc-100"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Technology / Type *</label>
                        <select
                            value={machine.machine_type || 'OFFSET'}
                            onChange={(e) => onChange({ ...machine, machine_type: e.target.value as any })}
                            className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-[#dc0000] text-zinc-900 dark:text-zinc-100"
                        >
                            <option value="OFFSET">OFFSET PRESS</option>
                            <option value="OFFSET_PRESS">OFFSET PRESS (ISO)</option>
                            <option value="DIGITAL">DIGITAL PRESS</option>
                            <option value="DIGITAL_PRESS">DIGITAL PRESS (ISO)</option>
                            <option value="LARGE_FORMAT">LARGE FORMAT</option>
                            <option value="BINDER">BINDER (PUR / CASE)</option>
                            <option value="FINISHER">FINISHER</option>
                            <option value="FLEXO">FLEXO</option>
                            <option value="SCREEN">SCREEN</option>
                            <option value="ROTARY">ROTARY / WEB</option>
                            <option value="OTHER">BINDING / FINISHING</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Operational Status *</label>
                        <select
                            value={machine.status || 'ACTIVE'}
                            onChange={(e) => onChange({ ...machine, status: e.target.value as any })}
                            className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold focus:outline-none focus:border-[#dc0000] text-zinc-900 dark:text-zinc-100"
                        >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="MAINTENANCE">MAINTENANCE</option>
                            <option value="OFFLINE">OFFLINE</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Manufacturer</label>
                        <input
                            type="text"
                            value={machine.manufacturer || ''}
                            onChange={(e) => onChange({ ...machine, manufacturer: e.target.value })}
                            placeholder="e.g., Heidelberg, HP, Komori, Müller Martini"
                            className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Model</label>
                        <input
                            type="text"
                            value={machine.model || ''}
                            onChange={(e) => onChange({ ...machine, model: e.target.value })}
                            placeholder="e.g., Speedmaster XL 106-8P"
                            className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100"
                        />
                    </div>
                </div>
            </div>

            {/* Section 2: Sheet & Print Dimensions (mm) */}
            <div className="space-y-2.5 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        2. Sheet & Print Dimensions (mm)
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-mono font-bold">
                        Detected Format: {detectedFormat}
                    </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Min Width (mm)</label>
                        <input
                            type="number"
                            value={machine.min_sheet_width_mm || ''}
                            onChange={(e) => onChange({ ...machine, min_sheet_width_mm: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Width (mm)</label>
                        <input
                            type="number"
                            value={machine.max_sheet_width_mm || ''}
                            onChange={(e) => onChange({ ...machine, max_sheet_width_mm: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Print Width (mm)</label>
                        <input
                            type="number"
                            value={machine.max_print_width_mm || ''}
                            onChange={(e) => onChange({ ...machine, max_print_width_mm: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Min Height (mm)</label>
                        <input
                            type="number"
                            value={machine.min_sheet_height_mm || ''}
                            onChange={(e) => onChange({ ...machine, min_sheet_height_mm: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Height (mm)</label>
                        <input
                            type="number"
                            value={machine.max_sheet_height_mm || ''}
                            onChange={(e) => onChange({ ...machine, max_sheet_height_mm: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Print Height (mm)</label>
                        <input
                            type="number"
                            value={machine.max_print_height_mm || ''}
                            onChange={(e) => onChange({ ...machine, max_print_height_mm: Number(e.target.value) || 0 })}
                            className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-mono"
                        />
                    </div>
                </div>
            </div>

            {/* Section 3: Supported Color Modes */}
            <div className="space-y-2.5 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    3. Supported Color Modes
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CANONICAL_COLOR_MODE_OPTIONS.map((opt) => {
                        const checked = colorModes.includes(opt.value);
                        return (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => toggleArrayField('supported_color_modes_json', opt.value)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors border text-left ${
                                    checked
                                        ? 'bg-red-50 dark:bg-red-950/40 border-[#dc0000] text-red-900 dark:text-red-200'
                                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                            >
                                {checked ? <CheckSquare size={15} className="text-[#dc0000] shrink-0" /> : <Square size={15} className="text-zinc-400 shrink-0" />}
                                <span>{opt.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Section 4: Print Methods & Printing Sides */}
            <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    4. Print Methods & Printing Sides
                </span>
                <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1.5">Print Methods</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {CANONICAL_PRINT_METHOD_OPTIONS.map((opt) => {
                            const checked = printMethods.includes(opt.value);
                            return (
                                <button
                                    type="button"
                                    key={opt.value}
                                    onClick={() => toggleArrayField('supported_print_methods_json', opt.value)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors border text-left ${
                                        checked
                                            ? 'bg-red-50 dark:bg-red-950/40 border-[#dc0000] text-red-900 dark:text-red-200'
                                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                                >
                                    {checked ? <CheckSquare size={15} className="text-[#dc0000] shrink-0" /> : <Square size={15} className="text-zinc-400 shrink-0" />}
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1.5">Printing Sides</label>
                    <div className="flex flex-wrap gap-2">
                        {CANONICAL_SIDES_OPTIONS.map((opt) => {
                            const checked = printingSides.includes(opt.value);
                            return (
                                <button
                                    type="button"
                                    key={opt.value}
                                    onClick={() => toggleArrayField('supported_sides_json', opt.value)}
                                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors border ${
                                        checked
                                            ? 'bg-red-50 dark:bg-red-950/40 border-[#dc0000] text-red-900 dark:text-red-200'
                                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                                >
                                    {checked ? <CheckSquare size={15} className="text-[#dc0000] shrink-0" /> : <Square size={15} className="text-zinc-400 shrink-0" />}
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Section 5: Industrial Throughput, Cost & Ink Limits */}
            <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    5. Industrial Throughput, Cost & Ink Density Limits
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Nominal Speed (cph / sheets/h)</label>
                        <input
                            type="number"
                            value={speedVal}
                            onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                onChange({
                                    ...machine,
                                    nominal_speed_cph: val,
                                    metadata_json: { ...(machine.metadata_json || {}), nominal_speed_cph: val, sheetsPerHour: val }
                                });
                            }}
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Make-Ready / Setup (min)</label>
                        <input
                            type="number"
                            value={setupVal}
                            onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                onChange({
                                    ...machine,
                                    make_ready_minutes: val,
                                    metadata_json: { ...(machine.metadata_json || {}), make_ready_minutes: val, setupTimeMin: val }
                                });
                            }}
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Base Hourly Cost (€/h)</label>
                        <input
                            type="number"
                            value={rateVal}
                            onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                onChange({
                                    ...machine,
                                    hourly_cost_eur: val,
                                    metadata_json: { ...(machine.metadata_json || {}), hourly_cost_eur: val, hourlyRateEur: val }
                                });
                            }}
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max TAC % (100-400)</label>
                        <input
                            type="number"
                            value={machine.max_tac_percent || ''}
                            onChange={(e) => onChange({ ...machine, max_tac_percent: e.target.value ? Number(e.target.value) || 0 : undefined })}
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Pages / Job</label>
                        <input
                            type="number"
                            value={machine.max_pages_per_job || ''}
                            onChange={(e) => onChange({ ...machine, max_pages_per_job: e.target.value ? Number(e.target.value) || 0 : undefined })}
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] font-bold text-zinc-500 uppercase mb-1">Max Archive (MB)</label>
                        <input
                            type="number"
                            value={machine.max_file_size_mb || ''}
                            onChange={(e) => onChange({ ...machine, max_file_size_mb: e.target.value ? Number(e.target.value) || 0 : undefined })}
                            className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
                        />
                    </div>
                </div>
            </div>

            {/* Section 6: ISO Standards & Inline Finishing */}
            <div className="space-y-2.5 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    6. ISO Standards & Inline Finishing
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CANONICAL_ISO_CAPABILITIES.map((cap) => {
                        const checked = !!(machine as any)[cap.key];
                        return (
                            <button
                                type="button"
                                key={cap.key}
                                onClick={() => onChange({ ...machine, [cap.key]: !checked })}
                                className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border text-left ${
                                    checked
                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                            >
                                {checked ? <CheckCircle size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" /> : <Square size={15} className="text-zinc-400 shrink-0" />}
                                <div>
                                    <div>{cap.label}</div>
                                    <div className="text-[10px] font-normal text-zinc-500">{cap.group}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 rounded-xl bg-[#dc0000] hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                >
                    {loading ? 'Saving...' : machine.id ? 'Update Machine' : 'Save Machine'}
                </button>
            </div>
        </form>
    );
};

