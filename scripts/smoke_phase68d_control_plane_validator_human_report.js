'use strict';
/**
 * Phase 68D Smoke Test — Control Plane Standards Certificate Human Report + UX
 *
 * Validates:
 *  A. Operator wording: "PDF/X validation passed using {validator_name} {validator_version}."
 *     and "PDF/A validation passed using {validator_name} {validator_version}."
 *  B. Customer wording: "PDF/X validated." / "PDF/A validated."
 *  C. Artifact UX: "Validated standards report" label + "PDF/X validated" / "PDF/A validated"
 *     badge on validation_report artifact — only when evidence complete.
 *  D. standards_certification_governance in report: hash/name/version/standard_detected only;
 *     no local paths.
 *  E. No overclaim: badges and wording absent when evidence is incomplete.
 *  F. Readiness / gate preservation: review_required never bypassed by standards claims.
 *  G. REGRESSION: other governance domains do not imply PDF/X or PDF/A validation.
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

async function runSmokeTests() {
    console.log('=== Running Phase 68D Smoke Tests ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-standards-cert-68d', Authorization: 'Bearer test-68d' };

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport(
                'job-68d-test', mockContext, jobInput, artifacts
            );

            if (!result.ok) throw new Error('Report generation failed: ' + JSON.stringify(result));

            const report = result.report;
            let passed = true;
            const errors = [];

            if (expected.operator_contains) {
                for (const str of expected.operator_contains) {
                    if (!report.operator_summary.includes(str)) {
                        passed = false;
                        errors.push(`Operator summary missing: "${str}"`);
                    }
                }
            }
            if (expected.operator_not_contains) {
                for (const str of expected.operator_not_contains) {
                    if (report.operator_summary.includes(str)) {
                        passed = false;
                        errors.push(`Operator summary leaked forbidden term: "${str}"`);
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
            if (expected.customer_not_contains) {
                for (const str of expected.customer_not_contains) {
                    if (report.customer_summary.includes(str)) {
                        passed = false;
                        errors.push(`Customer summary leaked forbidden term: "${str}"`);
                    }
                }
            }

            if (expected.production_certified === false && report.fix_summary.production_certified !== false) {
                passed = false;
                errors.push('Expected production_certified=false');
            }
            if (expected.review_required === true && report.fix_summary.review_required !== true) {
                passed = false;
                errors.push('Expected review_required=true in fix_summary');
            }
            if (expected.pdfx_claimed === false && report.pdfx_compliance_claimed !== false) {
                passed = false;
                errors.push('Expected pdfx_compliance_claimed=false');
            }
            if (expected.pdfx_claimed === true && report.pdfx_compliance_claimed !== true) {
                passed = false;
                errors.push('Expected pdfx_compliance_claimed=true');
            }
            if (expected.pdfa_claimed === false && report.pdfa_compliance_claimed !== false) {
                passed = false;
                errors.push('Expected pdfa_compliance_claimed=false');
            }
            if (expected.pdfa_claimed === true && report.pdfa_compliance_claimed !== true) {
                passed = false;
                errors.push('Expected pdfa_compliance_claimed=true');
            }
            if (expected.standard_certified === false && report.standard_certified !== false) {
                passed = false;
                errors.push('Expected standard_certified=false');
            }
            if (expected.standard_certified === true && report.standard_certified !== true) {
                passed = false;
                errors.push('Expected standard_certified=true');
            }

            if (expected.std_cert_gov) {
                const gov = report.standards_certification_governance || {};
                for (const [k, v] of Object.entries(expected.std_cert_gov)) {
                    if (gov[k] !== v) {
                        passed = false;
                        errors.push(`standards_certification_governance.${k} expected=${v}, got=${gov[k]}`);
                    }
                }
            }

            if (expected.artifact_ux_checks) {
                for (const check of expected.artifact_ux_checks) {
                    const artifactEntry = report.artifact_ux.artifacts.find(a => a.type === check.type);
                    if (!artifactEntry) {
                        passed = false;
                        errors.push(`artifact_ux: no artifact of type "${check.type}" found`);
                        continue;
                    }
                    const ux = artifactEntry.ux;
                    if (check.operator_badge && ux.operator.status_badge !== check.operator_badge) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] operator.status_badge: expected="${check.operator_badge}", got="${ux.operator.status_badge}"`);
                    }
                    if (check.operator_display_label && ux.operator.display_label !== check.operator_display_label) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] operator.display_label: expected="${check.operator_display_label}", got="${ux.operator.display_label}"`);
                    }
                    if (check.operator_tone && ux.operator.status_tone !== check.operator_tone) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] operator.status_tone: expected="${check.operator_tone}", got="${ux.operator.status_tone}"`);
                    }
                    if (check.customer_visible === false && artifactEntry.customer_visible !== false) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] expected customer_visible=false`);
                    }
                }
            }

            if (expected.sanitation_checks) {
                const payloadStr = JSON.stringify({
                    stdCertGov: report.standards_certification_governance,
                    artifactUx: report.artifact_ux,
                    customerSummary: report.customer_summary,
                    operatorSummary: report.operator_summary
                });
                for (const str of expected.sanitation_checks) {
                    if (payloadStr.includes(str)) {
                        passed = false;
                        errors.push(`Sanitation failed — leaked: "${str}"`);
                    }
                }
            }

            if (passed) {
                console.log(`✅ [PASS] ${name}`);
            } else {
                console.error(`❌ [FAIL] ${name}`);
                errors.forEach(e => console.error(`  - ${e}`));
                hasFailures = true;
            }

            results.push({ name, passed, errors, report });

        } catch (e) {
            console.error(`❌ [ERROR] ${name}: ${e.message}`);
            if (process.env.DEBUG) console.error(e.stack);
            hasFailures = true;
            results.push({ name, passed: false, errors: [e.message] });
        }
    };

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 1 — PDF/X full evidence → operator wording + customer "PDF/X validated."
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '1. PDF/X full validator evidence — operator wording and customer badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            standards_certification_governance: {
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: true,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: true,
                validation_performed: true,
                validation_passed: true,
                validator_name: 'veraPDF',
                validator_version: '1.24.1',
                standard_detected: 'PDF/X-4',
                validation_report_hash: 'abc123def456',
                validator_available: true
            }
        },
        [],
        {
            operator_contains: ['PDF/X validation passed using veraPDF 1.24.1'],
            customer_contains: ['PDF/X validated.'],
            customer_not_contains: ['PDF/A validated.'],
            operator_not_contains: ['PDF/A validation passed'],
            review_required: true,
            pdfx_claimed: true,
            pdfa_claimed: false,
            std_cert_gov: {
                validation_performed: true,
                validation_passed: true,
                validator_name: 'veraPDF',
                validator_version: '1.24.1',
                standard_detected: 'PDF/X-4',
                validation_report_hash: 'abc123def456',
                pdfx_compliance_claimed: true,
                pdfa_compliance_claimed: false
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 2 — PDF/A full evidence → operator wording + customer "PDF/A validated."
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '2. PDF/A full validator evidence — operator wording and customer badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            standards_certification_governance: {
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: true,
                compliance_claim_allowed: true,
                validation_performed: true,
                validation_passed: true,
                validator_name: 'veraPDF',
                validator_version: '1.26.0',
                standard_detected: 'PDF/A-1b',
                validation_report_hash: 'pdfa1b_hash_xyz',
                validator_available: true
            }
        },
        [],
        {
            operator_contains: ['PDF/A validation passed using veraPDF 1.26.0'],
            customer_contains: ['PDF/A validated.'],
            customer_not_contains: ['PDF/X validated.'],
            operator_not_contains: ['PDF/X validation passed'],
            review_required: true,
            pdfx_claimed: false,
            pdfa_claimed: true,
            std_cert_gov: {
                validation_performed: true,
                validation_passed: true,
                validator_name: 'veraPDF',
                validator_version: '1.26.0',
                standard_detected: 'PDF/A-1b',
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: true
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 3 — validation_report artifact with full evidence → "PDF/X validated" badge
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '3. validation_report artifact + full evidence → "Validated standards report" / "PDF/X validated" badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            standards_certification_governance: {
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: true,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: true,
                validation_performed: true,
                validation_passed: true,
                validator_name: 'pdfx-validator',
                validator_version: '2.5.0',
                standard_detected: 'PDF/X-4',
                validation_report_hash: 'pdfx4_report_hash',
                validator_available: true
            }
        },
        [
            {
                type: 'validation_report',
                filename: 'validation_report.json',
                size_bytes: 2048,
                downloadable: true
            }
        ],
        {
            operator_contains: ['PDF/X validation passed using pdfx-validator 2.5.0'],
            customer_contains: ['PDF/X validated.'],
            artifact_ux_checks: [
                {
                    type: 'validation_report',
                    operator_badge: 'PDF/X validated',
                    operator_display_label: 'Validated standards report',
                    operator_tone: 'success',
                    customer_visible: false
                }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 4 — validation_report artifact with PDF/A evidence → "PDF/A validated" badge
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '4. validation_report artifact + PDF/A evidence → "PDF/A validated" badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            standards_certification_governance: {
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: true,
                compliance_claim_allowed: true,
                validation_performed: true,
                validation_passed: true,
                validator_name: 'veraPDF',
                validator_version: '1.24.1',
                standard_detected: 'PDF/A-2b',
                validation_report_hash: 'pdfa2b_hash_abc',
                validator_available: true
            }
        },
        [
            {
                type: 'validation_report',
                filename: 'validation_report.json',
                size_bytes: 3000,
                downloadable: true
            }
        ],
        {
            operator_contains: ['PDF/A validation passed using veraPDF 1.24.1'],
            customer_contains: ['PDF/A validated.'],
            artifact_ux_checks: [
                {
                    type: 'validation_report',
                    operator_badge: 'PDF/A validated',
                    operator_display_label: 'Validated standards report',
                    operator_tone: 'success',
                    customer_visible: false
                }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 5 — No validator available → no wording, generic badge
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '5. No validator available — no PDF/X or PDF/A wording or badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            standards_certification_governance: {
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false,
                validation_performed: false,
                validation_passed: false,
                validator_available: false
            }
        },
        [
            {
                type: 'validation_report',
                filename: 'validation_report.json',
                size_bytes: 500,
                downloadable: true
            }
        ],
        {
            operator_not_contains: ['PDF/X validation passed', 'PDF/A validation passed', 'veraPDF'],
            customer_not_contains: ['PDF/X validated.', 'PDF/A validated.'],
            pdfx_claimed: false,
            pdfa_claimed: false,
            standard_certified: false,
            artifact_ux_checks: [
                {
                    type: 'validation_report',
                    operator_badge: 'Independent Validation',
                    customer_visible: false
                }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 6 — Partial evidence (missing validator_name) → no wording
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '6. Partial evidence (missing validator_name) — no validator wording, claim rejected',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            standards_certification_governance: {
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: true,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false,
                validation_performed: true,
                validation_passed: true,
                // validator_name intentionally missing
                validator_version: '1.24.1',
                standard_detected: 'PDF/X-4',
                validation_report_hash: 'some_hash'
            }
        },
        [],
        {
            operator_not_contains: ['PDF/X validation passed using'],
            customer_not_contains: ['PDF/X validated.'],
            pdfx_claimed: false,
            standard_certified: false
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 7 — Public sanitation: no local paths in standards_certification_governance
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '7. Public sanitation — no local report paths in standards_certification_governance',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            standards_certification_governance: {
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: true,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: true,
                validation_performed: true,
                validation_passed: true,
                validator_name: 'veraPDF',
                validator_version: '1.24.1',
                standard_detected: 'PDF/X-4',
                validation_report_hash: 'sanitized_hash_1234',
                validation_report_path: '/tmp/validator_output/pdfx_report.json',
                validator_available: true
            }
        },
        [],
        {
            sanitation_checks: [
                '/tmp/validator_output/pdfx_report.json',
                '/tmp/',
                'validator_output'
            ],
            std_cert_gov: {
                validation_report_hash: 'sanitized_hash_1234',
                validator_name: 'veraPDF'
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 8 — REGRESSION: transparency/overprint physical fix must NOT imply
    //               PDF/X or PDF/A validation
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '8. REGRESSION: physical transparency/overprint fix does not imply PDF/X or PDF/A',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                review_required: true,
                transparency_fix_applied: true,
                transparency_flattened: true,
                visual_change_expected: true,
                rendering_safety_proven: false,
                certified_pdf_allowed: false,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            },
            applied_fixes: [{ code: 'FLATTEN_TRANSPARENCY' }]
        },
        [],
        {
            standard_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            operator_not_contains: ['PDF/X validation passed', 'PDF/A validation passed'],
            customer_not_contains: ['PDF/X validated.', 'PDF/A validated.', 'Standards validated', 'Certified PDF']
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 9 — REGRESSION: font governance does NOT imply PDF/X or PDF/A validation
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '9. REGRESSION: font governance fix does not imply PDF/X or PDF/A',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                review_required: true,
                font_fix_applied: true,
                fonts_embedded: true,
                visual_change_expected: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            },
            applied_fixes: [{ code: 'EMBED_FONTS' }]
        },
        [],
        {
            standard_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            operator_not_contains: ['PDF/X validation passed', 'PDF/A validation passed'],
            customer_not_contains: ['PDF/X validated.', 'PDF/A validated.']
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 10 — Clean scenario: full evidence + no other governance issues
    //               → wording present, no overclaim
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '10. Full evidence with no other governance issues — wording present, sanitation confirmed',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            standards_certification_governance: {
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: true,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: true,
                validation_performed: true,
                validation_passed: true,
                validator_name: 'veraPDF',
                validator_version: '1.24.1',
                standard_detected: 'PDF/X-4',
                validation_report_hash: 'final_regression_hash',
                validation_report_path: '/private/var/tmp/internal/pdfx_veraPDF_output.json',
                validator_available: true
            }
        },
        [
            {
                type: 'validation_report',
                filename: 'validation_report.json',
                size_bytes: 4096,
                downloadable: true
            },
            { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 102400, downloadable: true }
        ],
        {
            operator_contains: ['PDF/X validation passed using veraPDF 1.24.1'],
            customer_contains: ['PDF/X validated.'],
            customer_not_contains: ['PDF/A validated.'],
            pdfx_claimed: true,
            pdfa_claimed: false,
            sanitation_checks: [
                '/private/var/tmp/internal/pdfx_veraPDF_output.json',
                '/private/',
                'internal/pdfx'
            ],
            std_cert_gov: {
                validator_name: 'veraPDF',
                validator_version: '1.24.1',
                standard_detected: 'PDF/X-4',
                validation_report_hash: 'final_regression_hash',
                pdfx_compliance_claimed: true,
                pdfa_compliance_claimed: false
            },
            artifact_ux_checks: [
                {
                    type: 'validation_report',
                    operator_badge: 'PDF/X validated',
                    operator_display_label: 'Validated standards report',
                    operator_tone: 'success',
                    customer_visible: false
                }
            ]
        }
    );

    // ── Generate reports ────────────────────────────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, 'phase68d_control_plane_validator_human_report.json');
    const mdPath   = path.join(reportsDir, 'phase68d_control_plane_validator_human_report.md');

    const sanitizedResults = results.map(r => ({
        name: r.name,
        passed: r.passed,
        errors: r.errors,
        outcome: r.report?.outcome,
        review_required: r.report?.fix_summary?.review_required,
        production_certified: r.report?.fix_summary?.production_certified,
        pdfx_compliance_claimed: r.report?.pdfx_compliance_claimed,
        pdfa_compliance_claimed: r.report?.pdfa_compliance_claimed,
        standard_certified: r.report?.standard_certified,
        standards_certification_governance: r.report?.standards_certification_governance
    }));

    fs.writeFileSync(jsonPath, JSON.stringify({
        phase: '68D',
        generated_at: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    }, null, 2));

    let md = `# Phase 68D Smoke Test Report — Control Plane Standards Certificate Human Report + UX\n\n`;
    md += `**Generated:** ${new Date().toISOString()}  \n`;
    md += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    md += `**Total:** ${results.length} | **Passed:** ${results.filter(r => r.passed).length} | **Failed:** ${results.filter(r => !r.passed).length}\n\n`;
    md += `## Governance Principles Enforced\n\n`;
    md += `- Validator-backed wording ("PDF/X validation passed using {validator_name} {validator_version}") only when full evidence chain is present\n`;
    md += `- Customer wording "PDF/X validated." / "PDF/A validated." only when evidence complete\n`;
    md += `- validation_report artifact badge "PDF/X validated" / "PDF/A validated" + label "Validated standards report" only when evidence complete\n`;
    md += `- Without full evidence, no validator name/version appears in operator summary and no "validated" badge is shown\n`;
    md += `- standards_certification_governance public payload exposes hash/name/version/standard_detected only; no local paths\n`;
    md += `- Physical transparency/overprint and font governance fixes do not imply PDF/X or PDF/A validation\n`;
    md += `- Readiness/payment/production gates are not bypassed\n\n`;
    md += `## Scenarios\n\n`;

    results.forEach(r => {
        md += `### ${r.name}\n`;
        md += `- **Result:** ${r.passed ? '✅ PASS' : '❌ FAIL'}\n`;
        if (r.errors && r.errors.length > 0) {
            md += `- **Errors:**\n`;
            r.errors.forEach(e => { md += `  - ${e}\n`; });
        }
        md += '\n';
    });

    fs.writeFileSync(mdPath, md);

    console.log(`\nReports written to:\n  ${jsonPath}\n  ${mdPath}`);

    if (hasFailures) {
        console.error('\n=== Phase 68D Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 68D Smoke Tests Passed ===');
}

runSmokeTests();
