import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';

const TEST_INTAKE_TOKEN = 'test-marketplace-escrow-epod-token';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-escrow-epod-2026';
process.env.PPOS_MARKETPLACE_INTAKE_TOKEN = TEST_INTAKE_TOKEN;

const marketplaceOrdersRouter = require('../src/api/routes/marketplaceOrders');
const escrowService = require('../src/api/services/escrowService');
const logisticsDispatchService = require('../src/api/services/logisticsDispatchService');
const {
    validateSscc18,
    calculateGs1Mod10CheckDigit
} = require('../src/api/services/logistics/ssccGeneratorService');

async function postJson(baseUrl, path, body = {}, headers = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Marketplace-Token': TEST_INTAKE_TOKEN,
            ...headers
        },
        body: JSON.stringify(body)
    });
    const json = await res.json();
    return { status: res.status, body: json };
}

describe('Transactional Escrow State Machine, GS1-128 SSCC-18 Dispatch & Cryptographic ePOD Settlement E2E', () => {
    let server;
    let baseUrl;

    beforeEach(async () => {
        escrowService.resetEscrowStateForTesting();
        logisticsDispatchService.resetLogisticsStateForTesting();

        const app = express();
        app.use(express.json({ limit: '5mb' }));
        app.use('/api/marketplace/orders', marketplaceOrdersRouter);

        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterEach(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
    });

    it('Test 1: Full happy path (OFFER_SELECTED -> FUNDS_ESCROWED -> ACCEPTED -> PACKED -> IN_TRANSIT w/ SSCC-18 -> DELIVERED w/ ePOD SHA-256 -> SETTLED w/ 4.0% fee) & strict state transition guard', async () => {
        const orderId = 'ORD-ESCROW-HAPPY-001';

        // 1. Lock funds in Escrow: OFFER_SELECTED -> FUNDS_ESCROWED
        const fundRes = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/escrow-hold`, {
            tenantId: 'tenant-editorial-alpha',
            printhouseId: 'NODE-LV-RIGA-01',
            grossAmountEur: 12500.00,
            manufacturingAmountEur: 10000.00,
            packagingAmountEur: 500.00,
            freightAmountEur: 2000.00,
            platformFeePct: 4.0,
            stripePaymentIntentId: 'pi_3QvEscrowHold001'
        });

        expect(fundRes.status).toBe(200);
        expect(fundRes.body.ok).toBe(true);
        expect(fundRes.body.previousState).toBe('OFFER_SELECTED');
        expect(fundRes.body.status).toBe('FUNDS_ESCROWED');
        expect(fundRes.body.escrowStatus).toBe('FUNDS_ESCROWED');
        expect(fundRes.body.escrowHold.grossAmountEur).toBe(12500);

        // 2. Verify strict deterministic state guard: jumping directly from FUNDS_ESCROWED -> SETTLED_FUNDS_RELEASED is rejected (HTTP 409)
        const illegalJumpRes = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/state`, {
            targetState: 'SETTLED_FUNDS_RELEASED'
        });

        expect(illegalJumpRes.status).toBe(409);
        expect(illegalJumpRes.body.code).toBe('INVALID_ORDER_STATE_TRANSITION');

        // 3. Progress through canonical manufacturing lifecycle:
        // FUNDS_ESCROWED -> ACCEPTED -> IN_PREPRESS -> IMPOSITION_DISPATCHED -> PRINTING -> BINDING_FINISHING -> PACKED_READY_FOR_DISPATCH
        const manufacturingStates = [
            'ACCEPTED',
            'IN_PREPRESS',
            'IMPOSITION_DISPATCHED',
            'PRINTING',
            'BINDING_FINISHING',
            'PACKED_READY_FOR_DISPATCH'
        ];

        for (const nextState of manufacturingStates) {
            const stateRes = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/state`, {
                targetState: nextState
            });
            expect(stateRes.status).toBe(200);
            expect(stateRes.body.ok).toBe(true);
            expect(stateRes.body.status).toBe(nextState);
        }

        // 4. Pack & Dispatch (`PACKED_READY_FOR_DISPATCH -> IN_TRANSIT`) with canonical GS1-128 / SSCC-18
        const dispatchRes = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/pack-dispatch`, {
            carrierName: 'DACHSER European Logistics',
            palletTierCount: 3,
            grossWeightKg: 1485.60,
            extensionDigit: '0',
            companyPrefix: '8412345',
            serialReference: '000010501'
        });

        expect(dispatchRes.status).toBe(200);
        expect(dispatchRes.body.ok).toBe(true);
        expect(dispatchRes.body.previousState).toBe('PACKED_READY_FOR_DISPATCH');
        expect(dispatchRes.body.status).toBe('IN_TRANSIT');

        const { shipment, webhookEvent } = dispatchRes.body;
        expect(shipment.carrierName).toBe('DACHSER European Logistics');
        expect(shipment.palletTierCount).toBe(3);
        expect(shipment.grossWeightKg).toBe(1485.6);

        // Verify SSCC-18 structure: AI (00) + 18 digits with Modulo-10 Check Digit
        expect(shipment.sscc18).toHaveLength(18);
        expect(shipment.gs1128Barcode).toBe(`(00)${shipment.sscc18}`);
        expect(validateSscc18(shipment.sscc18)).toBe(true);
        expect(validateSscc18(shipment.gs1128Barcode)).toBe(true);

        const expectedMod10 = calculateGs1Mod10CheckDigit(shipment.sscc18.slice(0, 17));
        expect(Number(shipment.sscc18[17])).toBe(expectedMod10);

        // Verify PALLET_IN_TRANSIT event emission
        expect(webhookEvent.eventType).toBe('PALLET_IN_TRANSIT');
        expect(webhookEvent.sscc18).toBe(shipment.sscc18);

        // 5. Cryptographic ePOD Capture (`IN_TRANSIT -> DELIVERED_PENDING_CONFIRMATION`)
        const sampleSvgSignature = 'data:image/svg+xml;base64,' + Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><path d="M10 40 Q 60 10, 110 40 T 210 40" stroke="#000" fill="none"/></svg>'
        ).toString('base64');

        const epodRes = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/epod-sign`, {
            recipientName: 'Carlos Mendoza (Warehouse Chief)',
            recipientDniVat: 'ES-47891234Z',
            signatureDataUrl: sampleSvgSignature,
            deliveredQuantity: 3000,
            damagedPackagesCount: 0,
            deliveryTimestamp: '2026-11-10T16:30:00.000Z',
            gpsCoords: { lat: 40.416775, lng: -3.703790 },
            receptionNotes: '3 EUR-pallets received intact, shrink-wrap sealed.'
        });

        expect(epodRes.status).toBe(200);
        expect(epodRes.body.ok).toBe(true);
        expect(epodRes.body.previousState).toBe('IN_TRANSIT');
        expect(epodRes.body.status).toBe('DELIVERED_PENDING_CONFIRMATION');
        expect(epodRes.body.disputeTriggered).toBe(false);
        expect(epodRes.body.epodRecord.signatureSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(epodRes.body.epodRecord.payloadSha256).toMatch(/^[a-f0-9]{64}$/);

        // 6. Escrow Settlement (`DELIVERED_PENDING_CONFIRMATION -> SETTLED_FUNDS_RELEASED`)
        // Printhouse base = 10,000 (manufacturing) + 500 (packaging) = 10,500 EUR
        // 4.0% platform take-rate = 420.00 EUR -> Net Printhouse Credit = 10,080.00 EUR
        const releaseRes = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/release-escrow`, {});

        expect(releaseRes.status).toBe(200);
        expect(releaseRes.body.ok).toBe(true);
        expect(releaseRes.body.previousState).toBe('DELIVERED_PENDING_CONFIRMATION');
        expect(releaseRes.body.status).toBe('SETTLED_FUNDS_RELEASED');
        expect(releaseRes.body.escrowStatus).toBe('SETTLED_FUNDS_RELEASED');
        expect(releaseRes.body.settlement.platformTakeRatePct).toBe(4.0);
        expect(releaseRes.body.settlement.printhouseGrossBaseEur).toBe(10500.00);
        expect(releaseRes.body.settlement.platformFeeEur).toBe(420.00);
        expect(releaseRes.body.settlement.netPrinthouseCreditEur).toBe(10080.00);
    });

    it('Test 2: Double-release protection — calling release-escrow twice returns ALREADY_SETTLED without duplicate credit', async () => {
        const orderId = 'ORD-ESCROW-IDEMPOTENT-002';

        // Fund -> Accept -> Pack & Dispatch -> ePOD Sign
        await postJson(baseUrl, `/api/marketplace/orders/${orderId}/escrow-hold`, {
            grossAmountEur: 5000.00,
            manufacturingAmountEur: 5000.00,
            packagingAmountEur: 0,
            freightAmountEur: 0,
            platformFeePct: 4.0
        });

        await postJson(baseUrl, `/api/marketplace/orders/${orderId}/state`, {
            targetState: 'ACCEPTED'
        });

        await postJson(baseUrl, `/api/marketplace/orders/${orderId}/pack-dispatch`, {
            carrierName: 'DHL Freight',
            palletTierCount: 1,
            grossWeightKg: 620.0
        });

        const signatureBase64 = 'data:image/png;base64,' + Buffer.from('PNG_SIGNATURE_BINARY_PAYLOAD_002').toString('base64');
        await postJson(baseUrl, `/api/marketplace/orders/${orderId}/epod-sign`, {
            recipientName: 'Elena Rostova',
            recipientDniVat: 'LV-900112233',
            signatureDataUrl: signatureBase64,
            deliveredQuantity: 1500,
            damagedPackagesCount: 0,
            deliveryTimestamp: '2026-11-10T17:00:00.000Z',
            gpsCoords: { lat: 56.9496, lng: 24.1052 }
        });

        // First release: succeeds and credits 4,800.00 EUR (5,000 - 4% fee of 200)
        const firstRelease = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/release-escrow`, {});

        expect(firstRelease.status).toBe(200);
        expect(firstRelease.body.ok).toBe(true);
        expect(firstRelease.body.status).toBe('SETTLED_FUNDS_RELEASED');
        expect(firstRelease.body.settlement.netPrinthouseCreditEur).toBe(4800.00);
        const originalTxRef = firstRelease.body.settlementTxRef;

        // Second release: idempotent guard returns ALREADY_SETTLED and prevents duplicate disbursement
        const secondRelease = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/release-escrow`, {});

        expect(secondRelease.body.ok).toBe(false);
        expect(secondRelease.body.code).toBe('ALREADY_SETTLED');
        expect(secondRelease.body.duplicateCreditPrevented).toBe(true);
        expect(secondRelease.body.settlementTxRef).toBe(originalTxRef);
        expect(secondRelease.body.netPrinthouseCreditEur).toBe(4800.00);
    });

    it('Test 3: Dispute freeze — flagging damagedPackagesCount > 0 diverts order to DISPUTED and halts automatic escrow release', async () => {
        const orderId = 'ORD-ESCROW-DISPUTED-003';

        await postJson(baseUrl, `/api/marketplace/orders/${orderId}/escrow-hold`, {
            grossAmountEur: 8400.00,
            manufacturingAmountEur: 8000.00,
            packagingAmountEur: 400.00,
            freightAmountEur: 0,
            platformFeePct: 4.0
        });

        await postJson(baseUrl, `/api/marketplace/orders/${orderId}/state`, {
            targetState: 'ACCEPTED'
        });

        await postJson(baseUrl, `/api/marketplace/orders/${orderId}/pack-dispatch`, {
            carrierName: 'DB Schenker',
            palletTierCount: 2,
            grossWeightKg: 910.0
        });

        // Capture ePOD with 4 damaged packages reported on arrival
        const signatureBase64 = 'data:image/svg+xml;base64,' + Buffer.from('<svg><text>Damaged Claim</text></svg>').toString('base64');
        const epodRes = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/epod-sign`, {
            recipientName: 'Markus Weber',
            recipientDniVat: 'DE-299104812',
            signatureDataUrl: signatureBase64,
            deliveredQuantity: 2000,
            damagedPackagesCount: 4,
            deliveryTimestamp: '2026-11-10T18:15:00.000Z',
            gpsCoords: { lat: 52.5200, lng: 13.4050 },
            receptionNotes: '4 boxes on top tier crushed by forklift Fork-B.'
        });

        expect(epodRes.status).toBe(200);
        expect(epodRes.body.ok).toBe(true);
        expect(epodRes.body.disputeTriggered).toBe(true);
        expect(epodRes.body.status).toBe('DISPUTED');
        expect(epodRes.body.escrowStatus).toBe('FROZEN_DISPUTED');
        expect(epodRes.body.epodRecord.damagedPackagesCount).toBe(4);

        // Attempt to trigger automatic escrow release while DISPUTED -> must fail with 409 ESCROW_FROZEN_BY_DISPUTE
        const releaseAttempt = await postJson(baseUrl, `/api/marketplace/orders/${orderId}/release-escrow`, {});

        expect(releaseAttempt.status).toBe(409);
        expect(releaseAttempt.body.ok).toBe(false);
        expect(releaseAttempt.body.code).toBe('ESCROW_FROZEN_BY_DISPUTE');
        expect(releaseAttempt.body.orderStatus).toBe('DISPUTED');
        expect(releaseAttempt.body.escrowStatus).toBe('FROZEN_DISPUTED');
    });
});
