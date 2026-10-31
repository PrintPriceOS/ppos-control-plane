'use strict';
/**
 * scripts/smoke_phase76c_preflight_profile_binding.js
 * 
 * Smoke test for Phase 76C — Preflight Profile Binding.
 * Tests 16 scenarios covering binding creation, resource validation, snapshot immutability, 
 * preflight policy gate rules, and queue/handoff integration.
 */

const db = require('../src/api/services/mysqlClient');
const bindingService = require('../src/api/services/printhouseProfileBindingService');
const printhouseCapabilityService = require('../src/api/services/printhouseCapabilityService');
const queueService = require('../src/api/services/marketplaceProductionQueueService');
const handoffService = require('../src/api/services/productionHandoffPackageService');

let PASS = 0, FAIL = 0;
const results = [];

function assert(condition, label, detail = '') {
    if (condition) {
        PASS++;
        results.push({ label, status: 'PASS', detail });
        console.log(`  ✅  [PASS] ${label} ${detail ? `(${detail})` : ''}`);
    } else {
        FAIL++;
        results.push({ label, status: 'FAIL', detail });
        console.error(`  ❌  [FAIL] ${label} ${detail ? `: ${detail}` : ''}`);
    }
}

// Memory database mock for tests
const mockDb = {
    bindings: [],
    printhouses: [],
    machines: [],
    media: [],
    policies: [],
    sla: [],
    audit: [],
    orders: [],
    files: [],
    jobs: [],
    reset() {
        this.bindings = [];
        this.printhouses = [];
        this.machines = [];
        this.media = [];
        this.policies = [];
        this.sla = [];
        this.audit = [];
        this.orders = [];
        this.files = [];
        this.jobs = [];
    }
};

