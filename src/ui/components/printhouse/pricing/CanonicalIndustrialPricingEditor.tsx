/**
 * src/ui/components/printhouse/pricing/CanonicalIndustrialPricingEditor.tsx
 *
 * Phase 192 RC20B — Canonical Industrial Pricing Editor Component
 *
 * Shared between Printhouses back-office administration and Guided Setup Onboarding.
 * Edits the exact printer_nodes.rates_json schema consumed by the quote engine.
 */
import React, { useState, useEffect } from 'react';
import { 
    SIG_KEYS, COLOUR_KEYS, SECTIONS, COUNTRIES, BINDING_CONFIGS, 
    BindingKey, PrinthouseRates, BySection, ByColour, BySignature, EMPTY_RATES, emptyBySection 
} from '../../../pages/os/PrinthousesPage';
import { 
    SUGGESTED_RATES_METADATA, BINDING_TS_STEP_MEANS, COMMON_OPERATIONAL_CONFIG 
} from './printhouseSuggestedRates';
import { 
    Tag, CheckCircle2, Info, AlertTriangle, Sparkles, Check, ChevronRight, RefreshCw, X 
} from 'lucide-react';
import { CountrySelect } from '../../common/CountrySelect';
import { getCountryDisplayName } from '../../../lib/countryCatalog';

export const HISTORICAL_TRANSPORT_SUGGESTIONS: Record<string, number> = {
    es: 0.95,
    be: 1.145,
    nl: 1.189,
    de: 1.165,
    fr: 1.178,
    at: 1.225
};

export type FormTab = 'Basic' | 'Operational' | 'Interior' | 'Cover & Endpapers' | 'Lamination & UV' | 'Binding' | 'Paper Costs' | 'Transport';
const FORM_TABS: FormTab[] = ['Basic', 'Operational', 'Interior', 'Cover & Endpapers', 'Lamination & UV', 'Binding', 'Paper Costs', 'Transport'];

interface CanonicalIndustrialPricingEditorProps {
    mode?: 'ONBOARDING' | 'ADMIN';
    initialNodeData?: {
        id?: string;
        name?: string;
        country?: string;
        city?: string;
        status?: string;
        signatures?: number[];
        delivery_time?: string;
        production_lead_days?: number;
        limits?: { min_copies: number; max_pages: number };
        rates?: PrinthouseRates | null;
        region?: string;
        latitude?: number;
        longitude?: number;
        timezone?: string;
        address_line?: string;
    };
    onSave: (payload: any) => Promise<void>;
    saving?: boolean;
}

