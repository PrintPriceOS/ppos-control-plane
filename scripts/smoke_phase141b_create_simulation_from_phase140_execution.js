'use strict';

const assert = require('assert');
const builderService = require('../src/api/services/cohortInterventionSimulationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationBuilderService');
const executionBuilderService = require('../src/api/services/cohortInterventionExecutionBuilderService').serviceInstance || require('../src/api/services/cohortInterventionExecutionBuilderService');
const executionRunnerService = require('../src/api/services/cohortInterventionExecutionRunnerService').serviceInstance || require('../src/api/services/cohortInterventionExecutionRunnerService');
const executionDryRunService = require('../src/api/services/cohortInterventionExecutionDryRunService').serviceInstance || require('../src/api/services/cohortInterventionExecutionDryRunService');
const executionRollbackService = require('../src/api/services/cohortInterventionExecutionRollbackService').serviceInstance || require('../src/api/services/cohortInterventionExecutionRollbackService');
const executionOperatorSvc = require('../src/api/services/cohortInterventionExecutionOperatorConfirmationService').serviceInstance || require('../src/api/services/cohortInterventionExecutionOperatorConfirmationService');
// Phase 138-139 chain setup
const reviewDecisionService = require('../src/api/services/runtimeActivityReviewDecisionService').serviceInstance || require('../src/api/services/runtimeActivityReviewDecisionService');
const prepBuilderService = require('../src/api/services/cohortInterventionPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionPreparationBuilderService');
const prepReviewService = require('../src/api/services/cohortInterventionPreparationReviewService').serviceInstance || require('../src/api/services/cohortInterventionPreparationReviewService');
const approvalBuilderService = require('../src/api/services/cohortInterventionApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionApprovalBuilderService');
const approvalWorkflowService = require('../src/api/services/cohortInterventionApprovalWorkflowService').serviceInstance || require('../src/api/services/cohortInterventionApprovalWorkflowService');
const approvalDecisionService = require('../src/api/services/cohortInterventionApprovalDecisionService').serviceInstance || require('../src/api/services/cohortInterventionApprovalDecisionService');

