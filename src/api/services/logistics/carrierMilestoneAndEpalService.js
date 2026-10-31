'use strict';

/**
 * src/api/services/logistics/carrierMilestoneAndEpalService.js
 *
 * PrintPrice OS — Phase 198D (LOGISTICS-06):
 * 1. Carrier Telematic Milestone Webhook Ingestion (`POST /api/logistics/carrier/milestones`):
 *    - Validates GS1-128 SSCC-18 (Modulo-10) for every scanned pallet.
 *    - Tracks milestone progression (`PICKED_UP`, `CROSS_DOCK_SCANNED`, `IN_TRANSIT`, `DELIVERED_POD`, `EPAL_EXCHANGED_AT_DOCK`, `EPAL_RETURNED`).
 *    - Enforces and evaluates the 2-hour POD SLA window (`timestamp` vs `unloadedAt`).
 *    - Updates shipment status to `DELIVERED` when all pallets reach `DELIVERED_POD` or shipment-level POD is confirmed.
 *
 * 2. Automated 14-Day Euro-Pallet EPAL (`Palettenschein`) Settlement Engine:
 *    - Tracks delivered Euro-pallets EPAL (1200x800 mm, UIC 435-2), immediate 1:1 dock exchanges, and subsequent physical returns.
 *    - Evaluates the 14-calendar-day exchange deadline (`epalExchangeDeadlineDays = 14`).
 *    - Automatically calculates and issues non-return settlement charges at `15.00 EUR / unit` (+ VAT) when overdue (`daysElapsed > 14` and `outstandingPallets > 0`).
 *    - Preserves strict tenant isolation (`tenantId`).
 */

const { validateSscc18 } = require('./ssccGeneratorService');
const { normalizeShipmentForDocuments } = require('./deliveryNotePdfService');
const { roundToPrecision } = require('../spine/spineCalculationEngine');

const EPAL_EXCHANGE_DEADLINE_DAYS = 14;
const EPAL_NON_RETURN_FEE_PER_PALLET_EUR = 15.00;
const DEFAULT_VAT_PERCENT = 19.0; // Standard DE USt / configurable per tenant

const VALID_CARRIER_MILESTONES = Object.freeze({
    PICKED_UP: 'PICKED_UP',
    CROSS_DOCK_SCANNED: 'CROSS_DOCK_SCANNED',
    IN_TRANSIT: 'IN_TRANSIT',
    ARRIVED_AT_DOCK: 'ARRIVED_AT_DOCK',
    DELIVERED_POD: 'DELIVERED_POD',
    EPAL_EXCHANGED_AT_DOCK: 'EPAL_EXCHANGED_AT_DOCK',
    EPAL_RETURNED: 'EPAL_RETURNED',
    EXCEPTION_DELAY: 'EXCEPTION_DELAY'
});

const SHIPMENT_LIFECYCLE_STATES = Object.freeze({
    DISPATCHED: 'DISPATCHED',
    IN_TRANSIT: 'IN_TRANSIT',
    DELIVERED: 'DELIVERED',
    EXCEPTION: 'EXCEPTION'
});

const EPAL_VOUCHER_STATES = Object.freeze({
    OPEN_WITHIN_WINDOW: 'OPEN_WITHIN_WINDOW',
    CLEARED_BY_EXCHANGE: 'CLEARED_BY_EXCHANGE',
    OVERDUE_PENDING_SETTLEMENT: 'OVERDUE_PENDING_SETTLEMENT',
    SETTLED_BILLED: 'SETTLED_BILLED'
});

// In-memory ledger for deterministic runtime & offline test execution (backed by optional DB persistence)
const shipmentLedgerStore = new Map();

function sanitizeSsccDigits(input) {
    if (!input) return '';
    let clean = String(input).trim();
    if (clean.startsWith('(00)')) {
        clean = clean.slice(4);
    }
    clean = clean.replace(/\D+/g, '');
    if (clean.length === 20 && clean.startsWith('00')) {
        clean = clean.slice(2);
    }
    return clean;
}

/**
 * Registers or retrieves a shipment record in the ledger for milestone & EPAL tracking.
 */
