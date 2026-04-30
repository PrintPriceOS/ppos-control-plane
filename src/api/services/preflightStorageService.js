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
   */
  _resolveTenantPath(tenantId, subPath = '') {
    if (!tenantId) throw new Error('Tenant ID is required for storage resolution');
    
    // Sanitize tenantId (no dots, no slashes)
    const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
    const tenantBase = path.join(this.tenantsDir, safeTenantId);
    
    // Sanitize subPath
    const sanitizedSubPath = subPath.replace(/\.\./g, '');
    const finalPath = path.resolve(tenantBase, sanitizedSubPath);

    // Verify it's still inside the tenant directory
    if (!finalPath.startsWith(tenantBase)) {
      throw new Error('Security violation: Path traversal attempted');
    }

    return finalPath;
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
    const tenantBase = this._resolveTenantPath(tenantId);

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
    const tenantBase = this._resolveTenantPath(tenantId);
    
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
    const jobBase = this._resolveTenantPath(tenantId, path.join('jobs', jobId));
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
