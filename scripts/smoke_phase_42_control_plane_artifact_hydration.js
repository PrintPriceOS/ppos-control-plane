const http = require('http');

async function runSmokeTests() {
    console.log("Running Phase 42E Control Plane Artifact Hydration Smoke Tests...");
    
    // We can assume the local control plane is running on 8080 or we test the preflight API directly.
    const baseUrl = 'http://127.0.0.1:8080';
    const jobId = 'fix_1780574759446';
    
    try {
        console.log(`\n[TEST 1] Fetching live artifacts for ${jobId} via Control Plane`);
        const res = await fetch(`${baseUrl}/api/admin/preflight/jobs/${jobId}/artifacts`, {
            headers: {
                // we assume local server ignores token or uses a default if not strictly enforced in tests,
                // or we use the break glass token
                'Authorization': `Bearer ${process.env.PPOS_CONTROL_TOKEN || 'admin-secret'}`
            }
        });
        
        const data = await res.json();
        console.log(`Response: ${JSON.stringify(data, null, 2)}`);
        
        if (data.source_status !== 'LIVE_UPSTREAM' && data.source_status !== 'PERSISTENT_REGISTRY' && data.source_status !== 'PERSISTENT_REGISTRY_HYDRATED') {
            console.error("❌ Unexpected source status");
        } else {
            console.log("✅ source_status format is recognized");
        }
        
        // Check for deduplication
        if (data.artifacts && data.artifacts.length > 0) {
            const fixedPdfs = data.artifacts.filter(a => a.alias === 'fixed_pdf' || a.alias === 'final_fixed_pdf');
            if (fixedPdfs.length > 1) {
                console.error("❌ Duplicate primary artifacts detected");
            } else {
                console.log("✅ Deduplication test passed (or 0/1 artifacts found)");
            }
        }
        
        console.log(`\n[TEST 2] Testing AUTOFIX block for child jobs`);
        const res2 = await fetch(`${baseUrl}/api/admin/preflight/jobs/${jobId}/actions/fix`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PPOS_CONTROL_TOKEN || 'admin-secret'}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'AUTOFIX' })
        });
        
        const data2 = await res2.json();
        console.log(`Response: ${JSON.stringify(data2, null, 2)}`);
        
        if (res2.status === 409 && data2.error === 'FIX_ALREADY_AUTOFIX_JOB') {
            console.log("✅ Fix triggered on child job correctly blocked with 409 FIX_ALREADY_AUTOFIX_JOB");
        } else {
            console.error("❌ Fix trigger not blocked correctly. Status:", res2.status);
        }
        
    } catch (e) {
        console.error("Error during smoke tests. Make sure Control Plane is running locally on 8080.", e.message);
    }
}

runSmokeTests().catch(console.error);