function ensureShipmentLedgerRecord(shipmentId, options = {}) {
    const id = String(shipmentId || options.shipmentId || 'SHP-2026-0001').trim();
    if (shipmentLedgerStore.has(id) && !options.forceReset) {
        const existing = shipmentLedgerStore.get(id);
        if (options.dispatchDate && !options.preserveDispatchDate) {
            existing.dispatchDate = options.dispatchDate;
        }
        return existing;
    }

    const normalized = normalizeShipmentForDocuments(id, options);
    const dispatchIso = options.dispatchTimestamp ||
        (options.dispatchDate ? `${options.dispatchDate}T08:00:00.000Z` : new Date().toISOString());

    const palletsBySscc = {};
    for (const p of normalized.pallets) {
        palletsBySscc[p.sscc.sscc18] = {
            palletIndex: p.palletIndex,
            palletTotal: p.palletTotal,
            sscc18: p.sscc.sscc18,
            hriFormatted: p.sscc.hriFormatted,
            status: SHIPMENT_LIFECYCLE_STATES.DISPATCHED,
            lastScannedAt: null,
            lastLocation: null,
            deliveredAt: null
        };
    }

    const totalEpalDelivered = Number(options.deliveredEpalPallets ?? normalized.totals.totalPalletsCount ?? 2);
    const exchangedAtDock = Number(options.exchangedAtDockPallets ?? 0);
    const returnedLater = Number(options.returnedLaterPallets ?? 0);

    const record = {
        shipmentId: id,
        tenantId: options.tenantId ? String(options.tenantId) : 'default-tenant',
        printhouseId: options.printhouseId ? String(options.printhouseId) : 'ph-default',
        carrierName: options.carrierName || normalized.orderMeta.carrierName || 'DACHSER',
        warehouseProfileCode: normalized.consignee.warehouseProfileCode,
        consigneeGln: normalized.consignee.gln,
        poNumber: normalized.orderMeta.poNumber,
        isbn: normalized.orderMeta.isbn,
        status: SHIPMENT_LIFECYCLE_STATES.DISPATCHED,
        dispatchTimestamp: dispatchIso,
        deliveredTimestamp: null,
        podConfirmed: false,
        podConfirmationChannel: null, // 'TELEMATIC_API' | 'DOCUMENTAL_PDF'
        podSlaCompliant: null,
        palletsBySscc,
        milestones: [],
        epalAccount: {
            voucherRef: `PAL-${id}`,
            deliveredEpalPallets: totalEpalDelivered,
            exchangedAtDockPallets: exchangedAtDock,
            returnedLaterPallets: returnedLater,
            outstandingEpalPallets: Math.max(0, totalEpalDelivered - exchangedAtDock - returnedLater),
            deadlineDays: EPAL_EXCHANGE_DEADLINE_DAYS,
            unitPenaltyEur: EPAL_NON_RETURN_FEE_PER_PALLET_EUR,
            vatPercent: Number(options.vatPercent ?? DEFAULT_VAT_PERCENT),
            voucherState:
                Math.max(0, totalEpalDelivered - exchangedAtDock - returnedLater) === 0
                    ? EPAL_VOUCHER_STATES.CLEARED_BY_EXCHANGE
                    : EPAL_VOUCHER_STATES.OPEN_WITHIN_WINDOW,
            settlementInvoice: null
        }
    };

    shipmentLedgerStore.set(id, record);
    return record;
}

/**
 * Ingests a carrier milestone event (`POST /api/logistics/carrier/milestones`).
 * Validates SSCC-18 Modulo-10, updates pallet/shipment statuses, records EPAL dock exchanges,
 * and checks 2-hour POD notification SLA.
 */
