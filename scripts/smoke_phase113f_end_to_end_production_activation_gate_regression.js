'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) { PASS++; console.log(`  ✅  [PASS] ${label}`); }
    else { FAIL++; console.error(`  ❌  [FAIL] ${label}`); }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runRegression() {
    console.log('\n━━━ Phase 113F — End-to-End Production Activation Gate Regression ━━━\n');

    // 1. Verify service classes integration
    const gateServiceFile = path.join(ROOT, 'src/api/services/financialOperationsProductionActivationGateService.js');
    const approvalServiceFile = path.join(ROOT, 'src/api/services/financialOperationsProductionActivationApprovalService.js');
    const reviewServiceFile = path.join(ROOT, 'src/api/services/financialOperationsProductionActivationGateReviewService.js');

    assert(fs.existsSync(gateServiceFile), 'R1: Gate service exists');
    assert(fs.existsSync(approvalServiceFile), 'R2: Approval service exists');
    assert(fs.existsSync(reviewServiceFile), 'R3: Review service exists');

    // 2. Validate Service Logic Flow (Simulated E2E Flow)
    const GateService = require(gateServiceFile);
    const ApprovalService = require(approvalServiceFile);
    const ReviewService = require(reviewServiceFile);

    const gateService = new GateService();
    const approvalService = new ApprovalService(gateService);
    const reviewService = new ReviewService(gateService);

    // Mock DB queries for test isolation
    const originalQuery = require('../src/api/services/mysqlClient').query;
    const db = require('../src/api/services/mysqlClient');
    
    db.query = async (sql, params) => {
        return [];
    };

    try {
        const actor = { userId: 'admin-reg-01', role: 'CONTROL_PLANE_ADMIN' };
        
        // Flow Step 1: Create a pre-production activation gate
        const gate = await gateService.createGate({
            gateName: 'E2E Regression Gate',
            finalReleaseCandidateId: 'rc_phase112_validated',
            preProductionRunbookId: 'runbook_phase111_validated',
            goLiveSimulationId: 'sim_phase110_validated',
            evidence: {
                final_release_candidate_approved: true,
                approval_chain_present: true,
                compliance_reporting_ready: true,
                provider_ready: true,
                // Safety: all live/prod flags must be false
                production_activation_enabled: false,
                activation_execution_enabled: false,
                full_public_enabled: false,
                live_provider_connectivity_enabled: false,
                payment_execution_enabled: false
            }
        }, actor);

        assert(gate.activation_gate_status === 'CREATED', 'R4: Gate successfully initialized in CREATED state');
        assert(gate.production_activation_enabled === false, 'R5: Safety check - production activation is disabled');
        assert(gate.activation_execution_enabled === false, 'R6: Safety check - activation execution is disabled');
        assert(gate.full_public_enabled === false, 'R7: Safety check - full public launch is disabled');
        assert(gate.live_provider_connectivity_enabled === false, 'R8: Safety check - live provider connectivity is disabled');
        assert(gate.payment_execution_enabled === false, 'R9: Safety check - payment execution is disabled');

        // Flow Step 2: Evaluate gate status
        const evaluated = await gateService.evaluateGate(gate.production_activation_gate_id, actor);
        assert(evaluated.activation_gate_status === 'APPROVED_FOR_FUTURE_ACTIVATION_REVIEW', 'R10: Gate evaluated successfully for future review');

        // Flow Step 3: Build approval chain
        const chain = await approvalService.buildApprovalChain(gate.production_activation_gate_id, actor);
        assert(chain.approvals.length === 7, 'R11: Seven sign-off roles mapped in approval chain');

        // Flow Step 4: Grant sign-off roles
        const financeAp = await approvalService.grantApproval(gate.production_activation_gate_id, 'FINANCE_APPROVER', 'EMP-113', 'Finance checks verified in pre-production', actor);
        assert(financeAp.approval_status === 'APPROVED_FOR_GATE_READINESS', 'R12: Sign-off successfully granted for Finance Approver');
        assert(financeAp.approver_reference === null, 'R13: Privacy: plaintext approver reference is never stored');
        assert(financeAp.approver_reference_hash !== null, 'R14: Privacy: approver reference is hashed');

        const evalBefore = approvalService.evaluateChain(gate.production_activation_gate_id);
        assert(evalBefore.complete === false, 'R15: Chain evaluated as incomplete before all sign-offs are granted');

        // Flow Step 5: Test Reject state
        const rejectAp = await approvalService.rejectApproval(gate.production_activation_gate_id, 'SECURITY_APPROVER', actor);
        assert(rejectAp.approval_status === 'REJECTED', 'R16: Sign-off role can be successfully REJECTED');

        // Flow Step 6: Review actions (add notes, dismiss warnings, etc.)
        const noteAdded = await reviewService.addReviewNote(gate.production_activation_gate_id, 'SECURITY', 'Security validation notes', actor);
        assert(noteAdded === true, 'R17: Review note successfully added to audit logs');

        // Flow Step 7: Revoke gate state
        const revoked = await reviewService.revokeGate(gate.production_activation_gate_id, actor);
        assert(revoked.activation_gate_status === 'REVOKED', 'R18: Gate can be successfully revoked under pre-production rules');

    } catch (err) {
        FAIL++;
        console.error('  ❌  [FAIL] Error during service logic flow regression:', err.message);
    }

    // Restore DB connection
    db.query = originalQuery;

    // 3. Validate Router endpoints response signatures
    try {
        const routerCode = fs.readFileSync(path.join(ROOT, 'src/api/routes/financialOperationsProductionActivationAdmin.js'), 'utf8');
        assert(routerCode.includes('safety_message'), 'R19: API includes safety message definition');
        assert(routerCode.includes('is_review_only: true'), 'R20: API enforces review-only mode');
        assert(routerCode.includes('preview-redacted'), 'R21: API exposes preview-redacted route');
        assert(routerCode.includes('[REDACTED_SECURE_TENANT_PATH]') || routerCode.includes('[REDACTED_PRE_PRODUCTION]'), 'R22: API redacts sensitive field preview values');
    } catch (err) {
        FAIL++;
        console.error('  ❌  [FAIL] Failed to verify router safety code:', err.message);
    }

    // 4. Validate UI Page compliance
    try {
        const uiCode = fs.readFileSync(path.join(ROOT, 'src/ui/pages/financial-operations-production-activation/ProductionActivationGate.tsx'), 'utf8');
        assert(uiCode.includes('Pre-Production Governance Console'), 'R23: UI includes Pre-Production Governance header');
        assert(uiCode.includes('safety.safety_message'), 'R24: UI references safety message constraints');
        assert(uiCode.includes('Simulated Financial Export Preview'), 'R25: UI displays simulated financial export section');
        assert(uiCode.includes('REDACTED PRE-PRODUCTION MOCK'), 'R26: UI shows redacted mock label');

        const appCode = fs.readFileSync(path.join(ROOT, 'src/ui/App.tsx'), 'utf8');
        assert(appCode.includes('/admin/production-activation-gate'), 'R27: Page registered under path /admin/production-activation-gate in App.tsx');
    } catch (err) {
        FAIL++;
        console.error('  ❌  [FAIL] Failed to verify UI page code compliance:', err.message);
    }

    // 5. Validate migration safety remains intact
    try {
        const migCode = fs.readFileSync(path.join(ROOT, 'src/api/services/migrationService.js'), 'utf8');
        assert(migCode.includes("file.replace(/\\.sql$/, '')"), 'R28: Migration service uses full filename version key');
        assert(migCode.includes("VARCHAR(255)"), 'R29: Migration service version column size remains expanded');
        assert(migCode.includes("m.description.replace"), 'R30: Migration service backward compatibility checks remain active');
    } catch (err) {
        FAIL++;
        console.error('  ❌  [FAIL] Failed to verify migration safety code compliance:', err.message);
    }

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 113F Regression Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);
    if (FAIL > 0) process.exit(1);
}

runRegression().catch(err => { console.error('Regression crashed:', err); process.exit(1); });
