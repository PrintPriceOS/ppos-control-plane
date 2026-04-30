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

    const filePath = artifact.storage_key;

    // Security: Validate file exists and is within storage root
    if (!fs.existsSync(filePath)) {
      console.error(`[ARTIFACT-SERVICE] File missing for artifact ${artifactId}: ${filePath}`);
      throw new Error('FILE_NOT_FOUND_ON_DISK');
    }

    // Double check path traversal safety
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(storage.root))) {
      throw new Error('SECURITY_VIOLATION_PATH_TRAVERSAL');
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
      downloadUrl: `/api/admin/preflight/artifacts/${artifact.id}/download`
    };
  }
}

module.exports = new PreflightArtifactService();
