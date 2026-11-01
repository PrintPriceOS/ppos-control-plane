'use strict';

/**
 * tests/load_resilience_e2e_harness.js
 *
 * PrintPrice OS — E2E Load, Stress & Resilience Harness (Option B)
 *
 * Evaluates 5 critical operational vectors across `budget.printprice.pro` (BFF)
 * and `control.printprice.pro` (`ppos-control-plane`):
 *
 * Vector 1: BFF & BPE Parametric Pricing + Checkout Session Saturation
 *           (Scenario 1 Baseline: 10 concurrent users, 50 sequential/concurrent ops)
 * Vector 2: Concurrent Binary PDF Ingestion (I/O & Memory Pressure - 5 MB synthetic PDF payloads)
 *           (Scenario 3 Heavy I/O: 15 simultaneous binary PDF uploads + SHA-256 verification)
 * Vector 3: Parallel 3D Soft-Proof Cryptographic Sign-Off & Escrow Lock Race Conditions
 *           (Scenario 2 Spike: 50 concurrent sign-off approvals & atomic readiness updates)
 * Vector 4: Simultaneous Normative Document & Vector PDF Generation
 *           (200 rapid requests across DIN A4 Imprimatur PDF, Facturae 3.2.2 XML, XRechnung 3.0 XML & POD PDF)
 * Vector 5: Transactional Notification Outbox Throughput (with real-time PDF attachment generation)
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const BUDGET_BASE_URL = process.env.LOAD_BUDGET_URL || 'http://127.0.0.1:3001';
const CONTROL_BASE_URL = process.env.LOAD_CONTROL_URL || 'http://127.0.0.1:3200';
const MARKETPLACE_TOKEN =
    process.env.PPOS_MARKETPLACE_INTAKE_TOKEN ||
    process.env.PPOS_CONTROL_TOKEN ||
    'ppos-dev-secret-2026';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 120 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 120, rejectUnauthorized: false });

/**
 * High-precision HTTP client returning status, latencyMs, and body buffer.
 */
function requestRaw(urlStr, { method = 'GET', headers = {}, body = null, timeoutMs = 20000 } = {}) {
    return new Promise(resolve => {
        const start = performance.now();
        const parsed = new URL(urlStr);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const reqHeaders = { ...headers };
        let payloadBuf = null;
        if (body !== null && body !== undefined) {
            payloadBuf = Buffer.isBuffer(body)
                ? body
                : typeof body === 'string'
                ? Buffer.from(body, 'utf8')
                : Buffer.from(JSON.stringify(body), 'utf8');
            if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
                reqHeaders['Content-Type'] = 'application/json';
            }
            reqHeaders['Content-Length'] = String(payloadBuf.length);
        }

        const req = lib.request(
            {
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port || (isHttps ? 443 : 80),
                path: parsed.pathname + parsed.search,
                method,
                headers: reqHeaders,
                agent: isHttps ? httpsAgent : httpAgent,
                timeout: timeoutMs
            },
            res => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => {
                    const latencyMs = performance.now() - start;
                    const buffer = Buffer.concat(chunks);
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        latencyMs,
                        bytes: buffer.length,
                        buffer
                    });
                });
            }
        );

        req.on('timeout', () => {
            req.destroy(new Error('REQUEST_TIMEOUT'));
        });

        req.on('error', err => {
            const latencyMs = performance.now() - start;
            resolve({
                ok: false,
                status: 0,
                error: err.message,
                latencyMs,
                bytes: 0,
                buffer: Buffer.alloc(0)
            });
        });

        if (payloadBuf) {
            req.write(payloadBuf);
        }
        req.end();
    });
}

/**
 * Executes `totalRequests` tasks with a fixed worker pool of `concurrency` workers.
 */
