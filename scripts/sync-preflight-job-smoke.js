/**
 * scripts/sync-preflight-job-smoke.js
 * 
 * Programmatic smoke test suite validating the forensic integrity,
 * data normalization, fix bucket derivation, and idempotent upsert behavior
 * of the ControlPlane per-job Preflight Service synchronization mechanism.
 */
const syncService = require('../src/api/services/preflightRegistrySyncService');
const preflightServiceClient = require('../src/api/services/preflightServiceClient');
const db = require('../src/api/services/mysqlClient');

console.log('[REGRESSION-SUITE] Starting Preflight Registry Synchronization Smoke Test...\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✔ [PASS] ${message}`);
        passed++;
    } else {
        console.error(`  ✘ [FAIL] ${message}`);
        failed++;
    }
}

// Intercept external client and DB boundaries for clean deterministic test isolation
const originalGetJob = preflightServiceClient.getJob;
const originalDbQuery = db.query;

let dbQueriesIntercepted = [];
let mockUpstreamPayload = null;

preflightServiceClient.getJob = async (jobId, authHeader, tenantId) => {
    console.log(`  [INTERCEPT] preflightServiceClient.getJob called for ${jobId} (Tenant: ${tenantId})`);
    if (!mockUpstreamPayload) throw new Error(`Mock upstream payload not configured for ${jobId}`);
    return mockUpstreamPayload;
};

db.query = async (sql, params) => {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    dbQueriesIntercepted.push({ sql: cleanSql, params });
    // Simulate successful insertion/update
    return [{ affectedRows: 1 }];
};

