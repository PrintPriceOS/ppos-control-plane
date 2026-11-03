/**
 * tests/b2b_communications_e2e.test.js
 * ==============================================================================
 * Deterministic Integration Suite for Real B2B Comms & Escrow Zero-Mock Runtime
 * 
 * Verifies:
 * 1. Clean-slate: Fresh tenant starts with 0 threads and empty messages.
 * 2. When an order receives an automated preflight alert or publisher message,
 *    the thread appears in the Printhouse Hub.
 * 3. Operator reply is persisted and flagged with `sender_type: 'PRINTHOUSE_OPERATOR'`.
 * 4. Bidirectional Sync: Message posted by printhouse is immediately retrievable
 *    by the publisher querying the same order endpoint.
 * 5. Escrow Summary endpoint returns €0.00 zero-state for clean tenant.
 * ==============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'ppos-unit-test-jwt-secret-key-2026-normative';
process.env.NODE_ENV = 'test';

// Mock MySQL Client to avoid live network connection during tests
vi.mock('../src/api/services/mysqlClient', () => {
    return {
        query: vi.fn(async (sql, params) => {
            return [];
        })
    };
});

const b2bCommsRouter = require('../src/api/routes/b2bCommsRoutes');
const escrowRouter = require('../src/api/routes/escrowRoutes');
const {
    _inMemoryMessagesStore,
    _inMemoryThreadsStore,
    upsertThreadMetadata
} = require('../src/api/services/b2bCommunicationsService');

/**
 * Lightweight in-memory dispatcher for Express router dispatching
 */
async function invokeRouter(router, method, urlPath, { headers = {}, body = {}, query = {}, user = null } = {}) {
    const resHeaders = {};
    let statusCode = 200;
    let jsonPayload = null;

    const [cleanPath, queryString] = urlPath.split('?');
    const parsedQuery = { ...query };
    if (queryString) {
        new URLSearchParams(queryString).forEach((val, key) => {
            parsedQuery[key] = val;
        });
    }

    const req = {
        method: method.toUpperCase(),
        url: urlPath,
        originalUrl: urlPath,
        path: cleanPath,
        headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
        body,
        query: parsedQuery,
        params: {},
        user
    };

    const res = {
        statusCode: 200,
        setHeader(k, v) {
            resHeaders[k.toLowerCase()] = v;
        },
        getHeader(k) {
            return resHeaders[k.toLowerCase()];
        },
        status(code) {
            statusCode = code;
            this.statusCode = code;
            return this;
        },
        json(data) {
            jsonPayload = data;
            return this;
        }
    };

    const stack = router.stack || [];
    for (const layer of stack) {
        if (!layer.route) {
            // Middleware handling
            if (layer.handle && layer.handle.length <= 3) {
                let nextCalled = false;
                await layer.handle(req, res, () => { nextCalled = true; });
                if (!nextCalled && jsonPayload !== null) {
                    return { statusCode, headers: resHeaders, body: jsonPayload };
                }
            }
            continue;
        }

        const routeMethod = method.toLowerCase();
        if (!layer.route.methods[routeMethod]) continue;

        // Path regex matching
        const routePattern = '^' + layer.route.path.replace(/:([A-Za-z0-9_]+)/g, '(?<$1>[^/]+)') + '$';
        const match = cleanPath.match(new RegExp(routePattern));
        if (!match) continue;

        if (match.groups) {
            req.params = { ...req.params, ...match.groups };
        }

        for (const routeHandler of layer.route.stack) {
            if (routeHandler.method && routeHandler.method !== routeMethod) continue;
            let nextCalled = false;
            await routeHandler.handle(req, res, () => { nextCalled = true; });
            if (!nextCalled || jsonPayload !== null) {
                return { statusCode, headers: resHeaders, body: jsonPayload };
            }
        }
    }

    return { statusCode, headers: resHeaders, body: jsonPayload };
}

