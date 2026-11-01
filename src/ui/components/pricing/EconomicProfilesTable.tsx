/**
 * src/ui/components/pricing/EconomicProfilesTable.tsx
 *
 * PrintPrice OS — Phase 14: Industrial Table of Economic Profiles
 *
 * Columns:
 * - PRINTER / MACHINE
 * - TECHNOLOGY / SCOPE
 * - HOURLY RATE (€/h)
 * - SETUP FEE (€)
 * - TARGET MARGIN %
 * - MIN. ORDER FEE (€)
 * - STATUS
 * - ACTIONS (Edit, Calibrate, Duplicate)
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
    onRefresh?: () => void;
    onEditProfile: (profile: EconomicProfileRow) => void;
    onCalibrateProfile: (profile: EconomicProfileRow) => void;
    onDuplicateProfile: (profile: EconomicProfileRow) => void;
    onDeleteProfile?: (profile: EconomicProfileRow) => void;
}

export const EconomicProfilesTable: React.FC<EconomicProfilesTableProps> = ({
    title = 'ACTIVE ECONOMIC PROFILES',
    loading = false,
    profiles = [],
    onRefresh,
    onEditProfile,
    onCalibrateProfile,
    onDuplicateProfile,
    onDeleteProfile
}) => {
    return (
        <div data-testid="economic-profiles-table">
            <IndustrialTable
                title={title}
                loading={loading}
                onRefresh={onRefresh}
                data={profiles}
                emptyEntityName="PRICING PROFILES"
                columns={[
                    {
                        key: 'printer',
                        header: 'PRINTER / MACHINE',
                        render: (p: any) => (
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white">
                                    {p.printerName || p.printer_name || 'N/A'}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400">
                                    {p.printerId || p.printer_id || p.id}
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'technology',
                        header: 'TECHNOLOGY / SCOPE',
                        render: (p: any) => (
                            <div className="flex flex-col gap-0.5">
                                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-black uppercase text-slate-700 dark:text-slate-300 w-fit">
                                    {p.technology || p.pricing_scope || 'OFFSET_B1'}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                    {p.technologyLabel || p.scope || 'GLOBAL'}
                                </span>
                            </div>
                        )
                    },
                    {
                        key: 'hourlyRate',
                        header: 'HOURLY RATE (€/h)',
                        render: (p: any) => (
                            <div>
                                <span className="font-mono font-black text-slate-900 dark:text-white">
                                    €{Number(p.hourlyRateEur ?? 185).toFixed(2)}/h
                                </span>
                                {Number(p.plateCostEur) > 0 && (
                                    <div className="text-[10px] font-mono text-slate-400">
                                        CTP: €{Number(p.plateCostEur).toFixed(0)}/plate
                                    </div>
                                )}
                            </div>
                        )
                    },
                    {
                        key: 'setupFee',
                        header: 'SETUP FEE (€)',
                        render: (p: any) => (
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                                €{Number(p.setupFeeEur ?? 150).toFixed(2)}
                            </span>
                        )
                    },
                    {
                        key: 'margin',
                        header: 'TARGET MARGIN %',
                        render: (p: any) => (
                            <div>
                                <span className="font-mono font-black text-[#10b981]">
                                    {p.targetMarginPct ?? p.target_margin_pct ?? 28}%
                                </span>
                                <div className="text-[10px] font-mono text-slate-400">
                                    +{p.platformMarkupPct ?? p.platform_markup_pct ?? 8}% Platform
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'minFee',
                        header: 'MIN. ORDER FEE (€)',
                        render: (p: any) => (
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                                €{Number(p.minimumJobFeeEur ?? p.minimum_job_fee ?? 150).toFixed(2)}
                            </span>
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
                            <div className="flex items-center justify-end gap-2">
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

