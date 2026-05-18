/**
 * Preflight Contract Gateway
 *
 * Acts as the precise, unmocked bridge to the V2 canonical contract.
 * Supports either APP/BFF mode or internal service mode.
 * Defaults to local service mode for Control Plane industrial preflight execution.
 * Guarantees zero destructive normalization while propagating full industrial actor context.
 */
const axios = require('axios');
const FormData = require('form-data');

class PreflightContractGateway {
    constructor() {
        this.mode = process.env.PREFLIGHT_CONTRACT_MODE || 'service';

        this.appBffUrl = (
            process.env.PREFLIGHT_APP_BFF_URL ||
            process.env.PPOS_PREFLIGHT_SERVICE_URL ||
            'http://127.0.0.1:8001'
        ).replace(/\/+$/, '');

        this.serviceUrl = (
            process.env.PPOS_PREFLIGHT_SERVICE_URL ||
            process.env.PREFLIGHT_SERVICE_URL ||
            process.env.PREFLIGHT_API_BASE_URL ||
            'http://127.0.0.1:8001'
        ).replace(/\/+$/, '');

        this.internalToken = (
            process.env.PPOS_INTERNAL_SERVICE_TOKEN ||
            process.env.PREFLIGHT_SERVICE_TOKEN ||
            process.env.PPOS_CONTROL_TOKEN ||
            ''
        );

        this.timeoutMs = parseInt(process.env.PREFLIGHT_ADMIN_LONG_TIMEOUT_MS || '300000', 10);
    }

    getBaseUrl() {
        return this.mode === 'service' ? this.serviceUrl : this.appBffUrl;
    }

    resolvePath(v2Path) {
        if (this.mode === 'service' || process.env.PREFLIGHT_SERVICE_FORCE_LEGACY_PREFIX === 'true') {
            return v2Path.replace(/^\/api\/v2/, '/api/preflight');
        }

        return v2Path;
    }

    prepareHeaders(context = {}, customHeaders = {}) {
        const traceId = context.traceId || context['X-Trace-ID'] || `trace_${Date.now()}`;
        const requestId = context.requestId || context['X-Request-ID'] || `req_${Date.now()}`;
        const tenantId = context.tenantId || 'system';
        const printhouseId = context.printhouseId || '';
        const operatorId = context.operatorId || '';
        const policy = context.policy || '';

        const headers = {
            'X-Admin-Api-Key': this.internalToken,
            'X-Request-ID': requestId,
            'X-Trace-ID': traceId,
            'X-Tenant-Id': tenantId,
            tenantId,
            'X-Printhouse-Id': printhouseId,
            printhouseId,
            'X-Operator-Id': operatorId,
            operatorId,
            'X-Policy': policy,
            policy,
            'X-Origin-Console': 'Industrial-Preflight-Control-Plane',
            ...customHeaders
        };

        const tokenToUse = this.internalToken || context.token || (context.Authorization || '').replace(/^Bearer\s+/i, '') || '';
        if (tokenToUse && tokenToUse !== 'null' && tokenToUse !== 'undefined') {
            headers.Authorization = `Bearer ${tokenToUse}`;
        }

        return headers;
    }

    preservePayload(data) {
        if (!data) return data;
        return typeof data === 'object' ? Object.assign({}, data) : data;
    }

    async _execute(method, v2Path, data = null, context = {}, responseType = 'json') {
        const targetUrl = `${this.getBaseUrl()}${this.resolvePath(v2Path)}`;
        const isFormData = data instanceof FormData;

        const headers = this.prepareHeaders(
            context,
            isFormData ? data.getHeaders() : { 'Content-Type': 'application/json' }
        );

        const safeAuthPrefix = headers.Authorization ? `${headers.Authorization.substr(0, 12)}...[len=${headers.Authorization.length}]` : 'NONE';
        console.log(
            `[PREFLIGHT-GATEWAY][AUDIT] Outbound Gateway Request Context:\n` +
            `  • Target: ${method} ${targetUrl}\n` +
            `  • Mode: ${this.mode}\n` +
            `  • Auth Header Present: ${!!headers.Authorization} (Masked: ${safeAuthPrefix})\n` +
            `  • Tenant Scope: ${context.tenantId || 'system'}\n` +
            `  • Operator Scope: ${context.operatorId || 'N/A'}\n` +
            `  • Trace Block ID: ${headers['X-Trace-ID']}`
        );

        try {
            const response = await axios({
                method,
                url: targetUrl,
                data,
                headers,
                timeout: this.timeoutMs,
                responseType,
                validateStatus: (status) => status >= 200 && status < 300
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

            console.error(
                `[PREFLIGHT-GATEWAY][FAIL-LOUD] Upstream error on ${method} ${targetUrl} (${status}):`,
                typeof errorPayload === 'object' ? JSON.stringify(errorPayload) : errorPayload
            );

            const gatewayError = new Error(
                typeof errorPayload === 'object' && errorPayload.message
                    ? errorPayload.message
                    : `Upstream Preflight Contract Error: ${status}`
            );

            gatewayError.status = status;
            gatewayError.upstreamResponse = errorPayload;
            gatewayError.isUpstream = true;
            throw gatewayError;
        }
    }

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
        return this._execute(
            'POST',
            `/api/v2/jobs/${encodeURIComponent(jobId)}/actions/fix`,
            options,
            context
        );
    }

    async getArtifact(jobId, artifactId, context = {}) {
        const safeArtifactId = String(artifactId || '').replace(/(\.\.[/\\])/g, '');

        return this._execute(
            'GET',
            `/api/v2/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(safeArtifactId)}`,
            null,
            context,
            'arraybuffer'
        );
    }

    async listPolicies(context = {}) {
        return this._execute('GET', '/api/v2/jobs/policies', null, context);
    }

    async getPolicies(context = {}) {
        return this.listPolicies(context);
    }

    async createBatch(formOrPayload, context = {}) {
        return this._execute('POST', '/api/v2/batches', formOrPayload, context);
    }

    async listBatches(context = {}) {
        return this._execute('GET', '/api/v2/batches', null, context);
    }

    async getBatch(batchId, context = {}) {
        return this._execute('GET', `/api/v2/batches/${encodeURIComponent(batchId)}`, null, context);
    }

    async getBatchJobs(batchId, context = {}) {
        return this._execute(
            'GET',
            `/api/v2/batches/${encodeURIComponent(batchId)}/jobs`,
            null,
            context
        );
    }

    async downloadBatch(batchId, context = {}) {
        return this._execute(
            'GET',
            `/api/v2/batches/${encodeURIComponent(batchId)}/download`,
            null,
            context,
            'arraybuffer'
        );
    }
}

module.exports = new PreflightContractGateway();