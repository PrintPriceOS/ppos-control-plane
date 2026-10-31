import { adminFetch } from '../lib/adminApi';

export const LiveProductionClient = {
    async getEnablement(tenantId: string, printhouseId: string) {
        return adminFetch<any>(`/api/admin/live-production/enablement/${tenantId}/${printhouseId}`);
    },
    async getReadiness(tenantId: string, printhouseId: string) {
        return adminFetch<any>(`/api/admin/live-production/readiness/${tenantId}/${printhouseId}`);
    },
    async getTimeline(tenantId: string, printhouseId: string) {
        return adminFetch<any>(`/api/admin/live-production/timeline/${tenantId}/${printhouseId}`);
    },
    async requestEnablement(tenantId: string, printhouseId: string, liveScope: string, justification: string) {
        return adminFetch<any>(`/api/admin/live-production/request`, {
            method: 'POST',
            body: JSON.stringify({ tenantId, printhouseId, liveScope, justification })
        });
    },
    async moveToReview(tenantId: string, printhouseId: string) {
        return adminFetch<any>(`/api/admin/live-production/review`, {
            method: 'POST',
            body: JSON.stringify({ tenantId, printhouseId })
        });
    },
    async approve(tenantId: string, printhouseId: string, approvalNotes: string, approvalPayload: any) {
        return adminFetch<any>(`/api/admin/live-production/approve`, {
            method: 'POST',
            body: JSON.stringify({ tenantId, printhouseId, approvalNotes, approvalPayload })
        });
    },
    async reject(tenantId: string, printhouseId: string, reason: string) {
        return adminFetch<any>(`/api/admin/live-production/reject`, {
            method: 'POST',
            body: JSON.stringify({ tenantId, printhouseId, reason })
        });
    },
    async activate(tenantId: string, printhouseId: string) {
        return adminFetch<any>(`/api/admin/live-production/activate`, {
            method: 'POST',
            body: JSON.stringify({ tenantId, printhouseId })
        });
    },
    async pause(tenantId: string, printhouseId: string, reason: string) {
        return adminFetch<any>(`/api/admin/live-production/pause`, {
            method: 'POST',
            body: JSON.stringify({ tenantId, printhouseId, reason })
        });
    },
    async resume(tenantId: string, printhouseId: string) {
        return adminFetch<any>(`/api/admin/live-production/resume`, {
            method: 'POST',
            body: JSON.stringify({ tenantId, printhouseId })
        });
    },
    async revoke(tenantId: string, printhouseId: string, reason: string, impactScope: string) {
        return adminFetch<any>(`/api/admin/live-production/revoke`, {
            method: 'POST',
            body: JSON.stringify({ tenantId, printhouseId, reason, impactScope })
        });
    }
};
