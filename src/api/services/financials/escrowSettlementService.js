'use strict';

/**
 * src/api/services/financials/escrowSettlementService.js
 *
 * PrintPrice OS — Phase 12A: Commercial Escrow & Split-Payout Settlement Engine
 *
 * Responsibilities:
 * 1. Connects PHASE-11C ("APPROVE FOR PRESS") with commercial Escrow fund locking
 *    (`FUNDS_LOCKED_ON_PROOF_APPROVAL` -> `IN_MANUFACTURING_HOLD`).
 * 2. Strictly preserves the PrintPriceOS invariant:
 *    Manufacturing (Printhouse) != Packaging (EPAL/FEFCO) != Freight (Carrier) != Platform Fee.
 * 3. Executes automated Split-Payout release upon receiving signed Proof of Delivery
 *    (`POD_RECEIVED` from LOGISTICS-06/07), automatically deducting unreturned EPAL
 *    Euro-pallet penalties (€15.00 / pallet after 14 calendar days) or damage claims.
 */

const crypto = require('crypto');

const ESCROW_STATES = Object.freeze({
    FUNDS_LOCKED_ON_PROOF_APPROVAL: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
    IN_MANUFACTURING_HOLD: 'IN_MANUFACTURING_HOLD',
    RELEASED_ON_SIGNED_POD: 'RELEASED_ON_SIGNED_POD',
    DISPUTED_OR_PARTIAL_HOLD: 'DISPUTED_OR_PARTIAL_HOLD'
});

const EPAL_PENALTY_EUR_PER_PALLET = 15.0;

const escrowLedgerStore = new Map();

function roundCurrency(val) {
    return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function buildSeededEscrowEntries(tenantId = 'tenant-default') {
    return [
        {
            escrowId: 'ESC-2026-901',
            tenantId,
            orderId: 'PUB-ORD-2026-101',
            isbn: '978-3-8365-9102-7',
            title: 'Atlas de Arquitectura Industrial Europea',
            publisherTenantId: 'tenant-publisher-penguin',
            printhouseId: 'ph-eurograf-b1',
            carrierCode: 'DACHSER_DE',
            grossEscrowEur: 24850.0,
            manufacturingShareEur: 21400.0,
            packagingShareEur: 620.0,
            freightShareEur: 1587.5,
            platformFeeEur: 1242.5,
            epalUnreturnedPallets: 0,
            epalDeductionEur: 0.0,
            claimDeductionEur: 0.0,
            netPrinthousePayoutEur: 22020.0,
            netCarrierPayoutEur: 1587.5,
            status: ESCROW_STATES.FUNDS_LOCKED_ON_PROOF_APPROVAL,
            proofSignatureHash: 'SHA256:9f84b2c1e77d08a4c5e3109f8a71b2d4',
            shipmentId: 'SHP-2026-9901',
            sscc18: '003401234500000018',
            podSignedAt: null,
            settledAt: null,
            updatedAt: '2026-10-30T10:15:00.000Z'
        },
        {
            escrowId: 'ESC-2026-902',
            tenantId,
            orderId: 'PUB-ORD-2026-102',
            isbn: '978-84-9066-801-6',
            title: 'Crónicas del Diseño Tipográfico Suizo',
            publisherTenantId: 'tenant-publisher-penguin',
            printhouseId: 'ph-eurograf-b1',
            carrierCode: 'DB_SCHENKER',
            grossEscrowEur: 16200.0,
            manufacturingShareEur: 13850.0,
            packagingShareEur: 440.0,
            freightShareEur: 1100.0,
            platformFeeEur: 810.0,
            epalUnreturnedPallets: 0,
            epalDeductionEur: 0.0,
            claimDeductionEur: 0.0,
            netPrinthousePayoutEur: 14290.0,
            netCarrierPayoutEur: 1100.0,
            status: ESCROW_STATES.IN_MANUFACTURING_HOLD,
            proofSignatureHash: 'SHA256:7d11e4a9b2038c55f1209a8b3c441e90',
            shipmentId: 'SHP-2026-9902',
            sscc18: '003401234500000025',
            podSignedAt: null,
            settledAt: null,
            updatedAt: '2026-10-30T16:40:00.000Z'
        },
        {
            escrowId: 'ESC-2026-903',
            tenantId,
            orderId: 'PUB-ORD-2026-103',
            isbn: '978-3-9573-0412-9',
            title: 'Catálogo Técnico Feria del Libro de Frankfurt 2026',
            publisherTenantId: 'tenant-publisher-penguin',
            printhouseId: 'ph-komori-dach',
            carrierCode: 'DACHSER_DE',
            grossEscrowEur: 4900.0,
            manufacturingShareEur: 3980.0,
            packagingShareEur: 175.0,
            freightShareEur: 500.0,
            platformFeeEur: 245.0,
            epalUnreturnedPallets: 2,
            epalDeductionEur: 30.0,
            claimDeductionEur: 0.0,
            netPrinthousePayoutEur: 4185.0,
            netCarrierPayoutEur: 470.0,
            status: ESCROW_STATES.RELEASED_ON_SIGNED_POD,
            proofSignatureHash: 'SHA256:3c91a0f8e1124b77d2019c4b551a890e',
            shipmentId: 'SHP-2026-9880',
            sscc18: '003401234500000032',
            podSignedAt: '2026-10-30T11:20:00.000Z',
            settledAt: '2026-10-30T11:20:05.000Z',
            updatedAt: '2026-10-30T11:20:05.000Z'
        }
    ];
}

function ensureEscrowTenantSeeded(tenantId = 'tenant-default') {
    let hasEntries = false;
    for (const key of escrowLedgerStore.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
            hasEntries = true;
            break;
        }
    }
    if (!hasEntries) {
        for (const item of buildSeededEscrowEntries(tenantId)) {
            escrowLedgerStore.set(`${tenantId}:${item.orderId}`, item);
        }
    }
}

