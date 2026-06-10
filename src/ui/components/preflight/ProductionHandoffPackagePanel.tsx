import React, { useState } from 'react';
import {
    ArchiveBoxIcon,
    ExclamationTriangleIcon,
    LockClosedIcon,
    LockOpenIcon,
    ArrowDownTrayIcon,
    ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import { getAdminPreflightProductionHandoffPackage } from '../../lib/adminApi';

interface ProductionPackageGovernance {
    package_ready?: boolean;
    approved_artifact_type?: string | null;
    approved_artifact_hash?: string | null;
    included_reports?: string[];
    blocked_by_governance_domains?: string[];
    warnings?: string[];
    evidence?: Record<string, any>;
}

interface PackageReleaseGate {
    ready: boolean;
    blockers: string[];
}

interface HandoffPackage {
    ok: boolean;
    job_id: string;
    order_id: string | null;
    generated_at: string;
    package_release_gate: PackageReleaseGate;
    approved_artifact: { type: string | null; hash: string | null } | null;
    included_reports: string[];
    human_report_summary: {
        recommended_next_action: string | null;
        review_required: boolean;
        production_certified: boolean;
        highest_risk_level: string;
    };
    fix_audit_summary: {
        applied_count: number;
        skipped_count: number;
        failed_count: number;
    };
    validation_report_summary: {
        standard_claimed: string | null;
        standard_certified: boolean;
        validation_performed: boolean;
        validation_passed: boolean;
        validator_name: string | null;
        validator_version: string | null;
        validation_report_hash: string | null;
    } | null;
    artifact_trust: Record<string, any>;
    warnings: string[];
    payment_status: {
        invoice_status: string;
        payment_status: string;
        production_unlock_status: string;
    };
    order_summary: {
        order_id: string | null;
        status: string | null;
        printhouse_id: string | null;
        customer_name: string | null;
        total: number | null;
        currency: string | null;
    } | null;
    file_access_audit: Array<{
        event_type: string;
        actor: string | null;
        role: string | null;
        created_at: string | null;
    }>;
}

interface ProductionHandoffPackagePanelProps {
    productionPackageGovernance?: ProductionPackageGovernance | null;
    jobId: string;
    audience?: 'operator' | 'customer';
}

const BLOCKER_LABELS: Record<string, string> = {
    PREFLIGHT_PACKAGE_NOT_READY: 'Preflight package not ready',
    GOVERNANCE_DOMAINS_BLOCKING: 'Governance domains blocking',
    INVOICE_NOT_ISSUED: 'Invoice not issued',
    PAYMENT_NOT_CONFIRMED: 'Payment not confirmed',
    PRODUCTION_NOT_UNLOCKED: 'Production not unlocked',
};

export const ProductionHandoffPackagePanel: React.FC<ProductionHandoffPackagePanelProps> = ({
    productionPackageGovernance,
    jobId,
    audience = 'operator',
}) => {
    const [pkg, setPkg] = useState<HandoffPackage | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const gov = productionPackageGovernance;

    // Printhouse handoff packaging is an operator/printhouse concern, not customer-facing.
    if (audience !== 'operator') return null;
    if (!gov || gov.package_ready === undefined) return null;

    const handleLoad = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getAdminPreflightProductionHandoffPackage(jobId);
            if (res?.ok === false) {
                setError(res?.error?.message || 'Unable to load handoff package');
            } else {
                setPkg(res);
            }
        } catch (e: any) {
            setError(e?.message || 'Unable to load handoff package');
        } finally {
            setLoading(false);
        }
    };

    const gateReady = pkg?.package_release_gate?.ready ?? gov.package_ready === true;
    const blockers = pkg?.package_release_gate?.blockers ?? gov.blocked_by_governance_domains ?? [];
    const warnings = pkg?.warnings ?? gov.warnings ?? [];

    const panelBorder = gateReady
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-amber-500/30 bg-amber-500/5';

    const headerColor = gateReady
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-600 dark:text-amber-400';

    return (
        <div className={`border rounded-none p-4 font-manrope space-y-3 ${panelBorder}`}>

            {/* Header */}
            <div className={`flex items-center gap-2 ${headerColor}`}>
                <ArchiveBoxIcon className="w-4 h-4 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                    Printhouse Handoff Package
                </span>
                <span className={`ml-auto px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border flex items-center gap-1 ${
                    gateReady
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}>
                    {gateReady ? <LockOpenIcon className="w-3 h-3" /> : <LockClosedIcon className="w-3 h-3" />}
                    {gateReady ? 'Release Ready' : 'Release Blocked'}
                </span>
            </div>

            {/* Status grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatusCell
                    label="Preflight Package"
                    value={gov.package_ready ? 'Ready' : 'Not Ready'}
                    tone={gov.package_ready ? 'success' : 'warning'}
                />
                <StatusCell
                    label="Release Gate"
                    value={gateReady ? 'Cleared' : 'Blocked'}
                    tone={gateReady ? 'success' : 'warning'}
                />
                <StatusCell
                    label="Included Reports"
                    value={String((pkg?.included_reports ?? gov.included_reports ?? []).length)}
                    tone="info"
                />
                <StatusCell
                    label="Approved Artifact"
                    value={pkg?.approved_artifact?.type ? pkg.approved_artifact.type : '—'}
                    tone={pkg?.approved_artifact ? 'success' : 'neutral'}
                />
            </div>

            {/* Blockers */}
            {blockers.length > 0 && (
                <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                        Release Blockers
                    </span>
                    {blockers.map((b, i) => (
                        <p key={i} className="text-[10px] text-amber-600 dark:text-amber-500 font-bold bg-amber-500/10 px-2 py-1 border border-amber-500/20 flex items-center gap-1.5">
                            <ExclamationTriangleIcon className="w-3 h-3 shrink-0" />
                            {BLOCKER_LABELS[b] || b}
                        </p>
                    ))}
                </div>
            )}

            {/* Load button */}
            {!pkg && (
                <button
                    type="button"
                    onClick={handleLoad}
                    disabled={loading}
                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border ppos-border ppos-surface-muted hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50 flex items-center gap-1.5"
                >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                    {loading ? 'Loading…' : 'Load Handoff Package'}
                </button>
            )}

            {error && (
                <p className="text-[10px] text-red-600 dark:text-red-400 font-bold bg-red-500/10 px-2 py-1 border border-red-500/20">
                    {error}
                </p>
            )}

            {/* Loaded package details */}
            {pkg && (
                <div className="space-y-3 border-t ppos-border pt-3">

                    {/* Approved artifact */}
                    <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                            Approved Production Artifact
                        </span>
                        {pkg.approved_artifact ? (
                            <div className="p-2 border ppos-border ppos-surface-muted space-y-0.5">
                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                    Type: <span className="font-mono">{pkg.approved_artifact.type || '—'}</span>
                                </p>
                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 break-all">
                                    Hash: <span className="font-mono">{pkg.approved_artifact.hash || '—'}</span>
                                </p>
                            </div>
                        ) : (
                            <p className="text-[11px] text-slate-400 italic">
                                Withheld — release gate not satisfied
                            </p>
                        )}
                    </div>

                    {/* Included reports */}
                    {pkg.included_reports.length > 0 && (
                        <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                                Included Reports
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {pkg.included_reports.map((r, i) => (
                                    <span key={i} className="px-2 py-1 text-[9px] font-mono border ppos-border ppos-surface-muted text-slate-600 dark:text-slate-400">
                                        {r}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Human report / fix audit summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <StatusCell
                            label="Review Required"
                            value={pkg.human_report_summary.review_required ? 'Yes' : 'No'}
                            tone={pkg.human_report_summary.review_required ? 'warning' : 'success'}
                        />
                        <StatusCell
                            label="Risk Level"
                            value={pkg.human_report_summary.highest_risk_level}
                            tone={pkg.human_report_summary.highest_risk_level === 'NONE' ? 'success' : 'warning'}
                        />
                        <StatusCell
                            label="Fixes Applied"
                            value={String(pkg.fix_audit_summary.applied_count)}
                            tone="info"
                        />
                        <StatusCell
                            label="Fixes Failed"
                            value={String(pkg.fix_audit_summary.failed_count)}
                            tone={pkg.fix_audit_summary.failed_count > 0 ? 'warning' : 'neutral'}
                        />
                    </div>

                    {/* Validation report summary */}
                    {pkg.validation_report_summary && (
                        <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                                Validation Report
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <StatusCell
                                    label="Standard Claimed"
                                    value={pkg.validation_report_summary.standard_claimed || '—'}
                                    tone="neutral"
                                />
                                <StatusCell
                                    label="Validation Performed"
                                    value={pkg.validation_report_summary.validation_performed ? 'Yes' : 'No'}
                                    tone={pkg.validation_report_summary.validation_performed ? 'info' : 'neutral'}
                                />
                                <StatusCell
                                    label="Validation Passed"
                                    value={pkg.validation_report_summary.validation_passed ? 'Yes' : 'No'}
                                    tone={pkg.validation_report_summary.validation_passed ? 'success' : 'warning'}
                                />
                                <StatusCell
                                    label="Standard Certified"
                                    value={pkg.validation_report_summary.standard_certified ? 'Yes' : 'No'}
                                    tone="neutral"
                                />
                            </div>
                        </div>
                    )}

                    {/* Payment / invoice / production unlock status */}
                    <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                            Payment &amp; Production Unlock
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <StatusCell
                                label="Invoice"
                                value={pkg.payment_status.invoice_status}
                                tone={pkg.payment_status.invoice_status === 'ISSUED' ? 'success' : 'warning'}
                            />
                            <StatusCell
                                label="Payment"
                                value={pkg.payment_status.payment_status}
                                tone={pkg.payment_status.payment_status === 'PAYMENT_CONFIRMED' ? 'success' : 'warning'}
                            />
                            <StatusCell
                                label="Production Unlock"
                                value={pkg.payment_status.production_unlock_status}
                                tone={pkg.payment_status.production_unlock_status === 'PRODUCTION_UNLOCKED' ? 'success' : 'warning'}
                            />
                        </div>
                    </div>

                    {/* Order summary */}
                    {pkg.order_summary && (
                        <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                                Order Summary
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <StatusCell label="Order ID" value={pkg.order_summary.order_id || '—'} tone="neutral" />
                                <StatusCell label="Status" value={pkg.order_summary.status || '—'} tone="neutral" />
                                <StatusCell label="Printhouse" value={pkg.order_summary.printhouse_id || '—'} tone="neutral" />
                                <StatusCell
                                    label="Total"
                                    value={pkg.order_summary.total != null ? `${pkg.order_summary.total} ${pkg.order_summary.currency || ''}`.trim() : '—'}
                                    tone="neutral"
                                />
                            </div>
                        </div>
                    )}

                    {/* File access audit */}
                    {pkg.file_access_audit.length > 0 && (
                        <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                                File Access Audit
                            </span>
                            <div className="space-y-1">
                                {pkg.file_access_audit.map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 p-1.5 border ppos-border bg-slate-50 dark:bg-black/20 text-[10px]">
                                        <ClipboardDocumentCheckIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span className="font-mono text-slate-600 dark:text-slate-400">{e.event_type}</span>
                                        {e.actor && <span className="text-slate-400">by {e.actor}</span>}
                                        {e.created_at && <span className="ml-auto text-slate-400">{new Date(e.created_at).toLocaleString()}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="space-y-1">
                    {warnings.map((w, i) => (
                        <p key={i} className="text-[10px] text-amber-600 dark:text-amber-500 font-bold bg-amber-500/10 px-2 py-1 border border-amber-500/20">
                            {w}
                        </p>
                    ))}
                </div>
            )}

            {/* Governance disclaimer */}
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest border-t ppos-border pt-2">
                This handoff package is a packaging and delivery manifest for the printhouse — it does not certify production readiness or standards compliance beyond the underlying preflight, validation, and approval governance.
            </p>
        </div>
    );
};

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
            <span className={`text-[10px] font-bold ${toneClass} break-all`}>{value}</span>
        </div>
    );
};
