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
    BindingKey, PrinthouseRates, BySection, ByColour, BySignature, EMPTY_RATES 
} from '../../../pages/os/PrinthousesPage';
import { 
    SUGGESTED_RATES_METADATA, BINDING_TS_STEP_MEANS, COMMON_OPERATIONAL_CONFIG 
} from './printhouseSuggestedRates';
import { 
    Tag, CheckCircle2, Info, AlertTriangle, Sparkles, Check, ChevronRight, RefreshCw 
} from 'lucide-react';

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
        rates: initialNodeData?.rates ? { ...EMPTY_RATES, ...initialNodeData.rates } : { ...EMPTY_RATES },
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
                rates: initialNodeData.rates ? { ...EMPTY_RATES, ...initialNodeData.rates } : { ...EMPTY_RATES },
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

        return (
            <div className="mt-1 flex items-center justify-between text-[11px] bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1 rounded">
                <div>
                    <span className="font-semibold">Suggested: {meta.value} {meta.unit}</span>
                    <span className="text-amber-700 ml-1">({meta.sampleSize === 3 ? 'n=3 low-sample' : `n=${meta.sampleSize}`})</span>
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
                        <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs text-zinc-600">
                            Configure base plate setup (Fixed) and run rate per 1,000 sheets (Variable) for supported signature formats.
                        </div>

                        {([
                            { label: '1 Colour (1/1)', fixedKey: 'interior_one_colour_fixed', varKey: 'interior_one_colour_var', fixedSuggestKey: 'interior_11_fixed', varSuggestKey: 'interior_11_var', defFixed: 80.31, defVar: 8.12 },
                            { label: '2 Colour (2/2)', fixedKey: 'interior_two_colour_fixed', varKey: 'interior_two_colour_var' },
                            { label: 'Full Colour (4/4 CMYK)', fixedKey: 'interior_full_colour_fixed', varKey: 'interior_full_colour_var', fixedSuggestKey: 'interior_44_fixed', varSuggestKey: 'interior_44_var', defFixed: 120.0, defVar: 18.0 }
                        ] as const).map(({ label, fixedKey, varKey, fixedSuggestKey, varSuggestKey, defFixed, defVar }) => (
                            <div key={label} className="border border-zinc-200 rounded-lg p-4 bg-white">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-zinc-900">{label}</h3>
                                    {fixedSuggestKey && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                SIG_KEYS.forEach(k => {
                                                    setRateField(fixedKey as keyof PrinthouseRates, k, defFixed || 0);
                                                    setRateField(varKey as keyof PrinthouseRates, k, defVar || 0);
                                                });
                                            }}
                                            className="text-xs font-semibold text-[#dc0000] hover:underline"
                                        >
                                            Apply baseline to all signatures
                                        </button>
                                    )}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="text-xs border-collapse min-w-full">
                                        <thead>
                                            <tr>
                                                <th className="text-left text-[11px] font-bold text-zinc-500 uppercase pb-2 w-28">Type</th>
                                                {SIG_KEYS.map(k => (
                                                    <th key={k} className="text-center text-[11px] font-bold text-zinc-500 uppercase pb-2 px-2 min-w-[90px]">
                                                        {k}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(['Fixed Setup (€)', 'Variable /1000 (€)'] as const).map((rowLabel, ri) => {
                                                const key = ri === 0 ? fixedKey : varKey;
                                                return (
                                                    <tr key={rowLabel} className="border-t border-zinc-100">
                                                        <td className="text-xs font-semibold text-zinc-700 py-2 pr-3">{rowLabel}</td>
                                                        {SIG_KEYS.map(k => (
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
                        <div className="grid grid-cols-2 gap-6">
                            <div className="border border-zinc-200 rounded-lg p-4 bg-white">
                                <h3 className="text-sm font-bold text-zinc-900 mb-3">Interior Paper Costs (€/kg)</h3>
                                <div className="space-y-3">
                                    {(['offset', 'mc', 'lux', 'munken', 'other'] as const).map(grade => (
                                        <div key={grade}>
                                            <label className={labelClass}>{grade.toUpperCase()}</label>
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={form.rates.paper_price_interior_by_kilo?.[grade] ?? 0}
                                                onChange={e => setRates(r => ({
                                                    ...r,
                                                    paper_price_interior_by_kilo: {
                                                        ...r.paper_price_interior_by_kilo,
                                                        [grade]: parseFloat(e.target.value) || 0
                                                    }
                                                }))}
                                                className={inputClass}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 p-2 bg-amber-50 rounded text-xs text-amber-900">
                                    Generic historical baseline: 1.252 €/kg (n=13). Not grade-specific.
                                </div>
                            </div>

                            <div className="border border-zinc-200 rounded-lg p-4 bg-white">
                                <h3 className="text-sm font-bold text-zinc-900 mb-3">Cover Paper Costs (€/kg)</h3>
                                <div className="space-y-3">
                                    {(['mc', 'artboard', 'offset', 'wfmc', 'other'] as const).map(grade => (
                                        <div key={grade}>
                                            <label className={labelClass}>{grade.toUpperCase()}</label>
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={form.rates.paper_price_cover_by_kilo?.[grade] ?? 0}
                                                onChange={e => setRates(r => ({
                                                    ...r,
                                                    paper_price_cover_by_kilo: {
                                                        ...r.paper_price_cover_by_kilo,
                                                        [grade]: parseFloat(e.target.value) || 0
                                                    }
                                                }))}
                                                className={inputClass}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 p-2 bg-amber-50 rounded text-xs text-amber-900">
                                    Generic historical baseline: 2.515 €/kg (n=13). Not grade-specific.
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── 8. TRANSPORT ── */}
                {tab === 'Transport' && (
                    <div className="space-y-6 max-w-2xl">
                        <div className="border border-zinc-200 rounded-lg p-4 bg-white">
                            <h3 className="text-sm font-bold text-zinc-900 mb-3">Country-Specific Shipping (€/kg)</h3>
                            <div className="space-y-3">
                                {[
                                    { code: 'es', label: 'Spain (ES)', suggest: 0.95 },
                                    { code: 'be', label: 'Belgium (BE)', suggest: 1.145 },
                                    { code: 'nl', label: 'Netherlands (NL)', suggest: 1.189 },
                                    { code: 'de', label: 'Germany (DE)', suggest: 1.165 },
                                    { code: 'fr', label: 'France (FR)', suggest: 1.178 },
                                    { code: 'at', label: 'Austria (AT)', suggest: 1.225 }
                                ].map(({ code, label, suggest }) => (
                                    <div key={code} className="grid grid-cols-2 gap-4 items-center">
                                        <label className="text-xs font-semibold text-zinc-700">{label}</label>
                                        <div>
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={form.rates.transport_costs?.[code] ?? 0}
                                                onChange={e => setRates(r => ({
                                                    ...r,
                                                    transport_costs: {
                                                        ...r.transport_costs,
                                                        [code]: parseFloat(e.target.value) || 0
                                                    }
                                                }))}
                                                className={inputClass}
                                            />
                                            <div className="text-[10px] text-zinc-400">Suggested: {suggest} €/kg (n=13)</div>
                                        </div>
                                    </div>
                                ))}
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