function ingestCarrierMilestone(payload = {}, authContext = {}) {
    const shipmentId = String(payload.shipmentId || payload.shipment_id || '').trim();
    if (!shipmentId) {
        const err = new Error('INVALID_MILESTONE_PAYLOAD: shipmentId is required.');
        err.statusCode = 400;
        throw err;
    }

    const milestoneType = String(payload.milestone || payload.eventType || payload.event_type || '').trim().toUpperCase();
    if (!VALID_CARRIER_MILESTONES[milestoneType]) {
        const err = new Error(
            `INVALID_MILESTONE_TYPE: Unsupported milestone '${milestoneType}'. Allowed: ${Object.keys(VALID_CARRIER_MILESTONES).join(', ')}`
        );
        err.statusCode = 400;
        throw err;
    }

    // Validate optional or required SSCC-18 code
    let cleanSscc = null;
    if (payload.sscc || payload.sscc18) {
        cleanSscc = sanitizeSsccDigits(payload.sscc || payload.sscc18);
        if (!validateSscc18(cleanSscc)) {
            const err = new Error(
                `INVALID_SSCC18_CHECKSUM: Provided SSCC '${payload.sscc || payload.sscc18}' failed GS1 Modulo-10 validation.`
            );
            err.statusCode = 400;
            throw err;
        }
    }

    const record = ensureShipmentLedgerRecord(shipmentId, {
        tenantId: payload.tenantId || authContext.tenantId,
        printhouseId: payload.printhouseId || authContext.printhouseId,
        carrierName: payload.carrierName,
        dispatchTimestamp: payload.dispatchTimestamp,
        deliveredEpalPallets: payload.deliveredEpalPallets
    });

    // Enforce tenant isolation
    if (
        authContext.tenantId &&
        record.tenantId &&
        record.tenantId !== 'default-tenant' &&
        String(authContext.tenantId) !== String(record.tenantId) &&
        String(authContext.role || '').toUpperCase() !== 'SUPER_ADMIN'
    ) {
        const err = new Error('FORBIDDEN_TENANT_MISMATCH: Cross-tenant milestone ingestion is prohibited.');
        err.statusCode = 403;
        throw err;
    }

    const eventTimestamp = payload.timestamp || new Date().toISOString();
    const gpsCoordinates = payload.gps || payload.coordinates || null;

    // Update pallet-level status if SSCC is provided
    if (cleanSscc) {
        if (!record.palletsBySscc[cleanSscc]) {
            const palletCount = Object.keys(record.palletsBySscc).length + 1;
            record.palletsBySscc[cleanSscc] = {
                palletIndex: palletCount,
                palletTotal: palletCount,
                sscc18: cleanSscc,
                hriFormatted: `(00) ${cleanSscc}`,
                status: SHIPMENT_LIFECYCLE_STATES.DISPATCHED,
                lastScannedAt: null,
                lastLocation: null,
                deliveredAt: null
            };
        }
        const palletEntry = record.palletsBySscc[cleanSscc];
        palletEntry.lastScannedAt = eventTimestamp;
        palletEntry.lastLocation = gpsCoordinates || payload.location || null;

        if (milestoneType === VALID_CARRIER_MILESTONES.DELIVERED_POD) {
            palletEntry.status = SHIPMENT_LIFECYCLE_STATES.DELIVERED;
            palletEntry.deliveredAt = eventTimestamp;
        } else if (
            milestoneType === VALID_CARRIER_MILESTONES.PICKED_UP ||
            milestoneType === VALID_CARRIER_MILESTONES.CROSS_DOCK_SCANNED ||
            milestoneType === VALID_CARRIER_MILESTONES.IN_TRANSIT ||
            milestoneType === VALID_CARRIER_MILESTONES.ARRIVED_AT_DOCK
        ) {
            if (palletEntry.status !== SHIPMENT_LIFECYCLE_STATES.DELIVERED) {
                palletEntry.status = SHIPMENT_LIFECYCLE_STATES.IN_TRANSIT;
            }
        }
    }

    // Handle EPAL exchange / return counts reported in milestone
    if (typeof payload.epalExchangedCount === 'number' && payload.epalExchangedCount >= 0) {
        record.epalAccount.exchangedAtDockPallets = Number(payload.epalExchangedCount);
    }
    if (typeof payload.epalReturnedCount === 'number' && payload.epalReturnedCount > 0) {
        record.epalAccount.returnedLaterPallets += Number(payload.epalReturnedCount);
    }

    // Recompute outstanding EPAL balance
    record.epalAccount.outstandingEpalPallets = Math.max(
        0,
        record.epalAccount.deliveredEpalPallets -
            record.epalAccount.exchangedAtDockPallets -
            record.epalAccount.returnedLaterPallets
    );
    if (record.epalAccount.outstandingEpalPallets === 0) {
        record.epalAccount.voucherState = EPAL_VOUCHER_STATES.CLEARED_BY_EXCHANGE;
    }

    // Handle shipment-level lifecycle & 2-hour POD SLA evaluation
    if (milestoneType === VALID_CARRIER_MILESTONES.DELIVERED_POD) {
        const allPallets = Object.values(record.palletsBySscc);
        const allDelivered =
            !cleanSscc ||
            Boolean(payload.closeAllPallets) ||
            allPallets.every(p => p.status === SHIPMENT_LIFECYCLE_STATES.DELIVERED);

        if (allDelivered) {
            record.status = SHIPMENT_LIFECYCLE_STATES.DELIVERED;
        } else {
            record.status = SHIPMENT_LIFECYCLE_STATES.IN_TRANSIT;
        }

        record.deliveredTimestamp = payload.unloadedAt || eventTimestamp;
        record.podConfirmed = true;
        record.podConfirmationChannel = payload.confirmationChannel || 'TELEMATIC_API';

        // Check 2-hour telematic notification SLA (PPOS-LOG-SLA-2026.1 Section 4.2)
        const unloadedMs = Date.parse(payload.unloadedAt || eventTimestamp);
        const reportedMs = Date.parse(eventTimestamp);
        const delayMinutes = Number.isFinite(unloadedMs) && Number.isFinite(reportedMs)
            ? Math.max(0, roundToPrecision((reportedMs - unloadedMs) / 60000, 1))
            : 0;
        record.podSlaCompliant = delayMinutes <= 120;
    } else if (milestoneType === VALID_CARRIER_MILESTONES.EXCEPTION_DELAY) {
        record.status = SHIPMENT_LIFECYCLE_STATES.EXCEPTION;
    } else if (record.status === SHIPMENT_LIFECYCLE_STATES.DISPATCHED) {
        record.status = SHIPMENT_LIFECYCLE_STATES.IN_TRANSIT;
    }

    const milestoneEntry = {
        milestoneId: `MLS-${record.milestones.length + 1}-${Date.now()}`,
        milestone: milestoneType,
        sscc18: cleanSscc,
        timestamp: eventTimestamp,
        gps: gpsCoordinates,
        receiverName: payload.receiverName || null,
        dockGate: payload.dockGate || null,
        epalExchangedCount: payload.epalExchangedCount ?? null,
        epalReturnedCount: payload.epalReturnedCount ?? null,
        notes: payload.notes || null
    };
    record.milestones.push(milestoneEntry);

    return {
        shipmentId: record.shipmentId,
        tenantId: record.tenantId,
        shipmentStatus: record.status,
        podConfirmed: record.podConfirmed,
        podConfirmationChannel: record.podConfirmationChannel,
        podSlaCompliant: record.podSlaCompliant,
        milestoneRecorded: milestoneEntry,
        epalAccount: { ...record.epalAccount }
    };
}

