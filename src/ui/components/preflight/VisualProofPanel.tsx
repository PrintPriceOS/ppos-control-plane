import React from 'react';
import {
    EyeIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    InformationCircleIcon,
    PhotoIcon,
    WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';

interface VisualDiffGovernance {
    visual_diff_required?: boolean;
    visual_diff_performed?: boolean;
    visual_change_detected?: boolean;
    visual_review_required?: boolean;
    render_tool_gap?: boolean;
    max_changed_pixel_ratio?: number;
    changed_pixel_ratio_avg?: number;
    pages_rendered?: number;
    pages_compared?: number;
    dimensions_match?: boolean | null;
    render_tool?: string | null;
    render_tool_version?: string | null;
    proof_artifacts_available?: boolean;
    thumbnail_artifact_ids?: string[];
    diff_image_artifact_ids?: string[];
    production_certified?: boolean;
    standard_certified?: boolean;
    warnings?: string[];
    limitations?: string[];
    evidence?: Record<string, any>;
}

interface VisualProofPanelProps {
    visualDiffGovernance: VisualDiffGovernance | null | undefined;
    audience?: 'operator' | 'customer';
    /** Optional: job ID used to build safe thumbnail URLs via the artifact endpoint */
    jobId?: string;
}

export const VisualProofPanel: React.FC<VisualProofPanelProps> = ({
    visualDiffGovernance,
    audience = 'operator',
    jobId,
}) => {
    const gov = visualDiffGovernance;
    if (!gov) return null;

    const isOperator = audience === 'operator';

    // Nothing relevant to show — no diff was required or performed
    const hasAnyInfo = gov.visual_diff_required || gov.visual_diff_performed
        || gov.visual_change_detected || gov.render_tool_gap
        || gov.proof_artifacts_available;
    if (!hasAnyInfo) return null;

    const reviewRequired = gov.visual_review_required === true
        || gov.visual_change_detected === true
        || (gov.visual_diff_required === true && !gov.visual_diff_performed);

    const panelBorder = reviewRequired
        ? 'border-amber-500/30 bg-amber-500/5'
        : gov.proof_artifacts_available
        ? 'border-blue-500/20 bg-blue-500/5'
        : 'ppos-border ppos-surface-muted';

    const headerColor = reviewRequired
        ? 'text-amber-600 dark:text-amber-400'
        : gov.proof_artifacts_available
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-slate-600 dark:text-slate-400';

    const HeaderIcon = reviewRequired
        ? ExclamationTriangleIcon
        : gov.proof_artifacts_available
        ? EyeIcon
        : InformationCircleIcon;

    const formatRatio = (r?: number) =>
        r != null ? `${(r * 100).toFixed(2)}%` : '—';

    return (
        <div className={`border rounded-none p-4 font-manrope space-y-3 ${panelBorder}`}>

            {/* Header */}
            <div className={`flex items-center gap-2 ${headerColor}`}>
                <HeaderIcon className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                    Visual Proof / Rendered Comparison
                </span>
                {reviewRequired && (
                    <span className="ml-auto px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        Review Required
                    </span>
                )}
                {!reviewRequired && gov.proof_artifacts_available && (
                    <span className="ml-auto px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        Visual Proof Available
                    </span>
                )}
            </div>

            {/* Status row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatusCell
                    label="Diff Performed"
                    value={gov.visual_diff_performed ? 'Yes' : (gov.visual_diff_required ? 'No — required' : 'No')}
                    tone={gov.visual_diff_performed ? 'success' : gov.visual_diff_required ? 'warning' : 'neutral'}
                />
                <StatusCell
                    label="Visual Change"
                    value={gov.visual_change_detected ? 'Detected' : (gov.visual_diff_performed ? 'None detected' : '—')}
                    tone={gov.visual_change_detected ? 'warning' : gov.visual_diff_performed ? 'success' : 'neutral'}
                />
                <StatusCell
                    label="Proof Artifacts"
                    value={gov.proof_artifacts_available ? 'Available' : 'None'}
                    tone={gov.proof_artifacts_available ? 'info' : 'neutral'}
                />
                <StatusCell
                    label="Tool Gap"
                    value={gov.render_tool_gap ? 'Yes — tool unavailable' : 'No'}
                    tone={gov.render_tool_gap ? 'warning' : 'neutral'}
                />
            </div>

            {/* Metrics (operator only) */}
            {isOperator && gov.visual_diff_performed && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatusCell label="Pages Rendered" value={String(gov.pages_rendered ?? '—')} tone="neutral" />
                    <StatusCell label="Pages Compared" value={String(gov.pages_compared ?? '—')} tone="neutral" />
                    <StatusCell label="Max Pixel Δ" value={formatRatio(gov.max_changed_pixel_ratio)} tone={gov.visual_change_detected ? 'warning' : 'neutral'} />
                    <StatusCell label="Avg Pixel Δ" value={formatRatio(gov.changed_pixel_ratio_avg)} tone="neutral" />
                </div>
            )}

            {/* Dimensions check (operator) */}
            {isOperator && gov.visual_diff_performed && gov.dimensions_match != null && (
                <div className="flex items-center gap-2">
                    {gov.dimensions_match
                        ? <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                        : <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" />}
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                        Page dimensions: {gov.dimensions_match ? 'match between original and corrected file' : 'mismatch detected between original and corrected file'}
                    </span>
                </div>
            )}

            {/* Render tool (operator) */}
            {isOperator && gov.render_tool && (
                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                    <WrenchScrewdriverIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>
                        Rendered using: <span className="font-bold">{gov.render_tool}</span>
                        {gov.render_tool_version ? ` v${gov.render_tool_version}` : ''}
                    </span>
                </div>
            )}

            {/* Proof artifact IDs — safe reference, no raw paths */}
            {isOperator && gov.thumbnail_artifact_ids && gov.thumbnail_artifact_ids.length > 0 && (
                <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                        Thumbnail Artifact IDs
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {gov.thumbnail_artifact_ids.map((id, i) => (
                            <ThumbnailRef key={i} artifactId={id} jobId={jobId} label={`Page ${i + 1}`} />
                        ))}
                    </div>
                </div>
            )}

            {isOperator && gov.diff_image_artifact_ids && gov.diff_image_artifact_ids.length > 0 && (
                <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                        Diff Image Artifact IDs
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {gov.diff_image_artifact_ids.map((id, i) => (
                            <ThumbnailRef key={i} artifactId={id} jobId={jobId} label={`Diff ${i + 1}`} />
                        ))}
                    </div>
                </div>
            )}

            {/* Customer-safe thumbnail placeholder when proofs are available */}
            {!isOperator && gov.proof_artifacts_available && (
                <div className="flex items-center gap-2 p-3 border ppos-border bg-slate-50 dark:bg-black/20">
                    <PhotoIcon className="w-5 h-5 text-slate-400 shrink-0" />
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 font-bold">
                        A rendered comparison was generated for this file.
                        {gov.visual_change_detected
                            ? ' Visual changes were detected and the file requires review before production.'
                            : ' No significant visual changes were detected.'}
                    </p>
                </div>
            )}

            {/* Limitations (operator) */}
            {isOperator && gov.limitations && gov.limitations.length > 0 && (
                <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Limitations</span>
                    <ul className="list-disc list-inside space-y-0.5">
                        {gov.limitations.map((l, i) => (
                            <li key={i} className="text-[10px] text-slate-500 dark:text-slate-400">{l}</li>
                        ))}
                    </ul>
                </div>
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

            {/* Governance disclaimer */}
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest border-t ppos-border pt-2">
                Visual diff is evidence generation only — it does not imply print-ready status, production certification, or PDF/X / PDF/A compliance.
            </p>
        </div>
    );
};

// Internal helper: safe artifact reference chip
const ThumbnailRef: React.FC<{ artifactId: string; jobId?: string; label: string }> = ({
    artifactId,
    jobId,
    label,
}) => {
    // Build a safe download-ticket URL if we have jobId; otherwise just show the ID
    const downloadUrl = jobId
        ? `/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/download-ticket`
        : null;

    const token = localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
    // Append secure token pass matching download route tolerance
    const authenticatedUrl = `/api/admin/preflight/artifacts/${artifactId}/download?token=${encodeURIComponent(token)}`;

    return (
        <div className="flex flex-col gap-2 p-2 border ppos-border bg-white dark:bg-black/20 text-[9px] font-mono text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1">
                <PhotoIcon className="w-3 h-3 shrink-0 text-slate-400" />
                <span className="truncate max-w-[120px]" title={artifactId}>{label}</span>
                {downloadUrl && (
                    <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-black text-[8px] uppercase tracking-widest ml-1"
                        title="Request download ticket"
                    >
                        Fetch
                    </a>
                )}
            </div>
            {/* Authenticated image preview to prevent 401 request denials across the Docker bridge gateway */}
            <div className="mt-1 max-w-[150px] border ppos-border overflow-hidden bg-slate-950/20">
                <img 
                    src={authenticatedUrl} 
                    alt={label} 
                    className="w-full h-auto max-h-[100px] object-contain"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />
            </div>
        </div>
    );
};

// Internal helper: metric cell
const StatusCell: React.FC<{ label: string; value: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = ({
    label,
    value,
    tone,
}) => {
    const toneClass =
        tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
        : tone === 'info' ? 'text-blue-600 dark:text-blue-400'
        : 'text-slate-600 dark:text-slate-400';

    return (
        <div className="p-2 border ppos-border ppos-surface-muted">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 block leading-none mb-1">{label}</span>
            <span className={`text-[10px] font-bold ${toneClass}`}>{value}</span>
        </div>
    );
};
