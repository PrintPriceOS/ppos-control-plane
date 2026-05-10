/**
 * src/api/middleware/auth.js
 * 
 * Secure Bearer JWT & Break-glass Auth logic for PPOS Control Plane.
 */
const jwt = require('jsonwebtoken');
const auditLogger = require('../services/auditLoggerService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';
const JWT_ISSUER = process.env.JWT_ISSUER || 'https://auth.printprice.pro';

if (!JWT_SECRET) {
    console.error('[FATAL-CONFIG-ERROR] JWT_SECRET is not set. Control Plane cannot start securely.');
    process.exit(1);
}

/**
 * Primary Authentication Middleware.
 * Enforces JWT validation and populates req.user.
 */
function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return fail(req, res, 'Bearer token required');
    }

    const token = authHeader.split(' ')[1];

    // 1. Validate JWT
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            audience: JWT_AUDIENCE,
            issuer: JWT_ISSUER
        });

        // 2. Map Industrial Identity
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            role: (decoded.role || 'VIEWER').toUpperCase(),
            tenantId: decoded.tenant_id,
            printhouseId: decoded.printhouse_id,
            scopes: decoded.scopes || [],
            authMode: 'JWT',
            issuedAt: decoded.iat,
            expiresAt: decoded.exp
        };

        // 3. Log Successful Auth (Sampling or Critical only)
        if (process.env.PPOS_LOG_AUTH_SUCCESS === 'true') {
            auditLogger.log({
                type: 'AUTH_SUCCESS',
                tenantId: req.user.tenantId || 'system',
                userId: req.user.id,
                status: 'SUCCESS',
                metadata: { method: req.method, url: req.originalUrl }
            }).catch(() => {});
        }

        next();
    } catch (err) {
        let message = 'Invalid or malformed token';
        if (err.name === 'TokenExpiredError') message = 'Token expired';
        if (err.name === 'JsonWebTokenError') message = `JWT Error: ${err.message}`;
        
        return fail(req, res, message);
    }
}

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

/**
 * Helper to extract full actor context from request.
 */
function resolveActorContext(req) {
    const user = req.user || {};
    const role = (user.role || 'viewer').toUpperCase();
    return {
        userId: user.id,
        role,
        tenantId: user.tenantId,
        printhouseId: user.printhouseId,
        isSuperAdmin: role === 'SUPER_ADMIN',
        isMachine: !!user.isMachine,
        isPrinthouseUser: ['PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'].includes(role)
    };
}


/**
 * RBAC Enforcement Middleware.
 * Enforces role hierarchy and permission matrix.
 * 
 * Hierarchy: SUPER_ADMIN > TENANT_ADMIN > OPERATOR > VIEWER
 */
const ROLE_HIERARCHY = {
    'SUPER_ADMIN': 100,
    'TENANT_ADMIN': 50,
    'OPERATOR': 20,
    'VIEWER': 10
};

function requireRole(minRole) {
    const minLevel = ROLE_HIERARCHY[minRole.toUpperCase()] || 0;
    
    return (req, res, next) => {
        const context = resolveActorContext(req);
        const userLevel = ROLE_HIERARCHY[context.role] || 0;

        if (userLevel >= minLevel) {
            return next();
        }

        return res.status(403).json({ 
            ok: false, 
            error: { 
                code: 'FORBIDDEN', 
                message: `Insufficient permissions. Required: ${minRole}, Current: ${context.role}` 
            } 
        });
    };
}

/**
 * Middleware to enforce Printhouse scope.
 */
function requirePrinthouseScope() {
    return (req, res, next) => {
        const { isPrinthouseUser, isSuperAdmin } = resolveActorContext(req);
        if (isPrinthouseUser || isSuperAdmin) {
            return next();
        }
        return res.status(403).json({ 
            ok: false, 
            error: { code: 'FORBIDDEN', message: 'This route requires a Printhouse scope' } 
        });
    };
}

/**
 * Middleware to ensure Printhouse is ACTIVE/APPROVED.
 * Prevents pending_review or suspended printers from operating.
 */
async function requireApprovedPrinthouse(req, res, next) {
    const context = resolveActorContext(req);
    
    // Super Admin bypass
    if (context.isSuperAdmin) return next();
    
    if (!context.printhouseId) {
        return res.status(403).json({ ok: false, error: 'Printhouse context missing' });
    }

    try {
        const db = require('../services/mysqlClient');
        const [node] = await db.query('SELECT status FROM printer_nodes WHERE id = ?', [context.printhouseId]);
        
        if (!node) {
            return res.status(404).json({ ok: false, error: 'Printhouse node not found' });
        }

        if (node.status !== 'active') {
            const msg = node.status === 'pending_review' 
                ? 'Your Printhouse account is pending review by our team.'
                : `Your Printhouse account is ${node.status}. Operations are restricted.`;
            
            return res.status(403).json({ 
                ok: false, 
                error: { code: 'ACCOUNT_NOT_ACTIVE', message: msg, status: node.status } 
            });
        }

        next();
    } catch (err) {
        console.error('[AUTH-APPROVAL-CHECK-FAILED]', err);
        res.status(500).json({ ok: false, error: 'Internal security check failed' });
    }
}

module.exports = {
    requireAdmin,
    resolveActorContext,
    requireRole,
    requirePrinthouseScope,
    requireApprovedPrinthouse
};