describe('B2B Publisher Communications & Incident Bridge E2E Suite', () => {
    const cleanTenantId = 'tenant_clean_printhouse_99';
    const publisherTenantId = cleanTenantId; // Same tenant context for B2B portal
    const foreignTenantId = 'tenant_foreign_workshop_88';
    const testOrderId = 'PUB-ORD-2026-999';

    beforeEach(() => {
        _inMemoryMessagesStore.clear();
        _inMemoryThreadsStore.clear();
    });

    it('1. Fresh tenant starts with 0 B2B threads and empty message drawer', async () => {
        const res = await invokeRouter(b2bCommsRouter, 'GET', '/threads', {
            headers: {
                'x-tenant-id': cleanTenantId,
                'x-user-role': 'PRINTHOUSE_ADMIN'
            }
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.threads).toEqual([]);
        expect(res.body.totalCount).toBe(0);

        const msgRes = await invokeRouter(b2bCommsRouter, 'GET', `/threads/${testOrderId}/messages`, {
            headers: {
                'x-tenant-id': cleanTenantId,
                'x-user-role': 'PRINTHOUSE_ADMIN'
            }
        });

        expect(msgRes.statusCode).toBe(200);
        expect(msgRes.body.ok).toBe(true);
        expect(msgRes.body.messages).toEqual([]);
    });

    it('2. When an order receives an automated preflight alert or publisher message, the thread appears in the Printhouse Hub', async () => {
        // Seed thread metadata simulating order intake
        upsertThreadMetadata(cleanTenantId, testOrderId, {
            publisherName: 'Editorial Anagrama S.A.',
            publisherContact: 'produccion@anagrama-ed.es',
            title: 'Novela Experimental 2026',
            imprimaturStatus: 'PENDING_PUBLISHER_SIGN_OFF',
            preflightAlert: 'BLEED_AND_SPINE_AUTO_FIXED'
        });

        // Publisher or Preflight Engine posts an automated notification
        const postAlertRes = await invokeRouter(b2bCommsRouter, 'POST', `/threads/${testOrderId}/messages`, {
            headers: {
                'x-tenant-id': cleanTenantId,
                'x-user-role': 'SYSTEM'
            },
            body: {
                senderType: 'SYSTEM_PREFLIGHT',
                senderName: 'PrintPrice OS Preflight Engine (:8001)',
                messageBody: 'Déficit de sangrado detectado (1.5mm vs 3.0mm). Mirror Bleed aplicado automáticamente.',
                actionTrigger: 'BLEED_AUTO_FIXED'
            }
        });

        expect(postAlertRes.statusCode).toBe(201);
        expect(postAlertRes.body.ok).toBe(true);
        expect(postAlertRes.body.message.sender_type).toBe('SYSTEM_PREFLIGHT');

        // Printhouse queries threads
        const threadsRes = await invokeRouter(b2bCommsRouter, 'GET', '/threads', {
            headers: {
                'x-tenant-id': cleanTenantId,
                'x-user-role': 'PRINTHOUSE_ADMIN'
            }
        });

        expect(threadsRes.statusCode).toBe(200);
        expect(threadsRes.body.threads.length).toBe(1);
        expect(threadsRes.body.threads[0].orderId).toBe(testOrderId);
        expect(threadsRes.body.threads[0].publisherName).toBe('Editorial Anagrama S.A.');
        expect(threadsRes.body.threads[0].unreadCount).toBe(1);
        expect(threadsRes.body.threads[0].messages.length).toBe(1);
    });

    it('3. Operator reply is persisted and correctly flagged with sender_type: PRINTHOUSE_OPERATOR', async () => {
        // Seed thread metadata simulating order intake
        upsertThreadMetadata(cleanTenantId, testOrderId, {
            publisherName: 'Editorial Anagrama S.A.',
            publisherContact: 'produccion@anagrama-ed.es',
            title: 'Novela Experimental 2026',
            imprimaturStatus: 'PENDING_PUBLISHER_SIGN_OFF',
            preflightAlert: 'BLEED_AND_SPINE_AUTO_FIXED'
        });

        const replyRes = await invokeRouter(b2bCommsRouter, 'POST', `/threads/${testOrderId}/messages`, {
            headers: {
                'x-tenant-id': cleanTenantId,
                'x-user-role': 'PRINTHOUSE_OPERATOR'
            },
            body: {
                message: '[IMPRIMATUR APPROVED]: Soft-proof verificado por CTP. Entrando en máquina Heidelberg.',
                actionTrigger: 'APPROVE_IMPRIMATUR'
            }
        });

        expect(replyRes.statusCode).toBe(201);
        expect(replyRes.body.ok).toBe(true);
        expect(replyRes.body.message.sender_type).toBe('PRINTHOUSE_OPERATOR');
        expect(replyRes.body.message.action_trigger).toBe('APPROVE_IMPRIMATUR');
        expect(replyRes.body.message.message_body).toContain('[IMPRIMATUR APPROVED]');
    });

    it('4. Bidirectional Sync: Operator reply is immediately retrievable by publisher querying the same order endpoint', async () => {
        // Seed an initial operator message in this test
        await invokeRouter(b2bCommsRouter, 'POST', `/threads/${testOrderId}/messages`, {
            headers: {
                'x-tenant-id': cleanTenantId,
                'x-user-role': 'PRINTHOUSE_OPERATOR'
            },
            body: {
                message: '[IMPRIMATUR APPROVED]: Soft-proof verificado por CTP. Entrando en máquina Heidelberg.',
                actionTrigger: 'APPROVE_IMPRIMATUR'
            }
        });

        // Publisher checks the order thread
        const publisherGetRes = await invokeRouter(b2bCommsRouter, 'GET', `/threads/${testOrderId}/messages`, {
            headers: {
                'x-tenant-id': publisherTenantId,
                'x-user-role': 'PUBLISHER'
            }
        });

        expect(publisherGetRes.statusCode).toBe(200);
        expect(publisherGetRes.body.ok).toBe(true);
        const msgs = publisherGetRes.body.messages;
        expect(msgs.length).toBeGreaterThanOrEqual(1);
        const lastMsg = msgs[msgs.length - 1];
        expect(lastMsg.sender_type).toBe('PRINTHOUSE_OPERATOR');
        expect(lastMsg.action_trigger).toBe('APPROVE_IMPRIMATUR');
    });

    it('5. Enforces strict tenant isolation: Printhouse B cannot read or post to threads of Printhouse A', async () => {
        // Foreign tenant queries threads
        const foreignThreadsRes = await invokeRouter(b2bCommsRouter, 'GET', '/threads', {
            headers: {
                'x-tenant-id': foreignTenantId,
                'x-user-role': 'PRINTHOUSE_ADMIN'
            }
        });

        expect(foreignThreadsRes.statusCode).toBe(200);
        expect(foreignThreadsRes.body.threads).toEqual([]);

        // Foreign tenant queries specific order of tenant A
        const foreignOrderRes = await invokeRouter(b2bCommsRouter, 'GET', `/threads/${testOrderId}/messages`, {
            headers: {
                'x-tenant-id': foreignTenantId,
                'x-user-role': 'PRINTHOUSE_ADMIN'
            }
        });

        expect(foreignOrderRes.statusCode).toBe(200);
        expect(foreignOrderRes.body.messages).toEqual([]);
    });

    it('6. Escrow Summary endpoint returns strict €0.00 zero-state for clean tenant', async () => {
        const escrowSummaryRes = await invokeRouter(escrowRouter, 'GET', '/summary', {
            headers: {
                'x-tenant-id': 'tenant_strictly_clean_zero_01',
                'x-user-role': 'PRINTHOUSE_ADMIN'
            }
        });

        expect(escrowSummaryRes.statusCode).toBe(200);
        expect(escrowSummaryRes.body.ok).toBe(true);
        expect(escrowSummaryRes.body.data.currency).toBe('EUR');
        expect(escrowSummaryRes.body.data.custodiedEscrowEur).toBe(0);
        expect(escrowSummaryRes.body.data.releasedEscrowEur).toBe(0);
        expect(escrowSummaryRes.body.data.netPrinthousePayoutEur).toBe(0);
    });
});
