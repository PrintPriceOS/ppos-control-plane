'use strict';
/**
 * Phase 62F-D Smoke Test — Control Plane Heavy PDF Probe Human Report + UX
 *
 * Validates that preflightHumanReportService and artifactUxLabelService
 * correctly consume heavy_pdf_probe_governance (from FixAuditNormalizer /
 * upstream services) and:
 *  - explain qpdf/pdfimages structural WARNINGS as warnings, not fatal failures
 *  - never downgrade true fatal probe failures into warnings
 *  - never upgrade warning-only probes into fatal document failures
 *  - never auto-certify degraded analysis
 *  - sanitize customer-facing output (no raw paths, object IDs, transcripts)
 *  - keep readiness gates conservative (review_required / production_certified)
 *  - recommend remediation/reupload for fatal_document_failure
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

const SERVICE_REPORT_PATH = path.resolve(__dirname, '../../ppos-preflight-service/reports/phase62f_service_heavy_pdf_probe_exposure.json');

// Terms that must never appear in any customer-facing output
const FORBIDDEN_OVERCLAIMS = [
    'Print-ready', 'Production certified', 'Standards certified', 'Certified PDF',
    'PDF/X validated.', 'PDF/A validated.', 'certified for production'
];

// Terms that must never appear anywhere in the safe public payload
const FORBIDDEN_SANITATION_TERMS = [
    '/tmp/jobs/', 'C:\\Users\\internal', '/storage/tenants', '/private/var',
    'qpdf --check', 'int-heavy-001', '12 0 obj'
];

async function runSmokeTests() {
    console.log('=== Running Phase 62F-D Smoke Tests (Control Plane Heavy PDF Probe Human Report) ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-heavy-pdf-probe-62fd', Authorization: 'Bearer test-62fd' };

    let inputMode = 'SYNTHETIC_POLICY_FALLBACK';
    if (fs.existsSync(SERVICE_REPORT_PATH)) inputMode = 'SERVICE_REPORT_PRESENT';

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport('job-62fd-test', mockContext, jobInput, artifacts);
            if (!result.ok) throw new Error('Report generation failed: ' + JSON.stringify(result));

            const report = result.report;
            let passed = true;
            const errors = [];

            const heavyGov = report.heavy_pdf_probe_governance || {};

            // ── heavy_pdf_probe_governance field checks ─────────────────────
            if (expected.heavy_pdf_gov) {
                for (const [k, v] of Object.entries(expected.heavy_pdf_gov)) {
                    if (heavyGov[k] !== v) {
                        passed = false;
                        errors.push(`heavy_pdf_probe_governance.${k} expected=${JSON.stringify(v)}, got=${JSON.stringify(heavyGov[k])}`);
                    }
                }
            }

            // ── Global: heavy_pdf_probe_governance never overclaims ─────────
            if (heavyGov.heavy_pdf_detected === true) {
                for (const k of ['production_certified', 'standard_certified', 'pdfx_compliance_claimed', 'pdfa_compliance_claimed', 'compliance_claim_allowed']) {
                    if (heavyGov[k] !== false) {
                        passed = false;
                        errors.push(`heavy_pdf_probe_governance.${k} must always be false, got=${JSON.stringify(heavyGov[k])}`);
                    }
                }
            }

            // ── outcome checks ───────────────────────────────────────────────
            if (expected.outcome !== undefined && report.outcome !== expected.outcome) {
                passed = false; errors.push(`outcome expected="${expected.outcome}", got="${report.outcome}"`);
            }
            if (expected.outcome_in && !expected.outcome_in.includes(report.outcome)) {
                passed = false; errors.push(`outcome expected one of [${expected.outcome_in.join(', ')}], got="${report.outcome}"`);
            }

            // ── review_required / production_certified / standard_certified ─
            if (expected.review_required === true && report.fix_summary?.review_required !== true) {
                passed = false; errors.push('Expected fix_summary.review_required=true');
            }
            if (expected.production_certified === false && report.fix_summary?.production_certified !== false) {
                passed = false; errors.push('Expected fix_summary.production_certified=false');
            }
            if (expected.standard_certified === false && report.standard_certified !== false) {
                passed = false; errors.push('Expected standard_certified=false');
            }

            // ── recommended next action ──────────────────────────────────────
            if (expected.recommended_action_id !== undefined) {
                const actual = report.recommended_next_action?.action_id;
                if (actual !== expected.recommended_action_id) {
                    passed = false; errors.push(`recommended_next_action.action_id expected="${expected.recommended_action_id}", got="${actual}"`);
                }
            }

            // ── customer / operator wording checks ───────────────────────────
            if (expected.customer_contains) {
                for (const str of expected.customer_contains) {
                    if (!report.customer_summary.includes(str)) {
                        passed = false; errors.push(`Customer summary missing: "${str}"`);
                    }
                }
            }
            if (expected.customer_not_contains) {
                for (const str of expected.customer_not_contains) {
                    if (report.customer_summary.includes(str)) {
                        passed = false; errors.push(`Customer summary leaked forbidden term: "${str}"`);
                    }
                }
            }
            if (expected.operator_contains) {
                for (const str of expected.operator_contains) {
                    if (!report.operator_summary.includes(str)) {
                        passed = false; errors.push(`Operator summary missing: "${str}"`);
                    }
                }
            }

            // ── Operator detail checks (full probe semantics exposed) ───────
            if (expected.operator_detail_checks) {
                const c = expected.operator_detail_checks;
                if (c.page_count !== undefined && heavyGov.page_count !== c.page_count) {
                    passed = false; errors.push(`heavy_pdf_probe_governance.page_count expected=${c.page_count}, got=${heavyGov.page_count}`);
                }
                if (c.probe_summary_total !== undefined && heavyGov.probe_summary?.total !== c.probe_summary_total) {
                    passed = false; errors.push(`heavy_pdf_probe_governance.probe_summary.total expected=${c.probe_summary_total}, got=${heavyGov.probe_summary?.total}`);
                }
                if (c.qpdf_semantic_status !== undefined && heavyGov.tools?.qpdf?.semantic_status !== c.qpdf_semantic_status) {
                    passed = false; errors.push(`heavy_pdf_probe_governance.tools.qpdf.semantic_status expected="${c.qpdf_semantic_status}", got="${heavyGov.tools?.qpdf?.semantic_status}"`);
                }
                if (c.qpdf_warning_classes) {
                    const actual = heavyGov.tools?.qpdf?.warning_classes || [];
                    for (const wc of c.qpdf_warning_classes) {
                        if (!actual.includes(wc)) {
                            passed = false; errors.push(`heavy_pdf_probe_governance.tools.qpdf.warning_classes missing "${wc}"`);
                        }
                    }
                }
                if (c.review_required_reasons_include) {
                    const actual = heavyGov.review_required_reasons || [];
                    if (!actual.includes(c.review_required_reasons_include)) {
                        passed = false; errors.push(`heavy_pdf_probe_governance.review_required_reasons missing "${c.review_required_reasons_include}"`);
                    }
                }
            }

            // ── Artifact recommendations checks ──────────────────────────────
            if (expected.artifact_recommendation_checks) {
                for (const check of expected.artifact_recommendation_checks) {
                    const entry = (report.artifact_recommendations || []).find(a => a.filename === check.filename);
                    if (!entry) {
                        passed = false; errors.push(`artifact_recommendations: no artifact with filename "${check.filename}" found`); continue;
                    }
                    if (check.production_certified !== undefined && entry.production_certified !== check.production_certified) {
                        passed = false; errors.push(`artifact_recommendations[${check.filename}].production_certified expected=${check.production_certified}, got=${entry.production_certified}`);
                    }
                    if (check.customer_visible !== undefined && entry.customer_visible !== check.customer_visible) {
                        passed = false; errors.push(`artifact_recommendations[${check.filename}].customer_visible expected=${check.customer_visible}, got=${entry.customer_visible}`);
                    }
                    if (check.artifact_role !== undefined && entry.artifact_role !== check.artifact_role) {
                        passed = false; errors.push(`artifact_recommendations[${check.filename}].artifact_role expected="${check.artifact_role}", got="${entry.artifact_role}"`);
                    }
                }
            }

            // ── Artifact UX checks ──────────────────────────────────────────
            if (expected.artifact_ux_checks) {
                for (const check of expected.artifact_ux_checks) {
                    const entry = (report.artifact_ux.artifacts || []).find(a => a.type === check.type);
                    if (!entry) {
                        passed = false; errors.push(`artifact_ux: no artifact of type "${check.type}" found`); continue;
                    }
                    if (check.customer_visible !== undefined && entry.customer_visible !== check.customer_visible) {
                        passed = false; errors.push(`artifact_ux[${check.type}] customer_visible expected=${check.customer_visible}, got=${entry.customer_visible}`);
                    }
                    if (check.audience && (check.badge !== undefined || check.tone !== undefined)) {
                        const ux = entry.ux?.[check.audience];
                        if (check.badge !== undefined && ux?.status_badge !== check.badge) {
                            passed = false; errors.push(`artifact_ux[${check.type}].${check.audience}.status_badge expected="${check.badge}", got="${ux?.status_badge}"`);
                        }
                        if (check.tone !== undefined && ux?.status_tone !== check.tone) {
                            passed = false; errors.push(`artifact_ux[${check.type}].${check.audience}.status_tone expected="${check.tone}", got="${ux?.status_tone}"`);
                        }
                    }
                }
            }

            // ── Global overclaim regression ─────────────────────────────────
            for (const str of FORBIDDEN_OVERCLAIMS) {
                if (report.customer_summary.includes(str)) {
                    passed = false; errors.push(`Customer summary leaked forbidden overclaim: "${str}"`);
                }
            }

            // ── Global sanitation ───────────────────────────────────────────
            const payloadStr = JSON.stringify({
                heavyGov,
                customerSummary: report.customer_summary,
                operatorSummary: report.operator_summary,
                artifactUx: report.artifact_ux
            });
            const sanitationTerms = (expected.sanitation_checks || []).concat(FORBIDDEN_SANITATION_TERMS);
            for (const term of sanitationTerms) {
                if (payloadStr.includes(term)) {
                    passed = false; errors.push(`Sanitation failed — leaked raw term: "${term}"`);
                }
            }

            // ── Customer-forbidden wording (raw transcripts / overclaim terms) ─
            if (expected.customer_forbidden_terms) {
                for (const term of expected.customer_forbidden_terms) {
                    if (report.customer_summary.includes(term)) {
                        passed = false; errors.push(`Customer summary leaked forbidden term: "${term}"`);
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
    // 1. Heavy PDF degraded_but_usable=true — operator and customer wording
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('1. Heavy PDF degraded_but_usable=true — analysis completed with probe warnings, review required', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        review_required: false,
        production_certified: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 894784853,
            file_size_mb: 853.4,
            page_count: 128,
            probe_semantics_applied: true,
            analysis_degraded: true,
            degraded_but_usable: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 2, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_LINEARIZATION_HINT_WARNING', 'PDF_SHARED_OBJECT_HINT_MISMATCH'] },
                pdfimages: { raw_status: 0, semantic_status: 'SUCCESS', severity: 'NONE', usable_output: true, fatal: false }
            },
            probe_summary: { total: 2, warning_only: 1, success: 1, failed_fatal: 0 },
            warnings: ['qpdf reported structural warnings during heavy PDF analysis.'],
            review_required_reasons: ['HEAVY_PDF_PROBE_WARNING_QPDF']
        }
    }, [], {
        heavy_pdf_gov: {
            heavy_pdf_detected: true,
            degraded_but_usable: true,
            fatal_document_failure: false,
            review_required: true
        },
        review_required: true,
        production_certified: false,
        operator_contains: [
            'Analysis completed, but some heavy-PDF probes returned warnings. The file requires review before production approval.'
        ],
        customer_contains: [
            'The file was uploaded and analyzed, but the analysis found technical warnings in the PDF structure.',
            'The file is not automatically approved for production.',
            'A review is required before this file can proceed.'
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 2. qpdf WARNING_ONLY — operator wording explains structural warnings
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('2. qpdf WARNING_ONLY — operator wording explains linearization/hint-table warnings', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 612 * 1024 * 1024,
            page_count: 64,
            probe_semantics_applied: true,
            degraded_but_usable: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 3, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_LINEARIZATION_HINT_WARNING'] }
            },
            probe_summary: { total: 1, warning_only: 1 }
        }
    }, [], {
        heavy_pdf_gov: { heavy_pdf_detected: true, review_required: true },
        operator_contains: [
            'qpdf reported structural warnings, such as linearization or hint-table inconsistencies. These do not necessarily mean the file is unreadable, but they prevent automatic certification.'
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 3. pdfimages WARNING_ONLY — operator wording explains image extraction warnings
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('3. pdfimages WARNING_ONLY — operator wording explains image extraction warnings', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 700 * 1024 * 1024,
            page_count: 200,
            probe_semantics_applied: true,
            degraded_but_usable: true,
            certifiable: false,
            tools: {
                pdfimages: { raw_status: 1, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_FONT_WEIGHT_WARNING'] }
            },
            probe_summary: { total: 1, warning_only: 1 }
        }
    }, [], {
        heavy_pdf_gov: { heavy_pdf_detected: true, review_required: true },
        operator_contains: [
            'Image extraction reported warnings. The analysis continued, but image-related results should be reviewed.'
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 4. qpdf FAILED_FATAL — fatal_document_failure blocks production
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('4. qpdf FAILED_FATAL — fatal_document_failure blocks production and recommends remediation', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        review_required: false,
        production_certified: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 920 * 1024 * 1024,
            page_count: 340,
            probe_semantics_applied: true,
            fatal_document_failure: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 2, semantic_status: 'FAILED_FATAL', severity: 'FATAL', usable_output: false, fatal: true, fatal_classes: ['INVALID_XREF', 'UNABLE_TO_FIND_TRAILER'] }
            },
            probe_summary: { total: 1, failed_fatal: 1 },
            review_required_reasons: ['HEAVY_PDF_FATAL_QPDF']
        }
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 500000, downloadable: true, customer_visible: true, production_certified: true, standard_certified: false }
    ], {
        outcome: 'BLOCKED',
        heavy_pdf_gov: {
            heavy_pdf_detected: true,
            fatal_document_failure: true,
            review_required: true
        },
        review_required: true,
        production_certified: false,
        customer_contains: [
            'The PDF could not be reliably inspected because a critical probe failed. Re-exporting or repairing the source PDF is recommended.',
            'If requested, please re-export the PDF from the source application and upload it again.'
        ],
        operator_contains: [
            'The PDF could not be reliably inspected because a critical heavy-PDF probe failed. Re-exporting or repairing the source PDF is recommended before this job can proceed.'
        ],
        recommended_action_id: 'request_upload',
        artifact_recommendation_checks: [
            { filename: 'certified.pdf', production_certified: false, customer_visible: false, artifact_role: 'REVIEW_REQUIRED' }
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 5. Strict forensic mode — operator wording notes reduced confidence
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('5. Strict forensic mode — operator wording notes certification is blocked under reduced confidence', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        strict_forensic_mode: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 550 * 1024 * 1024,
            page_count: 80,
            probe_semantics_applied: true,
            degraded_but_usable: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 0, semantic_status: 'SUCCESS_WITH_WARNINGS', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_OBJECT_COUNT_HINT_MISMATCH'] }
            },
            probe_summary: { total: 1, success_with_warnings: 1 }
        }
    }, [], {
        heavy_pdf_gov: { heavy_pdf_detected: true, strict_forensic_mode: true, certifiable: false },
        operator_contains: [
            'Strict forensic mode prevents automatic certification when probe warnings reduce analysis confidence.'
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 6. Customer sanitation — no raw paths, object IDs, transcripts, overclaims
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('6. Customer sanitation — no raw paths, object IDs, transcripts, or overclaims', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 853 * 1024 * 1024,
            page_count: 110,
            probe_semantics_applied: true,
            degraded_but_usable: true,
            certifiable: false,
            evidence: {
                proof_hash: 'heavy-evidence-hash-001',
                detail_message: 'qpdf check completed for /tmp/jobs/heavy-001/source.pdf with warnings',
                local_path: '/tmp/jobs/heavy-001/source.pdf',
                command: 'qpdf --check /tmp/jobs/heavy-001/source.pdf',
                internal_id: 'int-heavy-001',
                forensic_object_id: '12 0 obj'
            },
            tools: {
                qpdf: {
                    raw_status: 3, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false,
                    warning_classes: ['PDF_LINEARIZATION_HINT_WARNING'],
                    evidence: {
                        raw_stream: 'WARNING: /tmp/jobs/heavy-001/source.pdf: hint table mismatch in object 12 0 obj',
                        local_path: 'C:\\Users\\internal\\heavy-001\\source.pdf'
                    }
                }
            }
        }
    }, [], {
        heavy_pdf_gov: { heavy_pdf_detected: true },
        customer_forbidden_terms: ['corrupt', 'certified', 'print-ready', 'PDF/X validated', 'PDF/A validated', '12 0 obj'],
        sanitation_checks: [
            '/tmp/jobs/heavy-001/',
            'C:\\Users\\internal',
            'qpdf --check',
            'int-heavy-001',
            '12 0 obj'
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 7. Operator detail — full per-tool semantic statuses and warning classes
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('7. Operator detail — full per-tool semantic statuses, warning classes, and probe summary exposed', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 780 * 1024 * 1024,
            file_size_mb: 743.7,
            page_count: 256,
            probe_semantics_applied: true,
            degraded_but_usable: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 3, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_LINEARIZATION_HINT_WARNING', 'PDF_SHARED_OBJECT_HINT_MISMATCH'], evidence: { warning_count: 4 } },
                pdfimages: { raw_status: 0, semantic_status: 'SUCCESS', severity: 'NONE', usable_output: true, fatal: false }
            },
            probe_summary: { total: 2, warning_only: 1, success: 1, failed_fatal: 0 },
            review_required_reasons: ['HEAVY_PDF_PROBE_WARNING_QPDF']
        }
    }, [], {
        operator_detail_checks: {
            page_count: 256,
            probe_summary_total: 2,
            qpdf_semantic_status: 'WARNING_ONLY',
            qpdf_warning_classes: ['PDF_LINEARIZATION_HINT_WARNING', 'PDF_SHARED_OBJECT_HINT_MISMATCH'],
            review_required_reasons_include: 'HEAVY_PDF_PROBE_WARNING_QPDF'
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // 8. Artifact UX badges — Probe warning / Review required
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('8. Artifact UX badges — Probe warning (fixed/review_pdf), Review required (certified_pdf)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 600 * 1024 * 1024,
            page_count: 90,
            probe_semantics_applied: true,
            degraded_but_usable: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 3, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_LINEARIZATION_HINT_WARNING'] }
            },
            probe_summary: { total: 1, warning_only: 1 }
        }
    }, [
        { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 500000, downloadable: true, customer_visible: false, production_certified: false, standard_certified: false },
        { type: 'review_pdf', filename: 'review.pdf', size_bytes: 500000, downloadable: true, customer_visible: false, production_certified: false, standard_certified: false },
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 500000, downloadable: true, customer_visible: true, production_certified: true, standard_certified: false }
    ], {
        artifact_ux_checks: [
            { type: 'fixed_pdf', audience: 'operator', badge: 'Probe warning', tone: 'warning' },
            { type: 'review_pdf', audience: 'operator', badge: 'Probe warning', tone: 'warning' },
            { type: 'certified_pdf', audience: 'operator', badge: 'Review required', tone: 'warning' },
            { type: 'certified_pdf', audience: 'customer', customer_visible: false }
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 9. Readiness gate blocked — heavy PDF review_required blocks production
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('9. Readiness gate — heavy PDF review_required blocks production certification end-to-end', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        review_required: false,
        production_certified: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 650 * 1024 * 1024,
            page_count: 102,
            probe_semantics_applied: true,
            review_required: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 3, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_LINEARIZATION_HINT_WARNING'] }
            },
            review_required_reasons: ['HEAVY_PDF_PROBE_WARNING_QPDF']
        }
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 600000, downloadable: true, customer_visible: true, production_certified: true, standard_certified: true }
    ], {
        outcome_in: ['REVIEW_REQUIRED', 'FIXED_REVIEW_REQUIRED'],
        review_required: true,
        production_certified: false,
        standard_certified: false,
        heavy_pdf_gov: { review_required: true },
        artifact_recommendation_checks: [
            { filename: 'certified.pdf', production_certified: false, customer_visible: false, artifact_role: 'REVIEW_REQUIRED' }
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 10. Remediation — fatal_document_failure recommends reupload
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('10. Remediation — fatal_document_failure recommends reupload, no production download', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        review_required: false,
        production_certified: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 880 * 1024 * 1024,
            page_count: 410,
            probe_semantics_applied: true,
            fatal_document_failure: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 2, semantic_status: 'FAILED_FATAL', severity: 'FATAL', usable_output: false, fatal: true, fatal_classes: ['INVALID_XREF'] }
            }
        }
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 880000000, downloadable: true, customer_visible: true, production_certified: true, standard_certified: true }
    ], {
        outcome: 'BLOCKED',
        recommended_action_id: 'request_upload',
        customer_contains: ['re-export', 'upload it again'],
        artifact_recommendation_checks: [
            { filename: 'certified.pdf', production_certified: false, customer_visible: false, artifact_role: 'REVIEW_REQUIRED' }
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 11. Standards overclaim regression — heavy PDF never implies certification
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('11. Standards overclaim regression — heavy PDF governance never implies certification or compliance', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        review_required: false,
        production_certified: true,
        standard_certified: true,
        pdfx_compliance_claimed: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 700 * 1024 * 1024,
            page_count: 150,
            probe_semantics_applied: true,
            degraded_but_usable: true,
            certifiable: false,
            production_certified: false,
            standard_certified: false,
            pdfx_compliance_claimed: false,
            tools: {
                pdfimages: { raw_status: 1, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_FONT_WEIGHT_WARNING'] }
            }
        }
    }, [], {
        heavy_pdf_gov: {
            production_certified: false,
            standard_certified: false,
            pdfx_compliance_claimed: false,
            pdfa_compliance_claimed: false,
            compliance_claim_allowed: false
        },
        review_required: true,
        production_certified: false,
        standard_certified: false
    });

    // ══════════════════════════════════════════════════════════════════════
    // 12. certified.pdf filename regression — filename alone never bypasses review
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('12. certified.pdf filename regression — filename alone does not bypass heavy PDF review gate', {
        status: 'COMPLETED',
        certificationLevel: 'CERTIFIED_READY',
        review_required: false,
        production_certified: true,
        heavy_pdf_probe_governance: {
            heavy_pdf_detected: true,
            file_size_bytes: 853 * 1024 * 1024,
            page_count: 256,
            probe_semantics_applied: true,
            degraded_but_usable: true,
            certifiable: false,
            tools: {
                qpdf: { raw_status: 3, semantic_status: 'WARNING_ONLY', severity: 'WARNING', usable_output: true, fatal: false, warning_classes: ['PDF_LINEARIZATION_HINT_WARNING'] }
            }
        }
    }, [
        { type: 'certified_pdf', alias: 'certified_pdf', filename: 'certified.pdf', size_bytes: 894784853, downloadable: true, customer_visible: true, production_certified: true, standard_certified: true }
    ], {
        artifact_recommendation_checks: [
            { filename: 'certified.pdf', production_certified: false, customer_visible: false, artifact_role: 'REVIEW_REQUIRED' }
        ],
        artifact_ux_checks: [
            { type: 'certified_pdf', audience: 'customer', customer_visible: false }
        ]
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
        standard_certified: r.report?.standard_certified,
        heavy_pdf_probe_governance: r.report?.heavy_pdf_probe_governance
            ? {
                heavy_pdf_detected: r.report.heavy_pdf_probe_governance.heavy_pdf_detected,
                analysis_status: r.report.heavy_pdf_probe_governance.analysis_status,
                degraded_but_usable: r.report.heavy_pdf_probe_governance.degraded_but_usable,
                fatal_document_failure: r.report.heavy_pdf_probe_governance.fatal_document_failure,
                review_required: r.report.heavy_pdf_probe_governance.review_required,
                strict_forensic_mode: r.report.heavy_pdf_probe_governance.strict_forensic_mode,
                certifiable: r.report.heavy_pdf_probe_governance.certifiable,
                production_certified: r.report.heavy_pdf_probe_governance.production_certified,
                standard_certified: r.report.heavy_pdf_probe_governance.standard_certified
            }
            : null,
        recommended_next_action: r.report?.recommended_next_action?.action_id
    }));

    const cpReport = {
        phase: '62F-D',
        repo: 'ppos-control-plane',
        generated_at: new Date().toISOString(),
        input_mode: inputMode,
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults,
        acceptance_criteria: {
            consumes_heavy_pdf_probe_governance: !hasFailures,
            human_report_wording_clear_and_safe: !hasFailures,
            customer_output_sanitized: !hasFailures,
            operator_output_useful: !hasFailures,
            artifact_ux_reflects_heavy_pdf_warning_state: !hasFailures,
            readiness_gates_remain_conservative: !hasFailures,
            fatal_failures_require_remediation: !hasFailures,
            degraded_but_usable_supports_review_route: !hasFailures,
            no_production_or_standards_overclaim: !hasFailures,
            no_downgrade_of_fatal_to_warning: !hasFailures,
            no_upgrade_of_warning_to_fatal: !hasFailures,
            certified_pdf_filename_does_not_bypass_review: !hasFailures
        }
    };

    fs.writeFileSync(
        path.join(reportsDir, 'phase62f_control_plane_heavy_pdf_probe_human_report.json'),
        JSON.stringify(cpReport, null, 2)
    );

    let md = `# Phase 62F-D — Control Plane Heavy PDF Probe Human Report + UX\n\n`;
    md += `**Generated:** ${cpReport.generated_at}  \n`;
    md += `**Input Mode:** ${inputMode}  \n`;
    md += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    md += `**Total:** ${cpReport.total} | **Passed:** ${cpReport.passed} | **Failed:** ${cpReport.failed}\n\n`;
    md += `## Governance Principles Verified\n\n`;
    md += `- heavy_pdf_probe_governance is defensively extracted from job/report/fix_summary/fix_audit/artifact metadata\n`;
    md += `- degraded_but_usable=true is explained as "completed with warnings, review required" — not as a failure\n`;
    md += `- qpdf/pdfimages WARNING_ONLY statuses are explained as structural warnings, not corruption\n`;
    md += `- fatal_document_failure=true is never downgraded to a warning and always recommends remediation/reupload\n`;
    md += `- strict_forensic_mode prevents automatic certification when probe warnings reduce confidence\n`;
    md += `- customer output never leaks raw paths, object IDs, qpdf transcripts, or internal IDs\n`;
    md += `- heavy_pdf_probe_governance.production_certified/standard_certified/pdfx/pdfa/compliance_claim_allowed are always false\n`;
    md += `- artifact_ux reflects heavy PDF state via "Heavy PDF" / "Analysis warnings" / "Probe warning" / "Review required" / "Technical review required" badges\n`;
    md += `- certified.pdf is downgraded (production_certified=false, customer_visible=false, artifact_role=REVIEW_REQUIRED) whenever heavy PDF review is required, regardless of filename\n\n`;
    md += `## Acceptance Criteria\n\n`;
    Object.entries(cpReport.acceptance_criteria).forEach(([k, v]) => {
        md += `- ${v ? '✅' : '❌'} ${k.replace(/_/g, ' ')}\n`;
    });
    md += `\n## Scenarios\n\n`;
    results.forEach(r => {
        md += `### ${r.name}\n- **Result:** ${r.passed ? '✅ PASS' : '❌ FAIL'}\n`;
        if (r.errors && r.errors.length) { md += `- **Errors:**\n`; r.errors.forEach(e => md += `  - ${e}\n`); }
        md += '\n';
    });

    fs.writeFileSync(path.join(reportsDir, 'phase62f_control_plane_heavy_pdf_probe_human_report.md'), md);

    console.log(`\nReports written to ${reportsDir}`);
    if (hasFailures) {
        console.error('\n=== Phase 62F-D Control Plane Tests FAILED ===');
        process.exit(1);
    } else {
        console.log(`\n=== Phase 62F-D Smoke Tests Passed (${cpReport.passed}/${cpReport.total}) ===`);
    }
}

runSmokeTests();
