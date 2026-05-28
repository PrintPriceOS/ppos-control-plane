const fetch = require('node-fetch');

async function runSmokeTests() {
    console.log("Running Control Plane route smoke tests...");
    
    // Test 1: ANALYZE payload
    const analyzePayload = {
        jobId: 'smoke-analyze-1',
        type: 'ANALYZE',
        status: 'COMPLETED',
        findingsCount: 5,
        issuesCount: 5
    };

    let res = await fetch('http://127.0.0.1:8001/api/admin/preflight/jobs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyzePayload)
    });

    let data = await res.json();
    console.log("ANALYZE sync result:", data);

    // Test 2: AUTOFIX payload
    const autofixPayload = {
        jobId: 'smoke-autofix-1',
        type: 'AUTOFIX',
        status: 'COMPLETED',
        source_status: 'AUTOFIX_PARTIAL_REVIEW_REQUIRED',
        findingsCount: 5,
        appliedFixesCount: 3,
        skippedFixesCount: 1,
        failedFixesCount: 0,
        requiresHumanReview: true
    };

    res = await fetch('http://127.0.0.1:8001/api/admin/preflight/jobs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(autofixPayload)
    });

    data = await res.json();
    console.log("AUTOFIX sync result:", data);
}

runSmokeTests().catch(console.error);
