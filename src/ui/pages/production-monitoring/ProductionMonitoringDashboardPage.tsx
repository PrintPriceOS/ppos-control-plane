import React, { useState, useEffect, useCallback } from 'react';
import {
    ProductionMonitoringSnapshot,
    ProductionTimelineEvent,
    ProductionIncident,
    MachineLoadSnapshot
} from '../../types/productionMonitoring';
// Canonical adminApi endpoints — no legacy mocks
import {
    getAdminQueueStats,
    getJobs,
    getAudit
} from '../../lib/adminApi';
// Mutation-only calls kept from productionMonitoringClient
import {
    getProductionTimeline,
    createIncident,
    acknowledgeIncident,
    resolveIncident,
    dismissIncident
} from '../../api/productionMonitoringClient';
import { getAuthToken, getUserTenantId, getUserPrinthouseId } from '../../lib/authStore';

import ProductionQueueOverview from './ProductionQueueOverview';
import SlaRiskPanel from './SlaRiskPanel';
import MachineLoadPanel from './MachineLoadPanel';
import ProductionIncidentsPanel from './ProductionIncidentsPanel';
import ProductionTimelinePanel from './ProductionTimelinePanel';
import ProductionBlockersPanel from './ProductionBlockersPanel';
import OperationalAlertsPanel from './OperationalAlertsPanel';

