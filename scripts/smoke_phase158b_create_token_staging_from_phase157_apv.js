'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenFinalApvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenFinalApv(apvId, status = 'FINALIZED', result = 'FINAL_APPROVED_NOT_ISSUED') {
  const writeScope157 = { writes_only_phase157_tables: true, wrote_phase128_to_156_operational_tables: false };
  const nonExecution157 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const apvConfig = {
    final_approval_mode: 'TOKEN_FINAL_ISSUANCE_APPROVAL_ONLY',
    token_final_approval_status: 'FINAL_APPROVED_NOT_ISSUED',
    token_status: 'PREPARED_NOT_ISSUED',
    token_issuance_status: 'FINAL_APPROVED_NOT_ISSUED',
    token_redeemable: false
  };

  const apvRecord = {
    activation_token_final_apv_id: apvId,
    source_activation_token_env_id: 'ate_test_158b',
    source_activation_token_auth_id: 'ath_test_158b',
    source_activation_handoff_id: 'ahf_test_158b',
    source_activation_decision_id: 'dec_test_158b',
    source_activation_lock_id: 'lock_test_158b',
    source_activation_auth_id: 'auth_test_158b',
    source_activation_readiness_id: 'rd_test_158b',
    source_plan_id: 'pln_test_158b',
    source_dispatcher_id: 'dsp_test_158b',
    source_envelope_id: 'env_test_158b',
    source_auth_id: 'ath_test_158b',
    source_readiness_id: 'rd_test_158b',
    source_approval_id: 'apv_test_158b',
    source_prep_id: 'prep_test_158b',
    source_review_id: 'rev_test_158b',
    source_simulation_id: 'sim_test_158b',
    source_execution_id: 'exec_test_158b',
    cohort_id: 'cohort_test_158b',
    tenant_id: 'tenant_test_158b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_final_apv_status: status,
    activation_token_final_apv_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: apvConfig,
    token_final_apv_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_final_apv_rules_json: {},
    token_final_apv_blockers_json: {},
    non_execution_attestation_json: nonExecution157,
    write_scope_attestation_json: writeScope157,
    source_activation_token_env_hash: 'token_env_hash_158b',
    source_token_material_hash: 'token_material_hash_158b',
    source_freeze_package_hash: 'lock_hash_158b',
    activation_token_final_apv_hash: 'apv_hash_158b',
    token_final_apv_evidence_pack_hash: 'pack_hash_158b',
    evidence_pack_hash: 'pack_hash_158b',
    lineage_hash_chain_json: {},
    security_chair_signature_json: {},
    final_approval_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE',
    plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED',
    queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
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
    tokenFinalApvBuilder._mockState.tokenFinalApv.set(apvId, apvRecord);
    tokenFinalApvBuilder._mockState.rules.set(apvId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv_rules WHERE activation_token_final_apv_id = ?', [apvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv_evidence WHERE activation_token_final_apv_id = ?', [apvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_final_apv WHERE activation_token_final_apv_id = ?', [apvId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv
       (activation_token_final_apv_id, source_activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_final_apv_status, activation_token_final_apv_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_final_apv_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_final_apv_rules_json, token_final_apv_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_env_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_final_apv_hash, token_final_apv_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'ath_test_158b', 'ahf_test_158b', 'dec_test_158b', 'lock_test_158b', 'auth_test_158b', 'rd_test_158b', 'pln_test_158b', 'dsp_test_158b', 'env_test_158b', 'ath_test_158b', 'rd_test_158b', 'apv_test_158b', 'prep_test_158b', 'rev_test_158b', 'sim_test_158b', 'exec_test_158b', 'cohort_test_158b', 'tenant_test_158b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, ?, ?, ?, ?, ?, 'PASS', 'PASS', ?, '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, ?, ?, ?, ?, ?, ?, 'EXECUTION_NOT_ENABLED', 'TOKEN_FINAL_APPROVAL_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        apvId,
        apvRecord.source_activation_token_env_id,
        status,
        result,
        apvRecord.risk_level,
        apvRecord.confidence_level,
        apvRecord.projected_impact_score,
        apvRecord.rollback_feasibility_score,
        apvRecord.evidence_completeness_score,
        JSON.stringify(apvConfig),
        JSON.stringify(nonExecution157),
        JSON.stringify(writeScope157),
        apvRecord.source_activation_token_env_hash,
        apvRecord.source_token_material_hash,
        apvRecord.source_freeze_package_hash,
        apvRecord.activation_token_final_apv_hash,
        apvRecord.token_final_apv_evidence_pack_hash,
        apvRecord.evidence_pack_hash
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_final_apv_evidence
       (evidence_id, activation_token_final_apv_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '157.0', 'pack_hash_158b', '{}', '{}')`,
      ['ee_' + apvId, apvId]
    );
  }
}

(async () => {
  console.log('=== Smoke 158B: Create Token Staging from Phase 157 Final Approval ===\n');

  try {
    // 1. Positive case: create draft from finalized, approved final apv
    const apvId1 = 'apv_158b_1';
    await setupTokenFinalApv(apvId1, 'FINALIZED', 'FINAL_APPROVED_NOT_ISSUED');
    
    const draftRes = await builder.createTokenStagingDraft(apvId1, 'admin');
    assert.ok(draftRes.tokenStaging);
    const draftId = draftRes.tokenStaging.activation_token_staging_id;
    assert.ok(draftId.startsWith('ats_'));
    
    const fetched = await builder.getTokenStaging(draftId);
    assert.strictEqual(fetched.activation_token_staging_status, 'DRAFT');
    assert.strictEqual(fetched.source_activation_token_final_apv_id, apvId1);
    console.log('  PASS: Draft token staging created successfully.');

    // 2. Negative case: block draft creation from non-finalized final approval
    const apvId2 = 'apv_158b_2';
    await setupTokenFinalApv(apvId2, 'DRAFT', null);
    await assert.rejects(
      builder.createTokenStagingDraft(apvId2, 'admin'),
      /TOKEN_FINAL_APPROVAL_NOT_READY/
    );
    console.log('  PASS: Correctly blocked token staging draft creation from non-finalized final approval.');

    console.log('\nSmoke 158B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 158B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
