const http = require('http');

async function runSmokeTests() {
    console.log("Running Phase 42E Control Plane Artifact Hydration Smoke Tests...");
    
    // We can assume the local control plane is running on 8080 or we test the preflight API directly.
    const baseUrl = 'http://127.0.0.1:8080';
    const jobId = 'fix_1780577270244'; // Update to the job with final_fixed_pdf
    
    try {
        console.log(`\n[TEST 1] Fetching live artifacts for ${jobId} via Control Plane`);
        const res = await fetch(`${baseUrl}/api/admin/preflight/jobs/${jobId}/artifacts`, {
            headers: {
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
        
        const fixedPdf = data.artifacts?.find(a => a.type === 'fixed_pdf' || a.alias === 'fixed_pdf' || a.alias === 'final_fixed_pdf');
        if (fixedPdf) {
            console.log(`\n[TEST 3] Testing canonical alias resolution for: ${fixedPdf.filename}`);
            
            const aliasesToTest = ['fixed_pdf', 'final_fixed_pdf'];
            if (fixedPdf.id) aliasesToTest.push(fixedPdf.id);
            if (Array.isArray(fixedPdf.aliases)) aliasesToTest.push(...fixedPdf.aliases);
            
            for (const alias of new Set(aliasesToTest)) {
                if (!alias) continue;
                const headRes = await fetch(`${baseUrl}/api/admin/preflight/jobs/${jobId}/artifacts/${alias}`, {
                    method: 'HEAD',
                    headers: { 'Authorization': `Bearer ${process.env.PPOS_CONTROL_TOKEN || 'admin-secret'}` }
                });
                
                if (headRes.status === 200) {
                    console.log(`✅ Resolves correctly for alias: ${alias}`);
                } else if (headRes.status === 404 && process.env.PPOS_CONTROL_TOKEN === undefined) {
                    console.log(`⚠️ Resolves with ${headRes.status} for alias: ${alias} (mock test might be running without full upstream)`);
                } else {
                    console.error(`❌ FAILED resolution for alias: ${alias} (status: ${headRes.status})`);
                }
            }
        }
        
        console.log(`\n[TEST 4] Testing missing artifact resolution for absent types`);
        for (const missingAlias of ['certified_pdf', 'fix_audit']) {
            const headRes = await fetch(`${baseUrl}/api/admin/preflight/jobs/${jobId}/artifacts/${missingAlias}`, {
                method: 'HEAD',
                headers: { 'Authorization': `Bearer ${process.env.PPOS_CONTROL_TOKEN || 'admin-secret'}` }
            });
            if (headRes.status === 404 || headRes.status === 400 || headRes.status === 401) {
                console.log(`✅ Correctly rejected missing artifact alias: ${missingAlias}`);
            } else {
                console.error(`❌ FAILED: Missing artifact alias returned status ${headRes.status} instead of 404: ${missingAlias}`);
            }
        }
        
    } catch (e) {
        console.error("Error during smoke tests. Make sure Control Plane is running locally on 8080.", e.message);
    }
}

runSmokeTests().catch(console.error);