export const ProductionMonitoringDashboardPage: React.FC = () => {
    // Current user context
    const [userRole] = useState('SUPER_ADMIN'); // Simulating role for UI demonstration
    const [tenantIdFilter, setTenantIdFilter] = useState(getUserTenantId() || '');
    const [printhouseIdFilter, setPrinthouseIdFilter] = useState(getUserPrinthouseId() || '');
    const [loadError, setLoadError] = useState<string | null>(null);

    // State
    const [stats, setStats] = useState({
        total_jobs: 0,
        queued_jobs: 0,
        active_jobs: 0,
        blocked_jobs: 0,
        on_track_jobs: 0,
        at_risk_jobs: 0,
        breached_jobs: 0
    });
    const [snapshots, setSnapshots] = useState<ProductionMonitoringSnapshot[]>([]);
    const [incidents, setIncidents] = useState<ProductionIncident[]>([]);
    const [machines, setMachines] = useState<MachineLoadSnapshot[]>([]);
    const [timelineEvents, setTimelineEvents] = useState<ProductionTimelineEvent[]>([]);

    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

    // Manual Incident Modal
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newIncidentForm, setNewIncidentForm] = useState({
        tenantId: '',
        printhouseId: '',
        orderId: '',
        jobId: '',
        incidentType: 'MACHINE_OFFLINE',
        severity: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        title: '',
        description: ''
    });

    const loadData = useCallback(async () => {
        // Double-hardened auth gate: abort before any network call if token absent
        const token = getAuthToken()
            || localStorage.getItem('ppos_control_token')
            || sessionStorage.getItem('ppos_control_token')
            || '';
        if (!token) {
            setLoadError('PPOS_AUTH_TOKEN_MISSING');
            return;
        }
        setLoadError(null);
        try {
            // 1. Queue stats via canonical adminApi
            const [queueRes, jobsRes, auditRes] = await Promise.allSettled([
                getAdminQueueStats(),
                getJobs({ limit: 50, tenant_id: tenantIdFilter || undefined }),
                getAudit({ tenant_id: tenantIdFilter || undefined, limit: 30 })
            ]);

            // Queue stats — hybrid camel/snake support
            if (queueRes.status === 'fulfilled') {
                const q = queueRes.value as any;
                const depth = q?.queue_depth ?? q?.queueDepth ?? {};
                setStats({
                    total_jobs: Number(depth.TOTAL ?? depth.total ?? q?.total ?? 0),
                    queued_jobs: Number(depth.QUEUED ?? depth.queued ?? 0),
                    active_jobs: Number(depth.IN_PRODUCTION ?? depth.inProduction ?? depth.active ?? 0),
                    blocked_jobs: Number(depth.BLOCKED ?? depth.blocked ?? 0),
                    on_track_jobs: Number(depth.ON_TRACK ?? depth.onTrack ?? 0),
                    at_risk_jobs: Number(depth.AT_RISK ?? depth.atRisk ?? 0),
                    breached_jobs: Number(depth.BREACHED ?? depth.breached ?? 0)
                });
                // Hydrate machines fleet if available
                const machinesArr = q?.machines ?? q?.fleet ?? [];
                setMachines(Array.isArray(machinesArr) ? machinesArr : []);
            }

            // Snapshots — hydrate from jobs/dispatches payload
            if (jobsRes.status === 'fulfilled') {
                const j = jobsRes.value as any;
                const rawJobs = Array.isArray(j?.jobs) ? j.jobs
                    : Array.isArray(j?.dispatches) ? j.dispatches
                        : Array.isArray(j) ? j
                            : [];

                const rows: ProductionMonitoringSnapshot[] = rawJobs.map((item: any) => {
                    const limits = item.limits || {};
                    const preflight = item.preflight || {};
                    const domains = preflight.domains || {};

                    return {
                        order_id: item.order_id ?? item.orderId ?? item.id ?? '',
                        job_id: item.job_id ?? item.jobId ?? item.id ?? '',
                        tenant_id: item.tenant_id ?? item.tenantId ?? '',
                        printhouse_id: item.printhouse_id ?? item.printhouseId ?? '',
                        production_status: item.production_status ?? item.status ?? 'QUEUED',
                        sla_status: item.sla_status ?? (item.risk_score >= 80 ? 'BREACHED' : item.risk_score >= 50 ? 'AT_RISK' : 'ON_TRACK'),
                        remaining_minutes: item.remaining_minutes ?? item.remainingMinutes ?? null,
                        risk_score: item.risk_score ?? item.riskScore ?? 0,
                        warning_reasons_json: Array.isArray(item.warning_reasons) ? item.warning_reasons : [],
                        blocking_reasons_json: Array.isArray(item.blocking_reasons) ? item.blocking_reasons : [],
                        governance_snapshot_json: {
                            artifact_trust: domains.artifact_trust ?? domains.artifactTrust ?? 'PASSED',
                            policy_profile: domains.policy_profile ?? domains.policyProfile ?? 'PASSED',
                            machine_compatibility: domains.machine_compatibility ?? domains.machineCompatibility ?? 'PASSED',
                            proof: domains.proof ?? 'PASSED',
                            payment: domains.payment ?? 'PASSED',
                            quota: domains.quota ?? 'PASSED'
                        }
                    };
                });

                // Apply dynamic filters
                const filtered = rows.filter(r => {
                    if (tenantIdFilter && !r.tenant_id.toLowerCase().includes(tenantIdFilter.toLowerCase())) return false;
                    if (printhouseIdFilter && !r.printhouse_id.toLowerCase().includes(printhouseIdFilter.toLowerCase())) return false;
                    return true;
                });
                setSnapshots(filtered);

                // Auto-select first order if none selected
                if (filtered.length > 0 && !selectedOrderId) {
                    setSelectedOrderId(filtered[0].order_id);
                    setSelectedJobId(filtered[0].job_id);
                }
            }

            // Incidents — hydrate from audit/governance ledger
            if (auditRes.status === 'fulfilled') {
                const a = auditRes.value as any;
                const rawAudit = Array.isArray(a?.audit) ? a.audit
                    : Array.isArray(a) ? a
                        : [];
                const incidentRows: ProductionIncident[] = rawAudit
                    .filter((r: any) => r.event_type === 'TENANT_LIMIT_EXCEEDED' || r.event_type === 'STORAGE_LIMIT_WARNING' || r.event_type?.includes('FAIL') || r.event_type?.includes('WARN'))
                    .map((r: any) => ({
                        id: r.id ?? Math.floor(Math.random() * 100000),
                        tenant_id: r.tenant_id ?? r.tenantId ?? '',
                        printhouse_id: r.printhouse_id ?? r.printhouseId ?? '',
                        order_id: r.order_id ?? r.orderId ?? '',
                        job_id: r.job_id ?? r.jobId ?? '',
                        incident_type: r.event_type ?? 'GENERIC_ALERT',
                        severity: r.metadata_json?.severity ?? 'HIGH',
                        status: r.resolved_at ? 'RESOLVED' : 'OPEN',
                        title: r.reason ?? 'System Governance Alert Warning',
                        description: `Operational event log anomaly detected under type ${r.event_type}. Source: ${r.metadata_json?.source ?? 'Control Plane'}.`,
                        opened_at: r.created_at ?? r.openedAt ?? new Date().toISOString(),
                        resolution_notes: r.resolution_notes ?? null
                    }));
                setIncidents(incidentRows);
            }
        } catch (err) {
            console.error('Failed to load production monitoring payload:', err);
        }
    }, [tenantIdFilter, printhouseIdFilter, selectedOrderId]);

    // Load timeline data for selected order
    const loadTimeline = useCallback(async () => {
        if (!selectedOrderId) return;
        try {
            const res = await getProductionTimeline(selectedOrderId);
            if (res) {
                setTimelineEvents(Array.isArray(res) ? res : []);
            }
        } catch (err) {
            console.error('Failed to load timeline events:', err);
        }
    }, [selectedOrderId]);

    // Polling Interval
    useEffect(() => {
        loadData();
        const interval = setInterval(() => {
            loadData();
        }, 5000);
        return () => clearInterval(interval);
    }, [loadData]);

    useEffect(() => {
        loadTimeline();
    }, [selectedOrderId, loadTimeline]);

    // Handlers
    const handleSelectOrder = (orderId: string, jobId: string) => {
        setSelectedOrderId(orderId);
        setSelectedJobId(jobId);
    };

    const handleAcknowledge = async (incidentId: number) => {
        try {
            await acknowledgeIncident(incidentId);
            loadData();
        } catch (err) {
            console.error('Failed to acknowledge incident:', err);
        }
    };

    const handleResolve = async (incidentId: number, notes: string) => {
        try {
            await resolveIncident(incidentId, notes);
            loadData();
        } catch (err) {
            console.error('Failed to resolve incident:', err);
        }
    };

    const handleDismiss = async (incidentId: number, reason: string) => {
        try {
            await dismissIncident(incidentId, reason);
            loadData();
        } catch (err) {
            console.error('Failed to dismiss incident:', err);
        }
    };

    const handleRaiseOfflineIncident = async (machineId: string, name: string, tenantId: string, printhouseId: string) => {
        try {
            await createIncident({
                tenantId,
                printhouseId,
                incidentType: 'MACHINE_OFFLINE',
                severity: 'CRITICAL',
                title: `Machine ${name} Offline Alert`,
                description: `Machine monitoring reports printer ${machineId} is unresponsive. Operations paused.`
            });
            loadData();
        } catch (err) {
            console.error('Failed to raise offline machine incident:', err);
        }
    };

    const handleCreateIncidentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await createIncident(newIncidentForm);
            if (res) {
                setIsCreateModalOpen(false);
                setNewIncidentForm({
                    tenantId: '',
                    printhouseId: '',
                    orderId: '',
                    jobId: '',
                    incidentType: 'MACHINE_OFFLINE',
                    severity: 'MEDIUM',
                    title: '',
                    description: ''
                });
                loadData();
            }
        } catch (err) {
            console.error('Failed to submit manual incident:', err);
        }
    };

    const activeSnapshot = Array.isArray(snapshots) ? (snapshots.find(s => s.order_id === selectedOrderId) || null) : null;

    return (
        <div className="p-6 space-y-6 bg-slate-50 dark:bg-zinc-950 min-h-screen text-slate-900 dark:text-[#ECECF1] transition-colors duration-200">

            {/* AUTH BLOCK ERROR SURFACE — renders when session token is missing/expired */}
            {loadError === 'PPOS_AUTH_TOKEN_MISSING' && (
                <div className="flex flex-col items-center justify-center gap-4 py-12 border border-red-650/30 bg-red-950/10 text-center">
                    <div className="flex items-center justify-center w-12 h-12 border border-red-650/40 bg-red-600/10">
                        <svg className="w-6 h-6 text-[#dc0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-13a9 9 0 110 18A9 9 0 0112 2z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">Security Block — Session Token Missing</h3>
                        <p className="text-[10px] text-slate-500 dark:text-zinc-550 max-w-xs">
                            The monitoring channel cannot open without a valid operator session. No background requests will be dispatched.
                        </p>
                    </div>
                    <button
                        onClick={() => { window.location.href = '/login'; }}
                        className="px-6 py-2 border border-red-600 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all cursor-pointer"
                    >
                        Re-Authenticate Operator Session
                    </button>
                </div>
            )}

            {/* MANDATORY WARNING BANNER */}
            <div className="bg-red-600/10 border-l-4 border-red-600 p-4 text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-400">
                Monitoring mode only — LIVE production remains disabled unless explicitly approved.
            </div>

            {/* Header / Title */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-xl font-black uppercase tracking-widest text-slate-900 dark:text-white">
                        Live Production SLA Monitoring
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-semibold mt-1">
                        Operational queues, machine load, and governance gate monitoring console.
                    </p>
                </div>

                {/* Filters */}
                <div className="flex gap-4">
                    <input
                        type="text"
                        placeholder="Filter by Tenant ID"
                        className="px-3 py-1.5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-300 text-xs font-semibold rounded-none focus:outline-none focus:border-zinc-700 placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                        value={tenantIdFilter}
                        onChange={(e) => setTenantIdFilter(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Filter by Printhouse ID"
                        className="px-3 py-1.5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-300 text-xs font-semibold rounded-none focus:outline-none focus:border-zinc-700 placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                        value={printhouseIdFilter}
                        onChange={(e) => setPrinthouseIdFilter(e.target.value)}
                    />
                </div>
            </div>

            {/* Stats Overview */}
            <ProductionQueueOverview stats={stats} />

            {/* Main Dashboard Panels Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Columns - SLA Timelines & Blockers */}
                <div className="lg:col-span-2 space-y-6">
                    <SlaRiskPanel
                        snapshots={snapshots}
                        selectedOrderId={selectedOrderId}
                        onSelectOrder={handleSelectOrder}
                    />

                    <ProductionBlockersPanel snapshot={activeSnapshot} />

                    <MachineLoadPanel
                        machines={machines}
                        onRaiseOfflineIncident={handleRaiseOfflineIncident}
                    />
                </div>

                {/* Right Columns - Incidents, Timeline & Alerts */}
                <div className="space-y-6">
                    <ProductionIncidentsPanel
                        incidents={incidents}
                        userRole={userRole}
                        onAcknowledge={handleAcknowledge}
                        onResolve={handleResolve}
                        onDismiss={handleDismiss}
                        onOpenCreateModal={() => setIsCreateModalOpen(true)}
                    />

                    <ProductionTimelinePanel
                        events={timelineEvents}
                        orderId={selectedOrderId}
                    />

                    <OperationalAlertsPanel
                        snapshots={snapshots}
                        selectedOrderId={selectedOrderId}
                    />
                </div>
            </div>

            {/* Create Incident Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="w-full max-w-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-zinc-850 pb-3">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">
                                Report Production Incident
                            </h3>
                            <button
                                className="text-slate-400 hover:text-slate-900 dark:hover:text-zinc-50 text-xs font-bold cursor-pointer"
                                onClick={() => setIsCreateModalOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        <form onSubmit={handleCreateIncidentSubmit} className="space-y-4 text-slate-700 dark:text-zinc-300">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 mb-1">Tenant ID *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-2 border border-slate-200 dark:border-zinc-800 bg-transparent text-xs text-slate-900 dark:text-zinc-105"
                                        value={newIncidentForm.tenantId}
                                        onChange={(e) => setNewIncidentForm({ ...newIncidentForm, tenantId: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 mb-1">Printhouse ID *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-2 border border-slate-200 dark:border-zinc-800 bg-transparent text-xs text-slate-900 dark:text-zinc-105"
                                        value={newIncidentForm.printhouseId}
                                        onChange={(e) => setNewIncidentForm({ ...newIncidentForm, printhouseId: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 mb-1">Order ID *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-2 border border-slate-200 dark:border-zinc-800 bg-transparent text-xs text-slate-900 dark:text-zinc-105"
                                        value={newIncidentForm.orderId}
                                        onChange={(e) => setNewIncidentForm({ ...newIncidentForm, orderId: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 mb-1">Job ID (Optional)</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-slate-200 dark:border-zinc-800 bg-transparent text-xs text-slate-900 dark:text-zinc-105"
                                        value={newIncidentForm.jobId}
                                        onChange={(e) => setNewIncidentForm({ ...newIncidentForm, jobId: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 mb-1">Incident Type *</label>
                                    <select
                                        className="w-full p-2 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-105"
                                        value={newIncidentForm.incidentType}
                                        onChange={(e) => setNewIncidentForm({ ...newIncidentForm, incidentType: e.target.value })}
                                    >
                                        <option value="MACHINE_OFFLINE">Machine Offline</option>
                                        <option value="SLA_RISK">SLA Risk Warning</option>
                                        <option value="SLA_BREACH">SLA Timeline Breach</option>
                                        <option value="FILE_GOVERNANCE_BLOCK">File Governance Hold</option>
                                        <option value="OPERATOR_REVIEW_REQUIRED">Operator Action Required</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 mb-1">Severity *</label>
                                    <select
                                        className="w-full p-2 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-105"
                                        value={newIncidentForm.severity}
                                        onChange={(e) => setNewIncidentForm({ ...newIncidentForm, severity: e.target.value as any })}
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="CRITICAL">Critical</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 mb-1">Incident Title *</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 border border-slate-200 dark:border-zinc-800 bg-transparent text-xs text-slate-900 dark:text-zinc-105"
                                    value={newIncidentForm.title}
                                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, title: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-[9px] font-black uppercase text-slate-500 dark:text-zinc-400 mb-1">Description *</label>
                                <textarea
                                    required
                                    className="w-full p-2 border border-slate-200 dark:border-zinc-800 bg-transparent text-xs text-slate-900 dark:text-zinc-105"
                                    rows={3}
                                    value={newIncidentForm.description}
                                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, description: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-2 justify-end pt-4">
                                <button
                                    type="button"
                                    className="px-4 py-2 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 text-xs font-bold uppercase cursor-pointer"
                                    onClick={() => setIsCreateModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase cursor-pointer"
                                >
                                    Submit Alert
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
export default ProductionMonitoringDashboardPage;
