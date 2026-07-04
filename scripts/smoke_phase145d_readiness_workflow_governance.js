'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const approvalBuilder = require('../src/api/services/cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalBuilderService');
const approvalEvidenceSvc = require('../src/api/services/cohortInterventionSimulationApprovalEvidencePackService').serviceInstance;
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionReadinessBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionReadinessEvaluatorService').serviceInstance;
const decision = require('../src/api/services/cohortInterventionExecutionReadinessDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionReadinessEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupApprovalAndReadiness(approvalId, readinessId, status = 'FINALIZED', decision = 'APPROVE_HIGH_RISK_COHORT_PAUSE') {
  const writeScope = { writes_only_phase144_tables: true, wrote_phase128_to_143_operational_tables: false };
  const writeScope145 = { writes_only_phase145_tables: true, wrote_phase128_to_144_operational_tables: false };
  const nonExecution145 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  
  const approvalRecord = {
    approval_id: approvalId,
    source_prep_id: 'prep_test_145d',
    source_review_id: 'rev_test_145d',
    source_simulation_id: 'sim_test_145d',
    source_execution_id: 'exec_test_145d',
    cohort_id: 'cohort_test_145d',
    tenant_id: 'tenant_test_145d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    approval_status: status,
    approval_decision: decision,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    approved_by: null,
    finalized_by: null,
    approval_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    approval_readiness_json: {},
    approval_blockers_json: {},
    non_execution_attestation_json: {},
    source_prep_hash: 'prep_hash_145d',
    source_prep_evidence_pack_hash: 'ev_hash_145d',
    approval_result_hash: 'result_hash_145d',
    evidence_pack_hash: 'pack_hash_145d',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'APPROVED_NOT_EXECUTED',
    future_execution_eligibility_status: 'ELIGIBLE_FOR_FUTURE_CONTROLLED_EXECUTION_GATE',
    created_at: new Date(),
    updated_at: new Date()
  };

  const readinessRecord = {
    readiness_id: readinessId,
    source_approval_id: approvalId,
    source_prep_id: 'prep_test_145d',
    source_review_id: 'rev_test_145d',
    source_simulation_id: 'sim_test_145d',
    source_execution_id: 'exec_test_145d',
    cohort_id: 'cohort_test_145d',
    tenant_id: 'tenant_test_145d',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    readiness_status: 'DRAFT',
    readiness_decision: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    kill_switch_status: 'PENDING',
    rollback_authority_status: 'PENDING',
    readiness_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    readiness_checks_json: {},
    readiness_blockers_json: { missing_readiness_evaluation: true },
    non_execution_attestation_json: nonExecution145,
    write_scope_attestation_json: writeScope145,
    source_approval_hash: 'result_hash_145d',
    source_approval_evidence_pack_hash: 'pack_hash_145d',
    readiness_result_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_readiness_status: 'EXECUTION_READY_NOT_ACTIVE',
    readiness_execution_status: 'READINESS_APPROVED_NOT_EXECUTED',
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    finalized_by: null,
    finalized_at: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    approvalBuilder._mockState.approvals.set(approvalId, approvalRecord);
    approvalEvidenceSvc._mockState.evidence.set(approvalId, {
      evidence_pack_hash: 'pack_hash_145d',
      evidence_payload_json: { evidence_schema_version: '144.0', write_scope_attestation: writeScope },
      lineage_hash_chain_json: {
        phase144_approval_id: approvalId,
        phase143_preparation_id: 'prep_test_145d',
        phase142_review_id: 'rev_test_145d',
        phase141_source_simulation_hash: 'sim_hash_d',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    readinessBuilder._mockState.readiness.set(readinessId, readinessRecord);
    readinessBuilder._mockState.checks.set(readinessId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_evidence WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_findings WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approvals WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_ready_checks WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_ready_evidence WHERE readiness_id = ?', [readinessId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_readiness WHERE readiness_id = ?', [readinessId]);

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_approvals
       (approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        approval_status, approval_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, approval_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        approval_blockers_json, non_execution_attestation_json, source_prep_hash, source_prep_evidence_pack_hash,
        execution_capability_status, approval_execution_status, future_execution_eligibility_status, approval_result_hash, evidence_pack_hash)
       VALUES (?, 'prep_test_145d', 'rev_test_145d', 'sim_test_145d', 'exec_test_145d', 'cohort_test_145d', 'tenant_test_145d', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'prep_hash_145d', 'ev_hash_145d', 'EXECUTION_NOT_ENABLED', 'APPROVED_NOT_EXECUTED', 'ELIGIBLE_FOR_FUTURE_CONTROLLED_EXECUTION_GATE', 'result_hash_145d', 'pack_hash_145d')`,
      [approvalId, status, decision, JSON.stringify(writeScope)]
    );

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_approval_evidence
       (evidence_id, approval_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '144.0', 'pack_hash_145d', ?, ?)`,
      [
        'ae_' + approvalId,
        approvalId,
        JSON.stringify({ evidence_schema_version: '144.0', write_scope_attestation: writeScope }),
        JSON.stringify({
          phase144_approval_id: approvalId,
          phase143_preparation_id: 'prep_test_145d',
          phase142_review_id: 'rev_test_145d',
          phase141_source_simulation_hash: 'sim_hash_d',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_readiness
       (readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        readiness_status, readiness_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, kill_switch_status, rollback_authority_status, readiness_summary_json, impact_review_json, rollback_review_json,
        guardrail_review_json, readiness_checks_json, readiness_blockers_json, non_execution_attestation_json, write_scope_attestation_json,
        source_approval_hash, source_approval_evidence_pack_hash, execution_capability_status, execution_readiness_status, readiness_execution_status)
       VALUES (?, ?, 'prep_test_145d', 'rev_test_145d', 'sim_test_145d', 'exec_test_145d', 'cohort_test_145d', 'tenant_test_145d', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', 'PENDING', 'PENDING', '{}', '{}', '{}', '{}', '{}', '{"missing_readiness_evaluation":true}', ?, ?, 'result_hash_145d', 'pack_hash_145d', 'EXECUTION_NOT_ENABLED', 'EXECUTION_READY_NOT_ACTIVE', 'READINESS_APPROVED_NOT_EXECUTED')`,
      [readinessId, approvalId, JSON.stringify(nonExecution145), JSON.stringify(writeScope145)]
    );
  }
}

(async () => {
  console.log('=== Smoke 145D: Review Workflow Governance ===\n');

  try {
    const approvalId = 'apv_145d_1';
    const readinessId = 'rd_145d_1';
    await setupApprovalAndReadiness(approvalId, readinessId);

    // 1. Finalization blocks before evaluation
    try {
      await decision.finalizeReadiness(readinessId, 'admin');
      assert.fail('Should block finalization when evaluation/decision are not done');
    } catch (e) {
      if (e.message.includes('READINESS_EVALUATION_NOT_COMPLETED') || e.message.includes('READINESS_DECISION_REQUIRED')) {
        console.log('  PASS: Finalization blocked before evaluation.');
      } else {
        throw e;
      }
    }

    // 2. Evaluate
    await evaluator.evaluateReadiness(readinessId, {
      kill_switch_configured: true,
      rollback_authority_assigned: true,
      canary_available: true
    }, 'admin');

    // 3. Record decision
    await decision.recordDecision(readinessId, 'APPROVE_EXECUTION_READINESS_NOT_EXECUTED', 'Canary no-op path and kill-switch fully validated.', 'admin');

    // 4. Build evidence
    await evidenceSvc.buildEvidencePack(readinessId, 'admin');

    // 5. Finalize
    const { readiness } = await decision.finalizeReadiness(readinessId, 'admin');
    assert.strictEqual(readiness.readiness_status, 'FINALIZED');
    assert.strictEqual(readiness.execution_capability_status, 'EXECUTION_NOT_ENABLED');
    assert.strictEqual(readiness.execution_readiness_status, 'EXECUTION_READY_NOT_ACTIVE');
    assert.strictEqual(readiness.readiness_execution_status, 'READINESS_APPROVED_NOT_EXECUTED');
    console.log('  PASS: Readiness package finalized successfully with safe non-execution markers.');

    // 6. Block modification after finalization
    try {
      await decision.recordDecision(readinessId, 'REJECT_EXECUTION_READINESS', 'Change mind', 'admin');
      assert.fail('Should block modifications on finalized readiness');
    } catch (e) {
      if (e.message.includes('READINESS_RECORD_ALREADY_FINALIZED')) {
        console.log('  PASS: Modifications blocked on finalized readiness.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 145D: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 145D:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
