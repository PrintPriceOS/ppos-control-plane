'use strict';
/**
 * scripts/smoke_phase78g_commercial_plan_readiness_pack.js
 * 
 * Static/Contract smoke test for Phase 78G — Commercial Plan Readiness Pack.
 * Verifies presence, correct headers, and compliance content of checklist and acceptance pack.
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
    console.log('=== PRINTPRICE OS: PHASE 78G COMMERCIAL PLAN READINESS PACK SMOKE TESTS ===\n');

    try {
        const root = path.join(__dirname, '..');

        // 1. Verify files exist
        const requiredFiles = [
            'reports/phase78_commercial_plan_readiness_checklist.md',
            'reports/phase78_usage_billing_acceptance_pack.md'
        ];

        console.log('--- 1. File Presence ---');
        requiredFiles.forEach(file => {
            const filePath = path.join(root, file);
            const exists = fs.existsSync(filePath);
            assert(exists, `File exists: ${file}`);
        });

        // 2. Verify Headers
        console.log('\n--- 2. File Header Checks ---');
        const checklistPath = path.join(root, 'reports/phase78_commercial_plan_readiness_checklist.md');
        const checklistContent = fs.readFileSync(checklistPath, 'utf8');
        assert(checklistContent.includes('# Phase 78 — Commercial Plan Readiness Checklist'), 'Checklist contains correct main header');
        assert(checklistContent.includes('## Part A: Commercial Plans & Entitlements Schema'), 'Checklist contains Part A section');
        assert(checklistContent.includes('## Part B: Usage Metering & Idempotency'), 'Checklist contains Part B section');
        assert(checklistContent.includes('## Part C: Quota Enforcement & Overage Policy'), 'Checklist contains Part C section');
        assert(checklistContent.includes('## Part D: Administration & Compliance Guardrails'), 'Checklist contains Part D section');

        const acceptancePath = path.join(root, 'reports/phase78_usage_billing_acceptance_pack.md');
        const acceptanceContent = fs.readFileSync(acceptancePath, 'utf8');
        assert(acceptanceContent.includes('# Phase 78 — Usage & Billing Acceptance Pack'), 'Acceptance pack contains correct main header');
        assert(acceptanceContent.includes('## 1. Executive Summary'), 'Acceptance pack contains Executive Summary');
        assert(acceptanceContent.includes('## 2. Plan Entitlements & Pricing Limits'), 'Acceptance pack contains Plan Limits table');
        assert(acceptanceContent.includes('## 3. Core Architectural Rules'), 'Acceptance pack contains Core Rules section');
        assert(acceptanceContent.includes('## 4. Acceptance Certification'), 'Acceptance pack contains Certification section');

        // 3. Wording Compliance Check
        console.log('\n--- 3. Compliance Wording Guard ---');
        const forbiddenWords = ['stripe', 'charged', 'paid', 'tax', 'vat'];
        let forbiddenFound = 0;
        requiredFiles.forEach(file => {
            const content = fs.readFileSync(path.join(root, file), 'utf8').toLowerCase();
            forbiddenWords.forEach(word => {
                if (content.includes(word)) {
                    forbiddenFound++;
                    console.error(`  ❌  Found forbidden word "${word}" in file ${file}`);
                }
            });
        });

        assert(forbiddenFound === 0, 'No external billing wording (stripe, charged, paid, tax, vat) in reports pack');

        // Write report summary
        const reportsDir = path.join(root, 'reports');
        const summary = {
            tested_at: new Date().toISOString(),
            status: FAIL === 0 ? 'SUCCESS' : 'FAILED',
            passed: PASS,
            failed: FAIL,
            scenarios: results
        };

        const jsonPath = path.join(reportsDir, 'phase78g_commercial_plan_readiness_pack.json');
        fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 4), 'utf8');
        console.log(`\nWritten JSON report to: ${jsonPath}`);

    } catch (err) {
        console.error('Smoke test scenario execution failed:', err);
        FAIL++;
    }

    console.log('\n================================================');
    console.log(`Phase 78G smoke test run completed.`);
    console.log(`Passed: ${PASS} | Failed: ${FAIL}`);
    console.log('================================================');

    if (FAIL > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runSmokeTest();
