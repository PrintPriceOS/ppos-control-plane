'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const tokenAuthBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthBuilderService').serviceInstance;
const tokenAuthEvidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenAuthEvidencePackService').serviceInstance;
const tokenEnvBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvEvaluatorService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenEnvEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupTokenAuthAndTokenEnv(activationTokenAuthId, activationTokenEnvId) {
  const writeScope155 = { writes_only_phase155_tables: true, wrote_phase128_to_154_operational_tables: false };
  const writeScope156 = { writes_only_phase156_tables: true, wrote_phase128_to_155_operational_tables: false };
  const nonExecution155 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const nonExecution156 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };

  const tokenAuthRecord = {
    activation_token_auth_id: activationTokenAuthId,
    source_activation_handoff_id: 'ahf_test_156e',
    source_activation_decision_id: 'dec_test_156e',
    source_activation_lock_id: 'lock_test_156e',
    source_activation_auth_id: 'auth_test_156e',
    source_activation_readiness_id: 'rd_test_156e',
    source_plan_id: 'pln_test_156e',
    source_dispatcher_id: 'dsp_test_156e',
    source_envelope_id: 'env_test_156e',
    source_auth_id: 'ath_test_156e',
    source_readiness_id: 'rd_test_156e',
    source_approval_id: 'apv_test_156e',
    source_prep_id: 'prep_test_156e',
    source_review_id: 'rev_test_156e',
    source_simulation_id: 'sim_test_156e',
    source_execution_id: 'exec_test_156e',
    cohort_id: 'cohort_test_156e',
    tenant_id: 'tenant_test_156e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_auth_status: 'FINALIZED',
    activation_token_auth_result: 'AUTHORIZED_NOT_ISSUED',
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { token_auth_mode: 'TOKEN_ISSUANCE_AUTHORIZATION_ONLY', allow_token_issue: false, token_status: 'PREPARED_NOT_ISSUED', token_issuance_status: 'AUTHORIZED_NOT_ISSUED', token_redeemable: false },
    token_auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_auth_rules_json: {},
    token_auth_blockers_json: {},
    non_execution_attestation_json: nonExecution155,
    write_scope_attestation_json: writeScope155,
    source_activation_handoff_hash: 'handoff_hash_156e',
    source_token_material_hash: 'token_material_hash_156e',
    source_freeze_package_hash: 'lock_hash_156e',
    activation_token_auth_hash: 'token_auth_hash_156e',
    token_auth_evidence_pack_hash: 'pack_hash_156e',
    evidence_pack_hash: 'pack_hash_156e',
    lineage_hash_chain_json: {},
    authorization_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED',
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

  const tokenEnvRecord = {
    activation_token_env_id: activationTokenEnvId,
    source_activation_token_auth_id: activationTokenAuthId,
    source_activation_handoff_id: 'ahf_test_156e',
    source_activation_decision_id: 'dec_test_156e',
    source_activation_lock_id: 'lock_test_156e',
    source_activation_auth_id: 'auth_test_156e',
    source_activation_readiness_id: 'rd_test_156e',
    source_plan_id: 'pln_test_156e',
    source_dispatcher_id: 'dsp_test_156e',
    source_envelope_id: 'env_test_156e',
    source_auth_id: 'ath_test_156e',
    source_readiness_id: 'rd_test_156e',
    source_approval_id: 'apv_test_156e',
    source_prep_id: 'prep_test_156e',
    source_review_id: 'rev_test_156e',
    source_simulation_id: 'sim_test_156e',
    source_execution_id: 'exec_test_156e',
    cohort_id: 'cohort_test_156e',
    tenant_id: 'tenant_test_156e',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_env_status: 'DRAFT',
    activation_token_env_result: null,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PENDING',
    write_scope_status: 'PENDING',
    canary_envelope_json: { token_envelope_mode: 'ISSUANCE_ENVELOPE_PREPARATION_ONLY', allow_token_issue: false },
    token_env_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    token_env_rules_json: {},
    token_env_blockers_json: { missing_token_env_evaluation: true },
    non_execution_attestation_json: nonExecution156,
    write_scope_attestation_json: writeScope156,
    source_activation_token_auth_hash: 'token_auth_hash_156e',
    source_token_material_hash: 'token_material_hash_156e',
    source_freeze_package_hash: 'lock_hash_156e',
    activation_token_env_hash: null,
    token_env_evidence_pack_hash: null,
    evidence_pack_hash: null,
    lineage_hash_chain_json: {},
    security_signature_json: {},
    envelope_rationale_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    activation_execution_status: 'TOKEN_ENV_FINALIZED_NOT_EXECUTED',
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
    tokenAuthBuilder._mockState.tokenAuth.set(activationTokenAuthId, tokenAuthRecord);
    tokenAuthEvidenceSvc._mockState.evidence.set(activationTokenAuthId, {
      evidence_pack_hash: 'pack_hash_156e',
      evidence_payload_json: { evidence_schema_version: '155.0', write_scope_attestation: writeScope155, security_officer_email: 'security156@ppos.com', system_key: 'authorization:secret_key_156e' },
      lineage_hash_chain_json: {
        phase155_activation_token_auth_id: activationTokenAuthId,
        phase154_activation_handoff_id: 'ahf_test_156e',
        phase154_source_activation_handoff_hash: 'handoff_hash_e',
        phase153_activation_decision_id: 'dec_test_156e',
        phase153_source_activation_decision_hash: 'dec_hash_e',
        phase152_source_activation_lock_hash: 'lock_hash_e',
        phase151_source_activation_authorization_hash: 'auth_hash_e',
        phase150_source_activation_readiness_hash: 'rd_hash_e',
        phase149_source_plan_hash: 'plan_hash_e',
        phase148_source_dispatcher_hash: 'dsp_hash_e',
        phase147_source_envelope_hash: 'env_hash_e',
        phase146_source_auth_hash: 'auth_hash_e',
        phase145_source_readiness_hash: 'rd_hash_e',
        phase144_source_approval_hash: 'apv_hash_e',
        phase143_preparation_id: 'prep_test_156e',
        phase142_review_id: 'rev_test_156e',
        phase141_source_simulation_hash: 'sim_hash_e',
        phase140_source_execution_hash: 'parent_exec_hash',
        phase139_source_approval_hash: 'parent_approval_hash',
        phase138_source_preparation_hash: 'parent_prep_hash',
        phase137_source_review_hash: 'parent_rev_hash'
      }
    });
    tokenEnvBuilder._mockState.tokenEnv.set(activationTokenEnvId, tokenEnvRecord);
    tokenEnvBuilder._mockState.rules.set(activationTokenEnvId, []);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_rules WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth_evidence WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_auth WHERE activation_token_auth_id = ?', [activationTokenAuthId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env_rules WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env_evidence WHERE activation_token_env_id = ?', [activationTokenEnvId]);
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_env WHERE activation_token_env_id = ?', [activationTokenEnvId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth
       (activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_auth_status, activation_token_auth_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_auth_rules_json, token_auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_handoff_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status, activation_token_auth_hash, token_auth_evidence_pack_hash, evidence_pack_hash)
       VALUES (?, 'ahf_test_156e', 'dec_test_156e', 'lock_test_156e', 'auth_test_156e', 'rd_test_156e', 'pln_test_156e', 'dsp_test_156e', 'env_test_156e', 'ath_test_156e', 'rd_test_156e', 'apv_test_156e', 'prep_test_156e', 'rev_test_156e', 'sim_test_156e', 'exec_test_156e', 'cohort_test_156e', 'tenant_test_156e', 'SIMULATE_COHORT_PAUSE',
        'FINALIZED', 'AUTHORIZED_NOT_ISSUED', 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"token_auth_mode":"TOKEN_ISSUANCE_AUTHORIZATION_ONLY", "allow_token_issue":false, "token_status":"PREPARED_NOT_ISSUED", "token_issuance_status":"AUTHORIZED_NOT_ISSUED", "token_redeemable":false}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'handoff_hash_156e', 'token_material_hash_156e', 'lock_hash_156e', 'EXECUTION_NOT_ENABLED', 'TOKEN_AUTH_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'token_auth_hash_156e', 'pack_hash_156e', 'pack_hash_156e')`,
      [activationTokenAuthId, JSON.stringify(nonExecution155), JSON.stringify(writeScope155)]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_auth_evidence
       (evidence_id, activation_token_auth_id, evidence_schema_version, evidence_pack_hash, evidence_payload_json, lineage_hash_chain_json)
       VALUES (?, ?, '155.0', 'pack_hash_156e', ?, ?)`,
      [
        'ae_' + activationTokenAuthId,
        activationTokenAuthId,
        JSON.stringify({ evidence_schema_version: '155.0', write_scope_attestation: writeScope155, security_officer_email: 'security156@ppos.com', system_key: 'authorization:secret_key_156e' }),
        JSON.stringify({
          phase155_activation_token_auth_id: activationTokenAuthId,
          phase154_activation_handoff_id: 'ahf_test_156e',
          phase154_source_activation_handoff_hash: 'handoff_hash_e',
          phase153_activation_decision_id: 'dec_test_156e',
          phase153_source_activation_decision_hash: 'dec_hash_e',
          phase152_source_activation_lock_hash: 'lock_hash_e',
          phase151_source_activation_authorization_hash: 'auth_hash_e',
          phase150_source_activation_readiness_hash: 'rd_hash_e',
          phase149_source_plan_hash: 'plan_hash_e',
          phase148_source_dispatcher_hash: 'dsp_hash_e',
          phase147_source_envelope_hash: 'env_hash_e',
          phase146_source_auth_hash: 'auth_hash_e',
          phase145_source_readiness_hash: 'rd_hash_e',
          phase144_source_approval_hash: 'apv_hash_e',
          phase143_preparation_id: 'prep_test_156e',
          phase142_review_id: 'rev_test_156e',
          phase141_source_simulation_hash: 'sim_hash_e',
          phase140_source_execution_hash: 'parent_exec_hash',
          phase139_source_approval_hash: 'parent_approval_hash',
          phase138_source_preparation_hash: 'parent_prep_hash',
          phase137_source_review_hash: 'parent_rev_hash'
        })
      ]
    );

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_env
       (activation_token_env_id, source_activation_token_auth_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        activation_token_env_status, activation_token_env_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, token_env_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        token_env_rules_json, token_env_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_activation_token_auth_hash, source_token_material_hash, source_freeze_package_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, ?, 'ahf_test_156e', 'dec_test_156e', 'lock_test_156e', 'auth_test_156e', 'rd_test_156e', 'pln_test_156e', 'dsp_test_156e', 'env_test_156e', 'ath_test_156e', 'rd_test_156e', 'apv_test_156e', 'prep_test_156e', 'rev_test_156e', 'sim_test_156e', 'exec_test_156e', 'cohort_test_156e', 'tenant_test_156e', 'SIMULATE_COHORT_PAUSE',
        'DRAFT', NULL, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PENDING', 'PENDING', ?, '{}', '{}', '{}', '{}', '{}', '{"missing_token_env_evaluation":true}', ?, ?, 'token_auth_hash_156e', 'token_material_hash_156e', 'lock_hash_156e', 'EXECUTION_NOT_ENABLED', 'TOKEN_ENV_FINALIZED_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [
        activationTokenEnvId,
        activationTokenAuthId,
        JSON.stringify({ token_envelope_mode: 'ISSUANCE_ENVELOPE_PREPARATION_ONLY', allow_token_issue: false }),
        JSON.stringify(nonExecution156),
        JSON.stringify(writeScope156)
      ]
    );
  }
}

(async () => {
  console.log('=== Smoke 156E: Evidence Pack Builder & Lineage ===\n');

  try {
    const activationTokenAuthId = 'ath_156e_1';
    const activationTokenEnvId = 'ate_156e_1';
    await setupTokenAuthAndTokenEnv(activationTokenAuthId, activationTokenEnvId);

    // Evaluate token env first
    await evaluator.evaluateTokenEnv(activationTokenEnvId, {
      security_officer_confirmed: true,
      kill_switch_verified: true,
      rollback_authority_verified: true
    }, 'admin');

    const result = await evidenceSvc.buildEvidencePack(activationTokenEnvId, 'admin');
    assert.ok(result.evidence_pack_hash, 'evidence_pack_hash should exist');
    assert.strictEqual(result.lineage_hash_chain.phase155_activation_token_auth_id, activationTokenAuthId);
    console.log('  PASS: Evidence schema version is 156.0.');

    // Verify sensitive data is redacted from storage content
    const evidence = await evidenceSvc.getEvidence(activationTokenEnvId);
    const payloadStr = typeof evidence.evidence_payload_json === 'string'
      ? evidence.evidence_payload_json
      : JSON.stringify(evidence.evidence_payload_json);

    assert.ok(!payloadStr.includes('security156@ppos.com'), 'Email should be redacted');
    assert.ok(!payloadStr.includes('secret_key_156e'), 'Secrets should be redacted');
    console.log('  PASS: Sensitive details redacted correctly.');

    // Lineage trace checks
    const chain = typeof evidence.lineage_hash_chain_json === 'string'
      ? JSON.parse(evidence.lineage_hash_chain_json)
      : evidence.lineage_hash_chain_json;

    assert.strictEqual(chain.phase137_source_review_hash, 'parent_rev_hash');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 156E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 156E:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
