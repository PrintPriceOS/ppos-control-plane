/**
 * src/ui/api/tenantPilotClient.ts
 * 
 * API client for managing Tenant Pilot and Commercial Readiness in the UI.
 */

import { adminFetch } from '../lib/adminApi';
import { TenantPilot } from '../types/tenantPilot';

const BASE_URL = '/api/admin/tenant-pilots';

export async function listTenantPilots(): Promise<{ ok: boolean; pilots: TenantPilot[] }> {
    return adminFetch<{ ok: boolean; pilots: TenantPilot[] }>(BASE_URL);
}

export async function getTenantPilotReadiness(tenantId: string, printhouseId: string): Promise<{ ok: boolean; readiness: TenantPilot }> {
    return adminFetch<{ ok: boolean; readiness: TenantPilot }>(`${BASE_URL}/${tenantId}/${printhouseId}`);
}

export async function enablePilotAccess(tenantId: string, printhouseId: string): Promise<{ ok: boolean; pilot: TenantPilot }> {
    return adminFetch<{ ok: boolean; pilot: TenantPilot }>(`${BASE_URL}/${tenantId}/${printhouseId}/enable-pilot`, {
        method: 'POST'
    });
}

export async function disablePilotAccess(tenantId: string, printhouseId: string, reason?: string): Promise<{ ok: boolean; pilot: TenantPilot }> {
    return adminFetch<{ ok: boolean; pilot: TenantPilot }>(`${BASE_URL}/${tenantId}/${printhouseId}/disable-pilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    });
}

export async function enablePartnerAccess(tenantId: string, printhouseId: string): Promise<{ ok: boolean; pilot: TenantPilot }> {
    return adminFetch<{ ok: boolean; pilot: TenantPilot }>(`${BASE_URL}/${tenantId}/${printhouseId}/enable-partner`, {
        method: 'POST'
    });
}

export async function disablePartnerAccess(tenantId: string, printhouseId: string, reason?: string): Promise<{ ok: boolean; pilot: TenantPilot }> {
    return adminFetch<{ ok: boolean; pilot: TenantPilot }>(`${BASE_URL}/${tenantId}/${printhouseId}/disable-partner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    });
}

export async function requestLiveProductionEnablement(tenantId: string, printhouseId: string): Promise<{ ok: boolean; pilot: TenantPilot }> {
    return adminFetch<{ ok: boolean; pilot: TenantPilot }>(`${BASE_URL}/${tenantId}/${printhouseId}/request-live`, {
        method: 'POST'
    });
}

export async function blockLiveProductionEnablement(tenantId: string, printhouseId: string, reason?: string): Promise<{ ok: boolean; pilot: TenantPilot }> {
    return adminFetch<{ ok: boolean; pilot: TenantPilot }>(`${BASE_URL}/${tenantId}/${printhouseId}/block-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    });
}
