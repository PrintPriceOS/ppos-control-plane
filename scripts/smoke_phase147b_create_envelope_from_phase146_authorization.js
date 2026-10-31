'use strict';

const assert = require('assert');
const db = require('../src/api/services/mysqlClient');
const authBuilder = require('../src/api/services/cohortInterventionExecutionAuthorizationBuilderService').serviceInstance;
const envelopeBuilder = require('../src/api/services/cohortInterventionExecutionEnvelopeBuilderService').serviceInstance;

const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

async function setupAuthFixture(authId, status = 'FINALIZED', decision = 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE') {
  const writeScope = { writes_only_phase146_tables: true, wrote_phase128_to_145_operational_tables: false };
  const authRecord = {
    auth_id: authId,
    source_readiness_id: 'rd_test_147b',
    source_approval_id: 'apv_test_147b',
    source_prep_id: 'prep_test_147b',
    source_review_id: 'rev_test_147b',
    source_simulation_id: 'sim_test_147b',
    source_execution_id: 'exec_test_147b',
    cohort_id: 'cohort_test_147b',
    tenant_id: 'tenant_test_147b',
    simulation_type: 'SIMULATE_COHORT_PAUSE',
    auth_status: status,
    auth_decision: decision,
    risk_level: 'LOW',
    confidence_level: 'HIGH',
    projected_impact_score: 35.0,
    rollback_feasibility_score: 80.0,
    evidence_completeness_score: 95.0,
    guardrail_status: 'PASS',
    write_scope_status: 'PASS',
    approved_by: null,
    finalized_by: null,
    canary_envelope_json: { max_cohorts: 0, max_participants: 0 },
    auth_summary_json: {},
    impact_review_json: {},
    rollback_review_json: {},
    guardrail_review_json: {},
    write_scope_attestation_json: writeScope,
    auth_rules_json: {},
    auth_blockers_json: {},
    non_execution_attestation_json: {},
    source_readiness_hash: 'rd_hash_147b',
    source_readiness_evidence_pack_hash: 're_hash_147b',
    auth_result_hash: 'result_hash_147b',
    evidence_pack_hash: 'pack_hash_147b',
    execution_capability_status: 'EXECUTION_NOT_ENABLED',
    execution_authorization_status: 'EXECUTION_AUTHORIZED_NOT_ACTIVE',
    auth_execution_status: 'AUTHORIZATION_APPROVED_NOT_EXECUTED',
    created_at: new Date(),
    updated_at: new Date()
  };

  if (!isProdLike) {
    authBuilder._mockState.auth.set(authId, authRecord);
  } else {
    // Delete existing to clean up
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_evidence WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth_rules WHERE auth_id = ?', [authId]);
    await db.query('DELETE FROM cb_cohort_intervention_exec_auth WHERE auth_id = ?', [authId]);

    await db.query(
      `INSERT INTO cb_cohort_intervention_exec_auth
       (auth_id, source_readiness_id, source_approval_id, source_prep_id, source_review_id, source_simulation_id, source_execution_id, cohort_id, tenant_id, simulation_type,
        auth_status, auth_decision, risk_level, confidence_level, projected_impact_score, rollback_feasibility_score, evidence_completeness_score,
        guardrail_status, write_scope_status, canary_envelope_json, auth_summary_json, impact_review_json, rollback_review_json, guardrail_review_json,
        auth_rules_json, auth_blockers_json, non_execution_attestation_json, write_scope_attestation_json, source_readiness_hash, source_readiness_evidence_pack_hash,
        execution_capability_status, execution_authorization_status, auth_execution_status, auth_result_hash, evidence_pack_hash)
       VALUES (?, 'rd_test_147b', 'apv_test_147b', 'prep_test_147b', 'rev_test_147b', 'sim_test_147b', 'exec_test_147b', 'cohort_test_147b', 'tenant_test_147b', 'SIMULATE_COHORT_PAUSE',
        ?, ?, 'LOW', 'HIGH', 35.0, 80.0, 95.0, 'PASS', 'PASS', '{"max_cohorts":0, "max_participants":0}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', ?, 'rd_hash_147b', 're_hash_147b', 'EXECUTION_NOT_ENABLED', 'EXECUTION_AUTHORIZED_NOT_ACTIVE', 'AUTHORIZATION_APPROVED_NOT_EXECUTED', 'result_hash_147b', 'pack_hash_147b')`,
      [authId, status, decision, JSON.stringify(writeScope)]
    );
  }
}

(async () => {
  console.log('=== Smoke 147B: Create Envelope from Phase 146 Authorization ===\n');

  try {
    // 1. Positive: create from finalized approved auth record
    const finalizedId = 'ath_finalized_147b';
    await setupAuthFixture(finalizedId, 'FINALIZED', 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE');
    
    const { envelope } = await envelopeBuilder.createEnvelope(finalizedId, 'admin');
    assert.ok(envelope.envelope_id, 'envelope_id should exist');
    assert.strictEqual(envelope.source_auth_id, finalizedId);
    assert.strictEqual(envelope.envelope_status, 'DRAFT');
    console.log('  PASS: Draft envelope created successfully from finalized and approved authorization.');

    // 2. Negative: block from DRAFT authorization
    const draftId = 'ath_draft_147b';
    await setupAuthFixture(draftId, 'DRAFT', 'AUTHORIZE_CONTROLLED_EXECUTION_NOT_ACTIVE');
    try {
      await envelopeBuilder.createEnvelope(draftId, 'admin');
      assert.fail('Should have failed creating envelope from DRAFT authorization');
    } catch (e) {
      if (e.message.includes('PHASE146_AUTHORIZATION_NOT_FINALIZED')) {
        console.log('  PASS: Correctly blocked envelope draft creation from non-finalized authorization.');
      } else {
        throw e;
      }
    }

    console.log('\nSmoke 147B: Passed.');
    process.exit(0);
  } catch (e) {
    console.error('FAIL in 147B:', e.message);
    process.exit(1);
  } finally {
    if (isProdLike && db.closePool) await db.closePool().catch(() => {});
  }
})();
