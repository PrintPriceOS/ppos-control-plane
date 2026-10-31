'use strict';
/**
 * Phase 62D Smoke Test — Control Plane Page Marks Human Report
 *
 * Validates:
 *  A. page_marks_governance extraction and conservative merge
 *  B. translateFixMessage wording for ADD_CROP_MARKS / REMOVE_REGISTRATION_MARKS / NORMALIZE_PAGE_MARKS
 *  C. Customer-safe copy blocks (no forbidden production claims)
 *  D. Artifact UX labels / warnings / badges
 *  E. Report payload includes safe page_marks_governance subset
 *  F. Readiness / gate preservation (review_required never bypassed)
 *  G. Public-report sanitation (no raw paths, streams, forensic IDs)
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

async function runSmokeTests() {
    console.log('=== Running Phase 62D Smoke Tests ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-page-marks', Authorization: 'Bearer test-62d' };

    /**
     * Run one scenario.
     *   name       – human-readable label
     *   jobInput   – injected job object (simulating upstream data)
     *   artifacts  – injected artifacts array
     *   expected   – assertions object
     */
    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport(
                'job-62d-test', mockContext, jobInput, artifacts
            );

            if (!result.ok) throw new Error('Report generation failed: ' + JSON.stringify(result));

            const report = result.report;
            let passed = true;
            const errors = [];

            // ── operator wording ────────────────────────────────────────────
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

            // ── customer wording ────────────────────────────────────────────
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

            // ── governance flags ────────────────────────────────────────────
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

            // ── page_marks_governance payload ───────────────────────────────
            if (expected.pm_gov) {
                const pmGov = report.page_marks_governance || {};
                for (const [k, v] of Object.entries(expected.pm_gov)) {
                    if (pmGov[k] !== v) {
                        passed = false;
                        errors.push(`page_marks_governance.${k} expected=${v}, got=${pmGov[k]}`);
                    }
                }
            }

            // ── artifact_ux warnings ────────────────────────────────────────
            if (expected.artifact_ux_warnings_contain) {
                const uxWarnings = (report.artifact_ux?.warnings || []).join(' | ');
                for (const str of expected.artifact_ux_warnings_contain) {
                    if (!uxWarnings.includes(str)) {
                        passed = false;
                        errors.push(`artifact_ux.warnings missing: "${str}"`);
                    }
                }
            }

            // ── artifact_ux per-artifact checks ────────────────────────────
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
                    if (check.operator_warning_contains) {
                        const w = ux.operator.warning || '';
                        if (!w.includes(check.operator_warning_contains)) {
                            passed = false;
                            errors.push(`artifact_ux[${check.type}] operator.warning missing: "${check.operator_warning_contains}", got="${w}"`);
                        }
                    }
                    if (check.customer_visible === false && artifactEntry.customer_visible !== false) {
                        passed = false;
                        errors.push(`artifact_ux[${check.type}] expected customer_visible=false`);
                    }
                }
            }

            // ── sanitation ──────────────────────────────────────────────────
            if (expected.sanitation_checks) {
                const payloadStr = JSON.stringify({
                    pmGov: report.page_marks_governance,
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
    // Scenario 1 — ADD_CROP_MARKS applied cleanly
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '1. ADD_CROP_MARKS applied cleanly',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                crop_marks_added: true,
                page_marks_fix_applied: true,
                review_required: true,
                production_certified: false,
                visually_sensitive: true
            },
            applied_fixes: [{ code: 'ADD_CROP_MARKS' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }],
        {
            operator_contains: [
                'Crop marks were added outside the TrimBox.',
                'requires human review before production'
            ],
            customer_contains: [
                'Crop marks were added to help guide trimming.',
                'requires review before production'
            ],
            customer_not_contains: [
                'Print-ready', 'Production-ready', 'Certified PDF',
                'PDF/X validated', 'PDF/A validated', 'Automatically approved'
            ],
            review_required: true,
            production_certified: false,
            pm_gov: {
                crop_marks_added: true,
                page_marks_fix_applied: true,
                review_required: true,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            },
            artifact_ux_warnings_contain: ['Crop marks were added and require review before production.'],
            artifact_ux_checks: [
                {
                    type: 'fixed_pdf',
                    customer_badge: 'Crop marks added',
                    customer_tone: 'warning'
                }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 2 — ADD_CROP_MARKS insufficient margin
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '2. ADD_CROP_MARKS insufficient margin — cannot be added safely',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                insufficient_margin: true,
                review_required: true,
                production_certified: false,
                crop_marks_added: false
            },
            skipped_fixes: [{ code: 'ADD_CROP_MARKS' }]
        },
        [],
        {
            customer_contains: [
                'Crop marks could not be safely added because the page geometry did not provide enough space.'
            ],
            customer_not_contains: [
                'Crop marks were added to help guide trimming.',
                'Print-ready', 'Certified PDF', 'PDF/X validated'
            ],
            operator_contains: [
                'There was not enough margin outside the TrimBox to safely add crop marks.'
            ],
            review_required: true,
            production_certified: false,
            pm_gov: {
                insufficient_margin: true,
                review_required: true,
                crop_marks_added: false,
                standard_certified: false
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 3 — REMOVE_REGISTRATION_MARKS skipped (unsafe removal)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '3. REMOVE_REGISTRATION_MARKS skipped — safe removal could not be proven',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                removal_not_safe: true,
                registration_marks_removed: false,
                review_required: true,
                production_certified: false
            },
            skipped_fixes: [{ code: 'REMOVE_REGISTRATION_MARKS' }]
        },
        [],
        {
            operator_contains: [
                'Registration mark removal was skipped because safe removal could not be proven.'
            ],
            customer_contains: [
                'Some marks could not be safely removed automatically. A human review is required.'
            ],
            customer_not_contains: [
                'Registration marks were removed',
                'Print-ready', 'Certified PDF'
            ],
            review_required: true,
            production_certified: false,
            pm_gov: {
                removal_not_safe: true,
                registration_marks_removed: false,
                review_required: true
            },
            artifact_ux_warnings_contain: [
                'Registration mark removal was skipped because safe removal could not be proven.'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 4 — REGISTRATION_MARKS_INSIDE_TRIM
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '4. Marks inside TrimBox / live artwork detected',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                marks_inside_trim: true,
                review_required: true,
                production_certified: false
            }
        },
        [],
        {
            operator_contains: [
                'Marks were detected inside the TrimBox or near live artwork. Automatic removal was not performed.'
            ],
            customer_contains: [
                'The file includes page mark conditions that may affect trimming or production setup. A human review is required.'
            ],
            customer_not_contains: [
                'marks were removed',
                'Print-ready', 'Certified PDF'
            ],
            review_required: true,
            production_certified: false,
            pm_gov: {
                marks_inside_trim: true,
                review_required: true
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 5 — NORMALIZE_PAGE_MARKS — no overclaim
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '5. NORMALIZE_PAGE_MARKS — no overclaim, no production certification',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                page_marks_normalized: true,
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false
            },
            applied_fixes: [{ code: 'NORMALIZE_PAGE_MARKS' }]
        },
        [],
        {
            operator_contains: ['Page mark normalization was evaluated. No production certification is implied.'],
            customer_not_contains: [
                'Print-ready', 'Certified PDF', 'PDF/X validated', 'PDF/A validated',
                'production approved', 'Automatically approved'
            ],
            review_required: true,
            production_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            standard_certified: false,
            pm_gov: {
                page_marks_normalized: true,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                standard_certified: false,
                compliance_claim_allowed: false
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 6 — certified.pdf with page mark review required
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '6. certified.pdf downgraded when page_marks_governance.review_required=true',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                review_required: true,
                certified_pdf_allowed: false,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
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
                'PDF/X certified', 'PDF/A certified',
                'Production-ready', 'Print-ready', 'Standards validated',
                'automatically approved'
            ],
            review_required: true,
            production_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            standard_certified: false,
            pm_gov: {
                review_required: true,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            },
            artifact_ux_checks: [
                {
                    type: 'certified_pdf',
                    customer_visible: false,
                    customer_badge: 'Review required'
                }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 7 — artifact_trust explicitly allows production post-review
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '7. artifact_trust authoritative — preserves page marks warnings even when allowing production',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                crop_marks_added: true,
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            },
            artifact_trust: {
                production_certified: true,
                review_required: true,
                certified_pdf_allowed: true,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            }
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1500 }],
        {
            // Page mark warnings MUST be preserved regardless of artifact_trust
            operator_contains: ['Crop marks were added outside the TrimBox.'],
            customer_contains: ['Crop marks were added to help guide trimming.'],
            // No standards overclaims
            pdfx_claimed: false,
            pdfa_claimed: false,
            standard_certified: false,
            pm_gov: {
                crop_marks_added: true,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                standard_certified: false,
                compliance_claim_allowed: false
            },
            artifact_ux_warnings_contain: ['Crop marks were added and require review before production.']
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 8 — standards overclaim regression
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '8. Standards overclaim regression — page mark fix must not imply PDF/X or PDF/A',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                crop_marks_added: true,
                page_marks_fix_applied: true,
                review_required: true,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            },
            applied_fixes: [{ code: 'ADD_CROP_MARKS' }]
        },
        [],
        {
            standard_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            pm_gov: {
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            },
            customer_not_contains: [
                'PDF/X validated', 'PDF/A validated',
                'PDF/X certified', 'PDF/A certified',
                'Standards validated', 'Print-ready',
                'Certified PDF', 'Production-ready'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 9 — public/customer sanitation (no raw internals)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '9. Public/customer sanitation — no raw paths, streams, forensic IDs',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                review_required: true,
                production_certified: false,
                evidence: {
                    // These must NOT appear in the report payload
                    local_path: '/tmp/page_marks_output.pdf',
                    forensic_object_id: 'obj_4422',
                    internal_id: 'mark_internal_55',
                    raw_stream: '%PDF-1.4 stream-data',
                    qpdf_command: 'qpdf --page-marks-strip',
                    // This is safe and may appear
                    bbox_evaluated: true
                }
            }
        },
        [],
        {
            review_required: true,
            sanitation_checks: [
                '/tmp/page_marks_output.pdf',
                'obj_4422',
                'mark_internal_55',
                '%PDF-1.4 stream-data',
                'qpdf --page-marks-strip'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 10 — artifact_ux warning completeness
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '10. artifact_ux warning — crop marks badge and review required warning',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            page_marks_governance: {
                crop_marks_added: true,
                removal_not_safe: true,
                review_required: true,
                production_certified: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            },
            applied_fixes: [{ code: 'ADD_CROP_MARKS' }]
        },
        [
            { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1200 },
            { type: 'review_pdf', filename: 'review.pdf', size_bytes: 1200 }
        ],
        {
            artifact_ux_warnings_contain: [
                'Crop marks were added and require review before production.',
                'Registration mark removal was skipped because safe removal could not be proven.',
                'Page mark conditions require human review before production.'
            ],
            artifact_ux_checks: [
                {
                    type: 'fixed_pdf',
                    customer_badge: 'Crop marks added',
                    customer_tone: 'warning'
                },
                {
                    type: 'review_pdf',
                    customer_badge: 'Needs review'
                }
            ],
            pm_gov: {
                crop_marks_added: true,
                removal_not_safe: true,
                review_required: true,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            }
        }
    );

    // ── Generate reports ────────────────────────────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, 'phase62d_control_plane_page_marks_human_report.json');
    const mdPath   = path.join(reportsDir, 'phase62d_control_plane_page_marks_human_report.md');

    // Sanitize results before writing (strip large embedded reports)
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
        pm_gov: r.report?.page_marks_governance,
        artifact_ux_warning_count: r.report?.artifact_ux?.warnings?.length,
        artifact_ux_warnings: r.report?.artifact_ux?.warnings
    }));

    fs.writeFileSync(jsonPath, JSON.stringify({
        phase: '62D',
        generated_at: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    }, null, 2));

    let md = `# Phase 62D Smoke Test Report — Control Plane Page Marks Human Report\n\n`;
    md += `**Generated:** ${new Date().toISOString()}  \n`;
    md += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    md += `**Total:** ${results.length} | **Passed:** ${results.filter(r => r.passed).length} | **Failed:** ${results.filter(r => !r.passed).length}\n\n`;
    md += `## Governance Principles Enforced\n\n`;
    md += `- Page mark fixes never imply print-ready or production certification\n`;
    md += `- Page mark fixes never imply PDF/X or PDF/A validation\n`;
    md += `- certified.pdf remains governed by artifact_trust, not filename\n`;
    md += `- artifact_ux labels and warnings are safe for customer/operator display\n`;
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
        console.error('\n=== Phase 62D Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 62D Smoke Tests Passed ===');
}

runSmokeTests();
