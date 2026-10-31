/**
 * Artifact Registry Service
 * 
 * Manages the lifecycle, lineage, and integrity of operational artifacts.
 */
const db = require('./mysqlClient');
const logger = require('./logger').child('artifact-registry');

class ArtifactRegistryService {
    /**
     * Register a new artifact in the registry.
     */
    async register(data) {
        const {
            id = `art_${Math.random().toString(36).substring(2, 15)}`,
            jobId,
            tenantId,
            artifactType,
            type,
            filename,
            mimeType,
            sizeBytes,
            checksumSha256,
            checksum,
            workerId,
            createdByWorker,
            storageKey,
            parentId,
            traceId,
            metadata = {}
        } = data;

        // Map worker-specific fields if they exist
        const finalType = artifactType || type;
        const finalChecksum = checksumSha256 || checksum;
        const finalWorkerId = createdByWorker || workerId;

        logger.info({
            event: 'artifact_registration',
            jobId,
            tenantId,
            type: finalType,
            filename,
            sizeBytes,
            traceId
        });

        await db.query(`
            INSERT INTO preflight_artifacts (
                id, job_id, tenant_id, artifact_type, filename, mime_type, 
                size_bytes, checksum_sha256, created_by_worker, storage_key,
                lineage_parent_id, forensic_trace_id, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, jobId, tenantId, finalType, filename, mimeType,
            sizeBytes, finalChecksum, finalWorkerId, storageKey,
            parentId, traceId, JSON.stringify(metadata)
        ]);

        return { id, registered: true };
    }

    /**
     * Get artifact details with lineage.
     */
    async getArtifact(id) {
        const rows = await db.query('SELECT * FROM preflight_artifacts WHERE id = ?', [id]);
        if (rows.length === 0) return null;

        const artifact = rows[0];
        artifact.metadata_json = artifact.metadata_json || {};
        
        return artifact;
    }

    /**
     * Get lineage for a specific job.
     */
    async getJobLineage(jobId) {
        const artifacts = await db.query(`
            SELECT * FROM preflight_artifacts 
            WHERE job_id = ? 
            ORDER BY created_at ASC
        `, [jobId]);

        return artifacts.map(a => ({
            ...a,
            metadata_json: a.metadata_json || {}
        }));
    }

    /**
     * Verify artifact integrity via checksum.
     */
    async verifyIntegrity(id, actualChecksum) {
        const artifact = await this.getArtifact(id);
        if (!artifact) throw new Error('Artifact not found');

        const isValid = artifact.checksum_sha256 === actualChecksum;

        if (!isValid) {
            logger.error({
                event: 'integrity_failure',
                id,
                expected: artifact.checksum_sha256,
                actual: actualChecksum,
                traceId: artifact.forensic_trace_id
            });
        }

        return isValid;
    }

    /**
     * Get storage metrics for a tenant.
     */
    async getTenantStorageMetrics(tenantId) {
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) as total_artifacts,
                SUM(size_bytes) as total_size_bytes,
                AVG(size_bytes) as avg_size_bytes,
                MAX(created_at) as last_artifact_at
            FROM preflight_artifacts
            WHERE tenant_id = ? AND deleted_at IS NULL
        `, [tenantId]);

        return {
            totalArtifacts: parseInt(stats.total_artifacts) || 0,
            totalSizeBytes: parseInt(stats.total_size_bytes) || 0,
            avgSizeBytes: parseFloat(stats.avg_size_bytes) || 0,
            lastArtifactAt: stats.last_artifact_at
        };
    }

    /**
     * List artifacts with optional filters.
     * Used by lifecycle manager for bulk transitions.
     */
    async listArtifacts({ limit = 100, storageTier, tenantId } = {}) {
        let query = 'SELECT * FROM preflight_artifacts WHERE deleted_at IS NULL';
        const params = [];

        if (storageTier) {
            query += ' AND storage_tier = ?';
            params.push(storageTier);
        }
        if (tenantId) {
            query += ' AND tenant_id = ?';
            params.push(tenantId);
        }

        query += ' ORDER BY created_at ASC LIMIT ?';
        params.push(limit);

        return db.query(query, params);
    }

    /**
     * Update artifact fields (used by lifecycle transitions).
     */
    async updateArtifact(id, fields) {
        const allowedFields = ['storage_tier', 'retention_policy'];
        const setClauses = [];
        const params = [];

        for (const [key, value] of Object.entries(fields)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (setClauses.length === 0) return;

        params.push(id);
        await db.query(
            `UPDATE preflight_artifacts SET ${setClauses.join(', ')} WHERE id = ?`,
            params
        );
    }

    /**
     * Mark an artifact as deleted (soft delete).
     * Alias: softDeleteArtifact for backward compatibility.
     */
    async softDelete(id, reason) {
        logger.warn({
            event: 'artifact_deletion',
            id,
            reason
        });

        await db.query(`
            UPDATE preflight_artifacts 
            SET deleted_at = CURRENT_TIMESTAMP, 
                metadata_json = JSON_MERGE_PATCH(COALESCE(metadata_json, '{}'), ?)
            WHERE id = ?
        `, [JSON.stringify({ deletion_reason: reason }), id]);
    }

    /** Alias for lifecycle manager compatibility */
    async softDeleteArtifact(id) {
        return this.softDelete(id, 'RETENTION_EXPIRED');
    }
}

module.exports = new ArtifactRegistryService();
