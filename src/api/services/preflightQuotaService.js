/**
 * Preflight Quota Service
 * 
 * Logic for enforcing tenant-level processing and storage quotas.
 */
const storageService = require('./preflightStorageService');

class PreflightQuotaService {
  constructor() {
    // Standard 2GB quota
    this.DEFAULT_STORAGE_QUOTA_BYTES = 2147483648; 
  }

  /**
   * Get quota configuration for a tenant
   */
  async getTenantQuota(tenantId) {
    // TODO: Connect to 'tenants' DB to fetch overrides from metadata_json
    // Defaulting to 2GB if not overridden
    return {
      tenantId,
      storageQuotaBytes: this.DEFAULT_STORAGE_QUOTA_BYTES,
      enforced: true
    };
  }

  /**
   * Hard assertion that a tenant can accept more data.
   * Throws Error if quota is exceeded.
   */
  async assertTenantHasStorageCapacity(tenantId, incomingBytes = 0) {
    const summary = await storageService.getTenantStorageSummary(tenantId);
    
    if ((summary.usedBytes + incomingBytes) > summary.quotaBytes) {
      const err = new Error('STORAGE_QUOTA_EXCEEDED');
      err.details = {
        tenantId,
        requestedBytes: incomingBytes,
        usedBytes: summary.usedBytes,
        quotaBytes: summary.quotaBytes,
        shortfallBytes: (summary.usedBytes + incomingBytes) - summary.quotaBytes
      };
      throw err;
    }

    return true;
  }

  /**
   * Legacy wrapper for backward compatibility with skeleton
   */
  async checkQuotaExceeded(tenantId, requestedBytes = 0) {
    try {
      await this.assertTenantHasStorageCapacity(tenantId, requestedBytes);
      return { exceeded: false };
    } catch (e) {
      return { exceeded: true, ...e.details };
    }
  }
}

module.exports = new PreflightQuotaService();
