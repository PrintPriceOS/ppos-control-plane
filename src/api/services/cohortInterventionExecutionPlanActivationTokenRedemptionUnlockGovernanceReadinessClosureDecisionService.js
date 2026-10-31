'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builderService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureAuditService').serviceInstance;
const evidencePackService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureEvidencePackService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureDecisionService {
  async recordGovernanceClosureOfficer(unlockGovernanceReadinessClosureId, officerId, role, reason, actorId) {
    const record = await builderService.getTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_governance_readiness_closure_status !== 'DRAFT') {
      throw new Error('Record must be in DRAFT status to record officer');
    }

    const allowedRoles = ['governance_officer', 'compliance_officer', 'security_officer', 'chief_governance_officer', 'audit_officer'];
    if (!allowedRoles.includes(role)) {
      throw new Error('GOVERNANCE_CLOSURE_OFFICER_ROLE_INVALID');
    }

    const priorIds = [
      record.primary_authorizer_id,
      record.secondary_authorizer_id,
      record.final_human_authorizer_id,
      record.compliance_witness_id,
      record.risk_officer_id,
      record.legal_policy_officer_id,
      record.rollback_officer_id,
      record.kill_switch_verification_officer_id,
      record.evidence_seal_officer_id
    ];
    if (priorIds.includes(officerId)) {
      throw new Error('GOVERNANCE_CLOSURE_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const updateFields = {
      governance_closure_officer_id: officerId,
      governance_closure_officer_role: role,
      governance_closure_confirmed_at: new Date(),
      governance_closure_reason: reason,
      prior_authorizer_separation_snapshot_json: { priorIds, reason },
      full_chain_non_execution_snapshot_json: {
        tokenUnlockStatus: record.token_unlock_status,
        tokenRedemptionStatus: record.token_redemption_status,
        executionCapabilityStatus: record.execution_capability_status,
        jobCreationStatus: record.job_creation_status,
        queueDispatchStatus: record.queue_dispatch_status,
        runtimeMutationStatus: record.runtime_mutation_status
      }
    };

    await builderService._internalUpdateTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId, updateFields);
    await auditService.logAction(unlockGovernanceReadinessClosureId, 'GOVERNANCE_CLOSURE_OFFICER_RECORDED', actorId);
  }

  async recordDecision(unlockGovernanceReadinessClosureId, decisionType, rationale, actorId) {
    const record = await builderService.getTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_governance_readiness_closure_status !== 'EVALUATED') {
      throw new Error('Record must be evaluated before recording decision');
    }

    if (decisionType !== 'APPROVE_GOVERNANCE_READINESS_CLOSURE' && decisionType !== 'REJECT_GOVERNANCE_READINESS_CLOSURE') {
      throw new Error('INVALID_DECISION');
    }

    // Invariants check
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
      unlock_governance_readiness_closure_status: decisionType === 'APPROVE_GOVERNANCE_READINESS_CLOSURE' ? 'APPROVED' : 'REJECTED',
      unlock_governance_readiness_closure_result: decisionType === 'APPROVE_GOVERNANCE_READINESS_CLOSURE' ? 'GOVERNANCE_READINESS_CLOSED_NOT_UNLOCKED' : 'GOVERNANCE_READINESS_CLOSURE_FAILED',
      attestation_rationale_json: { rationale, decidedAt: new Date() }
    };

    await builderService._internalUpdateTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId, updateFields);
    await auditService.logAction(unlockGovernanceReadinessClosureId, 'UNLOCK_GOVERNANCE_READINESS_CLOSURE_DECISION_RECORDED', actorId);
  }

  async finalizeUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId, actorId) {
    const record = await builderService.getTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_governance_readiness_closure_status !== 'APPROVED') {
      throw new Error('Record must be APPROVED to finalize');
    }

    const evidencePack = await evidencePackService.generateEvidencePack(unlockGovernanceReadinessClosureId, actorId);

    const updateFields = {
      unlock_governance_readiness_closure_status: 'FINALIZED',
      unlock_governance_readiness_closure_hash: evidencePack.evidence_pack_hash,
      unlock_governance_readiness_closure_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.evidence_pack_json.lineageHashChain,
      activation_execution_status: 'UNLOCK_GOVERNANCE_READINESS_CLOSURE_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED'
    };

    await builderService._internalUpdateTokenRedemptionUnlockGovernanceReadinessClosure(unlockGovernanceReadinessClosureId, updateFields);

    if (!isProdLike) {
      evidencePackService._mockState.evidence.set(unlockGovernanceReadinessClosureId, {
        evidence_id: 'ev_' + crypto.randomBytes(8).toString('hex'),
        act_token_redempt_unlock_governance_readiness_closure_id: unlockGovernanceReadinessClosureId,
        evidence_pack_hash: evidencePack.evidence_pack_hash,
        evidence_pack_json: JSON.stringify(evidencePack.evidence_pack_json),
        created_by: actorId
      });
    } else {
      const evidenceId = 'ev_' + crypto.randomBytes(8).toString('hex');
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_grc_ev
         (evidence_id, act_token_redempt_unlock_governance_readiness_closure_id, evidence_pack_hash, evidence_pack_json, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [evidenceId, unlockGovernanceReadinessClosureId, evidencePack.evidence_pack_hash, JSON.stringify(evidencePack.evidence_pack_json), actorId]
      );
    }

    await auditService.logAction(unlockGovernanceReadinessClosureId, 'UNLOCK_GOVERNANCE_READINESS_CLOSURE_FINALIZED', actorId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockGovernanceReadinessClosureDecisionService()
};
