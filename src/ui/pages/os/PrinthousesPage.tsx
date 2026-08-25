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
import { CanonicalIndustrialPricingEditor } from '../../components/printhouse/pricing/CanonicalIndustrialPricingEditor';
import { PrinthousePricingGovernance } from '../../types/printhousePricing';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PrinthouseLimits { min_copies: number; max_pages: number; }
export interface BySignature { '32p'?: number; '24p'?: number; '16p'?: number; '12p'?: number; '8p'?: number; '4p'?: number; }
export interface ByColour { '1': number; '2': number; '3': number; '4': number; '5': number; }
export interface BySection { [key: string]: number; }
export interface ByCountry { [key: string]: number; }
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
    pricingGovernance?: PrinthousePricingGovernance | null;
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
export const COUNTRIES: string[] = ['belgium', 'netherlands', 'finland', 'hungary', 'poland'];
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
    percentage_technical_costs: {},
    transport_costs: {},
};

// ── Form Modal ─────────────────────────────────────────────────────────────────
interface FormModalProps {
    isOpen: boolean;
    onClose: () => void;
    editing: Printhouse | null;
    onSaved: () => void;
}

export const PrinthouseFormModal: React.FC<FormModalProps> = ({ isOpen, onClose, editing, onSaved }) => {
    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleSaveNode = async (payload: any) => {
        setSaving(true);
        try {
            editing ? await updatePrinthouse(editing._id, payload) : await createPrinthouse(payload);
            onClose();
            onSaved();
        } finally {
            setSaving(false);
        }
    };

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
                                        {editing ? `Edit Printhouse: ${editing.name}` : 'Add Printhouse Node'}
                                    </h2>
                                    <button onClick={onClose} className="p-2 rounded-none bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                </div>
                                {/* Shared Canonical Editor */}
                                <div className="flex-1 overflow-y-auto p-4 bg-zinc-50 dark:bg-zinc-950">
                                    <CanonicalIndustrialPricingEditor
                                        mode="ADMIN"
                                        initialNodeData={editing ? {
                                            id: editing.id,
                                            name: editing.name,
                                            country: editing.country ?? '',
                                            city: editing.city ?? '',
                                            status: editing.status ?? 'Active',
                                            signatures: editing.signatures,
                                            delivery_time: editing.delivery_time,
                                            production_lead_days: editing.production_lead_days,
                                            limits: { ...editing.limits },
                                            rates: editing.rates ? { ...EMPTY_RATES, ...editing.rates } : { ...EMPTY_RATES },
                                            region: editing.region ?? '',
                                            latitude: editing.latitude ?? 0,
                                            longitude: editing.longitude ?? 0,
                                            timezone: editing.timezone ?? 'UTC',
                                            address_line: editing.address_line ?? ''
                                        } : undefined}
                                        onSave={handleSaveNode}
                                        saving={saving}
                                    />
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
