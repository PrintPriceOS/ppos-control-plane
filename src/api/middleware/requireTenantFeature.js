/**
 * src/api/middleware/requireTenantFeature.js
 * 
 * Middleware to restrict route execution to tenants possessing specific capability flags.
 * Securely enforces subscription limits and integration restrictions.
 */
const tenantGuard = require('../services/tenantGuard');
const db = require('../services/mysqlClient');

function requireTenantFeature(featureName) {
    return async (req, res, next) => {
        // Super Admin or System process bypass
        if (req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'SYSTEM')) {
            return next();
        }

        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(403).json({ 
                ok: false, 
                error: { code: 'UNAUTHORIZED', message: 'Tenant context missing from session.' } 
            });
        }

        try {
            // 1. Utilize cached feature context from auth middleware if populated
            if (req.user.features) {
                if (req.user.features[featureName.toUpperCase()]) {
                    return next();
                }
            } else {
                // 2. Fetch tenant capabilities dynamically if not cached
                const [tenant] = await db.query('SELECT plan, metadata_json FROM tenants WHERE id = ?', [tenantId]);
                if (tenant) {
                    const features = tenantGuard.resolveFeatures(tenant);
                    req.user.features = features; // Cache on request scope
                    
                    if (features[featureName.toUpperCase()]) {
                        return next();
                    }
                }
            }

            return res.status(403).json({
                ok: false,
                error: {
                    code: 'FEATURE_RESTRICTED',
                    message: `This endpoint requires '${featureName.toUpperCase()}' capability. Please upgrade your subscription standard.`
                }
            });
        } catch (err) {
            console.error('[SECURITY-GATEKEEPER-ERROR]', err);
            res.status(500).json({ ok: false, error: 'Internal capability verification failed' });
        }
    };
}

module.exports = requireTenantFeature;
