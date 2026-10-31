/**
 * src/api/services/aiProviderAdapter.js
 *
 * Phase 193E.2 — Unified Server-Side AI Provider Adapter
 *
 * Responsibilities ONLY:
 * 1. Invokes configured AI provider (Gemini via standard REST API).
 * 2. Enforces hard timeout (15s).
 * 3. Normalizes provider errors into canonical domain codes.
 * 4. Extracts and parses structured JSON content.
 * 5. Strictly zero domain pricing or mutation logic.
 * 6. Sourced from server-side environment variables only (never exposed to client).
 */
const axios = require('axios');
const logger = require('./logger').child('ai-provider-adapter');

const DEFAULT_TIMEOUT_MS = 15000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;
const GEMINI_API_VERSION = 'v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

class AIProviderAdapter {
    constructor() {
        this._overrideTimeoutMs = undefined;
    }

    /**
     * Retrieves and validates the configured AI timeout in milliseconds.
     * Checks PPOS_AI_TIMEOUT_MS environment variable with fallback to DEFAULT_TIMEOUT_MS (15000ms).
     * Validates that timeout is an integer between 1000 and 120000 ms.
     * @returns {number}
     */
    getTimeoutMs() {
        if (this._overrideTimeoutMs !== undefined && this._overrideTimeoutMs !== null) {
            return this._overrideTimeoutMs;
        }

        const raw = process.env.PPOS_AI_TIMEOUT_MS;
        if (raw === undefined || raw === null || String(raw).trim() === '') {
            return DEFAULT_TIMEOUT_MS;
        }

        const val = String(raw).trim();
        if (!/^\d+$/.test(val)) {
            const err = new Error(`Invalid PPOS_AI_TIMEOUT_MS configuration: "${raw}". Must be an integer between 1000 and 120000 ms.`);
            err.code = 'INVALID_AI_TIMEOUT_CONFIG';
            err.statusCode = 500;
            throw err;
        }

        const num = parseInt(val, 10);
        if (num < MIN_TIMEOUT_MS || num > MAX_TIMEOUT_MS) {
            const err = new Error(`Invalid PPOS_AI_TIMEOUT_MS configuration: ${num}. Must be an integer between 1000 and 120000 ms.`);
            err.code = 'INVALID_AI_TIMEOUT_CONFIG';
            err.statusCode = 500;
            throw err;
        }

        return num;
    }

    get timeoutMs() {
        return this.getTimeoutMs();
    }

    set timeoutMs(val) {
        this._overrideTimeoutMs = val;
    }

    /**
     * Retrieves the configured API key from server environment.
     * @returns {string|null}
     */
    getApiKey() {
        return process.env.GEMINI_API_KEY || process.env.PPOS_GEMINI_API_KEY || null;
    }

    /**
     * Retrieves the configured model name with fallback to DEFAULT_GEMINI_MODEL.
     * @returns {string}
     */
    getConfiguredModel() {
        return process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    }

    /**
     * Checks whether AI provider is configured and available.
     * @returns {boolean}
     */
    isAvailable() {
        return Boolean(this.getApiKey());
    }

    /**
     * Plain-text / structured completion helper for decisions/evaluations.
     * Returns rawText output from generateStructuredCompletion while honoring maxTokens and temperature.
     */
    async complete({ prompt, maxTokens = 100, temperature = 0.1, model = null }) {
        const result = await this.generateStructuredCompletion({
            userPrompt: prompt,
            model,
            maxTokens,
            temperature,
            responseMimeType: null
        });
        return result.rawText;
    }

