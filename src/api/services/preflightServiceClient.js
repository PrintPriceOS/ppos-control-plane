/**
 * Preflight Service Client
 * 
 * Secure bridge between Control Plane and ppos-preflight-service.
 * Handles identity preservation and contract enforcement.
 */
const axios = require('axios');

class PreflightServiceClient {
  constructor() {
    this.baseUrl = process.env.PPOS_PREFLIGHT_SERVICE_URL || `http://localhost:${process.env.PPOS_SERVICE_PORT || 8001}`;
    this.systemToken = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';
  }

  /**
   * Internal request wrapper with identity preservation
   */
  async _request(method, path, data = null, headers = {}) {
    const url = `${this.baseUrl}${path}`;
    
    // 1. Prepare secure headers
    const secureHeaders = {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': this.systemToken, // Control Plane identify
      ...headers
    };

    // 2. Ensure Authorization header is present (forwarded or fallback)
    if (!secureHeaders['Authorization']) {
      console.warn(`[AUDIT][UPSTREAM-AUTH] No user Authorization provided. Falling back to system token for ${method} ${path}`);
      secureHeaders['Authorization'] = `Bearer ${this.systemToken}`;
    }

    try {
      const response = await axios({
        method,
        url,
        data,
        headers: secureHeaders,
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data || { message: error.message };
      
      console.error(`[PREFLIGHT-CLIENT][ERROR] ${method} ${path} returned ${status}:`, JSON.stringify(errorData));
      
      const enhancedError = new Error(`UPSTREAM_SERVICE_ERROR_${status}`);
      enhancedError.status = status;
      enhancedError.details = errorData;
      throw enhancedError;
    }
  }

  /**
   * Enqueue a job in the upstream service
   */
  async enqueueJob(jobData, authHeader = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (jobData.tenantId) headers['X-Tenant-Id'] = jobData.tenantId;

    // Map Control Plane internal paths to what the service expects
    // The service usually expects a relative path or a known mount point
    const payload = {
      type: jobData.type,
      tenantId: jobData.tenantId,
      inputPath: jobData.inputPath, // Full path or storage key
      policy: jobData.policy,
      queueName: jobData.queueName,
      metadata: {
        ...jobData.metadata,
        controlPlaneJobId: jobData.id
      }
    };

    return this._request('POST', '/api/preflight/jobs', payload, headers);
  }

  async getHealth() {
    return this._request('GET', '/api/preflight/workers/health');
  }

  /**
   * Fetch real-time status of a job from the upstream service
   */
  async getJobStatus(upstreamJobId, authHeader = null, tenantId = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    return this._request('GET', `/api/preflight/jobs/${upstreamJobId}`, null, headers);
  }
}

module.exports = new PreflightServiceClient();
