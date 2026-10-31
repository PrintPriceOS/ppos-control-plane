import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const {
    EPAL_EXCHANGE_DEADLINE_DAYS,
    EPAL_NON_RETURN_FEE_PER_PALLET_EUR,
    SHIPMENT_LIFECYCLE_STATES,
    EPAL_VOUCHER_STATES,
    ensureShipmentLedgerRecord,
    ingestCarrierMilestone,
    listPublisherPodNotifications,
    runEpalSettlementSweep,
    startEpalSettlementScheduler,
    stopEpalSettlementScheduler,
    getEpalSettlementSchedulerStatus,
    consolidateOrderLandedCost,
    clearShipmentLedgerForTesting
} = require('../src/api/services/logistics/carrierMilestoneAndEpalService');

const { createLogisticsRouter } = require('../src/api/routes/logisticsRoutes');

async function invokeRouterEndpoint(router, { method, routePath, params = {}, query = {}, body = {}, headers = {}, user = null }) {
    const req = {
        params,
        query,
        body,
        headers,
        user
    };

    const captured = {
        statusCode: 200,
        headers: {},
        body: null
    };

    const res = {
        setHeader(name, val) {
            captured.headers[name.toLowerCase()] = val;
        },
        status(code) {
            captured.statusCode = code;
            return this;
        },
        json(payload) {
            captured.body = payload;
            return this;
        },
        send(payload) {
            captured.body = payload;
            return this;
        }
    };

    const middlewares = router.middlewares || [];
    for (const mw of middlewares) {
        let nextCalled = false;
        mw(req, res, () => {
            nextCalled = true;
        });
        if (!nextCalled) {
            return captured;
        }
    }

    const m = method.toLowerCase();
    for (const layer of router.stack || []) {
        if (layer.route && layer.route.path === routePath && layer.route.methods[m]) {
            await layer.route.stack[0].handle(req, res);
            return captured;
        }
    }

    throw new Error(`Route not found: ${method} ${routePath}`);
}

