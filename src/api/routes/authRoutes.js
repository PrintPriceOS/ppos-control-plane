/**
 * src/api/routes/authRoutes.js
 * 
 * Authentication endpoints for JWT-based login.
 */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userService = require('../services/controlUserService');

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

        // Sign JWT
        const token = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                role: user.role,
                tenant_id: user.tenant_id
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
                tenant_id: user.tenant_id
            }
        });
    } catch (err) {
        console.error('[AUTH-LOGIN-ERROR]', err);
        res.status(500).json({ ok: false, error: 'Internal server error during authentication' });
    }
});

module.exports = router;
