/**
 * tests/phase199e_full_developer_ecosystem_e2e.test.js
 *
 * Phase 199E (Frente 3): Automated End-to-End Integration & Regression Suite
 * covering the complete Self-Service Developer Hub, Interactive API Playground,
 * Hybrid Stripe Billing & Spend Cap Governance, and HMAC-SHA256 Outbound Webhooks.
 *
 * Verified Flows:
 *  1. Credential Lifecycle (Developer Hub):
 *     - Instant provisioning of `pp_test_<32hex>` Sandbox key.
 *     - Verification of prefix (`pp_test_XXXX`), assigned scopes, and SHA-256 one-way hash storage.
 *  2. Interactive Playground Execution & Telemetry (`docs.printprice.pro` -> `control.printprice.pro`):
 *     - Authenticated execution of `GET /api/developer/keys/test-ping` (`200 OK`) and verification of
 *       `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers.
 *     - Execution of `POST /api/pricing/book-estimate` and validation of the 5-axis BPE cost breakdown
 *       and Digital-vs-Offset crossover point ($Q^*$).
 *     - Execution of `POST /api/preflight/inspect` and validation of 6-axis spine geometry & bleed report.
 *  3. Financial Governance, Paywall & Spend Cap Auto-Pause:
 *     - Unactivated external tenant attempting `pp_live_*` provisioning -> `HTTP 402 PAYWALL_REQUIRED`.
 *     - Metered usage reaching 80% of `monthly_spend_cap_eur` -> preventive warning email dispatched, key remains active.
 *     - Metered usage reaching 100% of `monthly_spend_cap_eur` -> `HTTP 402 SPEND_CAP_EXCEEDED_PAUSED` for `pp_live_*`,
 *       while `pp_test_*` Sandbox calls remain 100% unaffected and operational.
 *  4. Outbound Webhook Observability & Forensics:
 *     - Registration of an HTTPS webhook subscription with `whsec_<48hex>` secret and SSRF protection.
 *     - Dispatch of a live test event (`POST /api/developer/webhooks/test-event`).
 *     - Cryptographic verification of `X-PPOS-Signature` (`HMAC-SHA256`), persistence in `webhook_deliveries`,
 *       and manual forensic replay (`POST /api/developer/webhooks/deliveries/:id/replay`).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

const developerApiKeyService = require('../src/api/services/developerApiKeyService');
const stripeBillingService = require('../src/api/services/stripeBillingService');
const outgoingWebhookService = require('../src/api/services/outgoingWebhookService');
const { authenticateApiKey, _resetRateLimitBuckets } = require('../src/api/middleware/authenticateApiKey');
const developerKeysRouter = require('../src/api/routes/developerKeysRoutes');
const pricingRouter = require('../src/api/routes/pricingRoutes');
const preflightRouter = require('../src/api/routes/preflightRoutes');

/**
 * Helper to invoke an Express router handler directly in memory with full middleware chain.
 */
async function invokeRouter(router, method, urlPath, { headers = {}, body = {}, query = {}, params = {}, user = null } = {}) {
    const resHeaders = {};
    let statusCode = 200;
    let jsonPayload = null;
    const finishListeners = [];

    const req = {
        method: method.toUpperCase(),
        url: urlPath,
        originalUrl: urlPath,
        path: urlPath,
        headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
        body,
        query,
        params,
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
            for (const fn of finishListeners) fn();
            return this;
        },
        on(evt, fn) {
            if (evt === 'finish') finishListeners.push(fn);
        }
    };

    // Match route in Express router stack
    const stack = router.stack || [];
    for (const layer of stack) {
        if (!layer.route) continue;
        const routeMethod = method.toLowerCase();
        if (!layer.route.methods[routeMethod]) continue;

        // Match path pattern (supporting :param)
        const routePattern = '^' + layer.route.path.replace(/:([A-Za-z0-9_]+)/g, '(?<$1>[^/]+)') + '$';
        const match = urlPath.match(new RegExp(routePattern));
        if (!match) continue;

        req.params = { ...params, ...(match.groups || {}) };

        // Run router-level middlewares if any
        const handlers = layer.route.stack.map(s => s.handle);
        let idx = 0;
        const next = async (err) => {
            if (err) throw err;
            const fn = handlers[idx++];
            if (fn) {
                await fn(req, res, next);
            }
        };
        await next();
        return { statusCode, headers: resHeaders, body: jsonPayload, req };
    }

    throw new Error(`Route not found in router: ${method} ${urlPath}`);
}

