require('dotenv').config();
const db = require('../src/api/services/mysqlClient');
const { getGovernanceLedger } = require('../src/api/services/preflightGovernanceLedgerService');

async function run() {
    console.log("=====================================================");
    console.log("PHASE 43C SMOKE TEST: GOVERNANCE LEDGER");
    console.log("=====================================================\n");

    let failures = 0;
    const testTenantId = 'ppos-production';
    const context = { tenantId: testTenantId, Authorization: 'Bearer test' };

    // Create a mock parent job and child fix job to test correlation
    const parentJobId = `job_test_parent_${Date.now()}`;
    const childJobId = `fix_test_child_${Date.now()}`;
    
    try {
        console.log("1. Preparing mock registry and audit events...");

        // Insert mock registry to test fallback and artifacts
        await db.query(`
            INSERT IGNORE INTO preflight_job_registry (job_id, tenant_id, operator_id, status, type, progress, canonical_payload_json)
            VALUES (?, ?, 'tester', 'COMPLETED_WITH_FINDINGS', 'ANALYZE', 100, ?)
        `, [parentJobId, testTenantId, JSON.stringify({
            status: 'COMPLETED_WITH_FINDINGS',
            artifacts: [
                { type: 'OUTPUT_PDF', sizeBytes: 1024, path: 's3://bucket/test.pdf' },
                { type: 'ZERO_BYTE', sizeBytes: 0, path: 's3://bucket/zero.pdf' }
            ]
        })]);

        // Insert some audit events
        const events = [
            { event: 'PREFLIGHT_JOB_SUBMITTED', status: 'SUCCESS', meta: { job_id: parentJobId } },
            { event: 'PREFLIGHT_JOB_VIEWED', status: 'SUCCESS', meta: { job_id: parentJobId } },
            { event: 'PREFLIGHT_FIX_TRIGGERED', status: 'SUCCESS', meta: { job_id: parentJobId } },
            { event: 'PREFLIGHT_FIX_JOB_CREATED', status: 'SUCCESS', meta: { parent_job_id: parentJobId, child_job_id: childJobId } },
            { event: 'PREFLIGHT_FIXED_PDF_READY', status: 'SUCCESS', meta: { fix_job_id: childJobId } }
        ];

        for (const e of events) {
            await db.query(`
                INSERT INTO api_audit_logs (tenant_id, user_id, user_role, action, event_type, status, metadata_json, created_at)
                VALUES (?, 'tester', 'ADMIN', 'test_action', ?, ?, ?, NOW() - INTERVAL 1 MINUTE)
            `, [testTenantId, e.event, e.status, JSON.stringify(e.meta)]);
        }

        console.log("✅ Mock data inserted successfully.");

        console.log("\n2. Testing getGovernanceLedger for parent job (should include child events)...");
        const parentRes = await getGovernanceLedger(parentJobId, context);
        
        if (!parentRes.ok) {
            console.error("❌ getGovernanceLedger returned not ok");
            failures++;
        }
        
        if (parentRes.event_count < 5) {
            console.error(`❌ Expected at least 5 events for parent correlation, got ${parentRes.event_count}`);
            failures++;
        }
        
        const hasChildEvent = parentRes.ledger.some(l => l.event_type === 'PREFLIGHT_FIXED_PDF_READY');
        if (!hasChildEvent) {
            console.error("❌ Parent ledger did NOT correlate the child's FIXED_PDF_READY event.");
            failures++;
        } else {
             console.log("✅ Parent ledger successfully correlated child fix events.");
        }

        // Test normalizations
        const submittedEvent = parentRes.ledger.find(l => l.event_type === 'PREFLIGHT_JOB_SUBMITTED');
        if (submittedEvent.category !== 'submission' || submittedEvent.severity !== 'info') {
             console.error("❌ Normalization failed for SUBMITTED event.");
             failures++;
        } else {
             console.log("✅ Normalization of categories and labels works.");
        }

        // Test artifact summary
        if (parentRes.artifact_summary.artifact_count !== 2 || parentRes.artifact_summary.downloadable_artifact_count !== 1 || parentRes.artifact_summary.zero_byte_artifact_count !== 1) {
            console.error("❌ Artifact summary mismatch.");
            failures++;
        } else {
            console.log("✅ Artifact summary correctly parsed from registry.");
        }

        console.log("\n3. Testing getGovernanceLedger for child job (should include parent linkage)...");
        const childRes = await getGovernanceLedger(childJobId, context);
        if (childRes.event_count < 2) {
            console.error(`❌ Expected at least 2 events for child correlation, got ${childRes.event_count}`);
            failures++;
        } else {
             console.log("✅ Child ledger successfully correlated parent link events.");
        }

        console.log("\n4. Testing synthetic fallback...");
        const synthJobId = `synth_test_${Date.now()}`;
        await db.query(`
            INSERT IGNORE INTO preflight_job_registry (job_id, tenant_id, operator_id, status, type, progress, canonical_payload_json)
            VALUES (?, ?, 'tester', 'COMPLETED_WITH_FINDINGS', 'ANALYZE', 100, ?)
        `, [synthJobId, testTenantId, JSON.stringify({})]);

        const synthRes = await getGovernanceLedger(synthJobId, context);
        if (synthRes.source !== 'registry_fallback' || !synthRes.ledger.some(l => l.synthetic)) {
             console.error("❌ Synthetic fallback did not trigger correctly for job with no audit logs.");
             failures++;
        } else {
             console.log("✅ Synthetic fallback generated correctly.");
        }

        if (failures === 0) {
            console.log("\n=====================================================");
            console.log("ALL TESTS PASSED SUCCESSFULLY");
            console.log("=====================================================");
            process.exit(0);
        } else {
            console.error(`\n❌ ${failures} test(s) failed.`);
            process.exit(1);
        }
        
    } catch (err) {
        console.error("❌ Fatal Error:", err);
        process.exit(1);
    }
}

run();
