/**
 * src/api/middleware/auth.js
 * 
 * Secure Bearer JWT & Break-glass Auth logic for PPOS Control Plane.
 */
const jwt = require('jsonwebtoken');
const auditLogger = require('../services/auditLoggerService');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-development-only';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';
const BREAK_GLASS_TOKEN = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

module.exports = function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return fail(req, res, 'Valid Bearer token required');
    }

    const token = authHeader.split(' ')[1];

    // 1. Check Break-glass Token
    if (token === BREAK_GLASS_TOKEN) {
        req.user = {
            role: 'super_admin',
            id: 'system_bootstrap',
            tenantId: 'ppos-production',
            authMode: 'BREAK_GLASS'
        };
        console.warn(`[SECURITY-NOTICE] Using BREAK-GLASS token for ${req.user.role} access.`);
        return next();
    }

    // 2. Validate JWT
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            audience: JWT_AUDIENCE
        });

        req.user = {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
            tenantId: decoded.tenant_id,
            authMode: 'JWT'
        };

        next();
    } catch (err) {
        const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or malformed token';
        return fail(req, res, message);
    }
};

function fail(req, res, message) {
    const failureMetadata = { 
        ip: req.ip, 
        method: req.method, 
        url: req.originalUrl,
        agent: req.headers['user-agent']
    };
    
    console.warn(`[AUTH-FAILURE] Unauthorized access attempt: ${message} from ${req.ip}`);
    
    auditLogger.log({
        type: 'AUTH_DENIED',
        tenantId: 'system',
        userId: 'unauthenticated',
        status: 'FAILURE',
        metadata: { ...failureMetadata, error: message }
    }).catch(() => {});

    return res.status(401).json({ 
        ok: false, 
        error: { code: 'UNAUTHORIZED', message } 
    });
}