// Helper to create fully hydrated initial rates with historical starting values for unconfigured nodes
export function getInitialHydratedRates(persistedRates?: PrinthouseRates | null): PrinthouseRates {
    // Start with empty baseline
    const base: PrinthouseRates = {
        interior_one_colour_fixed: { '32p': 0, '24p': 0, '16p': 0, '12p': 0, '8p': 0, '4p': 0 },
        interior_one_colour_var: { '32p': 0, '24p': 0, '16p': 0, '12p': 0, '8p': 0, '4p': 0 },
        interior_two_colour_fixed: { '32p': 0, '24p': 0, '16p': 0, '12p': 0, '8p': 0, '4p': 0 },
        interior_two_colour_var: { '32p': 0, '24p': 0, '16p': 0, '12p': 0, '8p': 0, '4p': 0 },
        interior_full_colour_fixed: { '32p': 0, '24p': 0, '16p': 0, '12p': 0, '8p': 0, '4p': 0 },
        interior_full_colour_var: { '32p': 0, '24p': 0, '16p': 0, '12p': 0, '8p': 0, '4p': 0 },
        pms_interior_fixed: 0,
        cover_fixed_by_colours: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        cover_var_per_1000_by_colours: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        pms_cover: { fixed: 0, var: 0 },
        lam_fixed: { varnish: 0, gloss: 0, matt: 0 },
        lam_var_per_1000: { varnish: 0, gloss: 0, matt: 0 },
        uv_varnish: { fixed: 0, var: 0 },
        endpaper_fixed_by_colours: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        endpaper_var_per_1000_by_colours: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        binding_pb_fixed_by_sections: emptyBySection(), binding_pb_var_per_1000_by_sections: emptyBySection(),
        binding_ss_fixed_by_sections: emptyBySection(), binding_ss_var_per_1000_by_sections: emptyBySection(),
        binding_ts_fixed_by_sections: emptyBySection(), binding_ts_var_per_1000_by_sections: emptyBySection(),
        binding_hc_fixed_by_sections: emptyBySection(), binding_hc_var_per_1000_by_sections: emptyBySection(),
        binding_wo_fixed_by_sections: emptyBySection(), binding_wo_var_per_1000_by_sections: emptyBySection(),
        binding_sp_fixed_by_sections: emptyBySection(), binding_sp_var_per_1000_by_sections: emptyBySection(),
        paper_interior_fixed_by_colours: { one: 0, two: 0, full: 0 },
        paper_interior_var_per_1000_by_colours: { one: 0, two: 0, full: 0 },
        paper_cover_fixed_by_colours: { one: 0, two: 0, full: 0 },
        paper_cover_var_per_1000_by_colours: { one: 0, two: 0, full: 0 },
        paper_endpapers_fixed_by_colours: { one: 0, two: 0, full: 0 },
        paper_endpapers_var_per_1000_by_colours: { one: 0, two: 0, full: 0 },
        paper_waste_for_binding: { pb: 0, ss: 0, sc: 0, hc: 0, wo: 0, sp: 0 },
        paper_price_interior_by_kilo: { offset: 0, mc: 0, lux: 0, munken: 0, other: 0 },
        paper_price_cover_by_kilo: { mc: 0, artboard: 0, offset: 0, wfmc: 0, other: 0 },
        paper_price_endpaper_by_kilo: { offset: 0, mc: 0, other: 0 },
        technical_costs_for_transport: false,
        additional_transport_multiplier: 1,
        percentage_technical_costs: { belgium: 0, netherlands: 0, finland: 0, hungary: 0, poland: 0 },
        transport_costs: { es: 0.95, be: 1.145, nl: 1.189, de: 1.165, fr: 1.178, at: 1.225 }
    };

    // Pre-populate exact supported historical starting values
    base.lam_fixed.gloss = 6.0;
    base.lam_fixed.matt = 6.0;
    base.lam_var_per_1000.gloss = 25.0;
    base.lam_var_per_1000.matt = 25.0;

    base.cover_fixed_by_colours['1'] = 40.0;
    base.cover_var_per_1000_by_colours['1'] = 8.0;
    base.cover_fixed_by_colours['4'] = 66.0;
    base.cover_var_per_1000_by_colours['4'] = 12.5;

    // Perfect Bound historical defaults (fixed 0.164 €/book, var 0.0147 €/section)
    SECTIONS.forEach(s => {
        const secNum = parseInt(s, 10) || 1;
        base.binding_pb_fixed_by_sections[s] = 0.164;
        base.binding_pb_var_per_1000_by_sections[s] = parseFloat((0.0147 * secNum * 1000).toFixed(2));
    });

    // Wire-O historical default (0.282 €/book)
    SECTIONS.forEach(s => {
        base.binding_wo_fixed_by_sections[s] = 0.282;
    });

    // Saddle stitch historical default (0.12 €/book)
    SECTIONS.forEach(s => {
        base.binding_ss_fixed_by_sections[s] = 0.12;
    });

    // Hardcover historical default (1.25 €/book)
    SECTIONS.forEach(s => {
        base.binding_hc_fixed_by_sections[s] = 1.25;
    });

    // Thread Sewn fixed base (59.85 €) and step matrix for steps 4 to 24
    SECTIONS.forEach(s => {
        const secNum = parseInt(s, 10);
        base.binding_ts_fixed_by_sections[s] = 59.85;
        if (BINDING_TS_STEP_MEANS[secNum]) {
            base.binding_ts_var_per_1000_by_sections[s] = BINDING_TS_STEP_MEANS[secNum];
        }
    });

    if (persistedRates && Object.keys(persistedRates).length > 0) {
        // Overlay persisted rates so saved values (including explicit 0) always win
        return {
            ...base,
            ...persistedRates,
            interior_one_colour_fixed: { ...base.interior_one_colour_fixed, ...persistedRates.interior_one_colour_fixed },
            interior_one_colour_var: { ...base.interior_one_colour_var, ...persistedRates.interior_one_colour_var },
            interior_two_colour_fixed: { ...base.interior_two_colour_fixed, ...persistedRates.interior_two_colour_fixed },
            interior_two_colour_var: { ...base.interior_two_colour_var, ...persistedRates.interior_two_colour_var },
            interior_full_colour_fixed: { ...base.interior_full_colour_fixed, ...persistedRates.interior_full_colour_fixed },
            interior_full_colour_var: { ...base.interior_full_colour_var, ...persistedRates.interior_full_colour_var },
            cover_fixed_by_colours: { ...base.cover_fixed_by_colours, ...persistedRates.cover_fixed_by_colours },
            cover_var_per_1000_by_colours: { ...base.cover_var_per_1000_by_colours, ...persistedRates.cover_var_per_1000_by_colours },
            lam_fixed: { ...base.lam_fixed, ...persistedRates.lam_fixed },
            lam_var_per_1000: { ...base.lam_var_per_1000, ...persistedRates.lam_var_per_1000 },
            uv_varnish: { ...base.uv_varnish, ...persistedRates.uv_varnish },
            endpaper_fixed_by_colours: { ...base.endpaper_fixed_by_colours, ...persistedRates.endpaper_fixed_by_colours },
            endpaper_var_per_1000_by_colours: { ...base.endpaper_var_per_1000_by_colours, ...persistedRates.endpaper_var_per_1000_by_colours },
            binding_pb_fixed_by_sections: { ...base.binding_pb_fixed_by_sections, ...persistedRates.binding_pb_fixed_by_sections },
            binding_pb_var_per_1000_by_sections: { ...base.binding_pb_var_per_1000_by_sections, ...persistedRates.binding_pb_var_per_1000_by_sections },
            binding_ss_fixed_by_sections: { ...base.binding_ss_fixed_by_sections, ...persistedRates.binding_ss_fixed_by_sections },
            binding_ss_var_per_1000_by_sections: { ...base.binding_ss_var_per_1000_by_sections, ...persistedRates.binding_ss_var_per_1000_by_sections },
            binding_ts_fixed_by_sections: { ...base.binding_ts_fixed_by_sections, ...persistedRates.binding_ts_fixed_by_sections },
            binding_ts_var_per_1000_by_sections: { ...base.binding_ts_var_per_1000_by_sections, ...persistedRates.binding_ts_var_per_1000_by_sections },
            binding_hc_fixed_by_sections: { ...base.binding_hc_fixed_by_sections, ...persistedRates.binding_hc_fixed_by_sections },
            binding_hc_var_per_1000_by_sections: { ...base.binding_hc_var_per_1000_by_sections, ...persistedRates.binding_hc_var_per_1000_by_sections },
            binding_wo_fixed_by_sections: { ...base.binding_wo_fixed_by_sections, ...persistedRates.binding_wo_fixed_by_sections },
            binding_wo_var_per_1000_by_sections: { ...base.binding_wo_var_per_1000_by_sections, ...persistedRates.binding_wo_var_per_1000_by_sections },
            binding_sp_fixed_by_sections: { ...base.binding_sp_fixed_by_sections, ...persistedRates.binding_sp_fixed_by_sections },
            binding_sp_var_per_1000_by_sections: { ...base.binding_sp_var_per_1000_by_sections, ...persistedRates.binding_sp_var_per_1000_by_sections },
            paper_price_interior_by_kilo: { ...base.paper_price_interior_by_kilo, ...persistedRates.paper_price_interior_by_kilo },
            paper_price_cover_by_kilo: { ...base.paper_price_cover_by_kilo, ...persistedRates.paper_price_cover_by_kilo },
            paper_price_endpaper_by_kilo: { ...base.paper_price_endpaper_by_kilo, ...persistedRates.paper_price_endpaper_by_kilo },
            transport_costs: { ...base.transport_costs, ...persistedRates.transport_costs }
        };
    }

    return base;
}

