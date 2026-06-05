require('dotenv').config();
const { getPreflightHumanReport } = require('../src/api/services/preflightHumanReportService');
const db = require('../src/api/services/mysqlClient');

async function run() {
    console.log("=====================================================");
    console.log("PHASE 43D SMOKE TEST: HUMAN REPORT");
    console.log("=====================================================\n");

    let failures = 0;
    const testTenantId = 'ppos-production';
    const context = { tenantId: testTenantId, Authorization: 'Bearer test' };

    // 1. Certified-ready fixture
    const certifiedJobId = `job_cert_test_${Date.now()}`;
    await db.query(`
        INSERT IGNORE INTO preflight_job_registry (job_id, tenant_id, operator_id, status, type, progress, canonical_payload_json)
        VALUES (?, ?, 'tester', 'COMPLETED', 'ANALYZE', 100, ?)
    `, [certifiedJobId, testTenantId, JSON.stringify({
        status: 'COMPLETED',
        artifacts: [
            { type: 'CERTIFIED_PDF', sizeBytes: 1024, path: 's3://bucket/cert.pdf', downloadable: true },
            { type: 'REPORT_JSON', sizeBytes: 500, path: 's3://bucket/report.json', downloadable: true }
        ]
    })]);

    console.log("1. Testing Certified-ready fixture...");
    const certRes = await getPreflightHumanReport(certifiedJobId, context);
    if (!certRes.ok) {
        console.error("❌ Certified job report failed to generate");
        failures++;
    } else if (certRes.outcome !== 'CERTIFIED_READY') {
        console.error(`❌ Expected outcome CERTIFIED_READY, got ${certRes.outcome}`);
        failures++;
    } else if (certRes.recommended_next_action.code !== 'USE_CERTIFIED_PDF') {
        console.error(`❌ Expected USE_CERTIFIED_PDF, got ${certRes.recommended_next_action.code}`);
        failures++;
    } else if (!certRes.decision.production_ready) {
        console.error("❌ Expected decision.production_ready to be true");
        failures++;
    } else {
        console.log("✅ Certified fixture passed");
    }

    // 2. Review-required fixture
    const reviewJobId = `fix_review_test_${Date.now()}`;
    await db.query(`
        INSERT IGNORE INTO preflight_job_registry (job_id, tenant_id, operator_id, status, type, progress, canonical_payload_json)
        VALUES (?, ?, 'tester', 'AUTOFIX_REVIEW_REQUIRED', 'AUTOFIX', 100, ?)
    `, [reviewJobId, testTenantId, JSON.stringify({
        status: 'AUTOFIX_REVIEW_REQUIRED',
        artifacts: [
            { type: 'FIXED_PDF', sizeBytes: 1024, path: 's3://bucket/fixed.pdf', downloadable: true }
        ]
    })]);

    console.log("\n2. Testing Review-required fixture...");
    const reviewRes = await getPreflightHumanReport(reviewJobId, context);
    if (reviewRes.outcome !== 'REVIEW_REQUIRED') {
        console.error(`❌ Expected outcome REVIEW_REQUIRED, got ${reviewRes.outcome}`);
        failures++;
    } else if (reviewRes.recommended_next_action.code !== 'REVIEW_BEFORE_PRODUCTION') {
        console.error(`❌ Expected action REVIEW_BEFORE_PRODUCTION, got ${reviewRes.recommended_next_action.code}`);
        failures++;
    } else if (!reviewRes.decision.operator_review_required) {
        console.error("❌ Expected decision.operator_review_required to be true");
        failures++;
    } else {
        console.log("✅ Review fixture passed");
    }

    // 3. Blocked fixture
    const blockedJobId = `job_blocked_test_${Date.now()}`;
    await db.query(`
        INSERT IGNORE INTO preflight_job_registry (job_id, tenant_id, operator_id, status, type, progress, canonical_payload_json)
        VALUES (?, ?, 'tester', 'COMPLETED', 'ANALYZE', 100, ?)
    `, [blockedJobId, testTenantId, JSON.stringify({
        status: 'COMPLETED',
        artifacts: [
            { type: 'ZERO_BYTE', sizeBytes: 0, path: 's3://bucket/zero.pdf', downloadable: true }
        ]
    })]);

    console.log("\n3. Testing Blocked fixture...");
    const blockedRes = await getPreflightHumanReport(blockedJobId, context);
    if (blockedRes.outcome !== 'BLOCKED') {
        console.error(`❌ Expected outcome BLOCKED, got ${blockedRes.outcome}`);
        failures++;
    } else {
        console.log("✅ Blocked fixture passed");
    }

    // 4. Analysis-only fixture
    const analysisJobId = `job_analysis_test_${Date.now()}`;
    await db.query(`
        INSERT IGNORE INTO preflight_job_registry (job_id, tenant_id, operator_id, status, type, progress, canonical_payload_json)
        VALUES (?, ?, 'tester', 'COMPLETED', 'ANALYZE', 100, ?)
    `, [analysisJobId, testTenantId, JSON.stringify({
        status: 'COMPLETED',
        artifacts: [
            { type: 'ANALYSIS_REPORT', sizeBytes: 500, path: 's3://bucket/report.json', downloadable: true }
        ]
    })]);

    console.log("\n4. Testing Analysis-only fixture...");
    const analysisRes = await getPreflightHumanReport(analysisJobId, context);
    if (analysisRes.outcome !== 'ANALYSIS_ONLY') {
        console.error(`❌ Expected outcome ANALYSIS_ONLY, got ${analysisRes.outcome}`);
        failures++;
    } else {
        console.log("✅ Analysis-only fixture passed");
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
}

run();
