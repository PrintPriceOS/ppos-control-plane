'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const parentBuilder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessAuditService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService {
  constructor() {
    this._mockState = {
      tokenRedemptionUnlockComplianceWitness: new Map(),
      rules: new Map()
    };
  }

  async createTokenRedemptionUnlockComplianceWitnessDraft(unlockFinalHumanAuthorizationSealId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const parent = await parentBuilder.getTokenRedemptionUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId);
    if (!parent) {
      throw new Error(`Parent final human authorization seal ${unlockFinalHumanAuthorizationSealId} not found.`);
    }

    if (parent.unlock_final_human_authorization_seal_status !== 'FINALIZED' || parent.unlock_final_human_authorization_seal_result !== 'FINAL_HUMAN_AUTHORIZATION_SEALED_NOT_UNLOCKED') {
      throw new Error(`Parent final human authorization seal must be FINALIZED and result must be FINAL_HUMAN_AUTHORIZATION_SEALED_NOT_UNLOCKED. Current status: ${parent.unlock_final_human_authorization_seal_status}, result: ${parent.unlock_final_human_authorization_seal_result}`);
    }

    const unlockComplianceWitnessId = `cwn_${crypto.randomBytes(8).toString('hex')}`;

    const record = {
      act_token_redempt_unlock_compliance_witness_id: unlockComplianceWitnessId,
      source_act_token_redempt_unlock_final_human_auth_seal_id: unlockFinalHumanAuthorizationSealId,
      source_act_token_redempt_unlock_dual_control_authorization_id: parent.source_act_token_redempt_unlock_dual_control_authorization_id || 'dcau_dummy',
      source_act_token_redempt_unlock_operator_attestation_id: parent.source_act_token_redempt_unlock_operator_attestation_id || 'oatt_dummy',
      source_act_token_redempt_unlock_pre_execution_freeze_id: parent.source_act_token_redempt_unlock_pre_execution_freeze_id || 'freeze_dummy',
      source_activation_token_redemption_unlock_seal_id: parent.source_activation_token_redemption_unlock_seal_id || 'seal_dummy',
      source_activation_token_redemption_unlock_final_review_id: parent.source_activation_token_redemption_unlock_final_review_id || 'frev_dummy',
      source_activation_token_redemption_unlock_approval_id: parent.source_activation_token_redemption_unlock_approval_id || 'apv_dummy',
      source_activation_token_redemption_unlock_eligibility_id: parent.source_activation_token_redemption_unlock_eligibility_id || 'elig_dummy',
      source_activation_token_redemption_lock_id: parent.source_activation_token_redemption_lock_id || 'lock_dummy',
      source_activation_token_redemption_final_apv_id: parent.source_activation_token_redemption_final_apv_id || 'fapv_dummy',
      source_activation_token_redemption_envelope_id: parent.source_activation_token_redemption_envelope_id || 'env_dummy',
      source_activation_token_redemption_auth_id: parent.source_activation_token_redemption_auth_id || 'auth_dummy',
      source_activation_token_redemption_readiness_id: parent.source_activation_token_redemption_readiness_id || 'rd_dummy',
      source_activation_token_issuance_id: parent.source_activation_token_issuance_id || 'iss_dummy',
      source_activation_token_staging_id: parent.source_activation_token_staging_id || 'stg_dummy',
      source_activation_token_preflight_id: parent.source_activation_token_preflight_id || 'pfl_dummy',
      source_plan_id: parent.source_plan_id || 'pln_dummy',
      source_dispatcher_id: parent.source_dispatcher_id || 'dsp_dummy',
      source_envelope_id: parent.source_envelope_id || 'env_dummy',
      source_auth_id: parent.source_auth_id || 'auth_dummy',
      source_readiness_id: parent.source_readiness_id || 'rd_dummy',
      source_approval_id: parent.source_approval_id || 'apv_dummy',
      source_prep_id: parent.source_prep_id || 'prep_dummy',
      source_review_id: parent.source_review_id,
      source_simulation_id: parent.source_simulation_id,
      source_execution_id: parent.source_execution_id,
      cohort_id: parent.cohort_id,
      tenant_id: parent.tenant_id,
      simulation_type: parent.simulation_type,
      unlock_compliance_witness_status: 'DRAFT',
      unlock_compliance_witness_result: 'COMPLIANCE_WITNESS_BLOCKED_BY_FINAL_HUMAN_SEAL',
      unlock_compliance_witness_mode: 'COMPLIANCE_WITNESS_ONLY',
      unlock_final_human_authorization_seal_status: parent.unlock_final_human_authorization_seal_status,
      unlock_dual_control_authorization_status: parent.unlock_dual_control_authorization_status,
      unlock_operator_attestation_status: parent.unlock_operator_attestation_status,
      unlock_pre_execution_freeze_status: parent.unlock_pre_execution_freeze_status,
      unlock_seal_status: parent.unlock_seal_status,
      unlock_final_review_status: parent.unlock_final_review_status,
      unlock_approval_status: parent.unlock_approval_status,
      unlock_eligibility_status: parent.unlock_eligibility_status,
      token_redemption_lock_status: parent.token_redemption_lock_status,
      token_redemption_status: parent.token_redemption_status,
      token_unlock_status: parent.token_unlock_status,
      token_redeemable_status: parent.token_redeemable_status,
      risk_level: parent.risk_level,
      confidence_level: parent.confidence_level,
      projected_impact_score: parseFloat(parent.projected_impact_score || 0),
      rollback_feasibility_score: parseFloat(parent.rollback_feasibility_score || 0),
      evidence_completeness_score: parseFloat(parent.evidence_completeness_score || 0),
      guardrail_status: parent.guardrail_status,
      write_scope_status: parent.write_scope_status,
      canary_envelope_json: parent.canary_envelope_json || {},
      unlock_compliance_witness_summary_json: {},
      impact_review_json: parent.impact_review_json || {},
      rollback_review_json: parent.rollback_review_json || {},
      guardrail_review_json: parent.guardrail_review_json || {},
      unlock_compliance_witness_rules_json: {},
      unlock_compliance_witness_blockers_json: {},
      non_execution_attestation_json: parent.non_execution_attestation_json || {},
      write_scope_attestation_json: { writes_only_phase174_tables: true },
      source_unlock_final_human_authorization_seal_hash: parent.unlock_final_human_authorization_seal_hash || 'fhas_hash_dummy',
      source_unlock_dual_control_authorization_hash: parent.source_unlock_dual_control_authorization_hash || 'dcau_hash_dummy',
      source_unlock_operator_attestation_hash: parent.source_unlock_operator_attestation_hash || 'oatt_hash_dummy',
      source_unlock_pre_execution_freeze_hash: parent.source_unlock_pre_execution_freeze_hash || 'pfrz_hash_dummy',
      source_unlock_seal_hash: parent.source_unlock_seal_hash || 'seal_hash_dummy',
      source_unlock_final_review_hash: parent.source_unlock_final_review_hash || 'frev_hash_dummy',
      source_unlock_approval_hash: parent.source_unlock_approval_hash || 'apv_hash_dummy',
      source_unlock_eligibility_hash: parent.source_unlock_eligibility_hash || 'elig_hash_dummy',
      source_redemption_lock_hash: parent.source_redemption_lock_hash || 'lock_hash_dummy',
      source_redemption_final_approval_hash: parent.source_redemption_final_approval_hash || 'fapv_hash_dummy',
      source_redemption_package_freeze_hash: parent.source_redemption_package_freeze_hash || 'freeze_hash_dummy',
      source_token_material_hash: parent.source_token_material_hash || 'token_material_hash_dummy',
      unlock_compliance_witness_hash: '',
      unlock_compliance_witness_evidence_pack_hash: '',
      evidence_pack_hash: '',
      lineage_hash_chain_json: {},
      security_signature_json: {},
      attestation_rationale_json: {},
      execution_capability_status: parent.execution_capability_status || 'EXECUTION_NOT_ENABLED',
      activation_execution_status: 'UNLOCK_COMPLIANCE_WITNESS_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      package_freeze_status: parent.package_freeze_status || 'FROZEN_IMMUTABLE',
      redemption_package_freeze_status: parent.redemption_package_freeze_status || 'REDEMPTION_PACKAGE_FROZEN_IMMUTABLE',
      plan_executable_status: parent.plan_executable_status || 'NOT_EXECUTABLE',
      job_creation_status: parent.job_creation_status || 'NO_REAL_JOB_CREATED',
      queue_dispatch_status: parent.queue_dispatch_status || 'NO_QUEUE_DISPATCHED',
      runtime_mutation_status: parent.runtime_mutation_status || 'ZERO_RUNTIME_MUTATION_CONFIRMED',
      primary_authorizer_id: parent.primary_authorizer_id || 'alice_dummy',
      secondary_authorizer_id: parent.secondary_authorizer_id || 'bob_dummy',
      final_human_authorizer_id: parent.final_human_authorizer_id || 'charlie_dummy',
      compliance_witness_id: null,
      compliance_witness_role: null,
      compliance_witness_attested_at: null,
      compliance_witness_reason: null,
      compliance_witness_attestation_json: {},
      authorizer_witness_separation_snapshot_json: {},
      created_by: actorId,
      updated_by: actorId
    };

    if (!isProdLike) {
      this._mockState.tokenRedemptionUnlockComplianceWitness.set(unlockComplianceWitnessId, record);
      await auditService.logAction(unlockComplianceWitnessId, 'UNLOCK_COMPLIANCE_WITNESS_DRAFT_CREATED', actorId, { unlockFinalHumanAuthorizationSealId });
      return { tokenRedemptionUnlockComplianceWitness: record };
    }

    const fields = Object.keys(record);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(k => {
      const v = record[k];
      return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
    });

    await db.query(
      `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_cwn
       (${fields.join(', ')})
       VALUES (${placeholders})`,
      values
    );

    await auditService.logAction(unlockComplianceWitnessId, 'UNLOCK_COMPLIANCE_WITNESS_DRAFT_CREATED', actorId, { unlockFinalHumanAuthorizationSealId });

    return { tokenRedemptionUnlockComplianceWitness: record };
  }

  async _internalUpdateUnlockComplianceWitness(unlockComplianceWitnessId, fields) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    if (!isProdLike) {
      const existing = this._mockState.tokenRedemptionUnlockComplianceWitness.get(unlockComplianceWitnessId);
      if (!existing) throw new Error(`Draft ${unlockComplianceWitnessId} not found in mock state.`);
      const updated = { ...existing, ...fields, updated_at: new Date() };
      this._mockState.tokenRedemptionUnlockComplianceWitness.set(unlockComplianceWitnessId, updated);
      return updated;
    }

    const setClause = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const values = Object.keys(fields).map(k => {
      const v = fields[k];
      return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
    });

    await db.query(
      `UPDATE cb_cohort_intervention_activation_token_redempt_unlock_cwn
       SET ${setClause}
       WHERE act_token_redempt_unlock_compliance_witness_id = ?`,
      [...values, unlockComplianceWitnessId]
    );

    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn WHERE act_token_redempt_unlock_compliance_witness_id = ?`,
      [unlockComplianceWitnessId]
    );

    const updated = rows[0];
    const jsonFields = [
      'canary_envelope_json', 'unlock_compliance_witness_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'unlock_compliance_witness_rules_json',
      'unlock_compliance_witness_blockers_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
      'attestation_rationale_json', 'compliance_witness_attestation_json',
      'authorizer_witness_separation_snapshot_json'
    ];
    jsonFields.forEach(f => {
      if (updated && typeof updated[f] === 'string') {
        try {
          updated[f] = JSON.parse(updated[f]);
        } catch (e) {}
      }
    });
    return updated;
  }

  async getTokenRedemptionUnlockComplianceWitness(unlockComplianceWitnessId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.tokenRedemptionUnlockComplianceWitness.get(unlockComplianceWitnessId);
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn WHERE act_token_redempt_unlock_compliance_witness_id = ?`,
      [unlockComplianceWitnessId]
    );
    const record = rows[0];
    if (!record) return null;
    const jsonFields = [
      'canary_envelope_json', 'unlock_compliance_witness_summary_json', 'impact_review_json',
      'rollback_review_json', 'guardrail_review_json', 'unlock_compliance_witness_rules_json',
      'unlock_compliance_witness_blockers_json', 'non_execution_attestation_json',
      'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
      'attestation_rationale_json', 'compliance_witness_attestation_json',
      'authorizer_witness_separation_snapshot_json'
    ];
    jsonFields.forEach(f => {
      if (record && typeof record[f] === 'string') {
        try {
          record[f] = JSON.parse(record[f]);
        } catch (e) {}
      }
    });
    return record;
  }

  async getUnlockComplianceWitnessList() {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return Array.from(this._mockState.tokenRedemptionUnlockComplianceWitness.values());
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn ORDER BY created_at DESC`
    );
    rows.forEach(record => {
      const jsonFields = [
        'canary_envelope_json', 'unlock_compliance_witness_summary_json', 'impact_review_json',
        'rollback_review_json', 'guardrail_review_json', 'unlock_compliance_witness_rules_json',
        'unlock_compliance_witness_blockers_json', 'non_execution_attestation_json',
        'write_scope_attestation_json', 'lineage_hash_chain_json', 'security_signature_json',
        'attestation_rationale_json', 'compliance_witness_attestation_json',
        'authorizer_witness_separation_snapshot_json'
      ];
      jsonFields.forEach(f => {
        if (record && typeof record[f] === 'string') {
          try {
            record[f] = JSON.parse(record[f]);
          } catch (e) {}
        }
      });
    });
    return rows;
  }

  async getRules(unlockComplianceWitnessId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return this._mockState.rules.get(unlockComplianceWitnessId) || [];
    }
    const rows = await db.query(
      `SELECT * FROM cb_cohort_intervention_activation_token_redempt_unlock_cwn_rl WHERE act_token_redempt_unlock_compliance_witness_id = ?`,
      [unlockComplianceWitnessId]
    );
    return rows;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService()
};
