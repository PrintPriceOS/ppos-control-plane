'use strict';

/**
 * src/api/middleware/rateLimiter.js
 *
 * PrintPrice OS — Security Hardening, Sliding-Window Rate Limiting & Request Timeout Guard
 *
 * Architectural Guarantees:
 * 1. Sliding-Window Rate Limiting:
 *    - BPE Pricing & Budget Search (`/api/pricing/calculate`, `/api/pricing/calibrate`,
 *      `/api/pricing/book-estimate`, `/api/budget/paper/search`, `/api/budget/quote`):
 *      * Unauthenticated / Anonymous IP: 60 requests / minute.
 *      * Authenticated Tenants (`tenantId` / `userId` / API Key): 600 requests / minute.
 *    - Preflight Ingestion & Inspection (`/api/preflight/ingest`, `/api/preflight/inspect`):
 *      * Strictly capped at 15 upload/inspection requests / minute per tenant or IP.
 * 2. Strict Tenant & IP Isolation:
 *    - Authenticated requests are keyed by `tenant:${tenantId}` (or `user:${userId}`),
 *      preventing one tenant's burst from starving other tenants or shared proxy IPs.
 *    - Unauthenticated requests resolve the real client IP via `X-Forwarded-For` (trust proxy = 1)
 *      or socket remoteAddress (`ip:${clientIp}`).
 * 3. Standardized HTTP 429 Too Many Requests Response:
 *    - Mandatory headers on all rate-limited responses:
 *      `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
 *      (plus legacy `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).
 *    - Normalized JSON payload:
 *      `{ ok: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please retry in {seconds}s.' }`
 * 4. Automatic Memory Store Pruning:
 *    - Periodic unref'd background sweep + deterministic on-access eviction prevents memory leaks
 *      in long-running production processes.
 * 5. HTTP Hardening & Request Timeout Protection:
 *    - Strict CORS origin allowlist (`https://budget.printprice.pro`, `https://control.printprice.pro`,
 *      `https://docs.printprice.pro` + localhost dev only when non-production).
 *    - Helmet-grade security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
 *      `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`).
 *    - Synchronous BPE calculation timeout guard (default 15,000 ms) returning `HTTP 504 Gateway Timeout`
 *      if a calculation hangs.
 */

const jwt = require('jsonwebtoken');

const DEFAULT_WINDOW_MS = 60 * 1000; // 60 seconds sliding window
const DEFAULT_BPE_ANON_LIMIT = 60; // 60 req/min for anonymous / IP
const DEFAULT_BPE_TENANT_LIMIT = 600; // 600 req/min for authenticated tenants
const DEFAULT_PREFLIGHT_LIMIT = 15; // 15 req/min for preflight PDF ingestion/inspection
const DEFAULT_BPE_TIMEOUT_MS = 15 * 1000; // 15 seconds synchronous BPE timeout

const ALLOWED_CORS_ORIGINS = new Set([
    'https://budget.printprice.pro',
    'https://control.printprice.pro',
    'https://docs.printprice.pro'
]);

const LOCAL_DEV_CORS_ORIGINS = new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173'
]);

// Map<bucketKey, { timestamps: number[], lastSeen: number, windowMs: number }>
const slidingWindowStore = new Map();

/**
 * Periodically purges expired sliding-window entries from memory to prevent leaks.
 */
function pruneExpiredBuckets(now = Date.now()) {
    for (const [key, entry] of slidingWindowStore.entries()) {
        const windowMs = entry.windowMs || DEFAULT_WINDOW_MS;
        if (now - entry.lastSeen > windowMs) {
            slidingWindowStore.delete(key);
            continue;
        }
        entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
        if (entry.timestamps.length === 0) {
            slidingWindowStore.delete(key);
        }
    }
}

const cleanupTimer = setInterval(() => {
    pruneExpiredBuckets(Date.now());
}, 30 * 1000);
if (cleanupTimer && typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
}

/**
 * Extracts the real client IP respecting reverse proxy (`trust proxy = 1` / `X-Forwarded-For`).
 */
function resolveClientIp(req) {
    const xff = req?.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim().length > 0) {
        const firstHop = xff.split(',')[0].trim();
        if (firstHop) return firstHop;
    }
    const xRealIp = req?.headers?.['x-real-ip'];
    if (typeof xRealIp === 'string' && xRealIp.trim().length > 0) {
        return xRealIp.trim();
    }
    return (
        req?.ip ||
        req?.socket?.remoteAddress ||
        req?.connection?.remoteAddress ||
        '127.0.0.1'
    );
}

