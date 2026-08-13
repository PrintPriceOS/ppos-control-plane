/**
 * src/api/routes/authRoutes.js
 * 
 * Authentication endpoints for JWT-based login, registration, and password reset.
 * Phase Auth — Identity Suite v2.
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

router.use(express.json());
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userService = require('../services/controlUserService');
const printhouseService = require('../services/printhouseService');
const db = require('../services/mysqlClient');

// In-memory rate limiter for auth endpoints (per IP, resets every 15 minutes)
const authRateLimiter = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = authRateLimiter.get(ip);
    if (!entry || (now - entry.windowStart) > RATE_LIMIT_WINDOW_MS) {
        authRateLimiter.set(ip, { count: 1, windowStart: now });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
}

// Clean up stale rate limit entries every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of authRateLimiter.entries()) {
        if ((now - entry.windowStart) > RATE_LIMIT_WINDOW_MS) authRateLimiter.delete(ip);
    }
}, 30 * 60 * 1000);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[FATAL-SECURITY] JWT_SECRET is not configured. Authentication cannot proceed.');
    process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const JWT_ISSUER = process.env.JWT_ISSUER || 'https://auth.printprice.pro';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';

/**
 * POST /api/auth/login
 * Authenticates user and returns a signed JWT.
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ ok: false, error: 'Email and password are required' });
    }

    try {
        const breakGlassToken = process.env.PPOS_CONTROL_TOKEN;
        const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        const enableBreakGlass = process.env.ENABLE_BREAK_GLASS_TOKEN === 'true' || (process.env.ENABLE_BREAK_GLASS_TOKEN !== 'false' && isDev);
        
        // Break-glass authentication (Master Access)
        if (enableBreakGlass && breakGlassToken && password === breakGlassToken) {
            console.log(`[AUTH] Break-glass access used by: ${email}`);
            
            // Sign JWT for Super Admin session
            const token = jwt.sign(
                {
                    sub: 'break-glass-session',
                    email: email,
                    role: 'SUPER_ADMIN',
                    tenant_id: 'ppos-production',
                    is_super_admin: true
                },
                JWT_SECRET,
                {
                    expiresIn: JWT_EXPIRES_IN,
                    issuer: JWT_ISSUER,
                    audience: JWT_AUDIENCE
                }
            );

            return res.json({
                ok: true,
                token,
                user: {
                    email: email,
                    role: 'SUPER_ADMIN',
                    tenantId: 'ppos-production',
                    isSuperAdmin: true
                }
            });
        }

        const user = await userService.findByEmail(email);
        
        if (!user) {
            return res.status(401).json({ ok: false, error: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ ok: false, error: 'Invalid email or password' });
        }

        // Update last login
        await userService.updateLastLogin(user.id);

        // Canonical Role Normalization
        let userRole = (user.role || 'VIEWER').toUpperCase();
        let isSuper = userRole === 'SUPER_ADMIN' || user.email === 'admin@printprice.pro';
        if (isSuper) userRole = 'SUPER_ADMIN';

        // Sign JWT with Printhouse/Tenant context
        const token = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                role: userRole,
                tenant_id: user.tenant_id,
                printhouse_id: user.printhouse_id,
                is_super_admin: isSuper
            },
            JWT_SECRET,
            {
                expiresIn: JWT_EXPIRES_IN,
                issuer: JWT_ISSUER,
                audience: JWT_AUDIENCE
            }
        );

        res.json({
            ok: true,
            token,
            user: {
                email: user.email,
                role: userRole,
                tenantId: user.tenant_id,
                printhouseId: user.printhouse_id,
                isSuperAdmin: isSuper
            }
        });
    } catch (err) {
        console.error('[AUTH-LOGIN-ERROR]', err);
        res.status(500).json({ ok: false, error: 'Internal server error during authentication' });
    }
});

const printhouseSignupService = require('../services/printhouseSignupService');
const printhouseActivationService = require('../services/printhouseActivationService');

/**
 * POST /api/auth/printhouse/start
 * Phase 191B Minimal Email Signup.
 * Returns an enumeration-safe response. Never issues a JWT.
 */
router.post('/printhouse/start', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        return res.json({
            ok: true,
            message: 'If this address can be used, activation instructions will be sent shortly.'
        });
    }

    try {
        const result = await printhouseSignupService.startSignup(req.body || {});
        return res.json(result);
    } catch (err) {
        console.error('[AUTH-SIGNUP-START-ERROR]', err);
        return res.json({
            ok: true,
            message: 'If this address can be used, activation instructions will be sent shortly.'
        });
    }
});

/**
 * POST /api/auth/printhouse/resend-activation
 * Resend activation link. Enumeration-safe.
 */
router.post('/printhouse/resend-activation', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        return res.json({
            ok: true,
            message: 'If this address can be used, activation instructions will be sent shortly.'
        });
    }

    try {
        const result = await printhouseSignupService.resendActivation(req.body || {});
        return res.json(result);
    } catch (err) {
        console.error('[AUTH-RESEND-ACTIVATION-ERROR]', err);
        return res.json({
            ok: true,
            message: 'If this address can be used, activation instructions will be sent shortly.'
        });
    }
});

/**
 * POST /api/auth/printhouse/activation/inspect
 * Safe token inspection without consuming it.
 */