/**
 * Evaluates a single shipment's EPAL Palettenschein status against the 14-calendar-day window
 * and generates the automatic 15.00 EUR/unit (+ VAT) settlement charge if overdue.
 */
function evaluateShipmentEpalSettlement(record, evaluationDateIso = new Date().toISOString(), { autoSettle = true } = {}) {
    const referenceStartMs = Date.parse(record.dispatchTimestamp);
    const evalMs = Date.parse(evaluationDateIso);
    const daysElapsed = Number.isFinite(referenceStartMs) && Number.isFinite(evalMs)
        ? roundToPrecision((evalMs - referenceStartMs) / (1000 * 60 * 60 * 24), 2)
        : 0;

    const epal = record.epalAccount;
    const outstanding = Math.max(
        0,
        epal.deliveredEpalPallets - epal.exchangedAtDockPallets - epal.returnedLaterPallets
    );
    epal.outstandingEpalPallets = outstanding;

    if (outstanding === 0) {
        epal.voucherState = EPAL_VOUCHER_STATES.CLEARED_BY_EXCHANGE;
        return {
            shipmentId: record.shipmentId,
            voucherRef: epal.voucherRef,
            daysElapsed,
            deadlineDays: epal.deadlineDays,
            isOverdue: false,
            outstandingEpalPallets: 0,
            voucherState: epal.voucherState,
            settlementChargeNetEur: 0,
            settlementVatEur: 0,
            settlementTotalGrossEur: 0,
            settlementInvoice: null
        };
    }

    const isOverdue = daysElapsed > epal.deadlineDays;
    const netEur = roundToPrecision(outstanding * epal.unitPenaltyEur, 2);
    const vatEur = roundToPrecision(netEur * (epal.vatPercent / 100), 2);
    const grossEur = roundToPrecision(netEur + vatEur, 2);

    if (isOverdue) {
        if (autoSettle) {
            epal.voucherState = EPAL_VOUCHER_STATES.SETTLED_BILLED;
            if (!epal.settlementInvoice) {
                epal.settlementInvoice = {
                    settlementId: `EPAL-SETTLE-${record.shipmentId}`,
                    protocolRef: 'PPOS-LOG-SLA-2026.1',
                    shipmentId: record.shipmentId,
                    carrierName: record.carrierName,
                    evaluatedAt: evaluationDateIso,
                    daysElapsed,
                    unreturnedEpalPallets: outstanding,
                    unitFeeEur: epal.unitPenaltyEur,
                    netChargeEur: netEur,
                    vatPercent: epal.vatPercent,
                    vatAmountEur: vatEur,
                    totalGrossChargeEur: grossEur,
                    DeductionTarget: 'NEXT_CARRIER_FREIGHT_SETTLEMENT'
                };
            }
        } else {
            epal.voucherState = EPAL_VOUCHER_STATES.OVERDUE_PENDING_SETTLEMENT;
        }
    } else {
        epal.voucherState = EPAL_VOUCHER_STATES.OPEN_WITHIN_WINDOW;
    }

    return {
        shipmentId: record.shipmentId,
        tenantId: record.tenantId,
        carrierName: record.carrierName,
        voucherRef: epal.voucherRef,
        daysElapsed,
        deadlineDays: epal.deadlineDays,
        isOverdue,
        deliveredEpalPallets: epal.deliveredEpalPallets,
        exchangedAtDockPallets: epal.exchangedAtDockPallets,
        returnedLaterPallets: epal.returnedLaterPallets,
        outstandingEpalPallets: outstanding,
        unitPenaltyEur: epal.unitPenaltyEur,
        voucherState: epal.voucherState,
        settlementChargeNetEur: isOverdue ? netEur : 0,
        settlementVatEur: isOverdue ? vatEur : 0,
        settlementTotalGrossEur: isOverdue ? grossEur : 0,
        settlementInvoice: epal.settlementInvoice
    };
}

