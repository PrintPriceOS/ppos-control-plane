/**
 * src/api/services/tenantPilotAccessService.js
 * 
 * Enforces tenant-scoped roles and access controls for pilot commercial operations.
 */
'use strict';

const db = require('./mysqlClient');
const auditLogger = require('./auditLoggerService');

class TenantPilotAccessService {

    assertTenantScope(actor, tenantId) {
        if (!actor) {
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }
        const role = String(actor.role || 'VIEWER').toUpperCase();
        if (role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'CONTROL_PLANE_ADMIN') {
            return true;
        }
        if (actor.tenantId === tenantId) {
            return true;
        }
        throw new Error('UNAUTHORIZED_TENANT_ACCESS');
    }

    assertPrinthouseScope(actor, printhouseId) {
        if (!actor) {
            throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        }
        const role = String(actor.role || 'VIEWER').toUpperCase();
        if (role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'CONTROL_PLANE_ADMIN') {
            return true;
        }
        if (actor.printhouseId === printhouseId) {
            return true;
        }
        throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
    }

    canManagePilotReadiness(actor, tenantId) {
        if (!actor) return false;
        const role = String(actor.role || 'VIEWER').toUpperCase();
        return role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'CONTROL_PLANE_ADMIN';
    }

    canManagePrinthouseCapabilities(actor, printhouseId) {
        if (!actor) return false;
        const role = String(actor.role || 'VIEWER').toUpperCase();
        if (role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'CONTROL_PLANE_ADMIN') {
            return true;
        }
        if (role === 'TENANT_ADMIN' || role === 'PRINTHOUSE_ADMIN') {
            return actor.printhouseId === printhouseId;
        }
        return false;
    }

    canViewOperatorDetails(actor, tenantId, printhouseId) {
        if (!actor) return false;
        const role = String(actor.role || 'VIEWER').toUpperCase();
        if (role === 'CUSTOMER_USER' || role === 'CUSTOMER_SUPPORT') {
            return false;
        }
        return true;
    }

    canViewCustomerSafeReport(actor, orderId) {
        return true; // All roles can see customer-safe reports
    }

    canApproveUnsafeFix(actor, jobId) {
        if (!actor) return false;
        const role = String(actor.role || 'VIEWER').toUpperCase();
        if (role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'CONTROL_PLANE_ADMIN') {
            return true;
        }
        // Explicitly allowed only if explicitly permitted (mock check)
        if (actor.allow_unsafe_fix) {
            return true;
        }
        return false;
    }

    canApproveMachineWarningOverride(actor, orderId) {
        if (!actor) return false;
        const role = String(actor.role || 'VIEWER').toUpperCase();
        if (role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN' || role === 'CONTROL_PLANE_ADMIN') {
            return true;
        }
        if (role === 'PRINTHOUSE_ADMIN' || role === 'PRINTHOUSE_OPERATOR') {
            return true;
        }
        return false;
    }

    canEnableLiveProduction(actor, tenantId) {
        if (!actor) return false;
        const role = String(actor.role || 'VIEWER').toUpperCase();
        return role === 'SYSTEM_ADMIN' || role === 'SUPER_ADMIN';
    }

    sanitizePayloadForRole(payload, actor) {
        if (!payload) return payload;
        if (!actor) return payload;

        const role = String(actor.role || 'VIEWER').toUpperCase();
        if (role === 'CUSTOMER_USER' || role === 'CUSTOMER_SUPPORT') {
            const sanitized = { ...payload };
            // Remove sensitive operator-only fields
            delete sanitized.machine_snapshot_json;
            delete sanitized.internal_notes;
            delete sanitized.cost_details;
            delete sanitized.preflight_raw_details;
            delete sanitized.operator_logs;
            delete sanitized.debug_info;
            return sanitized;
        }
        return payload;
    }

    async logDeniedAction(actor, actionCode, reason) {
        try {
            await auditLogger.log({
                type: 'AUTH_DENIED',
                tenantId: actor?.tenantId || 'system',
                userId: actor?.userId || actor?.id || 'system',
                status: 'FAILURE',
                metadata: {
                    actionCode,
                    reason,
                    role: actor?.role
                }
            });
        } catch (err) {
            // ignore
        }
    }
}

module.exports = new TenantPilotAccessService();
