const { getHumanReport } = require('../src/api/services/preflightHumanReportService');

// Mock context
const context = {
    Authorization: 'mock-token',
    tenantId: 'tenant_test'
};

async function runTests() {
    console.log("=== Running Phase 43D Human Report Smoke Tests ===\n");

    const tests = [
        {
            name: "CERTIFIED_READY (Happy Path)",
            job: {
                certification_level: "CERTIFIED_READY",
                production_certified: true,
                review_required: false
            },
            artifacts: [
                { type: 'certified_pdf', production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY', downloadable: true, size_bytes: 1000 }
            ],
            validate: (res) => {
                const report = res.report;
                console.assert(report.outcome === "CERTIFIED_READY", "Outcome mismatch");
                console.assert(report.severity === "success", "Severity mismatch");
                console.assert(report.recommended_next_action.primary_artifact_type === "certified_pdf", "Primary artifact mismatch");
                console.assert(report.recommended_next_action.action_id === "use_certified", "Action mismatch");
            }
        },
        {
            name: "FIXED_REVIEW_REQUIRED (Downgraded Certified PDF)",
            job: {
                certification_level: "FIXED_REVIEW_REQUIRED",
                production_certified: false,
                review_required: true,
                applied_fixes: ['APPLY_BLEED', 'REBUILD_TRIMBOX']
            },
            artifacts: [
                { type: 'certified_pdf', production_certified: false, customer_visible: false, downloadable: true, size_bytes: 1000 },
                { type: 'fixed_pdf', downloadable: true, size_bytes: 2000 }
            ],
            validate: (res) => {
                const report = res.report;
                console.assert(report.outcome === "FIXED_REVIEW_REQUIRED", "Outcome mismatch");
                console.assert(report.severity === "warning", "Severity mismatch");
                console.assert(report.recommended_next_action.primary_artifact_type === "fixed_pdf", "Primary artifact mismatch");
                console.assert(report.copy_blocks.operator.includes("TrimBox rebuilt"), "Operator copy missing trimbox");
                console.assert(report.copy_blocks.operator.includes("Bleed boxes adjusted only"), "Operator copy missing bleed");
                
                const certItem = report.artifact_recommendations.find(a => a.type === 'certified_pdf');
                console.assert(certItem.is_primary === false, "Certified PDF shouldn't be primary");
                console.assert(certItem.warning !== null, "Certified PDF should have warning");
            }
        },
        {
            name: "ANALYSIS_ONLY",
            job: {
                certification_level: "ANALYSIS_ONLY"
            },
            artifacts: [
                { type: 'analysis_report', downloadable: true, size_bytes: 500 }
            ],
            validate: (res) => {
                const report = res.report;
                console.assert(report.outcome === "ANALYSIS_ONLY", "Outcome mismatch");
                console.assert(report.recommended_next_action.primary_artifact_type === "analysis_report", "Primary artifact mismatch");
            }
        },
        {
            name: "BLOCKED",
            job: {
                certification_level: "BLOCKED",
                status: "FAILED"
            },
            artifacts: [],
            validate: (res) => {
                const report = res.report;
                console.assert(report.outcome === "BLOCKED", "Outcome mismatch");
                console.assert(report.severity === "error", "Severity mismatch");
                console.assert(report.recommended_next_action.action_id === "request_upload", "Action mismatch");
            }
        },
        {
            name: "PROCESSING",
            job: {
                status: "RUNNING"
            },
            artifacts: [],
            validate: (res) => {
                const report = res.report;
                console.assert(report.outcome === "PROCESSING", "Outcome mismatch");
                console.assert(report.recommended_next_action.action_id === "wait", "Action mismatch");
            }
        },
        {
            name: "Real fix_1780651634180 mapping",
            job: {
                certification_level: "FIXED_REVIEW_REQUIRED",
                production_certified: false,
                review_required: true,
                fix_summary: {
                    applied_fixes: ['REBUILD_TRIMBOX', 'APPLY_BLEED', 'INJECT_OUTPUT_INTENT'],
                    skipped_fixes: ['CONVERT_CMYK']
                }
            },
            artifacts: [
                { type: 'certified_pdf', filename: 'certified.pdf', production_certified: false, customer_visible: false, downloadable: true, size_bytes: 5000 },
                { type: 'fixed_pdf', filename: 'fixed.pdf', downloadable: true, size_bytes: 4000 },
                { type: 'final_fixed_pdf', alias: 'final_fixed_pdf', filename: 'fixed.pdf', downloadable: true, size_bytes: 4000 }
            ],
            validate: (res) => {
                const report = res.report;
                console.assert(report.outcome === "FIXED_REVIEW_REQUIRED", "Outcome mismatch");
                console.assert(report.recommended_next_action.primary_artifact_type === "fixed_pdf", "Primary artifact mismatch");
                
                // Deduplication check
                const dedupedArtifacts = report.artifact_recommendations;
                // certified.pdf and fixed.pdf are the unique files
                console.assert(dedupedArtifacts.length === 2, "Should deduplicate fixed.pdf and final_fixed_pdf");
                const fixedRec = dedupedArtifacts.find(a => a.filename === 'fixed.pdf');
                console.assert(fixedRec.secondary_aliases.includes('final_fixed_pdf'), "Should include final_fixed_pdf as alias");
            }
        }
    ];

    let allPassed = true;

    for (const test of tests) {
        try {
            const res = await getHumanReport("test_job", context, test.job, test.artifacts);
            test.validate(res);
            console.log(`✅ [PASS] ${test.name}`);
        } catch (err) {
            console.error(`❌ [FAIL] ${test.name}`);
            console.error(`   Error: ${err.message}`);
            allPassed = false;
        }
    }

    if (allPassed) {
        console.log("\n✅ All smoke tests passed!");
        process.exit(0);
    } else {
        console.error("\n❌ Some smoke tests failed.");
        process.exit(1);
    }
}

runTests();
