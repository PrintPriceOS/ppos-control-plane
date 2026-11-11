/**
 * src/ui/components/pricing/EconomicProfilesTable.tsx
 *
 * PrintPrice OS — Phase 14C: Industrial Table of Economic Profiles
 *
 * Explicit Hierarchy:
 *   Máquina (Press Node) ➔ Formatos Mín/Máx Aceptados (mm) ➔ Familias de Encuadernación Viables ➔ Tarifas y Márgenes
 */
import React from 'react';
import { IndustrialTable, StatusBadge } from '../common';
import { useLocale } from '../../i18n';

export interface EconomicProfileRow {
    id: string;
    printerId: string;
    printerName: string;
    nodeId?: string;
    nodeName?: string;
    technology: string;
    technologyLabel?: string;
    supportedFamilies?: string[];
    minSheetWidthMm?: number;
    minSheetHeightMm?: number;
    maxSheetWidthMm?: number;
    maxSheetHeightMm?: number;
    scope: string;
    hourlyRateEur: number;
    setupFeeEur: number;
    plateCostEur?: number;
    targetMarginPct: number;
    platformMarkupPct?: number;
    minimumJobFeeEur: number;
    active: boolean;
    status?: string;
}

export function classifyProfileTechnology(p: Partial<EconomicProfileRow> & Record<string, any>): string {
    const rawTech = String(p.technology || p.machine_type || '').toUpperCase();
    const nameLower = String(p.printerName || p.printer_name || p.machine_name || '').toLowerCase();
    const maxW = Number(p.maxSheetWidthMm ?? p.max_sheet_width_mm ?? 750);
    const maxH = Number(p.maxSheetHeightMm ?? p.max_sheet_height_mm ?? 530);
    const maxDim = Math.max(maxW, maxH);

    if (
        rawTech === 'WEB_ROTARY' ||
        rawTech.includes('ROTARY') ||
        rawTech.includes('WEB') ||
        nameLower.includes('rotativa') ||
        nameLower.includes('lithoman') ||
        nameLower.includes('web offset')
    ) {
        return 'WEB_ROTARY';
    }
    if (
        rawTech === 'DIGITAL_TONER' ||
        rawTech === 'DIGITAL_PRESS' ||
        rawTech.includes('DIGITAL') ||
        nameLower.includes('indigo') ||
        nameLower.includes('digital') ||
        nameLower.includes('xerox') ||
        nameLower.includes('ricoh')
    ) {
        return 'DIGITAL_TONER';
    }
    if (rawTech === 'OFFSET_B1' || nameLower.includes('b1') || nameLower.includes('xl 106') || nameLower.includes('xl106')) {
        return 'OFFSET_B1';
    }
    if (rawTech === 'OFFSET_B2' || nameLower.includes('b2') || nameLower.includes('g29') || nameLower.includes('xl 75') || nameLower.includes('xl75')) {
        return 'OFFSET_B2';
    }
    if (maxDim >= 900) {
        return 'OFFSET_B1';
    }
    return 'OFFSET_B2';
}

export function cleanDisplayMachineName(p: Partial<EconomicProfileRow> & Record<string, any>): string {
    const raw = String(p.printerName || p.printer_name || p.machine_name || '').trim();
    const isRawHash = /^(mach|node)[_-][a-z0-9_-]{6,}/i.test(raw);
    if (raw && !isRawHash) {
        return raw;
    }
    const tech = classifyProfileTechnology(p);
    if (tech === 'DIGITAL_TONER') return 'HP Indigo 100K Digital Press';
    if (tech === 'WEB_ROTARY') return 'Manroland Lithoman IV Web Offset';
    if (tech === 'OFFSET_B1') return 'Heidelberg Speedmaster XL 106-8P';
    return 'Komori Lithrone G29 (B2)';
}

