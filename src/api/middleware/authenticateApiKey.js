/**
 * src/api/middleware/authenticateApiKey.js
 *
 * Phase 199A: Self-Service Developer API Key Authentication & Rate-Limiting Middleware.
 * Intercepts incoming requests carrying `Authorization: Bearer pp_(test|live)_...` or `X-API-Key: pp_...`,
 * hashes the incoming key with SHA-256, verifies against `developer_api_keys`, checks granular scopes,
 * and enforces sliding-window rate limits per minute.
 */
const developerApiKeyService = require('../services/developerApiKeyService');

// Sliding window bucket store per API key ID
const slidingWindowStore = new Map();

function checkSlidingWindowRateLimit(keyId, limitPerMinute = 60) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    let timestamps = slidingWindowStore.get(keyId) || [];

    // Filter timestamps within last 60 seconds
    timestamps = timestamps.filter(ts => now - ts < windowMs);

    if (timestamps.length >= limitPerMinute) {
        const oldest = timestamps[0];
        const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
        slidingWindowStore.set(keyId, timestamps);
        return {
            allowed: false,
            limit: limitPerMinute,
            remaining: 0,
            retryAfterSec
        };
    }

    timestamps.push(now);
    slidingWindowStore.set(keyId, timestamps);
    return {
        allowed: true,
        limit: limitPerMinute,
        remaining: Math.max(0, limitPerMinute - timestamps.length),
        retryAfterSec: 0
    };
}

function extractDeveloperApiKey(req) {
    const xApiKey = req.headers?.['x-api-key'];
    if (xApiKey && typeof xApiKey === 'string' && /^pp_(test|live)_/i.test(xApiKey.trim())) {
        return xApiKey.trim();
    }

    const authHeader = req.headers?.['authorization'];
    if (authHeader && typeof authHeader === 'string') {
        const cleaned = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (/^pp_(test|live)_/i.test(cleaned)) {
            return cleaned;
        }
    }

    return null;
}

/**
 * Express / Fastify compatible middleware factory.
 * @param {string|null} requiredScope - Optional scope e.g. 'pricing:read', 'preflight:write', 'orders:create'
 */
function authenticateApiKey(requiredScope = null) {
    return async function apiKeyMiddleware(req, res, next) {
        const rawKey = extractDeveloperApiKey(req);
        if (!rawKey) {
            return res.status(401).json({
                ok: false,
                error: {
                    code: 'API_KEY_REQUIRED',
                    message: 'Missing developer API key. Provide Authorization: Bearer pp_test_... or X-API-Key header.'
                }
            });
        }

        const verification = await developerApiKeyService.verifyRawApiKey(rawKey, requiredScope);
        if (!verification.valid) {
            return res.status(verification.statusCode || 401).json({
                ok: false,
                error: {
                    code: verification.statusCode === 403 ? 'INSUFFICIENT_SCOPE_OR_REVOKED' : 'INVALID_API_KEY',
                    message: verification.error
                }
            });
        }

        const { keyRecord } = verification;
        const rl = checkSlidingWindowRateLimit(keyRecord.id, keyRecord.rateLimitPerMinute || 60);

        if (res.setHeader) {
            res.setHeader('X-RateLimit-Limit', String(rl.limit));
            res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
        }

        if (!rl.allowed) {
            if (res.setHeader) {
                res.setHeader('Retry-After', String(rl.retryAfterSec));
            }
            return res.status(429).json({
                ok: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: `Rate limit of ${rl.limit} requests/minute exceeded for key ${keyRecord.keyPrefix}. Retry after ${rl.retryAfterSec}s.`
                }
            });
        }

        req.apiKey = keyRecord;
        req.user = {
            id: keyRecord.userId,
            tenantId: keyRecord.tenantId,
            role: keyRecord.keyType === 'LIVE' ? 'TENANT_ADMIN' : 'DEVELOPER_SANDBOX',
            scopes: keyRecord.scopes,
            apiKeyId: keyRecord.id,
            keyType: keyRecord.keyType,
            billingTier: keyRecord.billingTier,
            stripeCustomerId: keyRecord.stripeCustomerId || null,
            authMode: 'API_KEY'
        };

        // Phase 199B: Hook into response completion to report metered usage on HTTP 200 for Preflight & Pricing
        const startTimeMs = Date.now();
        const requestPath = req.originalUrl || req.url || '/api/v1';
        const requestMethod = req.method || 'POST';
        const idempotencyHeader = req.headers?.['idempotency-key'] || req.headers?.['x-idempotency-key'] || null;

        if (res && typeof res.on === 'function') {
            res.on('finish', () => {
                const status = res.statusCode || 200;
                if (status === 200 && (requestPath.includes('/api/preflight') || requestPath.includes('/api/pricing'))) {
                    developerApiKeyService.logApiCall({
                        keyRecord,
                        endpoint: requestPath,
                        method: requestMethod,
                        statusCode: status,
                        durationMs: Math.max(1, Date.now() - startTimeMs),
                        idempotencyKey: idempotencyHeader
                    }).catch(() => {});
                }
            });
        }

        if (typeof next === 'function') {
            return next();
        }
    };
}

function _resetRateLimitBuckets() {
    slidingWindowStore.clear();
}

module.exports = authenticateApiKey;
module.exports.authenticateApiKey = authenticateApiKey;
module.exports.extractDeveloperApiKey = extractDeveloperApiKey;
module.exports.checkSlidingWindowRateLimit = checkSlidingWindowRateLimit;
module.exports._resetRateLimitBuckets = _resetRateLimitBuckets;

