'use strict';

/**
 * src/api/middleware/v2AuthMiddleware.js
 *
 * Enforces formal JWT or Service API Key authentication for Analytics V2 endpoints
 * and populates `req.user` and `req.tenant` from the verified identity context.
 */
const { requireAdmin, resolveActorContext } = require('./auth');

module.exports = async function v2AuthMiddleware(req, res, next) {
    // Allow internal control/service token via x-marketplace-token or Bearer PPOS_CONTROL_TOKEN
    const mktToken = req.headers && req.headers['x-marketplace-token'];
    const expectedToken = process.env.PPOS_MARKETPLACE_INTAKE_TOKEN || process.env.PPOS_CONTROL_TOKEN;
    if (mktToken && expectedToken && mktToken === expectedToken) {
        const tenantId = (req.headers && req.headers['x-tenant-id']) || req.user?.tenantId || 'tenant-default';
        req.user = req.user || {
            id: 'service-token-actor',
            role: 'SUPER_ADMIN',
            tenantId,
            authMode: 'MARKETPLACE'
        };
        req.tenant = {
            id: tenantId,
            name: `Resolved Tenant (${tenantId})`
        };
        return next();
    }

    return requireAdmin(req, res, (err) => {
        if (err) return next(err);

        const actor = resolveActorContext(req);
        const tenantId = actor.tenantId || req.user?.tenantId || req.user?.tenant_id || (actor.isSuperAdmin ? 'ppos-production' : null);

        if (!tenantId) {
            return res.status(403).json({
                ok: false,
                error: 'TENANT_CONTEXT_REQUIRED',
                message: 'Forbidden: A valid tenant context is required to access Analytics V2.'
            });
        }

        req.tenant = {
            id: tenantId,
            name: `Resolved Tenant (${tenantId})`
        };
        return next();
    });
};