async function runSmokeTests() {
    try {
        console.log('--- Test Suite 1: ANALYZE Job Normalization & Preservation ---');
        dbQueriesIntercepted = [];
        mockUpstreamPayload = {
            id: 'job_1778770956950_qtlh7',
            type: 'ANALYZE',
            status: 'COMPLETED',
            tenantId: 'ppos-production-worker',
            document: { name: 'industrial_blueprint.pdf', size: 15485760 },
            summary: { riskScore: 25, riskLevel: 'MEDIUM', issueCount: 3 },
            findings: ['TRIMBOX_MISSING', 'LOW_RESOLUTION_IMAGE', 'RGB_COLORSPACE']
        };

        const resAnalyze = await syncService.syncJob('job_1778770956950_qtlh7', { tenantId: 'ppos-production-worker' });
        
        assert(resAnalyze.ok === true, 'Synchronization completes successfully.');
        assert(resAnalyze.type === 'ANALYZE', 'Job type is extracted correctly.');
        assert(resAnalyze.riskScore === 25, 'Risk score is parsed properly from nested summary.');
        assert(resAnalyze.fixBuckets.applied.length === 0, 'ANALYZE jobs derive an empty applied fixes bucket.');
        
        const upsertQuery = dbQueriesIntercepted.find(q => q.sql.includes('INSERT INTO preflight_job_registry'));
        assert(upsertQuery !== undefined, 'Constructed valid SQL upsert targeting preflight_job_registry.');
        
        // Assert exact parameters matching in the SQL statement
        const params = upsertQuery.params;
        assert(params[0] === 'job_1778770956950_qtlh7', 'SQL param 0 matches job_id.');
        assert(params[6] === 'industrial_blueprint.pdf', 'SQL param 6 resolves original_filename.');
        assert(params[7] === 15485760, 'SQL param 7 resolves file_size_bytes.');
        assert(params[8] === 25, 'SQL param 8 resolves risk_score.');
        assert(typeof params[22] === 'string' && params[22].includes('industrial_blueprint.pdf'), 'SQL param 22 correctly formats canonical_payload_json preservation string.');

        console.log('\n--- Test Suite 2: AUTOFIX Job Granular Fix Bucket Derivation ---');
        dbQueriesIntercepted = [];
        mockUpstreamPayload = {
            id: 'fix_1778770957140',
            sourceJobId: 'job_1778770956950_qtlh7',
            type: 'AUTOFIX',
            status: 'COMPLETED_WITH_WARNINGS',
            tenantId: 'ppos-production-worker',
            original_filename: 'industrial_blueprint_fixed.pdf',
            file_size_bytes: 15240000,
            summaryFlat: { risk_score: 5, risk_level: 'LOW', issue_count: 1 },
            requested_fixes: ['REBUILD_TRIMBOX', 'APPLY_BLEED', 'CONVERT_CMYK', 'INJECT_OUTPUT_INTENT'],
            repairs: [
                { fix: 'REBUILD_TRIMBOX', status: 'APPLIED' },
                { fix: 'APPLY_BLEED', status: 'SKIPPED' },
                { fix: 'CONVERT_CMYK', status: 'FAILED' },
                { fix: 'INJECT_OUTPUT_INTENT', status: 'SUCCESS' }
            ],
            artifacts: [
                { id: 'art_out_001', type: 'OUTPUT', filename: 'industrial_blueprint_fixed.pdf', sizeBytes: 15240000, path: '/store/out/1.pdf' }
            ]
        };

        const resAutofix = await syncService.syncJob('fix_1778770957140', { tenantId: 'ppos-production-worker' });
        
        assert(resAutofix.sourceJobId === 'job_1778770956950_qtlh7', 'Successfully binds source_job_id for forensic lineage tracing.');
        assert(resAutofix.fixBuckets.applied.some(r => r.code === 'REBUILD_TRIMBOX') && resAutofix.fixBuckets.applied.some(r => r.code === 'INJECT_OUTPUT_INTENT'), 'APPLIED and SUCCESS statuses map to applied bucket preserving full objects.');
        assert(resAutofix.fixBuckets.skipped.some(r => r.code === 'APPLY_BLEED'), 'SKIPPED status maps to skipped bucket preserving full objects.');
        assert(resAutofix.fixBuckets.failed.some(r => r.code === 'CONVERT_CMYK'), 'FAILED status maps to failed bucket preserving full objects.');
        
        const artQuery = dbQueriesIntercepted.find(q => q.sql.includes('INSERT IGNORE INTO preflight_artifact_registry'));
        assert(artQuery !== undefined, 'Output artifact records trigger secondary insertion into preflight_artifact_registry.');
        assert(artQuery.params[1] === 'fix_1778770957140', 'Artifact correctly links to associated fix job ID.');

        console.log('\n--- Test Suite 3: Alternate Key Structures & Fallback Buckets ---');
        dbQueriesIntercepted = [];
        mockUpstreamPayload = {
            id: 'fix_alt_999',
            strategy: 'AUTOFIX',
            state: 'COMPLETED',
            applied_fixes: ['APPLY_BLEED'],
            skippedFixes: ['REBUILD_TRIMBOX'],
            failed_fixes: []
        };

        const resAlt = await syncService.syncJob('fix_alt_999');
        assert(resAlt.fixBuckets.applied[0]?.code === 'APPLY_BLEED', 'Extracts direct applied array fallback gracefully.');
        assert(resAlt.fixBuckets.skipped[0]?.code === 'REBUILD_TRIMBOX', 'Extracts camelCase skippedFixes property variant gracefully.');

        console.log('\n==================================================');
        console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log('==================================================\n');

        if (failed > 0) {
            console.error('[CRITICAL] Smoke test failures detected in Preflight Registry Sync mechanism.');
            process.exitCode = 1;
        } else {
            console.log('[SUCCESS] Full payload preservation, metadata mapping, and bucket derivation verified perfectly.');
        }

    } catch (e) {
        console.error('[FATAL] Unhandled test exception:', e);
        process.exitCode = 1;
    } finally {
        // Restore original interfaces
        preflightServiceClient.getJob = originalGetJob;
        db.query = originalDbQuery;
    }
}

runSmokeTests();
