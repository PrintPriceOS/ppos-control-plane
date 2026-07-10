'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builderService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealAuditService').serviceInstance;
const evidencePackService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealEvidencePackService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealDecisionService {
  async recordEvidenceSealOfficer(unlockFinalNonExecutionEvidenceSealId, officerId, role, reason, actorId) {
    const record = await builderService.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_final_non_execution_evidence_seal_status !== 'DRAFT') {
      throw new Error('Record must be in DRAFT status to record officer');
    }

    const allowedRoles = ['audit_officer', 'compliance_officer', 'risk_officer', 'security_officer', 'governance_officer'];
    if (!allowedRoles.includes(role)) {
      throw new Error('EVIDENCE_SEAL_OFFICER_ROLE_INVALID');
    }

    const priorIds = [
      record.primary_authorizer_id,
      record.secondary_authorizer_id,
      record.final_human_authorizer_id,
      record.compliance_witness_id,
      record.risk_officer_id,
      record.legal_policy_officer_id,
      record.rollback_officer_id,
      record.kill_switch_verification_officer_id
    ];
    if (priorIds.includes(officerId)) {
      throw new Error('EVIDENCE_SEAL_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const updateFields = {
      evidence_seal_officer_id: officerId,
      evidence_seal_officer_role: role,
      evidence_sealed_at: new Date(),
      evidence_seal_reason: reason,
      prior_authorizer_separation_snapshot_json: { priorIds, reason },
      non_execution_evidence_snapshot_json: {
        tokenUnlockStatus: record.token_unlock_status,
        tokenRedemptionStatus: record.token_redemption_status,
        executionCapabilityStatus: record.execution_capability_status,
        jobCreationStatus: record.job_creation_status,
        queueDispatchStatus: record.queue_dispatch_status,
        runtimeMutationStatus: record.runtime_mutation_status
      }
    };

    await builderService._internalUpdateTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId, updateFields);
    await auditService.logAction(unlockFinalNonExecutionEvidenceSealId, 'EVIDENCE_SEAL_OFFICER_RECORDED', actorId);
  }

  async recordDecision(unlockFinalNonExecutionEvidenceSealId, decisionType, rationale, actorId) {
    const record = await builderService.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_final_non_execution_evidence_seal_status !== 'EVALUATED') {
      throw new Error('Record must be evaluated before recording decision');
    }

    if (decisionType !== 'APPROVE_FINAL_NON_EXECUTION_EVIDENCE_SEAL' && decisionType !== 'REJECT_FINAL_NON_EXECUTION_EVIDENCE_SEAL') {
      throw new Error('INVALID_DECISION');
    }

    // Safety Checks
    if (record.token_unlock_status !== 'NOT_UNLOCKED') {
      throw new Error('TOKEN_UNLOCK_DETECTED');
    }
    if (record.token_redeemable_status !== 'NOT_REDEEMABLE') {
      throw new Error('TOKEN_REDEEMABLE_DETECTED');
    }
    if (record.token_redemption_status !== 'LOCKED_NOT_REDEEMED') {
      throw new Error('TOKEN_REDEMPTION_DETECTED');
    }
    if (record.job_creation_status !== 'NO_REAL_JOB_CREATED') {
      throw new Error('JOB_CREATION_DETECTED');
    }
    if (record.queue_dispatch_status !== 'NO_QUEUE_DISPATCHED') {
      throw new Error('QUEUE_DISPATCH_DETECTED');
    }
    if (record.runtime_mutation_status !== 'ZERO_RUNTIME_MUTATION_CONFIRMED') {
      throw new Error('RUNTIME_MUTATION_DETECTED');
    }

    const updateFields = {
      unlock_final_non_execution_evidence_seal_status: decisionType === 'APPROVE_FINAL_NON_EXECUTION_EVIDENCE_SEAL' ? 'APPROVED' : 'REJECTED',
      unlock_final_non_execution_evidence_seal_result: decisionType === 'APPROVE_FINAL_NON_EXECUTION_EVIDENCE_SEAL' ? 'FINAL_NON_EXECUTION_EVIDENCE_SEALED_NOT_UNLOCKED' : 'FINAL_NON_EXECUTION_EVIDENCE_SEAL_FAILED',
      attestation_rationale_json: { rationale, decidedAt: new Date() }
    };

    await builderService._internalUpdateTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId, updateFields);
    await auditService.logAction(unlockFinalNonExecutionEvidenceSealId, 'UNLOCK_FINAL_NON_EXECUTION_EVIDENCE_SEAL_DECISION_RECORDED', actorId);
  }

  async finalizeUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId, actorId) {
    const record = await builderService.getTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_final_non_execution_evidence_seal_status !== 'APPROVED') {
      throw new Error('Record must be APPROVED to finalize');
    }

    const evidencePack = await evidencePackService.generateEvidencePack(unlockFinalNonExecutionEvidenceSealId, actorId);

    const updateFields = {
      unlock_final_non_execution_evidence_seal_status: 'FINALIZED',
      unlock_final_non_execution_evidence_seal_hash: evidencePack.evidence_pack_hash,
      unlock_final_non_execution_evidence_seal_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.evidence_pack_json.lineageHashChain,
      activation_execution_status: 'UNLOCK_FINAL_NON_EXECUTION_EVIDENCE_SEAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED'
    };

    await builderService._internalUpdateTokenRedemptionUnlockFinalNonExecutionEvidenceSeal(unlockFinalNonExecutionEvidenceSealId, updateFields);

    if (!isProdLike) {
      evidencePackService._mockState.evidence.set(unlockFinalNonExecutionEvidenceSealId, {
        evidence_id: 'ev_' + crypto.randomBytes(8).toString('hex'),
        act_token_redempt_unlock_final_non_execution_evidence_seal_id: unlockFinalNonExecutionEvidenceSealId,
        evidence_pack_hash: evidencePack.evidence_pack_hash,
        evidence_pack_json: JSON.stringify(evidencePack.evidence_pack_json),
        created_by: actorId
      });
    } else {
      const evidenceId = 'ev_' + crypto.randomBytes(8).toString('hex');
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_fnees_ev
         (evidence_id, act_token_redempt_unlock_final_non_execution_evidence_seal_id, evidence_pack_hash, evidence_pack_json, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [evidenceId, unlockFinalNonExecutionEvidenceSealId, evidencePack.evidence_pack_hash, JSON.stringify(evidencePack.evidence_pack_json), actorId]
      );
    }

    await auditService.logAction(unlockFinalNonExecutionEvidenceSealId, 'UNLOCK_FINAL_NON_EXECUTION_EVIDENCE_SEAL_FINALIZED', actorId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalNonExecutionEvidenceSealDecisionService()
};
