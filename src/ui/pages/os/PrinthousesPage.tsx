import React, { useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Transition, TransitionChild, DialogPanel } from '@headlessui/react';
import {
    PrinterIcon, PlusIcon, PencilSquareIcon, TrashIcon,
    ClockIcon, DocumentTextIcon, HashtagIcon, XMarkIcon,
} from "@heroicons/react/24/outline";
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getPrinthouses, createPrinthouse, updatePrinthouse, deletePrinthouse } from '../../lib/adminApi';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PrinthouseLimits { min_copies: number; max_pages: number; }
export interface BySignature { '32p'?: number; '24p'?: number; '16p'?: number; '12p'?: number; '8p'?: number; '4p'?: number; }
export interface ByColour { '1': number; '2': number; '3': number; '4': number; '5': number; }
export interface BySection { [key: string]: number; }
export interface ByCountry { belgium: number; netherlands: number; finland: number; hungary: number; poland: number; }
export interface PrinthouseRates {
    interior_one_colour_fixed: BySignature; interior_one_colour_var: BySignature;
    interior_two_colour_fixed: BySignature; interior_two_colour_var: BySignature;
    interior_full_colour_fixed: BySignature; interior_full_colour_var: BySignature;
    pms_interior_fixed: number;
    cover_fixed_by_colours: ByColour; cover_var_per_1000_by_colours: ByColour;
    pms_cover: { fixed: number; var: number };
    lam_fixed: { varnish: number; gloss: number; matt: number };
    lam_var_per_1000: { varnish: number; gloss: number; matt: number };
    uv_varnish: { fixed: number; var: number };
    endpaper_fixed_by_colours: ByColour; endpaper_var_per_1000_by_colours: ByColour;
    binding_pb_fixed_by_sections: BySection; binding_pb_var_per_1000_by_sections: BySection;
    binding_ss_fixed_by_sections: BySection; binding_ss_var_per_1000_by_sections: BySection;
    binding_ts_fixed_by_sections: BySection; binding_ts_var_per_1000_by_sections: BySection;
    binding_hc_fixed_by_sections: BySection; binding_hc_var_per_1000_by_sections: BySection;
    binding_wo_fixed_by_sections: BySection; binding_wo_var_per_1000_by_sections: BySection;
    binding_sp_fixed_by_sections: BySection; binding_sp_var_per_1000_by_sections: BySection;
    paper_interior_fixed_by_colours: { one: number; two: number; full: number };
    paper_interior_var_per_1000_by_colours: { one: number; two: number; full: number };
    paper_cover_fixed_by_colours: { one: number; two: number; full: number };
    paper_cover_var_per_1000_by_colours: { one: number; two: number; full: number };
    paper_endpapers_fixed_by_colours: { one: number; two: number; full: number };
    paper_endpapers_var_per_1000_by_colours: { one: number; two: number; full: number };
    paper_waste_for_binding: { pb: number; ss: number; sc: number; hc: number; wo: number; sp: number };
    paper_price_interior_by_kilo: { offset: number; mc: number; lux: number; munken: number; other: number };
    paper_price_cover_by_kilo: { mc: number; artboard: number; offset: number; wfmc: number; other: number };
    paper_price_endpaper_by_kilo: { offset: number; mc: number; other: number };
    technical_costs_for_transport: boolean;
    additional_transport_multiplier: number;
    percentage_technical_costs: ByCountry;
    transport_costs: ByCountry;
}
export type PrinthouseStatus = 'Active' | 'Under Maintenance' | 'Inactive';
export interface Printhouse {
    _id: string; id: string; name: string;
    country?: string; city?: string;
    status?: PrinthouseStatus;
    signatures: number[]; delivery_time: string;
    production_lead_days: number; limits: PrinthouseLimits;
    rates?: PrinthouseRates;
    // Phase 24 Geolocation
    region?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    address_line?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const SIG_KEYS: Array<keyof BySignature> = ['32p', '24p', '16p', '12p', '8p', '4p'];
export const COLOUR_KEYS: Array<keyof ByColour> = ['1', '2', '3', '4', '5'];
export const SECTIONS = Array.from({ length: 24 }, (_, i) => String(i + 1));
export const COUNTRIES: Array<keyof ByCountry> = ['belgium', 'netherlands', 'finland', 'hungary', 'poland'];
export const BINDING_CONFIGS = [
    { key: 'pb' as const, label: 'Perfect Bound' },
    { key: 'ss' as const, label: 'Saddle Stitch' },
    { key: 'ts' as const, label: 'Thread Sewn' },
    { key: 'hc' as const, label: 'Hardcover' },
    { key: 'wo' as const, label: 'Wire-O' },
    { key: 'sp' as const, label: 'Spiral' },
];
export type BindingKey = 'pb' | 'ss' | 'ts' | 'hc' | 'wo' | 'sp';

export const emptyBySection = (): BySection => {
    const o: BySection = {};
    SECTIONS.forEach(s => { o[s] = 0; });
    return o;
};

export const EMPTY_RATES: PrinthouseRates = {
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
    transport_costs: { belgium: 0, netherlands: 0, finland: 0, hungary: 0, poland: 0 },
};

type FormState = Omit<Printhouse, '_id'> & { rates: PrinthouseRates };
const EMPTY_FORM: FormState = {
    id: '', name: '', country: '', city: '', status: 'Active', signatures: [32], delivery_time: '7 days',
    production_lead_days: 5, limits: { min_copies: 250, max_pages: 1500 },
    rates: EMPTY_RATES,
    region: '', latitude: 0, longitude: 0, timezone: 'UTC', address_line: ''
};

// ── Styling helpers ────────────────────────────────────────────────────────────
const inp = "px-3 py-1.5 rounded-none border border-zinc-200 dark:border-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#dc0000] bg-white dark:bg-zinc-900 w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors";
const lbl = "block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1";

const FORM_TABS = ['Basic', 'Operational', 'Interior', 'Cover & Endpapers', 'Lamination & UV', 'Binding', 'Paper Costs', 'Transport'] as const;
type FormTab = typeof FORM_TABS[number];

// ── Form Modal ─────────────────────────────────────────────────────────────────
interface FormModalProps {
    isOpen: boolean;
    onClose: () => void;
    editing: Printhouse | null;
    onSaved: () => void;
}

export const PrinthouseFormModal: React.FC<FormModalProps> = ({ isOpen, onClose, editing, onSaved }) => {
    const [tab, setTab] = useState<FormTab>('Basic');
    const [bindingTab, setBindingTab] = useState<BindingKey>('pb');

    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);

