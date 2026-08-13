/**
 * src/api/services/printhouseSignupService.js
 * 
 * Manages minimal email signup requests, secure token generation,
 * anti-enumeration logic, and activation email dispatch.
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const emailDeliveryService = require('./emailDeliveryService');
const auditLogger = require('./auditLoggerService');

class PrinthouseSignupService {
    /**
     * Start minimal signup.
     * Guaranteed enumeration-safe public behavior.
     */
    async startSignup({ email, acceptTerms, acceptPrivacy, metadata }) {
        const rawEmail = String(email || '').trim();
        const emailNormalized = rawEmail.toLowerCase();

        // 1. Basic validation
        if (!emailNormalized || !emailNormalized.includes('@') || !emailNormalized.includes('.')) {
            return {
                ok: true,
                message: 'If this address can be used, activation instructions will be sent shortly.'
            };
        }

        const appBaseUrl = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:8080';
        const ttlMinutes = parseInt(process.env.ACTIVATION_TOKEN_TTL_MINUTES || '1440', 10); // 24 hours default
        const cooldownSeconds = parseInt(process.env.ACTIVATION_RESEND_COOLDOWN_SECONDS || '60', 10);

        try {
            // 2. Check existing active user in control_users
            const [existingUser] = await db.query(
                'SELECT id FROM control_users WHERE LOWER(email) = ?',
                [emailNormalized]
            ).catch(() => []);

            if (existingUser) {
                // Return same blind response to prevent enumeration
                return {
                    ok: true,
                    message: 'If this address can be used, activation instructions will be sent shortly.'
                };
            }

            // 3. Check existing signup request
            const [existingRequest] = await db.query(
                `SELECT id, status, last_sent_at, send_count FROM printhouse_signup_requests 
                 WHERE email_normalized = ? AND status IN ('PENDING', 'CONSUMING')
                 ORDER BY created_at DESC LIMIT 1`,
                [emailNormalized]
            ).catch(() => []);

            const now = Date.now();

            if (existingRequest) {
                const lastSentTime = new Date(existingRequest.last_sent_at).getTime();
                const secondsSinceLastSend = (now - lastSentTime) / 1000;

                if (secondsSinceLastSend < cooldownSeconds) {
                    // In cooldown period — return same blind response without sending again
                    return {
                        ok: true,
                        message: 'If this address can be used, activation instructions will be sent shortly.'
                    };
                }
            }

            // 4. Generate cryptographically secure token & hash
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const expiresAt = new Date(now + ttlMinutes * 60 * 1000);
            const correlationId = `signup-${uuidv4().substring(0, 8)}`;

            if (existingRequest) {
                // Update and supersede previous token
                await db.query(
                    `UPDATE printhouse_signup_requests 
                     SET activation_token_hash = ?,
                         activation_expires_at = ?,
                         last_sent_at = NOW(),
                         send_count = send_count + 1,
                         metadata_json = ?
                     WHERE id = ?`,
                    [tokenHash, expiresAt, JSON.stringify({ acceptTerms, acceptPrivacy, metadata, correlationId }), existingRequest.id]
                );
            } else {
                // Create new signup request
                const requestId = `req-${uuidv4().substring(0, 8)}`;
                await db.query(
                    `INSERT INTO printhouse_signup_requests 
                     (id, email, email_normalized, provider, status, activation_token_hash, activation_expires_at, metadata_json)
                     VALUES (?, ?, ?, 'EMAIL', 'PENDING', ?, ?, ?)`,
                    [requestId, rawEmail, emailNormalized, tokenHash, expiresAt, JSON.stringify({ acceptTerms, acceptPrivacy, metadata, correlationId })]
                );
            }

            // 5. Dispatch activation email via delivery service
            const activationUrl = `${appBaseUrl}/auth/activate?token=${rawToken}`;
            await emailDeliveryService.sendPrinthouseActivationEmail({
                to: rawEmail,
                activationUrl,
                expiresAt,
                correlationId
            });

            // 6. Audit log event
            auditLogger.log({
                type: 'PRINTHOUSE_SIGNUP_REQUESTED',
                tenantId: 'system',
                userId: 'anonymous',
                status: 'SUCCESS',
                metadata: { emailNormalized, correlationId }
            }).catch(() => {});

            return {
                ok: true,
                message: 'If this address can be used, activation instructions will be sent shortly.'
            };
        } catch (err) {
            console.error('[SIGNUP-SERVICE-ERROR]', err.message);
            // Blind response even on internal failure
            return {
                ok: true,
                message: 'If this address can be used, activation instructions will be sent shortly.'
            };
        }
    }

    /**
     * Resend activation email.
     */
    async resendActivation({ email }) {
        return this.startSignup({ email, acceptTerms: true, acceptPrivacy: true });
    }
}

module.exports = new PrinthouseSignupService();
