// pages/admin/OverviewTab.tsx
import React from "react";
import { getDashboardOverview, getQueue } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { t } from "../../i18n";
import {
    Square3Stack3DIcon,
    CheckBadgeIcon,
    BoltIcon,
    ArrowTrendingUpIcon,
    BanknotesIcon,
    ScaleIcon,
    QueueListIcon,
    ClockIcon,
    CircleStackIcon,
    ShieldCheckIcon,
    GlobeEuropeAfricaIcon,
    DocumentTextIcon,
    ServerStackIcon,
    WrenchScrewdriverIcon,
    ExclamationTriangleIcon
} from "@heroicons/react/24/outline";

type Range = "24h" | "7d" | "30d";

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
    blue: { bg: "bg-blue-600/10", text: "text-blue-600" },
    emerald: { bg: "bg-emerald-600/10", text: "text-emerald-600" },
    amber: { bg: "bg-amber-600/10", text: "text-amber-600" },
    indigo: { bg: "bg-indigo-600/10", text: "text-indigo-600" },
    violet: { bg: "bg-violet-600/10", text: "text-violet-600" },
    pink: { bg: "bg-pink-600/10", text: "text-pink-600" },
    orange: { bg: "bg-orange-600/10", text: "text-orange-600" },
    cyan: { bg: "bg-cyan-600/10", text: "text-cyan-600" },
};

const KpiCard = ({ title, valueRaw, suffix, Icon, color, helpKey }: { title: string; valueRaw: number | string | null; suffix?: string; Icon: any; color: keyof typeof COLOR_MAP; helpKey?: string }) => {
    const theme = COLOR_MAP[color] || COLOR_MAP.blue;
    const isMissing = valueRaw === null;
    return (
        <div className={`glass rounded-none p-3.5 border ${isMissing ? 'border-amber-400/50 bg-amber-50/10' : 'border-white'} hover-slide flex items-start justify-between gap-2 group relative`}>
            <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-none ${isMissing ? 'bg-amber-500/10 text-amber-500' : theme.bg} shrink-0`}>
                    <Icon className={`w-4 h-4 ${isMissing ? 'text-amber-500' : theme.text}`} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate flex items-center gap-1">
                        {title}
                        {isMissing && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse" title="Source offline / unconfirmed" />}
                    </div>
                    <div className="flex items-baseline gap-1.5 truncate">
                        {isMissing ? (
                            <div className="text-[10px] font-bold text-amber-600 tracking-tight truncate border-b border-dashed border-amber-300">N/A — source unavailable</div>
                        ) : (
                            <>
                                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">{valueRaw}</div>
                                {suffix && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{suffix}</span>}
                            </>
                        )}
                    </div>
                </div>
            </div>
            {helpKey && (
                <a
                    href={`/admin/help?doc=${helpKey}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex items-center gap-1 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 px-1.5 py-0.5 rounded-none shadow-none shrink-0"
                >
                    <span title="Explain this metric">ℹ</span>
                </a>
            )}
        </div>
    );
};

const PanelRow = ({ label, valueRaw, suffix, isAlert, isPositive }: { label: string; valueRaw: number | string | null; suffix?: string; isAlert?: boolean; isPositive?: boolean }) => {
    const isMissing = valueRaw === null;
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-slate-200/60 last:border-none text-xs">
            <span className="text-slate-600 font-medium tracking-tight truncate pr-2">{label}</span>
            <div className="font-mono text-right shrink-0">
                {isMissing ? (
                    <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 border border-amber-200/60">N/A — unavailable</span>
                ) : (
                    <span className={`font-bold ${isAlert ? 'text-red-600 bg-red-50 px-1 py-0.5' : isPositive ? 'text-emerald-600 font-black' : 'text-slate-900'}`}>{valueRaw} {suffix || ''}</span>
                )}
            </div>
        </div>
    );
};