    /**
     * Generates a structured JSON completion using the configured provider.
     *
     * @param {Object} options
     * @param {string} [options.systemInstruction] - System instructions defining schema and boundaries
     * @param {string} options.userPrompt - Sanitized user message and context
     * @param {Array} [options.history] - Optional sanitized conversational history
     * @param {string} [options.model] - Target model name override
     * @param {Object} [options.mockResponse] - Optional mock response for testing/isolated execution
     * @param {number} [options.maxTokens] - Max tokens to generate
     * @param {number} [options.temperature] - Sampling temperature
     * @param {string|null} [options.responseMimeType] - Response mime type ('application/json' or null)
     * @returns {Promise<{ rawText: string, json: Object, model: string, provider: string, isFallback: boolean, usage: Object, latencyMs: number }>}
     */
    async generateStructuredCompletion({
        systemInstruction,
        userPrompt,
        history = [],
        model = null,
        mockResponse = null,
        maxTokens = null,
        temperature = 0.1,
        responseMimeType = 'application/json'
    }) {
        const startTime = Date.now();
        const selectedModel = model || this.getConfiguredModel();
        const effectiveTimeoutMs = this.getTimeoutMs();

        // 1. Support deterministic mock injection for unit/integration tests
        if (mockResponse) {
            const latencyMs = Date.now() - startTime;
            const text = typeof mockResponse === 'string' ? mockResponse : JSON.stringify(mockResponse);
            let parsed = null;
            try {
                parsed = typeof mockResponse === 'string' ? JSON.parse(mockResponse) : mockResponse;
            } catch {
                parsed = null;
            }
            return {
                rawText: text,
                json: parsed,
                model: 'mock-test-model',
                provider: 'mock',
                isFallback: true,
                usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
                latencyMs
            };
        }

        const apiKey = this.getApiKey();
        if (!apiKey) {
            const err = new Error('AI provider is not configured. Missing GEMINI_API_KEY.');
            err.code = 'AI_PROVIDER_UNAVAILABLE';
            err.statusCode = 503;
            throw err;
        }

        // 2. Format Gemini payload
        const contents = [];

        // Add history turns (sanitized manager / assistant pairs)
        if (Array.isArray(history)) {
            for (const item of history) {
                if (item && item.role && item.text) {
                    contents.push({
                        role: item.role === 'user' ? 'user' : 'model',
                        parts: [{ text: String(item.text) }]
                    });
                }
            }
        }

        // Add current user prompt
        contents.push({
            role: 'user',
            parts: [{ text: userPrompt }]
        });

        const generationConfig = {
            temperature: typeof temperature === 'number' ? temperature : 0.1
        };
        if (responseMimeType) {
            generationConfig.responseMimeType = responseMimeType;
        }
        if (typeof maxTokens === 'number' && maxTokens > 0) {
            generationConfig.maxOutputTokens = maxTokens;
        }

        const requestBody = {
            contents,
            systemInstruction: systemInstruction ? {
                parts: [{ text: systemInstruction }]
            } : undefined,
            generationConfig
        };

        const targetModel = selectedModel.startsWith('models/') ? selectedModel : `models/${selectedModel}`;
        const url = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/${targetModel}:generateContent?key=${apiKey}`;

        try {
            const response = await axios.post(url, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                timeout: effectiveTimeoutMs
            });

            const latencyMs = Date.now() - startTime;
            const candidate = response.data?.candidates?.[0];
            const textPart = candidate?.content?.parts?.[0]?.text;

            if (!textPart) {
                const err = new Error('Empty response from AI provider');
                err.code = 'AI_RESPONSE_INVALID';
                err.statusCode = 502;
                throw err;
            }

            let parsedJson = null;
            if (responseMimeType === 'application/json') {
                try {
                    // Strip markdown code fences if model enclosed JSON
                    const sanitized = textPart.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
                    parsedJson = JSON.parse(sanitized);
                } catch (pErr) {
                    const err = new Error(`Failed to parse AI response as JSON: ${pErr.message}`);
                    err.code = 'AI_STRUCTURED_OUTPUT_INVALID';
                    err.statusCode = 502;
                    err.rawText = textPart;
                    throw err;
                }
            } else {
                try {
                    const sanitized = textPart.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
                    parsedJson = JSON.parse(sanitized);
                } catch {
                    parsedJson = null;
                }
            }

            const usage = response.data?.usageMetadata || {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
            };

            return {
                rawText: textPart,
                json: parsedJson,
                model: targetModel,
                provider: 'gemini',
                isFallback: false,
                usage: {
                    promptTokens: usage.promptTokenCount || 0,
                    completionTokens: usage.candidatesTokenCount || 0,
                    totalTokens: usage.totalTokenCount || 0
                },
                latencyMs
            };

        } catch (err) {
            const latencyMs = Date.now() - startTime;

            if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
                const timeoutDiagnostics = {
                    model: targetModel,
                    timeoutMs: effectiveTimeoutMs,
                    latencyMs
                };

                logger.warn({
                    event: 'ai_provider_timeout',
                    message: `AI provider request timed out after ${effectiveTimeoutMs}ms`,
                    metadata: timeoutDiagnostics
                });

                const timeoutErr = new Error(`AI provider request timed out after ${effectiveTimeoutMs}ms`);
                timeoutErr.code = 'AI_PROVIDER_TIMEOUT';
                timeoutErr.statusCode = 504;
                timeoutErr.latencyMs = latencyMs;
                throw timeoutErr;
            }

            if (err.response) {
                const status = err.response.status;
                const errorData = err.response.data?.error || {};

                // Sanitized diagnostics (NO secrets, NO prompts, NO headers)
                const sanitizedDiagnostics = {
                    provider: 'Google Gemini',
                    apiVersion: GEMINI_API_VERSION,
                    model: targetModel,
                    httpStatus: status,
                    providerCode: errorData.code || status,
                    providerStatus: errorData.status || 'UNKNOWN',
                    providerMessage: errorData.message || 'Error reported by provider'
                };

                logger.warn({
                    event: 'ai_provider_error',
                    message: 'AI provider request failed with error response',
                    metadata: sanitizedDiagnostics
                });

                if (status === 429) {
                    const rateErr = new Error('AI provider rate limit exceeded');
                    rateErr.code = 'AI_RATE_LIMITED';
                    rateErr.statusCode = 429;
                    rateErr.diagnostics = sanitizedDiagnostics;
                    rateErr.latencyMs = latencyMs;
                    throw rateErr;
                }

                const providerErr = new Error(`AI provider returned HTTP ${status}: ${sanitizedDiagnostics.providerStatus}`);
                providerErr.code = 'AI_PROVIDER_UNAVAILABLE';
                providerErr.statusCode = 503;
                providerErr.diagnostics = sanitizedDiagnostics;
                providerErr.latencyMs = latencyMs;
                throw providerErr;
            }

            if (!err.code || !err.code.startsWith('AI_')) {
                err.code = 'AI_PROVIDER_UNAVAILABLE';
                err.statusCode = 503;
            }
            err.latencyMs = latencyMs;
            throw err;
        }
    }
}

module.exports = new AIProviderAdapter();
