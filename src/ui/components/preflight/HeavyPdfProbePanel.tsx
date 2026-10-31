import React from 'react';
import {
    DocumentMagnifyingGlassIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    InformationCircleIcon,
    XCircleIcon,
    ScaleIcon,
} from '@heroicons/react/24/outline';

interface HeavyPdfProbeTool {
    raw_status?: string | null;
    semantic_status?: string | null;
    severity?: string | null;
    usable_output?: boolean;
    fatal?: boolean;
    warning_classes?: string[];
    fatal_classes?: string[];
    evidence?: Record<string, any>;
}

interface HeavyPdfProbeGovernance {
    heavy_pdf_detected?: boolean;
    file_size_bytes?: number;
    file_size_mb?: number;
    page_count?: number;
    probe_semantics_applied?: boolean;
    analysis_status?: string | null;
    analysis_degraded?: boolean;
    degraded_but_usable?: boolean;
    fatal_document_failure?: boolean;
    strict_forensic_mode?: boolean;
    review_required?: boolean;
    certifiable?: boolean;
    production_certified?: boolean;
    standard_certified?: boolean;
    probe_summary?: Record<string, number>;
    tools?: Record<string, HeavyPdfProbeTool>;
    warnings?: string[];
    review_required_reasons?: string[];
    degraded_reasons?: string[];
}

interface HeavyPdfProbePanelProps {
    heavyPdfProbeGovernance: HeavyPdfProbeGovernance | null | undefined;
    audience?: 'operator' | 'customer';
}

const WARNING_STATUSES = ['WARNING_ONLY', 'SUCCESS_WITH_WARNINGS', 'PARTIAL_SUCCESS'];

