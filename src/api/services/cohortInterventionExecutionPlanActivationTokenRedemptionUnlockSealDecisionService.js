'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealAuditService').serviceInstance;
const evidenceService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvidencePackService').serviceInstance;
const guardrailService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealGuardrailService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealDecisionService {
  async recordDecision(unlockSealId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockSeal(unlockSealId);
    if (!record) throw new Error('UNLOCK_SEAL_RECORD_NOT_FOUND');

    if (record.unlock_seal_status === 'FINALIZED') {
      throw new Error('UNLOCK_SEAL_IMMUTABLE: Record is finalized and cannot be modified.');
    }

    if (record.unlock_seal_status !== 'EVALUATED') {
      throw new Error('UNLOCK_SEAL_NOT_EVALUATED: Evaluation is required before recording decision.');
    }

    if (!['APPROVE_SEAL', 'REJECT_SEAL', 'BLOCK', 'ESCALATE'].includes(decision)) {
      throw new Error('INVALID_DECISION: Supported decisions are APPROVE_SEAL, REJECT_SEAL, BLOCK, ESCALATE.');
    }

    const decisionResult = decision === 'APPROVE_SEAL' ? 'UNLOCK_READINESS_SEALED_NOT_UNLOCKED' : 'UNLOCK_READINESS_SEAL_FAILED';
    const decisionStatus = decision === 'APPROVE_SEAL' ? 'APPROVED' : 'REJECTED';

    const fields = {
      unlock_seal_status: decisionStatus,
      unlock_seal_result: decisionResult,
      seal_rationale_json: { rationale, decision, timestamp: new Date() }
    };

    if (decision === 'APPROVE_SEAL') {
      fields.approved_by = actorId;
      fields.approved_at = new Date();
    } else {
      fields.rejected_by = actorId;
      fields.rejected_at = new Date();
    }

    const updated = await builder._internalUpdateUnlockSeal(unlockSealId, fields);
    await auditService.logAction(unlockSealId, 'UNLOCK_SEAL_DECISION_RECORDED', actorId, { decision, rationale });
    return updated;
  }

  async finalizeUnlockSeal(unlockSealId, actorId) {
    const record = await builder.getTokenRedemptionUnlockSeal(unlockSealId);
    if (!record) throw new Error('UNLOCK_SEAL_RECORD_NOT_FOUND');

    if (record.unlock_seal_status === 'FINALIZED') {
      throw new Error('UNLOCK_SEAL_IMMUTABLE: Record is already finalized.');
    }

    if (record.unlock_seal_status !== 'APPROVED' && record.unlock_seal_status !== 'REJECTED') {
      throw new Error('UNLOCK_SEAL_NOT_DECIDED: A decision must be recorded before finalization.');
    }

    // Run Guardrail Verification
    const safetyRes = await guardrailService.verifySourceSafety();
    if (!safetyRes.passed) {
      throw new Error('GUARDRAILS_FAILED: Source safety checks did not pass.');
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + actorId).digest('hex');

    const updateFields = {
      unlock_seal_status: 'FINALIZED',
      unlock_seal_hash: finalHash,
      finalized_by: actorId,
      finalized_at: new Date(),
      activation_execution_status: 'UNLOCK_READINESS_SEAL_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED'
    };

    // Update first so evidencePack reads the correct state
    let updated = await builder._internalUpdateUnlockSeal(unlockSealId, updateFields);

    // Build evidence pack
    const evidencePack = await evidenceService.generateEvidencePack(updated, actorId);

    // Save evidence pack hashes
    updated = await builder._internalUpdateUnlockSeal(unlockSealId, {
      unlock_seal_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.lineageHashChain
    });

    await auditService.logAction(unlockSealId, 'UNLOCK_SEAL_FINALIZED', actorId, { evidencePackHash: evidencePack.evidence_pack_hash });
    return updated;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealDecisionService()
};
