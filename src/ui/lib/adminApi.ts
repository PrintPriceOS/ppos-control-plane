import { getAuthToken, clearAuthToken, setAuthToken, getUserTenantId, getUserPrinthouseId } from './authStore';

const endpointBackoff = new Map<string, { failCount: number; nextAllowedTime: number }>();

function getFallbackForPath(path: string): any {
    const cleanPath = path.split('?')[0];
    
    // Create polymorphic base array/object
    const base: any = [];
    base.ok = true;
    base.source_status = "UNAVAILABLE";
    
    if (cleanPath.includes('/notifications')) {
        base.notifications = [];
        base.source_status = "NOTIFICATIONS_UNAVAILABLE";
        return base;
    }
    if (cleanPath.includes('/anomalies')) {
        base.anomalies = [];
        base.source_status = "ANOMALY_SOURCE_UNAVAILABLE";
        return base;
    }
    if (cleanPath.endsWith('/telemetry/overview')) {
        base.overview = {};
        base.metrics = {};
        base.source_status = "DISPATCH_TELEMETRY_UNAVAILABLE";
        return base;
    }
    if (cleanPath.includes('/audit')) {
        base.events = [];
        base.audit = [];
        base.data = [];
        base.count = 0;
        base.source_status = "AUDIT_SOURCE_UNAVAILABLE";
        return base;
    }
    if (cleanPath.endsWith('/network/overview')) {
        base.overview = {};
        base.source_status = "NETWORK_OVERVIEW_UNAVAILABLE";
        return base;
    }
    if (cleanPath.endsWith('/network/capacity')) {
        base.capacity = [];
        base.source_status = "NETWORK_CAPACITY_UNAVAILABLE";
        return base;
    }
    if (cleanPath.endsWith('/map')) {
        base.nodes = [];
        base.routes = [];
        base.connections = [];
        base.warnings = [];
        base.counts = { operationalNodes: 0, activeDispatches: 0, missingCoordinates: 0 };
        base.source_status = "MAP_UNAVAILABLE";
        return base;
    }
    if (cleanPath.endsWith('/dispatch') || cleanPath.endsWith('/dispatch/active')) {
        base.dispatches = [];
        base.source_status = "NO_DISPATCH_DATA";
        return base;
    }
    if (cleanPath.endsWith('/telemetry/industrial')) {
        base.telemetry = {};
        base.source_status = "INDUSTRIAL_TELEMETRY_UNAVAILABLE";
        return base;
    }
    if (cleanPath.endsWith('/economic/overview')) {
        base.metrics = {};
        base.overview = {};
        base.avg_final_score = 0;
        base.source_status = "ECONOMIC_ROUTING_UNAVAILABLE";
        return base;
    }
    if (cleanPath.endsWith('/global/blocks')) {
        base.blocks = [];
        base.source_status = "GLOBAL_BLOCKS_UNAVAILABLE";
        return base;
    }
    
    base.data = [];
    return base;
}

export async function adminFetch<T>(path: string, options?: RequestInit & { tenantId?: string, deploymentId?: string }): Promise<T> {
    const cleanPath = path.split('?')[0];
    const backoff = endpointBackoff.get(cleanPath);
    
    if (backoff && Date.now() < backoff.nextAllowedTime) {
        // Skip network call entirely during backoff to prevent console spam and network strain
        return getFallbackForPath(path) as unknown as T;
    }

    const token = getAuthToken();
    const storedTenantId = getUserTenantId();
    const storedPrinthouseId = getUserPrinthouseId();

    const headers: Record<string, string> = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...(token ? { 
            "Authorization": `Bearer ${token}`
        } : {}),
        ...(options?.tenantId || storedTenantId ? { "X-Tenant-Id": options?.tenantId || storedTenantId } : {}),
        ...(storedPrinthouseId ? { "X-Printhouse-Id": storedPrinthouseId } : {}),
        ...(options?.deploymentId ? { "X-Deployment-Id": options.deploymentId } : {}),
        ...(options?.headers as any || {}),
    };

    try {
        const res = await fetch(path, {
            ...options,
            headers,
            credentials: "include", 
        });

        if (res.status === 401) {
            clearAuthToken();
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
            throw new Error('Unauthorized: Valid Bearer token required');
        }

        if (!res.ok) {
            // Tolerate 404s and intermittent service errors by activating backoff
            const currentFails = (backoff?.failCount || 0) + 1;
            const pauseMs = Math.min(10000 * Math.pow(2, currentFails - 1), 60000);
            endpointBackoff.set(cleanPath, {
                failCount: currentFails,
                nextAllowedTime: Date.now() + pauseMs
            });
            
            // Return polymorphic fallback gracefully instead of crashing/spamming
            return getFallbackForPath(path) as unknown as T;
        }

        // On success, reset fail count
        if (backoff) {
            endpointBackoff.delete(cleanPath);
        }
        
        const data = await res.json();
        
        // Polymorphic wrapping for successful arrays if callers might access object properties
        if (Array.isArray(data)) {
            const arrObj: any = data;
            arrObj.ok = true;
            arrObj.data = data;
            arrObj.events = data;
            arrObj.audit = data;
            arrObj.source_status = "ACTIVE";
            return arrObj as unknown as T;
        }
        
        return data as T;
    } catch (err: any) {
        // Handle network disconnection or JSON parsing errors gracefully
        const currentFails = (backoff?.failCount || 0) + 1;
        const pauseMs = Math.min(10000 * Math.pow(2, currentFails - 1), 60000);
        endpointBackoff.set(cleanPath, {
            failCount: currentFails,
            nextAllowedTime: Date.now() + pauseMs
        });
        
        return getFallbackForPath(path) as unknown as T;
    }
}

export async function verifyToken(token: string) {
    try {
        // We use a direct fetch here because this is the BOOTSTRAP verification call
        // before the global token is set in the store.
        const response = await fetch('/api/admin/telemetry/snapshot', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 502) {
                throw new Error('Connection Error: 502 Bad Gateway. This usually means the backend service is restarting or Redis is unreachable.');
            }
            if (response.status === 401) {
                throw new Error('Invalid access token. Please check your credentials.');
            }
            throw new Error(`Verification failed: ${response.status}`);
        }
        
        return response.json();
    } catch (e: any) {
        throw new Error(e.message);
    }
}

// Keep legacy exports for compatibility during migration if necessary, but wired to authStore
export const getAdminKey = getAuthToken;
export const setAdminKey = setAuthToken;
export const clearAdminKey = clearAuthToken;

export type OverviewResponse = {
    totalJobs: number;
    successRate: number;
    avgLatencyMs: number;
    maxLatencyMs: number;
    p95LatencyMs: number | null;
    deltaImprovementRate: number;
    costProxy: number;
    totalValueGenerated: number;
    totalHoursSaved: number;
    avgRiskBefore: number;
    avgRiskAfter: number;
    queueBacklog: number;
    activeJobs: number;
    oldestAgeSeconds: number;
};

export type TenantRow = {
    tenant_id: string;
    totalJobs: number;
    successRate: number;
    avgLatencyMs: number;
    totalValueGenerated: number;
    totalHoursSaved: number;
    topPolicy: string | null;
    lastActivity: string;
};

export interface NotificationSettings {
    email: boolean;
    email_to?: string;
    webhooks?: string[];
}

export type TenantDetail = {
    id: string;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'QUARANTINED';
    plan: 'FREE' | 'PRO' | 'ENTERPRISE';
    rate_limit_rpm: number;
    plan_expires_at: string | null;
    last_active_at: string | null;
    daily_job_limit: number;
    max_batch_size: number;
    created_at: string;
    metadata_json: any;
    keyCount: number;
    dailyUsage: number;
    alerts_state_json?: {
        last_date?: string;
        fired?: string[];
    };
    notification_settings_json?: NotificationSettings;
};

