import { describe, it, expect, beforeEach } from 'vitest';
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test_secret_for_ratelimit_concurrency';
const JWT_AUDIENCE = 'ppos:control';
const JWT_ISSUER = 'https://auth.printprice.pro';

process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = JWT_AUDIENCE;
process.env.JWT_ISSUER = JWT_ISSUER;

const {
    createSlidingWindowRateLimiter,
    createRequestTimeoutGuard,
    applySecurityHeadersAndCors,
    resetRateLimitStore,
    pruneExpiredBuckets,
    getRateLimitStoreSize
} = require('../src/api/middleware/rateLimiter');

const pricingRoutes = require('../src/api/routes/pricingRoutes');
const preflightRoutes = require('../src/api/routes/preflightRoutes');
const marketplacePublicRoutes = require('../src/api/routes/marketplacePublic');

function generateTenantToken(tenantId, role = 'TENANT_ADMIN') {
    return jwt.sign(
        {
            sub: `user-${tenantId}`,
            email: `ops@${tenantId}.local`,
            role,
            tenant_id: tenantId,
            printhouse_id: `ph-${tenantId}`
        },
        JWT_SECRET,
        { audience: JWT_AUDIENCE, issuer: JWT_ISSUER }
    );
}

function dispatchRouter(router, { method = 'POST', url = '/', headers = {}, body = {}, query = {}, user = null, ip = '203.0.113.10' }) {
    const req = {
        method,
        url,
        path: url.split('?')[0],
        headers: { ...headers },
        body,
        query,
        params: {},
        ip,
        user
    };

    return new Promise((resolve) => {
        let isResolved = false;
        const res = {
            statusCode: 200,
            headers: {},
            body: null,
            headersSent: false,
            writableEnded: false,
            _listeners: {},
            on(evt, cb) {
                this._listeners[evt] = this._listeners[evt] || [];
                this._listeners[evt].push(cb);
            },
            _emit(evt) {
                for (const fn of this._listeners[evt] || []) fn();
            },
            setHeader(name, val) {
                this.headers[name] = String(val);
                this.headers[name.toLowerCase()] = String(val);
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                this.headersSent = true;
                this.writableEnded = true;
                this.body = data;
                this._emit('finish');
                if (!isResolved) {
                    isResolved = true;
                    resolve(this);
                }
                return this;
            },
            send(data) {
                this.headersSent = true;
                this.writableEnded = true;
                this.body = data;
                this._emit('finish');
                if (!isResolved) {
                    isResolved = true;
                    resolve(this);
                }
                return this;
            }
        };

        router(req, res, (err) => {
            if (isResolved) return;
            isResolved = true;
            if (err) {
                res.statusCode = err.statusCode || 500;
                res.body = { ok: false, error: err.message };
            }
            resolve(res);
        });
    });
}

