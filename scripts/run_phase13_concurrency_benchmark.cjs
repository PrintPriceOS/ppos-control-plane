'use strict';

/**
 * scripts/run_phase13_concurrency_benchmark.cjs
 *
 * Non-destructive concurrent load & latency benchmark (50 concurrent workers × 40 batches = 2,000 operations)
 * across the core mathematical and XML generation engines of Phases 11, 12, and 13:
 *   1. PHASE-11A: Spine Geometry & Preflight Inspection (`inspectEditorialPdf`)
 *   2. PHASE-11B: Signature Decomposition & Creep (`planImpositionJob`)
 *   3. PHASE-12B: CIP4 JDF 1.7 XML Ticket Generation (`generateJdfJobTicketXml`)
 *   4. PHASE-13A: Real-Time Executive Profitability (`calculateExecutiveProfitabilitySummary`)
 *   5. PHASE-13B: EN 16931 Electronic Invoicing XML (`generateElectronicInvoiceXml` Facturae 3.2.2 & XRechnung 3.0)
 */

const { performance } = require('perf_hooks');
const { inspectPreflightJob } = require('../src/api/services/preflight/preflightEngineService');
const { planImpositionJob } = require('../src/api/services/manufacturing/impositionEngineService');
const { generateJdfJobTicketXml } = require('../src/api/services/manufacturing/jdfConnectorService');
const {
    calculateExecutiveProfitabilitySummary,
    generateElectronicInvoiceXml
} = require('../src/api/services/financials/eInvoicingService');

function percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
    return Number(sortedArr[idx].toFixed(3));
}

async function runConcurrentWorkload(name, fn, concurrency = 50, iterationsPerWorker = 10) {
    const latenciesMs = [];
    let errors = 0;
    const t0 = performance.now();

    const workers = Array.from({ length: concurrency }, async (_, wIdx) => {
        for (let i = 0; i < iterationsPerWorker; i++) {
            const start = performance.now();
            try {
                await Promise.resolve(fn(wIdx, i));
            } catch (_) {
                errors++;
            }
            latenciesMs.push(performance.now() - start);
        }
    });

    await Promise.all(workers);
    const totalDurationMs = performance.now() - t0;
    latenciesMs.sort((a, b) => a - b);

    const totalOps = concurrency * iterationsPerWorker;
    const opsPerSec = Math.round((totalOps / totalDurationMs) * 1000);

    return {
        engine: name,
        concurrency,
        totalOps,
        errors,
        errorRatePct: Number(((errors / totalOps) * 100).toFixed(2)),
        throughputOpsPerSec: opsPerSec,
        p50Ms: percentile(latenciesMs, 50),
        p95Ms: percentile(latenciesMs, 95),
        p99Ms: percentile(latenciesMs, 99),
        totalDurationMs: Number(totalDurationMs.toFixed(1))
    };
}

async function main() {
    console.log('=== [BENCHMARK] PrintPriceOS Phase 11–13 Concurrent Stress Test (50 Workers) ===');
    const results = [];

    results.push(
        await runConcurrentWorkload('PHASE-11A · Spine & Preflight Engine', () =>
            inspectPreflightJob({
                pageCount: 240,
                paperGrammage: 90,
                paperBulk: 1.3,
                bindingType: 'SOFTCOVER_PUR',
                declaredCoverSpineMm: 14.54,
                detectedBleedMm: 3.0,
                maxTacPct: 285
            })
        )
    );

    results.push(
        await runConcurrentWorkload('PHASE-11B · Dynamic Imposition & Creep', (w, i) =>
            planImpositionJob({
                jobId: `BENCH-${w}-${i}`,
                pageCount: 240,
                copies: 3000,
                sheetFormat: 'B1',
                bindingType: 'SADDLE_STITCH'
            })
        )
    );

    results.push(
        await runConcurrentWorkload('PHASE-12B · CIP4 JDF 1.7 XML Generator', (w, i) =>
            generateJdfJobTicketXml({
                jobId: `JDF-${w}-${i}`,
                totalPages: 240,
                printRunCopies: 3000,
                machineFormatCode: 'B1'
            })
        )
    );

    results.push(
        await runConcurrentWorkload('PHASE-13A · Real-Time Profitability Engine', () =>
            calculateExecutiveProfitabilitySummary('tenant-bench')
        )
    );

    results.push(
        await runConcurrentWorkload('PHASE-13B · EN 16931 Facturae/XRechnung XML', (w, i) =>
            generateElectronicInvoiceXml({
                orderId: 'PUB-ORD-2026-103',
                format: i % 2 === 0 ? 'FACTURAE_3_2_2' : 'XRECHNUNG_3_0',
                tenantId: 'tenant-bench'
            })
        )
    );

    console.table(results);
    const totalErrors = results.reduce((acc, r) => acc + r.errors, 0);
    if (totalErrors > 0) {
        process.exit(1);
    }
    console.log('=== [BENCHMARK PASSED] 2,500 concurrent operations completed with 0% error rate ===');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
