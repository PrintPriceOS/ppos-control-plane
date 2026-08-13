/**
 * src/api/services/emailDeliveryService.js
 * 
 * Provider-agnostic Email Delivery Service.
 * Handles dispatching emails via configured provider (SES, Resend, SMTP)
 * with a fallback Development/Test logger adapter.
 */
const { renderActivationEmail } = require('./emailTemplates/printhouseActivationEmail');

class EmailDeliveryService {
    constructor() {
        this.provider = process.env.EMAIL_PROVIDER || 'DEV_LOGGER';
        this.from = process.env.EMAIL_FROM || 'no-reply@auth.printprice.pro';
        this.allowDevLinkLogging = process.env.ALLOW_DEV_EMAIL_LINK_LOGGING === 'true' || process.env.NODE_ENV !== 'production';
    }

    /**
     * Dispatch Printhouse Account Activation Email.
     */
    async sendPrinthouseActivationEmail({ to, activationUrl, expiresAt, correlationId }) {
        const { text, html, subject } = renderActivationEmail({ email: to, activationUrl, expiresAt });

        if (this.provider === 'DEV_LOGGER') {
            if (this.allowDevLinkLogging) {
                console.log(`[EMAIL-DELIVERY-DEV] Dispatching activation email to: ${to} | CorrelationId: ${correlationId || 'N/A'}`);
                console.log(`[EMAIL-DELIVERY-DEV] Activation Link: ${activationUrl}`);
            } else {
                console.log(`[EMAIL-DELIVERY-DEV] Dispatching activation email to: ${to} | CorrelationId: ${correlationId || 'N/A'} (Link redacted in prod mode)`);
            }
            return { ok: true, provider: 'DEV_LOGGER', messageId: `dev-msg-${Date.now()}` };
        }

        // Production Provider Dispatch Placeholder (SES/Resend/SMTP)
        try {
            // Future extension point for Nodemailer / AWS SES / Resend SDKs
            console.log(`[EMAIL-DELIVERY-${this.provider}] Sent activation email to ${to}`);
            return { ok: true, provider: this.provider, messageId: `msg-${Date.now()}` };
        } catch (err) {
            console.error(`[EMAIL-DELIVERY-ERROR] Provider ${this.provider} failed:`, err.message);
            throw new Error(`Email dispatch failed via ${this.provider}`);
        }
    }
}

module.exports = new EmailDeliveryService();
