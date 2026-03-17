// middleware/v2AuthMiddleware.js
// STUB: Always allow for Control Plane bootstrap
module.exports = async function v2AuthMiddleware(req, res, next) {
    console.log(`[V2-AUTH-STUB] Bypassing auth for ${req.method} ${req.originalUrl}`);
    
    // Mock tenant data
    req.tenant = {
        id: 'tenant_bootstrap_mock',
        name: 'Bootstrap Mock'
    };
    
    next();
};
