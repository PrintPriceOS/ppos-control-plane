/**
 * Preflight Artifact Service
 * 
 * Logic for managing and retrieving preflight artifacts (PDFs, reports, logs).
 */
const persistence = require('./preflightPersistenceService');
const storage = require('./preflightStorageService');
const fs = require('fs');
const path = require('path');

class PreflightArtifactService {
  /**
   * List all artifacts with optional filtering
   */
  async listArtifacts(filters = {}) {
    const artifacts = await persistence.listArtifacts(filters);
    return {
      total: artifacts.length,
      artifacts: artifacts.map(a => this._sanitizeArtifact(a))
    };
  }

  /**
   * List artifacts specifically for a job
   */
  async listJobArtifacts(jobId) {
    return this.listArtifacts({ jobId });
  }

  /**
   * Get metadata for a specific artifact
   */
  async getArtifact(artifactId) {
    const artifact = await persistence.getArtifact(artifactId);
    if (!artifact) return null;
    return this._sanitizeArtifact(artifact);
  }

  /**
   * Prepare an artifact for download (stream)
   */
  async getArtifactDownloadStream(artifactId, tenantId = null) {
    const artifact = await persistence.getArtifact(artifactId);
    
    if (!artifact) {
      throw new Error('ARTIFACT_NOT_FOUND');
    }

    // Security: Validate tenant access if provided
    if (tenantId && artifact.tenant_id !== tenantId) {
      throw new Error('ACCESS_DENIED');
    }

    // Resolve the storage key (supports relative and legacy absolute paths)
    const filePath = storage.resolveStorageKey(artifact.storage_key);

    // Security: Validate file exists and is within tenant storage boundary
    if (!storage.validateTenantPath(artifact.tenant_id, filePath)) {
      throw new Error('SECURITY_VIOLATION_TENANT_BOUNDARY');
    }

    if (!fs.existsSync(filePath)) {
      console.error(`[ARTIFACT-SERVICE] File missing for artifact ${artifactId}: ${filePath}`);
      throw new Error('FILE_NOT_FOUND_ON_DISK');
    }

    const stream = fs.createReadStream(filePath);
    
    return {
      stream,
      filename: artifact.filename,
      mimeType: artifact.mime_type,
      sizeBytes: artifact.size_bytes
    };
  }

  /**
   * Soft delete an artifact
   */
  async softDeleteArtifact(artifactId, tenantId = null) {
    const artifact = await persistence.getArtifact(artifactId);
    if (!artifact) throw new Error('ARTIFACT_NOT_FOUND');

    if (tenantId && artifact.tenant_id !== tenantId) {
      throw new Error('ACCESS_DENIED');
    }

    await persistence.deleteArtifact(artifactId);
    console.log(`[ARTIFACT-SERVICE] Artifact ${artifactId} soft-deleted.`);
    
    return true;
  }

  /**
   * Remove sensitive internal paths from response
   */
  _sanitizeArtifact(artifact) {
    const { storage_key, ...safe } = artifact;
    return {
      ...safe,
      name: artifact.filename || artifact.name || 'document.pdf',
      downloadUrl: `/api/admin/preflight/artifacts/${artifact.id}/download`
    };
  }

  /**
   * Run the Garbage Collector to clean up expired and soft-deleted artifacts
   */
  async runGarbageCollector(dryRun = false) {
    const retentionDays = parseInt(process.env.PPOS_PREFLIGHT_RETENTION_DAYS || '90');
    console.log(`[ARTIFACT-GC] Starting GC (Retention: ${retentionDays} days, Dry Run: ${dryRun})`);
    
    const auditLogger = require('./auditLoggerService');
    await auditLogger.log({
        type: 'ARTIFACT_GC_STARTED',
        tenantId: 'SYSTEM',
        userId: 'SYSTEM',
        status: dryRun ? 'DRY_RUN' : 'SUCCESS',
        metadata: { retentionDays, dryRun }
    });

    const candidates = await persistence.listArtifactsForGC(retentionDays);
    const results = {
        totalFound: candidates.length,
        processed: 0,
        errors: 0,
        deletedBytes: 0,
        expiredCount: 0,
        softDeletedCount: 0
    };

    for (const art of candidates) {
        try {
            const isExpired = !art.deleted_at && (new Date() - new Date(art.created_at)) > (retentionDays * 24 * 60 * 60 * 1000);
            if (isExpired) results.expiredCount++;
            else results.softDeletedCount++;

            if (!dryRun) {
                // Perform physical deletion
                const deleted = await this._physicalDelete(art);
                if (deleted) {
                    results.deletedBytes += art.size_bytes;
                    await persistence.updateArtifact(art.id, { status: 'DELETED' });
                    
                    if (isExpired) {
                        await auditLogger.log({
                            type: 'ARTIFACT_EXPIRED',
                            tenantId: art.tenant_id,
                            userId: 'SYSTEM',
                            status: 'SUCCESS',
                            metadata: { artifactId: art.id, filename: art.filename }
                        });
                    }
                }
            }
            results.processed++;
        } catch (err) {
            console.error(`[ARTIFACT-GC] Failed to process ${art.id}:`, err.message);
            results.errors++;
        }
    }

    await auditLogger.log({
        type: 'ARTIFACT_GC_COMPLETED',
        tenantId: 'SYSTEM',
        userId: 'SYSTEM',
        status: 'SUCCESS',
        metadata: { results, dryRun }
    });

    console.log(`[ARTIFACT-GC] GC completed:`, results);
    return results;
  }

  /**
   * Physically remove file from disk with security boundary checks
   */
  async _physicalDelete(artifact) {
    try {
        const filePath = storage.resolveStorageKey(artifact.storage_key);
        
        // CRITICAL: Ensure path is within tenant boundary and storage root
        if (!storage.validateTenantPath(artifact.tenant_id, filePath)) {
            console.error(`[ARTIFACT-GC][SECURITY] Attempted to delete out-of-bounds file: ${filePath}`);
            return false;
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[ARTIFACT-GC] Physically deleted: ${filePath}`);
            return true;
        } else {
            console.warn(`[ARTIFACT-GC] File already missing: ${filePath}`);
            return true; // Consider it deleted
        }
    } catch (err) {
        console.error(`[ARTIFACT-GC] Physical delete failed:`, err.message);
        return false;
    }
  }
}

module.exports = new PreflightArtifactService();
