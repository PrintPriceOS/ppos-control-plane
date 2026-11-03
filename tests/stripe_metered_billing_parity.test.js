/**
 * tests/stripe_metered_billing_parity.test.js
 *
 * Phase 199B: Automated Verification Suite for Stripe Hybrid Flat-Rate (€49/mo)
 * + Dual Metered Usage (`preflight_2gb_inspection` @ €0.10 & `bpe_pricing_quote` @ €0.005)
 * across `stripeBillingService`, `developerApiKeyService`, `authenticateApiKey`, and `stripeBillingRoutes`.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const stripeBillingService = require('../src/api/services/stripeBillingService');
const developerApiKeyService = require('../src/api/services/developerApiKeyService');
const { authenticateApiKey, _resetRateLimitBuckets } = require('../src/api/middleware/authenticateApiKey');

describe('Phase 199B — Stripe Hybrid Flat-Rate (€49/mo) + Metered Billing Parity', () => {
    const TEST_WEBHOOK_SECRET = 'whsec_phase199b_enterprise_signing_secret';

    beforeEach(() => {
        process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
        developerApiKeyService._clearFallbackStore();
        stripeBillingService._clearFallbackStores();
        _resetRateLimitBuckets();
    });

    it('1. Generates a Hybrid Stripe Checkout Session with €49/mo Base Commit + Dual Metered Line Items (preflight_2gb_inspection & bpe_pricing_quote)', async () => {
        const session = await stripeBillingService.createCheckoutSession({
            tenantId: 'tenant-saas-integrator-01',
            userId: 'user-founder-01',
            userEmail: 'founder@saasprint.io',
            returnUrl: 'https://control.printprice.pro/developers',
            monthlySpendCapEur: 300.00
        });

        expect(session).toBeDefined();
        expect(session.sessionId).toMatch(/^cs_live_/);
        expect(session.mode).toBe('subscription');
        expect(session.clientReferenceId).toBe('tenant-saas-integrator-01');
        expect(session.url).toContain('session_id=');
        expect(session.url).toContain('status=success');

        // Verify 3 line items: 1 flat-rate licensed + 2 metered
        expect(session.lineItems).toHaveLength(3);

        const baseItem = session.lineItems[0];
        expect(baseItem.unit_amount).toBe(4900); // €49.00
        expect(baseItem.currency).toBe('eur');
        expect(baseItem.recurring.usage_type).toBe('licensed');

        const preflightMeterItem = session.lineItems[1];
        expect(preflightMeterItem.recurring.usage_type).toBe('metered');
        expect(preflightMeterItem.recurring.meter).toBe('preflight_2gb_inspection');
        expect(preflightMeterItem.unit_amount_decimal).toBe('10'); // €0.10

        const bpeQuoteMeterItem = session.lineItems[2];
        expect(bpeQuoteMeterItem.recurring.usage_type).toBe('metered');
        expect(bpeQuoteMeterItem.recurring.meter).toBe('bpe_pricing_quote');
        expect(bpeQuoteMeterItem.unit_amount_decimal).toBe('0.5'); // €0.005
    });

    it('2. Cryptographically verifies valid Stripe-Signature headers over raw Buffer and rejects forged or tampered webhook payloads', () => {
        const payloadObj = {
            id: 'evt_live_signature_test_01',
            type: 'checkout.session.completed',
            data: {
                object: {
                    id: 'cs_live_123',
                    client_reference_id: 'tenant-sig-test',
                    customer: 'cus_live_sig_01',
                    subscription: 'sub_live_sig_01'
                }
            }
        };
        const rawBuffer = Buffer.from(JSON.stringify(payloadObj), 'utf8');
        const validSigHeader = stripeBillingService.signWebhookPayload(rawBuffer, TEST_WEBHOOK_SECRET);

        // Valid signature over raw Buffer succeeds
        const verifiedEvent = stripeBillingService.constructWebhookEvent(rawBuffer, validSigHeader, TEST_WEBHOOK_SECRET);
        expect(verifiedEvent.id).toBe('evt_live_signature_test_01');
        expect(verifiedEvent.type).toBe('checkout.session.completed');

        // Forged signature with wrong secret must throw INVALID_SIGNATURE
        const forgedSigHeader = stripeBillingService.signWebhookPayload(rawBuffer, 'whsec_attacker_wrong_secret');
        expect(() => {
            stripeBillingService.constructWebhookEvent(rawBuffer, forgedSigHeader, TEST_WEBHOOK_SECRET);
        }).toThrow(/INVALID_SIGNATURE/);

        // Tampered body with original signature must throw INVALID_SIGNATURE
        const tamperedBuffer = Buffer.from(JSON.stringify({ ...payloadObj, id: 'evt_tampered' }), 'utf8');
        expect(() => {
            stripeBillingService.constructWebhookEvent(tamperedBuffer, validSigHeader, TEST_WEBHOOK_SECRET);
        }).toThrow(/INVALID_SIGNATURE/);
    });

    it('3. Automatically promotes tenant from SANDBOX_FREE to PRODUCTION_SCALE upon checkout.session.completed and unlocks pp_live_* provisioning', async () => {
        const tenantId = 'tenant-promo-b2b';

        // Initially on SANDBOX_FREE: creating a LIVE key must fail with 402 Paywall
        await expect(
            developerApiKeyService.createApiKey(
                tenantId,
                'user-b2b',
                { keyName: 'Blocked Live Key', keyType: 'LIVE' },
                { id: 'user-b2b', role: 'DEVELOPER_SANDBOX' }
            )
        ).rejects.toThrow(/PAYWALL_REQUIRED/);

        // Create a Sandbox key first to verify it also gets upgraded
        const sandboxKey = await developerApiKeyService.createApiKey(
            tenantId,
            'user-b2b',
            { keyName: 'Initial Sandbox Key', keyType: 'TEST' },
            { id: 'user-b2b', role: 'DEVELOPER_SANDBOX' }
        );
        expect(sandboxKey.billingTier).toBe('SANDBOX_FREE');

        // Dispatch signed checkout.session.completed webhook
        const webhookPayload = {
            id: 'evt_checkout_completed_promo_01',
            type: 'checkout.session.completed',
            data: {
                object: {
                    id: 'cs_live_promo_01',
                    client_reference_id: tenantId,
                    customer: 'cus_stripe_promoted_99',
                    subscription: 'sub_stripe_promoted_99',
                    metadata: {
                        tenantId,
                        billingTier: 'PRODUCTION_SCALE',
                        monthlySpendCapEur: '250.00',
                        userEmail: 'cto@b2bplatform.de'
                    }
                }
            }
        };
        const rawBody = Buffer.from(JSON.stringify(webhookPayload), 'utf8');
        const sig = stripeBillingService.signWebhookPayload(rawBody, TEST_WEBHOOK_SECRET);
        const verified = stripeBillingService.constructWebhookEvent(rawBody, sig, TEST_WEBHOOK_SECRET);
        const result = await stripeBillingService.processWebhookEvent(verified);

        expect(result.ok).toBe(true);
        expect(result.billingTier).toBe('PRODUCTION_SCALE');
        expect(result.stripeCustomerId).toBe('cus_stripe_promoted_99');

        // Now tenant can provision a Production LIVE key (`pp_live_*`) without 402 error
        const liveKey = await developerApiKeyService.createApiKey(
            tenantId,
            'user-b2b',
            {
                keyName: 'Production Live ERP Key',
                keyType: 'LIVE',
                scopes: ['pricing:read', 'preflight:write', 'orders:create']
            },
            { id: 'user-b2b', role: 'DEVELOPER_SANDBOX' }
        );

        expect(liveKey.rawKey).toMatch(/^pp_live_[0-9a-f]{32}$/);
        expect(liveKey.billingTier).toBe('PRODUCTION_SCALE');
        expect(liveKey.rateLimitPerMinute).toBe(600);
        expect(liveKey.monthlyQuota).toBe(100000);

        // Customer Portal session works for the promoted tenant
        const portal = await stripeBillingService.createCustomerPortalSession({
            tenantId,
            returnUrl: 'https://control.printprice.pro/developers'
        });
        expect(portal.ok).toBe(true);
        expect(portal.customerId).toBe('cus_stripe_promoted_99');
        expect(portal.url).toContain('cus_stripe_promoted_99');
    });

    it('4. Streams real-time Metered Usage events (preflight_2gb_inspection @ €0.10 & bpe_pricing_quote @ €0.005) when a pp_live_* key consumes Preflight and Pricing endpoints', async () => {
        const tenantId = 'tenant-metered-usage-04';

        // Activate PRODUCTION_SCALE via webhook
        await stripeBillingService.processWebhookEvent({
            id: 'evt_activate_meter_04',
            type: 'checkout.session.completed',
            data: {
                object: {
                    client_reference_id: tenantId,
                    customer: 'cus_meter_live_04',
                    subscription: 'sub_meter_live_04',
                    metadata: { tenantId, billingTier: 'PRODUCTION_SCALE' }
                }
            }
        });

        const liveKey = await developerApiKeyService.createApiKey(
            tenantId,
            'user-meter-04',
            {
                keyName: 'Metered Live Key',
                keyType: 'LIVE',
                scopes: ['pricing:read', 'preflight:write']
            },
            { id: 'user-meter-04', role: 'DEVELOPER_SANDBOX' }
        );

        // Simulate 1 Preflight 2GB inspection call (€0.10) + 2 BPE Pricing Quote calls (2 * €0.005 = €0.01)
        const listeners = {};
        const mockResPreflight = {
            statusCode: 200,
            setHeader: () => {},
            on: (evt, cb) => { listeners[evt] = cb; }
        };
        const mockReqPreflight = {
            originalUrl: '/api/preflight/inspect',
            method: 'POST',
            headers: {
                authorization: `Bearer ${liveKey.rawKey}`,
                'idempotency-key': 'idem_preflight_call_1'
            }
        };

        await authenticateApiKey('preflight:write')(mockReqPreflight, mockResPreflight, () => {});
        if (listeners.finish) listeners.finish();

        // Wait briefly for async logApiCall hook
        await new Promise(r => setTimeout(r, 30));

        await developerApiKeyService.logApiCall({
            keyId: liveKey.id,
            tenantId,
            endpoint: '/api/pricing/book-estimate',
            method: 'POST',
            statusCode: 200,
            durationMs: 12,
            idempotencyKey: 'idem_bpe_quote_1'
        });

        await developerApiKeyService.logApiCall({
            keyId: liveKey.id,
            tenantId,
            endpoint: '/api/pricing/book-estimate',
            method: 'POST',
            statusCode: 200,
            durationMs: 15,
            idempotencyKey: 'idem_bpe_quote_2'
        });

        const meterEvents = await stripeBillingService.getMeterEventsForTenant(tenantId);
        expect(meterEvents.length).toBe(3);

        const preflightEvents = meterEvents.filter(e => e.eventName === 'preflight_2gb_inspection');
        const pricingEvents = meterEvents.filter(e => e.eventName === 'bpe_pricing_quote');

        expect(preflightEvents.length).toBe(1);
        expect(preflightEvents[0].unitPriceEur).toBe(0.10);
        expect(preflightEvents[0].stripeCustomerId).toBe('cus_meter_live_04');

        expect(pricingEvents.length).toBe(2);
        expect(pricingEvents[0].unitPriceEur).toBe(0.005);

        const telemetry = await developerApiKeyService.getUsageTelemetry(tenantId);
        // Total accrued metered usage = €0.10 + €0.005 + €0.005 = €0.11
        expect(telemetry.accruedMeteredEur).toBeCloseTo(0.11, 3);
        expect(telemetry.activeTier).toBe('PRODUCTION_SCALE');
    });

    it('5. Automatically suspends pp_live_* keys and downgrades tenant to SANDBOX_FREE upon customer.subscription.deleted or invoice.payment_failed', async () => {
        const tenantId = 'tenant-cancel-sub-05';

        // 1. Activate Production Scale
        await stripeBillingService.processWebhookEvent({
            id: 'evt_sub_start_05',
            type: 'checkout.session.completed',
            data: {
                object: {
                    client_reference_id: tenantId,
                    customer: 'cus_cancel_05',
                    subscription: 'sub_cancel_05',
                    metadata: { tenantId, billingTier: 'PRODUCTION_SCALE' }
                }
            }
        });

        // 2. Provision both a LIVE key and a TEST key
        const liveKey = await developerApiKeyService.createApiKey(
            tenantId,
            'user-05',
            { keyName: 'Live Production Key', keyType: 'LIVE' }
        );
        const testKey = await developerApiKeyService.createApiKey(
            tenantId,
            'user-05',
            { keyName: 'Sandbox Key', keyType: 'TEST' }
        );

        // Verify LIVE key works initially
        const verifyBefore = await developerApiKeyService.verifyRawApiKey(liveKey.rawKey);
        expect(verifyBefore.valid).toBe(true);

        // 3. Fire customer.subscription.deleted webhook
        const cancelResult = await stripeBillingService.processWebhookEvent({
            id: 'evt_sub_deleted_05',
            type: 'customer.subscription.deleted',
            data: {
                object: {
                    id: 'sub_cancel_05',
                    customer: 'cus_cancel_05',
                    metadata: { tenantId }
                }
            }
        });

        expect(cancelResult.ok).toBe(true);
        expect(cancelResult.billingTier).toBe('SANDBOX_FREE');
        expect(cancelResult.status).toBe('CANCELED');

        // 4. Verify LIVE key is now SUSPENDED (HTTP 403) while TEST key remains ACTIVE
        const verifyLiveAfter = await developerApiKeyService.verifyRawApiKey(liveKey.rawKey);
        expect(verifyLiveAfter.valid).toBe(false);
        expect(verifyLiveAfter.statusCode).toBe(403);
        expect(verifyLiveAfter.error).toContain('SUSPENDED');

        const verifyTestAfter = await developerApiKeyService.verifyRawApiKey(testKey.rawKey);
        expect(verifyTestAfter.valid).toBe(true);
    });
});