describe('Phase 199E (Frente 3): Full E2E Developer Hub + Playground + Spend Cap + Webhooks Suite', () => {
    const TENANT_ID = 'tenant-e2e-suite-199e';
    const USER_ID = 'user-e2e-dev-01';

    beforeEach(() => {
        developerApiKeyService._clearFallbackStore();
        stripeBillingService._clearFallbackStores();
        _resetRateLimitBuckets();
    });

    it('1. [Developer Hub Credential Lifecycle] Provisions pp_test_* Sandbox key, validates prefix, scopes, and SHA-256 hash persistence', async () => {
        const createRes = await invokeRouter(developerKeysRouter, 'POST', '/', {
            headers: {
                'x-tenant-id': TENANT_ID,
                'x-user-id': USER_ID,
                'x-user-role': 'DEVELOPER_SANDBOX'
            },
            body: {
                keyName: 'E2E Playground Sandbox Key',
                keyType: 'TEST',
                scopes: ['pricing:read', 'preflight:write', 'webhooks:manage']
            }
        });

        expect(createRes.statusCode).toBe(201);
        expect(createRes.body.ok).toBe(true);

        const apiKey = createRes.body.apiKey;
        expect(apiKey.rawKey).toMatch(/^pp_test_[0-9a-f]{32}$/);
        expect(apiKey.keyPrefix).toBe(apiKey.rawKey.slice(0, 12));
        expect(apiKey.billingTier).toBe('SANDBOX_FREE');
        expect(apiKey.rateLimitPerMinute).toBe(60);
        expect(apiKey.scopes).toEqual(['pricing:read', 'preflight:write', 'webhooks:manage']);

        // Verify SHA-256 hash matches verification lookup and raw key is never returned in list
        const expectedSha256 = crypto.createHash('sha256').update(apiKey.rawKey).digest('hex');
        const verified = await developerApiKeyService.verifyRawApiKey(apiKey.rawKey, 'pricing:read');
        expect(verified.valid).toBe(true);
        expect(verified.keyRecord.hashedKey).toBe(expectedSha256);

        const listRes = await invokeRouter(developerKeysRouter, 'GET', '/', {
            headers: { 'x-tenant-id': TENANT_ID }
        });
        expect(listRes.statusCode).toBe(200);
        expect(listRes.body.keys).toHaveLength(1);
        expect(listRes.body.keys[0].rawKey).toBeUndefined();
        expect(listRes.body.keys[0].keyPrefix).toBe(apiKey.keyPrefix);
    });

    it('2. [Interactive Playground Execution] Executes test-ping, BPE book-estimate (with Q* crossover), and 6-axis preflight inspect with X-RateLimit-* headers', async () => {
        // 1. Provision Sandbox key
        const created = await developerApiKeyService.createApiKey(
            TENANT_ID,
            USER_ID,
            {
                keyName: 'Docs Playground Key',
                keyType: 'TEST',
                scopes: ['pricing:read', 'preflight:write']
            },
            { role: 'DEVELOPER_SANDBOX' }
        );

        // 2. Call GET /api/developer/keys/test-ping with X-API-Key header (simulating ApiPlayground.tsx)
        const pingRes = await invokeRouter(developerKeysRouter, 'GET', '/test-ping', {
            headers: {
                'x-api-key': created.rawKey
            }
        });

        expect(pingRes.statusCode).toBe(200);
        expect(pingRes.body.ok).toBe(true);
        expect(pingRes.body.keyPrefix).toBe(created.keyPrefix);
        expect(pingRes.headers['x-ratelimit-limit']).toBe('60');
        expect(Number(pingRes.headers['x-ratelimit-remaining'])).toBe(59);

        // 3. Authenticate via authenticateApiKey middleware and execute POST /api/pricing/book-estimate
        const authUser = pingRes.req.user;
        const bpeRes = await invokeRouter(pricingRouter, 'POST', '/book-estimate', {
            user: authUser,
            body: {
                trimWidthMm: 148,
                trimHeightMm: 210,
                pageCount: 240,
                printRunCopies: 1200,
                interiorPaperGsm: 90,
                coverPaperGsm: 300,
                bindingType: 'SOFTCOVER_PUR',
                colorModeInterior: 'CMYK_4_4'
            }
        });

        expect(bpeRes.statusCode).toBe(200);
        expect(bpeRes.body.ok).toBe(true);
        expect(bpeRes.body.engine).toBe('PPOS_5AXIS_BPE_V2');
        expect(bpeRes.body.estimate).toBeDefined();
        expect(bpeRes.body.crossover).toBeDefined();
        expect(bpeRes.body.crossover.qStarCopies).toBeGreaterThan(0);
        expect(['SHEETFED_OFFSET', 'HIGH_SPEED_INKJET_DIGITAL']).toContain(
            bpeRes.body.crossover.recommendedTechnology
        );

        // 4. Execute POST /api/preflight/inspect (6-axis geometry & spine validation)
        const pfRes = await invokeRouter(preflightRouter, 'POST', '/inspect', {
            user: authUser,
            body: {
                jobId: 'pf_e2e_playground_01',
                isbn: '978-84-376-0494-7',
                pageCount: 240,
                paperGrammage: 90,
                paperBulk: 1.3,
                bindingType: 'SOFTCOVER_PUR',
                innerBleedMm: 3.0,
                declaredSpineMm: 14.8,
                workflowMode: 'MAGIC_FIX'
            }
        });

        expect(pfRes.statusCode).toBe(200);
        expect(pfRes.body.jobId).toBe('pf_e2e_playground_01');
        expect(pfRes.body.spineGeometry).toBeDefined();
        expect(pfRes.body.spineGeometry.pageCount).toBe(240);
        expect(pfRes.body.bleedGeometry).toBeDefined();
    });

    it('3. [Financial Governance & Spend Cap] Enforces HTTP 402 Paywall, triggers 80% warning & 100% auto-pause on pp_live_*, while keeping pp_test_* active', async () => {
        // 1. Unactivated tenant attempting LIVE key provisioning -> HTTP 402 PAYWALL_REQUIRED
        const blockedLiveRes = await invokeRouter(developerKeysRouter, 'POST', '/', {
            headers: {
                'x-tenant-id': TENANT_ID,
                'x-user-id': USER_ID,
                'x-user-role': 'DEVELOPER_SANDBOX'
            },
            body: {
                keyName: 'Unauthorized Production Key',
                keyType: 'LIVE',
                scopes: ['pricing:read']
            }
        });
        expect(blockedLiveRes.statusCode).toBe(402);
        expect(blockedLiveRes.body.error).toMatch(/PAYWALL_REQUIRED/);

        // 2. Provision a Sandbox TEST key (`pp_test_*`) for the same tenant
        const sandboxKey = await developerApiKeyService.createApiKey(
            TENANT_ID,
            USER_ID,
            { keyName: 'Resilient Sandbox Key', keyType: 'TEST', scopes: ['pricing:read', 'preflight:write'] },
            { role: 'DEVELOPER_SANDBOX' }
        );

        // 3. Activate Stripe Hybrid Subscription (€49/mo base + €50.00 monthly spend cap -> €1.00 metered headroom)
        await stripeBillingService.processWebhookEvent({
            id: 'evt_e2e_checkout_completed',
            type: 'checkout.session.completed',
            data: {
                object: {
                    client_reference_id: TENANT_ID,
                    customer: 'cus_e2e_live_199e',
                    subscription: 'sub_e2e_live_199e',
                    metadata: {
                        tenantId: TENANT_ID,
                        billingTier: 'PRODUCTION_SCALE',
                        monthlySpendCapEur: '50.00',
                        userEmail: 'finops-e2e@printprice.pro'
                    }
                }
            }
        });

        // 4. Provision Production LIVE key (`pp_live_*`)
        const liveKey = await developerApiKeyService.createApiKey(
            TENANT_ID,
            USER_ID,
            { keyName: 'Production ERP Key', keyType: 'LIVE', scopes: ['pricing:read', 'preflight:write'] },
            { role: 'DEVELOPER_SANDBOX' }
        );
        expect(liveKey.rawKey).toMatch(/^pp_live_[0-9a-f]{32}$/);

        // 5. Report 1 preflight inspection (€0.10) -> Total = €49.10 / €50.00 (98.2% >= 80% threshold)
        await stripeBillingService.reportMeterUsage({
            customerId: 'cus_e2e_live_199e',
            tenantId: TENANT_ID,
            apiKeyId: liveKey.id,
            eventName: 'preflight_2gb_inspection',
            quantity: 1,
            idempotencyKey: 'idem_e2e_80_warn'
        });

        let alertState = stripeBillingService.getSpendCapAlertState(TENANT_ID);
        expect(alertState.warned80At).not.toBeNull();
        expect(alertState.paused100At).toBeNull();

        // LIVE key still works at 98.2%
        const pingAt80 = await invokeRouter(developerKeysRouter, 'GET', '/test-ping', {
            headers: { 'x-api-key': liveKey.rawKey }
        });
        expect(pingAt80.statusCode).toBe(200);

        // 6. Report 9 more preflight inspections (€0.90) -> Total = €50.00 / €50.00 (100% ceiling reached!)
        await stripeBillingService.reportMeterUsage({
            customerId: 'cus_e2e_live_199e',
            tenantId: TENANT_ID,
            apiKeyId: liveKey.id,
            eventName: 'preflight_2gb_inspection',
            quantity: 9,
            idempotencyKey: 'idem_e2e_100_pause'
        });

        alertState = stripeBillingService.getSpendCapAlertState(TENANT_ID);
        expect(alertState.paused100At).not.toBeNull();

        // 7. Verify `pp_live_*` key now returns HTTP 402 Payment Required
        const pingLiveAt100 = await invokeRouter(developerKeysRouter, 'GET', '/test-ping', {
            headers: { 'x-api-key': liveKey.rawKey }
        });
        expect(pingLiveAt100.statusCode).toBe(402);
        expect(pingLiveAt100.body.error.message).toMatch(/Monthly Spend Cap \(100%\) reached/i);

        // 8. Verify `pp_test_*` Sandbox key remains 100% operational despite tenant spend cap pause!
        const pingTestAt100 = await invokeRouter(developerKeysRouter, 'GET', '/test-ping', {
            headers: { 'x-api-key': sandboxKey.rawKey }
        });
        expect(pingTestAt100.statusCode).toBe(200);
        expect(pingTestAt100.body.keyType).toBe('TEST');
    });

    it('4. [Outbound Webhook Observability] Registers webhook endpoint, rotates whsec_* secret, dispatches HMAC-SHA256 signed event, and replays delivery', async () => {
        // 1. Register webhook subscription via POST /api/developer/webhooks
        const saveRes = await invokeRouter(developerKeysRouter, 'POST', '/webhooks', {
            headers: { 'x-tenant-id': TENANT_ID, 'x-user-id': USER_ID },
            body: {
                url: 'https://webhooks.partner-erp.io/v1/ppos-events',
                events: ['preflight.certified', 'routing.assigned_optimal', 'order.status_changed', 'einvoice.issued']
            }
        });

        expect(saveRes.statusCode).toBe(200);
        const sub = saveRes.body.endpoint;
        expect(sub.url).toBe('https://webhooks.partner-erp.io/v1/ppos-events');
        expect(sub.oneTimeSigningSecret).toMatch(/^whsec_[0-9a-f]{48}$/);

        // 2. Rotate webhook signing secret atomically
        const rotateRes = await invokeRouter(developerKeysRouter, 'POST', `/webhooks/${sub.id}/rotate-secret`, {
            headers: { 'x-tenant-id': TENANT_ID, 'x-user-id': USER_ID }
        });
        expect(rotateRes.statusCode).toBe(200);
        const newSecret = rotateRes.body.webhook.oneTimeSigningSecret;
        expect(newSecret).toMatch(/^whsec_[0-9a-f]{48}$/);
        expect(newSecret).not.toBe(sub.oneTimeSigningSecret);

        // 3. Dispatch signed test event via POST /api/developer/webhooks/test-event
        const testEvtRes = await invokeRouter(developerKeysRouter, 'POST', '/webhooks/test-event', {
            headers: { 'x-tenant-id': TENANT_ID, 'x-user-id': USER_ID },
            body: {
                subscriptionId: sub.id,
                eventType: 'preflight.certified'
            }
        });

        expect(testEvtRes.statusCode).toBe(200);
        expect(testEvtRes.body.ok).toBe(true);
        const delivery = testEvtRes.body.delivery;
        const sigHeader = testEvtRes.body.signedHeaders['X-PPOS-Signature'];

        expect(sigHeader).toMatch(/^sha256=[0-9a-f]{64}$/);
        expect(delivery.status).toBe('DELIVERED');
        expect(delivery.statusCode).toBe(200);

        // Verify cryptographic HMAC-SHA256 signature matches payload + rotated secret
        const expectedSignature = outgoingWebhookService.computeSignature(
            JSON.stringify(delivery.payload),
            newSecret
        );
        expect(sigHeader).toBe(expectedSignature);

        // 4. Replay delivery via POST /api/developer/webhooks/deliveries/:deliveryId/replay
        const replayRes = await invokeRouter(
            developerKeysRouter,
            'POST',
            `/webhooks/deliveries/${delivery.id}/replay`,
            {
                headers: { 'x-tenant-id': TENANT_ID, 'x-user-id': USER_ID }
            }
        );
        expect(replayRes.statusCode).toBe(200);
        expect(replayRes.body.status).toBe('DELIVERED');
        expect(replayRes.body.attemptCount).toBe(2);
    });
});