export interface EconomicProfilesTableProps {
    title?: string;
    loading?: boolean;
    profiles: EconomicProfileRow[];
    selectedFamilyFilter?: string;
    onFamilyFilterChange?: (familyId: string) => void;
    onRefresh?: () => void;
    onEditProfile: (profile: EconomicProfileRow) => void;
    onCalibrateProfile: (profile: EconomicProfileRow, initialFamily?: string) => void;
    onDuplicateProfile: (profile: EconomicProfileRow) => void;
    onDeleteProfile?: (profile: EconomicProfileRow) => void;
}

const FAMILY_BADGE_META: Record<string, { label: { en: string; de: string; es: string }; shortLabel: string; colorClass: string }> = {
    HARDCOVER: {
        label: {
            en: 'Hardcover (Casebound)',
            de: 'Hardcover (Deckenband)',
            es: 'Hardcover (Tapa Dura)'
        },
        shortLabel: 'HARDCOVER',
        colorClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
    },
    SOFTCOVER: {
        label: {
            en: 'Softcover (PUR Perfect Bound)',
            de: 'Softcover (PUR-Klebebindung)',
            es: 'Softcover (Rústica PUR)'
        },
        shortLabel: 'SOFTCOVER',
        colorClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
    },
    WIRE_O: {
        label: {
            en: 'Wire-O (Spiral)',
            de: 'Wire-O (Spiralbindung)',
            es: 'Wire-O (Espiral)'
        },
        shortLabel: 'WIRE-O',
        colorClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
    },
    SADDLE_STITCH: {
        label: {
            en: 'Saddle Stitch (Stapled)',
            de: 'Rückstichheftung (Klammer)',
            es: 'Saddle Stitch (Grapado)'
        },
        shortLabel: 'SADDLE STITCH',
        colorClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
    }
};

function getSupportedFamiliesForProfile(p: EconomicProfileRow): string[] {
    if (Array.isArray(p.supportedFamilies) && p.supportedFamilies.length > 0) {
        return p.supportedFamilies;
    }
    if (p.technology === 'WEB_ROTARY') {
        return ['SOFTCOVER', 'SADDLE_STITCH'];
    }
    return ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'];
}

function getFormatBoundsForProfile(p: EconomicProfileRow): { minLabel: string; maxLabel: string } {
    const tech = p.technology || 'OFFSET_B1';
    const minW = p.minSheetWidthMm ?? (tech === 'OFFSET_B1' ? 280 : tech === 'WEB_ROTARY' ? 420 : 148);
    const minH = p.minSheetHeightMm ?? (tech === 'OFFSET_B1' ? 400 : tech === 'WEB_ROTARY' ? 594 : 210);
    const maxW = p.maxSheetWidthMm ?? (tech === 'OFFSET_B1' ? 1060 : tech === 'WEB_ROTARY' ? 1260 : 750);
    const maxH = p.maxSheetHeightMm ?? (tech === 'OFFSET_B1' ? 750 : tech === 'WEB_ROTARY' ? 900 : 530);
    return {
        minLabel: `${minW}×${minH} mm`,
        maxLabel: `${maxW}×${maxH} mm`
    };
}

