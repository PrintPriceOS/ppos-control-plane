/**
 * src/ui/components/pricing/RoutingRulesTab.tsx
 *
 * PrintPrice OS — Phase 14: Digital vs. Offset Crossover Point & Economic Routing Rules
 *
 * Responsibilities:
 * 1. Displays the interactive Digital vs. Offset Crossover Point threshold (copy count where
 *    Sheetfed Offset becomes cheaper per copy than Digital SRA3 due to CTP plate amortization).
 * 2. Comparative Print-Run Curve (100 to 5,000 copies) showing Digital Unit Price vs. Offset Unit Price.
 * 3. Economic Routing Decisions table & Conflict Inspector.
 */
import React from 'react';
import { IndustrialTable } from '../common';

export interface CrossoverCurvePoint {
    copies: number;
    digitalTotalEur: number;
    digitalUnitEur: number;
    offsetTotalEur: number;
    offsetUnitEur: number;
    savingsEur: number;
    recommendedTechnology: string;
    recommendedPrinterName: string;
}

export interface CrossoverAnalysis {
    crossoverCopies: number;
    explanation: string;
    digitalMachine: { id: string; printerName: string; technology: string };
    offsetMachine: { id: string; printerName: string; technology: string };
    curve: CrossoverCurvePoint[];
}

export interface RoutingRulesTabProps {
    loading?: boolean;
    crossover: CrossoverAnalysis | null;
    routingHistory: any[];
    conflicts: any[];
    onRefresh?: () => void;
}

export const RoutingRulesTab: React.FC<RoutingRulesTabProps> = ({
    loading = false,
    crossover,
    routingHistory = [],
    conflicts = [],
    onRefresh
}) => {
    return (
        <div data-testid="routing-rules-tab" className="space-y-6">
            {/* 1. Digital vs. Offset Crossover Point Telemetry Card */}
            {crossover && (
                <div
                    data-testid="crossover-analyzer-card"
                    className="p-6 rounded-xl bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#1f2228] space-y-5"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#1f2228] pb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-[#dc2626]/15 border border-[#dc2626]/30 text-[#dc2626] font-mono text-[10px] font-black uppercase">
                                    CROSSOVER ENGINE
                                </span>
                                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white m-0">
                                    Digital vs. Offset Economic Crossover Point
                                </h3>
                            </div>
                            <p className="text-xs text-slate-400 mt-1 m-0">
                                {crossover.explanation}
                            </p>
                        </div>

                        <div className="px-4 py-3 rounded-xl bg-slate-950 border border-[#1f2228] text-right shrink-0">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                                CROSSOVER THRESHOLD
                            </div>
                            <div
                                data-testid="crossover-copies-badge"
                                className="text-2xl font-mono font-black text-[#10b981]"
                            >
                                {crossover.crossoverCopies} copies
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                                &lt; {crossover.crossoverCopies}: Digital · ≥ {crossover.crossoverCopies}: Offset
                            </div>
                        </div>
                    </div>

                    {/* Crossover Curve Grid */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-[#1f2228] text-[10px] font-mono font-black uppercase text-slate-400">
                                    <th className="py-2.5 px-3">PRINT RUN (COPIES)</th>
                                    <th className="py-2.5 px-3">DIGITAL TOTAL (€)</th>
                                    <th className="py-2.5 px-3">DIGITAL UNIT (€/ex)</th>
                                    <th className="py-2.5 px-3">OFFSET TOTAL (€)</th>
                                    <th className="py-2.5 px-3">OFFSET UNIT (€/ex)</th>
                                    <th className="py-2.5 px-3">NET SAVINGS</th>
                                    <th className="py-2.5 px-3 text-right">ROUTING RECOMMENDATION</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/60 dark:divide-[#1f2228]">
                                {crossover.curve.map((pt) => {
                                    const isOffsetWinner = pt.recommendedTechnology.startsWith('OFFSET');
                                    return (
                                        <tr key={pt.copies} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                                            <td className="py-2.5 px-3 font-mono font-black text-slate-900 dark:text-white">
                                                {pt.copies.toLocaleString()} ex.
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                                                €{pt.digitalTotalEur.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-500">
                                                €{pt.digitalUnitEur.toFixed(3)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                                                €{pt.offsetTotalEur.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-500">
                                                €{pt.offsetUnitEur.toFixed(3)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono font-bold text-[#10b981]">
                                                +€{pt.savingsEur.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right">
                                                <span
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase ${
                                                        isOffsetWinner
                                                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                    }`}
                                                >
                                                    {pt.recommendedTechnology} · {pt.recommendedPrinterName}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 2. Historical Economic Routing Decisions Table */}
            <IndustrialTable
                title="ECONOMIC ROUTING DECISIONS"
                loading={loading}
                onRefresh={onRefresh}
                data={routingHistory}
                emptyEntityName="ROUTING DECISIONS"
                columns={[
                    {
                        key: 'job',
                        header: 'TASK / JOB',
                        render: (h: any) => (
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white">{h.job_name}</div>
                                <div className="text-[10px] font-mono font-black text-slate-400">{h.job_id}</div>
                            </div>
                        )
                    },
                    {
                        key: 'node',
                        header: 'SELECTED NODE',
                        render: (h: any) => (
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white">
                                    {h.final_decision_json?.printer_name || 'N/A'}
                                </div>
                                {h.final_decision_json?.selected_reason && (
                                    <div className="text-[10px] text-slate-400 max-w-md truncate">
                                        {h.final_decision_json.selected_reason}
                                    </div>
                                )}
                            </div>
                        )
                    },
                    {
                        key: 'score',
                        header: 'FINAL SCORE',
                        render: (h: any) => {
                            const score = h.final_decision_json?.final_routing_score ?? 0;
                            return (
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-black text-slate-900 dark:text-white">{score}</span>
                                    <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-[#10b981]" style={{ width: `${score}%` }} />
                                    </div>
                                </div>
                            );
                        }
                    },
                    {
                        key: 'margin',
                        header: 'ESTIMATED MARGIN',
                        render: (h: any) => (
                            <div>
                                <div className="font-mono font-black text-xs text-[#10b981]">
                                    {h.final_decision_json?.margin_pct ?? 0}%
                                </div>
                                <div className="font-mono text-[10px] text-slate-400">
                                    +{h.final_decision_json?.estimated_margin ?? 0} EUR
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'date',
                        header: 'DECISION DATE',
                        render: (h: any) => (
                            <span className="font-mono text-[10px] text-slate-400">
                                {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                            </span>
                        )
                    }
                ]}
            />

            {/* 3. Economic Conflict Inspector */}
            <div className="rounded-xl border overflow-hidden transition-all bg-white dark:bg-[#14161a] border-slate-200 dark:border-[#1f2228]">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-rose-950/20 border-rose-900/40">
                    <h3 className="font-black text-xs uppercase tracking-widest text-rose-400 m-0">
                        Economic Conflict Inspector
                    </h3>
                </div>
                <div className="divide-y divide-rose-950/20">
                    {conflicts.map((c, i) => (
                        <div key={i} className="px-6 py-4 flex items-start gap-4">
                            <div className="mt-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase text-rose-400">{c.conflict_type}</span>
                                    <span className="text-[10px] font-bold text-slate-400">• {c.job_name}</span>
                                </div>
                                <p className="text-xs mt-0.5 text-slate-900 dark:text-white">{c.conflict_description}</p>
                            </div>
                        </div>
                    ))}
                    {conflicts.length === 0 && (
                        <div className="px-6 py-8 text-center uppercase font-black text-xs tracking-widest text-slate-400">
                            No economic conflicts detected
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

