// middleware/v2AuthMiddleware.js
// STUB: Always allow for Control Plane bootstrap
module.exports = async function v2AuthMiddleware(req, res, next) {
    console.log(`[V2-AUTH-STUB] Bypassing auth for ${req.method} ${req.originalUrl}`);
    
    // Resolve tenant from authenticated user context
    const tenantId = req.user?.tenantId || 'system';
    
    req.tenant = {
        id: tenantId,
        name: `Resolved Tenant (${tenantId})`
    };
    
    next();
};
