'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const approvalBuilder = require('../src/api/services/cohortInterventionSimulationApprovalBuilderService').serviceInstance || require('../src/api/services/cohortInterventionSimulationApprovalBuilderService');
const readinessBuilder = require('../src/api/services/cohortInterventionExecutionReadinessBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupApprovalFixture(approvalId, status = 'FINALIZED', decision = 'APPROVE_HIGH_RISK_COHORT_PAUSE') {
  const writeScope = { writes_only_phase144_tables: true, wrote_phase128_to_143_operational_tables: false };
  const approvalRecord = {
    approval_id: approvalId,
    source_prep_id: 'prep_test_145b',
    source_review_id: 'rev_test_145b',
    source_simulation_id: 'sim_test_145b',
    source_execution_id: 'exec_test_145b',
    cohort_id: 'cohort_test_145b',
    tenant_id: 'tenant_test_145b',
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
    source_prep_hash: 'prep_hash_145b',
    source_prep_evidence_pack_hash: 'ev_hash_145b',
    approval_result_hash: 'result_hash_145b',
    evidence_pack_hash: 'pack_hash_145b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    approval_execution_status: 'APPROVED_NOT_EXECUTED',
    future_execution_eligibility_status: 'ELIGIBLE_FOR_FUTURE_CONTROLLED_EXECUTION_GATE',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    approvalBuilder._mockState.approvals.set(approvalId, approvalRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_evidence WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approval_findings WHERE approval_id = ?', [approvalId]);
    await db.query('DELETE FROM controlled_beta_cohort_intervention_approvals WHERE approval_id = ?', [approvalId]);

    await db.query(
      `INSERT INTO controlled_beta_cohort_intervention_approvals
       (approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        approval_status, approval_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score,
        evidence_completeness_score, guardrail_status, write_scope_status, approval_summary_json, impact_review_json,
        rollback_review_json, guardrail_review_json, write_scope_attestation_json, approval_readiness_json,
        approval_blockers_json, non_execution_attestation_json, source_prep_hash, source_prep_evidence_pack_hash,
        execution_capability_status, approval_execution_status, future_execution_eligibility_status, approval_result_hash, evidence_pack_hash)
       VALUES (?, 'prep_test_145b', 'rev_test_145b', 'sim_test_145b', 'exec_test_145b', 'cohort_test_145b', 'tenant_test_145b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{}', '{}', '{}', '{}', ?, '{}', '{}', '{}', 'prep_hash_145b', 'ev_hash_145b', 'EXECUTION_NOT_ENABLED', 'APPROVED_NOT_EXECUTED', 'ELIGIBLE_FOR_FUTURE_CONTROLLED_EXECUTION_GATE', 'result_hash_145b', 'pack_hash_145b')`,
      [approvalId, status, decision, JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 145B: Create Readiness from Phase 144 Approval ===\n');

  try {
    // 1. Positive: create from finalized approved record
    const finalizedId = 'apv_finalized_145b';
    await setupApprovalFixture(finalizedId, 'FINALIZED', 'APPROVE_HIGH_RISK_COHORT_PAUSE');
    
    const { readiness } = await readinessBuilder.createReadiness(finalizedId, 'admin');
    assert.ok(readiness.readiness_id, 'readiness_id should exist');
    assert.strictEqual(readiness.source_approval_id, finalizedId);
    assert.strictEqual(readiness.readiness_status, 'DRAFT');
    console.log('  PASS: Draft readiness created successfully from finalized and approved record.');

    // 2. Negative: block from DRAFT approval
    const draftId = 'apv_draft_145b';
    await setupApprovalFixture(draftId, 'DRAFT', 'APPROVE_HIGH_RISK_COHORT_PAUSE');
    try {
      await readinessBuilder.createReadiness(draftId, 'admin');
      assert.fail('Should have failed creating readiness from DRAFT approval');
    } catch (e) {
      if (e.message.includes('PHASE144_APPROVAL_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked readiness draft creation from non-finalized approval.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 145B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 145B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