export type JobsResponse = {
    total: number;
    jobs: Array<{
        id: string;
        tenant_id: string;
        type: string;
        status: string;
        progress: number;
        step?: string | null;
        attempts?: number | null;
        error?: any;
        created_at: string;
        updated_at: string;
    }>;
};

export type TopErrorRow = {
    errorCode: string;
    count: number;
    lastSeen: string;
};

export type AuditRow = {
    id: string;
    job_id: string;
    tenant_id: string;
    deployment_id?: string;
    request_id?: string;
    action: string;
    policy_slug: string;
    ip_address: string;
    created_at: string;
    user_role?: string;
    governance_snapshot?: any;
};

export type PreflightJob = {
    jobId: string;
    tenantId: string;
    userId?: string;
    filename?: string;
    fileSize?: number;
    policy?: string;
    status: 'CREATED' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'STALLED' | 'RETRYING' | 'CANCELLED';
    type: 'ANALYZE' | 'AUTOFIX' | 'CERTIFY';
    progress: number;
    issueCount?: number;
    fixCount?: number;
    noopFix?: boolean;
    rewritten?: boolean;
    certificationMode?: string;
    destructiveFixRisk?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    createdAt: string;
    completedAt?: string;
    artifacts?: any[];
};

export type PreflightJobsResponse = {
    total: number;
    jobs: PreflightJob[];
    source_status?: string;
};

export type PreflightWorker = {
    id: string;
    name: string;
    status: 'ONLINE' | 'BUSY' | 'OFFLINE' | 'MAINTENANCE';
    cpuUsage: number;
    memUsage: number;
    activeJobs: number;
    lastSeen: string;
};

export type PreflightQuota = {
    tenantId: string;
    limit: number;
    usage: number;
    resetAt: string;
};

export type CSWorkflow = {
    id: string;
    tenant_id: string;
    tenant_name: string;
    workflow_type: string;
    status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
    current_step: number;
    last_action_at: string | null;
    next_action_at: string | null;
    metadata_json: any;
    created_at: string;
    updated_at: string;
};

export type GovernanceBlock = {
    id: string;
    name: string;
    status: string;
    impact: string;
};

export async function getOverview(range: Range) {
    return adminFetch<OverviewResponse>(`/api/admin/metrics/overview?range=${range}`);
}

export type DashboardOverviewPayload = {
    ok: boolean;
    source_status: string;
    timestamp: string;
    preflight: {
        jobsToday: number | null;
        activeJobs: number | null;
        completedJobsToday: number | null;
        failedJobsToday: number | null;
        realExtractionCount: number | null;
        failedRuntimeEnvironmentCount: number | null;
        partialArtifactsCount: number | null;
        averageRiskScore: number | null;
        queueDepth: number | null;
        latestJobStatus: string | null;
    };
    governance: {
        activePolicyCount: number | null;
        latestPolicyApplied: string | null;
        jobsBlockedByPolicy: number | null;
        certificationBlockedCount: number | null;
        jobsCertifiableCount: number | null;
        lastGovernanceEvent: {
            rule: string;
            result: string;
            action: string;
            time: string;
        } | null;
        deploymentContractVersion: string;
        auditStatus: 'clean' | 'warnings' | 'errors' | null;
    };
    economy: {
        estimatedProductionValue: number | null;
        estimatedAvoidedReprintCost: number | null;
        averageRiskScore: number | null;
        averageMargin: number | null;
        jobsRequiringFix: number | null;
        fixSuccessCount: number | null;
        fixFailureCount: number | null;
        qualityScore: number | null;
    };
    storage: {
        artifactsCount: number | null;
        totalSizeBytes: number | null;
        latestArtifact: string | null;
    };
    audit: {
        latestEvents: Array<{
            event: string;
            status: string;
            details: string;
            timestamp: string;
        }>;
    };
    federation: {
        operationalNodes: number | null;
        activeDispatches: number | null;
        missingCoordinates: number | null;
        degradedNodes: number | null;
        averageUtilization: number | null;
    };
    warnings?: string[];
};

export async function getDashboardOverview() {
    return adminFetch<DashboardOverviewPayload>('/api/admin/dashboard/overview');
}

export async function getGovernanceBlocks() {
    return adminFetch<{ ok: boolean; blocks: GovernanceBlock[] }>('/api/admin/global/blocks');
}