/**
 * Runs the periodic 14-day EPAL Palettenschein settlement sweep across shipments
 * (or across an explicitly provided `shipments` simulation batch).
 */
function runEpalSettlementSweep({
    evaluationDate = new Date().toISOString(),
    tenantId = null,
    autoSettle = true,
    shipments = null
} = {}) {
    if (Array.isArray(shipments) && shipments.length > 0) {
        for (const s of shipments) {
            ensureShipmentLedgerRecord(s.shipmentId, {
                ...s,
                tenantId: s.tenantId || tenantId || 'default-tenant',
                forceReset: true
            });
        }
    }

    const results = [];
    let totalOverdueShipments = 0;
    let totalUnreturnedPalletsBilled = 0;
    let totalNetBilledEur = 0;
    let totalGrossBilledEur = 0;

    for (const record of shipmentLedgerStore.values()) {
        if (tenantId && record.tenantId !== 'default-tenant' && String(record.tenantId) !== String(tenantId)) {
            continue;
        }
        const evalResult = evaluateShipmentEpalSettlement(record, evaluationDate, { autoSettle });
        results.push(evalResult);

        if (evalResult.isOverdue && evalResult.outstandingEpalPallets > 0) {
            totalOverdueShipments += 1;
            totalUnreturnedPalletsBilled += evalResult.outstandingEpalPallets;
            totalNetBilledEur = roundToPrecision(totalNetBilledEur + evalResult.settlementChargeNetEur, 2);
            totalGrossBilledEur = roundToPrecision(totalGrossBilledEur + evalResult.settlementTotalGrossEur, 2);
        }
    }

    return {
        protocolRef: 'PPOS-LOG-SLA-2026.1',
        evaluatedAt: evaluationDate,
        deadlineDays: EPAL_EXCHANGE_DEADLINE_DAYS,
        unitPenaltyEur: EPAL_NON_RETURN_FEE_PER_PALLET_EUR,
        summary: {
            evaluatedShipmentsCount: results.length,
            overdueShipmentsCount: totalOverdueShipments,
            totalUnreturnedPalletsBilled,
            totalNetBilledEur,
            totalGrossBilledEur
        },
        shipments: results
    };
}

function clearShipmentLedgerForTesting() {
    shipmentLedgerStore.clear();
}

module.exports = {
    EPAL_EXCHANGE_DEADLINE_DAYS,
    EPAL_NON_RETURN_FEE_PER_PALLET_EUR,
    VALID_CARRIER_MILESTONES,
    SHIPMENT_LIFECYCLE_STATES,
    EPAL_VOUCHER_STATES,
    ensureShipmentLedgerRecord,
    ingestCarrierMilestone,
    evaluateShipmentEpalSettlement,
    runEpalSettlementSweep,
    clearShipmentLedgerForTesting
};
