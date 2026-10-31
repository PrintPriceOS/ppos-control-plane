/**
 * src/ui/components/materials/PaperThicknessFields.tsx
 *
 * PAPER-CALIPER-UI-01 — Paper thickness (caliper) display + proposal form for Printhouse
 * Materials. Thickness is read-only and comes exclusively from the linked master catalog
 * variant (`paper_variants.caliper_um`). It is NEVER derived from GSM. Printhouse users may
 * only PROPOSE a value, which is routed to the technical evidence workflow server-side.
 */
import React, { useState } from 'react';
import { Info, Ruler, Clock, Send, X } from 'lucide-react';
import { useLocale } from '../../i18n';

export interface PaperThicknessPendingProposal {
    evidenceId: string;
    kind: 'SUPPLIER_REPORTED' | 'PHYSICAL_MEASUREMENT';
    evidenceType?: string;
    reviewStatus: string;
    proposedCaliperUm: number | null;
    createdAt?: string;
}

export interface PaperThickness {
    linkedVariantId: string | null;
    isLinkedToMasterCatalog: boolean;
    caliperUm: number | null;
    caliperSource: string | null;
    verificationStatus: string | null;
    isAuthoritative: boolean;
    pendingProposals: PaperThicknessPendingProposal[];
    unlinkedProposal: {
        kind: string;
        proposedCaliperUm: number;
        status: string;
        proposedAt?: string;
    } | null;
}

export type ThicknessProposalBody =
    | { kind: 'SUPPLIER_REPORTED'; proposedCaliperUm: number; documentUrl?: string }
    | {
        kind: 'PHYSICAL_MEASUREMENT';
        proposedCaliperUm?: number;
        readingsUm: number[];
        conditioningTempC: number;
        conditioningRhPct: number;
        micrometerCalibrationCertId: string;
        micrometerCalibrationValidUntil: string;
    };

const humanize = (v?: string | null) => {
    if (!v) return '';
    if (v === 'LIVONIA_REFERENCE_IMPORT') return 'REFERENCE CATALOG IMPORT';
    return v.replace(/_/g, ' ');
};

/** Tooltip explaining GSM vs thickness. */
export const ThicknessTooltip: React.FC = () => {
    const { t, locale } = useLocale();
    const text = t('materials.thickness.tooltip');
    return (
        <span className="relative inline-flex group align-middle ml-1" tabIndex={0} aria-label={text}>
            <Info size={12} className="text-zinc-400 group-hover:text-[#dc0000] group-focus:text-[#dc0000]" aria-hidden="true" />
            <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-30 w-56 rounded-md bg-zinc-900 text-white text-[10px] font-normal normal-case tracking-normal leading-snug p-2 shadow-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity"
            >
                {text}
            </span>
        </span>
    );
};

/** Compact inline summary, e.g. for list rows: "122 µm" or "Not available". */
export const PaperThicknessInline: React.FC<{ thickness?: PaperThickness | null; caliperUm?: number | null }> = ({ thickness, caliperUm }) => {
    const { t, locale } = useLocale();
    const um = thickness ? thickness.caliperUm : (caliperUm ?? null);
    return (
        <span data-testid="paper-thickness-inline" className="whitespace-nowrap">
            {um && um > 0 ? `${um} µm` : t('materials.thickness.notAvailable')}
        </span>
    );
};

interface PaperThicknessFieldsProps {
    /** Server-resolved thickness of an existing material. */
    thickness?: PaperThickness | null;
    /** For the add form (no material yet): caliper of the selected master catalog item. */
    previewCaliperUm?: number | null;
    previewSource?: string | null;
    previewStatus?: string | null;
    previewLinked?: boolean;
    /** When provided, a "Propose thickness" action is offered. */
    onPropose?: (body: ThicknessProposalBody) => Promise<void>;
    compact?: boolean;
}

