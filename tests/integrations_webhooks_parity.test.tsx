/**
 * @vitest-environment jsdom
 *
 * tests/integrations_webhooks_parity.test.tsx
 *
 * Phase 18 Verification Suite — Integrations & Webhooks Unification:
 * 1. Backend HMAC-SHA256 secret generation & atomic rotation (`whsec_...`).
 * 2. SSRF protection & real handshake ping (`/test-ping`) with dual headers (`X-PPOS-Signature` / `X-PrintPrice-Signature`).
 * 3. Granular 12 industrial domain topics catalog (`preflight`, `routing`, `shopfloor`, `fintech`).
 * 4. Forensic delivery log (`webhook_deliveries`) & manual replay (`/deliveries/:id/replay`) with tenant isolation.
 * 5. Frontend `IntegrationsPanel.tsx` interactive drawer, secret rotation, replay UI, and 100% EN/DE/ES i18n parity.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocaleProvider } from '../src/ui/i18n';
import { IntegrationsPanel, ALL_12_TOPICS } from '../src/ui/components/printhouse/setup/IntegrationsPanel';
import { en } from '../src/ui/en';
import { de } from '../src/ui/de';
import { es } from '../src/ui/es';

const db = require('../src/api/services/mysqlClient');
const webhookService = require('../src/api/services/printhouseWebhookService');
const integrationService = require('../src/api/services/printhouseIntegrationService');

// In-memory MySQL mock store for isolated unit/integration testing
const memoryStore = {
    profiles: new Map<string, any>(),
    webhooks: new Map<string, any>(),
    subscriptions: new Map<string, any>(),
    deliveries: new Map<string, any>(),
    audits: [] as any[]
};

const origQuery = db.query.bind(db);
db.query = async function (sql: string, params: any[] = []) {
    const s = sql.trim();

    if (/INSERT INTO printhouse_integration_profiles/i.test(s)) {
        const [id, tenantId, siteId, type, name, endpointUrl, settingsJson] = params;
        memoryStore.profiles.set(id, {
            id,
            tenant_id: tenantId,
            site_id: siteId,
            integration_type: type,
            name,
            status: 'DRAFT',
            endpoint_url: endpointUrl,
            settings_json: settingsJson,
            created_at: new Date(),
            updated_at: new Date()
        });
        return { affectedRows: 1 };
    }

    if (/SELECT \* FROM printhouse_integration_profiles/i.test(s)) {
        const all = Array.from(memoryStore.profiles.values());
        if (/WHERE id = \?/i.test(s)) {
            return all.filter(r => r.id === params[0] && r.tenant_id === params[1]);
        }
        return all.filter(r => r.tenant_id === params[0]);
    }

    if (/UPDATE printhouse_integration_profiles/i.test(s)) {
        const id = params[params.length - 2];
        const prof = memoryStore.profiles.get(id);
        if (prof) {
            if (s.includes('status = ?')) prof.status = params[0];
            if (s.includes('endpoint_url = ?')) prof.endpoint_url = params[0];
        }
        return { affectedRows: 1 };
    }

    if (/INSERT INTO printhouse_webhook_profiles/i.test(s)) {
        const [id, profileId, tenantId, targetUrl, eventsJson, ciphertext, enabled] = params;
        memoryStore.webhooks.set(id, {
            id,
            integration_profile_id: profileId,
            tenant_id: tenantId,
            target_url: targetUrl,
            event_subscriptions_json: eventsJson,
            signing_secret_ciphertext: ciphertext,
            enabled,
            created_at: new Date(),
            updated_at: new Date()
        });
        return { affectedRows: 1 };
    }

    if (/SELECT \* FROM printhouse_webhook_profiles/i.test(s)) {
        const [profileId, tenantId] = params;
        return Array.from(memoryStore.webhooks.values()).filter(
            r => r.integration_profile_id === profileId && r.tenant_id === tenantId
        );
    }

    if (/SELECT signing_secret_ciphertext FROM printhouse_webhook_profiles/i.test(s)) {
        const [id, tenantId] = params;
        const row = memoryStore.webhooks.get(id);
        return row && row.tenant_id === tenantId ? [row] : [];
    }

    if (/UPDATE printhouse_webhook_profiles/i.test(s)) {
        if (s.includes('signing_secret_ciphertext = ?') && !s.includes('target_url = ?')) {
            const [ciphertext, id, tenantId] = params;
            const row = memoryStore.webhooks.get(id);
            if (row && row.tenant_id === tenantId) {
                row.signing_secret_ciphertext = ciphertext;
            }
            return { affectedRows: 1 };
        }
        if (s.includes('target_url = ?')) {
            const id = params[params.length - 2];
            const row = memoryStore.webhooks.get(id);
            if (row) {
                row.target_url = params[0];
                row.event_subscriptions_json = params[1];
                if (s.includes('signing_secret_ciphertext = ?')) {
                    row.signing_secret_ciphertext = params[2];
                }
            }
            return { affectedRows: 1 };
        }
        const [lastDeliv, lastSucc, id] = params;
        const row = memoryStore.webhooks.get(id);
        if (row) {
            row.last_delivery_at = lastDeliv;
            row.last_success_at = lastSucc;
        }
        return { affectedRows: 1 };
    }

    if (/SELECT id FROM webhook_subscriptions/i.test(s)) {
        const [id, tenantId] = params;
        const sub = memoryStore.subscriptions.get(id);
        return sub && sub.tenant_id === tenantId ? [sub] : [];
    }

    if (/INSERT INTO webhook_subscriptions/i.test(s)) {
        const [id, tenantId, url, secret, eventsJson, status] = params;
        memoryStore.subscriptions.set(id, {
            id,
            tenant_id: tenantId,
            url,
            secret,
            events_json: eventsJson,
            status: status || 'ACTIVE',
            created_at: new Date()
        });
        return { affectedRows: 1 };
    }

    if (/UPDATE webhook_subscriptions/i.test(s)) {
        const id = params[params.length - 2];
        const sub = memoryStore.subscriptions.get(id);
        if (sub) {
            if (s.includes('SET secret = ?')) {
                sub.secret = params[0];
            } else {
                sub.url = params[0];
                sub.secret = params[1];
                sub.events_json = params[2];
                sub.status = params[3];
            }
        }
        return { affectedRows: 1 };
    }

    if (/INSERT INTO webhook_deliveries/i.test(s)) {
        const [id, tenantId, subId, eventType, eventId, payloadJson, signature] = params;
        memoryStore.deliveries.set(id, {
            id,
            tenant_id: tenantId,
            subscription_id: subId,
            event_type: eventType,
            event_id: eventId,
            payload_json: payloadJson,
            signature,
            status: 'PENDING',
            attempt_count: 0,
            max_attempts: 3,
            created_at: new Date()
        });
        return { affectedRows: 1 };
    }

    if (/UPDATE webhook_deliveries/i.test(s)) {
        const id = params[params.length - 1];
        const del = memoryStore.deliveries.get(id);
        if (del) {
            if (s.includes("SET status = 'DELIVERED'")) {
                del.status = 'DELIVERED';
                del.attempt_count = params[0];
                del.last_status_code = params[1];
                del.delivered_at = new Date();
            } else if (s.includes("SET status = 'FAILED', attempt_count = 0")) {
                del.status = 'FAILED';
                del.attempt_count = 0;
            } else {
                del.status = params[0];
                del.attempt_count = params[1];
                del.last_status_code = params[2];
                del.last_error = params[3];
                del.next_retry_at = params[4];
            }
        }
        return { affectedRows: 1 };
    }

    if (/FROM webhook_deliveries d/i.test(s)) {
        if (/WHERE d\.id = \?/i.test(s)) {
            const del = memoryStore.deliveries.get(params[0]);
            if (!del) return [];
            const sub = memoryStore.subscriptions.get(del.subscription_id);
            return [{
                ...del,
                url: sub?.url || 'https://api.yourprinthouse.com/v1/webhooks',
                sub_url: sub?.url || 'https://api.yourprinthouse.com/v1/webhooks',
                sub_tenant_id: sub?.tenant_id || del.tenant_id,
                sub_status: sub?.status || 'ACTIVE'
            }];
        }
        const tenantId = params[0];
        const subId = params[1];
        return Array.from(memoryStore.deliveries.values())
            .filter(d => d.tenant_id === tenantId && (!subId || d.subscription_id === subId))
            .map(d => {
                const sub = memoryStore.subscriptions.get(d.subscription_id);
                return {
                    ...d,
                    target_url: sub?.url || 'https://api.yourprinthouse.com/v1/webhooks'
                };
            });
    }

    if (/INSERT INTO printhouse_shipping_integration_audits/i.test(s)) {
        memoryStore.audits.push({ id: params[0], tenantId: params[1], action: params[4] });
        return { affectedRows: 1 };
    }

    return origQuery(sql, params);
};

describe('Phase 18: Integrations & Webhooks Unification Suite', () => {
    const TENANT_ID = 'tenant-webhooks-audit-1';

    beforeEach(() => {
        memoryStore.profiles.clear();
        memoryStore.webhooks.clear();
        memoryStore.subscriptions.clear();
        memoryStore.deliveries.clear();
        memoryStore.audits.length = 0;
    });

    it('exposes the 4 industrial domains and all 12 canonical webhook topics', () => {
        const catalog = webhookService.getTopicsCatalog();
        expect(Object.keys(catalog.domains)).toEqual(['preflight', 'routing', 'shopfloor', 'fintech']);
        expect(catalog.allTopics).toHaveLength(12);
        expect(catalog.allTopics).toEqual(expect.arrayContaining([
            'preflight.certified',
            'preflight.failed',
            'preflight.autofix_ready',
            'routing.assigned_optimal',
            'routing.forced_manual',
            'routing.queue_saturated',
            'order.created',
            'order.status_changed',
            'press.completed',
            'escrow.released',
            'einvoice.issued',
            'shipping.dispatched'
        ]));
        expect(ALL_12_TOPICS).toEqual(catalog.allTopics);
    });

    it('generates whsec_ HMAC-SHA256 secrets, rotates them atomically, and syncs subscriptions', async () => {
        const profile = await integrationService.createIntegrationProfile(TENANT_ID, {
            name: 'Prinect Production Webhook',
            integrationType: 'WEBHOOK',
            endpointUrl: 'https://api.yourprinthouse.com/v1/webhooks'
        });

        const configured = await webhookService.configureWebhook(TENANT_ID, profile.id, {
            targetUrl: 'https://api.yourprinthouse.com/v1/webhooks',
            eventSubscriptions: ['preflight.certified', 'routing.assigned_optimal', 'escrow.released']
        });

        expect(configured.oneTimeSigningSecret).toMatch(/^whsec_[0-9a-f]{48}$/);
        expect(configured.eventSubscriptions).toEqual([
            'preflight.certified',
            'routing.assigned_optimal',
            'escrow.released'
        ]);

        const rotated = await webhookService.rotateWebhookSecret(TENANT_ID, profile.id);
        expect(rotated.oneTimeSigningSecret).toMatch(/^whsec_[0-9a-f]{48}$/);
        expect(rotated.oneTimeSigningSecret).not.toBe(configured.oneTimeSigningSecret);
        expect(rotated.maskedSecret).toBe('whsec_••••••••••••••••••••');
    });

    it('executes SSRF-guarded /test-ping with dual HMAC headers and replays failed deliveries with tenant isolation', async () => {
        const profile = await integrationService.createIntegrationProfile(TENANT_ID, {
            name: 'MIS Webhook Endpoint',
            integrationType: 'WEBHOOK',
            endpointUrl: 'https://api.yourprinthouse.com/v1/events'
        });

        await webhookService.configureWebhook(TENANT_ID, profile.id, {
            targetUrl: 'https://api.yourprinthouse.com/v1/events',
            eventSubscriptions: ['order.created', 'press.completed']
        });

        // SSRF check must block loopback & metadata targets
        await expect(
            webhookService.testWebhookPing(TENANT_ID, profile.id, null, {
                targetUrl: 'http://169.254.169.254/latest/meta-data/'
            })
        ).rejects.toThrow(/SSRF_SECURITY_VIOLATION/);

        // Execute signed handshake ping
        let capturedHeaders: Record<string, string> = {};
        const pingResult = await webhookService.testWebhookPing(TENANT_ID, profile.id, null, {
            mockHandler: async (req: any) => {
                capturedHeaders = req.headers;
                return { status: 200 };
            }
        });

        expect(pingResult.success).toBe(true);
        expect(pingResult.httpStatus).toBe(200);
        expect(pingResult.ssrfCheck).toBe('CLEAN');
        expect(capturedHeaders['X-PPOS-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
        expect(capturedHeaders['X-PrintPrice-Signature']).toBe(capturedHeaders['X-PPOS-Signature']);

        // Verify forensic delivery log entry and manual replay
        const deliveries = await webhookService.listWebhookDeliveries(TENANT_ID, profile.id);
        expect(deliveries.length).toBeGreaterThanOrEqual(1);
        const targetDelivery = deliveries[0];
        expect(targetDelivery.status).toBe('DELIVERED');
        expect(targetDelivery.signature).toMatch(/^sha256=/);

        // Cross-tenant replay attempt must be blocked (403 FORBIDDEN)
        await expect(
            webhookService.replayWebhookDelivery('unauthorized-tenant-999', targetDelivery.id, { role: 'PRINTHOUSE_ADMIN' })
        ).rejects.toThrow(/FORBIDDEN/);

        // Authorized replay succeeds
        const replayRes = await webhookService.replayWebhookDelivery(TENANT_ID, targetDelivery.id, { role: 'PRINTHOUSE_ADMIN' });
        expect(replayRes.success).toBe(true);
        expect(replayRes.status).toBe('DELIVERED');
    });

    it('maintains 100% i18n key parity for setup.integrations.* across EN, DE, and ES and renders IntegrationsPanel cleanly', async () => {
        const integrationKeys = Object.keys(en).filter(k => k.startsWith('setup.integrations.'));
        expect(integrationKeys.length).toBeGreaterThanOrEqual(50);

        for (const key of integrationKeys) {
            expect((en as any)[key]).toBeTruthy();
            expect((de as any)[key]).toBeTruthy();
            expect((es as any)[key]).toBeTruthy();
        }

        // Mock global fetch for UI component test
        const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const urlStr = String(input);
            if (urlStr.endsWith('/deliveries')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        deliveries: [
                            {
                                id: 'whdel_forensic_101',
                                subscriptionId: 'whprof_1',
                                eventType: 'preflight.certified',
                                eventId: 'ev_101',
                                targetUrl: 'https://api.yourprinthouse.com/v1/webhooks',
                                status: 'FAILED',
                                statusCode: 503,
                                durationMs: 112,
                                attemptCount: 1,
                                maxAttempts: 3,
                                backoffSchedule: '1m -> 5m -> 15m',
                                signature: 'sha256=abcdef1234567890',
                                payload: { event: 'preflight.certified', jobId: 'job_99' },
                                createdAt: new Date().toISOString()
                            }
                        ]
                    })
                } as any;
            }
            if (urlStr.includes('/deliveries/whdel_forensic_101/replay')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        replayResult: { status: 'DELIVERED', statusCode: 200, durationMs: 31 }
                    })
                } as any;
            }
            if (urlStr.includes('/webhook/rotate-secret')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        webhook: {
                            id: 'whprof_1',
                            secretPrefix: 'whsec_998877...',
                            oneTimeSigningSecret: 'whsec_99887766554433221100aabbccddeeff0011223344556677'
                        }
                    })
                } as any;
            }
            if (urlStr.endsWith('/webhook') && (!init || init.method !== 'POST')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        webhook: {
                            id: 'whprof_1',
                            targetUrl: 'https://api.yourprinthouse.com/v1/webhooks',
                            eventSubscriptions: ['preflight.certified', 'order.created'],
                            secretPrefix: 'whsec_112233...'
                        }
                    })
                } as any;
            }
            return {
                ok: true,
                json: async () => ({
                    success: true,
                    profiles: [
                        {
                            id: 'inprof_1',
                            integrationType: 'WEBHOOK',
                            name: 'Prinect Industrial Bridge',
                            status: 'READY',
                            endpointUrl: 'https://api.yourprinthouse.com/v1/webhooks',
                            webhook: {
                                id: 'whprof_1',
                                integrationProfileId: 'inprof_1',
                                targetUrl: 'https://api.yourprinthouse.com/v1/webhooks',
                                eventSubscriptions: ['preflight.certified', 'order.created'],
                                enabled: true,
                                secretPrefix: 'whsec_112233...'
                            }
                        }
                    ]
                })
            } as any;
        });

        vi.stubGlobal('fetch', mockFetch);

        render(
            <LocaleProvider>
                <IntegrationsPanel siteId="site-main" />
            </LocaleProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('integration-profile-card-inprof_1')).toBeDefined();
        });

        // Open Webhook Configuration Drawer
        fireEvent.click(screen.getByTestId('configure-webhook-btn-inprof_1'));
        await waitFor(() => {
            expect(screen.getByTestId('webhook-config-drawer')).toBeDefined();
        });

        // Verify all 12 topic checkboxes exist in the drawer
        for (const topicId of ALL_12_TOPICS) {
            expect(screen.getByTestId(`topic-checkbox-${topicId}`)).toBeDefined();
        }

        // Rotate signing secret and verify one-time whsec_ reveal banner
        fireEvent.click(screen.getByTestId('rotate-webhook-secret-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('revealed-secret-value').textContent).toContain('whsec_99887766554433221100');
        });

        // Inspect forensic payload and replay failed delivery
        fireEvent.click(screen.getByTestId('inspect-delivery-btn-whdel_forensic_101'));
        expect(screen.getByTestId('forensic-payload-inspector')).toBeDefined();

        fireEvent.click(screen.getByTestId('replay-delivery-btn-whdel_forensic_101'));
        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/printhouse/onboarding/integrations/deliveries/whdel_forensic_101/replay',
                expect.objectContaining({ method: 'POST' })
            );
        });

        vi.unstubAllGlobals();
    });
});

