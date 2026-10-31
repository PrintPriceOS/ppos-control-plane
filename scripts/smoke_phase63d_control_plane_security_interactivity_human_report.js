'use strict';
/**
 * Phase 63D Smoke Test — Control Plane Security/Interactivity Human Report
 *
 * Validates:
 *  A. security_interactivity_governance extraction and conservative merge
 *  B. translateFixMessage wording for STRIP_JAVASCRIPT / REMOVE_LAUNCH_ACTIONS /
 *     REMOVE_EMBEDDED_FILES / REMOVE_DOCUMENT_OPEN_ACTIONS / REMOVE_PAGE_OPEN_ACTIONS /
 *     FLATTEN_ANNOTATIONS / FLATTEN_FORMS
 *  C. Customer-safe copy blocks (no forbidden production/standards claims)
 *  D. Artifact UX labels / warnings / badges (Active content removed,
 *     Interactive content reviewed, Review required, Security cleanup)
 *  E. Report payload includes safe security_interactivity_governance subset
 *  F. Readiness / gate preservation (review_required never bypassed)
 *  G. Public-report sanitation (no raw paths, streams, forensic IDs)
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

async function runSmokeTests() {
    console.log('=== Running Phase 63D Smoke Tests ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-security-interactivity', Authorization: 'Bearer test-63d' };

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
                'job-63d-test', mockContext, jobInput, artifacts
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

            // ── security_interactivity_governance payload ──────────────────
            if (expected.si_gov) {
                const siGov = report.security_interactivity_governance || {};
                for (const [k, v] of Object.entries(expected.si_gov)) {
                    if (siGov[k] !== v) {
                        passed = false;
                        errors.push(`security_interactivity_governance.${k} expected=${v}, got=${siGov[k]}`);
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
                    siGov: report.security_interactivity_governance,
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
    // Scenario 1 — JavaScript removed
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '1. STRIP_JAVASCRIPT applied — JavaScript removed',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                security_interactivity_fix_applied: true,
                active_content_removed: true,
                javascript_removed: true,
                security_sensitive: true
            },
            applied_fixes: [{ code: 'STRIP_JAVASCRIPT' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }],
        {
            operator_contains: ['Embedded JavaScript was removed because it can pose a security risk'],
            customer_contains: ['Potentially unsafe interactive content', 'removed from the PDF for security'],
            customer_not_contains: ['Print-ready', 'Certified PDF', 'PDF/X validated', 'PDF/A validated'],
            review_required: true,
            production_certified: false,
            si_gov: { active_content_removed: true, javascript_removed: true, review_required: true, ...baseGov },
            artifact_ux_warnings_contain: ['Active/interactive content was removed for security and requires review.'],
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Active content removed', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 2 — Launch action removed
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '2. REMOVE_LAUNCH_ACTIONS applied — launch action removed',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                active_content_removed: true,
                launch_actions_removed: true
            },
            applied_fixes: [{ code: 'REMOVE_LAUNCH_ACTIONS' }]
        },
        [],
        {
            operator_contains: ['Launch actions that could open external programs or files were removed for security'],
            review_required: true,
            production_certified: false,
            si_gov: { launch_actions_removed: true, active_content_removed: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 3 — Embedded file removed
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '3. REMOVE_EMBEDDED_FILES applied — embedded file removed',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                active_content_removed: true,
                embedded_files_removed: true
            },
            applied_fixes: [{ code: 'REMOVE_EMBEDDED_FILES' }]
        },
        [],
        {
            operator_contains: ['Embedded files attached to the PDF were removed for security'],
            review_required: true,
            si_gov: { embedded_files_removed: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 4 — Document open action removed
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '4. REMOVE_DOCUMENT_OPEN_ACTIONS applied — document open action removed',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                active_content_removed: true,
                document_open_actions_removed: true
            },
            applied_fixes: [{ code: 'REMOVE_DOCUMENT_OPEN_ACTIONS' }]
        },
        [],
        {
            operator_contains: ['Actions that automatically run when the document opens were removed for security'],
            review_required: true,
            si_gov: { document_open_actions_removed: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 5 — Page open action removed
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '5. REMOVE_PAGE_OPEN_ACTIONS applied — page open action removed',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                active_content_removed: true,
                page_open_actions_removed: true
            },
            applied_fixes: [{ code: 'REMOVE_PAGE_OPEN_ACTIONS' }]
        },
        [],
        {
            operator_contains: ['Actions that automatically run when a page opens were removed for security'],
            review_required: true,
            si_gov: { page_open_actions_removed: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 6 — Annotation flatten applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '6. FLATTEN_ANNOTATIONS applied — visual review required',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                security_interactivity_fix_applied: true,
                annotations_flattened: true,
                visually_sensitive: true
            },
            applied_fixes: [{ code: 'FLATTEN_ANNOTATIONS' }]
        },
        [{ type: 'review_pdf', filename: 'review.pdf', size_bytes: 1200 }],
        {
            operator_contains: ['Annotations were flattened into the page content for print safety', 'requires human review'],
            customer_contains: ['Some interactive elements (annotations or form fields) were flattened into the page'],
            customer_not_contains: ['Print-ready', 'Certified PDF'],
            review_required: true,
            si_gov: { annotations_flattened: true, visually_sensitive: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'review_pdf', customer_badge: 'Needs review' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 7 — Annotation flatten skipped unsupported
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '7. FLATTEN_ANNOTATIONS skipped — appearance preservation could not be proven',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                annotation_flatten_skipped: true,
                visually_sensitive: true
            },
            skipped_fixes: [{ code: 'FLATTEN_ANNOTATIONS' }]
        },
        [{ type: 'review_pdf', filename: 'review.pdf', size_bytes: 1100 }],
        {
            operator_contains: ['Annotation flattening was skipped because safe preservation of visual appearance could not be proven'],
            customer_contains: ['Some interactive content could not be safely simplified automatically and still requires review.'],
            customer_not_contains: ['were flattened into the page content for print safety'],
            review_required: true,
            si_gov: { annotation_flatten_skipped: true, review_required: true, ...baseGov },
            artifact_ux_warnings_contain: ['Annotation/form flattening was skipped because safe appearance preservation could not be proven.']
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 8 — Form flatten applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '8. FLATTEN_FORMS applied — visual review required',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                security_interactivity_fix_applied: true,
                forms_flattened: true,
                visually_sensitive: true
            },
            applied_fixes: [{ code: 'FLATTEN_FORMS' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1300 }],
        {
            operator_contains: ['Interactive form fields were flattened into the page content for print safety', 'requires human review'],
            customer_contains: ['Some interactive elements (annotations or form fields) were flattened into the page'],
            review_required: true,
            si_gov: { forms_flattened: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Interactive content reviewed', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 9 — Form flatten skipped unsupported
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '9. FLATTEN_FORMS skipped — appearance preservation could not be proven',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                form_flatten_skipped: true,
                visually_sensitive: true
            },
            skipped_fixes: [{ code: 'FLATTEN_FORMS' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1300 }],
        {
            operator_contains: ['Form flattening was skipped because safe preservation of visual appearance could not be proven'],
            customer_not_contains: ['were flattened into the page content for print safety'],
            review_required: true,
            si_gov: { form_flatten_skipped: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Review required', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 10 — Mixed active content (multiple removals + unresolved content)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '10. Mixed active content — multiple removals and unresolved content preserve evidence',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                security_interactivity_fix_applied: true,
                active_content_removed: true,
                javascript_removed: true,
                launch_actions_removed: true,
                embedded_files_removed: true,
                unresolved_interactive_content: true,
                security_sensitive: true,
                visually_sensitive: true,
                review_required_reasons: ['unresolved_interactive_content_present']
            },
            applied_fixes: [{ code: 'STRIP_JAVASCRIPT' }, { code: 'REMOVE_LAUNCH_ACTIONS' }, { code: 'REMOVE_EMBEDDED_FILES' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1400 }],
        {
            operator_contains: [
                'Embedded JavaScript was removed because it can pose a security risk',
                'Launch actions that could open external programs or files were removed for security',
                'Embedded files attached to the PDF were removed for security',
                'interactive content remains unresolved'
            ],
            review_required: true,
            si_gov: {
                active_content_removed: true,
                javascript_removed: true,
                launch_actions_removed: true,
                embedded_files_removed: true,
                unresolved_interactive_content: true,
                review_required: true,
                ...baseGov
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 11 — Clean control returns no action with evidence
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '11. Clean control — no security/interactivity findings, no action needed',
        {
            status: 'COMPLETED',
            certificationLevel: 'CERTIFIED_READY',
            review_required: false,
            security_interactivity_governance: {
                review_required: false,
                production_certified: true,
                certified_pdf_allowed: true,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false,
                security_interactivity_fix_applied: false,
                active_content_removed: false
            }
        },
        [],
        {
            customer_not_contains: [
                'Potentially unsafe interactive content', 'were removed from the PDF for security',
                'were flattened into the page'
            ],
            si_gov: {
                active_content_removed: false,
                security_interactivity_fix_applied: false,
                standard_certified: false,
                pdfx_compliance_claimed: false,
                pdfa_compliance_claimed: false,
                compliance_claim_allowed: false
            }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 12 — certified.pdf filename regression
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '12. certified.pdf downgraded when security_interactivity_governance.review_required=true',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                certified_pdf_allowed: false,
                active_content_removed: true,
                javascript_removed: true
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
            si_gov: { review_required: true, ...baseGov },
            artifact_ux_checks: [
                { type: 'certified_pdf', customer_visible: false, customer_badge: 'Review required' }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 13 — standards overclaim regression
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '13. Standards overclaim regression — security/interactivity fix must not imply PDF/X or PDF/A',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                ...baseGov,
                review_required: true,
                security_interactivity_fix_applied: true,
                active_content_removed: true,
                javascript_removed: true,
                forms_flattened: true
            },
            applied_fixes: [{ code: 'STRIP_JAVASCRIPT' }, { code: 'FLATTEN_FORMS' }]
        },
        [],
        {
            standard_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            si_gov: { ...baseGov },
            customer_not_contains: [
                'PDF/X validated', 'PDF/A validated',
                'PDF/X certified', 'PDF/A certified',
                'Standards validated', 'Print-ready',
                'Certified PDF', 'Production-ready'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 14 — public/customer sanitation (no raw internals)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '14. Public/customer sanitation — no raw paths, streams, forensic IDs',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            security_interactivity_governance: {
                review_required: true,
                production_certified: false,
                evidence: {
                    // These must NOT appear in the report payload
                    local_path: '/tmp/security_interactivity_output.pdf',
                    forensic_object_id: 'obj_9911',
                    internal_id: 'sec_internal_77',
                    raw_stream: '%PDF-1.4 js-stream-data',
                    qpdf_command: 'qpdf --strip-javascript',
                    // This is safe and may appear
                    objects_scanned: 42
                }
            }
        },
        [],
        {
            review_required: true,
            sanitation_checks: [
                '/tmp/security_interactivity_output.pdf',
                'obj_9911',
                'sec_internal_77',
                '%PDF-1.4 js-stream-data',
                'qpdf --strip-javascript'
            ]
        }
    );

    // ── Generate reports ────────────────────────────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, 'phase63d_control_plane_security_interactivity_human_report.json');
    const mdPath   = path.join(reportsDir, 'phase63d_control_plane_security_interactivity_human_report.md');

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
        si_gov: r.report?.security_interactivity_governance,
        artifact_ux_warning_count: r.report?.artifact_ux?.warnings?.length,
        artifact_ux_warnings: r.report?.artifact_ux?.warnings
    }));

    fs.writeFileSync(jsonPath, JSON.stringify({
        phase: '63D',
        generated_at: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    }, null, 2));

    let md = `# Phase 63D Smoke Test Report — Control Plane Security/Interactivity Human Report\n\n`;
    md += `**Generated:** ${new Date().toISOString()}  \n`;
    md += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    md += `**Total:** ${results.length} | **Passed:** ${results.filter(r => r.passed).length} | **Failed:** ${results.filter(r => !r.passed).length}\n\n`;
    md += `## Governance Principles Enforced\n\n`;
    md += `- Security/interactivity cleanup never implies print-ready or production certification\n`;
    md += `- Security/interactivity cleanup never implies PDF/X or PDF/A validation or standards certification\n`;
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
        console.error('\n=== Phase 63D Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 63D Smoke Tests Passed ===');
}

runSmokeTests();