export const CanonicalIndustrialPricingEditor: React.FC<CanonicalIndustrialPricingEditorProps> = ({
    mode = 'ONBOARDING',
    initialNodeData,
    onSave,
    saving = false
}) => {
    const [tab, setTab] = useState<FormTab>('Basic');
    const [bindingTab, setBindingTab] = useState<BindingKey>('pb');
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Determines if rates_json is genuinely configured or empty
    const isUnconfigured = !initialNodeData?.rates || Object.keys(initialNodeData.rates).length === 0;

    const [form, setForm] = useState({
        id: initialNodeData?.id || '',
        name: initialNodeData?.name || '',
        country: initialNodeData?.country || '',
        city: initialNodeData?.city || '',
        status: initialNodeData?.status || 'Active',
        signatures: initialNodeData?.signatures || [16],
        delivery_time: initialNodeData?.delivery_time || '14 days',
        production_lead_days: initialNodeData?.production_lead_days || 11,
        limits: initialNodeData?.limits || { min_copies: 50, max_pages: 1500 },
        rates: getInitialHydratedRates(initialNodeData?.rates),
        region: initialNodeData?.region || '',
        latitude: initialNodeData?.latitude || 0,
        longitude: initialNodeData?.longitude || 0,
        timezone: initialNodeData?.timezone || 'UTC',
        address_line: initialNodeData?.address_line || ''
    });

    const [selectedCountryToAdd, setSelectedCountryToAdd] = useState('ES');

    useEffect(() => {
        if (initialNodeData) {
            setForm({
                id: initialNodeData.id || '',
                name: initialNodeData.name || '',
                country: initialNodeData.country || '',
                city: initialNodeData.city || '',
                status: initialNodeData.status || 'Active',
                signatures: initialNodeData.signatures || [16],
                delivery_time: initialNodeData.delivery_time || '14 days',
                production_lead_days: initialNodeData.production_lead_days || 11,
                limits: initialNodeData.limits || { min_copies: 50, max_pages: 1500 },
                rates: getInitialHydratedRates(initialNodeData.rates),
                region: initialNodeData.region || '',
                latitude: initialNodeData.latitude || 0,
                longitude: initialNodeData.longitude || 0,
                timezone: initialNodeData.timezone || 'UTC',
                address_line: initialNodeData.address_line || ''
            });
        }
    }, [initialNodeData]);

    const setRates = (updater: (r: PrinthouseRates) => PrinthouseRates) =>
        setForm(f => ({ ...f, rates: updater(f.rates) }));

    const setRateField = (key: keyof PrinthouseRates, subKey: string, val: number) =>
        setRates(r => ({ ...r, [key]: { ...(r[key] as any), [subKey]: val } }));

    const applySuggestedValue = (key: keyof PrinthouseRates, subKey: string, val: number) => {
        setRateField(key, subKey, val);
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSuccessMessage(null);
        setErrorMessage(null);
        try {
            await onSave(form);
            setSuccessMessage('Industrial pricing configuration saved successfully.');
        } catch (err: any) {
            setErrorMessage(err.message || 'Failed to save industrial pricing.');
        }
    };

    // Styling constants
    const inputClass = "w-full bg-white border border-zinc-300 rounded-md px-3 py-1.5 text-sm font-mono text-zinc-900 focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 mb-1";

    const renderSuggestedBadge = (metaKey: string, onApply?: () => void) => {
        if (mode !== 'ONBOARDING') return null;
        const meta = SUGGESTED_RATES_METADATA[metaKey];
        if (!meta) {
            return (
                <div className="mt-1 text-[11px] text-zinc-400 italic">
                    Not suggested yet
                </div>
            );
        }

        const isLowSample = meta.sampleSize === 3;

        return (
            <div className="mt-1 flex items-center justify-between text-[11px] bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1 rounded">
                <div>
                    <span className="font-semibold">{isLowSample ? 'Suggested · low sample' : 'Suggested starting value'}</span>
                    <span className="text-amber-700 ml-1">· Historical reference ({isLowSample ? 'n=3' : `n=${meta.sampleSize}`})</span>
                </div>
                {onApply && (
                    <button 
                        type="button" 
                        onClick={onApply}
                        className="text-[10px] font-bold uppercase tracking-wider text-amber-800 hover:text-amber-950 underline ml-2"
                    >
                        Apply
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            {/* Header / Intro */}
            <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Tag className="text-[#dc0000] w-5 h-5" />
                        <h2 className="text-lg font-bold text-zinc-900">
                            {mode === 'ONBOARDING' ? 'Industrial Manufacturing Cost & Rate Cards' : 'Printhouse Pricing Configuration'}
                        </h2>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                        Configure exact production rate cards consumed by the PrintPrice OS quote engine.
                    </p>
                </div>
                {isUnconfigured && mode === 'ONBOARDING' && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-semibold">
                        <Sparkles size={14} className="text-amber-600 animate-pulse" />
                        <span>Historical starting values available for review</span>
                    </div>
                )}
            </div>

            {/* Alert Messages */}
            {successMessage && (
                <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center gap-2 font-medium">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>{successMessage}</span>
                </div>
            )}
            {errorMessage && (
                <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-900 rounded-lg text-xs flex items-center gap-2 font-medium">
                    <AlertTriangle size={16} className="text-red-600" />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex border-b border-zinc-200 px-6 bg-zinc-50 overflow-x-auto">
                {FORM_TABS.map(t => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
                            tab === t 
                                ? 'border-[#dc0000] text-[#dc0000] bg-white' 
                                : 'border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/50'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Form Content */}
            <form onSubmit={handleFormSubmit} className="p-6">
                {/* ── 1. BASIC ── */}
                {tab === 'Basic' && (
                    <div className="space-y-6 max-w-2xl">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Printhouse Node Slug</label>
                                <input 
                                    type="text" 
                                    value={form.id} 
                                    disabled={mode === 'ONBOARDING'}
                                    onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                                    className={`${inputClass} disabled:bg-zinc-100 disabled:text-zinc-500`} 
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Printhouse Legal/Trade Name</label>
                                <input 
                                    type="text" 
                                    value={form.name} 
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    className={inputClass} 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className={labelClass}>Standard Signatures</label>
                                <div className="flex gap-2 mt-1">
                                    {([32, 24, 16, 8] as const).map(sig => {
                                        const active = form.signatures.includes(sig);
                                        return (
                                            <button
                                                key={sig}
                                                type="button"
                                                onClick={() => {
                                                    setForm(f => ({
                                                        ...f,
                                                        signatures: active 
                                                            ? f.signatures.filter(s => s !== sig) 
                                                            : [...f.signatures, sig]
                                                    }));
                                                }}
                                                className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider border transition-colors ${
                                                    active 
                                                        ? 'bg-zinc-900 text-white border-zinc-900' 
                                                        : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400'
                                                }`}
                                            >
                                                {sig}p
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="mt-1 text-[10px] text-zinc-500">
                                    {COMMON_OPERATIONAL_CONFIG.signatures.label}
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Delivery Time (Days/Text)</label>
                                <input 
                                    type="text" 
                                    value={form.delivery_time}
                                    onChange={e => setForm(f => ({ ...f, delivery_time: e.target.value }))}
                                    className={inputClass} 
                                />
                                <div className="mt-1 text-[10px] text-zinc-500">
                                    {COMMON_OPERATIONAL_CONFIG.deliveryTime.label}
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Production Lead Days</label>
                                <input 
                                    type="number" 
                                    min={1} 
                                    value={form.production_lead_days}
                                    onChange={e => setForm(f => ({ ...f, production_lead_days: parseInt(e.target.value, 10) || 0 }))}
                                    className={inputClass} 
                                />
                                <div className="mt-1 text-[10px] text-zinc-500">
                                    {COMMON_OPERATIONAL_CONFIG.productionLeadDays.label}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Min Copies per Run</label>
                                <input 
                                    type="number" 
                                    min={1} 
                                    value={form.limits.min_copies}
                                    onChange={e => setForm(f => ({ ...f, limits: { ...f.limits, min_copies: parseInt(e.target.value, 10) || 0 } }))}
                                    className={inputClass} 
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Max Book Pages</label>
                                <input 
                                    type="number" 
                                    min={1} 
                                    value={form.limits.max_pages}
                                    onChange={e => setForm(f => ({ ...f, limits: { ...f.limits, max_pages: parseInt(e.target.value, 10) || 0 } }))}
                                    className={inputClass} 
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* ── 2. OPERATIONAL ── */}
                {tab === 'Operational' && (
                    <div className="space-y-6 max-w-2xl">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Minimum Order Threshold (€)</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={form.rates.min_order || 95}
                                    onChange={e => setRates(r => ({ ...r, min_order: parseFloat(e.target.value) || 0 }))}
                                    className={inputClass} 
                                />
                                {renderSuggestedBadge('min_order', () => setRates(r => ({ ...r, min_order: 95.0 })))}
                            </div>
                            <div>
                                <label className={labelClass}>Fixed Machine Setup Fee (€)</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={form.rates.setup_fixed || 42}
                                    onChange={e => setRates(r => ({ ...r, setup_fixed: parseFloat(e.target.value) || 0 }))}
                                    className={inputClass} 
                                />
                                {renderSuggestedBadge('setup_fixed', () => setRates(r => ({ ...r, setup_fixed: 42.0 })))}
                            </div>
                        </div>
                        <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
                            <p className="text-xs text-zinc-600 leading-relaxed">
                                Operational thresholds establish minimum billing limits for custom bookbinding jobs before volume tier discounts apply.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── 3. INTERIOR ── */}
                {tab === 'Interior' && (
                    <div className="space-y-8">
                        <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-400">
                            Configure base plate setup (Fixed) and run rate per 1,000 sheets (Variable) for supported signature formats.
                        </div>

                        {([
                            {
                                label: '1 Colour (1/1)',
                                fixedKey: 'interior_one_colour_fixed',
                                varKey: 'interior_one_colour_var',
                                fixedSuggestKey: 'interior_11_fixed',
                                varSuggestKey: 'interior_11_var',
                                defFixed: 80.31,
                                defVar: 8.12,
                                sampleText: 'Historical reference · n=13'
                            },
                            {
                                label: '2 Colour (2/2)',
                                fixedKey: 'interior_two_colour_fixed',
                                varKey: 'interior_two_colour_var'
                            },
                            {
                                label: 'Full Colour (4/4 CMYK)',
                                fixedKey: 'interior_full_colour_fixed',
                                varKey: 'interior_full_colour_var',
                                fixedSuggestKey: 'interior_44_fixed',
                                varSuggestKey: 'interior_44_var',
                                defFixed: 120.0,
                                defVar: 18.0,
                                sampleText: 'Historical reference · n=3 · Low sample'
                            }
                        ] as const).map(({ label, fixedKey, varKey, fixedSuggestKey, defFixed, defVar, sampleText }) => (
                            <div key={label} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-white dark:bg-zinc-900 transition-colors">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{label}</h3>
                                </div>

                                {fixedSuggestKey && (
                                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-200">
                                        <div>
                                            <span className="font-bold block text-amber-900 dark:text-amber-100 mb-0.5">Suggested starting baseline</span>
                                            <span className="mr-3">Fixed setup: <strong className="font-mono">€{defFixed?.toFixed(2)}</strong></span>
                                            <span>Variable /1000: <strong className="font-mono">€{defVar?.toFixed(2)}</strong></span>
                                            <span className="text-[11px] opacity-75 ml-3">({sampleText})</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                SIG_KEYS.forEach(k => {
                                                    setRateField(fixedKey as keyof PrinthouseRates, k, defFixed || 0);
                                                    setRateField(varKey as keyof PrinthouseRates, k, defVar || 0);
                                                });
                                            }}
                                            className="px-3 py-1.5 bg-[#dc0000] hover:bg-red-700 text-white font-semibold rounded text-xs transition-colors shrink-0 shadow-xs cursor-pointer"
                                        >
                                            Apply baseline to supported signatures
                                        </button>
                                    </div>
                                )}

                                <div className="overflow-x-auto">
                                    <table className="text-xs border-collapse min-w-full">
                                        <thead>
                                            <tr>
                                                <th className="text-left text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase pb-2 w-28">Type</th>
                                                {SIG_KEYS.map(k => (
                                                    <th key={k} className="text-center text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase pb-2 px-2 min-w-[90px]">
                                                        {k}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(['Fixed Setup (€)', 'Variable /1000 (€)'] as const).map((rowLabel, ri) => {
                                                const key = ri === 0 ? fixedKey : varKey;
                                                return (
                                                    <tr key={rowLabel} className="border-t border-zinc-100 dark:border-zinc-800">
                                                        <td className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 py-2 pr-3">{rowLabel}</td>
                                                        {SIG_KEYS.map(k => {
                                                            const rawVal = (form.rates[key] as any)?.[k];
                                                            const displayVal = (rawVal === undefined || rawVal === null || rawVal === '') 
                                                                ? '' 
                                                                : rawVal === 0 
                                                                    ? (initialNodeData?.rates ? '0' : '') 
                                                                    : rawVal;
                                                            return (
                                                                <td key={k} className="px-1 py-1">
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        placeholder="—"
                                                                        value={displayVal}
                                                                        onChange={e => {
                                                                            const v = e.target.value === '' ? null : (parseFloat(e.target.value) || 0);
                                                                            setRateField(key as keyof PrinthouseRates, k, v);
                                                                        }}
                                                                        className={inputClass}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── 4. COVER & ENDPAPERS ── */}
                {tab === 'Cover & Endpapers' && (
                    <div className="space-y-8">
                        {([
                            { label: 'Cover Printing', fixedKey: 'cover_fixed_by_colours', varKey: 'cover_var_per_1000_by_colours', hasSuggest: true },
                            { label: 'Endpaper Printing', fixedKey: 'endpaper_fixed_by_colours', varKey: 'endpaper_var_per_1000_by_colours', hasSuggest: false }
                        ] as const).map(({ label, fixedKey, varKey, hasSuggest }) => (
                            <div key={label} className="border border-zinc-200 rounded-lg p-4 bg-white">
                                <h3 className="text-sm font-bold text-zinc-900 mb-3">{label}</h3>
                                <div className="overflow-x-auto">
                                    <table className="text-xs border-collapse min-w-full">
                                        <thead>
                                            <tr>
                                                <th className="text-left text-[11px] font-bold text-zinc-500 uppercase pb-2 w-28">Type</th>
                                                {COLOUR_KEYS.map(k => (
                                                    <th key={k} className="text-center text-[11px] font-bold text-zinc-500 uppercase pb-2 px-2 min-w-[90px]">
                                                        {k} colour{k !== '1' ? 's' : ''}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(['Fixed (€)', 'Variable /1000 (€)'] as const).map((rowLabel, ri) => {
                                                const key = ri === 0 ? fixedKey : varKey;
                                                return (
                                                    <tr key={rowLabel} className="border-t border-zinc-100">
                                                        <td className="text-xs font-semibold text-zinc-700 py-2 pr-3">{rowLabel}</td>
                                                        {COLOUR_KEYS.map(k => (
                                                            <td key={k} className="px-1 py-1">
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    value={(form.rates[key] as any)[k] ?? 0}
                                                                    onChange={e => setRateField(key as keyof PrinthouseRates, k, parseFloat(e.target.value) || 0)}
                                                                    className={inputClass}
                                                                />
                                                            </td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {hasSuggest && (
                                    <div className="mt-3 text-xs text-zinc-500 flex gap-4">
                                        <span>Suggested 1-col: 40 € / 8 € (n=3)</span>
                                        <span>Suggested 4-col: 66 € / 12.50 € (n=3)</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── 5. LAMINATION & UV ── */}
                {tab === 'Lamination & UV' && (
                    <div className="space-y-6 max-w-2xl">
                        {([
                            { label: 'Lamination — Fixed Setup (€)', key: 'lam_fixed', suggestGloss: 6.0, suggestMatt: 6.0 },
                            { label: 'Lamination — Variable /1000 sheets (€)', key: 'lam_var_per_1000', suggestGloss: 25.0, suggestMatt: 25.0 }
                        ] as const).map(({ label, key, suggestGloss, suggestMatt }) => (
                            <div key={key} className="border border-zinc-200 rounded-lg p-4 bg-white">
                                <h3 className="text-sm font-bold text-zinc-900 mb-3">{label}</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    {(['varnish', 'gloss', 'matt'] as const).map(k => (
                                        <div key={k}>
                                            <label className={labelClass}>{k.toUpperCase()}</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={form.rates[key][k] ?? 0}
                                                onChange={e => setRates(r => ({ ...r, [key]: { ...r[key], [k]: parseFloat(e.target.value) || 0 } }))}
                                                className={inputClass}
                                            />
                                            {k !== 'varnish' && (
                                                <div className="mt-1 text-[10px] text-zinc-400">
                                                    Suggested: {k === 'gloss' ? suggestGloss : suggestMatt} € (n=3)
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="border border-zinc-200 rounded-lg p-4 bg-white">
                            <h3 className="text-sm font-bold text-zinc-900 mb-3">UV Varnish</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>UV Fixed (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={form.rates.uv_varnish?.fixed ?? 0}
                                        onChange={e => setRates(r => ({ ...r, uv_varnish: { ...r.uv_varnish, fixed: parseFloat(e.target.value) || 0 } }))}
                                        className={inputClass}
                                    />
                                    <div className="mt-1 text-[10px] text-zinc-400 italic">Not suggested yet</div>
                                </div>
                                <div>
                                    <label className={labelClass}>UV Variable /1000 (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={form.rates.uv_varnish?.var ?? 0}
                                        onChange={e => setRates(r => ({ ...r, uv_varnish: { ...r.uv_varnish, var: parseFloat(e.target.value) || 0 } }))}
                                        className={inputClass}
                                    />
                                    <div className="mt-1 text-[10px] text-zinc-400 italic">Not suggested yet</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── 6. BINDING ── */}
                {tab === 'Binding' && (
                    <div className="space-y-4">
                        <div className="flex gap-2 flex-wrap">
                            {BINDING_CONFIGS.map(b => (
                                <button
                                    key={b.key}
                                    type="button"
                                    onClick={() => setBindingTab(b.key)}
                                    className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
                                        bindingTab === b.key
                                            ? 'bg-zinc-900 text-white'
                                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                    }`}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>

                        {BINDING_CONFIGS.filter(b => b.key === bindingTab).map(b => {
                            const fk = `binding_${b.key}_fixed_by_sections` as keyof PrinthouseRates;
                            const vk = `binding_${b.key}_var_per_1000_by_sections` as keyof PrinthouseRates;
                            return (
                                <div key={b.key} className="border border-zinc-200 rounded-lg p-4 bg-white">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-bold text-zinc-900">{b.label} Costs by Section</h3>
                                        {b.key === 'ts' && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    Object.entries(BINDING_TS_STEP_MEANS).forEach(([step, meanVal]) => {
                                                        setRateField('binding_ts_var_per_1000_by_sections', step, meanVal);
                                                    });
                                                }}
                                                className="text-xs font-semibold text-[#dc0000] hover:underline"
                                            >
                                                Apply Thread Sewn Section Step Means (4-24)
                                            </button>
                                        )}
                                    </div>
                                    <div className="overflow-x-auto max-h-96">
                                        <table className="text-xs border-collapse w-full max-w-lg">
                                            <thead className="sticky top-0 bg-zinc-50 z-10 border-b border-zinc-200">
                                                <tr>
                                                    <th className="text-left text-[11px] font-bold text-zinc-500 uppercase py-2 w-20">Sections</th>
                                                    <th className="text-[11px] font-bold text-zinc-500 uppercase py-2 px-2 min-w-[120px]">Fixed Setup (€)</th>
                                                    <th className="text-[11px] font-bold text-zinc-500 uppercase py-2 px-2 min-w-[120px]">Variable /1000 (€)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {SECTIONS.map(s => (
                                                    <tr key={s} className="border-t border-zinc-100">
                                                        <td className="text-xs font-bold text-zinc-600 py-1.5 pr-3">{s} sec</td>
                                                        <td className="px-1 py-1">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={(form.rates[fk] as BySection)[s] ?? 0}
                                                                onChange={e => setRateField(fk, s, parseFloat(e.target.value) || 0)}
                                                                className={inputClass}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-1">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={(form.rates[vk] as BySection)[s] ?? 0}
                                                                onChange={e => setRateField(vk, s, parseFloat(e.target.value) || 0)}
                                                                className={inputClass}
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── 7. PAPER COSTS ── */}
                {tab === 'Paper Costs' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-white dark:bg-zinc-900 transition-colors">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Interior Paper Costs (€/kg)</h3>
                                </div>
                                
                                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-200">
                                    <div>
                                        <span className="font-bold block text-amber-900 dark:text-amber-100 mb-0.5">Generic historical baseline</span>
                                        <span className="font-mono text-sm font-bold">€1.252 / kg</span>
                                        <span className="text-[11px] opacity-75 block mt-0.5">Historical reference · n=13 · Not grade-specific</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const updated = { ...form.rates.paper_price_interior_by_kilo };
                                            (['offset', 'mc', 'lux', 'munken', 'other'] as const).forEach(g => {
                                                updated[g] = 1.252;
                                            });
                                            setRates(r => ({ ...r, paper_price_interior_by_kilo: updated }));
                                        }}
                                        className="px-3 py-1.5 bg-[#dc0000] hover:bg-red-700 text-white font-semibold rounded text-xs transition-colors shrink-0 shadow-xs cursor-pointer"
                                    >
                                        Apply generic baseline
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {(['offset', 'mc', 'lux', 'munken', 'other'] as const).map(grade => {
                                        const rawVal = form.rates.paper_price_interior_by_kilo?.[grade];
                                        const displayVal = (rawVal === undefined || rawVal === null || rawVal === '')
                                            ? ''
                                            : rawVal === 0
                                                ? (initialNodeData?.rates ? '0' : '')
                                                : rawVal;
                                        return (
                                            <div key={grade}>
                                                <label className={labelClass}>{grade.toUpperCase()}</label>
                                                <input
                                                    type="number"
                                                    step="0.001"
                                                    placeholder="—"
                                                    value={displayVal}
                                                    onChange={e => {
                                                        const val = e.target.value === '' ? null : (parseFloat(e.target.value) || 0);
                                                        setRates(r => ({
                                                            ...r,
                                                            paper_price_interior_by_kilo: {
                                                                ...r.paper_price_interior_by_kilo,
                                                                [grade]: val
                                                            }
                                                        }));
                                                    }}
                                                    className={inputClass}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-white dark:bg-zinc-900 transition-colors">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Cover Paper Costs (€/kg)</h3>
                                </div>

                                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-200">
                                    <div>
                                        <span className="font-bold block text-amber-900 dark:text-amber-100 mb-0.5">Generic historical baseline</span>
                                        <span className="font-mono text-sm font-bold">€2.515 / kg</span>
                                        <span className="text-[11px] opacity-75 block mt-0.5">Historical reference · n=13 · Not grade-specific</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const updated = { ...form.rates.paper_price_cover_by_kilo };
                                            (['mc', 'artboard', 'offset', 'wfmc', 'other'] as const).forEach(g => {
                                                updated[g] = 2.515;
                                            });
                                            setRates(r => ({ ...r, paper_price_cover_by_kilo: updated }));
                                        }}
                                        className="px-3 py-1.5 bg-[#dc0000] hover:bg-red-700 text-white font-semibold rounded text-xs transition-colors shrink-0 shadow-xs cursor-pointer"
                                    >
                                        Apply generic baseline
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {(['mc', 'artboard', 'offset', 'wfmc', 'other'] as const).map(grade => {
                                        const rawVal = form.rates.paper_price_cover_by_kilo?.[grade];
                                        const displayVal = (rawVal === undefined || rawVal === null || rawVal === '')
                                            ? ''
                                            : rawVal === 0
                                                ? (initialNodeData?.rates ? '0' : '')
                                                : rawVal;
                                        return (
                                            <div key={grade}>
                                                <label className={labelClass}>{grade.toUpperCase()}</label>
                                                <input
                                                    type="number"
                                                    step="0.001"
                                                    placeholder="—"
                                                    value={displayVal}
                                                    onChange={e => {
                                                        const val = e.target.value === '' ? null : (parseFloat(e.target.value) || 0);
                                                        setRates(r => ({
                                                            ...r,
                                                            paper_price_cover_by_kilo: {
                                                                ...r.paper_price_cover_by_kilo,
                                                                [grade]: val
                                                            }
                                                        }));
                                                    }}
                                                    className={inputClass}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── 8. TRANSPORT ── */}
                {tab === 'Transport' && (
                    <div className="space-y-6 max-w-2xl">
                        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 bg-white dark:bg-zinc-900 shadow-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Country-Specific Shipping (€/kg)</h3>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        Configure destination transport rates per kilogram across all canonical global destinations.
                                    </p>
                                </div>
                                <div className="text-xs text-zinc-500 font-medium">
                                    {Object.keys(form.rates.transport_costs || {}).length} configured
                                </div>
                            </div>

                            {/* Add Country Control */}
                            <div className="mb-5 p-3.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl space-y-2">
                                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                    Add Destination Country Rate
                                </label>
                                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                                    <div className="flex-1">
                                        <CountrySelect
                                            value=""
                                            onChange={(code) => {
                                                if (!code) return;
                                                const lower = code.toLowerCase();
                                                const existingVal = form.rates.transport_costs?.[lower];
                                                if (existingVal !== undefined) return;
                                                const defaultSuggest = HISTORICAL_TRANSPORT_SUGGESTIONS[lower];
                                                setRates(r => ({
                                                    ...r,
                                                    transport_costs: {
                                                        ...r.transport_costs,
                                                        [lower]: defaultSuggest !== undefined ? defaultSuggest : 0
                                                    }
                                                }));
                                            }}
                                            placeholder="Search canonical catalog to add country (e.g. Poland, Sweden, Japan)..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Configured Country Rows */}
                            <div className="space-y-3">
                                {Object.keys(form.rates.transport_costs || {}).length === 0 ? (
                                    <div className="py-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                                        No country transport rates configured. Use the selector above to add countries.
                                    </div>
                                ) : (
                                    Object.entries(form.rates.transport_costs || {}).map(([rawCode, val]) => {
                                        const lowerCode = rawCode.toLowerCase();
                                        const upperCode = rawCode.toUpperCase();
                                        const displayName = getCountryDisplayName(upperCode);
                                        const hasSuggestion = HISTORICAL_TRANSPORT_SUGGESTIONS[lowerCode] !== undefined;

                                        return (
                                            <div key={lowerCode} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 bg-zinc-50/70 dark:bg-zinc-800/30 border border-zinc-200/80 dark:border-zinc-700/80 rounded-xl">
                                                <div className="sm:col-span-6">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{displayName}</span>
                                                    </div>
                                                    <div className="mt-0.5 text-[11px]">
                                                        {hasSuggestion ? (
                                                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                                                                Historical reference: {HISTORICAL_TRANSPORT_SUGGESTIONS[lowerCode].toFixed(3)} €/kg
                                                            </span>
                                                        ) : (
                                                            <span className="text-zinc-400">
                                                                Custom configured rate (no historical baseline)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="sm:col-span-5 flex items-center gap-2">
                                                    <div className="relative flex-1">
                                                        <input
                                                            type="number"
                                                            step="0.001"
                                                            min="0"
                                                            value={val === null || val === undefined ? '' : val}
                                                            onChange={e => {
                                                                const raw = e.target.value;
                                                                const parsed = raw === '' ? 0 : parseFloat(raw);
                                                                setRates(r => ({
                                                                    ...r,
                                                                    transport_costs: {
                                                                        ...r.transport_costs,
                                                                        [lowerCode]: isNaN(parsed) ? 0 : parsed
                                                                    }
                                                                }));
                                                            }}
                                                            className={inputClass}
                                                            placeholder="0.000"
                                                        />
                                                        <span className="absolute right-3 top-2 text-xs text-zinc-400 font-medium">€/kg</span>
                                                    </div>
                                                </div>
                                                <div className="sm:col-span-1 flex justify-end">
                                                    <button
                                                        type="button"
                                                        title={`Remove ${displayName}`}
                                                        onClick={() => {
                                                            setRates(r => {
                                                                const nextCosts = { ...r.transport_costs };
                                                                delete nextCosts[lowerCode];
                                                                return {
                                                                    ...r,
                                                                    transport_costs: nextCosts
                                                                };
                                                            });
                                                        }}
                                                        className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                                                    >
                                                        <X size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Bottom Actions */}
                <div className="mt-8 pt-5 border-t border-zinc-200 flex items-center justify-between">
                    <div className="text-xs text-zinc-500">
                        {mode === 'ONBOARDING' 
                            ? 'Review starting values across all 8 tabs before saving.'
                            : 'Updates are immediately effective for quote calculation.'}
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <RefreshCw size={14} className="animate-spin" />}
                        <span>Save Industrial Pricing Rates</span>
                    </button>
                </div>
            </form>
        </div>
    );
};
