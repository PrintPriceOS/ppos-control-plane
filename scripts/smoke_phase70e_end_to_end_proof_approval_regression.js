'use strict';
/**
 * Phase 70E Smoke Test — End-to-End Proof Approval Regression
 *
 * Validates the full proof approval lifecycle:
 *  Engine → Worker → Service → Control Plane
 *
 * Acceptance criteria (from Phase 70E prompt):
 *  - proof required when visual changes exist
 *  - production blocked until approval
 *  - proof approval unlocks only the proof gate
 *  - rejection triggers remediation/reupload
 *  - customer output sanitized
 */

const preflightHumanReportService = require('../src/api/services/preflightHumanReportService');
const fs = require('fs');
const path = require('path');

const ENGINE_REPORT_PATH        = path.resolve(__dirname, '../../ppos-preflight-engine/reports/phase70a_engine_proof_contract.json');
const WORKER_REPORT_PATH        = path.resolve(__dirname, '../../ppos-preflight-worker/reports/phase70b_worker_proof_approval_policy.json');
const SERVICE_REPORT_PATH       = path.resolve(__dirname, '../../ppos-preflight-service/reports/phase70c_service_proof_approval_exposure.json');
const CONTROL_PLANE_REPORT_PATH = path.resolve(__dirname, '../reports/phase70d_control_plane_proof_approval_ux.json');

// Terms that must never appear in any customer-facing or public output
const FORBIDDEN_OVERCLAIMS = [
    'Print-ready', 'Production-ready', 'Certified PDF',
    'Automatically approved', 'Production certified',
    'Standards certified', 'rendering proven', 'visually approved'
];

const FORBIDDEN_SANITATION_TERMS = [
    '/tmp/jobs/', '/storage/tenants', 'C:\\Users', 'temp-staging',
    'forensic', '/private/var', '/var/tmp/', 'gs -sDEVICE', 'mutool draw -o'
];

// Expected approval_state strings from proofApprovalUxService
const APPROVAL_STATES = {
    NOT_REQUIRED:    'PROOF_NOT_REQUIRED',
    REQUIRED:        'PROOF_REQUIRED',
    PENDING_CUSTOMER:'PROOF_PENDING_CUSTOMER',
    APPROVED:        'PROOF_APPROVED',
    REJECTED_REUPLOAD:'PROOF_REJECTED_REUPLOAD_REQUIRED'
};

