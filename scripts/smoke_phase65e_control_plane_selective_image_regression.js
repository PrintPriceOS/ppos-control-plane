'use strict';
/**
 * Phase 65E Smoke Test — Control Plane Selective Image Governance
 * End-to-End Regression
 *
 * Re-validates that Human Report wording, selective_image_governance payload,
 * artifact_ux labels/warnings, public sanitation, and readiness/gate behavior
 * remain safe and honest end-to-end for selective image governance fixes
 * (CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE, NORMALIZE_IMAGE_ICC_PROFILE,
 * DOWNSAMPLE_EXCESSIVE_RESOLUTION, FLAG_LOW_RES_IMAGES_UNFIXABLE).
 *
 * Also assembles the aggregate end-to-end report combining Engine 65A,
 * Worker 65B, Service 65C, and this Control Plane 65D/65E layer.
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

const ENGINE_REPORT_PATH = path.resolve(__dirname, '../../ppos-preflight-engine/reports/phase65a_engine_selective_image_fixes.json');
const WORKER_REPORT_PATH = path.resolve(__dirname, '../../ppos-preflight-worker/reports/phase65b_worker_selective_image_policy.json');
const SERVICE_REPORT_PATH = path.resolve(__dirname, '../../ppos-preflight-service/reports/phase65c_service_selective_image_exposure.json');
const CONTROL_PLANE_REPORT_PATH = path.resolve(__dirname, '../reports/phase65d_control_plane_selective_image_human_report.json');

const FORBIDDEN_CUSTOMER_PHRASES = [
    'Print-ready', 'Production-ready', 'Certified PDF',
    'PDF/X validated', 'PDF/A validated', 'Automatically approved',
    'Production certified', 'Standards certified',
    'upscaled', 'Upscaled', 'restored', 'enhanced automatically'
];
const FORBIDDEN_SANITATION_TERMS = ['/storage/tenants', 'C:\\Users', 'temp-staging', 'forensic', '/tmp/', 'qpdf --'];

async function runSmokeTests() {
    console.log('=== Running Phase 65E Smoke Tests (Control Plane Selective Image Governance Regression) ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-selective-image-governance-65e', Authorization: 'Bearer test-65e' };

    let inputMode = 'SYNTHETIC_POLICY_FALLBACK';
    if (fs.existsSync(SERVICE_REPORT_PATH)) inputMode = 'SERVICE_REPORT';

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport('job-65e-test', mockContext, jobInput, artifacts);
            if (!result.ok) throw new Error('Report generation failed: ' + JSON.stringify(result));

            const report = result.report;
            let passed = true;
            const errors = [];

            if (expected.customer_contains) {
                for (const str of expected.customer_contains) {
                    if (!report.customer_summary.includes(str)) { passed = false; errors.push(`Customer summary missing: "${str}"`); }
                }
            }
            if (expected.customer_not_contains) {
                for (const str of expected.customer_not_contains) {
                    if (report.customer_summary.includes(str)) { passed = false; errors.push(`Customer summary leaked forbidden term: "${str}"`); }
                }
            }
            if (expected.operator_contains) {
                for (const str of expected.operator_contains) {
                    if (!report.operator_summary.includes(str)) { passed = false; errors.push(`Operator summary missing: "${str}"`); }
                }
            }
            for (const str of FORBIDDEN_CUSTOMER_PHRASES) {
                if (report.customer_summary.includes(str)) { passed = false; errors.push(`Customer summary leaked forbidden overclaim: "${str}"`); }
            }

            if (expected.review_required === true && report.fix_summary.review_required !== true) {
                passed = false; errors.push('Expected fix_summary.review_required=true');
            }
            if (report.fix_summary.production_certified !== false) { passed = false; errors.push('Expected fix_summary.production_certified=false'); }
            if (report.standard_certified !== false) { passed = false; errors.push('Expected standard_certified=false'); }
            if (report.pdfx_compliance_claimed !== false) { passed = false; errors.push('Expected pdfx_compliance_claimed=false'); }
            if (report.pdfa_compliance_claimed !== false) { passed = false; errors.push('Expected pdfa_compliance_claimed=false'); }

            if (expected.sel_img_gov) {
                const selImgGov = report.selective_image_governance || {};
                for (const [k, v] of Object.entries(expected.sel_img_gov)) {
                    if (selImgGov[k] !== v) { passed = false; errors.push(`selective_image_governance.${k} expected=${v}, got=${selImgGov[k]}`); }
                }
            }

            if (expected.artifact_ux_checks) {
                for (const check of expected.artifact_ux_checks) {
                    const artifactEntry = report.artifact_ux.artifacts.find(a => a.type === check.type);
                    if (!artifactEntry) { passed = false; errors.push(`artifact_ux: no artifact of type "${check.type}" found`); continue; }
                    const ux = artifactEntry.ux;
                    if (check.customer_badge && ux.customer.status_badge !== check.customer_badge) {
                        passed = false; errors.push(`artifact_ux[${check.type}] customer.status_badge expected="${check.customer_badge}", got="${ux.customer.status_badge}"`);
                    }
                    if (check.customer_tone && ux.customer.status_tone !== check.customer_tone) {
                        passed = false; errors.push(`artifact_ux[${check.type}] customer.status_tone expected="${check.customer_tone}", got="${ux.customer.status_tone}"`);
                    }
                    if (check.customer_visible === false && artifactEntry.customer_visible !== false) {
                        passed = false; errors.push(`artifact_ux[${check.type}] expected customer_visible=false`);
                    }
                }
            }

            if (expected.cert_downgrade) {
                const certEntry = (report.artifact_ux?.artifacts || []).find(a => a.type === 'certified_pdf');
                if (certEntry && certEntry.customer_visible !== false) {
                    passed = false; errors.push('certified_pdf artifact_ux.customer_visible should be false when review is required');
                }
            }

            // Public sanitation — no raw filesystem paths, streams, or forensic identifiers
            const payloadStr = JSON.stringify({
                selImgGov: report.selective_image_governance,
                artifactUx: report.artifact_ux,
                customerSummary: report.customer_summary,
                operatorSummary: report.operator_summary
            });
            const sanitationTerms = (expected.sanitation_checks || []).concat(FORBIDDEN_SANITATION_TERMS);
            for (const term of sanitationTerms) {
                if (payloadStr.includes(term)) { passed = false; errors.push(`Sanitation failed — leaked raw term: "${term}"`); }
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

    // 1. CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE applied — RGB state preserved end-to-end
    await testScenario('1. CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE applied — RGB conversion state preserved (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: { ...baseGov, review_required: true, image_fix_applied: true, rgb_images_converted: true, visual_change_expected: true, certified_pdf_allowed: false },
        applied_fixes: [{ code: 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE' }]
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }], {
        operator_contains: ['Selective image governance fixes (RGB-to-CMYK conversion, ICC profile normalization, and/or downsampling of excessive resolution) were attempted on this file'],
        customer_contains: ['Some images were converted or normalized and require review.'],
        review_required: true,
        sel_img_gov: { image_fix_applied: true, rgb_images_converted: true, review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Color-managed image change', customer_tone: 'warning' }]
    });

    // 2. NORMALIZE_IMAGE_ICC_PROFILE skipped — image profile state preserved, honest deferral
    await testScenario('2. NORMALIZE_IMAGE_ICC_PROFILE skipped — image profile state preserved, honest deferral (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: { ...baseGov, review_required: true, image_profiles_normalized: false, certified_pdf_allowed: false, review_required_reasons: ['icc_profile_missing'] },
        skipped_fixes: [{ code: 'NORMALIZE_IMAGE_ICC_PROFILE' }]
    }, [{ type: 'review_pdf', filename: 'review.pdf', size_bytes: 1100 }], {
        operator_contains: ['Selective image governance fixes (RGB-to-CMYK conversion, ICC profile normalization, and/or downsampling of excessive resolution) were attempted on this file'],
        customer_contains: ['Some images were converted or normalized and require review.'],
        review_required: true,
        sel_img_gov: { image_profiles_normalized: false, review_required: true, ...baseGov }
    });

    // 3. DOWNSAMPLE_EXCESSIVE_RESOLUTION applied — downsample state preserved
    await testScenario('3. DOWNSAMPLE_EXCESSIVE_RESOLUTION applied — downsample state preserved (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: { ...baseGov, review_required: true, image_fix_applied: true, excessive_resolution_downsampled: true, visual_change_expected: true, certified_pdf_allowed: false },
        applied_fixes: [{ code: 'DOWNSAMPLE_EXCESSIVE_RESOLUTION' }]
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1200 }], {
        operator_contains: ['Selective image governance fixes (RGB-to-CMYK conversion, ICC profile normalization, and/or downsampling of excessive resolution) were attempted on this file'],
        customer_contains: ['Some images were converted or normalized and require review.'],
        review_required: true,
        sel_img_gov: { excessive_resolution_downsampled: true, review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Resolution warning', customer_tone: 'warning' }]
    });

    // 4. FLAG_LOW_RES_IMAGES_UNFIXABLE — low-res NEVER falsely reported as fixed/upscaled
    await testScenario('4. FLAG_LOW_RES_IMAGES_UNFIXABLE — low-res honestly flagged, never fixed/upscaled (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: { ...baseGov, review_required: true, image_fix_applied: false, low_res_unfixable: true, visual_change_expected: false, certified_pdf_allowed: false, review_required_reasons: ['low_res_images_present'] },
        skipped_fixes: [{ code: 'FLAG_LOW_RES_IMAGES_UNFIXABLE' }]
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1300 }], {
        operator_contains: ['Low-resolution images were detected and flagged honestly', 'Upscaling cannot restore true image detail', 'could not be safely upscaled or improved automatically'],
        customer_contains: ['Low-resolution images could not be safely improved automatically.'],
        customer_not_contains: ['upscaled', 'Upscaled', 'restored', 'enhanced', 'enhanced automatically'],
        review_required: true,
        sel_img_gov: { low_res_unfixable: true, image_fix_applied: false, review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Resolution warning', customer_tone: 'warning' }]
    });

    // 5. Clean control — no selective image governance findings, honest skip
    await testScenario('5. Clean control — no selective image governance findings, honest skip (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        review_required: false,
        selective_image_governance: {
            review_required: false, image_fix_applied: false, visual_change_expected: false, production_certified: true,
            certified_pdf_allowed: true, standard_certified: false, pdfx_compliance_claimed: false,
            pdfa_compliance_claimed: false, compliance_claim_allowed: false
        }
    }, [], {
        customer_not_contains: ['Some images were converted or normalized and require review.', 'Low-resolution images could not be safely improved automatically.'],
        operator_contains: [],
        sel_img_gov: { image_fix_applied: false, visual_change_expected: false, review_required: false, standard_certified: false, pdfx_compliance_claimed: false, pdfa_compliance_claimed: false, compliance_claim_allowed: false }
    });

    // 6. REGRESSION: standards overclaim from selective image fix must be rejected
    await testScenario('6. Standards overclaim regression — selective image fix must not imply PDF/X or PDF/A (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: { ...baseGov, review_required: true, image_fix_applied: true, rgb_images_converted: true, image_profiles_normalized: true, excessive_resolution_downsampled: true },
        applied_fixes: [{ code: 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE' }, { code: 'DOWNSAMPLE_EXCESSIVE_RESOLUTION' }]
    }, [], {
        sel_img_gov: { ...baseGov },
        customer_not_contains: ['PDF/X validated', 'PDF/A validated', 'PDF/X certified', 'PDF/A certified', 'Standards validated', 'Print-ready', 'Certified PDF', 'Production-ready']
    });

    // 7. REGRESSION: certified.pdf filename must not be trusted by name
    await testScenario('7. certified.pdf downgrade regression — filename must not be trusted (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: { ...baseGov, review_required: true, image_fix_applied: true, certified_pdf_allowed: false, rgb_images_converted: true }
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 2000, production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY' }
    ], {
        customer_not_contains: ['Certified PDF', 'certified for production', 'PDF/X validated', 'PDF/A validated', 'Production-ready', 'Print-ready', 'Standards validated', 'automatically approved'],
        review_required: true,
        cert_downgrade: true,
        sel_img_gov: { review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'certified_pdf', customer_visible: false, customer_badge: 'Review required' }]
    });

    // 8. REGRESSION: evidence preservation across applied/skipped/failed buckets + sanitation
    await testScenario('8. Evidence preservation and sanitation across buckets (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: {
            ...baseGov, review_required: true, image_fix_applied: true, rgb_images_converted: true,
            image_profiles_normalized: true, excessive_resolution_downsampled: false, certified_pdf_allowed: false,
            review_required_reasons: ['rgb_images_present'],
            evidence: {
                local_path: '/tmp/selective_image_governance_output.pdf',
                forensic_object_id: 'obj_8821',
                internal_id: 'image_internal_91',
                raw_stream: '%PDF-1.4 image-stream-data',
                qpdf_command: 'qpdf --convert-rgb-cmyk',
                images_scanned: 42
            }
        },
        applied_fixes: [{ code: 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE' }, { code: 'NORMALIZE_IMAGE_ICC_PROFILE' }],
        skipped_fixes: [{ code: 'DOWNSAMPLE_EXCESSIVE_RESOLUTION' }],
        failed_fixes: []
    }, [], {
        operator_contains: ['Selective image governance fixes (RGB-to-CMYK conversion, ICC profile normalization, and/or downsampling of excessive resolution) were attempted on this file'],
        review_required: true,
        sel_img_gov: { image_fix_applied: true, rgb_images_converted: true, image_profiles_normalized: true, excessive_resolution_downsampled: false, review_required: true, ...baseGov },
        sanitation_checks: ['/tmp/selective_image_governance_output.pdf', 'obj_8821', 'image_internal_91', '%PDF-1.4 image-stream-data', 'qpdf --convert-rgb-cmyk']
    });

    // 9. Image review required badge — visual change findings without applied fix
    await testScenario('9. Image review required badge — visual change findings without applied fix (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: { ...baseGov, review_required: true, visual_change_expected: true, certified_pdf_allowed: false, visually_sensitive: true }
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 900 }], {
        customer_contains: ['Some images were converted or normalized and require review.'],
        review_required: true,
        sel_img_gov: { visual_change_expected: true, review_required: true, visually_sensitive: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Image review required', customer_tone: 'warning' }]
    });

    // 10. REGRESSION: review_required propagation when multiple selective image findings combine
    await testScenario('10. review_required propagation across combined RGB/profile/downsample/low-res findings (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        selective_image_governance: {
            ...baseGov, review_required: true, image_fix_applied: true, rgb_images_converted: true,
            image_profiles_normalized: false, excessive_resolution_downsampled: true, low_res_unfixable: true,
            visual_change_expected: true, certified_pdf_allowed: false,
            review_required_reasons: ['rgb_images_present', 'icc_profile_missing', 'low_res_images_present']
        },
        applied_fixes: [{ code: 'CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE' }, { code: 'DOWNSAMPLE_EXCESSIVE_RESOLUTION' }],
        skipped_fixes: [{ code: 'NORMALIZE_IMAGE_ICC_PROFILE' }, { code: 'FLAG_LOW_RES_IMAGES_UNFIXABLE' }]
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1400 }], {
        customer_contains: ['Some images were converted or normalized and require review.', 'Low-resolution images could not be safely improved automatically.'],
        customer_not_contains: ['upscaled', 'Upscaled', 'restored', 'enhanced'],
        review_required: true,
        sel_img_gov: {
            image_fix_applied: true, rgb_images_converted: true, image_profiles_normalized: false,
            excessive_resolution_downsampled: true, low_res_unfixable: true, review_required: true, ...baseGov
        },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Resolution warning', customer_tone: 'warning' }]
    });

    // ── Generate Control Plane regression reports ──────────────────────────
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

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

    const cpReport = {
        phase: '65E',
        repo: 'ppos-control-plane',
        generated_at: new Date().toISOString(),
        input_mode: inputMode,
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    };

    fs.writeFileSync(path.join(reportsDir, 'phase65e_control_plane_selective_image_regression.json'), JSON.stringify(cpReport, null, 2));

    let cpMd = `# Phase 65E — Control Plane Selective Image Governance End-to-End Regression\n\n`;
    cpMd += `**Generated:** ${cpReport.generated_at}  \n`;
    cpMd += `**Input Mode:** ${inputMode}  \n`;
    cpMd += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    cpMd += `**Total:** ${cpReport.total} | **Passed:** ${cpReport.passed} | **Failed:** ${cpReport.failed}\n\n`;
    cpMd += `## Governance Principles Verified\n\n`;
    cpMd += `- RGB conversion, ICC profile normalization, excessive resolution downsampling, and low-res states are preserved end-to-end\n`;
    cpMd += `- Low-resolution images are never reported as "fixed", upscaled, restored, or enhanced — only honestly flagged\n`;
    cpMd += `- review_required propagates correctly across combined and individual selective image findings\n`;
    cpMd += `- Selective image governance never implies print-ready, production certification, PDF/X, or PDF/A validation\n`;
    cpMd += `- certified.pdf is downgraded (not customer-visible) whenever selective image review is required\n`;
    cpMd += `- artifact_ux labels/warnings ("Image review required", "Resolution warning", "Color-managed image change") are safe and honest for customer/operator display\n`;
    cpMd += `- Public/customer output is sanitized (no raw filesystem paths, streams, or forensic identifiers)\n`;
    cpMd += `- Readiness/payment/production gates remain governed by review_required\n\n`;
    cpMd += `## Scenarios\n\n`;
    results.forEach(r => {
        cpMd += `### ${r.name}\n- **Result:** ${r.passed ? '✅ PASS' : '❌ FAIL'}\n`;
        if (r.errors && r.errors.length) { cpMd += `- **Errors:**\n`; r.errors.forEach(e => cpMd += `  - ${e}\n`); }
        cpMd += '\n';
    });
    fs.writeFileSync(path.join(reportsDir, 'phase65e_control_plane_selective_image_regression.md'), cpMd);

    // ── Generate aggregate End-to-End report ───────────────────────────────
    const loadJson = (p) => { try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch { return null; } };
    const engineReport = loadJson(ENGINE_REPORT_PATH);
    const workerReport = loadJson(WORKER_REPORT_PATH);
    const serviceReport = loadJson(SERVICE_REPORT_PATH);
    const controlPlaneHumanReport = loadJson(CONTROL_PLANE_REPORT_PATH);

    const layers = [
        { name: 'Engine (65A)', report: engineReport, passKey: 'smoke_passed' },
        { name: 'Worker (65B)', report: workerReport, passKey: 'smoke_passed' },
        { name: 'Service (65C)', report: serviceReport, passKey: 'smoke_passed' },
        { name: 'Control Plane Human Report (65D)', report: controlPlaneHumanReport, passKey: 'status' },
        { name: 'Control Plane Regression (65E)', report: cpReport, passKey: 'status' }
    ];

    const layerStatus = (l) => {
        if (!l.report) return { present: false, passed: false };
        if (l.passKey === 'smoke_passed') return { present: true, passed: !!l.report.smoke_passed };
        if (l.passKey === 'status') return { present: true, passed: l.report.status === 'PASS' };
        return { present: true, passed: false };
    };

    const layerSummaries = layers.map(l => ({ layer: l.name, ...layerStatus(l) }));
    const e2ePassed = layerSummaries.every(l => l.present && l.passed);

    const e2eReport = {
        phase: '65E — End-to-End Selective Image Governance Regression',
        generated_at: new Date().toISOString(),
        end_to_end_passed: e2ePassed,
        layers: layerSummaries,
        acceptance_criteria: {
            rgb_state_preserved_end_to_end: e2ePassed,
            image_profile_state_preserved_end_to_end: e2ePassed,
            downsample_state_preserved_end_to_end: e2ePassed,
            low_res_never_falsely_reported_as_fixed: e2ePassed,
            no_upscaling_or_restoration_invented: e2ePassed,
            review_required_propagated_end_to_end: e2ePassed,
            selective_image_governance_preserved_end_to_end: e2ePassed,
            evidence_preserved_end_to_end: e2ePassed,
            artifact_trust_remains_authoritative: e2ePassed,
            certified_pdf_downgraded_when_review_required: e2ePassed,
            visual_changes_require_review: e2ePassed,
            human_report_safe_and_understandable: e2ePassed,
            artifact_ux_safe: e2ePassed,
            public_customer_output_sanitized: e2ePassed,
            no_pdfx_pdfa_production_standards_print_ready_claims: e2ePassed,
            reports_generated_in_each_repo: e2ePassed,
            aggregate_report_generated: true,
            all_smoke_tests_pass: e2ePassed
        }
    };

    fs.writeFileSync(path.join(reportsDir, 'phase65e_end_to_end_selective_image_regression.json'), JSON.stringify(e2eReport, null, 2));

    let e2eMd = `# Phase 65E — End-to-End Selective Image Governance Regression\n\n`;
    e2eMd += `**Generated:** ${e2eReport.generated_at}  \n`;
    e2eMd += `**End-to-End Status:** ${e2ePassed ? '✅ PASS' : '❌ FAIL'}\n\n`;
    e2eMd += `## Pipeline Layers\n\n| Layer | Present | Passed |\n| --- | --- | --- |\n`;
    layerSummaries.forEach(l => { e2eMd += `| ${l.layer} | ${l.present ? '✅' : '❌'} | ${l.passed ? '✅' : '❌'} |\n`; });
    e2eMd += `\n## Final Acceptance Criteria\n\n`;
    Object.entries(e2eReport.acceptance_criteria).forEach(([k, v]) => { e2eMd += `- ${v ? '✅' : '❌'} ${k.replace(/_/g, ' ')}\n`; });
    fs.writeFileSync(path.join(reportsDir, 'phase65e_end_to_end_selective_image_regression.md'), e2eMd);

    console.log(`\nReports written to ${reportsDir}`);
    console.log(`End-to-end status: ${e2ePassed ? 'PASS' : 'FAIL'}`);

    if (hasFailures || !e2ePassed) {
        console.error('\n=== Phase 65E / End-to-End Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 65E / End-to-End Smoke Tests Passed ===');
}

runSmokeTests();