export const PaperThicknessFields: React.FC<PaperThicknessFieldsProps> = ({
    thickness,
    previewCaliperUm,
    previewSource,
    previewStatus,
    previewLinked,
    onPropose,
    compact = false
}) => {
    const { t, locale } = useLocale();
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<'SUPPLIER_REPORTED' | 'PHYSICAL_MEASUREMENT'>('SUPPLIER_REPORTED');
    const [proposedUm, setProposedUm] = useState('');
    const [documentUrl, setDocumentUrl] = useState('');
    const [readings, setReadings] = useState('');
    const [tempC, setTempC] = useState('23');
    const [rhPct, setRhPct] = useState('50');
    const [certId, setCertId] = useState('');
    const [certValidUntil, setCertValidUntil] = useState('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);

    const isPreview = !thickness;
    const linked = isPreview ? Boolean(previewLinked) : thickness!.isLinkedToMasterCatalog;
    const um = isPreview ? (previewCaliperUm ?? null) : thickness!.caliperUm;
    const source = isPreview ? (previewSource ?? null) : thickness!.caliperSource;
    const status = isPreview ? (previewStatus ?? null) : thickness!.verificationStatus;
    const hasValue = Boolean(um && um > 0);
    const notAvailable = t('materials.thickness.notAvailable');

    const pending = thickness?.pendingProposals || [];
    const unlinked = thickness?.unlinkedProposal || null;

    const labelClass = 'text-[10px] font-semibold tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center';
    const valueClass = 'text-xs font-semibold text-zinc-900 dark:text-zinc-100 break-words';
    const inputClass = 'w-full px-2.5 py-1.5 rounded-md text-xs bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#dc0000]';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!onPropose) return;
        setFormError(null);
        try {
            let body: ThicknessProposalBody;
            if (kind === 'SUPPLIER_REPORTED') {
                const v = Number(proposedUm);
                if (!Number.isFinite(v) || v <= 0 || v > 5000) throw new Error(t('materials.thickness.error.value'));
                if (linked && !documentUrl.trim()) throw new Error(t('materials.thickness.error.document'));
                body = { kind, proposedCaliperUm: v, documentUrl: documentUrl.trim() || undefined };
            } else {
                const values = readings.split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
                if (linked) {
                    if (values.length < 10) throw new Error(t('materials.thickness.error.readings'));
                    if (!certId.trim() || !certValidUntil) throw new Error(t('materials.thickness.error.calibration'));
                    body = {
                        kind,
                        readingsUm: values,
                        conditioningTempC: Number(tempC),
                        conditioningRhPct: Number(rhPct),
                        micrometerCalibrationCertId: certId.trim(),
                        micrometerCalibrationValidUntil: certValidUntil
                    };
                } else {
                    const v = Number(proposedUm);
                    if (!Number.isFinite(v) || v <= 0 || v > 5000) throw new Error(t('materials.thickness.error.value'));
                    body = { kind, proposedCaliperUm: v } as ThicknessProposalBody;
                }
            }
            setBusy(true);
            await onPropose(body);
            setSubmitted(true);
            setOpen(false);
        } catch (err: any) {
            setFormError(err?.message || t('materials.thickness.error.generic'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-testid="paper-thickness-fields" className={`rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 ${compact ? 'p-2' : 'p-2.5'} flex flex-col gap-2 min-w-0`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
                <div className="min-w-0">
                    <span className={labelClass}>
                        <Ruler size={11} className="mr-1 text-[#dc0000]" aria-hidden="true" />
                        {t('materials.thickness.label')}
                        <ThicknessTooltip />
                    </span>
                    <span data-testid="paper-thickness-value" className={`${valueClass} tabular-nums`}>
                        {hasValue ? `${um} µm` : notAvailable}
                    </span>
                </div>
                <div className="min-w-0">
                    <span className={labelClass}>{t('materials.thickness.source')}</span>
                    <span data-testid="paper-thickness-source" className={valueClass}>
                        {hasValue && source ? humanize(source) : notAvailable}
                    </span>
                </div>
                <div className="min-w-0">
                    <span className={labelClass}>{t('materials.thickness.status')}</span>
                    <span data-testid="paper-thickness-status" className={valueClass}>
                        {hasValue && status ? humanize(status) : notAvailable}
                    </span>
                </div>
            </div>

            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 m-0">
                {linked ? t('materials.thickness.linkedHint') : t('materials.thickness.manualHint')}
            </p>

            {pending.length > 0 && (
                <div data-testid="paper-thickness-pending" className="flex flex-col gap-1">
                    {pending.map((p) => (
                        <span key={p.evidenceId} className="text-[10px] inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                            <Clock size={11} aria-hidden="true" />
                            {t('materials.thickness.pending')}: {p.proposedCaliperUm ? `${p.proposedCaliperUm} µm` : '—'} · {p.kind === 'PHYSICAL_MEASUREMENT' ? t('materials.thickness.kind.physical') : t('materials.thickness.kind.supplier')} · {humanize(p.reviewStatus)}
                        </span>
                    ))}
                </div>
            )}
            {unlinked && (
                <span data-testid="paper-thickness-pending-unlinked" className="text-[10px] inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                    <Clock size={11} aria-hidden="true" />
                    {t('materials.thickness.pendingUnlinked')}: {unlinked.proposedCaliperUm} µm · {unlinked.kind === 'PHYSICAL_MEASUREMENT' ? t('materials.thickness.kind.physical') : t('materials.thickness.kind.supplier')}
                </span>
            )}
            {submitted && (
                <span role="status" className="text-[10px] text-emerald-700 dark:text-emerald-300">{t('materials.thickness.submitted')}</span>
            )}

            {onPropose && !open && (
                <button
                    type="button"
                    data-testid="paper-thickness-propose-btn"
                    onClick={() => { setOpen(true); setSubmitted(false); }}
                    className="self-start px-2 py-1 rounded border border-[#dc0000]/50 text-[#dc0000] hover:bg-red-50 dark:hover:bg-red-950/30 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                >
                    {t('materials.thickness.propose')}
                </button>
            )}

            {onPropose && open && (
                <form onSubmit={submit} data-testid="paper-thickness-propose-form" className="flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-2">
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('materials.thickness.propose')}>
                        {(['SUPPLIER_REPORTED', 'PHYSICAL_MEASUREMENT'] as const).map((k) => (
                            <button
                                key={k}
                                type="button"
                                role="radio"
                                aria-checked={kind === k}
                                onClick={() => setKind(k)}
                                className={`px-2 py-1 rounded text-[10px] font-bold border cursor-pointer ${kind === k ? 'bg-[#dc0000] text-white border-[#dc0000]' : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'}`}
                            >
                                {k === 'SUPPLIER_REPORTED' ? t('materials.thickness.kind.supplier') : t('materials.thickness.kind.physical')}
                            </button>
                        ))}
                    </div>

                    {(kind === 'SUPPLIER_REPORTED' || !linked) && (
                        <label className="flex flex-col gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                            {t('materials.thickness.proposedUm')}
                            <input type="number" min={1} max={5000} step="1" value={proposedUm} onChange={(e) => setProposedUm(e.target.value)} className={inputClass} />
                        </label>
                    )}
                    {kind === 'SUPPLIER_REPORTED' && (
                        <label className="flex flex-col gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                            {t('materials.thickness.documentUrl')}
                            <input type="url" placeholder="https://" value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} className={inputClass} />
                        </label>
                    )}
                    {kind === 'PHYSICAL_MEASUREMENT' && linked && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="sm:col-span-2 flex flex-col gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                                {t('materials.thickness.readings')}
                                <input type="text" value={readings} onChange={(e) => setReadings(e.target.value)} className={inputClass} />
                            </label>
                            <label className="flex flex-col gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                                {t('materials.thickness.tempC')}
                                <input type="number" step="0.1" value={tempC} onChange={(e) => setTempC(e.target.value)} className={inputClass} />
                            </label>
                            <label className="flex flex-col gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                                {t('materials.thickness.rhPct')}
                                <input type="number" step="0.1" value={rhPct} onChange={(e) => setRhPct(e.target.value)} className={inputClass} />
                            </label>
                            <label className="flex flex-col gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                                {t('materials.thickness.calibrationCert')}
                                <input type="text" value={certId} onChange={(e) => setCertId(e.target.value)} className={inputClass} />
                            </label>
                            <label className="flex flex-col gap-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                                {t('materials.thickness.calibrationValidUntil')}
                                <input type="date" value={certValidUntil} onChange={(e) => setCertValidUntil(e.target.value)} className={inputClass} />
                            </label>
                        </div>
                    )}

                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 m-0">{t('materials.thickness.approvalNote')}</p>
                    {formError && <p role="alert" className="text-[10px] text-red-600 m-0">{formError}</p>}

                    <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={busy} className="px-2.5 py-1 rounded bg-[#dc0000] hover:bg-red-700 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer">
                            <Send size={11} aria-hidden="true" /> {t('materials.thickness.submit')}
                        </button>
                        <button type="button" onClick={() => setOpen(false)} className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 cursor-pointer">
                            <X size={11} aria-hidden="true" /> {t('materials.thickness.cancel')}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default PaperThicknessFields;

