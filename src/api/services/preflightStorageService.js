/**
 * Preflight Storage Service
 * 
 * Logic for tracking and managing physical document and artifact storage.
 * Enforces security through path isolation and traversal prevention.
 */
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);

class PreflightStorageService {
  constructor() {
    this.root = process.env.PPOS_PREFLIGHT_STORAGE_ROOT || '/opt/printprice-os/storage/preflight';
    this.tenantsDir = path.join(this.root, 'tenants');
  }

  /**
   * Safely resolve a tenant path and prevent traversal
   * 
   * SECURITY: This is the canonical resolver for ALL tenant storage operations.
   * It prevents path traversal, absolute path injection, and tenant spoofing.
   */
  resolveTenantPath(tenantId, subPath = '') {
    if (!tenantId) throw new Error('Tenant ID is required for storage resolution');
    
    // 1. Sanitize tenantId (no dots, no slashes, strictly alphanumeric/dashes)
    const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
    const tenantBase = path.normalize(path.join(this.tenantsDir, safeTenantId));
    
    // 2. Prevent Absolute Path Injection in subPath
    // If subPath is absolute, we force it to be relative
    const sanitizedSubPath = path.isAbsolute(subPath) ? path.relative('/', subPath) : subPath;
    
    // 3. Prevent Traversal via ../
    const normalizedSubPath = path.normalize(sanitizedSubPath).replace(/^(\.\.(\/|\\|$))+/, '');
    
    // 4. Resolve Final Path
    const finalPath = path.resolve(tenantBase, normalizedSubPath);

    // 5. Final Boundary Check
    // Ensures the resolved path MUST be within the tenant's base directory
    if (!finalPath.startsWith(tenantBase)) {
      console.error(`[SECURITY] Traversal attempt blocked: ${tenantId} -> ${subPath}`);
      throw new Error('Security violation: Path traversal attempted');
    }

    return finalPath;
  }

  /**
   * Validate that an absolute path belongs to a specific tenant
   */
  /**
   * Validate that an absolute path belongs to a specific tenant
   */
  validateTenantPath(tenantId, absolutePath) {
    const tenantBase = this.resolveTenantPath(tenantId);
    const resolvedPath = path.resolve(absolutePath);
    
    if (!resolvedPath.startsWith(tenantBase)) {
      console.error(`[SECURITY] Tenant boundary violation: ${tenantId} tried to access ${absolutePath}`);
      return false;
    }
    return true;
  }

  /**
   * Resolve a storage key (relative or absolute) to a final absolute path
   * 
   * SECURITY: 
   * 1. Rejects traversal (../)
   * 2. Rejects absolute paths if they are outside the storage root
   * 3. Ensures the final path stays inside the storage root
   */
  resolveStorageKey(storageKey) {
    if (!storageKey) throw new Error('Storage key is required');

    // Canonicalize storage root
    const storageRoot = path.resolve(this.root);
    
    let finalPath;

    if (path.isAbsolute(storageKey)) {
        // BACKWARD COMPATIBILITY: Support existing absolute paths
        finalPath = path.resolve(storageKey);
        
        // Security check: Must be inside storage root
        if (!finalPath.startsWith(storageRoot)) {
            console.error(`[SECURITY] Absolute storage key outside root blocked: ${storageKey}`);
            throw new Error('Security violation: Absolute path outside storage root');
        }
    } else {
        // NEW STANDARD: Resolve relative to storage root
        // Sanitize traversal attempts
        const sanitizedKey = storageKey.replace(/\.\./g, '');
        finalPath = path.resolve(storageRoot, sanitizedKey);

        // Security check: Final boundary
        if (!finalPath.startsWith(storageRoot)) {
            throw new Error('Security violation: Path traversal attempted in storage key');
        }
    }

    return finalPath;
  }

  /**
   * Convert an absolute path to a relative storage key
   */
  makeRelative(absolutePath) {
    const storageRoot = path.resolve(this.root);
    const resolvedPath = path.resolve(absolutePath);

    if (!resolvedPath.startsWith(storageRoot)) {
        throw new Error('Cannot make path relative: Path is outside storage root');
    }

    // Return the relative path (forward slashes for consistency)
    return path.relative(storageRoot, resolvedPath).replace(/\\/g, '/');
  }

  /**
   * Recursive directory size calculation
   */
  async _getDirSize(dirPath) {
    let size = 0;
    try {
      const files = await readdir(dirPath, { withFileTypes: true });
      for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
          size += await this._getDirSize(filePath);
        } else {
          const stats = await stat(filePath);
          size += stats.size;
        }
      }
    } catch (e) {
      // If directory doesn't exist, size is 0
    }
    return size;
  }

  /**
   * Recursively count files
   */
  async _getFileCount(dirPath) {
    let count = 0;
    try {
      const files = await readdir(dirPath, { withFileTypes: true });
      for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
          count += await this._getFileCount(filePath);
        } else {
          count += 1;
        }
      }
    } catch (e) {}
    return count;
  }

  /**
   * Ensure standard layout exists for a tenant
   */
  async ensureTenantStorageLayout(tenantId) {
    const folders = ['uploads', 'jobs', 'tmp'];
    const tenantBase = this.resolveTenantPath(tenantId);

    for (const folder of folders) {
      const p = path.join(tenantBase, folder);
      if (!fs.existsSync(p)) {
        await mkdir(p, { recursive: true });
      }
    }
    return true;
  }

  /**
   * Calculate summary for a specific tenant
   */
  async getTenantStorageSummary(tenantId) {
    const tenantBase = this.resolveTenantPath(tenantId);
    
    const usedBytes = await this._getDirSize(tenantBase);
    const fileCount = await this._getFileCount(tenantBase);
    
    const quota = await require('./preflightQuotaService').getTenantQuota(tenantId);
    const quotaBytes = quota.storageQuotaBytes;

    return {
      tenantId,
      usedBytes,
      quotaBytes,
      remainingBytes: Math.max(0, quotaBytes - usedBytes),
      percentageUsed: Number(((usedBytes / quotaBytes) * 100).toFixed(2)),
      fileCount,
      storageRoot: '[RESTRICTED]', // Security: Don't leak server paths
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Global metrics for all tenants
   */
  async getGlobalUsage() {
    try {
      if (!fs.existsSync(this.tenantsDir)) {
        return { totalBytes: 0, tenantCount: 0, storageRoot: '[RESTRICTED]' };
      }

      const tenants = await readdir(this.tenantsDir);
      let totalBytes = 0;
      let totalFiles = 0;

      for (const tenantId of tenants) {
        const summary = await this.getTenantStorageSummary(tenantId);
        totalBytes += summary.usedBytes;
        totalFiles += summary.fileCount;
      }

      return {
        totalBytes,
        totalFiles,
        tenantCount: tenants.length,
        storageRoot: '[RESTRICTED]',
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.error('[STORAGE-SERVICE] Global usage error:', e);
      return { totalBytes: 0, tenantCount: 0 };
    }
  }

  /**
   * Internal helper for job creation
   */
  async ensureJobLayout(tenantId, jobId) {
    const jobBase = this.resolveTenantPath(tenantId, path.join('jobs', jobId));
    const subdirs = ['input', 'output', 'reports', 'logs'];
    
    for (const sub of subdirs) {
      const p = path.join(jobBase, sub);
      if (!fs.existsSync(p)) {
        await mkdir(p, { recursive: true });
      }
    }
    return jobBase;
  }
}

module.exports = new PreflightStorageService();
