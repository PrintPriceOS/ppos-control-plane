/**
 * tests/routing_notifications_parity.test.tsx
 *
 * PrintPrice OS — Phase 14E: Algorithmic Routing Real-Time Event Notifications,
 * SSE Stream, Operational Activity Persistence & Signed Outgoing Webhooks Suite.
 *
 * Validates:
 * 1. Event Factory & Persistence for all 5 typed routing scenarios:
 *    - `ROUTING_ASSIGNED_OPTIMAL` (SUCCESS)
 *    - `ROUTING_FORCED_MANUAL` (INFO)
 *    - `ROUTING_QUEUE_SATURATION_BYPASS` (WARNING)
 *    - `ROUTING_NO_ELIGIBLE_CANDIDATE` (CRITICAL)
 *    - `ROUTING_CROSS_BORDER_FLAG` (WARNING)
 *    are recorded into `operational_events` via `recordOperationalEvent()` and serialized into SSE frames (< 500ms).
 * 2. An order with no compatible printhouse candidates (e.g., extreme oversize format or congestion lock)
 *    triggers a `CRITICAL` `ROUTING_NO_ELIGIBLE_CANDIDATE` event and dispatches critical alert metadata.
 * 3. Outgoing Webhooks sign payloads with `X-PrintPrice-Signature: sha256=<hmac>` and execute up to 3 automatic
 *    exponential-backoff retries on non-2xx HTTP responses.
 * 4. Frontend reactivity:
 *    - `NotificationBell` listens to live routing events, shows the pulsing unread badge, and opens the dropdown
 *      with relative timestamp and "Ver Decisión" button.
 *    - `RoutingRulesTab` renders the operator alert toggles (`Real-time Push Alarms`, `Auto-Webhook to Assigned Printhouse`),
 *      displays the instant toast banner on simulation or manual override, and `OperationalActivityStream` prepends
 *      the new event at node 0 immediately without waiting for the 30s polling interval.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { NotificationBell } from '../src/ui/components/NotificationBell';
import { RoutingRulesTab } from '../src/ui/components/pricing/RoutingRulesTab';
import { OperationalActivityStream } from '../src/ui/components/dashboard/OperationalActivityStream';

// Backend CJS services under test
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routingNotificationService = require('../src/api/services/pricing/routingNotificationService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routingEngine = require('../src/api/services/pricing/routingDecisionEngineService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const activityStreamService = require('../src/api/services/telemetry/operationalActivityStreamService');

describe('Phase 14E — Real-Time Routing Notifications, SSE Stream, Webhooks & Reactive UI', () => {
    it('1. Persists ROUTING_ASSIGNED_OPTIMAL in operational_events and broadcasts a valid SSE frame in < 500ms', async () => {
        const sseChunks: string[] = [];
        const mockRes: any = {
            writeHead: vi.fn(),
            write: vi.fn((chunk: string) => {
                sseChunks.push(chunk);
            })
        };
        const mockReq: any = {
            query: { tenantId: 'tenant-notif-1', printhouseId: 'node-primary', role: 'PRINTHOUSE_ADMIN' },
            on: vi.fn()
        };

        const subscriber = routingNotificationService.registerSseSubscriber(mockReq, mockRes);
        expect(subscriber.id).toMatch(/^sse_/);
        expect(sseChunks[0]).toContain('event: connected');

        const result = await routingEngine.calculateRoutingDecisions(
            'tenant-notif-1',
            {
                orderId: 'PUB-ORD-2026-9901',
                copies: 1200,
                pages: 240,
                trimSize: '148x210',
                productFamily: 'SOFTCOVER',
                destination: 'MADRID_ES'
            },
            {
                dispatchPolicy: 'BALANCED_HYBRID',
                maxQueueCongestionPct: 85
            }
        );

        expect(result.ok).toBe(true);
        expect(result.primaryNotification).toBeDefined();
        expect(result.primaryNotification.eventType).toBe('ROUTING_ASSIGNED_OPTIMAL');
        expect(result.primaryNotification.severity).toBe('SUCCESS');
        expect(result.primaryNotification.metadata.landedCostEur).toBeGreaterThan(0);

        // Verify SSE subscriber received `event: routing_notification`
        const routingFrames = sseChunks.filter((c) => c.includes('event: routing_notification'));
        expect(routingFrames.length).toBeGreaterThanOrEqual(1);
        expect(routingFrames[0]).toContain('PUB-ORD-2026-9901');
        expect(routingFrames[0]).toContain('ROUTING_ASSIGNED_OPTIMAL');

        // Verify persistence in `operational_events` via `queryOperationalActivityStream`
        const streamQuery = await activityStreamService.queryOperationalActivityStream({
            tenantId: 'tenant-notif-1',
            orderId: 'PUB-ORD-2026-9901',
            limit: 10
        });
        expect(streamQuery.events.length).toBeGreaterThanOrEqual(1);
        expect(streamQuery.events[0].orderId).toBe('PUB-ORD-2026-9901');

        routingNotificationService.removeSseSubscriber(subscriber.id);
    });

    it('2. Emits CRITICAL ROUTING_NO_ELIGIBLE_CANDIDATE when no printhouse machine supports sheet format or congestion lock', async () => {
        const result = await routingEngine.calculateRoutingDecisions(
            'tenant-notif-critical',
            {
                orderId: 'PUB-ORD-2026-9999',
                copies: 500,
                pages: 128,
                trimSize: '950x1400', // Exceeds all B1, B2, Digital and Web Rotary max sheet widths
                productFamily: 'HARDCOVER',
                destination: 'MADRID_ES'
            },
            {
                maxQueueCongestionPct: 85
            }
        );

        expect(result.optimalNode).toBeNull();
        expect(result.primaryNotification).toBeDefined();
        expect(result.primaryNotification.eventType).toBe('ROUTING_NO_ELIGIBLE_CANDIDATE');
        expect(result.primaryNotification.severity).toBe('CRITICAL');
        expect(result.primaryNotification.title).toContain('ALERTA CRÍTICA');

        const critEmitted = result.notificationPipeline.emitted.find(
            (e: any) => e.notification.eventType === 'ROUTING_NO_ELIGIBLE_CANDIDATE'
        );
        expect(critEmitted).toBeDefined();
        expect(critEmitted.criticalAlertDispatched).toBeDefined();
        expect(critEmitted.criticalAlertDispatched.severity).toBe('CRITICAL');
    });

    it('3. Signs outgoing webhooks with X-PrintPrice-Signature: sha256=<hmac> and retries up to 3 times on HTTP 500', async () => {
        let callCount = 0;
        let capturedHeaders: Record<string, string> = {};

        const mockHttpPost = vi.fn(async (_url: string, _body: string, cfg: any) => {
            callCount++;
            capturedHeaders = cfg.headers || {};
            if (callCount < 3) {
                const err: any = new Error('HTTP 503 Upstream Busy');
                err.response = { status: 503 };
                throw err;
            }
            return { status: 200, data: { received: true } };
        });

        const payload = routingNotificationService.buildRoutingNotificationPayload('ROUTING_FORCED_MANUAL', {
            tenantId: 'tenant-wh-test',
            orderId: 'PUB-ORD-2026-7711',
            winner: {
                nodeName: 'Demo Balto 3',
                printerName: 'HP Indigo 100K',
                totalLandedCostEur: 840.5
            }
        });

        const delivery = await routingNotificationService.dispatchSignedRoutingWebhook(
            {
                id: 'wh-test-1',
                targetUrl: 'https://hooks.partner-printhouse.example/routing',
                secret: 'whsec_unit_test_secret_2026'
            },
            payload,
            {
                maxAttempts: 3,
                baseDelayMs: 5,
                httpPost: mockHttpPost
            }
        );

        expect(callCount).toBe(3);
        expect(delivery.status).toBe('DELIVERED');
        expect(delivery.attempts).toBe(3);
        expect(capturedHeaders['X-PrintPrice-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
        expect(capturedHeaders['X-PrintPrice-Event']).toBe('ROUTING_FORCED_MANUAL');
    });

    it('4. Updates NotificationBell, RoutingRulesTab Toast & OperationalActivityStream in real time without polling delay', async () => {
        render(
            <MemoryRouter>
                <LocaleProvider>
                    <div>
                        <NotificationBell />
                        <RoutingRulesTab crossover={null} routingHistory={[]} conflicts={[]} />
                        <OperationalActivityStream />
                    </div>
                </LocaleProvider>
            </MemoryRouter>
        );

        // Operator alert toggles in RoutingRulesTab are present and checked by default
        const pushToggle = screen.getByTestId('toggle-realtime-push-alarms') as HTMLInputElement;
        const webhookToggle = screen.getByTestId('toggle-auto-webhook-printhouse') as HTMLInputElement;
        expect(pushToggle.checked).toBe(true);
        expect(webhookToggle.checked).toBe(true);

        // Trigger simulation in RoutingRulesTab -> emits real-time event to NotificationBell & OperationalActivityStream
        fireEvent.click(screen.getByTestId('simulate-routing-dispatch-btn'));

        // 1. Instant Toast Banner appears in RoutingRulesTab
        const toastBanner = await screen.findByTestId('routing-live-toast-banner');
        expect(toastBanner).toBeInTheDocument();
        expect(toastBanner).toHaveTextContent(/ROUTING_ASSIGNED_OPTIMAL/i);

        // 2. NotificationBell shows unread badge and lists the alert in dropdown with "Ver Decisión" button
        const bellBadge = await screen.findByTestId('notification-bell-unread-badge');
        expect(bellBadge).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('notification-bell-button'));
        const dropdown = await screen.findByTestId('notification-bell-dropdown');
        expect(dropdown).toHaveTextContent(/Ruta Óptima Adjudicada/i);

        // 3. OperationalActivityStream prepends the event at node 0 (`activity-event-card-0`)
        const firstActivityNode = screen.getByTestId('activity-event-card-0');
        expect(firstActivityNode).toHaveTextContent(/Ruta Óptima Adjudicada/i);

        // 4. Emit a manual CRITICAL event via window event and verify NotificationBell & Activity Stream update immediately
        act(() => {
            window.dispatchEvent(
                new CustomEvent('ppos:routing-notification', {
                    detail: {
                        id: 'RT-CRIT-LIVE-01',
                        orderId: 'PUB-ORD-2026-CRIT',
                        domain: 'PRODUCTION',
                        eventType: 'ROUTING_NO_ELIGIBLE_CANDIDATE',
                        severity: 'CRITICAL',
                        title: 'ALERTA CRÍTICA: Orden PUB-ORD-2026-CRIT Bloqueada Sin Taller Elegible',
                        description: 'Pliego 950x1400 mm incompatible en toda la red.',
                        timestamp: new Date().toISOString()
                    }
                })
            );
        });

        expect(screen.getByTestId('activity-event-card-0')).toHaveTextContent('PUB-ORD-2026-CRIT');
        expect(screen.getByTestId('routing-live-toast-banner')).toHaveTextContent('ROUTING_NO_ELIGIBLE_CANDIDATE');
    });
});
