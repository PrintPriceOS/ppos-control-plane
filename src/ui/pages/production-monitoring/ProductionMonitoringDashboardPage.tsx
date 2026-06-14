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
                    total_jobs:   Number(depth.TOTAL         ?? depth.total         ?? q?.total ?? 0),
                    queued_jobs:  Number(depth.QUEUED        ?? depth.queued        ?? 0),
                    active_jobs:  Number(depth.IN_PRODUCTION ?? depth.inProduction  ?? depth.active ?? 0),
                    blocked_jobs: Number(depth.BLOCKED       ?? depth.blocked       ?? 0),
                    on_track_jobs:Number(depth.ON_TRACK      ?? depth.onTrack       ?? 0),
                    at_risk_jobs: Number(depth.AT_RISK       ?? depth.atRisk        ?? 0),
                    breached_jobs:Number(depth.BREACHED      ?? depth.breached      ?? 0)
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
                // Map job entries to ProductionMonitoringSnapshot shape
                const mapped: ProductionMonitoringSnapshot[] = rawJobs.map((job: any) => ({
                    order_id:              job.order_id ?? job.orderId ?? job.id ?? '',
                    job_id:               job.id ?? job.job_id ?? job.jobId ?? null,
                    production_status:    job.status ?? 'UNKNOWN',
                    sla_status:           job.sla_status ?? job.slaStatus ?? 'ON_TRACK',
                    remaining_minutes:    job.remaining_minutes ?? job.remainingMinutes ?? null,
                    risk_score:           job.risk_score ?? job.riskScore ?? 0,
                    blocking_reasons_json:Array.isArray(job.blockers) ? job.blockers : [],
                    warning_reasons_json: Array.isArray(job.warnings) ? job.warnings : [],
                    governance_snapshot_json: job.governance ?? {}
                }));
                setSnapshots(mapped);
            }

            // Incidents — via audit log (defensive array guard)
            if (auditRes.status === 'fulfilled') {
                const a = auditRes.value as any;
                const raw = Array.isArray(a?.audit)  ? a.audit
                    : Array.isArray(a?.events) ? a.events
                    : Array.isArray(a?.data)   ? a.data
                    : Array.isArray(a)         ? a
                    : [];
                // Filter to incident-type audit rows only
                const incidentRows: ProductionIncident[] = raw
                    .filter((r: any) => r && (r.incident_type || r.incidentType || r.type?.includes('INCIDENT')))
                    .map((r: any) => ({
                        id:               r.id ?? 0,
                        title:            r.title ?? r.event_type ?? 'Audit Event',
                        description:      r.description ?? r.message ?? '',
                        incident_type:    r.incident_type ?? r.incidentType ?? r.type ?? 'AUDIT',
                        severity:         r.severity ?? 'LOW',
                        status:           r.status ?? 'OPEN',
                        order_id:         r.order_id ?? r.orderId ?? '',
                        opened_at:        r.created_at ?? r.openedAt ?? new Date().toISOString(),
                        resolution_notes: r.resolution_notes ?? null
                    }));
                setIncidents(incidentRows);
            }
        } catch (e: any) {
            const msg = String(e?.message || e);
            if (msg.includes('401') || msg.includes('UNAUTHORIZED') || msg.includes('TOKEN_MISSING')) {
                setLoadError('PPOS_AUTH_TOKEN_MISSING');
            } else {
                console.error('[PRODUCTION-MONITORING] loadData error:', e);
            }
        }
    }, [tenantIdFilter, printhouseIdFilter]);

    // 5s polling with safe cleanup to prevent ghost async tracks on unmount/filter change
    useEffect(() => {
        loadData();
        const poll = setInterval(loadData, 5000);
        return () => clearInterval(poll);
    }, [loadData]);

    useEffect(() => {
        const loadTimeline = async () => {
            if (selectedOrderId && selectedJobId) {
                try {
                    const res = await getProductionTimeline(selectedOrderId, selectedJobId);
                    if (res && res.ok) {
                        setTimelineEvents(res.events);
                    }
                } catch (e) {
                    console.error('Failed to load timeline events:', e);
                }
            }
        };
        loadTimeline();
    }, [selectedOrderId, selectedJobId]);

    // Handle Order Selection
    const handleSelectOrder = (orderId: string, jobId: string) => {
        setSelectedOrderId(orderId);
        setSelectedJobId(jobId);
    };

    // Actions
    const handleAcknowledge = async (id: number) => {
        await acknowledgeIncident(id);
        loadData();
    };

    const handleResolve = async (id: number, notes: string) => {
        await resolveIncident(id, notes);
        loadData();
    };

    const handleDismiss = async (id: number, reason: string) => {
        await dismissIncident(id, reason);
        loadData();
    };

    // Manual Raise Offline Warning Incident
    const handleRaiseOfflineIncident = (macId: string, name: string, tId: string, phId: string) => {
        setNewIncidentForm({
            tenantId: tId,
            printhouseId: phId,
            orderId: 'N/A',
            jobId: '',
            incidentType: 'MACHINE_OFFLINE',
            severity: 'HIGH',
            title: `Machine Offline: ${name}`,
            description: `Alert: printer console "${name}" (ID: ${macId}) reports offline/maintenance. No physical dispatch is allowed.`
        });
        setIsCreateModalOpen(true);
    };

    // Submit Manual Incident
    const handleCreateIncidentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await createIncident(newIncidentForm);
            if (res && res.ok) {
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

    const activeSnapshot = snapshots.find(s => s.order_id === selectedOrderId) || null;

    return (
        <div className="p-6 space-y-6 bg-zinc-950 min-h-screen text-[#ECECF1]">
            
            {/* AUTH BLOCK ERROR SURFACE — renders when session token is missing/expired */}
            {loadError === 'PPOS_AUTH_TOKEN_MISSING' && (
                <div className="flex flex-col items-center justify-center gap-4 py-12 border border-red-600/30 bg-red-950/10 text-center">
                    <div className="flex items-center justify-center w-12 h-12 border border-red-600/40 bg-red-600/10">
                        <svg className="w-6 h-6 text-[#dc0000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-13a9 9 0 110 18A9 9 0 0112 2z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-red-400 mb-1">Security Block — Session Token Missing</h3>
                        <p className="text-[10px] text-zinc-500 max-w-xs">
                            The monitoring channel cannot open without a valid operator session. No background requests will be dispatched.
                        </p>
                    </div>
                    <button
                        onClick={() => { window.location.href = '/login'; }}
                        className="px-6 py-2 border border-red-600 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                    >
                        Re-Authenticate Operator Session
                    </button>
                </div>
            )}

            {/* MANDATORY WARNING BANNER */}
            <div className="bg-red-600/10 border-l-4 border-red-600 p-4 text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400">
                Monitoring mode only — LIVE production remains disabled unless explicitly approved.
            </div>

            {/* Header / Title */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-xl font-black uppercase tracking-widest">
                        Live Production SLA Monitoring
                    </h1>
                    <p className={`text-xs ${COLORS.adaptive.textSecondary} font-semibold mt-1`}>
                        Operational queues, machine load, and governance gate monitoring console.
                    </p>
                </div>
                
                {/* Filters */}
                <div className="flex gap-4">
                    <input 
                        type="text" 
                        placeholder="Filter by Tenant ID"
                        className={`px-3 py-1.5 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} text-xs font-semibold rounded-none focus:outline-none`}
                        value={tenantIdFilter}
                        onChange={(e) => setTenantIdFilter(e.target.value)}
                    />
                    <input 
                        type="text" 
                        placeholder="Filter by Printhouse ID"
                        className={`px-3 py-1.5 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} text-xs font-semibold rounded-none focus:outline-none`}
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
                    <div className={`w-full max-w-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6`}>
                        <div className="flex justify-between items-center mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                            <h3 className="text-xs font-black uppercase tracking-widest">
                                Report Production Incident
                            </h3>
                            <button 
                                className="text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 text-xs font-bold"
                                onClick={() => setIsCreateModalOpen(false)}
                            >
                                Close
                            </button>
                        </div>

                        <form onSubmit={handleCreateIncidentSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Tenant ID *</label>
                                    <input 
                                        type="text" 
                                        required
                                        className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                                        value={newIncidentForm.tenantId}
                                        onChange={(e) => setNewIncidentForm({...newIncidentForm, tenantId: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Printhouse ID *</label>
                                    <input 
                                        type="text" 
                                        required
                                        className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                                        value={newIncidentForm.printhouseId}
                                        onChange={(e) => setNewIncidentForm({...newIncidentForm, printhouseId: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Order ID *</label>
                                    <input 
                                        type="text" 
                                        required
                                        className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                                        value={newIncidentForm.orderId}
                                        onChange={(e) => setNewIncidentForm({...newIncidentForm, orderId: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Job ID (Optional)</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                                        value={newIncidentForm.jobId}
                                        onChange={(e) => setNewIncidentForm({...newIncidentForm, jobId: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Incident Type *</label>
                                    <select 
                                        className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                                        value={newIncidentForm.incidentType}
                                        onChange={(e) => setNewIncidentForm({...newIncidentForm, incidentType: e.target.value})}
                                    >
                                        <option value="MACHINE_OFFLINE">Machine Offline</option>
                                        <option value="SLA_RISK">SLA Risk Warning</option>
                                        <option value="SLA_BREACH">SLA Timeline Breach</option>
                                        <option value="FILE_GOVERNANCE_BLOCK">File Governance Hold</option>
                                        <option value="OPERATOR_REVIEW_REQUIRED">Operator Action Required</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Severity *</label>
                                    <select 
                                        className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                                        value={newIncidentForm.severity}
                                        onChange={(e) => setNewIncidentForm({...newIncidentForm, severity: e.target.value as any})}
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="CRITICAL">Critical</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Incident Title *</label>
                                <input 
                                    type="text" 
                                    required
                                    className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                                    value={newIncidentForm.title}
                                    onChange={(e) => setNewIncidentForm({...newIncidentForm, title: e.target.value})}
                                />
                            </div>

                            <div>
                                <label className="block text-[9px] font-black uppercase text-zinc-400 mb-1">Description *</label>
                                <textarea 
                                    required
                                    className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                                    rows={3}
                                    value={newIncidentForm.description}
                                    onChange={(e) => setNewIncidentForm({...newIncidentForm, description: e.target.value})}
                                />
                            </div>

                            <div className="flex gap-2 justify-end pt-4">
                                <button 
                                    type="button"
                                    className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold uppercase"
                                    onClick={() => setIsCreateModalOpen(false)}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase"
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
