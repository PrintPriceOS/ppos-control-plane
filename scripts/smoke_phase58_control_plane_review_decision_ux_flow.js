/**
 * Phase 58 Smoke Test: Control Plane Review Decision UX Flow
 * 
 * Verifies that the review decision UX contract generates the correct labels,
 * actions, and readiness effects without mutating the state itself.
 */

const { buildReviewDecisionUx } = require('../src/api/services/preflightReviewDecisionUxService');

async function runSmokeTest() {
    console.log("================================================================================");
    console.log("PHASE 58 SMOKE TEST: Control Plane Review Decision UX Flow");
    console.log("================================================================================\n");

    let failures = 0;

    function assertCondition(desc, cond) {
        if (cond) {
            console.log(`[PASS] ${desc}`);
        } else {
            console.error(`[FAIL] ${desc}`);
            failures++;
        }
    }

    // Scenario 1: Customer View - No Decision
    const customerNoDecision = buildReviewDecisionUx({
        human_report: { review_required: true },
        review_decision: null,
        audience: 'customer',
        snapshot_id: 'snap-123'
    });

    assertCondition("Customer View: Status badge is 'Review required'", customerNoDecision.status_badge === 'Review required');
    assertCondition("Customer View: Available actions are hidden (empty or undefined)", !customerNoDecision.available_actions || customerNoDecision.available_actions.length === 0);
    assertCondition("Customer View: Readiness effect prevents invoice/payment", customerNoDecision.readiness_effect.invoice_allowed === false);

    // Scenario 2: Operator View - No Decision, Snapshot exists
    const operatorNoDecision = buildReviewDecisionUx({
        human_report: { review_required: true },
        review_decision: null,
        audience: 'operator',
        snapshot_id: 'snap-123'
    });

    assertCondition("Operator View: Actions are available", operatorNoDecision.available_actions.length > 0);
    assertCondition("Operator View: Action REJECT_REQUIRES_REUPLOAD is enabled", operatorNoDecision.available_actions.find(a => a.id === 'REJECT_REQUIRES_REUPLOAD').disabled === false);
    assertCondition("Operator View: Action REJECT_REQUIRES_REUPLOAD contains preview", !!operatorNoDecision.available_actions.find(a => a.id === 'REJECT_REQUIRES_REUPLOAD').payload_preview);

    // Scenario 3: Operator View - No Decision, NO Snapshot
    const operatorNoSnapshot = buildReviewDecisionUx({
        human_report: { review_required: true },
        review_decision: null,
        audience: 'operator',
        snapshot_id: null
    });

    assertCondition("Operator View (No Snapshot): Decision actions are disabled", operatorNoSnapshot.available_actions.find(a => a.id === 'REJECT_REQUIRES_REUPLOAD').disabled === true);

    // Scenario 4: Customer View - Rejected
    const customerRejected = buildReviewDecisionUx({
        human_report: { review_required: true },
        review_decision: { decision: 'REJECTED_REQUIRES_REUPLOAD' },
        audience: 'customer',
        snapshot_id: 'snap-123'
    });

    assertCondition("Customer View (Rejected): Requires reupload is true", customerRejected.requires_reupload === true);
    assertCondition("Customer View (Rejected): Tone is danger", customerRejected.status_tone === 'danger');

    // Scenario 5: Customer View - Approved With Warnings
    const customerApproved = buildReviewDecisionUx({
        human_report: { review_required: false },
        review_decision: { decision: 'APPROVED_WITH_WARNINGS' },
        audience: 'customer',
        snapshot_id: 'snap-123'
    });

    assertCondition("Customer View (Approved): Readiness effect unlocks invoice/payment", customerApproved.readiness_effect.invoice_allowed === true);
    assertCondition("Customer View (Approved): Tone is success", customerApproved.status_tone === 'success');

    console.log("\n================================================================================");
    if (failures === 0) {
        console.log("SMOKE TEST PASSED: All requirements met.");
        process.exit(0);
    } else {
        console.error(`SMOKE TEST FAILED: ${failures} failures detected.`);
        process.exit(1);
    }
}

runSmokeTest().catch(console.error);
