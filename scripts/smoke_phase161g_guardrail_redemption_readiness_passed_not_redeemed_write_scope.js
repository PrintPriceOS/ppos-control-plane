'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const issuanceBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenIssuanceBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessBuilderService').serviceInstance;
const guardrailSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionReadinessGuardrailService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupFinalizedIssuance(issuanceId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase160_tables: true, wrote_phase128_to_159_operational_tables: false };
  const config = { issuance_mode: 'TOKEN_ISSUANCE_RECORD_ONLY', allow_token_issuance_record: true, allow_usable_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  const record = {
    activation_token_issuance_id: issuanceId,
    source_activation_token_preflight_id: 'atp_test_161g',
    source_activation_token_staging_id: 'ats_test_161g',
    source_activation_token_final_apv_id: 'apv_test_161g',
    source_activation_token_env_id: 'ate_test_161g',
    source_activation_handoff_id: 'ahf_test_161g',
    source_activation_decision_id: 'dec_test_161g',
    source_activation_lock_id: 'lock_test_161g',
    source_activation_auth_id: 'auth_test_161g',
    source_activation_readiness_id: 'rd_test_161g',
    source_plan_id: 'pln_test_161g',
    source_dispatcher_id: 'dsp_test_161g',
    source_envelope_id: 'env_test_161g',
    source_auth_id: 'ath_test_161g',
    source_readiness_id: 'rd_test_161g',
    source_approval_id: 'apv_test_161g',
    source_prep_id: 'prep_test_161g',
    source_review_id: null, source_simulation_id: null, source_execution_id: null,
    cohort_id: null, tenant_id: null, simulation_type: null,
    activation_token_issuance_status: 'FINALIZED',
    activation_token_issuance_result: 'ISSUANCE_RECORDED_NOT_REDEEMABLE',
    risk_level: 'LOW', confidence_level: 'HIGH',
    projected_impact_score: 30.0, rollback_feasibility_score: 85.0, evidence_completeness_score: 96.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config,
    token_issuance_summary_json: {}, impact_review_json: {}, rollback_review_json: {}, guardrail_review_json: {},
    token_issuance_rules_json: {}, token_issuance_blockers_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_preflight_hash: 'pfl_hash_161g',
    source_activation_token_staging_hash: 'stg_hash_161g', source_token_material_hash: 'token_mat_hash_161g',
    source_freeze_package_hash: 'lock_hash_161g', activation_token_issuance_hash: 'iss_hash_161g',
    token_issuance_evidence_pack_hash: 'ep_hash_161g', evidence_pack_hash: 'ep_hash_161g',
    lineage_hash_chain_json: {}, issuance_signatures_json: {}, issuance_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null,
    finalized_by: 'admin', finalized_at: new Date(), created_at: new Date(), updated_at: new Date()
  };

  if (!isProdLike) {
    issuanceBuilder._mockState.tokenIssuance.set(issuanceId, record);
    issuanceBuilder._mockState.rules.set(issuanceId, []);
  } else {
    await db.query('DELETE FROM cb_cohort_intervention_activation_token_issuance WHERE activation_token_issuance_id = ?', [issuanceId]);
    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_issuance
       (activation_token_issuance_id, source_activation_token_preflight_id, source_activation_token_staging_id, source_activation_token_final_apv_id, source_activation_token_env_id, source_activation_handoff_id, source_activation_decision_id, source_activation_lock_id, source_activation_auth_id, source_activation_readiness_id, source_plan_id, source_dispatcher_id, source_envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id,
        activation_token_issuance_status, activation_token_issuance_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, non_execution_attestation_json, write_scope_attestation_json,
        source_activation_token_preflight_hash, source_activation_token_staging_hash, source_token_material_hash, source_freeze_package_hash,
        activation_token_issuance_hash, token_issuance_evidence_pack_hash, evidence_pack_hash,
        execution_capability_status, activation_execution_status, package_freeze_status, plan_executable_status, job_creation_status, queue_dispatch_status, runtime_mutation_status)
       VALUES (?, 'atp_test_161g', 'ats_test_161g', 'apv_test_161g', 'ate_test_161g', 'ahf_test_161g', 'dec_test_161g', 'lock_test_161g', 'auth_test_161g', 'rd_test_161g', 'pln_test_161g', 'dsp_test_161g', 'env_test_161g', 'ath_test_161g', 'rd_test_161g', 'apv_test_161g', 'prep_test_161g',
        'FINALIZED', 'ISSUANCE_RECORDED_NOT_REDEEMABLE', 'LOW', 'HIGH', 30.0, 85.0, 96.0, 'PASS', 'PASS', ?, ?, ?,
        'pfl_hash_161g', 'stg_hash_161g', 'token_mat_hash_161g', 'lock_hash_161g',
        'iss_hash_161g', 'ep_hash_161g', 'ep_hash_161g',
        'EXECUTION_NOT_ENABLED', 'TOKEN_ISSUANCE_FINALIZED_NOT_REDEEMABLE_NOT_EXECUTED', 'FROZEN_IMMUTABLE', 'NOT_EXECUTABLE', 'NO_REAL_JOB_CREATED', 'NO_QUEUE_DISPATCHED', 'ZERO_RUNTIME_MUTATION_CONFIRMED')`,
      [issuanceId, JSON.stringify(config), JSON.stringify(nonExecution), JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 161G: Guardrails & Safety Boundary Scanner ===\n');

  try {
    const issuanceId = 'ati_161g_1';
    await setupFinalizedIssuance(issuanceId);

    const draft = await builder.createTokenRedemptionReadinessDraft(issuanceId, 'admin');
    const readinessId = draft.tokenRedemptionReadiness.activation_token_redemption_readiness_id;

    // 1. Safety scanner
    const scanFindings = await guardrailSvc.performSafetyScannerCheck(readinessId);
    const hasCritical = scanFindings.some(f => f.severity === 'CRITICAL');
    assert.strictEqual(hasCritical, false, `Forbidden active execution pattern found: ${JSON.stringify(scanFindings.filter(f => f.severity === 'CRITICAL'))}`);
    console.log('  PASS: Scanned Phase 161 components - safety boundary clean.');

    // 2. Valid write scope
    const wsFindings = await guardrailSvc.verifyWriteScope(readinessId);
    const wsHasCritical = wsFindings.some(f => f.severity === 'CRITICAL');
    assert.strictEqual(wsHasCritical, false);
    console.log('  PASS: Verified write scope boundaries.');

    // 3. Invalid write scope blocked
    await builder._internalUpdateTokenRedemptionReadiness(readinessId, {
      write_scope_attestation_json: { writes_only_phase161_tables: false, wrote_phase128_to_160_operational_tables: true }
    });
    const invalidWsFindings = await guardrailSvc.verifyWriteScope(readinessId);
    const invalidWsHasCritical = invalidWsFindings.some(f => f.severity === 'CRITICAL');
    assert.strictEqual(invalidWsHasCritical, true);
    console.log('  PASS: Blocked invalid write scope attestation.');

    console.log('\nSmoke 161G: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 161G:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
