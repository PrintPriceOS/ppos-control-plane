'use strict';

/**
 * scripts/benchmark_bpe_concurrency.js
 *
 * PrintPrice OS — BPE Concurrency, Event-Loop Resilience & Rate-Limiting Load Benchmark
 *
 * Parameters:
 * - Concurrency: 50 simultaneous HTTP keep-alive worker connections
 * - Duration: 10 seconds
 * - Target Endpoint: `POST /api/pricing/calculate` & `POST /api/budget/quote`
 * - Traffic Mix:
 *   * 70% Authenticated Multi-Tenant requests (distributed across active tenants, 600 req/min/tenant quota)
 *   * 30% Unauthenticated Anonymous IP bursts (60 req/min/IP quota -> triggers controlled HTTP 429)
 *
 * Metrics Recorded:
 * - Total Requests & Requests Per Second (RPS)
 * - Latency Distribution: Avg, P50, P95, P99 (ms)
 * - HTTP 200 Success Rate vs. Controlled HTTP 429 Rate-Limit Activations (with `Retry-After` verification)
 * - Node.js Process CPU Utilization & Heap Memory Stability
 */

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'benchmark_bpe_concurrency_secret';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_AUDIENCE = 'ppos:control';
process.env.JWT_ISSUER = 'https://auth.printprice.pro';

const { applySecurityHeadersAndCors, resetRateLimitStore } = require('../src/api/middleware/rateLimiter');
const pricingRoutes = require('../src/api/routes/pricingRoutes');
const marketplacePublicRoutes = require('../src/api/routes/marketplacePublic');

const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 50);
const DURATION_SECONDS = Number(process.env.BENCH_DURATION_SEC || 10);

function buildBenchmarkServer() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json({ limit: '2mb' }));

    app.use((req, res, next) => {
        applySecurityHeadersAndCors(req, res);
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const decoded = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET);
                req.user = {
                    id: decoded.sub,
                    tenantId: decoded.tenant_id,
                    role: decoded.role || 'TENANT_ADMIN'
                };
            } catch (_) {
                // Treat as anonymous
            }
        }
        next();
    });

    app.use('/api/pricing', pricingRoutes);
    app.use('/api/budget', marketplacePublicRoutes);
    return http.createServer(app);
}

function percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
    return sortedArr[idx];
}

