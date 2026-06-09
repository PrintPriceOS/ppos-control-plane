'use strict';

/**
 * Phase 70D — Control Plane Customer Proof Approval UX
 * Smoke test: validates proofApprovalUxService and artifactUxLabelService
 * correctly handle all proof approval states, gate logic, and customer-safe output.
 */

const path = require('path');

// ---------------------------------------------------------------------------
// Minimal stubs so we can require the services without live dependencies
// ---------------------------------------------------------------------------
const Module = require('module');
const originalRequire = Module.prototype.require;

const STUB_MODULES = {
    './preflightContractGateway': { getJobWithArtifacts: async () => null },
    './preflightServiceClient': { getJob: async () => null, getArtifacts: async () => [] },
    './mysqlClient': { query: async () => [] },
    './preflightGovernanceLedgerService': { getGovernanceLedger: async () => null },
    './marketplaceOrderService': { getOrder: async () => null, computeReadiness: async () => ({ blockers: [], warnings: [] }) },
    './marketplaceCustomerActionService': { getCustomerAction: async () => null },
    './preflightReviewDecisionUxService': { buildReviewDecisionUx: () => ({}) },
    './customerRemediationUxService': { buildCustomerRemediationUx: () => ({}) },
};

Module.prototype.require = function (id) {
    const stub = STUB_MODULES[id];
    if (stub) return stub;
    return originalRequire.apply(this, arguments);
};

const proofApprovalUxService = require(
    path.join(__dirname, '../src/api/services/proofApprovalUxService')
);
const artifactUxLabelService = require(
    path.join(__dirname, '../src/api/services/artifactUxLabelService')
);

