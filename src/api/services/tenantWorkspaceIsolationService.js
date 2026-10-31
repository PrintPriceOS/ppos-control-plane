/**
 * src/api/services/tenantWorkspaceIsolationService.js
 * 
 * Enforces strict multi-tenant data isolation checks.
 */
'use strict';

const db = require('./mysqlClient');
const auditLogger = require('./auditLoggerService');

class TenantWorkspaceIsolationService {

    async assertOrderBelongsToTenant(orderId, tenantId) {
        if (!orderId || !tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        // Check both marketplace_orders and legacy orders table
        const rows = await db.query(
            `SELECT tenant_id FROM marketplace_orders WHERE order_id = ? 
             UNION 
             SELECT tenant_id FROM orders WHERE id = ?`,
            [orderId, orderId]
        );
        if (rows.length === 0 || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'ORDER',
                entityId: orderId,
                tenantId,
                reason: 'Order does not belong to tenant or is missing.'
            });
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }
        return true;
    }

    async assertJobBelongsToTenant(jobId, tenantId) {
        if (!jobId || !tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        const rows = await db.query(
            `SELECT tenant_id FROM jobs WHERE id = ? 
             UNION 
             SELECT tenant_id FROM preflight_job_registry WHERE job_id = ?`,
            [jobId, jobId]
        );
        if (rows.length === 0 || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'JOB',
                entityId: jobId,
                tenantId,
                reason: 'Preflight job does not belong to tenant.'
            });
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }
        return true;
    }

    async assertFileBelongsToTenant(fileId, tenantId) {
        if (!fileId || !tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        const rows = await db.query(
            `SELECT o.tenant_id FROM marketplace_order_files f 
             JOIN marketplace_orders o ON f.order_id = o.order_id 
             WHERE f.file_id = ?
             UNION
             SELECT tenant_id FROM production_files WHERE id = ?`,
            [fileId, fileId]
        );
        if (rows.length === 0 || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'FILE',
                entityId: fileId,
                tenantId,
                reason: 'File does not belong to tenant.'
            });
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }
        return true;
    }

    async assertArtifactBelongsToTenant(artifactId, tenantId) {
        if (!artifactId || !tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        const rows = await db.query(
            'SELECT tenant_id FROM preflight_artifacts WHERE id = ?',
            [artifactId]
        );
        if (rows.length === 0 || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'ARTIFACT',
                entityId: artifactId,
                tenantId,
                reason: 'Artifact does not belong to tenant.'
            });
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }
        return true;
    }

    async assertPrinthouseBelongsToTenant(printhouseId, tenantId) {
        if (!printhouseId || !tenantId) throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        const rows = await db.query(
            'SELECT tenant_id FROM printhouses WHERE id = ?',
            [printhouseId]
        );
        if (rows.length === 0 || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'PRINTHOUSE',
                entityId: printhouseId,
                tenantId,
                reason: 'Printhouse profile does not belong to tenant.'
            });
            throw new Error('UNAUTHORIZED_TENANT_ACCESS');
        }
        return true;
    }

    async assertMachineBelongsToPrinthouse(machineId, printhouseId, tenantId) {
        if (!machineId || !printhouseId) throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        const rows = await db.query(
            'SELECT printhouse_id, tenant_id FROM printhouse_machines WHERE id = ?',
            [machineId]
        );
        if (rows.length === 0 || rows[0].printhouse_id !== printhouseId || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'MACHINE',
                entityId: machineId,
                tenantId,
                reason: `Machine does not match Printhouse ${printhouseId} or Tenant ${tenantId}.`
            });
            throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        }
        return true;
    }

    async assertMediaBelongsToPrinthouse(mediaId, printhouseId, tenantId) {
        if (!mediaId || !printhouseId) throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        const rows = await db.query(
            'SELECT printhouse_id, tenant_id FROM printhouse_media WHERE id = ?',
            [mediaId]
        );
        if (rows.length === 0 || rows[0].printhouse_id !== printhouseId || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'MEDIA',
                entityId: mediaId,
                tenantId,
                reason: `Media does not match Printhouse ${printhouseId} or Tenant ${tenantId}.`
            });
            throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        }
        return true;
    }

    async assertPolicyProfileBelongsToPrinthouse(profileId, printhouseId, tenantId) {
        if (!profileId || !printhouseId) throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        const rows = await db.query(
            'SELECT printhouse_id, tenant_id FROM printhouse_policy_profiles WHERE id = ?',
            [profileId]
        );
        if (rows.length === 0 || rows[0].printhouse_id !== printhouseId || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'POLICY_PROFILE',
                entityId: profileId,
                tenantId,
                reason: `Policy Profile does not match Printhouse ${printhouseId} or Tenant ${tenantId}.`
            });
            throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        }
        return true;
    }

    async assertSlaBelongsToPrinthouse(slaId, printhouseId, tenantId) {
        if (!slaId || !printhouseId) throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        const rows = await db.query(
            'SELECT printhouse_id, tenant_id FROM printhouse_sla_profiles WHERE id = ?',
            [slaId]
        );
        if (rows.length === 0 || rows[0].printhouse_id !== printhouseId || rows[0].tenant_id !== tenantId) {
            await this.auditIsolationViolation({
                entityType: 'SLA_PROFILE',
                entityId: slaId,
                tenantId,
                reason: `SLA Profile does not match Printhouse ${printhouseId} or Tenant ${tenantId}.`
            });
            throw new Error('UNAUTHORIZED_PRINTHOUSE_ACCESS');
        }
        return true;
    }

    sanitizeCrossTenantError(error) {
        if (error && (
            error.message === 'UNAUTHORIZED_TENANT_ACCESS' || 
            error.message === 'UNAUTHORIZED_PRINTHOUSE_ACCESS' ||
            error.message === 'FORBIDDEN'
        )) {
            return {
                status: 403,
                body: {
                    ok: false,
                    error: 'ACCESS_DENIED',
                    message: 'Resource not found or access restricted.'
                }
            };
        }
        return {
            status: 500,
            body: {
                ok: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: error?.message || 'An unexpected error occurred'
            }
        };
    }

    async auditIsolationViolation({ entityType, entityId, tenantId, reason }) {
        try {
            await auditLogger.log({
                type: 'SECURITY_VIOLATION',
                tenantId: tenantId || 'system',
                userId: 'system-isolation-guard',
                status: 'FAILURE',
                metadata: {
                    entityType,
                    entityId,
                    reason,
                    warning: 'CROSS_TENANT_ACCESS_ATTEMPT_DETECTED'
                }
            });
        } catch (err) {
            // ignore
        }
    }
}

module.exports = new TenantWorkspaceIsolationService();
