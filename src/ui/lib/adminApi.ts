import { getAuthToken, clearAuthToken, setAuthToken, getUserTenantId, getUserPrinthouseId } from './authStore';

export async function adminFetch<T>(path: string, options?: RequestInit & { tenantId?: string, deploymentId?: string }): Promise<T> {
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

    const res = await fetch(path, {
        ...options,
        headers,
        credentials: "include", 
    });

    if (res.status === 401) {
        clearAuthToken();
        // Force redirect to login on 401
        if (typeof window !== 'undefined') {
            window.location.href = '/login';
        }
        throw new Error('Unauthorized: Valid Bearer token required');
    }

    if (!res.ok) {
        let errorData;
        try {
            errorData = await res.json();
        } catch (e) {
            errorData = { message: res.statusText };
        }
        
        // Fail-loud: preserve structured backend error if possible
        const errorMessage = errorData.error?.message || errorData.message || res.statusText;
        throw new Error(`Admin API error ${res.status}: ${errorMessage}`);
    }
    
    return res.json() as Promise<T>;
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
    return adminFetch<JobsResponse>(`/api/admin/jobs?${qs.toString()}`);
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

export async function getAdminQueueStats() {
    return adminFetch<{ ok: boolean, stats: any }>(`/api/admin/control/queue/stats`);
}
export async function getQueue() {
    return adminFetch<any>(`/api/admin/queue`);
}

export async function getPrinters(filters: string = "") {
    return adminFetch<any[]>(`/api/admin/network/printers${filters ? '?' + filters : ''}`);
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

// --- Economic Routing ---
export async function getEconomicRoutingHistory() {
    return adminFetch<any[]>(`/api/admin/routing/economic/history`);
}

export async function getEconomicRoutingConflicts() {
    return adminFetch<any[]>(`/api/admin/routing/economic/conflicts`);
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
        const jobs = res.jobs || res.data || (Array.isArray(res) ? res : []);
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

// --- Production Notifications ---

export async function getNotifications(limit = 20) {
  const res = await adminFetch<any>(`/api/admin/production/notifications?limit=${limit}`);
  return res.notifications || [];
}

export async function markNotificationRead(id: string) {
  return adminFetch<any>(`/api/admin/production/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead() {
  return adminFetch<any>(`/api/admin/production/notifications/read-all`, { method: 'POST' });
}

// --- Production Financials ---

export async function getProductionFinancials(packageId?: string) {
  const url = packageId ? `/api/admin/production/financials/${packageId}` : '/api/admin/production/financials';
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

export async function getEconomicOverview() {
    return adminFetch<{ metrics: any, avg_final_score: number }>(`/api/admin/routing/economic/overview`);
}

export async function getEconomicConflicts() {
    return adminFetch<any[]>(`/api/admin/routing/economic/conflicts`);
}