export async function getGlobalPolicies() {
    return adminFetch<{ ok: boolean; policies: any[] }>('/api/admin/global/policies');
}
export async function getTenants(range: Range) {
    return adminFetch<TenantRow[]>(`/api/admin/metrics/tenants?range=${range}`);
}
export async function getTenantsList() {
    return adminFetch<TenantDetail[]>(`/api/admin/tenants`);
}
export async function updateTenant(id: string, data: Partial<TenantDetail>) {
    return adminFetch<{ ok: boolean }>(`/api/admin/tenants/${id}`, {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

export type TenantUsageHistory = {
    date: string;
    jobs_count: number;
    batches_count: number;
    value_generated: number;
    hours_saved: number;
};

export interface TimelineEvent {
    type: 'ALERT' | 'PLAN';
    event: string;
    details: any;
    timestamp: string;
}

export async function getTenantUsage(id: string, days: number = 7) {
    return adminFetch<TenantUsageHistory[]>(`/api/admin/tenants/${id}/usage?days=${days}`);
}

export async function getTenantTimeline(tenantId: string): Promise<TimelineEvent[]> {
    return adminFetch<TimelineEvent[]>(`/api/admin/tenants/${tenantId}/timeline`);
}

export async function getBillingData(tenantId: string, year: string, month: string): Promise<any> {
    return adminFetch<any>(`/api/admin/tenants/${tenantId}/billing/${year}/${month}`);
}

export async function getJobs(params: {
    status?: string;
    tenant?: string;
    type?: string;
    limit?: number;
    offset?: number;
}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.tenant) qs.set("tenant", params.tenant);
    if (params.type) qs.set("type", params.type);
    qs.set("limit", String(params.limit ?? 50));
    qs.set("offset", String(params.offset ?? 0));
    
    const res = await adminFetch<JobsResponse>(`/api/admin/jobs?${qs.toString()}`);
    
    // Industrial normalization to prevent frontend crashes on missing fields
    if (res && Array.isArray(res.jobs)) {
        res.jobs = res.jobs.map((job: any) => ({
            ...job,
            id: job.id ?? 'unknown',
            tenant_id: job.tenant_id ?? 'default',
            type: job.type ?? job.job_type ?? 'LEGACY',
            status: job.status ?? 'UNKNOWN',
            deployment_id: job.deployment_id ?? null,
            asset_id: job.asset_id ?? null,
            printhouse_id: job.printhouse_id ?? null,
            worker_id: job.worker_id ?? null,
            original_name: job.original_name ?? null,
            created_at: job.created_at ?? null,
            updated_at: job.updated_at ?? null,
        }));
    }
    
    return res;
}

export async function getJobDetail(jobId: string) {
    return adminFetch<{ ok: boolean, job: any, trace_id?: string | null }>(`/api/admin/jobs/${jobId}`);
}

export async function getJobTimeline(jobId: string) {
    return adminFetch<{ ok: boolean, timeline: any[], source_status?: string }>(`/api/admin/jobs/${jobId}/timeline`);
}

export async function getJobLogs(jobId: string) {
    return adminFetch<{ ok: boolean, logs: any[], source?: string, source_status?: string }>(`/api/admin/jobs/${jobId}/logs`);
}

export async function getJobArtifacts(jobId: string) {
    return adminFetch<{ ok: boolean, artifacts: any[], source_status?: string }>(`/api/admin/jobs/${jobId}/artifacts`);
}

export async function getJobWorkerDetails(jobId: string) {
    return adminFetch<{ ok: boolean, worker: any, source_status?: string }>(`/api/admin/jobs/${jobId}/worker`);
}

export async function getJobResult(jobId: string) {
    return adminFetch<{ ok: boolean, resulting_state: any, source_status?: string }>(`/api/admin/jobs/${jobId}/result`);
}


export async function getTopErrors(range: Range) {
    return adminFetch<TopErrorRow[]>(`/api/admin/errors/top?range=${range}`);
}
export async function getAudit(params: { tenant_id?: string; job_id?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (params.tenant_id) qs.set("tenant_id", params.tenant_id);
    if (params.job_id) qs.set("job_id", params.job_id);
    qs.set("limit", String(params.limit ?? 100));
    return adminFetch<AuditRow[]>(`/api/admin/audit?${qs.toString()}`);
}

// --- Admin Controls API --- //

export async function pauseQueue(queue: 'preflight' | 'autofix', reason: string) {
    return adminFetch<{ ok: boolean, state: string }>(`/api/admin/control/queue/pause`, {
        method: 'POST',
        body: JSON.stringify({ queue, reason })
    });
}

export async function resumeQueue(queue: 'preflight' | 'autofix', reason: string) {
    return adminFetch<{ ok: boolean, state: string }>(`/api/admin/control/queue/resume`, {
        method: 'POST',
        body: JSON.stringify({ queue, reason })
    });
}

export async function drainQueue(queue: 'preflight' | 'autofix', includeDelayed: boolean, reason: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/control/queue/drain`, {
        method: 'POST',
        body: JSON.stringify({ queue, includeDelayed, reason })
    });
}

export async function obliterateQueue(queue: 'preflight' | 'autofix', reason: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/control/queue/obliterate`, {
        method: 'POST',
        body: JSON.stringify({ queue, force: true, reason })
    });
}

export async function enableQuarantine(tenantId: string, ttl: number, reason: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/control/tenants/${tenantId}/quarantine/enable`, {
        method: 'POST',
        body: JSON.stringify({ ttl_minutes: ttl, reason })
    });
}

export async function disableQuarantine(tenantId: string, reason: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/control/tenants/${tenantId}/quarantine/disable`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export async function getQuarantineList() {
    return adminFetch<{ ok: boolean, items: any[] }>(`/api/admin/control/tenants/quarantine`);
}

export async function retryJob(jobId: string, reason: string) {
    return adminFetch<{ ok: boolean, new_job_id: string }>(`/api/admin/control/jobs/${jobId}/retry`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export async function cancelJob(jobId: string, reason: string) {
    return adminFetch<{ ok: boolean, status: string }>(`/api/admin/control/jobs/${jobId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

// --- Node Orchestration API ---
export async function drainNode(nodeId: string, reason: string) {
    return adminFetch<{ ok: boolean, nodeId: string }>(`/api/admin/control/node/${nodeId}/drain`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export async function lockNode(nodeId: string, reason: string) {
    return adminFetch<{ ok: boolean, nodeId: string }>(`/api/admin/control/node/${nodeId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export async function purgeNode(nodeId: string, reason: string) {
    return adminFetch<{ ok: boolean, nodeId: string }>(`/api/admin/control/node/${nodeId}/purge`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export async function shiftNode(sourceNodeId: string, targetNodeId: string, reason: string) {
    return adminFetch<{ ok: boolean, sourceNodeId: string, targetNodeId: string }>(`/api/admin/control/node/${sourceNodeId}/shift`, {
        method: 'POST',
        body: JSON.stringify({ targetNodeId, reason })
    });
}


// --- Machine Intelligence API (Phase 34) ---
export async function getMachineFederationDetails(id: string) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/federation/machines/${id}`);
}

export async function getMachineTelemetry(id: string) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/telemetry/machines/${id}`);
}

export async function getMachineDispatchHistory(id: string) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/dispatch/machines/${id}`);
}

export async function getMachineCapacityAnalysis(id: string) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/capacity/machines/${id}`);
}


export async function getAdminQueueStats() {

    return adminFetch<{ ok: boolean, stats: any }>(`/api/admin/control/queue/stats`);
}
export async function getQueue() {
    return adminFetch<any>(`/api/admin/queue`);
}

export async function getPrinters(filters: string = "") {
    return adminFetch<any[]>(`/api/admin/network/printers${filters ? '?' + filters : ''}`);
}

export async function getMachines() {
    return adminFetch<{ ok: boolean; total: number; machines: any[]; status: string }>('/api/admin/machines');
}

export async function getNetworkOverview() {
    return adminFetch<any>(`/api/admin/network/overview`);
}

export async function getCapacity() {
    return adminFetch<any[]>(`/api/admin/network/capacity`);
}

export async function getHealth() {
    return adminFetch<any[]>(`/api/admin/network/health`);
}

export async function getRoutingOverview() {
    return adminFetch<any>(`/api/admin/routing/overview`);
}

export async function getCSWorkflows(): Promise<CSWorkflow[]> {
    const res = await adminFetch<{ ok: boolean, workflows: CSWorkflow[] }>(`/api/admin/cs-workflows`);
    return res.workflows;
}

export async function getMarketplaceSessions() {
    return adminFetch<any[]>(`/api/admin/marketplace/sessions`);
}

export async function getMarketplaceSessionDetail(id: string) {
    return adminFetch<any>(`/api/admin/marketplace/sessions/${id}`);
}

export async function selectMarketplaceOffer(sessionId: string, offerId: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/marketplace/sessions/${sessionId}/select`, {
        method: 'POST',
        body: JSON.stringify({ offer_id: offerId, selection_mode: 'ADMIN_OVERRIDE' })
    });
}

export async function getFinanceTransactions() {
    return adminFetch<any[]>(`/api/admin/finance/transactions`);
}

export async function getFinanceMetrics() {
    return adminFetch<any>(`/api/admin/finance/metrics`);
}

export async function getFinanceTransactionDetail(id: string) {
    return adminFetch<any>(`/api/admin/finance/transactions/${id}`);
}

export async function getNegotiations() {
    return adminFetch<any[]>(`/api/admin/marketplace/ready/negotiations`);
}

export async function getNegotiationChain(offerId: string) {
    return adminFetch<any[]>(`/api/admin/marketplace/ready/negotiations/${offerId}`);
}

export async function acceptCounteroffer(offerId: string, counterofferId: string) {
    return adminFetch<{ ok: boolean }>(`/api/printer-offers/${offerId}/counter/${counterofferId}/accept`, {
        method: 'POST'
    });
}

export async function getOffers() {
    return adminFetch<any[]>(`/api/admin/offers`);
}

export async function getOffersMetrics() {
    return adminFetch<any>(`/api/admin/offers/metrics`);
}

export async function postHelpAnalytics(payload: {
    event_type: 'article_viewed' | 'search_query' | 'search_result_clicked' | 'helpful_yes' | 'helpful_no' | 'improvement_suggested';
    article_id?: string;
    search_query?: string;
    tenant_id?: string;
    user_id?: string;
}) {
    // Fire and forget usually, but we return the promise
    return adminFetch<{ ok: boolean, id: number }>(`/api/admin/help/analytics`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

// --- Autonomy API ---
export async function getAutonomyPipelines() {
    return adminFetch<any[]>(`/api/admin/autonomy`);
}

export async function getAutonomyMetrics() {
    return adminFetch<any>(`/api/admin/autonomy/metrics`);
}

export async function getIndustrialIncidents() {
    // Re-uses audit log with type OPERATIONAL_INCIDENT
    return adminFetch<any[]>('/api/admin/audit?action=OPERATIONAL_INCIDENT&limit=50');
}

export async function getIndustrialSnapshot() {
    return adminFetch<any>('/api/admin/telemetry/industrial');
}

export async function getNodeMESStats(nodeId: string) {
    return adminFetch<{ ok: boolean, stats: any }>(`/api/admin/telemetry/nodes/${nodeId}/mes`);
}

export async function triggerOrchestrationAnalysis() {
    return adminFetch<{ ok: boolean }>('/api/admin/orchestration/analyze', {
        method: 'POST'
    });
}

export async function triggerLifecycleProcess() {
    return adminFetch<{ ok: boolean, results: { transitioned: number, purged: number } }>('/api/admin/preflight/artifacts/lifecycle', {
        method: 'POST'
    });
}

export async function getAutonomyPipelineDetail(id: string) {
    return adminFetch<any>(`/api/admin/autonomy/${id}`);
}

export async function pauseAutonomyPipeline(id: string, reason: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/autonomy/${id}/pause`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export async function resumeAutonomyPipeline(id: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/autonomy/${id}/resume`, {
        method: 'POST'
    });
}

export async function retryAutonomyPipelineStep(id: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/autonomy/${id}/retry-step`, {
        method: 'POST'
    });
}

// --- Commercial Commitments ---
export async function getCommercialCommitments() {
    return adminFetch<any[]>(`/api/admin/commercial`);
}

export async function getCommercialCommitmentDetail(id: string) {
    return adminFetch<any>(`/api/admin/commercial/${id}`);
}

export async function lockCommercialCommitment(id: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/commercial/${id}/lock`, {
        method: 'POST'
    });
}

export async function voidCommercialCommitment(id: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/commercial/${id}/void`, {
        method: 'POST'
    });
}

export async function getSettlementReadiness() {
    return adminFetch<any[]>(`/api/admin/commercial/settlement/readiness`);
}

// --- Pricing (Profiles/Quotes) ---
export async function getPricingProfiles() {
    return adminFetch<any[]>(`/api/admin/pricing/profiles`);
}

export async function getJobQuotes(jobId: string) {
    return adminFetch<any[]>(`/api/admin/pricing/jobs/${jobId}/quotes`);
}

export async function createPricingProfile(data: object) {
    return adminFetch<{ ok: boolean, id: string }>(`/api/admin/pricing/profiles`, {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

export async function updatePricingProfile(id: string, data: object) {
    return adminFetch<{ ok: boolean }>(`/api/admin/pricing/profiles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
}

export async function deletePricingProfile(id: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/pricing/profiles/${id}`, {
        method: 'DELETE'
    });
}

// --- Economic Routing ---
export async function getEconomicRoutingHistory() {
    return adminFetch<any[]>(`/api/admin/routing/economic/history`);
}

export async function getEconomicRoutingConflicts() {
    return adminFetch<any[]>(`/api/admin/routing/economic/conflicts`);
}

export async function getRoutingRecommendations(specs: any) {
    return adminFetch<any>(`/api/admin/routing/decision/recommend`, {
        method: 'POST',
        body: JSON.stringify({ specs })
    });
}

export async function getRoutingHealth() {
    return adminFetch<any>(`/api/admin/routing/decision/health`);
}

// --- Production Dispatch ---
export async function getDispatches() {
    return adminFetch<{ ok: boolean, dispatches: any[] }>(`/api/admin/dispatch`);
}

export async function getDispatchDetail(id: string) {
    return adminFetch<{ ok: boolean, dispatch: any }>(`/api/admin/dispatch/${id}`);
}

export async function assignDispatch(jobId: string, recommendation: any) {
    return adminFetch<{ ok: boolean, dispatchId: string }>(`/api/admin/dispatch/assign`, {
        method: 'POST',
        body: JSON.stringify({ jobId, recommendation })
    });
}

export async function updateDispatchStatus(id: string, status: string, message?: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/dispatch/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, message })
    });
}

export async function rerouteDispatch(id: string, reason: string) {
    return adminFetch<{ ok: boolean, message: string }>(`/api/admin/dispatch/${id}/reroute`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export async function scoreDispatch(jobInput: any, options?: any) {
    return adminFetch<any>(`/api/admin/dispatch/score`, {
        method: 'POST',
        body: JSON.stringify({ jobInput, options })
    });
}

export async function createDispatch(jobInput: any, selectedCandidate: any, options?: any) {
    return adminFetch<any>(`/api/admin/dispatch/create`, {
        method: 'POST',
        body: JSON.stringify({ jobInput, selectedCandidate, options })
    });
}

export async function rollbackDispatch(dispatchId: string, reason: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/dispatch/${dispatchId}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

export async function getIndustrialTelemetryOverview() {
    return adminFetch<{ ok: boolean, telemetry: any }>('/api/admin/dispatch/telemetry/overview');
}

export async function sendNodeHeartbeat(payload: any) {
    return adminFetch<{ ok: boolean, state: string }>('/api/admin/dispatch/heartbeat', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

// --- Phase 28 — Live Autonomous Dispatch Orchestration ---
export async function getIndustrialLiveState() {
    return adminFetch<{ ok: boolean, stats: any }>('/api/admin/dispatch/live-state');
}

export async function getActiveDispatches() {
    return adminFetch<{ ok: boolean, dispatches: any[] }>('/api/admin/dispatch/active');
}

export async function getSLARisks() {
    return adminFetch<{ ok: boolean, risks: any[] }>('/api/admin/dispatch/sla-risks');
}

export async function getRerouteEvents() {
    return adminFetch<{ ok: boolean, events: any[] }>('/api/admin/dispatch/reroutes');
}

export async function getNodeCapacityHeatmap() {
    return adminFetch<{ ok: boolean, nodes: any[] }>('/api/admin/dispatch/capacity');
}

export async function getIndustrialNodeDetail(id: string) {
    return adminFetch<{ ok: boolean, node: any, heartbeats: any[], dispatches: any[] }>(`/api/admin/dispatch/node/${id}`);
}

export async function triggerSLAScan() {
    return adminFetch<{ ok: boolean, result: any }>('/api/admin/dispatch/scan', { method: 'POST' });
}

export async function triggerRebalance() {
    return adminFetch<{ ok: boolean, result: any }>('/api/admin/dispatch/rebalance', { method: 'POST' });
}

// --- Phase 29 — Predictive Industrial Intelligence ---
export async function getReliabilityRanking() {
    return adminFetch<{ ok: boolean, ranking: any[] }>('/api/admin/dispatch/intelligence/reliability');
}

export async function getCongestionForecast() {
    return adminFetch<{ ok: boolean, forecasts: any[] }>('/api/admin/dispatch/intelligence/congestion');
}

export async function getFederationIntelligence() {
    return adminFetch<{ ok: boolean, snapshots: any[], loadDrift: any[] }>('/api/admin/dispatch/intelligence/federation');
}

export async function getOptimizationHistory() {
    return adminFetch<{ ok: boolean, history: any[], cycles: any[] }>('/api/admin/dispatch/intelligence/optimization');
}

export async function getManufacturingPredictions() {
    return adminFetch<{ ok: boolean, predictions: any[] }>('/api/admin/dispatch/intelligence/predictions');
}

// --- Phase 30 — Autonomous Industrial Economic Engine ---
export async function getDispatchEconomicOverview() {
    return adminFetch<{ ok: boolean, snapshots: any[] }>('/api/admin/dispatch/economics/overview');
}

export async function getEconomicRisk() {
    return adminFetch<{ ok: boolean, risks: any[] }>('/api/admin/dispatch/economics/risk');
}

export async function getProfitabilityHistory() {
    return adminFetch<{ ok: boolean, history: any[] }>('/api/admin/dispatch/economics/profitability');
}

export async function simulateEconomicRouting(jobData: any, candidateIds: string[]) {
    return adminFetch<{ ok: boolean, simulation: any }>('/api/admin/dispatch/economics/simulator', {
        method: 'POST',
        body: JSON.stringify({ jobData, candidateIds })
    });
}

export async function getNodeEconomicDetail(nodeId: string) {
    return adminFetch<{ ok: boolean, profitability: any, pressure: any[] }>(`/api/admin/dispatch/economics/node/${nodeId}`);
}

// --- Phase 31 — Global Industrial Governance & Resilience ---
export async function getGovernanceOverview() {
    return adminFetch<{ ok: boolean, snapshots: any[] }>('/api/admin/dispatch/governance/overview');
}

export async function getRegionalResilience() {
    return adminFetch<{ ok: boolean, resilience: any[] }>('/api/admin/dispatch/governance/resilience');
}

export async function getSystemicRisk() {
    return adminFetch<{ ok: boolean, risks: any[], cascading: any[] }>('/api/admin/dispatch/governance/systemic-risk');
}

export async function runResilienceSimulation() {
    return adminFetch<{ ok: boolean, simulation: any }>('/api/admin/dispatch/governance/simulation');
}

// --- Phase 32 — Temporal Industrial Intelligence ---
export async function getTemporalOverview() {
    return adminFetch<{ ok: boolean, snapshots: any[] }>('/api/admin/dispatch/temporal/overview');
}

export async function getFutureForecasts() {
    return adminFetch<{ ok: boolean, forecasts: any[] }>('/api/admin/dispatch/temporal/futures');
}

export async function getParallelTimelines() {
    return adminFetch<{ ok: boolean, timelines: any[] }>('/api/admin/dispatch/temporal/timelines');
}

export async function getTemporalRisk() {
    return adminFetch<{ ok: boolean, risks: any[] }>('/api/admin/dispatch/temporal/risk');
}

// --- Phase 33 — Reality Simulation & Synthetic Operations Twin ---
export async function getSimulationOverview() {
    return adminFetch<{ ok: boolean, snapshots: any[] }>('/api/admin/dispatch/simulation/overview');
}

export async function runManualSimulation(type: string, config: any = {}) {
    return adminFetch<{ ok: boolean, result: any }>('/api/admin/dispatch/simulation/run', {
        method: 'POST',
        body: JSON.stringify({ type, config })
    });
}

export async function getSimulationRuns() {
    return adminFetch<{ ok: boolean, runs: any[] }>('/api/admin/dispatch/simulation/runs');
}

export async function getSimulationRecommendations() {
    return adminFetch<{ ok: boolean, recommendations: any[] }>('/api/admin/dispatch/simulation/recommendations');
}

export async function getFutureProjections() {
    return adminFetch<{ ok: boolean, projections: any[] }>('/api/admin/dispatch/simulation/future-projections');
}

// --- Phase 16 — Industrial Federation & Swarm ---
export async function getFederationHealth() {
    return adminFetch<{ ok: boolean, health: any }>('/api/admin/federation/health');
}

export async function getFederationFactories() {
    return adminFetch<{ ok: boolean, factories: any[] }>('/api/admin/federation/factories');
}

export async function getFederationConsensus() {
    return adminFetch<{ ok: boolean, events: any[] }>('/api/admin/federation/consensus');
}

export async function getFederationDigitalTwin() {
    return adminFetch<{ ok: boolean, snapshots: any[] }>('/api/admin/federation/digital-twin');
}

export async function getFederationDelegations() {
    return adminFetch<{ ok: boolean, delegations: any[] }>('/api/admin/federation/delegations');
}

export async function getFederationRecovery() {
    return adminFetch<{ ok: boolean, events: any[] }>('/api/admin/federation/recovery');
}

export async function rebalanceFederation() {
    return adminFetch<{ ok: boolean, rebalanceExecuted: boolean }>('/api/admin/federation/rebalance', {
        method: 'POST'
    });
}

export async function recoverFederationFactory(factoryId: string) {
    return adminFetch<{ ok: boolean, message: string }>(`/api/admin/federation/recover`, {
        method: 'POST',
        body: JSON.stringify({ factoryId })
    });
}

export async function snapshotFederation() {
    return adminFetch<{ ok: boolean, snapshot: any }>('/api/admin/federation/snapshot', {
        method: 'POST'
    });
}


// --- Engagement ---
export async function getEngagementSignals() {
    const res = await adminFetch<{ ok: boolean, signals: any[] }>(`/api/admin/engagement-signals`);
    return res.signals || [];
}

export async function getEngagementStats() {
    const res = await adminFetch<{ ok: boolean, stats: any[] }>(`/api/admin/engagement-stats`);
    return res.stats || [];
}

// --- Printhouses ---
export async function getPrinthouses() {
    const res = await adminFetch<{ ok: boolean, printhouses: any[] }>(`/api/admin/printhouses`);
    return res.printhouses;
}

export async function createPrinthouse(data: object) {
    return adminFetch<{ ok: boolean, id: string }>(`/api/admin/printhouses`, {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

export async function updatePrinthouse(mongoId: string, data: object) {
    return adminFetch<{ ok: boolean }>(`/api/admin/printhouses/${mongoId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
}

export async function deletePrinthouse(mongoId: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/printhouses/${mongoId}`, {
        method: 'DELETE'
    });
}

// --- Orders ---
export type OrderStatus = 'pending' | 'reviewing' | 'in_production' | 'shipped' | 'delivered' | 'cancelled';

export type Order = {
    id: number;
    order_ref: string;
    user_id: string;
    status: OrderStatus;
    specs: any;
    offer_print_house: string;
    offer_price: number;
    created_at: string;
    updated_at: string;
};

export type OrdersResponse = {
    ok: boolean;
    total: number;
    orders: Order[];
};

export async function getOrders(params: { status?: OrderStatus; user_id?: string; limit?: number; offset?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.user_id) qs.set('user_id', params.user_id);
    qs.set('limit', String(params.limit ?? 50));
    qs.set('offset', String(params.offset ?? 0));
    return adminFetch<OrdersResponse>(`/api/admin/orders?${qs.toString()}`);
}

// --- Preflight Operations API --- //

export async function getPreflightJobs(params: {
    status?: string;
    tenant?: string;
    type?: string;
    risk?: string;
    largeOnly?: boolean;
    limit?: number;
    offset?: number;
}): Promise<PreflightJobsResponse> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.tenant) qs.set("tenant", params.tenant);
    if (params.type) qs.set("type", params.type);
    if (params.risk) qs.set("risk", params.risk);
    if (params.largeOnly) qs.set("largeOnly", "true");
    qs.set("limit", String(params.limit ?? 50));
    qs.set("offset", String(params.offset ?? 0));
    
    try {
        const res = await adminFetch<any>(`/api/admin/preflight/jobs?${qs.toString()}`);
        // Normalize: { jobs: [] } or { data: [] } or raw array
        let rawJobs = res.jobs || res.data || (Array.isArray(res) ? res : []);
        
        const jobs = rawJobs.map((j: any) => ({
            ...j,
            jobId: j.jobId ?? j.id ?? 'unknown',
            tenantId: j.tenantId ?? j.tenant_id ?? 'default',
            status: j.status ?? 'UNKNOWN',
            type: j.type ?? 'ANALYZE',
            progress: j.progress ?? 0,
            createdAt: j.createdAt ?? j.created_at ?? null
        }));

        const total = res.total ?? jobs.length;
        return { total, jobs };
    } catch (e) {
        console.warn(`[PREFLIGHT][UPSTREAM-MISSING] getPreflightJobs failed:`, e);
        return { total: 0, jobs: [] };
    }
}

export async function getPreflightJob(jobId: string): Promise<PreflightJob | null> {
    try {
        const res = await adminFetch<any>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}`);
        // Normalize: { result: job } or raw job
        return res.result || res.job || (res.jobId ? res : null);
    } catch (e) {
        console.warn(`[PREFLIGHT][UPSTREAM-MISSING] getPreflightJob(${jobId}) failed:`, e);
        return null;
    }
}

export async function getPreflightArtifacts(jobId: string): Promise<any[]> {
    try {
        const res = await adminFetch<any>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/artifacts`);
        // Normalize: { artifacts: [] } or raw array
        return res.artifacts || res.data || (Array.isArray(res) ? res : []);
    } catch (e) {
        console.warn(`[PREFLIGHT][UPSTREAM-MISSING] getPreflightArtifacts(${jobId}) failed:`, e);
        return [];
    }
}

export async function getPreflightWorkers() {
    try {
        const res = await adminFetch<any>(`/api/admin/preflight/health`);
        const workers = res.workers || (Array.isArray(res) ? res : []);
        return { ok: true, workers };
    } catch (e) {
        console.warn(`[PREFLIGHT][UPSTREAM-MISSING] getPreflightWorkers failed:`, e);
        return { ok: false, workers: [] };
    }
}

export async function getPreflightQuotas(): Promise<PreflightQuota[]> {
    try {
        const res = await adminFetch<any>(`/api/admin/preflight/storage`);
        return res.quotas || (Array.isArray(res) ? res : []);
    } catch (e) {
        console.warn(`[PREFLIGHT][UPSTREAM-MISSING] getPreflightQuotas failed:`, e);
        return [];
    }
}

export async function getLargeDocumentJobs(params: { limit?: number; offset?: number }) {
    return getPreflightJobs({ ...params, largeOnly: true });
}

export async function getAdminPreflightPolicies(): Promise<{ ok: boolean; source?: string; policies: any[] }> {
    try {
        const res = await adminFetch<any>('/api/admin/preflight/policies');
        const policies = res?.policies || (Array.isArray(res?.data) && res.data.length > 0 ? res.data : []) || [];
        return {
            ok: policies.length > 0 ? true : false,
            source: res?.source || res?.source_status || 'unavailable',
            policies
        };
    } catch (e) {
        console.warn(`[PREFLIGHT][POLICIES] getAdminPreflightPolicies failed:`, e);
        return { ok: false, source: 'error', policies: [] };
    }
}

export async function getGlobalArtifacts(params: { tenant?: string; type?: string; limit?: number; offset?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.tenant) qs.set("tenantId", params.tenant);
    if (params.type) qs.set("type", params.type);
    qs.set("limit", String(params.limit ?? 50));
    qs.set("offset", String(params.offset ?? 0));
    
    try {
        const res = await adminFetch<any>(`/api/admin/preflight/artifacts?${qs.toString()}`);
        return res.artifacts || [];
    } catch (e) {
        console.warn(`[PREFLIGHT] getGlobalArtifacts failed:`, e);
        return [];
    }
}

export async function uploadPreflightFile(file: File, tenantId: string = 'system') {
    const formData = new FormData();
    formData.append('file', file);
    
    // Using raw fetch here because adminFetch might not handle FormData correctly without adjustment
    const token = getAuthToken();
    const response = await fetch('/api/admin/preflight/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'X-Tenant-Id': tenantId,
            'X-Trace-Id': `trace_${Date.now()}`
        },
        body: formData
    });
    
    const res = await response.json();
    if (!res.ok) throw new Error(res.error?.message || 'Upload failed');
    return res.upload;
}

export async function createPreflightJob(data: { uploadId: string; type: string; policy?: string; tenantId?: string }) {
    const res = await adminFetch<any>('/api/admin/preflight/jobs', {
        method: 'POST',
        headers: {
            'X-Tenant-Id': data.tenantId || 'system'
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(res.error?.message || 'Job creation failed');
    return res.job;
}

export async function getStorageSummary(tenantId?: string) {
    const url = tenantId ? `/api/admin/preflight/storage/${tenantId}` : '/api/admin/preflight/storage';
    try {
        const res = await adminFetch<any>(url);
        return res;
    } catch (e) {
        console.warn(`[PREFLIGHT] getStorageSummary failed:`, e);
        return null;
    }
}

export async function deletePreflightArtifact(artifactId: string) {
    const res = await adminFetch<any>(`/api/admin/preflight/artifacts/${artifactId}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error(res.error?.message || 'Delete failed');
    return res;
}

export async function syncPreflightJob(jobId: string) {
    const res = await adminFetch<any>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/sync`, {
        method: 'POST'
    });
    return res.job;
}

export async function retryPreflightJob(jobId: string) {
    const res = await adminFetch<any>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: 'POST'
    });
    return res.job;
}

export async function cancelPreflightJob(jobId: string) {
    const res = await adminFetch<any>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST'
    });
    return res.job;
}

export async function runPreflightGC(dryRun: boolean = false) {
    const res = await adminFetch<any>(`/api/admin/preflight/artifacts/gc${dryRun ? '?dryRun=true' : ''}`, {
        method: 'POST'
    });
    return res.results;
}

export async function recoverStalledPreflightJobs() {
    const res = await adminFetch<any>('/api/admin/preflight/jobs/recover-stalled', {
        method: 'POST'
    });
    return res;
}

export async function getLivePolicies() {
    const res = await getAdminPreflightPolicies();
    return {
        policies: res.policies || [],
        source_status: res.source || 'UNAVAILABLE'
    };
}

export async function getJobFindings(jobId: string) {
    try {
        const res = await adminFetch<any>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/findings`);
        return res.findings || [];
    } catch (e) {
        console.warn(`[PREFLIGHT] getJobFindings(${jobId}) failed:`, e);
        return [];
    }
}

export async function getJobEvidence(jobId: string) {
    try {
        const res = await adminFetch<any>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/evidence`);
        return res.evidence || null;
    } catch (e) {
        console.warn(`[PREFLIGHT] getJobEvidence(${jobId}) failed:`, e);
        return null;
    }
}

export async function triggerJobFix(jobId: string, policy?: string) {
    const res = await adminFetch<any>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/fix`, {
        method: 'POST',
        body: JSON.stringify(policy ? { policy } : {})
    });
    return res.job;
}

// --- Production Notifications ---

export async function getNotifications(limit = 20) {
  const res = await adminFetch<any>(`/api/admin/manufacturing/notifications?limit=${limit}`);
  return res.notifications || [];
}

export async function markNotificationRead(id: string) {
  return adminFetch<any>(`/api/admin/manufacturing/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead() {
  return adminFetch<any>(`/api/admin/manufacturing/notifications/read-all`, { method: 'POST' });
}

// --- Production Financials ---

export async function getProductionFinancials(packageId?: string) {
  const url = packageId ? `/api/admin/manufacturing/financials/${packageId}` : '/api/admin/manufacturing/financials';
  return adminFetch<any>(url);
}
// --- Forensics & Telemetry API --- //

export type ForensicTimelineEvent = {
    event: string;
    timestamp: string;
    actor: string;
    metadata: any;
};

export type ForensicTimelineResponse = {
    ok: boolean;
    jobId: string;
    traceId?: string;
    state: string;
    timeline: ForensicTimelineEvent[];
};

export async function getForensicTimeline(jobId: string): Promise<ForensicTimelineResponse> {
    return adminFetch<ForensicTimelineResponse>(`/api/admin/forensics/timeline/${encodeURIComponent(jobId)}`);
}

export async function getTelemetrySnapshot(): Promise<any> {
    const res = await adminFetch<any>('/api/admin/telemetry/snapshot');
    return res.snapshot;
}

// --- Industrial Artifacts & Workers API --- //

export async function getArtifacts(params: any = {}) {
    const qs = new URLSearchParams(params);
    return adminFetch<{ ok: boolean, artifacts: any[] }>(`/api/admin/artifacts?${qs.toString()}`);
}

export async function getArtifactLineage(jobId: string) {
    return adminFetch<{ ok: boolean, lineage: any[] }>(`/api/admin/artifacts/lineage/${jobId}`);
}

export async function getWorkerFleet() {
    return adminFetch<{ ok: boolean, fleet: any[] }>('/api/admin/workers/fleet');
}

export async function setWorkerStatus(id: string, status: string) {
    return adminFetch<{ ok: boolean }>(`/api/admin/workers/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status })
    });
}

// --- Intelligence API --- //

export async function getIntelligenceOverview() {
    return adminFetch<{ ok: boolean, summary: any, cbStatus: any, guardrailDecisions: any }>(`/api/admin/intelligence/overview`);
}

export async function getAnomalies() {
    return adminFetch<{ ok: boolean, anomalies: any[] }>(`/api/admin/intelligence/anomalies`);
}

// --- Economic Routing API --- //

export async function getRoutingEconomicOverview() {
    return adminFetch<{ metrics: any, avg_final_score: number }>(`/api/admin/routing/economic/overview`);
}

export async function getEconomicConflicts() {
    return adminFetch<any[]>(`/api/admin/routing/economic/conflicts`);
}

export async function getRoutingMap() {
    return adminFetch<{ nodes: any[], routes: any[], summary: any, counts?: any, source_status?: string }>('/api/admin/routing/map');
}

export async function getFederationMap() {
    return adminFetch<{ nodes: any[], routes: any[], summary: any, counts?: any, source_status?: string }>('/api/admin/federation/map');
}

export async function getRoutingHeatmap() {
    return adminFetch<any[]>('/api/admin/routing/heatmap');
}

export async function getRoutingLive() {
    return adminFetch<any>('/api/admin/routing/live');
}

// --- Phase 34 — Live Federation Activation ---
export async function getLiveCapacity() {
    return adminFetch<{ ok: boolean, overview: any[] }>('/api/admin/nodes/capacity/live');
}

export async function getLiveSLARisks() {
    return adminFetch<{ ok: boolean, risks: any[] }>('/api/admin/dispatch/sla/risks');
}

export async function getDispatchSLAEvidence(dispatchId: string) {
    return adminFetch<{ ok: boolean, snapshot: any, evidence: any[] }>(`/api/admin/dispatch/${dispatchId}/sla-evidence`);
}

// --- Materials & Paper Catalog API (Phase 34) ---
const normalizeMaterialsResponse = (response: any) => {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.materials)) return response.materials;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.inventory)) return response.inventory;
    if (Array.isArray(response?.items)) return response.items;
    if (Array.isArray(response?.rows)) return response.rows;
    return [];
};

export async function getMaterialsCatalog() {
    const token = getAuthToken();
    const storedTenantId = getUserTenantId();
    const storedPrinthouseId = getUserPrinthouseId();
    const headers: Record<string, string> = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(storedTenantId ? { "X-Tenant-Id": storedTenantId } : {}),
        ...(storedPrinthouseId ? { "X-Printhouse-Id": storedPrinthouseId } : {})
    };

    const res = await fetch(`/api/admin/materials?_ts=${Date.now()}`, { headers, credentials: "include" });
    const text = await res.text();

    if (!res.ok) {
        console.error('[MATERIALS][HTTP_ERROR]', {
            status: res.status,
            statusText: res.statusText,
            body: text,
        });
        throw new Error(`Materials API failed: ${res.status} ${text}`);
    }

    const parsed = JSON.parse(text);
    const normalized = normalizeMaterialsResponse(parsed);
    console.info('[MATERIALS][API][RAW]', parsed);
    console.info('[MATERIALS][API][NORMALIZED_COUNT]', normalized.length);
    console.info('[MATERIALS][API][FIRST]', normalized[0]);
    return { 
        ok: true, 
        data: normalized,
        materials: normalized,
        summary: parsed?.summary || null,
        source_status: parsed?.source_status 
    };
}

export async function getNodeMaterialsInventory(nodeId: string) {
    const res = await adminFetch<any>(`/api/admin/materials/node/${encodeURIComponent(nodeId)}?_ts=${Date.now()}`);
    const normalized = normalizeMaterialsResponse(res);
    console.info('[MATERIALS][API][NODE_RAW]', res);
    console.info('[MATERIALS][API][NODE_NORMALIZED_COUNT]', normalized.length);
    console.info('[MATERIALS][API][NODE_FIRST]', normalized[0]);
    return { 
        ok: true, 
        data: normalized,
        materials: normalized,
        summary: res?.summary || null,
        source_status: res?.source_status 
    };
}

export async function getMaterialDetail(id: string) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/materials/${encodeURIComponent(id)}`);
}

export async function reserveMaterialCapacity(dispatchId: string, nodeId: string, specs: any) {
    return adminFetch<{ ok: boolean, reserved: boolean, material_id: string, units: number }>('/api/admin/materials/reserve', {
        method: 'POST',
        body: JSON.stringify({ dispatch_id: dispatchId, node_id: nodeId, specs })
    });
}

export async function releaseMaterialCapacity(dispatchId: string, nodeId: string, specs: any) {
    return adminFetch<{ ok: boolean, released: boolean, material_id: string, units: number }>('/api/admin/materials/release', {
        method: 'POST',
        body: JSON.stringify({ dispatch_id: dispatchId, node_id: nodeId, specs })
    });
}

// --- Materials MES Operator Workflows API --- //

export async function createCatalogMaterial(payload: any) {
    return adminFetch<{ ok: boolean, data: any }>('/api/admin/materials', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function intakeMaterialStock(id: string, payload: { quantity: number, reason?: string, supplier_batch?: string, expected_use?: string }) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/materials/${encodeURIComponent(id)}/intake`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function adjustMaterialStock(id: string, payload: { quantity_delta: number, reason: string, operator_note?: string }) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/materials/${encodeURIComponent(id)}/adjust`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function reserveMaterialStockWorkflow(id: string, payload: { quantity: number, job_id?: string, dispatch_id?: string, expiration?: string }) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/materials/${encodeURIComponent(id)}/reserve`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function releaseMaterialStockWorkflow(id: string, quantity?: number) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/materials/${encodeURIComponent(id)}/release`, {
        method: 'POST',
        body: JSON.stringify({ quantity })
    });
}

export async function consumeMaterialStock(id: string, payload: { quantity_consumed: number, waste_units?: number, reason?: string, job_id?: string }) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/materials/${encodeURIComponent(id)}/consume`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function createMaterialProcurementOrder(id: string, payload: { supplier_name?: string, ordered_units: number, expected_delivery_date?: string, risk?: string, notes?: string }) {
    return adminFetch<{ ok: boolean, data: any }>(`/api/admin/materials/${encodeURIComponent(id)}/procurements`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function receiveMaterialProcurementOrder(procurementId: string) {
    return adminFetch<{ ok: boolean, received: boolean }>(`/api/admin/materials/procurements/${encodeURIComponent(procurementId)}/receive`, {
        method: 'POST'
    });
}

export async function getMaterialTimelineEvents(id: string) {
    return adminFetch<{ ok: boolean, events: any[] }>(`/api/admin/materials/${encodeURIComponent(id)}/events`);
}

export async function getMaterialProcurementList(id: string) {
    return adminFetch<{ ok: boolean, procurements: any[] }>(`/api/admin/materials/${encodeURIComponent(id)}/procurements`);
}

export async function getMaterialDepletionForecast(id: string) {
    return adminFetch<{ ok: boolean, forecast: any }>(`/api/admin/materials/${encodeURIComponent(id)}/forecast`);
}

// --- Forensic Audit Explorer API (Phase 34) ---
export interface AuditExplorerEvent {
    id: string;
    timestamp: string;
    actor: string;
    event_type: string;
    entity_type: string;
    entity_id: string;
    severity: string;
    trace_id: string;
    source_service: string;
    message: string;
    metadata_json?: any;
    tenant_id: string;
}

export async function getAuditLogs(params: Record<string, any> = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
            qs.append(k, String(v));
        }
    });
    return adminFetch<{ ok: boolean, count: number, data: AuditExplorerEvent[] }>(`/api/admin/audit?${qs.toString()}`);
}

export async function getAuditDetail(id: string) {
    return adminFetch<{ ok: boolean, data: AuditExplorerEvent, lineage?: AuditExplorerEvent[] }>(`/api/admin/audit/${encodeURIComponent(id)}`);
}

export async function getAuditEntityTimeline(entityType: string, entityId: string) {
    return adminFetch<{ ok: boolean, entityType: string, entityId: string, timeline: AuditExplorerEvent[] }>(`/api/admin/audit/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
}

// --- Manufacturing / Production Packages API (Phase 34) ---
export interface ProductionPackage {
    id: string;
    tenant_id: string;
    source: string;
    source_job_id: string;
    source_artifact_id: string;
    fixed_pdf_artifact_id?: string | null;
    certified_pdf_artifact_id?: string | null;
    book_spec_json?: any;
    preflight_report_json?: any;
    policy_id?: string;
    status: 'DRAFT' | 'READY_FOR_DISPATCH' | 'DISPATCHED' | 'ACCEPTED_BY_PRINTER' | 'REJECTED_BY_PRINTER' | 'IN_PRODUCTION' | 'COMPLETED' | 'CANCELLED';
    created_by_user_id: string;
    assigned_printer_tenant_id?: string | null;
    created_at: string;
    updated_at: string;
}

export async function listProductionPackages(params: Record<string, any> = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
            qs.append(k, String(v));
        }
    });
    return adminFetch<{ ok: boolean, packages: ProductionPackage[] }>(`/api/admin/production/packages?${qs.toString()}`);
}

export async function getProductionPackageDetail(packageId: string) {
    return adminFetch<{ ok: boolean, package: ProductionPackage }>(`/api/admin/production/packages/${encodeURIComponent(packageId)}`);
}

export async function updateProductionPackageStatus(packageId: string, status: string) {
    return adminFetch<{ ok: boolean, package: ProductionPackage }>(`/api/admin/production/packages/${encodeURIComponent(packageId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
    });
}

export async function matchProductionPackageNodes(packageId: string) {
    return adminFetch<{ ok: boolean, matches?: any[], scores?: any }>(`/api/admin/production/packages/${encodeURIComponent(packageId)}/match`, {
        method: 'POST'
    });
}

export async function dispatchProductionPackage(packageId: string, payload: { nodeId: string, message?: string, expiresAt?: string }) {
    return adminFetch<{ ok: boolean, dispatch?: any }>(`/api/admin/production/packages/${encodeURIComponent(packageId)}/dispatch`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function listProductionNodes(params: Record<string, any> = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
            qs.append(k, String(v));
        }
    });
    return adminFetch<{ ok: boolean, nodes: any[] }>(`/api/admin/production/nodes?${qs.toString()}`);
}

// --- Industrial Preflight Console API (High-Fidelity Unmocked Integration) ---

export interface AdminPreflightJob {
    jobId: string;
    tenantId: string;
    printhouseId?: string;
    operatorId?: string;
    batchId?: string;
    status: string;
    policy?: string;
    type?: string;
    progress: number;
    fileSize: number;
    filename?: string;
    createdAt: string;
    updatedAt: string;
    canonicalData?: any;
}

export async function listAdminPreflightJobs(filters: Record<string, any> = {}) {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
            qs.append(k, String(v));
        }
    });
    const qStr = qs.toString();
    return adminFetch<{ ok: boolean, total: number, jobs: AdminPreflightJob[], source_status?: string }>(qStr ? `/api/admin/preflight/jobs?${qStr}` : `/api/admin/preflight/jobs`);
}

export async function createAdminPreflightJob(formData: FormData, customHeaders?: Record<string, string>) {
    const token = getAuthToken() || localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
    const res = await fetch('/api/admin/preflight/jobs', {
        method: 'POST',
        headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...customHeaders
        },
        body: formData
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: `Upstream HTTP Error ${res.status}: ${res.statusText || 'Gateway Disconnection'}` }));
        throw { status: res.status, ...errorData };
    }
    return res.json();
}

export async function getAdminPreflightJob(jobId: string) {
    return adminFetch<{ ok: boolean, jobId: string, status: string, source_status: string, canonicalPayload?: any, registryRecord?: any }>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}`);
}

export async function requestAdminPreflightFix(jobId: string, options: any = {}) {
    return adminFetch<{ ok: boolean, result?: any, source_status?: string }>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/fix`, {
        method: 'POST',
        body: JSON.stringify(options)
    });
}

export async function retryAdminPreflightJob(jobId: string) {
    return adminFetch<{ ok: boolean, result?: any, source_status?: string }>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: 'POST'
    });
}

export async function listAdminPreflightArtifacts(jobId: string) {
    return adminFetch<{ ok: boolean, artifacts: any[], source_status?: string }>(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/artifacts`);
}

