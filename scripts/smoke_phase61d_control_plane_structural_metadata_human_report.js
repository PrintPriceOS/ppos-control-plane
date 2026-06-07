const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

async function runSmokeTests() {
    console.log("=== Running Phase 61D Smoke Tests ===");
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-123', Authorization: 'Bearer test' };

    // Helper to evaluate
    const testScenario = async (name, jobInput, artifactsInput, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport('job-123', mockContext, jobInput, artifactsInput);
            if (!result.ok) throw new Error("Failed to generate report");

            const report = result.report;
            let passed = true;
            let errors = [];

            // Evaluate expectations
            if (expected.operator_contains) {
                for (const str of expected.operator_contains) {
                    if (!report.operator_summary.includes(str)) {
                        passed = false;
                        errors.push(`Operator summary missing: "${str}"`);
                    }
                }
            }
            if (expected.customer_contains) {
                for (const str of expected.customer_contains) {
                    if (!report.customer_summary.includes(str)) {
                        passed = false;
                        errors.push(`Customer summary missing: "${str}"`);
                    }
                }
            }
            if (expected.not_customer_contains) {
                for (const str of expected.not_customer_contains) {
                    if (report.customer_summary.includes(str)) {
                        passed = false;
                        errors.push(`Customer summary leaked: "${str}"`);
                    }
                }
            }
            if (expected.pdfx_claimed === false && report.pdfx_compliance_claimed !== false) {
                passed = false;
                errors.push(`Expected pdfx_compliance_claimed=false`);
            }
            if (expected.pdfa_claimed === false && report.pdfa_compliance_claimed !== false) {
                passed = false;
                errors.push(`Expected pdfa_compliance_claimed=false`);
            }
            if (expected.standard_certified === false && report.standard_certified !== false) {
                passed = false;
                errors.push(`Expected standard_certified=false`);
            }
            if (expected.review_required === true && report.fix_summary.review_required !== true) {
                passed = false;
                errors.push(`Expected review_required=true`);
            }

            // Check artifact_ux
            if (expected.artifact_ux_checks) {
                for (const check of expected.artifact_ux_checks) {
                    const ux = report.artifact_ux.artifacts.find(a => a.type === check.type)?.ux;
                    if (!ux) {
                        passed = false;
                        errors.push(`Artifact UX not found for type: ${check.type}`);
                        continue;
                    }
                    if (check.customer_badge && ux.customer.status_badge !== check.customer_badge) {
                        passed = false;
                        errors.push(`Expected customer status_badge="${check.customer_badge}", got "${ux.customer.status_badge}"`);
                    }
                    if (check.warning && ux.operator.warning !== check.warning) {
                        passed = false;
                        errors.push(`Expected warning="${check.warning}", got "${ux.operator.warning}"`);
                    }
                }
            }

            // Check sanitation
            if (expected.sanitation_checks) {
                const evidenceStr = JSON.stringify(report.structural_metadata_governance?.evidence || {});
                const uxStr = JSON.stringify(report.artifact_ux || {});
                for (const str of expected.sanitation_checks) {
                    if (evidenceStr.includes(str) || uxStr.includes(str)) {
                        passed = false;
                        errors.push(`Sanitation failed, leaked: "${str}"`);
                    }
                }
            }

            if (passed) {
                console.log(`✅ [PASS] ${name}`);
            } else {
                console.error(`❌ [FAIL] ${name}`);
                console.error(errors.map(e => `  - ${e}`).join('\n'));
                hasFailures = true;
            }

            results.push({ name, passed, errors, report });

        } catch (e) {
            console.error(`❌ [ERROR] ${name}: ${e.message}`);
            hasFailures = true;
            results.push({ name, passed: false, errors: [e.message] });
        }
    };

    // --- Scenarios ---

    await testScenario("1. NORMALIZE_OBJECT_STREAMS applied cleanly", {
        status: "COMPLETED",
        certificationLevel: "FIXED_READY",
        structural_metadata_governance: { object_streams_normalized: true },
        applied_fixes: [{ code: 'NORMALIZE_OBJECT_STREAMS' }],
        artifact_trust: { production_certified: true }
    }, [
        { type: "fixed_pdf", filename: "fixed.pdf", size_bytes: 1000 }
    ], {
        operator_contains: ["PDF object streams were normalized using a structural rewrite process.", "The file structure was cleaned to improve compatibility."],
        customer_contains: ["The file structure was cleaned to improve compatibility."],
        pdfx_claimed: false,
        artifact_ux_checks: [
            { type: 'fixed_pdf', customer_badge: 'Structure cleaned' }
        ]
    });

    await testScenario("2. NORMALIZE_OBJECT_STREAMS with qpdf warnings", {
        status: "COMPLETED",
        certificationLevel: "FIXED_REVIEW_REQUIRED",
        review_required: true,
        structural_metadata_governance: { 
            object_streams_normalized: true,
            qpdf_warnings: ["Some weird xref"]
        },
        applied_fixes: [{ code: 'NORMALIZE_OBJECT_STREAMS' }]
    }, [], {
        operator_contains: ["PDF object streams were normalized using a structural rewrite process."],
        review_required: true
    });

    await testScenario("3. REVOKE_FALSE_CERTIFICATION applied", {
        status: "COMPLETED",
        certificationLevel: "FIXED_REVIEW_REQUIRED",
        review_required: true,
        structural_metadata_governance: { false_certification_revoked: true },
        applied_fixes: [{ code: 'REVOKE_FALSE_CERTIFICATION' }],
        artifact_trust: { standard_certified: false }
    }, [], {
        operator_contains: ["Unsupported or unvalidated standards claims were revoked."],
        standard_certified: false,
        pdfx_claimed: false,
        pdfa_claimed: false
    });

    await testScenario("4. STRIP_INVALID_PDFX_METADATA applied", {
        status: "COMPLETED",
        certificationLevel: "FIXED_REVIEW_REQUIRED",
        review_required: true,
        structural_metadata_governance: { invalid_pdfx_metadata_stripped: true },
        applied_fixes: [{ code: 'STRIP_INVALID_PDFX_METADATA' }]
    }, [], {
        operator_contains: ["Invalid or unsupported PDF/X metadata was removed. The PDF was not validated as PDF/X."]
    });

    await testScenario("5. STRIP_INVALID_PDFA_METADATA applied", {
        status: "COMPLETED",
        certificationLevel: "FIXED_REVIEW_REQUIRED",
        review_required: true,
        structural_metadata_governance: { invalid_pdfa_metadata_stripped: true },
        applied_fixes: [{ code: 'STRIP_INVALID_PDFA_METADATA' }]
    }, [], {
        operator_contains: ["Invalid or unsupported PDF/A metadata was removed. The PDF was not validated as PDF/A."]
    });

    await testScenario("6. NORMALIZE_STANDARD_METADATA applied", {
        status: "COMPLETED",
        certificationLevel: "FIXED_REVIEW_REQUIRED",
        review_required: true,
        structural_metadata_governance: { standard_metadata_normalized: true },
        applied_fixes: [{ code: 'NORMALIZE_STANDARD_METADATA' }]
    }, [], {
        operator_contains: ["Standards-related metadata was normalized into an honest non-certified state."]
    });

    await testScenario("7. GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL", {
        status: "COMPLETED",
        certificationLevel: "FIXED_REVIEW_REQUIRED",
        review_required: true,
        structural_metadata_governance: { internal_standard_report_generated: true },
        applied_fixes: [{ code: 'GENERATE_STANDARD_VALIDATION_REPORT_INTERNAL' }]
    }, [
        { type: "validation_report", filename: "val.html", size_bytes: 100 }
    ], {
        operator_contains: ["An internal standards governance report was generated."],
        customer_contains: ["A standards review summary was generated for internal review."],
        artifact_ux_checks: [
            { type: 'validation_report', customer_badge: 'Internal Governance' }
        ]
    });

    await testScenario("8. certified.pdf with metadata cleanup", {
        status: "COMPLETED",
        structural_metadata_governance: { metadata_cleanup_applied: true },
        artifact_trust: { production_certified: true, standard_certified: false }
    }, [
        { type: "certified_pdf", filename: "certified.pdf", size_bytes: 1000, production_certified: true }
    ], {
        customer_contains: ["The file metadata was cleaned to avoid unsupported certification claims."],
        artifact_ux_checks: [
            { type: 'certified_pdf', customer_badge: 'Metadata cleaned', warning: "Metadata cleanup does not prove PDF/X or PDF/A compliance." }
        ]
    });

    await testScenario("9. conflicting legacy metadata says standard_certified=true", {
        status: "COMPLETED",
        standard_certified: true,
        structural_metadata_governance: { false_certification_revoked: true, standard_certified: false }
    }, [], {
        standard_certified: false
    });

    await testScenario("10. customer public sanitation", {
        status: "COMPLETED",
        structural_metadata_governance: {
            evidence: {
                qpdf_command: "qpdf --linearize",
                local_path: "/tmp/foo.pdf",
                raw_xmp: "<xmp>secret</xmp>",
                internal_id: "idx_999",
                forensic_object_id: "obj_123"
            }
        }
    }, [], {
        sanitation_checks: ["qpdf --linearize", "/tmp/foo.pdf", "<xmp>secret</xmp>", "idx_999", "obj_123"]
    });

    await testScenario("11. readiness / gates", {
        status: "COMPLETED",
        review_required: true,
        structural_metadata_governance: { metadata_cleanup_applied: true }
    }, [], {
        review_required: true
    });

    // Write reports
    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const reportPathJson = path.join(reportsDir, 'phase61d_control_plane_structural_metadata_human_report.json');
    const reportPathMd = path.join(reportsDir, 'phase61d_control_plane_structural_metadata_human_report.md');

    fs.writeFileSync(reportPathJson, JSON.stringify(results, null, 2));

    let md = `# Phase 61D Smoke Test Report\n\n`;
    md += `Status: ${hasFailures ? 'FAIL' : 'PASS'}\n\n`;
    results.forEach(r => {
        md += `## ${r.name}\n- Result: ${r.passed ? '✅ PASS' : '❌ FAIL'}\n`;
        if (r.errors.length > 0) {
            md += `- Errors:\n${r.errors.map(e => `  - ${e}`).join('\n')}\n`;
        }
        md += '\n';
    });
    fs.writeFileSync(reportPathMd, md);

    if (hasFailures) process.exit(1);
    console.log("=== All Phase 61D Smoke Tests Passed ===");
}

runSmokeTests();
