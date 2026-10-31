/**
 * src/api/services/marketplaceInvoicePaymentService.js
 *
 * Phase 37.1 — Invoice / Payment Execution from READY_FOR_INVOICE.
 *
 * ControlPlane is the sole source of truth for marketplace invoice/payment
 * governance. Budget App must not create invoice/payment locally for
 * CP-backed orders.
 *
 * Exports:
 *   generateMarketplaceInvoice(orderId, options)
 *   requestMarketplacePaymentLink(orderId, options)
 *   getMarketplaceInvoicePaymentStatus(orderId, options)
 *   markMarketplacePaymentConfirmed(orderId, payload, options)
 */

'use strict';

const mysqlClient = require('./mysqlClient');
const marketplaceOrderService = require('./marketplaceOrderService');
const { evaluateMarketplaceInvoiceGate } = require('./marketplaceInvoiceGateService');
const logger = require('./logger').child('marketplace-invoice-payment');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJson(value, fallback = {}) {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
}

/**
 * Generates a short invoice-number-safe random hex suffix.
 */
function randomHex(bytes = 3) {
    const crypto = require('crypto');
    return crypto.randomBytes(bytes).toString('hex').toUpperCase();
}

/**
 * Builds an invoice number of the form  PPOS-INV-YYYYMMDD-XXXXXX
 */
function buildInvoiceNumber() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');  // YYYYMMDD
    return `PPOS-INV-${date}-${randomHex(3)}`;
}

/**
 * Builds a bank-transfer payment reference of the form  PPOS-PAY-XXXXXXXX
 */
function buildPaymentReference() {
    return `PPOS-PAY-${randomHex(4)}`;
}

/**
 * Loads a marketplace order row + metadata from the DB.
 * Throws ORDER_NOT_FOUND if missing.
 */
async function loadOrderRow(orderId) {
    const rows = await mysqlClient.query(
        'SELECT * FROM marketplace_orders WHERE order_id = ?',
        [orderId]
    );
    if (!rows || rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
    }
    return rows[0];
}

/**
 * Persists updated metadata_json for an order without touching any other column.
 */
async function persistMetadata(orderId, metadata) {
    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), orderId]
    );
}

/**
 * Persists metadata_json and status atomically.
 */
async function persistMetadataAndStatus(orderId, metadata, status) {
    await mysqlClient.query(
        'UPDATE marketplace_orders SET metadata_json = ?, status = ?, updated_at = NOW() WHERE order_id = ?',
        [JSON.stringify(metadata), status, orderId]
    );
}

/**
 * Appends an order event (audit trail).
 */
async function appendEvent(orderId, type, payload = {}, actorId = 'SYSTEM') {
    try {
        await marketplaceOrderService.appendOrderEvent(orderId, {
            type,
            actorType: 'SYSTEM',
            actorId,
            payload
        });
    } catch (eventErr) {
        logger.warn({ event: 'EVENT_APPEND_FAILED', orderId, type, error: eventErr.message });
    }
}

/**
 * Resolves amount and currency from order row fields.
 * Tries estimated_price / selected_offer_json / metadata_json in order.
 */
function resolveAmountAndCurrency(orderRow) {
    // 1. Direct column
    if (orderRow.estimated_price && Number(orderRow.estimated_price) > 0) {
        const currency = orderRow.currency || 'EUR';
        return { amount: Number(orderRow.estimated_price), currency };
    }

    // 2. selected_offer_json
    const offer = safeParseJson(orderRow.selected_offer_json, {});
    const offerPrice = offer.total_price || offer.totalPrice || offer.price || offer.total_cost;
    if (offerPrice && Number(offerPrice) > 0) {
        const currency = offer.currency || orderRow.currency || 'EUR';
        return { amount: Number(offerPrice), currency };
    }

    // 3. metadata_json.pricing
    const meta = safeParseJson(orderRow.metadata_json, {});
    const pricing = meta.pricing || {};
    if (pricing.amount && Number(pricing.amount) > 0) {
        return { amount: Number(pricing.amount), currency: pricing.currency || orderRow.currency || 'EUR' };
    }

    // Fallback — amount unknown, caller must handle
    return { amount: null, currency: orderRow.currency || 'EUR' };
}