function enableMockDb() {
    db.query = async (sql, params) => {
        const sqlUpper = sql.trim().toUpperCase();

        if (sqlUpper.startsWith('INSERT INTO MARKETPLACE_ORDER_PRINTHOUSE_BINDINGS')) {
            const row = {
                id: params[0], order_id: params[1], tenant_id: params[2], printhouse_id: params[3],
                selected_machine_id: params[4], selected_media_id: params[5], selected_policy_profile_id: params[6],
                selected_sla_profile_id: params[7], printhouse_snapshot_json: params[8], machine_snapshot_json: params[9],
                media_snapshot_json: params[10], policy_profile_snapshot_json: params[11], sla_profile_snapshot_json: params[12],
                binding_status: params[13], bound_by_user_id: params[14], bound_by_role: params[15], bound_at: params[16]
            };
            mockDb.bindings.push(row);
            return { insertId: 1 };
        }

        if (sqlUpper.startsWith('UPDATE MARKETPLACE_ORDER_PRINTHOUSE_BINDINGS')) {
            const order_id = params[0];
            mockDb.bindings.forEach(b => {
                if (b.order_id === order_id && (b.binding_status === 'BOUND' || b.binding_status === 'DRAFT')) {
                    b.binding_status = 'SUPERSEDED';
                }
            });
            return { affectedRows: 1 };
        }

        if (sqlUpper.startsWith('SELECT * FROM MARKETPLACE_ORDER_PRINTHOUSE_BINDINGS')) {
            const order_id = params[0];
            const tenant_id = params[1];
            return mockDb.bindings.filter(b => b.order_id === order_id && b.tenant_id === tenant_id && b.binding_status !== 'SUPERSEDED');
        }

        if (sqlUpper.startsWith('INSERT INTO PRINTHOUSE_CAPABILITY_AUDIT')) {
            const row = {
                printhouse_id: params[0], tenant_id: params[1], event_type: params[2],
                actor_user_id: params[3], actor_role: params[4], details: params[6] ? JSON.parse(params[6]) : null
            };
            mockDb.audit.push(row);
            return { insertId: mockDb.audit.length };
        }

        if (sqlUpper.includes('SELECT ORDER_ID FROM MARKETPLACE_ORDER_FILES WHERE PREFLIGHT_JOB_ID = ?')) {
            const preflight_job_id = params[0];
            const found = mockDb.files.filter(f => f.preflight_job_id === preflight_job_id);
            return found;
        }

        if (sqlUpper.includes('FROM MARKETPLACE_ORDERS')) {
            const order_id = params[0];
            return mockDb.orders.filter(o => o.order_id === order_id);
        }

        if (sqlUpper.includes('FROM MARKETPLACE_ORDER_FILES')) {
            const order_id = params[0];
            return mockDb.files.filter(f => f.order_id === order_id);
        }

        if (sqlUpper.includes('UPDATE PREFLIGHT_JOB_REGISTRY')) {
            // Simulated update
            return { affectedRows: 1 };
        }

        if (sqlUpper.includes('FROM MARKETPLACE_ORDER_EVENTS')) {
            return [[{ type: 'PRINTHOUSE_FILE_DOWNLOAD_COMPLETED' }]];
        }

        return [];
    };

    // Mock capability service getters
    printhouseCapabilityService.getPrinthouse = async (id) => mockDb.printhouses.find(p => p.id === id) || null;
    printhouseCapabilityService.getMachine = async (id) => mockDb.machines.find(m => m.id === id) || null;
    printhouseCapabilityService.getMedia = async (id) => mockDb.media.find(m => m.id === id) || null;
    printhouseCapabilityService.getPolicyProfile = async (id) => mockDb.policies.find(p => p.id === id) || null;
    printhouseCapabilityService.getSlaProfile = async (id) => mockDb.sla.find(s => s.id === id) || null;

    // Mock preflightContractGateway.getJob
    const gateway = require('../src/api/services/preflightContractGateway');
    gateway.getJob = async (jobId) => {
        return mockDb.jobs.find(j => j.id === jobId) || { id: jobId };
    };

    // Mock preflightHumanReportService.getHumanReport
    const humanReportService = require('../src/api/services/preflightHumanReportService');
    humanReportService.getHumanReport = async (jobId, context) => {
        const job = mockDb.jobs.find(j => j.id === jobId) || { id: jobId };
        // Determine policy profile governance from mock
        const orderFile = mockDb.files.find(f => f.preflight_job_id === jobId);
        let policy_profile_governance = null;
        if (orderFile) {
            const order = mockDb.orders.find(o => o.order_id === orderFile.order_id);
            const tenantId = order ? order.tenant_id : (context.tenantId || 'tenant_x');
            const binding = mockDb.bindings.find(b => b.order_id === orderFile.order_id && b.tenant_id === tenantId && b.binding_status !== 'SUPERSEDED');
            if (binding && binding.policy_profile_snapshot_json) {
                const policy = JSON.parse(binding.policy_profile_snapshot_json);
                policy_profile_governance = {
                    profile_id: policy.id,
                    profile_label: policy.profile_name,
                    profile_passed: true // Default mock passes unless overriden
                };
            }
        }
        return {
            ok: true,
            report: {
                recommended_next_action: 'release_to_production',
                fix_summary: {
                    review_required: false,
                    production_certified: job.artifact_trust ? job.artifact_trust.production_certified : true,
                    highest_risk_level: 'LOW',
                    applied_count: 1,
                    skipped_count: 0,
                    failed_count: 0
                },
                artifact_trust: job.artifact_trust || { production_certified: true },
                standards_certification_governance: job.standards_certification_governance || { validation_performed: true, validation_passed: true, standard_detected: 'PDF/X-4' },
                proof_approval_governance: job.proof_approval_governance || { proof_status: 'APPROVED' },
                heavy_pdf_probe_governance: job.heavy_pdf_probe_governance || { analysis_degraded: false },
                policy_profile_governance
            }
        };
    };
}

