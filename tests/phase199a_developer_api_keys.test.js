import { describe, it, expect, beforeEach } from 'vitest';
import developerApiKeyService, { DeveloperApiKeyService } from '../src/api/services/developerApiKeyService.js';
import { authenticateApiKey, _resetRateLimitBuckets } from '../src/api/middleware/authenticateApiKey.js';

describe('Phase 199A: Self-Service Developer Hub & Metered API Gateway', () => {
    beforeEach(() => {
        developerApiKeyService._clearFallbackStore();
        _resetRateLimitBuckets();
    });

    it('generates valid Sandbox TEST keys (pp_test_<32hex>) with SHA-256 one-way hash', async () => {
        const res = await developerApiKeyService.createApiKey(
            'tenant-dev-01',
            'user-dev-01',
            {
                keyName: 'WooCommerce Sandbox Plugin',
                keyType: 'TEST',
                scopes: ['pricing:read', 'preflight:write']
            },
            { role: 'VIEWER' }
        );

        expect(res.rawKey).toMatch(/^pp_test_[0-9a-f]{32}$/);
        expect(res.keyType).toBe('TEST');
        expect(res.keyPrefix).toMatch(/^pp_test_[0-9a-f]{4}$/);
        expect(res.rateLimitPerMinute).toBe(60);
        expect(res.monthlyQuota).toBe(1000);
        expect(res.billingTier).toBe('SANDBOX_FREE');
        expect(res.scopes).toEqual(['pricing:read', 'preflight:write']);

        // List keys should mask raw secret
        const list = await developerApiKeyService.listApiKeys('tenant-dev-01');
        expect(list.length).toBe(1);
        expect(list[0].rawKey).toBeUndefined();
        expect(list[0].maskedKey).toContain(res.keyPrefix);
    });

    it('enforces Paywall (HTTP 402) when non-partner external user attempts LIVE key without billing upgrade', async () => {
        await expect(
            developerApiKeyService.createApiKey(
                'tenant-external-free',
                'user-ext-1',
                {
                    keyName: 'Production ERP',
                    keyType: 'LIVE',
                    scopes: ['pricing:read', 'orders:create']
                },
                { role: 'DEVELOPER_SANDBOX' }
            )
        ).rejects.toThrow(/PAYWALL_REQUIRED/);

        // Upgrade billing tier via Stripe Customer ID
        const upgraded = await developerApiKeyService.upgradeBillingTier(
            'tenant-external-free',
            'PRODUCTION_SCALE',
            'cus_stripe_99a8b7c6'
        );
        expect(upgraded.billingTier).toBe('PRODUCTION_SCALE');
        expect(upgraded.rateLimitPerMinute).toBe(600);

        // Create sandbox key first so tenant record has PRODUCTION_SCALE in fallback store, or force upgrade
        const liveKey = await developerApiKeyService.createApiKey(
            'tenant-external-free',
            'user-ext-1',
            {
                keyName: 'Production ERP Live',
                keyType: 'LIVE',
                scopes: ['pricing:read', 'orders:create'],
                forceLiveUpgrade: true,
                stripeCustomerId: 'cus_stripe_99a8b7c6'
            },
            { role: 'DEVELOPER_SANDBOX' }
        );

        expect(liveKey.rawKey).toMatch(/^pp_live_[0-9a-f]{32}$/);
        expect(liveKey.keyType).toBe('LIVE');
        expect(liveKey.rateLimitPerMinute).toBe(600);
    });

    it('unlocks LIVE keys immediately for verified Printhouse / Publisher tenants', async () => {
        const liveKey = await developerApiKeyService.createApiKey(
            'tenant-printhouse-erfurt',
            'user-ph-admin',
            {
                keyName: 'Tharstern MIS Connector',
                keyType: 'LIVE',
                scopes: ['pricing:read', 'preflight:write', 'orders:create', 'webhooks:manage']
            },
            { role: 'PRINTHOUSE_ADMIN' }
        );

        expect(liveKey.rawKey).toMatch(/^pp_live_[0-9a-f]{32}$/);
        expect(liveKey.billingTier).toBe('ENTERPRISE_TENANT');
        expect(liveKey.rateLimitPerMinute).toBe(1200);
        expect(liveKey.monthlyQuota).toBe(1000000);
    });

    it('authenticates incoming requests, enforces scopes, and blocks revoked keys in authenticateApiKey middleware', async () => {
        const created = await developerApiKeyService.createApiKey(
            'tenant-auth-test',
            'user-auth-1',
            {
                keyName: 'Scoped Key',
                keyType: 'TEST',
                scopes: ['pricing:read']
            },
            { role: 'PRINTHOUSE_ADMIN' }
        );

        const mwPricing = authenticateApiKey('pricing:read');
        const reqValid = {
            headers: { authorization: `Bearer ${created.rawKey}` }
        };
        let statusSet = 200;
        let jsonBody = null;
        const resValid = {
            setHeader: () => {},
            status(code) { statusSet = code; return this; },
            json(payload) { jsonBody = payload; return this; }
        };
        let nextCalled = false;
        await mwPricing(reqValid, resValid, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(reqValid.user.tenantId).toBe('tenant-auth-test');
        expect(reqValid.user.authMode).toBe('API_KEY');

        // Fail when requesting unauthorized scope 'orders:create'
        const mwOrders = authenticateApiKey('orders:create');
        let statusForbidden = 200;
        const resForbidden = {
            setHeader: () => {},
            status(code) { statusForbidden = code; return this; },
            json(payload) { jsonBody = payload; return this; }
        };
        await mwOrders(reqValid, resForbidden, () => {});
        expect(statusForbidden).toBe(403);
        expect(jsonBody.error.message).toMatch(/orders:create/);

        // Revoke key and verify immediate rejection
        await developerApiKeyService.revokeApiKey('tenant-auth-test', created.id);
        let statusRevoked = 200;
        const resRevoked = {
            setHeader: () => {},
            status(code) { statusRevoked = code; return this; },
            json(payload) { jsonBody = payload; return this; }
        };
        await mwPricing(reqValid, resRevoked, () => {});
        expect(statusRevoked).toBe(403);
        expect(jsonBody.error.message).toMatch(/REVOKED/);
    });

    it('Phase 199D: provisions developer webhooks with whsec_* secret, blocks SSRF, rotates secret, dispatches HMAC-SHA256 signed events, and replays deliveries with tenant isolation', async () => {
        // 1. SSRF rejection for loopback/private IPs
        await expect(
            developerApiKeyService.saveWebhookEndpoint('tenant-wh-01', {
                endpointUrl: 'http://127.0.0.1:8080/internal-hook',
                events: ['preflight.certified']
            })
        ).rejects.toThrow(/SSRF_BLOCKED_HOST|SSRF/i);

        await expect(
            developerApiKeyService.saveWebhookEndpoint('tenant-wh-01', {
                endpointUrl: 'http://169.254.169.254/latest/meta-data',
                events: ['preflight.certified']
            })
        ).rejects.toThrow(/SSRF_BLOCKED_HOST|SSRF/i);

        // 2. Save valid HTTPS webhook endpoint and receive one-time whsec_* secret
        const createdSub = await developerApiKeyService.saveWebhookEndpoint(
            'tenant-wh-01',
            {
                url: 'https://hooks.erp-publisher.com/v1/printprice',
                description: 'Production ERP Bridge',
                events: ['preflight.certified', 'order.status_changed', 'einvoice.issued']
            },
            { id: 'user-wh-01', email: 'devops@erp-publisher.com' }
        );

        expect(createdSub.url).toBe('https://hooks.erp-publisher.com/v1/printprice');
        expect(createdSub.oneTimeSigningSecret).toMatch(/^whsec_[0-9a-f]{48}$/);
        expect(createdSub.secretPrefix).toContain(createdSub.oneTimeSigningSecret.slice(0, 12));
        expect(createdSub.events).toContain('preflight.certified');

        // 3. Rotate signing secret atomically
        const rotated = await developerApiKeyService.rotateWebhookEndpointSecret(
            'tenant-wh-01',
            createdSub.id,
            { id: 'user-wh-01' }
        );
        expect(rotated.oneTimeSigningSecret).toMatch(/^whsec_[0-9a-f]{48}$/);
        expect(rotated.oneTimeSigningSecret).not.toBe(createdSub.oneTimeSigningSecret);

        // 4. Dispatch HMAC-SHA256 signed test event
        const dispatchRes = await developerApiKeyService.dispatchTestWebhookEvent(
            'tenant-wh-01',
            {
                eventType: 'preflight.certified',
                targetUrl: 'https://hooks.erp-publisher.com/v1/printprice'
            },
            { id: 'user-wh-01' }
        );

        expect(dispatchRes.delivery.eventType).toBe('preflight.certified');
        expect(dispatchRes.signedHeaders['X-PPOS-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
        expect(dispatchRes.delivery.status).toBe('DELIVERED');
        expect(dispatchRes.delivery.statusCode).toBe(200);

        // 5. List deliveries and replay with tenant isolation
        const deliveries = await developerApiKeyService.listWebhookDeliveriesForTenant('tenant-wh-01');
        expect(deliveries.length).toBeGreaterThanOrEqual(1);
        expect(deliveries[0].id).toBe(dispatchRes.delivery.id);

        // Cross-tenant replay should fail with 403
        await expect(
            developerApiKeyService.replayWebhookDeliveryForTenant('tenant-other-99', dispatchRes.delivery.id)
        ).rejects.toThrow(/FORBIDDEN|cannot replay/i);

        // Valid tenant replay succeeds
        const replayed = await developerApiKeyService.replayWebhookDeliveryForTenant(
            'tenant-wh-01',
            dispatchRes.delivery.id,
            { id: 'user-wh-01' }
        );
        expect(replayed.status).toBe('DELIVERED');
        expect(replayed.attemptCount).toBeGreaterThanOrEqual(2);
    });
});