    React.useEffect(() => {
        if (!isOpen) return;
        setTab('Basic');
        if (editing) {
            setForm({
                id: editing.id, name: editing.name,
                country: editing.country ?? '', city: editing.city ?? '',
                status: editing.status ?? 'Active',
                signatures: editing.signatures, delivery_time: editing.delivery_time,
                production_lead_days: editing.production_lead_days,
                limits: { ...editing.limits },
                rates: editing.rates ? { ...EMPTY_RATES, ...editing.rates } : { ...EMPTY_RATES },
                region: editing.region ?? '',
                latitude: editing.latitude ?? 0,
                longitude: editing.longitude ?? 0,
                timezone: editing.timezone ?? 'UTC',
                address_line: editing.address_line ?? '',
            });
        } else {
            setForm(EMPTY_FORM);
        }
    }, [isOpen, editing]);

    const setRates = (updater: (r: PrinthouseRates) => PrinthouseRates) =>
        setForm(f => ({ ...f, rates: updater(f.rates) }));

    const setRateField = (key: keyof PrinthouseRates, subKey: string, val: number) =>
        setRates(r => ({ ...r, [key]: { ...(r[key] as any), [subKey]: val } }));

    const handleSave = async () => {
        if (!form.id.trim() || !form.name.trim()) return;
        setSaving(true);
        try {
            const payload = { ...form };
            editing ? await updatePrinthouse(editing._id, payload) : await createPrinthouse(payload);
            onClose();
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    const tabBtn = (t: FormTab) => (
        <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-[11px] font-bold uppercase tracking-widest border-b-2 whitespace-nowrap transition-all ${tab === t ? 'border-[#dc0000] text-[#dc0000] dark:bg-zinc-900/60' : 'border-transparent text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}>
            {t}
        </button>
    );

    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm" />
                </TransitionChild>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-start justify-center p-4 pt-6">
                        <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <DialogPanel className="w-full max-w-6xl bg-white dark:bg-zinc-950 rounded-none shadow-none flex flex-col border border-zinc-200 dark:border-zinc-800" style={{ maxHeight: '92vh' }}>
                                {/* Header */}
                                <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-50 dark:bg-zinc-950">
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                                        {editing ? `Edit: ${editing.name}` : 'Add Printhouse'}
                                    </h2>
                                    <button onClick={onClose} className="p-2 rounded-none bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                </div>
                                {/* Tab bar */}
                                <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-8 flex-shrink-0 overflow-x-auto bg-zinc-50 dark:bg-zinc-950">
                                    {FORM_TABS.map(tabBtn)}
                                </div>
                                {/* Content */}
                                <div className="flex-1 overflow-y-auto px-8 py-6 bg-white dark:bg-zinc-950">

                                    {/* ── BASIC ── */}
                                    {tab === 'Basic' && (
                                        <div className="space-y-5 max-w-2xl">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className={lbl}>ID (slug)</label>
                                                    <input type="text" value={form.id} placeholder="e.g. adv-2025"
                                                        disabled={!!editing}
                                                        onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                                                        className={`${inp} disabled:bg-zinc-50 disabled:dark:bg-zinc-900/50 disabled:text-zinc-400 disabled:dark:text-zinc-600`} />
                                                </div>
                                                <div>
                                                    <label className={lbl}>Name</label>
                                                    <input type="text" value={form.name} placeholder="e.g. Adv 2025"
                                                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className={lbl}>Signatures</label>
                                                    <div className="flex gap-2 mt-1">
                                                        {([32, 24, 16] as const).map(sig => {
                                                            const active = form.signatures.includes(sig);
                                                            return (
                                                                <button key={sig} type="button"
                                                                    onClick={() => setForm(f => ({ ...f, signatures: [sig] }))}
                                                                    className={`px-3 py-1.5 rounded-none text-xs font-bold uppercase tracking-widest border transition-colors ${active ? 'bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-100 border-zinc-900 dark:border-zinc-700' : 'bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'}`}>
                                                                    {sig}p
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className={lbl}>Delivery Time Days</label>
                                                    <input type="number" min={1} value={parseInt(String(form.delivery_time)) || ''}
                                                        onChange={e => setForm(f => ({ ...f, delivery_time: e.target.value }))} className={inp} />
                                                </div>
                                                <div>
                                                    <label className={lbl}>Production Lead Days</label>
                                                    <input type="number" min={1} value={form.production_lead_days}
                                                        onChange={e => setForm(f => ({ ...f, production_lead_days: parseInt(e.target.value, 10) || 0 }))} className={inp} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className={lbl}>Country</label>
                                                    <input type="text" value={form.country ?? ''} placeholder="e.g. Belgium"
                                                        onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className={inp} />
                                                </div>
                                                <div>
                                                    <label className={lbl}>City</label>
                                                    <input type="text" value={form.city ?? ''} placeholder="e.g. Ghent"
                                                        onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inp} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className={lbl}>Status</label>
                                                <div className="flex gap-2">
                                                    {(['Active', 'Under Maintenance', 'Inactive'] as const).map(s => {
                                                        const active = form.status === s;
                                                        return (
                                                            <button key={s} type="button"
                                                                onClick={() => setForm(f => ({ ...f, status: s }))}
                                                                className={`px-3 py-1.5 rounded-none text-xs font-bold uppercase tracking-widest border transition-colors ${active
                                                                    ? s === 'Active' ? 'bg-emerald-600 dark:bg-emerald-950/40 text-white dark:text-emerald-400 border-emerald-600 dark:border-emerald-900/60'
                                                                        : s === 'Under Maintenance' ? 'bg-amber-500 dark:bg-amber-950/40 text-white dark:text-amber-400 border-amber-500 dark:border-amber-900/60'
                                                                        : 'bg-zinc-600 dark:bg-zinc-800 text-white dark:text-zinc-200 border-zinc-600 dark:border-zinc-700'
                                                                    : 'bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'}`}>
                                                                {s}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className={lbl}>Min Copies</label>
                                                    <input type="number" min={1} value={form.limits.min_copies}
                                                        onChange={e => setForm(f => ({ ...f, limits: { ...f.limits, min_copies: parseInt(e.target.value, 10) || 0 } }))} className={inp} />
                                                </div>
                                                <div>
                                                    <label className={lbl}>Max Pages</label>
                                                    <input type="number" min={1} value={form.limits.max_pages}
                                                        onChange={e => setForm(f => ({ ...f, limits: { ...f.limits, max_pages: parseInt(e.target.value, 10) || 0 } }))} className={inp} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── OPERATIONAL ── */}
                                    {tab === 'Operational' && (
                                        <div className="space-y-5 max-w-2xl">
                                            <div>
                                                <label className={lbl}>Street Address</label>
                                                <input type="text" value={form.address_line} placeholder="e.g. 123 Industrial Way"
                                                    onChange={e => setForm(f => ({ ...f, address_line: e.target.value }))} className={inp} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className={lbl}>Region / Economic Zone</label>
                                                    <input type="text" value={form.region} placeholder="e.g. EU-WEST"
                                                        onChange={e => setForm(f => ({ ...f, region: e.target.value }))} className={inp} />
                                                </div>
                                                <div>
                                                    <label className={lbl}>Timezone</label>
                                                    <input type="text" value={form.timezone} placeholder="e.g. Europe/Paris"
                                                        onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} className={inp} />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className={lbl}>Latitude</label>
                                                    <input type="number" step="0.000001" value={form.latitude}
                                                        onChange={e => setForm(f => ({ ...f, latitude: parseFloat(e.target.value) || 0 }))} className={inp} />
                                                </div>
                                                <div>
                                                    <label className={lbl}>Longitude</label>
                                                    <input type="number" step="0.000001" value={form.longitude}
                                                        onChange={e => setForm(f => ({ ...f, longitude: parseFloat(e.target.value) || 0 }))} className={inp} />
                                                </div>
                                            </div>
                                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-none border border-zinc-200 dark:border-zinc-800">
                                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Routing Intelligence Note</p>
                                              <p className="text-xs text-zinc-500 leading-relaxed">
                                                Providing precise geographic coordinates enables the Global Manufacturing Grid to perform deterministic routing calculations and proximity-based dispatch balancing.
                                              </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── INTERIOR ── */}
                                    {tab === 'Interior' && (
                                        <div className="space-y-8">
                                            <p className="text-xs text-zinc-400 dark:text-zinc-500">Leave 0 for signature sizes not applicable to this printhouse.</p>
                                            {([
                                                { label: '1 Colour', fixedKey: 'interior_one_colour_fixed', varKey: 'interior_one_colour_var' },
                                                { label: '2 Colour', fixedKey: 'interior_two_colour_fixed', varKey: 'interior_two_colour_var' },
                                                { label: 'Full Colour', fixedKey: 'interior_full_colour_fixed', varKey: 'interior_full_colour_var' },
                                            ] as const).map(({ label, fixedKey, varKey }) => (
                                                <div key={label}>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">{label}</h3>
                                                    <div className="overflow-x-auto">
                                                        <table className="text-xs border-collapse min-w-full">
                                                            <thead>
                                                                <tr>
                                                                    <th className="text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-2 w-24" />
                                                                    {SIG_KEYS.map(k => <th key={k} className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-2 px-1 min-w-[80px]">{k}</th>)}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(['Fixed', 'Variable'] as const).map((rowLabel, ri) => {
                                                                    const key = ri === 0 ? fixedKey : varKey;
                                                                    return (
                                                                        <tr key={rowLabel}>
                                                                            <td className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pr-3 py-1 whitespace-nowrap">{rowLabel}</td>
                                                                            {SIG_KEYS.map(k => (
                                                                                <td key={k} className="px-1 py-1">
                                                                                    <input type="number" step="0.01"
                                                                                        value={(form.rates[key] as any)[k] ?? 0}
                                                                                        onChange={e => setRateField(key as keyof PrinthouseRates, k, parseFloat(e.target.value) || 0)}
                                                                                        className={inp} />
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
                                            <div className="max-w-xs">
                                                <label className={lbl}>PMS Interior Fixed</label>
                                                <input type="number" step="0.01" value={form.rates.pms_interior_fixed}
                                                    onChange={e => setRates(r => ({ ...r, pms_interior_fixed: parseFloat(e.target.value) || 0 }))} className={inp} />
                                            </div>
                                        </div>
                                    )}

                                    {/* ── COVER & ENDPAPERS ── */}
                                    {tab === 'Cover & Endpapers' && (
                                        <div className="space-y-8">
                                            {([
                                                { label: 'Cover', fixedKey: 'cover_fixed_by_colours', varKey: 'cover_var_per_1000_by_colours' },
                                                { label: 'Endpaper', fixedKey: 'endpaper_fixed_by_colours', varKey: 'endpaper_var_per_1000_by_colours' },
                                            ] as const).map(({ label, fixedKey, varKey }) => (
                                                <div key={label}>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1">{label}</h3>
                                                    <div className="overflow-x-auto">
                                                        <table className="text-xs border-collapse min-w-full">
                                                            <thead>
                                                                <tr>
                                                                    <th className="text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-2 w-24" />
                                                                    {COLOUR_KEYS.map(k => <th key={k} className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-2 px-2 min-w-[90px]">{k} colour{k !== '1' ? 's' : ''}</th>)}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(['Fixed', 'Variable'] as const).map((rowLabel, ri) => {
                                                                    const key = ri === 0 ? fixedKey : varKey;
                                                                    return (
                                                                        <tr key={rowLabel}>
                                                                            <td className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pr-3 py-1">{rowLabel}</td>
                                                                            {COLOUR_KEYS.map(k => (
                                                                                <td key={k} className="px-1 py-1">
                                                                                    <input type="number" step="0.01"
                                                                                        value={(form.rates[key] as any)[k] ?? 0}
                                                                                        onChange={e => setRateField(key as keyof PrinthouseRates, k, parseFloat(e.target.value) || 0)}
                                                                                        className={inp} />
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
                                            <div className="max-w-sm">
                                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">PMS Cover</h3>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={lbl}>Fixed</label>
                                                        <input type="number" step="0.01" value={form.rates.pms_cover.fixed}
                                                            onChange={e => setRates(r => ({ ...r, pms_cover: { ...r.pms_cover, fixed: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                    </div>
                                                    <div>
                                                        <label className={lbl}>Variable</label>
                                                        <input type="number" step="0.01" value={form.rates.pms_cover.var}
                                                            onChange={e => setRates(r => ({ ...r, pms_cover: { ...r.pms_cover, var: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── LAM & UV ── */}
                                    {tab === 'Lamination & UV' && (
                                        <div className="space-y-8 max-w-2xl">
                                            {([
                                                { label: 'Lamination — Fixed', key: 'lam_fixed' },
                                                { label: 'Lamination — Variable', key: 'lam_var_per_1000' },
                                            ] as const).map(({ label, key }) => (
                                                <div key={key}>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">{label}</h3>
                                                    <div className="grid grid-cols-3 gap-4">
                                                        {(['varnish', 'gloss', 'matt'] as const).map(k => (
                                                            <div key={k}>
                                                                <label className={lbl}>{k}</label>
                                                                <input type="number" step="0.01" value={form.rates[key][k]}
                                                                    onChange={e => setRates(r => ({ ...r, [key]: { ...r[key], [k]: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                            <div>
                                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">UV Varnish</h3>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={lbl}>Fixed</label>
                                                        <input type="number" step="0.01" value={form.rates.uv_varnish.fixed}
                                                            onChange={e => setRates(r => ({ ...r, uv_varnish: { ...r.uv_varnish, fixed: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                    </div>
                                                    <div>
                                                        <label className={lbl}>Variable</label>
                                                        <input type="number" step="0.01" value={form.rates.uv_varnish.var}
                                                            onChange={e => setRates(r => ({ ...r, uv_varnish: { ...r.uv_varnish, var: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── BINDING ── */}
                                    {tab === 'Binding' && (
                                        <div className="space-y-4">
                                            <p className="text-xs text-zinc-400">Costs by number of sections (1–24). Enter 0 for unsupported configurations.</p>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {BINDING_CONFIGS.map(b => (
                                                    <button key={b.key} onClick={() => setBindingTab(b.key)}
                                                        className={`px-3 py-1.5 rounded-none text-[11px] font-bold uppercase tracking-widest transition-colors ${bindingTab === b.key ? 'bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-100 border border-transparent dark:border-zinc-700' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 border border-transparent dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}>
                                                        {b.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {BINDING_CONFIGS.filter(b => b.key === bindingTab).map(b => {
                                                const fk = `binding_${b.key}_fixed_by_sections` as keyof PrinthouseRates;
                                                const vk = `binding_${b.key}_var_per_1000_by_sections` as keyof PrinthouseRates;
                                                return (
                                                    <div key={b.key} className="overflow-x-auto">
                                                        <table className="text-xs border-collapse w-full max-w-md">
                                                            <thead className="sticky top-0 bg-white dark:bg-zinc-900 z-10">
                                                                <tr>
                                                                    <th className="text-left text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-2 w-20">Sections</th>
                                                                    <th className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-2 px-2 min-w-[120px]">Fixed</th>
                                                                    <th className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pb-2 px-2 min-w-[120px]">Variable</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {SECTIONS.map(s => (
                                                                    <tr key={s} className="border-t border-zinc-100 dark:border-zinc-800">
                                                                        <td className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest py-1 pr-3">{s}</td>
                                                                        <td className="px-1 py-1">
                                                                            <input type="number" step="0.01"
                                                                                value={(form.rates[fk] as BySection)[s] ?? 0}
                                                                                onChange={e => setRateField(fk, s, parseFloat(e.target.value) || 0)}
                                                                                className={inp} />
                                                                        </td>
                                                                        <td className="px-1 py-1">
                                                                            <input type="number" step="0.01"
                                                                                value={(form.rates[vk] as BySection)[s] ?? 0}
                                                                                onChange={e => setRateField(vk, s, parseFloat(e.target.value) || 0)}
                                                                                className={inp} />
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* ── PAPER COSTS ── */}
                                    {tab === 'Paper Costs' && (
                                        <div className="space-y-8">
                                            {([
                                                { label: 'Interior', fk: 'paper_interior_fixed_by_colours', vk: 'paper_interior_var_per_1000_by_colours' },
                                                { label: 'Cover', fk: 'paper_cover_fixed_by_colours', vk: 'paper_cover_var_per_1000_by_colours' },
                                                { label: 'Endpapers', fk: 'paper_endpapers_fixed_by_colours', vk: 'paper_endpapers_var_per_1000_by_colours' },
                                            ] as const).map(({ label, fk, vk }) => (
                                                <div key={label}>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Paper — {label}</h3>
                                                    <div className="grid grid-cols-3 gap-4">
                                                        {(['one', 'two', 'full'] as const).map(c => (
                                                            <div key={c} className="space-y-2">
                                                                <div>
                                                                    <label className={lbl}>{c === 'one' ? '1 colour' : c === 'two' ? '2 colour' : 'Full'} — Fixed</label>
                                                                    <input type="number" step="0.01" value={form.rates[fk][c]}
                                                                        onChange={e => setRates(r => ({ ...r, [fk]: { ...r[fk], [c]: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                                </div>
                                                                <div>
                                                                    <label className={lbl}>{c === 'one' ? '1 colour' : c === 'two' ? '2 colour' : 'Full'} — Variable</label>
                                                                    <input type="number" step="0.01" value={form.rates[vk][c]}
                                                                        onChange={e => setRates(r => ({ ...r, [vk]: { ...r[vk], [c]: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                            <div>
                                                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Paper Waste for Binding</h3>
                                                <div className="grid grid-cols-6 gap-3">
                                                    {(['pb', 'ss', 'sc', 'hc', 'wo', 'sp'] as const).map(k => (
                                                        <div key={k}>
                                                            <label className={lbl}>{k.toUpperCase()}</label>
                                                            <input type="number" step="0.01" value={form.rates.paper_waste_for_binding[k]}
                                                                onChange={e => setRates(r => ({ ...r, paper_waste_for_binding: { ...r.paper_waste_for_binding, [k]: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-8">
                                                <div>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Interior Price / kg</h3>
                                                    {(['offset', 'mc', 'lux', 'munken', 'other'] as const).map(k => (
                                                        <div key={k} className="mb-3">
                                                            <label className={lbl}>{k}</label>
                                                            <input type="number" step="0.001" value={form.rates.paper_price_interior_by_kilo[k]}
                                                                onChange={e => setRates(r => ({ ...r, paper_price_interior_by_kilo: { ...r.paper_price_interior_by_kilo, [k]: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Cover Price / kg</h3>
                                                    {(['mc', 'artboard', 'offset', 'wfmc', 'other'] as const).map(k => (
                                                        <div key={k} className="mb-3">
                                                            <label className={lbl}>{k}</label>
                                                            <input type="number" step="0.001" value={form.rates.paper_price_cover_by_kilo[k]}
                                                                onChange={e => setRates(r => ({ ...r, paper_price_cover_by_kilo: { ...r.paper_price_cover_by_kilo, [k]: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">Endpaper Price / kg</h3>
                                                    {(['offset', 'mc', 'other'] as const).map(k => (
                                                        <div key={k} className="mb-3">
                                                            <label className={lbl}>{k}</label>
                                                            <input type="number" step="0.001" value={form.rates.paper_price_endpaper_by_kilo[k]}
                                                                onChange={e => setRates(r => ({ ...r, paper_price_endpaper_by_kilo: { ...r.paper_price_endpaper_by_kilo, [k]: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── TRANSPORT ── */}
                                    {tab === 'Transport' && (
                                        <div className="space-y-8 max-w-3xl">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={form.rates.technical_costs_for_transport}
                                                    onChange={e => setRates(r => ({ ...r, technical_costs_for_transport: e.target.checked }))}
                                                    className="w-4 h-4 rounded-none border-zinc-300 dark:border-zinc-700 text-[#dc0000] focus:ring-[#dc0000] bg-white dark:bg-zinc-900" />
                                                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Technical costs for transport</span>
                                            </label>
                                            <div className="max-w-xs">
                                                <label className={lbl}>Additional Transport Multiplier</label>
                                                <input type="number" step="0.01" min={1} value={form.rates.additional_transport_multiplier}
                                                    onChange={e => setRates(r => ({ ...r, additional_transport_multiplier: parseFloat(e.target.value) || 1 }))} className={inp} />
                                            </div>
                                            {([
                                                { label: '% Technical Costs by Country', key: 'percentage_technical_costs' },
                                                { label: 'Transport Costs by Country', key: 'transport_costs' },
                                            ] as const).map(({ label, key }) => (
                                                <div key={key}>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">{label}</h3>
                                                    <div className="grid grid-cols-5 gap-3">
                                                        {COUNTRIES.map(c => (
                                                            <div key={c}>
                                                                <label className={lbl}>{c}</label>
                                                                <input type="number" step="0.01" value={form.rates[key][c]}
                                                                    onChange={e => setRates(r => ({ ...r, [key]: { ...r[key], [c]: parseFloat(e.target.value) || 0 } }))} className={inp} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                </div>
                                {/* Footer */}
                                <div className="flex items-center gap-3 px-8 py-5 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-50 dark:bg-zinc-950">
                                    <button onClick={handleSave} disabled={saving || !form.id.trim() || !form.name.trim()}
                                        className="px-6 py-2.5 rounded-none bg-zinc-900 dark:bg-[#dc0000] text-white text-sm font-bold hover:bg-zinc-800 dark:hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-none">
                                        {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Printhouse'}
                                    </button>
                                    <button onClick={onClose}
                                        className="px-6 py-2.5 rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                                        Cancel
                                    </button>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

// ── List Page ─────────────────────────────────────────────────────────────────
export const PrinthousesPage: React.FC = () => {
    const navigate = useNavigate();
    const q = useAdminQuery<Printhouse[]>('printhouses', getPrinthouses);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Printhouse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Printhouse | null>(null);
    const [deleting, setDeleting] = useState(false);

    const openAdd = () => { setEditing(null); setModalOpen(true); };
    const openEdit = (ph: Printhouse) => { setEditing(ph); setModalOpen(true); };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deletePrinthouse(deleteTarget._id);
            setDeleteTarget(null);
            q.refetch();
        } finally { setDeleting(false); }
    };

    const printhouses = q.data ?? [];
    const avgLeadDays = printhouses.length
        ? Number(printhouses.reduce((s, p) => s + (p.production_lead_days ?? 0), 0) / printhouses.length).toFixed(1)
        : '—';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Printhouses</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium tracking-tight">Registered print facilities, signatures, lead times, and copy limits.</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-none bg-zinc-900 dark:bg-[#dc0000] text-white text-sm font-bold shadow-none hover:bg-zinc-800 dark:hover:bg-red-700 transition-colors">
                    <PlusIcon className="w-4 h-4" />
                    Add Printhouse
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                    { label: 'Total Printhouses', value: printhouses.length, icon: PrinterIcon },
                    { label: 'Avg. Lead Days', value: avgLeadDays, icon: ClockIcon },
                    { label: 'Unique Signature Sets', value: new Set(printhouses.map(p => (p.signatures ?? []).join(','))).size, icon: HashtagIcon },
                ].map((stat, i) => (
                    <div key={i} className="bg-white dark:bg-zinc-950 p-5 rounded-none border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 shadow-none">
                        <div className="p-3 rounded-none bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-200 border border-transparent dark:border-zinc-800">
                            <stat.icon className="w-6 h-6 text-zinc-600 dark:text-zinc-200" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl font-black text-zinc-900 dark:text-zinc-100">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {q.status === 'error' && (
                <div className="px-5 py-4 rounded-none border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm font-medium text-[#dc0000] dark:text-red-400">
                    Failed to load printhouses: {q.error}
                </div>
            )}

            <DataTable<Printhouse>
                isLoading={q.status === 'loading'}
                data={printhouses}
                columns={[
                    {
                        header: 'Printhouse',
                        accessor: (p) => (
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-none bg-zinc-100 dark:bg-zinc-900 border border-transparent dark:border-zinc-800 flex items-center justify-center flex-shrink-0">
                                    <PrinterIcon className="w-4 h-4 text-zinc-500 dark:text-zinc-200" />
                                </div>
                                <div>
                                    <p className="font-bold text-zinc-900 dark:text-zinc-100">{p.name}</p>
                                    <p className="text-[10px] font-mono text-zinc-400 font-bold">{p.id}</p>
                                </div>
                            </div>
                        ),
                    },
                    {
                        header: 'Signatures',
                        accessor: (p) => (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {(p.signatures ?? []).map(s => (
                                    <span key={s} className="px-2 py-0.5 rounded-none bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-transparent dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wide">{s}p</span>
                                ))}
                            </div>
                        ),
                    },
                    {
                        header: 'Delivery',
                        accessor: (p) => (
                            <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 font-medium">
                                <ClockIcon className="w-4 h-4 text-zinc-400" />
                                {p.delivery_time}
                            </div>
                        ),
                    },
                    {
                        header: 'Lead Days',
                        accessor: (p) => (
                            <span className="px-2 py-0.5 rounded-none bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border border-transparent dark:border-zinc-800 font-bold text-[10px] uppercase tracking-wide">{p.production_lead_days}d</span>
                        ),
                    },
                    {
                        header: 'Limits',
                        accessor: (p) => (
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    <DocumentTextIcon className="w-3.5 h-3.5 text-zinc-400" />
                                    <span className="font-medium">min {(p.limits?.min_copies ?? 0).toLocaleString()} copies</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    <DocumentTextIcon className="w-3.5 h-3.5 text-zinc-400" />
                                    <span className="font-medium">max {(p.limits?.max_pages ?? 0).toLocaleString()} pages</span>
                                </div>
                            </div>
                        ),
                    },
                    {
                        header: 'Status',
                        accessor: (p) => <StatusBadge status={p.status ?? 'Active'} />,
                    },
                    {
                        header: '',
                        accessor: (p) => (
                            <div className="flex items-center gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                                    className="p-2 rounded-none text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors" title="Edit">
                                    <PencilSquareIcon className="w-4 h-4" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                                    className="p-2 rounded-none text-zinc-400 hover:text-[#dc0000] dark:hover:text-red-400 transition-colors" title="Delete">
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ),
                        className: 'w-24',
                    },
                ]}
                onRowClick={(p) => navigate(`/printhouses/${p._id}`, { state: { printhouse: p } })}
            />

            <PrinthouseFormModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editing={editing} onSaved={() => q.refetch()} />

            <Transition show={!!deleteTarget} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setDeleteTarget(null)}>
                    <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm" />
                    </TransitionChild>
                    <div className="fixed inset-0 flex items-center justify-center p-4">
                        <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <DialogPanel className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-none shadow-none p-8 max-w-sm w-full space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-3 rounded-none bg-red-50 dark:bg-red-950/40 text-[#dc0000] dark:text-red-400 border border-red-100 dark:border-red-900/60"><TrashIcon className="w-6 h-6" /></div>
                                    <div>
                                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Delete Printhouse</p>
                                        <p className="text-xs text-zinc-500 font-medium">This action cannot be undone.</p>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 font-medium">
                                    Remove <span className="font-bold text-zinc-900 dark:text-zinc-100">{deleteTarget?.name}</span>?
                                </p>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={confirmDelete} disabled={deleting}
                                        className="flex-1 py-2.5 rounded-none bg-[#dc0000] text-white text-sm font-bold hover:bg-red-700 dark:hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-none">
                                        {deleting ? 'Deleting…' : 'Delete'}
                                    </button>
                                    <button onClick={() => setDeleteTarget(null)}
                                        className="flex-1 py-2.5 rounded-none border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                                        Cancel
                                    </button>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
};
