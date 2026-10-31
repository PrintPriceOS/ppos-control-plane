/**
 * scripts/smoke_phase191g_shipping_integrations.js
 * 
 * Phase 191G: Service-Level Smoke Tests for Shipping & Integration Readiness.
 * Validates shipping regions, delivery methods, delivery estimate computation,
 * integration profiles, API credentials, SSRF guardrail, and readiness extension.
 * Supports both online MySQL and offline mock fallback execution modes.
 */
const assert = require('assert');
const db = require('../src/api/services/mysqlClient');

// In-memory mock DB fallback if MySQL is unconfigured
const memoryTables = {
    tenants: new Map(),
    printhouse_shipping_regions: new Map(),
    printhouse_delivery_methods: new Map(),
    printhouse_integration_profiles: new Map(),
    printhouse_integration_credentials: new Map(),
    printhouse_webhook_profiles: new Map(),
    printhouse_shipping_integration_audits: new Map()
};

const originalQuery = db.query;
db.query = async function mockOrRealQuery(sql, params = []) {
    try {
        return await originalQuery.call(db, sql, params);
    } catch (err) {
        if (err.code !== 'DB_UNCONFIGURED' && !err.message.includes('UNCONFIGURED')) {
            throw err;
        }

        const sqlTrim = sql.trim().toUpperCase();

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_SHIPPING_REGIONS')) {
            const row = {
                id: params[0], tenant_id: params[1], site_id: params[2], name: params[3],
                code: params[4], enabled: params[5], countries_json: params[6],
                postal_rules_json: params[7], standard_transit_days: params[8],
                expedited_transit_days: params[9], pickup_available: params[10],
                handling_days: params[11], status: 'ACTIVE', created_at: new Date(), updated_at: new Date()
            };
            memoryTables.printhouse_shipping_regions.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('SELECT * FROM PRINTHOUSE_SHIPPING_REGIONS')) {
            const rows = Array.from(memoryTables.printhouse_shipping_regions.values());
            if (sqlTrim.includes('WHERE ID = ?')) {
                return rows.filter(r => r.id === params[0] && r.tenant_id === params[1]);
            }
            return rows.filter(r => r.tenant_id === params[0]);
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_DELIVERY_METHODS')) {
            const row = {
                id: params[0], tenant_id: params[1], site_id: params[2], shipping_region_id: params[3],
                code: params[4], name: params[5], carrier_name: params[6], service_level: params[7],
                transit_days_min: params[8], transit_days_max: params[9], cost_rule_id: params[10],
                enabled: params[11], created_at: new Date()
            };
            memoryTables.printhouse_delivery_methods.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('SELECT * FROM PRINTHOUSE_DELIVERY_METHODS')) {
            const rows = Array.from(memoryTables.printhouse_delivery_methods.values());
            return rows.filter(r => r.tenant_id === params[0]);
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_INTEGRATION_PROFILES')) {
            const row = {
                id: params[0], tenant_id: params[1], site_id: params[2], integration_type: params[3],
                name: params[4], status: 'DRAFT', endpoint_url: params[5], settings_json: params[6],
                created_at: new Date(), updated_at: new Date()
            };
            memoryTables.printhouse_integration_profiles.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('SELECT * FROM PRINTHOUSE_INTEGRATION_PROFILES')) {
            const rows = Array.from(memoryTables.printhouse_integration_profiles.values());
            if (sqlTrim.includes('WHERE ID = ?')) {
                return rows.filter(r => r.id === params[0] && r.tenant_id === params[1]);
            }
            return rows.filter(r => r.tenant_id === params[0]);
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_INTEGRATION_CREDENTIALS')) {
            const row = {
                id: params[0], integration_profile_id: params[1], tenant_id: params[2], key_id: params[3],
                key_hash: params[4], secret_ciphertext: params[5], secret_prefix: params[6],
                scopes_json: params[7], status: 'ACTIVE', created_at: new Date()
            };
            memoryTables.printhouse_integration_credentials.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('SELECT ID, INTEGRATION_PROFILE_ID')) {
            const rows = Array.from(memoryTables.printhouse_integration_credentials.values());
            return rows.filter(r => r.tenant_id === params[0] && r.integration_profile_id === params[1]);
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_WEBHOOK_PROFILES')) {
            const row = {
                id: params[0], integration_profile_id: params[1], tenant_id: params[2], target_url: params[3],
                event_subscriptions_json: params[4], signing_secret_ciphertext: params[5], enabled: params[6],
                created_at: new Date()
            };
            memoryTables.printhouse_webhook_profiles.set(row.id, row);
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('SELECT * FROM PRINTHOUSE_WEBHOOK_PROFILES')) {
            const rows = Array.from(memoryTables.printhouse_webhook_profiles.values());
            return rows.filter(r => r.integration_profile_id === params[0] && r.tenant_id === params[1]);
        }

        if (sqlTrim.startsWith('UPDATE PRINTHOUSE_WEBHOOK_PROFILES')) {
            const row = memoryTables.printhouse_webhook_profiles.get(params[2]);
            if (row) {
                row.last_delivery_at = params[0];
                row.last_success_at = params[1];
            }
            return { affectedRows: 1 };
        }

        if (sqlTrim.startsWith('INSERT INTO PRINTHOUSE_SHIPPING_INTEGRATION_AUDITS')) {
            const row = { id: params[0], tenant_id: params[1], entity_type: params[2], entity_id: params[3], action: params[4] };
            memoryTables.printhouse_shipping_integration_audits.set(row.id, row);
            return { affectedRows: 1 };
        }

        return [];
    }
};

