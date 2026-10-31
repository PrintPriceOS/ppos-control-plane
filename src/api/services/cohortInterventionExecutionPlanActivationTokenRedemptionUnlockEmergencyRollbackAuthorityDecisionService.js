'use strict';

const builderService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityAuditService').serviceInstance;
const evidenceService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityDecisionService {

  async recordRollbackOfficer(unlockEmergencyRollbackAuthorityId, officerId, role, reason, actorId) {
    const record = await builderService.getTokenRedemptionUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId);
    if (!record) {
      throw new Error(`Record ${unlockEmergencyRollbackAuthorityId} not found.`);
    }

    if (record.unlock_emergency_rollback_authority_status !== 'DRAFT') {
      throw new Error('Can only assign Rollback Officer in DRAFT stage.');
    }

    // Role verification
    const allowedRoles = ['rollback_officer', 'emergency_stop_authority', 'operations_director', 'site_reliability_leader', 'chief_safety_officer'];
    if (!allowedRoles.includes(role)) {
      throw new Error('ROLLBACK_OFFICER_ROLE_INVALID');
    }

    // Prior authorizer check
    const priorIds = [
      record.primary_authorizer_id,
      record.secondary_authorizer_id,
      record.final_human_authorizer_id,
      record.compliance_witness_id,
      record.risk_officer_id,
      record.legal_policy_officer_id
    ];
    if (priorIds.includes(officerId)) {
      throw new Error('ROLLBACK_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const updates = {
      rollback_officer_id: officerId,
      rollback_officer_role: role,
      rollback_officer_confirmed_at: new Date(),
      rollback_authority_confirmation_reason: reason,
      rollback_authority_attestation_json: {
        attestation: 'Rollback officer confirmed ready with emergency stop authorization.',
        role,
        officerId,
        reason
      }
    };

    await builderService._internalUpdateUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, updates);
    await auditService.logAction(unlockEmergencyRollbackAuthorityId, 'ROLLBACK_OFFICER_RECORDED', actorId, { officerId, role });

    return { success: true };
  }

  async recordDecision(unlockEmergencyRollbackAuthorityId, decisionType, reason, actorId) {
    const record = await builderService.getTokenRedemptionUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId);
    if (!record) {
      throw new Error(`Record ${unlockEmergencyRollbackAuthorityId} not found.`);
    }

    if (record.unlock_emergency_rollback_authority_status !== 'EVALUATED') {
      throw new Error('Record must be evaluated before recording decision.');
    }

    const allowedDecisions = ['APPROVE_EMERGENCY_ROLLBACK_AUTHORITY', 'REJECT', 'BLOCK', 'ESCALATE'];
    if (!allowedDecisions.includes(decisionType)) {
      throw new Error(`INVALID_DECISION: Supported decisions are ${allowedDecisions.join(', ')}`);
    }

    let nextStatus = 'EVALUATED';
    let nextResult = record.unlock_emergency_rollback_authority_result;

    if (decisionType === 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY') {
      nextStatus = 'APPROVED';
      nextResult = 'EMERGENCY_ROLLBACK_AUTHORITY_CONFIRMED_NOT_UNLOCKED';
    } else if (decisionType === 'REJECT') {
      nextStatus = 'REJECTED';
      nextResult = 'EMERGENCY_ROLLBACK_AUTHORITY_FAILED';
    } else if (decisionType === 'BLOCK') {
      nextStatus = 'BLOCKED';
      nextResult = 'EMERGENCY_ROLLBACK_AUTHORITY_FAILED';
    } else if (decisionType === 'ESCALATE') {
      nextStatus = 'BLOCKED';
      nextResult = 'EMERGENCY_ROLLBACK_AUTHORITY_FAILED';
    }

    const updates = {
      unlock_emergency_rollback_authority_status: nextStatus,
      unlock_emergency_rollback_authority_result: nextResult,
      approved_by: decisionType === 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY' ? actorId : null,
      approved_at: decisionType === 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY' ? new Date() : null,
      rejected_by: decisionType !== 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY' ? actorId : null,
      rejected_at: decisionType !== 'APPROVE_EMERGENCY_ROLLBACK_AUTHORITY' ? new Date() : null,
      attestation_rationale_json: { reason, decisionType, recordedBy: actorId }
    };

    await builderService._internalUpdateUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, updates);
    await auditService.logAction(unlockEmergencyRollbackAuthorityId, 'UNLOCK_EMERGENCY_ROLLBACK_AUTHORITY_DECISION_RECORDED', actorId, { decisionType, reason });

    return { success: true };
  }

  async finalizeUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, actorId) {
    const record = await builderService.getTokenRedemptionUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId);
    if (!record) {
      throw new Error(`Record ${unlockEmergencyRollbackAuthorityId} not found.`);
    }

    if (record.unlock_emergency_rollback_authority_status !== 'APPROVED') {
      throw new Error('Can only finalize an APPROVED unlock emergency rollback authority gate.');
    }

    const updates = {
      unlock_emergency_rollback_authority_status: 'FINALIZED',
      activation_execution_status: 'UNLOCK_EMERGENCY_ROLLBACK_AUTHORITY_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      finalized_by: actorId,
      finalized_at: new Date()
    };

    const finalizedRecord = await builderService._internalUpdateUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, updates);

    // Generate evidence pack
    const evidence = await evidenceService.generateAndPersistEvidencePack(unlockEmergencyRollbackAuthorityId, actorId);

    // Update evidence hashes on record
    await builderService._internalUpdateUnlockEmergencyRollbackAuthority(unlockEmergencyRollbackAuthorityId, {
      unlock_emergency_rollback_authority_evidence_pack_hash: evidence.evidence_pack_hash,
      evidence_pack_hash: evidence.evidence_pack_hash,
      lineage_hash_chain_json: evidence.evidence_payload.lineageHashChain
    });

    await auditService.logAction(unlockEmergencyRollbackAuthorityId, 'UNLOCK_EMERGENCY_ROLLBACK_AUTHORITY_FINALIZED', actorId);

    return { success: true };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityDecisionService()
};
