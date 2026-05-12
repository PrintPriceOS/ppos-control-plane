/**
 * Preflight Contract Gateway
 * 
 * Acts as the precise, unmocked bridge to the V2 canonical contract (APP/BFF or internal service).
 * Guarantees zero destructive normalization while propagating full industrial actor context.
 */
const axios = require('axios');
const FormData = require('form-data');

class PreflightContractGateway {
    constructor() {
        this.mode = process.env.PREFLIGHT_CONTRACT_MODE || 'app_bff';
        this.appBffUrl = (process.env.PREFLIGHT_APP_BFF_URL || 'https://preflight.printprice.pro').replace(/\/+$/, '');
        this.serviceUrl = (process.env.PREFLIGHT_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
        this.internalToken = process.env.PPOS_CONTROL_TOKEN || process.env.PPOS_INTERNAL_SERVICE_TOKEN || 'admin-secret';
        this.timeoutMs = parseInt(process.env.PREFLIGHT_ADMIN_LONG_TIMEOUT_MS || '300000', 10);
    }

    getBaseUrl() {
        return this.mode === 'service' ? this.serviceUrl : this.appBffUrl;
    }

    /**
     * Resolves canonical path depending on mode (supports mapping if service uses /api/preflight vs /api/v2)
     */
    resolvePath(v2Path) {
        // If talking to pure service and it expects /api/preflight instead of /api/v2, map it gracefully
        if (this.mode === 'service' && process.env.PREFLIGHT_SERVICE_FORCE_LEGACY_PREFIX === 'true') {
            return v2Path.replace(/^\/api\/v2/, '/api/preflight');
        }
        return v2Path;
    }

    /**
     * Prepares standard headers propagating context without stripping values
     */
    prepareHeaders(context = {}, customHeaders = {}) {
        const traceId = context.traceId || context['X-Trace-ID'] || `trace_${Date.now()}`;
        const requestId = context.requestId || context['X-Request-ID'] || `req_${Date.now()}`;
        const tenantId = context.tenantId || 'system';
        const printhouseId = context.printhouseId || '';
        const operatorId = context.operatorId || '';
        const policy = context.policy || '';

        return {
            'Authorization': `Bearer ${this.internalToken}`,
            'X-Admin-Api-Key': this.internalToken,
            'X-Request-ID': requestId,
            'X-Trace-ID': traceId,
            'X-Tenant-Id': tenantId,
            'tenantId': tenantId,
            'X-Printhouse-Id': printhouseId,
            'printhouseId': printhouseId,
            'X-Operator-Id': operatorId,
            'operatorId': operatorId,
            'X-Policy': policy,
            'policy': policy,
            'X-Origin-Console': 'Industrial-Preflight-Control-Plane',
            ...customHeaders
        };
    }

    /**
     * Preserves payload completely without destructive normalization
     */
    preservePayload(data) {
        if (!data) return data;
        // Deep clone or return directly to ensure all core fields remain intact
        // Required preserved fields: result, analysis, report, issues, findings, warnings, analysis_warnings, fixes, repairs, applied_fixes, artifacts, forensics, metadata, audit, certification, trace
        return typeof data === 'object' ? Object.assign({}, data) : data;
    }

    async _execute(method, v2Path, data = null, context = {}, responseType = 'json') {
        const targetUrl = `${this.getBaseUrl()}${this.resolvePath(v2Path)}`;
        const isFormData = data instanceof FormData;
        const headers = this.prepareHeaders(context, isFormData ? data.getHeaders() : { 'Content-Type': 'application/json' });

        console.log(`[PREFLIGHT-GATEWAY][${method}] ${targetUrl} (Tenant: ${context.tenantId || 'system'})`);

        try {
            const response = await axios({
                method,
                url: targetUrl,
                data,
                headers,
                timeout: this.timeoutMs,
                responseType
            });

            if (responseType !== 'json') {
                return {
                    data: response.data,
                    headers: response.headers,
                    status: response.status
                };
            }

            return this.preservePayload(response.data);
        } catch (error) {
            const status = error.response?.status || 503;
            const errorPayload = error.response?.data || { message: error.message };
            
            console.error(`[PREFLIGHT-GATEWAY][FAIL-LOUD] Upstream error on ${method} ${targetUrl} (${status}):`, typeof errorPayload === 'object' ? JSON.stringify(errorPayload) : errorPayload);
            
            const gatewayError = new Error(typeof errorPayload === 'object' && errorPayload.message ? errorPayload.message : `Upstream Preflight Contract Error: ${status}`);
            gatewayError.status = status;
            gatewayError.upstreamResponse = errorPayload;
            gatewayError.isUpstream = true;
            throw gatewayError;
        }
    }

    // --- Upstream Canonical V2 Contract Execution ---

    async createJob(fileBuffer, originalFilename, context = {}) {
        const form = new FormData();
        form.append('file', fileBuffer, {
            filename: originalFilename || 'document.pdf',
            contentType: 'application/pdf'
        });
        if (context.policy) form.append('policy', context.policy);
        if (context.tenantId) form.append('tenantId', context.tenantId);
        if (context.type) form.append('type', context.type);

        return this._execute('POST', '/api/v2/jobs', form, context);
    }

    async getJob(jobId, context = {}) {
        return this._execute('GET', `/api/v2/jobs/${encodeURIComponent(jobId)}`, null, context);
    }

    async fixJob(jobId, options = {}, context = {}) {
        return this._execute('POST', `/api/v2/jobs/${encodeURIComponent(jobId)}/actions/fix`, options, context);
    }

    async getArtifact(jobId, artifactId, context = {}) {
        // Prevent directory traversal
        const safeArtifactId = artifactId.replace(/(\.\.[\/\\])/g, '');
        // Returns binary/stream response along with headers for proper proxying
        return this._execute('GET', `/api/v2/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(safeArtifactId)}`, null, context, 'arraybuffer');
    }

    async listPolicies(context = {}) {
        return this._execute('GET', '/api/v2/jobs/policies', null, context);
    }

    async getPolicies(context = {}) {
        const targetPath = this.mode === 'service' ? '/api/preflight/jobs/policies' : '/api/v2/jobs/policies';
        return this._execute('GET', targetPath, null, context);
    }

    async createBatch(formOrPayload, context = {}) {
        // Supports FormData if uploading multiple files directly, or JSON payload
        return this._execute('POST', '/api/v2/batches', formOrPayload, context);
    }

    async listBatches(context = {}) {
        return this._execute('GET', '/api/v2/batches', null, context);
    }

    async getBatch(batchId, context = {}) {
        return this._execute('GET', `/api/v2/batches/${encodeURIComponent(batchId)}`, null, context);
    }

    async getBatchJobs(batchId, context = {}) {
        return this._execute('GET', `/api/v2/batches/${encodeURIComponent(batchId)}/jobs`, null, context);
    }

    async downloadBatch(batchId, context = {}) {
        return this._execute('GET', `/api/v2/batches/${encodeURIComponent(batchId)}/download`, null, context, 'arraybuffer');
    }
}

module.exports = new PreflightContractGateway();
