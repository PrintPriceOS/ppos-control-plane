const db = require('./mysqlClient');
const crypto = require('crypto');
const paymentGateway = require('./paymentGatewayService');
const logger = require('./logger').child('invoice-service');

/**
 * Invoice Service
 * Manages the generation and issuance of customer and printer invoices.
 */
class InvoiceService {
    /**
     * Generates a customer invoice for a transaction.
     */
    async generateCustomerInvoice(transactionId) {
        const { rows: [tx] } = await db.query('SELECT * FROM financial_transactions WHERE id = ?', [transactionId]);
        if (!tx) throw new Error('Transaction not found');

        const invoiceId = crypto.randomUUID();
        const invoiceNumber = `INV-C-${tx.transaction_reference.split('-').slice(1).join('-')}`;

        await db.query(`
            INSERT INTO invoices (id, transaction_id, invoice_number, invoice_type, currency, amount, invoice_status)
            VALUES (?, ?, ?, 'CUSTOMER', ?, ?, 'ISSUED')
        `, [invoiceId, transactionId, invoiceNumber, tx.currency, tx.gross_amount]);

        return invoiceId;
    }

    /**
     * Generates a printer payout invoice for a transaction.
     */
    async generatePrinterInvoice(transactionId) {
        const { rows: [tx] } = await db.query('SELECT * FROM financial_transactions WHERE id = ?', [transactionId]);
        if (!tx) throw new Error('Transaction not found');

        const invoiceId = crypto.randomUUID();
        const invoiceNumber = `INV-P-${tx.transaction_reference.split('-').slice(1).join('-')}`;

        await db.query(`
            INSERT INTO invoices (id, transaction_id, invoice_number, invoice_type, currency, amount, invoice_status)
            VALUES (?, ?, ?, 'PRINTER', ?, ?, 'ISSUED')
        `, [invoiceId, transactionId, invoiceNumber, tx.currency, tx.printer_payout]);

        return invoiceId;
    }

    async getInvoices(transactionId) {
        const { rows } = await db.query('SELECT * FROM invoices WHERE transaction_id = ?', [transactionId]);
        return rows;
    }

    /**
     * Generate a customer invoice linked to a Hardened Order (v5.3).
     * Only allowed after production files are validated.
     */
    async generateOrderInvoice(orderRef) {
        logger.info({ event: 'generate_order_invoice', order_ref: orderRef });

        // 1. Fetch Order Context
        const { rows: [order] } = await db.query('SELECT * FROM orders WHERE order_ref = ?', [orderRef]);
        if (!order) throw new Error('ORDER_NOT_FOUND');

        // 2. State Validation (Strict Gating)
        const allowedStatuses = ['FILES_VALIDATED', 'INVOICE_PENDING'];
        if (!allowedStatuses.includes(order.status)) {
            throw new Error(`INVOICE_BLOCKED: Order status is ${order.status}. Validation required first.`);
        }

        // 3. Extract Pricing and Offer Data
        let pricing = {};
        try {
            const metadata = JSON.parse(order.metadata_json || '{}');
            pricing = metadata.pricing || {};
        } catch (e) {}

        const amount = order.offer_price || pricing.bpe_price || 0;
        if (amount <= 0) throw new Error('INVALID_AMOUNT: Order pricing missing or zero');

        // 4. Initialize Payment Session
        const invoiceId = crypto.randomUUID();
        const paymentSession = await paymentGateway.initializePaymentSession(order, invoiceId);

        // 5. Create Forensic Invoice Record
        const invoiceNumber = `INV-${orderRef}-${Date.now().toString().slice(-4)}`;
        await db.query(`
            INSERT INTO invoices (
                id, order_ref, customer_id, printhouse_id, invoice_number, 
                currency, amount, status, gateway_provider, gateway_session_id, payment_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, ?, ?)
        `, [
            invoiceId, orderRef, order.user_id, order.offer_print_house, invoiceNumber,
            paymentSession.currency || 'EUR', amount, paymentSession.provider,
            paymentSession.session_id || null, paymentSession.payment_url || null
        ]);

        // 6. Update Order Promotion Metadata
        let invoicePayment = {};
        try {
            invoicePayment = JSON.parse(order.invoice_payment || '{}');
        } catch (e) {}

        invoicePayment.invoice_status = 'GENERATED';
        invoicePayment.payment_status = 'PENDING';
        invoicePayment.invoice_id = invoiceId;
        invoicePayment.invoice_number = invoiceNumber;
        invoicePayment.gateway_provider = paymentSession.provider;
        invoicePayment.payment_url = paymentSession.payment_url || null;
        invoicePayment.payment_instructions = paymentSession.instructions || null;

        await db.query(`
            UPDATE orders 
            SET status = 'PAYMENT_PENDING',
                invoice_payment = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [JSON.stringify(invoicePayment), order.id]);

        // 7. Forensic Event
        await db.query(`
            INSERT INTO marketplace_events (id, order_id, order_ref, event_type, metadata_json)
            VALUES (?, ?, ?, 'INVOICE_GENERATED', ?)
        `, [crypto.randomUUID(), order.id, orderRef, JSON.stringify({ 
            invoice_id: invoiceId, 
            number: invoiceNumber, 
            provider: paymentSession.provider 
        })]);

        return {
            invoice_id: invoiceId,
            invoice_number: invoiceNumber,
            payment_url: paymentSession.payment_url,
            provider: paymentSession.provider,
            status: 'PAYMENT_PENDING'
        };
    }
}

module.exports = new InvoiceService();
