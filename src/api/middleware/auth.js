/**
 * src/api/middleware/auth.js
 * 
 * Secure RBAC/Auth logic for PPOS Control Plane.
 */
module.exports = function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const validToken = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';

    if (!authHeader || authHeader !== `Bearer ${validToken}`) {
        console.warn(`[AUTH-FAILURE] Unauthorized access attempt: ${req.method} ${req.originalUrl} from ${req.ip}`);
        return res.status(401).json({ 
            ok: false, 
            error: { code: 'UNAUTHORIZED', message: 'Valid Bearer token required' } 
        });
    }

    // Resolve user metadata
    // In a real system, we'd verify a JWT and extract claims.
    // For this hardened bootstrap, we treat the system token as SUPER_ADMIN.
    req.user = {
        role: 'SUPER_ADMIN',
        id: 'system_admin',
        ip: req.ip,
        tenantId: req.headers['x-tenant-id'] || 'system'
    };

    console.info(`[AUTH-SUCCESS] ${req.user.role} authenticated: ${req.method} ${req.originalUrl}`);
    next();
};
