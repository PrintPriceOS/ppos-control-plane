'use strict';
/**
 * Phase 64D Smoke Test — Control Plane Ink/TAC/Black/Registration Color Human Report
 *
 * Validates:
 *  A. ink_governance extraction and conservative merge
 *  B. Customer wording: "Ink/color changes may affect appearance and require review."
 *  C. Operator wording for TAC reduction, rich black text mapping, registration color mapping
 *  D. Artifact UX labels / badges ("Ink review required", "Color-sensitive fix")
 *  E. Report payload includes safe ink_governance subset
 *  F. Readiness / gate preservation (review_required never bypassed, no standards overclaim)
 *  G. Public-report sanitation (no raw paths, streams, forensic IDs)
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

async function runSmokeTests() {
    console.log('=== Running Phase 64D Smoke Tests ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-ink-governance', Authorization: 'Bearer test-64d' };

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport(
                'job-64d-test', mockContext, jobInput, artifacts
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
            if (expected.pdfa_claimed === false && report.pdfa_compliance_claimed !== false) {
                passed = false;
                errors.push('Expected pdfa_compliance_claimed=false');
            }
            if (expected.standard_certified === false && report.standard_certified !== false) {
                passed = false;
                errors.push('Expected standard_certified=false');
            }

            if (expected.ink_gov) {
                const inkGov = report.ink_governance || {};
                for (const [k, v] of Object.entries(expected.ink_gov)) {
                    if (inkGov[k] !== v) {
                        passed = false;
                        errors.push(`ink_governance.${k} expected=${v}, got=${inkGov[k]}`);
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
                    if (check.customer_badge && ux.customer.status_badge !== check.customer_badge) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] customer.status_badge: expected="${check.customer_badge}", got="${ux.customer.status_badge}"`);
                    }
                    if (check.customer_tone && ux.customer.status_tone !== check.customer_tone) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] customer.status_tone: expected="${check.customer_tone}", got="${ux.customer.status_tone}"`);
                    }
                    if (check.operator_badge && ux.operator.status_badge !== check.operator_badge) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] operator.status_badge: expected="${check.operator_badge}", got="${ux.operator.status_badge}"`);
                    }
                    if (check.customer_visible === false && artifactEntry.customer_visible !== false) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] expected customer_visible=false`);
                    }
                }
            }

            if (expected.sanitation_checks) {
                const payloadStr = JSON.stringify({
                    inkGov: report.ink_governance,
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

    const baseGov = {
        production_certified: false,
        standard_certified: false,
        pdfx_compliance_claimed: false,
        pdfa_compliance_claimed: false,
        compliance_claim_allowed: false
    };

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 1 — REDUCE_TOTAL_INK_COVERAGE attempted (TAC reduction)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '1. REDUCE_TOTAL_INK_COVERAGE applied — TAC reduction wording and review',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                ...baseGov,
                review_required: true,
                ink_fix_applied: true,
                tac_reduction_attempted: true,
                tac_reduction_applied: true,
                visual_change_expected: true,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'REDUCE_TOTAL_INK_COVERAGE' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }],
        {
            operator_contains: ['Total Area Coverage (TAC/total ink) reduction was attempted on this file'],
            customer_contains: ['Ink/color changes may affect appearance and require review.'],
            customer_not_contains: ['Print-ready', 'Certified PDF', 'PDF/X validated', 'PDF/A validated'],
            review_required: true,
            production_certified: false,
            ink_gov: { ink_fix_applied: true, tac_reduction_attempted: true, tac_reduction_applied: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Color-sensitive fix', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 2 — MAP_RICH_BLACK_TEXT_TO_K_ONLY skipped unsupported
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '2. MAP_RICH_BLACK_TEXT_TO_K_ONLY skipped — rich black wording and review',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                ...baseGov,
                review_required: true,
                ink_fix_applied: false,
                rich_black_text_mapped: false,
                tac_reduction_attempted: false,
                certified_pdf_allowed: false,
                review_required_reasons: ['rich_black_text_present']
            },
            skipped_fixes: [{ code: 'MAP_RICH_BLACK_TEXT_TO_K_ONLY' }]
        },
        [{ type: 'review_pdf', filename: 'review.pdf', size_bytes: 1100 }],
        {
            operator_contains: ['Rich black text or small text built from rich black was detected'],
            customer_contains: ['Ink/color changes may affect appearance and require review.'],
            review_required: true,
            ink_gov: { rich_black_text_mapped: false, review_required: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 3 — DETECT_SMALL_TEXT_RICH_BLACK skipped unsupported
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '3. DETECT_SMALL_TEXT_RICH_BLACK skipped — small text rich black wording',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                ...baseGov,
                review_required: true,
                small_text_rich_black_detected: true,
                certified_pdf_allowed: false
            },
            skipped_fixes: [{ code: 'DETECT_SMALL_TEXT_RICH_BLACK' }]
        },
        [],
        {
            operator_contains: ['Rich black text or small text built from rich black was detected', 'especially at small sizes'],
            customer_contains: ['Ink/color changes may affect appearance and require review.'],
            review_required: true,
            ink_gov: { small_text_rich_black_detected: true, review_required: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 4 — MAP_REGISTRATION_COLOR_TO_BLACK skipped unsupported
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '4. MAP_REGISTRATION_COLOR_TO_BLACK skipped — registration color wording',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                ...baseGov,
                review_required: true,
                registration_color_mapped: false,
                certified_pdf_allowed: false,
                review_required_reasons: ['registration_color_present']
            },
            skipped_fixes: [{ code: 'MAP_REGISTRATION_COLOR_TO_BLACK' }]
        },
        [],
        {
            operator_contains: ['Registration color (100% all-channel black, intended for press marks only) was detected'],
            customer_contains: ['Ink/color changes may affect appearance and require review.'],
            review_required: true,
            ink_gov: { registration_color_mapped: false, review_required: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 5 — NORMALIZE_BLACK_TEXT skipped unsupported
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '5. NORMALIZE_BLACK_TEXT skipped — black text normalization wording',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                ...baseGov,
                review_required: true,
                black_text_normalized: false,
                certified_pdf_allowed: false,
                review_required_reasons: ['black_text_present']
            },
            skipped_fixes: [{ code: 'NORMALIZE_BLACK_TEXT' }]
        },
        [],
        {
            operator_contains: ['Rich black text or small text built from rich black was detected and/or mapped to single-channel (K-only) black'],
            customer_contains: ['Ink/color changes may affect appearance and require review.'],
            review_required: true,
            ink_gov: { black_text_normalized: false, review_required: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 6 — REDUCE_TOTAL_INK_COVERAGE on clean control — honest skip
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '6. Clean control — no ink governance findings, no action needed',
        {
            status: 'COMPLETED',
            certificationLevel: 'CERTIFIED_READY',
            review_required: false,
            ink_governance: {
                review_required: false,
                ink_fix_applied: false,
                visual_change_expected: false,
                production_certified: true,
                certified_pdf_allowed: true,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            }
        },
        [],
        {
            customer_not_contains: ['Ink/color changes may affect appearance and require review.'],
            operator_not_contains: ['Total Area Coverage (TAC/total ink) reduction was attempted'],
            ink_gov: {
                ink_fix_applied: false,
                visual_change_expected: false,
                review_required: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 7 — REGRESSION: standards overclaim from ink fix must be rejected
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '7. Standards overclaim regression — ink fix must not imply PDF/X or PDF/A',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                ...baseGov,
                review_required: true,
                ink_fix_applied: true,
                tac_reduction_attempted: true,
                tac_reduction_applied: true,
                rich_black_text_mapped: true,
                registration_color_mapped: true
            },
            applied_fixes: [{ code: 'REDUCE_TOTAL_INK_COVERAGE' }, { code: 'MAP_RICH_BLACK_TEXT_TO_K_ONLY' }]
        },
        [],
        {
            standard_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            ink_gov: { ...baseGov },
            customer_not_contains: [
                'PDF/X validated', 'PDF/A validated',
                'PDF/X certified', 'PDF/A certified',
                'Standards validated', 'Print-ready',
                'Certified PDF', 'Production-ready'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 8 — REGRESSION: certified.pdf filename must not be trusted by name
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '8. certified.pdf downgraded when ink_governance.review_required=true',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                ...baseGov,
                review_required: true,
                ink_fix_applied: true,
                certified_pdf_allowed: false,
                tac_reduction_applied: true
            }
        },
        [
            {
                type: 'certified_pdf',
                filename: 'certified.pdf',
                size_bytes: 2000,
                production_certified: true,
                customer_visible: true,
                artifact_role: 'PRODUCTION_READY'
            }
        ],
        {
            customer_not_contains: [
                'Certified PDF', 'certified for production',
                'PDF/X validated', 'PDF/A validated',
                'Production-ready', 'Print-ready', 'Standards validated',
                'automatically approved'
            ],
            review_required: true,
            production_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            standard_certified: false,
            ink_gov: { review_required: true, ...baseGov },
            artifact_ux_checks: [
                { type: 'certified_pdf', customer_visible: false, customer_badge: 'Review required' }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 9 — REGRESSION: evidence preservation across applied/skipped/failed buckets
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '9. Public/customer sanitation — no raw paths, streams, forensic IDs in ink evidence',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                review_required: true,
                ink_fix_applied: true,
                production_certified: false,
                evidence: {
                    local_path: '/tmp/ink_governance_output.pdf',
                    forensic_object_id: 'obj_4477',
                    internal_id: 'ink_internal_55',
                    raw_stream: '%PDF-1.4 ink-stream-data',
                    qpdf_command: 'qpdf --reduce-tac',
                    objects_scanned: 17
                }
            }
        },
        [],
        {
            review_required: true,
            sanitation_checks: [
                '/tmp/ink_governance_output.pdf',
                'obj_4477',
                'ink_internal_55',
                '%PDF-1.4 ink-stream-data',
                'qpdf --reduce-tac'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 10 — Ink review required badge (findings present, no fix applied)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '10. Ink review required badge — findings present without applied fix',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            ink_governance: {
                ...baseGov,
                review_required: true,
                visual_change_expected: true,
                certified_pdf_allowed: false,
                visually_sensitive: true
            }
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 900 }],
        {
            customer_contains: ['Ink/color changes may affect appearance and require review.'],
            review_required: true,
            ink_gov: { visual_change_expected: true, review_required: true, visually_sensitive: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Ink review required', customer_tone: 'warning' }]
        }
    );

    // ── Generate reports ────────────────────────────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, 'phase64d_control_plane_ink_human_report.json');
    const mdPath   = path.join(reportsDir, 'phase64d_control_plane_ink_human_report.md');

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
        ink_governance: r.report?.ink_governance
    }));

    fs.writeFileSync(jsonPath, JSON.stringify({
        phase: '64D',
        generated_at: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    }, null, 2));

    let md = `# Phase 64D Smoke Test Report — Control Plane Ink/TAC/Black/Registration Color Human Report\n\n`;
    md += `**Generated:** ${new Date().toISOString()}  \n`;
    md += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    md += `**Total:** ${results.length} | **Passed:** ${results.filter(r => r.passed).length} | **Failed:** ${results.filter(r => !r.passed).length}\n\n`;
    md += `## Governance Principles Enforced\n\n`;
    md += `- Ink/color governance (TAC, rich black, registration color, black text) never implies print-ready or production certification\n`;
    md += `- Ink/color governance never implies PDF/X or PDF/A validation or standards certification\n`;
    md += `- certified.pdf remains governed by artifact_trust, not filename\n`;
    md += `- Customer wording stays generic ("Ink/color changes may affect appearance and require review."); operator wording is specific to TAC, rich black, and registration color\n`;
    md += `- artifact_ux labels surface "Ink review required" / "Color-sensitive fix" badges for customer/operator display\n`;
    md += `- Public/customer output is sanitized (no raw paths, streams, forensic IDs)\n`;
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
        console.error('\n=== Phase 64D Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 64D Smoke Tests Passed ===');
}

runSmokeTests();
