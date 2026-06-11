export const LiveProductionClient = {
    async getEnablement(tenantId: string, printhouseId: string) {
        const res = await fetch(`/api/admin/live-production/enablement/${tenantId}/${printhouseId}`);
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async getReadiness(tenantId: string, printhouseId: string) {
        const res = await fetch(`/api/admin/live-production/readiness/${tenantId}/${printhouseId}`);
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async getTimeline(tenantId: string, printhouseId: string) {
        const res = await fetch(`/api/admin/live-production/timeline/${tenantId}/${printhouseId}`);
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async requestEnablement(tenantId: string, printhouseId: string, liveScope: string, justification: string) {
        const res = await fetch(`/api/admin/live-production/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, printhouseId, liveScope, justification })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async moveToReview(tenantId: string, printhouseId: string) {
        const res = await fetch(`/api/admin/live-production/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, printhouseId })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async approve(tenantId: string, printhouseId: string, approvalNotes: string, approvalPayload: any) {
        const res = await fetch(`/api/admin/live-production/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, printhouseId, approvalNotes, approvalPayload })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async reject(tenantId: string, printhouseId: string, reason: string) {
        const res = await fetch(`/api/admin/live-production/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, printhouseId, reason })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async activate(tenantId: string, printhouseId: string) {
        const res = await fetch(`/api/admin/live-production/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, printhouseId })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async pause(tenantId: string, printhouseId: string, reason: string) {
        const res = await fetch(`/api/admin/live-production/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, printhouseId, reason })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async resume(tenantId: string, printhouseId: string) {
        const res = await fetch(`/api/admin/live-production/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, printhouseId })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async revoke(tenantId: string, printhouseId: string, reason: string, impactScope: string) {
        const res = await fetch(`/api/admin/live-production/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, printhouseId, reason, impactScope })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    }
};
