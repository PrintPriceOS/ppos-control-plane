'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const prepBuilder = require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService');
const approvalBuilder = require('../src/api/services/cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationApprovalEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalEvaluatorService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupPrepAndApproval(prepId, approvalId, prepOutcome) {
  const writeScope = { writes_only_phase143_tables: true, wrote_phase128_to_142_operational_tables: false };
  const writeScope144 = { writes_only_phase144_tables: true, wrote_phase128_to_143_operational_tables: false };
  const prepRecord = {
    prep_id: prepId,
    source_review_id: 'rev_test_c',
    source_simulation_id: 'sim_test_c',
    source_execution_id: 'exec_test_c',
    cohort_id: 'cohort_test_c',
    tenant_id: 'tenant_test_c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    prep_status: 'FINALIZED',
    prep_outcome: prepOutcome,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    prepared_by: null,
    finalized_by: null,
    prep_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    approval_readiness_json: {},
    prep_blockers_json: {},
    non_execution_attestation_json: {},
    source_review_hash: 'review_hash_c',
    source_review_evidence_pack_hash: 'ev_hash_c',
    prep_result_hash: 'result_hash_c',
    evidence_pack_hash: 'pack_hash_c',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY',
    created_at: new Date(),
    updated_at: new Date()
  };

  const approvalRecord = {
    approval_id: approvalId,
    source_prep_id: prepId,
    source_review_id: 'rev_test_c',
    source_simulation_id: 'sim_test_c',
    source_execution_id: 'exec_test_c',
    cohort_id: 'cohort_test_c',
    tenant_id: 'tenant_test_c',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    approval_status: 'DRAFT',
    approval_decision: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: null,
    rollback_feasibility_score: null,
    evidence_completeness_score: null,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    approved_by: null,
    finalized_by: null,
    approval_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope144,
    approval_readiness_json: {},
    approval_blockers_json: { missing_evaluation: true },
    non_execution_attestation_json: {},
    source_prep_hash: 'result_hash_c',
    source_prep_evidence_pack_hash: 'pack_hash_c',
    approval_result_hash: null,
    evidence_pack_hash: null,
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED',
    future_execution_eligibility_status: 'NOT_ELIGIBLE',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    prepBuilder._mockState.preps.set(prepId, prepRecord);
    approvalBuilder._mockState.approvals.set(approvalId, approvalRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_evidence WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_prep_findings WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_app_preps WHERE prep_id = ?', [prepId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_findings WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_evidence WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approvals WHERE approval_id = ?', [approvalId]);

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_app_preps
       (prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        prep_status, prep_outcome, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, prep_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        prep_blockers_json, non_execution_attestation_json, source_review_hash, source_review_evidence_pack_hash,
        prep_result_hash, evidence_pack_hash, execution_capability_status, approval_execution_status)
       VALUES (?, 'rev_test_c', 'sim_test_c', 'exec_test_c', 'cohort_test_c', 'tenant_test_c', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'review_hash_c', 'ev_hash_c', 'result_hash_c', 'pack_hash_c', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY')`,
      [prepId, prepOutcome, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_approvals
       (approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        approval_status, approval_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, approval_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        approval_blockers_json, non_execution_attestation_json, source_prep_hash, source_prep_evidence_pack_hash,
        execution_capability_status, approval_execution_status, future_execution_eligibility_status)
       VALUES (?, ?, 'rev_test_c', 'sim_test_c', 'exec_test_c', 'cohort_test_c', 'tenant_test_c', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', NULL, NULL, NULL, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{"missing_evaluation":true}', '{}', 'result_hash_c', 'pack_hash_c', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED', 'NOT_ELIGIBLE')`,
      [approvalId, prepId, JSON.stringify(writeScope144)]
    );
  }
}

(async () => {
  console.log('=== Smoke 144C: Approval Evaluator Rules ===\n');

  try {
    // 1. Test Prepare Pause -> Suggest Pause Approval
    const p1 = 'prep_c_1';
    const a1 = 'apv_c_1';
    await setupPrepAndApproval(p1, a1, 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL');
    await evaluator.evaluateApproval(a1, 'admin');

    let apv = await approvalBuilder.getApproval(a1);
    assert.strictEqual(apv.approval_status, 'EVALUATED');
    assert.strictEqual(apv.approval_decision, 'APPROVE_HIGH_RISK_COHORT_PAUSE');
    assert.strictEqual(apv.future_execution_eligibility_status, 'ELIGIBLE_FOR_FUTURE_CONTROLLED_EXECUTION_GATE');
    assert.strictEqual(apv.approval_execution_status, 'APPROVED_NOT_EXECUTED');
    console.log('  PASS: Suggested decision APPROVE_HIGH_RISK_COHORT_PAUSE verified.');

    // 2. Test Prepare Rejection -> Suggest Rejection
    const p2 = 'prep_c_2';
    const a2 = 'apv_c_2';
    await setupPrepAndApproval(p2, a2, 'PREPARE_HIGH_RISK_REJECTION_PACKAGE');
    await evaluator.evaluateApproval(a2, 'admin');

    apv = await approvalBuilder.getApproval(a2);
    assert.strictEqual(apv.approval_decision, 'REJECT_HIGH_RISK_INTERVENTION');
    assert.strictEqual(apv.future_execution_eligibility_status, 'BLOCKED_BY_APPROVAL_DECISION');
    assert.strictEqual(apv.approval_execution_status, 'REJECTED_NOT_EXECUTED');
    console.log('  PASS: Suggested decision REJECT_HIGH_RISK_INTERVENTION verified.');

    // 3. Test Overrides
    const p3 = 'prep_c_3';
    const a3 = 'apv_c_3';
    await setupPrepAndApproval(p3, a3, 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL');
    await evaluator.evaluateApproval(a3, 'admin', {
      approval_decision: 'ESCALATE_TO_GOVERNANCE_OWNER',
      future_execution_eligibility_status: 'NOT_ELIGIBLE'
    });

    apv = await approvalBuilder.getApproval(a3);
    assert.strictEqual(apv.approval_decision, 'ESCALATE_TO_GOVERNANCE_OWNER');
    assert.strictEqual(apv.future_execution_eligibility_status, 'NOT_ELIGIBLE');
    console.log('  PASS: Overrides applied correctly.');

    console.log('\nSmoke 144C: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 144C:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