describe('Phase 198D (LOGISTICS-06) — Carrier Telematic Milestones (POD) & 14-Day EPAL Palettenschein Settlement Engine', () => {
    beforeEach(() => {
        clearShipmentLedgerForTesting();
    });

    it('Test 1: Ingests GS1-128 SSCC-18 carrier milestones, enforces Modulo-10 check digit, and closes shipment POD within 2h SLA', () => {
        const record = ensureShipmentLedgerRecord('SHP-MLS-2026-01', {
            tenantId: 'tenant-munich',
            carrierName: 'DACHSER',
            dispatchTimestamp: '2026-10-10T08:00:00.000Z',
            deliveredEpalPallets: 2
        });

        const palletSsccs = Object.keys(record.palletsBySscc);
        expect(palletSsccs.length).toBe(2);

        // 1. Reject corrupted SSCC check digit
        expect(() =>
            ingestCarrierMilestone(
                {
                    shipmentId: 'SHP-MLS-2026-01',
                    milestone: 'PICKED_UP',
                    sscc: '084123450000000019' // Wrong check digit (expected 0)
                },
                { tenantId: 'tenant-munich', role: 'PRINTHOUSE_OPERATOR' }
            )
        ).toThrow(/INVALID_SSCC18_CHECKSUM/);

        // 2. Scan Pallet 1 PICKED_UP -> shipment transitions to IN_TRANSIT
        const pickupRes = ingestCarrierMilestone(
            {
                shipmentId: 'SHP-MLS-2026-01',
                milestone: 'PICKED_UP',
                sscc: palletSsccs[0],
                timestamp: '2026-10-10T09:15:00.000Z',
                gps: { lat: 48.1351, lon: 11.5820 }
            },
            { tenantId: 'tenant-munich', role: 'PRINTHOUSE_OPERATOR' }
        );
        expect(pickupRes.shipmentStatus).toBe(SHIPMENT_LIFECYCLE_STATES.IN_TRANSIT);

        // 3. Deliver both pallets with 1 EPAL exchanged at dock & 45-min notification delay (<= 120 min SLA)
        ingestCarrierMilestone(
            {
                shipmentId: 'SHP-MLS-2026-01',
                milestone: 'DELIVERED_POD',
                sscc: palletSsccs[0],
                unloadedAt: '2026-10-11T10:00:00.000Z',
                timestamp: '2026-10-11T10:30:00.000Z',
                dockGate: 'Halle 1 / Tor 14'
            },
            { tenantId: 'tenant-munich', role: 'PRINTHOUSE_OPERATOR' }
        );

        const finalPod = ingestCarrierMilestone(
            {
                shipmentId: 'SHP-MLS-2026-01',
                milestone: 'DELIVERED_POD',
                sscc: palletSsccs[1],
                unloadedAt: '2026-10-11T10:00:00.000Z',
                timestamp: '2026-10-11T10:45:00.000Z',
                epalExchangedCount: 1,
                receiverName: 'Zeitfracht Dock Control'
            },
            { tenantId: 'tenant-munich', role: 'PRINTHOUSE_OPERATOR' }
        );

        expect(finalPod.shipmentStatus).toBe(SHIPMENT_LIFECYCLE_STATES.DELIVERED);
        expect(finalPod.podConfirmed).toBe(true);
        expect(finalPod.podSlaCompliant).toBe(true);
        expect(finalPod.epalAccount.deliveredEpalPallets).toBe(2);
        expect(finalPod.epalAccount.exchangedAtDockPallets).toBe(1);
        expect(finalPod.epalAccount.outstandingEpalPallets).toBe(1);
        expect(finalPod.epalAccount.voucherState).toBe(EPAL_VOUCHER_STATES.OPEN_WITHIN_WINDOW);
    });

    it('Test 2: Evaluates 14-day EPAL Palettenschein window and bills unreturned pallets at 15.00 EUR/unit (+ VAT)', () => {
        expect(EPAL_EXCHANGE_DEADLINE_DAYS).toBe(14);
        expect(EPAL_NON_RETURN_FEE_PER_PALLET_EUR).toBe(15.00);

        const sweepResult = runEpalSettlementSweep({
            evaluationDate: '2026-10-31T12:00:00.000Z',
            tenantId: 'tenant-munich',
            autoSettle: true,
            shipments: [
                {
                    // Case A: 20 days elapsed, 3 delivered, 1 exchanged at dock -> 2 overdue pallets -> 30.00 EUR net
                    shipmentId: 'SHP-EPAL-OVERDUE-01',
                    tenantId: 'tenant-munich',
                    carrierName: 'DACHSER',
                    dispatchTimestamp: '2026-10-11T08:00:00.000Z',
                    deliveredEpalPallets: 3,
                    exchangedAtDockPallets: 1,
                    returnedLaterPallets: 0,
                    vatPercent: 19
                },
                {
                    // Case B: 8 days elapsed (within 14-day window), 2 outstanding -> 0.00 EUR billed yet
                    shipmentId: 'SHP-EPAL-OPEN-02',
                    tenantId: 'tenant-munich',
                    carrierName: 'SCHENKER',
                    dispatchTimestamp: '2026-10-23T08:00:00.000Z',
                    deliveredEpalPallets: 2,
                    exchangedAtDockPallets: 0,
                    returnedLaterPallets: 0,
                    vatPercent: 19
                },
                {
                    // Case C: 25 days elapsed, 4 delivered, 4 exchanged 1:1 -> CLEARED_BY_EXCHANGE (0.00 EUR)
                    shipmentId: 'SHP-EPAL-CLEARED-03',
                    tenantId: 'tenant-munich',
                    carrierName: 'RABEN',
                    dispatchTimestamp: '2026-10-06T08:00:00.000Z',
                    deliveredEpalPallets: 4,
                    exchangedAtDockPallets: 2,
                    returnedLaterPallets: 2,
                    vatPercent: 19
                }
            ]
        });

        expect(sweepResult.summary.evaluatedShipmentsCount).toBe(3);
        expect(sweepResult.summary.overdueShipmentsCount).toBe(1);
        expect(sweepResult.summary.totalUnreturnedPalletsBilled).toBe(2);
        // 2 pallets * 15.00 EUR = 30.00 EUR net; + 19% VAT (5.70 EUR) = 35.70 EUR gross
        expect(sweepResult.summary.totalNetBilledEur).toBe(30.00);
        expect(sweepResult.summary.totalGrossBilledEur).toBe(35.70);

        const overdueItem = sweepResult.shipments.find(s => s.shipmentId === 'SHP-EPAL-OVERDUE-01');
        expect(overdueItem.isOverdue).toBe(true);
        expect(overdueItem.voucherState).toBe(EPAL_VOUCHER_STATES.SETTLED_BILLED);
        expect(overdueItem.settlementInvoice.settlementId).toBe('EPAL-SETTLE-SHP-EPAL-OVERDUE-01');
        expect(overdueItem.settlementInvoice.netChargeEur).toBe(30.00);

        const openItem = sweepResult.shipments.find(s => s.shipmentId === 'SHP-EPAL-OPEN-02');
        expect(openItem.isOverdue).toBe(false);
        expect(openItem.voucherState).toBe(EPAL_VOUCHER_STATES.OPEN_WITHIN_WINDOW);
        expect(openItem.settlementChargeNetEur).toBe(0);

        const clearedItem = sweepResult.shipments.find(s => s.shipmentId === 'SHP-EPAL-CLEARED-03');
        expect(clearedItem.voucherState).toBe(EPAL_VOUCHER_STATES.CLEARED_BY_EXCHANGE);
        expect(clearedItem.outstandingEpalPallets).toBe(0);
    });

    it('Test 3: Exposes POST /api/logistics/carrier/milestones and POST /api/logistics/epal/settlement-run with RBAC & tenant isolation', async () => {
        const router = createLogisticsRouter();

        // 1. Cross-tenant spoofing blocked on /epal/settlement-run
        const forbiddenTenantRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/epal/settlement-run',
            user: { id: 'op-1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-alpha' },
            body: { tenantId: 'tenant-beta' }
        });
        expect(forbiddenTenantRes.statusCode).toBe(403);
        expect(forbiddenTenantRes.body.error).toContain('FORBIDDEN_TENANT_MISMATCH');

        // 2. Valid POST /carrier/milestones
        const milestoneRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/carrier/milestones',
            user: { id: 'op-1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant-alpha' },
            body: {
                shipmentId: 'SHP-API-700',
                tenantId: 'tenant-alpha',
                milestone: 'DELIVERED_POD',
                sscc: '(00) 0 8412345 000000001 0',
                closeAllPallets: true,
                dispatchTimestamp: '2026-10-31T08:00:00.000Z',
                unloadedAt: '2026-10-31T14:00:00.000Z',
                timestamp: '2026-10-31T14:25:00.000Z',
                epalExchangedCount: 1,
                deliveredEpalPallets: 2
            }
        });
        expect(milestoneRes.statusCode).toBe(200);
        expect(milestoneRes.body.ok).toBe(true);
        expect(milestoneRes.body.shipmentStatus).toBe('DELIVERED');
        expect(milestoneRes.body.podSlaCompliant).toBe(true);
        expect(milestoneRes.body.epalAccount.outstandingEpalPallets).toBe(1);

        // 3. Valid POST /epal/settlement-run after 15 days (evaluates both SHP-API-700 [1 unreturned] + SHP-API-701 [2 unreturned] = 3 total)
        const settlementRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/epal/settlement-run',
            user: { id: 'admin-1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-alpha' },
            body: {
                tenantId: 'tenant-alpha',
                evaluationDate: '2026-11-20T12:00:00.000Z',
                shipments: [
                    {
                        shipmentId: 'SHP-API-701',
                        tenantId: 'tenant-alpha',
                        dispatchTimestamp: '2026-11-01T08:00:00.000Z',
                        deliveredEpalPallets: 2,
                        exchangedAtDockPallets: 0
                    }
                ]
            }
        });
        expect(settlementRes.statusCode).toBe(200);
        expect(settlementRes.body.ok).toBe(true);
        expect(settlementRes.body.summary.totalUnreturnedPalletsBilled).toBe(3);
        expect(settlementRes.body.summary.totalNetBilledEur).toBe(45.00);
    });

    it('Test 4 (LOGISTICS-07): Automated EPAL Daily Cron Scheduler, Publisher POD Notifications, and Consolidated Landed Cost Reconciliation', async () => {
        const router = createLogisticsRouter();

        // 1. Start automated daily EPAL settlement scheduler with immediate run
        const schedulerStartRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/epal/scheduler-control',
            user: { id: 'admin-1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-munich' },
            body: {
                action: 'START',
                intervalMs: 60000,
                runImmediately: true
            }
        });
        expect(schedulerStartRes.statusCode).toBe(200);
        expect(schedulerStartRes.body.scheduler.active).toBe(true);
        expect(schedulerStartRes.body.scheduler.cronExpression).toBe('0 0 * * *');
        expect(schedulerStartRes.body.scheduler.totalRunsCount).toBe(1);

        // 2. Ingest DELIVERED_POD milestone -> verify automatic Publisher POD notification & webhook payload
        const podMilestoneRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/carrier/milestones',
            user: { id: 'op-1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant-munich' },
            body: {
                shipmentId: 'SHP-POD-NOTIFY-901',
                tenantId: 'tenant-munich',
                poNumber: 'PO-VERLAG-2026-88',
                isbn: '978-3-442-15123-4',
                publisherEmail: 'herstellung@verlag-muenchen.de',
                milestone: 'DELIVERED_POD',
                sscc: '(00) 0 8412345 000000001 0',
                closeAllPallets: true,
                dispatchTimestamp: '2026-10-01T08:00:00.000Z',
                unloadedAt: '2026-10-02T11:00:00.000Z',
                timestamp: '2026-10-02T11:20:00.000Z',
                deliveredEpalPallets: 4,
                exchangedAtDockPallets: 2,
                receiverName: 'VVA Arvato Wareneingang'
            }
        });
        expect(podMilestoneRes.statusCode).toBe(200);
        expect(podMilestoneRes.body.publisherNotification).toBeDefined();
        expect(podMilestoneRes.body.publisherNotification.eventType).toBe('logistics.shipment.delivered_pod');
        expect(podMilestoneRes.body.publisherNotification.recipientEmail).toBe('herstellung@verstellung@verlag-muenchen.de'.replace('herstellung@verstellung@', 'herstellung@'));
        expect(podMilestoneRes.body.publisherNotification.subjectByLocale.DE).toContain('Zustellung bestätigt');
        expect(podMilestoneRes.body.publisherNotification.payload.documents.deliveryNotePdfUrl).toBe(
            '/api/logistics/shipments/SHP-POD-NOTIFY-901/delivery-note/pdf'
        );

        const listNotifRes = await invokeRouterEndpoint(router, {
            method: 'GET',
            routePath: '/notifications/publisher-pod',
            user: { id: 'op-1', role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant-munich' },
            query: { shipmentId: 'SHP-POD-NOTIFY-901' }
        });
        expect(listNotifRes.statusCode).toBe(200);
        expect(listNotifRes.body.count).toBe(1);

        // 3. Consolidate Order Landed Cost after 20 days (4 delivered - 2 exchanged = 2 overdue EPAL pallets -> 30.00 EUR net)
        const landedRes = await invokeRouterEndpoint(router, {
            method: 'POST',
            routePath: '/landed-cost/consolidate',
            user: { id: 'admin-1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-munich' },
            body: {
                orderId: 'ORD-2026-901',
                shipmentId: 'SHP-POD-NOTIFY-901',
                tenantId: 'tenant-munich',
                evaluationDate: '2026-10-25T12:00:00.000Z',
                quantity: 2000,
                manufacturingCostEur: 3200.00,
                packagingMaterialsCostEur: 95.00,
                quotedCarrierFreightEur: 240.00,
                actualCarrierFreightEur: 255.00,
                epalAllocationMode: 'CARRIER_FREIGHT_DEDUCTION'
            }
        });
        expect(landedRes.statusCode).toBe(200);
        expect(landedRes.body.ok).toBe(true);
        expect(landedRes.body.costSegregation.manufacturingCostEur).toBe(3200.00);
        expect(landedRes.body.costSegregation.packagingMaterialsCostEur).toBe(95.00);
        expect(landedRes.body.costSegregation.freightVarianceEur).toBe(15.00);
        expect(landedRes.body.epalSettlementReconciliation.isOverdue).toBe(true);
        expect(landedRes.body.epalSettlementReconciliation.outstandingEpalPallets).toBe(2);
        expect(landedRes.body.epalSettlementReconciliation.epalNetChargeEur).toBe(30.00);
        // 255.00 EUR actual freight - 30.00 EUR overdue EPAL deduction = 225.00 EUR net payable to carrier
        expect(landedRes.body.epalSettlementReconciliation.netPayableToCarrierEur).toBe(225.00);
        // Consolidated order total: 3200.00 manufacturing + (95.00 packaging + 255.00 freight) = 3550.00 EUR
        expect(landedRes.body.consolidatedTotalsEur.consolidatedLogisticsNetEur).toBe(350.00);
        expect(landedRes.body.consolidatedTotalsEur.consolidatedOrderTotalNetEur).toBe(3550.00);
        expect(landedRes.body.consolidatedTotalsEur.consolidatedLandedCostPerCopyEur).toBe(1.775);

        stopEpalSettlementScheduler();
        expect(getEpalSettlementSchedulerStatus().active).toBe(false);
    });
});
