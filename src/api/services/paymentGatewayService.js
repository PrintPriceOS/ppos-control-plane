/**
 * src/api/services/paymentGatewayService.js
 * 
 * Industrial Payment Orchestrator.
 * Handles Stripe connected accounts, bank transfers, and manual payment fallbacks.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('payment-gateway');

class PaymentGatewayService {
    /**
     * Get payment settings for a specific printhouse.
     */
    async getSettings(printhouseId) {
        const rows = await db.query('SELECT * FROM printhouse_payment_settings WHERE printhouse_id = ?', [printhouseId]);
        return rows[0] || { provider: 'MANUAL', enabled: true };
    }

    /**
     * Initialize a payment session based on printhouse settings.
     */
    async initializePaymentSession(order, invoiceId) {
        const settings = await this.getSettings(order.offer_print_house);
        
        if (!settings.enabled) {
            logger.warn({ event: 'payment_disabled', printhouse_id: order.offer_print_house });
            return { provider: 'MANUAL', instructions: 'Payment currently disabled for this printhouse.' };
        }

        switch (settings.provider) {
            case 'STRIPE':
                return await this.createStripeSession(order, invoiceId, settings);
            case 'BANK_TRANSFER':
                return { 
                    provider: 'BANK_TRANSFER', 
                    instructions: settings.bank_instructions || 'Please contact the printhouse for bank details.',
                    currency: settings.currency || 'EUR'
                };
            case 'MANUAL':
            default:
                return { 
                    provider: 'MANUAL', 
                    instructions: 'Manual payment coordination required. The printhouse will contact you.' 
                };
        }
    }

    /**
     * Create a Stripe Checkout Session (Simulation/Structure).
     */
    async createStripeSession(order, invoiceId, settings) {
        if (!settings.stripe_account_id) {
            logger.error({ event: 'stripe_config_missing', printhouse_id: order.offer_print_house });
            return { provider: 'MANUAL', instructions: 'Stripe configuration missing. Reverting to manual.' };
        }

        // Industrial: In a real environment, we would call the Stripe API here.
        // We simulate the URL generation with the required metadata.
        const checkoutUrl = `https://checkout.printprice.pro/pay/${invoiceId}?account=${settings.stripe_account_id}`;
        
        logger.info({ event: 'stripe_session_created', order_ref: order.order_ref, invoice_id: invoiceId });
        
        return {
            provider: 'STRIPE',
            payment_url: checkoutUrl,
            session_id: `cs_test_${require('crypto').randomUUID().slice(0, 16)}`,
            account_id: settings.stripe_account_id
        };
    }
}

module.exports = new PaymentGatewayService();
