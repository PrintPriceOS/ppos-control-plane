/**
 * src/api/services/preflightLicenseService.js
 * 
 * Logic for verifying PrintPrice OS printer licenses.
 */
const db = require('./mysqlClient');

class PreflightLicenseService {
    /**
     * Check if a tenant has a valid printer operational license.
     * 
     * @param {string} tenantId
     * @returns {Promise<boolean>}
     */
    async hasPrinterLicense(tenantId) {
        // SUPER_ADMIN (system tenant) always has license
        if (tenantId === 'system' || tenantId === 'SUPER_ADMIN') return true;

        // In a real system, we'd query a shared 'licenses' table.
        // For this implementation, we check the preflight_jobs or a dedicated mock.
        try {
            // Mock: Check if tenant is in the 'licensed_printers' list
            // In development, if PPOS_STRICT_LICENSING is not set, we allow all for now.
            if (process.env.PPOS_STRICT_LICENSING !== 'true') return true;

            const rows = await db.query(
                "SELECT 1 FROM tenant_licenses WHERE tenant_id = ? AND license_type = 'PRINTER_OPERATIONS' AND status = 'ACTIVE' AND expires_at > NOW()",
                [tenantId]
            );
            return rows.length > 0;
        } catch (err) {
            console.error('[LICENSE-CHECK-FAILED]', err.message);
            // Fail closed if database is unavailable but licensing is strict
            return process.env.PPOS_STRICT_LICENSING !== 'true';
        }
    }
}

module.exports = new PreflightLicenseService();
