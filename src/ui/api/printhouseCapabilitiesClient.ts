/**
 * src/ui/api/printhouseCapabilitiesClient.ts
 * 
 * API client for managing Printhouse capabilities in the UI.
 */

import { adminFetch } from '../lib/adminApi';
import { 
    Printhouse, Machine, Media, PolicyProfile, 
    SlaProfile, ReadinessEvaluation, CapabilityAuditLog 
} from '../types/printhouseCapabilities';

const BASE_URL = '/api/admin/printhouse-capabilities';

export async function listPrinthouses(filters?: { tenantId?: string; status?: string }): Promise<{ ok: boolean; printhouses: Printhouse[] }> {
    const qs = new URLSearchParams();
    if (filters?.tenantId) qs.set('tenantId', filters.tenantId);
    if (filters?.status) qs.set('status', filters.status);
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return adminFetch<{ ok: boolean; printhouses: Printhouse[] }>(`${BASE_URL}${queryStr}`);
}

export async function createPrinthouse(payload: Partial<Printhouse>): Promise<{ ok: boolean; printhouse: Printhouse }> {
    return adminFetch<{ ok: boolean; printhouse: Printhouse }>(BASE_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function getPrinthouse(printhouseId: string): Promise<{ ok: boolean; printhouse: Printhouse }> {
    return adminFetch<{ ok: boolean; printhouse: Printhouse }>(`${BASE_URL}/${printhouseId}`);
}

export async function updatePrinthouse(printhouseId: string, payload: Partial<Printhouse>): Promise<{ ok: boolean; printhouse: Printhouse }> {
    return adminFetch<{ ok: boolean; printhouse: Printhouse }>(`${BASE_URL}/${printhouseId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
}

export async function listMachines(printhouseId: string): Promise<{ ok: boolean; machines: Machine[] }> {
    return adminFetch<{ ok: boolean; machines: Machine[] }>(`${BASE_URL}/${printhouseId}/machines`);
}

export async function createMachine(printhouseId: string, payload: Partial<Machine>): Promise<{ ok: boolean; machine: Machine }> {
    return adminFetch<{ ok: boolean; machine: Machine }>(`${BASE_URL}/${printhouseId}/machines`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function updateMachine(printhouseId: string, machineId: string, payload: Partial<Machine>): Promise<{ ok: boolean; machine: Machine }> {
    return adminFetch<{ ok: boolean; machine: Machine }>(`${BASE_URL}/${printhouseId}/machines/${machineId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
}

export async function listMedia(printhouseId: string): Promise<{ ok: boolean; media: Media[] }> {
    return adminFetch<{ ok: boolean; media: Media[] }>(`${BASE_URL}/${printhouseId}/media`);
}

export async function createMedia(printhouseId: string, payload: Partial<Media>): Promise<{ ok: boolean; media: Media }> {
    return adminFetch<{ ok: boolean; media: Media }>(`${BASE_URL}/${printhouseId}/media`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function updateMedia(printhouseId: string, mediaId: string, payload: Partial<Media>): Promise<{ ok: boolean; media: Media }> {
    return adminFetch<{ ok: boolean; media: Media }>(`${BASE_URL}/${printhouseId}/media/${mediaId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
}

export async function listPolicyProfiles(printhouseId: string): Promise<{ ok: boolean; profiles: PolicyProfile[] }> {
    return adminFetch<{ ok: boolean; profiles: PolicyProfile[] }>(`${BASE_URL}/${printhouseId}/policy-profiles`);
}

export async function createPolicyProfile(printhouseId: string, payload: Partial<PolicyProfile>): Promise<{ ok: boolean; profile: PolicyProfile }> {
    return adminFetch<{ ok: boolean; profile: PolicyProfile }>(`${BASE_URL}/${printhouseId}/policy-profiles`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function updatePolicyProfile(printhouseId: string, profileId: string, payload: Partial<PolicyProfile>): Promise<{ ok: boolean; profile: PolicyProfile }> {
    return adminFetch<{ ok: boolean; profile: PolicyProfile }>(`${BASE_URL}/${printhouseId}/policy-profiles/${profileId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
}

export async function listSlaProfiles(printhouseId: string): Promise<{ ok: boolean; profiles: SlaProfile[] }> {
    return adminFetch<{ ok: boolean; profiles: SlaProfile[] }>(`${BASE_URL}/${printhouseId}/sla-profiles`);
}

export async function createSlaProfile(printhouseId: string, payload: Partial<SlaProfile>): Promise<{ ok: boolean; profile: SlaProfile }> {
    return adminFetch<{ ok: boolean; profile: SlaProfile }>(`${BASE_URL}/${printhouseId}/sla-profiles`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function updateSlaProfile(printhouseId: string, slaProfileId: string, payload: Partial<SlaProfile>): Promise<{ ok: boolean; profile: SlaProfile }> {
    return adminFetch<{ ok: boolean; profile: SlaProfile }>(`${BASE_URL}/${printhouseId}/sla-profiles/${slaProfileId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
}

export async function getReadiness(printhouseId: string): Promise<{ ok: boolean; readiness: ReadinessEvaluation }> {
    return adminFetch<{ ok: boolean; readiness: ReadinessEvaluation }>(`${BASE_URL}/${printhouseId}/readiness`);
}

export async function listCapabilityAudit(printhouseId: string): Promise<{ ok: boolean; audit: CapabilityAuditLog[] }> {
    return adminFetch<{ ok: boolean; audit: CapabilityAuditLog[] }>(`${BASE_URL}/${printhouseId}/audit`);
}

export async function getMachineTemplates(query: string): Promise<{ ok: boolean; templates: any[] }> {
    return adminFetch<{ ok: boolean; templates: any[] }>(`/api/admin/machine-templates?q=${encodeURIComponent(query)}`);
}
