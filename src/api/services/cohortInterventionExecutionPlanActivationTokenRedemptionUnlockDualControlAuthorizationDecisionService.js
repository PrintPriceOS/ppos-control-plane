'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationAuditService').serviceInstance;
const evidenceService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationEvidencePackService').serviceInstance;
const guardrailService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationGuardrailService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationDecisionService {
  async recordPrimaryAuthorizer(unlockDualControlAuthorizationId, authorizerId, role) {
    const record = await builder.getTokenRedemptionUnlockDualControlAuthorization(unlockDualControlAuthorizationId);
    if (!record) throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.unlock_dual_control_authorization_status === 'FINALIZED') {
      throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_IMMUTABLE');
    }

    if (record.secondary_authorizer_id && record.secondary_authorizer_id === authorizerId) {
      throw new Error('DUAL_CONTROL_SAME_AUTHORIZER_FORBIDDEN');
    }

    const updated = await builder._internalUpdateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, {
      primary_authorizer_id: authorizerId,
      primary_authorizer_role: role,
      primary_authorized_at: new Date()
    });

    await auditService.logAction(unlockDualControlAuthorizationId, 'PRIMARY_AUTHORIZER_RECORDED', authorizerId, { role });
    return updated;
  }

  async recordSecondaryAuthorizer(unlockDualControlAuthorizationId, authorizerId, role) {
    const record = await builder.getTokenRedemptionUnlockDualControlAuthorization(unlockDualControlAuthorizationId);
    if (!record) throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.unlock_dual_control_authorization_status === 'FINALIZED') {
      throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_IMMUTABLE');
    }

    if (record.primary_authorizer_id && record.primary_authorizer_id === authorizerId) {
      throw new Error('DUAL_CONTROL_SAME_AUTHORIZER_FORBIDDEN');
    }

    const updated = await builder._internalUpdateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, {
      secondary_authorizer_id: authorizerId,
      secondary_authorizer_role: role,
      secondary_authorized_at: new Date()
    });

    await auditService.logAction(unlockDualControlAuthorizationId, 'SECONDARY_AUTHORIZER_RECORDED', authorizerId, { role });
    return updated;
  }

  async recordDecision(unlockDualControlAuthorizationId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockDualControlAuthorization(unlockDualControlAuthorizationId);
    if (!record) throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.unlock_dual_control_authorization_status === 'FINALIZED') {
      throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_IMMUTABLE: Record is finalized and cannot be modified.');
    }

    if (record.unlock_dual_control_authorization_status !== 'EVALUATED') {
      throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_NOT_EVALUATED: Evaluation is required before recording decision.');
    }

    if (!record.primary_authorizer_id) {
      throw new Error('PRIMARY_AUTHORIZER_MISSING');
    }
    if (!record.secondary_authorizer_id) {
      throw new Error('SECONDARY_AUTHORIZER_MISSING');
    }

    if (!['APPROVE_DUAL_CONTROL', 'REJECT_DUAL_CONTROL', 'BLOCK', 'ESCALATE'].includes(decision)) {
      throw new Error('INVALID_DECISION: Supported decisions are APPROVE_DUAL_CONTROL, REJECT_DUAL_CONTROL, BLOCK, ESCALATE.');
    }

    const decisionResult = decision === 'APPROVE_DUAL_CONTROL' ? 'DUAL_CONTROL_AUTHORIZED_NOT_UNLOCKED' : 'DUAL_CONTROL_AUTHORIZATION_FAILED';
    const decisionStatus = decision === 'APPROVE_DUAL_CONTROL' ? 'APPROVED' : 'REJECTED';

    const fields = {
      unlock_dual_control_authorization_status: decisionStatus,
      unlock_dual_control_authorization_result: decisionResult,
      attestation_rationale_json: { rationale, decision, timestamp: new Date() }
    };

    if (decision === 'APPROVE_DUAL_CONTROL') {
      fields.approved_by = actorId;
      fields.approved_at = new Date();
    } else {
      fields.rejected_by = actorId;
      fields.rejected_at = new Date();
    }

    const updated = await builder._internalUpdateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, fields);
    await auditService.logAction(unlockDualControlAuthorizationId, 'UNLOCK_DUAL_CONTROL_DECISION_RECORDED', actorId, { decision, rationale });
    return updated;
  }

  async finalizeUnlockDualControlAuthorization(unlockDualControlAuthorizationId, actorId) {
    const record = await builder.getTokenRedemptionUnlockDualControlAuthorization(unlockDualControlAuthorizationId);
    if (!record) throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_RECORD_NOT_FOUND');

    if (record.unlock_dual_control_authorization_status === 'FINALIZED') {
      throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_IMMUTABLE: Record is already finalized.');
    }

    if (record.unlock_dual_control_authorization_status !== 'APPROVED' && record.unlock_dual_control_authorization_status !== 'REJECTED') {
      throw new Error('UNLOCK_DUAL_CONTROL_AUTHORIZATION_NOT_DECIDED: A decision must be recorded before finalization.');
    }

    // Run Guardrail Verification
    const safetyRes = await guardrailService.verifySourceSafety();
    if (!safetyRes.passed) {
      throw new Error('GUARDRAILS_FAILED: Source safety checks did not pass.');
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + actorId).digest('hex');

    const updateFields = {
      unlock_dual_control_authorization_status: 'FINALIZED',
      unlock_dual_control_authorization_hash: finalHash,
      finalized_by: actorId,
      finalized_at: new Date(),
      activation_execution_status: 'UNLOCK_DUAL_CONTROL_AUTHORIZATION_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED'
    };

    // Update first so evidencePack reads the correct state
    let updated = await builder._internalUpdateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, updateFields);

    // Build evidence pack
    const evidencePack = await evidenceService.generateEvidencePack(updated, actorId);

    // Save evidence pack hashes
    updated = await builder._internalUpdateUnlockDualControlAuthorization(unlockDualControlAuthorizationId, {
      unlock_dual_control_authorization_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.lineageHashChain
    });

    await auditService.logAction(unlockDualControlAuthorizationId, 'UNLOCK_DUAL_CONTROL_AUTHORIZATION_FINALIZED', actorId, { evidencePackHash: evidencePack.evidence_pack_hash });
    return updated;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockDualControlAuthorizationDecisionService()
};