/**
 * Locks commercial funds in Escrow upon 3D Soft-Proof approval (`POST /api/financials/escrow/lock`)
 * Strictly segregates Manufacturing, Packaging, Freight, and Platform Fee.
 */
function lockEscrowFundsOnProofApproval(payload = {}, actorContext = {}) {
    const tenantId = actorContext.tenantId || payload.tenantId || 'tenant-default';
    ensureEscrowTenantSeeded(tenantId);

    const orderId =
        payload.orderId || `PUB-ORD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const grossEscrowEur = roundCurrency(payload.grossEscrowEur || 12500.0);

    if (grossEscrowEur <= 0) {
        const err = new Error('INVALID_ESCROW_AMOUNT: grossEscrowEur must be greater than 0.');
        err.statusCode = 400;
        throw err;
    }

    const platformFeePct = Number(payload.platformFeePct ?? 5.0);
    const platformFeeEur = roundCurrency(grossEscrowEur * (platformFeePct / 100));
    const packagingShareEur = roundCurrency(payload.packagingShareEur ?? grossEscrowEur * 0.03);
    const freightShareEur = roundCurrency(payload.freightShareEur ?? grossEscrowEur * 0.07);
    const manufacturingShareEur = roundCurrency(
        grossEscrowEur - platformFeeEur - packagingShareEur - freightShareEur
    );

    const record = {
        escrowId: payload.escrowId || `ESC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        tenantId,
        orderId,
        isbn: payload.isbn || '978-84-9066-801-6',
        title: payload.title || `Editorial Edition ${orderId}`,
        publisherTenantId: payload.publisherTenantId || 'tenant-publisher-penguin',
        printhouseId: payload.printhouseId || 'ph-eurograf-b1',
        carrierCode: payload.carrierCode || 'DACHSER_DE',
        grossEscrowEur,
        manufacturingShareEur,
        packagingShareEur,
        freightShareEur,
        platformFeeEur,
        epalUnreturnedPallets: 0,
        epalDeductionEur: 0.0,
        claimDeductionEur: 0.0,
        netPrinthousePayoutEur: roundCurrency(manufacturingShareEur + packagingShareEur),
        netCarrierPayoutEur: freightShareEur,
        status: ESCROW_STATES.FUNDS_LOCKED_ON_PROOF_APPROVAL,
        proofSignatureHash:
            payload.proofSignatureHash ||
            `SHA256:${crypto.createHash('sha256').update(orderId).digest('hex').slice(0, 32)}`,
        shipmentId: payload.shipmentId || `SHP-${orderId}`,
        sscc18: payload.sscc18 || '003401234500000018',
        podSignedAt: null,
        settledAt: null,
        updatedAt: new Date().toISOString()
    };

    escrowLedgerStore.set(`${tenantId}:${orderId}`, record);
    return {
        ok: true,
        escrow: record
    };
}

/**
 * Releases Escrow via Split-Payout upon signed Proof of Delivery (`POST /api/financials/escrow/:orderId/settle-on-pod`)
 * Applies automatic €15.00/pallet deduction on carrier freight payout if EPAL Euro-pallets are overdue (>14 days)
 * and credits the EPAL compensation to the printhouse/shipper.
 */
