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
});
