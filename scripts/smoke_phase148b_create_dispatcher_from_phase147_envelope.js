'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const envelopeBuilder = require('../src/api/services/cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;
const dispatcherBuilder = require('../src/api/services/cohortInterventionExecutionDispatcherBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupEnvelopeFixture(envelopeId, status = 'FINALIZED', result = 'NO_OP_EXECUTED_NOT_MUTATED') {
  const writeScope147 = { writes_only_phase147_tables: true, wrote_phase128_to_146_operational_tables: false };
  const nonExecution147 = { safe_workflow_boundary_preserved: true, execution_enforcement_disabled: true, no_runtime_mutations: true };
  const envelopeRecord = {
    envelope_id: envelopeId,
    source_auth_id: 'ath_test_148b',
    source_readiness_id: 'rd_test_148b',
    source_approval_id: 'apv_test_148b',
    source_prep_id: 'prep_test_148b',
    source_review_id: 'rev_test_148b',
    source_simulation_id: 'sim_test_148b',
    source_execution_id: 'exec_test_148b',
    cohort_id: 'cohort_test_148b',
    tenant_id: 'tenant_test_148b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    envelope_status: status,
    envelope_result: result,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    canary_envelope_json: { mode: 'NO_OP', max_cohorts: 0, max_participants: 0 },
    envelope_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    envelope_rules_json: {},
    envelope_blockers_json: {},
    non_execution_attestation_json: nonExecution147,
    write_scope_attestation_json: writeScope147,
    source_auth_hash: 'auth_hash_148b',
    source_auth_evidence_pack_hash: 'ae_hash_148b',
    envelope_result_hash: 'result_hash_148b',
    evidence_pack_hash: 'pack_hash_148b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    envelope_execution_status: 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING',
    no_op_execution_result: 'NO_OP_EXECUTED_NOT_MUTATED',
    runtime_mutation_status: 'ZERO_RUNTIME_MUTATION_CONFIRMED',
    job_dispatch_status: 'NO_JOB_DISPATCHED',
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
    envelopeBuilder._mockState.envelope.set(envelopeId, envelopeRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_envelope_rules WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_envelope_evidence WHERE envelope_id = ?', [envelopeId]);
    await db.query('DELETE FROM cb_cohort_intervention_no_op_envelope WHERE envelope_id = ?', [envelopeId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_no_op_envelope
       (envelope_id, source_auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        envelope_status, envelope_result, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, envelope_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        envelope_rules_json, envelope_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_auth_hash, source_auth_evidence_pack_hash,
        execution_capability_status, envelope_execution_status, no_op_execution_result, runtime_mutation_status, job_dispatch_status, envelope_result_hash, evidence_pack_hash)
       VALUES (?, 'ath_test_148b', 'rd_test_148b', 'apv_test_148b', 'prep_test_148b', 'rev_test_148b', 'sim_test_148b', 'exec_test_148b', 'cohort_test_148b', 'tenant_test_148b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"mode":"NO_OP", "max_cohorts":0, "max_participants":0}', '{}', '{}', '{}', '{}', '{}', '{}', ?, ?, 'auth_hash_148b', 'ae_hash_148b', 'EXECUTION_NOT_ENABLED', 'NO_OP_ENVELOPE_ACTIVE_NOT_MUTATING', 'NO_OP_EXECUTED_NOT_MUTATED', 'ZERO_RUNTIME_MUTATION_CONFIRMED', 'NO_JOB_DISPATCHED', 'result_hash_148b', 'pack_hash_148b')`,
      [envelopeId, status, result, JSON.stringify(nonExecution147), JSON.stringify(writeScope147)]
    );
  }
}

(async () => {
  console.log('=== Smoke 148B: Create Dispatcher from Phase 147 Envelope ===\n');

  try {
    // 1. Positive: create from finalized approved envelope record
    const finalizedId = 'env_finalized_148b';
    await setupEnvelopeFixture(finalizedId, 'FINALIZED', 'NO_OP_EXECUTED_NOT_MUTATED');
    
    const { dispatcher } = await dispatcherBuilder.createDispatcher(finalizedId, 'admin');
    assert.ok(dispatcher.dispatcher_id, 'dispatcher_id should exist');
    assert.strictEqual(dispatcher.source_envelope_id, finalizedId);
    assert.strictEqual(dispatcher.dispatcher_status, 'DRAFT');
    console.log('  PASS: Draft dispatcher created successfully from finalized and approved envelope.');

    // 2. Negative: block from DRAFT envelope
    const draftId = 'env_draft_148b';
    await setupEnvelopeFixture(draftId, 'DRAFT', 'NO_OP_EXECUTED_NOT_MUTATED');
    try {
      await dispatcherBuilder.createDispatcher(draftId, 'admin');
      assert.fail('Should have failed creating dispatcher from DRAFT envelope');
    } catch (e) {
      if (e.message.includes('PHASE147_ENVELOPE_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked dispatcher draft creation from non-finalized envelope.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 148B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 148B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