export const HeavyPdfProbePanel: React.FC<HeavyPdfProbePanelProps> = ({
    heavyPdfProbeGovernance,
    audience = 'operator',
}) => {
    const gov = heavyPdfProbeGovernance;
    if (!gov || !gov.heavy_pdf_detected) return null;

    const isOperator = audience === 'operator';

    const fatal = gov.fatal_document_failure === true;
    const reviewRequired = gov.review_required === true;
    const degradedButUsable = gov.degraded_but_usable === true;

    const panelBorder = fatal
        ? 'border-red-500/30 bg-red-500/5'
        : reviewRequired
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'ppos-border ppos-surface-muted';

    const headerColor = fatal
        ? 'text-red-600 dark:text-red-400'
        : reviewRequired
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-600 dark:text-slate-400';

    const HeaderIcon = fatal
        ? XCircleIcon
        : reviewRequired
        ? ExclamationTriangleIcon
        : InformationCircleIcon;

    const fileSizeMb = gov.file_size_mb || (gov.file_size_bytes ? gov.file_size_bytes / (1024 * 1024) : 0);

    let analysisQualityLabel = 'Standard';
    let analysisQualityTone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
    if (fatal) {
        analysisQualityLabel = 'Inspection failed';
        analysisQualityTone = 'danger';
    } else if (degradedButUsable) {
        analysisQualityLabel = 'Completed with warnings';
        analysisQualityTone = 'warning';
    } else if (gov.analysis_degraded) {
        analysisQualityLabel = 'Degraded';
        analysisQualityTone = 'warning';
    } else if (gov.probe_semantics_applied) {
        analysisQualityLabel = 'Completed';
        analysisQualityTone = 'success';
    }

    let nextAction = 'No additional action required.';
    if (fatal) {
        nextAction = 'Re-export or repair the source PDF and upload it again.';
    } else if (reviewRequired) {
        nextAction = 'A human review is required before this file can proceed to production.';
    }

    return (
        <div className={`border rounded-none p-4 font-manrope space-y-3 ${panelBorder}`}>

            {/* Header */}
            <div className={`flex items-center gap-2 ${headerColor}`}>
                <HeaderIcon className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                    Heavy PDF Analysis
                </span>
                {fatal && (
                    <span className="ml-auto px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30">
                        Technical Review Required
                    </span>
                )}
                {!fatal && reviewRequired && (
                    <span className="ml-auto px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        Review Required
                    </span>
                )}
            </div>

            {/* Status row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatusCell
                    label="File Size"
                    value={fileSizeMb ? `${fileSizeMb.toFixed(1)} MB` : '—'}
                    tone="neutral"
                    icon={ScaleIcon}
                />
                <StatusCell
                    label="Page Count"
                    value={gov.page_count ? String(gov.page_count) : '—'}
                    tone="neutral"
                    icon={DocumentMagnifyingGlassIcon}
                />
                <StatusCell
                    label="Analysis Quality"
                    value={analysisQualityLabel}
                    tone={analysisQualityTone}
                />
                <StatusCell
                    label="Review Required"
                    value={reviewRequired ? 'Yes' : 'No'}
                    tone={reviewRequired ? (fatal ? 'danger' : 'warning') : 'success'}
                />
            </div>

            {/* Customer-safe summary */}
            {!isOperator && (
                <p className="text-[11px] text-slate-600 dark:text-slate-400 font-bold">
                    {fatal
                        ? 'The PDF could not be reliably inspected because a critical probe failed.'
                        : degradedButUsable
                        ? 'The analysis completed, but some heavy-PDF probes returned warnings.'
                        : 'This file exceeds the heavy PDF size threshold. Additional analysis was performed.'}
                </p>
            )}

            {/* Operator: probe summary */}
            {isOperator && gov.probe_summary && Object.keys(gov.probe_summary).length > 0 && (
                <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                        Probe Summary
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(gov.probe_summary).map(([key, value]) => (
                            <span key={key} className="px-2 py-1 border ppos-border bg-white dark:bg-black/20 text-[9px] font-mono text-slate-600 dark:text-slate-400">
                                {key.replace(/_/g, ' ')}: <span className="font-bold">{String(value)}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Operator: per-tool semantic status and warning classes */}
            {isOperator && gov.tools && Object.keys(gov.tools).length > 0 && (
                <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                        Probe Tool Status
                    </span>
                    <div className="space-y-1">
                        {Object.entries(gov.tools).map(([toolName, tool]) => {
                            const isWarning = WARNING_STATUSES.includes(tool.semantic_status || '');
                            const isFatal = tool.fatal === true;
                            return (
                                <div key={toolName} className="flex flex-wrap items-center gap-2 p-2 border ppos-border bg-white dark:bg-black/20">
                                    {isFatal
                                        ? <XCircleIcon className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                        : isWarning
                                        ? <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                        : <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{toolName}</span>
                                    <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
                                        {tool.semantic_status || 'UNKNOWN'}
                                    </span>
                                    {tool.warning_classes && tool.warning_classes.length > 0 && (
                                        <div className="flex flex-wrap gap-1 ml-auto">
                                            {tool.warning_classes.map((wc, i) => (
                                                <span key={i} className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                    {wc.replace(/^PDF_/, '').replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Strict forensic mode notice (operator) */}
            {isOperator && gov.strict_forensic_mode === true && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    Strict forensic mode is enabled — automatic certification is not allowed when probe warnings reduce analysis confidence.
                </p>
            )}

            {/* Warnings */}
            {gov.warnings && gov.warnings.length > 0 && (
                <div className="space-y-1">
                    {gov.warnings.map((w, i) => (
                        <p key={i} className="text-[10px] text-amber-600 dark:text-amber-500 font-bold bg-amber-500/10 px-2 py-1 border border-amber-500/20">
                            {w}
                        </p>
                    ))}
                </div>
            )}

            {/* Next action */}
            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 border-t ppos-border pt-2">
                Next step: {nextAction}
            </p>
        </div>
    );
};

// Internal helper: metric cell
const StatusCell: React.FC<{
    label: string;
    value: string;
    tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
    icon?: React.ComponentType<{ className?: string }>;
}> = ({ label, value, tone, icon: Icon }) => {
    const toneClass =
        tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
        : tone === 'danger' ? 'text-red-600 dark:text-red-400'
        : tone === 'info' ? 'text-blue-600 dark:text-blue-400'
        : 'text-slate-600 dark:text-slate-400';

    return (
        <div className="p-2 border ppos-border ppos-surface-muted">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 block leading-none mb-1">{label}</span>
            <span className={`text-[10px] font-bold flex items-center gap-1 ${toneClass}`}>
                {Icon && <Icon className="w-3 h-3 shrink-0" />}
                {value}
            </span>
        </div>
    );
};
