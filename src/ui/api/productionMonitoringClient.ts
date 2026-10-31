/**
 * src/ui/api/productionMonitoringClient.ts
 * 
 * Frontend API client wrapper for Live Production Monitoring and Incident Tracking.
 */

import { adminFetch } from '../lib/adminApi';
import {
    ProductionMonitoringSnapshot,
    ProductionTimelineEvent,
    ProductionIncident,
    MachineLoadSnapshot,
    SlaDashboardSummary
} from '../types/productionMonitoring';

export async function getQueueOverview(tenantId?: string, printhouseId?: string): Promise<{
    ok: boolean;
    queue_depth: Record<string, number>;
    bottlenecks: any[];
    machines: MachineLoadSnapshot[];
    overview_timestamp: string;
}> {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenantId', tenantId);
    if (printhouseId) params.append('printhouseId', printhouseId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return adminFetch<any>(`/api/admin/production-monitoring/overview${queryStr}`);
}

export async function getProductionTimeline(orderId: string, jobId: string): Promise<{ ok: boolean; events: ProductionTimelineEvent[] }> {
    return adminFetch<{ ok: boolean; events: ProductionTimelineEvent[] }>(`/api/admin/production-monitoring/timeline/${orderId}/${jobId}`);
}

export async function getIncidents(filters: { tenantId?: string; printhouseId?: string; status?: string; severity?: string } = {}): Promise<{ ok: boolean; incidents: ProductionIncident[] }> {
    const params = new URLSearchParams();
    if (filters.tenantId) params.append('tenantId', filters.tenantId);
    if (filters.printhouseId) params.append('printhouseId', filters.printhouseId);
    if (filters.status) params.append('status', filters.status);
    if (filters.severity) params.append('severity', filters.severity);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return adminFetch<{ ok: boolean; incidents: ProductionIncident[] }>(`/api/admin/production-monitoring/incidents${queryStr}`);
}

export async function createIncident(payload: {
    tenantId: string;
    printhouseId: string;
    orderId: string;
    jobId?: string;
    incidentType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description: string;
    metadata?: any;
}): Promise<{ ok: boolean; incident: ProductionIncident }> {
    return adminFetch<{ ok: boolean; incident: ProductionIncident }>('/api/admin/production-monitoring/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function acknowledgeIncident(incidentId: number): Promise<{ ok: boolean; incident: ProductionIncident }> {
    return adminFetch<{ ok: boolean; incident: ProductionIncident }>(`/api/admin/production-monitoring/incidents/${incidentId}/acknowledge`, {
        method: 'POST'
    });
}

export async function resolveIncident(incidentId: number, resolutionNotes: string): Promise<{ ok: boolean; incident: ProductionIncident }> {
    return adminFetch<{ ok: boolean; incident: ProductionIncident }>(`/api/admin/production-monitoring/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNotes })
    });
}

export async function dismissIncident(incidentId: number, reason: string): Promise<{ ok: boolean; incident: ProductionIncident }> {
    return adminFetch<{ ok: boolean; incident: ProductionIncident }>(`/api/admin/production-monitoring/incidents/${incidentId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    });
}

export async function getMachineLoads(tenantId?: string, printhouseId?: string): Promise<{ ok: boolean; machines: MachineLoadSnapshot[] }> {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenantId', tenantId);
    if (printhouseId) params.append('printhouseId', printhouseId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return adminFetch<{ ok: boolean; machines: MachineLoadSnapshot[] }>(`/api/admin/production-monitoring/machines${queryStr}`);
}

export async function getSlaSummary(tenantId?: string, printhouseId?: string): Promise<{ ok: boolean; summary: SlaDashboardSummary }> {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenantId', tenantId);
    if (printhouseId) params.append('printhouseId', printhouseId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return adminFetch<{ ok: boolean; summary: SlaDashboardSummary }>(`/api/admin/production-monitoring/sla-summary${queryStr}`);
}
