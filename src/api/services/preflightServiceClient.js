/**
 * Preflight Service Client
 * 
 * Secure bridge between Control Plane and ppos-preflight-service.
 * Handles identity preservation and contract enforcement.
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');

class PreflightServiceClient {
  constructor() {
    this.baseUrl = process.env.PPOS_PREFLIGHT_SERVICE_URL || `http://localhost:${process.env.PPOS_SERVICE_PORT || 8001}`;
    this.systemToken = process.env.PPOS_CONTROL_TOKEN || 'admin-secret';
  }

  /**
   * Generates internally signed JWT for preflight service communication
   */
  getInternalPreflightJwt(actorContext = {}) {
    const secret = process.env.JWT_SECRET || 'fallback-jwt-secret';
    const payload = {
      sub: actorContext.actorId || actorContext.id || actorContext.userId || 'control-plane',
      tenantId: actorContext.tenantId || 'system',
      role: actorContext.role || 'SUPER_ADMIN',
      scopes: ['preflight:read', 'preflight:write', 'admin:preflight'],
      origin: 'ppos-control-plane'
    };
    const options = {
      issuer: process.env.JWT_ISSUER || 'https://auth.printprice.pro',
      audience: process.env.PPOS_PREFLIGHT_JWT_AUDIENCE || process.env.JWT_AUDIENCE || 'ppos:control',
      expiresIn: process.env.PPOS_PREFLIGHT_JWT_EXPIRES_IN || '15m'
    };
    return jwt.sign(payload, secret, options);
  }

  /**
   * Internal request wrapper enforcing internal JWT identity preservation
   */
  async _request(method, path, data = null, headers = {}) {
    const url = `${this.baseUrl}${path}`;
    
    // Resolve contextual parameters from incoming forwarded headers
    const tenantId = headers['X-Tenant-Id'] || headers['tenantId'] || 'system';
    const actorId = headers['X-Actor-Id'] || 'control-plane';
    const role = headers['X-Actor-Role'] || 'SUPER_ADMIN';
    const traceId = headers['X-Trace-Id'] || `trace_${Date.now()}`;

    const actorContext = {
      actorId,
      tenantId,
      role
    };

    const internalJwt = this.getInternalPreflightJwt(actorContext);
    
    // 1. Prepare secure headers satisfying Task 2 requirements
    const secureHeaders = {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': this.systemToken, // Legacy system identifier
      'X-Tenant-Id': tenantId,
      'X-Trace-Id': traceId,
      'X-Actor-Id': actorId,
      'X-Actor-Role': role,
      'X-Origin-Service': 'ppos-control-plane',
      ...headers,
      // Ensure upstream Authorization uses internally signed JWT, overriding any forwarded user token
      'Authorization': `Bearer ${internalJwt}`
    };

    console.log(
      `[PREFLIGHT-SERVICE-CLIENT][AUDIT] Dispatching internal call to ${method} ${url}\n` +
      `  • Tenant Scope: ${tenantId}\n` +
      `  • Actor: ${actorId} (${role})\n` +
      `  • Inter-Service Auth JWT Generated: YES (len=${internalJwt.length})\n` +
      `  • Trace ID: ${traceId}`
    );

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
  async triggerJobFix(upstreamJobId, authHeader = null, tenantId = null, policyOrOptions = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    const options = typeof policyOrOptions === 'string' ? { policy: policyOrOptions } : (policyOrOptions || {});
    return this._request('POST', `/api/preflight/jobs/${upstreamJobId}/fix`, options, headers);
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

  /**
   * Download artifact bytes as a stream from upstream service
   */
  async downloadArtifact(jobId, artifactId, authHeader = null, tenantId = null) {
    const headers = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    const url = `${this.baseUrl}/api/preflight/jobs/${jobId}/artifacts/${artifactId}`;
    const actorContext = { actorId: 'control-plane', tenantId: tenantId || 'system', role: 'SUPER_ADMIN' };
    const internalJwt = this.getInternalPreflightJwt(actorContext);

    const secureHeaders = {
      'X-Admin-Api-Key': this.systemToken,
      'X-Tenant-Id': tenantId || 'system',
      'X-Trace-Id': `trace_${Date.now()}`,
      'X-Actor-Id': 'control-plane',
      'X-Actor-Role': 'SUPER_ADMIN',
      'X-Origin-Service': 'ppos-control-plane',
      ...headers,
      'Authorization': `Bearer ${internalJwt}`
    };

    try {
      const response = await axios({
        method: 'GET',
        url,
        headers: secureHeaders,
        responseType: 'stream',
        timeout: 60000 // downloading large PDFs might take some time
      });
      return { stream: response.data, headers: response.headers };
    } catch (error) {
      const status = error.response?.status || 500;
      const enhancedError = new Error(`UPSTREAM_ARTIFACT_DOWNLOAD_ERROR_${status}`);
      enhancedError.status = status;
      throw enhancedError;
    }
  }
}

module.exports = new PreflightServiceClient();