export const EconomicProfilesTable: React.FC<EconomicProfilesTableProps> = ({
    title,
    loading = false,
    profiles = [],
    selectedFamilyFilter = 'ALL',
    onFamilyFilterChange,
    onRefresh,
    onEditProfile,
    onCalibrateProfile,
    onDuplicateProfile,
    onDeleteProfile
}) => {
    const { locale } = useLocale();
    const loc = (locale === 'es' || locale === 'de' ? locale : 'en') as 'en' | 'de' | 'es';

    const uiText = {
        en: {
            defaultTitle: 'ACTIVE ECONOMIC PROFILES',
            emptyEntity: 'PRICING PROFILES',
            hierarchyTitle: 'PRODUCTION HIERARCHY: MACHINE ➔ MIN/MAX FORMAT ➔ VIABLE FAMILIES',
            filterAll: 'ALL FAMILIES',
            filterHardcover: 'HARDCOVER (CASEBOUND)',
            filterSoftcover: 'SOFTCOVER (PUR)',
            filterWireO: 'WIRE-O (SPIRAL)',
            filterSaddle: 'SADDLE STITCH (STAPLED)',
            colMachine: '1. MACHINE / PRESS',
            colFormats: '2. MIN / MAX FORMATS',
            colFamilies: '3. VIABLE BINDING FAMILIES',
            colRateSetup: 'RATE / SETUP',
            colMarginMin: 'MARGIN / MIN.',
            colStatus: 'STATUS',
            colActions: 'ACTIONS',
            minPrefix: 'Min:',
            maxPrefix: 'Max:',
            setupPrefix: 'Setup:',
            calibrateTooltip: (printer: string, fam: string) => `Calibrate ${printer} for ${fam}`,
            btnCalibrate: 'CALIBRATE',
            btnEdit: 'EDIT',
            btnDuplicate: 'DUPLICATE',
            btnDelete: 'DELETE',
            deleteTooltip: 'Delete Economic Profile'
        },
        de: {
            defaultTitle: 'AKTIVE WIRTSCHAFTSPROFILE',
            emptyEntity: 'PREISPROFILE',
            hierarchyTitle: 'PRODUKTIONSHIERARCHIE: MASCHINE ➔ MIN/MAX FORMAT ➔ KOMPATIBLE FAMILIEN',
            filterAll: 'ALLE FAMILIEN',
            filterHardcover: 'HARDCOVER (DECKENBAND)',
            filterSoftcover: 'SOFTCOVER (PUR)',
            filterWireO: 'WIRE-O (SPIRALBINDUNG)',
            filterSaddle: 'RÜCKSTICHHEFTUNG (KLAMMER)',
            colMachine: '1. MASCHINE / DRUCKMASCHINE',
            colFormats: '2. MIN / MAX FORMATE',
            colFamilies: '3. KOMPATIBLE BINDEFAMILIEN',
            colRateSetup: 'STUNDENSATZ / RÜSTEN',
            colMarginMin: 'MARGE / MIN.',
            colStatus: 'STATUS',
            colActions: 'AKTIONEN',
            minPrefix: 'Min:',
            maxPrefix: 'Max:',
            setupPrefix: 'Rüsten:',
            calibrateTooltip: (printer: string, fam: string) => `${printer} für ${fam} kalibrieren`,
            btnCalibrate: 'KALIBRIEREN',
            btnEdit: 'BEARBEITEN',
            btnDuplicate: 'DUPLIZIEREN',
            btnDelete: 'LÖSCHEN',
            deleteTooltip: 'Wirtschaftsprofil löschen'
        },
        es: {
            defaultTitle: 'PERFILES ECONÓMICOS ACTIVOS',
            emptyEntity: 'PERFILES DE PRECIOS',
            hierarchyTitle: 'JERARQUÍA DE PRODUCCIÓN: MÁQUINA ➔ FORMATO MÍN/MÁX ➔ FAMILIAS VIABLES',
            filterAll: 'TODAS LAS FAMILIAS',
            filterHardcover: 'TAPA DURA (HARDCOVER)',
            filterSoftcover: 'RÚSTICA PUR (SOFTCOVER)',
            filterWireO: 'WIRE-O (ESPIRAL)',
            filterSaddle: 'GRAPADO (SADDLE)',
            colMachine: '1. MÁQUINA / PRENSA',
            colFormats: '2. FORMATOS MÍN / MÁX',
            colFamilies: '3. FAMILIAS DE ENCUADERNACIÓN VIABLES',
            colRateSetup: 'TARIFA / SETUP',
            colMarginMin: 'MARGEN / MÍN.',
            colStatus: 'ESTADO',
            colActions: 'ACCIONES',
            minPrefix: 'Mín:',
            maxPrefix: 'Máx:',
            setupPrefix: 'Setup:',
            calibrateTooltip: (printer: string, fam: string) => `Calibrar ${printer} para ${fam}`,
            btnCalibrate: 'CALIBRAR',
            btnEdit: 'EDITAR',
            btnDuplicate: 'DUPLICAR',
            btnDelete: 'ELIMINAR',
            deleteTooltip: 'Eliminar Perfil Económico'
        }
    }[loc];

    const filteredProfiles =
        selectedFamilyFilter && selectedFamilyFilter !== 'ALL'
            ? profiles.filter((p) => getSupportedFamiliesForProfile(p).includes(selectedFamilyFilter))
            : profiles;

    return (
        <div data-testid="economic-profiles-table" className="space-y-3">
            {/* Product / Binding Family Filter Bar */}
            {onFamilyFilterChange && (
                <div
                    data-testid="profiles-family-filter-bar"
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#1f2228]"
                >
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#dc2626]" />
                        <span className="text-[11px] font-mono font-black uppercase tracking-wider text-slate-400">
                            {uiText.hierarchyTitle}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {[
                            { id: 'ALL', label: uiText.filterAll },
                            { id: 'HARDCOVER', label: uiText.filterHardcover },
                            { id: 'SOFTCOVER', label: uiText.filterSoftcover },
                            { id: 'WIRE_O', label: uiText.filterWireO },
                            { id: 'SADDLE_STITCH', label: uiText.filterSaddle }
                        ].map((f) => {
                            const active = selectedFamilyFilter === f.id;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    data-testid={`filter-family-btn-${f.id}`}
                                    onClick={() => onFamilyFilterChange(f.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer border ${
                                        active
                                            ? 'bg-[#dc2626] text-white border-[#dc2626]'
                                            : 'bg-slate-100 dark:bg-[#0a0b0d] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#1f2228] hover:text-white'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <IndustrialTable
                title={title || uiText.defaultTitle}
                loading={loading}
                onRefresh={onRefresh}
                data={filteredProfiles}
                emptyEntityName={uiText.emptyEntity}
                columns={[
                    {
                        key: 'printer',
                        header: uiText.colMachine,
                        render: (p: any) => {
                            const displayName = cleanDisplayMachineName(p);
                            const classifiedTech = classifyProfileTechnology(p);
                            const nodeLabel =
                                p.nodeName ||
                                p.printhouse_name ||
                                (p.printerId && !/^mach[_-][a-f0-9]{10,}/i.test(String(p.printerId))
                                    ? String(p.printerId)
                                    : 'Printhouse Hub');
                            return (
                                <div>
                                    <div className="font-bold text-slate-900 dark:text-white">
                                        {displayName}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-mono font-black uppercase text-slate-700 dark:text-slate-300">
                                            {classifiedTech}
                                        </span>
                                        <span className="text-[10px] font-mono text-slate-400">
                                            {nodeLabel}
                                        </span>
                                    </div>
                                </div>
                            );
                        }
                    },
                    {
                        key: 'formats',
                        header: uiText.colFormats,
                        render: (p: EconomicProfileRow) => {
                            const bounds = getFormatBoundsForProfile(p);
                            return (
                                <div data-testid={`profile-formats-${p.id}`} className="font-mono text-[11px] space-y-0.5">
                                    <div className="text-slate-400">
                                        {uiText.minPrefix} <span className="text-slate-700 dark:text-slate-200 font-bold">{bounds.minLabel}</span>
                                    </div>
                                    <div className="text-slate-400">
                                        {uiText.maxPrefix} <span className="text-white font-black">{bounds.maxLabel}</span>
                                    </div>
                                </div>
                            );
                        }
                    },
                    {
                        key: 'families',
                        header: uiText.colFamilies,
                        render: (p: EconomicProfileRow) => {
                            const fams = getSupportedFamiliesForProfile(p);
                            return (
                                <div
                                    data-testid={`profile-families-${p.id}`}
                                    className="flex flex-wrap items-center gap-1 max-w-[270px]"
                                >
                                    {fams.map((famId) => {
                                        const meta = FAMILY_BADGE_META[famId] || {
                                            label: { en: famId, de: famId, es: famId },
                                            shortLabel: famId,
                                            colorClass: 'bg-slate-800 text-slate-300 border-slate-700'
                                        };
                                        const localizedFamLabel = typeof meta.label === 'string' ? meta.label : meta.label[loc];
                                        return (
                                            <button
                                                key={famId}
                                                type="button"
                                                title={uiText.calibrateTooltip(p.printerName, localizedFamLabel)}
                                                onClick={() => onCalibrateProfile(p, famId)}
                                                className={`px-2 py-0.5 rounded border text-[9px] font-mono font-black uppercase tracking-wider transition-colors cursor-pointer ${meta.colorClass}`}
                                            >
                                                {meta.shortLabel}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        }
                    },
                    {
                        key: 'hourlyRate',
                        header: uiText.colRateSetup,
                        render: (p: any) => (
                            <div className="font-mono">
                                <div className="font-black text-slate-900 dark:text-white text-xs">
                                    €{Number(p.hourlyRateEur ?? 185).toFixed(2)}/h
                                </div>
                                <div className="text-[10px] text-slate-400">
                                    {uiText.setupPrefix} €{Number(p.setupFeeEur ?? 150).toFixed(0)}
                                    {Number(p.plateCostEur) > 0 ? ` · CTP: €${Number(p.plateCostEur).toFixed(0)}` : ''}
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'margin',
                        header: uiText.colMarginMin,
                        render: (p: any) => (
                            <div className="font-mono">
                                <span className="font-black text-[#10b981] text-xs">
                                    {p.targetMarginPct ?? p.target_margin_pct ?? 28}%
                                </span>
                                <div className="text-[10px] text-slate-400">
                                    {uiText.minPrefix} €{Number(p.minimumJobFeeEur ?? p.minimum_job_fee ?? 150).toFixed(0)}
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'status',
                        header: uiText.colStatus,
                        render: (p: any) => (
                            <StatusBadge status={p.active !== false ? 'ACTIVE' : 'INACTIVE'} />
                        )
                    },
                    {
                        key: 'actions',
                        header: uiText.colActions,
                        align: 'right',
                        render: (p: any) => (
                            <div className="flex items-center justify-end gap-1.5">
                                <button
                                    type="button"
                                    data-testid={`calibrate-profile-btn-${p.id}`}
                                    onClick={() => onCalibrateProfile(p)}
                                    className="px-2.5 py-1 rounded-md bg-[#dc2626]/15 hover:bg-[#dc2626] text-[#dc2626] hover:text-white border border-[#dc2626]/30 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                    {uiText.btnCalibrate}
                                </button>
                                <button
                                    type="button"
                                    data-testid={`edit-profile-btn-${p.id}`}
                                    onClick={() => onEditProfile(p)}
                                    className="px-2 py-1 rounded-md bg-slate-800/60 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                    {uiText.btnEdit}
                                </button>
                                <button
                                    type="button"
                                    data-testid={`duplicate-profile-btn-${p.id}`}
                                    onClick={() => onDuplicateProfile(p)}
                                    className="px-2 py-1 rounded-md bg-slate-800/40 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                    {uiText.btnDuplicate}
                                </button>
                                {onDeleteProfile && (
                                    <button
                                        type="button"
                                        data-testid={`delete-profile-btn-${p.id}`}
                                        onClick={() => onDeleteProfile(p)}
                                        className="px-2 py-1 rounded-md bg-red-950/30 hover:bg-[#dc2626] text-red-400 hover:text-white border border-red-900/40 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                        title={uiText.deleteTooltip}
                                    >
                                        {uiText.btnDelete}
                                    </button>
                                )}
                            </div>
                        )
                    }
                ]}
            />
        </div>
    );
};


