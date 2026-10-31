'use strict';
/**
 * Phase 67D Smoke Test — Control Plane Transparency/Overprint Physical Human Report + UX
 *
 * Validates:
 *  A. transparency_overprint_physical_governance extraction and conservative merge
 *  B. Customer wording: "Transparency flattening may affect appearance and requires review."
 *     and "Overprint changes require visual verification."
 *  C. Operator wording for transparency flatten, blend mode normalization, overprint flatten,
 *     overprint preview simulation
 *  D. Artifact UX labels / badges ("Visual review required", "Transparency flattened",
 *     "Overprint review")
 *  E. Report payload includes safe transparency_overprint_physical_governance subset
 *  F. Readiness / gate preservation (review_required never bypassed, no standards overclaim)
 *  G. Public-report sanitation (no raw paths, streams, forensic IDs)
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

async function runSmokeTests() {
    console.log('=== Running Phase 67D Smoke Tests ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-trans-phys-governance', Authorization: 'Bearer test-67d' };

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport(
                'job-67d-test', mockContext, jobInput, artifacts
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

            if (expected.trans_phys_gov) {
                const gov = report.transparency_overprint_physical_governance || {};
                for (const [k, v] of Object.entries(expected.trans_phys_gov)) {
                    if (gov[k] !== v) {
                        passed = false;
                        errors.push(`transparency_overprint_physical_governance.${k} expected=${v}, got=${gov[k]}`);
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
                    transPhysGov: report.transparency_overprint_physical_governance,
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
    // Scenario 1 — FLATTEN_TRANSPARENCY applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '1. FLATTEN_TRANSPARENCY applied — "Transparency flattening may affect appearance" wording and badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                ...baseGov,
                review_required: true,
                transparency_fix_applied: true,
                transparency_flattened: true,
                visual_change_expected: true,
                rendering_safety_proven: false,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'FLATTEN_TRANSPARENCY' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }],
        {
            operator_contains: ['Transparency was flattened', 'human review of appearance is required before production'],
            customer_contains: ['Transparency flattening may affect appearance and requires review.'],
            customer_not_contains: ['Print-ready', 'Certified PDF', 'PDF/X validated', 'PDF/A validated'],
            review_required: true,
            production_certified: false,
            trans_phys_gov: { transparency_flattened: true, transparency_fix_applied: true, review_required: true },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Transparency flattened', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 2 — NORMALIZE_BLEND_MODES applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '2. NORMALIZE_BLEND_MODES applied — blend modes wording and "Transparency flattened" badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                ...baseGov,
                review_required: true,
                transparency_fix_applied: true,
                transparency_flattened: true,
                blend_modes_normalized: true,
                visual_change_expected: true,
                rendering_safety_proven: false,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'NORMALIZE_BLEND_MODES' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1100 }],
        {
            operator_contains: ['blend modes were normalized', 'human review of appearance is required before production'],
            customer_contains: ['Transparency flattening may affect appearance and requires review.'],
            customer_not_contains: ['Print-ready', 'Certified PDF'],
            review_required: true,
            trans_phys_gov: { transparency_flattened: true, blend_modes_normalized: true, review_required: true },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Transparency flattened', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 3 — FLATTEN_OVERPRINT applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '3. FLATTEN_OVERPRINT applied — "Overprint changes require visual verification." wording and badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                ...baseGov,
                review_required: true,
                transparency_fix_applied: true,
                overprint_flattened: true,
                visual_change_expected: true,
                rendering_safety_proven: false,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'FLATTEN_OVERPRINT' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1200 }],
        {
            operator_contains: ['Overprint settings were flattened', 'human visual review is required before production'],
            customer_contains: ['Overprint changes require visual verification.'],
            customer_not_contains: ['Print-ready', 'Certified PDF'],
            review_required: true,
            trans_phys_gov: { overprint_flattened: true, review_required: true },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Overprint review', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 4 — SIMULATE_OVERPRINT_PREVIEW applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '4. SIMULATE_OVERPRINT_PREVIEW applied — preview simulation wording and "Overprint review" badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                ...baseGov,
                review_required: true,
                transparency_fix_applied: true,
                overprint_flattened: true,
                overprint_preview_simulated: true,
                visual_change_expected: true,
                rendering_safety_proven: false,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'SIMULATE_OVERPRINT_PREVIEW' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1300 }],
        {
            operator_contains: ['overprint preview was simulated', 'must be visually verified before production'],
            customer_contains: ['Overprint changes require visual verification.'],
            review_required: true,
            trans_phys_gov: { overprint_flattened: true, overprint_preview_simulated: true, review_required: true },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Overprint review', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 5 — Both transparency and overprint flatten applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '5. Transparency + overprint flatten combined — both wording messages present',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                ...baseGov,
                review_required: true,
                transparency_fix_applied: true,
                transparency_flattened: true,
                overprint_flattened: true,
                visual_change_expected: true,
                rendering_safety_proven: false,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'FLATTEN_TRANSPARENCY' }, { code: 'FLATTEN_OVERPRINT' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1400 }],
        {
            operator_contains: ['Transparency was flattened', 'Overprint settings were flattened'],
            customer_contains: ['Transparency flattening may affect appearance and requires review.', 'Overprint changes require visual verification.'],
            review_required: true,
            trans_phys_gov: { transparency_flattened: true, overprint_flattened: true, review_required: true }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 6 — Clean control — no physical transparency/overprint findings
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '6. Clean control — no transparency/overprint physical governance findings',
        {
            status: 'COMPLETED',
            certificationLevel: 'CERTIFIED_READY',
            review_required: false,
            transparency_overprint_physical_governance: {
                review_required: false,
                transparency_fix_applied: false,
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
            customer_not_contains: ['Transparency flattening may affect appearance', 'Overprint changes require visual verification'],
            operator_not_contains: ['Transparency was flattened', 'Overprint settings were flattened'],
            trans_phys_gov: {
                transparency_fix_applied: false,
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
    // Scenario 7 — REGRESSION: standards overclaim from physical flatten must be rejected
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '7. Standards overclaim regression — physical transparency/overprint fix must not imply PDF/X or PDF/A',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                ...baseGov,
                review_required: true,
                transparency_fix_applied: true,
                transparency_flattened: true,
                overprint_flattened: true
            },
            applied_fixes: [{ code: 'FLATTEN_TRANSPARENCY' }, { code: 'FLATTEN_OVERPRINT' }]
        },
        [],
        {
            standard_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            trans_phys_gov: { ...baseGov },
            customer_not_contains: [
                'PDF/X validated', 'PDF/A validated',
                'PDF/X certified', 'PDF/A certified',
                'Standards validated', 'Print-ready',
                'Certified PDF', 'Production-ready'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 8 — REGRESSION: certified.pdf downgraded when physical flatten review_required
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '8. certified.pdf downgraded when transparency_overprint_physical_governance.review_required=true',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                ...baseGov,
                review_required: true,
                transparency_fix_applied: true,
                certified_pdf_allowed: false,
                transparency_flattened: true
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
            trans_phys_gov: { review_required: true, ...baseGov },
            artifact_ux_checks: [
                { type: 'certified_pdf', customer_visible: false, customer_badge: 'Review required' }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 9 — REGRESSION: evidence sanitation
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '9. Public/customer sanitation — no raw paths, streams, forensic IDs in transparency evidence',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            transparency_overprint_physical_governance: {
                review_required: true,
                transparency_fix_applied: true,
                production_certified: false,
                evidence: {
                    local_path: '/tmp/transparency_physical_output.pdf',
                    forensic_object_id: 'obj_7712',
                    internal_id: 'trans_internal_55',
                    raw_stream: '%PDF-1.4 transparency-stream-data',
                    qpdf_command: 'qpdf --flatten-transparency',
                    pages_processed: 4
                }
            }
        },
        [],
        {
            review_required: true,
            sanitation_checks: [
                '/tmp/transparency_physical_output.pdf',
                'obj_7712',
                'trans_internal_55',
                '%PDF-1.4 transparency-stream-data',
                'qpdf --flatten-transparency'
            ]
        }
    );

    // ── Generate reports ────────────────────────────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, 'phase67d_control_plane_transparency_overprint_physical_human_report.json');
    const mdPath   = path.join(reportsDir, 'phase67d_control_plane_transparency_overprint_physical_human_report.md');

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
        transparency_overprint_physical_governance: r.report?.transparency_overprint_physical_governance
    }));

    fs.writeFileSync(jsonPath, JSON.stringify({
        phase: '67D',
        generated_at: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    }, null, 2));

    let md = `# Phase 67D Smoke Test Report — Control Plane Transparency/Overprint Physical Human Report + UX\n\n`;
    md += `**Generated:** ${new Date().toISOString()}  \n`;
    md += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    md += `**Total:** ${results.length} | **Passed:** ${results.filter(r => r.passed).length} | **Failed:** ${results.filter(r => !r.passed).length}\n\n`;
    md += `## Governance Principles Enforced\n\n`;
    md += `- Physical transparency/overprint governance (flatten, blend mode normalization, overprint flatten, overprint preview simulation) never implies print-ready or production certification\n`;
    md += `- Physical transparency/overprint governance never implies PDF/X or PDF/A validation or standards certification\n`;
    md += `- certified.pdf remains governed by artifact_trust, not filename\n`;
    md += `- Customer wording stays generic ("Transparency flattening may affect appearance and requires review." / "Overprint changes require visual verification."); operator wording is specific to each fix type\n`;
    md += `- artifact_ux labels surface "Visual review required" / "Transparency flattened" / "Overprint review" badges for customer/operator display\n`;
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
        console.error('\n=== Phase 67D Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 67D Smoke Tests Passed ===');
}

runSmokeTests();
