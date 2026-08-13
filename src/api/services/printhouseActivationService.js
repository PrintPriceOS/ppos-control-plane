/**
 * src/api/services/printhouseActivationService.js
 * 
 * Manages token inspection (without consumption) and atomic account activation.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const userService = require('./controlUserService');
const auditLogger = require('./auditLoggerService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const JWT_ISSUER = process.env.JWT_ISSUER || 'https://auth.printprice.pro';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';

function maskEmail(email) {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    const maskedLocal = local.length <= 2 ? local[0] + '*' : local[0] + '***' + local[local.length - 1];
    return `${maskedLocal}@${domain}`;
}

class PrinthouseActivationService {
    /**
     * Safe inspection of token without consuming it.
     */
    async inspectToken({ rawToken }) {
        if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 16) {
            return { ok: false, error: { code: 'ACTIVATION_INVALID', message: 'Invalid token format' } };
        }

        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        try {
            const [request] = await db.query(
                `SELECT id, email, status, activation_expires_at, activation_consumed_at 
                 FROM printhouse_signup_requests 
                 WHERE activation_token_hash = ?`,
                [hashedToken]
            ).catch(() => []);

            if (!request) {
                return { ok: false, error: { code: 'ACTIVATION_INVALID', message: 'Token not found' } };
            }

            if (request.status === 'ACTIVATED' || request.status === 'CONSUMED' || request.activation_consumed_at) {
                return { ok: false, error: { code: 'ACTIVATION_ALREADY_USED', message: 'Token has already been activated' } };
            }

            if (request.status === 'REVOKED') {
                return { ok: false, error: { code: 'ACTIVATION_REVOKED', message: 'Token has been revoked' } };
            }

            if (new Date(request.activation_expires_at) < new Date()) {
                return { ok: false, error: { code: 'ACTIVATION_EXPIRED', message: 'Activation token has expired' } };
            }

            return {
                ok: true,
                status: 'READY_TO_ACTIVATE',
                maskedEmail: maskEmail(request.email)
            };
        } catch (err) {
            console.error('[ACTIVATION-INSPECT-ERROR]', err.message);
            return { ok: false, error: { code: 'ACTIVATION_FAILED', message: 'Internal inspection error' } };
        }
    }

    /**
     * Atomic token consumption & minimum account graph creation.
     */
    async activateAccount({ rawToken, password }) {
        if (!rawToken || typeof rawToken !== 'string') {
            return { ok: false, error: { code: 'ACTIVATION_INVALID', message: 'Token is required' } };
        }

        if (!password || password.length < 8) {
            return { ok: false, error: { code: 'ACTIVATION_INVALID', message: 'Password must be at least 8 characters long' } };
        }

        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        // 1. First inspect token state
        const inspection = await this.inspectToken({ rawToken });
        if (!inspection.ok) {
            return inspection;
        }

        // 2. Fetch full signup request
        const [request] = await db.query(
            'SELECT * FROM printhouse_signup_requests WHERE activation_token_hash = ?',
            [hashedToken]
        );

        if (!request) {
            return { ok: false, error: { code: 'ACTIVATION_INVALID', message: 'Token not found' } };
        }

        // 3. Atomic consumption check
        const updateResult = await db.query(
            `UPDATE printhouse_signup_requests 
             SET status = 'CONSUMING', activation_consumed_at = NOW() 
             WHERE activation_token_hash = ? AND status = 'PENDING' AND activation_expires_at > NOW()`,
            [hashedToken]
        );

        const affectedRows = updateResult?.affectedRows || updateResult?.[0]?.affectedRows || 0;
        if (affectedRows === 0) {
            return { ok: false, error: { code: 'ACTIVATION_ALREADY_USED', message: 'Token has already been consumed or expired' } };
        }

        // 4. Begin atomic transaction for minimum account creation
        const connection = await db.getPool().getConnection();
        await connection.beginTransaction();

        try {
            const tenantId = `ph-${uuidv4().substring(0, 8)}`;
            const printhouseId = `node-${uuidv4().substring(0, 8)}`;
            const email = request.email;
            const companyName = email.split('@')[0] + ' Printhouse';

            // Tenant (Active session state, non-operational)
            await connection.query(
                `INSERT INTO tenants (id, name, type, status, plan, metadata_json) 
                 VALUES (?, ?, 'PRINTHOUSE', 'ACTIVE', 'STARTER', ?)`,
                [tenantId, companyName, JSON.stringify({ onboarding_status: 'CONFIGURING', activated_via: 'MINIMAL_SIGNUP' })]
            );

            // Printer Node (Initial status: DRAFT, non-operational, non-marketplace)
            await connection.query(
                `INSERT INTO printer_nodes 
                 (id, tenant_id, name, country, city, email, status, marketplace_enabled, visibility_scope) 
                 VALUES (?, ?, ?, 'ES', 'Pending Setup', ?, 'DRAFT', false, 'private')`,
                [printhouseId, tenantId, companyName, email]
            );

            // Capabilities default row
            await connection.query(
                `INSERT INTO printhouse_capabilities (printhouse_id, tenant_id, supported_countries)
                 VALUES (?, ?, ?)`,
                [printhouseId, tenantId, JSON.stringify(['ES'])]
            );

            // Admin User
            const user = await userService.createUser(
                email,
                'PRINTHOUSE_ADMIN',
                tenantId,
                password,
                printhouseId
            );

            // Tenant License
            await connection.query(
                `INSERT INTO tenant_licenses (tenant_id, license_type, status, plan, expires_at)
                 VALUES (?, 'PRINTER_OPERATIONS', 'ACTIVE', 'STARTER', DATE_ADD(NOW(), INTERVAL 14 DAY))`,
                [tenantId]
            );

            // Update signup request status to ACTIVATED
            await connection.query(
                `UPDATE printhouse_signup_requests 
                 SET status = 'ACTIVATED', tenant_id = ?, printhouse_id = ?, control_user_id = ? 
                 WHERE id = ?`,
                [tenantId, printhouseId, user.id, request.id]
            );

            await connection.commit();

            // 5. Sign JWT session token
            const token = jwt.sign(
                {
                    sub: user.id,
                    email: user.email,
                    role: user.role,
                    tenant_id: tenantId,
                    printhouse_id: printhouseId
                },
                JWT_SECRET,
                {
                    expiresIn: JWT_EXPIRES_IN,
                    issuer: JWT_ISSUER,
                    audience: JWT_AUDIENCE
                }
            );

            // Audit event
            auditLogger.log({
                type: 'PRINTHOUSE_ACTIVATION_SUCCEEDED',
                tenantId,
                userId: user.id,
                status: 'SUCCESS',
                metadata: { email, printhouseId }
            }).catch(() => {});

            return {
                ok: true,
                token,
                user: {
                    email: user.email,
                    role: user.role,
                    tenantId,
                    printhouseId
                }
            };
        } catch (err) {
            await connection.rollback();
            console.error('[ACTIVATION-TRANSACTION-FAILED]', err);

            // Revert signup request status if transaction failed
            await db.query(
                "UPDATE printhouse_signup_requests SET status = 'PENDING', activation_consumed_at = NULL WHERE id = ?",
                [request.id]
            ).catch(() => {});

            return { ok: false, error: { code: 'ACTIVATION_FAILED', message: 'Failed to create account records' } };
        } finally {
            connection.release();
        }
    }
}

module.exports = new PrinthouseActivationService();