export const OverviewTab: React.FC<{ range: Range; refreshMs?: number }> = ({ range, refreshMs = 0 }) => {
    // Query unified dashboard overview loaded with verified database production telemetry
    const o = useAdminQuery(`dashboardOverview`, () => getDashboardOverview(), refreshMs);
    const q = useAdminQuery(`queue`, () => getQueue(), refreshMs);

    if (o.status === "loading") return (
        <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-none animate-spin" />
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">{t("common.loading" as any)}</span>
            </div>
        </div>
    );

    if (o.status === "error") return (
        <div className="p-8 rounded-none bg-red-50 border border-red-100 text-center">
            <ExclamationTriangleIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <div className="text-red-700 font-bold mb-1">Mission Control Telemetry Error</div>
            <div className="text-red-500 text-sm">{o.error}</div>
        </div>
    );

    if (!o.data) return null;

    const d = o.data;
    const pref = d.preflight || {};
    const gov = d.governance || {};
    const econ = d.economy || {};
    const stor = d.storage || {};
    const fed = d.federation || {};

    // Calculate dynamic percentages safely for top KPI strips
    const certRatio = gov.jobsCertifiableCount !== null && pref.jobsToday ? Math.round((gov.jobsCertifiableCount / pref.jobsToday) * 100) : null;

    return (
        <div className="space-y-6 animate-slide-fade">
            {/* Fail-Loud Warning Header Strip if source upstream metrics missed */}
            {d.warnings && d.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-xs">
                        <span className="font-bold text-amber-800 uppercase tracking-wide">Source Telemetry Degradation:</span>
                        <span className="text-amber-700 ml-1">Certain production registries are operating in fail-loud isolation state. Corresponding KPIs display N/A.</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                            {d.warnings.map((w, wIdx) => (
                                <span key={wIdx} className="bg-amber-100 text-amber-800 text-[10px] font-mono px-1.5 py-0.5 border border-amber-200">{w}</span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* HIGH-DENSITY TOP KPI STRIPS (MANDATED 8 CARDS) */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
                <KpiCard Icon={Square3Stack3DIcon} color="blue" title="Jobs Today" valueRaw={pref.jobsToday} helpKey="metric-jobs-today" />
                <KpiCard Icon={QueueListIcon} color="orange" title="Live Queue" valueRaw={pref.queueDepth ?? pref.activeJobs} helpKey="metric-live-queue" />
                <KpiCard Icon={CheckBadgeIcon} color="emerald" title="Certifiable %" valueRaw={certRatio !== null ? `${certRatio}%` : null} helpKey="metric-certifiable-ratio" />
                <KpiCard Icon={WrenchScrewdriverIcon} color="amber" title="Failed Runtime" valueRaw={pref.failedRuntimeEnvironmentCount} helpKey="metric-failed-runtime" />
                <KpiCard Icon={BoltIcon} color="indigo" title="Fixable Issues" valueRaw={econ.jobsRequiringFix} />
                <KpiCard Icon={ServerStackIcon} color="violet" title="Artifact Storage" valueRaw={stor.artifactsCount} suffix={stor.totalSizeBytes ? `${(stor.totalSizeBytes / 1024 / 1024).toFixed(1)} MB` : undefined} />
                <KpiCard Icon={GlobeEuropeAfricaIcon} color="cyan" title="Active Nodes" valueRaw={fed.operationalNodes} />
                <KpiCard Icon={ClockIcon} color="emerald" title="Dispatches Today" valueRaw={fed.activeDispatches} />
            </div>

            {/* MISSION CONTROL PANELS (FIRST VIEWPORT OPERATIONAL COVERAGE) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Preflight Intelligence Hub */}
                <div className="glass rounded-none border border-white overflow-hidden flex flex-col hover-slide">
                    <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <Square3Stack3DIcon className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-bold uppercase tracking-wider">Preflight Intelligence</span>
                        </div>
                        <span className="text-[9px] font-mono px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30">Registry Stream</span>
                    </div>
                    <div className="p-4 flex-1 space-y-1 bg-white/40">
                        <PanelRow label="Total Analyzed (Today)" valueRaw={pref.jobsToday} />
                        <PanelRow label="Active Concurrent Tasks" valueRaw={pref.activeJobs} />
                        <PanelRow label="Completed Analyses" valueRaw={pref.completedJobsToday} isPositive />
                        <PanelRow label="Failed Executions" valueRaw={pref.failedJobsToday} isAlert={pref.failedJobsToday ? pref.failedJobsToday > 0 : false} />
                        <PanelRow label="Real Extraction Contract" valueRaw={pref.realExtractionCount} />
                        <PanelRow label="Runtime Env Failures" valueRaw={pref.failedRuntimeEnvironmentCount} isAlert={pref.failedRuntimeEnvironmentCount ? pref.failedRuntimeEnvironmentCount > 0 : false} />
                        <PanelRow label="Partial Artifact Blocks" valueRaw={pref.partialArtifactsCount} />
                        <PanelRow label="Mean Document Risk Score" valueRaw={pref.averageRiskScore} suffix="pts" />
                        <PanelRow label="Registry Buffer Depth" valueRaw={pref.queueDepth} />
                        <PanelRow label="Latest Execution Tail" valueRaw={pref.latestJobStatus} />
                    </div>
                </div>

                {/* 2. Governance & Economy Enforcer */}
                <div className="glass rounded-none border border-white overflow-hidden flex flex-col hover-slide">
                    <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-wider">Governance & Economy</span>
                        </div>
                        <span className="text-[9px] font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Policy Kernel</span>
                    </div>
                    <div className="p-4 flex-1 space-y-1 bg-white/40">
                        <PanelRow label="Active Swarm Policies" valueRaw={gov.activePolicyCount} />
                        <PanelRow label="Latest Rule Triggered" valueRaw={gov.latestPolicyApplied || 'DEFAULT_STANDARD'} />
                        <PanelRow label="Policy Execution Interceptions" valueRaw={gov.jobsBlockedByPolicy} />
                        <PanelRow label="Certification Blocked Items" valueRaw={gov.certificationBlockedCount} />
                        <PanelRow label="Passed Certifiable Volumes" valueRaw={gov.jobsCertifiableCount} isPositive />
                        <PanelRow label="Deployment Contract Class" valueRaw={gov.deploymentContractVersion} />
                        <PanelRow label="Audit Trace Registry State" valueRaw={gov.auditStatus ? String(gov.auditStatus).toUpperCase() : null} isAlert={gov.auditStatus === 'errors'} />
                        <PanelRow label="Estimated Value Generated" valueRaw={econ.estimatedProductionValue !== null ? `$${Number(econ.estimatedProductionValue).toLocaleString()}` : null} isPositive />
                        <PanelRow label="Avoided Reprint Waste ROI" valueRaw={econ.estimatedAvoidedReprintCost !== null ? `$${Number(econ.estimatedAvoidedReprintCost).toLocaleString()}` : null} />
                        <PanelRow label="Mean Ledger Margin" valueRaw={econ.averageMargin !== null ? `${econ.averageMargin}%` : null} />
                        <PanelRow label="AutoFix Success Count" valueRaw={econ.fixSuccessCount} />
                        <PanelRow label="AutoFix Intercept Failures" valueRaw={econ.fixFailureCount} isAlert={econ.fixFailureCount ? econ.fixFailureCount > 0 : false} />
                        <PanelRow label="Derived Quality Benchmark" valueRaw={econ.qualityScore} suffix="/ 10.0" />
                    </div>
                </div>

                {/* 3. Compact Map Summary Card */}
                <div className="glass rounded-none border border-white overflow-hidden flex flex-col hover-slide">
                    <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <GlobeEuropeAfricaIcon className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs font-bold uppercase tracking-wider">Federation Topology</span>
                        </div>
                        <span className="text-[9px] font-mono px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Live Map Hub</span>
                    </div>
                    <div className="p-4 flex-1 space-y-2 bg-white/40 flex flex-col justify-between">
                        <div className="space-y-1">
                            <PanelRow label="Verified Swarm Nodes" valueRaw={fed.operationalNodes} />
                            <PanelRow label="Active Route Assignments" valueRaw={fed.activeDispatches} />
                            <PanelRow label="Missing GIS Coordinates" valueRaw={fed.missingCoordinates} isAlert={fed.missingCoordinates ? fed.missingCoordinates > 0 : false} />
                            <PanelRow label="Degraded Infrastructure State" valueRaw={fed.degradedNodes} isAlert={fed.degradedNodes ? fed.degradedNodes > 0 : false} />
                            <PanelRow label="Mean Node Utilization" valueRaw={fed.averageUtilization !== null ? `${fed.averageUtilization}%` : null} />
                        </div>

                        {/* Interactive embedded summary map banner */}
                        <div className="mt-4 p-3 bg-slate-900 text-slate-300 border border-slate-800 text-xs font-mono relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-1 text-[8px] bg-slate-800 text-slate-400">EUROPE_CENTRAL</div>
                            <div className="text-emerald-400 font-bold mb-1 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                                SWARM CONSENSUS: SECURE
                            </div>
                            <div className="text-[11px] leading-tight text-slate-400">
                                Dispatch clusters operating natively via decentralized machine profile coordinate inheritance maps.
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
                                <span>Status: {d.source_status}</span>
                                <a href="#map-section" className="text-indigo-400 hover:underline">View Geographic Map ↓</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* LIVE OPERATIONAL EVENTS STREAM */}
            <div className="glass rounded-none border border-white overflow-hidden">
                <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <DocumentTextIcon className="w-4 h-4 text-orange-400" />
                        <span className="text-xs font-bold uppercase tracking-wider">Latest Operational Events Stream</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Live Audit Pipeline</span>
                    </div>
                </div>
                <div className="divide-y divide-slate-100 bg-white/60">
                    {d.audit?.latestEvents?.length ? (
                        d.audit.latestEvents.map((ev, idx) => (
                            <div key={idx} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-white/80 transition-colors font-mono">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className={`px-1.5 py-0.5 text-[9px] font-bold tracking-tight shrink-0 ${ev.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : ev.status === 'FAILURE' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-slate-100 text-slate-800 border border-slate-200'}`}>
                                        {ev.status}
                                    </span>
                                    <span className="font-bold text-slate-900 shrink-0">{ev.event}</span>
                                    <span className="text-slate-500 text-[11px] truncate">{ev.details}</span>
                                </div>
                                <span className="text-slate-400 text-[10px] shrink-0 ml-3">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                            </div>
                        ))
                    ) : (
                        <div className="p-4 text-center text-slate-400 text-xs italic">
                            No operational logs retrieved in active database snapshot. System standing by.
                        </div>
                    )}
                </div>
            </div>

            {/* Retain live streaming buffer inspect container below operational events for detailed trace examination */}
            <div className="glass rounded-none border border-white overflow-hidden shadow-none hover-slide mt-6" id="queue-stream">
                <div className="px-6 py-4 bg-slate-50/50 border-b border-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CircleStackIcon className="w-5 h-5 text-slate-400" />
                        <div className="font-bold text-slate-800 text-sm tracking-tight">{t("admin.queue.title" as any)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-none bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Buffer Trace</span>
                    </div>
                </div>
                <div className="p-0">
                    {q.status === "loading" && <div className="p-10 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">Attaching to stream...</div>}
                    {q.status === "error" && <div className="p-10 text-center text-red-500 text-sm font-bold">{q.error}</div>}
                    {q.status === "success" && (
                        <pre className="text-[11px] font-mono leading-relaxed bg-slate-900 text-emerald-400 p-6 overflow-auto max-h-[300px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                            {JSON.stringify(q.data, null, 2)}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
};
