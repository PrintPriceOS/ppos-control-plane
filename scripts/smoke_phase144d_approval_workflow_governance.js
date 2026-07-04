'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const prepBuilder = require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationBuilderService');
const prepEvidence = require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalPreparationEvidencePackService');
const approvalBuilder = require('../src/api/services/cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalBuilderService');
const evaluator = require('../src/api/services/cohortInterventionSimulationApprovalEvaluatorService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalEvaluatorService');
const decision = require('../src/api/services/cohortInterventionSimulationApprovalDecisionService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalDecisionService');
const evidence = require('../src/api/services/cohortInterventionSimulationApprovalEvidencePackService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalEvidencePackService');

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupPrepAndApproval(prepId, approvalId, prepOutcome) {
  const writeScope = { writes_only_phase143_tables: true, wrote_phase128_to_142_operational_tables: false };
  const writeScope144 = { writes_only_phase144_tables: true, wrote_phase128_to_143_operational_tables: false };
  const prepRecord = {
    prep_id: prepId,
    source_review_id: 'rev_test_d',
    source_simulation_id: 'sim_test_d',
    source_execution_id: 'exec_test_d',
    cohort_id: 'cohort_test_d',
    tenant_id: 'tenant_test_d',
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
    source_review_hash: 'review_hash_d',
    source_review_evidence_pack_hash: 'ev_hash_d',
    prep_result_hash: 'result_hash_d',
    evidence_pack_hash: 'pack_hash_d',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY',
    created_at: new Date(),
    updated_at: new Date()
  };

  const approvalRecord = {
    approval_id: approvalId,
    source_prep_id: prepId,
    source_review_id: 'rev_test_d',
    source_simulation_id: 'sim_test_d',
    source_execution_id: 'exec_test_d',
    cohort_id: 'cohort_test_d',
    tenant_id: 'tenant_test_d',
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
    source_prep_hash: 'result_hash_d',
    source_prep_evidence_pack_hash: 'pack_hash_d',
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
    prepEvidence._mockState.evidence.set(prepId, {
      evidence_pack_hash: 'pack_hash_d',
      evidence_payload_json: { evidence_schema_version: '143.0', write_scope_attestation: writeScope },
      lineage_hash_chain_json: {
        phase143_preparation_id: prepId,
        phase142_review_id: 'rev_test_d',
        phase141_source_simulation_hash: 'hash_d',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
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
       VALUES (?, 'rev_test_d', 'sim_test_d', 'exec_test_d', 'cohort_test_d', 'tenant_test_d', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'review_hash_d', 'ev_hash_d', 'result_hash_d', 'pack_hash_d', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED_PREPARATION_ONLY')`,
      [prepId, prepOutcome, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_app_prep_evidence
       (evidence_id, prep_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '143.0', 'pack_hash_d', ?, ?)`,
      [
        'pe_' + prepId,
        prepId,
        JSON.stringify({ evidence_schema_version: '143.0', write_scope_attestation: writeScope }),
        JSON.stringify({
          phase143_preparation_id: prepId,
          phase142_review_id: 'rev_test_d',
          phase141_source_simulation_hash: 'hash_d',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_approvals
       (approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        approval_status, approval_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, approval_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        approval_blockers_json, non_execution_attestation_json, source_prep_hash, source_prep_evidence_pack_hash,
        execution_capability_status, approval_execution_status, future_execution_eligibility_status)
       VALUES (?, ?, 'rev_test_d', 'sim_test_d', 'exec_test_d', 'cohort_test_d', 'tenant_test_d', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', NULL, NULL, NULL, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{"missing_evaluation":true}', '{}', 'result_hash_d', 'pack_hash_d', 'EXECUTION_NOT_ENABLED', 'NOT_APPROVED_NOT_EXECUTED', 'NOT_ELIGIBLE')`,
      [approvalId, prepId, JSON.stringify(writeScope144)]
    );
  }
}

(async () => {
  console.log('=== Smoke 144D: Review Workflow Governance ===\n');

  try {
    const prepId = 'prep_d_1';
    const approvalId = 'apv_d_1';
    await setupPrepAndApproval(prepId, approvalId, 'PREPARE_HIGH_RISK_COHORT_PAUSE_APPROVAL');

    // 1. Finalize blocks before decision or evaluation
    try {
      await decision.finalizeApproval(approvalId, 'admin');
      assert.fail('Should block finalization when evaluation/decision are not done');
    } catch (e) {
      if (e.message.includes('EVALUATION_NOT_COMPLETED') || e.message.includes('DECISION_REQUIRED')) {
        console.log('  PASS: Finalization blocked before evaluation.');
      } else {
        throw e;
      }
    }

    // 2. Evaluate approval
    await evaluator.evaluateApproval(approvalId, 'admin');

    // 3. Record decision with rationale
    await decision.recordDecision(approvalId, 'APPROVE_HIGH_RISK_COHORT_PAUSE', 'Justified by security simulation outcome', 'admin');

    // 4. Build evidence pack
    await evidence.buildEvidencePack(approvalId, 'admin');

    // 5. Finalize approval
    const { approval } = await decision.finalizeApproval(approvalId, 'admin');
    assert.strictEqual(approval.approval_status, 'FINALIZED');
    assert.strictEqual(approval.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(approval.approval_execution_status, 'APPROVED_NOT_EXECUTED');
    console.log('  PASS: Approval package finalized successfully with safe non-execution markers.');

    // 6. Finalized approval cannot be modified
    try {
      await decision.recordDecision(approvalId, 'REJECT_HIGH_RISK_INTERVENTION', 'Change mind', 'admin');
      assert.fail('Should block modification on finalized approval');
    } catch (e) {
      if (e.message.includes('APPROVAL_ALREADY_FINALIZED')) {
        console.log('  PASS: Modifications blocked on finalized approval.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 144D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 144D:', e);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
