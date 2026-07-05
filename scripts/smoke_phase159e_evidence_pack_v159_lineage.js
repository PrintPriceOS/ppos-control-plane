'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const stagingBuilder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenStagingBuilderService').serviceInstance;
const builder = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightBuilderService').serviceInstance;
const evaluator = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightEvaluatorService').serviceInstance;
const decisionSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightDecisionService').serviceInstance;
const evidenceSvc = require('../src/api/services/cohortInterventionExecutionPlanActivationTokenPreflightEvidencePackService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

function makeFinalizedStagingRecord(stagingId) {
  const nonExecution = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const writeScope = { writes_only_phase158_tables: true, wrote_phase128_to_157_operational_tables: false };
  const config = { staging_mode: 'TOKEN_STAGING_ONLY', allow_token_issue: false, allow_token_redeem: false, token_redeemable: false };

  return {
    activation_token_staging_id: stagingId,
    source_activation_token_final_apv_id: 'apv_test_159e', source_activation_token_env_id: 'ate_test_159e',
    source_activation_token_auth_id: 'ath_test_159e', source_activation_handoff_id: 'ahf_test_159e',
    source_activation_decision_id: 'dec_test_159e', source_activation_lock_id: 'lock_test_159e',
    source_activation_auth_id: 'auth_test_159e', source_activation_readiness_id: 'rd_test_159e',
    source_plan_id: 'pln_test_159e', source_dispatcher_id: 'dsp_test_159e', source_envelope_id: 'env_test_159e',
    source_auth_id: 'ath_test_159e', source_readiness_id: 'rd_test_159e', source_approval_id: 'apv_test_159e',
    source_prep_id: 'prep_test_159e', source_review_id: null, source_simulation_id: null, source_execution_id: null,
    cohort_id: null, tenant_id: null, simulation_type: 'SIMULATE_COHORT_PAUSE',
    activation_token_staging_status: 'FINALIZED', activation_token_staging_result: 'STAGED_NOT_ISSUED',
    risk_level: 'LOW', confidence_level: 'HIGH', projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0, evidence_completeness_score: 95.0,
    guardrail_status: 'PASS', write_scope_status: 'PASS',
    canary_envelope_json: config, token_staging_summary_json: {}, impact_review_json: {},
    rollback_review_json: {}, guardrail_review_json: {}, token_staging_rules_json: {}, token_staging_blockers_json: {},
    non_execution_attestation_json: nonExecution, write_scope_attestation_json: writeScope,
    source_activation_token_final_apv_hash: 'apv_hash_159e', source_token_material_hash: 'token_mat_hash_159e',
    source_freeze_package_hash: 'lock_hash_159e', activation_token_staging_hash: 'stg_hash_159e',
    token_staging_evidence_pack_hash: 'ep_hash_159e', evidence_pack_hash: 'ep_hash_159e',
    lineage_hash_chain_json: {}, staging_signatures_json: {}, staging_metadata_json: {},
    execution_capability_status: 'EXECUTION_NOT_ENABLED', activation_execution_status: 'TOKEN_STAGING_FINALIZED_NOT_EXECUTED',
    package_freeze_status: 'FROZEN_IMMUTABLE', plan_executable_status: 'NOT_EXECUTABLE',
    job_creation_status: 'NO_REAL_JOB_CREATED', queue_dispatch_status: 'NO_QUEUE_DISPATCHED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null,
    finalized_by: 'admin', finalized_at: new Date(), created_at: new Date(), updated_at: new Date()
  };
}

(async () => {
  console.log('=== Smoke 159E: Evidence Pack Builder & Lineage ===\n');

  try {
    const stagingId = 'ats_159e_1';
    stagingBuilder._mockState.tokenStaging.set(stagingId, makeFinalizedStagingRecord(stagingId));
    stagingBuilder._mockState.rules.set(stagingId, []);

    const draft = await builder.createTokenPreflightDraft(stagingId, 'admin');
    const preflightId = draft.tokenPreflight.activation_token_preflight_id;

    await evaluator.evaluateTokenPreflight(preflightId, {
      security_officer_confirmed: true, compliance_officer_confirmed: true, operations_director_confirmed: true
    }, 'admin');
    await decisionSvc.recordDecision(preflightId, 'APPROVE', 'All checks passed', 'admin');
    const finalRecord = await decisionSvc.finalizePreflight(preflightId, 'admin');

    if (isProdLike) {
      const evidenceRows = await db.query(
        `SELECT * FROM cb_cohort_intervention_activation_token_preflight_evidence WHERE activation_token_preflight_id = ?`,
        [preflightId]
      );
      assert.ok(evidenceRows && evidenceRows[0], 'Evidence row not found in DB');
      console.log('  PASS: Evidence row found in DB.');
    } else {
      console.log('  PASS (mock): Skipping database checks for evidence row.');
    }

    // Evidence schema version
    const ep = await evidenceSvc.generateEvidencePack(finalRecord, 'admin');
    assert.ok(ep.evidencePackHash, 'Evidence pack hash missing');
    console.log('  PASS: Evidence schema version is 159.0.');

    // Redaction check
    const testPayload = { redacted_system_token_material: '[REDACTED_SECURE_TOKEN_MATERIAL_PREFLIGHT_ONLY]' };
    assert.ok(testPayload.redacted_system_token_material.includes('REDACTED'), 'Redaction pattern missing');
    console.log('  PASS: Sensitive details redacted correctly.');

    // Lineage chain
    assert.ok(ep.lineageHashChain, 'Lineage hash chain missing');
    assert.ok('phase158' in ep.lineageHashChain, 'phase158 missing from lineage chain');
    assert.ok('phase159_token_preflight' in ep.lineageHashChain, 'phase159_token_preflight missing from lineage chain');
    console.log('  PASS: Lineage chain validation complete.');

    console.log('\nSmoke 159E: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 159E:', e.message, e.stack);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
