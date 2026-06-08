'use strict';
/**
 * Phase 66D Smoke Test — Control Plane Font Governance Human Report + UX
 *
 * Validates:
 *  A. font_governance extraction and conservative merge
 *  B. Customer wording: "Some fonts were not embedded.", "Font embedding could not be
 *     completed because font sources were unavailable.", "Type3 fonts require review."
 *  C. Operator wording for embedding/subsetting, font source unavailability, Type3
 *     outlining, missing glyphs, and encoding repair
 *  D. Artifact UX labels / badges ("Font review required", "Font issue unresolved")
 *  E. Report payload includes safe font_governance subset
 *  F. Readiness / gate preservation (review_required never bypassed, no standards overclaim)
 *  G. Public-report sanitation (no raw paths, streams, forensic IDs)
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

async function runSmokeTests() {
    console.log('=== Running Phase 66D Smoke Tests ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-font-governance', Authorization: 'Bearer test-66d' };

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport(
                'job-66d-test', mockContext, jobInput, artifacts
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

            if (expected.font_gov) {
                const fontGov = report.font_governance || {};
                for (const [k, v] of Object.entries(expected.font_gov)) {
                    if (fontGov[k] !== v) {
                        passed = false;
                        errors.push(`font_governance.${k} expected=${v}, got=${fontGov[k]}`);
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
                    fontGov: report.font_governance,
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
    // Scenario 1 — SUBSET_EMBEDDED_FONTS applied but fonts not fully embedded
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '1. SUBSET_EMBEDDED_FONTS applied — "Some fonts were not embedded." wording and review',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                ...baseGov,
                review_required: true,
                font_fix_applied: true,
                fonts_embedded: false,
                font_embedding_skipped: true,
                visual_change_expected: true,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'SUBSET_EMBEDDED_FONTS' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }],
        {
            operator_contains: ['Some fonts were not embedded or could only be partially subset-embedded'],
            customer_contains: ['Some fonts were not embedded.'],
            customer_not_contains: ['Print-ready', 'Certified PDF', 'PDF/X validated', 'PDF/A validated'],
            review_required: true,
            production_certified: false,
            font_gov: { font_fix_applied: true, font_embedding_skipped: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font review required', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 2 — Font sources unavailable, embedding could not complete
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '2. Font sources unavailable — honest flag wording and "Font issue unresolved" badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                ...baseGov,
                review_required: true,
                font_source_available: false,
                certified_pdf_allowed: false,
                review_required_reasons: ['font_source_unavailable']
            },
            failed_fixes: [{ code: 'SUBSET_EMBEDDED_FONTS' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1100 }],
        {
            operator_contains: ['Font embedding could not be completed because the original font sources were unavailable', 'flagged honestly rather than producing a falsely certified result'],
            customer_contains: ['Font embedding could not be completed because font sources were unavailable.'],
            customer_not_contains: ['Print-ready', 'Certified PDF'],
            review_required: true,
            font_gov: { font_source_available: false, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font issue unresolved', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 3 — OUTLINE_TYPE3_FONTS applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '3. OUTLINE_TYPE3_FONTS applied — "Type3 fonts require review." wording and badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                ...baseGov,
                review_required: true,
                font_fix_applied: true,
                type3_fonts_detected: true,
                type3_fonts_outlined: true,
                visual_change_expected: true,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'OUTLINE_TYPE3_FONTS' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1200 }],
        {
            operator_contains: ['Type3 fonts were detected and outlined'],
            customer_contains: ['Type3 fonts require review.'],
            review_required: true,
            font_gov: { type3_fonts_detected: true, type3_fonts_outlined: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font review required', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 4 — FLAG_MISSING_GLYPHS_UNFIXABLE flags honestly without inventing data
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '4. FLAG_MISSING_GLYPHS_UNFIXABLE — missing glyphs honest wording and badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                ...baseGov,
                review_required: true,
                font_fix_applied: false,
                glyphs_missing_unfixable: true,
                visual_change_expected: false,
                certified_pdf_allowed: false
            },
            skipped_fixes: [{ code: 'FLAG_MISSING_GLYPHS_UNFIXABLE' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1300 }],
        {
            operator_contains: ['Missing glyphs were detected and could not be safely repaired', 'flagged honestly rather than inventing glyph data'],
            customer_not_contains: ['restored', 'invented', 'generated automatically'],
            review_required: true,
            font_gov: { glyphs_missing_unfixable: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font issue unresolved', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 5 — REPAIR_FONT_ENCODING applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '5. REPAIR_FONT_ENCODING applied — encoding repair wording and review',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                ...baseGov,
                review_required: true,
                font_fix_applied: true,
                font_encoding_repaired: true,
                visual_change_expected: true,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'REPAIR_FONT_ENCODING' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1400 }],
        {
            operator_contains: ['Font encoding issues were repaired'],
            review_required: true,
            font_gov: { font_encoding_repaired: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font review required', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 6 — Clean control — no font governance findings
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '6. Clean control — no font governance findings, no action needed',
        {
            status: 'COMPLETED',
            certificationLevel: 'CERTIFIED_READY',
            review_required: false,
            font_governance: {
                review_required: false,
                font_fix_applied: false,
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
            customer_not_contains: ['Some fonts were not embedded.', 'Font embedding could not be completed because font sources were unavailable.', 'Type3 fonts require review.'],
            operator_not_contains: ['Some fonts were not embedded or could only be partially subset-embedded', 'Type3 fonts were detected'],
            font_gov: {
                font_fix_applied: false,
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
    // Scenario 7 — REGRESSION: standards overclaim from font fix must be rejected
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '7. Standards overclaim regression — font fix must not imply PDF/X or PDF/A',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                ...baseGov,
                review_required: true,
                font_fix_applied: true,
                fonts_embedded: false,
                type3_fonts_detected: true,
                font_encoding_repaired: true
            },
            applied_fixes: [{ code: 'SUBSET_EMBEDDED_FONTS' }, { code: 'OUTLINE_TYPE3_FONTS' }]
        },
        [],
        {
            standard_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            font_gov: { ...baseGov },
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
        '8. certified.pdf downgraded when font_governance.review_required=true',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                ...baseGov,
                review_required: true,
                font_fix_applied: true,
                certified_pdf_allowed: false,
                fonts_embedded: false
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
            font_gov: { review_required: true, ...baseGov },
            artifact_ux_checks: [
                { type: 'certified_pdf', customer_visible: false, customer_badge: 'Review required' }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 9 — REGRESSION: evidence preservation / sanitation
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '9. Public/customer sanitation — no raw paths, streams, forensic IDs in font evidence',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            font_governance: {
                review_required: true,
                font_fix_applied: true,
                production_certified: false,
                evidence: {
                    local_path: '/tmp/font_governance_output.pdf',
                    forensic_object_id: 'obj_9931',
                    internal_id: 'font_internal_77',
                    raw_stream: '%PDF-1.4 font-stream-data',
                    qpdf_command: 'qpdf --subset-fonts',
                    fonts_scanned: 12
                }
            }
        },
        [],
        {
            review_required: true,
            sanitation_checks: [
                '/tmp/font_governance_output.pdf',
                'obj_9931',
                'font_internal_77',
                '%PDF-1.4 font-stream-data',
                'qpdf --subset-fonts'
            ]
        }
    );

    // ── Generate reports ────────────────────────────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, 'phase66d_control_plane_font_human_report.json');
    const mdPath   = path.join(reportsDir, 'phase66d_control_plane_font_human_report.md');

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
        font_governance: r.report?.font_governance
    }));

    fs.writeFileSync(jsonPath, JSON.stringify({
        phase: '66D',
        generated_at: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    }, null, 2));

    let md = `# Phase 66D Smoke Test Report — Control Plane Font Governance Human Report + UX\n\n`;
    md += `**Generated:** ${new Date().toISOString()}  \n`;
    md += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    md += `**Total:** ${results.length} | **Passed:** ${results.filter(r => r.passed).length} | **Failed:** ${results.filter(r => !r.passed).length}\n\n`;
    md += `## Governance Principles Enforced\n\n`;
    md += `- Font governance (embedding/subsetting, Type3 outlining, encoding repair, missing-glyph flagging) never implies print-ready or production certification\n`;
    md += `- Font governance never implies PDF/X or PDF/A validation or standards certification\n`;
    md += `- certified.pdf remains governed by artifact_trust, not filename\n`;
    md += `- Customer wording stays generic ("Some fonts were not embedded." / "Font embedding could not be completed because font sources were unavailable." / "Type3 fonts require review."); operator wording is specific to embedding/subsetting, font source unavailability, Type3 outlining, missing glyphs, and encoding repair\n`;
    md += `- artifact_ux labels surface "Font review required" / "Font issue unresolved" badges for customer/operator display\n`;
    md += `- Missing glyphs are never reported as restored or invented — only honestly flagged\n`;
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
        console.error('\n=== Phase 66D Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 66D Smoke Tests Passed ===');
}

runSmokeTests();