/**
 * Resolves whether the request carries a verified authenticated tenant/user identity
 * vs. an unauthenticated anonymous IP.
 *
 * Security Invariant:
 * - Never trusts an unverified `x-tenant-id` header alone to grant the 600 req/min tier
 *   unless `req.user` is already populated or a valid signed JWT / API key is verified.
 */
function resolveRateLimitIdentity(req) {
    // 1. Pre-verified user object populated by Fastify/Express auth hook or unit test harness
    const user = req?.user || req?.raw?.user;
    if (user && (user.tenantId || user.id || user.userId)) {
        const tenantKey = user.tenantId || user.id || user.userId;
        return {
            isAuthenticated: true,
            subjectKey: `tenant:${String(tenantKey)}`,
            tenantId: String(user.tenantId || tenantKey),
            actorId: String(user.id || user.userId || tenantKey)
        };
    }

    // 2. Check Authorization Bearer JWT if Middleware runs before auth hook
    const authHeader = req?.headers?.['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const rawToken = authHeader.slice(7).trim();
        const jwtSecret = process.env.JWT_SECRET;
        if (rawToken && jwtSecret && !/^pp_(test|live)_/i.test(rawToken)) {
            try {
                const decoded = jwt.verify(rawToken, jwtSecret);
                if (decoded && (decoded.tenant_id || decoded.tenantId || decoded.sub)) {
                    const tId = String(decoded.tenant_id || decoded.tenantId || decoded.sub);
                    return {
                        isAuthenticated: true,
                        subjectKey: `tenant:${tId}`,
                        tenantId: tId,
                        actorId: String(decoded.sub || tId)
                    };
                }
            } catch (_) {
                // Invalid token falls back to anonymous IP rate limit
            }
        }
    }

    // 3. Anonymous / Unauthenticated traffic -> keyed by Client IP
    const clientIp = resolveClientIp(req);
    return {
        isAuthenticated: false,
        subjectKey: `ip:${clientIp}`,
        tenantId: null,
        clientIp
    };
}

/**
 * Evaluates a sliding window rate limit for a given bucket key.
 */
function evaluateSlidingWindow({ bucketKey, limit, windowMs = DEFAULT_WINDOW_MS, now = Date.now() }) {
    const safeLimit = Math.max(1, Number(limit) || DEFAULT_BPE_ANON_LIMIT);
    let entry = slidingWindowStore.get(bucketKey);

    if (!entry) {
        entry = {
            timestamps: [],
            lastSeen: now,
            windowMs
        };
        slidingWindowStore.set(bucketKey, entry);
    }

    entry.lastSeen = now;
    // Evict timestamps outside the sliding window
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

    if (entry.timestamps.length >= safeLimit) {
        const oldestTs = entry.timestamps[0] || now;
        const resetMs = Math.max(1000, windowMs - (now - oldestTs));
        const retryAfterSec = Math.max(1, Math.ceil(resetMs / 1000));
        const resetEpochSec = Math.ceil((now + resetMs) / 1000);

        return {
            allowed: false,
            limit: safeLimit,
            remaining: 0,
            retryAfterSec,
            resetSec: retryAfterSec,
            resetEpochSec
        };
    }

    entry.timestamps.push(now);
    const remaining = Math.max(0, safeLimit - entry.timestamps.length);
    const oldestTs = entry.timestamps[0] || now;
    const resetMs = Math.max(1000, windowMs - (now - oldestTs));
    const resetSec = Math.max(1, Math.ceil(resetMs / 1000));
    const resetEpochSec = Math.ceil((now + resetMs) / 1000);

    return {
        allowed: true,
        limit: safeLimit,
        remaining,
        retryAfterSec: 0,
        resetSec,
        resetEpochSec
    };
}

/**
 * Attaches standardized IETF RateLimit headers to Express `res` or Fastify `reply`.
 */