describe('Security Hardening, Rate-Limiting Enforcement & Concurrency Isolation', () => {
    beforeEach(() => {
        resetRateLimitStore();
    });

    it('1. Enforces 60 req/min sliding window for unauthenticated IP traffic on BPE quote endpoints (/api/budget/quote) and returns HTTP 429 with mandatory headers', async () => {
        const clientIp = '198.51.100.42';

        // First 60 requests within the 60s window must succeed with HTTP 200
        for (let i = 1; i <= 60; i++) {
            const res = await dispatchRouter(marketplacePublicRoutes, {
                method: 'POST',
                url: '/quote',
                ip: clientIp,
                headers: { 'x-forwarded-for': clientIp },
                body: { copies: 500, interior_pages: 160 }
            });
            expect(res.statusCode).toBe(200);
            expect(res.headers['ratelimit-limit']).toBe('60');
            expect(res.headers['ratelimit-remaining']).toBe(String(60 - i));
        }

        // 61st request from the same anonymous IP must be rejected with HTTP 429
        const burstRes = await dispatchRouter(marketplacePublicRoutes, {
            method: 'POST',
            url: '/quote',
            ip: clientIp,
            headers: { 'x-forwarded-for': clientIp },
            body: { copies: 500, interior_pages: 160 }
        });

        expect(burstRes.statusCode).toBe(429);
        expect(Number(burstRes.headers['retry-after'])).toBeGreaterThanOrEqual(1);
        expect(burstRes.headers['ratelimit-limit']).toBe('60');
        expect(burstRes.headers['ratelimit-remaining']).toBe('0');
        expect(burstRes.headers['ratelimit-reset']).toBeDefined();
        expect(burstRes.body).toMatchObject({
            ok: false,
            error: 'RATE_LIMIT_EXCEEDED'
        });
        expect(burstRes.body.message).toMatch(/Too many requests\. Please retry in \d+s\./);
    });

    it('2. Enforces 15 req/min sliding window on Preflight Ingestion (/api/preflight/ingest) and isolates tenant quotas so Tenant A saturation never blocks Tenant B', async () => {
        const tenantA = { id: 'op-alpha', tenantId: 'tenant-alpha', role: 'PRINTHOUSE_ADMIN' };
        const tenantB = { id: 'op-bravo', tenantId: 'tenant-bravo', role: 'PRINTHOUSE_ADMIN' };
        const sharedProxyIp = '127.0.0.1';

        const samplePdf = Buffer.from(
            '%PDF-1.4\n/MediaBox [0 0 419.53 595.28]\n/TrimBox [8.50 8.50 411.02 586.77]\n/BleedBox [0 0 419.53 595.28]\n%%EOF',
            'latin1'
        );

        // Tenant A sends 15 valid preflight ingestions -> all 15 return HTTP 202 Accepted
        for (let i = 1; i <= 15; i++) {
            const resA = await dispatchRouter(preflightRoutes, {
                method: 'POST',
                url: '/ingest',
                ip: sharedProxyIp,
                user: tenantA,
                body: {
                    jobId: `PF-ALPHA-${i}`,
                    pdfBuffer: samplePdf,
                    pageCount: 128
                }
            });
            expect(resA.statusCode).toBe(202);
            expect(resA.headers['ratelimit-limit']).toBe('15');
            expect(resA.headers['ratelimit-remaining']).toBe(String(15 - i));
        }

        // Tenant A's 16th preflight ingestion is blocked with HTTP 429
        const blockedA = await dispatchRouter(preflightRoutes, {
            method: 'POST',
            url: '/ingest',
            ip: sharedProxyIp,
            user: tenantA,
            body: {
                jobId: 'PF-ALPHA-16',
                pdfBuffer: samplePdf,
                pageCount: 128
            }
        });
        expect(blockedA.statusCode).toBe(429);
        expect(blockedA.body.error).toBe('RATE_LIMIT_EXCEEDED');
        expect(Number(blockedA.headers['retry-after'])).toBeGreaterThanOrEqual(1);

        // Tenant B (even arriving behind the same reverse proxy IP 127.0.0.1) is completely unaffected!
        const allowedB = await dispatchRouter(preflightRoutes, {
            method: 'POST',
            url: '/ingest',
            ip: sharedProxyIp,
            user: tenantB,
            body: {
                jobId: 'PF-BRAVO-1',
                pdfBuffer: samplePdf,
                pageCount: 128
            }
        });
        expect(allowedB.statusCode).toBe(202);
        expect(allowedB.headers['ratelimit-remaining']).toBe('14');
    });

    it('3. Grants authenticated tenants the 600 req/min quota on /api/pricing/calculate and enforces strict CORS & Helmet security headers + timeout protection', async () => {
        const tenantToken = generateTenantToken('tenant-enterprise-1');
        const tenantUser = {
            id: 'user-tenant-enterprise-1',
            tenantId: 'tenant-enterprise-1',
            role: 'TENANT_ADMIN'
        };

        // Verify 65 consecutive requests (> 60 anonymous limit) succeed for authenticated tenant
        for (let i = 1; i <= 65; i++) {
            const res = await dispatchRouter(pricingRoutes, {
                method: 'POST',
                url: '/calculate',
                user: tenantUser,
                headers: {
                    authorization: `Bearer ${tenantToken}`,
                    'x-tenant-id': 'tenant-enterprise-1'
                },
                body: {
                    copies: 1200,
                    pageCount: 240,
                    trimWidthMm: 148,
                    trimHeightMm: 210
                }
            });
            expect(res.statusCode).toBe(200);
            expect(res.headers['ratelimit-limit']).toBe('600');
        }

        // Verify Helmet headers & strict CORS allowlist
        const mockRes = {
            headers: {},
            setHeader(k, v) {
                this.headers[k] = String(v);
            }
        };
        const corsAllowed = applySecurityHeadersAndCors(
            { headers: { origin: 'https://budget.printprice.pro' } },
            mockRes
        );
        expect(corsAllowed.corsAllowed).toBe(true);
        expect(mockRes.headers['Access-Control-Allow-Origin']).toBe('https://budget.printprice.pro');
        expect(mockRes.headers['X-Content-Type-Options']).toBe('nosniff');
        expect(mockRes.headers['X-Frame-Options']).toBe('DENY');
        expect(mockRes.headers['Strict-Transport-Security']).toContain('max-age=31536000');

        const mockEvilRes = {
            headers: {},
            setHeader(k, v) {
                this.headers[k] = String(v);
            }
        };
        const corsBlocked = applySecurityHeadersAndCors(
            { headers: { origin: 'https://evil-attacker.example.com' } },
            mockEvilRes
        );
        expect(corsBlocked.corsAllowed).toBe(false);
        expect(mockEvilRes.headers['Access-Control-Allow-Origin']).toBeUndefined();

        // Verify synchronous timeout protection (using 60ms threshold against 180ms simulated hang)
        const fastTimeoutGuard = createRequestTimeoutGuard(60);
        const timeoutRes = await new Promise((resolve) => {
            const req = { method: 'POST', url: '/calculate' };
            const res = {
                statusCode: 200,
                headersSent: false,
                writableEnded: false,
                on() {},
                status(c) {
                    this.statusCode = c;
                    return this;
                },
                json(payload) {
                    this.headersSent = true;
                    this.writableEnded = true;
                    this.body = payload;
                    resolve(this);
                }
            };
            fastTimeoutGuard(req, res, async () => {
                await new Promise((r) => setTimeout(r, 180));
                if (!req.timedOut) {
                    res.status(200).json({ ok: true });
                }
            });
        });

        expect(timeoutRes.statusCode).toBe(504);
        expect(timeoutRes.body.error).toBe('REQUEST_TIMEOUT');

        // Verify memory store pruning evicts expired windows cleanly
        expect(getRateLimitStoreSize()).toBeGreaterThan(0);
        pruneExpiredBuckets(Date.now() + 120 * 1000);
        expect(getRateLimitStoreSize()).toBe(0);
    });
});

