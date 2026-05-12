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

  /**
   * Fetch live preflight compliance policies from upstream service
   */
  async getLivePolicies(authHeader = null, tenantId = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    // Support both /api/preflight/jobs/policies and /api/preflight/policies routes gracefully
    try {
      return await this._request('GET', '/api/preflight/jobs/policies', null, headers);
    } catch (err) {
      if (err.status === 404) {
        return await this._request('GET', '/api/preflight/policies', null, headers);
      }
      throw err;
    }
  }

  /**
   * Fetch job forensic timeline from upstream service
   */
  async getJobTimeline(upstreamJobId, authHeader = null, tenantId = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    return this._request('GET', `/api/preflight/jobs/${upstreamJobId}/timeline`, null, headers);
  }

  /**
   * Fetch job forensic findings from upstream service
   */
  async getJobFindings(upstreamJobId, authHeader = null, tenantId = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    return this._request('GET', `/api/preflight/jobs/${upstreamJobId}/findings`, null, headers);
  }

  /**
   * Fetch job repair evidence from upstream service
   */
  async getJobEvidence(upstreamJobId, authHeader = null, tenantId = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    return this._request('GET', `/api/preflight/jobs/${upstreamJobId}/evidence`, null, headers);
  }

  /**
   * Trigger a native autofix operation for a job in the upstream service
   */
  async triggerJobFix(upstreamJobId, authHeader = null, tenantId = null, policy = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    const payload = policy ? { policy } : {};
    return this._request('POST', `/api/preflight/jobs/${upstreamJobId}/fix`, payload, headers);
  }

  /**
   * Create an upstream preflight job natively supporting multipart file payloads and header forwarding
   */
  async createJob({ file, tenantId, strategy, policy, metadata, actorContext, traceId, authHeader }) {
    if (!file || !file.buffer) {
      throw new Error('INVALID_FILE_PAYLOAD: File buffer is required');
    }

    // PDF only enforcement
    const mimeType = file.mimetype || 'application/pdf';
    if (mimeType !== 'application/pdf') {
      throw new Error('UNSUPPORTED_MEDIA_TYPE: Only PDF files are permitted for industrial preflight');
    }

    // Secure against path traversal
    const safeFilename = (file.originalname || 'document.pdf').replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_');

    // Max file size enforcement
    const maxSize = parseInt(process.env.PPOS_MAX_FILE_SIZE_BYTES || '2147483648', 10);
    if (file.buffer.length > maxSize) {
      throw new Error(`PAYLOAD_TOO_LARGE: File size exceeds maximum industrial limit of ${maxSize} bytes`);
    }

    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
    if (traceId) headers['X-Trace-Id'] = traceId;
    if (actorContext?.id) headers['X-Actor-Id'] = actorContext.id;
    if (actorContext?.role) headers['X-Actor-Role'] = actorContext.role;

    const FormData = require('form-data');
    const form = new FormData();
    form.append('tenantId', tenantId || 'system');
    form.append('strategy', strategy || 'ANALYZE');
    form.append('policy', policy || 'OFFSET_MODERN_COATED');
    if (metadata) {
      form.append('metadata', typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
    }
    form.append('file', file.buffer, {
      filename: safeFilename,
      contentType: 'application/pdf'
    });

    const combinedHeaders = {
      ...headers,
      ...form.getHeaders()
    };

    return this._request('POST', '/api/preflight/jobs', form, combinedHeaders);
  }

  /**
   * List upstream jobs
   */
  async listJobs({ tenantId, limit = 50, status, authHeader = null }) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (status) params.append('status', status);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this._request('GET', `/api/preflight/jobs${queryString}`, null, headers);
  }

  /**
   * Get single upstream job details
   */
  async getJob(jobId, authHeader = null, tenantId = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    return this._request('GET', `/api/preflight/jobs/${jobId}`, null, headers);
  }
}

module.exports = new PreflightServiceClient();
