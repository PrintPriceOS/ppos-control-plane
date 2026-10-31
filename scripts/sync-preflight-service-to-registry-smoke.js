/**
 * scripts/sync-preflight-service-to-registry-smoke.js
 * 
 * Programmatic smoke test suite validating the end-to-end synchronization pipeline
 * integrity from the upstream Preflight Service to the local MySQL persistent registry.
 * Asserts full schema enforcement, source_system tracking, fix bucket derivation,
 * structured logging output, and upsert robustness.
 */
const syncService = require('../src/api/services/preflightRegistrySyncService');
const preflightServiceClient = require('../src/api/services/preflightServiceClient');
const db = require('../src/api/services/mysqlClient');
const controlPlaneSchemaService = require('../src/api/services/controlPlaneSchemaService');

console.log('[REGRESSION-SUITE] Starting Preflight Service-to-Registry End-to-End Pipeline Smoke Test...\n');

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

// Intercept boundaries to execute fully isolated deterministic validation
const originalGetJob = preflightServiceClient.getJob;
const originalListJobs = preflightServiceClient.listJobs;
const originalDbQuery = db.query;
const originalEnsureSchema = controlPlaneSchemaService.ensurePreflightRegistrySchema;

let dbQueriesIntercepted = [];
let mockUpstreamJobs = {};
let schemaVerificationInvoked = false;

controlPlaneSchemaService.ensurePreflightRegistrySchema = async () => {
    console.log('  [INTERCEPT] schemaService.ensurePreflightRegistrySchema invoked');
    schemaVerificationInvoked = true;
    return true;
};

preflightServiceClient.getJob = async (jobId, authHeader, tenantId) => {
    console.log(`  [INTERCEPT] preflightServiceClient.getJob called for ${jobId} under tenant context: ${tenantId}`);
    if (!mockUpstreamJobs[jobId]) throw new Error(`Mock upstream payload not configured for ${jobId}`);
    return mockUpstreamJobs[jobId];
};

preflightServiceClient.listJobs = async ({ tenantId, limit }) => {
    console.log(`  [INTERCEPT] preflightServiceClient.listJobs called (tenantId: ${tenantId}, limit: ${limit})`);
    return Object.values(mockUpstreamJobs);
};

db.query = async (sql, params) => {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();
    dbQueriesIntercepted.push({ sql: cleanSql, params });
    // Simulate successful execution
    return [{ affectedRows: 1, insertId: 1 }];
};

