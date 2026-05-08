/**
 * src/api/middleware/auth.js
 * 
 * Secure Bearer JWT & Break-glass Auth logic for PPOS Control Plane.
 */
const jwt = require('jsonwebtoken');
const auditLogger = require('../services/auditLoggerService');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-development-only';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';
const ENABLE_BREAK_GLASS = process.env.ENABLE_BREAK_GLASS_TOKEN === 'true';
const BREAK_GLASS_TOKEN = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';
const WORKER_CONTROL_TOKEN = process.env.PPOS_WORKER_CONTROL_TOKEN;

function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return fail(req, res, 'Valid Bearer token required');
    }

    const token = authHeader.split(' ')[1];

    // 1. Check Scoped Worker Token (Higher priority for machine endpoints)
    if (WORKER_CONTROL_TOKEN && token === WORKER_CONTROL_TOKEN) {
        req.user = {
            role: 'WORKER_AGENT',
            id: 'worker_agent_bootstrap',
            tenantId: 'ppos-production-worker',
            authMode: 'WORKER_TOKEN',
            isMachine: true
        };
        // No SECURITY-NOTICE for standard worker heartbeat
        return next();
    }

    // 2. Check Break-glass Token
    if (ENABLE_BREAK_GLASS && token === BREAK_GLASS_TOKEN) {
        req.user = {
            role: 'SUPER_ADMIN',
            id: 'system_bootstrap',
            tenantId: 'ppos-production',
            authMode: 'BREAK_GLASS'
        };
        
        // Suppress notice for frequent machine endpoints even if using break-glass
        const isMachineEndpoint = [
            '/api/admin/workers/heartbeat',
            '/api/admin/artifacts/register'
        ].some(p => req.originalUrl.includes(p));

        if (!isMachineEndpoint) {
            console.warn(`[SECURITY-NOTICE] Emergency access: Using BREAK-GLASS token for ${req.user.role} context. IP: ${req.ip}`);
        }
        
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
            role: (decoded.role || 'VIEWER').toUpperCase(),
            tenantId: decoded.tenant_id,
            printhouseId: decoded.printhouse_id,
            authMode: 'JWT'
        };

        next();
    } catch (err) {
        const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or malformed token';
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
 * Middleware factory to enforce specific roles.
 */
function requireRole(...allowedRoles) {
    const normalizedRoles = allowedRoles.map(r => r.toUpperCase());
    return (req, res, next) => {
        const { role } = resolveActorContext(req);
        if (normalizedRoles.includes(role) || role === 'SUPER_ADMIN') {
            return next();
        }
        return res.status(403).json({ 
            ok: false, 
            error: { code: 'FORBIDDEN', message: 'Insufficient permissions for this action' } 
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