(async () => {
  console.log('=== Smoke 141B: Create Simulation from Phase 140 Execution ===\n');

  try {
    const tenantId = 'tenant_beta_141b';
    const cohortId = 'cohort_beta_141b';
    const start = new Date(Date.now() - 86400000);
    const end = new Date();

    // Build Phase 137 → 138 → 139 → 140 chain
    const { review } = await reviewDecisionService.createReview(tenantId, cohortId, start, end);
    await reviewDecisionService.evaluateReview(review.review_id);
    await reviewDecisionService.finalizeReview(review.review_id, 'admin');

    const { preparation, items } = await prepBuilderService.createPreparation(review.review_id, 'admin');
    for (const item of items) {
      await prepReviewService.updateChecklistItemStatus(preparation.preparation_id, item.item_id, 'COMPLETED', 'admin');
    }
    const currentPrep = await prepReviewService.getPreparation(preparation.preparation_id);
    const prepApprovals = typeof currentPrep.required_approvals_json === 'string'
      ? JSON.parse(currentPrep.required_approvals_json) : (currentPrep.required_approvals_json || []);
    for (const app of prepApprovals) {
      await prepReviewService.approveRole(preparation.preparation_id, app.role, 'admin');
    }
    await prepReviewService.finalizePreparation(preparation.preparation_id, 'admin');

    const { approval } = await approvalBuilderService.createApproval(preparation.preparation_id, 'admin');
    const requiredRoles = approval.approval_policy_json.required_roles;
    for (const role of requiredRoles) {
      await approvalWorkflowService.signStep(approval.approval_id, role, 'admin');
    }
    await approvalDecisionService.recordDecision(approval.approval_id, 'APPROVE_FOR_FUTURE_EXECUTION', 'Approved', 'admin');
    await approvalWorkflowService.finalizeApproval(approval.approval_id, 'admin');

    // Phase 140 execution — use EXECUTE_RISK_ESCALATION_MARKER (eligible for Phase 141)
    const executionBuilderWithType = require('../src/api/services/cohortInterventionExecutionBuilderService');
    const { execution } = await executionBuilderService.createExecution(approval.approval_id, 'admin');
    // Override type to EXECUTE_RISK_ESCALATION_MARKER for eligibility
    const execRecord = executionBuilderService._mockState.executions.get(execution.execution_id);
    if (execRecord) execRecord.execution_type = 'EXECUTE_RISK_ESCALATION_MARKER';

    await executionDryRunService.generateDryRun(execution.execution_id, 'admin');
    await executionRollbackService.createRollbackPlan(execution.execution_id, 'admin');
    await executionOperatorSvc.confirmExecution(execution.execution_id, 'admin', 'Operator Name', 'CONFIRM_PHASE_140_CONTROLLED_EXECUTION');
    await executionRunnerService.runExecution(execution.execution_id, 'admin');

    // Now create Phase 141 simulation
    const { simulation, steps } = await builderService.createSimulation(execution.execution_id, 'SIMULATE_COHORT_PAUSE', 'admin');

    assert.ok(simulation.simulation_id, 'simulation_id must exist');
    assert.strictEqual(simulation.simulation_type, 'SIMULATE_COHORT_PAUSE');
    assert.strictEqual(simulation.simulation_status, 'DRAFT');
    assert.strictEqual(simulation.source_execution_id, execution.execution_id);
    console.log('  PASS: Simulation created from Phase 140 execution.');

    // Validate write scope attestation
    const attestation = typeof simulation.simulation_write_scope_attestation_json === 'string'
      ? JSON.parse(simulation.simulation_write_scope_attestation_json)
      : simulation.simulation_write_scope_attestation_json;
    assert.strictEqual(attestation.writes_only_phase141_tables, true);
    assert.strictEqual(attestation.wrote_phase128_to_140_operational_tables, false);
    assert.strictEqual(attestation.cohort_access_mutated, false);
    console.log('  PASS: Write scope attestation correct (Phase 141 tables only).');

    // Validate safe attestation field
    assert.strictEqual(simulation.safe_scope_simulation_attestation, 'PHASE_141_SIMULATION_ONLY_NO_OPERATIONAL_MUTATION');
    console.log('  PASS: Safe scope simulation attestation correct.');

    // Validate steps created
    assert.strictEqual(steps.length, 3);
    const stepKeys = steps.map(s => s.step_key);
    assert.ok(stepKeys.includes('impact_analysis'));
    assert.ok(stepKeys.includes('rollback_preview'));
    assert.ok(stepKeys.includes('operator_confirmation'));
    console.log('  PASS: Required steps (impact_analysis, rollback_preview, operator_confirmation) created.');

    // Test ineligible source type is blocked
    const { execution: exec2 } = await executionBuilderService.createExecution(approval.approval_id, 'admin');
    const execRecord2 = executionBuilderService._mockState.executions.get(exec2.execution_id);
    if (execRecord2) execRecord2.execution_type = 'EXECUTE_OBSERVATION_EXTENSION';
    // Mark as executed
    if (execRecord2) execRecord2.execution_status = 'EXECUTED';
    // Create fake evidence
    const evidenceSvc = require('../src/api/services/cohortInterventionExecutionEvidencePackService');
    if (evidenceSvc._mockState) {
      evidenceSvc._mockState.evidence = evidenceSvc._mockState.evidence || new Map();
      evidenceSvc._mockState.evidence.set(exec2.execution_id, { evidence_schema_version: '140.0', evidence_pack_hash: 'fake_hash_141b' });
    }

    try {
      await builderService.createSimulation(exec2.execution_id, 'SIMULATE_COHORT_PAUSE', 'admin');
      console.error('FAIL: Should have blocked EXECUTE_OBSERVATION_EXTENSION as ineligible source.');
      process.exit(1);
    } catch (e) {
      if (e.message.includes('INELIGIBLE_PHASE140_SOURCE_TYPE')) {
        console.log('  PASS: EXECUTE_OBSERVATION_EXTENSION correctly blocked as ineligible Phase 140 source type.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 141B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 141B:', e);
    process.exit(1);
  }
})();