router.post('/printhouse/activation/inspect', async (req, res) => {
    try {
        const result = await printhouseActivationService.inspectToken(req.body || {});
        if (!result.ok) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (err) {
        console.error('[AUTH-ACTIVATION-INSPECT-ERROR]', err);
        return res.status(500).json({ ok: false, error: { code: 'ACTIVATION_FAILED', message: 'Internal inspection error' } });
    }
});

/**
 * POST /api/auth/printhouse/activate
 * Atomic token consumption and minimum non-operational account creation.
 * Returns JWT session upon success.
 */
router.post('/printhouse/activate', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ ok: false, error: { code: 'ACTIVATION_RATE_LIMITED', message: 'Too many attempts. Please try again later.' } });
    }

    try {
        const result = await printhouseActivationService.activateAccount(req.body || {});
        if (!result.ok) {
            return res.status(400).json(result);
        }
        return res.status(200).json(result);
    } catch (err) {
        console.error('[AUTH-ACTIVATE-ERROR]', err);
        return res.status(500).json({ ok: false, error: { code: 'ACTIVATION_FAILED', message: 'Activation transaction failed' } });
    }
});

/**
 * POST /api/auth/printhouse/register
 * Self-service registration for new Printhouses (Legacy / Admin provision).
 */
router.post('/printhouse/register', async (req, res) => {
    const { companyName, email, password } = req.body;

    if (!companyName || !email || !password) {
        return res.status(400).json({ ok: false, error: 'Company name, email and password are required' });
    }

    try {
        const { tenantId, printhouseId, user } = await printhouseService.selfRegister(req.body);

        // Auto-login after registration
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

        res.status(201).json({
            ok: true,
            token,
            user: {
                email: user.email,
                role: user.role,
                tenantId,
                printhouseId
            }
        });
    } catch (err) {
        console.error('[PRINTHOUSE-REGISTRATION-ERROR]', err);
        res.status(400).json({ ok: false, error: err.message });
    }
});


/**
 * POST /api/auth/forgot-password
 * Initiates a password reset flow.
 * SECURITY: Always returns the SAME blind response to prevent account enumeration.
 * An attacker cannot determine if an email is registered by the response.
 */
router.post('/forgot-password', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        // Still return 200 with the blind message — don't reveal rate limit breach either
        return res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    const BLIND_RESPONSE = { ok: true, message: 'If that email is registered, a reset link has been sent.' };

    if (!rawEmail || !rawEmail.includes('@')) {
        // Invalid format — still return 200 to avoid leaking validity
        return res.json(BLIND_RESPONSE);
    }

    try {
        const user = await userService.findByEmail(rawEmail).catch(() => null);

        if (user) {
            // Generate a cryptographically secure token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            // Store hashed token in DB (never store raw token)
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
            try {
                await db.query(
                    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used, created_at)
                     VALUES (?, ?, ?, 0, NOW())
                     ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at), used = 0, created_at = NOW()`,
                    [user.id, hashedToken, expiresAt]
                );
            } catch (dbErr) {
                // Table may not exist yet — log but don't crash or leak info
                console.warn('[AUTH-FORGOT-PW] Token table write failed (run migration):', dbErr.message);
            }

            // In production: send email here via SES/SendGrid/etc.
            // For now: log the reset link to the console (safe in dev/staging)
            const baseUrl = process.env.APP_BASE_URL || 'http://localhost:8080';
            const resetLink = `${baseUrl}/auth/reset-password?token=${resetToken}`;
            console.log(`[AUTH-FORGOT-PW] Reset link for ${rawEmail}: ${resetLink}`);

            // TODO: inject email service here when available:
            // await emailService.sendPasswordReset({ to: user.email, resetLink });
        }

        // ALWAYS return the same blind response — success or not
        return res.json(BLIND_RESPONSE);
    } catch (err) {
        console.error('[AUTH-FORGOT-PW-ERROR]', err.message);
        // Still blind response — never 500 to the client on this endpoint
        return res.json(BLIND_RESPONSE);
    }
});

/**
 * POST /api/auth/reset-password
 * Validates a reset token and updates the user's password.
 */
router.post('/reset-password', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ ok: false, error: 'Too many attempts. Please try again later.' });
    }

    const { token, password } = req.body || {};

    if (!token || !password || password.length < 8) {
        return res.status(400).json({ ok: false, error: 'Invalid request. Token and a password of at least 8 characters are required.' });
    }

    try {
        const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');
        const [record] = await db.query(
            `SELECT prt.user_id, prt.expires_at, prt.used 
             FROM password_reset_tokens prt
             WHERE prt.token_hash = ?`,
            [hashedToken]
        ).catch(() => []);

        if (!record || record.used || new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ ok: false, error: 'This reset link is invalid or has expired. Please request a new one.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        await userService.updatePassword(record.user_id, passwordHash).catch(async () => {
            // Fallback direct update
            await db.query('UPDATE control_users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [passwordHash, record.user_id]);
        });

        // Invalidate the token
        await db.query('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?', [hashedToken]).catch(() => {});

        return res.json({ ok: true, message: 'Password updated successfully. You can now log in.' });
    } catch (err) {
        console.error('[AUTH-RESET-PW-ERROR]', err.message);
        return res.status(500).json({ ok: false, error: 'Internal error during password reset.' });
    }
});

module.exports = router;