Module.prototype.require = originalRequire;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let PASS = 0;
let FAIL = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  PASS  ${label}`);
        PASS++;
    } else {
        console.error(`  FAIL  ${label}`);
        FAIL++;
    }
}

function assertAbsent(obj, key, label) {
    assert(!(key in obj), label);
}

function assertPresent(obj, key, label) {
    assert(key in obj && obj[key] !== undefined, label);
}

const { buildProofApprovalUx, APPROVAL_STATES } = proofApprovalUxService;
const { buildArtifactUxLabels } = artifactUxLabelService;

// ---------------------------------------------------------------------------
// Test 1: PROOF_NOT_REQUIRED — no visual changes, no proof required
// ---------------------------------------------------------------------------
console.log('\n=== Test 1: PROOF_NOT_REQUIRED — no visual changes ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: { proof_required: false, proof_status: 'NOT_REQUIRED' },
        visual_diff_governance: { visual_change_detected: false, visual_review_required: false },
        audience: 'operator'
    });

    assert(result.approval_state === APPROVAL_STATES.NOT_REQUIRED, 'state is PROOF_NOT_REQUIRED');
    assert(result.production_blocked === false, 'production not blocked');
    assert(result.proof_approved === false, 'proof_approved=false (not applicable)');
    assert(result.production_certified === false, 'production_certified always false');
    assert(result.standard_certified === false, 'standard_certified always false');
}

// ---------------------------------------------------------------------------
// Test 2: PROOF_REQUIRED — visual change detected, no proof sent yet
// ---------------------------------------------------------------------------
console.log('\n=== Test 2: PROOF_REQUIRED — visual change, no proof sent ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: { proof_required: true, proof_available: false, proof_status: 'NOT_REQUIRED' },
        visual_diff_governance: { visual_change_detected: true, visual_review_required: true },
        audience: 'operator'
    });

    assert(result.approval_state === APPROVAL_STATES.REQUIRED, 'state is PROOF_REQUIRED');
    assert(result.production_blocked === true, 'production is blocked');
    assert(result.proof_required === true, 'proof_required=true');
    assert(result.status_tone === 'warning', 'tone is warning');
    assert(result.status_badge.includes('required'), 'badge mentions "required"');
}

// ---------------------------------------------------------------------------
// Test 3: PROOF_PENDING_CUSTOMER — proof available, awaiting decision
// ---------------------------------------------------------------------------
console.log('\n=== Test 3: PROOF_PENDING_CUSTOMER — proof sent, awaiting approval ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'PENDING',
            proof_id: 'proof-abc-123'
        },
        visual_diff_governance: { visual_change_detected: true },
        audience: 'operator'
    });

    assert(result.approval_state === APPROVAL_STATES.PENDING_CUSTOMER, 'state is PROOF_PENDING_CUSTOMER');
    assert(result.production_blocked === true, 'production still blocked while pending');
    assert(result.status_tone === 'info', 'tone is info for pending');
    assert(result.status_badge.includes('Awaiting'), 'badge says Awaiting customer approval');
    assert(result.proof_id === 'proof-abc-123', 'proof_id preserved for operator');
}

// ---------------------------------------------------------------------------
// Test 4: PROOF_APPROVED — customer approved the proof
// ---------------------------------------------------------------------------
console.log('\n=== Test 4: PROOF_APPROVED — customer approved ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED',
            proof_id: 'proof-abc-123'
        },
        visual_diff_governance: { visual_change_detected: true },
        audience: 'operator'
    });

    assert(result.approval_state === APPROVAL_STATES.APPROVED, 'state is PROOF_APPROVED');
    assert(result.production_blocked === false, 'production NOT blocked after approval');
    assert(result.proof_approved === true, 'proof_approved=true');
    assert(result.status_tone === 'success', 'tone is success');
    assert(result.status_badge.includes('approved'), 'badge says Customer approved');
    assert(result.production_certified === false, 'production_certified still false (other gates apply)');
    assert(result.standard_certified === false, 'standard_certified always false');
}

// ---------------------------------------------------------------------------
// Test 5: PROOF_REJECTED_REUPLOAD_REQUIRED — customer rejected proof
// ---------------------------------------------------------------------------
console.log('\n=== Test 5: PROOF_REJECTED_REUPLOAD_REQUIRED — customer rejected ===');

{
    const resultOp = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'REJECTED',
            customer_feedback: 'The colors are completely wrong.'
        },
        visual_diff_governance: { visual_change_detected: true },
        audience: 'operator'
    });

    const resultCust = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'REJECTED',
            customer_feedback: 'The colors are completely wrong.'
        },
        visual_diff_governance: { visual_change_detected: true },
        audience: 'customer'
    });

    assert(resultOp.approval_state === APPROVAL_STATES.REJECTED_REUPLOAD, 'operator: state is PROOF_REJECTED_REUPLOAD_REQUIRED');
    assert(resultOp.production_blocked === true, 'operator: production blocked on rejection');
    assert(resultOp.proof_rejected === true, 'operator: proof_rejected=true');
    assert(resultOp.status_tone === 'danger', 'operator: tone is danger');
    assert(resultOp.customer_feedback === 'The colors are completely wrong.', 'operator: customer_feedback preserved');
    assert(resultCust.approval_state === APPROVAL_STATES.REJECTED_REUPLOAD, 'customer: state is PROOF_REJECTED_REUPLOAD_REQUIRED');
    // customer_feedback should NOT be exposed via the customer audience getter in safe mode
    // (we only strip proof_id and expose it through the safe gov subset, feedback is operator-only)
    assertAbsent(resultCust, 'proof_id', 'customer: proof_id not exposed');
}

// ---------------------------------------------------------------------------
// Test 6: REJECTED blocks production — no overclaims
// ---------------------------------------------------------------------------
console.log('\n=== Test 6: REJECTED never sets production_certified or standard_certified ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'REJECTED'
        },
        visual_diff_governance: {},
        audience: 'operator'
    });

    assert(result.production_certified === false, 'production_certified=false on rejection');
    assert(result.standard_certified === false, 'standard_certified=false on rejection');
}

// ---------------------------------------------------------------------------
// Test 7: APPROVED never sets production_certified (other gates still apply)
// ---------------------------------------------------------------------------
console.log('\n=== Test 7: APPROVED does not imply production_certified ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED'
        },
        visual_diff_governance: { visual_change_detected: true },
        audience: 'operator'
    });

    assert(result.production_certified === false, 'APPROVED: production_certified still false');
    assert(result.standard_certified === false, 'APPROVED: standard_certified still false');
}

// ---------------------------------------------------------------------------
// Test 8: Visual diff governance signals infer proof_required
// ---------------------------------------------------------------------------
console.log('\n=== Test 8: visual_diff_governance infers proof_required when no explicit gov ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {},
        visual_diff_governance: {
            visual_change_detected: true,
            visual_review_required: true,
            proof_artifacts_available: true
        },
        audience: 'operator'
    });

    assert(result.proof_required === true, 'proof_required inferred from visual_change_detected');
    assert(result.proof_available === true, 'proof_available inferred from proof_artifacts_available');
    assert(result.production_blocked === true, 'production blocked when inferred');
}

// ---------------------------------------------------------------------------
// Test 9: artifactUxLabelService — certified_pdf downgraded when proof pending
// ---------------------------------------------------------------------------
console.log('\n=== Test 9: artifactUxLabelService — certified_pdf downgraded when pending ===');

{
    const artifact = {
        type: 'certified_pdf',
        customer_visible: true,
        production_certified: true,
        standard_certified: false,
        downloadable: true,
        size_bytes: 100000,
        artifact_role: 'PRODUCTION_READY',
    };
    const artifact_trust = {
        review_required: false,
        production_certified: true,
        standard_certified: false,
        evidence: {}
    };
    const human_report = {
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'PENDING'
        }
    };

    const cLabel = buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'customer' });
    const oLabel = buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(cLabel.customer_visible === false, 'customer: certified_pdf hidden when proof pending');
    assert(cLabel.status_badge.includes('Awaiting'), 'customer: badge says Awaiting customer approval');
    assert(oLabel.status_badge.includes('Awaiting'), 'operator: badge says Awaiting customer approval');
    assert(oLabel.warning && oLabel.warning.includes('Proof approval'), 'operator: warning mentions proof approval');
}

// ---------------------------------------------------------------------------
// Test 10: artifactUxLabelService — certified_pdf downgraded when rejected
// ---------------------------------------------------------------------------
console.log('\n=== Test 10: artifactUxLabelService — certified_pdf downgraded when rejected ===');

{
    const artifact = {
        type: 'certified_pdf',
        customer_visible: true,
        production_certified: true,
        standard_certified: false,
        downloadable: true,
        size_bytes: 100000,
    };
    const artifact_trust = {
        review_required: false,
        production_certified: true,
        standard_certified: false,
        evidence: {}
    };
    const human_report = {
        proof_approval_governance: {
            proof_required: true,
            proof_status: 'REJECTED'
        }
    };

    const cLabel = buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'customer' });
    const oLabel = buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(cLabel.customer_visible === false, 'customer: certified_pdf hidden on rejection');
    assert(cLabel.status_tone === 'danger', 'customer: tone is danger on rejection');
    assert(oLabel.status_tone === 'danger', 'operator: tone is danger on rejection');
}

// ---------------------------------------------------------------------------
// Test 11: artifactUxLabelService — fixed_pdf shows approved badge when approved
// ---------------------------------------------------------------------------
console.log('\n=== Test 11: artifactUxLabelService — fixed_pdf shows Customer approved badge ===');

{
    const artifact = {
        type: 'fixed_pdf',
        customer_visible: false,
        production_certified: false,
        standard_certified: false,
        downloadable: true,
        size_bytes: 100000,
    };
    const artifact_trust = {
        review_required: false,
        production_certified: false,
        standard_certified: false,
        evidence: {}
    };
    const human_report = {
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED'
        },
        visual_diff_governance: {
            visual_diff_performed: true,
            visual_change_detected: false,
            visual_review_required: false,
            proof_artifacts_available: true
        }
    };

    const oLabel = buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(oLabel.status_badge === 'Customer approved', 'operator: status_badge is Customer approved');
    assert(oLabel.status_tone === 'success', 'operator: tone is success when approved');
}

// ---------------------------------------------------------------------------
// Test 12: artifactUxLabelService — fixed_pdf shows Awaiting badge when pending
// ---------------------------------------------------------------------------
console.log('\n=== Test 12: artifactUxLabelService — fixed_pdf shows Awaiting badge when pending ===');

{
    const artifact = {
        type: 'fixed_pdf',
        customer_visible: false,
        production_certified: false,
        standard_certified: false,
        downloadable: true,
        size_bytes: 100000,
    };
    const artifact_trust = { review_required: false, production_certified: false, standard_certified: false, evidence: {} };
    const human_report = {
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'PENDING'
        }
    };

    const oLabel = buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(oLabel.status_badge === 'Awaiting customer approval', 'operator: fixed_pdf badge says Awaiting customer approval when pending');
    assert(oLabel.status_tone === 'info', 'operator: tone is info when pending');
}

// ---------------------------------------------------------------------------
// Test 13: Conservative merge — REJECTED wins over PENDING
// ---------------------------------------------------------------------------
console.log('\n=== Test 13: Conservative merge — REJECTED wins over PENDING ===');

{
    // Simulate what the merge loop does in preflightHumanReportService
    let proofApprGov = {};
    const sources = [
        { proof_required: true, proof_status: 'PENDING' },
        { proof_required: true, proof_status: 'REJECTED' }
    ];
    for (const source of sources) {
        if (source.proof_required === true) proofApprGov.proof_required = true;
        if (source.proof_status === 'REJECTED') {
            proofApprGov.proof_status = 'REJECTED';
        } else if (source.proof_status === 'APPROVED' && proofApprGov.proof_status !== 'REJECTED') {
            proofApprGov.proof_status = 'APPROVED';
        } else if (source.proof_status === 'PENDING' && !proofApprGov.proof_status) {
            proofApprGov.proof_status = 'PENDING';
        }
    }
    assert(proofApprGov.proof_status === 'REJECTED', 'merge: REJECTED wins over PENDING');
}

// ---------------------------------------------------------------------------
// Test 14: Conservative merge — APPROVED cannot override REJECTED
// ---------------------------------------------------------------------------
console.log('\n=== Test 14: Conservative merge — APPROVED cannot override REJECTED ===');

{
    let proofApprGov = {};
    const sources = [
        { proof_required: true, proof_status: 'REJECTED' },
        { proof_required: true, proof_status: 'APPROVED' }
    ];
    for (const source of sources) {
        if (source.proof_required === true) proofApprGov.proof_required = true;
        if (source.proof_status === 'REJECTED') {
            proofApprGov.proof_status = 'REJECTED';
        } else if (source.proof_status === 'APPROVED' && proofApprGov.proof_status !== 'REJECTED') {
            proofApprGov.proof_status = 'APPROVED';
        }
    }
    assert(proofApprGov.proof_status === 'REJECTED', 'merge: APPROVED cannot undo REJECTED');
}

// ---------------------------------------------------------------------------
// Test 15: Evidence sanitization — blocked keys omitted
// ---------------------------------------------------------------------------
console.log('\n=== Test 15: Evidence sanitization — blocked keys omitted ===');

{
    const rawEvidence = {
        proof_generated: true,
        proof_hash: 'abc123',
        local_path: '/tmp/jobs/proof.pdf',
        command: 'gs -sDEVICE=png16m',
        raw_path: '/tmp/internal/proof.png',
        internal_id: 'int-001',
        pages_compared: 4
    };

    const blockedEvidenceKeys = ['command', 'local_path', 'raw_path', 'file_path', 'internal_id',
        'obj_', 'forensic_object_id', 'raw_stream'];

    const safeEvidence = {};
    for (const [k, v] of Object.entries(rawEvidence)) {
        if (!blockedEvidenceKeys.some(b => k.includes(b))) {
            safeEvidence[k] = v;
        }
    }

    assertAbsent(safeEvidence, 'local_path', 'safeEvidence: local_path omitted');
    assertAbsent(safeEvidence, 'command', 'safeEvidence: command omitted');
    assertAbsent(safeEvidence, 'raw_path', 'safeEvidence: raw_path omitted');
    assertAbsent(safeEvidence, 'internal_id', 'safeEvidence: internal_id omitted');
    assertPresent(safeEvidence, 'proof_generated', 'safeEvidence: proof_generated preserved');
    assertPresent(safeEvidence, 'proof_hash', 'safeEvidence: proof_hash preserved');
    assertPresent(safeEvidence, 'pages_compared', 'safeEvidence: pages_compared preserved');
}

// ---------------------------------------------------------------------------
// Test 16: customer audience never gets proof_id
// ---------------------------------------------------------------------------
console.log('\n=== Test 16: customer audience — proof_id not exposed ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'PENDING',
            proof_id: 'proof-secret-001'
        },
        visual_diff_governance: {},
        audience: 'customer'
    });

    assertAbsent(result, 'proof_id', 'customer: proof_id not in customer output');
}

// ---------------------------------------------------------------------------
// Test 17: customer audience never gets customer_feedback (it belongs to operator)
// ---------------------------------------------------------------------------
console.log('\n=== Test 17: customer audience — customer_feedback not in ux result ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'REJECTED',
            customer_feedback: 'Colors wrong'
        },
        visual_diff_governance: {},
        audience: 'customer'
    });

    // customer_feedback is operator-only — should not appear in customer UX object
    assert(!result.customer_feedback || result.customer_feedback === undefined, 'customer: customer_feedback not exposed in UX');
}

// ---------------------------------------------------------------------------
// Test 18: NOT_REQUIRED with no visual change — proof_approved false, no blocking
// ---------------------------------------------------------------------------
console.log('\n=== Test 18: NOT_REQUIRED — no blocking, correct defaults ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {},
        visual_diff_governance: { visual_change_detected: false },
        audience: 'operator'
    });

    assert(result.approval_state === APPROVAL_STATES.NOT_REQUIRED, 'state NOT_REQUIRED when no change');
    assert(result.production_blocked === false, 'not blocked');
    assert(result.proof_approved === false, 'proof_approved false (not applicable)');
}

// ---------------------------------------------------------------------------
// Test 19: artifactUxLabelService — no proof governance — no spurious badges
// ---------------------------------------------------------------------------
console.log('\n=== Test 19: artifactUxLabelService — no proof gov — no spurious proof badges ===');

{
    const artifact = {
        type: 'fixed_pdf',
        customer_visible: false,
        production_certified: false,
        downloadable: true,
        size_bytes: 100000
    };
    const artifact_trust = { review_required: false, production_certified: false, standard_certified: false, evidence: {} };
    const human_report = {};  // no proof_approval_governance

    const oLabel = buildArtifactUxLabels({ artifact, artifact_trust, human_report, audience: 'operator' });

    assert(oLabel.status_badge !== 'Customer approved', 'no spurious Customer approved badge');
    assert(oLabel.status_badge !== 'Awaiting customer approval', 'no spurious Awaiting badge');
    assert(oLabel.status_badge !== 'Customer rejected — reupload required', 'no spurious rejected badge');
}

// ---------------------------------------------------------------------------
// Test 20: approval_state APPROVED from visual_diff inferred proof_required
// ---------------------------------------------------------------------------
console.log('\n=== Test 20: APPROVED resolves correctly when visual diff was the trigger ===');

{
    const result = buildProofApprovalUx({
        proof_approval_governance: {
            proof_required: true,
            proof_available: true,
            proof_status: 'APPROVED',
            visual_change_detected: true
        },
        visual_diff_governance: {
            visual_change_detected: true,
            visual_review_required: true,
            proof_artifacts_available: true
        },
        audience: 'operator'
    });

    assert(result.approval_state === APPROVAL_STATES.APPROVED, 'state APPROVED');
    assert(result.proof_approved === true, 'proof_approved=true');
    assert(result.production_blocked === false, 'not blocked — approval satisfies the gate');
    assert(result.visual_change_detected === true, 'visual_change_detected preserved');
    assert(result.production_certified === false, 'production_certified always false');
    assert(result.standard_certified === false, 'standard_certified always false');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log(`Phase 70D Smoke: ${PASS} PASS / ${FAIL} FAIL`);
if (FAIL === 0) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
} else {
    console.error('SOME TESTS FAILED');
    process.exit(1);
}