async function runBenchmark() {
    resetRateLimitStore();
    const server = buildBenchmarkServer();

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    // Pre-generate 25 enterprise tenant tokens (capacity: 25 * 600 = 15,000 req/min)
    // and 8 anonymous IP addresses (capacity: 8 * 60 = 480 req/min -> guaranteed HTTP 429 under load)
    const tenantTokens = Array.from({ length: 25 }, (_, i) => {
        const tenantId = `tenant-bench-${i + 1}`;
        return {
            tenantId,
            token: jwt.sign(
                { sub: `user-${i + 1}`, tenant_id: tenantId, role: 'TENANT_ADMIN' },
                JWT_SECRET,
                { audience: 'ppos:control', issuer: 'https://auth.printprice.pro' }
            )
        };
    });

    const anonIps = Array.from({ length: 8 }, (_, i) => `198.51.100.${10 + i}`);

    const agent = new http.Agent({
        keepAlive: true,
        maxSockets: CONCURRENCY
    });

    const payloadBuffer = Buffer.from(
        JSON.stringify({
            copies: 1500,
            interior_pages: 256,
            pageCount: 256,
            trimWidthMm: 148,
            trimHeightMm: 210,
            interiorPaperGsm: 90,
            bindingType: 'SOFTCOVER_PUR'
        })
    );

    const latenciesMs = [];
    let status200 = 0;
    let status429 = 0;
    let statusOther = 0;
    let verified429Headers = 0;
    let reqCounter = 0;

    const startWallNs = process.hrtime.bigint();
    const startCpu = process.cpuUsage();
    const startMem = process.memoryUsage();
    const deadlineMs = Date.now() + DURATION_SECONDS * 1000;

    function sendSingleRequest() {
        return new Promise((resolve) => {
            const seq = reqCounter++;
            const isAnonTraffic = seq % 10 < 3; // 30% anonymous IP bursts, 70% authenticated tenant pool
            const reqStartNs = process.hrtime.bigint();

            let path = '/api/pricing/calculate';
            const headers = {
                'Content-Type': 'application/json',
                'Content-Length': payloadBuffer.length,
                Origin: 'https://budget.printprice.pro'
            };

            if (isAnonTraffic) {
                path = '/api/budget/quote';
                headers['X-Forwarded-For'] = anonIps[seq % anonIps.length];
            } else {
                const t = tenantTokens[seq % tenantTokens.length];
                headers['Authorization'] = `Bearer ${t.token}`;
                headers['X-Tenant-Id'] = t.tenantId;
            }

            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port,
                    path,
                    method: 'POST',
                    agent,
                    headers
                },
                (res) => {
                    res.on('data', () => {});
                    res.on('end', () => {
                        const elapsedMs = Number(process.hrtime.bigint() - reqStartNs) / 1e6;
                        latenciesMs.push(elapsedMs);
                        if (res.statusCode === 200) {
                            status200++;
                        } else if (res.statusCode === 429) {
                            status429++;
                            if (
                                res.headers['retry-after'] &&
                                res.headers['ratelimit-limit'] &&
                                res.headers['ratelimit-remaining'] === '0'
                            ) {
                                verified429Headers++;
                            }
                        } else {
                            statusOther++;
                        }
                        resolve();
                    });
                }
            );

            req.on('error', () => {
                statusOther++;
                resolve();
            });

            req.write(payloadBuffer);
            req.end();
        });
    }

    async function workerLoop() {
        while (Date.now() < deadlineMs) {
            await sendSingleRequest();
        }
    }

    console.log(
        `[BENCHMARK] Starting BPE Concurrency Benchmark: ${CONCURRENCY} concurrent connections for ${DURATION_SECONDS}s...`
    );

    const workers = Array.from({ length: CONCURRENCY }, () => workerLoop());
    await Promise.all(workers);

    const totalElapsedSec = Number(process.hrtime.bigint() - startWallNs) / 1e9;
    const cpuDelta = process.cpuUsage(startCpu);
    const endMem = process.memoryUsage();

    agent.destroy();
    await new Promise((resolve) => server.close(resolve));

    latenciesMs.sort((a, b) => a - b);
    const totalRequests = latenciesMs.length;
    const rps = totalRequests / totalElapsedSec;
    const avgLatencyMs = latenciesMs.reduce((a, b) => a + b, 0) / (totalRequests || 1);
    const p50Ms = percentile(latenciesMs, 50);
    const p95Ms = percentile(latenciesMs, 95);
    const p99Ms = percentile(latenciesMs, 99);

    const cpuUserMs = cpuDelta.user / 1000;
    const cpuSystemMs = cpuDelta.system / 1000;
    const singleCoreCpuPct = ((cpuUserMs + cpuSystemMs) / (totalElapsedSec * 1000)) * 100;
    const heapDeltaMb = (endMem.heapUsed - startMem.heapUsed) / (1024 * 1024);

    const summary = {
        benchmark: 'PPOS_BPE_CONCURRENCY_AND_RATELIMIT_BENCHMARK',
        parameters: {
            concurrentConnections: CONCURRENCY,
            durationSeconds: Number(totalElapsedSec.toFixed(2)),
            trafficProfile: '70% Authenticated Multi-Tenant (600/min) | 30% Anonymous IP Burst (60/min)'
        },
        throughput: {
            totalRequests,
            requestsPerSecond: Number(rps.toFixed(2))
        },
        latencyMs: {
            avg: Number(avgLatencyMs.toFixed(2)),
            p50: Number(p50Ms.toFixed(2)),
            p95: Number(p95Ms.toFixed(2)),
            p99: Number(p99Ms.toFixed(2))
        },
        statusCodes: {
            http200Ok: status200,
            http429RateLimited: status429,
            http429WithStandardHeaders: verified429Headers,
            httpOtherErrors: statusOther
        },
        processResources: {
            cpuUtilizationSingleCorePct: Number(singleCoreCpuPct.toFixed(1)),
            rssStartMb: Number((startMem.rss / (1024 * 1024)).toFixed(2)),
            rssEndMb: Number((endMem.rss / (1024 * 1024)).toFixed(2)),
            heapStartMb: Number((startMem.heapUsed / (1024 * 1024)).toFixed(2)),
            heapEndMb: Number((endMem.heapUsed / (1024 * 1024)).toFixed(2)),
            heapDeltaMb: Number(heapDeltaMb.toFixed(2))
        }
    };

    console.log(JSON.stringify(summary, null, 2));
}

runBenchmark().catch((err) => {
    console.error('[BENCHMARK-FATAL]', err);
    process.exit(1);
});