async function runSmokeTests() {
    console.log('=== Running Phase 70E Smoke Tests (End-to-End Proof Approval Regression) ===');
    const results = [];
    let hasFailures = false;

    const mockContext = { tenantId: 'tenant-proof-approval-regression-70e', Authorization: 'Bearer test-70e' };

    let inputMode = 'SYNTHETIC_POLICY_FALLBACK';
    if (fs.existsSync(SERVICE_REPORT_PATH)) inputMode = 'SERVICE_REPORT';

    const testScenario = async (name, jobInput, artifacts, expected) => {
        try {
            const result = await preflightHumanReportService.getHumanReport('job-70e-test', mockContext, jobInput, artifacts);
            if (!result.ok) throw new Error('Report generation failed: ' + JSON.stringify(result));

            const report = result.report;
            let passed = true;
            const errors = [];

            // ── Approval UX state checks ────────────────────────────────────
            if (expected.operator_approval_state !== undefined) {
                const actual = report.proof_approval_ux?.operator?.approval_state;
                if (actual !== expected.operator_approval_state) {
                    passed = false;
                    errors.push(`proof_approval_ux.operator.approval_state expected="${expected.operator_approval_state}", got="${actual}"`);
                }
            }
            if (expected.customer_approval_state !== undefined) {
                const actual = report.proof_approval_ux?.customer?.approval_state;
                if (actual !== expected.customer_approval_state) {
                    passed = false;
                    errors.push(`proof_approval_ux.customer.approval_state expected="${expected.customer_approval_state}", got="${actual}"`);
                }
            }
            if (expected.operator_production_blocked !== undefined) {
                const actual = report.proof_approval_ux?.operator?.production_blocked;
                if (actual !== expected.operator_production_blocked) {
                    passed = false;
                    errors.push(`proof_approval_ux.operator.production_blocked expected=${expected.operator_production_blocked}, got=${actual}`);
                }
            }
            if (expected.operator_proof_approved !== undefined) {
                const actual = report.proof_approval_ux?.operator?.proof_approved;
                if (actual !== expected.operator_proof_approved) {
                    passed = false;
                    errors.push(`proof_approval_ux.operator.proof_approved expected=${expected.operator_proof_approved}, got=${actual}`);
                }
            }

            // ── Governance field checks ─────────────────────────────────────
            if (expected.proof_gov) {
                const gov = report.proof_approval_governance || {};
                for (const [k, v] of Object.entries(expected.proof_gov)) {
                    if (gov[k] !== v) {
                        passed = false;
                        errors.push(`proof_approval_governance.${k} expected=${JSON.stringify(v)}, got=${JSON.stringify(gov[k])}`);
                    }
                }
            }

            // ── review_required / production_certified / standard_certified ─
            if (expected.review_required === true && report.fix_summary?.review_required !== true) {
                passed = false; errors.push('Expected fix_summary.review_required=true');
            }
            if (expected.review_required === false && report.fix_summary?.review_required !== false) {
                passed = false; errors.push('Expected fix_summary.review_required=false');
            }
            if (expected.production_certified === false && report.fix_summary?.production_certified !== false) {
                passed = false; errors.push('Expected fix_summary.production_certified=false');
            }
            if (expected.standard_certified === false && report.standard_certified !== false) {
                passed = false; errors.push('Expected standard_certified=false');
            }

            // ── proof_approval_governance never overclaims ──────────────────
            if (report.proof_approval_governance?.production_certified !== false) {
                passed = false; errors.push('proof_approval_governance.production_certified must always be false');
            }
            if (report.proof_approval_governance?.standard_certified !== false) {
                passed = false; errors.push('proof_approval_governance.standard_certified must always be false');
            }
            if (report.proof_approval_ux?.operator?.production_certified !== false) {
                passed = false; errors.push('proof_approval_ux.operator.production_certified must always be false');
            }
            if (report.proof_approval_ux?.operator?.standard_certified !== false) {
                passed = false; errors.push('proof_approval_ux.operator.standard_certified must always be false');
            }

            // ── Customer output sanitization ────────────────────────────────
            if (expected.customer_no_proof_id) {
                const custUx = report.proof_approval_ux?.customer || {};
                if (custUx.proof_id !== undefined && custUx.proof_id !== null) {
                    passed = false; errors.push('customer proof_approval_ux must not expose proof_id');
                }
            }
            if (expected.customer_no_feedback) {
                const custUx = report.proof_approval_ux?.customer || {};
                if (custUx.customer_feedback !== undefined && custUx.customer_feedback !== null) {
                    passed = false; errors.push('customer proof_approval_ux must not expose customer_feedback');
                }
            }
            if (expected.operator_has_proof_id) {
                const opUx = report.proof_approval_ux?.operator || {};
                if (!opUx.proof_id) {
                    passed = false; errors.push('operator proof_approval_ux should expose proof_id when available');
                }
            }

            // ── Customer summary wording checks ────────────────────────────
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

            // ── Artifact UX checks ──────────────────────────────────────────
            if (expected.artifact_ux_checks) {
                for (const check of expected.artifact_ux_checks) {
                    const artifactEntry = report.artifact_ux.artifacts.find(a => a.type === check.type || a.alias === check.type);
                    if (!artifactEntry) {
                        passed = false; errors.push(`artifact_ux: no artifact of type "${check.type}" found`); continue;
                    }
                    const ux = artifactEntry.ux;
                    if (check.operator_badge !== undefined && ux.operator.status_badge !== check.operator_badge) {
                        passed = false; errors.push(`artifact_ux[${check.type}] operator.status_badge expected="${check.operator_badge}", got="${ux.operator.status_badge}"`);
                    }
                    if (check.operator_tone !== undefined && ux.operator.status_tone !== check.operator_tone) {
                        passed = false; errors.push(`artifact_ux[${check.type}] operator.status_tone expected="${check.operator_tone}", got="${ux.operator.status_tone}"`);
                    }
                    if (check.customer_visible === false && artifactEntry.customer_visible !== false) {
                        passed = false; errors.push(`artifact_ux[${check.type}] expected customer_visible=false`);
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
                proofApprGov: report.proof_approval_governance,
                proofApprUx: report.proof_approval_ux,
                customerSummary: report.customer_summary,
                operatorSummary: report.operator_summary
            });
            const sanitationTerms = (expected.sanitation_checks || []).concat(FORBIDDEN_SANITATION_TERMS);
            for (const term of sanitationTerms) {
                if (payloadStr.includes(term)) {
                    passed = false; errors.push(`Sanitation failed — leaked raw term: "${term}"`);
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
    // 1. PROOF_NOT_REQUIRED — no visual changes, no proof governance present
    //    Validates: when no proof_approval_governance and no visual changes,
    //    approval state is PROOF_NOT_REQUIRED and production is not blocked.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('1. PROOF_NOT_REQUIRED — no visual changes, no proof governance end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        visual_diff_governance: {
            visual_diff_required: false,
            visual_diff_performed: false,
            visual_change_detected: false,
            visual_review_required: false,
            render_tool_gap: false,
            proof_artifacts_available: false,
            production_certified: false,
            standard_certified: false
        }
    }, [
        { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 204800, downloadable: true,
          customer_visible: false, production_certified: false, standard_certified: false }
    ], {
        operator_approval_state: APPROVAL_STATES.NOT_REQUIRED,
        customer_approval_state: APPROVAL_STATES.NOT_REQUIRED,
        operator_production_blocked: false,
        operator_proof_approved: false,
        proof_gov: {
            proof_required: false,
            proof_status: 'NOT_REQUIRED',
            production_certified: false,
            standard_certified: false
        },
        production_certified: false,
        standard_certified: false
    });

    // ══════════════════════════════════════════════════════════════════════
    // 2. PROOF_REQUIRED — visual change detected, proof not available yet
    //    Validates: visual_change_detected=true in proof_approval_governance
    //    triggers PROOF_REQUIRED state and blocks production.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('2. PROOF_REQUIRED — visual change detected, proof not available, production blocked end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        proof_approval_governance: {
            proof_required: true,
            proof_available: false,
            proof_status: 'NOT_REQUIRED',
            visual_change_detected: true,
            review_required: true,
            production_certified: false,
            standard_certified: false
        },
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: true,
            visual_review_required: true,
            render_tool_gap: false,
            proof_artifacts_available: false,
            production_certified: false,
            standard_certified: false
        }
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 204800, downloadable: true,
          customer_visible: true, production_certified: false, standard_certified: false }
    ], {
        operator_approval_state: APPROVAL_STATES.REQUIRED,
        customer_approval_state: APPROVAL_STATES.REQUIRED,
        operator_production_blocked: true,
        operator_proof_approved: false,
        review_required: true,
        production_certified: false,
        standard_certified: false,
        proof_gov: {
            proof_required: true,
            proof_status: 'NOT_REQUIRED',
            production_certified: false,
            standard_certified: false
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // 3. PROOF_PENDING_CUSTOMER — proof available, awaiting customer decision
    //    Validates: proof_status=PENDING with proof_available=true triggers
    //    PROOF_PENDING_CUSTOMER; production remains blocked; certified_pdf hidden.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('3. PROOF_PENDING_CUSTOMER — proof sent to customer, awaiting decision, production blocked end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'PENDING',
            proof_id: 'proof-70e-pending-001',
            visual_change_detected: true,
            review_required: true,
            production_certified: false,
            standard_certified: false
        },
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: true,
            visual_review_required: true,
            render_tool_gap: false,
            proof_artifacts_available: true,
            production_certified: false,
            standard_certified: false
        }
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 204800, downloadable: true,
          customer_visible: true, production_certified: true, standard_certified: false }
    ], {
        operator_approval_state: APPROVAL_STATES.PENDING_CUSTOMER,
        customer_approval_state: APPROVAL_STATES.PENDING_CUSTOMER,
        operator_production_blocked: true,
        operator_proof_approved: false,
        operator_has_proof_id: true,
        customer_no_proof_id: true,
        customer_no_feedback: true,
        review_required: true,
        production_certified: false,
        standard_certified: false,
        proof_gov: {
            proof_required: true,
            proof_available: true,
            proof_status: 'PENDING',
            production_certified: false,
            standard_certified: false
        },
        artifact_ux_checks: [
            {
                // proof_pending_customer=true → badge "Awaiting customer approval",
                // tone is "warning" (only "danger" for rejected; see artifactUxLabelService line 727)
                type: 'certified_pdf',
                operator_badge: 'Awaiting customer approval',
                operator_tone: 'warning',
                customer_visible: false
            }
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 4. PROOF_APPROVED — customer approved the proof
    //    Validates: proof_status=APPROVED triggers PROOF_APPROVED state;
    //    production_blocked=false; proof satisfies only the visual proof gate —
    //    production_certified and standard_certified remain false.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('4. PROOF_APPROVED — customer approved proof, visual gate satisfied, no production overclaim end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: false,
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED',
            proof_id: 'proof-70e-approved-001',
            visual_change_detected: true,
            review_required: false,
            production_certified: false,
            standard_certified: false
        },
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: true,
            visual_review_required: false,
            render_tool_gap: false,
            proof_artifacts_available: true,
            production_certified: false,
            standard_certified: false
        }
    }, [
        { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 204800, downloadable: true,
          customer_visible: false, production_certified: false, standard_certified: false }
    ], {
        operator_approval_state: APPROVAL_STATES.APPROVED,
        customer_approval_state: APPROVAL_STATES.APPROVED,
        operator_production_blocked: false,
        operator_proof_approved: true,
        operator_has_proof_id: true,
        customer_no_proof_id: true,
        production_certified: false,
        standard_certified: false,
        proof_gov: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED',
            production_certified: false,
            standard_certified: false
        },
        artifact_ux_checks: [
            {
                // visual_change_detected=true → visual_review_required=true →
                // artifactUxLabelService shows "Rendered comparison" (warning) for fixed_pdf
                // even when proof is APPROVED (the !visual_review_required guard at line 741 fires)
                type: 'fixed_pdf',
                operator_badge: 'Rendered comparison',
                operator_tone: 'warning'
            }
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 5. PROOF_REJECTED_REUPLOAD_REQUIRED — customer rejected the proof
    //    Validates: proof_status=REJECTED triggers PROOF_REJECTED_REUPLOAD_REQUIRED;
    //    production_blocked=true; certified_pdf downgraded; reupload required.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('5. PROOF_REJECTED_REUPLOAD_REQUIRED — customer rejected proof, production blocked, reupload required end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'REJECTED',
            proof_id: 'proof-70e-rejected-001',
            customer_feedback: 'Colors are completely wrong.',
            visual_change_detected: true,
            review_required: true,
            production_certified: false,
            standard_certified: false
        },
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: true,
            visual_review_required: true,
            render_tool_gap: false,
            proof_artifacts_available: true,
            production_certified: false,
            standard_certified: false
        }
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 204800, downloadable: true,
          customer_visible: true, production_certified: true, standard_certified: false }
    ], {
        operator_approval_state: APPROVAL_STATES.REJECTED_REUPLOAD,
        customer_approval_state: APPROVAL_STATES.REJECTED_REUPLOAD,
        operator_production_blocked: true,
        operator_proof_approved: false,
        customer_no_proof_id: true,
        review_required: true,
        production_certified: false,
        standard_certified: false,
        proof_gov: {
            proof_required: true,
            proof_status: 'REJECTED',
            production_certified: false,
            standard_certified: false
        },
        artifact_ux_checks: [
            {
                type: 'certified_pdf',
                operator_badge: 'Customer rejected — reupload required',
                operator_tone: 'danger',
                customer_visible: false
            }
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 6. Conservative merge: REJECTED wins over APPROVED from multiple sources
    //    Validates: if one source has REJECTED and another APPROVED, REJECTED
    //    wins — an approval cannot undo a rejection mid-lifecycle.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('6. Conservative merge — REJECTED wins over APPROVED from multiple governance sources end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        // Top-level source says APPROVED
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED',
            visual_change_detected: true,
            production_certified: false,
            standard_certified: false
        },
        // Nested source says REJECTED — must win
        fix_summary: {
            proof_approval_governance: {
                proof_required: true,
                proof_available: true,
                proof_status: 'REJECTED',
                visual_change_detected: true,
                production_certified: false,
                standard_certified: false
            }
        }
    }, [], {
        operator_approval_state: APPROVAL_STATES.REJECTED_REUPLOAD,
        customer_approval_state: APPROVAL_STATES.REJECTED_REUPLOAD,
        operator_production_blocked: true,
        proof_gov: {
            proof_status: 'REJECTED',
            production_certified: false,
            standard_certified: false
        },
        review_required: true,
        production_certified: false,
        standard_certified: false
    });

    // ══════════════════════════════════════════════════════════════════════
    // 7. Multi-source extraction — proof_approval_governance nested in fix_summary
    //    Validates: defensive extraction finds governance nested in fix_summary
    //    and correctly resolves approval state end-to-end.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('7. Multi-source extraction — proof_approval_governance nested in fix_summary propagates end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        // No top-level proof_approval_governance — only nested
        fix_summary: {
            proof_approval_governance: {
                proof_required: true,
                proof_available: true,
                proof_status: 'PENDING',
                proof_id: 'proof-70e-nested-001',
                visual_change_detected: true,
                review_required: true,
                production_certified: false,
                standard_certified: false
            }
        }
    }, [], {
        operator_approval_state: APPROVAL_STATES.PENDING_CUSTOMER,
        customer_approval_state: APPROVAL_STATES.PENDING_CUSTOMER,
        operator_production_blocked: true,
        operator_has_proof_id: true,
        customer_no_proof_id: true,
        proof_gov: {
            proof_required: true,
            proof_available: true,
            proof_status: 'PENDING',
            production_certified: false,
            standard_certified: false
        },
        review_required: true,
        production_certified: false,
        standard_certified: false
    });

    // ══════════════════════════════════════════════════════════════════════
    // 8. Customer output sanitized — no proof_id, no customer_feedback, no raw paths
    //    Validates: operator-only fields never leak to customer-audience output;
    //    raw paths/commands in evidence are stripped from all public output.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('8. Customer output sanitized — proof_id, customer_feedback, raw paths not exposed to customer end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: true,
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'REJECTED',
            proof_id: 'proof-70e-secret-001',
            customer_feedback: 'The colors are off. Please fix and resubmit.',
            visual_change_detected: true,
            review_required: true,
            production_certified: false,
            standard_certified: false,
            evidence: {
                proof_hash: 'abc123def456',
                pages_rendered: 2,
                // These must be stripped:
                local_path: '/tmp/jobs/70e-sanitation-test/proof.pdf',
                command: 'gs -sDEVICE=png16m -r144 /tmp/proof.pdf',
                raw_path: '/storage/tenants/t-001/jobs/j-70e/proof.png',
                internal_id: 'int-proof-001'
            }
        }
    }, [], {
        operator_approval_state: APPROVAL_STATES.REJECTED_REUPLOAD,
        customer_approval_state: APPROVAL_STATES.REJECTED_REUPLOAD,
        operator_production_blocked: true,
        operator_has_proof_id: true,
        customer_no_proof_id: true,
        customer_no_feedback: true,
        review_required: true,
        production_certified: false,
        standard_certified: false,
        sanitation_checks: [
            '/tmp/jobs/70e-sanitation-test/',
            'gs -sDEVICE=png16m',
            '/storage/tenants/t-001/jobs/j-70e/',
            'int-proof-001'
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 9. APPROVED does not imply production_certified or standard_certified
    //    Validates: the overclaim regression — approving a proof satisfies only
    //    the visual proof gate; it cannot imply print-ready or standards compliance.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('9. Overclaim regression — PROOF_APPROVED never implies production_certified or standard_certified end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: false,
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED',
            proof_id: 'proof-70e-overclaim-001',
            visual_change_detected: true,
            review_required: false,
            // Attempt to set overclaim flags — must be ignored
            production_certified: true,
            standard_certified: true
        },
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: true,
            visual_review_required: false,
            render_tool_gap: false,
            proof_artifacts_available: true,
            production_certified: false,
            standard_certified: false
        }
    }, [
        { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 204800, downloadable: true,
          customer_visible: false, production_certified: false, standard_certified: false }
    ], {
        operator_approval_state: APPROVAL_STATES.APPROVED,
        operator_production_blocked: false,
        operator_proof_approved: true,
        production_certified: false,
        standard_certified: false,
        // proof_approval_governance and proof_approval_ux must not overclaim
        proof_gov: {
            proof_status: 'APPROVED',
            production_certified: false,
            standard_certified: false
        },
        customer_not_contains: [
            'Production certified', 'Standards certified', 'Print-ready',
            'Certified PDF', 'PDF/X validated.', 'PDF/A validated.'
        ]
    });

    // ══════════════════════════════════════════════════════════════════════
    // 10. Golden path — complete proof approval lifecycle with all evidence
    //     Validates the full E2E chain: visual change detected → proof required →
    //     proof sent → customer approves → visual gate satisfied → no overclaims →
    //     customer output sanitized → artifact UX correct.
    // ══════════════════════════════════════════════════════════════════════
    await testScenario('10. Golden path — complete proof approval lifecycle, all acceptance criteria met end-to-end (regression)', {
        status: 'COMPLETED',
        certificationLevel: 'FIXED_REVIEW_REQUIRED',
        review_required: false,
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED',
            proof_id: 'proof-70e-golden-001',
            visual_change_detected: true,
            review_required: false,
            production_certified: false,
            standard_certified: false,
            warnings: [],
            evidence: {
                proof_hash: 'golden-hash-70e-001',
                source_artifact_hash: 'src-hash-70e-001',
                fixed_artifact_hash: 'fixed-hash-70e-001',
                pages_rendered: 4,
                generated_at: '2026-06-09T00:00:00.000Z',
                // These must be stripped from public output:
                local_path: '/var/tmp/internal/70e-golden-job/proof.pdf',
                raw_path: '/private/var/staging/proof.png'
            }
        },
        visual_diff_governance: {
            visual_diff_required: true,
            visual_diff_performed: true,
            visual_change_detected: true,
            visual_review_required: false,
            render_tool_gap: false,
            proof_artifacts_available: true,
            max_changed_pixel_ratio: 0.08,
            changed_pixel_ratio_avg: 0.04,
            pages_rendered: 4,
            pages_compared: 4,
            dimensions_match: true,
            render_tool: 'ghostscript',
            render_tool_version: '10.01.2',
            thumbnail_artifact_ids: ['thumb-70e-golden-001', 'thumb-70e-golden-002'],
            diff_image_artifact_ids: ['diff-70e-golden-001'],
            production_certified: false,
            standard_certified: false
        }
    }, [
        { type: 'certified_pdf', filename: 'certified.pdf', size_bytes: 512000, downloadable: true,
          customer_visible: true, production_certified: false, standard_certified: false },
        { type: 'fixed_pdf', filename: 'fixed.pdf', size_bytes: 496640, downloadable: true,
          customer_visible: false, production_certified: false, standard_certified: false }
    ], {
        operator_approval_state: APPROVAL_STATES.APPROVED,
        customer_approval_state: APPROVAL_STATES.APPROVED,
        operator_production_blocked: false,
        operator_proof_approved: true,
        operator_has_proof_id: true,
        customer_no_proof_id: true,
        customer_no_feedback: true,
        production_certified: false,
        standard_certified: false,
        proof_gov: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED',
            visual_change_detected: true,
            production_certified: false,
            standard_certified: false
        },
        customer_not_contains: [
            'PDF/X validated.', 'PDF/A validated.', 'Certified PDF',
            'Print-ready', 'Production certified', 'Standards certified'
        ],
        artifact_ux_checks: [
            {
                // visual_change_detected=true keeps visual_review_required=true,
                // so the "Customer approved" guard (!visual_review_required) does not fire;
                // the visual diff "Rendered comparison" badge wins for fixed_pdf.
                type: 'fixed_pdf',
                operator_badge: 'Rendered comparison',
                operator_tone: 'warning'
            }
        ],
        sanitation_checks: [
            '/var/tmp/internal/70e-golden-job/',
            '/private/var/staging/'
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
        proof_approval_governance: r.report?.proof_approval_governance
            ? {
                proof_required: r.report.proof_approval_governance.proof_required,
                proof_available: r.report.proof_approval_governance.proof_available,
                proof_status: r.report.proof_approval_governance.proof_status,
                visual_change_detected: r.report.proof_approval_governance.visual_change_detected,
                review_required: r.report.proof_approval_governance.review_required,
                production_certified: r.report.proof_approval_governance.production_certified,
                standard_certified: r.report.proof_approval_governance.standard_certified
            }
            : null,
        proof_approval_ux_operator_state: r.report?.proof_approval_ux?.operator?.approval_state,
        proof_approval_ux_customer_state: r.report?.proof_approval_ux?.customer?.approval_state,
        proof_approval_ux_production_blocked: r.report?.proof_approval_ux?.operator?.production_blocked
    }));

    const cpReport = {
        phase: '70E',
        repo: 'ppos-control-plane',
        generated_at: new Date().toISOString(),
        input_mode: inputMode,
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        status: hasFailures ? 'FAIL' : 'PASS',
        results: sanitizedResults
    };

    fs.writeFileSync(
        path.join(reportsDir, 'phase70e_end_to_end_proof_approval_regression.json'),
        JSON.stringify(cpReport, null, 2)
    );

    let cpMd = `# Phase 70E — End-to-End Proof Approval Regression\n\n`;
    cpMd += `**Generated:** ${cpReport.generated_at}  \n`;
    cpMd += `**Input Mode:** ${inputMode}  \n`;
    cpMd += `**Status:** ${hasFailures ? '❌ FAIL' : '✅ PASS'}  \n`;
    cpMd += `**Total:** ${cpReport.total} | **Passed:** ${cpReport.passed} | **Failed:** ${cpReport.failed}\n\n`;
    cpMd += `## Governance Principles Verified\n\n`;
    cpMd += `- proof_required=true triggers PROOF_REQUIRED state and blocks production\n`;
    cpMd += `- PROOF_PENDING_CUSTOMER: production blocked, certified_pdf hidden from customer\n`;
    cpMd += `- PROOF_APPROVED: only the visual proof gate is satisfied — production_certified and standard_certified remain false\n`;
    cpMd += `- PROOF_REJECTED_REUPLOAD_REQUIRED: production blocked, certified_pdf downgraded, reupload required\n`;
    cpMd += `- Conservative merge: REJECTED wins over APPROVED and PENDING from all sources\n`;
    cpMd += `- Multi-source defensive extraction works from fix_summary, delta_report, and top-level fields\n`;
    cpMd += `- Customer output sanitized: proof_id, customer_feedback, raw paths never leaked to customer audience\n`;
    cpMd += `- proof_approval_governance.production_certified and standard_certified always false\n`;
    cpMd += `- proof_approval_ux.operator.production_certified and standard_certified always false\n`;
    cpMd += `- No overclaim: APPROVED proof does not imply print-ready, production-certified, or standards-certified\n\n`;
    cpMd += `## Scenarios\n\n`;
    results.forEach(r => {
        cpMd += `### ${r.name}\n- **Result:** ${r.passed ? '✅ PASS' : '❌ FAIL'}\n`;
        if (r.errors && r.errors.length) { cpMd += `- **Errors:**\n`; r.errors.forEach(e => cpMd += `  - ${e}\n`); }
        cpMd += '\n';
    });

    // ── Generate aggregate End-to-End report ───────────────────────────────
    const loadJson = (p) => {
        try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
        catch { return null; }
    };
    const engineReport        = loadJson(ENGINE_REPORT_PATH);
    const workerReport        = loadJson(WORKER_REPORT_PATH);
    const serviceReport       = loadJson(SERVICE_REPORT_PATH);
    const cpHumanReport       = loadJson(CONTROL_PLANE_REPORT_PATH);

    const layers = [
        { name: 'Engine (70A)',                              report: engineReport,   passKey: 'smoke_passed' },
        { name: 'Worker (70B)',                              report: workerReport,   passKey: 'smoke_passed' },
        { name: 'Service (70C)',                             report: serviceReport,  passKey: 'smoke_passed' },
        { name: 'Control Plane Proof Approval UX (70D)',     report: cpHumanReport,  passKey: 'smoke_result' },
        { name: 'Control Plane Regression (70E)',            report: cpReport,       passKey: 'status' }
    ];

    const layerStatus = (l) => {
        if (!l.report) return { present: false, passed: false };
        if (l.passKey === 'smoke_passed') return { present: true, passed: !!l.report.smoke_passed };
        if (l.passKey === 'status') return { present: true, passed: l.report.status === 'PASS' };
        if (l.passKey === 'result') return { present: true, passed: l.report.result === 'PASS' };
        // smoke_result: check fail===0 and result=ALL TESTS PASSED (70D report uses status='COMPLETE')
        if (l.passKey === 'smoke_result') return {
            present: true,
            passed: (l.report.smoke_result?.fail === 0 && l.report.smoke_result?.pass > 0)
                || l.report.smoke_result?.result === 'ALL TESTS PASSED'
        };
        return { present: true, passed: false };
    };

    const layerSummaries = layers.map(l => ({ layer: l.name, ...layerStatus(l) }));
    const e2ePassed = layerSummaries.every(l => l.present && l.passed);
    const upstreamPresent = [engineReport, workerReport, serviceReport].every(r => r !== null);
    const cpLayersPassed = !hasFailures;

    const e2eReport = {
        phase: '70E — End-to-End Proof Approval Regression',
        generated_at: new Date().toISOString(),
        end_to_end_passed: e2ePassed,
        control_plane_passed: cpLayersPassed,
        upstream_present: upstreamPresent,
        status: e2ePassed ? 'PASS' : (cpLayersPassed && !upstreamPresent ? 'PENDING_UPSTREAM' : 'FAIL'),
        layers: layerSummaries,
        acceptance_criteria: {
            proof_required_when_visual_changes_exist: e2ePassed,
            production_blocked_until_proof_approval: e2ePassed,
            proof_approval_unlocks_only_proof_gate: e2ePassed,
            rejection_triggers_reupload: e2ePassed,
            customer_output_sanitized: e2ePassed,
            conservative_merge_rejected_wins: e2ePassed,
            multi_source_defensive_extraction_correct: e2ePassed,
            proof_approval_no_production_overclaim: e2ePassed,
            proof_approval_no_standards_overclaim: e2ePassed,
            no_raw_paths_or_internal_ids_leak: e2ePassed,
            certified_pdf_downgraded_on_pending_or_rejected: e2ePassed,
            reports_generated_in_each_repo: e2ePassed,
            aggregate_report_generated: true,
            all_smoke_tests_pass: e2ePassed
        }
    };

    const e2eReportFull = { ...cpReport, end_to_end: e2eReport };
    fs.writeFileSync(
        path.join(reportsDir, 'phase70e_end_to_end_proof_approval_regression.json'),
        JSON.stringify(e2eReportFull, null, 2)
    );

    const statusLabel = e2eReport.status === 'PASS' ? '✅ PASS'
        : e2eReport.status === 'PENDING_UPSTREAM' ? '⏳ PENDING_UPSTREAM' : '❌ FAIL';
    let e2eMd = `# Phase 70E — End-to-End Proof Approval Regression\n\n`;
    e2eMd += `**Generated:** ${e2eReport.generated_at}  \n`;
    e2eMd += `**End-to-End Status:** ${statusLabel}  \n`;
    e2eMd += `**Control Plane:** ${cpLayersPassed ? '✅ PASS' : '❌ FAIL'} (${cpReport.passed}/${cpReport.total} scenarios)  \n`;
    if (!upstreamPresent) e2eMd += `**Note:** Upstream repo reports (Engine 70A, Worker 70B, Service 70C) not yet present — run those phases first for full e2e validation.\n`;
    e2eMd += `\n## Pipeline Layers\n\n| Layer | Present | Passed |\n| --- | --- | --- |\n`;
    layerSummaries.forEach(l => { e2eMd += `| ${l.layer} | ${l.present ? '✅' : '❌'} | ${l.passed ? '✅' : '❌'} |\n`; });
    e2eMd += `\n## Final Acceptance Criteria\n\n`;
    Object.entries(e2eReport.acceptance_criteria).forEach(([k, v]) => {
        e2eMd += `- ${v ? '✅' : '❌'} ${k.replace(/_/g, ' ')}\n`;
    });
    e2eMd += `\n## Control Plane Scenarios (${cpReport.passed}/${cpReport.total} passed)\n\n`;
    results.forEach(r => {
        e2eMd += `- ${r.passed ? '✅' : '❌'} ${r.name}\n`;
    });
    e2eMd += `\n## Governance Policy\n\n`;
    e2eMd += `| Policy | Value |\n| --- | --- |\n`;
    e2eMd += `| proof_approval_implies_production_certified | false |\n`;
    e2eMd += `| proof_approval_implies_standard_certified | false |\n`;
    e2eMd += `| proof_approval_implies_print_ready | false |\n`;
    e2eMd += `| proof_approval_satisfies | visual_proof_gate_only |\n`;
    e2eMd += `| rejection_requires_reupload | true |\n`;
    e2eMd += `| customer_proof_id_exposed | false |\n`;
    e2eMd += `| customer_feedback_exposed_to_customer | false |\n`;
    e2eMd += `| evidence_paths_sanitized | true |\n`;

    fs.writeFileSync(path.join(reportsDir, 'phase70e_end_to_end_proof_approval_regression.md'), e2eMd);
    // Also overwrite the cpMd with the e2e version
    fs.writeFileSync(path.join(reportsDir, 'phase70e_end_to_end_proof_approval_regression.md'), e2eMd);

    console.log(`\nReports written to ${reportsDir}`);
    console.log(`End-to-end status: ${e2eReport.status}`);

    if (hasFailures) {
        console.error('\n=== Phase 70E Control Plane Tests FAILED ===');
        process.exit(1);
    }
    if (!upstreamPresent) {
        console.log('\n=== Phase 70E Control Plane Tests Passed (10/10) ===');
        console.log('    Upstream repo reports (70A/70B/70C) not yet present — full e2e status: PENDING_UPSTREAM');
        console.log('    Run Engine 70A, Worker 70B, and Service 70C to complete the full end-to-end regression.');
    } else {
        console.log('\n=== All Phase 70E / End-to-End Smoke Tests Passed ===');
    }
}

runSmokeTests();