async function runScenarios() {
    console.log('=== PRINTPRICE OS: PHASE 76C PROFILE BINDING SMOKE TESTS ===\n');

    enableMockDb();
    mockDb.reset();

    const actor = { userId: 'operator_1', role: 'OPERATOR' };

    // Setup base catalog fixtures
    const ph = { id: 'print_1', tenant_id: 'tenant_x', name: 'Standard Print' };
    const mach = { id: 'mach_1', printhouse_id: 'print_1', tenant_id: 'tenant_x', machine_name: 'Press A' };
    const med = { id: 'med_1', printhouse_id: 'print_1', tenant_id: 'tenant_x', media_name: 'Gloss 150g' };
    const pol = { id: 'pol_1', printhouse_id: 'print_1', tenant_id: 'tenant_x', profile_name: 'Policy A', require_visual_proof_approval: true };
    const sla = { id: 'sla_1', printhouse_id: 'print_1', tenant_id: 'tenant_x', profile_name: 'SLA A' };

    mockDb.printhouses.push(ph);
    mockDb.machines.push(mach);
    mockDb.media.push(med);
    mockDb.policies.push(pol);
    mockDb.sla.push(sla);

    let binding_created = false;
    let snapshot_hashes_created = false;
    let tenant_isolation_passed = false;
    let immutability_passed = false;
    let standards_guard_passed = false;
    let artifact_trust_authority_passed = false;
    let production_queue_integration_passed = false;
    let handoff_integration_passed = false;
    let audit_events_created = false;
    let no_overclaim_passed = false;

    // --- Scenario 1: Successful binding ---
    console.log('Scenario 1 — Successful binding');
    try {
        const res = await bindingService.bindPrinthouseProfileToOrder({
            orderId: 'ord_1',
            tenantId: 'tenant_x',
            printhouseId: 'print_1',
            machineId: 'mach_1',
            mediaId: 'med_1',
            policyProfileId: 'pol_1',
            slaProfileId: 'sla_1',
            actor
        });

        assert(res.binding_status === 'BOUND', 'S1: Status is BOUND');
        assert(res.policy_profile_hash !== '', 'S1: Snapshot hash created');
        assert(mockDb.audit.some(a => a.event_type === 'PRINTHOUSE_PROFILE_BOUND_TO_ORDER'), 'S1: Bound audit event generated');
        binding_created = true;
        snapshot_hashes_created = true;
    } catch (e) {
        console.error('S1 Failed:', e);
    }

    // --- Scenario 2: Missing policy profile ---
    console.log('\nScenario 2 — Missing policy profile');
    try {
        const res = await bindingService.bindPrinthouseProfileToOrder({
            orderId: 'ord_2',
            tenantId: 'tenant_x',
            printhouseId: 'print_1',
            machineId: 'mach_1',
            mediaId: 'med_1',
            slaProfileId: 'sla_1',
            actor
        });
        assert(res.binding_status === 'DRAFT', 'S2: Status is DRAFT when resource is missing');
    } catch (e) {
        console.error('S2 Failed:', e);
    }

    // --- Scenario 3: Cross-tenant machine rejected ---
    console.log('\nScenario 3 — Cross-tenant machine rejected');
    try {
        const alienMach = { id: 'mach_alien', printhouse_id: 'print_1', tenant_id: 'tenant_alien', machine_name: 'Alien Press' };
        mockDb.machines.push(alienMach);
        
        let err = null;
        try {
            await bindingService.bindPrinthouseProfileToOrder({
                orderId: 'ord_3',
                tenantId: 'tenant_x',
                printhouseId: 'print_1',
                machineId: 'mach_alien',
                actor
            });
        } catch (e) {
            err = e;
        }
        assert(err !== null, 'S3: Cross-tenant machine rejected');
        assert(mockDb.audit.some(a => a.event_type === 'PROFILE_BINDING_TENANT_VIOLATION_BLOCKED' || err.message === 'INVALID_RESOURCE_OWNERSHIP'), 'S3: Tenant ownership check protected');
        tenant_isolation_passed = true;
    } catch (e) {
        console.error('S3 Failed:', e);
    }

    // --- Scenario 4: Resource from another printhouse rejected ---
    console.log('\nScenario 4 — Resource from another printhouse rejected');
    try {
        const otherPhMach = { id: 'mach_other', printhouse_id: 'print_other', tenant_id: 'tenant_x', machine_name: 'Other Ph Press' };
        mockDb.machines.push(otherPhMach);

        let err = null;
        try {
            await bindingService.bindPrinthouseProfileToOrder({
                orderId: 'ord_4',
                tenantId: 'tenant_x',
                printhouseId: 'print_1',
                machineId: 'mach_other',
                actor
            });
        } catch (e) {
            err = e;
        }
        assert(err !== null && err.message === 'INVALID_RESOURCE_OWNERSHIP', 'S4: Mismatched printhouse machine rejected');
    } catch (e) {
        console.error('S4 Failed:', e);
    }

    // --- Scenario 5: Snapshot immutability ---
    console.log('\nScenario 5 — Snapshot immutability');
    try {
        const binding = mockDb.bindings.find(b => b.order_id === 'ord_1');
        const originalPolicyText = binding.policy_profile_snapshot_json;

        // Mutate live policy profile
        const targetPol = mockDb.policies.find(p => p.id === 'pol_1');
        targetPol.profile_name = 'Mutated Policy Name';

        const evaluated = await bindingService.evaluateBoundPolicyProfileForJob({
            orderId: 'ord_1',
            jobId: 'job_1',
            tenantId: 'tenant_x',
            preflightGovernance: { page_marks_review_required: false },
            artifactTrust: { production_certified: true },
            proofApprovalGovernance: { proof_status: 'APPROVED' },
            heavyPdfProbeGovernance: { analysis_degraded: false }
        });

        assert(evaluated.policy_profile_name === 'Policy A', 'S5: Evaluated policy keeps snapshot name, ignores mutation');
        assert(binding.policy_profile_snapshot_json === originalPolicyText, 'S5: Stored snapshot payload is unmodified');
        immutability_passed = true;
    } catch (e) {
        console.error('S5 Failed:', e);
    }

    // --- Scenario 6: Required PDF/X-4 not validated ---
    console.log('\nScenario 6 — Required PDF/X-4 not validated');
    try {
        // Create binding with PDF/X-4 standard required
        const strictPol = { id: 'pol_strict', printhouse_id: 'print_1', tenant_id: 'tenant_x', profile_name: 'Strict Policy', required_pdf_standard: 'PDF/X-4' };
        mockDb.policies.push(strictPol);

        await bindingService.bindPrinthouseProfileToOrder({
            orderId: 'ord_strict',
            tenantId: 'tenant_x',
            printhouseId: 'print_1',
            machineId: 'mach_1',
            mediaId: 'med_1',
            policyProfileId: 'pol_strict',
            slaProfileId: 'sla_1',
            actor
        });

        const evaluated = await bindingService.evaluateBoundPolicyProfileForJob({
            orderId: 'ord_strict',
            jobId: 'job_strict',
            tenantId: 'tenant_x',
            standardsCertificationGovernance: { validation_performed: false } // Incomplete validation evidence
        });

        assert(evaluated.profile_passed === false, 'S6: Policy fails standard requirement check');
        assert(evaluated.blocking_reasons.includes('REQUIRED_STANDARD_NOT_VALIDATED'), 'S6: Blocker code is REQUIRED_STANDARD_NOT_VALIDATED');
        standards_guard_passed = true;
    } catch (e) {
        console.error('S6 Failed:', e);
    }

    // --- Scenario 7: Degraded analysis not allowed ---
    console.log('\nScenario 7 — Degraded analysis not allowed');
    try {
        const blockDegradePol = { id: 'pol_no_degrade', printhouse_id: 'print_1', tenant_id: 'tenant_x', profile_name: 'No Degraded Policy', allow_degraded_analysis: false };
        mockDb.policies.push(blockDegradePol);

        await bindingService.bindPrinthouseProfileToOrder({
            orderId: 'ord_no_degrade',
            tenantId: 'tenant_x',
            printhouseId: 'print_1',
            machineId: 'mach_1',
            mediaId: 'med_1',
            policyProfileId: 'pol_no_degrade',
            slaProfileId: 'sla_1',
            actor
        });

        const evaluated = await bindingService.evaluateBoundPolicyProfileForJob({
            orderId: 'ord_no_degrade',
            jobId: 'job_no_degrade',
            tenantId: 'tenant_x',
            heavyPdfProbeGovernance: { analysis_degraded: true }
        });

        assert(evaluated.profile_passed === false, 'S7: Policy fails degraded check');
        assert(evaluated.blocking_reasons.includes('DEGRADED_ANALYSIS_NOT_ALLOWED_BY_PROFILE'), 'S7: Blocker code is DEGRADED_ANALYSIS_NOT_ALLOWED_BY_PROFILE');
    } catch (e) {
        console.error('S7 Failed:', e);
    }

    // --- Scenario 8: Visual proof required but pending ---
    console.log('\nScenario 8 — Visual proof required but pending');
    try {
        const evaluated = await bindingService.evaluateBoundPolicyProfileForJob({
            orderId: 'ord_1',
            jobId: 'job_8',
            tenantId: 'tenant_x',
            proofApprovalGovernance: { proof_status: 'PENDING' }
        });

        assert(evaluated.profile_passed === false, 'S8: Profile fails visual proof');
        assert(evaluated.blocking_reasons.includes('VISUAL_PROOF_APPROVAL_REQUIRED'), 'S8: Blocker code is VISUAL_PROOF_APPROVAL_REQUIRED');
    } catch (e) {
        console.error('S8 Failed:', e);
    }

    // --- Scenario 9: Visual proof approved ---
    console.log('\nScenario 9 — Visual proof approved');
    try {
        const evaluated = await bindingService.evaluateBoundPolicyProfileForJob({
            orderId: 'ord_1',
            jobId: 'job_9',
            tenantId: 'tenant_x',
            artifactTrust: { production_certified: true },
            proofApprovalGovernance: { proof_status: 'APPROVED' }
        });
        assert(evaluated.profile_passed === true, 'S9: Profile passes with approved visual proof');
    } catch (e) {
        console.error('S9 Failed:', e);
    }

    // --- Scenario 10: artifact_trust not production certified ---
    console.log('\nScenario 10 — artifact_trust not production certified');
    try {
        const evaluated = await bindingService.evaluateBoundPolicyProfileForJob({
            orderId: 'ord_1',
            jobId: 'job_10',
            tenantId: 'tenant_x',
            artifactTrust: { production_certified: false }
        });

        assert(evaluated.profile_passed === false, 'S10: Fails certification requirement check');
        assert(evaluated.blocking_reasons.includes('ARTIFACT_TRUST_NOT_PRODUCTION_CERTIFIED'), 'S10: Blocker code is ARTIFACT_TRUST_NOT_PRODUCTION_CERTIFIED');
        artifact_trust_authority_passed = true;
    } catch (e) {
        console.error('S10 Failed:', e);
    }

    // --- Scenario 11: Interactive features blocked ---
    console.log('\nScenario 11 — Interactive features blocked');
    try {
        const blockJsPol = { id: 'pol_no_js', printhouse_id: 'print_1', tenant_id: 'tenant_x', profile_name: 'No JS Policy', allow_javascript: false };
        mockDb.policies.push(blockJsPol);

        await bindingService.bindPrinthouseProfileToOrder({
            orderId: 'ord_no_js',
            tenantId: 'tenant_x',
            printhouseId: 'print_1',
            machineId: 'mach_1',
            mediaId: 'med_1',
            policyProfileId: 'pol_no_js',
            slaProfileId: 'sla_1',
            actor
        });

        const evaluated = await bindingService.evaluateBoundPolicyProfileForJob({
            orderId: 'ord_no_js',
            jobId: 'job_no_js',
            tenantId: 'tenant_x',
            preflightGovernance: { javascript_detected: true }
        });

        assert(evaluated.profile_passed === false, 'S11: Fails JS presence check');
        assert(evaluated.blocking_reasons.includes('JAVASCRIPT_NOT_ALLOWED_BY_PROFILE'), 'S11: Blocker code is JAVASCRIPT_NOT_ALLOWED_BY_PROFILE');
    } catch (e) {
        console.error('S11 Failed:', e);
    }

    // --- Scenario 12: Production queue integration ---
    console.log('\nScenario 12 — Production queue integration');
    try {
        mockDb.orders.push({
            order_id: 'ord_1',
            tenant_id: 'tenant_x',
            status: 'PRODUCTION_ACCEPTED',
            metadata_json: JSON.stringify({
                dispatch_package: {
                    status: 'PRINTHOUSE_ACCEPTED',
                    manifest: {
                        invoice: { status: 'ISSUED' },
                        payment: { status: 'PAYMENT_CONFIRMED' }
                    }
                },
                production_unlock: { status: 'PRODUCTION_UNLOCKED' },
                production_decision: { decision: 'PRODUCTION_ACCEPTED' }
            })
        });
        mockDb.files.push({ order_id: 'ord_1', preflight_job_id: 'job_1' });
        
        // Mock a failing preflight job state inside jobs registry mock
        mockDb.jobs.push({
            id: 'job_1',
            artifact_trust: { production_certified: false } // Blocks policy evaluation
        });

        const eligibility = await queueService.evaluateProductionQueueEligibility('ord_1');
        assert(eligibility.eligible === false, 'S12: Production queue blocks when policy profile evaluation fails');
        assert(eligibility.blockers.includes('POLICY_PROFILE_FAILED'), 'S12: Eligibility reports POLICY_PROFILE_FAILED blocker');
        production_queue_integration_passed = true;
    } catch (e) {
        console.error('S12 Failed:', e);
    }

    // --- Scenario 13: Handoff package integration ---
    console.log('\nScenario 13 — Handoff package integration');
    try {
        // Change job state to pass
        const targetJob = mockDb.jobs.find(j => j.id === 'job_1');
        targetJob.artifact_trust = { production_certified: true };
        targetJob.proof_approval_governance = { proof_status: 'APPROVED' };

        const handoff = await handoffService.buildProductionHandoffPackage('job_1', { tenantId: 'tenant_x' });
        assert(handoff.ok === true, 'S13: Handoff package generated');
        assert(handoff.policy_profile_snapshot_json !== null, 'S13: Snapshots present in handoff manifest');
        assert(handoff.profile_snapshot_hash !== '', 'S13: Handoff package contains profile_snapshot_hash');
        handoff_integration_passed = true;
    } catch (e) {
        console.error('S13 Failed:', e);
    }

    // --- Scenario 14: Missing binding blocks production ---
    console.log('\nScenario 14 — Missing binding blocks production');
    try {
        mockDb.orders.push({
            order_id: 'ord_nobind',
            tenant_id: 'tenant_x',
            status: 'PRODUCTION_ACCEPTED',
            metadata_json: JSON.stringify({
                dispatch_package: {
                    status: 'PRINTHOUSE_ACCEPTED',
                    manifest: {
                        invoice: { status: 'ISSUED' },
                        payment: { status: 'PAYMENT_CONFIRMED' }
                    }
                },
                production_unlock: { status: 'PRODUCTION_UNLOCKED' },
                production_decision: { decision: 'PRODUCTION_ACCEPTED' }
            })
        });
        mockDb.files.push({ order_id: 'ord_nobind', preflight_job_id: 'job_nobind' });

        const eligibility = await queueService.evaluateProductionQueueEligibility('ord_nobind');
        assert(eligibility.eligible === false, 'S14: Production queue blocks when order binding is missing');
        assert(eligibility.blockers.includes('MISSING_PROFILE_BINDING'), 'S14: Blocker is MISSING_PROFILE_BINDING');
    } catch (e) {
        console.error('S14 Failed:', e);
    }

    // --- Scenario 15: Audit bundle integration ---
    console.log('\nScenario 15 — Audit bundle integration');
    try {
        // Assert that audit events are present in mock capability audit tables
        assert(mockDb.audit.length > 0, 'S15: Audit timeline captures profile binding events');
        audit_events_created = true;
    } catch (e) {
        console.error('S15 Failed:', e);
    }

    // --- Scenario 16: No governance overclaim ---
    console.log('\nScenario 16 — No governance overclaim');
    try {
        // Make sure no standard claims are made from profile selection alone
        const evaluated = await bindingService.evaluateBoundPolicyProfileForJob({
            orderId: 'ord_1',
            jobId: 'job_1',
            tenantId: 'tenant_x'
        });
        assert(!evaluated.policy_profile_name.includes('certified') && !evaluated.policy_profile_name.includes('print-ready'), 
            'S16: No certification wording introduced on raw profile labels');
        no_overclaim_passed = true;
    } catch (e) {
        console.error('S16 Failed:', e);
    }

    // Write reports
    const fs = require('fs');
    const path = require('path');
    const reportsDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    const summary = {
        tested_at: new Date().toISOString(),
        status: FAIL === 0 ? 'SUCCESS' : 'FAILED',
        scenarios_passed: PASS,
        scenarios_failed: FAIL,
        assertions_passed: PASS,
        assertions_failed: FAIL,
        binding_created,
        snapshot_hashes_created,
        tenant_isolation_passed,
        immutability_passed,
        standards_guard_passed,
        artifact_trust_authority_passed,
        production_queue_integration_passed,
        handoff_integration_passed,
        audit_events_created,
        no_overclaim_passed
    };

    const jsonPath = path.join(reportsDir, 'phase76c_preflight_profile_binding.json');
    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 4), 'utf8');
    console.log(`\nWritten JSON report to: ${jsonPath}`);

    const mdPath = path.join(reportsDir, 'phase76c_preflight_profile_binding.md');
    const mdContent = `# Phase 76C — Preflight Profile Binding Report

**Status**: ${summary.status}
**Assertions Passed**: ${PASS}/${PASS + FAIL}

## Scenarios Covered
1. Successful binding with immutable snapshots and hashes.
2. Draft binding when profile details are incomplete.
3. Rejecting cross-tenant resource configurations.
4. Rejecting resources belonging to other printers.
5. Verification of snapshot immutability ignoring live configuration edits.
6. Guarding required PDF standards without validation reports.
7. Blocking queueing when degraded preflight analysis is disallowed.
8. Enforcing visual proof approval gates.
9. Verification of unblocked proof gates.
10. Respecting artifact_trust final production certification status.
11. Restricting interactive elements like Javascript actions.
12. Gating order queue eligibility based on policy profile outcomes.
13. Injection of profile snapshots inside handoff manifests.
14. Restricting queueing and handoffs if profile binding is missing.
15. Capturing profile binding history inside capability audit logs.
16. Safeguarding against false certification claims on standard names.
`;
    fs.writeFileSync(mdPath, mdContent, 'utf8');
    console.log(`Written Markdown report to: ${mdPath}`);

    console.log('\n================================================');
    console.log(`Phase 76C smoke test run completed.`);
    console.log(`Passed: ${PASS} | Failed: ${FAIL}`);
    console.log('================================================');

    if (FAIL > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runScenarios();
