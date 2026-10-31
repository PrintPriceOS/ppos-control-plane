/**
 * src/api/middleware/requirePrinterLicense.js
 * 
 * Middleware to enforce printer operational licenses for Control Plane routes.
 */
const licenseService = require('../services/preflightLicenseService');
const auditLogger = require('../services/auditLoggerService');

module.exports = async function requirePrinterLicense(req, res, next) {
    // 1. Skip check for SUPER_ADMIN
    if (req.user && req.user.role === 'SUPER_ADMIN') {
        return next();
    }

    const tenantId = req.user ? req.user.tenantId : null;

    if (!tenantId) {
        return res.status(403).json({
            ok: false,
            error: { code: 'MISSING_TENANT_CONTEXT', message: 'Tenant identity could not be resolved' }
        });
    }

    // 2. Perform License Check
    const isLicensed = await licenseService.hasPrinterLicense(tenantId);

    if (!isLicensed) {
        await auditLogger.log({
            type: 'LICENSE_DENIED',
            tenantId,
            userId: req.user.id,
            status: 'FAILURE',
            metadata: { 
                url: req.originalUrl,
                reason: 'Missing PRINTER_OPERATIONS license'
            }
        });

        return res.status(403).json({
            ok: false,
            error: { 
                code: 'LICENSE_REQUIRED', 
                message: 'Access to Preflight Operations requires a valid Printer License' 
            }
        });
    }

    next();
};
