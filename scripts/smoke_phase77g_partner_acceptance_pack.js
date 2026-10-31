'use strict';
/**
 * scripts/smoke_phase77g_partner_acceptance_pack.js
 * 
 * Smoke test for Phase 77G — Pilot Launch Checklist / Partner Acceptance Pack.
 * Verifies files exist, key sections are documented, and safeguards against false certifications.
 */

const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        results.push({ label, status: 'PASS', detail });
        console.log(`  ✅  [PASS] ${label} ${detail ? `(${detail})` : ''}`);
    } else {
        FAIL++;
        results.push({ label, status: 'FAIL', detail });
        console.error(`  ❌  [FAIL] ${label} ${detail ? `: ${detail}` : ''}`);
    }
}

async function runSmokeTest() {
    console.log('=== PRINTPRICE OS: PHASE 77G CHECKLIST & ACCEPTANCE PACK SMOKE TESTS ===\n');

    try {
        const root = path.join(__dirname, '..');

        const acceptancePackPath = path.join(root, 'reports/phase77_partner_pilot_acceptance_pack.md');
        const checklistPath = path.join(root, 'reports/phase77_commercial_readiness_checklist.md');

        // 1. Verify files exist
        assert(fs.existsSync(acceptancePackPath), 'Acceptance pack file exists');
        assert(fs.existsSync(checklistPath), 'Commercial readiness checklist file exists');

        const packContent = fs.readFileSync(acceptancePackPath, 'utf8');
        const checklistContent = fs.readFileSync(checklistPath, 'utf8');

        // 2. Acceptance Pack Content Checks
        console.log('\n--- 2. Acceptance Pack Content Verification ---');
        assert(packContent.includes('PARTNER PILOT READY'), 'Acceptance pack documents PARTNER PILOT READY state');
        assert(packContent.includes('LIVE_PRODUCTION') && packContent.includes('strictly') && packContent.includes('DISABLED'), 'Acceptance pack highlights that LIVE production is disabled');
        assert(packContent.includes('PILOT_ONLY'), 'Acceptance pack clarifies status is PILOT_ONLY');
        assert(packContent.includes('Readiness Evaluation Domains') || packContent.includes('Readiness domains'), 'Acceptance pack includes readiness evaluation domains');
        assert(packContent.includes('Scoped User Roles Matrix') || packContent.includes('User roles matrix'), 'Acceptance pack lists scoped user roles matrix');
        assert(packContent.includes('Usage Governance Limits') || packContent.includes('Usage governance'), 'Acceptance pack documents usage governance limits');

        // 3. Checklist Content Checks
        console.log('\n--- 3. Checklist Content Verification ---');
        assert(checklistContent.includes('READY_FOR_PILOT'), 'Checklist checks READY_FOR_PILOT onboarding status');
        assert(checklistContent.includes('isolation_mode'), 'Checklist checks tenant isolation mode');
        assert(checklistContent.includes('UNAUTHORIZED_TENANT_ACCESS'), 'Checklist checks workspace separation exceptions');
        assert(checklistContent.includes('ACCESS_DENIED'), 'Checklist checks error response sanitization');
        assert(checklistContent.includes('TENANT_PILOT_LIMIT_EXCEEDED'), 'Checklist checks usage limits exceedance auditing');
        assert(checklistContent.includes('LIVE_PRODUCTION_BLOCKED_BY_DESIGN') || checklistContent.includes('live_production_enabled is locked'), 'Checklist verifies live production is locked/blocked');

        // 4. Safe Certifications Guarantee
        console.log('\n--- 4. Safe Certifications Guarantee (No false claims) ---');
        const hasFalseClaims = packContent.includes('fully approved for commercial live production') || packContent.includes('authorized to bypass preflight rules');
        assert(!hasFalseClaims, 'Acceptance pack contains no false claims of live production status or preflight bypass rules');

        // Write report summary
        const reportsDir = path.join(root, 'reports');
        const summary = {
            tested_at: new Date().toISOString(),
            status: FAIL === 0 ? 'SUCCESS' : 'FAILED',
            passed: PASS,
            failed: FAIL,
            scenarios: results
        };

        const jsonPath = path.join(reportsDir, 'phase77g_partner_acceptance_pack.json');
        fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 4), 'utf8');
        console.log(`\nWritten JSON report to: ${jsonPath}`);

    } catch (err) {
        console.error('Smoke test scenario execution failed:', err);
        FAIL++;
    }

    console.log('\n================================================');
    console.log(`Phase 77G smoke test run completed.`);
    console.log(`Passed: ${PASS} | Failed: ${FAIL}`);
    console.log('================================================');

    if (FAIL > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runSmokeTest();
