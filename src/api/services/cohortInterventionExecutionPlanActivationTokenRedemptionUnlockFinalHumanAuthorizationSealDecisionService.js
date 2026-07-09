'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealAuditService').serviceInstance;
const evidenceService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvidencePackService').serviceInstance;
const guardrailService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealGuardrailService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService {
  async recordFinalHumanAuthorizer(unlockFinalHumanAuthorizationSealId, authorizerId, role, reason) {
    const record = await builder.getTokenRedemptionUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId);
    if (!record) throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_RECORD_NOT_FOUND');

    if (record.unlock_final_human_authorization_seal_status === 'FINALIZED') {
      throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_IMMUTABLE');
    }

    if (record.primary_authorizer_id === authorizerId) {
      throw new Error('FINAL_HUMAN_AUTHORIZER_DUPLICATES_PRIMARY_FORBIDDEN');
    }
    if (record.secondary_authorizer_id === authorizerId) {
      throw new Error('FINAL_HUMAN_AUTHORIZER_DUPLICATES_SECONDARY_FORBIDDEN');
    }

    const updated = await builder._internalUpdateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, {
      final_human_authorizer_id: authorizerId,
      final_human_authorizer_role: role,
      final_human_authorized_at: new Date(),
      final_human_authorization_seal_reason: reason,
      final_human_authorization_seal_attestation_json: { attested: true, role, authorizerId }
    });

    await auditService.logAction(unlockFinalHumanAuthorizationSealId, 'FINAL_HUMAN_AUTHORIZER_RECORDED', authorizerId, { role, reason });
    return updated;
  }

  async recordDecision(unlockFinalHumanAuthorizationSealId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId);
    if (!record) throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_RECORD_NOT_FOUND');

    if (record.unlock_final_human_authorization_seal_status === 'FINALIZED') {
      throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_IMMUTABLE: Record is finalized and cannot be modified.');
    }

    if (record.unlock_final_human_authorization_seal_status !== 'EVALUATED') {
      throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_NOT_EVALUATED: Evaluation is required before recording decision.');
    }

    if (!record.final_human_authorizer_id) {
      throw new Error('FINAL_HUMAN_AUTHORIZER_MISSING');
    }

    if (!['APPROVE_FINAL_SEAL', 'REJECT_FINAL_SEAL', 'BLOCK', 'ESCALATE'].includes(decision)) {
      throw new Error('INVALID_DECISION: Supported decisions are APPROVE_FINAL_SEAL, REJECT_FINAL_SEAL, BLOCK, ESCALATE.');
    }

    const decisionResult = decision === 'APPROVE_FINAL_SEAL' ? 'FINAL_HUMAN_AUTHORIZATION_SEALED_NOT_UNLOCKED' : 'FINAL_HUMAN_AUTHORIZATION_SEAL_FAILED';
    const decisionStatus = decision === 'APPROVE_FINAL_SEAL' ? 'APPROVED' : 'REJECTED';

    const fields = {
      unlock_final_human_authorization_seal_status: decisionStatus,
      unlock_final_human_authorization_seal_result: decisionResult,
      attestation_rationale_json: { rationale, decision, timestamp: new Date() }
    };

    if (decision === 'APPROVE_FINAL_SEAL') {
      fields.approved_by = actorId;
      fields.approved_at = new Date();
    } else {
      fields.rejected_by = actorId;
      fields.rejected_at = new Date();
    }

    const updated = await builder._internalUpdateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, fields);
    await auditService.logAction(unlockFinalHumanAuthorizationSealId, 'UNLOCK_FINAL_HUMAN_SEAL_DECISION_RECORDED', actorId, { decision, rationale });
    return updated;
  }

  async finalizeUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, actorId) {
    const record = await builder.getTokenRedemptionUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId);
    if (!record) throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_RECORD_NOT_FOUND');

    if (record.unlock_final_human_authorization_seal_status === 'FINALIZED') {
      throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_IMMUTABLE: Record is already finalized.');
    }

    if (record.unlock_final_human_authorization_seal_status !== 'APPROVED' && record.unlock_final_human_authorization_seal_status !== 'REJECTED') {
      throw new Error('UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_NOT_DECIDED: A decision must be recorded before finalization.');
    }

    // Run Guardrail Verification
    const safetyRes = await guardrailService.verifySourceSafety();
    if (!safetyRes.passed) {
      throw new Error('GUARDRAILS_FAILED: Source safety checks did not pass.');
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + actorId).digest('hex');

    const updateFields = {
      unlock_final_human_authorization_seal_status: 'FINALIZED',
      unlock_final_human_authorization_seal_hash: finalHash,
      finalized_by: actorId,
      finalized_at: new Date(),
      activation_execution_status: 'UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED'
    };

    // Update first so evidencePack reads correct state
    let updated = await builder._internalUpdateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, updateFields);

    // Build evidence pack
    const evidencePack = await evidenceService.generateEvidencePack(updated, actorId);

    // Save evidence pack hashes
    updated = await builder._internalUpdateUnlockFinalHumanAuthorizationSeal(unlockFinalHumanAuthorizationSealId, {
      unlock_final_human_authorization_seal_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.lineageHashChain
    });

    await auditService.logAction(unlockFinalHumanAuthorizationSealId, 'UNLOCK_FINAL_HUMAN_AUTHORIZATION_SEAL_FINALIZED', actorId, { evidencePackHash: evidencePack.evidence_pack_hash });
    return updated;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService()
};
