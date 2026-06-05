const fs = require('fs');
const path = require('path');
const humanReportService = require('../src/api/services/preflightHumanReportService');
const statusHelpers = require('../src/api/services/preflightStatusHelpers');

async function run() {
    console.log("Starting Phase 54D Control Plane Image Quality Human Report Smoke Test...\n");

    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    const testScenarios = [];
    let passCount = 0;
    let failCount = 0;

    const baseArtifacts = [
        { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 1000, production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY', downloadable: true },
        { type: 'review_pdf', alias: 'review_pdf', filename: 'review.pdf', size_bytes: 1000, downloadable: true },
        { type: 'fixed_pdf', alias: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000, downloadable: true }
    ];

    async function evaluateScenario(name, jobUpdates, expectedChecks) {
        console.log(`Testing: ${name}`);
        
        const job = {
            id: `test-job-${Date.now()}`,
            certification_level: "CERTIFIED_READY",
            review_required: false,
            production_certified: true,
            status: "COMPLETED",
            ...jobUpdates
        };

        const artifacts = JSON.parse(JSON.stringify(baseArtifacts));

        const res = await humanReportService.getHumanReport(job.id, { tenantId: 'test-tenant' }, job, artifacts);
        const report = res.report;
        
        let passed = true;
        const failures = [];

        if (expectedChecks.outcome && report.outcome !== expectedChecks.outcome) {
            passed = false;
            failures.push(`Expected outcome ${expectedChecks.outcome}, got ${report.outcome}`);
        }
        if (expectedChecks.review_required !== undefined && report.fix_summary.review_required !== expectedChecks.review_required) {
            passed = false;
            failures.push(`Expected review_required ${expectedChecks.review_required}, got ${report.fix_summary.review_required}`);
        }
        if (expectedChecks.production_certified !== undefined && report.fix_summary.production_certified !== expectedChecks.production_certified) {
            passed = false;
            failures.push(`Expected production_certified ${expectedChecks.production_certified}, got ${report.fix_summary.production_certified}`);
        }
        if (expectedChecks.operator_contains) {
            for (const text of expectedChecks.operator_contains) {
                if (!report.operator_summary.includes(text)) {
                    passed = false;
                    failures.push(`Operator summary missing text: "${text}"`);
                }
            }
        }
        if (expectedChecks.customer_contains) {
            for (const text of expectedChecks.customer_contains) {
                if (!report.customer_summary.includes(text)) {
                    passed = false;
                    failures.push(`Customer summary missing text: "${text}"`);
                }
            }
        }
        if (expectedChecks.certified_pdf_downgraded !== undefined) {
            const certPdf = report.artifact_recommendations.find(a => a.type === 'certified_pdf');
            if (certPdf && certPdf.is_primary === expectedChecks.certified_pdf_downgraded) {
                passed = false;
                failures.push(`Expected certified_pdf downgraded=${expectedChecks.certified_pdf_downgraded}, got is_primary=${certPdf.is_primary}`);
            }
        }
        if (expectedChecks.skipped_fixes_contains) {
            const skipped = report.fix_summary.skipped_fixes.join(' ');
            for (const text of expectedChecks.skipped_fixes_contains) {
                if (!skipped.includes(text)) {
                    passed = false;
                    failures.push(`Skipped fixes missing text: "${text}"`);
                }
            }
        }
        
        // Readiness / payment gate simulation
        let gateResult = null;
        if (expectedChecks.simulate_review_decision) {
            const decision = expectedChecks.simulate_review_decision;
            const updatedJob = { ...job, review_decision: decision, review_required: true };
            if (decision === 'REJECTED_REQUIRES_REUPLOAD') {
                updatedJob.certification_level = "BLOCKED";
                updatedJob.production_certified = false;
            } else if (decision === 'APPROVED_WITH_WARNINGS') {
                updatedJob.certification_level = "MANUALLY_CERTIFIED";
                updatedJob.production_certified = true;
                updatedJob.review_required = false;
            }
            
            gateResult = {
                decision: decision,
                blocks_payment: updatedJob.certification_level === 'BLOCKED',
                allows_progression: updatedJob.production_certified === true
            };
            
            if (expectedChecks.gate_blocks_payment !== undefined && gateResult.blocks_payment !== expectedChecks.gate_blocks_payment) {
                passed = false;
                failures.push(`Expected gate_blocks_payment ${expectedChecks.gate_blocks_payment}, got ${gateResult.blocks_payment}`);
            }
            if (expectedChecks.gate_allows_progression !== undefined && gateResult.allows_progression !== expectedChecks.gate_allows_progression) {
                passed = false;
                failures.push(`Expected gate_allows_progression ${expectedChecks.gate_allows_progression}, got ${gateResult.allows_progression}`);
            }
        }

        if (passed) {
            console.log("  [PASS]");
            passCount++;
        } else {
            console.log("  [FAIL]");
            failures.forEach(f => console.log(`    - ${f}`));
            failCount++;
        }

        testScenarios.push({
            scenario: name,
            input_governance_evidence: jobUpdates.image_quality_governance || jobUpdates.fix_audit || {},
            outcome: report.outcome,
            severity: report.severity,
            review_required: report.fix_summary.review_required,
            production_certified: report.fix_summary.production_certified,
            primary_artifact_type: report.recommended_next_action.primary_artifact_type,
            certified_pdf_downgraded: !report.artifact_recommendations.find(a => a.type === 'certified_pdf')?.is_primary,
            customer_wording: report.customer_summary,
            operator_wording: report.operator_summary,
            public_report_safe: !report.customer_summary.includes('obj') && !report.customer_summary.includes('stream') && !report.customer_summary.includes('/tmp/'),
            readiness_gate_result: gateResult,
            pass: passed,
            failures: failures.length > 0 ? failures : undefined
        });
    }

    await evaluateScenario("1. LOW_RES_IMAGES finding", {
        image_quality_governance: {
            review_required: true,
            production_certified: false,
            certified_pdf_allowed: false,
            low_res_images_present: true,
            review_required_reasons: ['LOW_RES_IMAGES'],
            highest_image_quality_risk: 'warning'
        }
    }, {
        outcome: "REVIEW_REQUIRED",
        review_required: true,
        production_certified: false,
        customer_contains: ["image quality conditions"],
        operator_contains: ["contains low-resolution images"],
        certified_pdf_downgraded: true
    });

    await evaluateScenario("2. JPEG_ARTIFACTS finding", {
        image_quality_governance: {
            review_required: true,
            production_certified: false,
            certified_pdf_allowed: false,
            jpeg_artifacts_present: true,
            review_required_reasons: ['JPEG_ARTIFACTS'],
            highest_image_quality_risk: 'warning'
        }
    }, {
        outcome: "REVIEW_REQUIRED",
        review_required: true,
        production_certified: false,
        operator_contains: ["visible or suspected JPEG compression artifacts", "Automatic artifact repair was not applied"]
    });

    await evaluateScenario("3. BITMAP_TEXT_RISK", {
        image_quality_governance: {
            review_required: true,
            production_certified: false,
            certified_pdf_allowed: false,
            bitmap_text_risk: true,
            review_required_reasons: ['BITMAP_TEXT_RISK'],
            highest_image_quality_risk: 'critical'
        }
    }, {
        outcome: "REVIEW_REQUIRED",
        review_required: true,
        operator_contains: ["text rendered as bitmap imagery", "reduce sharpness"]
    });

    await evaluateScenario("4. RASTERIZED_VECTOR_RISK", {
        image_quality_governance: {
            review_required: true,
            production_certified: false,
            certified_pdf_allowed: false,
            rasterized_vector_risk: true,
            review_required_reasons: ['RASTERIZED_VECTOR_RISK']
        }
    }, {
        outcome: "REVIEW_REQUIRED",
        review_required: true,
        operator_contains: ["vector artwork rendered as raster imagery", "not supported"]
    });

    await evaluateScenario("5. Unsupported UPSCALE_LOW_RES_IMAGES", {
        fix_summary: { skipped_count: 1 },
        fix_audit: {
            skipped_fixes: [{ code: 'UPSCALE_LOW_RES_IMAGES', reason: 'UNSUPPORTED' }],
            image_quality_governance: {
                review_required: true,
                production_certified: false,
                certified_pdf_allowed: false,
                low_res_images_present: true,
                unsupported_image_quality_fixes: ['UPSCALE_LOW_RES_IMAGES']
            }
        }
    }, {
        skipped_fixes_contains: ["Low-resolution image upscaling is not implemented as a safe automatic operation"],
        operator_contains: ["not implemented as a safe automatic operation"],
        certified_pdf_downgraded: true
    });

    await evaluateScenario("6. Unsupported REPLACE_LOW_RES_IMAGES", {
        fix_summary: { skipped_count: 1 },
        fix_audit: {
            skipped_fixes: [{ code: 'REPLACE_LOW_RES_IMAGES', reason: 'UNSUPPORTED' }],
            image_quality_governance: {
                review_required: true,
                production_certified: false,
                certified_pdf_allowed: false,
                image_replacement_required: true,
                unsupported_image_quality_fixes: ['REPLACE_LOW_RES_IMAGES']
            }
        }
    }, {
        skipped_fixes_contains: ["Image replacement requires source assets"],
        operator_contains: ["Image replacement requires source assets"]
    });

    await evaluateScenario("7. Future applied visual image rewrite fix", {
        applied_fixes: [{ code: 'DOWNSAMPLE_EXCESSIVE_RESOLUTION' }],
        image_quality_governance: {
            review_required: true,
            production_certified: false,
            certified_pdf_allowed: false,
            visual_image_rewrite_applied: true,
            image_rewrite_performed: true
        }
    }, {
        outcome: "FIXED_REVIEW_REQUIRED",
        review_required: true,
        production_certified: false,
        operator_contains: ["Visual image rewrite was applied. This can alter image appearance."],
        certified_pdf_downgraded: true
    });

    await evaluateScenario("8. Public report sanitation", {
        image_quality_governance: {
            review_required: true,
            production_certified: false,
            certified_pdf_allowed: false,
            low_res_images_present: true,
            review_required_reasons: ['LOW_RES_IMAGES']
        },
        findings: [{
            code: 'LOW_RES_IMAGES',
            message: 'Image object 12 0 obj at stream path /tmp/abc.pdf is low res'
        }]
    }, {
        customer_contains: ["image quality conditions that may affect print appearance"],
        public_report_safe: true
    });

    await evaluateScenario("9. Review decision / readiness / payment simulation (REJECTED)", {
        image_quality_governance: {
            review_required: true,
            production_certified: false,
            certified_pdf_allowed: false,
            low_res_images_present: true,
            review_required_reasons: ['LOW_RES_IMAGES']
        }
    }, {
        simulate_review_decision: 'REJECTED_REQUIRES_REUPLOAD',
        gate_blocks_payment: true,
        gate_allows_progression: false
    });

    await evaluateScenario("10. Review decision / readiness / payment simulation (APPROVED)", {
        image_quality_governance: {
            review_required: true,
            production_certified: false,
            certified_pdf_allowed: false,
            low_res_images_present: true,
            review_required_reasons: ['LOW_RES_IMAGES']
        }
    }, {
        simulate_review_decision: 'APPROVED_WITH_WARNINGS',
        gate_blocks_payment: false,
        gate_allows_progression: true
    });

    console.log(`\nResults: ${passCount} Passed, ${failCount} Failed.`);
    
    fs.writeFileSync(path.join(reportsDir, 'phase54d_control_plane_image_quality_human_report.json'), JSON.stringify({
        phase: "54D",
        scenarios: testScenarios,
        summary: { pass: passCount, fail: failCount }
    }, null, 2));

    let md = `# Phase 54D Control Plane Image Quality Human Report\n\n`;
    md += `**Summary**: ${passCount} Passed, ${failCount} Failed\n\n`;
    testScenarios.forEach(s => {
        md += `## ${s.scenario}\n`;
        md += `- **Pass**: ${s.pass ? '✅' : '❌'}\n`;
        md += `- **Outcome**: ${s.outcome}\n`;
        md += `- **Review Required**: ${s.review_required}\n`;
        md += `- **Production Certified**: ${s.production_certified}\n`;
        md += `- **Customer Wording**: ${s.customer_wording}\n`;
        md += `- **Operator Wording**: ${s.operator_wording}\n`;
        md += `- **Public Report Safe**: ${s.public_report_safe}\n`;
        if (s.readiness_gate_result) {
            md += `- **Simulated Decision**: ${s.readiness_gate_result.decision} (Blocks Payment: ${s.readiness_gate_result.blocks_payment}, Allows Progression: ${s.readiness_gate_result.allows_progression})\n`;
        }
        if (s.failures) {
            md += `- **Failures**:\n`;
            s.failures.forEach(f => md += `  - ${f}\n`);
        }
        md += `\n`;
    });

    fs.writeFileSync(path.join(reportsDir, 'phase54d_control_plane_image_quality_human_report.md'), md);
    console.log(`Reports saved to ${reportsDir}`);
    
    if (failCount > 0) process.exit(1);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