function setRateLimitHeaders(resOrReply, evaluation) {
    const setHdr = (name, val) => {
        if (!resOrReply) return;
        if (typeof resOrReply.setHeader === 'function') {
            resOrReply.setHeader(name, String(val));
        } else if (typeof resOrReply.header === 'function') {
            resOrReply.header(name, String(val));
        }
    };

    setHdr('RateLimit-Limit', evaluation.limit);
    setHdr('RateLimit-Remaining', evaluation.remaining);
    setHdr('RateLimit-Reset', evaluation.resetSec);
    setHdr('X-RateLimit-Limit', evaluation.limit);
    setHdr('X-RateLimit-Remaining', evaluation.remaining);
    setHdr('X-RateLimit-Reset', evaluation.resetEpochSec);

    if (!evaluation.allowed) {
        setHdr('Retry-After', evaluation.retryAfterSec);
    }
}

/**
 * Formats the canonical 429 payload required by the security policy:
 * `{ ok: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please retry in {seconds}s.' }`
 */
function buildRateLimitExceededPayload(retryAfterSec, extra = {}) {
    const seconds = Math.max(1, Number(retryAfterSec) || 1);
    return {
        ok: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Please retry in ${seconds}s.`,
        retryAfterSeconds: seconds,
        ...extra
    };
}

/**
 * Creates an Express/Fastify middleware enforcing sliding-window rate limits.
 *
 * @param {Object} options
 * @param {string} [options.namespace='global']
 * @param {number} [options.windowMs=60000]
 * @param {number} [options.unauthenticatedLimit=60]
 * @param {number} [options.authenticatedLimit=600]
 * @param {number} [options.fixedLimit=null] - If set, applies this limit regardless of auth state (e.g. 15 for preflight)
 */
function createSlidingWindowRateLimiter(options = {}) {
    const namespace = options.namespace || 'api';
    const windowMs = Number(options.windowMs) || DEFAULT_WINDOW_MS;
    const unauthenticatedLimit = Number(options.unauthenticatedLimit) || DEFAULT_BPE_ANON_LIMIT;
    const authenticatedLimit = Number(options.authenticatedLimit) || DEFAULT_BPE_TENANT_LIMIT;
    const fixedLimit = options.fixedLimit !== undefined && options.fixedLimit !== null ? Number(options.fixedLimit) : null;

    return function slidingWindowRateLimiterMiddleware(req, res, next) {
        const identity = resolveRateLimitIdentity(req);
        const effectiveLimit =
            fixedLimit !== null
                ? fixedLimit
                : identity.isAuthenticated
                  ? authenticatedLimit
                  : unauthenticatedLimit;

        const bucketKey = `${namespace}::${identity.subjectKey}`;
        const evaluation = evaluateSlidingWindow({
            bucketKey,
            limit: effectiveLimit,
            windowMs
        });

        setRateLimitHeaders(res, evaluation);

        if (!evaluation.allowed) {
            const payload = buildRateLimitExceededPayload(evaluation.retryAfterSec, {
                limit: evaluation.limit,
                remaining: 0,
                scope: identity.isAuthenticated ? 'TENANT' : 'IP'
            });
            if (res && typeof res.status === 'function') {
                const statusRes = res.status(429);
                if (typeof statusRes.json === 'function') {
                    return statusRes.json(payload);
                }
                if (typeof statusRes.send === 'function') {
                    return statusRes.send(payload);
                }
            }
            return payload;
        }

        if (typeof next === 'function') {
            return next();
        }
    };
}

/**
 * Pre-configured BPE & Budget Rate Limiter:
 * - Unauthenticated / IP: 60 req / min
 * - Authenticated Tenant: 600 req / min
 */
const bpePricingRateLimiter = createSlidingWindowRateLimiter({
    namespace: 'bpe-pricing',
    windowMs: DEFAULT_WINDOW_MS,
    unauthenticatedLimit: DEFAULT_BPE_ANON_LIMIT,
    authenticatedLimit: DEFAULT_BPE_TENANT_LIMIT
});

/**
 * Pre-configured Preflight Ingestion / Inspection Rate Limiter:
 * - 15 req / min per IP or Tenant
 */
const preflightIngestRateLimiter = createSlidingWindowRateLimiter({
    namespace: 'preflight-ingest',
    windowMs: DEFAULT_WINDOW_MS,
    fixedLimit: DEFAULT_PREFLIGHT_LIMIT
});

/**
 * Enforces strict request execution timeout (default 15,000 ms for synchronous BPE calculations)
 * to prevent hung requests and memory leaks.
 */
function createRequestTimeoutGuard(timeoutMs = DEFAULT_BPE_TIMEOUT_MS) {
    const safeTimeoutMs = Math.max(50, Number(timeoutMs) || DEFAULT_BPE_TIMEOUT_MS);

    return function requestTimeoutGuardMiddleware(req, res, next) {
        let timedOut = false;

        const clearGuard = () => clearTimeout(timer);

        if (res && typeof res.on === 'function') {
            res.on('finish', clearGuard);
            res.on('close', clearGuard);
        }

        // Wrap json/send BEFORE setting timer so if timeout fires, it can still send 504 cleanly
        const origJson = res && typeof res.json === 'function' ? res.json.bind(res) : null;
        const origSend = res && typeof res.send === 'function' ? res.send.bind(res) : null;

        if (origJson) {
            res.json = function wrappedJson(data) {
                clearGuard();
                if (timedOut) return res;
                return origJson(data);
            };
        }
        if (origSend) {
            res.send = function wrappedSend(data) {
                clearGuard();
                if (timedOut) return res;
                return origSend(data);
            };
        }

        const timer = setTimeout(() => {
            timedOut = true;
            req.timedOut = true;
            if (res && !res.headersSent && !res.writableEnded) {
                const payload = {
                    ok: false,
                    error: 'REQUEST_TIMEOUT',
                    message: `Synchronous calculation exceeded maximum execution threshold of ${safeTimeoutMs}ms.`
                };
                if (typeof res.status === 'function') {
                    res.status(504);
                }
                if (origJson) {
                    origJson(payload);
                } else if (origSend) {
                    origSend(payload);
                }
            }
        }, safeTimeoutMs);

        if (timer && typeof timer.unref === 'function') {
            timer.unref();
        }

        if (typeof next === 'function') {
            return next();
        }
    };
}

/**
 * Applies Helmet-equivalent defensive security headers and strict CORS origin checks.
 */
function applySecurityHeadersAndCors(req, resOrReply) {
    const setHdr = (name, val) => {
        if (!resOrReply) return;
        if (typeof resOrReply.setHeader === 'function') {
            resOrReply.setHeader(name, String(val));
        } else if (typeof resOrReply.header === 'function') {
            resOrReply.header(name, String(val));
        }
    };

    // Helmet Defensive Security Headers
    setHdr('X-Content-Type-Options', 'nosniff');
    setHdr('X-Frame-Options', 'DENY');
    setHdr('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    setHdr('X-XSS-Protection', '0');
    setHdr('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Strict CORS Origin Validation
    const origin = req?.headers?.['origin'];
    if (origin) {
        const isProd = process.env.NODE_ENV === 'production';
        const isAllowed =
            ALLOWED_CORS_ORIGINS.has(origin) ||
            (!isProd && LOCAL_DEV_CORS_ORIGINS.has(origin));

        if (isAllowed) {
            setHdr('Access-Control-Allow-Origin', origin);
            setHdr('Vary', 'Origin');
            setHdr('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            setHdr(
                'Access-Control-Allow-Headers',
                'Content-Type, Authorization, X-API-Key, X-Tenant-Id, X-Sandbox-Tenant, Idempotency-Key, X-Trace-Id'
            );
            setHdr(
                'Access-Control-Expose-Headers',
                'Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset'
            );
            setHdr('Access-Control-Allow-Credentials', 'true');
            return { corsAllowed: true, origin };
        }
        return { corsAllowed: false, origin };
    }

    return { corsAllowed: true, origin: null };
}

function resetRateLimitStore() {
    slidingWindowStore.clear();
}

function getRateLimitStoreSize() {
    return slidingWindowStore.size;
}

module.exports = {
    DEFAULT_WINDOW_MS,
    DEFAULT_BPE_ANON_LIMIT,
    DEFAULT_BPE_TENANT_LIMIT,
    DEFAULT_PREFLIGHT_LIMIT,
    DEFAULT_BPE_TIMEOUT_MS,
    ALLOWED_CORS_ORIGINS,
    resolveClientIp,
    resolveRateLimitIdentity,
    evaluateSlidingWindow,
    setRateLimitHeaders,
    buildRateLimitExceededPayload,
    createSlidingWindowRateLimiter,
    bpePricingRateLimiter,
    preflightIngestRateLimiter,
    createRequestTimeoutGuard,
    applySecurityHeadersAndCors,
    pruneExpiredBuckets,
    resetRateLimitStore,
    getRateLimitStoreSize
};