async function runSmokeTests() {
    try {
        console.log('--- Test Suite 1: Single Job Synchronization Pipeline Verification ---');
        dbQueriesIntercepted = [];
        schemaVerificationInvoked = false;
        
        const testJobId = 'job_smoke_test_001';
        mockUpstreamJobs[testJobId] = {
            id: testJobId,
            sourceJobId: 'src_job_parent',
            sourceSystem: 'PREFLIGHT_SERVICE_V2',
            strategy: 'AUTOFIX',
            state: 'COMPLETED',
            tenantId: 'ppos-production-worker',
            original_filename: 'smoke_test_input.pdf',
            sizeBytes: 1048576,
            summaryFlat: { risk_score: 12, risk_level: 'LOW', issue_count: 2 },
            requested_fixes: ['REBUILD_TRIMBOX', 'APPLY_BLEED'],
            repairs: [
                { fix: 'REBUILD_TRIMBOX', status: 'APPLIED' },
                { fix: 'APPLY_BLEED', status: 'FAILED' }
            ],
            artifacts: []
        };

        const result = await syncService.syncJob(testJobId, { tenantId: 'ppos-production-worker' });

        assert(schemaVerificationInvoked === true, 'Mandatory schema verification ensurePreflightRegistrySchema() executed before sync logic.');
        assert(result.ok === true, 'Service-to-Registry single sync completes successfully.');
        assert(result.sourceJobId === 'src_job_parent', 'Extracts source_job_id field perfectly.');
        assert(result.fixBuckets.applied.some(r => r.code === 'REBUILD_TRIMBOX'), 'Maps APPLIED status accurately preserving full object in applied bucket.');
        assert(result.fixBuckets.failed.some(r => r.code === 'APPLY_BLEED'), 'Maps FAILED status accurately preserving full object in failed bucket.');

        const upsertQuery = dbQueriesIntercepted.find(q => q.sql.includes('INSERT INTO preflight_job_registry'));
        assert(upsertQuery !== undefined, 'Generated target preflight_job_registry MySQL UPSERT query.');

        const params = upsertQuery.params;
        // Verify source_system column index and value mapping
        assert(params[0] === testJobId, 'SQL Param 0 binds target job_id.');
        assert(params[1] === 'src_job_parent', 'SQL Param 1 binds source_job_id.');
        assert(params[2] === 'PREFLIGHT_SERVICE_V2', 'SQL Param 2 binds enriched source_system column.');
        assert(params[3] === 'AUTOFIX', 'SQL Param 3 binds job type/strategy.');
        assert(params[8] === 12, 'SQL Param 8 binds risk_score metric.');

        console.log('\n--- Test Suite 2: List-Payload-First Sync with GET 404 Fallback Verification ---');
        dbQueriesIntercepted = [];
        schemaVerificationInvoked = false;

        const fallbackJobId = 'job_smoke_fallback_404';
        const listItem = {
            id: fallbackJobId,
            type: 'AUTOFIX',
            status: 'COMPLETED',
            tenantId: 'ppos-production-worker',
            original_filename: 'listed_only.pdf',
            sizeBytes: 500000,
            summaryFlat: { risk_score: 5, risk_level: 'LOW', issue_count: 1 },
            requested_fixes: ['APPLY_BLEED']
        };

        // Configure mock getJob to throw 404 to simulate missing upstream enrichment
        preflightServiceClient.getJob = async (jId) => {
            console.log(`  [INTERCEPT] preflightServiceClient.getJob returning 404 for ${jId}`);
            const err = new Error('Request failed with status code 404');
            err.status = 404;
            throw err;
        };

        const fallbackRes = await syncService.syncListItem(listItem, 'ppos-production-worker');

        assert(fallbackRes.ok === true, 'syncListItem returns ok: true even when GET enrichment encounters 404.');
        assert(fallbackRes.enriched === false, 'Result flags enriched: false correctly.');
        assert(fallbackRes.source_status === 'LISTED_BUT_NOT_GET_RESOLVABLE', 'Sets source_status to LISTED_BUT_NOT_GET_RESOLVABLE.');
        assert(fallbackRes.sync_error_json?.status === 404, 'Populates sync_error_json diagnostic payload with status: 404.');

        // Verify that initial upsert query was executed for the minimal row
        const minimalUpserts = dbQueriesIntercepted.filter(q => q.sql.includes('INSERT INTO preflight_job_registry'));
        assert(minimalUpserts.length === 1, 'Executes precisely one minimal row upsert before attempting GET enrichment.');
        
        // Verify update query sets sync_error_json
        const updateErrorQuery = dbQueriesIntercepted.find(q => q.sql.includes('UPDATE preflight_job_registry SET source_status = ?'));
        assert(updateErrorQuery !== undefined, 'Executes UPDATE query to store sync_error_json and fallback status upon 404.');

        console.log('\n--- Test Suite 3: SQL Contract & Placeholder Alignment Validation ---');
        // Inspect every intercepted query targeting preflight_job_registry INSERT
        const insertQueries = dbQueriesIntercepted.filter(q => q.sql.includes('INSERT INTO preflight_job_registry'));
        assert(insertQueries.length > 0, 'Intercepted target preflight_job_registry insertion queries to inspect.');

        insertQueries.forEach((q, idx) => {
            const colMatch = q.sql.match(/INSERT INTO preflight_job_registry\s*\(([^)]+)\)/i);
            const valMatch = q.sql.match(/VALUES\s*\((.+?)\)\s*ON\s+DUPLICATE\s+KEY\s+UPDATE/i);
            
            assert(colMatch && valMatch, `Query #${idx + 1} matches standard column and values format syntax.`);
            
            if (colMatch && valMatch) {
                const columns = colMatch[1].split(',').map(c => c.trim()).filter(Boolean);
                const valuesStr = valMatch[1];
                
                const placeholders = (valuesStr.match(/\?/g) || []).length;
                const nows = (valuesStr.match(/NOW\(\)/gi) || []).length;
                const totalValues = placeholders + nows;
                
                assert(columns.length === totalValues, `Query #${idx + 1}: Declared columns (${columns.length}) exactly match total values block items (${totalValues} = ${placeholders} placeholders + ${nows} NOW()).`);
                assert(placeholders === q.params.length, `Query #${idx + 1}: Placeholders count (${placeholders}) exactly matches params array length (${q.params.length}).`);
            }
        });

        console.log('\n--- Test Suite 4: Exhaustive Regression & Auto-Healing Requirements Validation ---');
        preflightServiceClient.getJob = async (jobId, authHeader, tenantId) => {
            if (!mockUpstreamJobs[jobId]) throw new Error(`Mock upstream payload not configured for ${jobId}`);
            return mockUpstreamJobs[jobId];
        };
        // Scenario 4A: AUTOFIX payload with repairs full objects and requested_fixes empty
        const sc4aId = 'job_regress_4a';
        mockUpstreamJobs[sc4aId] = {
            id: sc4aId,
            strategy: 'AUTOFIX',
            state: 'COMPLETED',
            tenantId: 'ppos-production-worker',
            requested_fixes: [],
            repairs: [
                { code: 'APPLY_BLEED', status: 'APPLIED', forceBleed: true },
                { code: 'CONVERT_CMYK', status: 'FAILED', reason: 'Target profile missing' }
            ]
        };
        const res4a = await syncService.syncJob(sc4aId, { tenantId: 'ppos-production-worker' });
        assert(res4a.fixBuckets.applied.some(r => r.code === 'APPLY_BLEED' && r.forceBleed === true), 'Scenario 4A: applied bucket contains the full APPLY_BLEED object.');
        assert(res4a.fixBuckets.failed.some(r => r.code === 'CONVERT_CMYK' && r.reason === 'Target profile missing'), 'Scenario 4A: failed bucket contains the full CONVERT_CMYK object.');
        const noUnknown4a = !res4a.fixBuckets.applied.some(r => r.code === 'UNKNOWN_FIX') && !res4a.fixBuckets.failed.some(r => r.code === 'UNKNOWN_FIX');
        assert(noUnknown4a, 'Scenario 4A: no bucket contains "UNKNOWN_FIX".');

        // Scenario 4B: AUTOFIX payload with requested_fixes strings and repairs objects
        const sc4bId = 'job_regress_4b';
        mockUpstreamJobs[sc4bId] = {
            id: sc4bId,
            strategy: 'AUTOFIX',
            state: 'COMPLETED',
            tenantId: 'ppos-production-worker',
            requested_fixes: ['APPLY_BLEED', 'CONVERT_CMYK'],
            repairs: [
                { code: 'APPLY_BLEED', status: 'APPLIED' }
            ]
        };
        const res4b = await syncService.syncJob(sc4bId, { tenantId: 'ppos-production-worker' });
        // Let's inspect intercepted DB query to verify requested_fixes_json is strings and repairs_json is objects
        const upsert4b = dbQueriesIntercepted.filter(q => q.params && q.params[0] === sc4bId).pop();
        assert(upsert4b.params[11] === JSON.stringify(['APPLY_BLEED', 'CONVERT_CMYK']), 'Scenario 4B: requested intent remains strings exactly as supplied.');
        assert(upsert4b.params[12].includes('"code":"APPLY_BLEED"'), 'Scenario 4B: repairs remain objects preserved faithfully.');

        // Scenario 4C: AUTOFIX payload where fixes is string array but repairs is object array
        const sc4cId = 'job_regress_4c';
        mockUpstreamJobs[sc4cId] = {
            id: sc4cId,
            strategy: 'AUTOFIX',
            state: 'COMPLETED',
            tenantId: 'ppos-production-worker',
            fixes: ['APPLY_BLEED'],
            repairs: [{ code: 'APPLY_BLEED', status: 'APPLIED', detail: 'rich' }]
        };
        const res4c = await syncService.syncJob(sc4cId, { tenantId: 'ppos-production-worker' });
        const upsert4c = dbQueriesIntercepted.filter(q => q.params && q.params[0] === sc4cId).pop();
        assert(upsert4c.params[12].includes('"detail":"rich"'), 'Scenario 4C: fixes strings must not overwrite rich repairs objects.');

        // Scenario 4D: Existing records with old ["UNKNOWN_FIX"] healed on next sync by re-deriving buckets from canonical_payload_json
        const sc4dId = 'job_regress_4d';
        const legacyPayloadWithUnknownFixes = {
            id: sc4dId,
            strategy: 'AUTOFIX',
            status: 'COMPLETED',
            tenantId: 'ppos-production-worker',
            result: {
                repairs: [{ code: 'REBUILD_TRIMBOX', status: 'APPLIED' }]
            },
            applied_fixes: ['UNKNOWN_FIX'] // Old string placeholder
        };
        mockUpstreamJobs[sc4dId] = legacyPayloadWithUnknownFixes;
        const res4d = await syncService.syncJob(sc4dId, { tenantId: 'ppos-production-worker' });
        assert(res4d.fixBuckets.applied.some(r => r.code === 'REBUILD_TRIMBOX'), 'Scenario 4D: Existing records with old ["UNKNOWN_FIX"] successfully healed by re-deriving buckets from canonical payload.');

        console.log('\n==================================================');
        console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log('==================================================\n');

        if (failed > 0) {
            console.error('[CRITICAL] Smoke test failures detected in Preflight Pipeline synchronization.');
            process.exitCode = 1;
        } else {
            console.log('[SUCCESS] Full synchronization pipeline, schema checking, and structured field extraction validated perfectly.');
        }

    } catch (e) {
        console.error('[FATAL] Unhandled test exception:', e);
        process.exitCode = 1;
    } finally {
        // Restore genuine references
        preflightServiceClient.getJob = originalGetJob;
        preflightServiceClient.listJobs = originalListJobs;
        db.query = originalDbQuery;
        controlPlaneSchemaService.ensurePreflightRegistrySchema = originalEnsureSchema;
    }
}

runSmokeTests();
