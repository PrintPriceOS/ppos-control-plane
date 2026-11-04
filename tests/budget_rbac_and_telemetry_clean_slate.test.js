import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { registerCustomerHubBffRoutes } = require('../budget_customerHubBffRoutes');

describe('Task 4: Budget RBAC and Telemetry Clean Slate Test Suite', () => {
    let app;
    let server;
    let baseUrl;

    beforeAll(async () => {
        app = express();
        app.use(express.json());

        const resolveRequestIdentity = (req) => {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer valid-user-token')) {
                return {
                    sessionId: 'sess-user-clean-123',
                    user: {
                        id: 'usr_clean_101',
                        email: 'publisher@clean-slate-publishing.eu',
                        fullName: 'Editorial Director',
                        role: 'ORG_ADMIN',
                        b2bRole: 'ORG_ADMIN'
                    },
                    tenantId: 'tenant-clean-slate',
                    isAdmin: true
                };
            }
            return {
                sessionId: null,
                user: null,
                tenantId: null,
                isAdmin: false
            };
        };

        registerCustomerHubBffRoutes(app, {
            CONTROL_PLANE_BASE_URL: 'http://127.0.0.1:9999', // mock offline CP to exercise local BFF zero-mock clean slate
            CONTROL_PLANE_API_KEY: 'test-key',
            resolveRequestIdentity,
            buildSpineControlPlaneHeaders: () => ({}),
            controlPlaneAuthHeaders: () => ({})
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('1. GET /api/customer/organization/members returns a clean slate (0 mock members: no Elena Vance or Marcus Weber)', async () => {
        const res = await fetch(`${baseUrl}/api/customer/organization/members`, {
            headers: {
                Authorization: 'Bearer valid-user-token',
                'x-b2b-role': 'ORG_ADMIN'
            }
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(data.members).toEqual([]);
        expect(data.count).toBe(0);

        // Verify absence of mock users
        const emails = data.members.map((m) => m.email);
        expect(emails).not.toContain('publisher@printprice.pro');
        expect(emails).not.toContain('production@printprice.pro');
        expect(emails).not.toContain('finance@printprice.pro');
        expect(emails).not.toContain('designer@printprice.pro');
    });

    it('2. POST /api/customer/organization/members persists and returns the invited colleague', async () => {
        const invitePayload = {
            email: 'artdirector@clean-slate-publishing.eu',
            fullName: 'Camille Claudel',
            role: 'PREPRESS_DESIGNER'
        };

        const postRes = await fetch(`${baseUrl}/api/customer/organization/members`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer valid-user-token',
                'x-b2b-role': 'ORG_ADMIN',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(invitePayload)
        });

        expect(postRes.status).toBe(201);
        const postData = await postRes.json();
        expect(postData.ok).toBe(true);
        expect(postData.member.email).toBe('artdirector@clean-slate-publishing.eu');
        expect(postData.member.fullName).toBe('Camille Claudel');
        expect(postData.member.role).toBe('PREPRESS_DESIGNER');
        expect(postData.member.status).toBe('ACTIVE');

        // Subsequent GET reflects the persisted colleague
        const getRes = await fetch(`${baseUrl}/api/customer/organization/members`, {
            headers: {
                Authorization: 'Bearer valid-user-token',
                'x-b2b-role': 'ORG_ADMIN'
            }
        });
        const getData = await getRes.json();
        expect(getData.count).toBe(1);
        expect(getData.members[0].email).toBe('artdirector@clean-slate-publishing.eu');
    });

    it('3. DELETE /api/customer/organization/members/:memberId revokes the member access (SUSPENDED status)', async () => {
        // Invite a member
        const postRes = await fetch(`${baseUrl}/api/customer/organization/members`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer valid-user-token',
                'x-b2b-role': 'ORG_ADMIN',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'temp-consultant@clean-slate.eu',
                fullName: 'Consultant',
                role: 'FINANCE_APPROVER'
            })
        });
        const postData = await postRes.json();
        const memberId = postData.member.memberId;

        // Revoke
        const deleteRes = await fetch(`${baseUrl}/api/customer/organization/members/${memberId}`, {
            method: 'DELETE',
            headers: {
                Authorization: 'Bearer valid-user-token',
                'x-b2b-role': 'ORG_ADMIN'
            }
        });
        expect(deleteRes.status).toBe(200);
        const deleteData = await deleteRes.json();
        expect(deleteData.ok).toBe(true);
        expect(deleteData.member.status).toBe('SUSPENDED');
    });

    it('4. evaluates Escrow to €0.00, Storage to 0.00 MB, and Preflight to 0.0% for a clean unseeded tenant', async () => {
        const { getOperationalTelemetrySummary } = require('../src/api/services/telemetry/operationalTelemetryService');

        const summary = await getOperationalTelemetrySummary({
            tenantId: 'tenant-unseeded-test-999',
            customerEmail: 'clean.unseeded@editorial.eu'
        });

        expect(summary.ok).toBe(true);
        expect(summary.kpis.custodiedEscrowEur).toBe(0.00);
        expect(summary.kpis.releasedEscrowEur).toBe(0.00);
        expect(summary.kpis.platformFeeMorEur).toBe(0.00);
        expect(summary.kpis.activePlantOrdersCount).toBe(0);
        expect(summary.kpis.totalOrdersCount).toBe(0);
        expect(summary.kpis.diskUsageMb).toBe(0.00);
        expect(summary.kpis.totalBinaryAssetsCount).toBe(0);
        expect(summary.kpis.preflightSuccessRatePct).toBe(0.00);

        // Assert baseline demo orders are absent
        const allOids = (summary.funnel.stages || []).flatMap(s => s.sampleOrderIds || []);
        expect(allOids).not.toContain('PUB-ORD-2026-101');
        expect(allOids).not.toContain('PUB-ORD-2026-102');
    });
});
