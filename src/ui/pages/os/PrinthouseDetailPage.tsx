import React, { useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
    ArrowLeftIcon, PencilSquareIcon, PrinterIcon,
    ClockIcon, DocumentTextIcon, HashtagIcon,
} from '@heroicons/react/24/outline';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getPrinthouses } from '../../lib/adminApi';
import {
    Printhouse, PrinthouseRates, PrinthouseFormModal,
    SIG_KEYS, COLOUR_KEYS, SECTIONS, COUNTRIES, BINDING_CONFIGS, BindingKey,
} from './PrinthousesPage';

// ── Display helpers ──────────────────────────────────────────────────────────

const val = "text-sm font-mono text-slate-900 font-semibold";
const lbl = "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5";
const card = "bg-white/70 border border-slate-100 rounded-2xl p-5 space-y-4";
const sectionTitle = "text-sm font-black text-slate-700 mb-3";

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className={lbl}>{label}</p>
            <p className={val}>{children}</p>
        </div>
    );
}

function RateTable({ headers, rows }: { headers: string[]; rows: { label: string; values: (number | string)[] }[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
                <thead>
                    <tr className="border-b border-slate-100">
                        <th className="text-left py-2 pr-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32"></th>
                        {headers.map(h => (
                            <th key={h} className="text-right py-2 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                            <td className="py-1.5 pr-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{row.label}</td>
                            {row.values.map((v, j) => (
                                <td key={j} className="py-1.5 px-2 text-right font-mono text-slate-700 font-semibold">{typeof v === 'number' ? v.toFixed(2) : v}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Tab sections ─────────────────────────────────────────────────────────────

function BasicTab({ ph }: { ph: Printhouse }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={card}>
                <h3 className={sectionTitle}>Identity</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Cell label="Name">{ph.name}</Cell>
                    <Cell label="ID">{ph.id}</Cell>
                    <Cell label="Country">{ph.country || '—'}</Cell>
                    <Cell label="City">{ph.city || '—'}</Cell>
                    <Cell label="Delivery Time">{ph.delivery_time}</Cell>
                    <Cell label="Production Lead Days">{ph.production_lead_days}d</Cell>
                </div>
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Cell label="Min Copies">{(ph.limits?.min_copies ?? 0).toLocaleString()}</Cell>
                    <Cell label="Max Pages">{(ph.limits?.max_pages ?? 0).toLocaleString()}</Cell>
                </div>
                <div className="pt-2">
                    <p className={lbl}>Signatures</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {(ph.signatures ?? []).map(s => (
                            <span key={s} className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest">{s}p</span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function InteriorTab({ r }: { r: PrinthouseRates }) {
    const colourSets = [
        { label: '1 Colour', fixedKey: 'interior_one_colour_fixed' as keyof PrinthouseRates, varKey: 'interior_one_colour_var' as keyof PrinthouseRates },
        { label: '2 Colour', fixedKey: 'interior_two_colour_fixed' as keyof PrinthouseRates, varKey: 'interior_two_colour_var' as keyof PrinthouseRates },
        { label: 'Full Colour', fixedKey: 'interior_full_colour_fixed' as keyof PrinthouseRates, varKey: 'interior_full_colour_var' as keyof PrinthouseRates },
    ];
    return (
        <div className="space-y-6">
            {colourSets.map(({ label, fixedKey, varKey }) => (
                <div key={label} className={card}>
                    <h3 className={sectionTitle}>{label}</h3>
                    <RateTable
                        headers={SIG_KEYS.map(k => k)}
                        rows={[
                            { label: 'Fixed', values: SIG_KEYS.map(k => (r[fixedKey] as any)?.[k] ?? 0) },
                            { label: 'Variable', values: SIG_KEYS.map(k => (r[varKey] as any)?.[k] ?? 0) },
                        ]}
                    />
                </div>
            ))}
            <div className={card}>
                <Cell label="PMS Interior Fixed">{r.pms_interior_fixed}</Cell>
            </div>
        </div>
    );
}

function CoverEndpapersTab({ r }: { r: PrinthouseRates }) {
    return (
        <div className="space-y-6">
            <div className={card}>
                <h3 className={sectionTitle}>Cover by Colour</h3>
                <RateTable
                    headers={COLOUR_KEYS.map(k => `${k}c`)}
                    rows={[
                        { label: 'Fixed', values: COLOUR_KEYS.map(k => r.cover_fixed_by_colours[k] ?? 0) },
                        { label: 'Variable', values: COLOUR_KEYS.map(k => r.cover_var_per_1000_by_colours[k] ?? 0) },
                    ]}
                />
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>PMS Cover</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Cell label="Fixed">{r.pms_cover.fixed}</Cell>
                    <Cell label="Var">{r.pms_cover.var}</Cell>
                </div>
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>Endpapers by Colour</h3>
                <RateTable
                    headers={COLOUR_KEYS.map(k => `${k}c`)}
                    rows={[
                        { label: 'Fixed', values: COLOUR_KEYS.map(k => r.endpaper_fixed_by_colours[k] ?? 0) },
                        { label: 'Variable', values: COLOUR_KEYS.map(k => r.endpaper_var_per_1000_by_colours[k] ?? 0) },
                    ]}
                />
            </div>
        </div>
    );
}

function LaminationUvTab({ r }: { r: PrinthouseRates }) {
    const finishes = ['varnish', 'gloss', 'matt'] as const;
    return (
        <div className="space-y-6">
            <div className={card}>
                <h3 className={sectionTitle}>Lamination</h3>
                <RateTable
                    headers={finishes}
                    rows={[
                        { label: 'Fixed', values: finishes.map(f => r.lam_fixed[f] ?? 0) },
                        { label: 'Variable', values: finishes.map(f => r.lam_var_per_1000[f] ?? 0) },
                    ]}
                />
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>UV Varnish</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Cell label="Fixed">{r.uv_varnish.fixed}</Cell>
                    <Cell label="Variable">{r.uv_varnish.var}</Cell>
                </div>
            </div>
        </div>
    );
}

function BindingTab({ r }: { r: PrinthouseRates }) {
    const [activeBinding, setActiveBinding] = useState<BindingKey>('pb');
    const b = BINDING_CONFIGS.find(x => x.key === activeBinding)!;
    const fk = `binding_${b.key}_fixed_by_sections` as keyof PrinthouseRates;
    const vk = `binding_${b.key}_var_per_1000_by_sections` as keyof PrinthouseRates;
    const fixed = (r[fk] as any) ?? {};
    const variable = (r[vk] as any) ?? {};

    return (
        <div className="space-y-4">
            <div className="flex gap-1 border-b border-slate-100 overflow-x-auto">
                {BINDING_CONFIGS.map(bc => (
                    <button key={bc.key} onClick={() => setActiveBinding(bc.key)}
                        className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 whitespace-nowrap transition-colors -mb-px ${activeBinding === bc.key ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        {bc.label}
                    </button>
                ))}
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>{b.label} — By Section Count</h3>
                <RateTable
                    headers={SECTIONS}
                    rows={[
                        { label: 'Fixed', values: SECTIONS.map(s => fixed[s] ?? 0) },
                        { label: 'Variable', values: SECTIONS.map(s => variable[s] ?? 0) },
                    ]}
                />
            </div>
        </div>
    );
}

function PaperCostsTab({ r }: { r: PrinthouseRates }) {
    const threeColour = ['one', 'two', 'full'] as const;
    const paperSections = [
        { label: 'Interior (fixed by colour)', fixedKey: 'paper_interior_fixed_by_colours' as keyof PrinthouseRates, varKey: 'paper_interior_var_per_1000_by_colours' as keyof PrinthouseRates },
        { label: 'Cover (fixed by colour)', fixedKey: 'paper_cover_fixed_by_colours' as keyof PrinthouseRates, varKey: 'paper_cover_var_per_1000_by_colours' as keyof PrinthouseRates },
        { label: 'Endpapers (fixed by colour)', fixedKey: 'paper_endpapers_fixed_by_colours' as keyof PrinthouseRates, varKey: 'paper_endpapers_var_per_1000_by_colours' as keyof PrinthouseRates },
    ];

    return (
        <div className="space-y-6">
            {paperSections.map(({ label, fixedKey, varKey }) => (
                <div key={label} className={card}>
                    <h3 className={sectionTitle}>{label}</h3>
                    <RateTable
                        headers={threeColour.map(c => c === 'one' ? '1c' : c === 'two' ? '2c' : 'full')}
                        rows={[
                            { label: 'Fixed', values: threeColour.map(c => (r[fixedKey] as any)?.[c] ?? 0) },
                            { label: 'Variable', values: threeColour.map(c => (r[varKey] as any)?.[c] ?? 0) },
                        ]}
                    />
                </div>
            ))}
            <div className={card}>
                <h3 className={sectionTitle}>Paper Waste for Binding</h3>
                <div className="grid grid-cols-6 gap-3">
                    {(['pb', 'ss', 'sc', 'hc', 'wo', 'sp'] as const).map(k => (
                        <Cell key={k} label={k.toUpperCase()}>{r.paper_waste_for_binding[k]}</Cell>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-3 gap-6">
                <div className={card}>
                    <h3 className={sectionTitle}>Interior Price / kg</h3>
                    {(['offset', 'mc', 'lux', 'munken', 'other'] as const).map(k => (
                        <Cell key={k} label={k}>{r.paper_price_interior_by_kilo[k]}</Cell>
                    ))}
                </div>
                <div className={card}>
                    <h3 className={sectionTitle}>Cover Price / kg</h3>
                    {(['mc', 'artboard', 'offset', 'wfmc', 'other'] as const).map(k => (
                        <Cell key={k} label={k}>{r.paper_price_cover_by_kilo[k]}</Cell>
                    ))}
                </div>
                <div className={card}>
                    <h3 className={sectionTitle}>Endpaper Price / kg</h3>
                    {(['offset', 'mc', 'other'] as const).map(k => (
                        <Cell key={k} label={k}>{r.paper_price_endpaper_by_kilo[k]}</Cell>
                    ))}
                </div>
            </div>
        </div>
    );
}

function TransportTab({ r }: { r: PrinthouseRates }) {
    return (
        <div className="space-y-6 max-w-3xl">
            <div className={card}>
                <h3 className={sectionTitle}>Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Cell label="Technical Costs for Transport">{r.technical_costs_for_transport ? 'Yes' : 'No'}</Cell>
                    <Cell label="Additional Transport Multiplier">{r.additional_transport_multiplier}</Cell>
                </div>
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>% Technical Costs by Country</h3>
                <div className="grid grid-cols-5 gap-3">
                    {COUNTRIES.map(c => (
                        <Cell key={c} label={c}>{r.percentage_technical_costs[c]}</Cell>
                    ))}
                </div>
            </div>
            <div className={card}>
                <h3 className={sectionTitle}>Transport Costs by Country</h3>
                <div className="grid grid-cols-5 gap-3">
                    {COUNTRIES.map(c => (
                        <Cell key={c} label={c}>{r.transport_costs[c]}</Cell>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Detail Page ──────────────────────────────────────────────────────────────

const DETAIL_TABS = ['Basic', 'Interior', 'Cover & Endpapers', 'Lamination & UV', 'Binding', 'Paper Costs', 'Transport'] as const;
type DetailTab = typeof DETAIL_TABS[number];

export const PrinthouseDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const navigate = useNavigate();

    const [tab, setTab] = useState<DetailTab>('Basic');
    const [editOpen, setEditOpen] = useState(false);

    // Use state passed from list, or fetch all and filter
    const statePh = (location.state as { printhouse?: Printhouse })?.printhouse;
    const q = useAdminQuery<Printhouse[]>('printhouses', getPrinthouses);

    const ph: Printhouse | undefined = statePh ?? q.data?.find(p => p._id === id);

    if (!ph && q.status === 'loading') {
        return (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm font-medium">
                Loading…
            </div>
        );
    }

    if (!ph) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-slate-400 text-sm font-medium">Printhouse not found.</p>
                <button onClick={() => navigate('/printhouses')}
                    className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> Back to Printhouses
                </button>
            </div>
        );
    }

    const r = ph.rates;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                    <button onClick={() => navigate('/printhouses')}
                        className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors flex-shrink-0">
                        <ArrowLeftIcon className="w-4 h-4" />
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <PrinterIcon className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight truncate">{ph.name}</h1>
                        <p className="text-sm text-slate-400 font-mono">{ph.id}</p>
                    </div>
                </div>
                <button onClick={() => setEditOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold shadow-sm hover:bg-slate-700 transition-colors flex-shrink-0">
                    <PencilSquareIcon className="w-4 h-4" />
                    Edit
                </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Delivery', value: ph.delivery_time, icon: ClockIcon },
                    { label: 'Lead Days', value: `${ph.production_lead_days}d`, icon: ClockIcon },
                    { label: 'Min Copies', value: (ph.limits?.min_copies ?? 0).toLocaleString(), icon: DocumentTextIcon },
                    { label: 'Max Pages', value: (ph.limits?.max_pages ?? 0).toLocaleString(), icon: HashtagIcon },
                ].map((s, i) => (
                    <div key={i} className="bg-white/70 border border-slate-100 rounded-2xl p-4 flex items-center gap-3">
                        <s.icon className="w-5 h-5 text-slate-300 flex-shrink-0" />
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                            <p className="text-sm font-black text-slate-900">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-100 flex gap-0 overflow-x-auto">
                {DETAIL_TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-4 py-3 text-[11px] font-black uppercase tracking-widest border-b-2 whitespace-nowrap transition-colors -mb-px ${tab === t ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        {t}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {tab === 'Basic' && <BasicTab ph={ph} />}
                {tab === 'Interior' && (r ? <InteriorTab r={r} /> : <NoRates />)}
                {tab === 'Cover & Endpapers' && (r ? <CoverEndpapersTab r={r} /> : <NoRates />)}
                {tab === 'Lamination & UV' && (r ? <LaminationUvTab r={r} /> : <NoRates />)}
                {tab === 'Binding' && (r ? <BindingTab r={r} /> : <NoRates />)}
                {tab === 'Paper Costs' && (r ? <PaperCostsTab r={r} /> : <NoRates />)}
                {tab === 'Transport' && (r ? <TransportTab r={r} /> : <NoRates />)}
            </div>

            <PrinthouseFormModal
                isOpen={editOpen}
                onClose={() => setEditOpen(false)}
                editing={ph}
                onSaved={() => {
                    setEditOpen(false);
                    q.refetch();
                }}
            />
        </div>
    );
};

function NoRates() {
    return (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm font-medium border-2 border-dashed border-slate-100 rounded-2xl">
            No rate data configured yet. Use Edit to add rates.
        </div>
    );
}
