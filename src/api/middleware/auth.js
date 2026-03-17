// middleware/auth.js
// TODO: Replace with real RBAC/Auth logic for PPOS Control Plane
module.exports = function requireAdmin(req, res, next) {
    console.log(`[AUTH-STUB] Bypassing auth for ${req.method} ${req.originalUrl} - ACCESS GRANTED`);
    
    // Pass user metadata for audit purposes (mocked)
    req.user = {
        role: 'SUPER_ADMIN',
        id: 'system_bootstrap',
        ip: req.ip
    };

    next();
};
