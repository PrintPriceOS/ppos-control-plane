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
const GEMINI_API_VERSION = 'v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

class AIProviderAdapter {
    constructor() {
        this.timeoutMs = DEFAULT_TIMEOUT_MS;
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
        return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    }

    /**
     * Checks whether AI provider is configured and available.
     * @returns {boolean}
     */
    isAvailable() {
        return Boolean(this.getApiKey());
    }

    /**
     * Generates a structured JSON completion using the configured provider.
     *
     * @param {Object} options
     * @param {string} options.systemInstruction - System instructions defining schema and boundaries
     * @param {string} options.userPrompt - Sanitized user message and context
     * @param {Array} [options.history] - Optional sanitized conversational history
     * @param {string} [options.model] - Target model name override
     * @param {Object} [options.mockResponse] - Optional mock response for testing/isolated execution
     * @returns {Promise<{ rawText: string, json: Object, model: string, usage: Object, latencyMs: number }>}
     */
    async generateStructuredCompletion({
        systemInstruction,
        userPrompt,
        history = [],
        model = null,
        mockResponse = null
    }) {
        const startTime = Date.now();
        const selectedModel = model || this.getConfiguredModel();

        // 1. Support deterministic mock injection for unit/integration tests
        if (mockResponse) {
            const latencyMs = Date.now() - startTime;
            return {
                rawText: typeof mockResponse === 'string' ? mockResponse : JSON.stringify(mockResponse),
                json: typeof mockResponse === 'string' ? JSON.parse(mockResponse) : mockResponse,
                model: 'mock-test-model',
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

        const requestBody = {
            contents,
            systemInstruction: systemInstruction ? {
                parts: [{ text: systemInstruction }]
            } : undefined,
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1
            }
        };

        const targetModel = selectedModel.startsWith('models/') ? selectedModel : `models/${selectedModel}`;
        const url = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/${targetModel}:generateContent?key=${apiKey}`;

        try {
            const response = await axios.post(url, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                timeout: this.timeoutMs
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

            let parsedJson;
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

            const usage = response.data?.usageMetadata || {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
            };

            return {
                rawText: textPart,
                json: parsedJson,
                model: targetModel,
                usage: {
                    promptTokens: usage.promptTokenCount || 0,
                    completionTokens: usage.candidatesTokenCount || 0,
                    totalTokens: usage.totalTokenCount || 0
                },
                latencyMs
            };

        } catch (err) {
            const latencyMs = Date.now() - startTime;

            if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                const timeoutErr = new Error(`AI provider request timed out after ${this.timeoutMs}ms`);
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

                logger.warn('AI provider request failed with error response', sanitizedDiagnostics);

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
