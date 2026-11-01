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

export interface EconomicProfileRow {
    id: string;
    printerId: string;
    printerName: string;
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

const FAMILY_BADGE_META: Record<string, { label: string; shortLabel: string; colorClass: string }> = {
    HARDCOVER: {
        label: 'Hardcover (Tapa Dura)',
        shortLabel: 'HARDCOVER',
        colorClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
    },
    SOFTCOVER: {
        label: 'Softcover (Rústica PUR)',
        shortLabel: 'SOFTCOVER',
        colorClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
    },
    WIRE_O: {
        label: 'Wire-O (Espiral)',
        shortLabel: 'WIRE-O',
        colorClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
    },
    SADDLE_STITCH: {
        label: 'Saddle Stitch (Grapado)',
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
    title = 'ACTIVE ECONOMIC PROFILES (MACHINE ➔ MIN/MAX FORMATS ➔ VIABLE BINDING FAMILIES)',
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
                            JERARQUÍA DE PRODUCCIÓN: MÁQUINA ➔ FORMATO MÍN/MÁX ➔ FAMILIAS VIABLES
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {[
                            { id: 'ALL', label: 'TODAS LAS FAMILIAS' },
                            { id: 'HARDCOVER', label: 'TAPA DURA (HARDCOVER)' },
                            { id: 'SOFTCOVER', label: 'RÚSTICA PUR (SOFTCOVER)' },
                            { id: 'WIRE_O', label: 'WIRE-O (ESPIRAL)' },
                            { id: 'SADDLE_STITCH', label: 'GRAPADO (SADDLE)' }
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
                title={title}
                loading={loading}
                onRefresh={onRefresh}
                data={filteredProfiles}
                emptyEntityName="PRICING PROFILES"
                columns={[
                    {
                        key: 'printer',
                        header: '1. MÁQUINA / PRENSA',
                        render: (p: any) => (
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white">
                                    {p.printerName || p.printer_name || 'N/A'}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-mono font-black uppercase text-slate-700 dark:text-slate-300">
                                        {p.technology || p.pricing_scope || 'OFFSET_B1'}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                        {p.printerId || p.printer_id || p.id}
                                    </span>
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'formats',
                        header: '2. FORMATOS MÍN / MÁX',
                        render: (p: EconomicProfileRow) => {
                            const bounds = getFormatBoundsForProfile(p);
                            return (
                                <div data-testid={`profile-formats-${p.id}`} className="font-mono text-[11px] space-y-0.5">
                                    <div className="text-slate-400">
                                        Mín: <span className="text-slate-700 dark:text-slate-200 font-bold">{bounds.minLabel}</span>
                                    </div>
                                    <div className="text-slate-400">
                                        Máx: <span className="text-white font-black">{bounds.maxLabel}</span>
                                    </div>
                                </div>
                            );
                        }
                    },
                    {
                        key: 'families',
                        header: '3. FAMILIAS DE ENCUADERNACIÓN VIABLES',
                        render: (p: EconomicProfileRow) => {
                            const fams = getSupportedFamiliesForProfile(p);
                            return (
                                <div
                                    data-testid={`profile-families-${p.id}`}
                                    className="flex flex-wrap items-center gap-1 max-w-[270px]"
                                >
                                    {fams.map((famId) => {
                                        const meta = FAMILY_BADGE_META[famId] || {
                                            label: famId,
                                            shortLabel: famId,
                                            colorClass: 'bg-slate-800 text-slate-300 border-slate-700'
                                        };
                                        return (
                                            <button
                                                key={famId}
                                                type="button"
                                                title={`Calibrar ${p.printerName} para ${meta.label}`}
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
                        header: 'TARIFA / SETUP',
                        render: (p: any) => (
                            <div className="font-mono">
                                <div className="font-black text-slate-900 dark:text-white text-xs">
                                    €{Number(p.hourlyRateEur ?? 185).toFixed(2)}/h
                                </div>
                                <div className="text-[10px] text-slate-400">
                                    Setup: €{Number(p.setupFeeEur ?? 150).toFixed(0)}
                                    {Number(p.plateCostEur) > 0 ? ` · CTP: €${Number(p.plateCostEur).toFixed(0)}` : ''}
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'margin',
                        header: 'MARGEN / MÍN.',
                        render: (p: any) => (
                            <div className="font-mono">
                                <span className="font-black text-[#10b981] text-xs">
                                    {p.targetMarginPct ?? p.target_margin_pct ?? 28}%
                                </span>
                                <div className="text-[10px] text-slate-400">
                                    Mín: €{Number(p.minimumJobFeeEur ?? p.minimum_job_fee ?? 150).toFixed(0)}
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'status',
                        header: 'STATUS',
                        render: (p: any) => (
                            <StatusBadge status={p.active !== false ? 'ACTIVE' : 'INACTIVE'} />
                        )
                    },
                    {
                        key: 'actions',
                        header: 'ACTIONS',
                        align: 'right',
                        render: (p: any) => (
                            <div className="flex items-center justify-end gap-1.5">
                                <button
                                    type="button"
                                    data-testid={`calibrate-profile-btn-${p.id}`}
                                    onClick={() => onCalibrateProfile(p)}
                                    className="px-2.5 py-1 rounded-md bg-[#dc2626]/15 hover:bg-[#dc2626] text-[#dc2626] hover:text-white border border-[#dc2626]/30 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                    CALIBRATE
                                </button>
                                <button
                                    type="button"
                                    data-testid={`edit-profile-btn-${p.id}`}
                                    onClick={() => onEditProfile(p)}
                                    className="px-2 py-1 rounded-md bg-slate-800/60 hover:bg-slate-700 text-slate-300 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                    EDIT
                                </button>
                                <button
                                    type="button"
                                    data-testid={`duplicate-profile-btn-${p.id}`}
                                    onClick={() => onDuplicateProfile(p)}
                                    className="px-2 py-1 rounded-md bg-slate-800/40 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                    DUPLICATE
                                </button>
                                {onDeleteProfile && (
                                    <button
                                        type="button"
                                        data-testid={`delete-profile-btn-${p.id}`}
                                        onClick={() => onDeleteProfile(p)}
                                        className="px-2 py-1 rounded-md bg-red-950/30 hover:bg-[#dc2626] text-red-400 hover:text-white border border-red-900/40 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                        title="Delete Economic Profile"
                                    >
                                        DELETE
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


