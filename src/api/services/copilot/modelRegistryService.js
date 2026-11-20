'use strict';

/**
 * src/api/services/copilot/modelRegistryService.js
 *
 * Phase 200 — Dynamic Gemini Model Registry & Discovery Service
 *
 * Automatically discovers active Gemini models via @google/genai SDK,
 * maintaining a 6-hour in-memory cache to ensure DOT Copilot always operates
 * on the latest stable models without manual code maintenance.
 */

const { GoogleGenAI } = require('@google/genai');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let cachedRegistry = {
    fast: null,
    reasoning: null,
    modelsList: [],
    lastFetchedAt: 0
};

// Safe fallback aliases if models.list() is unreachable or offline
const FALLBACK_MODELS = {
    fast: 'gemini-3.5-flash-lite',
    reasoning: 'gemini-pro-latest'
};

/**
 * Parses semantic version from model name string, e.g. "gemini-2.5-flash" -> [2, 5]
 */
function parseModelVersion(modelName) {
    const match = modelName.match(/gemini-(\d+)(?:\.(\d+))?/i);
    if (!match) return [0, 0];
    const major = parseInt(match[1], 10) || 0;
    const minor = parseInt(match[2], 10) || 0;
    return [major, minor];
}

/**
 * Compares two models by version descending. Non-experimental/stable precedes preview/exp.
 */
function compareModels(a, b) {
    const [majA, minA] = parseModelVersion(a);
    const [majB, minB] = parseModelVersion(b);

    if (majA !== majB) return majB - majA;
    if (minA !== minB) return minB - minA;

    const isAExp = /(exp|preview)/i.test(a);
    const isBExp = /(exp|preview)/i.test(b);

    if (!isAExp && isBExp) return -1;
    if (isAExp && !isBExp) return 1;

    return a.localeCompare(b);
}

/**
 * Queries Gemini API models.list() and filters for active text/chat models supporting function calling.
 */
async function discoverModels(apiKey) {
    if (!apiKey) {
        return { fast: FALLBACK_MODELS.fast, reasoning: FALLBACK_MODELS.reasoning, models: [] };
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const listResponse = await ai.models.list();
        const models = [];

        // Support both async iterables and arrays from SDK list()
        if (listResponse && typeof listResponse[Symbol.asyncIterator] === 'function') {
            for await (const m of listResponse) {
                models.push(m);
            }
        } else if (Array.isArray(listResponse?.models)) {
            models.push(...listResponse.models);
        } else if (Array.isArray(listResponse)) {
            models.push(...listResponse);
        }

        const validModels = models.filter(m => {
            const name = (m.name || m.id || '').toLowerCase();
            // Must be a gemini model
            if (!name.includes('gemini')) return false;

            // Exclude embedding, audio/tts, image/vision-only, video
            if (/(embedding|imagen|veo|tts|audio|whisper|robotics|learnlm|medlm)/i.test(name)) {
                return false;
            }

            // Exclude deprecated models (e.g. gemini-1.x, gemini-2.0, gemini-2.5) to enforce latest cost-effective models
            if (/gemini-(1\.|2\.)/i.test(name)) {
                return false;
            }

            // Must support generateContent
            if (m.supportedActions && Array.isArray(m.supportedActions)) {
                if (!m.supportedActions.includes('generateContent')) return false;
            }

            return true;
        }).map(m => {
            const raw = m.name || m.id || '';
            return raw.replace(/^models\//, '');
        });

        // Find flash-lite models first for fast/economic profile
        const liteModels = validModels
            .filter(name => /flash.*lite|lite.*flash/i.test(name))
            .sort(compareModels);

        // Find general flash models
        const flashModels = validModels
            .filter(name => /flash/i.test(name))
            .sort(compareModels);

        // Find pro models
        const proModels = validModels
            .filter(name => /pro/i.test(name))
            .sort(compareModels);

        const chosenFast = liteModels[0] || flashModels[0] || FALLBACK_MODELS.fast;
        const chosenReasoning = proModels[0] || flashModels[0] || FALLBACK_MODELS.reasoning;

        return {
            fast: chosenFast,
            reasoning: chosenReasoning,
            models: validModels
        };
    } catch (err) {
        console.warn('[ModelRegistryService] Dynamic discovery warning, using resilient fallbacks:', err.message);
        return {
            fast: FALLBACK_MODELS.fast,
            reasoning: FALLBACK_MODELS.reasoning,
            models: []
        };
    }
}

/**
 * Resolves the optimal Gemini model for a given execution profile ('fast' | 'reasoning').
 * 
 * @param {'fast' | 'reasoning'} profile 
 * @param {string} [apiKeyOverride]
 * @returns {Promise<string>}
 */
async function resolveGeminiModel(profile = 'fast', apiKeyOverride = null) {
    // 1. Check environment overrides
    if (profile === 'fast' && process.env.GEMINI_MODEL_FAST) {
        return process.env.GEMINI_MODEL_FAST.trim();
    }
    if (profile === 'reasoning' && process.env.GEMINI_MODEL_PRO) {
        return process.env.GEMINI_MODEL_PRO.trim();
    }

    const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    // 2. Check in-memory cache validity
    const now = Date.now();
    if (cachedRegistry.lastFetchedAt > 0 && (now - cachedRegistry.lastFetchedAt) < CACHE_TTL_MS) {
        return profile === 'reasoning' ? cachedRegistry.reasoning : cachedRegistry.fast;
    }

    // 3. Perform dynamic discovery
    const discovery = await discoverModels(apiKey);

    cachedRegistry = {
        fast: discovery.fast,
        reasoning: discovery.reasoning,
        modelsList: discovery.models,
        lastFetchedAt: now
    };

    return profile === 'reasoning' ? cachedRegistry.reasoning : cachedRegistry.fast;
}

/**
 * Clears the registry cache (useful for testing or on-demand cache refresh).
 */
function clearCache() {
    cachedRegistry = {
        fast: null,
        reasoning: null,
        modelsList: [],
        lastFetchedAt: 0
    };
}

/**
 * Returns current snapshot of discovered models and cache state.
 */
function getRegistryState() {
    return {
        ...cachedRegistry,
        ttlRemainingMs: Math.max(0, CACHE_TTL_MS - (Date.now() - cachedRegistry.lastFetchedAt))
    };
}

module.exports = {
    resolveGeminiModel,
    clearCache,
    getRegistryState,
    FALLBACK_MODELS,
    compareModels,
    parseModelVersion
};