export async function downloadAdminPreflightArtifact(jobId: string, artifactId: string) {
    const token = getAuthToken() || localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
    const res = await fetch(`/api/admin/preflight/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw { status: res.status, message: `Download failed: ${res.statusText}`, ...errorData };
    }
    return res.blob();
}

export async function listAdminPreflightPolicies() {
    return adminFetch<{ ok: boolean, policies: any[], source_status?: string }>('/api/admin/preflight/policies');
}

export async function listAdminPreflightBatches(filters: Record<string, any> = {}) {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    });
    const qStr = qs.toString();
    return adminFetch<{ ok: boolean, batches: any[], source_status?: string }>(qStr ? `/api/admin/preflight/batches?${qStr}` : `/api/admin/preflight/batches`);
}

export async function createAdminPreflightBatch(formData: FormData, customHeaders?: Record<string, string>) {
    const token = getAuthToken() || localStorage.getItem('ppos_control_token') || localStorage.getItem('admin_token') || '';
    const res = await fetch('/api/admin/preflight/batches', {
        method: 'POST',
        headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...customHeaders
        },
        body: formData
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: `Upstream HTTP Error ${res.status}: ${res.statusText || 'Gateway Disconnection'}` }));
        throw { status: res.status, ...errorData };
    }
    return res.json();
}

export async function getAdminPreflightAudit(filters: Record<string, any> = {}) {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    });
    const qStr = qs.toString();
    return adminFetch<{ ok: boolean, total: number, events: any[], source_status?: string }>(qStr ? `/api/admin/preflight/audit?${qStr}` : `/api/admin/preflight/audit`);
}

export async function getAdminPreflightGovernance(filters: Record<string, any> = {}) {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    });
    const qStr = qs.toString();
    return adminFetch<{ ok: boolean, total: number, governanceEvents: any[], source_status?: string }>(qStr ? `/api/admin/preflight/governance?${qStr}` : `/api/admin/preflight/governance`);
}