function settleEscrowOnSignedPod(payload = {}, actorContext = {}) {
    const tenantId = actorContext.tenantId || payload.tenantId || 'tenant-default';
    ensureEscrowTenantSeeded(tenantId);

    const orderId = payload.orderId;
    if (!orderId) {
        const err = new Error('MISSING_ORDER_ID: orderId is required to settle escrow on POD.');
        err.statusCode = 400;
        throw err;
    }

    const key = `${tenantId}:${orderId}`;
    const record = escrowLedgerStore.get(key);
    if (!record) {
        const err = new Error(
            `ESCROW_NOT_FOUND: No escrow record found for order '${orderId}' in tenant '${tenantId}'.`
        );
        err.statusCode = 404;
        throw err;
    }

    const epalUnreturnedPallets = Math.max(0, Number(payload.epalUnreturnedPallets || 0));
    const claimDeductionEur = roundCurrency(Math.max(0, Number(payload.claimDeductionEur || 0)));
    const epalDeductionEur = roundCurrency(
        epalUnreturnedPallets * EPAL_PENALTY_EUR_PER_PALLET
    );

    // Carrier freight payout is reduced by unreturned EPAL pallet penalties (€15/unit)
    const netCarrierPayoutEur = roundCurrency(
        Math.max(0, record.freightShareEur - epalDeductionEur)
    );

    // Printhouse receives manufacturing + packaging + EPAL compensation minus any quality claim deduction
    const netPrinthousePayoutEur = roundCurrency(
        Math.max(
            0,
            record.manufacturingShareEur +
                record.packagingShareEur +
                epalDeductionEur -
                claimDeductionEur
        )
    );

    const nowIso = new Date().toISOString();
    record.epalUnreturnedPallets = epalUnreturnedPallets;
    record.epalDeductionEur = epalDeductionEur;
    record.claimDeductionEur = claimDeductionEur;
    record.netCarrierPayoutEur = netCarrierPayoutEur;
    record.netPrinthousePayoutEur = netPrinthousePayoutEur;
    record.status =
        claimDeductionEur > 0
            ? ESCROW_STATES.DISPUTED_OR_PARTIAL_HOLD
            : ESCROW_STATES.RELEASED_ON_SIGNED_POD;
    record.podSignedAt = payload.podSignedAt || nowIso;
    record.settledAt = nowIso;
    record.updatedAt = nowIso;

    escrowLedgerStore.set(key, record);

    return {
        ok: true,
        orderId: record.orderId,
        escrowId: record.escrowId,
        status: record.status,
        splitPayoutBreakdown: {
            grossEscrowEur: record.grossEscrowEur,
            manufacturingShareEur: record.manufacturingShareEur,
            packagingShareEur: record.packagingShareEur,
            freightShareEur: record.freightShareEur,
            platformFeeEur: record.platformFeeEur,
            epalUnreturnedPallets,
            epalPenaltyRateEur: EPAL_PENALTY_EUR_PER_PALLET,
            epalDeductionEur,
            claimDeductionEur,
            netPrinthousePayoutEur,
            netCarrierPayoutEur
        },
        escrow: record
    };
}

/**
 * Lists all Escrow ledger records and summary KPIs for a tenant (`GET /api/financials/escrow/ledger`)
 */
function listEscrowLedger(tenantId = 'tenant-default') {
    ensureEscrowTenantSeeded(tenantId);

    const entries = [];
    for (const [key, value] of escrowLedgerStore.entries()) {
        if (key.startsWith(`${tenantId}:`)) {
            entries.push(value);
        }
    }

    const escrowLockedEur = roundCurrency(
        entries
            .filter(e => e.status !== ESCROW_STATES.RELEASED_ON_SIGNED_POD)
            .reduce((acc, e) => acc + e.grossEscrowEur, 0)
    );

    const pendingPodCount = entries.filter(
        e => e.status !== ESCROW_STATES.RELEASED_ON_SIGNED_POD
    ).length;

    const releasedToPrinthousesEur = roundCurrency(
        entries
            .filter(e => e.status === ESCROW_STATES.RELEASED_ON_SIGNED_POD)
            .reduce((acc, e) => acc + e.netPrinthousePayoutEur, 0)
    );

    const totalEpalAndClaimDeductionsEur = roundCurrency(
        entries.reduce((acc, e) => acc + e.epalDeductionEur + e.claimDeductionEur, 0)
    );

    return {
        ok: true,
        tenantId,
        summaryKpis: {
            escrowLockedEur,
            pendingPodCount,
            releasedToPrinthousesEur,
            totalEpalAndClaimDeductionsEur
        },
        entries
    };
}

module.exports = {
    ESCROW_STATES,
    EPAL_PENALTY_EUR_PER_PALLET,
    lockEscrowFundsOnProofApproval,
    settleEscrowOnSignedPod,
    listEscrowLedger
};

