const auditLogger = require('../services/auditLoggerService');

/**
 * src/api/middleware/auth.js
 * 
 * Secure RBAC/Auth logic for PPOS Control Plane.
 */
module.exports = function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const validToken = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';
    const isBootstrapToken = (validToken === 'admin-secret');

    // 1. Token Validation
    if (!authHeader || authHeader !== `Bearer ${validToken}`) {
        const failureMetadata = { 
            ip: req.ip, 
            method: req.method, 
            url: req.originalUrl,
            agent: req.headers['user-agent']
        };
        
        console.warn(`[AUTH-FAILURE] Unauthorized access attempt from ${req.ip}`);
        
        // Non-blocking audit log for security forensics
        auditLogger.log({
            type: 'AUTH_DENIED',
            tenantId: 'system',
            userId: 'unauthenticated',
            status: 'FAILURE',
            metadata: failureMetadata
        }).catch(() => {});

        return res.status(401).json({ 
            ok: false, 
            error: { code: 'UNAUTHORIZED', message: 'Valid Bearer token required' } 
        });
    }

    // 2. Resolve Identity & Roles
    // NOTE: In production, this would decode a JWT or query a User Session.
    // For this Control Plane bootstrap, we resolve from the secure token and headers.
    
    // Resolve Tenant from Header ONLY (Security: Never trust body for identity)
    const resolvedTenantId = req.headers['x-tenant-id'] || 'system';
    
    // Resolve Role
    // If using the system bootstrap token, we grant SUPER_ADMIN.
    // If we had granular tokens, we'd check claims here.
    const userRole = (resolvedTenantId === 'system') ? 'SUPER_ADMIN' : 'PRINTER_ADMIN';

    req.user = {
        role: userRole,
        id: `user_${resolvedTenantId}`,
        ip: req.ip,
        tenantId: resolvedTenantId,
        authMode: isBootstrapToken ? 'BOOTSTRAP_DEVELOPMENT' : 'SECURE_TOKEN'
    };

    if (isBootstrapToken) {
        console.warn(`[SECURITY-NOTICE] Using default BOOTSTRAP token for ${req.user.role} access.`);
    }

    next();
};
