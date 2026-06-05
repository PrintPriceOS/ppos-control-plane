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
            { event: 'PREFLIGHT_JOB_CREATED', status: 'SUCCESS', meta: { job_id: parentJobId, actor_role: 'ADMIN', actor: 'tester', source: 'PHASE_43C_SMOKE', trace_id: 'trace-123' } },
            { event: 'PREFLIGHT_JOB_SUBMITTED', status: 'SUCCESS', meta: { job_id: parentJobId, actor_role: 'ADMIN', actor: 'tester', source: 'PHASE_43C_SMOKE' } },
            { event: 'PREFLIGHT_JOB_VIEWED', status: 'SUCCESS', meta: { job_id: parentJobId, actor_role: 'ADMIN', actor: 'tester', source: 'PHASE_43C_SMOKE' } },
            { event: 'PREFLIGHT_JOB_VIEWED', status: 'SUCCESS', meta: { job_id: parentJobId, actor_role: 'ADMIN', actor: 'tester', source: 'PHASE_43C_SMOKE' } },
            { event: 'PREFLIGHT_JOB_VIEWED', status: 'SUCCESS', meta: { job_id: parentJobId, actor_role: 'ADMIN', actor: 'tester', source: 'PHASE_43C_SMOKE' } },
            { event: 'PREFLIGHT_FIX_TRIGGERED', status: 'SUCCESS', meta: { job_id: parentJobId, actor_role: 'ADMIN', actor: 'tester', source: 'PHASE_43C_SMOKE' } },
            { event: 'PREFLIGHT_FIX_JOB_CREATED', status: 'SUCCESS', meta: { parent_job_id: parentJobId, child_job_id: childJobId, actor_role: 'ADMIN', actor: 'tester', source: 'PHASE_43C_SMOKE' } },
            { event: 'PREFLIGHT_FIXED_PDF_READY', status: 'SUCCESS', meta: { fix_job_id: childJobId, actor_role: 'ADMIN', actor: 'tester', source: 'PHASE_43C_SMOKE' } }
        ];

        // Schema-aware insert
        const descResult = await db.query('DESCRIBE api_audit_logs');
        const descRows = Array.isArray(descResult) && Array.isArray(descResult[0]) ? descResult[0] : (Array.isArray(descResult) ? descResult : []);
        const columns = descRows.map(r => r.Field);
        
        const insertCols = [];
        const insertPlaceholders = [];
        
        if (columns.includes('tenant_id')) { insertCols.push('tenant_id'); insertPlaceholders.push('?'); }
        if (columns.includes('user_id')) { insertCols.push('user_id'); insertPlaceholders.push('?'); }
        if (columns.includes('user_role')) { insertCols.push('user_role'); insertPlaceholders.push('?'); }
        if (columns.includes('action')) { insertCols.push('action'); insertPlaceholders.push('?'); }
        if (columns.includes('event_type')) { insertCols.push('event_type'); insertPlaceholders.push('?'); }
        if (columns.includes('status')) { insertCols.push('status'); insertPlaceholders.push('?'); }
        if (columns.includes('metadata_json')) { insertCols.push('metadata_json'); insertPlaceholders.push('?'); }
        if (columns.includes('created_at')) { insertCols.push('created_at'); insertPlaceholders.push('NOW() - INTERVAL 1 MINUTE'); }

        const sql = `INSERT INTO api_audit_logs (${insertCols.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`;

        for (const e of events) {
            const vals = [];
            if (columns.includes('tenant_id')) vals.push(testTenantId);
            if (columns.includes('user_id')) vals.push('tester');
            if (columns.includes('user_role')) vals.push('ADMIN');
            if (columns.includes('action')) vals.push('test_action');
            if (columns.includes('event_type')) vals.push(e.event);
            if (columns.includes('status')) vals.push(e.status);
            if (columns.includes('metadata_json')) vals.push(JSON.stringify(e.meta));
            
            await db.query(sql, vals);
        }

        console.log("✅ Mock data inserted successfully.");

        console.log("\n2. Testing getGovernanceLedger for parent job (should include child events)...");
        const parentRes = await getGovernanceLedger(parentJobId, context);
        
        if (!parentRes.ok) {
            console.error("❌ getGovernanceLedger returned not ok");
            failures++;
        }
        
        if (parentRes.event_count < 6) { // Compacted count
            console.error(`❌ Expected at least 6 compacted events for parent correlation, got ${parentRes.event_count}`);
            failures++;
        }
        
        if (parentRes.raw_event_count <= parentRes.event_count) {
             console.error("❌ Compaction did not reduce event count.");
             failures++;
        } else {
             console.log(`✅ Event compaction worked: ${parentRes.raw_event_count} raw -> ${parentRes.event_count} compacted.`);
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
        if (!submittedEvent || submittedEvent.category !== 'submission' || submittedEvent.severity !== 'info') {
             console.error("❌ Normalization failed for SUBMITTED event (or event not found).");
             failures++;
        }
        
        const createdEvent = parentRes.ledger.find(l => l.event_type === 'PREFLIGHT_JOB_CREATED');
        if (!createdEvent || createdEvent.label !== 'Job created') {
             console.error("❌ PREFLIGHT_JOB_CREATED did not map to 'Job created'.");
             failures++;
        } else if (createdEvent.forensic.trace_id !== 'trace-123') {
             console.error("❌ forensic.trace_id did not correctly fallback to metadata.trace_id.");
             failures++;
        } else {
             console.log("✅ Label mapping and trace_id fallback works.");
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

        console.log("\n5. Testing empty fallback...");
        const emptyRes = await getGovernanceLedger('non_existent_job_123', context);
        if (emptyRes.source !== 'empty' || emptyRes.event_count !== 0) {
             console.error("❌ Empty fallback failed for non-existent job.");
             failures++;
        } else {
             console.log("✅ Empty fallback handles nonexistent jobs.");
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