async function runConcurrentPool(totalRequests, concurrency, taskFn) {
    const results = new Array(totalRequests);
    let cursor = 0;
    const t0 = performance.now();

    async function worker() {
        while (true) {
            const idx = cursor++;
            if (idx >= totalRequests) break;
            results[idx] = await taskFn(idx);
        }
    }

    const workers = [];
    const actualConcurrency = Math.min(concurrency, totalRequests);
    for (let w = 0; w < actualConcurrency; w++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    const totalDurationSec = (performance.now() - t0) / 1000;

    const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
    const successCount = results.filter(r => r.ok).length;
    const errorCount = totalRequests - successCount;
    const avgMs = latencies.reduce((acc, v) => acc + v, 0) / (latencies.length || 1);
    const p50Ms = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95Ms = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99Ms = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const rps = totalRequests / (totalDurationSec || 0.001);

    return {
        totalRequests,
        concurrency: actualConcurrency,
        successCount,
        errorCount,
        errorPct: Number(((errorCount / totalRequests) * 100).toFixed(2)),
        avgMs: Number(avgMs.toFixed(2)),
        p50Ms: Number(p50Ms.toFixed(2)),
        p95Ms: Number(p95Ms.toFixed(2)),
        p99Ms: Number(p99Ms.toFixed(2)),
        throughputRps: Number(rps.toFixed(2)),
        totalDurationSec: Number(totalDurationSec.toFixed(2)),
        results
    };
}

/**
 * Generates a realistic 5 MB synthetic PDF binary buffer in memory for Heavy I/O testing.
 */
function buildSyntheticPdfBuffer(sizeMb = 5) {
    const targetBytes = Math.round(sizeMb * 1024 * 1024);
    const header = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\nstream\n', 'latin1');
    const footer = Buffer.from('\nendstream\n%%EOF\n', 'latin1');
    const bodyLen = Math.max(1024, targetBytes - header.length - footer.length);
    const body = Buffer.alloc(bodyLen, 0x41); // 'A' stream padding
    return Buffer.concat([header, body, footer]);
}

async function main() {
    const authHeaders = {
        'x-marketplace-token': MARKETPLACE_TOKEN,
        'x-ppos-role': 'CUSTOMER',
        'x-customer-email': 'produccion@editorial-planeta.es',
        'x-ppos-user-email': 'produccion@editorial-planeta.es',
        'x-ppos-tenant-id': 'tenant-editorial-planeta'
    };

    const summaryRows = [];

    // =========================================================================
    // VECTOR 1: BFF & BPE Parametric Pricing + Checkout Session Saturation
    // Scenario 1 (Baseline): 10 concurrent users, 50 operations
    // =========================================================================
    const v1Stats = await runConcurrentPool(50, 10, async idx => {
        if (idx % 2 === 0) {
            return requestRaw(`${BUDGET_BASE_URL}/api/customer/orders/ORD_2026_101/reorder`, {
                method: 'POST',
                headers: authHeaders,
                body: {
                    copies: 500 + (idx % 5) * 250,
                    bookTitle: `Load Test Edition #${idx}`,
                    reprintPurpose: 'STRAIGHT_REPRINT',
                    reuseApprovedFiles: true
                }
            });
        }
        return requestRaw(`${BUDGET_BASE_URL}/api/marketplace/orders/ORD_2026_103/checkout/session`, {
            method: 'POST',
            headers: authHeaders,
            body: {
                paymentMethod: idx % 4 === 0 ? 'BANK_TRANSFER_B2B' : 'STRIPE_CARD',
                modality: 'MODALITY_A_ESCROW_MOR',
                amountGrossCents: 307840,
                currency: 'EUR',
                customerEmail: 'produccion@editorial-planeta.es'
            }
        });
    });
    summaryRows.push({
        vector: 'V1: BFF Reprint Pricing & Checkout Sessions',
        ...v1Stats
    });

    // =========================================================================
    // VECTOR 2: Concurrent Binary PDF Ingestion (Heavy I/O - 5 MB PDFs -> base64)
    // Scenario 3 (Heavy I/O): 15 simultaneous binary uploads
    // =========================================================================
    const pdf5MbBase64 = buildSyntheticPdfBuffer(5).toString('base64');
    const v2Stats = await runConcurrentPool(15, 15, async idx => {
        const role = idx % 2 === 0 ? 'INTERIOR_PDF' : 'COVER_PDF';
        return requestRaw(`${CONTROL_BASE_URL}/api/marketplace/orders/ORD_2026_102/files/upload`, {
            method: 'POST',
            headers: authHeaders,
            timeoutMs: 30000,
            body: {
                role,
                originalName: `HeavyIO_Test_${idx}_${role}.pdf`,
                mimeType: 'application/pdf',
                contentBase64: pdf5MbBase64
            }
        });
    });
    summaryRows.push({
        vector: 'V2: Heavy I/O Binary PDF Ingestion (15x 5MB)',
        ...v2Stats
    });

    // =========================================================================
    // VECTOR 3: Parallel 3D Soft-Proof Cryptographic Sign-Off & Escrow Lock
    // Scenario 2 (Spike): 50 concurrent users signing off simultaneously
    // =========================================================================
    const v3Stats = await runConcurrentPool(50, 50, async idx => {
        return requestRaw(`${BUDGET_BASE_URL}/api/customer/orders/ORD_2026_103/soft-proof/approve`, {
            method: 'POST',
            headers: authHeaders,
            body: {
                comments: `Concurrent Spike Sign-Off #${idx}`,
                approvedBy: 'produccion@editorial-planeta.es',
                geometry: {
                    trimWidthMm: 170,
                    trimHeightMm: 240,
                    spineThicknessMm: 15.2,
                    bleedMarginMm: 3.0,
                    hardcoverOverhangMm: 0
                }
            }
        });
    });
    summaryRows.push({
        vector: 'V3: Spike 3D Soft-Proof SHA-256 & Escrow Lock',
        ...v3Stats
    });

    // =========================================================================
    // VECTOR 4: Simultaneous Normative Document & Vector PDF Generation (200 reqs, 50 conc)
    // =========================================================================
    const v4Stats = await runConcurrentPool(200, 50, async idx => {
        const mod = idx % 4;
        if (mod === 0) {
            return requestRaw(
                `${BUDGET_BASE_URL}/api/customer/orders/ORD_2026_103/soft-proof/certificate.pdf`,
                { headers: authHeaders }
            );
        }
        if (mod === 1) {
            return requestRaw(
                `${BUDGET_BASE_URL}/api/financials/escrow/ORD_2026_101/e-invoice.xml?format=FACTURAE_3_2_2&raw=true`,
                { headers: authHeaders }
            );
        }
        if (mod === 2) {
            return requestRaw(
                `${BUDGET_BASE_URL}/api/financials/escrow/ORD_2026_101/e-invoice.xml?format=XRECHNUNG_3_0&raw=true`,
                { headers: authHeaders }
            );
        }
        return requestRaw(
            `${BUDGET_BASE_URL}/api/logistics/shipments/SHP-ORD_2026_101/delivery-note/pdf`,
            { headers: authHeaders }
        );
    });
    summaryRows.push({
        vector: 'V4: Vector PDF (Imprimatur/POD) & EN 16931 XML',
        ...v4Stats
    });

    // =========================================================================
    // VECTOR 5: Transactional Notification Outbox Throughput (50 reqs, 25 conc)
    // =========================================================================
    const v5Stats = await runConcurrentPool(50, 25, async idx => {
        const templates = [
            'IMPRIMATUR_SIGNED_ESCROW_LOCKED',
            'ASSETS_READY_FOR_3D_PROOF',
            'ORDER_SHIPPED_POD_DISPATCH'
        ];
        return requestRaw(`${BUDGET_BASE_URL}/api/customer/orders/ORD_2026_103/notifications/send`, {
            method: 'POST',
            headers: authHeaders,
            body: {
                templateId: templates[idx % templates.length],
                recipientEmail: 'produccion@editorial-planeta.es',
                forceSimulate: true
            }
        });
    });
    summaryRows.push({
        vector: 'V5: Transactional SMTP Outbox & PDF Attach',
        ...v5Stats
    });

    const output = {
        timestamp: new Date().toISOString(),
        targetBudgetUrl: BUDGET_BASE_URL,
        targetControlUrl: CONTROL_BASE_URL,
        harnessProcessMemoryMb: {
            rss: Number((process.memoryUsage().rss / 1048576).toFixed(2)),
            heapUsed: Number((process.memoryUsage().heapUsed / 1048576).toFixed(2))
        },
        summary: summaryRows.map(({ results, ...rest }) => rest)
    };

    console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
    main().catch(err => {
        console.error('HARNESS_FATAL:', err);
        process.exit(1);
    });
}

module.exports = { runConcurrentPool, buildSyntheticPdfBuffer };
