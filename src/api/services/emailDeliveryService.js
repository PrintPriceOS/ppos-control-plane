/**
 * src/api/services/emailDeliveryService.js
 * 
 * Provider-agnostic Email Delivery Service.
 * Phase 192 — RC18: Production SMTP Email Delivery via Nodemailer.
 */
const nodemailer = require('nodemailer');
const { renderActivationEmail } = require('./emailTemplates/printhouseActivationEmail');

class EmailDeliveryService {
    constructor() {
        this.transporter = null;
        this.transporterKey = null;
    }

    /**
     * Helper to redact recipient email address for safe logging.
     * e.g. "owner@printhouse.com" -> "o***r@printhouse.com"
     */
    _redactEmail(email) {
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return '[REDACTED]';
        }
        const [user, domain] = email.split('@');
        if (user.length <= 2) {
            return `*@${domain}`;
        }
        return `${user[0]}***${user[user.length - 1]}@${domain}`;
    }

    /**
     * Helper to redact sensitive credentials from error messages.
     */
    _sanitizeErrorMessage(message) {
        if (!message || typeof message !== 'string') return 'Unknown error';
        let clean = message;
        if (process.env.SMTP_PASS) {
            clean = clean.split(process.env.SMTP_PASS).join('[REDACTED_PASS]');
        }
        if (process.env.SMTP_USER) {
            clean = clean.split(process.env.SMTP_USER).join('[REDACTED_USER]');
        }
        return clean;
    }

    /**
     * Validate and extract SMTP configuration from environment or options.
     */
    getSmtpConfig(overrides = {}) {
        const host = overrides.SMTP_HOST !== undefined ? overrides.SMTP_HOST : process.env.SMTP_HOST;
        const portRaw = overrides.SMTP_PORT !== undefined ? overrides.SMTP_PORT : process.env.SMTP_PORT;
        const secureRaw = overrides.SMTP_SECURE !== undefined ? overrides.SMTP_SECURE : process.env.SMTP_SECURE;
        const user = overrides.SMTP_USER !== undefined ? overrides.SMTP_USER : process.env.SMTP_USER;
        const pass = overrides.SMTP_PASS !== undefined ? overrides.SMTP_PASS : process.env.SMTP_PASS;

        if (!host || typeof host !== 'string' || host.trim() === '') {
            const err = new Error('SMTP host is missing or invalid');
            err.code = 'SMTP_CONFIGURATION_INVALID';
            throw err;
        }

        if (portRaw === undefined || portRaw === null || portRaw === '') {
            const err = new Error('SMTP port is missing');
            err.code = 'SMTP_CONFIGURATION_INVALID';
            throw err;
        }

        const port = Number(portRaw);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            const err = new Error(`Invalid SMTP port: ${portRaw}`);
            err.code = 'SMTP_CONFIGURATION_INVALID';
            throw err;
        }

        let secure;
        if (typeof secureRaw === 'boolean') {
            secure = secureRaw;
        } else if (typeof secureRaw === 'string') {
            const s = secureRaw.trim().toLowerCase();
            if (s === 'true') secure = true;
            else if (s === 'false') secure = false;
            else {
                const err = new Error(`Invalid SMTP_SECURE boolean value: ${secureRaw}`);
                err.code = 'SMTP_CONFIGURATION_INVALID';
                throw err;
            }
        } else {
            const err = new Error(`SMTP_SECURE must be a boolean representation: ${secureRaw}`);
            err.code = 'SMTP_CONFIGURATION_INVALID';
            throw err;
        }

        if (!user || typeof user !== 'string' || user.trim() === '') {
            const err = new Error('SMTP user is missing or invalid');
            err.code = 'SMTP_CONFIGURATION_INVALID';
            throw err;
        }

        if (!pass || typeof pass !== 'string' || pass.trim() === '') {
            const err = new Error('SMTP pass is missing or invalid');
            err.code = 'SMTP_CONFIGURATION_INVALID';
            throw err;
        }

        const from = overrides.EMAIL_FROM !== undefined ? overrides.EMAIL_FROM : (process.env.EMAIL_FROM || 'no-reply@auth.printprice.pro');
        if (!from || typeof from !== 'string' || from.trim() === '') {
            const err = new Error('EMAIL_FROM is missing or invalid');
            err.code = 'SMTP_CONFIGURATION_INVALID';
            throw err;
        }

        const config = {
            host: host.trim(),
            port,
            secure,
            auth: {
                user: user.trim(),
                pass: pass.trim()
            }
        };

        const connTimeout = overrides.SMTP_CONNECTION_TIMEOUT_MS || process.env.SMTP_CONNECTION_TIMEOUT_MS;
        if (connTimeout && !isNaN(Number(connTimeout))) {
            config.connectionTimeout = Number(connTimeout);
        }

        const greetingTimeout = overrides.SMTP_GREETING_TIMEOUT_MS || process.env.SMTP_GREETING_TIMEOUT_MS;
        if (greetingTimeout && !isNaN(Number(greetingTimeout))) {
            config.greetingTimeout = Number(greetingTimeout);
        }

        const socketTimeout = overrides.SMTP_SOCKET_TIMEOUT_MS || process.env.SMTP_SOCKET_TIMEOUT_MS;
        if (socketTimeout && !isNaN(Number(socketTimeout))) {
            config.socketTimeout = Number(socketTimeout);
        }

        return config;
    }

    /**
     * Get or create cached nodemailer transporter for SMTP.
     */
    getTransporter(overrides = {}) {
        const config = this.getSmtpConfig(overrides);
        const key = `${config.host}:${config.port}:${config.secure}:${config.auth.user}`;
        if (this.transporter && this.transporterKey === key) {
            return this.transporter;
        }

        this.transporter = nodemailer.createTransport(config);
        this.transporterKey = key;
        return this.transporter;
    }

    /**
     * Verify provider transport health without leaking secrets.
     */
    async verifyTransport(overrides = {}) {
        const provider = (overrides.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER || 'DEV_LOGGER').toUpperCase();

        if (provider === 'DEV_LOGGER') {
            return { ok: true, provider: 'DEV_LOGGER' };
        }

        if (provider === 'SMTP') {
            try {
                const transporter = this.getTransporter(overrides);
                await transporter.verify();
                return { ok: true, provider: 'SMTP' };
            } catch (err) {
                const code = err.code === 'SMTP_CONFIGURATION_INVALID' ? 'SMTP_CONFIGURATION_INVALID' : 'SMTP_VERIFY_FAILED';
                const sanitizedMessage = this._sanitizeErrorMessage(err.message);
                return {
                    ok: false,
                    provider: 'SMTP',
                    code,
                    message: sanitizedMessage
                };
            }
        }

        return {
            ok: false,
            provider,
            code: 'EMAIL_PROVIDER_UNSUPPORTED',
            message: `Unsupported EMAIL_PROVIDER: ${provider}`
        };
    }

    /**
     * Dispatch Printhouse Account Activation Email.
     */
    async sendPrinthouseActivationEmail({ to, activationUrl, expiresAt, correlationId }, overrides = {}) {
        const provider = (overrides.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER || 'DEV_LOGGER').toUpperCase();
        const from = overrides.EMAIL_FROM || process.env.EMAIL_FROM || 'no-reply@auth.printprice.pro';
        const allowDevLinkLogging = process.env.ALLOW_DEV_EMAIL_LINK_LOGGING === 'true';
        const isProd = process.env.NODE_ENV === 'production';

        const { text, html, subject } = renderActivationEmail({ email: to, activationUrl, expiresAt });
        const redactedTo = this._redactEmail(to);

        // 1. DEV_LOGGER Provider
        if (provider === 'DEV_LOGGER') {
            if (allowDevLinkLogging || !isProd) {
                console.log(`[EMAIL-DELIVERY-DEV] Dispatching activation email to: ${to} | CorrelationId: ${correlationId || 'N/A'}`);
                console.log(`[EMAIL-DELIVERY-DEV] Activation Link: ${activationUrl}`);
            } else {
                console.log(`[EMAIL-DELIVERY-DEV] Dispatching activation email to: ${redactedTo} | CorrelationId: ${correlationId || 'N/A'} (Link redacted in prod mode)`);
            }
            return { ok: true, provider: 'DEV_LOGGER', messageId: `dev-msg-${Date.now()}` };
        }

        // 2. SMTP Provider
        if (provider === 'SMTP') {
            let transporter;
            try {
                transporter = this.getTransporter(overrides);
            } catch (cfgErr) {
                console.error(`[EMAIL-DELIVERY-ERROR] SMTP configuration error: ${this._sanitizeErrorMessage(cfgErr.message)} | CorrelationId: ${correlationId || 'N/A'}`);
                const err = new Error(this._sanitizeErrorMessage(cfgErr.message));
                err.code = cfgErr.code || 'SMTP_CONFIGURATION_INVALID';
                throw err;
            }

            try {
                const info = await transporter.sendMail({
                    from,
                    to,
                    subject,
                    text,
                    html
                });

                console.log(`[EMAIL-DELIVERY-SMTP] Sent activation email to ${redactedTo} | MessageId: ${info.messageId} | CorrelationId: ${correlationId || 'N/A'}`);

                return {
                    ok: true,
                    provider: 'SMTP',
                    messageId: info.messageId
                };
            } catch (sendErr) {
                const sanitized = this._sanitizeErrorMessage(sendErr.message);
                console.error(`[EMAIL-DELIVERY-ERROR] SMTP send failed to ${redactedTo}: ${sanitized} | CorrelationId: ${correlationId || 'N/A'}`);
                const err = new Error(`SMTP email delivery failed: ${sanitized}`);
                err.code = 'SMTP_SEND_FAILED';
                throw err;
            }
        }

        // 3. Unsupported Provider
        console.error(`[EMAIL-DELIVERY-ERROR] Unsupported email provider: ${provider} | CorrelationId: ${correlationId || 'N/A'}`);
        const err = new Error(`Unsupported email provider: ${provider}`);
        err.code = 'EMAIL_PROVIDER_UNSUPPORTED';
        throw err;
    }
}

module.exports = new EmailDeliveryService();
module.exports.EmailDeliveryService = EmailDeliveryService;
