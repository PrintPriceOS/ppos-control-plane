'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeAuditService').serviceInstance;
const evidenceService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeEvidencePackService').serviceInstance;
const guardrailService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeGuardrailService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeDecisionService {
  async recordDecision(unlockPreExecutionFreezeId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockPreExecutionFreeze(unlockPreExecutionFreezeId);
    if (!record) throw new Error('UNLOCK_PRE_EXECUTION_FREEZE_RECORD_NOT_FOUND');

    if (record.unlock_pre_execution_freeze_status === 'FINALIZED') {
      throw new Error('UNLOCK_PRE_EXECUTION_FREEZE_IMMUTABLE: Record is finalized and cannot be modified.');
    }

    if (record.unlock_pre_execution_freeze_status !== 'EVALUATED') {
      throw new Error('UNLOCK_PRE_EXECUTION_FREEZE_NOT_EVALUATED: Evaluation is required before recording decision.');
    }

    if (!['APPROVE_FREEZE', 'REJECT_FREEZE', 'BLOCK', 'ESCALATE'].includes(decision)) {
      throw new Error('INVALID_DECISION: Supported decisions are APPROVE_FREEZE, REJECT_FREEZE, BLOCK, ESCALATE.');
    }

    const decisionResult = decision === 'APPROVE_FREEZE' ? 'UNLOCK_PRE_EXECUTION_FROZEN_NOT_UNLOCKED' : 'UNLOCK_PRE_EXECUTION_FREEZE_FAILED';
    const decisionStatus = decision === 'APPROVE_FREEZE' ? 'APPROVED' : 'REJECTED';

    const fields = {
      unlock_pre_execution_freeze_status: decisionStatus,
      unlock_pre_execution_freeze_result: decisionResult,
      freeze_rationale_json: { rationale, decision, timestamp: new Date() }
    };

    if (decision === 'APPROVE_FREEZE') {
      fields.approved_by = actorId;
      fields.approved_at = new Date();
    } else {
      fields.rejected_by = actorId;
      fields.rejected_at = new Date();
    }

    const updated = await builder._internalUpdateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, fields);
    await auditService.logAction(unlockPreExecutionFreezeId, 'UNLOCK_PRE_EXECUTION_FREEZE_DECISION_RECORDED', actorId, { decision, rationale });
    return updated;
  }

  async finalizeUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, actorId) {
    const record = await builder.getTokenRedemptionUnlockPreExecutionFreeze(unlockPreExecutionFreezeId);
    if (!record) throw new Error('UNLOCK_PRE_EXECUTION_FREEZE_RECORD_NOT_FOUND');

    if (record.unlock_pre_execution_freeze_status === 'FINALIZED') {
      throw new Error('UNLOCK_PRE_EXECUTION_FREEZE_IMMUTABLE: Record is already finalized.');
    }

    if (record.unlock_pre_execution_freeze_status !== 'APPROVED' && record.unlock_pre_execution_freeze_status !== 'REJECTED') {
      throw new Error('UNLOCK_PRE_EXECUTION_FREEZE_NOT_DECIDED: A decision must be recorded before finalization.');
    }

    // Run Guardrail Verification
    const safetyRes = await guardrailService.verifySourceSafety();
    if (!safetyRes.passed) {
      throw new Error('GUARDRAILS_FAILED: Source safety checks did not pass.');
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + actorId).digest('hex');

    const updateFields = {
      unlock_pre_execution_freeze_status: 'FINALIZED',
      unlock_pre_execution_freeze_hash: finalHash,
      finalized_by: actorId,
      finalized_at: new Date(),
      activation_execution_status: 'UNLOCK_PRE_EXECUTION_FREEZE_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED'
    };

    // Update first so evidencePack reads the correct state
    let updated = await builder._internalUpdateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, updateFields);

    // Build evidence pack
    const evidencePack = await evidenceService.generateEvidencePack(updated, actorId);

    // Save evidence pack hashes
    updated = await builder._internalUpdateUnlockPreExecutionFreeze(unlockPreExecutionFreezeId, {
      unlock_pre_execution_freeze_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.lineageHashChain
    });

    await auditService.logAction(unlockPreExecutionFreezeId, 'UNLOCK_PRE_EXECUTION_FREEZE_FINALIZED', actorId, { evidencePackHash: evidencePack.evidence_pack_hash });
    return updated;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockPreExecutionFreezeDecisionService()
};