const shippingService = require('../src/api/services/printhouseShippingRegionService');
const estimateService = require('../src/api/services/printhouseDeliveryEstimateService');
const integrationService = require('../src/api/services/printhouseIntegrationService');
const credentialService = require('../src/api/services/printhouseIntegrationCredentialService');
const webhookService = require('../src/api/services/printhouseWebhookService');

const TEST_TENANT = 'ph191g-smoke-tenant';
const TEST_SITE = 'site-191g-main';

async function runTests() {
    console.log('=== Starting Phase 191G Shipping & Integration Smoke Tests ===\n');

    let regionId = null;
    let profileId = null;

    // 1. Create Shipping Region
    {
        const region = await shippingService.createShippingRegion(TEST_TENANT, TEST_SITE, {
            name: 'EU Central Shipping',
            code: 'EU_CENTRAL',
            countries: ['DE', 'FR', 'ES', 'IT', 'NL'],
            standardTransitDays: 3,
            expeditedTransitDays: 1,
            handlingDays: 1,
            pickupAvailable: true
        });
        assert.ok(region.id.startsWith('sreg_'));
        assert.strictEqual(region.name, 'EU Central Shipping');
        assert.strictEqual(region.countries.length, 5);
        assert.strictEqual(region.pickupAvailable, true);
        regionId = region.id;
        console.log('✓ Shipping region created successfully');
    }

    // 2. Add Delivery Method
    {
        const methods = await shippingService.addDeliveryMethod(TEST_TENANT, TEST_SITE, regionId, {
            name: 'Standard Express Courier',
            carrierName: 'DHL Express',
            serviceLevel: 'EXPRESS',
            transitDaysMin: 1,
            transitDaysMax: 3
        });
        assert.ok(methods.length > 0);
        assert.strictEqual(methods[0].carrierName, 'DHL Express');
        console.log('✓ Delivery method added to region');
    }

    // 3. Non-Binding Delivery Estimate Calculation
    {
        const estimate = await estimateService.computeDeliveryEstimate(TEST_TENANT, {
            siteId: TEST_SITE,
            regionId,
            productionLeadDays: 5,
            isExpedited: false
        });
        assert.strictEqual(estimate.nonBinding, true);
        assert.strictEqual(estimate.timelineComponents.productionLeadDays, 5);
        assert.strictEqual(estimate.timelineComponents.handlingDays, 1);
        assert.ok(estimate.estimatedDeliveryWindow.from);
        assert.ok(estimate.estimatedDeliveryWindow.to);
        console.log('✓ Non-binding delivery window calculated cleanly');
    }

    // 4. Create Integration Profile
    {
        const profile = await integrationService.createIntegrationProfile(TEST_TENANT, {
            name: 'Inbound MIS Webhook',
            integrationType: 'WEBHOOK',
            endpointUrl: 'https://api.example.com/webhooks'
        });
        assert.ok(profile.id.startsWith('inprof_'));
        assert.strictEqual(profile.integrationType, 'WEBHOOK');
        assert.strictEqual(profile.status, 'DRAFT');
        profileId = profile.id;
        console.log('✓ Integration profile created in DRAFT status');
    }

    // 5. Create API Credential (Single-Reveal Secret)
    {
        const cred = await credentialService.createCredential(TEST_TENANT, profileId, ['read', 'write']);
        assert.ok(cred.keyId.startsWith('phkey_'));
        assert.ok(cred.oneTimeSecret.startsWith('phsec_'));
        assert.strictEqual(cred.status, 'ACTIVE');

        const list = await credentialService.listCredentials(TEST_TENANT, profileId);
        assert.strictEqual(list.length, 1);
        assert.strictEqual(list[0].maskedSecret, '••••••••••••••••');
        console.log('✓ API credential issued with one-time secret and masked listing');
    }

    // 6. Webhook Configuration & SSRF Security Check
    {
        const webhook = await webhookService.configureWebhook(TEST_TENANT, profileId, {
            targetUrl: 'https://api.example.com/events',
            eventSubscriptions: ['job.updated', 'order.status_changed']
        });
        assert.ok(webhook.id.startsWith('whprof_'));
        assert.ok(webhook.oneTimeSigningSecret.startsWith('whsec_'));

        // SSRF Rejection Check
        let ssrfBlocked = false;
        try {
            webhookService.constructor.validateSsrfUrl('http://127.0.0.1/admin/internal');
        } catch (e) {
            ssrfBlocked = true;
            assert.ok(e.message.includes('SSRF_SECURITY_VIOLATION'));
        }
        assert.strictEqual(ssrfBlocked, true);
        console.log('✓ Webhook target configured & SSRF loopback injection rejected');
    }

    // 7. Webhook Connectivity Test
    {
        const testResult = await webhookService.testWebhookConnectivity(TEST_TENANT, profileId);
        assert.strictEqual(testResult.success, true);
        assert.strictEqual(testResult.httpStatus, 200);
        console.log('✓ Webhook connectivity test completed without enabling production dispatch');
    }

    // 8. Shipping & Integrations Completeness Audits
    {
        const shipCompleteness = await shippingService.getShippingCompleteness(TEST_TENANT, TEST_SITE);
        assert.strictEqual(shipCompleteness.status, 'COMPLETE');

        const integCompleteness = await integrationService.getIntegrationsCompleteness(TEST_TENANT);
        assert.ok(['COMPLETE', 'CONFIGURED_PENDING_TEST', 'NOT_REQUIRED'].includes(integCompleteness.status));
        assert.strictEqual(integCompleteness.productionRoutingEnabled, false);
        console.log('✓ Shipping and Integration completeness audit gates verified');
    }

    console.log('\nAll Phase 191G Shipping & Integration Smoke Tests Passed Successfully!');
}

runTests()
    .catch((err) => {
        console.error('Smoke tests failed:', err);
        process.exit(1);
    });