// ---------------------------------------------------------------------------
// Feature flag guard for mutating operations
// ---------------------------------------------------------------------------

function assertPaymentEnabled() {
    if (process.env.PPOS_ENABLE_PHASE37_PAYMENT !== 'true') {
        const err = new Error('PHASE37_PAYMENT_DISABLED');
        err.code = 'PHASE37_PAYMENT_DISABLED';
        err.statusCode = 403;
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * generateMarketplaceInvoice(orderId, options)
 *
 * 1. Evaluates invoice gate — if not ready, returns INVOICE_BLOCKED.
 * 2. If an active invoice already exists, returns it idempotently.
 * 3. Determines amount/currency from order data.
 * 4. Generates invoice_number (PPOS-INV-YYYYMMDD-XXXXXX).
 * 5. Persists metadata_json.invoice and sets status to INVOICED.
 * 6. Appends INVOICE_GENERATED audit event.
 *
 * @param {string} orderId
 * @param {object} options  { issuedBy }
 * @returns {Promise<object>}
 */
async function generateMarketplaceInvoice(orderId, options = {}) {
    assertPaymentEnabled();

    logger.info({ event: 'MARKETPLACE_INVOICE_GENERATE_START', orderId });

    // 1. Evaluate invoice gate
    const gateResult = await evaluateMarketplaceInvoiceGate(orderId, {
        evaluatedBy: options.issuedBy || options.operatorId || 'control-plane'
    });

    // 1.5 Phase 48: Strict Readiness Guard
    const progressionAssert = await marketplaceOrderService.assertOrderReadyForFinancialProgression(orderId, {
        action: 'generate_invoice',
        issuedBy: options.issuedBy || options.operatorId || 'control-plane'
    }, options);

    if (!gateResult.invoiceReady) {
        logger.warn({ event: 'MARKETPLACE_INVOICE_BLOCKED', orderId, decision: gateResult.decision, blockers: gateResult.blockers });
        return {
            ok: false,
            error: 'INVOICE_BLOCKED',
            orderId,
            decision: gateResult.decision,
            blockers: gateResult.blockers,
            recommendedAction: gateResult.recommendedAction
        };
    }

    // 2. Load order row (already updated by invoice gate)
    const orderRow = await loadOrderRow(orderId);
    const metadata = safeParseJson(orderRow.metadata_json, {});

    // 3. Idempotency — return existing non-cancelled invoice
    const existingInvoice = metadata.invoice;
    if (existingInvoice && existingInvoice.invoice_number && existingInvoice.status !== 'CANCELLED') {
        logger.info({ event: 'MARKETPLACE_INVOICE_IDEMPOTENT', orderId, invoice_number: existingInvoice.invoice_number });
        return {
            ok: true,
            idempotent: true,
            orderId,
            invoice: existingInvoice,
            payment: metadata.payment || null
        };
    }

    // 4. Resolve amount/currency
    const { amount, currency } = resolveAmountAndCurrency(orderRow);

    // 5. Build invoice record
    const issuedAt = new Date().toISOString();
    const issuedBy = options.issuedBy || options.operatorId || 'control-plane';
    const invoice_number = buildInvoiceNumber();

    const invoice = {
        phase: '37.1',
        invoice_number,
        status: 'ISSUED',
        amount,
        currency,
        issuedAt,
        issuedBy,
        source: 'CONTROL_PLANE',
        warnings: progressionAssert.warnings || [],
        humanReportGates: progressionAssert.humanReportGates || []
    };

    // 6. Persist
    const updatedMetadata = { ...metadata, invoice };
    await persistMetadataAndStatus(orderId, updatedMetadata, 'INVOICED');

    // 7. Audit
    await appendEvent(orderId, 'INVOICE_GENERATED', {
        invoice_number,
        amount,
        currency,
        issuedAt,
        issuedBy
    }, issuedBy);

    logger.info({ event: 'MARKETPLACE_INVOICE_GENERATED', orderId, invoice_number, amount, currency });

    return {
        ok: true,
        idempotent: false,
        orderId,
        invoice,
        payment: metadata.payment || null
    };
}

/**
 * requestMarketplacePaymentLink(orderId, options)
 *
 * Ensures an invoice exists (creating it if needed), then creates or
 * idempotently returns payment instructions.
 *
 * Provider resolution order:
 *   process.env.MARKETPLACE_PAYMENT_PROVIDER
 *   || process.env.PAYMENT_PROVIDER
 *   || 'bank_transfer'
 *
 * For Phase 37.1, 'bank_transfer' is the safe default.
 * If provider=stripe and Stripe env vars are missing, returns
 * PAYMENT_PROVIDER_NOT_CONFIGURED (no fake URL).
 *
 * @param {string} orderId
 * @param {object} options  { requestedBy }
 * @returns {Promise<object>}
 */
async function requestMarketplacePaymentLink(orderId, options = {}) {
    assertPaymentEnabled();

    logger.info({ event: 'MARKETPLACE_PAYMENT_LINK_REQUEST_START', orderId });

    // 0. Phase 48: Strict Readiness Guard
    const progressionAssert = await marketplaceOrderService.assertOrderReadyForFinancialProgression(orderId, {
        action: 'request_payment_link',
        requestedBy: options.requestedBy || options.operatorId || options.issuedBy || 'control-plane'
    }, options);

    // 1. Ensure invoice exists
    const invoiceResult = await generateMarketplaceInvoice(orderId, options);
    if (!invoiceResult.ok) {
        // Propagate INVOICE_BLOCKED
        return invoiceResult;
    }

    // 2. Reload order to get fresh metadata (invoice may have just been created)
    const orderRow = await loadOrderRow(orderId);
    const metadata = safeParseJson(orderRow.metadata_json, {});
    const invoice = metadata.invoice;

    // 3. Idempotency — return existing PAYMENT_PENDING payment
    const existingPayment = metadata.payment;
    if (existingPayment && existingPayment.status === 'PAYMENT_PENDING') {
        logger.info({ event: 'MARKETPLACE_PAYMENT_LINK_IDEMPOTENT', orderId, provider: existingPayment.provider });
        return {
            ok: true,
            idempotent: true,
            orderId,
            invoice,
            payment: existingPayment
        };
    }

    // 4. Resolve provider
    const provider = (
        process.env.MARKETPLACE_PAYMENT_PROVIDER ||
        process.env.PAYMENT_PROVIDER ||
        'bank_transfer'
    ).toLowerCase();

    const requestedAt = new Date().toISOString();
    const requestedBy = options.requestedBy || options.operatorId || options.issuedBy || 'control-plane';

    // 5. Build payment record by provider
    let payment;

    if (provider === 'stripe') {
        // Stripe env validation
        const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.MARKETPLACE_STRIPE_SECRET_KEY;
        if (!stripeKey) {
            logger.warn({ event: 'MARKETPLACE_PAYMENT_STRIPE_NOT_CONFIGURED', orderId });
            return {
                ok: false,
                error: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
                orderId,
                provider: 'stripe',
                message: 'Stripe integration is not configured. Set STRIPE_SECRET_KEY or MARKETPLACE_STRIPE_SECRET_KEY.'
            };
        }

        // Stripe session creation is reserved for Phase 37.2 (requires Budget webhook endpoint).
        // Return a clear stub rather than a fake URL.
        return {
            ok: false,
            error: 'STRIPE_INTEGRATION_PENDING',
            orderId,
            provider: 'stripe',
            message: 'Stripe checkout link generation is reserved for Phase 37.2. Use bank_transfer for Phase 37.1.',
            phase: '37.1'
        };
    }

    // Default: bank_transfer
    const reference = buildPaymentReference();
    payment = {
        phase: '37.1',
        provider: 'bank_transfer',
        status: 'PAYMENT_PENDING',
        amount: invoice.amount,
        currency: invoice.currency,
        reference,
        instructions: {
            iban: process.env.MARKETPLACE_BANK_IBAN || null,
            bic: process.env.MARKETPLACE_BANK_BIC || null,
            beneficiary: process.env.MARKETPLACE_BANK_BENEFICIARY || 'PrintPrice Pro',
            reference
        },
        requestedAt,
        requestedBy,
        warnings: progressionAssert.warnings || [],
        humanReportGates: progressionAssert.humanReportGates || []
    };

    // 6. Persist
    const updatedMetadata = { ...metadata, payment };
    await persistMetadata(orderId, updatedMetadata);

    // 7. Audit
    await appendEvent(orderId, 'PAYMENT_INSTRUCTIONS_CREATED', {
        provider: 'bank_transfer',
        reference,
        amount: invoice.amount,
        currency: invoice.currency,
        requestedAt,
        requestedBy
    }, requestedBy);

    logger.info({ event: 'MARKETPLACE_PAYMENT_INSTRUCTIONS_CREATED', orderId, reference, provider: 'bank_transfer' });

    return {
        ok: true,
        idempotent: false,
        orderId,
        invoice,
        payment
    };
}

/**
 * getMarketplaceInvoicePaymentStatus(orderId, options)
 *
 * Returns a sanitized view of the current invoice + payment state.
 * Does not expose internal metadata, secrets, raw provider payloads, or admin tokens.
 *
 * Does NOT require PPOS_ENABLE_PHASE37_PAYMENT — read access is always open.
 *
 * @param {string} orderId
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMarketplaceInvoicePaymentStatus(orderId, options = {}) {
    logger.info({ event: 'MARKETPLACE_INVOICE_STATUS_REQUEST', orderId });

    const orderRow = await loadOrderRow(orderId);
    const metadata = safeParseJson(orderRow.metadata_json, {});
    const readiness = safeParseJson(orderRow.readiness_json, {});

    const invoice = metadata.invoice || null;
    const rawPayment = metadata.payment || null;
    const invoiceGate = metadata.invoice_gate || null;

    // Sanitize payment — strip internal requestedBy if bank instructions are present
    let payment = null;
    if (rawPayment) {
        payment = {
            provider: rawPayment.provider,
            status: rawPayment.status,
            amount: rawPayment.amount,
            currency: rawPayment.currency,
            reference: rawPayment.reference || null,
            paidAt: rawPayment.paidAt || null,
            confirmedAt: rawPayment.confirmedAt || null,
            providerReference: rawPayment.providerReference || null,
            requestedAt: rawPayment.requestedAt || null,
            // bank_transfer instructions — IBAN/BIC are needed by the customer
            instructions: rawPayment.instructions
                ? {
                    iban: rawPayment.instructions.iban || null,
                    bic: rawPayment.instructions.bic || null,
                    beneficiary: rawPayment.instructions.beneficiary || null,
                    reference: rawPayment.instructions.reference || null
                }
                : null
        };
    }

    return {
        ok: true,
        orderId,
        orderStatus: orderRow.status,
        invoiceReady: invoiceGate ? invoiceGate.invoiceReady : null,
        blockers: invoiceGate ? invoiceGate.blockers : [],
        readiness: {
            ready: readiness.ready || false,
            statusSuggestion: readiness.statusSuggestion || null,
            invoiceGateDecision: readiness.invoiceGateDecision || null,
            invoiceGateBlockers: readiness.invoiceGateBlockers || []
        },
        invoice,
        payment
    };
}

/**
 * markMarketplacePaymentConfirmed(orderId, payload, options)
 *
 * Manual/admin confirmation of bank transfer payment.
 * Requires an existing invoice and payment in PAYMENT_PENDING state.
 *
 * Sets:
 *   payment.status = 'PAYMENT_CONFIRMED'
 *   payment.paidAt
 *   payment.confirmedBy
 *   payment.providerReference (optional, e.g. bank transfer confirmation number)
 *
 * Sets order status to PAYMENT_CONFIRMED.
 * Does NOT dispatch production — that is Phase 38.
 *
 * @param {string} orderId
 * @param {object} payload  { providerReference, confirmedBy }
 * @param {object} options  { operatorId }
 * @returns {Promise<object>}
 */
async function markMarketplacePaymentConfirmed(orderId, payload = {}, options = {}) {
    assertPaymentEnabled();

    logger.info({ event: 'MARKETPLACE_PAYMENT_CONFIRM_START', orderId });

    // 0. Phase 48: Strict Readiness Guard
    const progressionAssert = await marketplaceOrderService.assertOrderReadyForFinancialProgression(orderId, {
        action: 'confirm_payment',
        confirmedBy: payload.confirmedBy || options.operatorId || options.issuedBy || 'control-plane'
    }, options);

    const orderRow = await loadOrderRow(orderId);
    const metadata = safeParseJson(orderRow.metadata_json, {});

    // Guard: invoice must exist
    const invoice = metadata.invoice;
    if (!invoice || !invoice.invoice_number) {
        return {
            ok: false,
            error: 'NO_INVOICE',
            orderId,
            message: 'Cannot confirm payment: no invoice has been generated for this order.'
        };
    }

    // Guard: payment must exist and be in PAYMENT_PENDING
    const payment = metadata.payment;
    if (!payment) {
        return {
            ok: false,
            error: 'NO_PAYMENT_RECORD',
            orderId,
            message: 'Cannot confirm payment: no payment record exists. Call /payment/request-link first.'
        };
    }

    if (payment.status === 'PAYMENT_CONFIRMED') {
        // Idempotent — already confirmed
        logger.info({ event: 'MARKETPLACE_PAYMENT_ALREADY_CONFIRMED', orderId });
        return {
            ok: true,
            idempotent: true,
            orderId,
            invoice,
            payment
        };
    }

    if (payment.status !== 'PAYMENT_PENDING') {
        return {
            ok: false,
            error: 'INVALID_PAYMENT_STATUS',
            orderId,
            currentStatus: payment.status,
            message: `Cannot confirm payment in status '${payment.status}'. Expected PAYMENT_PENDING.`
        };
    }

    // Build updated payment record
    const confirmedAt = new Date().toISOString();
    const confirmedBy = payload.confirmedBy || options.operatorId || options.issuedBy || 'control-plane';
    const providerReference = payload.providerReference || null;

    const updatedPayment = {
        ...payment,
        status: 'PAYMENT_CONFIRMED',
        paidAt: confirmedAt,
        confirmedAt,
        confirmedBy,
        providerReference,
        warnings: progressionAssert.warnings || [],
        humanReportGates: progressionAssert.humanReportGates || []
    };

    // Persist metadata + order status PAYMENT_CONFIRMED
    const updatedMetadata = { ...metadata, payment: updatedPayment };
    await persistMetadataAndStatus(orderId, updatedMetadata, 'PAYMENT_CONFIRMED');

    // Audit
    await appendEvent(orderId, 'PAYMENT_CONFIRMED', {
        invoice_number: invoice.invoice_number,
        amount: invoice.amount,
        currency: invoice.currency,
        provider: payment.provider,
        providerReference,
        confirmedAt,
        confirmedBy
    }, confirmedBy);

    logger.info({ event: 'MARKETPLACE_PAYMENT_CONFIRMED', orderId, invoice_number: invoice.invoice_number, confirmedBy });

    return {
        ok: true,
        idempotent: false,
        orderId,
        invoice,
        payment: updatedPayment
    };
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
    generateMarketplaceInvoice,
    requestMarketplacePaymentLink,
    getMarketplaceInvoicePaymentStatus,
    markMarketplacePaymentConfirmed
};
