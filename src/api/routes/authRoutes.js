/**
 * src/api/routes/authRoutes.js
 * 
 * Authentication endpoints for JWT-based login.
 */
const express = require('express');
const router = express.Router();

router.use(express.json());
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userService = require('../services/controlUserService');
const printhouseService = require('../services/printhouseService');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-development-only';
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
        
        // Break-glass authentication (Master Access)
        if (breakGlassToken && password === breakGlassToken) {
            console.log(`[AUTH] Break-glass access used by: ${email}`);
            
            // Sign JWT for Super Admin session
            const token = jwt.sign(
                {
                    sub: 'break-glass-session',
                    email: email,
                    role: 'SUPER_ADMIN',
                    tenant_id: 'ppos-production'
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
                    tenantId: 'ppos-production'
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

        // Sign JWT with Printhouse/Tenant context
        const token = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                role: user.role,
                tenant_id: user.tenant_id,
                printhouse_id: user.printhouse_id
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
                role: user.role,
                tenantId: user.tenant_id,
                printhouseId: user.printhouse_id
            }
        });
    } catch (err) {
        console.error('[AUTH-LOGIN-ERROR]', err);
        res.status(500).json({ ok: false, error: 'Internal server error during authentication' });
    }
});

/**
 * POST /api/auth/printhouse/register
 * Self-service registration for new Printhouses.
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

module.exports = router;
