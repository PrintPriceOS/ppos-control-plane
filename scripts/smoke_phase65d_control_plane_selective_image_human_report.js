'use strict';
/**
 * Phase 65D Smoke Test — Control Plane Selective Image Governance Human Report + UX
 *
 * Validates:
 *  A. selective_image_governance extraction and conservative merge
 *  B. Customer wording: "Some images were converted or normalized and require review."
 *     and "Low-resolution images could not be safely improved automatically."
 *  C. Operator wording for RGB→CMYK conversion, ICC profile normalization, downsampling, low-res
 *  D. Artifact UX labels / badges ("Image review required", "Resolution warning", "Color-managed image change")
 *  E. Report payload includes safe selective_image_governance subset
 *  F. Readiness / gate preservation (review_required never bypassed, no standards overclaim)
 *  G. Public-report sanitation (no raw paths, streams, forensic IDs)
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

async function runSmokeTests() {
    console.log('=== Running Phase 65D Smoke Tests ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-selective-image-governance', Authorization: 'Bearer test-65d' };

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport(
                'job-65d-test', mockContext, jobInput, artifacts
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

            if (expected.sel_img_gov) {
                const selImgGov = report.selective_image_governance || {};
                for (const [k, v] of Object.entries(expected.sel_img_gov)) {
                    if (selImgGov[k] !== v) {
                        passed = false;
                        errors.push(`selective_image_governance.${k} expected=${v}, got=${selImgGov[k]}`);
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
                    selImgGov: report.selective_image_governance,
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
    // Scenario 1 — CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '1. CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE applied — color-managed image wording and review',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                ...baseGov,
                review_required: true,
                image_fix_applied: true,
                rgb_images_converted: true,
                visual_change_expected: true,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }],
        {
            operator_contains: ['Selective image governance fixes (RGB-to-CMYK conversion, ICC profile normalization, and/or downsampling of excessive resolution) were attempted on this file'],
            customer_contains: ['Some images were converted or normalized and require review.'],
            customer_not_contains: ['Print-ready', 'Certified PDF', 'PDF/X validated', 'PDF/A validated'],
            review_required: true,
            production_certified: false,
            sel_img_gov: { image_fix_applied: true, rgb_images_converted: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Color-managed image change', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 2 — TAG_UNTAGGED_IMAGES / NORMALIZE_IMAGE_ICC_PROFILE skipped unsupported
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '2. NORMALIZE_IMAGE_ICC_PROFILE skipped — image profile normalization wording and review',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                ...baseGov,
                review_required: true,
                image_profiles_normalized: false,
                certified_pdf_allowed: false,
                review_required_reasons: ['icc_profile_missing']
            },
            skipped_fixes: [{ code: 'NORMALIZE_IMAGE_ICC_PROFILE' }]
        },
        [{ type: 'review_pdf', filename: 'review.pdf', size_bytes: 1100 }],
        {
            operator_contains: ['Selective image governance fixes (RGB-to-CMYK conversion, ICC profile normalization, and/or downsampling of excessive resolution) were attempted on this file'],
            customer_contains: ['Some images were converted or normalized and require review.'],
            review_required: true,
            sel_img_gov: { image_profiles_normalized: false, review_required: true, ...baseGov }
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 3 — DOWNSAMPLE_EXCESSIVE_RESOLUTION applied
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '3. DOWNSAMPLE_EXCESSIVE_RESOLUTION applied — resolution warning wording and badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                ...baseGov,
                review_required: true,
                image_fix_applied: true,
                excessive_resolution_downsampled: true,
                visual_change_expected: true,
                certified_pdf_allowed: false
            },
            applied_fixes: [{ code: 'DOWNSAMPLE_EXCESSIVE_RESOLUTION' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1200 }],
        {
            operator_contains: ['Selective image governance fixes (RGB-to-CMYK conversion, ICC profile normalization, and/or downsampling of excessive resolution) were attempted on this file'],
            customer_contains: ['Some images were converted or normalized and require review.'],
            review_required: true,
            sel_img_gov: { excessive_resolution_downsampled: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Resolution warning', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 4 — FLAG_LOW_RES_IMAGES_UNFIXABLE flags honestly without upscaling
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '4. FLAG_LOW_RES_IMAGES_UNFIXABLE — low-res unfixable wording and badge',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                ...baseGov,
                review_required: true,
                image_fix_applied: false,
                low_res_unfixable: true,
                visual_change_expected: false,
                certified_pdf_allowed: false
            },
            skipped_fixes: [{ code: 'FLAG_LOW_RES_IMAGES_UNFIXABLE' }]
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1300 }],
        {
            operator_contains: ['Low-resolution images were detected and flagged honestly', 'Upscaling cannot restore true image detail'],
            customer_contains: ['Low-resolution images could not be safely improved automatically.'],
            customer_not_contains: ['upscaled', 'Upscaled', 'enhanced automatically'],
            review_required: true,
            sel_img_gov: { low_res_unfixable: true, review_required: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Resolution warning', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 5 — CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE on clean control — honest skip
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '5. Clean control — no selective image governance findings, no action needed',
        {
            status: 'COMPLETED',
            certificationLevel: 'CERTIFIED_READY',
            review_required: false,
            selective_image_governance: {
                review_required: false,
                image_fix_applied: false,
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
            customer_not_contains: ['Some images were converted or normalized and require review.', 'Low-resolution images could not be safely improved automatically.'],
            operator_not_contains: ['Selective image governance fixes', 'Low-resolution images were detected and flagged honestly'],
            sel_img_gov: {
                image_fix_applied: false,
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
    // Scenario 6 — REGRESSION: standards overclaim from selective image fix must be rejected
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '6. Standards overclaim regression — selective image fix must not imply PDF/X or PDF/A',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                ...baseGov,
                review_required: true,
                image_fix_applied: true,
                rgb_images_converted: true,
                image_profiles_normalized: true,
                excessive_resolution_downsampled: true
            },
            applied_fixes: [{ code: 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE' }, { code: 'DOWNSAMPLE_EXCESSIVE_RESOLUTION' }]
        },
        [],
        {
            standard_certified: false,
            pdfx_claimed: false,
            pdfa_claimed: false,
            sel_img_gov: { ...baseGov },
            customer_not_contains: [
                'PDF/X validated', 'PDF/A validated',
                'PDF/X certified', 'PDF/A certified',
                'Standards validated', 'Print-ready',
                'Certified PDF', 'Production-ready'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 7 — REGRESSION: certified.pdf filename must not be trusted by name
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '7. certified.pdf downgraded when selective_image_governance.review_required=true',
        {
            status: 'COMPLETED',
            certificationLevel: 'FIXED_REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                ...baseGov,
                review_required: true,
                image_fix_applied: true,
                certified_pdf_allowed: false,
                rgb_images_converted: true
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
            sel_img_gov: { review_required: true, ...baseGov },
            artifact_ux_checks: [
                { type: 'certified_pdf', customer_visible: false, customer_badge: 'Review required' }
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 8 — REGRESSION: evidence preservation / sanitation across applied/skipped/failed buckets
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '8. Public/customer sanitation — no raw paths, streams, forensic IDs in selective image evidence',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                review_required: true,
                image_fix_applied: true,
                production_certified: false,
                evidence: {
                    local_path: '/tmp/selective_image_governance_output.pdf',
                    forensic_object_id: 'obj_8821',
                    internal_id: 'image_internal_91',
                    raw_stream: '%PDF-1.4 image-stream-data',
                    qpdf_command: 'qpdf --convert-rgb-cmyk',
                    images_scanned: 42
                }
            }
        },
        [],
        {
            review_required: true,
            sanitation_checks: [
                '/tmp/selective_image_governance_output.pdf',
                'obj_8821',
                'image_internal_91',
                '%PDF-1.4 image-stream-data',
                'qpdf --convert-rgb-cmyk'
            ]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 9 — Image review required badge (findings present, no specific fix applied)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '9. Image review required badge — findings present without specific color/resolution fix',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                ...baseGov,
                review_required: true,
                visual_change_expected: true,
                certified_pdf_allowed: false,
                visually_sensitive: true
            }
        },
        [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 900 }],
        {
            customer_contains: ['Some images were converted or normalized and require review.'],
            review_required: true,
            sel_img_gov: { visual_change_expected: true, review_required: true, visually_sensitive: true, ...baseGov },
            artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Image review required', customer_tone: 'warning' }]
        }
    );

    // ══════════════════════════════════════════════════════════════════════
    // Scenario 10 — REGRESSION: low-res unfixable must never report upscaling performed
    // ══════════════════════════════════════════════════════════════════════
    await testScenario(
        '10. Low-res unfixable regression — must never imply upscaling/restoration was performed',
        {
            status: 'COMPLETED',
            certificationLevel: 'REVIEW_REQUIRED',
            review_required: true,
            selective_image_governance: {
                ...baseGov,
                review_required: true,
                image_fix_applied: false,
                low_res_unfixable: true,
                visual_change_expected: false,
                certified_pdf_allowed: false,
                review_required_reasons: ['low_res_images_present']
            },
            skipped_fixes: [{ code: 'FLAG_LOW_RES_IMAGES_UNFIXABLE' }]
        },
        [],
        {
            customer_contains: ['Low-resolution images could not be safely improved automatically.'],
            customer_not_contains: ['upscaled', 'Upscaled', 'restored', 'enhanced'],
            operator_contains: ['could not be safely upscaled or improved automatically'],
            review_required: true,
            sel_img_gov: { low_res_unfixable: true, image_fix_applied: false, review_required: true, ...baseGov }
        }
    );

    // ── Generate reports ────────────────────────────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const jsonPath = path.join(reportsDir, 'phase65d_control_plane_selective_image_human_report.json');
    const mdPath   = path.join(reportsDir, 'phase65d_control_plane_selective_image_human_report.md');

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
        selective_image_governance: r.report?.selective_image_governance
    }));

    fs.writeFileSync(jsonPath, JSON.stringify({
        phase: '65D',
        generated_at: new Date().toISOString(),
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    }, null, 2));

    let md = `# Phase 65D Smoke Test Report — Control Plane Selective Image Governance Human Report + UX\n\n`;
    md += `**Generated:** ${new Date().toISOString()}  \n`;
    md += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    md += `**Total:** ${results.length} | **Passed:** ${results.filter(r => r.passed).length} | **Failed:** ${results.filter(r => !r.passed).length}\n\n`;
    md += `## Governance Principles Enforced\n\n`;
    md += `- Selective image governance (RGB→CMYK conversion, ICC profile normalization, downsampling, low-res flagging) never implies print-ready or production certification\n`;
    md += `- Selective image governance never implies PDF/X or PDF/A validation or standards certification\n`;
    md += `- certified.pdf remains governed by artifact_trust, not filename\n`;
    md += `- Customer wording stays generic ("Some images were converted or normalized and require review." / "Low-resolution images could not be safely improved automatically."); operator wording is specific to RGB→CMYK conversion, ICC profile normalization, downsampling, and low-res flagging\n`;
    md += `- artifact_ux labels surface "Image review required" / "Resolution warning" / "Color-managed image change" badges for customer/operator display\n`;
    md += `- Low-resolution images are never reported as upscaled or restored — only honestly flagged\n`;
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
        console.error('\n=== Phase 65D Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 65D Smoke Tests Passed ===');
}

runSmokeTests();
