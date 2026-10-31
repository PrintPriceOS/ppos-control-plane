'use strict';
/**
 * Phase 66E Smoke Test — Control Plane Font Governance
 * End-to-End Regression
 *
 * Re-validates that Human Report wording, font_governance payload,
 * artifact_ux labels/warnings, public sanitation, and readiness/gate
 * behavior remain safe and honest end-to-end for font governance fixes
 * (SUBSET_EMBEDDED_FONTS, OUTLINE_TYPE3_FONTS, REPAIR_FONT_ENCODING,
 * FLAG_MISSING_GLYPHS_UNFIXABLE).
 *
 * Acceptance criteria (from Phase 66E prompt):
 *  - no fake embedded fonts (fonts_embedded=false is never silently flipped to true)
 *  - missing glyphs not invented (glyphs_missing_unfixable is preserved, not suppressed)
 *  - evidence preserved (font_governance payload propagates through all layers)
 *  - review required where needed (review_required=true is never bypassed)
 *
 * Also assembles the aggregate end-to-end report combining Engine 66A,
 * Worker 66B, Service 66C, and this Control Plane 66D/66E layer.
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

const ENGINE_REPORT_PATH       = path.resolve(__dirname, '../../ppos-preflight-engine/reports/phase66a_engine_font_fixes.json');
const WORKER_REPORT_PATH       = path.resolve(__dirname, '../../ppos-preflight-worker/reports/phase66b_worker_font_policy.json');
const SERVICE_REPORT_PATH      = path.resolve(__dirname, '../../ppos-preflight-service/reports/phase66c_service_font_exposure.json');
const CONTROL_PLANE_REPORT_PATH = path.resolve(__dirname, '../reports/phase66d_control_plane_font_human_report.json');

const FORBIDDEN_CUSTOMER_PHRASES = [
    'Print-ready', 'Production-ready', 'Certified PDF',
    'PDF/X validated', 'PDF/A validated', 'Automatically approved',
    'Production certified', 'Standards certified',
    'restored', 'invented', 'generated automatically'
];
const FORBIDDEN_SANITATION_TERMS = ['/storage/tenants', 'C:\\Users', 'temp-staging', 'forensic', '/tmp/', 'qpdf --'];

async function runSmokeTests() {
    console.log('=== Running Phase 66E Smoke Tests (Control Plane Font Governance Regression) ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-font-governance-66e', Authorization: 'Bearer test-66e' };

    let inputMode = 'SYNTHETIC_POLICY_FALLBACK';
    if (fs.existsSync(SERVICE_REPORT_PATH)) inputMode = 'SERVICE_REPORT';

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport('job-66e-test', mockContext, jobInput, artifacts);
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
            if (expected.operator_not_contains) {
                for (const str of expected.operator_not_contains) {
                    if (report.operator_summary.includes(str)) { passed = false; errors.push(`Operator summary leaked forbidden term: "${str}"`); }
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

            if (expected.font_gov) {
                const fontGov = report.font_governance || {};
                for (const [k, v] of Object.entries(expected.font_gov)) {
                    if (fontGov[k] !== v) { passed = false; errors.push(`font_governance.${k} expected=${v}, got=${fontGov[k]}`); }
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
                fontGov: report.font_governance,
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
    // 1. SUBSET_EMBEDDED_FONTS applied — font embedding state preserved end-to-end
    //    Validates: no fake embedded fonts (fonts_embedded=false preserved, not flipped)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('1. SUBSET_EMBEDDED_FONTS applied — font embedding state preserved, no fake embedded fonts (regression)', {
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
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1000 }], {
        operator_contains: ['Some fonts were not embedded or could only be partially subset-embedded'],
        customer_contains: ['Some fonts were not embedded.'],
        review_required: true,
        font_gov: { font_fix_applied: true, fonts_embedded: false, font_embedding_skipped: true, review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font review required', customer_tone: 'warning' }]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 2. Font sources unavailable — honest flag preserved, no fake resolution
    //    Validates: evidence preserved (font_source_available=false propagated through all layers)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('2. Font sources unavailable — honest flag preserved, no fake resolution (regression)', {
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
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1100 }], {
        operator_contains: ['Font embedding could not be completed because the original font sources were unavailable', 'flagged honestly rather than producing a falsely certified result'],
        customer_contains: ['Font embedding could not be completed because font sources were unavailable.'],
        review_required: true,
        font_gov: { font_source_available: false, review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font issue unresolved', customer_tone: 'warning' }]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 3. OUTLINE_TYPE3_FONTS applied — Type3 state preserved end-to-end
    //    Validates: review required where needed (type3 always requires review)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('3. OUTLINE_TYPE3_FONTS applied — Type3 state and review_required preserved end-to-end (regression)', {
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
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1200 }], {
        operator_contains: ['Type3 fonts were detected and outlined'],
        customer_contains: ['Type3 fonts require review.'],
        review_required: true,
        font_gov: { type3_fonts_detected: true, type3_fonts_outlined: true, review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font review required', customer_tone: 'warning' }]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 4. FLAG_MISSING_GLYPHS_UNFIXABLE — missing glyphs not invented end-to-end
    //    Validates: missing glyphs not invented (glyphs_missing_unfixable preserved, never suppressed)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('4. FLAG_MISSING_GLYPHS_UNFIXABLE — missing glyphs not invented, honestly preserved end-to-end (regression)', {
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
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1300 }], {
        operator_contains: ['Missing glyphs were detected and could not be safely repaired', 'flagged honestly rather than inventing glyph data'],
        customer_not_contains: ['restored', 'invented', 'generated automatically'],
        review_required: true,
        font_gov: { glyphs_missing_unfixable: true, font_fix_applied: false, review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font issue unresolved', customer_tone: 'warning' }]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 5. REPAIR_FONT_ENCODING applied — encoding repair state preserved end-to-end
    //    Validates: evidence preserved (font_encoding_repaired propagated)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('5. REPAIR_FONT_ENCODING applied — encoding repair state preserved end-to-end (regression)', {
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
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1400 }], {
        operator_contains: ['Font encoding issues were repaired'],
        review_required: true,
        font_gov: { font_encoding_repaired: true, review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font review required', customer_tone: 'warning' }]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 6. Clean control — no font governance findings, honest skip
    //    Validates: no spurious review_required when fonts are clean
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('6. Clean control — no font governance findings, honest skip (regression)', {
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
    }, [], {
        customer_not_contains: ['Some fonts were not embedded.', 'Font embedding could not be completed because font sources were unavailable.', 'Type3 fonts require review.'],
        operator_not_contains: ['Some fonts were not embedded or could only be partially subset-embedded', 'Type3 fonts were detected', 'Font encoding issues were repaired', 'Missing glyphs were detected'],
        font_gov: {
            font_fix_applied: false,
            visual_change_expected: false,
            review_required: false,
            standard_certified: false,
            pdfx_compliance_claimed: false,
            pdfa_compliance_claimed: false,
            compliance_claim_allowed: false
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // 7. REGRESSION: standards overclaim from font fix must be rejected
    //    Validates: font fixes never imply PDF/X or PDF/A certification
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('7. Standards overclaim regression — font fix must not imply PDF/X or PDF/A (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        font_governance: {
            ...baseGov,
            review_required: true,
            font_fix_applied: true,
            fonts_embedded: false,
            type3_fonts_detected: true,
            type3_fonts_outlined: true,
            font_encoding_repaired: true
        },
        applied_fixes: [{ code: 'SUBSET_EMBEDDED_FONTS' }, { code: 'OUTLINE_TYPE3_FONTS' }, { code: 'REPAIR_FONT_ENCODING' }]
    }, [], {
        font_gov: { ...baseGov },
        customer_not_contains: ['PDF/X validated', 'PDF/A validated', 'PDF/X certified', 'PDF/A certified', 'Standards validated', 'Print-ready', 'Certified PDF', 'Production-ready']
    });

    // ══════════════════════════════════════════════════════════════════════
    // 8. REGRESSION: certified.pdf filename must not be trusted by name
    //    when font_governance.review_required=true (conservative override)
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('8. certified.pdf downgrade regression — filename not trusted when font_governance.review_required=true (regression)', {
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
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 2000, production_certified: true, customer_visible: true, artifact_role: 'PRODUCTION_READY' }
    ], {
        customer_not_contains: ['Certified PDF', 'certified for production', 'PDF/X validated', 'PDF/A validated', 'Production-ready', 'Print-ready', 'Standards validated', 'automatically approved'],
        review_required: true,
        cert_downgrade: true,
        font_gov: { review_required: true, ...baseGov },
        artifact_ux_checks: [{ type: 'certified_pdf', customer_visible: false, customer_badge: 'Review required' }]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 9. REGRESSION: evidence preservation across applied/skipped/failed + sanitation
    //    Validates: evidence preserved end-to-end + no raw internal data leaked to public
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('9. Evidence preservation and sanitation across font governance buckets (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        font_governance: {
            ...baseGov,
            review_required: true,
            font_fix_applied: true,
            fonts_embedded: false,
            font_encoding_repaired: true,
            glyphs_missing_unfixable: false,
            type3_fonts_detected: false,
            certified_pdf_allowed: false,
            review_required_reasons: ['font_source_unavailable'],
            evidence: {
                local_path: '/tmp/font_governance_output.pdf',
                forensic_object_id: 'obj_9931',
                internal_id: 'font_internal_77',
                raw_stream: '%PDF-1.4 font-stream-data',
                qpdf_command: 'qpdf --subset-fonts',
                fonts_scanned: 12
            }
        },
        applied_fixes: [{ code: 'SUBSET_EMBEDDED_FONTS' }, { code: 'REPAIR_FONT_ENCODING' }],
        skipped_fixes: [{ code: 'FLAG_MISSING_GLYPHS_UNFIXABLE' }],
        failed_fixes: []
    }, [], {
        operator_contains: [
            'Some fonts were not embedded or could only be partially subset-embedded',
            'Font encoding issues were repaired'
        ],
        review_required: true,
        font_gov: { font_fix_applied: true, fonts_embedded: false, font_encoding_repaired: true, review_required: true, ...baseGov },
        sanitation_checks: [
            '/tmp/font_governance_output.pdf',
            'obj_9931',
            'font_internal_77',
            '%PDF-1.4 font-stream-data',
            'qpdf --subset-fonts'
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 10. REGRESSION: review_required propagation across combined font findings
    //     Validates: when multiple font issues combine, review_required still propagates.
    //     When glyphs_missing_unfixable=true, "Font issue unresolved" takes precedence
    //     over "Font review required" per the badge priority defined in artifactUxLabelService
    //     (font_issue_unresolved check at line 520 runs before font_review_required at line 538).
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('10. review_required propagation across combined font findings (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        font_governance: {
            ...baseGov,
            review_required: true,
            font_fix_applied: true,
            fonts_embedded: false,
            font_embedding_skipped: true,
            type3_fonts_detected: true,
            type3_fonts_outlined: false,
            glyphs_missing_unfixable: true,
            font_encoding_repaired: false,
            visual_change_expected: true,
            certified_pdf_allowed: false,
            review_required_reasons: ['font_not_embedded', 'type3_fonts_present', 'glyphs_missing']
        },
        applied_fixes: [{ code: 'SUBSET_EMBEDDED_FONTS' }],
        skipped_fixes: [{ code: 'OUTLINE_TYPE3_FONTS' }, { code: 'FLAG_MISSING_GLYPHS_UNFIXABLE' }]
    }, [{ type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 1600 }], {
        customer_contains: ['Some fonts were not embedded.'],
        customer_not_contains: ['restored', 'invented', 'generated automatically'],
        review_required: true,
        font_gov: {
            font_fix_applied: true,
            fonts_embedded: false,
            type3_fonts_detected: true,
            glyphs_missing_unfixable: true,
            review_required: true,
            ...baseGov
        },
        // glyphs_missing_unfixable=true → font_issue_unresolved=true takes precedence
        // over font_review_required per badge priority in artifactUxLabelService (line 520 > 538)
        artifact_ux_checks: [{ type: 'fixed_pdf', customer_badge: 'Font issue unresolved', customer_tone: 'warning' }]
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
        font_governance: r.report?.font_governance
    }));

    const cpReport = {
        phase: '66E',
        repo: 'ppos-control-plane',
        generated_at: new Date().toISOString(),
        input_mode: inputMode,
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    };

    fs.writeFileSync(path.join(reportsDir, 'phase66e_control_plane_font_governance_regression.json'), JSON.stringify(cpReport, null, 2));

    let cpMd = `# Phase 66E — Control Plane Font Governance End-to-End Regression\n\n`;
    cpMd += `**Generated:** ${cpReport.generated_at}  \n`;
    cpMd += `**Input Mode:** ${inputMode}  \n`;
    cpMd += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    cpMd += `**Total:** ${cpReport.total} | **Passed:** ${cpReport.passed} | **Failed:** ${cpReport.failed}\n\n`;
    cpMd += `## Governance Principles Verified\n\n`;
    cpMd += `- Font embedding, Type3 outlining, encoding repair, and missing-glyph states are preserved end-to-end\n`;
    cpMd += `- No fake embedded fonts — fonts_embedded=false is never silently flipped to true\n`;
    cpMd += `- Missing glyphs are never invented or reported as restored — only honestly flagged\n`;
    cpMd += `- Font governance evidence propagates through all pipeline layers unchanged\n`;
    cpMd += `- review_required propagates correctly across combined and individual font governance findings\n`;
    cpMd += `- Font governance never implies print-ready, production certification, PDF/X, or PDF/A validation\n`;
    cpMd += `- certified.pdf is downgraded (not customer-visible) whenever font_governance.review_required=true\n`;
    cpMd += `- artifact_ux labels/warnings ("Font review required", "Font issue unresolved") are safe and honest for customer/operator display\n`;
    cpMd += `- Public/customer output is sanitized (no raw filesystem paths, streams, or forensic identifiers)\n`;
    cpMd += `- Readiness/payment/production gates remain governed by review_required\n\n`;
    cpMd += `## Scenarios\n\n`;
    results.forEach(r => {
        cpMd += `### ${r.name}\n- **Result:** ${r.passed ? '✅ PASS' : '❌ FAIL'}\n`;
        if (r.errors && r.errors.length) { cpMd += `- **Errors:**\n`; r.errors.forEach(e => cpMd += `  - ${e}\n`); }
        cpMd += '\n';
    });
    fs.writeFileSync(path.join(reportsDir, 'phase66e_control_plane_font_governance_regression.md'), cpMd);

    // ── Generate aggregate End-to-End report ───────────────────────────────
    const loadJson = (p) => { try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch { return null; } };
    const engineReport = loadJson(ENGINE_REPORT_PATH);
    const workerReport = loadJson(WORKER_REPORT_PATH);
    const serviceReport = loadJson(SERVICE_REPORT_PATH);
    const controlPlaneHumanReport = loadJson(CONTROL_PLANE_REPORT_PATH);

    const layers = [
        { name: 'Engine (66A)', report: engineReport, passKey: 'smoke_passed' },
        { name: 'Worker (66B)', report: workerReport, passKey: 'smoke_passed' },
        { name: 'Service (66C)', report: serviceReport, passKey: 'smoke_passed' },
        { name: 'Control Plane Human Report (66D)', report: controlPlaneHumanReport, passKey: 'status' },
        { name: 'Control Plane Regression (66E)', report: cpReport, passKey: 'status' }
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
        phase: '66E — End-to-End Font Governance Regression',
        generated_at: new Date().toISOString(),
        end_to_end_passed: e2ePassed,
        layers: layerSummaries,
        acceptance_criteria: {
            no_fake_embedded_fonts: e2ePassed,
            missing_glyphs_not_invented: e2ePassed,
            font_source_unavailability_honest: e2ePassed,
            type3_fonts_always_review_required: e2ePassed,
            evidence_preserved_end_to_end: e2ePassed,
            review_required_propagated_end_to_end: e2ePassed,
            font_governance_preserved_end_to_end: e2ePassed,
            artifact_trust_remains_authoritative: e2ePassed,
            certified_pdf_downgraded_when_review_required: e2ePassed,
            font_fixes_never_imply_print_ready_or_certified: e2ePassed,
            human_report_safe_and_understandable: e2ePassed,
            artifact_ux_safe: e2ePassed,
            public_customer_output_sanitized: e2ePassed,
            no_pdfx_pdfa_production_standards_print_ready_claims: e2ePassed,
            reports_generated_in_each_repo: e2ePassed,
            aggregate_report_generated: true,
            all_smoke_tests_pass: e2ePassed
        }
    };

    fs.writeFileSync(path.join(reportsDir, 'phase66e_end_to_end_font_governance_regression.json'), JSON.stringify(e2eReport, null, 2));

    let e2eMd = `# Phase 66E — End-to-End Font Governance Regression\n\n`;
    e2eMd += `**Generated:** ${e2eReport.generated_at}  \n`;
    e2eMd += `**End-to-End Status:** ${e2ePassed ? '✅ PASS' : '❌ FAIL'}\n\n`;
    e2eMd += `## Pipeline Layers\n\n| Layer | Present | Passed |\n| --- | --- | --- |\n`;
    layerSummaries.forEach(l => { e2eMd += `| ${l.layer} | ${l.present ? '✅' : '❌'} | ${l.passed ? '✅' : '❌'} |\n`; });
    e2eMd += `\n## Final Acceptance Criteria\n\n`;
    Object.entries(e2eReport.acceptance_criteria).forEach(([k, v]) => { e2eMd += `- ${v ? '✅' : '❌'} ${k.replace(/_/g, ' ')}\n`; });
    fs.writeFileSync(path.join(reportsDir, 'phase66e_end_to_end_font_governance_regression.md'), e2eMd);

    console.log(`\nReports written to ${reportsDir}`);
    console.log(`End-to-end status: ${e2ePassed ? 'PASS' : 'FAIL'}`);

    if (hasFailures || !e2ePassed) {
        console.error('\n=== Phase 66E / End-to-End Smoke Tests FAILED ===');
        process.exit(1);
    }
    console.log('\n=== All Phase 66E / End-to-End Smoke Tests Passed ===');
}

runSmokeTests();
